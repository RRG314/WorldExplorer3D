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
    radiusScaled: 12, meanDistanceAU: 0.387, meanDistanceKM: 57910000,
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
    radiusScaled: 20, meanDistanceAU: 0.723, meanDistanceKM: 108200000,
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
    radiusScaled: 20, meanDistanceAU: 1.000, meanDistanceKM: 149600000,
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
    radiusScaled: 16, meanDistanceAU: 1.524, meanDistanceKM: 227900000,
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
    radiusScaled: 55, meanDistanceAU: 5.203, meanDistanceKM: 778500000,
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
    radiusScaled: 46, meanDistanceAU: 9.537, meanDistanceKM: 1427000000,
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
    radiusScaled: 32, meanDistanceAU: 19.189, meanDistanceKM: 2871000000,
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
    radiusScaled: 30, meanDistanceAU: 30.070, meanDistanceKM: 4498000000,
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
// HELIOCENTRIC VISUAL DISTANCES (compressed for gameplay)
// All distances from the Sun in scene units
// ---------------------------------------------------------------------------
const HELIO_VISUAL_DIST = {
  Mercury: 300,
  Venus: 500,
  Earth: 800,
  Mars: 1100,
  Jupiter: 1700,
  Saturn: 2300,
  Uranus: 2900,
  Neptune: 3500
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
// SOLAR SYSTEM STATE
// ---------------------------------------------------------------------------
const solarSystem = {
  visible: true,
  group: null,          // THREE.Group holding Sun + planet meshes
  sunMesh: null,
  planetMeshes: [],     // { mesh, hitbox, label, planet, realPosition }
  moonMeshes: [],       // { mesh, planetMesh, orbitRadius, orbitDays, phaseOffset }
  orbitLines: [],
  infoPanel: null,
  selectedPlanet: null,
  raycaster: null,
  mouse: null,
  MOON_TIME_SCALE: 8,   // Speed up moon orbits for visual effect
  SUN_SIZE: 80,
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

  // Sun point light
  const sunLight = new THREE.PointLight(0xfff8e0, 0.6, 8000);
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
      opacity: 0.25,
      linewidth: 1
    });
    const orbitLine = new THREE.LineLoop(orbitGeo, orbitMat);
    orbitLine.name = planet.name + '_orbit';
    solarSystem.group.add(orbitLine);
    solarSystem.orbitLines.push(orbitLine);
  });

  // ---------------------------------------------------------------------------
  // PLANET MOONS - Create moons as children of planet meshes
  // ---------------------------------------------------------------------------
  createMoonSystems();

  // Position all objects based on current date
  updateSolarSystemPositions(now);

  spaceScene.add(solarSystem.group);

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
    solarSystem.moonMeshes.length, 'moons + Sun');
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
  }

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
  // Also test Sun
  clickables.push(solarSystem.sunMesh);

  const intersects = solarSystem.raycaster.intersectObjects(clickables, true);

  if (intersects.length > 0) {
    const hit = intersects[0].object;
    // Walk up to find planet data
    let target = hit;
    while (target && !target.userData.isPlanet && target.parent) {
      target = target.parent;
    }

    if (target && target.userData.isPlanet) {
      const idx = target.userData.planetIndex;
      const entry = solarSystem.planetMeshes.find(e => e.planet === SOLAR_SYSTEM_PLANETS[idx]);
      if (entry) showPlanetInfo(entry);
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

// ---------------------------------------------------------------------------
// TOGGLE BUTTON
// ---------------------------------------------------------------------------
function createToggleButton() {
  const btn = document.createElement('button');
  btn.id = 'solarSystemToggle';
  btn.style.cssText = `
    position: fixed;
    top: 20px;
    left: 20px;
    background: rgba(10, 10, 30, 0.9);
    border: 2px solid #667eea;
    border-radius: 8px;
    padding: 8px 14px;
    color: #fff;
    font-family: Orbitron, sans-serif;
    font-size: 11px;
    font-weight: 600;
    z-index: 10001;
    display: none;
    cursor: pointer;
    transition: all 0.2s;
  `;
  btn.textContent = 'SOLAR SYSTEM: ON';
  btn.addEventListener('click', toggleSolarSystem);
  document.body.appendChild(btn);
}

function toggleSolarSystem() {
  solarSystem.visible = !solarSystem.visible;
  if (solarSystem.group) {
    solarSystem.group.visible = solarSystem.visible;
  }
  const btn = document.getElementById('solarSystemToggle');
  if (btn) {
    btn.textContent = 'SOLAR SYSTEM: ' + (solarSystem.visible ? 'ON' : 'OFF');
    btn.style.borderColor = solarSystem.visible ? '#667eea' : '#475569';
    btn.style.color = solarSystem.visible ? '#fff' : '#64748b';
  }
  if (!solarSystem.visible) {
    hidePlanetInfo();
  }
}

// ---------------------------------------------------------------------------
// SHOW/HIDE (called when entering/exiting space flight)
// ---------------------------------------------------------------------------
function showSolarSystemUI() {
  const btn = document.getElementById('solarSystemToggle');
  if (btn) btn.style.display = 'block';
}

function hideSolarSystemUI() {
  const btn = document.getElementById('solarSystemToggle');
  if (btn) btn.style.display = 'none';
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

  // Slow rotation for visual interest
  solarSystem.planetMeshes.forEach(entry => {
    entry.mesh.rotation.y += 0.002;
  });
  if (solarSystem.sunMesh) {
    solarSystem.sunMesh.rotation.y += 0.001;
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
    indicator.style.display = 'block';
  } else {
    indicator.style.display = 'none';
  }
}  DRIFT_RATE: 0.04,
  TURN_SPEED: 0.035,
  PITCH_SPEED: 0.03,
  LANDING_DISTANCE: 120  // Increased for larger bodies
};

// Initialize space flight UI elements (called once on load)
function initSpaceFlightUI() {
  console.log("Initializing Space Flight UI...");

  // Initialize velocity vector
  spaceFlight.velocity = new THREE.Vector3();

  // Space Canvas (fullscreen overlay)
  const canvas = document.createElement('canvas');
  canvas.id = 'spaceFlightCanvas';
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:10000;display:none;';
  document.body.appendChild(canvas);
  spaceFlight.canvas = canvas;

  // Flight HUD
  const hud = document.createElement('div');
  hud.id = 'spaceFlightHUD';
  hud.style.cssText = 'position:fixed;bottom:20px;left:20px;background:rgba(10,10,30,0.95);border:2px solid #667eea;border-radius:12px;padding:16px;color:#fff;font-family:Orbitron,sans-serif;font-size:13px;z-index:10001;display:none;min-width:280px;';
  hud.innerHTML = `
    <div style="font-size:16px;color:#667eea;margin-bottom:12px;font-weight:700;display:flex;align-items:center;gap:8px;">
      <span style="font-size:24px;">🚀</span> SPACE FLIGHT
    </div>
    <div style="margin-bottom:6px;">Nearest: <span id="sfDestination" style="color:#10b981;font-weight:600;">---</span></div>
    <div style="margin-bottom:6px;">Altitude: <span id="sfAltitude">0</span> km</div>
    <div style="margin-bottom:6px;">Speed: <span id="sfSpeed">0</span> km/s</div>
    <div style="margin-bottom:12px;">Distance: <span id="sfDistance" style="color:#fbbf24;">---</span> km</div>
    <div style="background:rgba(102,126,234,0.2);border-radius:8px;padding:10px;margin-bottom:12px;">
      <div style="font-size:11px;opacity:0.8;margin-bottom:6px;">LANDING ZONE</div>
      <div style="height:8px;background:rgba(0,0,0,0.3);border-radius:4px;overflow:hidden;">
        <div id="sfLandingBar" style="height:100%;width:0%;background:linear-gradient(90deg,#10b981,#34d399);transition:width 0.3s;"></div>
      </div>
      <div id="sfLandingText" style="font-size:10px;margin-top:4px;opacity:0.7;">Fly closer to land</div>
    </div>
    <button id="sfLandBtn" style="width:100%;padding:12px;background:#667eea;border:none;border-radius:8px;color:#fff;font-weight:600;cursor:pointer;font-family:Orbitron,sans-serif;transition:all 0.2s;opacity:0.5;" disabled>
      EXPLORE SOLAR SYSTEM
    </button>
    <div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(102,126,234,0.3);font-size:10px;line-height:1.6;opacity:0.8;">
      <b>CONTROLS:</b><br>
      ←/→ - Turn Left/Right<br>
      ↑/↓ - Pitch Up/Down<br>
      Space - Boost<br>
      Shift - Brake
    </div>
  `;
  document.body.appendChild(hud);
  spaceFlight.hud = hud;

  // Setup controls
  setupSpaceFlightControls();
}

function setupSpaceFlightControls() {
  // Land button
  document.getElementById('sfLandBtn').addEventListener('click', attemptLanding);

  // Keyboard controls
  document.addEventListener('keydown', (e) => {
    if (spaceFlight.active) {
      spaceFlight.keys[e.key.toLowerCase()] = true;
      if ([' ', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    }
  });

  document.addEventListener('keyup', (e) => {
    if (spaceFlight.active) {
      spaceFlight.keys[e.key.toLowerCase()] = false;
    }
  });

  // Window resize
  window.addEventListener('resize', () => {
    if (spaceFlight.active && spaceFlight.camera && spaceFlight.renderer) {
      spaceFlight.camera.aspect = window.innerWidth / window.innerHeight;
      spaceFlight.camera.updateProjectionMatrix();
      spaceFlight.renderer.setSize(window.innerWidth, window.innerHeight);
    }
  });
}

// Start space flight to moon (called from travelToMoon)
function startSpaceFlightToMoon() {
  console.log("Starting space flight to Moon...");

  // Set main game state
  travelingToMoon = true;
  paused = true;
  earthPosition = { x: car.x, z: car.z, angle: car.angle };
  scene.background = new THREE.Color(0x000000);

  // Hide Earth terrain and city objects
  if (terrainGroup) { terrainGroup.visible = false; scene.remove(terrainGroup); }
  if (cloudGroup) { cloudGroup.visible = false; scene.remove(cloudGroup); }
  roadMeshes.forEach(m => { m.visible = false; scene.remove(m); });
  buildingMeshes.forEach(m => { m.visible = false; scene.remove(m); });
  landuseMeshes.forEach(m => { m.visible = false; scene.remove(m); });
  poiMeshes.forEach(m => { m.visible = false; scene.remove(m); });
  streetFurnitureMeshes.forEach(m => { m.visible = false; scene.remove(m); });

  spaceFlight.destination = 'moon';
  spaceFlight.mode = 'launching';
  spaceFlight.active = true;
  switchEnv(ENV.SPACE_FLIGHT);

  // Show canvas and HUD
  spaceFlight.canvas.style.display = 'block';
  spaceFlight.hud.style.display = 'block';

  // Update destination text
  document.getElementById('sfDestination').textContent = 'Moon';
  document.getElementById('sfLandBtn').textContent = 'LAND ON MOON';

  // Hide world canvas
  const worldCanvas = document.querySelector('canvas:not(#spaceFlightCanvas)');
  if (worldCanvas) worldCanvas.style.display = 'none';

  // Hide game UI
  hideGameUI();

  // Create or reset scene
  if (!spaceFlight.scene) {
    createSpaceFlightScene();
  } else {
    resetSpaceFlightForMoon();
  }

  // Start animation
  animateSpaceFlight();

  // Show solar system toggle
  if (typeof showSolarSystemUI === 'function') showSolarSystemUI();

  // Auto-launch after brief delay
  setTimeout(() => {
    spaceFlight.mode = 'flying';
    spaceFlight.speed = SPACE_CONSTANTS.CRUISE_SPEED;
    showFlightMessage('LAUNCHED! Explore the Solar System!', '#10b981');
  }, 1000);
}

// Start space flight back to Earth (called from returnToEarth)
function startSpaceFlightToEarth() {
  console.log("Starting space flight to Earth...");

  // Set main game state
  travelingToMoon = true;
  paused = true;
  if (typeof hideReturnToEarthButton === 'function') hideReturnToEarthButton();

  spaceFlight.destination = 'earth';
  spaceFlight.mode = 'launching';
  spaceFlight.active = true;
  switchEnv(ENV.SPACE_FLIGHT);

  // Show canvas and HUD
  spaceFlight.canvas.style.display = 'block';
  spaceFlight.hud.style.display = 'block';

  // Update destination text
  document.getElementById('sfDestination').textContent = 'Earth';
  document.getElementById('sfLandBtn').textContent = 'LAND ON EARTH';

  // Hide world canvas
  const worldCanvas = document.querySelector('canvas:not(#spaceFlightCanvas)');
  if (worldCanvas) worldCanvas.style.display = 'none';

  // Hide game UI
  hideGameUI();

  // Reset scene for Earth trip
  resetSpaceFlightForEarth();

  // Start animation
  animateSpaceFlight();

  // Show solar system toggle
  if (typeof showSolarSystemUI === 'function') showSolarSystemUI();

  // Auto-launch
  setTimeout(() => {
    spaceFlight.mode = 'flying';
    spaceFlight.speed = SPACE_CONSTANTS.CRUISE_SPEED;
    showFlightMessage('LAUNCHED! Return to Earth!', '#3b82f6');
  }, 1000);
}

function hideGameUI() {
  const elementsToHide = ['hud', 'minimap', 'coords', 'floatMenuContainer', 'controlsTab', 'modeHud', 'police', 'navigationHud'];
  elementsToHide.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function showGameUI() {
  const elementsToShow = ['hud', 'minimap', 'coords', 'floatMenuContainer', 'controlsTab', 'modeHud'];
  elementsToShow.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = '';
  });
  if (typeof policeOn !== 'undefined' && policeOn) {
    const policeEl = document.getElementById('police');
    if (policeEl) policeEl.style.display = '';
  }
}

function createSpaceFlightScene() {
  console.log("Creating space flight scene...");

  // Scene
  spaceFlight.scene = new THREE.Scene();
  spaceFlight.scene.background = new THREE.Color(0x000008);

  // Camera - extended far plane for solar system exploration
  spaceFlight.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 25000);

  // Renderer (capped pixel ratio for Chromebook performance)
  spaceFlight.renderer = new THREE.WebGLRenderer({
    canvas: spaceFlight.canvas,
    antialias: window.devicePixelRatio <= 1
  });
  spaceFlight.renderer.setSize(window.innerWidth, window.innerHeight);
  spaceFlight.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

  // Lights
  spaceFlight.scene.add(new THREE.AmbientLight(0x303050, 0.5));
  const sunLight = new THREE.DirectionalLight(0xfff8e8, 1.6);
  sunLight.position.set(300, 200, 100);
  spaceFlight.scene.add(sunLight);
  const rimLight = new THREE.DirectionalLight(0x6688cc, 0.4);
  rimLight.position.set(-200, -100, -300);
  spaceFlight.scene.add(rimLight);

  // Stars - expanded for solar system scale
  createSpaceStarfield();

  // Earth
  createSpaceEarth();

  // Moon
  createSpaceMoon();

  // Rocket
  createSpaceRocket();

  // Solar System planets
  if (typeof initSolarSystem === 'function') {
    initSolarSystem(spaceFlight.scene);
  }

  // Position for moon trip (heliocentric)
  resetSpaceFlightForMoon();

  console.log("Space flight scene ready!");
}

function createSpaceStarfield() {
  const starGeo = new THREE.BufferGeometry();
  const starVerts = [];
  const starColors = [];

  for (let i = 0; i < 4000; i++) {
    starVerts.push(
      (Math.random() - 0.5) * 12000,
      (Math.random() - 0.5) * 12000,
      (Math.random() - 0.5) * 12000
    );
    const brightness = 0.7 + Math.random() * 0.3;
    starColors.push(brightness, brightness, brightness + Math.random() * 0.1);
  }

  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starVerts, 3));
  starGeo.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3));

  const starMat = new THREE.PointsMaterial({
    size: 2,
    vertexColors: true,
    transparent: true,
    opacity: 0.9
  });

  spaceFlight.scene.add(new THREE.Points(starGeo, starMat));
}

