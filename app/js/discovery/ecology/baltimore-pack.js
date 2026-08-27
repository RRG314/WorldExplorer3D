const REGIONAL_ECOLOGY_SCHEMA_VERSION = 1;
const BALTIMORE_ECOLOGY_PACK_ID = 'us-md-baltimore-chesapeake-pilot';
const BALTIMORE_ECOLOGY_PACK_VERSION = '2026.08.24-a3.2';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

const ECOLOGY_SOURCE_MANIFEST = deepFreeze({
  'gbif-backbone-2023': {
    id: 'gbif-backbone-2023',
    label: 'GBIF Backbone Taxonomy (2023 pinned compatibility taxonomy)',
    license: 'CC-BY-4.0',
    attribution: 'GBIF Secretariat (2023), DOI 10.15468/39omei',
    datasetId: 'd7dddbf4-2cf0-4f39-9b2a-bb099caae36c',
    sourceUrl: 'https://www.gbif.org/dataset/d7dddbf4-2cf0-4f39-9b2a-bb099caae36c',
    retrievedAt: '2026-08-24',
    allowsProductUse: true,
    useBoundary: 'taxonomy identity only; no occurrence, abundance, or live-presence claim'
  },
  'maryland-dnr-wildlife': {
    id: 'maryland-dnr-wildlife',
    label: 'Maryland Department of Natural Resources wildlife and native-plant lists',
    license: 'REFERENCE-ONLY',
    attribution: 'Maryland Department of Natural Resources',
    datasetId: 'md-dnr-wildlife-web-2026-08-24',
    sourceUrl: 'https://dnr.maryland.gov/wildlife/Pages/plants_wildlife/mdwllists.aspx',
    retrievedAt: '2026-08-24',
    allowsProductUse: true,
    useBoundary: 'factual regional review only; no copied prose or media'
  },
  'chesapeake-bay-field-guide': {
    id: 'chesapeake-bay-field-guide',
    label: 'Chesapeake Bay Program Field Guide',
    license: 'REFERENCE-ONLY',
    attribution: 'Chesapeake Bay Program',
    datasetId: 'cbp-field-guide-web-2026-08-24',
    sourceUrl: 'https://www.chesapeakebay.net/discover/field-guide',
    retrievedAt: '2026-08-24',
    allowsProductUse: true,
    useBoundary: 'factual estuary review only; photography excluded unless separately permitted'
  },
  osm: {
    id: 'osm',
    label: 'OpenStreetMap',
    license: 'ODbL-1.0',
    attribution: '© OpenStreetMap contributors',
    datasetId: 'openstreetmap',
    sourceUrl: 'https://www.openstreetmap.org/copyright',
    retrievedAt: 'runtime-published-world',
    allowsProductUse: true,
    useBoundary: 'mapped habitat/access context only; never species presence or abundance'
  },
  worldcover: {
    id: 'worldcover',
    label: 'ESA WorldCover',
    license: 'CC-BY-4.0',
    attribution: 'ESA WorldCover project',
    datasetId: 'esa-worldcover-runtime',
    sourceUrl: 'https://esa-worldcover.org/',
    retrievedAt: 'runtime-published-world',
    allowsProductUse: true,
    useBoundary: 'modeled land-cover context only; never species presence or abundance'
  }
});

const gbifRef = (key) => ({
  providerId: 'gbif-backbone-2023',
  recordId: `gbif-taxon:${key}`,
  datasetId: ECOLOGY_SOURCE_MANIFEST['gbif-backbone-2023'].datasetId,
  license: 'CC-BY-4.0',
  attribution: ECOLOGY_SOURCE_MANIFEST['gbif-backbone-2023'].attribution,
  retrievedAt: '2026-08-24'
});

const regionalRef = (providerId, recordId) => ({
  providerId,
  recordId,
  datasetId: ECOLOGY_SOURCE_MANIFEST[providerId].datasetId,
  license: ECOLOGY_SOURCE_MANIFEST[providerId].license,
  attribution: ECOLOGY_SOURCE_MANIFEST[providerId].attribution,
  retrievedAt: '2026-08-24'
});

