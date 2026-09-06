import { ctx as appCtx } from "./shared-context.js?v=55";
import { getPrimaryWorldCanvas } from "./engine/webgl-lifecycle.js?v=2";
import { captureEarthWorldSession } from "./earth-session.js?v=17";
import { suspendEarthModesForPlanetaryEntry } from "./planetary/entry.js?v=9";
import { animateSpaceFlight as animateSpaceFlightRuntime, attemptLanding as attemptLandingRuntime, configureSpaceRuntimeDependencies, forceSpaceFlightLanding as forceSpaceFlightLandingRuntime, setSpaceFlightLandingTarget as setSpaceFlightLandingTargetRuntime } from "./space/runtime.js?v=33";
import { createSpaceFlightScene, destroySpaceFlightScene, ensureSolisReachDockTarget, ensureExtendedSpaceScene, getSolisReachDockTarget, orientActiveCraftForAtmosphere, orientActiveCraftTowardSolisReach, positionSpacecraftAtSolisReachDock, resetSpaceFlightForEarth, resetSpaceFlightForMars, resetSpaceFlightForMoon, setExpeditionPodFlightPresentation, setSolisReachFlightPresentation, updateExpeditionPodFlightPresentation } from "./space/scene.js?v=52";
import { hideGameUI, initSpaceFlightUI, prepareSpaceFlightHudForEntry, setSpaceFlightHudCollapsed, showFlightMessage, showGameUI, updateSpaceFlightHUD } from "./space/ui.js?v=52";
import { createLifecycleScope } from './runtime/lifecycle-scope.js?v=2';
import {
  beginEnvironmentTransition,
  commitEnvironment,
  registerEnvironmentLifecycle
} from './session-coordinator.js?v=2';
import { installSpaceJourneyRuntime } from './space/journey-runtime.js?v=11';
import { resolveCompletedLandingTarget } from './space/landing-target.js?v=2';
import { playSurfacePodLaunch } from './planetary/surface-pod-launch.js?v=11';
import { SPACE_CRAFT_IDENTITY } from './space/craft-identity.js?v=1';
import {
  installSpaceTravelSession,
  SPACE_GUIDANCE_MODE,
  SPACE_TRAVEL_LOCATION,
  SPACE_TRAVEL_PHASE
} from './space/travel-session.js?v=1';
import { createPirateInterceptionRuntime } from './space/pirate-interception-runtime.js?v=1';

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
  _landingApproachDirection: null,
  earthLandingSelection: null,
  presentationAuthority: 'classic',
  _lastFrameMs: 0,
  _frameScale: 1,
  overviewMode: false,
  _sessionId: 0
};

installSpaceTravelSession(appCtx);
installSpaceJourneyRuntime(appCtx);

let spaceSessionScope = null;
const spaceModuleScope = createLifecycleScope('space-module');
let expeditionRuntimeModulePromise = null;
let pirateInterceptionRuntime = null;

function prepareSolisReachSurfaceRendezvous(bodyId) {
  expeditionRuntimeModulePromise ||= import('./expedition/runtime.js?v=51');
  return expeditionRuntimeModulePromise.then((runtime) => runtime.prepareSolisReachSurfaceRendezvous?.(appCtx, bodyId) === true);
}

function beginSpaceFlightSession(options = {}) {
  spaceSessionScope?.dispose('space-session-replaced');
  spaceSessionScope = createLifecycleScope('space-flight-session');
  appCtx.spaceFlight._sessionId = Number(appCtx.spaceFlight._sessionId || 0) + 1;
  appCtx.spaceFlight.overviewMode = false;
  appCtx.spaceFlight._landingTarget = null;
  appCtx.spaceFlight._runtimeLandingTarget = null;
  appCtx.spaceFlight._landingApproachDirection = null;
  appCtx.spaceFlight.earthLandingSelection = null;
  appCtx.beginSpaceTravelSession?.({
    activeCraftId: options.activeCraftId || SPACE_CRAFT_IDENTITY.starship.id,
    location: options.location || SPACE_TRAVEL_LOCATION.LOCAL_SPACE,
    phase: options.phase || SPACE_TRAVEL_PHASE.FREE_FLIGHT,
    sourceBodyId: options.sourceBodyId || null,
    destination: options.destination || null,
    guidance: options.guidance || SPACE_GUIDANCE_MODE.MANUAL,
    reason: options.reason || 'space-flight-started'
  });
  return appCtx.spaceFlight._sessionId;
}