function createSpaceEarth() {
  // Earth sphere
  const earthGeo = new THREE.SphereGeometry(SPACE_CONSTANTS.EARTH_SIZE, 32, 32);
  const earthMat = new THREE.MeshPhongMaterial({
    color: 0x2255bb,
    emissive: 0x0a1833,
    specular: 0x4488cc,
    shininess: 40
  });
  spaceFlight.earth = new THREE.Mesh(earthGeo, earthMat);
  spaceFlight.scene.add(spaceFlight.earth);

  // Atmosphere glow
  const atmoGeo = new THREE.SphereGeometry(SPACE_CONSTANTS.EARTH_SIZE * 1.15, 32, 32);
  const atmoMat = new THREE.MeshBasicMaterial({
    color: 0x88ccff,
    transparent: true,
    opacity: 0.15,
    side: THREE.BackSide
  });
  spaceFlight.earth.add(new THREE.Mesh(atmoGeo, atmoMat));

  // Simple continent shapes
  const landMat = new THREE.MeshPhongMaterial({
    color: 0x228B22,
    emissive: 0x0a3a0a
  });

  const continents = [
    { lat: 40, lon: -100, scale: [1.2, 0.4, 0.8] },
    { lat: -15, lon: -60, scale: [0.8, 0.6, 0.9] },
    { lat: 50, lon: 10, scale: [0.6, 0.3, 0.4] },
    { lat: 0, lon: 20, scale: [1.0, 0.8, 0.7] },
    { lat: 30, lon: 100, scale: [1.4, 0.5, 0.8] },
    { lat: -25, lon: 135, scale: [0.6, 0.3, 0.5] }
  ];

  continents.forEach(c => {
    const land = new THREE.Mesh(
      new THREE.SphereGeometry(SPACE_CONSTANTS.EARTH_SIZE * 0.2, 16, 16),
      landMat
    );
    const phi = (90 - c.lat) * Math.PI / 180;
    const theta = (c.lon + 180) * Math.PI / 180;
    const r = SPACE_CONSTANTS.EARTH_SIZE * 0.98;
    land.position.set(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta)
    );
    land.scale.set(c.scale[0], c.scale[1], c.scale[2]);
    land.lookAt(0, 0, 0);
    spaceFlight.earth.add(land);
  });

  // Landing zone ring on Earth
  const ringGeo = new THREE.TorusGeometry(SPACE_CONSTANTS.EARTH_SIZE * 1.5, 3, 12, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x00ff88,
    transparent: true,
    opacity: 0.6
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.name = 'landingRing';
  spaceFlight.earth.add(ring);

  // Moon orbit ring around Earth (visual indicator)
  const moonOrbitRadius = typeof MOON_ORBIT_RADIUS !== 'undefined' ? MOON_ORBIT_RADIUS : 120;
  const moonOrbitGeo = new THREE.BufferGeometry();
  const moonOrbitPts = [];
  for (let i = 0; i <= 64; i++) {
    const angle = (i / 64) * Math.PI * 2;
    moonOrbitPts.push(new THREE.Vector3(
      Math.cos(angle) * moonOrbitRadius,
      20, // slight Y offset to match Moon's orbital plane
      Math.sin(angle) * moonOrbitRadius
    ));
  }
  moonOrbitGeo.setFromPoints(moonOrbitPts);
  const moonOrbitMat = new THREE.LineBasicMaterial({
    color: 0xaaaacc, transparent: true, opacity: 0.2
  });
  const moonOrbitLine = new THREE.LineLoop(moonOrbitGeo, moonOrbitMat);
  moonOrbitLine.name = 'moonOrbitRing';
  spaceFlight.earth.add(moonOrbitLine);
}

