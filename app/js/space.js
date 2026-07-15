import { ctx as appCtx } from "./shared-context.js?v=55";
import { getPrimaryWorldCanvas } from "./engine/webgl-lifecycle.js?v=1";
import { captureEarthWorldSession } from "./earth-session.js?v=8";
import { suspendEarthModesForPlanetaryEntry } from "./planetary/entry.js?v=6";
import { animateSpaceFlight as animateSpaceFlightRuntime, attemptLanding as attemptLandingRuntime, forceSpaceFlightLanding as forceSpaceFlightLandingRuntime, setSpaceFlightLandingTarget as setSpaceFlightLandingTargetRuntime } from "./space/runtime.js?v=7";
import { createSpaceFlightScene, resetSpaceFlightForEarth, resetSpaceFlightForMars, resetSpaceFlightForMoon } from "./space/scene.js?v=13";
import { hideGameUI, initSpaceFlightUI, showFlightMessage, showGameUI, updateSpaceFlightHUD } from "./space/ui.js?v=4";

function emitTutorialEvent(eventName, payload = {}) {
  if (typeof appCtx.tutorialOnEvent === 'function') {
    appCtx.tutorialOnEvent(eventName, payload);
  }
}

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
  mode: 'launching',
  keys: {},
  canvas: null,
  hud: null,
  animationId: null,
  destination: 'moon',
  _nearestBody: null,
  _landingTarget: null,
  _manualLandingTarget: null,
  _autopilotTarget: null,
  _gravityVec: null,
  gravityVelocity: null,
  launchStartMs: 0,
  _launchSource: null,
  _isThrusting: false,
  _lastFrameMs: 0,
  _frameScale: 1,
  overviewMode: false,
  _sessionId: 0
};

function beginSpaceFlightSession() {
  appCtx.spaceFlight._sessionId = Number(appCtx.spaceFlight._sessionId || 0) + 1;
  return appCtx.spaceFlight._sessionId;
}

function isCurrentSpaceFlightSession(sessionId, destination = '') {
  if (!appCtx.spaceFlight.active || appCtx.spaceFlight._sessionId !== sessionId) return false;
  return !destination || appCtx.spaceFlight.destination === destination;
}

const landingDeps = {
  completeLanding,
  showFlightMessage
};

const animationDeps = {
  completeLanding,
  updateSpaceFlightHUD
};

function startSpaceFlightToMoon() {
  if (appCtx.spaceFlight.active) return appCtx.spaceFlight.destination === 'moon';
  console.log("Starting space flight to Moon...");
  const sessionId = beginSpaceFlightSession();

  appCtx.travelingToMoon = true;
  appCtx.paused = true;
  appCtx.earthPosition = { x: appCtx.car.x, z: appCtx.car.z, angle: appCtx.car.angle };
  captureEarthWorldSession();
  suspendEarthModesForPlanetaryEntry();
  appCtx.scene.background = new THREE.Color(0x000000);

  if (appCtx.terrainGroup) { appCtx.terrainGroup.visible = false; appCtx.scene.remove(appCtx.terrainGroup); }
  if (appCtx.cloudGroup) { appCtx.cloudGroup.visible = false; appCtx.scene.remove(appCtx.cloudGroup); }
  appCtx.roadMeshes.forEach((m) => { m.visible = false; appCtx.scene.remove(m); });
  appCtx.buildingMeshes.forEach((m) => { m.visible = false; appCtx.scene.remove(m); });
  appCtx.landuseMeshes.forEach((m) => { m.visible = false; appCtx.scene.remove(m); });
  appCtx.poiMeshes.forEach((m) => { m.visible = false; appCtx.scene.remove(m); });
  appCtx.streetFurnitureMeshes.forEach((m) => { m.visible = false; appCtx.scene.remove(m); });

  appCtx.spaceFlight.destination = 'moon';
  appCtx.spaceFlight.mode = 'launching';
  appCtx.spaceFlight.active = true;
  appCtx.spaceFlight._launchSource = 'Earth';
  appCtx.spaceFlight.launchStartMs = Date.now();
  appCtx.spaceFlight._isThrusting = false;
  appCtx.spaceFlight.overviewMode = false;
  appCtx.switchEnv(appCtx.ENV.SPACE_FLIGHT);
  emitTutorialEvent('entered_space', { destination: 'moon', source: 'space_flight' });

  appCtx.spaceFlight.canvas.style.display = 'block';
  appCtx.spaceFlight.hud.style.display = 'block';
  document.getElementById('sfDestination').textContent = 'Moon';
  document.getElementById('sfLandBtn').textContent = 'LAND ON MOON';

  const worldCanvas = getPrimaryWorldCanvas(appCtx);
  if (worldCanvas) worldCanvas.style.display = 'none';

  hideGameUI();

  if (!appCtx.spaceFlight.scene || !appCtx.spaceFlight.renderer || !appCtx.spaceFlight.camera) createSpaceFlightScene();
  appCtx.returnUniverseToSolImmediate?.();
  resetSpaceFlightForMoon();

  animateSpaceFlight();

  if (typeof appCtx.showSolarSystemUI === 'function') appCtx.showSolarSystemUI();
  appCtx.showUniverseUI?.();

  setTimeout(() => {
    if (!isCurrentSpaceFlightSession(sessionId, 'moon')) return;
    appCtx.spaceFlight.mode = 'flying';
    appCtx.spaceFlight.speed = 0;
    showFlightMessage('SPACE FLIGHT READY', '#10b981');
  }, 1000);
  return true;
}

