import { FISH_SPECIES, generateFish } from './catalog.js?v=2';

const FISH_POPULATION_AUTHORITY_VERSION = 'water-fish-authority-v2';

const ACCESS_PROFILES = Object.freeze({
  shore: Object.freeze({
    id: 'shore-bank-cast',
    reachableDepthClass: 'bank-cast',
    tackleId: 'standard-field-rod',
    baitModel: 'virtual-general-lure',
    speciesEligibilityModel: 'gameplay-bank-reach-v1'
  }),
  boat: Object.freeze({
    id: 'surface-boat-cast',
    reachableDepthClass: 'surface-boat',
    tackleId: 'standard-boat-rod',
    baitModel: 'virtual-general-lure',
    speciesEligibilityModel: 'gameplay-surface-boat-reach-v1'
  }),
  underwater: Object.freeze({
    id: 'underwater-visual-school',
    reachableDepthClass: 'subsurface-observation',
    tackleId: 'none',
    baitModel: 'none',
    speciesEligibilityModel: 'gameplay-underwater-visual-v1'
  })
});

const SHORE_GAMEPLAY_SPECIES = new Set([
  'largemouth_bass', 'rainbow_trout', 'northern_pike', 'channel_catfish',
  'common_carp', 'striped_bass', 'red_drum', 'summer_flounder'
]);