function createSpaceMoon() {
  // Moon sphere
  const moonGeo = new THREE.SphereGeometry(SPACE_CONSTANTS.MOON_SIZE, 32, 32);
  const moonMat = new THREE.MeshPhongMaterial({
    color: 0xbbbbbb,
    emissive: 0x222222,
    specular: 0x444444,
    shininess: 15
  });
  spaceFlight.moon = new THREE.Mesh(moonGeo, moonMat);
  spaceFlight.scene.add(spaceFlight.moon);

  // Craters
  for (let i = 0; i < 6; i++) {
    const crater = new THREE.Mesh(
      new THREE.CircleGeometry(SPACE_CONSTANTS.MOON_SIZE * (0.05 + Math.random() * 0.1), 16),
      new THREE.MeshBasicMaterial({ color: 0x666666 })
    );
    const phi = Math.random() * Math.PI;
    const theta = Math.random() * Math.PI * 2;
    const r = SPACE_CONSTANTS.MOON_SIZE * 1.001;
    crater.position.set(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta)
    );
    crater.lookAt(0, 0, 0);
    spaceFlight.moon.add(crater);
  }

  // Landing zone ring
  const ringGeo = new THREE.TorusGeometry(SPACE_CONSTANTS.MOON_SIZE * 1.8, 2, 12, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffff00,
    transparent: true,
    opacity: 0.6
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.name = 'landingRing';
  spaceFlight.moon.add(ring);
}

