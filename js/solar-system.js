// ============================================================================
// solar-system.js - Solar System Planet Rendering for Space Flight Mode
// Heliocentric orbital model based on JPL "Approximate Positions of the Planets"
// ============================================================================

// ---------------------------------------------------------------------------
// PLANET DATA TABLE
// Keplerian elements (J2000 epoch) and rates per century from JPL
// https://ssd.jpl.nasa.gov/planets/approx_pos.html
// ---------------------------------------------------------------------------
const SOLAR_SYSTEM_PLANETS = [
  {
    name: 'Mercury', type: 'Terrestrial', color: 0xb0a090, emissive: 0x584c40,
    glowColor: 0xb0a090,
    radiusScaled: 22, meanDistanceAU: 0.387, meanDistanceKM: 57910000,
    description: 'Smallest planet, closest to the Sun. Extreme temperature swings.',
    a0: 0.38710, aRate: 0.00000,
    e0: 0.20563, eRate: 0.00002,
    I0: 7.005,   IRate: -0.0059,
    L0: 252.251, LRate: 149472.674,
    LP0: 77.457, LPRate: 0.160,
    LN0: 48.331, LNRate: -0.125
  },
  {
    name: 'Venus', type: 'Terrestrial', color: 0xe8c080, emissive: 0x745830,
    glowColor: 0xe8c080,
    radiusScaled: 35, meanDistanceAU: 0.723, meanDistanceKM: 108200000,
    description: 'Hottest planet due to runaway greenhouse effect. Thick toxic atmosphere.',
    a0: 0.72333, aRate: 0.00001,
    e0: 0.00677, eRate: -0.00005,
    I0: 3.395,   IRate: -0.0007,
    L0: 181.980, LRate: 58517.816,
    LP0: 131.564, LPRate: 0.300,
    LN0: 76.680, LNRate: -0.278
  },
  {
    name: 'Earth', type: 'Terrestrial', color: 0x2255bb, emissive: 0x142a5e,
    glowColor: 0x88ccff,
    radiusScaled: 36, meanDistanceAU: 1.000, meanDistanceKM: 149600000,
    description: 'Our home planet. The only known world with liquid surface water and life.',
    a0: 1.00000, aRate: -0.00001,
    e0: 0.01671, eRate: -0.00004,
    I0: 0.000,   IRate: -0.0001,
    L0: 100.464, LRate: 35999.373,
    LP0: 102.937, LPRate: 0.318,
    LN0: 0.0,    LNRate: 0.0
  },
  {
    name: 'Mars', type: 'Terrestrial', color: 0xcc4422, emissive: 0x662210,
    glowColor: 0xcc4422,
    radiusScaled: 28, meanDistanceAU: 1.524, meanDistanceKM: 227900000,
    description: 'The Red Planet. Has the tallest volcano and deepest canyon in the solar system.',
    a0: 1.52368, aRate: 0.00001,
    e0: 0.09340, eRate: 0.00008,
    I0: 1.850,   IRate: -0.0081,
    L0: 355.453, LRate: 19140.299,
    LP0: 336.060, LPRate: 0.448,
    LN0: 49.558, LNRate: -0.297
  },
  {
    name: 'Jupiter', type: 'Gas Giant', color: 0xd4a060, emissive: 0x6a5030,
    glowColor: 0xd4a060,
    radiusScaled: 90, meanDistanceAU: 5.203, meanDistanceKM: 778500000,
    description: 'Largest planet. Its Great Red Spot is a storm larger than Earth.',
    a0: 5.20260, aRate: -0.00036,
    e0: 0.04849, eRate: 0.00018,
    I0: 1.303,   IRate: -0.0019,
    L0: 34.351,  LRate: 3034.906,
    LP0: 14.331, LPRate: 0.218,
    LN0: 100.464, LNRate: 0.176
  },
  {
    name: 'Saturn', type: 'Gas Giant', color: 0xe8d090, emissive: 0x746840,
    glowColor: 0xe8d090,
    radiusScaled: 78, meanDistanceAU: 9.537, meanDistanceKM: 1427000000,
    description: 'Famous for its spectacular ring system. Least dense planet.',
    a0: 9.55491, aRate: -0.00121,
    e0: 0.05551, eRate: -0.00035,
    I0: 2.489,   IRate: 0.0049,
    L0: 50.077,  LRate: 1222.114,
    LP0: 93.057, LPRate: 0.565,
    LN0: 113.665, LNRate: -0.268
  },
  {
    name: 'Uranus', type: 'Ice Giant', color: 0x88ccdd, emissive: 0x446670,
    glowColor: 0x88ccdd,
    radiusScaled: 55, meanDistanceAU: 19.189, meanDistanceKM: 2871000000,
    description: 'Tilted on its side. Has faint rings and 27 known moons.',
    a0: 19.21845, aRate: -0.00152,
    e0: 0.04630, eRate: -0.00003,
    I0: 0.773,   IRate: -0.0024,
    L0: 314.055, LRate: 428.467,
    LP0: 173.005, LPRate: 0.082,
    LN0: 74.006, LNRate: 0.074
  },
  {
    name: 'Neptune', type: 'Ice Giant', color: 0x4466dd, emissive: 0x223370,
    glowColor: 0x4466dd,
    radiusScaled: 52, meanDistanceAU: 30.070, meanDistanceKM: 4498000000,
    description: 'Farthest planet. Has the strongest winds in the solar system.',
    a0: 30.11039, aRate: 0.00030,
    e0: 0.00899, eRate: 0.00001,
    I0: 1.770,   IRate: 0.0003,
    L0: 304.349, LRate: 218.486,
    LP0: 48.124, LPRate: -0.010,
    LN0: 131.784, LNRate: -0.023
  }
];

// ---------------------------------------------------------------------------
// HELIOCENTRIC VISUAL DISTANCES - Real proportional (AU-based)
// 1 AU = AU_TO_SCENE scene units. Distances are proportional to real semi-major axes.
// ---------------------------------------------------------------------------
const AU_TO_SCENE = 800; // 1 AU = 800 scene units

const HELIO_VISUAL_DIST = {
  Mercury: SOLAR_SYSTEM_PLANETS[0].a0 * AU_TO_SCENE,  // 0.387 AU = ~310
  Venus:   SOLAR_SYSTEM_PLANETS[1].a0 * AU_TO_SCENE,  // 0.723 AU = ~579
  Earth:   SOLAR_SYSTEM_PLANETS[2].a0 * AU_TO_SCENE,  // 1.000 AU = 800
  Mars:    SOLAR_SYSTEM_PLANETS[3].a0 * AU_TO_SCENE,  // 1.524 AU = ~1219
  Jupiter: SOLAR_SYSTEM_PLANETS[4].a0 * AU_TO_SCENE,  // 5.203 AU = ~4162
  Saturn:  SOLAR_SYSTEM_PLANETS[5].a0 * AU_TO_SCENE,  // 9.537 AU = ~7630
  Uranus:  SOLAR_SYSTEM_PLANETS[6].a0 * AU_TO_SCENE,  // 19.189 AU = ~15351
  Neptune: SOLAR_SYSTEM_PLANETS[7].a0 * AU_TO_SCENE   // 30.070 AU = ~24056
};

const MOON_ORBIT_RADIUS = 120; // Moon's visual orbit radius around Earth

// ---------------------------------------------------------------------------
// PLANET MOONS DATA
// ---------------------------------------------------------------------------
const PLANET_MOONS = {
  Earth: [
    { name: 'Moon', radiusScaled: 5, orbitRadius: 55, orbitDays: 27.3, color: 0xc8c8c8 }
  ],
  Mars: [
    { name: 'Phobos', radiusScaled: 2.5, orbitRadius: 38, orbitDays: 0.32, color: 0xa8947d },
    { name: 'Deimos', radiusScaled: 2, orbitRadius: 52, orbitDays: 1.26, color: 0xb19b84 }
  ],
  Jupiter: [
    { name: 'Io', radiusScaled: 5, orbitRadius: 95, orbitDays: 1.77, color: 0xe8d9b0 },
    { name: 'Europa', radiusScaled: 4.5, orbitRadius: 120, orbitDays: 3.55, color: 0xdad9cd },
    { name: 'Ganymede', radiusScaled: 5.5, orbitRadius: 150, orbitDays: 7.15, color: 0xbba98b },
    { name: 'Callisto', radiusScaled: 5, orbitRadius: 185, orbitDays: 16.69, color: 0x8b7d72 }
  ],
  Saturn: [
    { name: 'Titan', radiusScaled: 5.5, orbitRadius: 145, orbitDays: 15.95, color: 0xd8b97f },
    { name: 'Rhea', radiusScaled: 3, orbitRadius: 115, orbitDays: 4.52, color: 0xc3c3c3 }
  ],
  Uranus: [
    { name: 'Titania', radiusScaled: 4.2, orbitRadius: 100, orbitDays: 8.71, color: 0xb9c7d1 },
    { name: 'Oberon', radiusScaled: 3.8, orbitRadius: 125, orbitDays: 13.46, color: 0xa9b7c2 }
  ],
  Neptune: [
    { name: 'Triton', radiusScaled: 4.5, orbitRadius: 110, orbitDays: 5.88, color: 0xb8c8d8 }
  ]
};

// ---------------------------------------------------------------------------
// ASTEROID BELT DATA
// Main belt between Mars and Jupiter (2.2 - 3.2 AU)
// Kirkwood gaps at Jupiter orbital resonances
// ---------------------------------------------------------------------------
const ASTEROID_BELT = {
  innerAU: 2.06,    // inner edge
  outerAU: 3.27,    // outer edge
  centerAU: 2.7,    // belt center
  count: 3000,       // number of particle asteroids
  maxInclination: 20, // degrees - most belt asteroids
  maxEccentricity: 0.3,
  // Kirkwood gaps (orbital resonances with Jupiter)
  kirkwoodGaps: [
    { au: 2.502, width: 0.04 }, // 3:1 resonance
    { au: 2.825, width: 0.03 }, // 5:2 resonance
    { au: 2.958, width: 0.02 }, // 7:3 resonance
    { au: 3.279, width: 0.03 }  // 2:1 resonance
  ]
};

