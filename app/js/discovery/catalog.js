import {
  BALTIMORE_TAXON_DISCOVERIES,
  ECOLOGY_SOURCE_MANIFEST
} from './ecology/baltimore-pack.js?v=1';

const DISCOVERY_CATALOG_VERSION = '2026.08.24.2';

const SOURCE_MANIFEST = Object.freeze({
  ...ECOLOGY_SOURCE_MANIFEST,
  'we3d-original': Object.freeze({
    id: 'we3d-original',
    label: 'World Explorer 3D original game content',
    license: 'WE3D-ORIGINAL',
    attribution: 'World Explorer 3D',
    allowsProductUse: true,
    locationPrecision: 'procedural'
  }),
  osm: Object.freeze({
    id: 'osm',
    label: 'OpenStreetMap',
    license: 'ODbL-1.0',
    attribution: '© OpenStreetMap contributors',
    allowsProductUse: true,
    locationPrecision: 'mapped'
  }),
  worldcover: Object.freeze({
    id: 'worldcover',
    label: 'ESA WorldCover',
    license: 'CC-BY-4.0',
    attribution: 'ESA WorldCover project',
    allowsProductUse: true,
    locationPrecision: 'modeled'
  })
});

const sourceRef = (providerId, recordId) => Object.freeze({
  providerId,
  recordId,
  datasetId: providerId,
  license: SOURCE_MANIFEST[providerId]?.license || '',
  attribution: SOURCE_MANIFEST[providerId]?.attribution || '',
  retrievedAt: '2026-08-16'
});

const TOOL_CATALOG = Object.freeze([
  {
    id: 'field-lens', label: 'Field Lens', discipline: 'exploration',
    capabilities: ['inspect', 'classify', 'survey-habitat', 'community-survey'], depthBands: ['surface'],
    tutorialId: 'field-lens-v1', sourceRefs: [sourceRef('we3d-original', 'tool:field-lens')]
  },
  {
    id: 'metal-detector', label: 'Metal Detector', discipline: 'history-service',
    capabilities: ['detect-metal', 'refine-signal', 'classify-signal'], depthBands: ['surface', 'shallow', 'moderate'],
    tutorialId: 'metal-detector-v1', sourceRefs: [sourceRef('we3d-original', 'tool:metal-detector')]
  },
  {
    id: 'hand-trowel', label: 'Hand Trowel', discipline: 'history-service',
    capabilities: ['excavate'], depthBands: ['surface', 'shallow'],
    tutorialId: 'hand-trowel-v1', sourceRefs: [sourceRef('we3d-original', 'tool:hand-trowel')]
  },
  {
    id: 'field-shovel', label: 'Field Shovel', discipline: 'history-service',
    capabilities: ['excavate'], depthBands: ['surface', 'shallow', 'moderate'],
    tutorialId: 'field-shovel-v1', sourceRefs: [sourceRef('we3d-original', 'tool:field-shovel')]
  },
  {
    id: 'specimen-brush', label: 'Specimen Brush', discipline: 'earth-science',
    capabilities: ['clean', 'reveal'], depthBands: ['surface', 'shallow', 'moderate'],
    tutorialId: 'specimen-brush-v1', sourceRefs: [sourceRef('we3d-original', 'tool:specimen-brush')]
  },
  {
    id: 'field-camera', label: 'Field Camera', discipline: 'nature',
    capabilities: ['photograph', 'macro-photograph', 'record'], depthBands: ['surface'],
    tutorialId: 'field-camera-v1', sourceRefs: [sourceRef('we3d-original', 'tool:field-camera')]
  },
  {
    id: 'rock-hammer', label: 'Virtual Rock Hammer', discipline: 'earth-science',
    capabilities: ['inspect-rock', 'sample-virtual'], depthBands: ['surface', 'shallow'],
    tutorialId: 'rock-hammer-v1', sourceRefs: [sourceRef('we3d-original', 'tool:rock-hammer')]
  },
  {
    id: 'sediment-pan', label: 'Sediment Pan', discipline: 'earth-science',
    capabilities: ['pan-sediment'], depthBands: ['surface'],
    tutorialId: 'sediment-pan-v1', sourceRefs: [sourceRef('we3d-original', 'tool:sediment-pan')]
  },
  {
    id: 'fishing-rod', label: 'Fishing Rod', discipline: 'nature',
    capabilities: ['fish'], depthBands: ['surface'],
    tutorialId: 'fishing-rod-v1', sourceRefs: [sourceRef('we3d-original', 'tool:fishing-rod')]
  },
  {
    id: 'fossil-brush', label: 'Fossil Brush', discipline: 'earth-science',
    capabilities: ['document-fossil', 'clean'], depthBands: ['surface', 'shallow'],
    tutorialId: 'fossil-brush-v1', sourceRefs: [sourceRef('we3d-original', 'tool:fossil-brush')]
  },
  {
    id: 'field-binoculars', label: 'Field Binoculars', discipline: 'nature',
    capabilities: ['observe-wildlife', 'track-wildlife'], depthBands: ['surface'],
    tutorialId: 'field-binoculars-v1', sourceRefs: [sourceRef('we3d-original', 'tool:field-binoculars')]
  },
  {
    id: 'trail-camera', label: 'Virtual Trail Camera', discipline: 'nature',
    capabilities: ['place-trail-camera'], depthBands: ['surface'],
    tutorialId: 'trail-camera-v1', sourceRefs: [sourceRef('we3d-original', 'tool:trail-camera')]
  },
  {
    id: 'survey-drone', label: 'Survey Drone', discipline: 'history-service',
    capabilities: ['drone-survey', 'search'], depthBands: ['surface'],
    tutorialId: 'survey-drone-v1', sourceRefs: [sourceRef('we3d-original', 'tool:survey-drone')]
  },
  {
    id: 'portable-sonar', label: 'Portable Sonar', discipline: 'nature',
    capabilities: ['sonar-survey'], depthBands: ['surface'],
    tutorialId: 'portable-sonar-v1', sourceRefs: [sourceRef('we3d-original', 'tool:portable-sonar')]
  },
  {
    id: 'virtual-dive-kit', label: 'Virtual Dive Kit', discipline: 'exploration',
    capabilities: ['dive-survey'], depthBands: ['surface', 'shallow', 'moderate', 'deep'],
    tutorialId: 'virtual-dive-kit-v1', sourceRefs: [sourceRef('we3d-original', 'tool:virtual-dive-kit')]
  },
  {
    id: 'weather-kit', label: 'Weather Observation Kit', discipline: 'exploration',
    capabilities: ['observe-weather'], depthBands: ['surface'],
    tutorialId: 'weather-kit-v1', sourceRefs: [sourceRef('we3d-original', 'tool:weather-kit')]
  },
  {
    id: 'field-telescope', label: 'Field Telescope', discipline: 'exploration',
    capabilities: ['observe-sky'], depthBands: ['surface'],
    tutorialId: 'field-telescope-v1', sourceRefs: [sourceRef('we3d-original', 'tool:field-telescope')]
  }
].map(Object.freeze));

