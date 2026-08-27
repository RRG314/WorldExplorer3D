import {
  BALTIMORE_ECOLOGY_PACK,
  BALTIMORE_TAXON_DISCOVERIES,
  ECOLOGY_SOURCE_MANIFEST,
  REGIONAL_ECOLOGY_SCHEMA_VERSION,
  selectRegionalTaxa
} from './baltimore-pack.js?v=2';

const PACK_RELEASE_VERSION = '2026.08.27-b1.0';
const ALL_MONTHS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
const NORTHERN_INSECT_MONTHS = Object.freeze([3, 4, 5, 6, 7, 8, 9, 10]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

const REGIONAL_REFERENCE_SOURCES = deepFreeze({
  'new-york-dec-nature': {
    id: 'new-york-dec-nature', label: 'New York State Department of Environmental Conservation — Nature',
    license: 'REFERENCE-ONLY', attribution: 'New York State Department of Environmental Conservation',
    datasetId: 'nysdec-nature-web-2026-08-27', sourceUrl: 'https://dec.ny.gov/nature', retrievedAt: '2026-08-27',
    allowsProductUse: true, useBoundary: 'factual state and habitat review only; no copied prose, media, occurrence, or abundance claim'
  },
  'illinois-dnr-biodiversity': {
    id: 'illinois-dnr-biodiversity', label: 'Illinois Department of Natural Resources — Biodiversity Search',
    license: 'REFERENCE-ONLY', attribution: 'Illinois Department of Natural Resources',
    datasetId: 'illinois-dnr-biodiversity-web-2026-08-27', sourceUrl: 'https://dnr2.illinois.gov/Biodiversity/SearchBD', retrievedAt: '2026-08-27',
    allowsProductUse: true, useBoundary: 'factual state species and habitat review only; no copied prose, media, occurrence, or abundance claim'
  },
  'florida-fwc-profiles': {
    id: 'florida-fwc-profiles', label: 'Florida Fish and Wildlife Conservation Commission — Species Profiles',
    license: 'REFERENCE-ONLY', attribution: 'Florida Fish and Wildlife Conservation Commission',
    datasetId: 'florida-fwc-profiles-web-2026-08-27', sourceUrl: 'https://myfwc.com/wildlifehabitats/profiles/', retrievedAt: '2026-08-27',
    allowsProductUse: true, useBoundary: 'factual state species and habitat review only; no copied prose, media, occurrence, or abundance claim'
  },
  'california-cdfw-swap': {
    id: 'california-cdfw-swap', label: 'California Department of Fish and Wildlife — State Wildlife Action Plan',
    license: 'REFERENCE-ONLY', attribution: 'California Department of Fish and Wildlife',
    datasetId: 'california-swap-2025-web-2026-08-27', sourceUrl: 'https://wildlife.ca.gov/SWAP', retrievedAt: '2026-08-27',
    allowsProductUse: true, useBoundary: 'factual state biodiversity and habitat review only; no copied prose, media, occurrence, or abundance claim'
  },
  'washington-wdfw-species': {
    id: 'washington-wdfw-species', label: 'Washington Department of Fish and Wildlife — Species and Habitats',
    license: 'REFERENCE-ONLY', attribution: 'Washington Department of Fish and Wildlife',
    datasetId: 'washington-wdfw-species-web-2026-08-27', sourceUrl: 'https://wdfw.wa.gov/species-habitats', retrievedAt: '2026-08-27',
    allowsProductUse: true, useBoundary: 'factual state species and ecosystem review only; no copied prose, media, occurrence, or abundance claim'
  },
  'clark-county-desert-conservation': {
    id: 'clark-county-desert-conservation', label: 'Clark County Desert Conservation Program',
    license: 'REFERENCE-ONLY', attribution: 'Clark County, Nevada Desert Conservation Program',
    datasetId: 'clark-county-dcp-web-2026-08-27', sourceUrl: 'https://www.clarkcountynv.gov/government/departments/environment_and_sustainability/desert_conservation_program/', retrievedAt: '2026-08-27',
    allowsProductUse: true, useBoundary: 'factual county habitat and covered-species review only; modeled maps, occurrence points, prose, and media excluded'
  },
  'europe-eea-eunis': {
    id: 'europe-eea-eunis', label: 'European Environment Agency — EUNIS habitats and species',
    license: 'CC-BY-4.0', attribution: 'European Environment Agency',
    datasetId: 'eea-eunis-web-2026-08-27', sourceUrl: 'https://www.eea.europa.eu/en/topics/in-depth/biodiversity/an-introduction-to-habitats', retrievedAt: '2026-08-27',
    allowsProductUse: true, useBoundary: 'European habitat and regional plausibility review only; no occurrence or abundance claim'
  },
  'monaco-environment-biodiversity': {
    id: 'monaco-environment-biodiversity', label: 'Monaco Direction de l’Environnement — Biodiversity',
    license: 'REFERENCE-ONLY', attribution: 'Principality of Monaco, Direction de l’Environnement',
    datasetId: 'monaco-environment-biodiversity-web-2026-08-27', sourceUrl: 'https://www.gouv.mc/Action-Gouvernementale/L-Environnement', retrievedAt: '2026-08-27',
    allowsProductUse: true, useBoundary: 'factual Mediterranean and Monaco biodiversity review only; copied prose, media, occurrence, and abundance excluded'
  },
  'japan-moe-biodiversity': {
    id: 'japan-moe-biodiversity', label: 'Biodiversity Center of Japan — Species Diversity Survey',
    license: 'REFERENCE-ONLY', attribution: 'Ministry of the Environment, Government of Japan',
    datasetId: 'japan-moe-species-diversity-web-2026-08-27', sourceUrl: 'https://www.biodic.go.jp/english/kiso/do05/index_e.html', retrievedAt: '2026-08-27',
    allowsProductUse: true, useBoundary: 'factual national and Tokyo review only; historical taxonomy is not used as the accepted taxonomy authority; occurrence records and media excluded'
  },
  'dubai-protected-areas': {
    id: 'dubai-protected-areas', label: 'Dubai Municipality — Dubai Protected Areas',
    license: 'REFERENCE-ONLY', attribution: 'Dubai Municipality',
    datasetId: 'dubai-protected-areas-web-2026-08-27', sourceUrl: 'https://www.dm.gov.ae/dubai-protected-areas/about-dubai-protected-areas/', retrievedAt: '2026-08-27',
    allowsProductUse: true, useBoundary: 'factual emirate ecosystem and regional plausibility review only; copied prose, media, occurrence, and abundance excluded'
  }
});

const ALL_REGIONAL_SOURCE_MANIFEST = deepFreeze({
  ...ECOLOGY_SOURCE_MANIFEST,
  ...REGIONAL_REFERENCE_SOURCES
});

const t = (gbifTaxonKey, commonName, scientificName, group, habitats, options = {}) => ({
  gbifTaxonKey, commonName, scientificName, group, habitats, ...options
});

const PACK_DEFINITIONS = [
  {
    id: 'us-nyc-northeast-urban', label: 'New York–Northeast urban nature', countryCode: 'US',
    sourceId: 'new-york-dec-nature', bounds: { south: 39.9, west: -75.8, north: 42.0, east: -71.5 },
    taxa: [
      t(2437438, 'Eastern chipmunk', 'Tamias striatus', 'mammal', ['forest', 'park', 'urban']),
      t(2439923, 'Virginia opossum', 'Didelphis virginiana', 'mammal', ['forest', 'park', 'urban'], { timeBands: ['dusk', 'night', 'dawn'] }),
      t(2481047, 'Peregrine falcon', 'Falco peregrinus', 'bird', ['urban', 'coast', 'riverbank'], { sensitiveSpecies: true }),
      t(2482593, 'Blue jay', 'Cyanocitta cristata', 'bird', ['forest', 'park', 'urban']),
      t(2480863, 'Black-crowned night heron', 'Nycticorax nycticorax', 'bird', ['wetland', 'riverbank', 'coast'], { timeBands: ['dusk', 'night', 'dawn'] }),
      t(1340382, 'Two-spotted bumble bee', 'Bombus bimaculatus', 'insect-arachnid', ['field', 'park', 'urban']),
      t(1925922, 'Spring azure', 'Celastrina ladon', 'insect-arachnid', ['forest', 'park', 'field']),
      t(2959443, 'Honey locust', 'Gleditsia triacanthos', 'plant', ['park', 'urban', 'forest']),
      t(2880539, 'Northern red oak', 'Quercus rubra', 'plant', ['forest', 'park', 'urban']),
      t(3023833, 'Canadian serviceberry', 'Amelanchier canadensis', 'plant', ['forest', 'park', 'wetland']),
      t(2351271, 'Brook trout', 'Salvelinus fontinalis', 'freshwater-fish', ['fresh-water', 'stream']),
      t(2387483, 'Black sea bass', 'Centropristis striata', 'marine-fish', ['coast'])
    ]
  },
  {
    id: 'us-il-chicago-great-lakes', label: 'Chicago–Great Lakes', countryCode: 'US',
    sourceId: 'illinois-dnr-biodiversity', bounds: { south: 41.0, west: -88.5, north: 42.5, east: -86.5 },
    taxa: [
      t(5219858, 'Muskrat', 'Ondatra zibethicus', 'mammal', ['wetland', 'riverbank', 'fresh-water']),
      t(2439838, 'North American beaver', 'Castor canadensis', 'mammal', ['wetland', 'riverbank', 'fresh-water'], { timeBands: ['dusk', 'night', 'dawn'] }),
      t(2481134, 'Ring-billed gull', 'Larus delawarensis', 'bird', ['coast', 'fresh-water', 'urban', 'park']),
      t(2492196, 'Song sparrow', 'Melospiza melodia', 'bird', ['wetland', 'field', 'park', 'urban']),
      t(2475472, 'Belted kingfisher', 'Megaceryle alcyon', 'bird', ['riverbank', 'fresh-water', 'wetland']),
      t(1427889, 'Twelve-spotted skimmer', 'Libellula pulchella', 'insect-arachnid', ['wetland', 'fresh-water', 'park']),
      t(1943964, 'Long dash', 'Polites mystic', 'insect-arachnid', ['field', 'park', 'wetland']),
      t(3189859, 'Sugar maple', 'Acer saccharum', 'plant', ['forest', 'park', 'urban']),
      t(2878213, 'Bur oak', 'Quercus macrocarpa', 'plant', ['forest', 'park', 'field']),
      t(4932035, 'Big bluestem', 'Andropogon gerardi', 'plant', ['field', 'park']),
      t(2382172, 'Walleye', 'Sander vitreus', 'freshwater-fish', ['fresh-water']),
      t(2400265, 'Freshwater drum', 'Aplodinotus grunniens', 'freshwater-fish', ['fresh-water', 'riverbank'])
    ]
  },
  {
    id: 'us-fl-south-florida-coast', label: 'South Florida coast and wetlands', countryCode: 'US',
    sourceId: 'florida-fwc-profiles', bounds: { south: 24.4, west: -81.5, north: 27.0, east: -79.5 },
    insectMonths: ALL_MONTHS,
    taxa: [
      t(2435296, 'West Indian manatee', 'Trichechus manatus', 'mammal', ['coast', 'fresh-water', 'riverbank'], { sensitiveSpecies: true }),
      t(5219683, 'Fox squirrel', 'Sciurus niger', 'mammal', ['forest', 'park', 'urban']),
      t(2480873, 'Snowy egret', 'Egretta thula', 'bird', ['wetland', 'coast', 'riverbank']),
      t(5229158, 'Brown pelican', 'Pelecanus occidentalis', 'bird', ['coast']),
      t(5231677, 'Northern mockingbird', 'Mimus polyglottos', 'bird', ['park', 'urban', 'field']),
      t(1900233, 'Zebra longwing', 'Heliconius charithonia', 'insect-arachnid', ['forest', 'park', 'urban']),
      t(5128007, 'White peacock', 'Anartia jatrophae', 'insect-arachnid', ['wetland', 'park', 'field']),
      t(4925538, 'Cabbage palm', 'Sabal palmetto', 'plant', ['forest', 'park', 'urban']),
      t(3086528, 'Red mangrove', 'Rhizophora mangle', 'plant', ['coast', 'wetland']),
      t(2888831, 'Sea grape', 'Coccoloba uvifera', 'plant', ['coast', 'park']),
      t(5203123, 'Atlantic tarpon', 'Megalops atlanticus', 'marine-fish', ['coast', 'riverbank']),
      t(2369643, 'Common snook', 'Centropomus undecimalis', 'marine-fish', ['coast', 'riverbank'])
    ]
  },
  {
    id: 'us-ca-urban-coast', label: 'California urban coast', countryCode: 'US',
    sourceId: 'california-cdfw-swap', bounds: { south: 32.3, west: -123.5, north: 38.8, east: -117.0 },
    taxa: [
      t(5219153, 'Coyote', 'Canis latrans', 'mammal', ['forest', 'field', 'park', 'urban'], { timeBands: ['dawn', 'dusk', 'night'] }),
      t(2438455, 'Dusky-footed woodrat', 'Neotoma fuscipes', 'mammal', ['forest', 'field'], { timeBands: ['dusk', 'night', 'dawn'] }),
      t(2476674, 'Anna’s hummingbird', 'Calypte anna', 'bird', ['park', 'urban', 'field']),
      t(2482414, 'California scrub-jay', 'Aphelocoma californica', 'bird', ['forest', 'park', 'urban']),
      t(8323485, 'House finch', 'Haemorhous mexicanus', 'bird', ['park', 'urban', 'field']),
      t(1937691, 'Western tiger swallowtail', 'Papilio rutulus', 'insect-arachnid', ['forest', 'park', 'riverbank']),
      t(1427950, 'Flame skimmer', 'Libellula saturata', 'insect-arachnid', ['wetland', 'fresh-water', 'park']),
      t(2880791, 'Coast live oak', 'Quercus agrifolia', 'plant', ['forest', 'park', 'urban']),
      t(2888380, 'California poppy', 'Eschscholzia californica', 'plant', ['field', 'park']),
      t(3129497, 'Coyote brush', 'Baccharis pilularis', 'plant', ['coast', 'field', 'park']),
      t(5204019, 'Rainbow trout', 'Oncorhynchus mykiss', 'freshwater-fish', ['fresh-water', 'stream'], { sensitiveSpecies: true }),
      t(2387731, 'Kelp bass', 'Paralabrax clathratus', 'marine-fish', ['coast'])
    ]
  },
  {
    id: 'us-wa-puget-sound', label: 'Seattle–Puget Sound', countryCode: 'US',
    sourceId: 'washington-wdfw-species', bounds: { south: 46.0, west: -124.5, north: 49.0, east: -120.0 },
    taxa: [
      t(2437281, 'Douglas squirrel', 'Tamiasciurus douglasii', 'mammal', ['forest', 'park', 'urban']),
      t(2433727, 'North American river otter', 'Lontra canadensis', 'mammal', ['riverbank', 'fresh-water', 'coast']),
      t(2487805, 'Black-capped chickadee', 'Poecile atricapillus', 'bird', ['forest', 'park', 'urban']),
      t(2484591, 'Golden-crowned kinglet', 'Regulus satrapa', 'bird', ['forest', 'park']),
      t(2495347, 'Mourning dove', 'Zenaida macroura', 'bird', ['field', 'park', 'urban']),
      t(1937751, 'Anise swallowtail', 'Papilio zelicaon', 'insect-arachnid', ['field', 'park', 'urban']),
      t(1340436, 'Yellow-faced bumble bee', 'Bombus vosnesenskii', 'insect-arachnid', ['field', 'park', 'forest']),
      t(2685796, 'Douglas-fir', 'Pseudotsuga menziesii', 'plant', ['forest', 'park', 'urban']),
      t(2684171, 'Western red cedar', 'Thuja plicata', 'plant', ['forest', 'park', 'wetland']),
      t(2882758, 'Salal', 'Gaultheria shallon', 'plant', ['forest', 'coast']),
      t(5204034, 'Coho salmon', 'Oncorhynchus kisutch', 'freshwater-fish', ['fresh-water', 'stream', 'riverbank'], { sensitiveSpecies: true }),
      t(2335455, 'Copper rockfish', 'Sebastes caurinus', 'marine-fish', ['coast'])
    ]
  },
  {
    id: 'us-nv-mojave-desert', label: 'Las Vegas–Mojave Desert', countryCode: 'US',
    sourceId: 'clark-county-desert-conservation', bounds: { south: 34.0, west: -117.0, north: 38.0, east: -113.0 },
    taxa: [
      t(2436801, 'Black-tailed jackrabbit', 'Lepus californicus', 'mammal', ['desert', 'field'], { timeBands: ['dawn', 'dusk', 'night'] }),
      t(2437570, 'White-tailed antelope squirrel', 'Ammospermophilus leucurus', 'mammal', ['desert', 'field']),
      t(2496459, 'Greater roadrunner', 'Geococcyx californianus', 'bird', ['desert', 'field', 'urban']),
      t(5228072, 'Gambel’s quail', 'Callipepla gambelii', 'bird', ['desert', 'field', 'park']),
      t(5231474, 'Cactus wren', 'Campylorhynchus brunneicapillus', 'bird', ['desert', 'field']),
      t(5714299, 'Queen butterfly', 'Danaus gilippus', 'insect-arachnid', ['desert', 'field', 'park']),
      t(1341976, 'Western honey bee', 'Apis mellifera', 'insect-arachnid', ['desert', 'field', 'park'], { establishment: 'introduced' }),
      t(7568403, 'Creosote bush', 'Larrea tridentata', 'plant', ['desert', 'field']),
      t(2775592, 'Joshua tree', 'Yucca brevifolia', 'plant', ['desert']),
      t(3118746, 'Brittlebush', 'Encelia farinosa', 'plant', ['desert', 'field']),
      t(4284433, 'Amargosa pupfish', 'Cyprinodon nevadensis', 'freshwater-fish', ['fresh-water', 'stream'], { sensitiveSpecies: true }),
      t(2360128, 'Roundtail chub', 'Gila robusta', 'freshwater-fish', ['fresh-water', 'stream'], { sensitiveSpecies: true })
    ]
  },
  {
    id: 'eu-atlantic-urban-nature', label: 'London–Paris–western European urban nature', countryCode: 'MULTI',
    sourceId: 'europe-eea-eunis', bounds: { south: 47.0, west: -2.0, north: 52.5, east: 8.5 },
    taxa: [
      t(5219616, 'European hedgehog', 'Erinaceus europaeus', 'mammal', ['forest', 'park', 'urban'], { timeBands: ['dusk', 'night', 'dawn'] }),
      t(8211070, 'Red squirrel', 'Sciurus vulgaris', 'mammal', ['forest', 'park']),
      t(2492462, 'European robin', 'Erithacus rubecula', 'bird', ['forest', 'park', 'urban']),
      t(2487879, 'Eurasian blue tit', 'Cyanistes caeruleus', 'bird', ['forest', 'park', 'urban']),
      t(9797180, 'Grey heron', 'Ardea cinerea', 'bird', ['wetland', 'riverbank', 'fresh-water']),
      t(4535827, 'European peacock', 'Aglais io', 'insect-arachnid', ['forest', 'field', 'park']),
      t(1340503, 'Buff-tailed bumblebee', 'Bombus terrestris', 'insect-arachnid', ['field', 'park', 'urban']),
      t(2878688, 'English oak', 'Quercus robur', 'plant', ['forest', 'park', 'urban']),
      t(5331916, 'Silver birch', 'Betula pendula', 'plant', ['forest', 'park', 'urban']),
      t(9220780, 'Common hawthorn', 'Crataegus monogyna', 'plant', ['forest', 'field', 'park']),
      t(8215487, 'Brown trout', 'Salmo trutta', 'freshwater-fish', ['fresh-water', 'stream']),
      t(2394622, 'European seabass', 'Dicentrarchus labrax', 'marine-fish', ['coast', 'riverbank'])
    ]
  },
  {
    id: 'mc-ligurian-mediterranean', label: 'Monaco–Ligurian Mediterranean', countryCode: 'MC',
    sourceId: 'monaco-environment-biodiversity', bounds: { south: 42.8, west: 6.5, north: 44.5, east: 8.5 },
    taxa: [
      t(5218887, 'Beech marten', 'Martes foina', 'mammal', ['forest', 'park', 'urban'], { timeBands: ['dusk', 'night', 'dawn'] }),
      t(5218464, 'Kuhl’s pipistrelle', 'Pipistrellus kuhlii', 'mammal', ['urban', 'park', 'coast'], { timeBands: ['dusk', 'night'] }),
      t(9413670, 'Yellow-legged gull', 'Larus michahellis', 'bird', ['coast', 'urban']),
      t(5228695, 'Pallid swift', 'Apus pallidus', 'bird', ['coast', 'urban']),
      t(2490955, 'Blue rock thrush', 'Monticola solitarius', 'bird', ['coast', 'urban', 'outcrop']),
      t(8225376, 'Old World swallowtail', 'Papilio machaon', 'insect-arachnid', ['field', 'park', 'coast']),
      t(1898286, 'Red admiral', 'Vanessa atalanta', 'insect-arachnid', ['forest', 'field', 'park']),
      t(5415040, 'Olive', 'Olea europaea', 'plant', ['field', 'park', 'urban']),
      t(5285604, 'Aleppo pine', 'Pinus halepensis', 'plant', ['forest', 'park', 'coast']),
      t(3190583, 'Mastic tree', 'Pistacia lentiscus', 'plant', ['forest', 'coast', 'field']),
      t(5210968, 'White seabream', 'Diplodus sargus', 'marine-fish', ['coast']),
      t(2392628, 'Salema', 'Sarpa salpa', 'marine-fish', ['coast'])
    ]
  },
  {
    id: 'jp-kanto-urban-nature', label: 'Tokyo–Kanto', countryCode: 'JP',
    sourceId: 'japan-moe-biodiversity', bounds: { south: 34.8, west: 138.5, north: 36.5, east: 141.0 },
    taxa: [
      t(2434552, 'Raccoon dog', 'Nyctereutes procyonoides', 'mammal', ['forest', 'park', 'urban'], { timeBands: ['dusk', 'night', 'dawn'] }),
      t(5219673, 'Japanese squirrel', 'Sciurus lis', 'mammal', ['forest', 'park']),
      t(7342055, 'Brown-eared bulbul', 'Hypsipetes amaurotis', 'bird', ['forest', 'park', 'urban']),
      t(9300456, 'Warbling white-eye', 'Zosterops japonicus', 'bird', ['forest', 'park', 'urban']),
      t(2498061, 'Eastern spot-billed duck', 'Anas zonorhyncha', 'bird', ['wetland', 'riverbank', 'fresh-water', 'park']),
      t(1937819, 'Asian swallowtail', 'Papilio xuthus', 'insect-arachnid', ['forest', 'field', 'park', 'urban']),
      t(1428595, 'White-tailed skimmer', 'Orthetrum albistylum', 'insect-arachnid', ['wetland', 'fresh-water', 'park']),
      t(2687885, 'Ginkgo', 'Ginkgo biloba', 'plant', ['park', 'urban']),
      t(3020620, 'Japanese mountain cherry', 'Prunus jamasakura', 'plant', ['forest', 'park']),
      t(2984532, 'Japanese zelkova', 'Zelkova serrata', 'plant', ['forest', 'park', 'urban']),
      t(4283980, 'Ayu', 'Plecoglossus altivelis', 'freshwater-fish', ['fresh-water', 'stream', 'riverbank']),
      t(2392025, 'Japanese seabass', 'Lateolabrax japonicus', 'marine-fish', ['coast', 'riverbank'])
    ]
  },
  {
    id: 'ae-dubai-desert-gulf', label: 'Dubai desert, wetlands, and Arabian Gulf', countryCode: 'AE',
    sourceId: 'dubai-protected-areas', bounds: { south: 24.0, west: 54.0, north: 26.5, east: 56.5 },
    insectMonths: ALL_MONTHS,
    taxa: [
      t(5220158, 'Arabian gazelle', 'Gazella arabica', 'mammal', ['desert', 'field'], { sensitiveSpecies: true }),
      t(5219297, 'Rüppell’s fox', 'Vulpes rueppellii', 'mammal', ['desert', 'field'], { timeBands: ['dusk', 'night', 'dawn'] }),
      t(4352332, 'Greater flamingo', 'Phoenicopterus roseus', 'bird', ['wetland', 'coast']),
      t(2486132, 'White-eared bulbul', 'Pycnonotus leucotis', 'bird', ['park', 'urban', 'field']),
      t(2475410, 'Green bee-eater', 'Merops orientalis', 'bird', ['desert', 'field', 'park']),
      t(7642610, 'Plain tiger', 'Danaus chrysippus', 'insect-arachnid', ['desert', 'field', 'park']),
      t(5791733, 'Vagrant emperor', 'Anax ephippiger', 'insect-arachnid', ['wetland', 'fresh-water', 'park']),
      t(5358521, 'Ghaf', 'Prosopis cineraria', 'plant', ['desert', 'field', 'park']),
      t(2925403, 'Grey mangrove', 'Avicennia marina', 'plant', ['coast', 'wetland']),
      t(8228089, 'Christ’s thorn jujube', 'Ziziphus spina-christi', 'plant', ['field', 'park', 'urban']),
      t(2392311, 'Twobar seabream', 'Acanthopagrus bifasciatus', 'marine-fish', ['coast']),
      t(2390233, 'White-spotted spinefoot', 'Siganus canaliculatus', 'marine-fish', ['coast'])
    ]
  }
];

function activitiesForGroup(group) {
  if (group === 'insect-arachnid') return ['nature-observe', 'photograph', 'insect-macro', 'community-survey'];
  if (group === 'plant') return ['nature-observe', 'photograph', 'habitat-survey', 'community-survey'];
  if (group.endsWith('-fish')) return ['sonar-survey'];
  return ['nature-observe', 'photograph', 'wildlife-track', 'community-survey'];
}

function createRegionalTaxon(input, definition) {
  const source = ALL_REGIONAL_SOURCE_MANIFEST[definition.sourceId];
  const sensitiveSpecies = input.sensitiveSpecies === true;
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
    activeMonths: input.activeMonths || (input.group === 'insect-arachnid' ? definition.insectMonths || NORTHERN_INSECT_MONTHS : ALL_MONTHS),
    timeBands: input.timeBands || (input.group === 'insect-arachnid' || input.group === 'plant' ? ['day'] : ['day', 'dawn', 'dusk']),
    activityIds: activitiesForGroup(input.group),
    establishment: input.establishment || 'regional-status-reviewed',
    regionalEvidenceClass: 'habitat-plausible',
    livePresenceClaimAllowed: false,
    sensitiveSpecies,
    sensitiveLocationPolicy: sensitiveSpecies ? 'generalize-20km-suppress-nest-roost' : 'generalize-pack-cell',
    presentation: {
      tier: 'reference-fallback', assetStatus: 'no-media-bundled',
      anatomyScaleReview: 'pending-domain-asset-review', behaviorAnimationReview: 'pending-domain-asset-review',
      lodPolicy: 'catalog-card-only-until-vetted-asset', mobileBudget: { drawCalls: 0, textureBytes: 0, geometryBytes: 0 },
      rightsStatus: 'no-media-bundled', attributionStatus: 'taxonomy-and-regional-sources-retained'
    },
    sourceRefs: [
      {
        providerId: 'gbif-backbone-2023', recordId: `gbif-taxon:${input.gbifTaxonKey}`,
        datasetId: ECOLOGY_SOURCE_MANIFEST['gbif-backbone-2023'].datasetId, license: 'CC-BY-4.0',
        attribution: ECOLOGY_SOURCE_MANIFEST['gbif-backbone-2023'].attribution, retrievedAt: '2026-08-27'
      },
      {
        providerId: definition.sourceId, recordId: `regional-review:${input.scientificName}`,
        datasetId: source.datasetId, license: source.license, attribution: source.attribution, retrievedAt: '2026-08-27'
      }
    ]
  };
}

