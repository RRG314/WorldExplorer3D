import { ctx as appCtx } from "./shared-context.js?v=52"; // ============================================================================
// space.js - Space Flight Transition Module
// Rocket flight in heliocentric solar system - fly to any planet
// ============================================================================

// Space flight state (global)
appCtx.spaceFlight = {
  active: false,
  scene: null,
  camera: null,
  renderer: null,
  rocket: null,
  earth: null,
  moon: null,
  velocity: null,
  speed: 0,
  mode: 'launching', // launching, flying, landing
  keys: {},
  canvas: null,
  hud: null,
  animationId: null,
  destination: 'moon', // 'moon' or 'earth' (legacy, now dynamic)
  _nearestBody: null, // closest body for HUD
  _landingTarget: null, // body name being landed on
  _manualLandingTarget: null, // explicit Earth/Moon target selected by UI action
  _autopilotTarget: null, // active autopilot destination label
  _gravityVec: null,
  gravityVelocity: null,
  launchStartMs: 0,
  _launchSource: null,
  _isThrusting: false
};

// Constants - scaled for real proportional AU distances
const SPACE_CONSTANTS = {
  EARTH_SIZE: 50,
  MOON_SIZE: 13.5,
  MOON_DISTANCE: 1500,
  MIN_SPEED: 0,
  CRUISE_SPEED: 6.0, // Doubled for proportional AU distances
  MAX_SPEED: 80, // Increased for outer solar system exploration
  BOOST: 0.4,
  BRAKE: 0.25,
  DRIFT_RATE: 0.06,
  TURN_SPEED: 0.035,
  PITCH_SPEED: 0.03,
  LANDING_DISTANCE: 260,
  GRAVITY_DAMPING: 0.992,
  MAX_GRAVITY_SPEED: 18,
  MAX_GRAVITY_ACCEL: 0.18,
  MAX_TOTAL_GRAVITY_ACCEL: 0.24,
  GRAVITY_SOFTENING: 240,
  LAUNCH_ASSIST_WINDOW_MS: 14000,
  LAUNCH_ASSIST_ALTITUDE: 2200,
  LAUNCH_ASSIST_ACCEL: 0.16,
  LAUNCH_SOURCE_MIN_GRAVITY_SCALE: 0.28,
  LAUNCH_SUN_GRAVITY_SCALE: 0.06,
  LAUNCH_BOOST_MULTIPLIER: 1.5,
  LAUNCH_MIN_SPEED: 8.5
};

// Initialize space flight UI elements (called once on load)
function initSpaceFlightUI() {
  console.log("Initializing Space Flight UI...");

  // Initialize velocity vector
  appCtx.spaceFlight.velocity = new THREE.Vector3();
  appCtx.spaceFlight._gravityVec = new THREE.Vector3();
  appCtx.spaceFlight.gravityVelocity = new THREE.Vector3();

  // Space Canvas (fullscreen overlay)
  const canvas = document.createElement('canvas');
  canvas.id = 'spaceFlightCanvas';
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:10000;display:none;';
  document.body.appendChild(canvas);
  appCtx.spaceFlight.canvas = canvas;

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
  appCtx.spaceFlight.hud = hud;

  // Setup controls
  setupSpaceFlightControls();
}