const ACTIVITY_CATALOG = Object.freeze([
  {
    id: 'inspect', label: 'Inspect', discipline: 'exploration', toolCapability: 'inspect',
    universal: true, contexts: ['any'], exclusions: [], sourceRefs: [sourceRef('we3d-original', 'activity:inspect')]
  },
  {
    id: 'metal-detect', label: 'Detect', discipline: 'history-service', toolCapability: 'detect-metal',
    contexts: ['urban', 'park', 'field', 'beach', 'trail'], exclusions: ['open-ocean', 'deep-water', 'sensitive'],
    sourceRefs: [sourceRef('we3d-original', 'activity:metal-detect')]
  },
  {
    id: 'geology-inspect', label: 'Inspect Geology', discipline: 'earth-science', toolCapability: 'inspect-rock',
    contexts: ['outcrop', 'mountain', 'desert', 'riverbank', 'beach'], exclusions: ['deep-water'],
    sourceRefs: [sourceRef('we3d-original', 'activity:geology-inspect')]
  },
  {
    id: 'pan-sediment', label: 'Pan Virtual Sediment', discipline: 'earth-science', toolCapability: 'pan-sediment',
    contexts: ['riverbank', 'stream'], exclusions: ['urban-core', 'deep-water', 'sensitive'],
    sourceRefs: [sourceRef('we3d-original', 'activity:pan-sediment')]
  },
  {
    id: 'photograph', label: 'Photograph', discipline: 'nature', toolCapability: 'photograph',
    contexts: ['forest', 'park', 'field', 'wetland', 'riverbank', 'beach', 'mountain', 'desert', 'urban'], exclusions: [],
    sourceRefs: [sourceRef('we3d-original', 'activity:photograph')]
  },
  {
    id: 'nature-observe', label: 'Observe Wildlife', discipline: 'nature', toolCapability: 'observe-wildlife',
    contexts: ['forest', 'park', 'field', 'wetland', 'riverbank', 'coast', 'urban'], exclusions: ['sensitive'],
    sourceRefs: [sourceRef('we3d-original', 'activity:nature-observe')]
  },
  {
    id: 'insect-macro', label: 'Insect Macro', discipline: 'nature', toolCapability: 'macro-photograph',
    contexts: ['forest', 'park', 'field', 'wetland', 'riverbank', 'urban'], exclusions: ['sensitive'],
    sourceRefs: [sourceRef('we3d-original', 'activity:insect-macro')]
  },
  {
    id: 'habitat-survey', label: 'Survey Habitat', discipline: 'nature', toolCapability: 'survey-habitat',
    contexts: ['forest', 'park', 'field', 'wetland', 'riverbank', 'coast', 'urban'], exclusions: ['sensitive'],
    sourceRefs: [sourceRef('we3d-original', 'activity:habitat-survey')]
  },
  {
    id: 'community-survey', label: 'Community Survey', discipline: 'nature', toolCapability: 'community-survey',
    contexts: ['forest', 'park', 'field', 'wetland', 'riverbank', 'coast', 'urban'], exclusions: ['sensitive'],
    sourceRefs: [sourceRef('we3d-original', 'activity:community-survey')]
  },
  {
    id: 'fish', label: 'Fish', discipline: 'nature', toolCapability: 'fish',
    contexts: ['fresh-water', 'coast', 'open-ocean'], exclusions: ['sensitive'],
    sourceRefs: [sourceRef('we3d-original', 'activity:fish')]
  },
  {
    id: 'beachcomb', label: 'Beachcomb', discipline: 'exploration', toolCapability: 'inspect',
    contexts: ['beach'], exclusions: ['inland'], sourceRefs: [sourceRef('we3d-original', 'activity:beachcomb')]
  },
  {
    id: 'survey', label: 'Survey Area', discipline: 'exploration', toolCapability: 'inspect',
    contexts: ['any'], exclusions: ['sensitive'], sourceRefs: [sourceRef('we3d-original', 'activity:survey')]
  },
  {
    id: 'fossil-document', label: 'Document Fossils', discipline: 'earth-science', toolCapability: 'document-fossil',
    contexts: ['fossil-formation'], exclusions: ['urban-core', 'deep-water'], sourceRefs: [sourceRef('we3d-original', 'activity:fossil-document')]
  },
  {
    id: 'forage', label: 'Forage Virtually', discipline: 'nature', toolCapability: 'inspect',
    contexts: ['forest', 'field'], exclusions: ['urban-core', 'sensitive'], sourceRefs: [sourceRef('we3d-original', 'activity:forage')]
  },
  {
    id: 'wildlife-track', label: 'Track Wildlife', discipline: 'nature', toolCapability: 'track-wildlife',
    contexts: ['forest', 'field', 'wetland', 'riverbank', 'park', 'mountain'], exclusions: ['sensitive'], sourceRefs: [sourceRef('we3d-original', 'activity:wildlife-track')]
  },
  {
    id: 'trail-camera-survey', label: 'Place Trail Camera', discipline: 'nature', toolCapability: 'place-trail-camera',
    contexts: ['forest', 'field', 'wetland', 'riverbank', 'mountain'], exclusions: ['urban-core', 'sensitive'], sourceRefs: [sourceRef('we3d-original', 'activity:trail-camera')]
  },
  {
    id: 'sonar-survey', label: 'Run Sonar Survey', discipline: 'nature', toolCapability: 'sonar-survey',
    contexts: ['fresh-water', 'coast', 'open-ocean'], exclusions: ['sensitive'], sourceRefs: [sourceRef('we3d-original', 'activity:sonar-survey')]
  },
  {
    id: 'dive-survey', label: 'Dive Virtually', discipline: 'exploration', toolCapability: 'dive-survey',
    contexts: ['coast', 'open-ocean'], exclusions: ['sensitive'], sourceRefs: [sourceRef('we3d-original', 'activity:dive-survey')]
  },
  {
    id: 'treasure-hunt', label: 'Follow Treasure Clue', discipline: 'history-service', toolCapability: 'inspect',
    contexts: ['urban', 'park', 'field', 'trail', 'beach'], exclusions: ['sensitive'], sourceRefs: [sourceRef('we3d-original', 'activity:treasure-hunt')]
  },
  {
    id: 'virtual-archaeology', label: 'Document Virtual Archaeology', discipline: 'history-service', toolCapability: 'inspect',
    contexts: ['urban', 'field', 'desert', 'outcrop'], exclusions: ['sensitive'], sourceRefs: [sourceRef('we3d-original', 'activity:virtual-archaeology')]
  },
  {
    id: 'farm-plot', label: 'Plan Virtual Farm Plot', discipline: 'creation', toolCapability: 'inspect',
    contexts: ['field'], exclusions: ['urban-core', 'sensitive'], sourceRefs: [sourceRef('we3d-original', 'activity:farm-plot')]
  },
  {
    id: 'forest-survey', label: 'Survey Forest Health', discipline: 'creation', toolCapability: 'inspect',
    contexts: ['forest'], exclusions: ['sensitive'], sourceRefs: [sourceRef('we3d-original', 'activity:forest-survey')]
  },
  {
    id: 'camp-expedition', label: 'Set Virtual Camp', discipline: 'exploration', toolCapability: 'inspect',
    contexts: ['forest', 'field', 'mountain', 'desert'], exclusions: ['urban', 'urban-core', 'sensitive'], sourceRefs: [sourceRef('we3d-original', 'activity:camp-expedition')]
  },
  {
    id: 'drone-survey', label: 'Launch Survey Drone', discipline: 'history-service', toolCapability: 'drone-survey',
    contexts: ['urban', 'field', 'forest', 'mountain', 'desert', 'coast'], exclusions: ['sensitive'], sourceRefs: [sourceRef('we3d-original', 'activity:drone-survey')]
  },
  {
    id: 'weather-observe', label: 'Record Weather', discipline: 'exploration', toolCapability: 'observe-weather',
    universal: true, contexts: ['any'], exclusions: [], sourceRefs: [sourceRef('we3d-original', 'activity:weather-observe')]
  },
  {
    id: 'astronomy-observe', label: 'Observe Night Sky', discipline: 'exploration', toolCapability: 'observe-sky',
    contexts: ['field', 'mountain', 'desert', 'beach'], exclusions: ['urban-core'], sourceRefs: [sourceRef('we3d-original', 'activity:astronomy-observe')]
  },
  {
    id: 'urban-survey', label: 'Urban Exploration Survey', discipline: 'history-service', toolCapability: 'inspect',
    contexts: ['urban', 'urban-core'], exclusions: ['sensitive'], sourceRefs: [sourceRef('we3d-original', 'activity:urban-survey')]
  },
  {
    id: 'transport-job', label: 'Start Local Delivery', discipline: 'history-service', toolCapability: 'inspect',
    contexts: ['urban', 'urban-core'], exclusions: [], sourceRefs: [sourceRef('we3d-original', 'activity:transport-job')]
  },
  {
    id: 'search-rescue', label: 'Run Virtual Search', discipline: 'history-service', toolCapability: 'search',
    contexts: ['forest', 'field', 'mountain', 'desert', 'coast', 'urban'], exclusions: ['sensitive'], sourceRefs: [sourceRef('we3d-original', 'activity:search-rescue')]
  }
].map(Object.freeze));

