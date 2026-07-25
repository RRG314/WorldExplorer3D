import { ctx as appCtx } from "./shared-context.js?v=55";
import { getPrimaryWorldCanvas } from "./engine/webgl-lifecycle.js?v=1";
import { captureEarthWorldSession } from "./earth-session.js?v=20";
import { suspendEarthModesForPlanetaryEntry } from "./planetary/entry.js?v=9";
import { animateSpaceFlight as animateSpaceFlightRuntime, attemptLanding as attemptLandingRuntime, forceSpaceFlightLanding as forceSpaceFlightLandingRuntime, setSpaceFlightLandingTarget as setSpaceFlightLandingTargetRuntime } from "./space/runtime.js?v=13";
import { createSpaceFlightScene, resetSpaceFlightForEarth, resetSpaceFlightForMars, resetSpaceFlightForMoon } from "./space/scene.js?v=16";
import { hideGameUI, initSpaceFlightUI, showFlightMessage, showGameUI, updateSpaceFlightHUD } from "./space/ui.js?v=4";
import {
  beginEnvironmentTransition,
  commitEnvironment
} from './session-coordinator.js?v=2';

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

const spaceFrameOwnerDefinition = Object.freeze({
  id: 'space.flight-renderer',
  label: 'Space flight renderer',
  kind: 'continuous-renderer',
  exclusiveGroup: 'environment-renderer',
  getState: () => ({
    active: !!appCtx.spaceFlight.active && appCtx.spaceFlight.animationId != null && !document.hidden,
    scheduled: !!appCtx.spaceFlight.active && appCtx.spaceFlight.animationId != null,
    suspended: !!appCtx.spaceFlight.active && appCtx.spaceFlight.animationId != null && document.hidden
  })
});

let spaceSessionScope = null;

function beginSpaceFlightSession(destinationScope) {
  if (!destinationScope?.isActive?.()) {
    throw new Error('Space flight requires an active destination session scope.');
  }
  if (spaceSessionScope && spaceSessionScope !== destinationScope) {
    spaceSessionScope.dispose('space-session-replaced');
  }
  spaceSessionScope = destinationScope;
  destinationScope.listen(document, 'visibilitychange', () => {
    if (spaceSessionScope !== destinationScope || !appCtx.spaceFlight.active) return;
    if (document.hidden) {
      destinationScope.cancelAnimationFrame(appCtx.spaceFlight.animationId);
      appCtx.spaceFlight.animationId = null;
      appCtx.spaceFlight._lastFrameMs = performance.now();
      return;
    }
    if (appCtx.spaceFlight.animationId == null) {
      appCtx.spaceFlight.animationId = destinationScope.animationFrame(animateSpaceFlight);
    }
  });
  appCtx.spaceFlight._sessionId = Number(appCtx.spaceFlight._sessionId || 0) + 1;
  appCtx.spaceFlight.overviewMode = false;
  return appCtx.spaceFlight._sessionId;
}

function isCurrentSpaceFlightSession(sessionId, destination = '') {
  if (!appCtx.spaceFlight.active || appCtx.spaceFlight._sessionId !== sessionId) return false;
  return !destination || appCtx.spaceFlight.destination === destination;
}

const landingDeps = {
  completeLanding,
  scheduleFrame(callback) {
    return spaceSessionScope?.animationFrame(callback) ?? null;
  },
  showFlightMessage
};

const animationDeps = {
  completeLanding,
  scheduleFrame(callback) {
    return spaceSessionScope?.animationFrame(callback) ?? null;
  },
  updateSpaceFlightHUD
};

function startSpaceFlightToMoon() {
  if (appCtx.spaceFlight.active) return appCtx.spaceFlight.destination === 'moon';
  console.log("Starting space flight to Moon...");
  const transition = beginEnvironmentTransition(appCtx.ENV.SPACE_FLIGHT, { source: 'space_to_moon' });
  const sessionId = beginSpaceFlightSession(transition.session.scope);

  appCtx.setEnvironmentTransitionActive(true);
  appCtx.setPauseReason?.('planetary_transition', true);
  appCtx.earthPosition = { x: appCtx.car.x, z: appCtx.car.z, angle: appCtx.car.angle };
  captureEarthWorldSession();
  suspendEarthModesForPlanetaryEntry(appCtx.ENV.SPACE_FLIGHT);
  appCtx.scene.background = new THREE.Color(0x000000);

  appCtx.spaceFlight.destination = 'moon';
  appCtx.spaceFlight.mode = 'launching';
  appCtx.spaceFlight.active = true;
  appCtx.spaceFlight._launchSource = 'Earth';
  appCtx.spaceFlight.launchStartMs = Date.now();
  appCtx.spaceFlight._isThrusting = false;
  if (!commitEnvironment(appCtx.ENV.SPACE_FLIGHT, { token: transition })) return false;
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

  spaceSessionScope.timeout(() => {
    if (!isCurrentSpaceFlightSession(sessionId, 'moon') || appCtx.spaceFlight.mode !== 'launching') return;
    appCtx.spaceFlight.mode = 'flying';
    appCtx.spaceFlight.speed = 0;
    showFlightMessage('SPACE FLIGHT READY', '#10b981');
  }, 1000);
  return true;
}

