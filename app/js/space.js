import { ctx as appCtx } from "./shared-context.js?v=55";
import { getPrimaryWorldCanvas } from "./engine/webgl-lifecycle.js?v=1";
import { captureEarthWorldSession } from "./earth-session.js?v=17";
import { suspendEarthModesForPlanetaryEntry } from "./planetary/entry.js?v=9";
import { animateSpaceFlight as animateSpaceFlightRuntime, attemptLanding as attemptLandingRuntime, configureSpaceRuntimeDependencies, forceSpaceFlightLanding as forceSpaceFlightLandingRuntime, setSpaceFlightLandingTarget as setSpaceFlightLandingTargetRuntime } from "./space/runtime.js?v=20";
import { createSpaceFlightScene, destroySpaceFlightScene, ensureExpeditionSurveyorDockTarget, ensureExtendedSpaceScene, getExpeditionSurveyorDockTarget, positionSpacecraftAtSurveyorDock, resetSpaceFlightForEarth, resetSpaceFlightForMars, resetSpaceFlightForMoon, setExpeditionPodFlightPresentation, updateExpeditionPodFlightPresentation } from "./space/scene.js?v=35";
import { hideGameUI, initSpaceFlightUI, prepareSpaceFlightHudForEntry, showFlightMessage, showGameUI, updateSpaceFlightHUD } from "./space/ui.js?v=34";
import { createLifecycleScope } from './runtime/lifecycle-scope.js?v=2';
import {
  beginEnvironmentTransition,
  commitEnvironment,
  registerEnvironmentLifecycle
} from './session-coordinator.js?v=2';
import { installSpaceJourneyRuntime } from './space/journey-runtime.js?v=5';
import { resolveCompletedLandingTarget } from './space/landing-target.js?v=2';

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
  _runtimeLandingTarget: null,
  _manualLandingTarget: null,
  _autopilotTarget: null,
  _gravityVec: null,
  gravityVelocity: null,
  launchStartMs: 0,
  _launchSource: null,
  _isThrusting: false,
  presentationAuthority: 'classic',
  _lastFrameMs: 0,
  _frameScale: 1,
  overviewMode: false,
  _sessionId: 0
};

installSpaceJourneyRuntime(appCtx);

let spaceSessionScope = null;
const spaceModuleScope = createLifecycleScope('space-module');

function beginSpaceFlightSession() {
  spaceSessionScope?.dispose('space-session-replaced');
  spaceSessionScope = createLifecycleScope('space-flight-session');
  appCtx.spaceFlight._sessionId = Number(appCtx.spaceFlight._sessionId || 0) + 1;
  appCtx.spaceFlight.overviewMode = false;
  appCtx.spaceFlight._landingTarget = null;
  appCtx.spaceFlight._runtimeLandingTarget = null;
  return appCtx.spaceFlight._sessionId;
}

function isCurrentSpaceFlightSession(sessionId, destination = '') {
  if (!appCtx.spaceFlight.active || appCtx.spaceFlight._sessionId !== sessionId) return false;
  return !destination || appCtx.spaceFlight.destination === destination;
}

function leaseSpaceFlightResources() {
  if (!spaceSessionScope?.isActive() || !appCtx.spaceFlight.renderer) return false;
  spaceSessionScope.defer(() => destroySpaceFlightScene(), 'renderer');
  return true;
}

function requestSessionFrame(callback) {
  return spaceSessionScope?.animationFrame(callback) ?? null;
}

const landingDeps = {
  get THREE() {
    return globalThis.THREE;
  },
  completeLanding,
  requestFrame: requestSessionFrame,
  showFlightMessage
};

const animationDeps = {
  get THREE() {
    return globalThis.THREE;
  },
  completeLanding,
  requestFrame: requestSessionFrame,
  updateSpaceFlightHUD
};