function beginEarthLandingSelection() {
  const rocket = appCtx.spaceFlight?.rocket;
  const earth = appCtx.spaceFlight?.earth;
  if (!rocket?.position || !earth?.position) return null;
  const referenceDirection = rocket.position.clone().sub(earth.position);
  if (referenceDirection.lengthSq() < 1e-6) referenceDirection.set(0, 1, 0);
  else referenceDirection.normalize();
  const savedPose = appCtx.earthSessionState?.pose || appCtx.earthPosition || {};
  appCtx.spaceFlight.earthLandingSelection = {
    referenceDirection,
    basePose: {
      mode: savedPose.mode || 'walk',
      x: Number(savedPose.x) || 0,
      z: Number(savedPose.z) || 0,
      angle: Number(savedPose.angle) || 0
    },
    maxOffset: 900
  };
  return getEarthLandingSelection();
}

function getEarthLandingSelection() {
  if (!appCtx.spaceFlight?.earthLandingSelection && appCtx.spaceFlight?.destination === 'earth') {
    beginEarthLandingSelection();
  }
  const selection = appCtx.spaceFlight?.earthLandingSelection;
  const rocket = appCtx.spaceFlight?.rocket;
  const earth = appCtx.spaceFlight?.earth;
  if (!selection?.referenceDirection || !rocket?.position || !earth?.position) return null;
  const currentDirection = rocket.position.clone().sub(earth.position);
  if (currentDirection.lengthSq() < 1e-6) currentDirection.copy(selection.referenceDirection);
  else currentDirection.normalize();
  const reference = selection.referenceDirection.clone().normalize();
  const axis = Math.abs(reference.y) > 0.92 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const east = new THREE.Vector3().crossVectors(axis, reference).normalize();
  const north = new THREE.Vector3().crossVectors(reference, east).normalize();
  const maxOffset = Math.max(200, Number(selection.maxOffset) || 900);
  const eastOffset = Math.max(-maxOffset, Math.min(maxOffset, currentDirection.dot(east) * maxOffset * 1.65));
  const northOffset = Math.max(-maxOffset, Math.min(maxOffset, currentDirection.dot(north) * maxOffset * 1.65));
  return Object.freeze({
    eastOffset: Number(eastOffset.toFixed(1)),
    northOffset: Number(northOffset.toFixed(1)),
    x: Number((selection.basePose.x + eastOffset).toFixed(1)),
    z: Number((selection.basePose.z + northOffset).toFixed(1)),
    maxOffset,
    locationName: String(appCtx.customLoc?.name || appCtx.LOCS?.[appCtx.selLoc]?.name || 'current Earth location')
  });
}