function createRegionalPack(definition) {
  const taxa = definition.taxa.map((entry) => createRegionalTaxon(entry, definition));
  return deepFreeze({
    type: 'RegionalEcologyPack', schemaVersion: REGIONAL_ECOLOGY_SCHEMA_VERSION,
    id: definition.id, version: PACK_RELEASE_VERSION, status: 'source-reviewed-domain-review-pending',
    region: {
      label: definition.label, countryCode: definition.countryCode, bounds: definition.bounds,
      spatialPrecision: 'regional-pack-only-no-occurrence-points'
    },
    taxonomy: {
      providerId: 'gbif-backbone-2023', version: '2023-08-28-compatibility',
      migrationNote: 'Stable internal IDs retain pinned GBIF keys; synonyms never rewrite historical records.'
    },
    localization: { defaultLocale: 'en-US', seedLocales: ['en-US'], scientificNameFallback: true },
    sources: ALL_REGIONAL_SOURCE_MANIFEST,
    taxa,
    truthPolicy: {
      encounterTruthClass: 'virtual-field-opportunity', regionalEvidenceClass: 'habitat-plausible',
      livePresenceLanguageAllowed: false, occurrenceRecordsIncluded: false, abundanceModelIncluded: false,
      osmSpeciesInferenceAllowed: false
    },
    sensitiveSpeciesPolicy: {
      defaultPrecision: 'pack-region', sensitivePrecision: '20km-or-coarser',
      suppressNestsRoostsDens: true, suppressRecentOccurrenceTime: true
    },
    contentRelease: {
      releaseId: `${definition.id}@${PACK_RELEASE_VERSION}`, compatibleClient: '>=5.1.0',
      migration: { fromVersions: [], stableIdPolicy: 'preserve-historical-records' },
      rollback: { previousVersion: null, action: 'disable-pack-and-use-global-field-guide' },
      emergencyDisableSupported: true
    },
    creatureQuality: {
      gateSchemaVersion: 1, currentTier: 'reference-fallback',
      promotionPolicy: 'per-taxon-gated-no-pack-wide-implicit-promotion', rollbackTier: 'reference-fallback'
    },
    reviewEvidence: {
      taxonomyKeysCheckedAt: '2026-08-27', taxonomyMatchPolicy: 'accepted-species-exact-match',
      regionalSourcesReviewedAt: '2026-08-27', domainExpertReview: 'pending', mediaReview: 'no-media-bundled',
      knownLimitations: [
        'This is a regional field-guide slice, not a complete checklist.',
        'No occurrence points or abundance model are included; field leads remain game opportunities.',
        'Taxa remain reference-fallback quality until anatomy, behavior, LOD, rights, and mobile asset review passes.'
      ]
    }
  });
}