function startSpaceFlightToMoon() {
  if (appCtx.spaceFlight.active) return appCtx.spaceFlight.destination === 'moon';
  console.log("Starting space flight to Moon...");
  const sessionId = beginSpaceFlightSession();
  const transition = beginEnvironmentTransition(appCtx.ENV.SPACE_FLIGHT, { source: 'space_to_moon' });

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
  prepareSpaceFlightHudForEntry();
  document.getElementById('sfDestination').textContent = 'Moon';
  document.getElementById('sfLandBtn').textContent = 'LAND ON MOON';

  const worldCanvas = getPrimaryWorldCanvas(appCtx);
  if (worldCanvas) worldCanvas.style.display = 'none';

  hideGameUI();

  if (!appCtx.spaceFlight.scene || !appCtx.spaceFlight.renderer || !appCtx.spaceFlight.camera) createSpaceFlightScene();
  ensureExtendedSpaceScene();
  leaseSpaceFlightResources();
  appCtx.returnUniverseToSolImmediate?.();
  resetSpaceFlightForMoon();
  appCtx.beginRenderedSpaceJourney?.({
    sourceBodyId: 'earth',
    destinationBodyId: 'moon',
    mode: 'assisted'
  });

  appCtx.stopRuntimeKernel?.('space-flight-active');
  animateSpaceFlight();

  if (typeof appCtx.showSolarSystemUI === 'function') appCtx.showSolarSystemUI();
  appCtx.showUniverseUI?.();

  spaceSessionScope.timeout(() => {
    if (!isCurrentSpaceFlightSession(sessionId, 'moon')) return;
    appCtx.spaceFlight.mode = 'flying';
    appCtx.spaceFlight.speed = 0;
    showFlightMessage('SPACE FLIGHT READY', '#10b981');
  }, 1000);
  return true;
}

function startSpaceFlightToSurveyor(options = {}) {
  if (appCtx.spaceFlight.active) return false;
  const sessionId = beginSpaceFlightSession();
  const transition = beginEnvironmentTransition(appCtx.ENV.SPACE_FLIGHT, { source: 'earth_to_surveyor_pod' });

  appCtx.setEnvironmentTransitionActive(true);
  appCtx.setPauseReason?.('planetary_transition', true);
  appCtx.earthPosition = { x: appCtx.car.x, z: appCtx.car.z, angle: appCtx.car.angle };
  captureEarthWorldSession();
  suspendEarthModesForPlanetaryEntry(appCtx.ENV.SPACE_FLIGHT);
  appCtx.scene.background = new THREE.Color(0x000000);

  appCtx.spaceFlight.destination = 'surveyor';
  appCtx.spaceFlight.mode = 'launching';
  appCtx.spaceFlight.active = true;
  appCtx.spaceFlight._launchSource = 'Earth';
  appCtx.spaceFlight.launchStartMs = Date.now();
  appCtx.spaceFlight._isThrusting = false;
  if (!commitEnvironment(appCtx.ENV.SPACE_FLIGHT, { token: transition })) return false;
  emitTutorialEvent('entered_space', { destination: 'surveyor', source: 'pathfinder_pod' });

  appCtx.spaceFlight.canvas.style.display = 'block';
  appCtx.spaceFlight.hud.style.display = 'block';
  prepareSpaceFlightHudForEntry();
  document.getElementById('sfDestination').textContent = 'Surveyor';
  document.getElementById('sfLandBtn').textContent = 'APPROACH SURVEYOR';
  const worldCanvas = getPrimaryWorldCanvas(appCtx);
  if (worldCanvas) worldCanvas.style.display = 'none';
  hideGameUI();

  createSpaceFlightScene({ includeExtendedSpace: true });
  ensureExtendedSpaceScene();
  leaseSpaceFlightResources();
  appCtx.returnUniverseToSolImmediate?.();
  resetSpaceFlightForMoon();
  appCtx.clearRenderedSpaceJourney?.();
  appCtx.spaceFlight.destination = 'surveyor';
  appCtx.spaceFlight._manualLandingTarget = null;
  appCtx.spaceFlight._autopilotTarget = null;
  ensureExpeditionSurveyorDockTarget();
  setExpeditionPodFlightPresentation(true);

  appCtx.stopRuntimeKernel?.('space-flight-active');
  animateSpaceFlight();
  appCtx.showSolarSystemUI?.();
  appCtx.showUniverseUI?.();
  spaceSessionScope.timeout(() => {
    if (!isCurrentSpaceFlightSession(sessionId, 'surveyor')) return;
    appCtx.spaceFlight.mode = 'flying';
    appCtx.spaceFlight.speed = 0;
    appCtx.setPauseReason?.('planetary_transition', false);
    showFlightMessage('SURVEYOR ACQUIRED · MANUAL DOCKING APPROACH', '#6fe8ff');
    options.onReady?.();
  }, 1000);
  return true;
}

