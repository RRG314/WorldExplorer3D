// Immutable astronomical catalog and visual scale configuration.
export const SOLAR_SYSTEM_PLANETS = [
{
  name: 'Mercury', type: 'Terrestrial', color: 0xffffff, emissive: 0x181512,
  glowColor: 0xb0a090,
  texture: '/app/assets/textures/mercury_messenger.jpg',
  radiusScaled: 22, meanDistanceAU: 0.387, meanDistanceKM: 57910000,
  description: 'Smallest planet, closest to the Sun. Extreme temperature swings.',
  a0: 0.38710, aRate: 0.00000,
  e0: 0.20563, eRate: 0.00002,
  I0: 7.005, IRate: -0.0059,
  L0: 252.251, LRate: 149472.674,
  LP0: 77.457, LPRate: 0.160,
  LN0: 48.331, LNRate: -0.125
},
{
  name: 'Venus', type: 'Terrestrial', color: 0xffffff, emissive: 0x2a1908,
  glowColor: 0xe8c080,
  texture: '/app/assets/textures/venus_magellan.jpg',
  radiusScaled: 35, meanDistanceAU: 0.723, meanDistanceKM: 108200000,
  description: 'Hottest planet due to runaway greenhouse effect. Thick toxic atmosphere.',
  a0: 0.72333, aRate: 0.00001,
  e0: 0.00677, eRate: -0.00005,
  I0: 3.395, IRate: -0.0007,
  L0: 181.980, LRate: 58517.816,
  LP0: 131.564, LPRate: 0.300,
  LN0: 76.680, LNRate: -0.278
},
{
  name: 'Earth', type: 'Terrestrial', color: 0x2255bb, emissive: 0x142a5e,
  glowColor: 0x88ccff,
  texture: '/app/assets/textures/earth_atmos_2048.jpg',
  radiusScaled: 36, meanDistanceAU: 1.000, meanDistanceKM: 149600000,
  description: 'Our home planet. The only known world with liquid surface water and life.',
  a0: 1.00000, aRate: -0.00001,
  e0: 0.01671, eRate: -0.00004,
  I0: 0.000, IRate: -0.0001,
  L0: 100.464, LRate: 35999.373,
  LP0: 102.937, LPRate: 0.318,
  LN0: 0.0, LNRate: 0.0
},
{
  name: 'Mars', type: 'Terrestrial', color: 0xffffff, emissive: 0x1c0904,
  glowColor: 0xcc4422,
  texture: '/app/assets/textures/mars_viking_4096.jpg',
  radiusScaled: 28, meanDistanceAU: 1.524, meanDistanceKM: 227900000,
  description: 'The Red Planet. Has the tallest volcano and deepest canyon in the solar system.',
  a0: 1.52368, aRate: 0.00001,
  e0: 0.09340, eRate: 0.00008,
  I0: 1.850, IRate: -0.0081,
  L0: 355.453, LRate: 19140.299,
  LP0: 336.060, LPRate: 0.448,
  LN0: 49.558, LNRate: -0.297
},
{
  name: 'Jupiter', type: 'Gas Giant', color: 0xffffff, emissive: 0x23180e,
  glowColor: 0xd4a060,
  texture: '/app/assets/textures/jupiter_voyager.jpg',
  radiusScaled: 90, meanDistanceAU: 5.203, meanDistanceKM: 778500000,
  description: 'Largest planet. Its Great Red Spot is a storm larger than Earth.',
  a0: 5.20260, aRate: -0.00036,
  e0: 0.04849, eRate: 0.00018,
  I0: 1.303, IRate: -0.0019,
  L0: 34.351, LRate: 3034.906,
  LP0: 14.331, LPRate: 0.218,
  LN0: 100.464, LNRate: 0.176
},
{
  name: 'Saturn', type: 'Gas Giant', color: 0xffffff, emissive: 0x211d12,
  glowColor: 0xe8d090,
  texture: '/app/assets/textures/saturn_jpl.jpg',
  radiusScaled: 78, meanDistanceAU: 9.537, meanDistanceKM: 1427000000,
  description: 'Famous for its spectacular ring system. Least dense planet.',
  a0: 9.55491, aRate: -0.00121,
  e0: 0.05551, eRate: -0.00035,
  I0: 2.489, IRate: 0.0049,
  L0: 50.077, LRate: 1222.114,
  LP0: 93.057, LPRate: 0.565,
  LN0: 113.665, LNRate: -0.268
},
{
  name: 'Uranus', type: 'Ice Giant', color: 0xffffff, emissive: 0x10262b,
  glowColor: 0x88ccdd,
  texture: '/app/assets/textures/uranus_jpl.jpg',
  radiusScaled: 55, meanDistanceAU: 19.189, meanDistanceKM: 2871000000,
  description: 'Tilted on its side. Has faint rings and 27 known moons.',
  a0: 19.21845, aRate: -0.00152,
  e0: 0.04630, eRate: -0.00003,
  I0: 0.773, IRate: -0.0024,
  L0: 314.055, LRate: 428.467,
  LP0: 173.005, LPRate: 0.082,
  LN0: 74.006, LNRate: 0.074
},
{
  name: 'Neptune', type: 'Ice Giant', color: 0xffffff, emissive: 0x0d1730,
  glowColor: 0x4466dd,
  texture: '/app/assets/textures/neptune_jpl.jpg',
  radiusScaled: 52, meanDistanceAU: 30.070, meanDistanceKM: 4498000000,
  description: 'Farthest planet. Has the strongest winds in the solar system.',
  a0: 30.11039, aRate: 0.00030,
  e0: 0.00899, eRate: 0.00001,
  I0: 1.770, IRate: 0.0003,
  L0: 304.349, LRate: 218.486,
  LP0: 48.124, LPRate: -0.010,
  LN0: 131.784, LNRate: -0.023
}];


