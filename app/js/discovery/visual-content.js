const VISUAL_CONTENT_VERSION = '2026.08.17.1';

const REFERENCE_VISUALS = Object.freeze({
  dandelion: Object.freeze({
    id: 'dandelion', image: 'assets/discovery/reference/dandelion.jpg',
    title: 'Common dandelion', scientificName: 'Taraxacum officinale',
    alt: 'Yellow dandelion flower photographed outdoors', author: 'LorelMan', license: 'CC0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Dandelion_flower_photo.jpg'
  }),
  'rock-pigeon': Object.freeze({
    id: 'rock-pigeon', image: 'assets/discovery/reference/rock-pigeon-usfws.jpg',
    title: 'Rock pigeon', scientificName: 'Columba livia',
    alt: 'Rock pigeons perched against a clear blue sky', author: 'Lee Karney / U.S. Fish and Wildlife Service', license: 'Public domain',
    sourceUrl: 'https://www.fws.gov/media/rock-pigeon'
  }),
  mallard: Object.freeze({
    id: 'mallard', image: 'assets/discovery/reference/mallard.jpg',
    title: 'Mallard', scientificName: 'Anas platyrhynchos',
    alt: 'Mallard duck resting beside water', author: 'Versions111', license: 'CC BY 4.0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:A_Mallard_duck.jpg'
  }),
  'white-tailed-deer': Object.freeze({
    id: 'white-tailed-deer', image: 'assets/discovery/reference/white-tailed-deer.jpg',
    title: 'White-tailed deer', scientificName: 'Odocoileus virginianus',
    alt: 'White-tailed deer standing in grass', author: 'Steve Hillebrand, U.S. Fish and Wildlife Service', license: 'Public domain',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:White_tailed_deer.jpg'
  }),
  'red-fox': Object.freeze({
    id: 'red-fox', image: 'assets/discovery/reference/red-fox.jpg',
    title: 'Red fox', scientificName: 'Vulpes vulpes',
    alt: 'Red fox looking across grass in warm evening light', author: 'Ray Hennessy', license: 'CC0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Red_fox_gazing_in_the_direction_of_the_setting_sun.jpg'
  }),
  quartz: Object.freeze({
    id: 'quartz', image: 'assets/discovery/reference/quartz-crystal.jpg',
    title: 'Quartz crystal', scientificName: 'SiO₂',
    alt: 'Clear quartz crystal specimen', author: 'U.S. Geological Survey', license: 'Public domain',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Quartz_Crystal.jpg'
  }),
  granite: Object.freeze({
    id: 'granite', image: 'assets/discovery/reference/granite-outcrop.jpg',
    title: 'Granite outcrop', scientificName: 'Coarse-grained intrusive igneous rock',
    alt: 'Granite cliff showing large feldspar crystals', author: 'W.carter', license: 'CC0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Granite_cliff_with_feldspar_crystals_in_Loddebo_2.jpg'
  }),
  'fossil-shells': Object.freeze({
    id: 'fossil-shells', image: 'assets/discovery/reference/fossil-shells.jpg',
    title: 'Fossil shell reference', scientificName: 'Molluscan fossil material',
    alt: 'Museum exhibit of fossil shells', author: 'Invertzoo', license: 'CC BY-SA 4.0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:BMNSM_fossil_shell_exhibit.JPG'
  }),
  'trail-hound': Object.freeze({
    id: 'trail-hound', image: 'assets/discovery/reference/trail-hound.jpg',
    title: 'Domestic dog reference', scientificName: 'Canis lupus familiaris',
    alt: 'Portrait of a Labrador retriever outdoors', author: 'Dktue', license: 'CC0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Portrait_of_a_labrador_retriever.jpg'
  }),
  'harbor-cat': Object.freeze({
    id: 'harbor-cat', image: 'assets/discovery/reference/harbor-cat.jpg',
    title: 'Domestic cat reference', scientificName: 'Felis catus',
    alt: 'Close portrait of a domestic cat', author: 'Anton Petrov', license: 'CC0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Cat_portrait_(Unsplash).jpg'
  })
});

const DISCOVERY_VISUAL_BY_CATALOG_ID = Object.freeze({
  'granite-field-sample': 'granite',
  'quartz-vein-sample': 'quartz',
  'shell-impression-cast': 'fossil-shells',
  'woodland-track-clue': 'white-tailed-deer',
  'wetland-waterbird-clue': 'mallard',
  'urban-nature-photo': 'rock-pigeon',
  'common-plant-record': 'dandelion',
  'edible-plant-record': 'dandelion',
  'woodland-fox': 'red-fox',
  'harbor-cat': 'harbor-cat',
  'meadow-tabby': 'harbor-cat',
  'midnight-cat': 'harbor-cat',
  'trail-hound': 'trail-hound',
  'field-retriever': 'trail-hound',
  'park-terrier': 'trail-hound',
  'marsh-mallard': 'mallard',
  'city-pigeon': 'rock-pigeon'
});

function visualForCatalogId(catalogId) {
  const key = DISCOVERY_VISUAL_BY_CATALOG_ID[String(catalogId || '')];
  return key ? REFERENCE_VISUALS[key] || null : null;
}

export { DISCOVERY_VISUAL_BY_CATALOG_ID, REFERENCE_VISUALS, VISUAL_CONTENT_VERSION, visualForCatalogId };
