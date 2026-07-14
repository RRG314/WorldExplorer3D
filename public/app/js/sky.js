import { ctx as appCtx } from "./shared-context.js?v=55";
import { captureEarthWorldSession, resumeEarthWorldSession } from "./earth-session.js?v=3";
import {
  cycleTimeOfDay as cycleSkyTimeOfDay,
  getAstronomicalSkySnapshot,
  inspectAstronomicalSkyState,
  refreshAstronomicalSky as refreshAstronomicalSkyState,
  setTimeOfDay as setSkyTimeOfDay
} from "./sky/astronomical-state.js?v=1";
import {
  alignStarFieldToLocation,
  checkMoonClick as checkMoonSelection,
  checkStarClick,
  clearStarSelection,
  createStarField,
  highlightConstellation,
  showStarInfo
} from "./sky/starfield-ui.js?v=2";
import { createMoonLandingUiApi } from "./sky/moon-landing-ui.js?v=2";
import { suspendEarthModesForPlanetaryEntry } from "./planetary/entry.js?v=3";
// ============================================================================
// sky.js - Time of day, starfield, constellations, moon system
// ============================================================================

function emitTutorialEvent(eventName, payload = {}) {
  if (typeof appCtx.tutorialOnEvent === 'function') {
    appCtx.tutorialOnEvent(eventName, payload);
  }
}

function refreshAstronomicalSky(force = false) {
  if (appCtx.onMars) return appCtx.astronomicalSkyState || null;
  return refreshAstronomicalSkyState(force, { alignStarFieldToLocation });
}

function setTimeOfDay(time) {
  return setSkyTimeOfDay(time, { alignStarFieldToLocation });
}

function cycleTimeOfDay() {
  return cycleSkyTimeOfDay({ alignStarFieldToLocation });
}

const moonLandingUiApi = createMoonLandingUiApi({
  THREE,
  appCtx,
  onReturnToEarth: () => returnToEarth()
});

const {
  createApollo11LandingSite,
  getApollo11Flag,
  hideReturnToEarthButton,
  positionCarOnMoon,
  showApollo11Info,
  showReturnToEarthButton
} = moonLandingUiApi;

function checkMoonClick(clientX, clientY) {
  return checkMoonSelection(clientX, clientY, travelToMoon);
}

function runTimedCameraTransition({
  duration = 3000,
  onFrame,
  onComplete,
  isCurrent = () => true
}) {
  const startTime = Date.now();
  let finished = false;

  const complete = () => {
    if (finished) return;
    finished = true;
    if (typeof onComplete === 'function') onComplete();
  };

  const animate = () => {
    if (finished) return;
    if (!isCurrent()) {
      finished = true;
      return;
    }
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = progress < 0.5 ?
      2 * progress * progress :
      1 - Math.pow(-2 * progress + 2, 2) / 2;

    if (typeof onFrame === 'function') onFrame(eased, progress);

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      complete();
    }
  };

  requestAnimationFrame(animate);
  window.setTimeout(complete, duration + 250);
}

// Direct travel to moon (bypasses space flight module)
async function directTravelToMoon() {
  if (appCtx.travelingToMoon || appCtx.onMoon) return;

  if (typeof appCtx.showTransitionLoad === 'function') {
    await appCtx.showTransitionLoad('moon');
    if (appCtx.travelingToMoon || appCtx.onMoon) return;
  }

  appCtx.travelingToMoon = true;

  // Save Earth position
  appCtx.earthPosition = {
    x: appCtx.car.x,
    z: appCtx.car.z,
    angle: appCtx.car.angle
  };
  captureEarthWorldSession();
  suspendEarthModesForPlanetaryEntry();

  appCtx.paused = true;
  appCtx.scene.background = new THREE.Color(0x000000);

  if (appCtx.terrainGroup) {appCtx.terrainGroup.visible = false;appCtx.scene.remove(appCtx.terrainGroup);}
  if (appCtx.cloudGroup) {appCtx.cloudGroup.visible = false;appCtx.scene.remove(appCtx.cloudGroup);}
  appCtx.roadMeshes.forEach((m) => {m.visible = false;appCtx.scene.remove(m);});
  appCtx.buildingMeshes.forEach((m) => {m.visible = false;appCtx.scene.remove(m);});
  appCtx.landuseMeshes.forEach((m) => {m.visible = false;appCtx.scene.remove(m);});
  appCtx.poiMeshes.forEach((m) => {m.visible = false;appCtx.scene.remove(m);});
  appCtx.streetFurnitureMeshes.forEach((m) => {m.visible = false;appCtx.scene.remove(m);});

  const moonPos = appCtx.moonSphere.position.clone();
  const startPos = appCtx.camera.position.clone();
  runTimedCameraTransition({
    duration: 3000,
    onFrame: (eased) => {
      appCtx.camera.position.lerpVectors(startPos, moonPos, eased);
      appCtx.camera.lookAt(moonPos);
    },
    onComplete: () => {
      arriveAtMoon();
    }
  });
}