function commitEarthLandingSelection() {
  const landing = getEarthLandingSelection();
  const selection = appCtx.spaceFlight?.earthLandingSelection;
  if (!landing || !selection?.basePose) return null;
  appCtx.earthSessionState ||= { pose: null };
  appCtx.earthSessionState.pose = {
    ...selection.basePose,
    x: landing.x,
    z: landing.z
  };
  appCtx.earthPosition = {
    x: landing.x,
    z: landing.z,
    angle: Number(selection.basePose.angle) || 0
  };
  return landing;
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
  collapseFlightHud() {
    if (globalThis.matchMedia?.('(max-width: 768px)').matches === true) setSpaceFlightHudCollapsed(true);
  },
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

function startSpaceFlightToMoon(options = {}) {
  const freeFlight = options.freeFlight === true;
  if (appCtx.spaceFlight.active) return appCtx.spaceFlight.destination === 'moon';
  console.log("Starting space flight to Moon...");
  const sessionId = beginSpaceFlightSession({
    activeCraftId: SPACE_CRAFT_IDENTITY.starship.id,
    phase: freeFlight ? SPACE_TRAVEL_PHASE.FREE_FLIGHT : SPACE_TRAVEL_PHASE.LAUNCH,
    sourceBodyId: 'earth',
    destination: { id: 'moon', kind: 'body', name: 'Moon' },
    guidance: freeFlight ? SPACE_GUIDANCE_MODE.MANUAL : SPACE_GUIDANCE_MODE.ASSISTED,
    reason: freeFlight ? 'free-space-flight' : 'earth-moon-flight'
  });
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
  document.getElementById('sfDestination').textContent = freeFlight ? 'Free flight' : 'Moon';
  document.getElementById('sfLandBtn').textContent = freeFlight ? 'SELECT A DESTINATION' : 'LAND ON MOON';

  const worldCanvas = getPrimaryWorldCanvas(appCtx);
  if (worldCanvas) worldCanvas.style.display = 'none';

  hideGameUI();

  if (!appCtx.spaceFlight.scene || !appCtx.spaceFlight.renderer || !appCtx.spaceFlight.camera) createSpaceFlightScene();
  ensureExtendedSpaceScene();
  leaseSpaceFlightResources();
  appCtx.returnUniverseToSolImmediate?.();
  resetSpaceFlightForMoon();
  if (freeFlight) {
    // Free flight retains the classic local controller. Wayfinder starts the
    // long-range journey only after the player sets a course.
    appCtx.releaseRenderedJourneyToManualFlight?.();
  } else {
    appCtx.beginRenderedSpaceJourney?.({
      sourceBodyId: 'earth',
      destinationBodyId: 'moon',
      mode: 'assisted',
      autoAssist: true
    });
  }

  appCtx.stopRuntimeKernel?.('space-flight-active');
  animateSpaceFlight();

  if (typeof appCtx.showSolarSystemUI === 'function') appCtx.showSolarSystemUI();
  appCtx.showUniverseUI?.();

  spaceSessionScope.timeout(() => {
    if (!isCurrentSpaceFlightSession(sessionId, 'moon')) return;
    appCtx.spaceFlight.mode = 'flying';
    appCtx.spaceFlight.speed = 0;
    appCtx.updateSpaceTravelSession?.({
      phase: freeFlight ? SPACE_TRAVEL_PHASE.FREE_FLIGHT : SPACE_TRAVEL_PHASE.ASCENT,
      reason: freeFlight ? 'free-flight-ready' : 'earth-ascent-ready'
    });
    showFlightMessage(freeFlight ? 'FREE SPACE FLIGHT READY · OPEN WAYFINDER TO SET A COURSE' : 'SPACE FLIGHT READY', '#10b981');
  }, 1000);
  return true;
}

function startFreeSpaceFlight() {
  return startSpaceFlightToMoon({ freeFlight: true });
}

async function startExpeditionPirateInterception(encounter, hooks = {}) {
  if (!encounter) return false;
  if (appCtx.activeShipInterior) appCtx.exitExpeditionShipInterior?.();
  if (!appCtx.spaceFlight.active) {
    if (!startFreeSpaceFlight()) return false;
    await new Promise((resolve) => spaceModuleScope.timeout(resolve, 1050));
  }
  if (!appCtx.spaceFlight.scene || !appCtx.spaceFlight.rocket || !pirateInterceptionRuntime) return false;
  appCtx.releaseRenderedJourneyToManualFlight?.();
  appCtx.hideSolarSystemUI?.();
  appCtx.hideUniverseUI?.();
  appCtx.updateSpaceTravelSession?.({
    activeCraftId: SPACE_CRAFT_IDENTITY.pod.id,
    location: SPACE_TRAVEL_LOCATION.LOCAL_SPACE,
    phase: SPACE_TRAVEL_PHASE.FREE_FLIGHT,
    guidance: SPACE_GUIDANCE_MODE.MANUAL,
    destination: { id: SPACE_CRAFT_IDENTITY.starship.id, kind: 'defense', name: `${SPACE_CRAFT_IDENTITY.starship.name} defense perimeter` },
    reason: 'pirate-interception-defense-launched'
  });
  setExpeditionPodFlightPresentation(true);
  appCtx.spaceFlight.mode = 'flying';
  appCtx.spaceFlight._manualLandingTarget = null;
  appCtx.spaceFlight._autopilotTarget = null;
  appCtx.spaceFlight._launchSource = null;
  if (appCtx.spaceFlight.solisReachDockTarget) appCtx.spaceFlight.solisReachDockTarget.visible = false;
  return pirateInterceptionRuntime.begin(encounter, hooks);
}

function startSpaceFlightToSolisReach(options = {}) {
  if (appCtx.spaceFlight.active) return false;
  const usePathfinder = options.pathfinder !== false;
  const sessionId = beginSpaceFlightSession({
    activeCraftId: usePathfinder ? SPACE_CRAFT_IDENTITY.pod.id : SPACE_CRAFT_IDENTITY.starship.id,
    phase: usePathfinder ? SPACE_TRAVEL_PHASE.RENDEZVOUS : SPACE_TRAVEL_PHASE.DOCKED,
    sourceBodyId: 'earth',
    destination: { id: SPACE_CRAFT_IDENTITY.starship.id, kind: 'starship', name: SPACE_CRAFT_IDENTITY.starship.name },
    guidance: SPACE_GUIDANCE_MODE.MANUAL,
    reason: usePathfinder ? 'pathfinder-earth-rendezvous' : 'direct-starship-boarding'
  });
  const transition = beginEnvironmentTransition(appCtx.ENV.SPACE_FLIGHT, {
    source: usePathfinder ? 'earth_to_pathfinder_pod' : 'earth_to_solis_reach_direct'
  });

  appCtx.setEnvironmentTransitionActive(true);
  appCtx.setPauseReason?.('planetary_transition', true);
  appCtx.earthPosition = { x: appCtx.car.x, z: appCtx.car.z, angle: appCtx.car.angle };
  captureEarthWorldSession();
  suspendEarthModesForPlanetaryEntry(appCtx.ENV.SPACE_FLIGHT);
  appCtx.scene.background = new THREE.Color(0x000000);

  appCtx.spaceFlight.destination = SPACE_CRAFT_IDENTITY.starship.id;
  appCtx.spaceFlight.mode = 'launching';
  appCtx.spaceFlight.active = true;
  appCtx.spaceFlight._launchSource = 'Earth';
  appCtx.spaceFlight.launchStartMs = Date.now();
  appCtx.spaceFlight._isThrusting = false;
  if (!commitEnvironment(appCtx.ENV.SPACE_FLIGHT, { token: transition })) return false;
  emitTutorialEvent('entered_space', { destination: SPACE_CRAFT_IDENTITY.starship.id, source: usePathfinder ? 'pathfinder_pod' : 'direct_starship' });

  appCtx.spaceFlight.canvas.style.display = 'block';
  appCtx.spaceFlight.hud.style.display = 'block';
  prepareSpaceFlightHudForEntry();
  document.getElementById('sfDestination').textContent = SPACE_CRAFT_IDENTITY.starship.name;
  document.getElementById('sfLandBtn').textContent = `APPROACH ${SPACE_CRAFT_IDENTITY.starship.name.toUpperCase()}`;
  const worldCanvas = getPrimaryWorldCanvas(appCtx);
  if (worldCanvas) worldCanvas.style.display = 'none';
  hideGameUI();

  createSpaceFlightScene({ includeExtendedSpace: true });
  ensureExtendedSpaceScene();
  leaseSpaceFlightResources();
  appCtx.returnUniverseToSolImmediate?.();
  resetSpaceFlightForMoon();
  appCtx.releaseRenderedJourneyToManualFlight?.();
  appCtx.spaceFlight.destination = SPACE_CRAFT_IDENTITY.starship.id;
  appCtx.spaceFlight._manualLandingTarget = null;
  appCtx.spaceFlight._autopilotTarget = null;
  ensureSolisReachDockTarget();
  setExpeditionPodFlightPresentation(usePathfinder);

  appCtx.stopRuntimeKernel?.('space-flight-active');
  animateSpaceFlight();
  appCtx.showSolarSystemUI?.();
  appCtx.showUniverseUI?.();
  spaceSessionScope.timeout(() => {
    if (!isCurrentSpaceFlightSession(sessionId, SPACE_CRAFT_IDENTITY.starship.id)) return;
    appCtx.spaceFlight.mode = 'flying';
    appCtx.spaceFlight.speed = 0;
    appCtx.updateSpaceTravelSession?.({
      phase: usePathfinder ? SPACE_TRAVEL_PHASE.RENDEZVOUS : SPACE_TRAVEL_PHASE.DOCKED,
      reason: usePathfinder ? 'pathfinder-rendezvous-ready' : 'starship-boarding-ready'
    });
    appCtx.setPauseReason?.('planetary_transition', false);
    showFlightMessage(usePathfinder ? `${SPACE_CRAFT_IDENTITY.starship.name.toUpperCase()} ACQUIRED · MANUAL DOCKING APPROACH` : `${SPACE_CRAFT_IDENTITY.starship.name.toUpperCase()} TRANSFER COMPLETE`, '#6fe8ff');
    options.onReady?.();
  }, 1000);
  return true;
}

function startSpaceFlightToEarth(options = {}) {
  if (appCtx.spaceFlight.active) return appCtx.getSpaceTravelSession?.()?.phase === SPACE_TRAVEL_PHASE.RENDEZVOUS;
  const sourceBodyId = appCtx.activePlanetaryBodyId || (appCtx.onMars ? 'mars' : 'moon');
  const sourceLabel = sourceBodyId[0].toUpperCase() + sourceBodyId.slice(1);
  if (options.surfaceLaunchCommitted !== true) {
    return playSurfacePodLaunch(appCtx, {
      bodyId: sourceBodyId,
      onCommit: () => startSpaceFlightToEarth({ surfaceLaunchCommitted: true }),
      onFailure: () => showFlightMessage('PATHFINDER REMAINED ON THE SURFACE', '#f59e0b')
    });
  }
  const sessionId = beginSpaceFlightSession({
    activeCraftId: SPACE_CRAFT_IDENTITY.pod.id,
    phase: SPACE_TRAVEL_PHASE.RENDEZVOUS,
    sourceBodyId,
    destination: { id: SPACE_CRAFT_IDENTITY.starship.id, kind: 'starship', name: SPACE_CRAFT_IDENTITY.starship.name },
    guidance: SPACE_GUIDANCE_MODE.MANUAL,
    reason: 'surface-pathfinder-rendezvous'
  });
  const transition = beginEnvironmentTransition(appCtx.ENV.SPACE_FLIGHT, { source: 'surface_to_pathfinder_pod' });

  appCtx.setEnvironmentTransitionActive(true);
  appCtx.setPauseReason?.('planetary_transition', true);
  if (typeof appCtx.hideReturnToEarthButton === 'function') appCtx.hideReturnToEarthButton();
  const marsReturnButton = document.getElementById('marsReturnEarthBtn');
  if (marsReturnButton) marsReturnButton.style.display = 'none';
  suspendEarthModesForPlanetaryEntry(appCtx.ENV.SPACE_FLIGHT);

  appCtx.spaceFlight.destination = SPACE_CRAFT_IDENTITY.starship.id;
  appCtx.spaceFlight.mode = 'launching';
  appCtx.spaceFlight.active = true;
  appCtx.spaceFlight._launchSource = sourceLabel;
  appCtx.spaceFlight.launchStartMs = Date.now();
  appCtx.spaceFlight._isThrusting = false;
  if (!commitEnvironment(appCtx.ENV.SPACE_FLIGHT, { token: transition })) return false;
  emitTutorialEvent('entered_space', { destination: SPACE_CRAFT_IDENTITY.starship.id, source: 'pathfinder_pod' });

  appCtx.spaceFlight.canvas.style.display = 'block';
  appCtx.spaceFlight.hud.style.display = 'block';
  prepareSpaceFlightHudForEntry();
  document.getElementById('sfDestination').textContent = SPACE_CRAFT_IDENTITY.starship.name;
  document.getElementById('sfLandBtn').textContent = `DOCK WITH ${SPACE_CRAFT_IDENTITY.starship.name.toUpperCase()}`;

  const worldCanvas = getPrimaryWorldCanvas(appCtx);
  if (worldCanvas) worldCanvas.style.display = 'none';

  hideGameUI();
  createSpaceFlightScene({ includeExtendedSpace: true });
  ensureExtendedSpaceScene();
  leaseSpaceFlightResources();
  appCtx.returnUniverseToSolImmediate?.();
  if (sourceBodyId === 'moon') resetSpaceFlightForEarth();
  else if (sourceBodyId === 'mars') {
    const mars = appCtx.getAllSpaceBodies?.().find((body) => String(body?.name || '').toLowerCase() === 'mars');
    if (mars?.position) {
      appCtx.spaceFlight.rocket.position.copy(mars.position).add(new THREE.Vector3(0, Number(mars.radius || 24) + 8, 0));
    } else resetSpaceFlightForEarth();
  } else resetSpaceFlightForMoon();
  appCtx.spaceFlight._launchSource = sourceLabel;
  appCtx.releaseRenderedJourneyToManualFlight?.();
  setExpeditionPodFlightPresentation(true);
  ensureSolisReachDockTarget({ nearActiveCraft: true });
  orientActiveCraftTowardSolisReach();
  void prepareSolisReachSurfaceRendezvous(sourceBodyId).then(() => {
    if (!isCurrentSpaceFlightSession(sessionId, SPACE_CRAFT_IDENTITY.starship.id)) return;
    ensureSolisReachDockTarget({ nearActiveCraft: true });
    orientActiveCraftTowardSolisReach();
  }).catch((error) => {
    console.error('Solis Reach rendezvous could not be refreshed.', error);
  });
  appCtx.stopRuntimeKernel?.('space-flight-active');
  animateSpaceFlight();

  if (appCtx.spaceFlight._extendedSpaceLoaded) {
    appCtx.showSolarSystemUI?.();
    appCtx.showUniverseUI?.();
  }

  spaceSessionScope.timeout(() => {
    if (!isCurrentSpaceFlightSession(sessionId, SPACE_CRAFT_IDENTITY.starship.id)) return;
    appCtx.spaceFlight.mode = 'flying';
    appCtx.spaceFlight.speed = 0;
    appCtx.updateSpaceTravelSession?.({ phase: SPACE_TRAVEL_PHASE.RENDEZVOUS, reason: 'surface-rendezvous-ready' });
    appCtx.setPauseReason?.('planetary_transition', false);
    showFlightMessage(`${SPACE_CRAFT_IDENTITY.starship.name.toUpperCase()} ACQUIRED · MANUAL DOCKING APPROACH`, '#6fe8ff');
  }, 1000);
  return true;
}

function startSpaceFlightToMars() {
  console.log('Starting space flight to Mars...');
  if (appCtx.onMars) return false;
  if (appCtx.spaceFlight.active) return appCtx.spaceFlight.destination === 'mars';
  const sourceBodyId = appCtx.onMoon ? 'moon' : 'earth';
  const sessionId = beginSpaceFlightSession({
    activeCraftId: SPACE_CRAFT_IDENTITY.starship.id,
    phase: SPACE_TRAVEL_PHASE.LAUNCH,
    sourceBodyId,
    destination: { id: 'mars', kind: 'body', name: 'Mars' },
    guidance: SPACE_GUIDANCE_MODE.ASSISTED,
    reason: `${sourceBodyId}-mars-flight`
  });
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
    mode: 'assisted',
    autoAssist: true
  });
  appCtx.stopRuntimeKernel?.('space-flight-active');
  animateSpaceFlight();
  appCtx.showSolarSystemUI?.();
  appCtx.showUniverseUI?.();
  spaceSessionScope.timeout(() => {
    if (!isCurrentSpaceFlightSession(sessionId, 'mars')) return;
    appCtx.spaceFlight.mode = 'flying';
    appCtx.spaceFlight.speed = 0;
    appCtx.updateSpaceTravelSession?.({ phase: SPACE_TRAVEL_PHASE.ASCENT, reason: 'mars-flight-ready' });
    showFlightMessage('MARS FLIGHT READY', '#e26f45');
  }, 1000);
  return true;
}