function setupSpaceFlightControls() {
  // Land button
  document.getElementById('sfLandBtn').addEventListener('click', attemptLanding);

  // Keyboard controls
  document.addEventListener('keydown', (e) => {
    if (appCtx.spaceFlight.active) {
      appCtx.spaceFlight.keys[e.key.toLowerCase()] = true;
      if ([' ', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    }
  });

  document.addEventListener('keyup', (e) => {
    if (appCtx.spaceFlight.active) {
      appCtx.spaceFlight.keys[e.key.toLowerCase()] = false;
    }
  });

  // Window resize
  window.addEventListener('resize', () => {
    if (appCtx.spaceFlight.active && appCtx.spaceFlight.camera && appCtx.spaceFlight.renderer) {
      appCtx.spaceFlight.camera.aspect = window.innerWidth / window.innerHeight;
      appCtx.spaceFlight.camera.updateProjectionMatrix();
      appCtx.spaceFlight.renderer.setSize(window.innerWidth, window.innerHeight);
    }
  });
}

// Start space flight to moon (called from travelToMoon)
function startSpaceFlightToMoon() {
  console.log("Starting space flight to Moon...");

  // Set main game state
  appCtx.travelingToMoon = true;
  appCtx.paused = true;
  appCtx.earthPosition = { x: appCtx.car.x, z: appCtx.car.z, angle: appCtx.car.angle };
  appCtx.scene.background = new THREE.Color(0x000000);

  // Hide Earth terrain and city objects
  if (appCtx.terrainGroup) {appCtx.terrainGroup.visible = false;appCtx.scene.remove(appCtx.terrainGroup);}
  if (appCtx.cloudGroup) {appCtx.cloudGroup.visible = false;appCtx.scene.remove(appCtx.cloudGroup);}
  appCtx.roadMeshes.forEach((m) => {m.visible = false;appCtx.scene.remove(m);});
  appCtx.buildingMeshes.forEach((m) => {m.visible = false;appCtx.scene.remove(m);});
  appCtx.landuseMeshes.forEach((m) => {m.visible = false;appCtx.scene.remove(m);});
  appCtx.poiMeshes.forEach((m) => {m.visible = false;appCtx.scene.remove(m);});
  appCtx.streetFurnitureMeshes.forEach((m) => {m.visible = false;appCtx.scene.remove(m);});

  appCtx.spaceFlight.destination = 'moon';
  appCtx.spaceFlight.mode = 'launching';
  appCtx.spaceFlight.active = true;
  appCtx.spaceFlight._launchSource = 'Earth';
  appCtx.spaceFlight.launchStartMs = Date.now();
  appCtx.spaceFlight._isThrusting = false;
  appCtx.switchEnv(appCtx.ENV.SPACE_FLIGHT);

  // Show canvas and HUD
  appCtx.spaceFlight.canvas.style.display = 'block';
  appCtx.spaceFlight.hud.style.display = 'block';

  // Update destination text
  document.getElementById('sfDestination').textContent = 'Moon';
  document.getElementById('sfLandBtn').textContent = 'LAND ON MOON';

  // Hide world canvas
  const worldCanvas = document.querySelector('canvas:not(#spaceFlightCanvas)');
  if (worldCanvas) worldCanvas.style.display = 'none';

  // Hide game UI
  hideGameUI();

  // Create or reset scene
  if (!appCtx.spaceFlight.scene) {
    createSpaceFlightScene();
  } else {
    resetSpaceFlightForMoon();
  }

  // Start animation
  animateSpaceFlight();

  // Show solar system toggle
  if (typeof appCtx.showSolarSystemUI === 'function') appCtx.showSolarSystemUI();

  // Auto-launch after brief delay
  setTimeout(() => {
    appCtx.spaceFlight.mode = 'flying';
    appCtx.spaceFlight.speed = SPACE_CONSTANTS.CRUISE_SPEED;
    showFlightMessage('LAUNCHED! Explore the Solar System!', '#10b981');
  }, 1000);
}

// Start space flight back to Earth (called from returnToEarth)
function startSpaceFlightToEarth() {
  console.log("Starting space flight to Earth...");

  // Set main game state
  appCtx.travelingToMoon = true;
  appCtx.paused = true;
  if (typeof appCtx.hideReturnToEarthButton === 'function') appCtx.hideReturnToEarthButton();

  appCtx.spaceFlight.destination = 'earth';
  appCtx.spaceFlight.mode = 'launching';
  appCtx.spaceFlight.active = true;
  appCtx.spaceFlight._launchSource = 'Moon';
  appCtx.spaceFlight.launchStartMs = Date.now();
  appCtx.spaceFlight._isThrusting = false;
  appCtx.switchEnv(appCtx.ENV.SPACE_FLIGHT);

  // Show canvas and HUD
  appCtx.spaceFlight.canvas.style.display = 'block';
  appCtx.spaceFlight.hud.style.display = 'block';

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
  if (typeof appCtx.showSolarSystemUI === 'function') appCtx.showSolarSystemUI();

  // Auto-launch
  setTimeout(() => {
    appCtx.spaceFlight.mode = 'flying';
    appCtx.spaceFlight.speed = SPACE_CONSTANTS.CRUISE_SPEED;
    showFlightMessage('LAUNCHED! Return to Earth!', '#3b82f6');
  }, 1000);
}

function hideGameUI() {
  const elementsToHide = ['hud', 'minimap', 'coords', 'floatMenuContainer', 'controlsTab', 'modeHud', 'police', 'navigationHud'];
  elementsToHide.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function showGameUI() {
  const elementsToShow = ['hud', 'minimap', 'coords', 'floatMenuContainer', 'controlsTab', 'modeHud'];
  elementsToShow.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = '';
  });
  if (typeof appCtx.policeOn !== 'undefined' && appCtx.policeOn) {
    const policeEl = document.getElementById('police');
    if (policeEl) policeEl.style.display = '';
  }
}

function createSpaceFlightScene() {
  console.log("Creating space flight scene...");

  // Scene
  appCtx.spaceFlight.scene = new THREE.Scene();
  appCtx.spaceFlight.scene.background = new THREE.Color(0x000008);

  // Camera - extended far plane for deep-space galaxy layer
  appCtx.spaceFlight.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.5, 450000);

  // Renderer (capped pixel ratio for Chromebook performance)
  appCtx.spaceFlight.renderer = new THREE.WebGLRenderer({
    canvas: appCtx.spaceFlight.canvas,
    antialias: window.devicePixelRatio <= 1
  });
  appCtx.spaceFlight.renderer.setSize(window.innerWidth, window.innerHeight);
  appCtx.spaceFlight.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

  // Lights
  appCtx.spaceFlight.scene.add(new THREE.AmbientLight(0x303050, 0.5));
  const sunLight = new THREE.DirectionalLight(0xfff8e8, 1.6);
  sunLight.position.set(300, 200, 100);
  appCtx.spaceFlight.scene.add(sunLight);
  const rimLight = new THREE.DirectionalLight(0x6688cc, 0.4);
  rimLight.position.set(-200, -100, -300);
  appCtx.spaceFlight.scene.add(rimLight);

  // Stars - expanded for solar system scale
  createSpaceStarfield();

  // Earth
  createSpaceEarth();

  // Moon
  createSpaceMoon();

  // Rocket
  createSpaceRocket();

  // Solar System planets
  if (typeof appCtx.initSolarSystem === 'function') {
    appCtx.initSolarSystem(appCtx.spaceFlight.scene);
  }

  // Position for moon trip (heliocentric)
  resetSpaceFlightForMoon();

  console.log("Space flight scene ready!");
}