// Kuiper belt beyond Neptune (roughly 30 - 50 AU)
const KUIPER_BELT = {
  innerAU: 30.0,
  outerAU: 50.0,
  centerAU: 40.0,
  count: 1800,
  maxInclination: 35,
  maxEccentricity: 0.35
};

// Named large asteroids with real orbital elements
const NAMED_ASTEROIDS = [
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
  }
];

// ---------------------------------------------------------------------------
// SPACECRAFT DATA - Real human-made objects in space
// ---------------------------------------------------------------------------
const SPACECRAFT = [
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
  }
];

// ---------------------------------------------------------------------------
// SOLAR SYSTEM STATE
// ---------------------------------------------------------------------------
const solarSystem = {
  visible: true,
  group: null,          // THREE.Group holding Sun + planet meshes
  sunMesh: null,
  planetMeshes: [],     // { mesh, hitbox, label, planet, realPosition }
  moonMeshes: [],       // { mesh, planetMesh, orbitRadius, orbitDays, phaseOffset }
  orbitLines: [],
  asteroidBelt: null,   // THREE.Points particle system for belt
  kuiperBelt: null,     // THREE.Points particle system for Kuiper belt
  asteroidMeshes: [],   // named large asteroids { mesh, hitbox, asteroid, realPosition }
  spacecraftMeshes: [], // spacecraft { mesh, hitbox, spacecraft, orbitData }
  orbitMarkers: [],     // glowing markers showing current planet position on orbit
  orbitsVisible: true,  // toggle for active orbit display
  infoPanel: null,
  selectedPlanet: null,
  raycaster: null,
  mouse: null,
  MOON_TIME_SCALE: 8,   // Speed up moon orbits for visual effect
  SUN_SIZE: 100,        // Scaled up for visibility at proportional distances
  PROXIMITY_DIST: 200,  // distance to trigger proximity HUD
  _earthVisualPos: null, // cached Earth visual position for space.js
  initialized: false
};

// ---------------------------------------------------------------------------
// ORBITAL MECHANICS - JPL Keplerian model
// ---------------------------------------------------------------------------
var _SS_DEG2RAD = Math.PI / 180;

// J2000 epoch = Jan 1.5 2000 = JD 2451545.0
function dateToJulianCenturies(date) {
  const JD = (date.getTime() / 86400000) + 2440587.5;
  return (JD - 2451545.0) / 36525.0;
}

function normalizeAngle(deg) {
  let a = deg % 360;
  if (a < 0) a += 360;
  return a;
}

// Solve Kepler's equation M = E - e*sin(E) via Newton-Raphson
function solveKepler(M_deg, e) {
  const M = M_deg * _SS_DEG2RAD;
  let E = M + e * Math.sin(M); // initial guess
  for (let i = 0; i < 20; i++) {
    const dE = (M - (E - e * Math.sin(E))) / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  return E;
}

// Compute heliocentric ecliptic position in AU for given orbital elements
// Returns { x, y, z } in ecliptic frame (AU)
function computeOrbitalPosition(a, e, I, w, LN, M_deg) {
  const E = solveKepler(M_deg, e);

  // Heliocentric coords in orbital plane
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);

  // Rotate to ecliptic
  const wRad = w * _SS_DEG2RAD;
  const LNRad = LN * _SS_DEG2RAD;
  const IRad = I * _SS_DEG2RAD;

  const cosW = Math.cos(wRad), sinW = Math.sin(wRad);
  const cosLN = Math.cos(LNRad), sinLN = Math.sin(LNRad);
  const cosI = Math.cos(IRad), sinI = Math.sin(IRad);

  const x = (cosW * cosLN - sinW * sinLN * cosI) * xp +
            (-sinW * cosLN - cosW * sinLN * cosI) * yp;
  const y = (cosW * sinLN + sinW * cosLN * cosI) * xp +
            (-sinW * sinLN + cosW * cosLN * cosI) * yp;
  const z = (sinW * sinI) * xp + (cosW * sinI) * yp;

  return { x, y, z };
}

// Compute heliocentric position in AU for a given planet and date
function computePlanetPosition(planet, date) {
  const T = dateToJulianCenturies(date);

  const a  = planet.a0  + planet.aRate  * T;
  const e  = planet.e0  + planet.eRate  * T;
  const I  = planet.I0  + planet.IRate  * T;
  const L  = normalizeAngle(planet.L0  + planet.LRate  * T);
  const LP = normalizeAngle(planet.LP0 + planet.LPRate * T);
  const LN = normalizeAngle(planet.LN0 + planet.LNRate * T);

  const w = LP - LN;           // argument of perihelion
  const M = normalizeAngle(L - LP); // mean anomaly

  return computeOrbitalPosition(a, e, I, w, LN, M);
}

// ---------------------------------------------------------------------------
// ORBIT PATH COMPUTATION - Real elliptical paths from Keplerian elements
// ---------------------------------------------------------------------------

// Compute full orbit path points for a planet (array of scene-space Vector3)
function computeOrbitPath(planet, numPoints) {
  const T = dateToJulianCenturies(new Date());

  const a  = planet.a0  + planet.aRate  * T;
  const e  = planet.e0  + planet.eRate  * T;
  const I  = planet.I0  + planet.IRate  * T;
  const LP = normalizeAngle(planet.LP0 + planet.LPRate * T);
  const LN = normalizeAngle(planet.LN0 + planet.LNRate * T);
  const w  = LP - LN;

  // Scale factor: maps AU to scene units
  const visualDist = HELIO_VISUAL_DIST[planet.name] || 1000;
  const scale = visualDist / a;

  const points = [];
  for (let i = 0; i < numPoints; i++) {
    const M_deg = (i / numPoints) * 360;
    const pos = computeOrbitalPosition(a, e, I, w, LN, M_deg);

    // Convert AU to scene coords with same mapping as helioToScene
    points.push(new THREE.Vector3(
      pos.x * scale,
      pos.z * scale * 0.3,  // flatten vertical for readability
      pos.y * scale          // swap y/z for Three.js coordinate system
    ));
  }

  return points;
}

// ---------------------------------------------------------------------------
// HELIO TO SCENE - Proper scaling (preserves eccentricity)
// ---------------------------------------------------------------------------

// Convert heliocentric AU position to visual scene position
// Uses proportional scaling instead of normalization to preserve orbit shape
function helioToScene(realPos, visualDist, semiMajorAxis) {
  const a = semiMajorAxis || 1;
  const scale = visualDist / a;
  return {
    x: realPos.x * scale,
    y: realPos.z * scale * 0.3, // flatten vertical for readability
    z: realPos.y * scale         // swap y/z for Three.js coords
  };
}

// Earth's heliocentric position for distance calculations
// Named getEarthHelioPos to avoid collision with global `let earthPosition` in state.js
function getEarthHelioPos(date) {
  const earthData = SOLAR_SYSTEM_PLANETS[2]; // Earth is index 2
  return computePlanetPosition(earthData, date);
}

