import { ctx as appCtx } from "./shared-context.js?v=55"; // ============================================================================
import { getAstronomicalBody } from './astronomy/body-catalog.js?v=2';
import {
  createAsteroidBelt as createSolarSystemAsteroidBelt,
  createKuiperBelt as createSolarSystemKuiperBelt,
  createMoonSystems as createSolarSystemMoonSystems
} from "./solar-system/minor-bodies.js?v=10";
import { createGalaxies as createSolarSystemGalaxies } from "./solar-system/galaxies.js?v=2";
import { initSolarSystemModel } from "./solar-system/init.js?v=5";
import {
  createInfoPanel as createSolarSystemInfoPanel,
  createToggleButton as createSolarSystemToggleButton,
  hideSolarSystemUI as hideSolarSystemUIImpl,
  onSolarSystemClick as onSolarSystemClickImpl,
  showSolarSystemUI as showSolarSystemUIImpl,
  toggleOrbits as toggleSolarSystemOrbitsImpl,
  toggleSolarSystem as toggleSolarSystemImpl,
  updateSolarSystem as updateSolarSystemImpl
} from "./solar-system/ui.js?v=17";
import {
  ASTEROID_BELT,
  AU_TO_SCENE,
  GALAXIES,
  GALAXY_VISUAL_SCALE,
  HELIO_VISUAL_DIST,
  KUIPER_BELT,
  MOON_ORBIT_RADIUS,
  NAMED_ASTEROIDS,
  PLANET_MOONS,
  SOLAR_SYSTEM_PLANETS,
  SPACECRAFT
} from "./solar-system/catalog.js?v=7";
import {
  createSpacecraft as createSolarSystemSpacecraft,
  updateSpacecraftPositions as updateSolarSystemSpacecraftPositions
} from "./solar-system/spacecraft.js?v=1";
// solar-system.js - Solar System Planet Rendering for Space Flight Mode
// Heliocentric orbital model based on JPL "Approximate Positions of the Planets"
// ============================================================================

// ---------------------------------------------------------------------------
// PLANET DATA TABLE
// Keplerian elements (J2000 epoch) and rates per century from JPL
// https://ssd.jpl.nasa.gov/planets/approx_pos.html
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// SOLAR SYSTEM STATE
// ---------------------------------------------------------------------------
const solarSystem = {
  visible: true,
  group: null, // THREE.Group holding Sun + planet meshes
  sunMesh: null,
  planetMeshes: [], // { mesh, hitbox, label, planet, realPosition }
  moonMeshes: [], // { mesh, planetMesh, orbitRadius, orbitDays, phaseOffset }
  orbitLines: [],
  asteroidBelt: null, // THREE.Points particle system for belt
  kuiperBelt: null, // THREE.Points particle system for Kuiper belt
  asteroidMeshes: [], // named large asteroids { mesh, hitbox, asteroid, realPosition }
  spacecraftMeshes: [], // spacecraft { mesh, hitbox, spacecraft, orbitData }
  galaxyMeshes: [], // background galaxies { mesh, hitbox, galaxy, visualDistance }
  orbitMarkers: [], // glowing markers showing current planet position on orbit
  orbitsVisible: true, // toggle for active orbit display
  infoPanel: null,
  selectedPlanet: null,
  selectedBodyId: null,
  raycaster: null,
  mouse: null,
  MOON_TIME_SCALE: 1,
  SUN_SIZE: 100, // Scaled up for visibility at proportional distances
  PROXIMITY_DIST: 200, // distance to trigger proximity HUD
  _earthVisualPos: null, // cached Earth visual position for space.js
  initialized: false
};

// ---------------------------------------------------------------------------
// ORBITAL MECHANICS - JPL Keplerian model
// ---------------------------------------------------------------------------
var _SS_DEG2RAD = Math.PI / 180;

