import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BALTIMORE_ECOLOGY_PACK,
  BALTIMORE_ECOLOGY_PACK_ID,
  BALTIMORE_TAXON_DISCOVERIES,
  resolveRegionalEcologyPack,
  selectRegionalTaxa,
  validateRegionalEcologyPack
} from '../app/js/discovery/ecology/baltimore-pack.js';
import { compileFieldActivityPlan } from '../app/js/discovery/field-activities.js';

function environmentAt(location, contexts = ['urban', 'park', 'forest']) {
  const worldIdentity = Object.freeze({ type: 'WorldIdentity', id: `world:${location.lat}:${location.lon}`, location: Object.freeze(location) });
  return Object.freeze({
    type: 'EnvironmentContextPublication',
    requestId: 'request:test',
    sequence: 1,
    worldIdentity,
    temporal: Object.freeze({ month: 5, localTimeBand: 'day' }),
    cells: Object.freeze([Object.freeze({
      cellId: 'cell:0:0',
      contexts: Object.freeze(contexts),
      bounds: Object.freeze({ minX: -80, maxX: 80, minZ: -80, maxZ: 80 })
    })])
  });
}

function eligibilityFor(environment, activityId = 'photograph') {
  return Object.freeze({
    type: 'GeographicEligibilityPublication',
    requestId: environment.requestId,
    sequence: environment.sequence,
    worldIdentity: environment.worldIdentity,
    catalogBundleVersion: 'test-catalog',
    eligible: Object.freeze([Object.freeze({ catalogId: activityId, cellIds: Object.freeze(['cell:0:0']) })])
  });
}

test('the candidate pack has exactly 60 licensed, versioned, migration-safe taxa', () => {
  const validation = validateRegionalEcologyPack(BALTIMORE_ECOLOGY_PACK);
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.ok, true);
  assert.equal(validation.taxonCount, 60);
  assert.deepEqual(validation.counts, {
    mammal: 5,
    bird: 10,
    'insect-arachnid': 15,
    plant: 10,
    'freshwater-fish': 10,
    'marine-fish': 10
  });
  assert.equal(BALTIMORE_TAXON_DISCOVERIES.length, 60);
  assert.ok(BALTIMORE_TAXON_DISCOVERIES.every((entry) => ['common', 'uncommon'].includes(entry.rarityBand)));
  assert.equal(BALTIMORE_ECOLOGY_PACK.contentRelease.migration.stableIdPolicy, 'preserve-historical-records');
  assert.match(BALTIMORE_ECOLOGY_PACK.contentRelease.rollback.action, /disable-pack/);
});

test('the Baltimore pack is selected by published coordinates, not a city-name branch', () => {
  const baltimore = resolveRegionalEcologyPack({ lat: 39.2904, lon: -76.6122 });
  const annapolis = resolveRegionalEcologyPack({ lat: 38.9784, lon: -76.4922 });
  const manhattan = resolveRegionalEcologyPack({ lat: 40.758, lon: -73.9855 });
  assert.equal(baltimore?.id, BALTIMORE_ECOLOGY_PACK_ID);
  assert.equal(annapolis?.id, BALTIMORE_ECOLOGY_PACK_ID);
  assert.equal(manhattan, null);
});

test('habitat, season, time, and sensitive-species policy constrain candidate taxa', () => {
  const mayForest = selectRegionalTaxa(BALTIMORE_ECOLOGY_PACK, {
    activityId: 'insect-macro', contexts: ['forest', 'park'], month: 5, timeBand: 'day'
  });
  const augustForest = selectRegionalTaxa(BALTIMORE_ECOLOGY_PACK, {
    activityId: 'insect-macro', contexts: ['forest', 'park'], month: 8, timeBand: 'day'
  });
  const mayIds = new Set(mayForest.map((entry) => entry.gbifTaxonKey));
  const augustIds = new Set(augustForest.map((entry) => entry.gbifTaxonKey));
  assert.equal(mayIds.has(5792026), true, 'periodical cicada belongs to its bounded May/June window');
  assert.equal(augustIds.has(5792026), false, 'periodical cicada must not become a year-round candidate');
  const baldEagle = BALTIMORE_ECOLOGY_PACK.taxa.find((entry) => entry.gbifTaxonKey === 2480446);
  assert.equal(baldEagle.sensitiveSpecies, true);
  assert.equal(baldEagle.sensitiveLocationPolicy, 'generalize-20km-suppress-nest-roost');
});

test('regional taxa join the shared walking field plan with honest evidence and no provider query', () => {
  const environment = environmentAt({ lat: 39.2904, lon: -76.6122 });
  const plan = compileFieldActivityPlan(environment, eligibilityFor(environment), { slotsPerCell: 3 });
  assert.equal(plan.diagnostics.regionalEcologyPackId, BALTIMORE_ECOLOGY_PACK_ID);
  assert.equal(plan.diagnostics.regionalTaxonCount, 60);
  assert.equal(plan.diagnostics.generatedWithAdditionalProviderQueries, false);
  const regionalIds = new Set(BALTIMORE_TAXON_DISCOVERIES.map((entry) => entry.id));
  const regionalSlots = plan.slots.filter((entry) => regionalIds.has(entry.catalogId));
  assert.ok(regionalSlots.length > 0, 'Baltimore plan should contain regional candidates');
  assert.equal(plan.slots.every((entry) => regionalIds.has(entry.catalogId)), true,
    'a compatible reviewed regional taxon should take authority over legacy generic records');
  regionalSlots.forEach((slot) => {
    assert.equal(slot.evidenceClass, 'guided-field-lead');
    assert.equal(slot.approachEvidence.accessEvidence, 'unknown');
    assert.equal(slot.approachEvidence.accessClaim, false);
    assert.ok(slot.supportingEvidence.includes('habitat-plausible'));
    assert.ok(slot.supportingEvidence.includes('no-live-presence-claim'));
  });
});

test('the same shared planner excludes the Baltimore pack outside its coordinate bounds', () => {
  const environment = environmentAt({ lat: 40.758, lon: -73.9855 });
  const plan = compileFieldActivityPlan(environment, eligibilityFor(environment), { slotsPerCell: 3 });
  const regionalIds = new Set(BALTIMORE_TAXON_DISCOVERIES.map((entry) => entry.id));
  assert.equal(plan.diagnostics.regionalEcologyPackId, null);
  assert.equal(plan.diagnostics.regionalTaxonCount, 0);
  assert.equal(plan.slots.some((entry) => regionalIds.has(entry.catalogId)), false);
});

test('no unreviewed media or noncommercial occurrence license enters the pack', () => {
  BALTIMORE_ECOLOGY_PACK.taxa.forEach((entry) => {
    assert.equal(entry.livePresenceClaimAllowed, false);
    assert.equal(entry.presentation.assetStatus, 'no-media-bundled');
    assert.equal(entry.presentation.mobileBudget.textureBytes, 0);
    entry.sourceRefs.forEach((ref) => assert.doesNotMatch(ref.license, /BY-NC|NONCOMMERCIAL/i));
  });
  assert.equal(BALTIMORE_ECOLOGY_PACK.truthPolicy.occurrenceRecordsIncluded, false);
  assert.equal(BALTIMORE_ECOLOGY_PACK.truthPolicy.abundanceModelIncluded, false);
  assert.equal(BALTIMORE_ECOLOGY_PACK.truthPolicy.osmSpeciesInferenceAllowed, false);
});