// Distance between two position vectors in AU
function distanceAU(pos1, pos2) {
  const dx = pos1.x - pos2.x;
  const dy = pos1.y - pos2.y;
  const dz = pos1.z - pos2.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ---------------------------------------------------------------------------
// INITIALIZATION
// ---------------------------------------------------------------------------
function initSolarSystem(spaceScene) {
  if (solarSystem.initialized) return;

  console.log('[SolarSystem] Initializing heliocentric model...');
  solarSystem.mouse = new THREE.Vector2();
  solarSystem.group = new THREE.Group();
  solarSystem.group.name = 'solarSystemGroup';
  solarSystem.raycaster = new THREE.Raycaster();

  // Sun at origin (center of solar system)
  const sunGeo = new THREE.SphereGeometry(solarSystem.SUN_SIZE, 32, 32);
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xffdd44 });
  solarSystem.sunMesh = new THREE.Mesh(sunGeo, sunMat);
  solarSystem.sunMesh.name = 'Sun';
  solarSystem.sunMesh.position.set(0, 0, 0);
  solarSystem.group.add(solarSystem.sunMesh);

  // Sun inner glow
  const glow1Geo = new THREE.SphereGeometry(solarSystem.SUN_SIZE * 1.5, 24, 24);
  const glow1Mat = new THREE.MeshBasicMaterial({
    color: 0xffaa22, transparent: true, opacity: 0.2, side: THREE.BackSide
  });
  solarSystem.sunMesh.add(new THREE.Mesh(glow1Geo, glow1Mat));

  // Sun outer glow (large, faint corona)
  const glow2Geo = new THREE.SphereGeometry(solarSystem.SUN_SIZE * 3, 24, 24);
  const glow2Mat = new THREE.MeshBasicMaterial({
    color: 0xff8800, transparent: true, opacity: 0.08, side: THREE.BackSide
  });
  solarSystem.sunMesh.add(new THREE.Mesh(glow2Geo, glow2Mat));

  // Sun point light - range covers full proportional solar system + deep space
  const sunLight = new THREE.PointLight(0xfff8e0, 0.8, 50000);
  solarSystem.sunMesh.add(sunLight);

  // Sun label
  createLabel('Sun', solarSystem.sunMesh, solarSystem.SUN_SIZE);

  // Create planet meshes (skip Earth - index 2 - it already exists in the scene)
  const now = new Date();
  const earthPos = getEarthHelioPos(now);

  SOLAR_SYSTEM_PLANETS.forEach((planet, i) => {
    if (planet.name === 'Earth') return; // skip, already in space flight scene

    const geo = new THREE.SphereGeometry(planet.radiusScaled, 24, 24);
    const mat = new THREE.MeshPhongMaterial({
      color: planet.color,
      emissive: planet.emissive,
      shininess: 30
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = planet.name;
    mesh.userData = { isPlanet: true, planetIndex: i };

    // Atmosphere / glow halo around each planet
    const glowGeo = new THREE.SphereGeometry(planet.radiusScaled * 1.4, 20, 20);
    const glowMat = new THREE.MeshBasicMaterial({
      color: planet.glowColor || planet.color,
      transparent: true,
      opacity: 0.15,
      side: THREE.BackSide
    });
    mesh.add(new THREE.Mesh(glowGeo, glowMat));

    // Saturn rings
    if (planet.name === 'Saturn') {
      const ringGeo = new THREE.RingGeometry(
        planet.radiusScaled * 1.3,
        planet.radiusScaled * 2.2,
        48
      );
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xccbb88, transparent: true, opacity: 0.6, side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI * 0.4;
      mesh.add(ring);
    }

    // Invisible hitbox for easier clicking (3x radius, min 50 units)
    const hitRadius = Math.max(planet.radiusScaled * 3, 50);
    const hitGeo = new THREE.SphereGeometry(hitRadius, 8, 8);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitbox = new THREE.Mesh(hitGeo, hitMat);
    hitbox.userData = { isPlanet: true, planetIndex: i };
    mesh.add(hitbox);

    // Label
    createLabel(planet.name, mesh, planet.radiusScaled);

    solarSystem.group.add(mesh);

    // Real heliocentric position (AU)
    const realPos = computePlanetPosition(planet, now);
    const distFromEarth = distanceAU(realPos, earthPos);

    solarSystem.planetMeshes.push({
      mesh,
      hitbox,
      planet,
      realPosition: realPos,
      distFromEarthAU: distFromEarth
    });
  });

  // ---------------------------------------------------------------------------
  // ORBIT PATH LINES - Real elliptical paths computed from Keplerian elements
  // ---------------------------------------------------------------------------
  solarSystem.orbitLines = [];
  solarSystem.orbitMarkers = [];
  SOLAR_SYSTEM_PLANETS.forEach(planet => {
    const visualDist = HELIO_VISUAL_DIST[planet.name];
    if (!visualDist) return;

    // Compute the full elliptical orbit path (128 points for smooth curve)
    const orbitPoints = computeOrbitPath(planet, 128);

    // Close the loop
    orbitPoints.push(orbitPoints[0].clone());

    const orbitGeo = new THREE.BufferGeometry().setFromPoints(orbitPoints);
    const orbitMat = new THREE.LineBasicMaterial({
      color: planet.color,
      transparent: true,
      opacity: 0.4,
      linewidth: 1
    });
    const orbitLine = new THREE.LineLoop(orbitGeo, orbitMat);
    orbitLine.name = planet.name + '_orbit';
    solarSystem.group.add(orbitLine);
    solarSystem.orbitLines.push(orbitLine);

    // Active orbit marker - glowing sphere that shows current position on orbit
    const markerSize = Math.max(planet.radiusScaled * 0.25, 5);
    const markerGeo = new THREE.SphereGeometry(markerSize, 12, 12);
    const markerMat = new THREE.MeshBasicMaterial({
      color: planet.color,
      transparent: true,
      opacity: 0.9
    });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.name = planet.name + '_orbitMarker';

    // Outer pulse glow ring
    const pulseGeo = new THREE.SphereGeometry(markerSize * 3, 10, 10);
    const pulseMat = new THREE.MeshBasicMaterial({
      color: planet.color,
      transparent: true,
      opacity: 0.2,
      side: THREE.BackSide
    });
    const pulse = new THREE.Mesh(pulseGeo, pulseMat);
    pulse.name = 'pulse';
    marker.add(pulse);

    solarSystem.group.add(marker);
    solarSystem.orbitMarkers.push({ mesh: marker, planet });
  });

  // ---------------------------------------------------------------------------
  // PLANET MOONS - Create moons as children of planet meshes
  // ---------------------------------------------------------------------------
  createMoonSystems();

  // ---------------------------------------------------------------------------
  // ASTEROID BELT - Particle system between Mars and Jupiter
  // ---------------------------------------------------------------------------
  createAsteroidBelt();

  // ---------------------------------------------------------------------------
  // KUIPER BELT - Particle system beyond Neptune (30 - 50 AU)
  // ---------------------------------------------------------------------------
  createKuiperBelt();

  // ---------------------------------------------------------------------------
  // SPACECRAFT - ISS, Hubble, JWST, Voyager 1 & 2
  // ---------------------------------------------------------------------------
  createSpacecraft();

  // Position all objects based on current date
  updateSolarSystemPositions(now);

  spaceScene.add(solarSystem.group);

  // Add Earth-orbiting and L2 spacecraft to the scene (not the group)
  // These need to track Earth's position, which is a direct scene child
  solarSystem.spacecraftMeshes.forEach(entry => {
    if (entry.orbitData.type === 'earthOrbit' || entry.orbitData.type === 'L2') {
      spaceScene.add(entry.mesh);
    }
  });

  // Create info panel
  createInfoPanel();

  // Create toggle button
  createToggleButton();

  // Add click listener for the space flight canvas
  if (spaceFlight.canvas) {
    spaceFlight.canvas.addEventListener('click', onSolarSystemClick);
  }

  solarSystem.initialized = true;
  console.log('[SolarSystem] Heliocentric model initialized with',
    solarSystem.planetMeshes.length, 'planets +',
    solarSystem.moonMeshes.length, 'moons +',
    solarSystem.asteroidMeshes.length, 'named asteroids +',
    ASTEROID_BELT.count, 'belt particles +',
    KUIPER_BELT.count, 'kuiper particles +',
    solarSystem.spacecraftMeshes.length, 'spacecraft + Sun');
}

// ---------------------------------------------------------------------------
// MOON SYSTEMS - Create moons as children of planet meshes
// ---------------------------------------------------------------------------
function createMoonSystems() {
  solarSystem.moonMeshes = [];

  solarSystem.planetMeshes.forEach(entry => {
    const moonConfig = PLANET_MOONS[entry.planet.name];
    if (!moonConfig) return;

    moonConfig.forEach((moon, index) => {
      // Moon sphere
      const moonGeo = new THREE.SphereGeometry(moon.radiusScaled, 14, 14);
      const moonMat = new THREE.MeshPhongMaterial({
        color: moon.color,
        emissive: 0x101010,
        shininess: 18
      });
      const moonMesh = new THREE.Mesh(moonGeo, moonMat);
      moonMesh.name = moon.name;
      entry.mesh.add(moonMesh);

      // Moon orbit ring around planet
      const moonOrbitGeo = new THREE.RingGeometry(moon.orbitRadius - 0.4, moon.orbitRadius + 0.4, 64);
      const moonOrbitMat = new THREE.MeshBasicMaterial({
        color: 0xcbd5e1,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide
      });
      const moonOrbit = new THREE.Mesh(moonOrbitGeo, moonOrbitMat);
      moonOrbit.rotation.x = -Math.PI / 2;
      entry.mesh.add(moonOrbit);

      solarSystem.moonMeshes.push({
        mesh: moonMesh,
        planetMesh: entry.mesh,
        orbitRadius: moon.orbitRadius,
        orbitDays: moon.orbitDays,
        radiusScaled: moon.radiusScaled,
        name: moon.name,
        phaseOffset: index * (Math.PI * 0.8)
      });
    });
  });
}

// ---------------------------------------------------------------------------
// ASTEROID BELT - Particle system + named large asteroids
// ---------------------------------------------------------------------------
function createAsteroidBelt() {
  const belt = ASTEROID_BELT;
  const positions = [];
  const colors = [];
  const sizes = [];

  // Seeded random for reproducible belt
  let seed = 42;
  function seededRandom() {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  // Check if a semi-major axis falls in a Kirkwood gap
  function isInKirkwoodGap(a) {
    for (let i = 0; i < belt.kirkwoodGaps.length; i++) {
      const gap = belt.kirkwoodGaps[i];
      if (Math.abs(a - gap.au) < gap.width) return true;
    }
    return false;
  }

  for (let i = 0; i < belt.count; i++) {
    // Random semi-major axis, rejecting Kirkwood gaps
    let a;
    do {
      a = belt.innerAU + seededRandom() * (belt.outerAU - belt.innerAU);
    } while (isInKirkwoodGap(a));

    // Orbital elements with realistic distributions
    const e = seededRandom() * belt.maxEccentricity * seededRandom(); // bias toward lower e
    const I = (seededRandom() - 0.5) * 2 * belt.maxInclination * seededRandom();
    const LN = seededRandom() * 360;
    const w = seededRandom() * 360;
    const M = seededRandom() * 360;

    // Compute position using real orbital mechanics
    const pos = computeOrbitalPosition(a, e, I, w, LN, M);

    // Convert to scene coordinates (same as helioToScene with AU_TO_SCENE)
    const x = pos.x * AU_TO_SCENE;
    const y = pos.z * AU_TO_SCENE * 0.3; // flatten vertical
    const z = pos.y * AU_TO_SCENE;       // swap y/z for Three.js

    positions.push(x, y, z);

    // Color variation (grays and browns)
    const brightness = 0.4 + seededRandom() * 0.5;
    const warmth = seededRandom() * 0.15;
    colors.push(brightness + warmth, brightness, brightness - warmth * 0.5);

    // Size variation (most are small, a few larger)
    const sizeRoll = seededRandom();
    sizes.push(sizeRoll < 0.9 ? 2.5 + seededRandom() * 3 : 5 + seededRandom() * 5);
  }

  const beltGeo = new THREE.BufferGeometry();
  beltGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  beltGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  beltGeo.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

  const beltMat = new THREE.PointsMaterial({
    size: 2.4,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    sizeAttenuation: false,
    depthWrite: false
  });

  solarSystem.asteroidBelt = new THREE.Points(beltGeo, beltMat);
  solarSystem.asteroidBelt.name = 'asteroidBelt';
  solarSystem.asteroidBelt.renderOrder = 3;
  solarSystem.group.add(solarSystem.asteroidBelt);

  // --- Asteroid belt boundary rings (inner and outer edge) ---
  createBeltBoundaryRing(belt.innerAU, 0xb48357, 'beltInnerEdge');
  createBeltBoundaryRing(belt.outerAU, 0xb48357, 'beltOuterEdge');

  // --- Named large asteroids as meshes ---
  createNamedAsteroids();
}

function createKuiperBelt() {
  const belt = KUIPER_BELT;
  const positions = [];
  const colors = [];
  const sizes = [];

  // Separate seed so Kuiper distribution is stable and distinct from asteroid belt
  let seed = 314159;
  function seededRandom() {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  for (let i = 0; i < belt.count; i++) {
    const a = belt.innerAU + seededRandom() * (belt.outerAU - belt.innerAU);
    const e = seededRandom() * belt.maxEccentricity * seededRandom();
    const I = (seededRandom() - 0.5) * 2 * belt.maxInclination * seededRandom();
    const LN = seededRandom() * 360;
    const w = seededRandom() * 360;
    const M = seededRandom() * 360;

    const pos = computeOrbitalPosition(a, e, I, w, LN, M);

    // Keep the same scene transform used elsewhere in the heliocentric model.
    const x = pos.x * AU_TO_SCENE;
    const y = pos.z * AU_TO_SCENE * 0.3;
    const z = pos.y * AU_TO_SCENE;

    positions.push(x, y, z);

    // Cooler color palette to visually separate Kuiper objects from rocky asteroids.
    const brightness = 0.45 + seededRandom() * 0.4;
    const iceTint = 0.12 + seededRandom() * 0.18;
    colors.push(brightness - iceTint * 0.2, brightness, brightness + iceTint);

    const sizeRoll = seededRandom();
    sizes.push(sizeRoll < 0.93 ? 1.6 + seededRandom() * 2.2 : 3.2 + seededRandom() * 3.0);
  }

  const beltGeo = new THREE.BufferGeometry();
  beltGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  beltGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  beltGeo.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

  const beltMat = new THREE.PointsMaterial({
    size: 1.9,
    vertexColors: true,
    transparent: true,
    opacity: 0.82,
    sizeAttenuation: false,
    depthWrite: false
  });

  solarSystem.kuiperBelt = new THREE.Points(beltGeo, beltMat);
  solarSystem.kuiperBelt.name = 'kuiperBelt';
  solarSystem.kuiperBelt.renderOrder = 3;
  solarSystem.group.add(solarSystem.kuiperBelt);

  // Boundary guide rings for context.
  createBeltBoundaryRing(belt.innerAU, 0x7baee0, 'kuiperInnerEdge');
  createBeltBoundaryRing(belt.outerAU, 0x7baee0, 'kuiperOuterEdge');
}

function createBeltBoundaryRing(radiusAU, color, name) {
  const radius = radiusAU * AU_TO_SCENE;
  const points = [];
  const segments = 128;
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(
      Math.cos(angle) * radius,
      0,
      Math.sin(angle) * radius
    ));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0.34,
    linewidth: 1
  });
  const ring = new THREE.LineLoop(geo, mat);
  ring.name = name;
  solarSystem.group.add(ring);
}