function startSpaceFlightFromExpeditionSurface(options = {}) {
  if (appCtx.spaceFlight.active) return false;
  const frameId = String(options.frameId || '').trim();
  const courseDestinationId = String(options.courseDestinationId || '').trim();
  if (!frameId || !courseDestinationId) return false;
  const sessionId = beginSpaceFlightSession({
    activeCraftId: SPACE_CRAFT_IDENTITY.pod.id,
    phase: SPACE_TRAVEL_PHASE.RENDEZVOUS,
    sourceBodyId: courseDestinationId,
    destination: { id: SPACE_CRAFT_IDENTITY.starship.id, kind: 'starship', name: SPACE_CRAFT_IDENTITY.starship.name },
    guidance: SPACE_GUIDANCE_MODE.MANUAL,
    reason: 'pathfinder-surface-return'
  });
  const transition = beginEnvironmentTransition(appCtx.ENV.SPACE_FLIGHT, { source: 'expedition_surface_return' });
  appCtx.setEnvironmentTransitionActive(true);
  appCtx.setPauseReason?.('planetary_transition', true);
  suspendEarthModesForPlanetaryEntry(appCtx.ENV.SPACE_FLIGHT);
  appCtx.spaceFlight.destination = SPACE_CRAFT_IDENTITY.starship.id;
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
  if (destinationLabel) destinationLabel.textContent = SPACE_CRAFT_IDENTITY.starship.name;
  const landButton = document.getElementById('sfLandBtn');
  if (landButton) landButton.textContent = `DOCK WITH ${SPACE_CRAFT_IDENTITY.starship.name.toUpperCase()}`;
  const worldCanvas = getPrimaryWorldCanvas(appCtx);
  if (worldCanvas) worldCanvas.style.display = 'none';
  hideGameUI();
  createSpaceFlightScene({ includeExtendedSpace: true });
  ensureExtendedSpaceScene();
  leaseSpaceFlightResources();
  // The surface journey is finished. Keep the local star-system frame for
  // visual continuity, but do not leave the departed planet as an active
  // navigation course while the pod is actually rendezvousing with the ship.
  appCtx.releaseRenderedJourneyToManualFlight?.();
  if (!appCtx.restoreUniverseLocalFrame?.(frameId, '')) {
    exitSpaceFlight('expedition_surface_restore_failed');
    return false;
  }
  setExpeditionPodFlightPresentation(true);
  ensureSolisReachDockTarget({ nearActiveCraft: true });
  orientActiveCraftTowardSolisReach();
  void prepareSolisReachSurfaceRendezvous(courseDestinationId).then(() => {
    if (!isCurrentSpaceFlightSession(sessionId, SPACE_CRAFT_IDENTITY.starship.id)) return;
    ensureSolisReachDockTarget({ nearActiveCraft: true });
    orientActiveCraftTowardSolisReach();
  }).catch((error) => {
    console.error('Solis Reach expedition rendezvous could not be refreshed.', error);
  });
  appCtx.stopRuntimeKernel?.('space-flight-active');
  animateSpaceFlight();
  appCtx.showUniverseUI?.();
  spaceSessionScope.timeout(() => {
    if (!isCurrentSpaceFlightSession(sessionId, SPACE_CRAFT_IDENTITY.starship.id)) return;
    appCtx.spaceFlight.mode = 'flying';
    appCtx.spaceFlight.speed = 0;
    appCtx.updateSpaceTravelSession?.({ phase: SPACE_TRAVEL_PHASE.RENDEZVOUS, reason: 'pathfinder-return-ready' });
    appCtx.setPauseReason?.('planetary_transition', false);
    showFlightMessage('SURVEY TEAM ABOARD · SAMPLE TRANSFER COMPLETE', '#83e6a6');
    options.onReady?.();
  }, 800);
  return true;
}