const ALL_MONTHS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
const WARM_MONTHS = Object.freeze([4, 5, 6, 7, 8, 9, 10]);
const GROWING_MONTHS = Object.freeze([3, 4, 5, 6, 7, 8, 9, 10, 11]);
const WATER_CONTEXTS = Object.freeze(['fresh-water', 'stream', 'riverbank', 'wetland']);
const ESTUARY_CONTEXTS = Object.freeze(['coast', 'riverbank', 'wetland', 'fresh-water']);

function taxon(input) {
  const regionalProviderId = input.regionalProviderId || 'maryland-dnr-wildlife';
  return {
    id: `taxon-${input.gbifTaxonKey}`,
    stableTaxonId: `gbif-backbone-2023:${input.gbifTaxonKey}`,
    gbifTaxonKey: input.gbifTaxonKey,
    acceptedScientificName: input.scientificName,
    acceptedNameStatus: 'accepted',
    taxonomyRank: 'species',
    group: input.group,
    localizedNames: { 'en-US': input.commonName },
    habitats: input.habitats,
    activeMonths: input.activeMonths || ALL_MONTHS,
    timeBands: input.timeBands || ['day', 'dawn', 'dusk'],
    activityIds: input.group.endsWith('-fish') ? input.activityIds : activitiesForGroup(input.group),
    establishment: input.establishment || 'unknown',
    regionalEvidenceClass: 'habitat-plausible',
    livePresenceClaimAllowed: false,
    sensitiveSpecies: input.sensitiveSpecies === true,
    sensitiveLocationPolicy: input.sensitiveSpecies ? 'generalize-20km-suppress-nest-roost' : 'generalize-pack-cell',
    presentation: {
      tier: input.presentationTier || 'reference-fallback',
      assetStatus: input.assetStatus || 'no-media-bundled',
      anatomyScaleReview: input.anatomyScaleReview || 'pending-domain-asset-review',
      behaviorAnimationReview: input.behaviorAnimationReview || 'pending-domain-asset-review',
      lodPolicy: 'catalog-card-only-until-vetted-asset',
      mobileBudget: { drawCalls: 0, textureBytes: 0, geometryBytes: 0 },
      rightsStatus: 'no-media-bundled',
      attributionStatus: 'taxonomy-and-regional-sources-retained'
    },
    sourceRefs: [
      gbifRef(input.gbifTaxonKey),
      regionalRef(regionalProviderId, input.regionalRecordId || input.scientificName)
    ]
  };
}

const activitiesForGroup = (group) => {
  if (group === 'insect-arachnid') return ['nature-observe', 'photograph', 'insect-macro', 'community-survey'];
  if (group === 'plant') return ['nature-observe', 'photograph', 'habitat-survey', 'community-survey'];
  return ['nature-observe', 'photograph', 'wildlife-track', 'community-survey'];
};