function createNamedAsteroids() {
  solarSystem.asteroidMeshes = [];
  const now = new Date();
  const earthPos = getEarthHelioPos(now);

  NAMED_ASTEROIDS.forEach((asteroid, i) => {
    // Irregular shape: slightly deformed sphere
    const geo = new THREE.SphereGeometry(asteroid.radiusScaled, 10, 8);
    // Deform vertices for rocky appearance
    const posArr = geo.attributes.position.array;
    for (let v = 0; v < posArr.length; v += 3) {
      const deform = 0.8 + Math.sin(v * 3.7) * 0.15 + Math.cos(v * 2.3) * 0.1;
      posArr[v] *= deform;
      posArr[v + 1] *= deform;
      posArr[v + 2] *= deform;
    }
    geo.computeVertexNormals();

    const mat = new THREE.MeshPhongMaterial({
      color: asteroid.color,
      emissive: asteroid.emissive,
      shininess: 10,
      flatShading: true
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = asteroid.name;
    mesh.userData = { isAsteroid: true, asteroidIndex: i };

    // Glow halo
    const glowGeo = new THREE.SphereGeometry(asteroid.radiusScaled * 1.3, 12, 12);
    const glowMat = new THREE.MeshBasicMaterial({
      color: asteroid.glowColor,
      transparent: true,
      opacity: 0.1,
      side: THREE.BackSide
    });
    mesh.add(new THREE.Mesh(glowGeo, glowMat));

    // Hitbox for clicking
    const hitRadius = Math.max(asteroid.radiusScaled * 4, 40);
    const hitGeo = new THREE.SphereGeometry(hitRadius, 6, 6);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitbox = new THREE.Mesh(hitGeo, hitMat);
    hitbox.userData = { isAsteroid: true, asteroidIndex: i };
    mesh.add(hitbox);

    // Label
    createLabel(asteroid.name, mesh, asteroid.radiusScaled);

    // Compute position from orbital elements
    const T = dateToJulianCenturies(now);
    const a = asteroid.a0;
    const e = asteroid.e0;
    const I_val = asteroid.I0;
    const LP = asteroid.LP0;
    const LN = asteroid.LN0;
    const w = LP - LN;
    const L = asteroid.L0;
    const M = normalizeAngle(L - LP);
    const realPos = computeOrbitalPosition(a, e, I_val, w, LN, M);

    const visualDist = a * AU_TO_SCENE;
    const scenePos = helioToScene(realPos, visualDist, a);
    mesh.position.set(scenePos.x, scenePos.y, scenePos.z);

    solarSystem.group.add(mesh);

    const distFromEarth = distanceAU(realPos, earthPos);
    solarSystem.asteroidMeshes.push({
      mesh,
      hitbox,
      asteroid,
      realPosition: realPos,
      distFromEarthAU: distFromEarth
    });
  });
}

// ---------------------------------------------------------------------------
// SPACECRAFT - Real human-made objects in space
// ---------------------------------------------------------------------------
function createSpacecraft() {
  solarSystem.spacecraftMeshes = [];

  SPACECRAFT.forEach((craft, i) => {
    let meshGroup;

    // Build distinctive mesh for each spacecraft type
    if (craft.name === 'ISS') {
      meshGroup = buildISSMesh(craft);
    } else if (craft.name === 'Hubble') {
      meshGroup = buildHubbleMesh(craft);
    } else if (craft.name === 'JWST') {
      meshGroup = buildJWSTMesh(craft);
    } else {
      meshGroup = buildVoyagerMesh(craft);
    }

    meshGroup.name = craft.name;
    meshGroup.userData = { isSpacecraft: true, spacecraftIndex: i };

    // Hitbox for clicking
    const hitRadius = Math.max(craft.size * 6, 30);
    const hitGeo = new THREE.SphereGeometry(hitRadius, 6, 6);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitbox = new THREE.Mesh(hitGeo, hitMat);
    hitbox.userData = { isSpacecraft: true, spacecraftIndex: i };
    meshGroup.add(hitbox);

    // Label
    createLabel(craft.name, meshGroup, craft.size * 2);

    // Position based on orbit type
    const orbitData = {};
    if (craft.orbit === 'Earth') {
      // Earth-orbiting: add to scene (not group), will track Earth position
      orbitData.type = 'earthOrbit';
      orbitData.radius = craft.orbitRadius;
      orbitData.periodDays = craft.orbitPeriodDays;
      orbitData.inclination = craft.orbitInclination * _SS_DEG2RAD;
      orbitData.phase = craft.phaseOffset;
      // Start at Earth's position (will be updated per frame)
      meshGroup.position.set(0, 0, 0);
    } else if (craft.orbit === 'L2') {
      // L2 point: positioned relative to Earth, away from Sun
      orbitData.type = 'L2';
      orbitData.offset = craft.orbitOffset;
      meshGroup.position.set(0, 0, 0);
    } else if (craft.orbit === 'heliocentric') {
      // Deep space: fixed position based on RA/Dec direction
      orbitData.type = 'deepSpace';
      const ra = craft.directionRA * _SS_DEG2RAD;
      const dec = craft.directionDec * _SS_DEG2RAD;
      const dist = craft.visualDistanceAU * AU_TO_SCENE;
      const x = dist * Math.cos(dec) * Math.cos(ra);
      const z = dist * Math.cos(dec) * Math.sin(ra);
      const y = dist * Math.sin(dec) * 0.3; // flatten vertical like planets
      meshGroup.position.set(x, y, z);
      solarSystem.group.add(meshGroup);
    }

    solarSystem.spacecraftMeshes.push({
      mesh: meshGroup,
      hitbox,
      spacecraft: craft,
      orbitData
    });
  });
}

// --- ISS: Cross-shaped station with solar arrays ---
function buildISSMesh(craft) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshPhongMaterial({
    color: craft.color, emissive: craft.emissive, shininess: 60
  });
  const panelMat = new THREE.MeshPhongMaterial({
    color: 0x223388, emissive: 0x111844, shininess: 40, side: THREE.DoubleSide
  });

  // Central module (pressurized modules)
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1, 6), bodyMat);
  group.add(body);

  // Truss (horizontal beam)
  const truss = new THREE.Mesh(new THREE.BoxGeometry(12, 0.3, 0.3), bodyMat);
  group.add(truss);

  // 4 solar panel arrays
  for (let side = -1; side <= 1; side += 2) {
    for (let pair = -1; pair <= 1; pair += 2) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.05, 4), panelMat);
      panel.position.set(side * 4.5, 0, pair * 1.2);
      group.add(panel);
    }
  }

  // Glow for visibility at distance
  const glowGeo = new THREE.SphereGeometry(craft.size * 2, 10, 10);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xffffee, transparent: true, opacity: 0.12, side: THREE.BackSide
  });
  group.add(new THREE.Mesh(glowGeo, glowMat));

  group.scale.setScalar(craft.size / 3);
  return group;
}