function startSpaceFlightToEarth() {
  if (appCtx.spaceFlight.active) return appCtx.spaceFlight.destination === 'earth';
  console.log("Starting space flight to Earth...");
  const sessionId = beginSpaceFlightSession();

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
  emitTutorialEvent('entered_space', { destination: 'earth', source: 'space_flight' });

  appCtx.spaceFlight.canvas.style.display = 'block';
  appCtx.spaceFlight.hud.style.display = 'block';
  document.getElementById('sfDestination').textContent = 'Earth';
  document.getElementById('sfLandBtn').textContent = 'LAND ON EARTH';

  const worldCanvas = getPrimaryWorldCanvas(appCtx);
  if (worldCanvas) worldCanvas.style.display = 'none';

  hideGameUI();
  if (!appCtx.spaceFlight.scene || !appCtx.spaceFlight.renderer || !appCtx.spaceFlight.camera) createSpaceFlightScene();
  appCtx.returnUniverseToSolImmediate?.();
  resetSpaceFlightForEarth();
  animateSpaceFlight();

  if (typeof appCtx.showSolarSystemUI === 'function') appCtx.showSolarSystemUI();
  appCtx.showUniverseUI?.();

  setTimeout(() => {
    if (!isCurrentSpaceFlightSession(sessionId, 'earth')) return;
    appCtx.spaceFlight.mode = 'flying';
    appCtx.spaceFlight.speed = 0;
    showFlightMessage('EARTH RETURN READY', '#3b82f6');
  }, 1000);
  return true;
}

function startSpaceFlightToMars() {
  console.log('Starting space flight to Mars...');
  if (appCtx.onMars) return false;
  if (appCtx.spaceFlight.active) return appCtx.spaceFlight.destination === 'mars';
  const sessionId = beginSpaceFlightSession();
  appCtx.travelingToMoon = true;
  appCtx.paused = true;
  appCtx.earthPosition = { x: appCtx.car.x, z: appCtx.car.z, angle: appCtx.car.angle };
  appCtx.prepareEarthDepartureForMars?.();
  suspendEarthModesForPlanetaryEntry();
  appCtx.scene.background = new THREE.Color(0x000000);

  appCtx.spaceFlight.destination = 'mars';
  appCtx.spaceFlight.mode = 'launching';
  appCtx.spaceFlight.active = true;
  appCtx.spaceFlight._launchSource = appCtx.onMoon ? 'Moon' : 'Earth';
  appCtx.spaceFlight.launchStartMs = Date.now();
  appCtx.switchEnv(appCtx.ENV.SPACE_FLIGHT);
  emitTutorialEvent('entered_space', { destination: 'mars', source: 'space_flight' });

  appCtx.spaceFlight.canvas.style.display = 'block';
  appCtx.spaceFlight.hud.style.display = 'block';
  document.getElementById('sfDestination').textContent = 'Mars';
  document.getElementById('sfLandBtn').textContent = 'LAND ON MARS';
  const worldCanvas = getPrimaryWorldCanvas(appCtx);
  if (worldCanvas) worldCanvas.style.display = 'none';
  hideGameUI();

  if (!appCtx.spaceFlight.scene || !appCtx.spaceFlight.renderer || !appCtx.spaceFlight.camera) createSpaceFlightScene();
  appCtx.returnUniverseToSolImmediate?.();
  resetSpaceFlightForMars();
  animateSpaceFlight();
  appCtx.showSolarSystemUI?.();
  appCtx.showUniverseUI?.();
  setTimeout(() => {
    if (!isCurrentSpaceFlightSession(sessionId, 'mars')) return;
    appCtx.spaceFlight.mode = 'flying';
    appCtx.spaceFlight.speed = 0;
    showFlightMessage('MARS FLIGHT READY', '#e26f45');
  }, 1000);
  return true;
}