// ---------------------------------------------------------------------------
// HELIOCENTRIC VISUAL DISTANCES - Real proportional (AU-based)
// 1 AU = AU_TO_SCENE scene units. Distances are proportional to real semi-major axes.
// ---------------------------------------------------------------------------
export const AU_TO_SCENE = 800; // 1 AU = 800 scene units

export const HELIO_VISUAL_DIST = {
  Mercury: SOLAR_SYSTEM_PLANETS[0].a0 * AU_TO_SCENE, // 0.387 AU = ~310
  Venus: SOLAR_SYSTEM_PLANETS[1].a0 * AU_TO_SCENE, // 0.723 AU = ~579
  Earth: SOLAR_SYSTEM_PLANETS[2].a0 * AU_TO_SCENE, // 1.000 AU = 800
  Mars: SOLAR_SYSTEM_PLANETS[3].a0 * AU_TO_SCENE, // 1.524 AU = ~1219
  Jupiter: SOLAR_SYSTEM_PLANETS[4].a0 * AU_TO_SCENE, // 5.203 AU = ~4162
  Saturn: SOLAR_SYSTEM_PLANETS[5].a0 * AU_TO_SCENE, // 9.537 AU = ~7630
  Uranus: SOLAR_SYSTEM_PLANETS[6].a0 * AU_TO_SCENE, // 19.189 AU = ~15351
  Neptune: SOLAR_SYSTEM_PLANETS[7].a0 * AU_TO_SCENE // 30.070 AU = ~24056
};

export const MOON_ORBIT_RADIUS = 120; // Moon's visual orbit radius around Earth

