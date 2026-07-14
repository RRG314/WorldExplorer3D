import { ctx as appCtx } from "./shared-context.js?v=55";
import { currentActorWorldPosition } from "./earth-location.js?v=2";

const REUSE_EXISTING_EARTH_WORLD = true;

function getEarthSessionState() {
  if (!appCtx.earthSessionState || typeof appCtx.earthSessionState !== 'object') {
    appCtx.earthSessionState = {
      loadedSignature: '',
      loadedSelLoc: 'baltimore',
      loadedCustomLoc: null,
      pose: null
    };
  }
  return appCtx.earthSessionState;
}

function cloneCustomLoc(customLoc) {
  const lat = Number(customLoc?.lat);
  const lon = Number(customLoc?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    lat,
    lon,
    name: String(customLoc?.name || 'Custom Location')
  };
}

function readCustomSelection() {
  const customLatInput = document.getElementById('customLat');
  const customLonInput = document.getElementById('customLon');
  const lat = Number(appCtx.customLoc?.lat ?? customLatInput?.value);
  const lon = Number(appCtx.customLoc?.lon ?? customLonInput?.value);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    lat,
    lon,
    name: String(appCtx.customLoc?.name || 'Custom Location')
  };
}

function currentSelectionSignature() {
  if (appCtx.selLoc === 'custom') {
    const customLoc = readCustomSelection();
    if (customLoc) {
      return `custom:${customLoc.lat.toFixed(6)}:${customLoc.lon.toFixed(6)}`;
    }
  }
  const locKey = appCtx.LOCS?.[appCtx.selLoc] ? String(appCtx.selLoc) : 'baltimore';
  return `preset:${locKey}`;
}

function hasLoadedEarthWorld() {
  return !!(
    (Array.isArray(appCtx.roads) && appCtx.roads.length > 0) ||
    (Array.isArray(appCtx.roadMeshes) && appCtx.roadMeshes.length > 0) ||
    (Array.isArray(appCtx.buildings) && appCtx.buildings.length > 0) ||
    (Array.isArray(appCtx.buildingMeshes) && appCtx.buildingMeshes.length > 0)
  );
}

function setGroundPlaneVisibility(visible) {
  if (!appCtx.scene || typeof appCtx.scene.traverse !== 'function') return;
  appCtx.scene.traverse((obj) => {
    if (obj?.userData?.isGroundPlane) {
      obj.visible = visible;
    }
  });
}

function restoreMeshList(meshes, visibilityResolver = null) {
  if (!Array.isArray(meshes) || !appCtx.scene) return;
  meshes.forEach((mesh) => {
    if (!mesh) return;
    mesh.visible = typeof visibilityResolver === 'function' ? visibilityResolver(mesh) : true;
    if (mesh.parent !== appCtx.scene) {
      appCtx.scene.add(mesh);
    }
  });
}

function restoreEarthSceneMeshes() {
  if (appCtx.terrainGroup) {
    appCtx.terrainGroup.visible = true;
    if (appCtx.terrainGroup.parent !== appCtx.scene) appCtx.scene.add(appCtx.terrainGroup);
  }
  if (appCtx.cloudGroup) {
    appCtx.cloudGroup.visible = true;
    if (appCtx.cloudGroup.parent !== appCtx.scene) appCtx.scene.add(appCtx.cloudGroup);
  }

  setGroundPlaneVisibility(true);

  restoreMeshList(appCtx.roadMeshes);
  restoreMeshList(appCtx.urbanSurfaceMeshes);
  restoreMeshList(appCtx.structureVisualMeshes);
  restoreMeshList(appCtx.buildingMeshes);
  restoreMeshList(appCtx.landuseMeshes, (mesh) => appCtx.landUseVisible || !!mesh?.userData?.alwaysVisible);
  restoreMeshList(appCtx.linearFeatureMeshes);
  restoreMeshList(appCtx.poiMeshes, () => !!appCtx.poiMode);
  restoreMeshList(appCtx.historicMarkers);
  restoreMeshList(appCtx.streetFurnitureMeshes);
  restoreMeshList(appCtx.vegetationMeshes);
  appCtx.earthSceneVisible = true;
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
  }

  state.pose = nextPose;
  return nextPose;
}

function stampLoadedSelection() {
  const state = getEarthSessionState();
  state.loadedSignature = currentSelectionSignature();
  state.loadedSelLoc = appCtx.selLoc === 'custom' ? 'custom' : String(appCtx.selLoc || 'baltimore');
  state.loadedCustomLoc = cloneCustomLoc(readCustomSelection());
  captureCurrentPose();
  return state;
}

function canResumeEarthSession() {
  const state = getEarthSessionState();
  if (!hasLoadedEarthWorld()) return false;
  if (appCtx.worldDetailState?.buildings?.status === 'loading') return false;
  if (!state.loadedSignature) return false;
  if (state.loadedSignature !== currentSelectionSignature()) return false;
  return true;
}

