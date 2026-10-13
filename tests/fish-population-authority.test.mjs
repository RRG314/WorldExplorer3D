import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FISH_POPULATION_AUTHORITY_VERSION,
  createFishPopulationContext,
  createUnderwaterSchoolPlan,
  selectFishFromPopulation
} from '../app/js/fishing/population-authority.js';
import {generateFish} from '../app/js/fishing/catalog.js';

test('unsupported polar and unknown water never fall back to worldwide game species',()=>{
 for(const waterKind of ['open_ocean','lake','unresolved']){
  const context=createFishPopulationContext({waterKind,latitude:-80,longitude:30,accessMode:'underwater'});
  assert.equal(context.playable,false);assert.deepEqual(context.candidateSpeciesIds,[]);
  assert.equal(generateFish({waterKind,latitude:-80}),null);
 }
});
test('an authored pool cannot override water and latitude exclusions or invent species',()=>{
 const context=createFishPopulationContext({waterKind:'lake',latitude:40,longitude:-75,accessMode:'underwater',candidateSpeciesIds:['giant_trevally','imaginary','largemouth_bass']});
 assert.deepEqual(context.candidateSpeciesIds,['largemouth_bass']);
 assert.equal(createFishPopulationContext({waterKind:'open_ocean',latitude:20,depthMeters:null}).environment.depthMeters,null);
});

const water = Object.freeze({
  waterbodyId: 'water:baltimore-harbor',
  waterKind: 'harbor',
  waterLabel: 'Baltimore Harbor',
  sourceDataset: 'osm-overpass',
  sourceTruth: 'published-water-surface',
  latitude: 39.283,
  longitude: -76.613
});

test('shore and boat resolve one authority with access-specific virtual pools', () => {
  const offshoreWater = { ...water, waterKind: 'open_ocean' };
  const shore = createFishPopulationContext({ ...offshoreWater, accessMode: 'shore' });
  const boat = createFishPopulationContext({ ...offshoreWater, accessMode: 'boat' });
  assert.equal(shore.authorityVersion, FISH_POPULATION_AUTHORITY_VERSION);
  assert.equal(shore.waterbody.id, boat.waterbody.id);
  assert.equal(shore.schemaVersion, 2);
  assert.equal(shore.waterbody.waterClass, 'marine');
  assert.ok(shore.candidateSpeciesIds.every((id) => boat.candidateSpeciesIds.includes(id)));
  assert.ok(boat.candidateSpeciesIds.length > shore.candidateSpeciesIds.length);
  assert.equal(shore.access.reachableDepthClass, 'bank-cast');
  assert.equal(boat.access.reachableDepthClass, 'surface-boat');
  assert.equal(shore.evidence.livePresenceClaim, false);
  assert.equal(shore.evidence.regionalEcologyPackApplied, false);
  assert.equal(shore.evidence.populationTruth, 'gameplay-model-only');
});

test('underwater schools project deterministic species from the same honest authority', () => {
  const context = createFishPopulationContext({ ...water, waterKind: 'open_ocean', accessMode: 'underwater' });
  const first = createUnderwaterSchoolPlan(context);
  const second = createUnderwaterSchoolPlan(context);
  assert.equal(context.access.reachableDepthClass, 'subsurface-observation');
  assert.equal(first.playable, true);
  assert.deepEqual(first.schools.map((school) => school.speciesId), second.schools.map((school) => school.speciesId));
  assert.ok(first.schools.every((school) => context.candidateSpeciesIds.includes(school.speciesId)));
  assert.ok(first.schools.every((school) => school.livePresenceClaim === false && school.measuredAbundanceClaim === false));
  assert.equal(first.livePresenceClaim, false);
  assert.equal(first.rollback.preservesCatchRecords, true);
});