// --- Hubble: Cylinder body with solar wing panels ---
function buildHubbleMesh(craft) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshPhongMaterial({
    color: craft.color, emissive: craft.emissive, shininess: 50
  });
  const panelMat = new THREE.MeshPhongMaterial({
    color: 0x223366, emissive: 0x111833, shininess: 30, side: THREE.DoubleSide
  });

  // Cylindrical body
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 5, 12), bodyMat);
  body.rotation.z = Math.PI / 2;
  group.add(body);

  // Aperture door
  const door = new THREE.Mesh(new THREE.CircleGeometry(0.8, 12), bodyMat);
  door.position.x = 2.5;
  door.rotation.y = Math.PI / 2;
  group.add(door);

  // Two solar panels
  for (let side = -1; side <= 1; side += 2) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 5), panelMat);
    panel.position.set(0, side * 1.8, 0);
    group.add(panel);
  }

  // Glow
  const glowGeo = new THREE.SphereGeometry(craft.size * 2, 10, 10);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xccccff, transparent: true, opacity: 0.12, side: THREE.BackSide
  });
  group.add(new THREE.Mesh(glowGeo, glowMat));

  group.scale.setScalar(craft.size / 2.5);
  return group;
}

// --- JWST: Gold hexagonal sunshield + telescope ---
function buildJWSTMesh(craft) {
  const group = new THREE.Group();

  // Sunshield - hexagonal shape (gold)
  const shieldShape = new THREE.Shape();
  const hexR = 3;
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 - Math.PI / 6;
    const x = Math.cos(angle) * hexR;
    const y = Math.sin(angle) * hexR;
    if (i === 0) shieldShape.moveTo(x, y);
    else shieldShape.lineTo(x, y);
  }
  shieldShape.closePath();

  const shieldGeo = new THREE.ShapeGeometry(shieldShape);
  const shieldMat = new THREE.MeshPhongMaterial({
    color: 0xddaa22, emissive: 0x665510, shininess: 80, side: THREE.DoubleSide
  });
  const shield = new THREE.Mesh(shieldGeo, shieldMat);
  shield.rotation.x = -Math.PI / 2;
  group.add(shield);

  // Telescope mirror (smaller hexagon on top)
  const mirrorGeo = new THREE.CircleGeometry(1.2, 6);
  const mirrorMat = new THREE.MeshPhongMaterial({
    color: 0xeecc44, emissive: 0x776622, shininess: 100, side: THREE.DoubleSide
  });
  const mirror = new THREE.Mesh(mirrorGeo, mirrorMat);
  mirror.position.y = 1.5;
  mirror.rotation.x = -Math.PI / 2;
  group.add(mirror);

  // Support struts
  const strutMat = new THREE.MeshBasicMaterial({ color: 0x888888 });
  for (let i = 0; i < 3; i++) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 4), strutMat);
    const angle = (i / 3) * Math.PI * 2;
    strut.position.set(Math.cos(angle) * 0.8, 0.75, Math.sin(angle) * 0.8);
    group.add(strut);
  }

  // Glow (gold)
  const glowGeo = new THREE.SphereGeometry(craft.size * 2.5, 10, 10);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xddaa44, transparent: true, opacity: 0.15, side: THREE.BackSide
  });
  group.add(new THREE.Mesh(glowGeo, glowMat));

  group.scale.setScalar(craft.size / 3);
  return group;
}

// --- Voyager: High-gain antenna dish + instrument boom ---
function buildVoyagerMesh(craft) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshPhongMaterial({
    color: craft.color, emissive: craft.emissive, shininess: 30
  });

  // High-gain antenna dish
  const dishGeo = new THREE.ConeGeometry(2, 0.8, 16, 1, true);
  const dish = new THREE.Mesh(dishGeo, bodyMat);
  dish.rotation.x = Math.PI;
  group.add(dish);

  // Antenna feed (small cylinder at dish center)
  const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.2, 6), bodyMat);
  feed.position.y = 0.6;
  group.add(feed);

  // Bus body (small box beneath dish)
  const bus = new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 1), bodyMat);
  bus.position.y = -0.8;
  group.add(bus);

  // Instrument boom (long arm)
  const boomMat = new THREE.MeshBasicMaterial({ color: 0xaaaaaa });
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 5, 4), boomMat);
  boom.position.set(2.5, -0.5, 0);
  boom.rotation.z = Math.PI / 2;
  group.add(boom);

  // RTG power source (cylinder at end of boom)
  const rtg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1, 6), bodyMat);
  rtg.position.set(5, -0.5, 0);
  rtg.rotation.z = Math.PI / 2;
  group.add(rtg);

  // Glow for distant visibility
  const glowGeo = new THREE.SphereGeometry(craft.size * 3, 10, 10);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xffffcc, transparent: true, opacity: 0.15, side: THREE.BackSide
  });
  group.add(new THREE.Mesh(glowGeo, glowMat));

  group.scale.setScalar(craft.size / 2);
  return group;
}

// --- Update spacecraft positions each frame ---
function updateSpacecraftPositions() {
  if (!solarSystem.spacecraftMeshes.length) return;

  const elapsedDays = Date.now() / 86400000;

  // Get Earth's scene position (Earth is a direct scene child, not in the group)
  let earthPos = null;
  if (window.spaceFlight && spaceFlight.earth) {
    earthPos = spaceFlight.earth.position;
  }

  // Get Sun's position for L2 calculation (anti-Sun direction from Earth)
  const sunWorldPos = solarSystem.group ? solarSystem.group.position : new THREE.Vector3(0, 0, 0);

  solarSystem.spacecraftMeshes.forEach(entry => {
    const od = entry.orbitData;

    if (od.type === 'earthOrbit' && earthPos) {
      // Orbit around Earth
      const angularSpeed = (Math.PI * 2) / od.periodDays;
      const theta = od.phase + elapsedDays * angularSpeed * solarSystem.MOON_TIME_SCALE;
      const cosInc = Math.cos(od.inclination);
      const sinInc = Math.sin(od.inclination);

      const localX = Math.cos(theta) * od.radius;
      const localZ = Math.sin(theta) * od.radius;
      const localY = Math.sin(theta) * od.radius * sinInc * 0.15;

      entry.mesh.position.set(
        earthPos.x + localX,
        earthPos.y + localY,
        earthPos.z + localZ
      );

      // Slow tumble
      entry.mesh.rotation.y += 0.01;
    } else if (od.type === 'L2' && earthPos) {
      // L2 point: opposite direction from Sun relative to Earth
      const toSun = new THREE.Vector3().subVectors(sunWorldPos, earthPos);
      if (toSun.length() > 0) {
        toSun.normalize();
      } else {
        toSun.set(-1, 0, 0);
      }
      // L2 is in the anti-Sun direction from Earth
      entry.mesh.position.set(
        earthPos.x - toSun.x * od.offset,
        earthPos.y - toSun.y * od.offset + 5,
        earthPos.z - toSun.z * od.offset
      );
      // Slow rotation to show sunshield
      entry.mesh.rotation.y += 0.003;
    } else if (od.type === 'deepSpace') {
      // Static position in the solar system group - just tumble slowly
      entry.mesh.rotation.y += 0.002;
    }
  });
}

// ---------------------------------------------------------------------------
// UPDATE MOON POSITIONS
// ---------------------------------------------------------------------------
function updateMoonPositions(date) {
  if (!solarSystem.moonMeshes.length) return;

  const elapsedDays = date.getTime() / 86400000;
  solarSystem.moonMeshes.forEach(moon => {
    const angularSpeed = (Math.PI * 2) / moon.orbitDays;
    const theta = moon.phaseOffset + elapsedDays * angularSpeed * solarSystem.MOON_TIME_SCALE;
    const localX = Math.cos(theta) * moon.orbitRadius;
    const localZ = Math.sin(theta) * moon.orbitRadius;
    const localY = Math.sin(theta * 0.55) * moon.orbitRadius * 0.08;

    moon.mesh.position.set(localX, localY, localZ);
  });
}

// ---------------------------------------------------------------------------
// TEXT LABELS (using canvas texture -> sprite)
// ---------------------------------------------------------------------------
function createLabel(text, parentMesh, objectRadius) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  // Background pill for readability
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  const textWidth = 40 + text.length * 28;
  const pillX = (512 - textWidth) / 2;
  ctx.beginPath();
  ctx.roundRect(pillX, 20, textWidth, 88, 16);
  ctx.fill();

  // Text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px Orbitron, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 64);

  const texture = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false
  });
  const sprite = new THREE.Sprite(spriteMat);
  const labelScale = Math.max(objectRadius * 5, 80);
  sprite.scale.set(labelScale, labelScale * 0.25, 1);
  sprite.position.y = objectRadius * 1.8;
  sprite.name = text + '_label';
  parentMesh.add(sprite);
}

