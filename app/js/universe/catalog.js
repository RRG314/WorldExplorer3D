const PC_TO_LY = 3.26156;

const SOURCES = Object.freeze({
  gaia: Object.freeze({
    id: 'esa-gaia-dr3',
    label: 'ESA Gaia DR3 / Gaia Catalogue of Nearby Stars',
    url: 'https://gea.esac.esa.int/archive/',
    epoch: 'J2016.0'
  }),
  exoplanets: Object.freeze({
    id: 'nasa-exoplanet-archive-pscomppars',
    label: 'NASA Exoplanet Archive PSCompPars',
    url: 'https://exoplanetarchive.ipac.caltech.edu/',
    retrieved: '2026-07-14'
  }),
  nasaBlackHoles: Object.freeze({
    id: 'nasa-black-hole-catalog-context',
    label: 'NASA Black Hole Science',
    url: 'https://science.nasa.gov/universe/black-holes/'
  }),
  eht: Object.freeze({
    id: 'event-horizon-telescope',
    label: 'Event Horizon Telescope',
    url: 'https://eventhorizontelescope.org/'
  }),
  ned: Object.freeze({
    id: 'nasa-ipac-ned',
    label: 'NASA/IPAC Extragalactic Database',
    url: 'https://ned.ipac.caltech.edu/'
  }),
  nasaOrion: Object.freeze({
    id: 'esa-nasa-hubble-orion-mosaic',
    label: 'ESA / NASA Hubble Orion mosaic',
    url: 'https://sci.esa.int/web/hubble/-/38599-hubble-s-sharpest-view-of-the-orion-nebula'
  }),
  nasaCarina: Object.freeze({
    id: 'nasa-hubble-carina-dss',
    label: 'NASA Hubble / Digitized Sky Survey Carina image',
    url: 'https://science.nasa.gov/asset/hubble/dss-image-of-the-carina-nebula/'
  }),
  nasaCrab: Object.freeze({
    id: 'nasa-hubble-crab-nebula',
    label: 'NASA Hubble Crab Nebula image',
    url: 'https://science.nasa.gov/asset/hubble/scale-and-compass-for-crab-nebula/'
  }),
  nasaAndromeda: Object.freeze({
    id: 'nasa-galex-spitzer-andromeda',
    label: 'NASA GALEX / Spitzer Andromeda composite',
    url: 'https://science.nasa.gov/photojournal/amazing-andromeda-galaxy/'
  }),
  nasaMilkyWay: Object.freeze({
    id: 'nasa-spitzer-milky-way-plane',
    label: 'NASA Spitzer Galactic Legacy Infrared Mid-Plane Survey Extraordinaire',
    url: 'https://science.nasa.gov/photojournal/a-glimpse-of-the-milky-way/'
  })
});

function freezeChildren(children = []) {
  return Object.freeze(children.map((child) => Object.freeze({ ...child })));
}

function defaultGeneratedFlags(definition) {
  if (definition.id === 'sol') return [];
  if (definition.objectClass === 'planetary_system') return ['display-scale', 'planet-appearance'];
  if (definition.objectClass === 'galaxy') return ['resolved-star-field', 'display-scaled-rotation'];
  if (definition.objectClass === 'galaxy_cluster') return ['unresolved-member-field', 'display-scale'];
  if (definition.objectClass === 'black_hole') return ['real-time-lensing-approximation', 'display-scale'];
  return [];
}

function entity(definition) {
  const generatedFlags = new Set([
    ...defaultGeneratedFlags(definition),
    ...(definition.generatedFlags || [])
  ]);
  return Object.freeze({
    ...definition,
    aliases: Object.freeze(definition.aliases || []),
    children: freezeChildren(definition.children),
    generatedFlags: Object.freeze([...generatedFlags]),
    uncertainty: Object.freeze(definition.uncertainty || {}),
    provenance: Object.freeze(definition.provenance || [])
  });
}