function startSpaceFlightToEarth() {
  if (appCtx.spaceFlight.active) return appCtx.spaceFlight.destination === 'earth';
  console.log("Starting space flight to Earth...");
  const transition = beginEnvironmentTransition(appCtx.ENV.SPACE_FLIGHT, { source: 'space_to_earth' });
  const sessionId = beginSpaceFlightSession(transition.session.scope);

  appCtx.setEnvironmentTransitionActive(true);
  appCtx.setPauseReason?.('planetary_transition', true);
  if (typeof appCtx.hideReturnToEarthButton === 'function') appCtx.hideReturnToEarthButton();
  suspendEarthModesForPlanetaryEntry(appCtx.ENV.SPACE_FLIGHT);

  appCtx.spaceFlight.destination = 'earth';
  appCtx.spaceFlight.mode = 'launching';
  appCtx.spaceFlight.active = true;
  appCtx.spaceFlight._launchSource = 'Moon';
  appCtx.spaceFlight.launchStartMs = Date.now();
  appCtx.spaceFlight._isThrusting = false;
  if (!commitEnvironment(appCtx.ENV.SPACE_FLIGHT, { token: transition })) return false;
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

  spaceSessionScope.timeout(() => {
    if (!isCurrentSpaceFlightSession(sessionId, 'earth') || appCtx.spaceFlight.mode !== 'launching') return;
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
  const transition = beginEnvironmentTransition(appCtx.ENV.SPACE_FLIGHT, { source: 'space_to_mars' });
  const sessionId = beginSpaceFlightSession(transition.session.scope);
  appCtx.setEnvironmentTransitionActive(true);
  appCtx.setPauseReason?.('planetary_transition', true);
  appCtx.earthPosition = { x: appCtx.car.x, z: appCtx.car.z, angle: appCtx.car.angle };
  appCtx.prepareEarthDepartureForMars?.();
  suspendEarthModesForPlanetaryEntry(appCtx.ENV.SPACE_FLIGHT);
  appCtx.scene.background = new THREE.Color(0x000000);

  appCtx.spaceFlight.destination = 'mars';
  appCtx.spaceFlight.mode = 'launching';
  appCtx.spaceFlight.active = true;
  appCtx.spaceFlight._launchSource = appCtx.onMoon ? 'Moon' : 'Earth';
  appCtx.spaceFlight.launchStartMs = Date.now();
  if (!commitEnvironment(appCtx.ENV.SPACE_FLIGHT, { token: transition })) return false;
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
  spaceSessionScope.timeout(() => {
    if (!isCurrentSpaceFlightSession(sessionId, 'mars') || appCtx.spaceFlight.mode !== 'launching') return;
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

  spaceSessionScope?.timeout(() => {
    if (!isCurrentSpaceFlightSession(sessionId) || appCtx.spaceFlight.mode !== 'landing') return;
    exitSpaceFlight('landing_complete');

    if (targetName === 'Moon' || targetName === 'moon') {
      if (typeof appCtx.arriveAtMoon === 'function') appCtx.arriveAtMoon();
    } else if (targetName === 'Mars' || targetName === 'mars') {
      appCtx.arriveAtMars?.();
    } else if (typeof appCtx.arriveAtEarth === 'function') {
      appCtx.arriveAtEarth();
    }
  }, 1500);
}

function exitSpaceFlight(source = 'runtime') {
  console.log('Exiting space flight...', String(source || 'runtime'));

  appCtx.spaceFlight.active = false;
  spaceSessionScope?.dispose('space-flight-exit');
  spaceSessionScope = null;
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

const spaceDestinationAdapter = Object.freeze({
  exitSync: ({ source } = {}) => {
    if (appCtx.spaceFlight.active) exitSpaceFlight(source || 'environment_transition');
  },
  snapshot: () => ({
    active: !!appCtx.spaceFlight.active,
    animationActive: appCtx.spaceFlight.animationId != null,
    destination: appCtx.spaceFlight.destination || null,
    rendererReady: !!appCtx.spaceFlight.renderer,
    scope: spaceSessionScope?.snapshot() || null,
    sessionId: Number(appCtx.spaceFlight._sessionId || 0)
  })
});

function initSpaceFlightWhenReady() {
  if (typeof THREE !== 'undefined') {
    console.log("Space Flight module loaded!");
    initSpaceFlightUI(attemptLanding);
  } else {
    setTimeout(initSpaceFlightWhenReady, 100);
  }
}

function initSpaceFlightModule() {
  initSpaceFlightWhenReady();
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
  initSpaceFlightModule,
  setSpaceFlightLandingTarget,
  spaceDestinationAdapter,
  spaceFrameOwnerDefinition,
  startSpaceFlightToEarth,
  startSpaceFlightToMars,
  startSpaceFlightToMoon
};