function createSpaceStarfield() {
  const starGeo = new THREE.BufferGeometry();
  const starVerts = [];
  const starColors = [];

  // Massive starfield shell pushed farther so distant galaxies feel deep.
  for (let i = 0; i < 8000; i++) {
    // Place stars in a hollow shell between 140000 and 360000 units
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 140000 + Math.random() * 220000;
    starVerts.push(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi)
    );
    const brightness = 0.6 + Math.random() * 0.4;
    const temp = Math.random();
    // Star color temperature variation (blue-white-yellow-orange)
    if (temp < 0.15) {
      starColors.push(brightness * 0.8, brightness * 0.85, brightness); // blue
    } else if (temp < 0.7) {
      starColors.push(brightness, brightness, brightness); // white
    } else if (temp < 0.9) {
      starColors.push(brightness, brightness * 0.95, brightness * 0.8); // yellow
    } else {
      starColors.push(brightness, brightness * 0.8, brightness * 0.6); // orange
    }
  }

  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starVerts, 3));
  starGeo.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3));

  const starMat = new THREE.PointsMaterial({
    size: 3.5,
    vertexColors: true,
    transparent: true,
    opacity: 0.9
  });

  appCtx.spaceFlight.scene.add(new THREE.Points(starGeo, starMat));
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
  appCtx.spaceFlight.earth = new THREE.Mesh(earthGeo, earthMat);
  appCtx.spaceFlight.scene.add(appCtx.spaceFlight.earth);

  // Atmosphere glow
  const atmoGeo = new THREE.SphereGeometry(SPACE_CONSTANTS.EARTH_SIZE * 1.15, 32, 32);
  const atmoMat = new THREE.MeshBasicMaterial({
    color: 0x88ccff,
    transparent: true,
    opacity: 0.15,
    side: THREE.BackSide
  });
  appCtx.spaceFlight.earth.add(new THREE.Mesh(atmoGeo, atmoMat));

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
  { lat: -25, lon: 135, scale: [0.6, 0.3, 0.5] }];


  continents.forEach((c) => {
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
    appCtx.spaceFlight.earth.add(land);
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
  appCtx.spaceFlight.earth.add(ring);

  // Moon orbit ring around Earth (visual indicator)
  const moonOrbitRadius = 120;
  const moonOrbitGeo = new THREE.BufferGeometry();
  const moonOrbitPts = [];
  for (let i = 0; i <= 64; i++) {
    const angle = i / 64 * Math.PI * 2;
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
  appCtx.spaceFlight.earth.add(moonOrbitLine);
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
  appCtx.spaceFlight.moon = new THREE.Mesh(moonGeo, moonMat);
  appCtx.spaceFlight.scene.add(appCtx.spaceFlight.moon);

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
    appCtx.spaceFlight.moon.add(crater);
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
  appCtx.spaceFlight.moon.add(ring);
}

function createSpaceRocket() {
  appCtx.spaceFlight.rocket = new THREE.Group();

  // Body
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(2, 2.5, 12, 20),
    new THREE.MeshPhongMaterial({ color: 0xf0f0f0, shininess: 90, specular: 0x444444 })
  );
  appCtx.spaceFlight.rocket.add(body);

  // Nose cone
  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(2, 5, 20),
    new THREE.MeshPhongMaterial({ color: 0xdd3333, shininess: 60, specular: 0x331111 })
  );
  nose.position.y = 8.5;
  appCtx.spaceFlight.rocket.add(nose);

  // Window
  const rocketWindow = new THREE.Mesh(
    new THREE.CircleGeometry(0.8, 16),
    new THREE.MeshPhongMaterial({ color: 0x88ccff, emissive: 0x224466, shininess: 100 })
  );
  rocketWindow.position.set(0, 3, 2.1);
  appCtx.spaceFlight.rocket.add(rocketWindow);

  // Fins
  const finMat = new THREE.MeshPhongMaterial({ color: 0x444444, shininess: 30, specular: 0x222222 });
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, 3), finMat);
    const angle = i / 4 * Math.PI * 2;
    fin.position.x = Math.cos(angle) * 2.5;
    fin.position.z = Math.sin(angle) * 2.5;
    fin.position.y = -4;
    fin.rotation.y = -angle;
    appCtx.spaceFlight.rocket.add(fin);
  }

  // Engine nozzle
  const nozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 2, 2, 20),
    new THREE.MeshPhongMaterial({ color: 0x555555, shininess: 40, specular: 0x333333 })
  );
  nozzle.position.y = -7;
  appCtx.spaceFlight.rocket.add(nozzle);

  // Engine glow
  const glow = new THREE.Mesh(
    new THREE.ConeGeometry(2, 8, 16),
    new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0 })
  );
  glow.position.y = -12;
  glow.rotation.x = Math.PI;
  glow.name = 'engineGlow';
  appCtx.spaceFlight.rocket.add(glow);

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
  appCtx.spaceFlight.rocket.add(exhaustGroup);

  appCtx.spaceFlight.scene.add(appCtx.spaceFlight.rocket);
}