// J2000 epoch = Jan 1.5 2000 = JD 2451545.0
function dateToJulianCenturies(date) {
  const JD = date.getTime() / 86400000 + 2440587.5;
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

  const cosW = Math.cos(wRad),sinW = Math.sin(wRad);
  const cosLN = Math.cos(LNRad),sinLN = Math.sin(LNRad);
  const cosI = Math.cos(IRad),sinI = Math.sin(IRad);

  const x = (cosW * cosLN - sinW * sinLN * cosI) * xp +
  (-sinW * cosLN - cosW * sinLN * cosI) * yp;
  const y = (cosW * sinLN + sinW * cosLN * cosI) * xp +
  (-sinW * sinLN + cosW * cosLN * cosI) * yp;
  const z = sinW * sinI * xp + cosW * sinI * yp;

  return { x, y, z };
}

// Compute heliocentric position in AU for a given planet and date
function computePlanetPosition(planet, date) {
  const T = dateToJulianCenturies(date);

  const a = planet.a0 + planet.aRate * T;
  const e = planet.e0 + planet.eRate * T;
  const I = planet.I0 + planet.IRate * T;
  const L = normalizeAngle(planet.L0 + planet.LRate * T);
  const LP = normalizeAngle(planet.LP0 + planet.LPRate * T);
  const LN = normalizeAngle(planet.LN0 + planet.LNRate * T);

  const w = LP - LN; // argument of perihelion
  const M = normalizeAngle(L - LP); // mean anomaly

  return computeOrbitalPosition(a, e, I, w, LN, M);
}

// ---------------------------------------------------------------------------
// ORBIT PATH COMPUTATION - Real elliptical paths from Keplerian elements
// ---------------------------------------------------------------------------

