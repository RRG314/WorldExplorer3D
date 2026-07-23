import { ctx as appCtx } from "./shared-context.js?v=55";
import { captureEarthWorldSession, resumeEarthWorldSession } from "./earth-session.js?v=19";
import {
  cycleTimeOfDay as cycleSkyTimeOfDay,
  getAstronomicalSkySnapshot,
  inspectAstronomicalSkyState,
  refreshAstronomicalSky as refreshAstronomicalSkyState,
  setTimeOfDay as setSkyTimeOfDay
} from "./sky/astronomical-state.js?v=2";
import {
  alignStarFieldToLocation,
  checkMoonClick as checkMoonSelection,
  checkStarClick,
  clearStarSelection,
  createStarField,
  highlightConstellation,
  showStarInfo
} from "./sky/starfield-ui.js?v=11";
import { createMoonLandingUiApi } from "./sky/moon-landing-ui.js?v=2";
import { createMoonSurface as createMoonSurfaceRuntime } from "./sky/moon-surface.js?v=4";
import { suspendEarthModesForPlanetaryEntry } from "./planetary/entry.js?v=9";
import {
  commitEnvironment,
  exitCurrentEnvironmentSync,
  registerEnvironmentLifecycle
} from './session-coordinator.js?v=2';
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
  if (appCtx.onMoon) return true;
  if (appCtx.travelingToMoon) return false;

  if (typeof appCtx.showTransitionLoad === 'function') {
    await appCtx.showTransitionLoad('moon');
    if (appCtx.onMoon) return true;
    if (appCtx.travelingToMoon) return false;
  }

  appCtx.setEnvironmentTransitionActive(true);

  // Save Earth position
  appCtx.earthPosition = {
    x: appCtx.car.x,
    z: appCtx.car.z,
    angle: appCtx.car.angle
  };
  captureEarthWorldSession();
  suspendEarthModesForPlanetaryEntry(appCtx.ENV.MOON);

  appCtx.setPauseReason?.('planetary_transition', true);
  appCtx.scene.background = new THREE.Color(0x000000);

  const moonPos = appCtx.moonSphere.position.clone();
  const startPos = appCtx.camera.position.clone();
  return new Promise((resolve) => {
    runTimedCameraTransition({
      duration: 3000,
      onFrame: (eased) => {
        appCtx.camera.position.lerpVectors(startPos, moonPos, eased);
        appCtx.camera.lookAt(moonPos);
      },
      onComplete: () => {
        arriveAtMoon();
        resolve(appCtx.getEnv?.() === appCtx.ENV.MOON);
      }
    });
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
  appCtx.setEnvironmentTransitionActive(true);

  // Save Earth position
  appCtx.earthPosition = {
    x: appCtx.car.x,
    z: appCtx.car.z,
    angle: appCtx.car.angle
  };
  captureEarthWorldSession();
  suspendEarthModesForPlanetaryEntry(appCtx.ENV.MOON);

  // Disable controls during travel
  appCtx.setPauseReason?.('planetary_transition', true);

  // IMMEDIATELY set background to black for space
  appCtx.scene.background = new THREE.Color(0x000000);

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

  suspendEarthModesForPlanetaryEntry(appCtx.ENV.MOON);

  commitEnvironment(appCtx.ENV.MOON, { source: 'moon_arrival' });
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
  appCtx.setPauseReason?.('planetary_transition', true);

  // Reset to driving mode so everything starts clean at the landing site
  if (appCtx.droneMode) {
    appCtx.setDroneModeActive(false);
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
    const resumeMoon = () => {
      if (!appCtx.onMoon) return;
      positionCarOnMoon();
      if (appCtx.carMesh) appCtx.carMesh.visible = true;
      appCtx.setPauseReason?.('planetary_transition', false);
    };
    if (appCtx.moonSurfaceReady?.then) void appCtx.moonSurfaceReady.then(resumeMoon);
    else resumeMoon();
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
  return createMoonSurfaceRuntime({ appCtx, createApollo11LandingSite, positionCarOnMoon });
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

  appCtx.setEnvironmentTransitionActive(true);
  appCtx.setPauseReason?.('planetary_transition', true);

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
  exitCurrentEnvironmentSync(appCtx.ENV.EARTH, { source: 'moon_return' });
  appCtx.earthResumePending = true;
  appCtx.setPauseReason?.('planetary_transition', true);
  commitEnvironment(appCtx.ENV.EARTH, { source: 'moon_return' });
  appCtx.setLunarEarthVisible?.(false);
  appCtx.clearPlanetarySky?.();
  await appCtx.setPlanetaryVehicle?.('earth');
  if (!isCurrentArrival()) {
    appCtx.earthResumePending = false;
    return false;
  }
  appCtx.setPlanetaryCharacter?.('earth');
  emitTutorialEvent('returned_to_earth', { source: 'earth_arrival' });
  const weatherPanel = document.getElementById('weatherPanel');
  if (weatherPanel) weatherPanel.style.display = '';

  // Update space menu button labels
  const directBtn = document.getElementById('fSpaceDirect');
  const rocketBtn = document.getElementById('fSpaceRocket');
  if (directBtn) directBtn.textContent = '🌙 Direct to Moon';
  if (rocketBtn) rocketBtn.textContent = '🚀 Rocket to Moon';

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
    if (isCurrentArrival()) appCtx.setPauseReason?.('planetary_transition', false);
  }
  return isCurrentArrival();
}

// Check if car collides with any building and return collision info

Object.defineProperty(appCtx, 'apollo11Flag', {
  configurable: true,
  get: getApollo11Flag
});

function suspendMoonEnvironment() {
  hideReturnToEarthButton();
  appCtx.setLunarEarthVisible?.(false);
  if (appCtx.moonSurface) {
    appCtx.moonSurface.visible = false;
    if (appCtx.moonSurface.parent === appCtx.scene) appCtx.scene.remove(appCtx.moonSurface);
  }
  if (window.apollo11Beacon) {
    window.apollo11Beacon.visible = false;
    if (window.apollo11Beacon.parent === appCtx.scene) appCtx.scene.remove(window.apollo11Beacon);
  }
  const apollo11Flag = getApollo11Flag();
  if (apollo11Flag) {
    apollo11Flag.visible = false;
    if (apollo11Flag.parent === appCtx.scene) appCtx.scene.remove(apollo11Flag);
  }
  (window._moonObjects || []).forEach((object) => {
    object.visible = false;
    if (object.parent === appCtx.scene) appCtx.scene.remove(object);
  });
}

registerEnvironmentLifecycle(appCtx.ENV.MOON, {
  exitSync: suspendMoonEnvironment,
  snapshot: () => ({
    active: appCtx.getEnv?.() === appCtx.ENV.MOON,
    objectCount: (window._moonObjects || []).length,
    surfaceAttached: appCtx.moonSurface?.parent === appCtx.scene,
    surfaceVisible: !!appCtx.moonSurface?.visible
  })
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