function animateSpaceFlight() {
  return animateSpaceFlightRuntime(animationDeps);
}

function setSpaceFlightLandingTarget(target, options = {}) {
  return setSpaceFlightLandingTargetRuntime(target, options, landingDeps);
}

function forceSpaceFlightLanding(target) {
  return forceSpaceFlightLandingRuntime(target, landingDeps);
}

function attemptLanding() {
  return attemptLandingRuntime(landingDeps);
}

function completeLanding(sessionId = appCtx.spaceFlight._sessionId) {
  if (!isCurrentSpaceFlightSession(sessionId)) return;
  const targetName = appCtx.spaceFlight._landingTarget || appCtx.spaceFlight.destination;
  console.log("Landing complete! Target:", targetName);

  showFlightMessage('LANDING SUCCESSFUL!', '#10b981');

  setTimeout(() => {
    if (!isCurrentSpaceFlightSession(sessionId) || appCtx.spaceFlight.mode !== 'landing') return;
    exitSpaceFlight();

    if (targetName === 'Moon' || targetName === 'moon') {
      if (typeof appCtx.arriveAtMoon === 'function') appCtx.arriveAtMoon();
    } else if (targetName === 'Mars' || targetName === 'mars') {
      appCtx.arriveAtMars?.();
    } else if (typeof appCtx.arriveAtEarth === 'function') {
      appCtx.arriveAtEarth();
    }
  }, 1500);
}

function exitSpaceFlight() {
  console.log("Exiting space flight...");

  appCtx.spaceFlight.active = false;
  appCtx.spaceFlight._sessionId = Number(appCtx.spaceFlight._sessionId || 0) + 1;

  if (appCtx.spaceFlight.animationId) {
    cancelAnimationFrame(appCtx.spaceFlight.animationId);
    appCtx.spaceFlight.animationId = null;
  }

  appCtx.spaceFlight.canvas.style.display = 'none';
  appCtx.spaceFlight.hud.style.display = 'none';

  if (typeof appCtx.hideSolarSystemUI === 'function') appCtx.hideSolarSystemUI();
  appCtx.hideUniverseUI?.();

  const proxHud = document.getElementById('ssProximity');
  if (proxHud) proxHud.style.display = 'none';

  const worldCanvas = getPrimaryWorldCanvas(appCtx);
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

function initSpaceFlightWhenReady() {
  if (typeof THREE !== 'undefined') {
    console.log("Space Flight module loaded!");
    initSpaceFlightUI(attemptLanding);
  } else {
    setTimeout(initSpaceFlightWhenReady, 100);
  }
}

Object.assign(appCtx, {
  animateSpaceFlight,
  exitSpaceFlight,
  forceSpaceFlightLanding,
  showSpaceFlightMessage: showFlightMessage,
  setSpaceFlightLandingTarget,
  startSpaceFlightToEarth,
  startSpaceFlightToMars,
  startSpaceFlightToMoon
});

export {
  animateSpaceFlight,
  exitSpaceFlight,
  forceSpaceFlightLanding,
  setSpaceFlightLandingTarget,
  startSpaceFlightToEarth,
  startSpaceFlightToMars,
  startSpaceFlightToMoon
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSpaceFlightWhenReady);
} else {
  initSpaceFlightWhenReady();
}