const CATALOG = [
  entity({
    id: 'universe',
    name: 'Observable Universe',
    objectClass: 'universe',
    parentId: null,
    address: 'universe',
    accuracy: 'observed panorama / model-derived exterior',
    visualProfile: { kind: 'cosmic-web', seed: 1447 },
    provenance: [SOURCES.ned]
  }),
  entity({
    id: 'local-group',
    name: 'Local Group',
    objectClass: 'galaxy_group',
    parentId: 'universe',
    address: 'universe/local-group',
    accuracy: 'catalog-derived',
    canonicalPosition: { frame: 'supergalactic', xMpc: 0, yMpc: 0, zMpc: 0 },
    physical: { radiusLy: 5000000 },
    visualProfile: { kind: 'galaxy-group', seed: 31031 },
    provenance: [SOURCES.ned]
  }),
  entity({
    id: 'milky-way',
    name: 'Milky Way',
    objectClass: 'galaxy',
    parentId: 'local-group',
    address: 'universe/local-group/milky-way',
    accuracy: 'model-derived',
    canonicalPosition: { frame: 'galactocentric', xLy: 0, yLy: 0, zLy: 0 },
    physical: { radiusLy: 50000, thicknessLy: 1000 },
    visualProfile: {
      kind: 'barred-spiral',
      arms: 4,
      seed: 271828,
      image: 'assets/textures/universe/milky-way-spitzer.jpg',
      imageAspect: 4.511,
      imageCredit: 'NASA/JPL-Caltech/University of Wisconsin',
      imageSourceUrl: SOURCES.nasaMilkyWay.url,
      imageRole: 'inside-galaxy-observed-plane'
    },
    generatedFlags: ['exterior-spiral-structure', 'display-scaled-rotation'],
    provenance: [SOURCES.gaia, SOURCES.nasaMilkyWay]
  }),
  entity({
    id: 'sol',
    name: 'Solar System',
    objectClass: 'planetary_system',
    parentId: 'milky-way',
    address: 'universe/local-group/milky-way/sol',
    accuracy: 'observed',
    canonicalPosition: { frame: 'galactocentric', radiusLy: 26670, zLy: 65 },
    physical: { hostMassSolar: 1, hostTemperatureK: 5772 },
    visualProfile: { kind: 'g-star', color: 0xfff2c2 },
    provenance: [SOURCES.gaia]
  }),
  entity({
    id: 'proxima-centauri',
    name: 'Proxima Centauri',
    objectClass: 'planetary_system',
    parentId: 'milky-way',
    address: 'universe/local-group/milky-way/proxima-centauri',
    aliases: ['Proxima Cen', 'Alpha Centauri C'],
    accuracy: 'catalog-derived',
    canonicalPosition: { frame: 'ICRS', raDeg: 217.3934657, decDeg: -62.6761821, distancePc: 1.30119, epoch: 'J2000' },
    physical: { hostMassSolar: 0.1221, hostTemperatureK: 2900 },
    visualProfile: { kind: 'red-dwarf', color: 0xff8c62, seed: 11037 },
    children: [
      { id: 'proxima-centauri-b', name: 'Proxima Centauri b', objectClass: 'exoplanet', radiusEarth: 1.02, massEarth: 1.055, orbitDays: 11.18465, semiMajorAxisAu: 0.04848, accuracy: 'catalog-derived' },
      { id: 'proxima-centauri-d', name: 'Proxima Centauri d', objectClass: 'exoplanet', radiusEarth: 0.692, massEarth: 0.26, orbitDays: 5.12338, semiMajorAxisAu: 0.02881, accuracy: 'catalog-derived' }
    ],
    provenance: [SOURCES.exoplanets, SOURCES.gaia]
  }),
  entity({
    id: 'tau-ceti',
    name: 'Tau Ceti',
    objectClass: 'planetary_system',
    parentId: 'milky-way',
    address: 'universe/local-group/milky-way/tau-ceti',
    aliases: ['tau Cet'],
    accuracy: 'catalog-derived',
    canonicalPosition: { frame: 'ICRS', raDeg: 26.0093029, decDeg: -15.9337987, distancePc: 3.60304, epoch: 'J2000' },
    physical: { hostMassSolar: 0.783, hostTemperatureK: 5310 },
    visualProfile: { kind: 'g-star', color: 0xffe2ad, seed: 20517 },
    children: [
      { id: 'tau-ceti-g', name: 'Tau Ceti g', objectClass: 'exoplanet', radiusEarth: 1.18, massEarth: 1.75, orbitDays: 20, semiMajorAxisAu: 0.133, accuracy: 'catalog-derived' },
      { id: 'tau-ceti-h', name: 'Tau Ceti h', objectClass: 'exoplanet', radiusEarth: 1.19, massEarth: 1.83, orbitDays: 49.41, semiMajorAxisAu: 0.243, accuracy: 'catalog-derived' },
      { id: 'tau-ceti-f', name: 'Tau Ceti f', objectClass: 'exoplanet', radiusEarth: 1.81, massEarth: 3.93, orbitDays: 636.13, semiMajorAxisAu: 1.334, accuracy: 'catalog-derived' }
    ],
    provenance: [SOURCES.exoplanets, SOURCES.gaia]
  }),
  entity({
    id: 'trappist-1',
    name: 'TRAPPIST-1',
    objectClass: 'planetary_system',
    parentId: 'milky-way',
    address: 'universe/local-group/milky-way/trappist-1',
    accuracy: 'catalog-derived',
    canonicalPosition: { frame: 'ICRS', raDeg: 346.6263919, decDeg: -5.0434618, distancePc: 12.42988881, epoch: 'J2000' },
    physical: { hostMassSolar: 0.0898, hostTemperatureK: 2566 },
    visualProfile: { kind: 'ultracool-red-dwarf', color: 0xff724f, seed: 70917 },
    children: [
      { id: 'trappist-1-b', name: 'TRAPPIST-1 b', objectClass: 'exoplanet', radiusEarth: 1.116, massEarth: 1.374, orbitDays: 1.510826, semiMajorAxisAu: 0.01154, accuracy: 'catalog-derived' },
      { id: 'trappist-1-c', name: 'TRAPPIST-1 c', objectClass: 'exoplanet', radiusEarth: 1.097, massEarth: 1.308, orbitDays: 2.421937, semiMajorAxisAu: 0.0158, accuracy: 'catalog-derived' },
      { id: 'trappist-1-d', name: 'TRAPPIST-1 d', objectClass: 'exoplanet', radiusEarth: 0.788, massEarth: 0.388, orbitDays: 4.049219, semiMajorAxisAu: 0.02227, accuracy: 'catalog-derived' },
      { id: 'trappist-1-e', name: 'TRAPPIST-1 e', objectClass: 'exoplanet', radiusEarth: 0.92, massEarth: 0.692, orbitDays: 6.101013, semiMajorAxisAu: 0.02925, accuracy: 'catalog-derived' },
      { id: 'trappist-1-f', name: 'TRAPPIST-1 f', objectClass: 'exoplanet', radiusEarth: 1.045, massEarth: 1.039, orbitDays: 9.20754, semiMajorAxisAu: 0.03849, accuracy: 'catalog-derived' },
      { id: 'trappist-1-g', name: 'TRAPPIST-1 g', objectClass: 'exoplanet', radiusEarth: 1.129, massEarth: 1.321, orbitDays: 12.352446, semiMajorAxisAu: 0.04683, accuracy: 'catalog-derived' },
      { id: 'trappist-1-h', name: 'TRAPPIST-1 h', objectClass: 'exoplanet', radiusEarth: 0.755, massEarth: 0.326, orbitDays: 18.772866, semiMajorAxisAu: 0.06189, accuracy: 'catalog-derived' }
    ],
    provenance: [SOURCES.exoplanets, SOURCES.gaia]
  }),
  entity({
    id: 'kepler-186',
    name: 'Kepler-186',
    objectClass: 'planetary_system',
    parentId: 'milky-way',
    address: 'universe/local-group/milky-way/kepler-186',
    accuracy: 'catalog-derived',
    canonicalPosition: { frame: 'ICRS', raDeg: 298.652736, decDeg: 43.9549884, distancePc: 177.594, epoch: 'J2000' },
    physical: { hostMassSolar: 0.544, hostTemperatureK: 3755 },
    visualProfile: { kind: 'red-dwarf', color: 0xff9d72, seed: 18605 },
    children: [
      { id: 'kepler-186-b', name: 'Kepler-186 b', objectClass: 'exoplanet', radiusEarth: 1.07, massEarth: 1.24, orbitDays: 3.88679, semiMajorAxisAu: 0.0343, accuracy: 'catalog-derived' },
      { id: 'kepler-186-c', name: 'Kepler-186 c', objectClass: 'exoplanet', radiusEarth: 1.25, massEarth: 2.1, orbitDays: 7.267302, semiMajorAxisAu: 0.0451, accuracy: 'catalog-derived' },
      { id: 'kepler-186-d', name: 'Kepler-186 d', objectClass: 'exoplanet', radiusEarth: 1.4, massEarth: 2.54, orbitDays: 13.342996, semiMajorAxisAu: 0.0781, accuracy: 'catalog-derived' },
      { id: 'kepler-186-e', name: 'Kepler-186 e', objectClass: 'exoplanet', radiusEarth: 1.27, massEarth: 2.15, orbitDays: 22.407704, semiMajorAxisAu: 0.11, accuracy: 'catalog-derived' },
      { id: 'kepler-186-f', name: 'Kepler-186 f', objectClass: 'exoplanet', radiusEarth: 1.17, massEarth: 1.71, orbitDays: 129.9441, semiMajorAxisAu: 0.432, accuracy: 'catalog-derived' }
    ],
    provenance: [SOURCES.exoplanets, SOURCES.gaia]
  }),
  entity({
    id: '55-cancri',
    name: '55 Cancri',
    objectClass: 'planetary_system',
    parentId: 'milky-way',
    address: 'universe/local-group/milky-way/55-cancri',
    aliases: ['55 Cnc', 'Copernicus'],
    accuracy: 'catalog-derived',
    canonicalPosition: { frame: 'ICRS', raDeg: 133.1468373, decDeg: 28.3298154, distancePc: 12.5855, epoch: 'J2000' },
    physical: { hostMassSolar: 1.015, hostTemperatureK: 5198 },
    visualProfile: { kind: 'g-star', color: 0xffdfac, seed: 55005 },
    children: [
      { id: '55-cancri-e', name: '55 Cancri e', objectClass: 'exoplanet', radiusEarth: 1.875, massEarth: 7.99, orbitDays: 0.7365474, semiMajorAxisAu: 0.01544, accuracy: 'catalog-derived' },
      { id: '55-cancri-b', name: '55 Cancri b', objectClass: 'exoplanet', radiusEarth: 13.9, massEarth: 263.9785, orbitDays: 14.651552, semiMajorAxisAu: 0.118, accuracy: 'catalog-derived' },
      { id: '55-cancri-c', name: '55 Cancri c', objectClass: 'exoplanet', radiusEarth: 8.51, massEarth: 54.4738, orbitDays: 44.3936, semiMajorAxisAu: 0.247, accuracy: 'catalog-derived' },
      { id: '55-cancri-f', name: '55 Cancri f', objectClass: 'exoplanet', radiusEarth: 7.59, massEarth: 44.812, orbitDays: 260.58, semiMajorAxisAu: 0.802, accuracy: 'catalog-derived' },
      { id: '55-cancri-d', name: '55 Cancri d', objectClass: 'exoplanet', radiusEarth: 13, massEarth: 1232.493, orbitDays: 4799, semiMajorAxisAu: 5.6, accuracy: 'catalog-derived' }
    ],
    provenance: [SOURCES.exoplanets, SOURCES.gaia]
  }),
  entity({
    id: 'hd-219134',
    name: 'HD 219134',
    objectClass: 'planetary_system',
    parentId: 'milky-way',
    address: 'universe/local-group/milky-way/hd-219134',
    accuracy: 'catalog-derived',
    canonicalPosition: { frame: 'ICRS', raDeg: 348.3372026, decDeg: 57.1696255, distancePc: 6.53127, epoch: 'J2000' },
    physical: { hostMassSolar: 0.81, hostTemperatureK: 4699 },
    visualProfile: { kind: 'k-star', color: 0xffc286, seed: 219134 },
    children: [
      { id: 'hd-219134-b', name: 'HD 219134 b', objectClass: 'exoplanet', radiusEarth: 1.602, massEarth: 4.74, orbitDays: 3.092926, semiMajorAxisAu: 0.03876, accuracy: 'catalog-derived' },
      { id: 'hd-219134-c', name: 'HD 219134 c', objectClass: 'exoplanet', radiusEarth: 1.511, massEarth: 4.36, orbitDays: 6.76458, semiMajorAxisAu: 0.0653, accuracy: 'catalog-derived' },
      { id: 'hd-219134-f', name: 'HD 219134 f', objectClass: 'exoplanet', radiusEarth: 1.31, massEarth: 7.3, orbitDays: 22.717, semiMajorAxisAu: 0.1463, accuracy: 'catalog-derived' },
      { id: 'hd-219134-d', name: 'HD 219134 d', objectClass: 'exoplanet', radiusEarth: 1.61, massEarth: 16.17, orbitDays: 46.859, semiMajorAxisAu: 0.237, accuracy: 'catalog-derived' },
      { id: 'hd-219134-g', name: 'HD 219134 g', objectClass: 'exoplanet', radiusEarth: 3.28, massEarth: 10.80622, orbitDays: 94.2, semiMajorAxisAu: 0.3753, accuracy: 'catalog-derived' },
      { id: 'hd-219134-h', name: 'HD 219134 h', objectClass: 'exoplanet', radiusEarth: 12.7, massEarth: 108.0622, orbitDays: 2247, semiMajorAxisAu: 3.11, accuracy: 'catalog-derived' }
    ],
    provenance: [SOURCES.exoplanets, SOURCES.gaia]
  }),
  entity({
    id: 'lhs-1140',
    name: 'LHS 1140',
    objectClass: 'planetary_system',
    parentId: 'milky-way',
    address: 'universe/local-group/milky-way/lhs-1140',
    accuracy: 'catalog-derived',
    canonicalPosition: { frame: 'ICRS', raDeg: 11.248632, decDeg: -15.2741085, distancePc: 14.9861, epoch: 'J2000' },
    physical: { hostMassSolar: 0.1844, hostTemperatureK: 3096 },
    visualProfile: { kind: 'red-dwarf', color: 0xff875f, seed: 1140 },
    children: [
      { id: 'lhs-1140-c', name: 'LHS 1140 c', objectClass: 'exoplanet', radiusEarth: 1.272, massEarth: 1.91, orbitDays: 3.77794, semiMajorAxisAu: 0.027, accuracy: 'catalog-derived' },
      { id: 'lhs-1140-b', name: 'LHS 1140 b', objectClass: 'exoplanet', radiusEarth: 1.73, massEarth: 5.6, orbitDays: 24.73723, semiMajorAxisAu: 0.0946, accuracy: 'catalog-derived' }
    ],
    provenance: [SOURCES.exoplanets, SOURCES.gaia]
  }),
  entity({
    id: 'toi-700',
    name: 'TOI-700',
    objectClass: 'planetary_system',
    parentId: 'milky-way',
    address: 'universe/local-group/milky-way/toi-700',
    accuracy: 'catalog-derived',
    canonicalPosition: { frame: 'ICRS', raDeg: 97.0957165, decDeg: -65.5786149, distancePc: 31.1265, epoch: 'J2000' },
    physical: { hostMassSolar: 0.415, hostTemperatureK: 3459 },
    visualProfile: { kind: 'red-dwarf', color: 0xff956b, seed: 70004 },
    children: [
      { id: 'toi-700-b', name: 'TOI-700 b', objectClass: 'exoplanet', radiusEarth: 0.914, massEarth: 0.704, orbitDays: 9.977219, semiMajorAxisAu: 0.0677, accuracy: 'catalog-derived' },
      { id: 'toi-700-c', name: 'TOI-700 c', objectClass: 'exoplanet', radiusEarth: 2.6, massEarth: 7.27, orbitDays: 16.051137, semiMajorAxisAu: 0.0929, accuracy: 'catalog-derived' },
      { id: 'toi-700-e', name: 'TOI-700 e', objectClass: 'exoplanet', radiusEarth: 0.953, massEarth: 0.818, orbitDays: 27.80978, semiMajorAxisAu: 0.134, accuracy: 'catalog-derived' },
      { id: 'toi-700-d', name: 'TOI-700 d', objectClass: 'exoplanet', radiusEarth: 1.073, massEarth: 1.25, orbitDays: 37.42396, semiMajorAxisAu: 0.1633, accuracy: 'catalog-derived' }
    ],
    provenance: [SOURCES.exoplanets, SOURCES.gaia]
  }),
  entity({
    id: 'sagittarius-a-star',
    name: 'Sagittarius A*',
    objectClass: 'black_hole',
    parentId: 'milky-way',
    address: 'universe/local-group/milky-way/sagittarius-a-star',
    aliases: ['Sgr A*'],
    accuracy: 'observed',
    canonicalPosition: { frame: 'ICRS', raDeg: 266.41683, decDeg: -29.00781, distanceLy: 26670, epoch: 'J2000' },
    physical: { massSolar: 4000000, schwarzschildRadiusKm: 11800000, spinEstimate: null },
    visualProfile: { kind: 'black-hole', diskInclinationDeg: 50, diskColor: 0xffb46b, seed: 4000000 },
    uncertainty: { mass: 'approximately 4 million solar masses' },
    provenance: [SOURCES.nasaBlackHoles, SOURCES.eht]
  }),
  entity({
    id: 'orion-nebula',
    name: 'Orion Nebula',
    objectClass: 'nebula',
    parentId: 'milky-way',
    address: 'universe/local-group/milky-way/orion-nebula',
    aliases: ['M42', 'NGC 1976'],
    accuracy: 'observed imagery / catalog-derived position',
    canonicalPosition: { frame: 'ICRS', raDeg: 83.8221, decDeg: -5.3911, distanceLy: 1344, epoch: 'J2000' },
    physical: { radiusLy: 12 },
    visualProfile: {
      kind: 'observational-nebula',
      image: 'assets/textures/universe/orion-nebula-nasa.jpg?v=2',
      imageAspect: 1,
      imageCredit: 'NASA, ESA, M. Robberto (STScI/ESA), Hubble Orion Treasury Project Team',
      seed: 1976,
      tint: 0x89a7ff,
      navigationRadiusScene: 9000
    },
    generatedFlags: ['image-derived-depth-model'],
    uncertainty: { distance: 'Published estimates vary by method and sub-region.' },
    provenance: [SOURCES.nasaOrion]
  }),
  entity({
    id: 'carina-nebula',
    name: 'Carina Nebula',
    objectClass: 'nebula',
    parentId: 'milky-way',
    address: 'universe/local-group/milky-way/carina-nebula',
    aliases: ['NGC 3372'],
    accuracy: 'observed imagery / catalog-derived position',
    canonicalPosition: { frame: 'ICRS', raDeg: 161.0792, decDeg: -59.8892, distanceLy: 7500, epoch: 'J2000' },
    physical: { radiusLy: 115 },
    visualProfile: {
      kind: 'observational-nebula',
      image: 'assets/textures/universe/carina-nebula-dss.jpg',
      imageAspect: 1.263,
      imageCredit: 'DSS, STScI/AURA, Palomar/Caltech, UKSTU/AAO',
      seed: 3372,
      tint: 0xff9a73,
      navigationRadiusScene: 9000
    },
    generatedFlags: ['image-derived-depth-model'],
    uncertainty: { distance: 'Representative distance to the Carina star-forming complex.' },
    provenance: [SOURCES.nasaCarina]
  }),
  entity({
    id: 'crab-nebula',
    name: 'Crab Nebula',
    objectClass: 'nebula',
    parentId: 'milky-way',
    address: 'universe/local-group/milky-way/crab-nebula',
    aliases: ['M1', 'NGC 1952'],
    accuracy: 'observed imagery / catalog-derived position',
    canonicalPosition: { frame: 'ICRS', raDeg: 83.6331, decDeg: 22.0145, distanceLy: 6500, epoch: 'J2000' },
    physical: { radiusLy: 5.5 },
    visualProfile: {
      kind: 'observational-nebula',
      image: 'assets/textures/universe/crab-nebula-hubble.png',
      imageAspect: 1,
      imageCredit: 'NASA, ESA, Z. Levay (STScI)',
      seed: 1952,
      tint: 0x7ee0b7,
      navigationRadiusScene: 9000
    },
    generatedFlags: ['image-derived-depth-model'],
    provenance: [SOURCES.nasaCrab]
  }),
  entity({
    id: 'andromeda',
    name: 'Andromeda Galaxy',
    objectClass: 'galaxy',
    parentId: 'local-group',
    address: 'universe/local-group/andromeda',
    aliases: ['M31', 'NGC 224'],
    accuracy: 'catalog-derived',
    canonicalPosition: { frame: 'ICRS', raDeg: 10.6847, decDeg: 41.269, distanceLy: 2540000, epoch: 'J2000' },
    physical: { radiusLy: 76000 },
    visualProfile: {
      kind: 'spiral',
      arms: 2,
      inclinationDeg: 77.5,
      seed: 31,
      image: 'assets/textures/universe/andromeda-galex-spitzer.jpg',
      imageAspect: 3.083,
      imageCredit: 'NASA/JPL-Caltech',
      imageSourceUrl: SOURCES.nasaAndromeda.url
    },
    provenance: [SOURCES.ned, SOURCES.nasaAndromeda]
  }),
  entity({
    id: 'andromeda-inner-disk',
    name: 'Andromeda Inner Disk',
    objectClass: 'stellar_region',
    parentId: 'andromeda',
    address: 'universe/local-group/andromeda/inner-disk',
    accuracy: 'model-derived',
    canonicalPosition: { frame: 'ICRS', raDeg: 10.6847, decDeg: 41.269, distanceLy: 2540000, epoch: 'J2000' },
    physical: { radiusLy: 9000 },
    visualProfile: { kind: 'stellar-region', galaxyKind: 'spiral', seed: 31001, tint: 0xadc7ff, navigationRadiusScene: 15000 },
    generatedFlags: ['individual-stars', 'planetary-systems', 'minor-body-encounters'],
    uncertainty: { contents: 'Resolved systems are deterministic exploration models, not observed M31 exoplanets.' },
    provenance: [SOURCES.ned]
  }),
  entity({
    id: 'andromeda-explorer-a',
    name: 'M31 Explorer System A',
    objectClass: 'planetary_system',
    parentId: 'andromeda-inner-disk',
    address: 'universe/local-group/andromeda/inner-disk/explorer-a',
    accuracy: 'procedurally generated',
    canonicalPosition: { frame: 'ICRS', raDeg: 10.6849, decDeg: 41.2692, distanceLy: 2540000, epoch: 'J2000' },
    physical: { hostMassSolar: 0.94, hostTemperatureK: 5520 },
    visualProfile: { kind: 'generated-g-star', color: 0xffe3b0, seed: 31011 },
    generatedFlags: ['host-star-parameters', 'planetary-orbits', 'planet-appearance'],
    children: [
      { id: 'andromeda-explorer-a-b', name: 'Explorer A b', objectClass: 'exoplanet', radiusEarth: 0.82, massEarth: 0.64, orbitDays: 41, semiMajorAxisAu: 0.23, accuracy: 'procedurally generated' },
      { id: 'andromeda-explorer-a-c', name: 'Explorer A c', objectClass: 'exoplanet', radiusEarth: 1.26, massEarth: 2.04, orbitDays: 188, semiMajorAxisAu: 0.69, accuracy: 'procedurally generated' },
      { id: 'andromeda-explorer-a-d', name: 'Explorer A d', objectClass: 'exoplanet', radiusEarth: 6.8, massEarth: 81, orbitDays: 980, semiMajorAxisAu: 2.1, accuracy: 'procedurally generated' }
    ],
    provenance: [SOURCES.ned]
  }),
  entity({
    id: 'triangulum',
    name: 'Triangulum Galaxy',
    objectClass: 'galaxy',
    parentId: 'local-group',
    address: 'universe/local-group/triangulum',
    aliases: ['M33', 'NGC 598'],
    accuracy: 'catalog-derived',
    canonicalPosition: { frame: 'ICRS', raDeg: 23.4621, decDeg: 30.6599, distanceLy: 2730000, epoch: 'J2000' },
    physical: { radiusLy: 30000 },
    visualProfile: { kind: 'spiral', arms: 2, inclinationDeg: 54, seed: 33 },
    provenance: [SOURCES.ned]
  }),
  entity({
    id: 'triangulum-ngc604-region',
    name: 'Triangulum NGC 604 Region',
    objectClass: 'stellar_region',
    parentId: 'triangulum',
    address: 'universe/local-group/triangulum/ngc-604-region',
    accuracy: 'catalog-anchored / model-derived interior',
    canonicalPosition: { frame: 'ICRS', raDeg: 23.4621, decDeg: 30.6599, distanceLy: 2730000, epoch: 'J2000' },
    physical: { radiusLy: 760 },
    visualProfile: { kind: 'stellar-region', galaxyKind: 'star-forming', seed: 60433, tint: 0x90d7ff, navigationRadiusScene: 15000 },
    generatedFlags: ['individual-stars', 'planetary-systems', 'minor-body-encounters'],
    uncertainty: { contents: 'The region anchor is observed; individual explorable systems are generated.' },
    provenance: [SOURCES.ned]
  }),
  entity({
    id: 'triangulum-explorer-a',
    name: 'M33 Explorer System A',
    objectClass: 'planetary_system',
    parentId: 'triangulum-ngc604-region',
    address: 'universe/local-group/triangulum/ngc-604-region/explorer-a',
    accuracy: 'procedurally generated',
    canonicalPosition: { frame: 'ICRS', raDeg: 23.4623, decDeg: 30.6601, distanceLy: 2730000, epoch: 'J2000' },
    physical: { hostMassSolar: 1.31, hostTemperatureK: 6410 },
    visualProfile: { kind: 'generated-f-star', color: 0xe6f1ff, seed: 60443 },
    generatedFlags: ['host-star-parameters', 'planetary-orbits', 'planet-appearance'],
    children: [
      { id: 'triangulum-explorer-a-b', name: 'Explorer A b', objectClass: 'exoplanet', radiusEarth: 1.53, massEarth: 3.4, orbitDays: 72, semiMajorAxisAu: 0.38, accuracy: 'procedurally generated' },
      { id: 'triangulum-explorer-a-c', name: 'Explorer A c', objectClass: 'exoplanet', radiusEarth: 4.2, massEarth: 19, orbitDays: 430, semiMajorAxisAu: 1.34, accuracy: 'procedurally generated' }
    ],
    provenance: [SOURCES.ned]
  }),
  entity({
    id: 'virgo-cluster',
    name: 'Virgo Cluster',
    objectClass: 'galaxy_cluster',
    parentId: 'universe',
    address: 'universe/virgo-cluster',
    accuracy: 'catalog-derived',
    canonicalPosition: { frame: 'ICRS', raDeg: 186.75, decDeg: 12.717, distanceLy: 53800000, epoch: 'J2000' },
    physical: { radiusLy: 4900000, memberEstimate: 1300 },
    visualProfile: { kind: 'galaxy-cluster', seed: 1300 },
    provenance: [SOURCES.ned]
  }),
  entity({
    id: 'm87-star',
    name: 'M87*',
    objectClass: 'black_hole',
    parentId: 'virgo-cluster',
    address: 'universe/virgo-cluster/m87-star',
    accuracy: 'observed',
    canonicalPosition: { frame: 'ICRS', raDeg: 187.70593, decDeg: 12.39112, distanceLy: 53500000, epoch: 'J2000' },
    physical: { massSolar: 6500000000, schwarzschildRadiusKm: 19200000000, spinEstimate: null },
    visualProfile: { kind: 'black-hole', diskInclinationDeg: 17, diskColor: 0xff9d5d, seed: 6500000000 },
    uncertainty: { mass: 'approximately 6.5 billion solar masses' },
    provenance: [SOURCES.eht, SOURCES.ned]
  })
];