// ---------------------------------------------------------------------------
// PLANET MOONS DATA
// ---------------------------------------------------------------------------
export const PLANET_MOONS = {
  Earth: [
  { name: 'Moon', radiusScaled: 5, orbitRadius: 55, orbitDays: 27.3, color: 0xc8c8c8 }],

  Mars: [
  { name: 'Phobos', radiusScaled: 2.5, orbitRadius: 38, orbitDays: 0.32, color: 0xa8947d },
  { name: 'Deimos', radiusScaled: 2, orbitRadius: 52, orbitDays: 1.26, color: 0xb19b84 }],

  Jupiter: [
  { name: 'Io', radiusScaled: 5, orbitRadius: 95, orbitDays: 1.77, color: 0xe8d9b0 },
  { name: 'Europa', radiusScaled: 4.5, orbitRadius: 120, orbitDays: 3.55, color: 0xdad9cd },
  { name: 'Ganymede', radiusScaled: 5.5, orbitRadius: 150, orbitDays: 7.15, color: 0xbba98b },
  { name: 'Callisto', radiusScaled: 5, orbitRadius: 185, orbitDays: 16.69, color: 0x8b7d72 }],

  Saturn: [
  { name: 'Titan', radiusScaled: 5.5, orbitRadius: 145, orbitDays: 15.95, color: 0xd8b97f },
  { name: 'Rhea', radiusScaled: 3, orbitRadius: 115, orbitDays: 4.52, color: 0xc3c3c3 }],

  Uranus: [
  { name: 'Titania', radiusScaled: 4.2, orbitRadius: 100, orbitDays: 8.71, color: 0xb9c7d1 },
  { name: 'Oberon', radiusScaled: 3.8, orbitRadius: 125, orbitDays: 13.46, color: 0xa9b7c2 }],

  Neptune: [
  { name: 'Triton', radiusScaled: 4.5, orbitRadius: 110, orbitDays: 5.88, color: 0xb8c8d8 }]

};

// ---------------------------------------------------------------------------
// ASTEROID BELT DATA
// Main belt between Mars and Jupiter (2.2 - 3.2 AU)
// Kirkwood gaps at Jupiter orbital resonances
// ---------------------------------------------------------------------------
export const ASTEROID_BELT = {
  innerAU: 2.06, // inner edge
  outerAU: 3.27, // outer edge
  centerAU: 2.7, // belt center
  count: 3000, // number of particle asteroids
  visualScale: 1,
  maxInclination: 20, // degrees - most belt asteroids
  maxEccentricity: 0.3,
  // Kirkwood gaps (orbital resonances with Jupiter)
  kirkwoodGaps: [
  { au: 2.502, width: 0.04 }, // 3:1 resonance
  { au: 2.825, width: 0.03 }, // 5:2 resonance
  { au: 2.958, width: 0.02 }, // 7:3 resonance
  { au: 3.279, width: 0.03 } // 2:1 resonance
  ]
};

// Kuiper belt beyond Neptune (roughly 30 - 50 AU)
export const KUIPER_BELT = {
  innerAU: 30.0,
  outerAU: 50.0,
  centerAU: 40.0,
  count: 3600,
  visualScale: 1,
  maxInclination: 35,
  maxEccentricity: 0.35
};