function createSpaceRocket() {
  spaceFlight.rocket = new THREE.Group();

  // Body
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(2, 2.5, 12, 20),
    new THREE.MeshPhongMaterial({ color: 0xf0f0f0, shininess: 90, specular: 0x444444 })
  );
  spaceFlight.rocket.add(body);

  // Nose cone
  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(2, 5, 20),
    new THREE.MeshPhongMaterial({ color: 0xdd3333, shininess: 60, specular: 0x331111 })
  );
  nose.position.y = 8.5;
  spaceFlight.rocket.add(nose);

  // Window
  const rocketWindow = new THREE.Mesh(
    new THREE.CircleGeometry(0.8, 16),
    new THREE.MeshPhongMaterial({ color: 0x88ccff, emissive: 0x224466, shininess: 100 })
  );
  rocketWindow.position.set(0, 3, 2.1);
  spaceFlight.rocket.add(rocketWindow);

  // Fins
  const finMat = new THREE.MeshPhongMaterial({ color: 0x444444, shininess: 30, specular: 0x222222 });
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, 3), finMat);
    const angle = (i / 4) * Math.PI * 2;
    fin.position.x = Math.cos(angle) * 2.5;
    fin.position.z = Math.sin(angle) * 2.5;
    fin.position.y = -4;
    fin.rotation.y = -angle;
    spaceFlight.rocket.add(fin);
  }

  // Engine nozzle
  const nozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 2, 2, 20),
    new THREE.MeshPhongMaterial({ color: 0x555555, shininess: 40, specular: 0x333333 })
  );
  nozzle.position.y = -7;
  spaceFlight.rocket.add(nozzle);

  // Engine glow
  const glow = new THREE.Mesh(
    new THREE.ConeGeometry(2, 8, 16),
    new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0 })
  );
  glow.position.y = -12;
  glow.rotation.x = Math.PI;
  glow.name = 'engineGlow';
  spaceFlight.rocket.add(glow);

  // Exhaust particles
  const exhaustGroup = new THREE.Group();
  exhaustGroup.name = 'exhaust';
  for (let i = 0; i < 6; i++) {
    const particle = new THREE.Mesh(
      new THREE.SphereGeometry(0.5 + Math.random() * 0.5, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0 })
    );
    particle.position.y = -10 - Math.random() * 6;
    particle.position.x = (Math.random() - 0.5) * 3;
    particle.position.z = (Math.random() - 0.5) * 3;
    exhaustGroup.add(particle);
  }
  spaceFlight.rocket.add(exhaustGroup);

  spaceFlight.scene.add(spaceFlight.rocket);
}

