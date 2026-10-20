import { ctx as appCtx } from "./shared-context.js?v=55";
import {activeActorPose} from './transport/actor-contract.js?v=6';
import { captureEnvironmentSession, commitEnvironment, registerEnvironmentLifecycle } from './session-coordinator.js?v=2';
import {isEarthWorldUsable} from './earth-core/world-readiness.js';

const REUSE_EXISTING_EARTH_WORLD = true;
let resumeSequence=0;

function markEarthResumePhase(phase, details = {}) {
  const previous = appCtx.earthResumeDiagnostics || {};
  const startedAt = Number(previous.startedAt) || performance.now();
  appCtx.earthResumeDiagnostics = {
    ...previous,
    ...details,
    phase,
    startedAt,
    updatedAt: performance.now(),
    elapsedMs: performance.now() - startedAt
  };
}

function showEarthResumeLoad() {
  appCtx.earthResumeDiagnostics = { startedAt: performance.now() };
  markEarthResumePhase('show_load');
  appCtx.earthResumePending = true;
  appCtx.earthResumeRenderReady = false;
  appCtx.showLoad?.('Restoring the local Earth world...', {
    background: '../assets/landing/city.jpg',
    hideSpinner: false,
    transition: true,
    bold: true,
    overlay: 0.34
  });
}

function finishEarthResumeLoad() {
  if (appCtx.earthResumeDiagnostics?.phase !== 'failed') markEarthResumePhase('complete');
  appCtx.earthResumePending = false;
  appCtx.earthResumeRenderReady = false;
  appCtx.hideLoad?.();
}

function waitForRenderedFrames(frameCount = 2, timeoutMs = 280) {
  return new Promise((resolve) => {
    let remaining = Math.max(1, frameCount);
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const onFrame = () => {
      remaining -= 1;
      if (remaining <= 0) finish();
      else requestAnimationFrame(onFrame);
    };
    requestAnimationFrame(onFrame);
    globalThis.setTimeout(finish, timeoutMs);
  });
}

function getEarthSessionState() {
  if (!appCtx.earthSessionState || typeof appCtx.earthSessionState !== 'object') {
    appCtx.earthSessionState = {
      pose: null
    };
  }
  return appCtx.earthSessionState;
}

function hasLoadedEarthWorld() {
  return isEarthWorldUsable(appCtx);
}

async function restoreEarthActorOwnership(isCurrent) {
  markEarthResumePhase('restore_vehicle');
  await appCtx.setPlanetaryVehicle?.('earth');
  if(!isCurrent())return false;
  markEarthResumePhase('restore_character');
  await appCtx.setPlanetaryCharacter?.('earth');
  return isCurrent();
}

function captureCurrentPose() {
  const state = getEarthSessionState();
  const actor = activeActorPose(appCtx);
  const travelMode = typeof appCtx.getCurrentTravelMode === 'function' ? appCtx.getCurrentTravelMode() : 'drive';
  if (actor.frame !== 'surface' || actor.mode === 'unavailable') return state.pose;

  const nextPose = {
    mode: travelMode,
    x: Number(actor.x) || 0,
    z: Number(actor.z) || 0,
    angle: actor.yaw
  };

  if (travelMode === 'walk' || travelMode === 'drive') {
    nextPose.y = actor.y;
    const road = appCtx.car?.road;
    nextPose.roadId = String(road?.sourceFeatureId || road?.transportRecord?.identity || road?.id || '');
  } else if (travelMode === 'drone' && appCtx.drone) {
    nextPose.angle = Number(appCtx.drone.yaw ?? nextPose.angle) || 0;
    nextPose.droneY = Number(appCtx.drone.y);
    nextPose.dronePitch = Number(appCtx.drone.pitch);
    nextPose.droneRoll = Number(appCtx.drone.roll);
  } else if (travelMode === 'plane' && appCtx.planeMode) {
    nextPose.angle = Number(appCtx.planeMode.yaw ?? nextPose.angle) || 0;
    nextPose.planeY = Number(appCtx.planeMode.y);
    nextPose.planePitch = Number(appCtx.planeMode.pitch);
    nextPose.planeRoll = Number(appCtx.planeMode.roll);
    nextPose.planeSpeed = Number(appCtx.planeMode.speed);
    nextPose.planeThrottle = Number(appCtx.planeMode.throttle);
    nextPose.planeAirborne = !!appCtx.planeMode.airborne;
    nextPose.planeCatalogId = appCtx.planeMode.transportCatalogId;
    nextPose.planeEntityId = appCtx.planeMode.transportEntityId;
    nextPose.planeCondition = appCtx.planeMode.condition;
  } else if (travelMode === 'boat') {
    nextPose.x = appCtx.boat.x;
    nextPose.z = appCtx.boat.z;
    nextPose.angle = appCtx.boat.angle;
    nextPose.boatCatalogId = appCtx.boatMode.transportCatalogId;
    nextPose.boatEntityId = appCtx.boatMode.transportEntityId;
    nextPose.boatCondition = appCtx.boatMode.condition;
  }

  state.pose = nextPose;
  return nextPose;
}