const FIND_CATALOG = Object.freeze([
  {
    id: 'brass-transit-token', names: { common: 'Brass Transit Token' }, family: 'fictional-find',
    material: 'brass', signalClass: 'high-conductor', depthBands: ['surface', 'shallow'],
    contexts: ['urban', 'park'], rarityBand: 'uncommon', description: 'A fictional transit token inspired by early city travel.',
    tradePolicy: 'collectible', sourceRefs: [sourceRef('we3d-original', 'find:brass-transit-token')]
  },
  {
    id: 'iron-trade-buckle', names: { common: 'Iron Trade Buckle' }, family: 'fictional-find',
    material: 'iron', signalClass: 'ferrous', depthBands: ['shallow', 'moderate'],
    contexts: ['field', 'trail', 'forest', 'park'], rarityBand: 'uncommon', description: 'A historically inspired virtual iron buckle.',
    tradePolicy: 'collectible', sourceRefs: [sourceRef('we3d-original', 'find:iron-trade-buckle')]
  },
  {
    id: 'copper-keepsake', names: { common: 'Copper Keepsake' }, family: 'fictional-find',
    material: 'copper', signalClass: 'high-conductor', depthBands: ['shallow', 'moderate'],
    contexts: ['urban', 'park', 'field', 'beach'], rarityBand: 'rare', description: 'A small virtual keepsake with weathered engraved lines.',
    tradePolicy: 'collectible', sourceRefs: [sourceRef('we3d-original', 'find:copper-keepsake')]
  },
  {
    id: 'aluminum-trail-tag', names: { common: 'Aluminum Trail Tag' }, family: 'fictional-find',
    material: 'aluminum', signalClass: 'mid-conductor', depthBands: ['surface', 'shallow'],
    contexts: ['trail', 'forest', 'mountain', 'park'], rarityBand: 'common', description: 'A trail marker fragment created for virtual gameplay.',
    tradePolicy: 'collectible', sourceRefs: [sourceRef('we3d-original', 'find:aluminum-trail-tag')]
  },
  {
    id: 'weathered-can-tab', names: { common: 'Weathered Can Tab' }, family: 'modern-find',
    material: 'aluminum', signalClass: 'mid-conductor', depthBands: ['surface'],
    contexts: ['urban', 'park', 'field', 'beach', 'trail'], rarityBand: 'common', description: 'A modern surface find that helps calibrate detector responses.',
    tradePolicy: 'not-tradeable', sourceRefs: [sourceRef('we3d-original', 'find:weathered-can-tab')]
  },
  {
    id: 'sea-smoothed-disc', names: { common: 'Sea-smoothed Metal Disc' }, family: 'fictional-find',
    material: 'mixed-metal', signalClass: 'mixed', depthBands: ['surface', 'shallow'],
    contexts: ['beach'], rarityBand: 'uncommon', description: 'A virtual disc shaped by a fictional shoreline history.',
    tradePolicy: 'collectible', sourceRefs: [sourceRef('we3d-original', 'find:sea-smoothed-disc')]
  }
].map(Object.freeze));