// ---------------------------------------------------------------------------
// UPDATE POSITIONS - Heliocentric model (all positions relative to Sun)
// ---------------------------------------------------------------------------
function updateSolarSystemPositions(date) {
  if (!solarSystem.group) return;

  // Sun stays at origin (center of solar system)
  solarSystem.sunMesh.position.set(0, 0, 0);

  const earthPos = getEarthHelioPos(date);

  // Position each planet relative to Sun using heliocentric coordinates
  solarSystem.planetMeshes.forEach(entry => {
    const planet = entry.planet;
    const realPos = computePlanetPosition(planet, date);
    entry.realPosition = realPos;
    entry.distFromEarthAU = distanceAU(realPos, earthPos);

    // Heliocentric: proper scaling preserving orbital eccentricity
    const visualDist = HELIO_VISUAL_DIST[planet.name] || 1000;
    const scenePos = helioToScene(realPos, visualDist, planet.a0);
    entry.mesh.position.set(scenePos.x, scenePos.y, scenePos.z);
  });

  // Update orbit markers to match planet positions
  solarSystem.orbitMarkers.forEach(entry => {
    const planet = entry.planet;
    const realPos = computePlanetPosition(planet, date);
    const visualDist = HELIO_VISUAL_DIST[planet.name] || 1000;
    const scenePos = helioToScene(realPos, visualDist, planet.a0);
    entry.mesh.position.set(scenePos.x, scenePos.y, scenePos.z);
  });

  // Store Earth's visual position for space.js to use
  const earthScenePos = helioToScene(earthPos, HELIO_VISUAL_DIST.Earth, SOLAR_SYSTEM_PLANETS[2].a0);
  solarSystem._earthVisualPos = earthScenePos;
}

// ---------------------------------------------------------------------------
// HELIOCENTRIC POSITION QUERIES (used by space.js)
// ---------------------------------------------------------------------------

// Get Earth's current visual position in the scene
function getEarthHelioScenePosition() {
  if (solarSystem._earthVisualPos) {
    return new THREE.Vector3(
      solarSystem._earthVisualPos.x,
      solarSystem._earthVisualPos.y,
      solarSystem._earthVisualPos.z
    );
  }
  // Fallback: compute from scratch
  const now = new Date();
  const earthPos = getEarthHelioPos(now);
  const scenePos = helioToScene(earthPos, HELIO_VISUAL_DIST.Earth, SOLAR_SYSTEM_PLANETS[2].a0);
  return new THREE.Vector3(scenePos.x, scenePos.y, scenePos.z);
}

// Get Moon's visual position orbiting Earth
function getMoonScenePosition(earthPos) {
  const period = 27.3 * 24 * 3600 * 1000; // ~27.3 days in ms
  const angle = (Date.now() / period) * 2 * Math.PI;
  return new THREE.Vector3(
    earthPos.x + Math.cos(angle) * MOON_ORBIT_RADIUS,
    earthPos.y + 20,
    earthPos.z + Math.sin(angle) * MOON_ORBIT_RADIUS
  );
}

// Get all space bodies with world positions and radii (for collision detection)
function getAllSpaceBodies() {
  const bodies = [];

  // Sun
  if (solarSystem.sunMesh && solarSystem.group) {
    bodies.push({
      name: 'Sun',
      position: solarSystem.sunMesh.position.clone().add(solarSystem.group.position),
      radius: solarSystem.SUN_SIZE,
      mesh: solarSystem.sunMesh,
      landable: false
    });
  }

  // Solar system planets (not Earth/Moon - those are separate)
  if (solarSystem.group) {
    solarSystem.planetMeshes.forEach(entry => {
      bodies.push({
        name: entry.planet.name,
        position: entry.mesh.position.clone().add(solarSystem.group.position),
        radius: entry.planet.radiusScaled,
        mesh: entry.mesh,
        landable: false
      });
    });

    // Planet moons (world position = group.pos + planet.pos + moon local pos)
    solarSystem.moonMeshes.forEach(entry => {
      const worldPos = new THREE.Vector3();
      entry.mesh.getWorldPosition(worldPos);
      bodies.push({
        name: entry.name,
        position: worldPos,
        radius: entry.radiusScaled,
        mesh: entry.mesh,
        landable: false
      });
    });

    // Named asteroids
    solarSystem.asteroidMeshes.forEach(entry => {
      bodies.push({
        name: entry.asteroid.name,
        position: entry.mesh.position.clone().add(solarSystem.group.position),
        radius: entry.asteroid.radiusScaled,
        mesh: entry.mesh,
        landable: false
      });
    });
  }

  // Spacecraft (positioned in scene or group depending on orbit type)
  solarSystem.spacecraftMeshes.forEach(entry => {
    const pos = entry.orbitData.type === 'deepSpace'
      ? entry.mesh.position.clone().add(solarSystem.group.position)
      : entry.mesh.position.clone();
    bodies.push({
      name: entry.spacecraft.name,
      position: pos,
      radius: entry.spacecraft.size,
      mesh: entry.mesh,
      landable: false
    });
  });

  // Earth (direct scene child, not in group)
  if (window.spaceFlight && spaceFlight.earth) {
    bodies.push({
      name: 'Earth',
      position: spaceFlight.earth.position.clone(),
      radius: typeof SPACE_CONSTANTS !== 'undefined' ? SPACE_CONSTANTS.EARTH_SIZE : 50,
      mesh: spaceFlight.earth,
      landable: true
    });
  }

  // Moon (direct scene child, not in group)
  if (window.spaceFlight && spaceFlight.moon) {
    bodies.push({
      name: 'Moon',
      position: spaceFlight.moon.position.clone(),
      radius: typeof SPACE_CONSTANTS !== 'undefined' ? SPACE_CONSTANTS.MOON_SIZE : 13.5,
      mesh: spaceFlight.moon,
      landable: true
    });
  }

  return bodies;
}

// ---------------------------------------------------------------------------
// Position solar system group (heliocentric: Sun at center)
// Called from space.js
// ---------------------------------------------------------------------------
function setSolarSystemCenter(position) {
  if (!solarSystem.group) return;
  solarSystem.group.position.set(0, 0, 0);
}

// ---------------------------------------------------------------------------
// CLICK HANDLING / RAYCASTING
// ---------------------------------------------------------------------------
function onSolarSystemClick(event) {
  if (!spaceFlight.active || !solarSystem.visible || !solarSystem.group) return;

  solarSystem.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  solarSystem.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  solarSystem.raycaster.setFromCamera(solarSystem.mouse, spaceFlight.camera);

  // Collect all clickable objects (meshes + hitboxes)
  const clickables = [];
  solarSystem.planetMeshes.forEach(entry => {
    clickables.push(entry.mesh);
    clickables.push(entry.hitbox);
  });
  // Named asteroids
  solarSystem.asteroidMeshes.forEach(entry => {
    clickables.push(entry.mesh);
    clickables.push(entry.hitbox);
  });
  // Spacecraft
  solarSystem.spacecraftMeshes.forEach(entry => {
    clickables.push(entry.mesh);
    clickables.push(entry.hitbox);
  });
  // Also test Sun
  clickables.push(solarSystem.sunMesh);

  const intersects = solarSystem.raycaster.intersectObjects(clickables, true);

  if (intersects.length > 0) {
    const hit = intersects[0].object;
    // Walk up to find planet, asteroid, or spacecraft data
    let target = hit;
    while (target && !target.userData.isPlanet && !target.userData.isAsteroid && !target.userData.isSpacecraft && target.parent) {
      target = target.parent;
    }

    if (target && target.userData.isPlanet) {
      const idx = target.userData.planetIndex;
      const entry = solarSystem.planetMeshes.find(e => e.planet === SOLAR_SYSTEM_PLANETS[idx]);
      if (entry) showPlanetInfo(entry);
    } else if (target && target.userData.isAsteroid) {
      const idx = target.userData.asteroidIndex;
      const entry = solarSystem.asteroidMeshes.find(e => e.asteroid === NAMED_ASTEROIDS[idx]);
      if (entry) showAsteroidInfo(entry);
    } else if (target && target.userData.isSpacecraft) {
      const idx = target.userData.spacecraftIndex;
      const entry = solarSystem.spacecraftMeshes.find(e => e.spacecraft === SPACECRAFT[idx]);
      if (entry) showSpacecraftInfo(entry);
    } else if (hit === solarSystem.sunMesh || hit.parent === solarSystem.sunMesh) {
      showSunInfo();
    }
  } else {
    // Click on empty space hides the panel
    hidePlanetInfo();
  }
}

// ---------------------------------------------------------------------------
// INFO PANEL UI
// ---------------------------------------------------------------------------
function createInfoPanel() {
  const panel = document.createElement('div');
  panel.id = 'solarSystemInfo';
  panel.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: rgba(10, 10, 30, 0.95);
    border: 2px solid #667eea;
    border-radius: 12px;
    padding: 20px;
    color: #fff;
    font-family: Orbitron, sans-serif;
    font-size: 12px;
    z-index: 10001;
    display: none;
    min-width: 280px;
    max-width: 320px;
    line-height: 1.6;
    box-shadow: 0 8px 32px rgba(102, 126, 234, 0.3);
  `;
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div id="ssInfoTitle" style="font-size:18px;color:#667eea;font-weight:700;"></div>
      <button id="ssInfoClose" style="background:none;border:none;color:#667eea;font-size:20px;cursor:pointer;padding:0 4px;">x</button>
    </div>
    <div id="ssInfoType" style="margin-bottom:8px;color:#10b981;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:1px;"></div>
    <div id="ssInfoDesc" style="margin-bottom:12px;color:#94a3b8;font-family:Inter,sans-serif;font-size:12px;"></div>
    <div style="background:rgba(102,126,234,0.15);border-radius:8px;padding:12px;margin-bottom:0;">
      <div style="font-size:10px;opacity:0.7;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">ORBITAL DATA</div>
      <div style="margin-bottom:6px;">Mean Distance: <span id="ssInfoDistAU" style="color:#fbbf24;font-weight:600;"></span></div>
      <div style="margin-bottom:6px;">Mean Distance: <span id="ssInfoDistKM" style="color:#fbbf24;font-weight:600;"></span></div>
      <div>Current from Earth: <span id="ssInfoDistEarth" style="color:#0fc;font-weight:600;"></span></div>
    </div>
  `;
  document.body.appendChild(panel);
  solarSystem.infoPanel = panel;

  document.getElementById('ssInfoClose').addEventListener('click', hidePlanetInfo);
}