// Direct return to Earth (bypasses space flight module)
function returnToEarthDirect() {
  return returnToEarth();
}

// Travel to the moon with smooth animation
async function travelToMoon() {
  if (appCtx.travelingToMoon || appCtx.onMoon) return;

  if (typeof appCtx.showTransitionLoad === 'function') {
    await appCtx.showTransitionLoad('space');
    if (appCtx.travelingToMoon || appCtx.onMoon) return;
  }

  // Use the new space flight system if available
  if (typeof appCtx.startSpaceFlightToMoon === 'function') {
    appCtx.startSpaceFlightToMoon();
    return;
  }

  // Fallback to original behavior if space.js not loaded
  appCtx.travelingToMoon = true;

  // Save Earth position
  appCtx.earthPosition = {
    x: appCtx.car.x,
    z: appCtx.car.z,
    angle: appCtx.car.angle
  };
  captureEarthWorldSession();
  suspendEarthModesForPlanetaryEntry();

  // Disable controls during travel
  appCtx.paused = true;

  // IMMEDIATELY set background to black for space
  appCtx.scene.background = new THREE.Color(0x000000);

  // IMMEDIATELY hide Earth terrain to prevent "green sheet" during travel
  if (appCtx.terrainGroup) {
    appCtx.terrainGroup.visible = false;
    appCtx.scene.remove(appCtx.terrainGroup);
  }
  if (appCtx.cloudGroup) {
    appCtx.cloudGroup.visible = false;
    appCtx.scene.remove(appCtx.cloudGroup);
  }

  // Hide Earth ground plane (grass texture fallback)
  appCtx.scene.traverse((obj) => {
    if (obj.userData && obj.userData.isGroundPlane) {
      obj.visible = false;
    }
  });

  // Remove all city meshes from scene
  appCtx.roadMeshes.forEach((m) => {
    m.visible = false;
    appCtx.scene.remove(m);
  });
  appCtx.buildingMeshes.forEach((m) => {
    m.visible = false;
    appCtx.scene.remove(m);
  });
  appCtx.landuseMeshes.forEach((m) => {
    m.visible = false;
    appCtx.scene.remove(m);
  });
  appCtx.poiMeshes.forEach((m) => {
    m.visible = false;
    appCtx.scene.remove(m);
  });

  // Get moon position
  const moonPos = appCtx.moonSphere.position.clone();
  const startPos = appCtx.camera.position.clone();
  runTimedCameraTransition({
    duration: 3000,
    onFrame: (eased) => {
      appCtx.camera.position.lerpVectors(startPos, moonPos, eased);
      appCtx.camera.lookAt(moonPos);
    },
    onComplete: () => {
      arriveAtMoon();
    }
  });
}