function stampLoadedSelection() {
  const state = getEarthSessionState();
  appCtx.markLocationSelectionLoaded?.();
  captureCurrentPose();
  return state;
}

function canResumeEarthSession() {
  if (!isEarthWorldUsable(appCtx)) return false;
  return appCtx.isLoadedLocationSelectionCurrent?.() === true;
}

function restoreSelectionFromState() {
  return appCtx.restoreLoadedLocationSelection?.() || normalizeEarthSelection();
}

function restorePoseFromSession() {
  const pose = getEarthSessionState().pose || {
    mode:'drive',
    x:Number.isFinite(appCtx.earthPosition?.x) ? appCtx.earthPosition.x : 0,
    z:Number.isFinite(appCtx.earthPosition?.z) ? appCtx.earthPosition.z : 0,
    angle:Number.isFinite(appCtx.earthPosition?.angle) ? appCtx.earthPosition.angle : 0
  };
  return appCtx.restoreEarthTravelSession?.(pose) === true;
}

async function finalizeEarthResume(resolved, isCurrent = () => true, options = {}) {
  if (!isCurrent()) return false;
  markEarthResumePhase('restore_world_visibility');
  appCtx.setEarthSceneVisible?.(true);
  if (typeof appCtx.refreshBoatAvailability === 'function') {
    appCtx.refreshBoatAvailability(true);
  }
  if (typeof appCtx.refreshAstronomicalSky === 'function') {
    appCtx.refreshAstronomicalSky(true);
  }
  if (typeof appCtx.refreshLiveWeather === 'function') {
    void appCtx.refreshLiveWeather(true);
  }
  if (typeof appCtx.updateControlsModeUI === 'function') {
    appCtx.updateControlsModeUI();
  }
  appCtx.earthResumeRenderReady = true;
  markEarthResumePhase('render_frames');
  await appCtx.prepareFirstWorldRender?.();
  await waitForRenderedFrames();
  if (!isCurrent()) return false;
  appCtx.lastTime = performance.now();
  stampLoadedSelection();
  markEarthResumePhase('finalized');
  return true;
}

export function shouldReuseExistingEarthWorld() {
  return REUSE_EXISTING_EARTH_WORLD;
}

export function normalizeEarthSelection() {
  return appCtx.normalizeLocationSelection?.('baltimore') || String(appCtx.selLoc || 'baltimore');
}

export function captureEarthWorldSession() {
  if (!hasLoadedEarthWorld()) return null;
  normalizeEarthSelection();
  return stampLoadedSelection();
}