const BALTIMORE_TAXA = [
  taxon({ gbifTaxonKey: 2440965, commonName: 'White-tailed deer', scientificName: 'Odocoileus virginianus', group: 'mammal', habitats: ['forest', 'field', 'park', 'urban'], activityIds: ['photograph', 'wildlife-track'], establishment: 'native' }),
  taxon({ gbifTaxonKey: 5218786, commonName: 'Raccoon', scientificName: 'Procyon lotor', group: 'mammal', habitats: ['forest', 'park', 'urban', 'wetland'], activityIds: ['photograph', 'wildlife-track'], establishment: 'native', timeBands: ['dusk', 'night', 'dawn'] }),
  taxon({ gbifTaxonKey: 5219243, commonName: 'Red fox', scientificName: 'Vulpes vulpes', group: 'mammal', habitats: ['forest', 'field', 'park', 'urban'], activityIds: ['photograph', 'wildlife-track'], establishment: 'mixed-or-uncertain', timeBands: ['dawn', 'dusk', 'night'] }),
  taxon({ gbifTaxonKey: 2436886, commonName: 'Eastern cottontail', scientificName: 'Sylvilagus floridanus', group: 'mammal', habitats: ['field', 'park', 'urban'], activityIds: ['photograph', 'wildlife-track'], establishment: 'native', timeBands: ['dawn', 'dusk', 'day'] }),
  taxon({ gbifTaxonKey: 5219681, commonName: 'Eastern gray squirrel', scientificName: 'Sciurus carolinensis', group: 'mammal', habitats: ['forest', 'park', 'urban'], activityIds: ['photograph', 'wildlife-track'], establishment: 'native' }),

  taxon({ gbifTaxonKey: 9761484, commonName: 'Mallard', scientificName: 'Anas platyrhynchos', group: 'bird', habitats: ['wetland', 'riverbank', 'fresh-water', 'coast', 'park'], activityIds: ['photograph', 'wildlife-track'], establishment: 'native' }),
  taxon({ gbifTaxonKey: 5232437, commonName: 'Canada goose', scientificName: 'Branta canadensis', group: 'bird', habitats: ['wetland', 'fresh-water', 'park', 'field', 'coast'], activityIds: ['photograph', 'wildlife-track'], establishment: 'native' }),
  taxon({ gbifTaxonKey: 9630752, commonName: 'Great blue heron', scientificName: 'Ardea herodias', group: 'bird', habitats: ['wetland', 'riverbank', 'fresh-water', 'coast'], activityIds: ['photograph', 'wildlife-track'], establishment: 'native' }),
  taxon({ gbifTaxonKey: 2480726, commonName: 'Osprey', scientificName: 'Pandion haliaetus', group: 'bird', habitats: ['coast', 'wetland', 'riverbank', 'fresh-water'], activeMonths: [3, 4, 5, 6, 7, 8, 9, 10], activityIds: ['photograph', 'wildlife-track'], establishment: 'native' }),
  taxon({ gbifTaxonKey: 2480446, commonName: 'Bald eagle', scientificName: 'Haliaeetus leucocephalus', group: 'bird', habitats: ['coast', 'wetland', 'riverbank', 'fresh-water', 'forest'], activityIds: ['photograph'], establishment: 'native', sensitiveSpecies: true }),
  taxon({ gbifTaxonKey: 9510564, commonName: 'American robin', scientificName: 'Turdus migratorius', group: 'bird', habitats: ['park', 'urban', 'forest', 'field'], activityIds: ['photograph', 'wildlife-track'], establishment: 'native' }),
  taxon({ gbifTaxonKey: 2490384, commonName: 'Northern cardinal', scientificName: 'Cardinalis cardinalis', group: 'bird', habitats: ['park', 'urban', 'forest'], activityIds: ['photograph', 'wildlife-track'], establishment: 'native' }),
  taxon({ gbifTaxonKey: 2495414, commonName: 'Rock pigeon', scientificName: 'Columba livia', group: 'bird', habitats: ['urban', 'urban-core', 'park'], activityIds: ['photograph'], establishment: 'introduced' }),
  taxon({ gbifTaxonKey: 9409198, commonName: 'Red-winged blackbird', scientificName: 'Agelaius phoeniceus', group: 'bird', habitats: ['wetland', 'field', 'riverbank'], activityIds: ['photograph', 'wildlife-track'], establishment: 'native' }),
  taxon({ gbifTaxonKey: 2481875, commonName: 'Double-crested cormorant', scientificName: 'Phalacrocorax auritus', group: 'bird', habitats: ['coast', 'fresh-water', 'riverbank', 'wetland'], activityIds: ['photograph', 'wildlife-track'], establishment: 'native' }),

  taxon({ gbifTaxonKey: 5133088, commonName: 'Monarch', scientificName: 'Danaus plexippus', group: 'insect-arachnid', habitats: ['field', 'park', 'urban'], activeMonths: WARM_MONTHS, activityIds: ['photograph', 'inspect'], establishment: 'native' }),
  taxon({ gbifTaxonKey: 1938016, commonName: 'Eastern tiger swallowtail', scientificName: 'Papilio glaucus', group: 'insect-arachnid', habitats: ['forest', 'field', 'park'], activeMonths: WARM_MONTHS, activityIds: ['photograph', 'inspect'], establishment: 'native' }),
  taxon({ gbifTaxonKey: 1937816, commonName: 'Black swallowtail', scientificName: 'Papilio polyxenes', group: 'insect-arachnid', habitats: ['field', 'park', 'urban'], activeMonths: WARM_MONTHS, activityIds: ['photograph', 'inspect'], establishment: 'native' }),
  taxon({ gbifTaxonKey: 5130514, commonName: 'Common buckeye', scientificName: 'Junonia coenia', group: 'insect-arachnid', habitats: ['field', 'park', 'coast'], activeMonths: WARM_MONTHS, activityIds: ['photograph', 'inspect'], establishment: 'native' }),
  taxon({ gbifTaxonKey: 1920496, commonName: 'Cabbage white', scientificName: 'Pieris rapae', group: 'insect-arachnid', habitats: ['field', 'park', 'urban'], activeMonths: WARM_MONTHS, activityIds: ['photograph', 'inspect'], establishment: 'introduced' }),
  taxon({ gbifTaxonKey: 5132084, commonName: 'Red-spotted purple', scientificName: 'Limenitis arthemis', group: 'insect-arachnid', habitats: ['forest', 'park', 'riverbank'], activeMonths: WARM_MONTHS, activityIds: ['photograph', 'inspect'], establishment: 'native' }),
  taxon({ gbifTaxonKey: 5051741, commonName: 'Common green darner', scientificName: 'Anax junius', group: 'insect-arachnid', habitats: ['wetland', 'fresh-water', 'riverbank', 'park'], activeMonths: WARM_MONTHS, activityIds: ['photograph', 'inspect'], establishment: 'native' }),
  taxon({ gbifTaxonKey: 1429340, commonName: 'Eastern pondhawk', scientificName: 'Erythemis simplicicollis', group: 'insect-arachnid', habitats: ['wetland', 'fresh-water', 'riverbank'], activeMonths: WARM_MONTHS, activityIds: ['photograph', 'inspect'], establishment: 'native' }),
  taxon({ gbifTaxonKey: 1162763, commonName: 'Common eastern firefly', scientificName: 'Photinus pyralis', group: 'insect-arachnid', habitats: ['field', 'park', 'forest', 'urban'], activeMonths: [5, 6, 7, 8, 9], timeBands: ['dusk', 'night'], activityIds: ['photograph', 'inspect'], establishment: 'native' }),
  taxon({ gbifTaxonKey: 4990191, commonName: 'Seven-spotted lady beetle', scientificName: 'Coccinella septempunctata', group: 'insect-arachnid', habitats: ['field', 'park', 'urban'], activeMonths: WARM_MONTHS, activityIds: ['photograph', 'inspect'], establishment: 'introduced' }),
  taxon({ gbifTaxonKey: 1342324, commonName: 'Eastern carpenter bee', scientificName: 'Xylocopa virginica', group: 'insect-arachnid', habitats: ['forest', 'field', 'park', 'urban'], activeMonths: WARM_MONTHS, activityIds: ['photograph', 'inspect'], establishment: 'native' }),
  taxon({ gbifTaxonKey: 1340350, commonName: 'Common eastern bumble bee', scientificName: 'Bombus impatiens', group: 'insect-arachnid', habitats: ['field', 'park', 'urban', 'forest'], activeMonths: WARM_MONTHS, activityIds: ['photograph', 'inspect'], establishment: 'native' }),
  taxon({ gbifTaxonKey: 5171022, commonName: 'Yellow garden spider', scientificName: 'Argiope aurantia', group: 'insect-arachnid', habitats: ['field', 'park', 'urban'], activeMonths: [6, 7, 8, 9, 10], activityIds: ['photograph', 'inspect'], establishment: 'native' }),
  taxon({ gbifTaxonKey: 2150903, commonName: 'Dark fishing spider', scientificName: 'Dolomedes tenebrosus', group: 'insect-arachnid', habitats: ['forest', 'wetland', 'riverbank', 'fresh-water'], activeMonths: WARM_MONTHS, activityIds: ['photograph', 'inspect'], establishment: 'native' }),
  taxon({ gbifTaxonKey: 5792026, commonName: 'Pharaoh cicada', scientificName: 'Magicicada septendecim', group: 'insect-arachnid', habitats: ['forest', 'park', 'urban'], activeMonths: [5, 6], activityIds: ['photograph', 'inspect'], establishment: 'native', regionalRecordId: 'periodical-cicada-seasonal-only' }),

  taxon({ gbifTaxonKey: 3189883, commonName: 'Red maple', scientificName: 'Acer rubrum', group: 'plant', habitats: ['forest', 'park', 'urban', 'wetland'], activeMonths: GROWING_MONTHS, activityIds: ['photograph', 'forage'], establishment: 'native' }),
  taxon({ gbifTaxonKey: 2879737, commonName: 'White oak', scientificName: 'Quercus alba', group: 'plant', habitats: ['forest', 'park'], activeMonths: GROWING_MONTHS, activityIds: ['photograph', 'forage'], establishment: 'native' }),
  taxon({ gbifTaxonKey: 3152820, commonName: 'American sycamore', scientificName: 'Platanus occidentalis', group: 'plant', habitats: ['riverbank', 'fresh-water', 'park', 'urban'], activeMonths: GROWING_MONTHS, activityIds: ['photograph', 'forage'], establishment: 'native' }),
  taxon({ gbifTaxonKey: 3152861, commonName: 'Tulip tree', scientificName: 'Liriodendron tulipifera', group: 'plant', habitats: ['forest', 'park', 'urban'], activeMonths: GROWING_MONTHS, activityIds: ['photograph', 'forage'], establishment: 'native' }),
  taxon({ gbifTaxonKey: 3082240, commonName: 'Flowering dogwood', scientificName: 'Cornus florida', group: 'plant', habitats: ['forest', 'park', 'urban'], activeMonths: GROWING_MONTHS, activityIds: ['photograph', 'forage'], establishment: 'native' }),
  taxon({ gbifTaxonKey: 5414248, commonName: 'American holly', scientificName: 'Ilex opaca', group: 'plant', habitats: ['forest', 'park', 'wetland'], activeMonths: ALL_MONTHS, activityIds: ['photograph', 'forage'], establishment: 'native' }),
  taxon({ gbifTaxonKey: 3170247, commonName: 'Common milkweed', scientificName: 'Asclepias syriaca', group: 'plant', habitats: ['field', 'park', 'urban'], activeMonths: GROWING_MONTHS, activityIds: ['photograph', 'forage'], establishment: 'native' }),
  taxon({ gbifTaxonKey: 2705081, commonName: 'Switchgrass', scientificName: 'Panicum virgatum', group: 'plant', habitats: ['field', 'wetland', 'riverbank'], activeMonths: GROWING_MONTHS, activityIds: ['photograph', 'forage'], establishment: 'native' }),
  taxon({ gbifTaxonKey: 9394776, commonName: 'Smooth cordgrass', scientificName: 'Sporobolus alterniflorus', group: 'plant', habitats: ['coast', 'wetland', 'riverbank'], activeMonths: GROWING_MONTHS, activityIds: ['photograph', 'forage'], establishment: 'native', regionalProviderId: 'chesapeake-bay-field-guide', regionalRecordId: 'bay-grasses:smooth-cordgrass' }),
  taxon({ gbifTaxonKey: 5289423, commonName: 'Broadleaf cattail', scientificName: 'Typha latifolia', group: 'plant', habitats: ['wetland', 'fresh-water', 'riverbank'], activeMonths: GROWING_MONTHS, activityIds: ['photograph', 'forage'], establishment: 'native' }),

  ...[
    [2394563, 'Largemouth bass', 'Micropterus salmoides'],
    [2394503, 'Bluegill', 'Lepomis macrochirus'],
    [2394526, 'Black crappie', 'Pomoxis nigromaculatus'],
    [5202520, 'Channel catfish', 'Ictalurus punctatus'],
    [2340989, 'Brown bullhead', 'Ameiurus nebulosus'],
    [2382004, 'Yellow perch', 'Perca flavescens'],
    [2394604, 'White perch', 'Morone americana'],
    [2346629, 'Chain pickerel', 'Esox niger'],
    [2362185, 'Spottail shiner', 'Notropis hudsonius'],
    [2413541, 'American gizzard shad', 'Dorosoma cepedianum']
  ].map(([gbifTaxonKey, commonName, scientificName]) => taxon({
    gbifTaxonKey, commonName, scientificName, group: 'freshwater-fish',
    habitats: WATER_CONTEXTS, activityIds: ['sonar-survey'], establishment: 'regional-status-varies',
    regionalProviderId: 'chesapeake-bay-field-guide', regionalRecordId: `freshwater-fish:${scientificName}`
  })),

  ...[
    [2394612, 'Striped bass', 'Morone saxatilis'],
    [5214544, 'Atlantic menhaden', 'Brevoortia tyrannus'],
    [2413931, 'Bay anchovy', 'Anchoa mitchilli'],
    [5212294, 'Spot', 'Leiostomus xanthurus'],
    [2399874, 'Atlantic croaker', 'Micropogonias undulatus'],
    [2399985, 'Weakfish', 'Cynoscion regalis'],
    [2408866, 'Summer flounder', 'Paralichthys dentatus'],
    [2350910, 'Oyster toadfish', 'Opsanus tau'],
    [5212956, 'American eel', 'Anguilla rostrata'],
    [2412661, 'American shad', 'Alosa sapidissima']
  ].map(([gbifTaxonKey, commonName, scientificName]) => taxon({
    gbifTaxonKey, commonName, scientificName, group: 'marine-fish',
    habitats: ESTUARY_CONTEXTS, activityIds: ['sonar-survey'], establishment: 'native-or-migratory',
    regionalProviderId: 'chesapeake-bay-field-guide', regionalRecordId: `estuary-fish:${scientificName}`
  }))
];