// Create moon surface when arriving
function arriveAtMoon() {
  // Debug log removed

  suspendEarthModesForPlanetaryEntry();

  appCtx.switchEnv(appCtx.ENV.MOON); // sets onMoon=true, travelingToMoon=false
  appCtx.setEarthSceneVisible?.(false);
  emitTutorialEvent('entered_moon', { source: 'moon_arrival' });
  const weatherPanel = document.getElementById('weatherPanel');
  if (weatherPanel) weatherPanel.style.display = 'none';

  // IMMEDIATELY set black background and hide car to prevent earth ground flash
  appCtx.scene.background = new THREE.Color(0x000000);
  appCtx.scene.fog = new THREE.FogExp2(0x000000, 0.00005);
  if (appCtx.renderer) appCtx.renderer.toneMappingExposure = 1.05;
  appCtx.setLunarEarthVisible?.(true);
  appCtx.setPlanetarySky?.('moon');
  if (appCtx.carMesh) appCtx.carMesh.visible = false;
  appCtx.paused = true; // Pause rendering updates until moon is ready

  // Reset to driving mode so everything starts clean at the landing site
  if (appCtx.droneMode) {
    appCtx.droneMode = false;
    const droneBtn = document.getElementById('fDrone');
    if (droneBtn) droneBtn.classList.remove('on');
  }
  if (appCtx.Walk && appCtx.Walk.state.mode === 'walk') {
    appCtx.Walk.setModeDrive();
  }
  const drivingBtn = document.getElementById('fDriving');
  if (drivingBtn) drivingBtn.classList.add('on');
  const walkBtn = document.getElementById('fWalk');
  if (walkBtn) walkBtn.classList.remove('on');

  // Update space menu button labels
  const directBtn = document.getElementById('fSpaceDirect');
  const rocketBtn = document.getElementById('fSpaceRocket');
  if (directBtn) directBtn.textContent = '🌍 Return to Earth';
  if (rocketBtn) rocketBtn.textContent = '🌍 Return to Earth';

  // Earth terrain already hidden during travel animation

  // Hide ALL earth objects to prevent any flash of earth ground
  if (appCtx.terrainGroup) {
    appCtx.terrainGroup.visible = false;
    appCtx.scene.remove(appCtx.terrainGroup);
  }
  if (appCtx.cloudGroup) {
    appCtx.cloudGroup.visible = false;
    appCtx.scene.remove(appCtx.cloudGroup);
  }
  appCtx.scene.traverse((obj) => {
    if (obj.userData && obj.userData.isGroundPlane) {
      obj.visible = false;
    }
  });
  // Force-hide Earth world meshes here as a final guard. This keeps the moon
  // scene clean even if an Earth load finished moments before/after transition.
  appCtx.roadMeshes.forEach((m) => {
    if (!m) return;
    m.visible = false;
    appCtx.scene.remove(m);
  });
  appCtx.buildingMeshes.forEach((m) => {
    if (!m) return;
    m.visible = false;
    appCtx.scene.remove(m);
  });
  appCtx.landuseMeshes.forEach((m) => {
    if (!m) return;
    m.visible = false;
    appCtx.scene.remove(m);
  });
  appCtx.poiMeshes.forEach((m) => {
    if (!m) return;
    m.visible = false;
    appCtx.scene.remove(m);
  });
  appCtx.streetFurnitureMeshes.forEach((m) => {
    if (!m) return;
    m.visible = false;
    appCtx.scene.remove(m);
  });

  // Hide moon sphere (we're on it now!)
  appCtx.moonSphere.visible = false;
  if (appCtx.moonSphere.userData.glow) appCtx.moonSphere.userData.glow.visible = false;

  // Create moon surface
  if (!appCtx.moonSurface) {
    createMoonSurface();
    // Car positioning will happen after moonSurface is fully created
    // (positionCarOnMoon is called in createMoonSurface's setTimeout)
  } else {
    // Re-add and show all moon objects (safe even if already in scene)
    appCtx.moonSurface.visible = true;
    appCtx.scene.add(appCtx.moonSurface);
    if (window.apollo11Beacon) {window.apollo11Beacon.visible = true;appCtx.scene.add(window.apollo11Beacon);}
    const apollo11Flag = getApollo11Flag();
    if (apollo11Flag) {apollo11Flag.visible = true;appCtx.scene.add(apollo11Flag);}
    // Re-add tagged moon objects (plaque, pole, footprints)
    if (window._moonObjects) {
      window._moonObjects.forEach((obj) => {obj.visible = true;appCtx.scene.add(obj);});
    }
    // Position car immediately if moonSurface already exists
    positionCarOnMoon();
    // Show car and unpause now that moon is ready
    if (appCtx.carMesh) appCtx.carMesh.visible = true;
    appCtx.paused = false;
  }
  void appCtx.setPlanetaryVehicle?.('moon');
  appCtx.setPlanetaryCharacter?.('moon');

  // Adjust lighting for moon - stronger sun for better shading and shadows
  if (appCtx.sun) {
    appCtx.sun.intensity = 2.0; // Brighter sun for stronger shadows on moon
    appCtx.sun.position.set(100, 200, 100); // Higher angle for better shadow casting
  }
  if (appCtx.ambientLight) {
    appCtx.ambientLight.intensity = 0.15; // Lower ambient for more dramatic shadows
  }
  if (appCtx.fillLight) {
    appCtx.fillLight.intensity = 0.1; // Very low fill light
  }

  // Show return button
  showReturnToEarthButton();

  // Debug log removed
}