function showPlanetInfo(entry) {
  const planet = entry.planet;
  const now = new Date();
  const earthPos = getEarthHelioPos(now);
  const distEarth = distanceAU(entry.realPosition, earthPos);
  const distEarthKM = distEarth * 149597870.7;

  document.getElementById('ssInfoTitle').textContent = planet.name;
  document.getElementById('ssInfoType').textContent = planet.type;
  document.getElementById('ssInfoDesc').textContent = planet.description;
  document.getElementById('ssInfoDistAU').textContent = planet.meanDistanceAU.toFixed(3) + ' AU';
  document.getElementById('ssInfoDistKM').textContent = formatKM(planet.meanDistanceKM) + ' km';
  document.getElementById('ssInfoDistEarth').textContent =
    distEarth.toFixed(3) + ' AU (' + formatKM(distEarthKM) + ' km)';

  solarSystem.infoPanel.style.display = 'block';
  solarSystem.selectedPlanet = entry;

  // Highlight selected planet
  solarSystem.planetMeshes.forEach(e => {
    if (e.mesh.children) {
      e.mesh.children.forEach(c => {
        if (c.name && c.name.endsWith('_label') && c.material) {
          c.material.opacity = (e === entry) ? 1.0 : 0.7;
        }
      });
    }
  });
}

function showSunInfo() {
  document.getElementById('ssInfoTitle').textContent = 'Sun';
  document.getElementById('ssInfoType').textContent = 'G-type Main Sequence Star';
  document.getElementById('ssInfoDesc').textContent =
    'Our star. Contains 99.86% of the solar system\'s mass. Surface temperature ~5,500\u00B0C.';
  document.getElementById('ssInfoDistAU').textContent = '0 AU (center)';
  document.getElementById('ssInfoDistKM').textContent = '0 km';

  const now = new Date();
  const earthPos = getEarthHelioPos(now);
  const distSun = Math.sqrt(earthPos.x * earthPos.x + earthPos.y * earthPos.y + earthPos.z * earthPos.z);
  const distSunKM = distSun * 149597870.7;
  document.getElementById('ssInfoDistEarth').textContent =
    distSun.toFixed(3) + ' AU (' + formatKM(distSunKM) + ' km)';

  solarSystem.infoPanel.style.display = 'block';
  solarSystem.selectedPlanet = null;
}

function showAsteroidInfo(entry) {
  const asteroid = entry.asteroid;
  const now = new Date();
  const earthPos = getEarthHelioPos(now);
  const distEarth = distanceAU(entry.realPosition, earthPos);
  const distEarthKM = distEarth * 149597870.7;

  document.getElementById('ssInfoTitle').textContent = asteroid.name;
  document.getElementById('ssInfoType').textContent = asteroid.type + ' (Asteroid Belt)';
  document.getElementById('ssInfoDesc').textContent = asteroid.description;
  document.getElementById('ssInfoDistAU').textContent = asteroid.meanDistanceAU.toFixed(3) + ' AU';
  document.getElementById('ssInfoDistKM').textContent = formatKM(asteroid.meanDistanceKM) + ' km';
  document.getElementById('ssInfoDistEarth').textContent =
    distEarth.toFixed(3) + ' AU (' + formatKM(distEarthKM) + ' km)';

  solarSystem.infoPanel.style.display = 'block';
  solarSystem.selectedPlanet = entry; // reuse for distance updates
}

function showSpacecraftInfo(entry) {
  const craft = entry.spacecraft;
  document.getElementById('ssInfoTitle').textContent = craft.name;
  document.getElementById('ssInfoType').textContent = craft.type;
  document.getElementById('ssInfoDesc').textContent = craft.description;

  if (craft.orbit === 'heliocentric') {
    document.getElementById('ssInfoDistAU').textContent = craft.realDistanceAU + ' AU (actual)';
  } else if (craft.orbit === 'L2') {
    document.getElementById('ssInfoDistAU').textContent = 'Sun-Earth L2 Point';
  } else {
    document.getElementById('ssInfoDistAU').textContent = craft.realDistanceKM + ' km altitude';
  }

  document.getElementById('ssInfoDistKM').textContent = formatKM(craft.realDistanceKM) + ' km from Earth';

  // Compute visual scene distance from rocket
  if (spaceFlight.rocket) {
    const dist = Math.floor(spaceFlight.rocket.position.distanceTo(entry.mesh.position));
    document.getElementById('ssInfoDistEarth').textContent = dist + ' (scene distance)';
  } else {
    document.getElementById('ssInfoDistEarth').textContent = '---';
  }

  solarSystem.infoPanel.style.display = 'block';
  solarSystem.selectedPlanet = null; // no AU distance updates for spacecraft
}

function hidePlanetInfo() {
  if (solarSystem.infoPanel) {
    solarSystem.infoPanel.style.display = 'none';
  }
  solarSystem.selectedPlanet = null;
}

function formatKM(km) {
  if (km >= 1e9) return (km / 1e9).toFixed(1) + 'B';
  if (km >= 1e6) return (km / 1e6).toFixed(1) + 'M';
  if (km >= 1e3) return (km / 1e3).toFixed(0) + 'K';
  return Math.round(km).toString();
}

function setSpaceLandingButtonText(text) {
  const landBtn = document.getElementById('sfLandBtn');
  if (!landBtn) return;
  landBtn.textContent = text;
}

function triggerSpaceLanding(text) {
  const landBtn = document.getElementById('sfLandBtn');
  if (!landBtn) return;
  landBtn.textContent = text;
  landBtn.disabled = false;
  landBtn.style.opacity = '1';
  landBtn.click();
}

function handleSpaceReturnAction() {
  // If already on the moon, use the existing direct return flow.
  if (typeof onMoon !== 'undefined' && onMoon) {
    if (typeof returnToEarth === 'function') returnToEarth();
    return;
  }

  // In space flight, run direct transfer/landing back to Earth.
  if (window.spaceFlight && window.spaceFlight.active) {
    if (typeof forceSpaceFlightLanding === 'function') {
      const forced = forceSpaceFlightLanding('Earth');
      if (forced) return;
    }
    if (typeof setSpaceFlightLandingTarget === 'function') {
      const handled = setSpaceFlightLandingTarget('Earth', { force: true, autoLand: true });
      if (handled) return;
    }
    window.spaceFlight.destination = 'earth';
    triggerSpaceLanding('LAND ON EARTH');
    return;
  }

  if (typeof returnToEarth === 'function') returnToEarth();
}

function handleMoonLandingAction() {
  if (window.spaceFlight && window.spaceFlight.active) {
    if (typeof forceSpaceFlightLanding === 'function') {
      const forced = forceSpaceFlightLanding('Moon');
      if (forced) return;
    }
    if (typeof setSpaceFlightLandingTarget === 'function') {
      const handled = setSpaceFlightLandingTarget('Moon', { force: true, autoLand: true });
      if (handled) return;
    }
    window.spaceFlight.destination = 'moon';
    triggerSpaceLanding('LAND ON MOON');
    return;
  }

  if (typeof directTravelToMoon === 'function' && !(typeof travelingToMoon !== 'undefined' && travelingToMoon)) {
    directTravelToMoon();
  }
}

// ---------------------------------------------------------------------------
// TOGGLE BUTTON
// ---------------------------------------------------------------------------
function createToggleButton() {
  // Container for toggle buttons
  const container = document.createElement('div');
  container.id = 'ssToggleContainer';
  container.style.cssText = `
    position: fixed;
    top: 20px;
    left: 20px;
    display: none;
    flex-direction: column;
    gap: 6px;
    z-index: 10001;
  `;

  // Primary action: return to Earth
  const btn = document.createElement('button');
  btn.id = 'solarSystemToggle';
  btn.className = 'ssToggleBtn';
  btn.style.cssText = `
    background: rgba(10, 10, 30, 0.9);
    border: 2px solid #3b82f6;
    border-radius: 8px;
    padding: 8px 14px;
    color: #fff;
    font-family: Orbitron, sans-serif;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  `;
  btn.textContent = 'RETURN TO EARTH';
  btn.addEventListener('click', handleSpaceReturnAction);
  container.appendChild(btn);

  // Secondary action: land on Moon
  const orbitBtn = document.createElement('button');
  orbitBtn.id = 'orbitsToggle';
  orbitBtn.className = 'ssToggleBtn';
  orbitBtn.style.cssText = `
    background: rgba(10, 10, 30, 0.9);
    border: 2px solid #10b981;
    border-radius: 8px;
    padding: 8px 14px;
    color: #fff;
    font-family: Orbitron, sans-serif;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  `;
  orbitBtn.textContent = 'LAND ON MOON';
  orbitBtn.addEventListener('click', handleMoonLandingAction);
  container.appendChild(orbitBtn);

  document.body.appendChild(container);
}

function toggleSolarSystem() {
  handleSpaceReturnAction();
}

function toggleOrbits() {
  handleMoonLandingAction();
}

// ---------------------------------------------------------------------------
// SHOW/HIDE (called when entering/exiting space flight)
// ---------------------------------------------------------------------------
function showSolarSystemUI() {
  const container = document.getElementById('ssToggleContainer');
  if (container) container.style.display = 'flex';
  const returnBtn = document.getElementById('solarSystemToggle');
  const landMoonBtn = document.getElementById('orbitsToggle');
  if (returnBtn) returnBtn.textContent = 'RETURN TO EARTH';
  if (landMoonBtn) landMoonBtn.textContent = 'LAND ON MOON';
}

function hideSolarSystemUI() {
  const container = document.getElementById('ssToggleContainer');
  if (container) container.style.display = 'none';
  hidePlanetInfo();
}