function resetSpaceFlightForMoon() {
  // Get Earth's heliocentric position (Sun is at origin)
  const earthPos = typeof appCtx.getEarthHelioScenePosition === 'function' ?
  appCtx.getEarthHelioScenePosition() :
  new THREE.Vector3(800, 0, 0);

  // Position Earth at its orbital position
  appCtx.spaceFlight.earth.position.copy(earthPos);

  // Moon orbits Earth
  const moonPos = typeof appCtx.getMoonScenePosition === 'function' ?
  appCtx.getMoonScenePosition(earthPos) :
  new THREE.Vector3(earthPos.x + 120, earthPos.y + 20, earthPos.z);
  appCtx.spaceFlight.moon.position.copy(moonPos);

  // Rocket starts on Earth surface
  appCtx.spaceFlight.rocket.position.set(
    earthPos.x,
    earthPos.y + SPACE_CONSTANTS.EARTH_SIZE + 8,
    earthPos.z
  );
  appCtx.spaceFlight.rocket.quaternion.identity();

  // Reset velocity and speed
  appCtx.spaceFlight.velocity.set(0, 0, 0);
  if (appCtx.spaceFlight.gravityVelocity) appCtx.spaceFlight.gravityVelocity.set(0, 0, 0);
  if (appCtx.spaceFlight._gravityVec) appCtx.spaceFlight._gravityVec.set(0, 0, 0);
  appCtx.spaceFlight.speed = 0;
  appCtx.spaceFlight._launchSource = 'Earth';
  appCtx.spaceFlight.launchStartMs = Date.now();
  appCtx.spaceFlight._isThrusting = false;
  appCtx.spaceFlight._manualLandingTarget = 'Moon';
  appCtx.spaceFlight._autopilotTarget = null;

  // Solar system group stays at origin (Sun at center)
  if (typeof appCtx.setSolarSystemCenter === 'function') {
    appCtx.setSolarSystemCenter(new THREE.Vector3(0, 0, 0));
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
  const earthPos = typeof appCtx.getEarthHelioScenePosition === 'function' ?
  appCtx.getEarthHelioScenePosition() :
  new THREE.Vector3(800, 0, 0);

  // Position Earth at its orbital position
  appCtx.spaceFlight.earth.position.copy(earthPos);

  // Moon orbits Earth
  const moonPos = typeof appCtx.getMoonScenePosition === 'function' ?
  appCtx.getMoonScenePosition(earthPos) :
  new THREE.Vector3(earthPos.x + 120, earthPos.y + 20, earthPos.z);
  appCtx.spaceFlight.moon.position.copy(moonPos);

  // Rocket starts on Moon surface
  appCtx.spaceFlight.rocket.position.set(
    moonPos.x,
    moonPos.y + SPACE_CONSTANTS.MOON_SIZE + 8,
    moonPos.z
  );
  appCtx.spaceFlight.rocket.quaternion.identity();

  // Reset velocity and speed
  appCtx.spaceFlight.velocity.set(0, 0, 0);
  if (appCtx.spaceFlight.gravityVelocity) appCtx.spaceFlight.gravityVelocity.set(0, 0, 0);
  if (appCtx.spaceFlight._gravityVec) appCtx.spaceFlight._gravityVec.set(0, 0, 0);
  appCtx.spaceFlight.speed = 0;
  appCtx.spaceFlight._launchSource = 'Moon';
  appCtx.spaceFlight.launchStartMs = Date.now();
  appCtx.spaceFlight._isThrusting = false;
  appCtx.spaceFlight._manualLandingTarget = 'Earth';
  appCtx.spaceFlight._autopilotTarget = null;

  // Solar system group stays at origin
  if (typeof appCtx.setSolarSystemCenter === 'function') {
    appCtx.setSolarSystemCenter(new THREE.Vector3(0, 0, 0));
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
const _sfGravityTmp = new THREE.Vector3();
const _sfGravitySum = new THREE.Vector3();

function normalizeLandingTargetName(target) {
  const t = String(target || '').trim().toLowerCase();
  if (t === 'earth') return 'Earth';
  if (t === 'moon') return 'Moon';
  return null;
}

function findLandableBodyByName(target) {
  const normalized = normalizeLandingTargetName(target);
  if (!normalized) return null;

  if (typeof appCtx.getAllSpaceBodies === 'function') {
    const body = appCtx.getAllSpaceBodies().find((b) => b.landable && String(b.name).toLowerCase() === normalized.toLowerCase());
    if (body) return body;
  }

  if (normalized === 'Earth' && appCtx.spaceFlight.earth) {
    return {
      name: 'Earth',
      mesh: appCtx.spaceFlight.earth,
      position: appCtx.spaceFlight.earth.position,
      radius: SPACE_CONSTANTS.EARTH_SIZE,
      landable: true
    };
  }
  if (normalized === 'Moon' && appCtx.spaceFlight.moon) {
    return {
      name: 'Moon',
      mesh: appCtx.spaceFlight.moon,
      position: appCtx.spaceFlight.moon.position,
      radius: SPACE_CONSTANTS.MOON_SIZE,
      landable: true
    };
  }
  return null;
}

function startLandingSequence(targetMesh, targetRadius, targetName, landingDuration = 2000) {
  if (!targetMesh || !appCtx.spaceFlight.rocket) return false;

  appCtx.spaceFlight.mode = 'landing';
  appCtx.spaceFlight._landingTarget = targetName;
  appCtx.spaceFlight._autopilotTarget = null;
  showFlightMessage('LANDING SEQUENCE INITIATED', '#10b981');

  const startTime = Date.now();
  const startPos = appCtx.spaceFlight.rocket.position.clone();
  const landPos = targetMesh.position.clone();
  landPos.y += targetRadius + 10;
  const frozenTargetPos = targetMesh.position.clone();
  const duration = Math.max(1200, landingDuration);
  const landingAxis = new THREE.Vector3(0, -1, 0);
  const toTarget = new THREE.Vector3();

  function landingAnimation() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);

    appCtx.spaceFlight.rocket.position.lerpVectors(startPos, landPos, eased);
    appCtx.spaceFlight.velocity.multiplyScalar(0.9);
    if (appCtx.spaceFlight.gravityVelocity) appCtx.spaceFlight.gravityVelocity.multiplyScalar(0.85);

    toTarget.copy(frozenTargetPos).sub(appCtx.spaceFlight.rocket.position).normalize();
    appCtx.spaceFlight.rocket.quaternion.setFromUnitVectors(landingAxis, toTarget);

    if (progress < 1) {
      requestAnimationFrame(landingAnimation);
    } else {
      completeLanding();
    }
  }

  landingAnimation();
  return true;
}

function setSpaceFlightLandingTarget(target, options = {}) {
  if (!appCtx.spaceFlight.active || !appCtx.spaceFlight.rocket) return false;

  const normalized = normalizeLandingTargetName(target);
  if (!normalized) return false;

  const body = findLandableBodyByName(normalized);
  if (!body) return false;

  appCtx.spaceFlight.destination = normalized.toLowerCase();
  appCtx.spaceFlight._manualLandingTarget = normalized;
  appCtx.spaceFlight._autopilotTarget = null;

  const dist = appCtx.spaceFlight.rocket.position.distanceTo(body.position);
  const canLandNow = dist < SPACE_CONSTANTS.LANDING_DISTANCE + body.radius;

  if ((options.autoLand || options.force) && appCtx.spaceFlight.mode !== 'landing' && (canLandNow || options.force)) {
    const dynamicDuration = options.force ?
    Math.min(6500, Math.max(1800, Math.floor(dist * 4))) :
    2000;
    startLandingSequence(body.mesh, body.radius, body.name, dynamicDuration);
    return true;
  }

  showFlightMessage(`TARGET SET: ${normalized.toUpperCase()}`, '#10b981');
  return true;
}

function forceSpaceFlightLanding(target) {
  if (!appCtx.spaceFlight.active || !appCtx.spaceFlight.rocket || appCtx.spaceFlight.mode === 'landing') return false;
  const normalized = normalizeLandingTargetName(target);
  if (!normalized) return false;

  const body = findLandableBodyByName(normalized);
  if (!body || !body.mesh || !body.position) return false;

  appCtx.spaceFlight.destination = normalized.toLowerCase();
  appCtx.spaceFlight._manualLandingTarget = normalized;
  appCtx.spaceFlight._autopilotTarget = null;

  const dist = appCtx.spaceFlight.rocket.position.distanceTo(body.position);
  const duration = Math.min(7000, Math.max(1800, Math.floor(dist * 4.2)));
  return startLandingSequence(body.mesh, body.radius, body.name, duration);
}

function nearestLandableDistance(rocket, bodies) {
  let minDist = Infinity;
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (!b.landable || !b.position) continue;
    const d = rocket.position.distanceTo(b.position);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

function sunGravityWeightByLocalBodies(nearestLandableDist) {
  if (!Number.isFinite(nearestLandableDist)) return 1.0;
  if (nearestLandableDist <= 2200) return 0;
  if (nearestLandableDist >= 7000) return 1.0;
  return (nearestLandableDist - 2200) / (7000 - 2200);
}

function sunGravityRangeByLocalBodies(nearestLandableDist) {
  if (!Number.isFinite(nearestLandableDist)) return 35000;
  if (nearestLandableDist <= 2200) return 0;
  if (nearestLandableDist >= 7000) return 35000;
  const t = sunGravityWeightByLocalBodies(nearestLandableDist);
  return 9000 + t * (35000 - 9000);
}

function bodyGravityRange(body, nearestLandableDist) {
  if (!body || !body.name) return 0;
  if (body.name === 'Sun') return sunGravityRangeByLocalBodies(nearestLandableDist);
  return Math.max((body.radius || 20) * 95, 900);
}

function bodyGravityScale(body, nearestLandableDist) {
  if (!body || !body.name) return 1;
  if (body.name === 'Sun') return sunGravityWeightByLocalBodies(nearestLandableDist);
  return 1;
}

function computeBodyGravityAccel(body, distSq, nearestLandableDist) {
  const mu = getBodyGravityMu(body);
  if (mu <= 0) return 0;

  const scale = bodyGravityScale(body, nearestLandableDist);
  if (scale <= 0) return 0;

  const accel = mu / (distSq + SPACE_CONSTANTS.GRAVITY_SOFTENING);
  return Math.min(SPACE_CONSTANTS.MAX_GRAVITY_ACCEL, accel * scale);
}

function clampTotalGravity(sumVec) {
  if (!sumVec) return;
  if (sumVec.length() > SPACE_CONSTANTS.MAX_TOTAL_GRAVITY_ACCEL) {
    sumVec.setLength(SPACE_CONSTANTS.MAX_TOTAL_GRAVITY_ACCEL);
  }
}

function integrateGravityVelocity() {
  if (!appCtx.spaceFlight.gravityVelocity) return;

  appCtx.spaceFlight.gravityVelocity.add(_sfGravitySum);
  appCtx.spaceFlight.gravityVelocity.multiplyScalar(SPACE_CONSTANTS.GRAVITY_DAMPING);
  if (appCtx.spaceFlight.gravityVelocity.length() > SPACE_CONSTANTS.MAX_GRAVITY_SPEED) {
    appCtx.spaceFlight.gravityVelocity.setLength(SPACE_CONSTANTS.MAX_GRAVITY_SPEED);
  }

  if (appCtx.spaceFlight._gravityVec) appCtx.spaceFlight._gravityVec.copy(_sfGravitySum);
  return true;
}

function getBodyGravityMu(body) {
  const name = String(body?.name || '').toLowerCase();
  if (name === 'sun') return 3200;
  if (name === 'jupiter') return 5600;
  if (name === 'saturn') return 3900;
  if (name === 'neptune') return 2500;
  if (name === 'uranus') return 2300;
  if (name === 'earth') return 1800;
  if (name === 'venus') return 1400;
  if (name === 'mars') return 900;
  if (name === 'mercury') return 700;
  if (name === 'moon') return 300;
  if (body?.landable) return 600;
  return 0;
}

function shouldApplyGravityFromBody(body) {
  if (!body || !body.position) return false;
  const name = String(body.name || '').toLowerCase();
  if (name === 'sun') return true;
  if (body.landable) return true;
  return (
    name === 'mercury' ||
    name === 'venus' ||
    name === 'mars' ||
    name === 'jupiter' ||
    name === 'saturn' ||
    name === 'uranus' ||
    name === 'neptune');

}

function getLaunchAssistState(rocket) {
  if (!rocket || !appCtx.spaceFlight._launchSource) return null;
  const source = findLandableBodyByName(appCtx.spaceFlight._launchSource);
  if (!source || !source.position || !Number.isFinite(source.radius)) return null;

  const elapsedMs = Math.max(0, Date.now() - (appCtx.spaceFlight.launchStartMs || Date.now()));
  const dist = rocket.position.distanceTo(source.position);
  const altitude = Math.max(0, dist - source.radius);
  const altitudeFactor = Math.max(0, 1 - altitude / SPACE_CONSTANTS.LAUNCH_ASSIST_ALTITUDE);
  const timeFactor = Math.max(0, 1 - elapsedMs / SPACE_CONSTANTS.LAUNCH_ASSIST_WINDOW_MS);
  const strength = Math.max(altitudeFactor, timeFactor);
  if (strength <= 0) return null;

  return {
    source,
    sourceNameLower: String(source.name || '').toLowerCase(),
    altitude,
    elapsedMs,
    strength
  };
}

function applyPlanetaryGravity(rocket, launchAssist, isThrusting) {
  if (!appCtx.spaceFlight.gravityVelocity || typeof appCtx.getAllSpaceBodies !== 'function') return;

  const bodies = appCtx.getAllSpaceBodies();
  const nearLandableDist = nearestLandableDistance(rocket, bodies);
  _sfGravitySum.set(0, 0, 0);

  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i];
    if (!shouldApplyGravityFromBody(body)) continue;

    _sfGravityTmp.copy(body.position).sub(rocket.position);
    const distSq = _sfGravityTmp.lengthSq();
    if (distSq < 1) continue;

    const dist = Math.sqrt(distSq);
    const range = bodyGravityRange(body, nearLandableDist);
    if (dist > range) continue;

    let accel = computeBodyGravityAccel(body, distSq, nearLandableDist);
    if (launchAssist && accel > 0) {
      const bodyName = String(body.name || '').toLowerCase();
      if (bodyName === 'sun') {
        accel *= SPACE_CONSTANTS.LAUNCH_SUN_GRAVITY_SCALE;
      } else if (
      isThrusting &&
      launchAssist.sourceNameLower &&
      bodyName === launchAssist.sourceNameLower)
      {
        const attenuatedScale = 1 - launchAssist.strength * (1 - SPACE_CONSTANTS.LAUNCH_SOURCE_MIN_GRAVITY_SCALE);
        accel *= Math.max(SPACE_CONSTANTS.LAUNCH_SOURCE_MIN_GRAVITY_SCALE, attenuatedScale);
      }
    }
    if (accel <= 0) continue;
    _sfGravityTmp.multiplyScalar(1 / dist); // normalize in-place
    _sfGravitySum.addScaledVector(_sfGravityTmp, accel);
  }

  if (launchAssist && isThrusting && launchAssist.source?.position) {
    _sfGravityTmp.copy(rocket.position).sub(launchAssist.source.position);
    const outLen = _sfGravityTmp.length();
    if (outLen > 1e-3) {
      _sfGravityTmp.multiplyScalar(1 / outLen);
      _sfGravitySum.addScaledVector(_sfGravityTmp, SPACE_CONSTANTS.LAUNCH_ASSIST_ACCEL * launchAssist.strength);
    }
  }

  clampTotalGravity(_sfGravitySum);
  integrateGravityVelocity();
}