// Create REAL lunar surface based on Apollo mission data and lunar surveys
function createMoonSurface() {
  // Debug log removed

  const size = 12000; // Wider lunar field to keep horizon context while driving
  const segments = 220; // Keep dense enough for smoother crater ramps

  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  // REAL LUNAR FEATURES based on Apollo 11 landing site (Mare Tranquillitatis)
  // And data from Lunar Reconnaissance Orbiter (LRO)

  // Major craters from real lunar data (Apollo 11 landing site area)
  const realCraters = [
  // Based on real Apollo 11 site craters
  { cx: -2000, cz: 1500, radius: 600, depth: 120 }, // West Crater
  { cx: 3500, cz: -2000, radius: 800, depth: 150 }, // Maskelyne
  { cx: -3000, cz: -3000, radius: 700, depth: 140 }, // Moltke
  { cx: 2500, cz: 3000, radius: 900, depth: 180 }, // Sabine (largest)
  { cx: -1500, cz: -2500, radius: 550, depth: 100 }, // Ritter
  { cx: 3800, cz: 2500, radius: 650, depth: 130 }, // Schmidt
  { cx: 1000, cz: -1000, radius: 750, depth: 160 }, // Arago
  { cx: -3500, cz: 2000, radius: 600, depth: 110 }, // Dionysius
  { cx: 500, cz: 3500, radius: 450, depth: 85 }, // Ranger VIII
  { cx: 2800, cz: -3200, radius: 500, depth: 95 }, // Surveyor V
  { cx: 200, cz: -500, radius: 350, depth: 70 }, // Eagle Crater (Apollo 11)
  { cx: -800, cz: 800, radius: 280, depth: 55 } // Little West
  ];

  // Debug log removed

  const clamp01 = (value) => Math.max(0, Math.min(1, value));
  const hashNoise = (x, z, freq) => {
    const n = Math.sin(x * freq * 12.9898 + z * freq * 78.233) * 43758.5453;
    return n - Math.floor(n);
  };
  const sampleMoonHeight = (x, z) => {
    let height = 0;

    // Primary crater bowls and rims.
    for (const crater of realCraters) {
      const dx = x - crater.cx;
      const dz = z - crater.cz;
      const dist = Math.hypot(dx, dz);
      if (dist < crater.radius) {
        const t = dist / crater.radius;
        const bowlDepth = -crater.depth * (1 - t * t * t);
        const rimHeight = t > 0.75 ? crater.depth * 0.18 * Math.pow((t - 0.75) / 0.25, 2) * (1 - t) * 4 : 0;
        height += bowlDepth + rimHeight;
      }
    }

    // Macro lunar undulation (maria + broader wave fields).
    height += Math.sin(x * 0.0018) * Math.cos(z * 0.0022) * 28;
    height += Math.sin((x + z) * 0.00095) * 16;

    // Mid-frequency ripples that make motion readability better while preserving realism.
    height += Math.sin(x * 0.014) * Math.cos(z * 0.016) * 4.5;
    height += Math.sin(x * 0.032 + z * 0.026) * 1.8;

    // Regolith grain and micro-impacts.
    const grain = (hashNoise(x, z, 0.035) - 0.5) * 2.4;
    const microImpact = (hashNoise(x + 913.2, z - 412.7, 0.012) - 0.5) * 6.0;
    height += grain + microImpact;

    // Extra local relief around the Apollo 11 spawn zone so desktop driving
    // clearly shows motion and slope changes even before reaching major craters.
    const landingDx = x - 200;
    const landingDz = z + 500;
    const landingDist = Math.hypot(landingDx, landingDz);
    if (landingDist < 1100) {
      const influence = 1 - landingDist / 1100;
      const ridge =
      Math.sin((x + 80) * 0.06) * Math.cos((z - 40) * 0.048) * 7.5 +
      Math.sin((x - z) * 0.032) * 4.1;
      const shallowBowl = -6.0 * Math.exp(-landingDist * landingDist / (2 * 420 * 420));
      height += (ridge + shallowBowl) * influence;
    }

    // Slight mare tilt.
    height += x * 0.001 + z * 0.0008;
    return height;
  };

  // Track min/max height for color mapping
  let minHeight = Infinity;
  let maxHeight = -Infinity;

  const positions = geometry.attributes.position;
  const heights = new Array(positions.count);

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);

    const height = sampleMoonHeight(x, z);

    positions.setY(i, height);
    heights[i] = height;

    minHeight = Math.min(minHeight, height);
    maxHeight = Math.max(maxHeight, height);
  }

  // Debug log removed

  positions.needsUpdate = true;
  geometry.computeVertexNormals();

  // Realistic lunar palette with slope-aware contrast so terrain movement reads clearly.
  const normals = geometry.attributes.normal;
  const colors = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const height = heights[i];
    const t = (height - minHeight) / Math.max(1e-6, maxHeight - minHeight);
    const ny = clamp01(normals.getY(i));
    const slope = 1 - ny;

    // Lower areas are basaltic maria (darker), higher areas are brighter highlands.
    const mareMask = clamp01(0.65 - t + slope * 0.2);
    let r = 0.4 + t * 0.32;
    let g = 0.39 + t * 0.3;
    let b = 0.37 + t * 0.27;
    const mareDarken = mareMask * 0.15;
    r -= mareDarken;
    g -= mareDarken * 0.92;
    b -= mareDarken * 0.88;

    // Baked micro-shading and albedo breakup to avoid a monotone look.
    const grain = (hashNoise(x - 213.7, z + 781.1, 0.006) - 0.5) * 0.16;
    const shade = clamp01(0.76 + slope * 0.72 + grain);
    r = clamp01(r * shade);
    g = clamp01(g * shade);
    b = clamp01(b * shade);

    colors[i * 3] = Math.max(0.06, r);
    colors[i * 3 + 1] = Math.max(0.06, g);
    colors[i * 3 + 2] = Math.max(0.06, b);
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.97,
    metalness: 0.0,
    emissive: 0x111111,
    emissiveIntensity: 0.18,
    flatShading: false
  });

  appCtx.moonSurface = new THREE.Mesh(geometry, material);
  appCtx.moonSurface.receiveShadow = true;
  appCtx.moonSurface.castShadow = false;
  appCtx.moonSurface.frustumCulled = false; // Always render - prevents disappearing at high drone altitude
  appCtx.moonSurface.position.y = -100;
  appCtx.scene.add(appCtx.moonSurface);

  // Add instanced lunar rocks for scale and motion cues while driving/walking.
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x7e838d,
    roughness: 0.99,
    metalness: 0.01
  });
  const targetRockCount = 900;
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, targetRockCount);
  const rockTransform = new THREE.Object3D();
  const rockColor = new THREE.Color();
  let moonRockSeed = 0x4c4f4c41;
  const moonRandom = () => {
    moonRockSeed = (Math.imul(moonRockSeed, 1664525) + 1013904223) >>> 0;
    return moonRockSeed / 4294967296;
  };
  let placedRocks = 0;
  const placeRockAt = (rx, rz, rockScale, toneBias = 0) => {
    if (placedRocks >= targetRockCount) return false;
    const localY = sampleMoonHeight(rx, rz);
    rockTransform.position.set(rx, localY + appCtx.moonSurface.position.y + rockScale * 0.33, rz);
    rockTransform.rotation.set(moonRandom() * 0.6, moonRandom() * Math.PI * 2, moonRandom() * 0.6);
    rockTransform.scale.setScalar(rockScale);
    rockTransform.updateMatrix();
    rocks.setMatrixAt(placedRocks, rockTransform.matrix);

    const tone = Math.max(0.18, Math.min(0.72, 0.28 + moonRandom() * 0.34 + toneBias));
    rockColor.setRGB(tone, tone * 0.98, tone * 0.93);
    rocks.setColorAt(placedRocks, rockColor);
    placedRocks++;
    return true;
  };

  for (let attempt = 0; attempt < targetRockCount * 2 && placedRocks < targetRockCount; attempt++) {
    const radius = Math.sqrt(moonRandom()) * (size * 0.48);
    const theta = moonRandom() * Math.PI * 2;
    const rx = Math.cos(theta) * radius;
    const rz = Math.sin(theta) * radius;

    // Keep immediate wheel spawn clear, but keep surrounding area populated for motion cues.
    if (Math.hypot(rx - 200, rz + 500) < 45) continue;

    const rockScale = 0.8 + Math.pow(moonRandom(), 2.05) * 12.0;
    placeRockAt(rx, rz, rockScale, -0.03);
  }

  // Guaranteed visual landmarks near the Apollo start zone for desktop readability.
  const spawnX = 200;
  const spawnZ = -500;
  for (let i = 0; i < 36 && placedRocks < targetRockCount; i++) {
    const theta = i / 36 * Math.PI * 2;
    const radial = 55 + (i % 3) * 35 + moonRandom() * 20;
    const rx = spawnX + Math.cos(theta) * radial;
    const rz = spawnZ + Math.sin(theta) * radial;
    const scale = 2.5 + moonRandom() * 8.5;
    placeRockAt(rx, rz, scale, 0.08);
  }

  rocks.count = placedRocks;
  rocks.instanceMatrix.needsUpdate = true;
  if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  rocks.frustumCulled = false;
  rocks.userData.moonObject = true;
  appCtx.scene.add(rocks);
  if (!Array.isArray(window._moonObjects)) window._moonObjects = [];
  window._moonObjects.push(rocks);

  // Delay Apollo 11 landing site creation to ensure moonSurface is fully in scene
  setTimeout(() => {
    createApollo11LandingSite();
    // Position car after both moonSurface and landing site are ready
    positionCarOnMoon();
    // Now that moon surface and car are positioned, reveal the car and unpause
    if (appCtx.carMesh) appCtx.carMesh.visible = true;
    // Snap camera to car position immediately to avoid seeing earth ground
    if (appCtx.camera) {
      const camD = 10,camH = 5;
      appCtx.camera.position.set(
        appCtx.car.x - Math.sin(appCtx.car.angle) * camD,
        appCtx.car.y + camH,
        appCtx.car.z - Math.cos(appCtx.car.angle) * camD
      );
      appCtx.camera.lookAt(appCtx.car.x, appCtx.car.y + 0.5, appCtx.car.z);
      // Reset the smoothed lookAt target so chase cam doesn't lerp from old position
      if (appCtx.camera.userData) {
        appCtx.camera.userData.lookTarget = { x: appCtx.car.x, y: appCtx.car.y + 0.5, z: appCtx.car.z };
      }
    }
    appCtx.paused = false;
  }, 150);

  // Debug log removed
  // Debug log removed
  // Debug log removed
}