// ---------------------------------------------------------------------------
// PER-FRAME UPDATE (called from animateSpaceFlight)
// ---------------------------------------------------------------------------
function updateSolarSystem() {
  if (!solarSystem.group || !solarSystem.visible) return;

  // One-time log to confirm the solar system is running
  if (!solarSystem._loggedActive) {
    console.log('[SolarSystem] Active - rendering', solarSystem.planetMeshes.length, 'planets');
    solarSystem._loggedActive = true;
  }

  // Update positions every ~60 frames (once per second at 60fps)
  if (!solarSystem._frameCount) solarSystem._frameCount = 0;
  solarSystem._frameCount++;
  if (solarSystem._frameCount % 60 === 0) {
    updateSolarSystemPositions(new Date());
  }

  // Update moon orbital positions
  updateMoonPositions(new Date());

  // Update spacecraft positions (Earth-orbiting + L2)
  updateSpacecraftPositions();

  // Slow rotation for visual interest
  solarSystem.planetMeshes.forEach(entry => {
    entry.mesh.rotation.y += 0.002;
  });
  solarSystem.asteroidMeshes.forEach(entry => {
    entry.mesh.rotation.y += 0.005;
    entry.mesh.rotation.x += 0.003;
  });
  if (solarSystem.sunMesh) {
    solarSystem.sunMesh.rotation.y += 0.001;
  }

  // Animate orbit markers (pulsing glow)
  if (solarSystem.orbitsVisible) {
    const pulseT = Date.now() * 0.003;
    solarSystem.orbitMarkers.forEach(entry => {
      const pulse = entry.mesh.getObjectByName('pulse');
      if (pulse) {
        const scale = 1.0 + Math.sin(pulseT) * 0.4;
        pulse.scale.setScalar(scale);
        pulse.material.opacity = 0.15 + Math.sin(pulseT) * 0.1;
      }
    });
  }

  // Proximity detection - show planet name when rocket is nearby
  updateProximityHUD();

  // Update info panel distance if a planet is selected
  if (solarSystem.selectedPlanet && solarSystem.infoPanel.style.display !== 'none') {
    const now = new Date();
    const ep = getEarthHelioPos(now);
    const dist = distanceAU(solarSystem.selectedPlanet.realPosition, ep);
    const distKM = dist * 149597870.7;
    const el = document.getElementById('ssInfoDistEarth');
    if (el) {
      el.textContent = dist.toFixed(3) + ' AU (' + formatKM(distKM) + ' km)';
    }
  }
}

// ---------------------------------------------------------------------------
// PROXIMITY HUD - shows planet name/distance when rocket flies near
// ---------------------------------------------------------------------------
function updateProximityHUD() {
  if (!spaceFlight.rocket) return;

  const rocketWorldPos = spaceFlight.rocket.position;
  let closestDist = Infinity;
  let closestName = '';

  // Check distance to each planet (world position = group position + local mesh position)
  solarSystem.planetMeshes.forEach(entry => {
    const worldX = solarSystem.group.position.x + entry.mesh.position.x;
    const worldY = solarSystem.group.position.y + entry.mesh.position.y;
    const worldZ = solarSystem.group.position.z + entry.mesh.position.z;
    const dx = rocketWorldPos.x - worldX;
    const dy = rocketWorldPos.y - worldY;
    const dz = rocketWorldPos.z - worldZ;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < closestDist) {
      closestDist = dist;
      closestName = entry.planet.name;
    }
  });

  // Check planet moons
  solarSystem.moonMeshes.forEach(entry => {
    const worldPos = new THREE.Vector3();
    entry.mesh.getWorldPosition(worldPos);
    const dist = rocketWorldPos.distanceTo(worldPos);
    if (dist < closestDist) {
      closestDist = dist;
      closestName = entry.name;
    }
  });

  // Check named asteroids
  solarSystem.asteroidMeshes.forEach(entry => {
    const worldX = solarSystem.group.position.x + entry.mesh.position.x;
    const worldY = solarSystem.group.position.y + entry.mesh.position.y;
    const worldZ = solarSystem.group.position.z + entry.mesh.position.z;
    const dx = rocketWorldPos.x - worldX;
    const dy = rocketWorldPos.y - worldY;
    const dz = rocketWorldPos.z - worldZ;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < closestDist) {
      closestDist = dist;
      closestName = entry.asteroid.name;
    }
  });

  // Check spacecraft
  solarSystem.spacecraftMeshes.forEach(entry => {
    const dist = rocketWorldPos.distanceTo(entry.mesh.position);
    if (dist < closestDist) {
      closestDist = dist;
      closestName = entry.spacecraft.name;
    }
  });

  // Check if rocket is within the asteroid belt region
  const rocketDistFromSun = Math.sqrt(
    (rocketWorldPos.x - solarSystem.group.position.x) ** 2 +
    (rocketWorldPos.z - solarSystem.group.position.z) ** 2
  );
  const beltInnerScene = ASTEROID_BELT.innerAU * AU_TO_SCENE;
  const beltOuterScene = ASTEROID_BELT.outerAU * AU_TO_SCENE;
  const inBelt = rocketDistFromSun > beltInnerScene * 0.9 && rocketDistFromSun < beltOuterScene * 1.1;

  // Check if rocket is within the Kuiper belt region
  const kuiperInnerScene = KUIPER_BELT.innerAU * AU_TO_SCENE;
  const kuiperOuterScene = KUIPER_BELT.outerAU * AU_TO_SCENE;
  const inKuiperBelt = rocketDistFromSun > kuiperInnerScene * 0.95 && rocketDistFromSun < kuiperOuterScene * 1.05;

  // Also check Sun
  if (solarSystem.sunMesh) {
    const worldX = solarSystem.group.position.x + solarSystem.sunMesh.position.x;
    const worldY = solarSystem.group.position.y + solarSystem.sunMesh.position.y;
    const worldZ = solarSystem.group.position.z + solarSystem.sunMesh.position.z;
    const dx = rocketWorldPos.x - worldX;
    const dy = rocketWorldPos.y - worldY;
    const dz = rocketWorldPos.z - worldZ;
    const sunDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (sunDist < closestDist) {
      closestDist = sunDist;
      closestName = 'Sun';
    }
  }

  // Also check Earth and Moon (they're not in the group)
  if (spaceFlight.earth) {
    const dist = rocketWorldPos.distanceTo(spaceFlight.earth.position);
    if (dist < closestDist) {
      closestDist = dist;
      closestName = 'Earth';
    }
  }
  if (spaceFlight.moon) {
    const dist = rocketWorldPos.distanceTo(spaceFlight.moon.position);
    if (dist < closestDist) {
      closestDist = dist;
      closestName = 'Moon';
    }
  }

  // Show/update proximity indicator
  let indicator = document.getElementById('ssProximity');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'ssProximity';
    indicator.style.cssText =
      'position:fixed;top:50%;left:50%;transform:translate(-50%,-120px);' +
      'background:rgba(10,10,30,0.85);border:1px solid #667eea;border-radius:8px;' +
      'padding:8px 16px;color:#fff;font-family:Orbitron,sans-serif;font-size:12px;' +
      'z-index:10001;display:none;text-align:center;pointer-events:none;';
    document.body.appendChild(indicator);
  }

  const threshold = solarSystem.PROXIMITY_DIST;
  if (closestDist < threshold * 5) {
    const distText = Math.floor(closestDist);
    if (closestDist < threshold) {
      indicator.innerHTML = '<span style="color:#10b981;font-weight:700;">' + closestName +
        '</span><br><span style="font-size:10px;opacity:0.8;">Click to inspect</span>';
    } else {
      indicator.innerHTML = '<span style="color:#fbbf24;">' + closestName +
        '</span> <span style="font-size:10px;opacity:0.7;">' + distText + ' km</span>';
    }
    // Show asteroid belt context when in the belt
    if (inBelt) {
      indicator.innerHTML += '<br><span style="font-size:9px;color:#a08060;opacity:0.8;">ASTEROID BELT REGION</span>';
    }
    if (inKuiperBelt) {
      indicator.innerHTML += '<br><span style="font-size:9px;color:#7aa6d8;opacity:0.85;">KUIPER BELT REGION</span>';
    }
    indicator.style.display = 'block';
  } else if (inBelt) {
    indicator.innerHTML = '<span style="color:#a08060;font-weight:600;">ASTEROID BELT</span>' +
      '<br><span style="font-size:10px;opacity:0.7;">' + ASTEROID_BELT.innerAU.toFixed(1) +
      ' - ' + ASTEROID_BELT.outerAU.toFixed(1) + ' AU from Sun</span>';
    indicator.style.display = 'block';
  } else if (inKuiperBelt) {
    indicator.innerHTML = '<span style="color:#7aa6d8;font-weight:600;">KUIPER BELT</span>' +
      '<br><span style="font-size:10px;opacity:0.7;">' + KUIPER_BELT.innerAU.toFixed(1) +
      ' - ' + KUIPER_BELT.outerAU.toFixed(1) + ' AU from Sun</span>';
    indicator.style.display = 'block';
  } else {
    indicator.style.display = 'none';
  }
}

Object.assign(globalThis, {
  getAllSpaceBodies,
  getEarthHelioScenePosition,
  getMoonScenePosition,
  hideSolarSystemUI,
  initSolarSystem,
  setSolarSystemCenter,
  showSolarSystemUI,
  toggleOrbits,
  toggleSolarSystem,
  updateSolarSystem
});

export {
  getAllSpaceBodies,
  getEarthHelioScenePosition,
  getMoonScenePosition,
  hideSolarSystemUI,
  initSolarSystem,
  setSolarSystemCenter,
  showSolarSystemUI,
  toggleOrbits,
  toggleSolarSystem,
  updateSolarSystem
};