function normalizedWaterKind(value) {
  const kind = String(value || 'water').trim().toLowerCase().replaceAll(' ', '_');
  return kind || 'water';
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function unique(values = []) {
  return [...new Set(values.map(String).filter(Boolean))];
}

function waterClassForKind(waterKind) {
  if (['lake', 'river'].includes(waterKind)) return 'freshwater';
  if (['harbor', 'channel'].includes(waterKind)) return 'estuary-or-mixed';
  if (['coastal', 'open_ocean'].includes(waterKind)) return 'marine';
  return 'unresolved';
}

function stableUnit(value) {
  let hash = 0x811c9dc5;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x100000000;
}

function gameCatalogCandidates(waterKind, latitude, accessMode) {
  const lat = finiteOrNull(latitude) ?? 0;
  const accessEligible = FISH_SPECIES.filter((species) => accessMode !== 'shore' || SHORE_GAMEPLAY_SPECIES.has(species.id));
  const exact = accessEligible.filter((species) => (
    species.waterKinds.includes(waterKind) && lat >= species.latitude[0] && lat <= species.latitude[1]
  ));
  const waterOnly = exact.length ? exact : accessEligible.filter((species) => species.waterKinds.includes(waterKind));
  return waterOnly.map((species) => species.id);
}

function createFishPopulationContext(options = {}) {
  const accessMode = ['shore', 'boat', 'underwater'].includes(options.accessMode) ? options.accessMode : 'boat';
  const accessProfile = ACCESS_PROFILES[accessMode];
  const waterKind = normalizedWaterKind(options.waterKind);
  const latitude = finiteOrNull(options.latitude) ?? 0;
  const waterbodyId = String(options.waterbodyId || `unresolved-water:${waterKind}`).slice(0, 220);
  const candidateSpeciesIds = unique(options.candidateSpeciesIds || gameCatalogCandidates(waterKind, latitude, accessMode));
  const sourceDataset = String(options.sourceDataset || 'unresolved-water-source').slice(0, 120);
  const sourceTruth = String(options.sourceTruth || (
    sourceDataset === 'synthetic-transition' ? 'synthetic-transition' : 'published-water-surface'
  )).slice(0, 80);
  return Object.freeze({
    type: 'FishPopulationContext',
    schemaVersion: 2,
    authorityVersion: FISH_POPULATION_AUTHORITY_VERSION,
    contextId: `${FISH_POPULATION_AUTHORITY_VERSION}:${waterbodyId}:${accessMode}`,
    playable: candidateSpeciesIds.length > 0,
    waterbody: Object.freeze({
      id: waterbodyId,
      label: String(options.waterLabel || waterKind.replaceAll('_', ' ')).slice(0, 120),
      waterKind,
      waterClass: String(options.waterClass || waterClassForKind(waterKind)),
      sourceDataset,
      sourceTruth
    }),
    access: Object.freeze({ mode: accessMode, ...accessProfile }),
    environment: Object.freeze({
      latitude,
      longitude: finiteOrNull(options.longitude),
      season: String(options.season || 'not-evaluated'),
      timeBand: String(options.timeBand || 'not-evaluated'),
      weather: String(options.weather || 'not-evaluated'),
      salinity: String(options.salinity || 'unavailable'),
      current: String(options.current || 'unavailable'),
      depthTruth: String(options.depthTruth || 'unavailable'),
      depthMeters: finiteOrNull(options.depthMeters)
    }),
    candidateSpeciesIds: Object.freeze(candidateSpeciesIds),
    evidence: Object.freeze({
      populationTruth: 'gameplay-model-only',
      populationConfidence: 'not-a-population-survey',
      candidatePoolBasis: 'we3d-game-catalog-water-kind-latitude-access-v2',
      regionalEcologyPackApplied: false,
      regionalExclusionReason: 'regional-catalog-is-not-catch-probability-evidence',
      livePresenceClaim: false,
      measuredAbundanceClaim: false,
      providerOccurrenceClaim: false
    }),
    cooldown: Object.freeze({
      policy: 'recent-catch-variety',
      scope: 'waterbody-session',
      recentCatchWindow: 2,
      depletionClaim: false
    })
  });
}

function createUnderwaterSchoolPlan(context, options = {}) {
  if (context?.type !== 'FishPopulationContext' || context.playable !== true || context.access?.mode !== 'underwater') {
    return Object.freeze({
      type: 'UnderwaterFishSchoolPlan', schemaVersion: 1,
      authorityVersion: FISH_POPULATION_AUTHORITY_VERSION,
      populationContextId: context?.contextId || null,
      playable: false,
      schools: Object.freeze([]),
      livePresenceClaim: false
    });
  }
  const maximumSchools = Math.max(1, Math.min(6, Number(options.maximumSchools) || 5));
  const catalogById = new Map(FISH_SPECIES.map((species) => [species.id, species]));
  const ordered = [...context.candidateSpeciesIds].sort((left, right) =>
    stableUnit(`${context.contextId}:${left}`) - stableUnit(`${context.contextId}:${right}`));
  const schools = ordered.slice(0, maximumSchools).map((speciesId, index) => {
    const species = catalogById.get(speciesId);
    return Object.freeze({
      schoolId: `${context.contextId}:school:${index}:${speciesId}`,
      speciesId,
      species: species?.name || speciesId,
      behavior: species?.behavior || 'schooling',
      rarity: species?.rarity || 'common',
      visual: Object.freeze({ ...(species?.visual || {}) }),
      count: Math.max(8, 24 - index * 3),
      visualTruth: 'generated-game-school',
      populationEvidence: context.evidence.populationTruth,
      livePresenceClaim: false,
      measuredAbundanceClaim: false
    });
  });
  return Object.freeze({
    type: 'UnderwaterFishSchoolPlan', schemaVersion: 1,
    authorityVersion: context.authorityVersion,
    populationContextId: context.contextId,
    waterbodyId: context.waterbody.id,
    playable: schools.length > 0,
    schools: Object.freeze(schools),
    livePresenceClaim: false,
    rollback: Object.freeze({ action: 'restore-generic-non-species-fish-visuals', preservesCatchRecords: true })
  });
}

function selectFishFromPopulation(context, options = {}) {
  if (context?.type !== 'FishPopulationContext' || context.playable !== true) return null;
  const recentCatches = Array.isArray(options.recentCatches) ? options.recentCatches : [];
  const recentSpecies = new Set(recentCatches
    .filter((entry) => !entry.waterbodyId || entry.waterbodyId === context.waterbody.id)
    .slice(0, context.cooldown.recentCatchWindow)
    .map((entry) => String(entry.speciesId || ''))
    .filter(Boolean));
  const variedPool = context.candidateSpeciesIds.filter((id) => !recentSpecies.has(id));
  const candidateSpeciesIds = variedPool.length ? variedPool : context.candidateSpeciesIds;
  const fish = generateFish({
    waterKind: context.waterbody.waterKind,
    latitude: context.environment.latitude,
    allowedSpeciesIds: candidateSpeciesIds,
    random: typeof options.random === 'function' ? options.random : Math.random
  });
  if (!fish) return null;
  return Object.freeze({
    ...fish,
    fishingAuthorityVersion: context.authorityVersion,
    populationContextId: context.contextId,
    populationEvidence: context.evidence.populationTruth,
    candidatePoolBasis: context.evidence.candidatePoolBasis,
    livePresenceClaim: false
  });
}

export {
  ACCESS_PROFILES,
  FISH_POPULATION_AUTHORITY_VERSION,
  createFishPopulationContext,
  createUnderwaterSchoolPlan,
  selectFishFromPopulation
};