function completePathfinderDocking() {
  const session = appCtx.getSpaceTravelSession?.();
  const target = getSolisReachDockTarget();
  const pod = appCtx.spaceFlight?.rocket;
  if (!target?.position || !pod || session?.activeCraftId !== SPACE_CRAFT_IDENTITY.pod.id || session.phase !== SPACE_TRAVEL_PHASE.RENDEZVOUS) return false;
  const distance = pod.position.distanceTo(target.position);
  const relativeSpeed = appCtx.spaceFlight.velocity?.length?.() || Number(appCtx.spaceFlight.speed || 0);
  if (distance >= target.radius + 24 || relativeSpeed > 1.35) return false;
  appCtx.spaceFlight.velocity?.set?.(0, 0, 0);
  appCtx.spaceFlight.speed = 0;
  void prepareSolisReachSurfaceRendezvous(session.sourceBodyId).then(() => {
    if (appCtx.attemptExpeditionPodDocking?.() !== true) {
      showFlightMessage(`HOLD POSITION NEAR ${SPACE_CRAFT_IDENTITY.starship.name.toUpperCase()} AND TRY AGAIN`, '#f59e0b');
    }
  }).catch((error) => {
    console.error('Solis Reach boarding could not be completed.', error);
    showFlightMessage(`${SPACE_CRAFT_IDENTITY.starship.name.toUpperCase()} BOARDING IS TEMPORARILY UNAVAILABLE`, '#f59e0b');
  });
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
  appCtx.updateSpaceTravelSession?.({
    location: SPACE_TRAVEL_LOCATION.SURFACE,
    phase: SPACE_TRAVEL_PHASE.LANDED,
    reason: `landed-${String(targetName || 'destination').toLowerCase()}`
  });
  if (['Earth', 'earth'].includes(targetName)) commitEarthLandingSelection();
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

  pirateInterceptionRuntime?.stop?.('space-flight-exit');

  appCtx.spaceFlight.active = false;
  appCtx.endSpaceTravelSession?.(source || 'space-flight-exit');
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
  appCtx.spaceFlight._landingApproachDirection = null;
  appCtx.spaceFlight.earthLandingSelection = null;
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
    sessionId: Number(appCtx.spaceFlight._sessionId || 0),
    travelSession: appCtx.getSpaceTravelSession?.() || null
  })
});