function updateSpaceFlightPhysics() {
  if (appCtx.spaceFlight.mode !== 'flying') return;

  const rocket = appCtx.spaceFlight.rocket;
  const keys = appCtx.spaceFlight.keys;
  const launchAssist = getLaunchAssistState(rocket);

  // --- STEERING: Camera-relative ---
  const cam = appCtx.spaceFlight.camera;

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
    const launchBoostMult = launchAssist ? SPACE_CONSTANTS.LAUNCH_BOOST_MULTIPLIER : 1;
    appCtx.spaceFlight.speed = Math.min(appCtx.spaceFlight.speed + SPACE_CONSTANTS.BOOST * launchBoostMult, SPACE_CONSTANTS.MAX_SPEED);
    if (launchAssist) {
      appCtx.spaceFlight.speed = Math.max(appCtx.spaceFlight.speed, SPACE_CONSTANTS.LAUNCH_MIN_SPEED);
    }
    isThrusting = true;
  } else if (keys['shift']) {
    appCtx.spaceFlight.speed = Math.max(appCtx.spaceFlight.speed - SPACE_CONSTANTS.BRAKE, 0);
  } else if (appCtx.spaceFlight.speed > 0) {
    // Only drift back to cruise if moving; stay stopped if at zero
    if (appCtx.spaceFlight.speed > SPACE_CONSTANTS.CRUISE_SPEED) {
      appCtx.spaceFlight.speed = Math.max(appCtx.spaceFlight.speed - SPACE_CONSTANTS.DRIFT_RATE, SPACE_CONSTANTS.CRUISE_SPEED);
    } else if (appCtx.spaceFlight.speed < SPACE_CONSTANTS.CRUISE_SPEED) {
      appCtx.spaceFlight.speed = Math.min(appCtx.spaceFlight.speed + SPACE_CONSTANTS.DRIFT_RATE, SPACE_CONSTANTS.CRUISE_SPEED);
    }
  }

  // Auto-slow near landable bodies so landing windows are practical at normal cruise speed.
  const nearBody = appCtx.spaceFlight._nearestBody;
  if (nearBody && nearBody.landable && nearBody.position) {
    const distToBody = rocket.position.distanceTo(nearBody.position);
    const inSlowZone = distToBody < SPACE_CONSTANTS.LANDING_DISTANCE + nearBody.radius + 180;
    if (inSlowZone) {
      const inLandingZone = distToBody < SPACE_CONSTANTS.LANDING_DISTANCE + nearBody.radius;
      const targetSpeed = inLandingZone ? 0.8 : 2.0;
      if (appCtx.spaceFlight.speed > targetSpeed) {
        appCtx.spaceFlight.speed = Math.max(targetSpeed, appCtx.spaceFlight.speed - SPACE_CONSTANTS.BRAKE * 1.2);
      }
    }
  }

  // --- MOVEMENT ---
  appCtx.spaceFlight._isThrusting = isThrusting;
  applyPlanetaryGravity(rocket, launchAssist, isThrusting);
  _sfForward.set(0, 1, 0).applyQuaternion(rocket.quaternion);
  appCtx.spaceFlight.velocity.copy(_sfForward).multiplyScalar(appCtx.spaceFlight.speed);
  if (appCtx.spaceFlight.gravityVelocity) {
    appCtx.spaceFlight.velocity.add(appCtx.spaceFlight.gravityVelocity);
  }
  rocket.position.add(appCtx.spaceFlight.velocity);

  // --- ENGINE EFFECTS ---
  const glow = rocket.getObjectByName('engineGlow');
  const exhaust = rocket.getObjectByName('exhaust');
  const thrustLevel = isThrusting ? 1.0 : appCtx.spaceFlight.speed / SPACE_CONSTANTS.MAX_SPEED;
  if (glow) {
    glow.material.opacity = 0.2 + thrustLevel * 0.6;
    glow.scale.y = 0.4 + thrustLevel * 0.6 + (isThrusting ? Math.random() * 0.3 : 0);
  }
  if (exhaust) {
    exhaust.children.forEach((p) => {
      p.material.opacity = 0.05 + thrustLevel * 0.35 + (isThrusting ? Math.random() * 0.3 : 0);
      if (thrustLevel > 0.3) {
        p.position.y = -10 - Math.random() * 8;
        p.scale.setScalar(0.3 + thrustLevel * 0.7);
      }
    });
  }

  // --- COLLISION: bounce off ALL celestial bodies ---
  if (typeof appCtx.getAllSpaceBodies === 'function') {
    const bodies = appCtx.getAllSpaceBodies();
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      const dist = rocket.position.distanceTo(body.position);
      const minDist = body.radius + 5;
      if (dist < minDist) {
        _sfTempVec.copy(rocket.position).sub(body.position).normalize().multiplyScalar(minDist);
        rocket.position.copy(body.position).add(_sfTempVec);
        appCtx.spaceFlight.speed = Math.max(appCtx.spaceFlight.speed * 0.5, SPACE_CONSTANTS.MIN_SPEED);
        if (appCtx.spaceFlight.gravityVelocity) appCtx.spaceFlight.gravityVelocity.multiplyScalar(0.35);
      }
    }
  } else {
    // Fallback: only check Earth and Moon
    const source = appCtx.spaceFlight.destination === 'moon' ? appCtx.spaceFlight.earth : appCtx.spaceFlight.moon;
    const sourceRadius = appCtx.spaceFlight.destination === 'moon' ? SPACE_CONSTANTS.EARTH_SIZE : SPACE_CONSTANTS.MOON_SIZE;
    const sourceDist = rocket.position.distanceTo(source.position);
    if (sourceDist < sourceRadius + 5) {
      _sfTempVec.copy(rocket.position).sub(source.position).normalize().multiplyScalar(sourceRadius + 5);
      rocket.position.copy(source.position).add(_sfTempVec);
      appCtx.spaceFlight.speed = Math.max(appCtx.spaceFlight.speed * 0.5, SPACE_CONSTANTS.MIN_SPEED);
      if (appCtx.spaceFlight.gravityVelocity) appCtx.spaceFlight.gravityVelocity.multiplyScalar(0.35);
    }
  }

  // Update HUD
  updateSpaceFlightHUD();
}