const BALTIMORE_ECOLOGY_PACK = deepFreeze({
  type: 'RegionalEcologyPack',
  schemaVersion: REGIONAL_ECOLOGY_SCHEMA_VERSION,
  id: BALTIMORE_ECOLOGY_PACK_ID,
  version: BALTIMORE_ECOLOGY_PACK_VERSION,
  status: 'candidate-source-reviewed-domain-review-pending',
  region: {
    label: 'Baltimore–Chesapeake pilot',
    countryCode: 'US',
    bounds: { south: 38.4, west: -77.6, north: 40.1, east: -75.7 },
    spatialPrecision: 'regional-pack-only-no-occurrence-points'
  },
  taxonomy: {
    providerId: 'gbif-backbone-2023',
    version: '2023-08-28-compatibility',
    migrationNote: 'Stable internal IDs retain pinned GBIF keys; synonyms never rewrite historical records.'
  },
  localization: { defaultLocale: 'en-US', seedLocales: ['en-US'], scientificNameFallback: true },
  sources: ECOLOGY_SOURCE_MANIFEST,
  taxa: BALTIMORE_TAXA,
  truthPolicy: {
    encounterTruthClass: 'generated-game-encounter',
    regionalEvidenceClass: 'habitat-plausible',
    livePresenceLanguageAllowed: false,
    occurrenceRecordsIncluded: false,
    abundanceModelIncluded: false,
    osmSpeciesInferenceAllowed: false
  },
  sensitiveSpeciesPolicy: {
    defaultPrecision: 'pack-region',
    sensitivePrecision: '20km-or-coarser',
    suppressNestsRoostsDens: true,
    suppressRecentOccurrenceTime: true
  },
  contentRelease: {
    releaseId: `${BALTIMORE_ECOLOGY_PACK_ID}@${BALTIMORE_ECOLOGY_PACK_VERSION}`,
    compatibleClient: '>=5.0.0',
    migration: { fromVersions: [], stableIdPolicy: 'preserve-historical-records' },
    rollback: { previousVersion: null, action: 'disable-pack-and-use-global-procedural-catalog' },
    emergencyDisableSupported: true
  },
  creatureQuality: {
    gateSchemaVersion: 1,
    currentTier: 'reference-fallback',
    promotionPolicy: 'per-taxon-gated-no-pack-wide-implicit-promotion',
    rollbackTier: 'reference-fallback'
  },
  reviewEvidence: {
    taxonomyKeysCheckedAt: '2026-08-24',
    taxonomyMatchPolicy: 'accepted-species-exact-match',
    regionalSourcesReviewedAt: '2026-08-24',
    domainExpertReview: 'pending',
    mediaReview: 'no-media-bundled',
    knownLimitations: [
      'No occurrence download DOI is included, so this candidate makes habitat-plausible claims only.',
      'Fish are cataloged for later A4 population authority and are not catch-probability inputs.',
      'All taxa remain reference-fallback quality until anatomy, behavior, LOD, rights, and mobile asset review passes.'
    ]
  }
});