// Return to Earth
let earthArrivalSessionId = 0;

function cancelPendingEarthArrival() {
  earthArrivalSessionId++;
}

function returnToEarth() {
  if (!appCtx.onMoon || appCtx.travelingToMoon) return;
  const arrivalSessionId = ++earthArrivalSessionId;

  // Always use direct travel for return (no space flight)

  appCtx.travelingToMoon = true;
  appCtx.paused = true;

  // Hide return button
  hideReturnToEarthButton();

  const startPos = appCtx.camera.position.clone();
  const savedPose = appCtx.earthSessionState?.pose;
  const earthX = Number(savedPose?.x ?? appCtx.earthPosition?.x);
  const earthZ = Number(savedPose?.z ?? appCtx.earthPosition?.z);
  const earthCameraPos = new THREE.Vector3(
    Number.isFinite(earthX) ? earthX : 0,
    50,
    (Number.isFinite(earthZ) ? earthZ : 0) + 20
  );
  runTimedCameraTransition({
    duration: 3000,
    isCurrent: () => arrivalSessionId === earthArrivalSessionId,
    onFrame: (eased) => {
      appCtx.camera.position.lerpVectors(startPos, earthCameraPos, eased);
    },
    onComplete: () => {
      if (arrivalSessionId === earthArrivalSessionId) void arriveAtEarth(arrivalSessionId);
    }
  });
}

