import { ctx as appCtx } from "./shared-context.js?v=55";
import { currentActorWorldPosition } from "./earth-location.js?v=2";
import { commitEnvironment, registerEnvironmentLifecycle } from './session-coordinator.js?v=2';

const REUSE_EXISTING_EARTH_WORLD = true;

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
  markEarthResumePhase('complete');
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
  return appCtx.initialEarthWorldReady === true;
}

async function restoreEarthActorOwnership() {
  markEarthResumePhase('restore_vehicle');
  await appCtx.setPlanetaryVehicle?.('earth');
  markEarthResumePhase('restore_character');
  appCtx.setPlanetaryCharacter?.('earth');
}

function captureCurrentPose() {
  const state = getEarthSessionState();
  const actor = currentActorWorldPosition();
  const travelMode = typeof appCtx.getCurrentTravelMode === 'function' ? appCtx.getCurrentTravelMode() : 'drive';
  if (!actor) return state.pose;

  const nextPose = {
    mode: travelMode,
    x: Number(actor.x) || 0,
    z: Number(actor.z) || 0,
    angle: Number(appCtx.car?.angle) || 0
  };

  if (travelMode === 'walk' && appCtx.Walk?.state?.walker) {
    nextPose.angle = Number(appCtx.Walk.state.walker.yaw ?? appCtx.Walk.state.walker.angle ?? nextPose.angle) || 0;
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
  const state = getEarthSessionState();
  if (!hasLoadedEarthWorld()) return false;
  if (appCtx.worldDetailState?.buildings?.status === 'loading') return false;
  return appCtx.isLoadedLocationSelectionCurrent?.() === true;
}

function restoreSelectionFromState() {
  return appCtx.restoreLoadedLocationSelection?.() || normalizeEarthSelection();
}

function restorePoseFromSession() {
  const state = getEarthSessionState();
  const pose = state.pose || null;
  const fallbackAngle = Number(appCtx.earthPosition?.angle) || 0;
  const targetX = Number(pose?.x ?? appCtx.earthPosition?.x);
  const targetZ = Number(pose?.z ?? appCtx.earthPosition?.z);
  const targetMode = pose?.mode === 'walk' ? 'walk' : 'drive';
  const targetAngle = Number(pose?.angle ?? fallbackAngle) || 0;

  const resolved = typeof appCtx.resolveSafeWorldSpawn === 'function' ?
    appCtx.resolveSafeWorldSpawn(targetX, targetZ, {
      mode: targetMode,
      angle: targetAngle,
      source: 'earth_resume'
    }) :
    {
      valid: true,
      mode: targetMode,
      x: Number.isFinite(targetX) ? targetX : 0,
      z: Number.isFinite(targetZ) ? targetZ : 0,
      angle: targetAngle,
      carY: Number(appCtx.car?.y) || 0,
      walkY: Number(appCtx.Walk?.state?.walker?.y) || 1.7,
      onRoad: false,
      road: null
    };

  if (typeof appCtx.applyResolvedWorldSpawn === 'function') {
    appCtx.applyResolvedWorldSpawn(resolved, { mode: targetMode });
  }

  if (typeof appCtx.setTravelMode === 'function') {
    const resumeMode =
      pose?.mode === 'walk' || pose?.mode === 'drone' || pose?.mode === 'boat' || pose?.mode === 'plane' ?
        pose.mode :
        'drive';
    const modeOptions = {
      source: 'earth_resume',
      force: true,
      emitTutorial: false,
      allowDuringEarthResume: true
    };
    if (resumeMode === 'boat') {
      modeOptions.spawnX = Number.isFinite(pose?.x) ? pose.x : resolved?.x;
      modeOptions.spawnZ = Number.isFinite(pose?.z) ? pose.z : resolved?.z;
      modeOptions.yaw = Number.isFinite(pose?.angle) ? pose.angle : targetAngle;
      modeOptions.entryMode = 'walk';
    } else if (resumeMode === 'plane') {
      modeOptions.x = Number.isFinite(pose?.x) ? pose.x : resolved?.x;
      modeOptions.z = Number.isFinite(pose?.z) ? pose.z : resolved?.z;
      modeOptions.y = Number.isFinite(pose?.planeY) ? pose.planeY : undefined;
      modeOptions.yaw = Number.isFinite(pose?.angle) ? pose.angle : targetAngle;
      modeOptions.pitch = Number.isFinite(pose?.planePitch) ? pose.planePitch : 0;
      modeOptions.roll = Number.isFinite(pose?.planeRoll) ? pose.planeRoll : 0;
      modeOptions.speed = Number.isFinite(pose?.planeSpeed) ? pose.planeSpeed : 0;
      modeOptions.throttle = Number.isFinite(pose?.planeThrottle) ? pose.planeThrottle : 0;
      modeOptions.airborne = pose?.planeAirborne === true;
    }
    appCtx.setTravelMode(resumeMode, modeOptions);
    if (resumeMode === 'drone' && appCtx.drone) {
      appCtx.drone.x = Number.isFinite(pose?.x) ? pose.x : appCtx.drone.x;
      appCtx.drone.z = Number.isFinite(pose?.z) ? pose.z : appCtx.drone.z;
      if (Number.isFinite(pose?.droneY)) appCtx.drone.y = pose.droneY;
      if (Number.isFinite(pose?.angle)) appCtx.drone.yaw = pose.angle;
      if (Number.isFinite(pose?.dronePitch)) appCtx.drone.pitch = pose.dronePitch;
      if (Number.isFinite(pose?.droneRoll)) appCtx.drone.roll = pose.droneRoll;
    }
  }

  if (typeof appCtx.invalidateRoadCache === 'function') appCtx.invalidateRoadCache();
  return resolved;
}

async function finalizeEarthResume(resolved, isCurrent = () => true, options = {}) {
  if (!isCurrent()) return false;
  markEarthResumePhase('terrain_streaming');
  const x = Number.isFinite(resolved?.x) ? resolved.x : Number(appCtx.car?.x) || 0;
  const z = Number.isFinite(resolved?.z) ? resolved.z : Number(appCtx.car?.z) || 0;
  if (typeof appCtx.updateTerrainAround === 'function' && appCtx.terrainEnabled && !appCtx.onMoon) {
    appCtx.updateTerrainAround(x, z);
  }
  if (options.syncSurface === true) {
    markEarthResumePhase('surface_sync');
    appCtx.requestWorldSurfaceSync?.({ force: true, source: 'earth_reload' });
  }
  markEarthResumePhase('world_lod');
  appCtx.resumeEarthStreaming?.(1400);
  appCtx.updateEarthWorldStreaming?.(1);
  appCtx.updateWorldLod?.(true);
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
  appCtx.setEarthSceneVisible?.(true);
  markEarthResumePhase('render_frames');
  await waitForRenderedFrames();
  if (!isCurrent()) return false;
  appCtx.updateWorldLod?.(true);
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
  const transitionDurationMs = Number.isFinite(options.transitionDurationMs) ? options.transitionDurationMs : 700;
  const shouldSwitchEnv = options.switchEnv !== false;
  const isCurrent = () => {
    if (typeof options.isCurrent === 'function' && !options.isCurrent()) return false;
    return !appCtx.ENV?.EARTH || typeof appCtx.getEnv !== 'function' || appCtx.getEnv() === appCtx.ENV.EARTH;
  };

  showEarthResumeLoad();
  try {
    if (shouldSwitchEnv && appCtx.ENV?.EARTH) commitEnvironment(appCtx.ENV.EARTH, { source: 'earth_reload' });
    markEarthResumePhase('reload_actor');
    await restoreEarthActorOwnership();
    appCtx.loadingScreenMode = 'earth';
    normalizeEarthSelection();

    if (transitionDurationMs > 0) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, Math.min(transitionDurationMs, 240)));
    }
    if (!isCurrent()) return { aborted: true, resumed: false };
    if (typeof appCtx.loadRoads === 'function') {
      markEarthResumePhase('reload_world');
      await appCtx.loadRoads();
    }
    if (!isCurrent()) return { aborted: true, resumed: false };
    const resolved = restorePoseFromSession();
    markEarthResumePhase('reload_finalize');
    if (!await finalizeEarthResume(resolved, isCurrent, { syncSurface: true })) {
      return { aborted: true, resumed: false };
    }

    return {
      resumed: false,
      selLoc: appCtx.selLoc === 'custom' ? 'custom' : String(appCtx.selLoc || 'baltimore')
    };
  } finally {
    finishEarthResumeLoad();
  }
}