test('selection stays inside the authority pool and applies a non-depletion variety cooldown', () => {
  const context = createFishPopulationContext({
    ...water,
    accessMode: 'shore',
    candidateSpeciesIds: ['channel_catfish', 'striped_bass']
  });
  const fish = selectFishFromPopulation(context, {
    recentCatches: [{ speciesId: 'channel_catfish', waterbodyId: water.waterbodyId }],
    random: () => 0.25
  });
  assert.equal(fish.speciesId, 'striped_bass');
  assert.equal(fish.fishingAuthorityVersion, FISH_POPULATION_AUTHORITY_VERSION);
  assert.equal(fish.populationEvidence, 'gameplay-model-only');
  assert.equal(fish.livePresenceClaim, false);
  assert.equal(context.cooldown.depletionClaim, false);
});

test('an empty reviewed game pool blocks selection instead of falling back worldwide', () => {
  const context = createFishPopulationContext({
    ...water,
    accessMode: 'boat',
    candidateSpeciesIds: []
  });
  assert.equal(context.playable, false);
  assert.equal(selectFishFromPopulation(context), null);
});

test('representative freshwater, estuary, coast, and open-ocean contexts stay bounded', () => {
  const cases = [
    ['lake', 44, 'freshwater'], ['river', 39, 'freshwater'],
    ['harbor', 39, 'estuary-or-mixed'], ['coastal', 25, 'marine'],
    ['open_ocean', -18, 'marine']
  ];
  for (const [waterKind, latitude, waterClass] of cases) {
    const context = createFishPopulationContext({ ...water, waterbodyId: `water:${waterKind}`, waterKind, latitude, accessMode: 'boat' });
    assert.equal(context.playable, true, `${waterKind} needs a bounded game pool`);
    assert.equal(context.waterbody.waterClass, waterClass);
    assert.ok(context.candidateSpeciesIds.length > 0);
    assert.equal(context.evidence.providerOccurrenceClaim, false);
    assert.equal(context.evidence.measuredAbundanceClaim, false);
  }
});

test('marine pools separate Atlantic and Indo-Pacific species at the same latitude',()=>{
 const at=(longitude,extra={})=>createFishPopulationContext({waterKind:'coastal',latitude:25,longitude,accessMode:'underwater',...extra});
 const florida=at(-80),okinawa=at(128),hawaii=at(-157);
 assert.ok(florida.candidateSpeciesIds.includes('atlantic_tarpon'));
 assert.ok(!florida.candidateSpeciesIds.includes('giant_trevally'));
 for(const site of [okinawa,hawaii]){
  assert.ok(site.candidateSpeciesIds.includes('giant_trevally'));
  assert.ok(!site.candidateSpeciesIds.includes('atlantic_tarpon'));
  assert.ok(!site.candidateSpeciesIds.includes('summer_flounder'));
  assert.ok(!site.candidateSpeciesIds.includes('bluefin_tuna'));
 }
 assert.equal(at(null).playable,false);
 assert.equal(at(999).playable,false);
 assert.equal(at(128,{habitat:'abyssal-bottom'}).playable,false);
 assert.equal(at(128,{habitat:'freshwater'}).playable,false);
 assert.deepEqual(at(128,{habitat:'coral-reef'}).candidateSpeciesIds,['giant_trevally']);
});

test('deep seafloor evidence is not the depth of a pelagic fish',()=>{
 const context=createFishPopulationContext({waterKind:'open_ocean',latitude:20,longitude:150,depthMeters:4500,accessMode:'underwater'});
 const plan=createUnderwaterSchoolPlan(context);
 assert.ok(plan.schools.some(s=>s.speciesId==='yellowfin_tuna'));
 assert.ok(plan.schools.every(s=>s.spawnDepthMeters[0]>=1&&s.spawnDepthMeters[1]<=120));
 assert.ok(plan.schools.every(s=>s.count<=8&&s.spawnDepthTruth==='authored-game-presentation-band'));
 const fish=selectFishFromPopulation(createFishPopulationContext({...water,waterKind:'open_ocean',candidateSpeciesIds:['bluefin_tuna']}),{random:()=>.5});
 assert.equal(fish.speciesId,'bluefin_tuna');assert.equal(fish.species,'Atlantic Bluefin Tuna');
});