function resetSpaceFlightForMoon() {
  // Get Earth's heliocentric position (Sun is at origin)
  const earthPos = typeof getEarthHelioScenePosition === 'function'
    ? getEarthHelioScenePosition()
    : new THREE.Vector3(800, 0, 0);

  // Position Earth at its orbital position
  spaceFlight.earth.position.copy(earthPos);

  // Moon orbits Earth
  const moonPos = typeof getMoonScenePosition === 'function'
    ? getMoonScenePosition(earthPos)
    : new THREE.Vector3(earthPos.x + 120, earthPos.y + 20, earthPos.z);
  spaceFlight.moon.position.copy(moonPos);

  // Rocket starts on Earth surface
  spaceFlight.rocket.position.set(
    earthPos.x,
    earthPos.y + SPACE_CONSTANTS.EARTH_SIZE + 8,
    earthPos.z
  );
  spaceFlight.rocket.quaternion.identity();

  // Reset velocity and speed
  spaceFlight.velocity.set(0, 0, 0);
  spaceFlight.speed = 0;

  // Solar system group stays at origin (Sun at center)
  if (typeof setSolarSystemCenter === 'function') {
    setSolarSystemCenter(new THREE.Vector3(0, 0, 0));
  }

  // Reset UI
  const landBtn = document.getElementById('sfLandBtn');
  if (landBtn) {
    landBtn.disabled = true;
    landBtn.style.opacity = '0.5';
    landBtn.style.background = '#667eea';
  }
}

function resetSpaceFlightForEarth() {
  // Get Earth's heliocentric position
  const earthPos = typeof getEarthHelioScenePosition === 'function'
    ? getEarthHelioScenePosition()
    : new THREE.Vector3(800, 0, 0);

  // Position Earth at its orbital position
  spaceFlight.earth.position.copy(earthPos);

  // Moon orbits Earth
  const moonPos = typeof getMoonScenePosition === 'function'
    ? getMoonScenePosition(earthPos)
    : new THREE.Vector3(earthPos.x + 120, earthPos.y + 20, earthPos.z);
  spaceFlight.moon.position.copy(moonPos);

  // Rocket starts on Moon surface
  spaceFlight.rocket.position.set(
    moonPos.x,
    moonPos.y + SPACE_CONSTANTS.MOON_SIZE + 8,
    moonPos.z
  );
  spaceFlight.rocket.quaternion.identity();

  // Reset velocity and speed
  spaceFlight.velocity.set(0, 0, 0);
  spaceFlight.speed = 0;

  // Solar system group stays at origin
  if (typeof setSolarSystemCenter === 'function') {
    setSolarSystemCenter(new THREE.Vector3(0, 0, 0));
  }

  // Reset UI
  const landBtn = document.getElementById('sfLandBtn');
  if (landBtn) {
    landBtn.disabled = true;
    landBtn.style.opacity = '0.5';
    landBtn.style.background = '#667eea';
  }
}

// Pre-allocated temp vectors (avoid GC on Chromebook)
const _sfForward = new THREE.Vector3();
const _sfTargetPos = new THREE.Vector3();
const _sfTempVec = new THREE.Vector3();
const _sfTempQuat = new THREE.Quaternion();