function restoreSelectionFromState() {
  const state = getEarthSessionState();
  if (!state.loadedSignature) {
    return normalizeEarthSelection();
  }
  if (state.loadedSelLoc === 'custom' && state.loadedCustomLoc) {
    appCtx.selLoc = 'custom';
    appCtx.customLoc = cloneCustomLoc(state.loadedCustomLoc);
    appCtx.customLocTransient = false;
    const customLatInput = document.getElementById('customLat');
    const customLonInput = document.getElementById('customLon');
    if (customLatInput) customLatInput.value = state.loadedCustomLoc.lat.toFixed(6);
    if (customLonInput) customLonInput.value = state.loadedCustomLoc.lon.toFixed(6);
    return 'custom';
  }
  return normalizeEarthSelection();
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
      pose?.mode === 'walk' || pose?.mode === 'drone' || pose?.mode === 'boat' ?
        pose.mode :
        'drive';
    const modeOptions = {
      source: 'earth_resume',
      force: true,
      emitTutorial: false
    };
    if (resumeMode === 'boat') {
      modeOptions.spawnX = Number.isFinite(pose?.x) ? pose.x : resolved?.x;
      modeOptions.spawnZ = Number.isFinite(pose?.z) ? pose.z : resolved?.z;
      modeOptions.yaw = Number.isFinite(pose?.angle) ? pose.angle : targetAngle;
      modeOptions.entryMode = 'walk';
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

function finalizeEarthResume(resolved) {
  appCtx.setEarthSceneVisible?.(true);
  if (typeof appCtx.updateTerrainAround === 'function' && appCtx.terrainEnabled && !appCtx.onMoon) {
    const x = Number.isFinite(resolved?.x) ? resolved.x : Number(appCtx.car?.x) || 0;
    const z = Number.isFinite(resolved?.z) ? resolved.z : Number(appCtx.car?.z) || 0;
    appCtx.updateTerrainAround(x, z);
  }
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
  stampLoadedSelection();
}

export function shouldReuseExistingEarthWorld() {
  return REUSE_EXISTING_EARTH_WORLD;
}

export function normalizeEarthSelection() {
  if (appCtx.selLoc === 'custom') {
    const customLoc = readCustomSelection();
    if (customLoc) {
      appCtx.customLoc = customLoc;
      appCtx.customLocTransient = false;
      return 'custom';
    }
  }

  if (!appCtx.LOCS?.[appCtx.selLoc]) {
    appCtx.selLoc = 'baltimore';
  }
  appCtx.customLocTransient = false;
  return String(appCtx.selLoc || 'baltimore');
}

export function captureEarthWorldSession() {
  if (!hasLoadedEarthWorld()) return null;
  normalizeEarthSelection();
  return stampLoadedSelection();
}

export async function reloadEarthWorldSession(options = {}) {
  const transitionDurationMs = Number.isFinite(options.transitionDurationMs) ? options.transitionDurationMs : 700;
  const switchEnv = options.switchEnv !== false;
  const isCurrent = () => {
    if (typeof options.isCurrent === 'function' && !options.isCurrent()) return false;
    return !appCtx.ENV?.EARTH || typeof appCtx.getEnv !== 'function' || appCtx.getEnv() === appCtx.ENV.EARTH;
  };

  if (switchEnv && typeof appCtx.switchEnv === 'function' && appCtx.ENV?.EARTH) {
    appCtx.switchEnv(appCtx.ENV.EARTH);
  }
  appCtx.loadingScreenMode = 'earth';
  normalizeEarthSelection();

  if (typeof appCtx.showTransitionLoad === 'function') {
    await appCtx.showTransitionLoad('earth', transitionDurationMs);
  }
  if (!isCurrent()) return { aborted: true, resumed: false };
  if (typeof appCtx.loadRoads === 'function') {
    await appCtx.loadRoads();
  }
  if (!isCurrent()) return { aborted: true, resumed: false };
  if (typeof appCtx.updateControlsModeUI === 'function') {
    appCtx.updateControlsModeUI();
  }

  stampLoadedSelection();
  return {
    resumed: false,
    selLoc: appCtx.selLoc === 'custom' ? 'custom' : String(appCtx.selLoc || 'baltimore')
  };
}

export async function resumeEarthWorldSession(options = {}) {
  const transitionDurationMs = Number.isFinite(options.transitionDurationMs) ? options.transitionDurationMs : 350;
  const switchEnv = options.switchEnv !== false;
  const isCurrent = () => {
    if (typeof options.isCurrent === 'function' && !options.isCurrent()) return false;
    return !appCtx.ENV?.EARTH || typeof appCtx.getEnv !== 'function' || appCtx.getEnv() === appCtx.ENV.EARTH;
  };

  if (switchEnv && typeof appCtx.switchEnv === 'function' && appCtx.ENV?.EARTH) {
    appCtx.switchEnv(appCtx.ENV.EARTH);
  }
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
  if (typeof appCtx.showTransitionLoad === 'function') {
    await appCtx.showTransitionLoad('earth', transitionDurationMs);
  }
  if (!isCurrent()) return { aborted: true, resumed: false };

  restoreEarthSceneMeshes();
  const resolved = restorePoseFromSession();
  finalizeEarthResume(resolved);

  return {
    resumed: true,
    selLoc: appCtx.selLoc === 'custom' ? 'custom' : String(appCtx.selLoc || 'baltimore')
  };
}