// Arrive back at Earth
async function arriveAtEarth(expectedSessionId = null) {
  const arrivalSessionId = expectedSessionId ?? ++earthArrivalSessionId;
  const isCurrentArrival = () => (
    arrivalSessionId === earthArrivalSessionId &&
    (!appCtx.ENV?.EARTH || appCtx.getEnv?.() === appCtx.ENV.EARTH)
  );
  if (appCtx.spaceFlight?.active && typeof appCtx.exitSpaceFlight === 'function') {
    appCtx.exitSpaceFlight();
  }
  appCtx.switchEnv(appCtx.ENV.EARTH); // sets onMoon=false, travelingToMoon=false
  appCtx.setLunarEarthVisible?.(false);
  await appCtx.setPlanetaryVehicle?.('earth');
  if (!isCurrentArrival()) return false;
  appCtx.setPlanetaryCharacter?.('earth');
  emitTutorialEvent('returned_to_earth', { source: 'earth_arrival' });
  const weatherPanel = document.getElementById('weatherPanel');
  if (weatherPanel) weatherPanel.style.display = '';

  // Update space menu button labels
  const directBtn = document.getElementById('fSpaceDirect');
  const rocketBtn = document.getElementById('fSpaceRocket');
  if (directBtn) directBtn.textContent = '🌙 Direct to Moon';
  if (rocketBtn) rocketBtn.textContent = '🚀 Rocket to Moon';

  // Hide moon surface
  // Hide ALL moon objects (surface, flag, beacon, plaque, pole, footprints)
  if (appCtx.moonSurface) {appCtx.moonSurface.visible = false;appCtx.scene.remove(appCtx.moonSurface);}
  if (window.apollo11Beacon) {window.apollo11Beacon.visible = false;appCtx.scene.remove(window.apollo11Beacon);}
  const apollo11Flag = getApollo11Flag();
  if (apollo11Flag) {apollo11Flag.visible = false;appCtx.scene.remove(apollo11Flag);}
  if (window._moonObjects) {
    window._moonObjects.forEach((obj) => {obj.visible = false;appCtx.scene.remove(obj);});
  }

  // Restore Earth lighting
  if (appCtx.sun) {
    appCtx.sun.intensity = 1.2; // Normal Earth sun intensity
    appCtx.sun.position.set(100, 150, 50); // Normal Earth sun position
  }
  if (appCtx.ambientLight) {
    appCtx.ambientLight.intensity = 0.3; // Normal ambient light
  }
  if (appCtx.fillLight) {
    appCtx.fillLight.intensity = 0.3; // Normal fill light
  }

  // Restore Earth-relative sky state
  refreshAstronomicalSky(true);
  if (appCtx.car) {
    appCtx.car.vx = 0;
    appCtx.car.vz = 0;
    appCtx.car.vy = 0;
  }

  try {
    await resumeEarthWorldSession({
      switchEnv: false,
      transitionDurationMs: 700,
      isCurrent: isCurrentArrival
    });
  } finally {
    if (isCurrentArrival()) appCtx.paused = false;
  }
  return isCurrentArrival();
}