function updateSpaceFlightPhysics() {
  if (spaceFlight.mode !== 'flying') return;

  const rocket = spaceFlight.rocket;
  const keys = spaceFlight.keys;

  // --- STEERING: Camera-relative ---
  const cam = spaceFlight.camera;

  if (keys['arrowleft'] || keys['arrowright']) {
    _sfTempVec.setFromMatrixColumn(cam.matrixWorld, 1).normalize();
    const yawDir = keys['arrowleft'] ? 1 : -1;
    _sfTempQuat.setFromAxisAngle(_sfTempVec, SPACE_CONSTANTS.TURN_SPEED * yawDir);
    rocket.quaternion.premultiply(_sfTempQuat);
  }

  if (keys['arrowup'] || keys['arrowdown']) {
    _sfTempVec.setFromMatrixColumn(cam.matrixWorld, 0).normalize();
    const pitchDir = keys['arrowup'] ? 1 : -1;
    _sfTempQuat.setFromAxisAngle(_sfTempVec, SPACE_CONSTANTS.PITCH_SPEED * pitchDir);
    rocket.quaternion.premultiply(_sfTempQuat);
  }

  rocket.quaternion.normalize();

  // Auto-level roll correction
  _sfTempVec.set(1, 0, 0).applyQuaternion(rocket.quaternion);
  const rollError = _sfTempVec.y;
  if (Math.abs(rollError) > 0.01) {
    _sfForward.set(0, 1, 0).applyQuaternion(rocket.quaternion);
    _sfTempQuat.setFromAxisAngle(_sfForward, -rollError * 0.06);
    rocket.quaternion.premultiply(_sfTempQuat);
    rocket.quaternion.normalize();
  }

  // --- THROTTLE ---
  let isThrusting = false;
  if (keys[' ']) {
    spaceFlight.speed = Math.min(spaceFlight.speed + SPACE_CONSTANTS.BOOST, SPACE_CONSTANTS.MAX_SPEED);
    isThrusting = true;
  } else if (keys['shift']) {
    spaceFlight.speed = Math.max(spaceFlight.speed - SPACE_CONSTANTS.BRAKE, 0);
  } else if (spaceFlight.speed > 0) {
    // Only drift back to cruise if moving; stay stopped if at zero
    if (spaceFlight.speed > SPACE_CONSTANTS.CRUISE_SPEED) {
      spaceFlight.speed = Math.max(spaceFlight.speed - SPACE_CONSTANTS.DRIFT_RATE, SPACE_CONSTANTS.CRUISE_SPEED);
    } else if (spaceFlight.speed < SPACE_CONSTANTS.CRUISE_SPEED) {
      spaceFlight.speed = Math.min(spaceFlight.speed + SPACE_CONSTANTS.DRIFT_RATE, SPACE_CONSTANTS.CRUISE_SPEED);
    }
  }

  // --- MOVEMENT ---
  _sfForward.set(0, 1, 0).applyQuaternion(rocket.quaternion);
  spaceFlight.velocity.copy(_sfForward).multiplyScalar(spaceFlight.speed);
  rocket.position.add(spaceFlight.velocity);

  // --- ENGINE EFFECTS ---
  const glow = rocket.getObjectByName('engineGlow');
  const exhaust = rocket.getObjectByName('exhaust');
  const thrustLevel = isThrusting ? 1.0 : (spaceFlight.speed / SPACE_CONSTANTS.MAX_SPEED);
  if (glow) {
    glow.material.opacity = 0.2 + thrustLevel * 0.6;
    glow.scale.y = 0.4 + thrustLevel * 0.6 + (isThrusting ? Math.random() * 0.3 : 0);
  }
  if (exhaust) {
    exhaust.children.forEach(p => {
      p.material.opacity = 0.05 + thrustLevel * 0.35 + (isThrusting ? Math.random() * 0.3 : 0);
      if (thrustLevel > 0.3) {
        p.position.y = -10 - Math.random() * 8;
        p.scale.setScalar(0.3 + thrustLevel * 0.7);
      }
    });
  }

  // --- COLLISION: bounce off ALL celestial bodies ---
  if (typeof getAllSpaceBodies === 'function') {
    const bodies = getAllSpaceBodies();
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      const dist = rocket.position.distanceTo(body.position);
      const minDist = body.radius + 5;
      if (dist < minDist) {
        _sfTempVec.copy(rocket.position).sub(body.position).normalize().multiplyScalar(minDist);
        rocket.position.copy(body.position).add(_sfTempVec);
        spaceFlight.speed = Math.max(spaceFlight.speed * 0.5, SPACE_CONSTANTS.MIN_SPEED);
      }
    }
  } else {
    // Fallback: only check Earth and Moon
    const source = spaceFlight.destination === 'moon' ? spaceFlight.earth : spaceFlight.moon;
    const sourceRadius = spaceFlight.destination === 'moon' ? SPACE_CONSTANTS.EARTH_SIZE : SPACE_CONSTANTS.MOON_SIZE;
    const sourceDist = rocket.position.distanceTo(source.position);
    if (sourceDist < sourceRadius + 5) {
      _sfTempVec.copy(rocket.position).sub(source.position).normalize().multiplyScalar(sourceRadius + 5);
      rocket.position.copy(source.position).add(_sfTempVec);
      spaceFlight.speed = Math.max(spaceFlight.speed * 0.5, SPACE_CONSTANTS.MIN_SPEED);
    }
  }

  // Update HUD
  updateSpaceFlightHUD();
}