// Named large asteroids with real orbital elements
export const NAMED_ASTEROIDS = [
{
  name: 'Ceres', type: 'Dwarf Planet', radiusScaled: 10,
  color: 0xc4b8a8, emissive: 0x625c54, glowColor: 0xc4b8a8,
  description: 'Largest object in the asteroid belt. Classified as a dwarf planet with a thin water-ice mantle.',
  a0: 2.7675, e0: 0.0758, I0: 10.59, L0: 60.0, LP0: 73.6, LN0: 80.3,
  meanDistanceAU: 2.768, meanDistanceKM: 413900000
},
{
  name: 'Vesta', type: 'Asteroid', radiusScaled: 7,
  color: 0xd4c8b0, emissive: 0x6a6458, glowColor: 0xd4c8b0,
  description: 'Second-largest asteroid. Has a giant impact crater at its south pole.',
  a0: 2.3615, e0: 0.0887, I0: 7.14, L0: 150.0, LP0: 149.8, LN0: 103.8,
  meanDistanceAU: 2.362, meanDistanceKM: 353200000
},
{
  name: 'Pallas', type: 'Asteroid', radiusScaled: 6,
  color: 0xb8b0a0, emissive: 0x5c5850, glowColor: 0xb8b0a0,
  description: 'Third-largest asteroid. Highly tilted orbit makes it difficult to visit.',
  a0: 2.7724, e0: 0.2313, I0: 34.84, L0: 310.0, LP0: 310.1, LN0: 173.1,
  meanDistanceAU: 2.773, meanDistanceKM: 414700000
},
{
  name: 'Hygiea', type: 'Asteroid', radiusScaled: 5,
  color: 0xa09888, emissive: 0x504c44, glowColor: 0xa09888,
  description: 'Fourth-largest asteroid. Nearly spherical, potentially a dwarf planet.',
  a0: 3.1421, e0: 0.1146, I0: 3.84, L0: 225.0, LP0: 312.3, LN0: 283.2,
  meanDistanceAU: 3.142, meanDistanceKM: 470000000
}];


// ---------------------------------------------------------------------------
// SPACECRAFT DATA - Real human-made objects in space
// ---------------------------------------------------------------------------
export const SPACECRAFT = [
{
  name: 'ISS', type: 'Space Station',
  orbit: 'Earth', orbitRadius: 75, orbitPeriodDays: 0.063, orbitInclination: 51.6,
  color: 0xffffff, emissive: 0x333333, size: 5,
  description: 'International Space Station. Continuously crewed since 2000, orbiting at ~408 km altitude at 7.66 km/s.',
  realDistanceKM: 408, phaseOffset: 0
},
{
  name: 'Hubble', type: 'Space Telescope',
  orbit: 'Earth', orbitRadius: 82, orbitPeriodDays: 0.066, orbitInclination: 28.5,
  color: 0xccccdd, emissive: 0x333344, size: 4,
  description: 'Hubble Space Telescope. Launched 1990, orbits at 547 km. Has observed galaxies 13.4 billion light-years away.',
  realDistanceKM: 547, phaseOffset: Math.PI * 0.7
},
{
  name: 'JWST', type: 'Space Telescope',
  orbit: 'L2', orbitOffset: 120,
  color: 0xddaa44, emissive: 0x665520, size: 5,
  description: 'James Webb Space Telescope. At Sun-Earth L2 point, 1.5 million km from Earth. Observes in infrared with a 6.5m gold mirror.',
  realDistanceKM: 1500000, phaseOffset: 0
},
{
  name: 'Voyager 1', type: 'Deep Space Probe',
  orbit: 'heliocentric',
  directionRA: 257.5, directionDec: 12.0,
  realDistanceAU: 163,
  visualDistanceAU: 48,
  color: 0xddddcc, emissive: 0x444433, size: 4,
  description: 'Voyager 1. Launched 1977, now ~163 AU from Sun in interstellar space. Carries the Golden Record.',
  realDistanceKM: 24400000000, phaseOffset: 0
},
{
  name: 'Voyager 2', type: 'Deep Space Probe',
  orbit: 'heliocentric',
  directionRA: 296.0, directionDec: -57.0,
  realDistanceAU: 137,
  visualDistanceAU: 42,
  color: 0xddddcc, emissive: 0x444433, size: 4,
  description: 'Voyager 2. Launched 1977, now ~137 AU from Sun. Only spacecraft to visit Uranus and Neptune.',
  realDistanceKM: 20500000000, phaseOffset: 0
}];