function updateSpaceFlightHUD() {
  const rocket = appCtx.spaceFlight.rocket;
  const manualTargetBody = findLandableBodyByName(appCtx.spaceFlight._manualLandingTarget);

  // Find nearest body dynamically
  let nearestBody = null;
  let nearestDist = Infinity;

  if (typeof appCtx.getAllSpaceBodies === 'function') {
    const bodies = appCtx.getAllSpaceBodies();
    bodies.forEach((body) => {
      const dist = rocket.position.distanceTo(body.position);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestBody = body;
      }
    });
  }

  // Fallback to legacy destination
  if (!nearestBody) {
    const target = appCtx.spaceFlight.destination === 'moon' ? appCtx.spaceFlight.moon : appCtx.spaceFlight.earth;
    const source = appCtx.spaceFlight.destination === 'moon' ? appCtx.spaceFlight.earth : appCtx.spaceFlight.moon;
    const distToTarget = rocket.position.distanceTo(target.position);
    const targetRadius = appCtx.spaceFlight.destination === 'moon' ? SPACE_CONSTANTS.MOON_SIZE : SPACE_CONSTANTS.EARTH_SIZE;
    nearestDist = distToTarget;
    nearestBody = {
      name: appCtx.spaceFlight.destination === 'moon' ? 'Moon' : 'Earth',
      position: target.position,
      radius: targetRadius,
      mesh: target,
      landable: true
    };
  }

  // Store nearest body for landing system
  appCtx.spaceFlight._nearestBody = nearestBody;

  let activeHudBody = nearestBody;
  let activeDist = nearestDist;
  if (manualTargetBody && manualTargetBody.position) {
    activeHudBody = manualTargetBody;
    activeDist = rocket.position.distanceTo(manualTargetBody.position);
  }

  // Update displays
  document.getElementById('sfDestination').textContent = activeHudBody.name;
  const altitude = Math.max(0, activeDist - activeHudBody.radius);
  document.getElementById('sfAltitude').textContent = Math.floor(altitude);
  const displaySpeed = appCtx.spaceFlight.velocity ? appCtx.spaceFlight.velocity.length() : appCtx.spaceFlight.speed;
  document.getElementById('sfSpeed').textContent = displaySpeed.toFixed(1);
  document.getElementById('sfDistance').textContent = Math.floor(activeDist);

  // Landing zone progress
  const landingProgress = Math.max(0, 1 - (activeDist - activeHudBody.radius) / SPACE_CONSTANTS.LANDING_DISTANCE);
  const landingBar = document.getElementById('sfLandingBar');
  const landingText = document.getElementById('sfLandingText');
  const landBtn = document.getElementById('sfLandBtn');

  if (landingBar) landingBar.style.width = landingProgress * 100 + '%';

  const canLand = activeDist < SPACE_CONSTANTS.LANDING_DISTANCE + activeHudBody.radius;

  if (canLand && activeHudBody.landable) {
    // Can land on Earth or Moon
    if (landingText) landingText.textContent = 'IN RANGE - Ready to land!';
    if (landBtn) {
      landBtn.disabled = false;
      landBtn.style.opacity = '1';
      landBtn.style.background = '#10b981';
      landBtn.textContent = 'LAND ON ' + activeHudBody.name.toUpperCase();
    }
  } else if (canLand && !activeHudBody.landable) {
    // Close to a non-landable body (planet flyby)
    if (landingText) landingText.textContent = 'Orbiting ' + activeHudBody.name + ' (flyby)';
    if (landingBar) landingBar.style.background = 'linear-gradient(90deg,#fbbf24,#f59e0b)';
    if (landBtn) {
      landBtn.disabled = true;
      landBtn.style.opacity = '0.7';
      landBtn.style.background = '#b45309';
      landBtn.textContent = 'ORBITING ' + activeHudBody.name.toUpperCase();
    }
  } else {
    // Far from any body
    if (landingBar) landingBar.style.background = 'linear-gradient(90deg,#10b981,#34d399)';
    if (landingText) landingText.textContent = 'Nearest: ' + activeHudBody.name + ' (' + Math.floor(altitude) + ' km)';
    if (landBtn) {
      landBtn.disabled = true;
      landBtn.style.opacity = '0.5';
      landBtn.style.background = '#667eea';
      landBtn.textContent = 'FLY TO ' + activeHudBody.name.toUpperCase();
    }
  }
}