function initSpaceFlightWhenReady() {
  if (typeof THREE !== 'undefined') {
    configureSpaceRuntimeDependencies({ THREE: globalThis.THREE });
    console.log("Space Flight module loaded!");
    initSpaceFlightUI(attemptLanding, spaceModuleScope);
    pirateInterceptionRuntime ||= createPirateInterceptionRuntime(appCtx);
    appCtx.pirateInterceptionRuntime = pirateInterceptionRuntime;
    appCtx.startExpeditionPirateInterception = startExpeditionPirateInterception;
    appCtx.updatePirateInterception = (dtS) => pirateInterceptionRuntime?.update?.(dtS) === true;
    appCtx.getPirateInterceptionSnapshot = () => pirateInterceptionRuntime?.snapshot?.() || { active: false, phase: 'INACTIVE' };
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
  getEarthLandingSelection,
  setExpeditionPodFlightPresentation,
  setSolisReachFlightPresentation,
  ensureSolisReachDockTarget,
  getSolisReachDockTarget,
  completePathfinderDocking,
  positionSpacecraftAtSolisReachDock,
  orientActiveCraftForAtmosphere,
  orientActiveCraftTowardSolisReach,
  updateExpeditionPodFlightPresentation,
  startSpaceFlightToEarth,
  startSpaceFlightFromExpeditionSurface,
  startSpaceFlightToMars,
  startSpaceFlightToSolisReach,
  startExpeditionPirateInterception,
  startFreeSpaceFlight,
  startSpaceFlightToMoon
});

export {
  animateSpaceFlight,
  exitSpaceFlight,
  forceSpaceFlightLanding,
  setSpaceFlightLandingTarget,
  getEarthLandingSelection,
  setExpeditionPodFlightPresentation,
  setSolisReachFlightPresentation,
  ensureSolisReachDockTarget,
  getSolisReachDockTarget,
  completePathfinderDocking,
  positionSpacecraftAtSolisReachDock,
  orientActiveCraftForAtmosphere,
  orientActiveCraftTowardSolisReach,
  updateExpeditionPodFlightPresentation,
  startSpaceFlightToEarth,
  startSpaceFlightFromExpeditionSurface,
  startSpaceFlightToMars,
  startSpaceFlightToSolisReach,
  startExpeditionPirateInterception,
  startFreeSpaceFlight,
  startSpaceFlightToMoon
};

if (document.readyState === 'loading') {
  spaceModuleScope.listen(document, 'DOMContentLoaded', initSpaceFlightWhenReady, { once: true });
} else {
  initSpaceFlightWhenReady();
}