// Compute full orbit path points for a planet (array of scene-space Vector3)
function computeOrbitPath(planet, numPoints) {
  const T = dateToJulianCenturies(new Date());

  const a = planet.a0 + planet.aRate * T;
  const e = planet.e0 + planet.eRate * T;
  const I = planet.I0 + planet.IRate * T;
  const LP = normalizeAngle(planet.LP0 + planet.LPRate * T);
  const LN = normalizeAngle(planet.LN0 + planet.LNRate * T);
  const w = LP - LN;

  // Scale factor: maps AU to scene units
  const visualDist = HELIO_VISUAL_DIST[planet.name] || 1000;
  const scale = visualDist / a;

  const points = [];
  for (let i = 0; i < numPoints; i++) {
    const M_deg = i / numPoints * 360;
    const pos = computeOrbitalPosition(a, e, I, w, LN, M_deg);

    // Convert AU to scene coords with same mapping as helioToScene
    points.push(new THREE.Vector3(
      pos.x * scale,
      pos.z * scale,
      pos.y * scale // swap y/z for Three.js coordinate system
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
    y: realPos.z * scale,
    z: realPos.y * scale // swap y/z for Three.js coords
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

function raDecToScenePosition(raDeg, decDeg, radiusScene) {
  const ra = raDeg * _SS_DEG2RAD;
  const dec = decDeg * _SS_DEG2RAD;
  return new THREE.Vector3(
    radiusScene * Math.cos(dec) * Math.cos(ra),
    radiusScene * Math.sin(dec),
    radiusScene * Math.cos(dec) * Math.sin(ra)
  );
}

function mapGalaxyDistanceToScene(distanceLy) {
  const minLy = 160000;
  const maxLy = 31000000;
  const clamped = Math.min(maxLy, Math.max(minLy, distanceLy));
  const minLog = Math.log10(minLy);
  const maxLog = Math.log10(maxLy);
  const t = (Math.log10(clamped) - minLog) / (maxLog - minLog);
  return 160000 + t * 160000;
}

function buildSolarSystemModuleContext() {
  return {
    ASTEROID_BELT,
    AU_TO_SCENE,
    DEG2RAD: _SS_DEG2RAD,
    GALAXIES,
    GALAXY_VISUAL_SCALE,
    HELIO_VISUAL_DIST,
    KUIPER_BELT,
    NAMED_ASTEROIDS,
    PLANET_MOONS,
    SOLAR_SYSTEM_PLANETS,
    SPACECRAFT,
    appCtx,
    computeOrbitalPosition,
    createLabel,
    distanceAU,
    getEarthHelioPos,
    helioToScene,
    mapGalaxyDistanceToScene,
    normalizeAngle,
    raDecToScenePosition,
    solarSystem,
    updateMoonPositions,
    updateSolarSystemPositions,
    updateSpacecraftPositions
  };
}

function createMoonSystems() {
  return createSolarSystemMoonSystems(buildSolarSystemModuleContext());
}

function createAsteroidBelt() {
  return createSolarSystemAsteroidBelt(buildSolarSystemModuleContext());
}

function createKuiperBelt() {
  return createSolarSystemKuiperBelt(buildSolarSystemModuleContext());
}

function createSpacecraft() {
  return createSolarSystemSpacecraft(buildSolarSystemModuleContext());
}

function updateSpacecraftPositions() {
  return updateSolarSystemSpacecraftPositions(buildSolarSystemModuleContext());
}

function createGalaxies() {
  return createSolarSystemGalaxies(buildSolarSystemModuleContext());
}

function onSolarSystemClick(event) {
  return onSolarSystemClickImpl(buildSolarSystemModuleContext(), event);
}

function createInfoPanel() {
  return createSolarSystemInfoPanel(buildSolarSystemModuleContext());
}

function createToggleButton() {
  return createSolarSystemToggleButton(buildSolarSystemModuleContext());
}

function toggleSolarSystem() {
  return toggleSolarSystemImpl(buildSolarSystemModuleContext());
}

function toggleOrbits() {
  return toggleSolarSystemOrbitsImpl(buildSolarSystemModuleContext());
}

function showSolarSystemUI() {
  return showSolarSystemUIImpl(buildSolarSystemModuleContext());
}

function hideSolarSystemUI() {
  return hideSolarSystemUIImpl(buildSolarSystemModuleContext());
}

function updateSolarSystem() {
  return updateSolarSystemImpl(buildSolarSystemModuleContext());
}

// ---------------------------------------------------------------------------
// INITIALIZATION
// ---------------------------------------------------------------------------
function initSolarSystem(spaceScene) {
  return initSolarSystemModel({
    ASTEROID_BELT,
    KUIPER_BELT,
    SOLAR_SYSTEM_PLANETS,
    THREE,
    appCtx,
    computeOrbitPath,
    computePlanetPosition,
    createAsteroidBelt,
    createGalaxies,
    createInfoPanel,
    createKuiperBelt,
    createLabel,
    createMoonSystems,
    createSpacecraft,
    createToggleButton,
    distanceAU,
    getEarthHelioPos,
    onSolarSystemClick,
    solarSystem,
    updateSolarSystemPositions
  }, spaceScene);
}

function resetSolarSystemRuntime() {
  if (appCtx.spaceFlight?.canvas) {
    appCtx.spaceFlight.canvas.removeEventListener('click', onSolarSystemClick);
  }
  Object.assign(solarSystem, {
    group: null,
    sunMesh: null,
    planetMeshes: [],
    moonMeshes: [],
    orbitLines: [],
    asteroidBelt: null,
    kuiperBelt: null,
    asteroidMeshes: [],
    spacecraftMeshes: [],
    galaxyMeshes: [],
    orbitMarkers: [],
    selectedPlanet: null,
    selectedBodyId: null,
    raycaster: null,
    mouse: null,
    _earthVisualPos: null,
    initialized: false
  });
}

// ---------------------------------------------------------------------------
// UPDATE MOON POSITIONS
// ---------------------------------------------------------------------------
function updateMoonPositions(date) {
  if (!solarSystem.moonMeshes.length) return;

  const elapsedDays = date.getTime() / 86400000;
  solarSystem.moonMeshes.forEach((moon) => {
    const angularSpeed = Math.PI * 2 / moon.orbitDays;
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
  const isSpacecraft = parentMesh.userData?.isSpacecraft === true;
  const spriteMat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: !isSpacecraft
  });
  const sprite = new THREE.Sprite(spriteMat);
  const labelScale = isSpacecraft
    ? Math.max(objectRadius * 1.8, 14)
    : Math.max(objectRadius * 5, 80);
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
  solarSystem.planetMeshes.forEach((entry) => {
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
  solarSystem.orbitMarkers.forEach((entry) => {
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
  const angle = Date.now() / period * 2 * Math.PI;
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
      massKg: 1.98847e30,
      physicalRadiusKm: 695700,
      mesh: solarSystem.sunMesh,
      landable: false
    });
  }

  // Solar system planets (not Earth/Moon - those are separate)
  if (solarSystem.group) {
    solarSystem.planetMeshes.forEach((entry) => {
      bodies.push({
        name: entry.planet.name,
        position: entry.mesh.position.clone().add(solarSystem.group.position),
        radius: entry.planet.radiusScaled,
        massKg: entry.planet.massKg,
        physicalRadiusKm: entry.planet.physicalRadiusKm,
        mesh: entry.mesh,
        landable: entry.planet.landingMode === 'solid_surface'
      });
    });

    // Planet moons (world position = group.pos + planet.pos + moon local pos)
    solarSystem.moonMeshes.forEach((entry) => {
      if (entry.name === 'Moon') return;
      const worldPos = new THREE.Vector3();
      entry.mesh.getWorldPosition(worldPos);
      const body = getAstronomicalBody(entry.name);
      bodies.push({
        name: entry.name,
        position: worldPos,
        radius: entry.radiusScaled,
        massKg: body?.physical?.massKg,
        physicalRadiusKm: body?.physical?.meanRadiusM ? body.physical.meanRadiusM / 1000 : null,
        mesh: entry.mesh,
        landable: body?.exploration?.landingMode === 'solid_surface'
      });
    });

    // Named asteroids
    solarSystem.asteroidMeshes.forEach((entry) => {
      const body = getAstronomicalBody(entry.asteroid.name);
      bodies.push({
        name: entry.asteroid.name,
        position: entry.mesh.position.clone().add(solarSystem.group.position),
        radius: entry.asteroid.radiusScaled,
        massKg: body?.physical?.massKg,
        physicalRadiusKm: body?.physical?.meanRadiusM ? body.physical.meanRadiusM / 1000 : null,
        mesh: entry.mesh,
        landable: body?.exploration?.landingMode === 'solid_surface'
      });
    });
  }

  // Spacecraft (positioned in scene or group depending on orbit type)
  solarSystem.spacecraftMeshes.forEach((entry) => {
    const pos = entry.orbitData.type === 'deepSpace' ?
    entry.mesh.position.clone().add(solarSystem.group.position) :
    entry.mesh.position.clone();
    bodies.push({
      name: entry.spacecraft.name,
      position: pos,
      radius: entry.spacecraft.size,
      mesh: entry.mesh,
      landable: false
    });
  });

  // Earth (direct scene child, not in group)
  if (appCtx.spaceFlight && appCtx.spaceFlight.earth) {
    bodies.push({
      name: 'Earth',
      position: appCtx.spaceFlight.earth.position.clone(),
      radius: 50,
      massKg: 5.97237e24,
      physicalRadiusKm: 6371,
      mesh: appCtx.spaceFlight.earth,
      landable: true
    });
  }

  // Moon (direct scene child, not in group)
  if (appCtx.spaceFlight && appCtx.spaceFlight.moon) {
    bodies.push({
      name: 'Moon',
      position: appCtx.spaceFlight.moon.position.clone(),
      radius: 13.5,
      massKg: 7.342e22,
      physicalRadiusKm: 1737.4,
      mesh: appCtx.spaceFlight.moon,
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

function setSolarSystemFrameVisibility(visible) {
  solarSystem.visible = Boolean(visible);
  if (solarSystem.group) solarSystem.group.visible = Boolean(visible);
  solarSystem.spacecraftMeshes.forEach((entry) => {
    if (entry?.mesh) entry.mesh.visible = Boolean(visible);
  });
  if (!visible) {
    if (solarSystem.infoPanel) solarSystem.infoPanel.style.display = 'none';
    const proximity = document.getElementById('ssProximity');
    if (proximity) proximity.style.display = 'none';
  }
}

Object.assign(appCtx, {
  getAllSpaceBodies,
  getEarthHelioScenePosition,
  getMoonScenePosition,
  hideSolarSystemUI,
  initSolarSystem,
  resetSolarSystemRuntime,
  setSolarSystemCenter,
  setSolarSystemFrameVisibility,
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
  resetSolarSystemRuntime,
  setSolarSystemCenter,
  setSolarSystemFrameVisibility,
  showSolarSystemUI,
  toggleOrbits,
  toggleSolarSystem,
  updateSolarSystem };