const EXPANSION_ECOLOGY_PACKS = deepFreeze(PACK_DEFINITIONS.map(createRegionalPack));
const REGIONAL_ECOLOGY_PACKS = deepFreeze([BALTIMORE_ECOLOGY_PACK, ...EXPANSION_ECOLOGY_PACKS]);

function discoveriesForPack(pack) {
  return pack.taxa.map((entry) => ({
    id: entry.id,
    regionalPackId: pack.id,
    regionalPackVersion: pack.version,
    names: { common: entry.localizedNames['en-US'], scientific: entry.acceptedScientificName },
    family: `${entry.group}-taxon`, activityIds: entry.activityIds, contexts: entry.habitats,
    rarityBand: entry.sensitiveSpecies ? 'uncommon' : 'common',
    regionalReviewBand: entry.sensitiveSpecies ? 'sensitive-generalized' : 'regional',
    qualityBand: entry.presentation.tier, tradePolicy: 'not-tradeable',
    description: `${entry.localizedNames['en-US']} is a habitat-plausible ${pack.region.label} field-guide taxon. Field leads are game opportunities and do not claim a real organism is present at this location.`,
    evidenceClass: entry.regionalEvidenceClass, sensitiveLocationPolicy: entry.sensitiveLocationPolicy,
    activeMonths: entry.activeMonths, timeBands: entry.timeBands, gbifTaxonKey: entry.gbifTaxonKey,
    stableTaxonId: entry.stableTaxonId, presentation: entry.presentation, sourceRefs: entry.sourceRefs
  }));
}