// Check if car collides with any building and return collision info

Object.defineProperty(appCtx, 'apollo11Flag', {
  configurable: true,
  get: getApollo11Flag
});

Object.assign(appCtx, {
  alignStarFieldToLocation,
  arriveAtEarth,
  arriveAtMoon,
  cancelPendingEarthArrival,
  checkMoonClick,
  checkStarClick,
  clearStarSelection,
  createMoonSurface,
  createStarField,
  cycleTimeOfDay,
  directTravelToMoon,
  hideReturnToEarthButton,
  highlightConstellation,
  inspectAstronomicalSkyState,
  getAstronomicalSkySnapshot,
  positionCarOnMoon,
  refreshAstronomicalSky,
  returnToEarth,
  returnToEarthDirect,
  setTimeOfDay,
  showApollo11Info,
  showReturnToEarthButton,
  showStarInfo,
  travelToMoon
});

export {
  alignStarFieldToLocation,
  arriveAtEarth,
  arriveAtMoon,
  cancelPendingEarthArrival,
  checkMoonClick,
  checkStarClick,
  clearStarSelection,
  createMoonSurface,
  createStarField,
  cycleTimeOfDay,
  directTravelToMoon,
  hideReturnToEarthButton,
  highlightConstellation,
  inspectAstronomicalSkyState,
  getAstronomicalSkySnapshot,
  positionCarOnMoon,
  refreshAstronomicalSky,
  returnToEarth,
  returnToEarthDirect,
  setTimeOfDay,
  showApollo11Info,
  showReturnToEarthButton,
  showStarInfo,
  travelToMoon
};