function updateSpaceFlightHUD() {
  const rocket = spaceFlight.rocket;

  // Find nearest body dynamically
  let nearestBody = null;
  let nearestDist = Infinity;

  if (typeof getAllSpaceBodies === 'function') {
    const bodies = getAllSpaceBodies();
    bodies.forEach(body => {
      const dist = rocket.position.distanceTo(body.position);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestBody = body;
      }
    });
  }

  // Fallback to legacy destination
  if (!nearestBody) {
    const target = spaceFlight.destination === 'moon' ? spaceFlight.moon : spaceFlight.earth;
    const source = spaceFlight.destination === 'moon' ? spaceFlight.earth : spaceFlight.moon;
    const altFromSource = rocket.position.distanceTo(source.position);
    const distToTarget = rocket.position.distanceTo(target.position);
    const targetRadius = spaceFlight.destination === 'moon' ? SPACE_CONSTANTS.MOON_SIZE : SPACE_CONSTANTS.EARTH_SIZE;

    document.getElementById('sfDestination').textContent = spaceFlight.destination === 'moon' ? 'Moon' : 'Earth';
    document.getElementById('sfAltitude').textContent = Math.floor(altFromSource);
    document.getElementById('sfSpeed').textContent = spaceFlight.speed.toFixed(1);
    document.getElementById('sfDistance').textContent = Math.floor(distToTarget);
    return;
  }

  // Store nearest body for landing system
  spaceFlight._nearestBody = nearestBody;

  // Update displays
  document.getElementById('sfDestination').textContent = nearestBody.name;
  const altitude = Math.max(0, nearestDist - nearestBody.radius);
  document.getElementById('sfAltitude').textContent = Math.floor(altitude);
  document.getElementById('sfSpeed').textContent = spaceFlight.speed.toFixed(1);
  document.getElementById('sfDistance').textContent = Math.floor(nearestDist);

  // Landing zone progress
  const landingProgress = Math.max(0, 1 - (nearestDist - nearestBody.radius) / SPACE_CONSTANTS.LANDING_DISTANCE);
  const landingBar = document.getElementById('sfLandingBar');
  const landingText = document.getElementById('sfLandingText');
  const landBtn = document.getElementById('sfLandBtn');

  if (landingBar) landingBar.style.width = (landingProgress * 100) + '%';

  const canLand = nearestDist < SPACE_CONSTANTS.LANDING_DISTANCE + nearestBody.radius;

  if (canLand && nearestBody.landable) {
    // Can land on Earth or Moon
    if (landingText) landingText.textContent = 'IN RANGE - Ready to land!';
    if (landBtn) {
      landBtn.disabled = false;
      landBtn.style.opacity = '1';
      landBtn.style.background = '#10b981';
      landBtn.textContent = 'LAND ON ' + nearestBody.name.toUpperCase();
    }
  } else if (canLand && !nearestBody.landable) {
    // Close to a non-landable body (planet flyby)
    if (landingText) landingText.textContent = 'Orbiting ' + nearestBody.name + ' (flyby)';
    if (landingBar) landingBar.style.background = 'linear-gradient(90deg,#fbbf24,#f59e0b)';
    if (landBtn) {
      landBtn.disabled = true;
      landBtn.style.opacity = '0.7';
      landBtn.style.background = '#b45309';
      landBtn.textContent = 'ORBITING ' + nearestBody.name.toUpperCase();
    }
  } else {
    // Far from any body
    if (landingBar) landingBar.style.background = 'linear-gradient(90deg,#10b981,#34d399)';
    if (landingText) landingText.textContent = 'Nearest: ' + nearestBody.name + ' (' + Math.floor(altitude) + ' km)';
    if (landBtn) {
      landBtn.disabled = true;
      landBtn.style.opacity = '0.5';
      landBtn.style.background = '#667eea';
      landBtn.textContent = 'FLY TO ' + nearestBody.name.toUpperCase();
    }
  }
}

function updateSpaceFlightCamera() {
  const rocket = spaceFlight.rocket;

  // Rocket's forward direction (local +Y)
  _sfForward.set(0, 1, 0).applyQuaternion(rocket.quaternion);

  // Rocket's local "up"
  _sfTempVec.set(0, 0, -1).applyQuaternion(rocket.quaternion);

  // Chase camera
  _sfTargetPos.copy(rocket.position)
    .addScaledVector(_sfForward, -70)
    .addScaledVector(_sfTempVec, 25);

  spaceFlight.camera.position.lerp(_sfTargetPos, 0.1);
  spaceFlight.camera.up.copy(_sfTempVec);
  spaceFlight.camera.lookAt(rocket.position);
}

function animateSpaceFlight() {
  if (!spaceFlight.active) return;

  spaceFlight.animationId = requestAnimationFrame(animateSpaceFlight);

  // Rotate planets slowly
  if (spaceFlight.earth) spaceFlight.earth.rotation.y += 0.0005;
  if (spaceFlight.moon) spaceFlight.moon.rotation.y += 0.0002;

  // Pulse landing rings on both Earth and Moon
  [spaceFlight.earth, spaceFlight.moon].forEach(body => {
    if (body) {
      const ring = body.getObjectByName('landingRing');
      if (ring) {
        ring.material.opacity = 0.4 + Math.sin(Date.now() * 0.003) * 0.3;
      }
    }
  });

  // Update Earth and Moon heliocentric positions (slow orbital drift)
  // FREEZE positions during landing so the landing target doesn't move
  if (spaceFlight.mode !== 'landing') {
    if (typeof getEarthHelioScenePosition === 'function' && spaceFlight.earth) {
      const earthPos = getEarthHelioScenePosition();
      spaceFlight.earth.position.lerp(earthPos, 0.01);

      if (typeof getMoonScenePosition === 'function' && spaceFlight.moon) {
        const moonPos = getMoonScenePosition(spaceFlight.earth.position);
        spaceFlight.moon.position.copy(moonPos);
      }
    }
  }

  // Update solar system planets
  if (typeof updateSolarSystem === 'function') {
    updateSolarSystem();
  }

  // Update physics and camera
  updateSpaceFlightPhysics();
  updateSpaceFlightCamera();

  // Render
  if (spaceFlight.renderer && spaceFlight.scene && spaceFlight.camera) {
    spaceFlight.renderer.render(spaceFlight.scene, spaceFlight.camera);
  }
}