const FIELD_DISCOVERY_CATALOG = Object.freeze([
  { id: 'area-survey-note', names: { common: 'Area Survey Note' }, family: 'exploration-record', activityIds: ['inspect', 'survey'], contexts: ['any'], rarityBand: 'common', qualityBand: 'observed', tradePolicy: 'not-tradeable', description: 'A virtual note describing the current compiled environment context.', sourceRefs: [sourceRef('we3d-original', 'field:area-survey')] },
  { id: 'granite-field-sample', names: { common: 'Granite Field Sample', scientific: 'Coarse-grained intrusive igneous rock' }, visualId: 'granite', family: 'rock', activityIds: ['geology-inspect'], contexts: ['mountain', 'outcrop'], rarityBand: 'common', qualityBand: 'field', tradePolicy: 'specimen', description: 'A virtual specimen representing coarse-grained igneous rock. The photograph is an identification reference, not a location claim.', sourceRefs: [sourceRef('we3d-original', 'field:granite')] },
  { id: 'quartz-vein-sample', names: { common: 'Quartz Vein Sample', scientific: 'SiO₂' }, visualId: 'quartz', family: 'mineral', activityIds: ['geology-inspect', 'pan-sediment'], contexts: ['outcrop', 'mountain', 'riverbank'], rarityBand: 'uncommon', qualityBand: 'field', tradePolicy: 'specimen', description: 'A virtual quartz-bearing sample generated for Earth-science gameplay. The photograph is an identification reference.', sourceRefs: [sourceRef('we3d-original', 'field:quartz')] },
  { id: 'river-heavy-sand', names: { common: 'Heavy River Sand' }, family: 'sediment', activityIds: ['pan-sediment'], contexts: ['riverbank', 'stream'], rarityBand: 'common', qualityBand: 'survey', tradePolicy: 'specimen', description: 'A concentrate from virtual sediment panning.', sourceRefs: [sourceRef('we3d-original', 'field:river-sand')] },
  { id: 'shell-impression-cast', names: { common: 'Shell Impression Cast', scientific: 'Molluscan fossil material' }, visualId: 'fossil-shells', family: 'fossil-representation', activityIds: ['fossil-document'], contexts: ['fossil-formation'], rarityBand: 'uncommon', qualityBand: 'documented', tradePolicy: 'not-tradeable', description: 'A virtual cast, not a claim of a fossil at this exact location. The photograph is a museum reference.', sourceRefs: [sourceRef('we3d-original', 'field:shell-impression')] },
  { id: 'sea-glass-fragment', names: { common: 'Sea Glass Fragment' }, family: 'beach-find', activityIds: ['beachcomb'], contexts: ['beach'], rarityBand: 'common', qualityBand: 'weathered', tradePolicy: 'collectible', description: 'A virtual shoreline find.', sourceRefs: [sourceRef('we3d-original', 'field:sea-glass')] },
  { id: 'woodland-track-clue', names: { common: 'White-tailed Deer Sign', scientific: 'Odocoileus virginianus' }, visualId: 'white-tailed-deer', family: 'wildlife-clue', activityIds: ['wildlife-track', 'trail-camera-survey', 'photograph'], contexts: ['forest', 'field', 'park'], rarityBand: 'common', qualityBand: 'observed', tradePolicy: 'not-tradeable', description: 'A virtual field lead using a real species reference. It does not assert that an animal is present at the selected location.', sourceRefs: [sourceRef('we3d-original', 'field:woodland-track')] },
  { id: 'wetland-waterbird-clue', names: { common: 'Mallard Observation', scientific: 'Anas platyrhynchos' }, visualId: 'mallard', family: 'wildlife-clue', activityIds: ['wildlife-track', 'trail-camera-survey', 'photograph'], contexts: ['wetland', 'riverbank', 'coast'], rarityBand: 'uncommon', qualityBand: 'observed', tradePolicy: 'not-tradeable', description: 'A virtual waterbird field lead paired with a real identification reference. It is not a live occurrence claim.', sourceRefs: [sourceRef('we3d-original', 'field:waterbird-clue')] },
  { id: 'urban-nature-photo', names: { common: 'Rock Pigeon Record', scientific: 'Columba livia' }, visualId: 'rock-pigeon', family: 'wildlife-record', activityIds: ['photograph'], contexts: ['urban', 'urban-core', 'park'], rarityBand: 'common', qualityBand: 'photographic', tradePolicy: 'not-tradeable', description: 'A virtual urban-nature field lead paired with a real identification reference.', sourceRefs: [sourceRef('we3d-original', 'field:urban-nature-photo')] },
  { id: 'common-plant-record', names: { common: 'Common Dandelion Record', scientific: 'Taraxacum officinale' }, visualId: 'dandelion', family: 'botany-record', activityIds: ['forage'], contexts: ['forest', 'field', 'park'], rarityBand: 'common', qualityBand: 'photographic', tradePolicy: 'not-tradeable', description: 'A virtual botany record paired with a real identification reference. Never use the game to decide whether any real plant is safe to touch or eat.', sourceRefs: [sourceRef('we3d-original', 'field:common-plant-record')] },
  { id: 'sonar-depth-profile', names: { common: 'Sonar Depth Profile' }, family: 'water-survey', activityIds: ['sonar-survey'], contexts: ['fresh-water', 'coast', 'open-ocean'], rarityBand: 'common', qualityBand: 'survey', tradePolicy: 'not-tradeable', description: 'A virtual sonar profile.', sourceRefs: [sourceRef('we3d-original', 'field:sonar')] },
  { id: 'reef-photo-record', names: { common: 'Underwater Habitat Record' }, family: 'water-survey', activityIds: ['dive-survey'], contexts: ['coast', 'open-ocean'], rarityBand: 'uncommon', qualityBand: 'photographic', tradePolicy: 'not-tradeable', description: 'A virtual dive observation.', sourceRefs: [sourceRef('we3d-original', 'field:dive')] },
  { id: 'expedition-clue-page', names: { common: 'Expedition Clue Page' }, family: 'fictional-history', activityIds: ['treasure-hunt', 'virtual-archaeology'], contexts: ['urban', 'park', 'field', 'trail', 'beach', 'desert', 'outcrop'], rarityBand: 'uncommon', qualityBand: 'documented', tradePolicy: 'collectible', description: 'A clearly fictional clue for a virtual historical expedition.', sourceRefs: [sourceRef('we3d-original', 'field:clue')] },
  { id: 'land-stewardship-plan', names: { common: 'Land Stewardship Plan' }, family: 'creation-record', activityIds: ['farm-plot', 'forest-survey', 'camp-expedition'], contexts: ['field', 'forest', 'mountain', 'desert'], rarityBand: 'common', qualityBand: 'survey', tradePolicy: 'not-tradeable', description: 'A virtual planning record that does not change or authorize use of real land.', sourceRefs: [sourceRef('we3d-original', 'field:stewardship')] },
  { id: 'aerial-survey-frame', names: { common: 'Aerial Survey Frame' }, family: 'service-record', activityIds: ['drone-survey', 'search-rescue'], contexts: ['urban', 'field', 'forest', 'mountain', 'desert', 'coast'], rarityBand: 'common', qualityBand: 'survey', tradePolicy: 'not-tradeable', description: 'A virtual survey result.', sourceRefs: [sourceRef('we3d-original', 'field:aerial-survey')] },
  { id: 'weather-observation', names: { common: 'Weather Observation' }, family: 'weather-record', activityIds: ['weather-observe'], contexts: ['any'], rarityBand: 'common', qualityBand: 'observed', tradePolicy: 'not-tradeable', description: 'A game record based on the current modeled weather state.', sourceRefs: [sourceRef('we3d-original', 'field:weather')] },
  { id: 'night-sky-log', names: { common: 'Night Sky Log' }, family: 'astronomy-record', activityIds: ['astronomy-observe'], contexts: ['field', 'mountain', 'desert', 'beach'], rarityBand: 'uncommon', qualityBand: 'observed', tradePolicy: 'not-tradeable', description: 'A virtual observing log tied to game time and sky conditions.', sourceRefs: [sourceRef('we3d-original', 'field:sky-log')] },
  { id: 'urban-place-note', names: { common: 'Urban Place Note' }, family: 'urban-record', activityIds: ['urban-survey', 'transport-job'], contexts: ['urban', 'urban-core'], rarityBand: 'common', qualityBand: 'documented', tradePolicy: 'not-tradeable', description: 'A virtual survey or service record without asserting access to private property.', sourceRefs: [sourceRef('we3d-original', 'field:urban-note')] },
  { id: 'modeled-habitat-transect', names: { common: 'Modeled Habitat Transect' }, family: 'habitat-record', activityIds: ['habitat-survey'], contexts: ['forest', 'park', 'field', 'wetland', 'riverbank', 'coast', 'urban'], rarityBand: 'common', qualityBand: 'survey', tradePolicy: 'not-tradeable', description: 'A modeled habitat-context record. It does not confirm field conditions, access, or species presence.', sourceRefs: [sourceRef('we3d-original', 'field:modeled-habitat-transect')] },
  { id: 'local-game-checklist', names: { common: 'Local Game Checklist' }, family: 'community-survey-record', activityIds: ['community-survey'], contexts: ['forest', 'park', 'field', 'wetland', 'riverbank', 'coast', 'urban'], rarityBand: 'common', qualityBand: 'survey', tradePolicy: 'not-tradeable', description: 'A local checklist kept inside the game; it is not submitted to a community-science provider.', sourceRefs: [sourceRef('we3d-original', 'field:local-game-checklist')] },
  ...BALTIMORE_TAXON_DISCOVERIES
].map(Object.freeze));