const REGIONAL_TAXON_DISCOVERIES = deepFreeze([
  ...BALTIMORE_TAXON_DISCOVERIES,
  ...EXPANSION_ECOLOGY_PACKS.flatMap(discoveriesForPack)
]);

function inPackBounds(location = {}, pack) {
  const latitude = Number(location.lat);
  const longitude = Number(location.lon);
  const bounds = pack?.region?.bounds;
  return Boolean(bounds) && Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude >= bounds.south && latitude <= bounds.north &&
    longitude >= bounds.west && longitude <= bounds.east;
}

function resolveRegionalEcologyPack(location = {}) {
  return REGIONAL_ECOLOGY_PACKS.find((pack) => inPackBounds(location, pack)) || null;
}

function validateRegionalEcologyPackCollection(packs = REGIONAL_ECOLOGY_PACKS) {
  const errors = [];
  const packIds = new Set();
  const taxonIds = new Set();
  for (const pack of packs) {
    if (pack?.type !== 'RegionalEcologyPack') errors.push('invalid pack type');
    if (pack?.schemaVersion !== REGIONAL_ECOLOGY_SCHEMA_VERSION) errors.push(`${pack?.id || 'unknown'}: unsupported schema`);
    if (!pack?.id || packIds.has(pack.id)) errors.push(`${pack?.id || 'unknown'}: duplicate or missing pack id`);
    packIds.add(pack?.id);
    if (!pack?.contentRelease?.rollback?.action) errors.push(`${pack?.id}: missing rollback`);
    if (pack?.truthPolicy?.livePresenceLanguageAllowed !== false) errors.push(`${pack?.id}: live-presence language must be disabled`);
    if (pack?.truthPolicy?.occurrenceRecordsIncluded !== false) errors.push(`${pack?.id}: occurrence records must be excluded`);
    if (pack?.truthPolicy?.osmSpeciesInferenceAllowed !== false) errors.push(`${pack?.id}: OSM species inference must be disabled`);
    if ((pack?.taxa?.length || 0) < 12) errors.push(`${pack?.id}: expected at least 12 reviewed taxa`);
    const groups = new Set(pack?.taxa?.map((entry) => entry.group));
    for (const required of ['mammal', 'bird', 'insect-arachnid', 'plant']) {
      if (!groups.has(required)) errors.push(`${pack?.id}: missing ${required}`);
    }
    for (const entry of pack?.taxa || []) {
      if (taxonIds.has(entry.id)) errors.push(`${entry.id}: repeated across packs; shared-membership migration required`);
      taxonIds.add(entry.id);
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
  }
  return deepFreeze({
    ok: errors.length === 0, errors, packCount: packs.length,
    taxonCount: packs.reduce((sum, pack) => sum + (pack?.taxa?.length || 0), 0)
  });
}

export {
  ALL_REGIONAL_SOURCE_MANIFEST,
  EXPANSION_ECOLOGY_PACKS,
  PACK_RELEASE_VERSION,
  REGIONAL_ECOLOGY_PACKS,
  REGIONAL_REFERENCE_SOURCES,
  REGIONAL_TAXON_DISCOVERIES,
  inPackBounds,
  resolveRegionalEcologyPack,
  selectRegionalTaxa,
  validateRegionalEcologyPackCollection
};