function updateSpaceFlightCamera() {
  const rocket = appCtx.spaceFlight.rocket;

  // Rocket's forward direction (local +Y)
  _sfForward.set(0, 1, 0).applyQuaternion(rocket.quaternion);

  // Rocket's local "up"
  _sfTempVec.set(0, 0, -1).applyQuaternion(rocket.quaternion);

  // Chase camera
  _sfTargetPos.copy(rocket.position).
  addScaledVector(_sfForward, -70).
  addScaledVector(_sfTempVec, 25);

  appCtx.spaceFlight.camera.position.lerp(_sfTargetPos, 0.1);
  appCtx.spaceFlight.camera.up.copy(_sfTempVec);
  appCtx.spaceFlight.camera.lookAt(rocket.position);
}

function animateSpaceFlight() {
  if (!appCtx.spaceFlight.active) return;

  appCtx.spaceFlight.animationId = requestAnimationFrame(animateSpaceFlight);

  // Rotate planets slowly
  if (appCtx.spaceFlight.earth) appCtx.spaceFlight.earth.rotation.y += 0.0005;
  if (appCtx.spaceFlight.moon) appCtx.spaceFlight.moon.rotation.y += 0.0002;

  // Pulse landing rings on both Earth and Moon
  [appCtx.spaceFlight.earth, appCtx.spaceFlight.moon].forEach((body) => {
    if (body) {
      const ring = body.getObjectByName('landingRing');
      if (ring) {
        ring.material.opacity = 0.4 + Math.sin(Date.now() * 0.003) * 0.3;
      }
    }
  });

  // Update Earth and Moon heliocentric positions (slow orbital drift)
  // FREEZE positions during landing so the landing target doesn't move
  if (appCtx.spaceFlight.mode !== 'landing') {
    if (typeof appCtx.getEarthHelioScenePosition === 'function' && appCtx.spaceFlight.earth) {
      const earthPos = appCtx.getEarthHelioScenePosition();
      appCtx.spaceFlight.earth.position.lerp(earthPos, 0.01);

      if (typeof appCtx.getMoonScenePosition === 'function' && appCtx.spaceFlight.moon) {
        const moonPos = appCtx.getMoonScenePosition(appCtx.spaceFlight.earth.position);
        appCtx.spaceFlight.moon.position.copy(moonPos);
      }
    }
  }

  // Update solar system planets
  if (typeof appCtx.updateSolarSystem === 'function') {
    appCtx.updateSolarSystem();
  }

  // Update physics and camera
  updateSpaceFlightPhysics();
  updateSpaceFlightCamera();

  // Render
  if (appCtx.spaceFlight.renderer && appCtx.spaceFlight.scene && appCtx.spaceFlight.camera) {
    appCtx.spaceFlight.renderer.render(appCtx.spaceFlight.scene, appCtx.spaceFlight.camera);
  }
}