const BY_ID = new Map(CATALOG.map((item) => [item.id, item]));
const BY_ADDRESS = new Map(CATALOG.map((item) => [item.address, item]));

function distanceLightYears(item) {
  const canonical = item?.canonicalPosition || {};
  if (Number.isFinite(canonical.distanceLy)) return canonical.distanceLy;
  if (Number.isFinite(canonical.distancePc)) return canonical.distancePc * PC_TO_LY;
  return 0;
}

function icrsToCartesian(item, scale = 1) {
  const position = item?.canonicalPosition || {};
  const radius = distanceLightYears(item) * scale;
  const ra = Number(position.raDeg || 0) * Math.PI / 180;
  const dec = Number(position.decDeg || 0) * Math.PI / 180;
  return {
    x: radius * Math.cos(dec) * Math.cos(ra),
    y: radius * Math.sin(dec),
    z: radius * Math.cos(dec) * Math.sin(ra)
  };
}

function resolveUniverseAddress(addressOrId) {
  const value = String(addressOrId || '').trim().replace(/^\/+|\/+$/g, '');
  return BY_ID.get(value) || BY_ADDRESS.get(value) || null;
}

function getUniverseDestinations() {
  return CATALOG.filter((item) => [
    'planetary_system',
    'nebula',
    'stellar_region',
    'galaxy',
    'galaxy_cluster',
    'black_hole'
  ].includes(item.objectClass));
}

function getGalaxyEntryDestination(galaxyId) {
  const region = CATALOG.find((item) => item.parentId === galaxyId && item.objectClass === 'stellar_region');
  if (region) return region;
  return galaxyId === 'milky-way' ? BY_ID.get('sol') : null;
}

export {
  CATALOG as UNIVERSE_CATALOG,
  SOURCES as UNIVERSE_SOURCES,
  distanceLightYears,
  getGalaxyEntryDestination,
  getUniverseDestinations,
  icrsToCartesian,
  resolveUniverseAddress
};
