// ============================================================================
// space.js - Space Flight Transition Module
// Rocket flight in heliocentric solar system - fly to any planet
// ============================================================================

// Space flight state (global)
window.spaceFlight = {
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
  _nearestBody: null,   // closest body for HUD
  _landingTarget: null   // body name being landed on
};

// Constants
const SPACE_CONSTANTS = {
  EARTH_SIZE: 50,
  MOON_SIZE: 13.5,
  MOON_DISTANCE: 1500,
  MIN_SPEED: 0,
  CRUISE_SPEED: 3.0,
  MAX_SPEED: 30,       // Increased for solar system exploration
  BOOST: 0.25,
  BRAKE: 0.15,
  DRIFT_RATE: 0.04,
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