function attemptLanding() {
  // Find nearest landable body
  let target = null;
  let targetRadius = 0;
  let targetName = '';

  if (typeof getAllSpaceBodies === 'function') {
    const bodies = getAllSpaceBodies();
    let nearestDist = Infinity;
    bodies.forEach(body => {
      if (!body.landable) return;
      const dist = spaceFlight.rocket.position.distanceTo(body.position);
      if (dist < nearestDist) {
        nearestDist = dist;
        target = body.mesh;
        targetRadius = body.radius;
        targetName = body.name;
      }
    });

    if (nearestDist >= SPACE_CONSTANTS.LANDING_DISTANCE + targetRadius) return;
  } else {
    // Fallback
    target = spaceFlight.destination === 'moon' ? spaceFlight.moon : spaceFlight.earth;
    targetRadius = spaceFlight.destination === 'moon' ? SPACE_CONSTANTS.MOON_SIZE : SPACE_CONSTANTS.EARTH_SIZE;
    targetName = spaceFlight.destination === 'moon' ? 'Moon' : 'Earth';
    const dist = spaceFlight.rocket.position.distanceTo(target.position);
    if (dist >= SPACE_CONSTANTS.LANDING_DISTANCE + targetRadius) return;
  }

  // Perform landing
  spaceFlight.mode = 'landing';
  spaceFlight._landingTarget = targetName;
  showFlightMessage('LANDING SEQUENCE INITIATED', '#10b981');

  const landingDuration = 2000;
  const startTime = Date.now();
  const startPos = spaceFlight.rocket.position.clone();
  const landPos = target.position.clone();
  landPos.y += targetRadius + 10;

  // Snapshot target position at start of landing (target is frozen during landing mode)
  const frozenTargetPos = target.position.clone();

  function landingAnimation() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / landingDuration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);

    spaceFlight.rocket.position.lerpVectors(startPos, landPos, eased);
    spaceFlight.velocity.multiplyScalar(0.9);

    const toTarget = frozenTargetPos.clone().sub(spaceFlight.rocket.position).normalize();
    spaceFlight.rocket.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), toTarget);

    if (progress < 1) {
      requestAnimationFrame(landingAnimation);
    } else {
      completeLanding();
    }
  }

  landingAnimation();
}

function completeLanding() {
  const targetName = spaceFlight._landingTarget || spaceFlight.destination;
  console.log("Landing complete! Target:", targetName);

  showFlightMessage('LANDING SUCCESSFUL!', '#10b981');

  setTimeout(() => {
    exitSpaceFlight();

    if (targetName === 'Moon' || targetName === 'moon') {
      if (typeof arriveAtMoon === 'function') {
        arriveAtMoon();
      }
    } else {
      if (typeof arriveAtEarth === 'function') {
        arriveAtEarth();
      }
    }
  }, 1500);
}

function exitSpaceFlight() {
  console.log("Exiting space flight...");

  spaceFlight.active = false;

  if (spaceFlight.animationId) {
    cancelAnimationFrame(spaceFlight.animationId);
    spaceFlight.animationId = null;
  }

  spaceFlight.canvas.style.display = 'none';
  spaceFlight.hud.style.display = 'none';

  if (typeof hideSolarSystemUI === 'function') hideSolarSystemUI();

  const proxHud = document.getElementById('ssProximity');
  if (proxHud) proxHud.style.display = 'none';

  const worldCanvas = document.querySelector('canvas:not(#spaceFlightCanvas)');
  if (worldCanvas) worldCanvas.style.display = 'block';

  showGameUI();
  spaceFlight.keys = {};
}

function showFlightMessage(text, color) {
  const existing = document.getElementById('sfMessage');
  if (existing) existing.remove();

  const msg = document.createElement('div');
  msg.id = 'sfMessage';
  msg.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.9);border:3px solid ${color};border-radius:16px;padding:24px 48px;color:${color};font-family:Orbitron,sans-serif;font-size:24px;font-weight:700;z-index:10002;text-align:center;pointer-events:none;`;
  msg.textContent = text;
  document.body.appendChild(msg);

  setTimeout(() => {
    msg.style.transition = 'opacity 0.5s';
    msg.style.opacity = '0';
    setTimeout(() => msg.remove(), 500);
  }, 2000);
}

// Initialize when THREE.js is available
function initSpaceFlightWhenReady() {
  if (typeof THREE !== 'undefined') {
    console.log("Space Flight module loaded!");
    initSpaceFlightUI();
  } else {
    setTimeout(initSpaceFlightWhenReady, 100);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSpaceFlightWhenReady);
} else {
  initSpaceFlightWhenReady();
}
