import { ctx as appCtx } from '../shared-context.js?v=55';
import { clearBuildingSpatialIndex } from './building-spatial-index.js?v=5';
import { resetWorldFurnitureCaches } from './furniture.js?v=10';
import { earthSceneSuppressed, hideEarthSceneMeshes, resetWorldForReload } from './load-reset.js?v=8';
import { finalizeLoadedWorld } from './load-support.js?v=17';

let activeLoad = null;

function selectedLocation() {
  if (appCtx.selLoc === 'custom') {
    const latInput = document.getElementById('customLat');
    const lonInput = document.getElementById('customLon');
    const lat = Number.parseFloat(latInput?.value ?? appCtx.customLoc?.lat);
    const lon = Number.parseFloat(lonInput?.value ?? appCtx.customLoc?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('Enter valid coordinates.');
    return { lat, lon, name: appCtx.customLoc?.name || 'Custom' };
  }
  const preset = appCtx.LOCS?.[appCtx.selLoc] || appCtx.LOCS?.baltimore;
  if (!preset) throw new Error('The selected Earth location is unavailable.');
  return { lat: Number(preset.lat), lon: Number(preset.lon), name: preset.name || String(appCtx.selLoc) };
}

function resetActors() {
  Object.assign(appCtx.car, { x: 0, z: 0, vx: 0, vz: 0, vy: 0 });
  if (appCtx.drone) Object.assign(appCtx.drone, { x: 0, z: 0 });
  const walker = appCtx.Walk?.state?.walker;
  if (walker) Object.assign(walker, { x: 0, z: 0, vx: 0, vz: 0, vy: 0 });
}

function loadSignature(location) {
  return `${location.lat.toFixed(7)}:${location.lon.toFixed(7)}`;
}

async function loadContinuousEarthWorldInternal(location) {
  const loadSequence = appCtx._worldLoadSequence = (appCtx._worldLoadSequence || 0) + 1;
  const isCurrent = () =>
    appCtx._worldLoadSequence === loadSequence &&
    appCtx.getContinuousWorldEnabled?.() === true &&
    !earthSceneSuppressed();

  appCtx.LOC = { lat: location.lat, lon: location.lon };
  if (appCtx.selLoc === 'custom') {
    appCtx.setCustomLocation?.(location, { syncInputs: false });
  }
  resetWorldForReload({
    clearBuildingSpatialIndex,
    invalidateTraversalNetworks: appCtx.invalidateTraversalNetworks,
    locName: location.name,
    resetWorldFurnitureCaches
  });
  resetActors();
  appCtx.initialEarthWorldRetired = true;
  appCtx.initialEarthDetailRadius = 0;
  appCtx.setPerfLiveStat?.('initialWorldRetired', true);
  appCtx.setPerfLiveStat?.('earthWorldSourceProfile', 'continuous_global');

  if (appCtx.terrainEnabled && !appCtx.onMoon) {
    appCtx.resetTerrainStreamingState?.();
    appCtx.clearTerrainMeshes?.();
    appCtx.updateTerrainAround?.(0, 0);
  }

  try {
    const snapshot = await appCtx.primeContinuousEarthNeighborhood?.({
      isCurrent,
      layerName: 'global-vector',
      minLoadedTiles: 9,
      timeoutMs: 120000
    });
    if (!snapshot) throw new Error('The continuous Earth scheduler is unavailable.');
    if (!isCurrent()) return { aborted: true };

    appCtx.worldLoading = false;
    appCtx.initialEarthWorldReady = true;
    finalizeLoadedWorld({
      buildTraversalNetworks: appCtx.buildTraversalNetworks,
      earthSceneSuppressed,
      hideEarthSceneMeshes,
      loadMetrics: { mode: 'continuous', location: location.name, warnings: [] },
      markLoaded: () => {},
      reason: 'continuous_global',
      spawnOnRoad: appCtx.spawnOnRoad,
      updateWorldLod: appCtx.updateWorldLod
    });
    appCtx.enforceEnvironmentSceneOwnership?.();
    appCtx.setPerfLiveStat?.('worldCounts', {
      roads: appCtx.roads.length,
      buildings: appCtx.buildingMeshes.length,
      poiMeshes: appCtx.poiMeshes.length,
      landuseMeshes: appCtx.landuseMeshes.length
    });
    return { loaded: true, profile: 'continuous_global', snapshot };
  } catch (error) {
    if (error?.name === 'AbortError') return { aborted: true };
    appCtx.worldLoading = false;
    appCtx.initialEarthWorldReady = false;
    appCtx.hideLoad?.();
    throw error;
  }
}

export async function loadContinuousEarthWorld() {
  if (appCtx.boatMode?.active && typeof appCtx.stopBoatMode === 'function') {
    appCtx.stopBoatMode({ targetMode: 'walk' });
  }
  const location = selectedLocation();
  const signature = loadSignature(location);
  if (activeLoad?.signature === signature) return activeLoad.promise;
  const promise = loadContinuousEarthWorldInternal(location).finally(() => {
    if (activeLoad?.promise === promise) activeLoad = null;
  });
  activeLoad = { promise, signature };
  return promise;
}

Object.assign(appCtx, { loadContinuousEarthWorld });
