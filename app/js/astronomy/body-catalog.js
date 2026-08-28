const METERS_PER_KILOMETER = 1000;
const METERS_PER_AU = 149_597_870_700;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86_400;
const DEG_TO_RAD = Math.PI / 180;

const BODY_CATALOG_VERSION = '1.1.0';

const TRUTH_CLASS = Object.freeze({
  OBSERVED_OR_MEASURED: 'observed_or_measured',
  DERIVED_FROM_OBSERVATIONS: 'derived_from_observations',
  MODELED_PHYSICS: 'modeled_physics',
  VISUAL_SCALE_ADJUSTMENT: 'visual_scale_adjustment',
  GAMEPLAY_ABSTRACTION: 'gameplay_abstraction',
  GENERATED_GAME_DETAIL: 'generated_game_detail',
  FICTIONAL_TECHNOLOGY: 'fictional_technology'
});

const LANDING_MODE = Object.freeze({
  SOLID_SURFACE: 'solid_surface',
  ATMOSPHERIC_DESCENT: 'atmospheric_descent',
  NOT_EXPLORABLE: 'not_explorable'
});

const BODY_CLASS = Object.freeze({
  STAR: 'star',
  TERRESTRIAL_PLANET: 'terrestrial_planet',
  GAS_GIANT: 'gas_giant',
  ICE_GIANT: 'ice_giant',
  NATURAL_SATELLITE: 'natural_satellite',
  DWARF_PLANET: 'dwarf_planet',
  SMALL_BODY: 'small_body'
});

const ATMOSPHERE_CLASS = Object.freeze({
  NONE: 'none',
  EXOSPHERE: 'exosphere',
  THIN: 'thin',
  TERRESTRIAL: 'terrestrial',
  DENSE: 'dense',
  GIANT: 'giant'
});