const COMPANION_CATALOG = Object.freeze([
  { id: 'trail-hound', names: { common: 'Trail Hound' }, family: 'domestic-companion', contexts: ['urban', 'park', 'field', 'forest'], behaviorArchetype: 'ground-follower', sizeClass: 'medium-dog', worldScale: .48, arScale: .7, companionPolicy: 'adoptable-domestic', tradePolicy: 'not-tradeable', rarityBand: 'common', sourceRefs: [sourceRef('we3d-original', 'companion:trail-hound')] },
  { id: 'field-retriever', names: { common: 'Field Retriever' }, family: 'domestic-companion', contexts: ['park', 'field', 'forest', 'riverbank'], behaviorArchetype: 'ground-follower', sizeClass: 'large-dog', worldScale: .49, arScale: .7, companionPolicy: 'adoptable-domestic', tradePolicy: 'not-tradeable', rarityBand: 'uncommon', sourceRefs: [sourceRef('we3d-original', 'companion:field-retriever')] },
  { id: 'park-terrier', names: { common: 'Park Terrier' }, family: 'domestic-companion', contexts: ['urban', 'park', 'suburban'], behaviorArchetype: 'ground-follower', sizeClass: 'small-dog', worldScale: .38, arScale: .62, companionPolicy: 'adoptable-domestic', tradePolicy: 'not-tradeable', rarityBand: 'common', sourceRefs: [sourceRef('we3d-original', 'companion:park-terrier')] },
  { id: 'harbor-cat', names: { common: 'Harbor Cat' }, family: 'domestic-companion', contexts: ['urban', 'coast', 'park'], behaviorArchetype: 'ground-follower', sizeClass: 'cat', worldScale: .36, arScale: .62, companionPolicy: 'adoptable-domestic', tradePolicy: 'not-tradeable', rarityBand: 'uncommon', sourceRefs: [sourceRef('we3d-original', 'companion:harbor-cat')] },
  { id: 'meadow-tabby', names: { common: 'Meadow Tabby' }, family: 'domestic-companion', contexts: ['park', 'field', 'suburban'], behaviorArchetype: 'ground-follower', sizeClass: 'cat', worldScale: .35, arScale: .62, companionPolicy: 'adoptable-domestic', tradePolicy: 'not-tradeable', rarityBand: 'common', sourceRefs: [sourceRef('we3d-original', 'companion:meadow-tabby')] },
  { id: 'midnight-cat', names: { common: 'Midnight Cat' }, family: 'domestic-companion', contexts: ['urban', 'park', 'coast'], behaviorArchetype: 'ground-follower', sizeClass: 'cat', worldScale: .34, arScale: .62, companionPolicy: 'adoptable-domestic', tradePolicy: 'not-tradeable', rarityBand: 'rare', sourceRefs: [sourceRef('we3d-original', 'companion:midnight-cat')] },
  { id: 'marsh-mallard', names: { common: 'Virtual Marsh Mallard' }, family: 'virtual-wildlife-companion', contexts: ['wetland', 'riverbank', 'fresh-water', 'coast'], behaviorArchetype: 'air-follower', sizeClass: 'waterbird', worldScale: .38, arScale: .58, flightHeight: 1.35, companionPolicy: 'virtual-unlock-only', tradePolicy: 'not-tradeable', rarityBand: 'uncommon', sourceRefs: [sourceRef('we3d-original', 'companion:marsh-mallard')] },
  { id: 'city-pigeon', names: { common: 'Virtual City Pigeon' }, family: 'virtual-wildlife-companion', contexts: ['urban', 'urban-core', 'park'], behaviorArchetype: 'air-follower', sizeClass: 'small-bird', worldScale: .28, arScale: .52, flightHeight: 1.55, companionPolicy: 'virtual-unlock-only', tradePolicy: 'not-tradeable', rarityBand: 'common', sourceRefs: [sourceRef('we3d-original', 'companion:city-pigeon')] },
  { id: 'woodland-fox', names: { common: 'Virtual Woodland Fox' }, family: 'virtual-wildlife-companion', contexts: ['forest', 'field', 'mountain'], behaviorArchetype: 'ground-follower', sizeClass: 'fox', worldScale: .45, arScale: .66, companionPolicy: 'virtual-unlock-only', tradePolicy: 'not-tradeable', rarityBand: 'rare', sourceRefs: [sourceRef('we3d-original', 'companion:woodland-fox')] }
].map(Object.freeze));