export async function resumeEarthWorldSession(options = {}) {
  const transitionDurationMs = Number.isFinite(options.transitionDurationMs) ? options.transitionDurationMs : 350;
  const shouldSwitchEnv = options.switchEnv !== false;
  const isCurrent = () => {
    if (typeof options.isCurrent === 'function' && !options.isCurrent()) return false;
    return !appCtx.ENV?.EARTH || typeof appCtx.getEnv !== 'function' || appCtx.getEnv() === appCtx.ENV.EARTH;
  };

  showEarthResumeLoad();
  try {
    if (shouldSwitchEnv && appCtx.ENV?.EARTH) commitEnvironment(appCtx.ENV.EARTH, { source: 'earth_resume' });
    markEarthResumePhase('resume_actor');
    await restoreEarthActorOwnership();
    appCtx.loadingScreenMode = 'earth';

    if (!canResumeEarthSession()) {
      restoreSelectionFromState();
      return reloadEarthWorldSession({
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

    const resolved = restorePoseFromSession();
    markEarthResumePhase('resume_finalize');
    if (!await finalizeEarthResume(resolved, isCurrent, { syncSurface: false })) {
      return { aborted: true, resumed: false };
    }

    return {
      resumed: true,
      selLoc: appCtx.selLoc === 'custom' ? 'custom' : String(appCtx.selLoc || 'baltimore')
    };
  } finally {
    finishEarthResumeLoad();
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