const SOURCE_CATALOG = Object.freeze({
  nasaPlanetCompare: Object.freeze({
    id: 'nasa-planet-compare',
    title: 'NASA Solar System Exploration — Planet Compare',
    url: 'https://solarsystem.nasa.gov/planet-compare/',
    authority: 'NASA',
    reviewedAt: '2026-08-27'
  }),
  nasaPlanetFacts: Object.freeze({
    id: 'nasa-planet-facts',
    title: 'NASA Science — About the Planets',
    url: 'https://science.nasa.gov/solar-system/planets/',
    authority: 'NASA',
    reviewedAt: '2026-08-27'
  }),
  nasaMoonFacts: Object.freeze({
    id: 'nasa-moon-facts',
    title: 'NASA Science — Moon Facts',
    url: 'https://science.nasa.gov/moon/facts/',
    authority: 'NASA',
    reviewedAt: '2026-08-27'
  }),
  nasaMoonSystems: Object.freeze({
    id: 'nasa-moon-systems',
    title: 'NASA Science — Moons of the Solar System',
    url: 'https://science.nasa.gov/solar-system/moons/',
    authority: 'NASA',
    reviewedAt: '2026-08-27'
  }),
  nasaDawnBodies: Object.freeze({
    id: 'nasa-dawn-bodies',
    title: 'NASA Science — Dawn at Ceres and Vesta',
    url: 'https://science.nasa.gov/mission/dawn/',
    authority: 'NASA/JPL-Caltech',
    reviewedAt: '2026-08-27'
  }),
  nasaPlutoFacts: Object.freeze({
    id: 'nasa-pluto-facts',
    title: 'NASA Science — Pluto Facts',
    url: 'https://science.nasa.gov/dwarf-planets/pluto/facts/',
    authority: 'NASA',
    reviewedAt: '2026-08-27'
  }),
  naifFrames: Object.freeze({
    id: 'jpl-naif-frames',
    title: 'JPL NAIF SPICE Reference Frames',
    url: 'https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/FORTRAN/req/frames.html',
    authority: 'NASA/JPL',
    reviewedAt: '2026-08-27'
  }),
  usgsNomenclature: Object.freeze({
    id: 'usgs-iau-nomenclature',
    title: 'Gazetteer of Planetary Nomenclature',
    url: 'https://planetarynames.wr.usgs.gov/',
    authority: 'USGS/IAU',
    reviewedAt: '2026-08-27'
  })
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function makePhysical({
  massKg,
  meanRadiusKm,
  surfaceGravityMps2,
  escapeVelocityKmS,
  rotationHours,
  orbitalPeriodDays = null,
  axialTiltDeg = 0,
  meanSolarDistanceAU = null
}) {
  return {
    massKg,
    meanRadiusM: meanRadiusKm * METERS_PER_KILOMETER,
    surfaceGravityMps2,
    escapeVelocityMps: escapeVelocityKmS * METERS_PER_KILOMETER,
    rotationPeriodS: rotationHours * SECONDS_PER_HOUR,
    orbitalPeriodS: orbitalPeriodDays == null ? null : orbitalPeriodDays * SECONDS_PER_DAY,
    axialTiltRad: axialTiltDeg * DEG_TO_RAD,
    meanSolarDistanceM: meanSolarDistanceAU == null ? null : meanSolarDistanceAU * METERS_PER_AU
  };
}

function makeBody({
  id,
  name,
  bodyClass,
  parentId,
  aliases = [],
  physical,
  atmosphere,
  exploration,
  frames,
  presentation,
  provenanceSources
}) {
  return deepFreeze({
    schemaVersion: 1,
    catalogVersion: BODY_CATALOG_VERSION,
    id,
    name,
    aliases,
    bodyClass,
    parentId,
    physical,
    atmosphere,
    exploration,
    frames,
    presentation,
    provenance: {
      truthClass: TRUTH_CLASS.OBSERVED_OR_MEASURED,
      sourceIds: provenanceSources,
      reviewedAt: '2026-08-27'
    }
  });
}

const sharedPlanetSources = Object.freeze([
  SOURCE_CATALOG.nasaPlanetCompare.id,
  SOURCE_CATALOG.nasaPlanetFacts.id,
  SOURCE_CATALOG.naifFrames.id,
  SOURCE_CATALOG.usgsNomenclature.id
]);

const sharedMoonSources = Object.freeze([
  SOURCE_CATALOG.nasaMoonSystems.id,
  SOURCE_CATALOG.naifFrames.id,
  SOURCE_CATALOG.usgsNomenclature.id
]);

const sharedSmallBodySources = Object.freeze([
  SOURCE_CATALOG.nasaDawnBodies.id,
  SOURCE_CATALOG.naifFrames.id,
  SOURCE_CATALOG.usgsNomenclature.id
]);

const bodyRows = [
  makeBody({
    id: 'sun', name: 'Sun', bodyClass: BODY_CLASS.STAR, parentId: null,
    physical: makePhysical({ massKg: 1.9884e30, meanRadiusKm: 695700, surfaceGravityMps2: 274, escapeVelocityKmS: 617.6, rotationHours: 609.12 }),
    atmosphere: { class: ATMOSPHERE_CLASS.GIANT, referencePressurePa: null, composition: ['hydrogen', 'helium'] },
    exploration: { landingMode: LANDING_MODE.NOT_EXPLORABLE, surfaceRegionEligible: false, environmentProfileId: 'sun' },
    frames: { inertial: 'J2000', bodyFixed: 'IAU_SUN' },
    presentation: { environmentId: 'SUN', globalTexturePath: '/app/assets/textures/universe/sun-sdo-2025.jpg', surfaceLabel: null },
    provenanceSources: sharedPlanetSources
  }),
  makeBody({
    id: 'mercury', name: 'Mercury', bodyClass: BODY_CLASS.TERRESTRIAL_PLANET, parentId: 'sun',
    physical: makePhysical({ massKg: 3.3011e23, meanRadiusKm: 2439.7, surfaceGravityMps2: 3.70, escapeVelocityKmS: 4.25, rotationHours: 1407.5, orbitalPeriodDays: 87.969, axialTiltDeg: 0.034, meanSolarDistanceAU: 0.38710 }),
    atmosphere: { class: ATMOSPHERE_CLASS.EXOSPHERE, referencePressurePa: 0, composition: ['oxygen', 'sodium', 'hydrogen', 'helium', 'potassium'] },
    exploration: { landingMode: LANDING_MODE.SOLID_SURFACE, surfaceRegionEligible: true, environmentProfileId: 'mercury' },
    frames: { inertial: 'J2000', bodyFixed: 'IAU_MERCURY' },
    presentation: { environmentId: 'MERCURY', globalTexturePath: '/app/assets/textures/mercury_messenger.jpg', surfaceLabel: 'Mercury surface' },
    provenanceSources: sharedPlanetSources
  }),
  makeBody({
    id: 'venus', name: 'Venus', bodyClass: BODY_CLASS.TERRESTRIAL_PLANET, parentId: 'sun',
    physical: makePhysical({ massKg: 4.8675e24, meanRadiusKm: 6051.8, surfaceGravityMps2: 8.87, escapeVelocityKmS: 10.36, rotationHours: -5832.5, orbitalPeriodDays: 224.701, axialTiltDeg: 177.36, meanSolarDistanceAU: 0.72333 }),
    atmosphere: { class: ATMOSPHERE_CLASS.DENSE, referencePressurePa: 9_200_000, composition: ['carbon_dioxide', 'nitrogen'] },
    exploration: { landingMode: LANDING_MODE.SOLID_SURFACE, surfaceRegionEligible: true, environmentProfileId: 'venus', requiresProtectedSurfaceCapability: true },
    frames: { inertial: 'J2000', bodyFixed: 'IAU_VENUS' },
    presentation: { environmentId: 'VENUS', globalTexturePath: '/app/assets/textures/venus_magellan.jpg', surfaceLabel: 'Venus surface' },
    provenanceSources: sharedPlanetSources
  }),
  makeBody({
    id: 'earth', name: 'Earth', bodyClass: BODY_CLASS.TERRESTRIAL_PLANET, parentId: 'sun',
    physical: makePhysical({ massKg: 5.97237e24, meanRadiusKm: 6371, surfaceGravityMps2: 9.80665, escapeVelocityKmS: 11.19, rotationHours: 23.9345, orbitalPeriodDays: 365.256, axialTiltDeg: 23.44, meanSolarDistanceAU: 1.0 }),
    atmosphere: { class: ATMOSPHERE_CLASS.TERRESTRIAL, referencePressurePa: 101_325, composition: ['nitrogen', 'oxygen', 'argon'] },
    exploration: { landingMode: LANDING_MODE.SOLID_SURFACE, surfaceRegionEligible: true, environmentProfileId: 'earth', preserveExistingWorldCompiler: true },
    frames: { inertial: 'J2000', bodyFixed: 'ITRF93', fallbackBodyFixed: 'IAU_EARTH' },
    presentation: { environmentId: 'EARTH', globalTexturePath: '/app/assets/textures/earth_atmos_2048.jpg', surfaceLabel: 'Earth' },
    provenanceSources: sharedPlanetSources
  }),
  makeBody({
    id: 'moon', name: 'Moon', bodyClass: BODY_CLASS.NATURAL_SATELLITE, parentId: 'earth', aliases: ['Luna'],
    physical: makePhysical({ massKg: 7.342e22, meanRadiusKm: 1737.4, surfaceGravityMps2: 1.62, escapeVelocityKmS: 2.38, rotationHours: 655.728, orbitalPeriodDays: 27.3217, axialTiltDeg: 6.68, meanSolarDistanceAU: 1.0 }),
    atmosphere: { class: ATMOSPHERE_CLASS.EXOSPHERE, referencePressurePa: 0, composition: ['helium', 'neon', 'argon'] },
    exploration: { landingMode: LANDING_MODE.SOLID_SURFACE, surfaceRegionEligible: true, environmentProfileId: 'moon' },
    frames: { inertial: 'J2000', bodyFixed: 'MOON_ME_DE421', fallbackBodyFixed: 'IAU_MOON' },
    presentation: { environmentId: 'MOON', globalTexturePath: '/app/assets/textures/moon_lroc_2048.jpg', surfaceLabel: 'Mare Tranquillitatis' },
    provenanceSources: [SOURCE_CATALOG.nasaMoonFacts.id, SOURCE_CATALOG.naifFrames.id, SOURCE_CATALOG.usgsNomenclature.id]
  }),
  makeBody({
    id: 'mars', name: 'Mars', bodyClass: BODY_CLASS.TERRESTRIAL_PLANET, parentId: 'sun',
    physical: makePhysical({ massKg: 6.4171e23, meanRadiusKm: 3389.5, surfaceGravityMps2: 3.71, escapeVelocityKmS: 5.03, rotationHours: 24.6229, orbitalPeriodDays: 686.98, axialTiltDeg: 25.19, meanSolarDistanceAU: 1.52368 }),
    atmosphere: { class: ATMOSPHERE_CLASS.THIN, referencePressurePa: 610, composition: ['carbon_dioxide', 'nitrogen', 'argon'] },
    exploration: { landingMode: LANDING_MODE.SOLID_SURFACE, surfaceRegionEligible: true, environmentProfileId: 'mars' },
    frames: { inertial: 'J2000', bodyFixed: 'IAU_MARS' },
    presentation: { environmentId: 'MARS', globalTexturePath: '/app/assets/textures/mars_viking_4096.jpg', surfaceLabel: 'Olympus Mons, Tharsis' },
    provenanceSources: sharedPlanetSources
  }),
  makeBody({
    id: 'jupiter', name: 'Jupiter', bodyClass: BODY_CLASS.GAS_GIANT, parentId: 'sun',
    physical: makePhysical({ massKg: 1.8982e27, meanRadiusKm: 69911, surfaceGravityMps2: 24.79, escapeVelocityKmS: 59.5, rotationHours: 9.925, orbitalPeriodDays: 4332.6, axialTiltDeg: 3.13, meanSolarDistanceAU: 5.20260 }),
    atmosphere: { class: ATMOSPHERE_CLASS.GIANT, referencePressurePa: 100_000, composition: ['hydrogen', 'helium', 'methane', 'ammonia'] },
    exploration: { landingMode: LANDING_MODE.ATMOSPHERIC_DESCENT, surfaceRegionEligible: false, environmentProfileId: 'jupiter' },
    frames: { inertial: 'J2000', bodyFixed: 'IAU_JUPITER' },
    presentation: { environmentId: 'JUPITER', globalTexturePath: '/app/assets/textures/jupiter_voyager.jpg', surfaceLabel: null },
    provenanceSources: sharedPlanetSources
  }),
  makeBody({
    id: 'saturn', name: 'Saturn', bodyClass: BODY_CLASS.GAS_GIANT, parentId: 'sun',
    physical: makePhysical({ massKg: 5.6834e26, meanRadiusKm: 58232, surfaceGravityMps2: 10.44, escapeVelocityKmS: 35.5, rotationHours: 10.656, orbitalPeriodDays: 10759, axialTiltDeg: 26.73, meanSolarDistanceAU: 9.55491 }),
    atmosphere: { class: ATMOSPHERE_CLASS.GIANT, referencePressurePa: 100_000, composition: ['hydrogen', 'helium', 'methane', 'ammonia'] },
    exploration: { landingMode: LANDING_MODE.ATMOSPHERIC_DESCENT, surfaceRegionEligible: false, environmentProfileId: 'saturn' },
    frames: { inertial: 'J2000', bodyFixed: 'IAU_SATURN' },
    presentation: { environmentId: 'SATURN', globalTexturePath: '/app/assets/textures/saturn_jpl.jpg', surfaceLabel: null },
    provenanceSources: sharedPlanetSources
  }),
  makeBody({
    id: 'uranus', name: 'Uranus', bodyClass: BODY_CLASS.ICE_GIANT, parentId: 'sun',
    physical: makePhysical({ massKg: 8.6810e25, meanRadiusKm: 25362, surfaceGravityMps2: 8.69, escapeVelocityKmS: 21.3, rotationHours: -17.24, orbitalPeriodDays: 30688.5, axialTiltDeg: 97.77, meanSolarDistanceAU: 19.21845 }),
    atmosphere: { class: ATMOSPHERE_CLASS.GIANT, referencePressurePa: 100_000, composition: ['hydrogen', 'helium', 'methane'] },
    exploration: { landingMode: LANDING_MODE.ATMOSPHERIC_DESCENT, surfaceRegionEligible: false, environmentProfileId: 'uranus' },
    frames: { inertial: 'J2000', bodyFixed: 'IAU_URANUS' },
    presentation: { environmentId: 'URANUS', globalTexturePath: '/app/assets/textures/uranus_jpl.jpg', surfaceLabel: null },
    provenanceSources: sharedPlanetSources
  }),
  makeBody({
    id: 'neptune', name: 'Neptune', bodyClass: BODY_CLASS.ICE_GIANT, parentId: 'sun',
    physical: makePhysical({ massKg: 1.02413e26, meanRadiusKm: 24622, surfaceGravityMps2: 11.15, escapeVelocityKmS: 23.5, rotationHours: 16.11, orbitalPeriodDays: 60182, axialTiltDeg: 28.32, meanSolarDistanceAU: 30.11039 }),
    atmosphere: { class: ATMOSPHERE_CLASS.GIANT, referencePressurePa: 100_000, composition: ['hydrogen', 'helium', 'methane'] },
    exploration: { landingMode: LANDING_MODE.ATMOSPHERIC_DESCENT, surfaceRegionEligible: false, environmentProfileId: 'neptune' },
    frames: { inertial: 'J2000', bodyFixed: 'IAU_NEPTUNE' },
    presentation: { environmentId: 'NEPTUNE', globalTexturePath: '/app/assets/textures/neptune_jpl.jpg', surfaceLabel: null },
    provenanceSources: sharedPlanetSources
  }),
  makeBody({
    id: 'phobos', name: 'Phobos', bodyClass: BODY_CLASS.NATURAL_SATELLITE, parentId: 'mars',
    physical: makePhysical({ massKg: 1.0659e16, meanRadiusKm: 11.2667, surfaceGravityMps2: 0.0057, escapeVelocityKmS: 0.0114, rotationHours: 7.6538, orbitalPeriodDays: 0.31891, axialTiltDeg: 0, meanSolarDistanceAU: 1.52368 }),
    atmosphere: { class: ATMOSPHERE_CLASS.NONE, referencePressurePa: 0, composition: [] },
    exploration: { landingMode: LANDING_MODE.SOLID_SURFACE, surfaceRegionEligible: true, environmentProfileId: 'phobos', experienceTier: 'regional' },
    frames: { inertial: 'J2000', bodyFixed: 'IAU_PHOBOS' },
    presentation: { environmentId: 'PHOBOS', globalTexturePath: '/app/assets/textures/phobos-viking.jpg', surfaceLabel: 'Stickney crater region' },
    provenanceSources: sharedMoonSources
  }),
  makeBody({
    id: 'deimos', name: 'Deimos', bodyClass: BODY_CLASS.NATURAL_SATELLITE, parentId: 'mars',
    physical: makePhysical({ massKg: 1.4762e15, meanRadiusKm: 6.2, surfaceGravityMps2: 0.003, escapeVelocityKmS: 0.0056, rotationHours: 30.2986, orbitalPeriodDays: 1.26244, axialTiltDeg: 0, meanSolarDistanceAU: 1.52368 }),
    atmosphere: { class: ATMOSPHERE_CLASS.NONE, referencePressurePa: 0, composition: [] },
    exploration: { landingMode: LANDING_MODE.SOLID_SURFACE, surfaceRegionEligible: true, environmentProfileId: 'deimos', experienceTier: 'regional' },
    frames: { inertial: 'J2000', bodyFixed: 'IAU_DEIMOS' },
    presentation: { environmentId: 'DEIMOS', globalTexturePath: '/app/assets/textures/deimos-viking.jpg', surfaceLabel: 'Voltaire crater region' },
    provenanceSources: sharedMoonSources
  }),
  makeBody({
    id: 'io', name: 'Io', bodyClass: BODY_CLASS.NATURAL_SATELLITE, parentId: 'jupiter',
    physical: makePhysical({ massKg: 8.9319e22, meanRadiusKm: 1821.6, surfaceGravityMps2: 1.796, escapeVelocityKmS: 2.558, rotationHours: 42.459, orbitalPeriodDays: 1.76914, axialTiltDeg: 0.04, meanSolarDistanceAU: 5.20260 }),
    atmosphere: { class: ATMOSPHERE_CLASS.EXOSPHERE, referencePressurePa: 0, composition: ['sulfur_dioxide'] },
    exploration: { landingMode: LANDING_MODE.SOLID_SURFACE, surfaceRegionEligible: true, environmentProfileId: 'io', experienceTier: 'featured' },
    frames: { inertial: 'J2000', bodyFixed: 'IAU_IO' },
    presentation: { environmentId: 'IO', globalTexturePath: '/app/assets/textures/io-voyager-galileo.jpg', surfaceLabel: 'Tvashtar volcanic region' },
    provenanceSources: sharedMoonSources
  }),
  makeBody({
    id: 'europa', name: 'Europa', bodyClass: BODY_CLASS.NATURAL_SATELLITE, parentId: 'jupiter',
    physical: makePhysical({ massKg: 4.7998e22, meanRadiusKm: 1560.8, surfaceGravityMps2: 1.315, escapeVelocityKmS: 2.025, rotationHours: 85.228, orbitalPeriodDays: 3.55118, axialTiltDeg: 0.1, meanSolarDistanceAU: 5.20260 }),
    atmosphere: { class: ATMOSPHERE_CLASS.EXOSPHERE, referencePressurePa: 0, composition: ['oxygen'] },
    exploration: { landingMode: LANDING_MODE.SOLID_SURFACE, surfaceRegionEligible: true, environmentProfileId: 'europa', experienceTier: 'featured' },
    frames: { inertial: 'J2000', bodyFixed: 'IAU_EUROPA' },
    presentation: { environmentId: 'EUROPA', globalTexturePath: '/app/assets/textures/europa-voyager-galileo.jpg', surfaceLabel: 'Conamara Chaos region' },
    provenanceSources: sharedMoonSources
  }),
  makeBody({
    id: 'ganymede', name: 'Ganymede', bodyClass: BODY_CLASS.NATURAL_SATELLITE, parentId: 'jupiter',
    physical: makePhysical({ massKg: 1.4819e23, meanRadiusKm: 2634.1, surfaceGravityMps2: 1.428, escapeVelocityKmS: 2.741, rotationHours: 171.709, orbitalPeriodDays: 7.15455, axialTiltDeg: 0.33, meanSolarDistanceAU: 5.20260 }),
    atmosphere: { class: ATMOSPHERE_CLASS.EXOSPHERE, referencePressurePa: 0, composition: ['oxygen'] },
    exploration: { landingMode: LANDING_MODE.SOLID_SURFACE, surfaceRegionEligible: true, environmentProfileId: 'ganymede', experienceTier: 'regional' },
    frames: { inertial: 'J2000', bodyFixed: 'IAU_GANYMEDE' },
    presentation: { environmentId: 'GANYMEDE', globalTexturePath: '/app/assets/textures/ganymede-voyager-galileo.jpg', surfaceLabel: 'Galileo Regio' },
    provenanceSources: sharedMoonSources
  }),
  makeBody({
    id: 'callisto', name: 'Callisto', bodyClass: BODY_CLASS.NATURAL_SATELLITE, parentId: 'jupiter',
    physical: makePhysical({ massKg: 1.0759e23, meanRadiusKm: 2410.3, surfaceGravityMps2: 1.235, escapeVelocityKmS: 2.440, rotationHours: 400.536, orbitalPeriodDays: 16.689, axialTiltDeg: 0.19, meanSolarDistanceAU: 5.20260 }),
    atmosphere: { class: ATMOSPHERE_CLASS.EXOSPHERE, referencePressurePa: 0, composition: ['carbon_dioxide', 'oxygen'] },
    exploration: { landingMode: LANDING_MODE.SOLID_SURFACE, surfaceRegionEligible: true, environmentProfileId: 'callisto', experienceTier: 'regional' },
    frames: { inertial: 'J2000', bodyFixed: 'IAU_CALLISTO' },
    presentation: { environmentId: 'CALLISTO', globalTexturePath: '/app/assets/textures/callisto-voyager-galileo.jpg', surfaceLabel: 'Valhalla basin' },
    provenanceSources: sharedMoonSources
  }),
  makeBody({
    id: 'titan', name: 'Titan', bodyClass: BODY_CLASS.NATURAL_SATELLITE, parentId: 'saturn',
    physical: makePhysical({ massKg: 1.3452e23, meanRadiusKm: 2574.73, surfaceGravityMps2: 1.352, escapeVelocityKmS: 2.639, rotationHours: 382.68, orbitalPeriodDays: 15.945, axialTiltDeg: 0.33, meanSolarDistanceAU: 9.55491 }),
    atmosphere: { class: ATMOSPHERE_CLASS.DENSE, referencePressurePa: 146_700, composition: ['nitrogen', 'methane', 'hydrogen'] },
    exploration: { landingMode: LANDING_MODE.SOLID_SURFACE, surfaceRegionEligible: true, environmentProfileId: 'titan', experienceTier: 'featured', requiresProtectedSurfaceCapability: true },
    frames: { inertial: 'J2000', bodyFixed: 'IAU_TITAN' },
    presentation: { environmentId: 'TITAN', globalTexturePath: '/app/assets/textures/titan-cassini-iss.jpg', surfaceLabel: 'Shangri-La dunes' },
    provenanceSources: sharedMoonSources
  }),
  makeBody({
    id: 'enceladus', name: 'Enceladus', bodyClass: BODY_CLASS.NATURAL_SATELLITE, parentId: 'saturn',
    physical: makePhysical({ massKg: 1.08022e20, meanRadiusKm: 252.1, surfaceGravityMps2: 0.113, escapeVelocityKmS: 0.239, rotationHours: 32.885, orbitalPeriodDays: 1.37022, axialTiltDeg: 0, meanSolarDistanceAU: 9.55491 }),
    atmosphere: { class: ATMOSPHERE_CLASS.EXOSPHERE, referencePressurePa: 0, composition: ['water_vapor', 'carbon_dioxide'] },
    exploration: { landingMode: LANDING_MODE.SOLID_SURFACE, surfaceRegionEligible: true, environmentProfileId: 'enceladus', experienceTier: 'featured' },
    frames: { inertial: 'J2000', bodyFixed: 'IAU_ENCELADUS' },
    presentation: { environmentId: 'ENCELADUS', globalTexturePath: '/app/assets/textures/enceladus-cassini.jpg', surfaceLabel: 'South polar terrain' },
    provenanceSources: sharedMoonSources
  }),
  makeBody({
    id: 'triton', name: 'Triton', bodyClass: BODY_CLASS.NATURAL_SATELLITE, parentId: 'neptune',
    physical: makePhysical({ massKg: 2.14e22, meanRadiusKm: 1353.4, surfaceGravityMps2: 0.779, escapeVelocityKmS: 1.455, rotationHours: -141.05, orbitalPeriodDays: -5.87685, axialTiltDeg: 156.8, meanSolarDistanceAU: 30.11039 }),
    atmosphere: { class: ATMOSPHERE_CLASS.THIN, referencePressurePa: 1.4, composition: ['nitrogen', 'methane'] },
    exploration: { landingMode: LANDING_MODE.SOLID_SURFACE, surfaceRegionEligible: true, environmentProfileId: 'triton', experienceTier: 'featured' },
    frames: { inertial: 'J2000', bodyFixed: 'IAU_TRITON' },
    presentation: { environmentId: 'TRITON', globalTexturePath: '/app/assets/textures/triton-voyager.jpg', surfaceLabel: 'Voyager imaged hemisphere' },
    provenanceSources: sharedMoonSources
  }),
  makeBody({
    id: 'ceres', name: 'Ceres', bodyClass: BODY_CLASS.DWARF_PLANET, parentId: 'sun',
    physical: makePhysical({ massKg: 9.3835e20, meanRadiusKm: 469.7, surfaceGravityMps2: 0.27, escapeVelocityKmS: 0.51, rotationHours: 9.074, orbitalPeriodDays: 1681.63, axialTiltDeg: 4, meanSolarDistanceAU: 2.7675 }),
    atmosphere: { class: ATMOSPHERE_CLASS.EXOSPHERE, referencePressurePa: 0, composition: ['water_vapor'] },
    exploration: { landingMode: LANDING_MODE.SOLID_SURFACE, surfaceRegionEligible: true, environmentProfileId: 'ceres', experienceTier: 'featured' },
    frames: { inertial: 'J2000', bodyFixed: 'IAU_CERES' },
    presentation: { environmentId: 'CERES', globalTexturePath: '/app/assets/textures/ceres-dawn-enhanced.jpg', surfaceLabel: 'Occator crater region' },
    provenanceSources: sharedSmallBodySources
  }),
  makeBody({
    id: 'vesta', name: 'Vesta', bodyClass: BODY_CLASS.SMALL_BODY, parentId: 'sun',
    physical: makePhysical({ massKg: 2.59076e20, meanRadiusKm: 262.7, surfaceGravityMps2: 0.25, escapeVelocityKmS: 0.36, rotationHours: 5.342, orbitalPeriodDays: 1325.75, axialTiltDeg: 27.5, meanSolarDistanceAU: 2.3615 }),
    atmosphere: { class: ATMOSPHERE_CLASS.NONE, referencePressurePa: 0, composition: [] },
    exploration: { landingMode: LANDING_MODE.SOLID_SURFACE, surfaceRegionEligible: true, environmentProfileId: 'vesta', experienceTier: 'featured' },
    frames: { inertial: 'J2000', bodyFixed: 'IAU_VESTA' },
    presentation: { environmentId: 'VESTA', globalTexturePath: '/app/assets/textures/vesta-dawn.jpg', surfaceLabel: 'Rheasilvia basin' },
    provenanceSources: sharedSmallBodySources
  }),
  makeBody({
    id: 'pluto', name: 'Pluto', bodyClass: BODY_CLASS.DWARF_PLANET, parentId: 'sun',
    physical: makePhysical({ massKg: 1.303e22, meanRadiusKm: 1188.3, surfaceGravityMps2: 0.62, escapeVelocityKmS: 1.212, rotationHours: -153.293, orbitalPeriodDays: 90560, axialTiltDeg: 122.53, meanSolarDistanceAU: 39.482 }),
    atmosphere: { class: ATMOSPHERE_CLASS.THIN, referencePressurePa: 1, composition: ['nitrogen', 'methane', 'carbon_monoxide'] },
    exploration: { landingMode: LANDING_MODE.SOLID_SURFACE, surfaceRegionEligible: true, environmentProfileId: 'pluto', experienceTier: 'featured' },
    frames: { inertial: 'J2000', bodyFixed: 'IAU_PLUTO' },
    presentation: { environmentId: 'PLUTO', globalTexturePath: '/app/assets/textures/pluto-new-horizons.jpg', surfaceLabel: 'Sputnik Planitia' },
    provenanceSources: [SOURCE_CATALOG.nasaPlutoFacts.id, SOURCE_CATALOG.naifFrames.id, SOURCE_CATALOG.usgsNomenclature.id]
  })
];

const ASTRONOMICAL_BODIES = deepFreeze(Object.fromEntries(bodyRows.map((body) => [body.id, body])));
const SOLAR_SYSTEM_PLANET_IDS = Object.freeze(['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']);
const SOLAR_SYSTEM_EXPLORATION_DESTINATION_IDS = Object.freeze([
  'moon', 'mercury', 'venus', 'mars',
  'jupiter', 'io', 'europa',
  'saturn', 'titan', 'enceladus', 'uranus', 'neptune', 'triton',
  'ceres', 'vesta', 'pluto'
]);

const aliases = new Map();
bodyRows.forEach((body) => {
  aliases.set(body.id, body.id);
  aliases.set(body.name.toLowerCase(), body.id);
  body.aliases.forEach((alias) => aliases.set(String(alias).toLowerCase(), body.id));
});

function normalizeAstronomicalBodyId(value) {
  return aliases.get(String(value || '').trim().toLowerCase()) || null;
}

function getAstronomicalBody(value) {
  const id = normalizeAstronomicalBodyId(value);
  return id ? ASTRONOMICAL_BODIES[id] : null;
}

function listAstronomicalBodies(options = {}) {
  const parentId = options.parentId == null ? null : normalizeAstronomicalBodyId(options.parentId);
  const bodyClass = options.bodyClass == null ? null : String(options.bodyClass);
  return bodyRows.filter((body) => {
    if (options.parentId != null && body.parentId !== parentId) return false;
    if (bodyClass && body.bodyClass !== bodyClass) return false;
    return true;
  });
}

function getBodySource(sourceId) {
  return Object.values(SOURCE_CATALOG).find((source) => source.id === sourceId) || null;
}

export {
  ASTRONOMICAL_BODIES,
  ATMOSPHERE_CLASS,
  BODY_CATALOG_VERSION,
  BODY_CLASS,
  getAstronomicalBody,
  getBodySource,
  LANDING_MODE,
  listAstronomicalBodies,
  METERS_PER_AU,
  normalizeAstronomicalBodyId,
  SOLAR_SYSTEM_EXPLORATION_DESTINATION_IDS,
  SOLAR_SYSTEM_PLANET_IDS,
  SOURCE_CATALOG,
  TRUTH_CLASS
};