// ---------------------------------------------------------------------------
// NEARBY GALAXIES (equatorial RA/Dec, J2000 approximate)
// Rendered on a deep background sphere so relative sky positions are preserved.
// ---------------------------------------------------------------------------
export const GALAXIES = [
{
  name: 'Andromeda Galaxy (M31)',
  type: 'Spiral Galaxy',
  constellation: 'Andromeda',
  raDeg: 10.6847,
  decDeg: 41.2690,
  raText: '00h 42m 44s',
  decText: '+41d 16m',
  distanceLy: 2540000,
  color: 0xc7dcff,
  visualSize: 1250,
  description: 'Nearest major spiral galaxy to the Milky Way. Expected to merge with our galaxy in about 4.5 billion years.'
},
{
  name: 'Triangulum Galaxy (M33)',
  type: 'Spiral Galaxy',
  constellation: 'Triangulum',
  raDeg: 23.4621,
  decDeg: 30.6599,
  raText: '01h 33m 51s',
  decText: '+30d 39m',
  distanceLy: 2730000,
  color: 0xb9d0ff,
  visualSize: 980,
  description: 'Third-largest galaxy in the Local Group, after Andromeda and the Milky Way.'
},
{
  name: 'Large Magellanic Cloud',
  type: 'Barred Spiral Dwarf Galaxy',
  constellation: 'Dorado/Mensa',
  raDeg: 80.8942,
  decDeg: -69.7561,
  raText: '05h 23m 35s',
  decText: '-69d 45m',
  distanceLy: 163000,
  color: 0xa8c3ff,
  visualSize: 900,
  description: 'Satellite galaxy of the Milky Way containing intense star-forming regions such as the Tarantula Nebula.'
},
{
  name: 'Small Magellanic Cloud',
  type: 'Dwarf Irregular Galaxy',
  constellation: 'Tucana',
  raDeg: 13.1867,
  decDeg: -72.8286,
  raText: '00h 52m 45s',
  decText: '-72d 49m',
  distanceLy: 200000,
  color: 0x9eb8f2,
  visualSize: 760,
  description: 'Companion dwarf galaxy to the Milky Way and the Large Magellanic Cloud.'
},
{
  name: 'Bode\'s Galaxy (M81)',
  type: 'Grand Design Spiral Galaxy',
  constellation: 'Ursa Major',
  raDeg: 148.8882,
  decDeg: 69.0653,
  raText: '09h 55m 33s',
  decText: '+69d 04m',
  distanceLy: 11800000,
  color: 0xc9ddff,
  visualSize: 860,
  description: 'A bright nearby spiral galaxy with a massive central black hole and pronounced spiral arms.'
},
{
  name: 'Centaurus A (NGC 5128)',
  type: 'Lenticular / Active Galaxy',
  constellation: 'Centaurus',
  raDeg: 201.3651,
  decDeg: -43.0191,
  raText: '13h 25m 28s',
  decText: '-43d 01m',
  distanceLy: 12000000,
  color: 0xffc69f,
  visualSize: 900,
  description: 'Peculiar galaxy with a dark dust lane and a powerful active galactic nucleus.'
},
{
  name: 'Whirlpool Galaxy (M51)',
  type: 'Interacting Spiral Galaxy',
  constellation: 'Canes Venatici',
  raDeg: 202.4696,
  decDeg: 47.1952,
  raText: '13h 29m 53s',
  decText: '+47d 12m',
  distanceLy: 23000000,
  color: 0xbfd4ff,
  visualSize: 820,
  description: 'Classic face-on spiral interacting with companion galaxy NGC 5195.'
},
{
  name: 'Sombrero Galaxy (M104)',
  type: 'Unbarred Spiral Galaxy',
  constellation: 'Virgo',
  raDeg: 189.9975,
  decDeg: -11.6231,
  raText: '12h 40m 00s',
  decText: '-11d 37m',
  distanceLy: 31000000,
  color: 0xffd5b8,
  visualSize: 780,
  description: 'Edge-on galaxy known for its prominent dust lane and bright central bulge.'
}];


export const GALAXY_VISUAL_SCALE = 1.6;