function attemptLanding() {
  // Find nearest landable body
  let target = null;
  let targetRadius = 0;
  let targetName = '';
  const forcedTarget = normalizeLandingTargetName(appCtx.spaceFlight._manualLandingTarget);

  if (forcedTarget) {
    const forcedBody = findLandableBodyByName(forcedTarget);
    if (forcedBody && forcedBody.mesh && forcedBody.position) {
      target = forcedBody.mesh;
      targetRadius = forcedBody.radius;
      targetName = forcedBody.name;
      const forcedDist = appCtx.spaceFlight.rocket.position.distanceTo(forcedBody.position);
      if (forcedDist >= SPACE_CONSTANTS.LANDING_DISTANCE + targetRadius) return;
    }
  }

  if (!target) {
    if (typeof appCtx.getAllSpaceBodies === 'function') {
      const bodies = appCtx.getAllSpaceBodies();
      let nearestDist = Infinity;
      bodies.forEach((body) => {
        if (!body.landable) return;
        const dist = appCtx.spaceFlight.rocket.position.distanceTo(body.position);
        if (dist < nearestDist) {
          nearestDist = dist;
          target = body.mesh;
          targetRadius = body.radius;
          targetName = body.name;
        }
      });

      if (!target || nearestDist >= SPACE_CONSTANTS.LANDING_DISTANCE + targetRadius) return;
    } else {
      // Fallback
      target = appCtx.spaceFlight.destination === 'moon' ? appCtx.spaceFlight.moon : appCtx.spaceFlight.earth;
      targetRadius = appCtx.spaceFlight.destination === 'moon' ? SPACE_CONSTANTS.MOON_SIZE : SPACE_CONSTANTS.EARTH_SIZE;
      targetName = appCtx.spaceFlight.destination === 'moon' ? 'Moon' : 'Earth';
      const dist = appCtx.spaceFlight.rocket.position.distanceTo(target.position);
      if (dist >= SPACE_CONSTANTS.LANDING_DISTANCE + targetRadius) return;
    }
  }

  // Perform landing
  return startLandingSequence(target, targetRadius, targetName, 2000);
}

function completeLanding() {
  const targetName = appCtx.spaceFlight._landingTarget || appCtx.spaceFlight.destination;
  console.log("Landing complete! Target:", targetName);

  showFlightMessage('LANDING SUCCESSFUL!', '#10b981');

  setTimeout(() => {
    exitSpaceFlight();

    if (targetName === 'Moon' || targetName === 'moon') {
      if (typeof appCtx.arriveAtMoon === 'function') {
        appCtx.arriveAtMoon();
      }
    } else {
      if (typeof appCtx.arriveAtEarth === 'function') {
        appCtx.arriveAtEarth();
      }
    }
  }, 1500);
}

function exitSpaceFlight() {
  console.log("Exiting space flight...");

  appCtx.spaceFlight.active = false;

  if (appCtx.spaceFlight.animationId) {
    cancelAnimationFrame(appCtx.spaceFlight.animationId);
    appCtx.spaceFlight.animationId = null;
  }

  appCtx.spaceFlight.canvas.style.display = 'none';
  appCtx.spaceFlight.hud.style.display = 'none';

  if (typeof appCtx.hideSolarSystemUI === 'function') appCtx.hideSolarSystemUI();

  const proxHud = document.getElementById('ssProximity');
  if (proxHud) proxHud.style.display = 'none';

  const worldCanvas = document.querySelector('canvas:not(#spaceFlightCanvas)');
  if (worldCanvas) worldCanvas.style.display = 'block';

  showGameUI();
  appCtx.spaceFlight.keys = {};
  appCtx.spaceFlight._manualLandingTarget = null;
  appCtx.spaceFlight._autopilotTarget = null;
  appCtx.spaceFlight._launchSource = null;
  appCtx.spaceFlight.launchStartMs = 0;
  appCtx.spaceFlight._isThrusting = false;
  if (appCtx.spaceFlight.gravityVelocity) appCtx.spaceFlight.gravityVelocity.set(0, 0, 0);
  if (appCtx.spaceFlight._gravityVec) appCtx.spaceFlight._gravityVec.set(0, 0, 0);
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

Object.assign(appCtx, {
  animateSpaceFlight,
  forceSpaceFlightLanding,
  setSpaceFlightLandingTarget,
  startSpaceFlightToEarth,
  startSpaceFlightToMoon
});

export {
  animateSpaceFlight,
  forceSpaceFlightLanding,
  setSpaceFlightLandingTarget,
  startSpaceFlightToEarth,
  startSpaceFlightToMoon };


if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSpaceFlightWhenReady);
} else {
  initSpaceFlightWhenReady();
}