function startSpaceFlightToEarth() {
  if (appCtx.spaceFlight.active) return appCtx.spaceFlight.destination === 'earth';
  console.log("Starting space flight to Earth...");
  const sourceBodyId = appCtx.activePlanetaryBodyId || (appCtx.onMars ? 'mars' : 'moon');
  const sourceLabel = sourceBodyId[0].toUpperCase() + sourceBodyId.slice(1);
  const sessionId = beginSpaceFlightSession();
  const transition = beginEnvironmentTransition(appCtx.ENV.SPACE_FLIGHT, { source: 'space_to_earth' });

  appCtx.setEnvironmentTransitionActive(true);
  appCtx.setPauseReason?.('planetary_transition', true);
  if (typeof appCtx.hideReturnToEarthButton === 'function') appCtx.hideReturnToEarthButton();
  suspendEarthModesForPlanetaryEntry(appCtx.ENV.SPACE_FLIGHT);

  appCtx.spaceFlight.destination = 'earth';
  appCtx.spaceFlight.mode = 'launching';
  appCtx.spaceFlight.active = true;
  appCtx.spaceFlight._launchSource = sourceLabel;
  appCtx.spaceFlight.launchStartMs = Date.now();
  appCtx.spaceFlight._isThrusting = false;
  if (!commitEnvironment(appCtx.ENV.SPACE_FLIGHT, { token: transition })) return false;
  emitTutorialEvent('entered_space', { destination: 'earth', source: 'space_flight' });

  appCtx.spaceFlight.canvas.style.display = 'block';
  appCtx.spaceFlight.hud.style.display = 'block';
  prepareSpaceFlightHudForEntry();
  document.getElementById('sfDestination').textContent = 'Earth';
  document.getElementById('sfLandBtn').textContent = 'LAND ON EARTH';

  const worldCanvas = getPrimaryWorldCanvas(appCtx);
  if (worldCanvas) worldCanvas.style.display = 'none';

  hideGameUI();
  if (!appCtx.spaceFlight.scene || !appCtx.spaceFlight.renderer || !appCtx.spaceFlight.camera) {
    createSpaceFlightScene({ includeExtendedSpace: sourceBodyId !== 'moon' });
  }
  if (sourceBodyId !== 'moon') ensureExtendedSpaceScene();
  leaseSpaceFlightResources();
  appCtx.returnUniverseToSolImmediate?.();
  resetSpaceFlightForEarth();
  appCtx.spaceFlight._launchSource = sourceLabel;
  appCtx.beginRenderedSpaceJourney?.({
    sourceBodyId,
    destinationBodyId: 'earth',
    mode: 'assisted',
    resumeJourney: true
  });
  appCtx.stopRuntimeKernel?.('space-flight-active');
  animateSpaceFlight();

  if (appCtx.spaceFlight._extendedSpaceLoaded) {
    appCtx.showSolarSystemUI?.();
    appCtx.showUniverseUI?.();
  }

  spaceSessionScope.timeout(() => {
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
  const transition = beginEnvironmentTransition(appCtx.ENV.SPACE_FLIGHT, { source: 'space_to_mars' });
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
  prepareSpaceFlightHudForEntry();
  document.getElementById('sfDestination').textContent = 'Mars';
  document.getElementById('sfLandBtn').textContent = 'LAND ON MARS';
  const worldCanvas = getPrimaryWorldCanvas(appCtx);
  if (worldCanvas) worldCanvas.style.display = 'none';
  hideGameUI();

  if (!appCtx.spaceFlight.scene || !appCtx.spaceFlight.renderer || !appCtx.spaceFlight.camera) createSpaceFlightScene();
  ensureExtendedSpaceScene();
  leaseSpaceFlightResources();
  appCtx.returnUniverseToSolImmediate?.();
  resetSpaceFlightForMars();
  appCtx.beginRenderedSpaceJourney?.({
    sourceBodyId: appCtx.spaceFlight._launchSource?.toLowerCase?.() || 'earth',
    destinationBodyId: 'mars',
    mode: 'assisted'
  });
  appCtx.stopRuntimeKernel?.('space-flight-active');
  animateSpaceFlight();
  appCtx.showSolarSystemUI?.();
  appCtx.showUniverseUI?.();
  spaceSessionScope.timeout(() => {
    if (!isCurrentSpaceFlightSession(sessionId, 'mars')) return;
    appCtx.spaceFlight.mode = 'flying';
    appCtx.spaceFlight.speed = 0;
    showFlightMessage('MARS FLIGHT READY', '#e26f45');
  }, 1000);
  return true;
}

function startSpaceFlightFromExpeditionSurface(options = {}) {
  if (appCtx.spaceFlight.active) return false;
  const frameId = String(options.frameId || '').trim();
  const courseDestinationId = String(options.courseDestinationId || '').trim();
  if (!frameId || !courseDestinationId) return false;
  const sessionId = beginSpaceFlightSession();
  const transition = beginEnvironmentTransition(appCtx.ENV.SPACE_FLIGHT, { source: 'expedition_surface_return' });
  appCtx.setEnvironmentTransitionActive(true);
  appCtx.setPauseReason?.('planetary_transition', true);
  suspendEarthModesForPlanetaryEntry(appCtx.ENV.SPACE_FLIGHT);
  appCtx.spaceFlight.destination = courseDestinationId;
  appCtx.spaceFlight.mode = 'launching';
  appCtx.spaceFlight.active = true;
  appCtx.spaceFlight._launchSource = courseDestinationId;
  appCtx.spaceFlight.launchStartMs = Date.now();
  appCtx.spaceFlight._isThrusting = false;
  if (!commitEnvironment(appCtx.ENV.SPACE_FLIGHT, { token: transition })) return false;

  appCtx.spaceFlight.canvas.style.display = 'block';
  appCtx.spaceFlight.hud.style.display = 'block';
  prepareSpaceFlightHudForEntry();
  const destinationLabel = document.getElementById('sfDestination');
  if (destinationLabel) destinationLabel.textContent = courseDestinationId;
  const worldCanvas = getPrimaryWorldCanvas(appCtx);
  if (worldCanvas) worldCanvas.style.display = 'none';
  hideGameUI();
  createSpaceFlightScene({ includeExtendedSpace: true });
  ensureExtendedSpaceScene();
  leaseSpaceFlightResources();
  if (!appCtx.restoreUniverseLocalFrame?.(frameId, courseDestinationId)) {
    exitSpaceFlight('expedition_surface_restore_failed');
    return false;
  }
  appCtx.stopRuntimeKernel?.('space-flight-active');
  animateSpaceFlight();
  appCtx.showUniverseUI?.();
  spaceSessionScope.timeout(() => {
    if (!isCurrentSpaceFlightSession(sessionId, courseDestinationId)) return;
    appCtx.spaceFlight.mode = 'flying';
    appCtx.spaceFlight.speed = 0;
    appCtx.setPauseReason?.('planetary_transition', false);
    showFlightMessage('SURVEY TEAM ABOARD · SAMPLE TRANSFER COMPLETE', '#83e6a6');
    options.onReady?.();
  }, 800);
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
  const targetName = resolveCompletedLandingTarget(appCtx.spaceFlight, appCtx.spaceJourney);
  console.log("Landing complete! Target:", targetName);
  appCtx.markExpeditionPodDescent?.(targetName);

  showFlightMessage('LANDING SUCCESSFUL!', '#10b981');

  spaceSessionScope?.timeout(() => {
    if (!isCurrentSpaceFlightSession(sessionId) || appCtx.spaceFlight.mode !== 'landing') return;
    exitSpaceFlight('landing_complete');

    if (targetName === 'Moon' || targetName === 'moon') {
      if (typeof appCtx.arriveAtMoon === 'function') appCtx.arriveAtMoon();
    } else if (targetName === 'Mars' || targetName === 'mars') {
      appCtx.arriveAtMars?.();
    } else if (!['Earth', 'earth'].includes(targetName) && typeof appCtx.arriveAtSolidWorld === 'function') {
      appCtx.arriveAtSolidWorld(targetName);
    } else if (typeof appCtx.arriveAtEarth === 'function') {
      appCtx.markExpeditionPodLanded?.('earth');
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
  document.body.classList.remove('space-flight-hud-expanded');

  if (typeof appCtx.hideSolarSystemUI === 'function') appCtx.hideSolarSystemUI();
  appCtx.hideUniverseUI?.();

  const proxHud = document.getElementById('ssProximity');
  if (proxHud) proxHud.style.display = 'none';

  const worldCanvas = getPrimaryWorldCanvas(appCtx);
  if (worldCanvas) worldCanvas.style.display = 'block';

  showGameUI();
  appCtx.renderLoop?.();
  appCtx.spaceFlight.keys = {};
  appCtx.spaceFlight._manualLandingTarget = null;
  appCtx.spaceFlight._runtimeLandingTarget = null;
  appCtx.spaceFlight._autopilotTarget = null;
  appCtx.spaceFlight._launchSource = null;
  appCtx.spaceFlight.launchStartMs = 0;
  appCtx.spaceFlight._isThrusting = false;
  appCtx.clearRenderedSpaceJourney?.();
  if (appCtx.spaceFlight.gravityVelocity) appCtx.spaceFlight.gravityVelocity.set(0, 0, 0);
  if (appCtx.spaceFlight._gravityVec) appCtx.spaceFlight._gravityVec.set(0, 0, 0);
}

registerEnvironmentLifecycle(appCtx.ENV.SPACE_FLIGHT, {
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
    configureSpaceRuntimeDependencies({ THREE: globalThis.THREE });
    console.log("Space Flight module loaded!");
    initSpaceFlightUI(attemptLanding, spaceModuleScope);
  } else {
    spaceModuleScope.timeout(initSpaceFlightWhenReady, 100);
  }
}

Object.assign(appCtx, {
  animateSpaceFlight,
  completeSpaceFlightJourneyLanding: completeLanding,
  exitSpaceFlight,
  forceSpaceFlightLanding,
  showSpaceFlightMessage: showFlightMessage,
  setSpaceFlightLandingTarget,
  setExpeditionPodFlightPresentation,
  ensureExpeditionSurveyorDockTarget,
  getExpeditionSurveyorDockTarget,
  positionSpacecraftAtSurveyorDock,
  updateExpeditionPodFlightPresentation,
  startSpaceFlightToEarth,
  startSpaceFlightFromExpeditionSurface,
  startSpaceFlightToMars,
  startSpaceFlightToSurveyor,
  startSpaceFlightToMoon
});

export {
  animateSpaceFlight,
  exitSpaceFlight,
  forceSpaceFlightLanding,
  setSpaceFlightLandingTarget,
  setExpeditionPodFlightPresentation,
  ensureExpeditionSurveyorDockTarget,
  getExpeditionSurveyorDockTarget,
  positionSpacecraftAtSurveyorDock,
  updateExpeditionPodFlightPresentation,
  startSpaceFlightToEarth,
  startSpaceFlightFromExpeditionSurface,
  startSpaceFlightToMars,
  startSpaceFlightToSurveyor,
  startSpaceFlightToMoon
};

if (document.readyState === 'loading') {
  spaceModuleScope.listen(document, 'DOMContentLoaded', initSpaceFlightWhenReady, { once: true });
} else {
  initSpaceFlightWhenReady();
}