const BALTIMORE_TAXON_DISCOVERIES = deepFreeze(BALTIMORE_TAXA.map((entry) => ({
  id: entry.id,
  regionalPackId: BALTIMORE_ECOLOGY_PACK_ID,
  regionalPackVersion: BALTIMORE_ECOLOGY_PACK_VERSION,
  names: {
    common: entry.localizedNames['en-US'],
    scientific: entry.acceptedScientificName
  },
  family: `${entry.group}-taxon`,
  activityIds: entry.activityIds,
  contexts: entry.habitats,
  rarityBand: entry.sensitiveSpecies ? 'uncommon' : 'common',
  regionalReviewBand: entry.sensitiveSpecies ? 'sensitive-generalized' : 'regional',
  qualityBand: entry.presentation.tier,
  tradePolicy: 'not-tradeable',
  description: `${entry.localizedNames['en-US']} is a habitat-plausible Baltimore–Chesapeake catalog taxon. Generated opportunities are virtual and do not claim a real organism is present at this location.`,
  evidenceClass: entry.regionalEvidenceClass,
  sensitiveLocationPolicy: entry.sensitiveLocationPolicy,
  activeMonths: entry.activeMonths,
  timeBands: entry.timeBands,
  gbifTaxonKey: entry.gbifTaxonKey,
  stableTaxonId: entry.stableTaxonId,
  presentation: entry.presentation,
  sourceRefs: entry.sourceRefs
})));