function validateSourceRefs(entry, errors) {
  if (!Array.isArray(entry.sourceRefs) || entry.sourceRefs.length === 0) {
    errors.push(`${entry.id}: missing sourceRefs`);
    return;
  }
  entry.sourceRefs.forEach((ref) => {
    const source = SOURCE_MANIFEST[ref.providerId];
    if (!source) errors.push(`${entry.id}: unknown source ${ref.providerId}`);
    else if (!source.allowsProductUse) errors.push(`${entry.id}: source ${ref.providerId} is not approved`);
    if (!ref.recordId || !ref.license || !ref.attribution) errors.push(`${entry.id}: incomplete source reference`);
  });
}

function validateDiscoveryCatalogs(catalogs = {}) {
  const errors = [];
  const seen = new Set();
  const families = [catalogs.tools, catalogs.activities, catalogs.finds, catalogs.fieldDiscoveries, catalogs.companions];
  families.forEach((entries) => {
    if (!Array.isArray(entries)) {
      errors.push('catalog family must be an array');
      return;
    }
    entries.forEach((entry) => {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(entry?.id || ''))) errors.push(`${entry?.id || 'unknown'}: invalid stable id`);
      if (seen.has(entry.id)) errors.push(`${entry.id}: duplicate stable id`);
      seen.add(entry.id);
      validateSourceRefs(entry, errors);
      if (catalogs.companions?.includes(entry)) {
        if (!['ground-follower', 'air-follower'].includes(entry.behaviorArchetype)) errors.push(`${entry.id}: invalid companion behavior`);
        if (!(Number(entry.worldScale) > 0 && Number(entry.worldScale) <= .55)) errors.push(`${entry.id}: invalid world companion scale`);
      }
    });
  });
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

const BUILTIN_DISCOVERY_CATALOGS = Object.freeze({
  version: DISCOVERY_CATALOG_VERSION,
  sources: SOURCE_MANIFEST,
  tools: TOOL_CATALOG,
  activities: ACTIVITY_CATALOG,
  finds: FIND_CATALOG,
  fieldDiscoveries: FIELD_DISCOVERY_CATALOG,
  companions: COMPANION_CATALOG
});

export {
  ACTIVITY_CATALOG,
  BUILTIN_DISCOVERY_CATALOGS,
  DISCOVERY_CATALOG_VERSION,
  COMPANION_CATALOG,
  FIELD_DISCOVERY_CATALOG,
  FIND_CATALOG,
  SOURCE_MANIFEST,
  TOOL_CATALOG,
  validateDiscoveryCatalogs
};