export async function reloadEarthWorldSession(options = {}) {
  const invocation=options.resumeSequence??++resumeSequence;
  let session=null;
  const transitionDurationMs = Number.isFinite(options.transitionDurationMs) ? options.transitionDurationMs : 700;
  const shouldSwitchEnv = options.switchEnv !== false;
  const isCurrent = () => {
    if(invocation!==resumeSequence||session&&!session.isCurrent())return false;
    if (typeof options.isCurrent === 'function' && !options.isCurrent()) return false;
    return !appCtx.ENV?.EARTH || typeof appCtx.getEnv !== 'function' || appCtx.getEnv() === appCtx.ENV.EARTH;
  };

  showEarthResumeLoad();
  try {
    if (shouldSwitchEnv && appCtx.ENV?.EARTH) commitEnvironment(appCtx.ENV.EARTH, { source: 'earth_reload' });
    markEarthResumePhase('reload_actor');
    session=captureEnvironmentSession({includeWorld:false});
    if(!await restoreEarthActorOwnership(isCurrent))return {aborted:true,resumed:false};
    appCtx.loadingScreenMode = 'earth';
    normalizeEarthSelection();

    if (transitionDurationMs > 0) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, Math.min(transitionDurationMs, 240)));
    }
    if (!isCurrent()) return { aborted: true, resumed: false };
    if (typeof appCtx.loadRoads !== 'function') throw new Error('Earth world loader is unavailable.');
    markEarthResumePhase('reload_world');
    const result = await appCtx.loadRoads();
    if (!isCurrent()) return { aborted: true, resumed: false };
    if (!isEarthWorldUsable(appCtx, result)) {
      markEarthResumePhase('failed');
      throw new Error('The Earth location did not finish loading. Return to the location menu and try again.');
    }
    session=captureEnvironmentSession();
    const resolved = restorePoseFromSession();
    if (!isCurrent()) return {aborted:true,resumed:false};
    if (!resolved) throw new Error('The saved Earth travel state could not be restored safely.');
    markEarthResumePhase('reload_finalize');
    if (!await finalizeEarthResume(resolved, isCurrent, { syncSurface: true })) {
      return { aborted: true, resumed: false };
    }

    return {
      resumed: false,
      selLoc: appCtx.selLoc === 'custom' ? 'custom' : String(appCtx.selLoc || 'baltimore')
    };
  } catch (error) {
    if (isCurrent()) markEarthResumePhase('failed');
    throw error;
  } finally {
    if(isCurrent())finishEarthResumeLoad();
  }
}

export async function resumeEarthWorldSession(options = {}) {
  const invocation=++resumeSequence;
  let session=null;
  const transitionDurationMs = Number.isFinite(options.transitionDurationMs) ? options.transitionDurationMs : 350;
  const shouldSwitchEnv = options.switchEnv !== false;
  const isCurrent = () => {
    if(invocation!==resumeSequence||session&&!session.isCurrent())return false;
    if (typeof options.isCurrent === 'function' && !options.isCurrent()) return false;
    return !appCtx.ENV?.EARTH || typeof appCtx.getEnv !== 'function' || appCtx.getEnv() === appCtx.ENV.EARTH;
  };

  showEarthResumeLoad();
  try {
    if (shouldSwitchEnv && appCtx.ENV?.EARTH) commitEnvironment(appCtx.ENV.EARTH, { source: 'earth_resume' });
    markEarthResumePhase('resume_actor');
    session=captureEnvironmentSession({includeWorld:false});
    if(!await restoreEarthActorOwnership(isCurrent))return {aborted:true,resumed:false};
    appCtx.loadingScreenMode = 'earth';

    if (!canResumeEarthSession()) {
      restoreSelectionFromState();
      return await reloadEarthWorldSession({
        resumeSequence:invocation,
        transitionDurationMs,
        switchEnv: false,
        isCurrent
      });
    }

    restoreSelectionFromState();
    if (transitionDurationMs > 0) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, Math.min(transitionDurationMs, 240)));
    }
    if (!isCurrent()) return { aborted: true, resumed: false };

    session=captureEnvironmentSession();
    const resolved = restorePoseFromSession();
    if (!isCurrent()) return {aborted:true,resumed:false};
    if (!resolved) throw new Error('The saved Earth travel state could not be restored safely.');
    markEarthResumePhase('resume_finalize');
    if (!await finalizeEarthResume(resolved, isCurrent, { syncSurface: false })) {
      return { aborted: true, resumed: false };
    }

    return {
      resumed: true,
      selLoc: appCtx.selLoc === 'custom' ? 'custom' : String(appCtx.selLoc || 'baltimore')
    };
  } catch (error) {
    if (isCurrent()) markEarthResumePhase('failed');
    throw error;
  } finally {
    if(isCurrent())finishEarthResumeLoad();
  }
}

registerEnvironmentLifecycle(appCtx.ENV.EARTH, {
  exitSync: () => captureEarthWorldSession(),
  snapshot: () => ({
    active: appCtx.getEnv?.() === appCtx.ENV.EARTH,
    buildings: Array.isArray(appCtx.buildings) ? appCtx.buildings.length : 0,
    loaded: hasLoadedEarthWorld(),
    roads: Array.isArray(appCtx.roads) ? appCtx.roads.length : 0,
    selection: String(appCtx.selLoc || ''),
    worldLoading: !!appCtx.worldLoading
  })
});