function inPackBounds(location = {}, pack = BALTIMORE_ECOLOGY_PACK) {
  const latitude = Number(location.lat);
  const longitude = Number(location.lon);
  const bounds = pack.region.bounds;
  return Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude >= bounds.south && latitude <= bounds.north &&
    longitude >= bounds.west && longitude <= bounds.east;
}

function resolveRegionalEcologyPack(location = {}) {
  return inPackBounds(location) ? BALTIMORE_ECOLOGY_PACK : null;
}

function selectRegionalTaxa(pack, options = {}) {
  if (pack?.type !== 'RegionalEcologyPack') return [];
  const contexts = new Set(options.contexts || []);
  const month = Math.max(1, Math.min(12, Number(options.month) || 1));
  const requestedTimeBand = String(options.timeBand || 'day').toLowerCase();
  const timeBand = ['dawn', 'day', 'dusk', 'night'].includes(requestedTimeBand) ? requestedTimeBand : 'day';
  const activityId = String(options.activityId || '');
  return pack.taxa.filter((entry) =>
    entry.activityIds.includes(activityId) &&
    entry.activeMonths.includes(month) &&
    entry.timeBands.includes(timeBand) &&
    entry.habitats.some((habitat) => contexts.has(habitat))
  );
}

function validateRegionalEcologyPack(pack = BALTIMORE_ECOLOGY_PACK) {
  const errors = [];
  if (pack?.type !== 'RegionalEcologyPack') errors.push('invalid pack type');
  if (pack?.schemaVersion !== REGIONAL_ECOLOGY_SCHEMA_VERSION) errors.push('unsupported schema version');
  if (!pack?.contentRelease?.rollback?.action) errors.push('missing rollback action');
  if (pack?.truthPolicy?.livePresenceLanguageAllowed !== false) errors.push('live-presence language must be disabled');
  if (pack?.truthPolicy?.osmSpeciesInferenceAllowed !== false) errors.push('OSM species inference must be disabled');
  const ids = new Set();
  const keys = new Set();
  const counts = {};
  for (const entry of pack?.taxa || []) {
    if (!/^taxon-[0-9]+$/.test(entry.id)) errors.push(`${entry.id}: invalid stable id`);
    if (ids.has(entry.id)) errors.push(`${entry.id}: duplicate id`);
    if (keys.has(entry.gbifTaxonKey)) errors.push(`${entry.id}: duplicate taxonomy key`);
    ids.add(entry.id);
    keys.add(entry.gbifTaxonKey);
    counts[entry.group] = (counts[entry.group] || 0) + 1;
    if (!entry.localizedNames?.['en-US'] || !entry.acceptedScientificName) errors.push(`${entry.id}: incomplete names`);
    if (!entry.habitats?.length || !entry.activeMonths?.length || !entry.activityIds?.length) errors.push(`${entry.id}: incomplete ecology traits`);
    if (entry.livePresenceClaimAllowed !== false) errors.push(`${entry.id}: live presence must be false`);
    if (entry.sensitiveSpecies && !/generalize|suppress/.test(entry.sensitiveLocationPolicy)) errors.push(`${entry.id}: unsafe sensitive policy`);
    if (entry.presentation?.assetStatus !== 'no-media-bundled') errors.push(`${entry.id}: unreviewed media bundled`);
    for (const ref of entry.sourceRefs || []) {
      const source = pack.sources?.[ref.providerId];
      if (!source?.allowsProductUse || !ref.recordId || !ref.license || !ref.attribution) errors.push(`${entry.id}: invalid source reference`);
      if (/BY-NC|NC-|NONCOMMERCIAL/i.test(ref.license)) errors.push(`${entry.id}: noncommercial source included`);
    }
  }
  const expected = {
    mammal: 5,
    bird: 10,
    'insect-arachnid': 15,
    plant: 10,
    'freshwater-fish': 10,
    'marine-fish': 10
  };
  for (const [group, count] of Object.entries(expected)) {
    if (counts[group] !== count) errors.push(`${group}: expected ${count}, received ${counts[group] || 0}`);
  }
  if ((pack?.taxa || []).length !== 60) errors.push(`expected 60 taxa, received ${(pack?.taxa || []).length}`);
  return deepFreeze({ ok: errors.length === 0, errors, counts, taxonCount: pack?.taxa?.length || 0 });
}

export {
  BALTIMORE_ECOLOGY_PACK,
  BALTIMORE_ECOLOGY_PACK_ID,
  BALTIMORE_ECOLOGY_PACK_VERSION,
  BALTIMORE_TAXA,
  BALTIMORE_TAXON_DISCOVERIES,
  ECOLOGY_SOURCE_MANIFEST,
  REGIONAL_ECOLOGY_SCHEMA_VERSION,
  inPackBounds,
  resolveRegionalEcologyPack,
  selectRegionalTaxa,
  validateRegionalEcologyPack
};
