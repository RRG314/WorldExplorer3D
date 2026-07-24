import { ctx as appCtx } from "./shared-context.js?v=55";
import { addBuildingToSpatialIndex, clearBuildingSpatialIndex } from "./world/building-spatial-index.js?v=7";

const REBASE_DISTANCE_WORLD = 24000;
const REBASE_COOLDOWN_MS = 2500;

let lastRebaseAt = 0;

function shiftPoint(point, offsetX, offsetZ) {
  if (!point) return;
  if (Number.isFinite(point.x)) point.x -= offsetX;
  if (Number.isFinite(point.z)) point.z -= offsetZ;
}

function shiftBounds(bounds, offsetX, offsetZ) {
  if (!bounds) return;
  if (Number.isFinite(bounds.minX)) bounds.minX -= offsetX;
  if (Number.isFinite(bounds.maxX)) bounds.maxX -= offsetX;
  if (Number.isFinite(bounds.minZ)) bounds.minZ -= offsetZ;
  if (Number.isFinite(bounds.maxZ)) bounds.maxZ -= offsetZ;
}

function shiftFeature(feature, offsetX, offsetZ) {
  if (!feature) return;
  feature.pts?.forEach?.((point) => shiftPoint(point, offsetX, offsetZ));
  feature.points?.forEach?.((point) => shiftPoint(point, offsetX, offsetZ));
  feature.leftEdge?.forEach?.((point) => shiftPoint(point, offsetX, offsetZ));
  feature.rightEdge?.forEach?.((point) => shiftPoint(point, offsetX, offsetZ));
  shiftBounds(feature.bounds, offsetX, offsetZ);
  if (Number.isFinite(feature.x)) feature.x -= offsetX;
  if (Number.isFinite(feature.z)) feature.z -= offsetZ;
  if (Number.isFinite(feature.centerX)) feature.centerX -= offsetX;
  if (Number.isFinite(feature.centerZ)) feature.centerZ -= offsetZ;
  if (Number.isFinite(feature.minX)) feature.minX -= offsetX;
  if (Number.isFinite(feature.maxX)) feature.maxX -= offsetX;
  if (Number.isFinite(feature.minZ)) feature.minZ -= offsetZ;
  if (Number.isFinite(feature.maxZ)) feature.maxZ -= offsetZ;
}

function shiftFeatureList(name, offsetX, offsetZ) {
  const list = appCtx[name];
  if (!Array.isArray(list)) return;
  list.forEach((feature) => shiftFeature(feature, offsetX, offsetZ));
}

function shiftMeshLists(offsetX, offsetZ) {
  const meshes = new Set();
  [
    'roadMeshes',
    'buildingMeshes',
    'landuseMeshes',
    'urbanSurfaceMeshes',
    'linearFeatureMeshes',
    'structureVisualMeshes',
    'poiMeshes',
    'historicMarkers',
    'streetFurnitureMeshes',
    'vegetationMeshes'
  ].forEach((name) => appCtx[name]?.forEach?.((mesh) => meshes.add(mesh)));
  meshes.forEach((mesh) => {
    if (!mesh?.position) return;
    mesh.position.x -= offsetX;
    mesh.position.z -= offsetZ;
  });
}

function shiftActors(offsetX, offsetZ) {
  [appCtx.car, appCtx.drone, appCtx.boat, appCtx.planeMode, appCtx.Walk?.state?.walker].forEach((actor) => {
    if (!actor) return;
    if (Number.isFinite(actor.x)) actor.x -= offsetX;
    if (Number.isFinite(actor.z)) actor.z -= offsetZ;
  });
  if (appCtx.camera?.position) {
    appCtx.camera.position.x -= offsetX;
    appCtx.camera.position.z -= offsetZ;
  }
  if (appCtx.earthPosition) shiftPoint(appCtx.earthPosition, offsetX, offsetZ);
  if (appCtx.earthSessionState?.pose) shiftPoint(appCtx.earthSessionState.pose, offsetX, offsetZ);
  if (appCtx.navigationMarker?.position) {
    appCtx.navigationMarker.position.x -= offsetX;
    appCtx.navigationMarker.position.z -= offsetZ;
  }
  appCtx.navigationRoutePoints?.forEach?.((point) => shiftPoint(point, offsetX, offsetZ));
  appCtx.customTrack?.forEach?.((point) => shiftPoint(point, offsetX, offsetZ));
}

function rebuildBuildingIndex() {
  clearBuildingSpatialIndex();
  appCtx.buildings?.forEach?.(addBuildingToSpatialIndex);
}

function rebaseEarthOrigin(actor) {
  if (!actor || typeof appCtx.worldToLatLon !== 'function') return false;
  const offsetX = Number(actor.x);
  const offsetZ = Number(actor.z);
  if (!Number.isFinite(offsetX) || !Number.isFinite(offsetZ)) return false;
  const geo = appCtx.worldToLatLon(offsetX, offsetZ);
  if (!Number.isFinite(geo?.lat) || !Number.isFinite(geo?.lon)) return false;

  appCtx.clearActiveInterior?.({ restorePlayer: false, preserveCache: true });
  appCtx.clearBlockBuilderForWorldReload?.();
  appCtx.clearMemoryMarkersForWorldReload?.();

  shiftMeshLists(offsetX, offsetZ);
  [
    'roads',
    'buildings',
    'landuses',
    'surfaceFeatureHints',
    'waterAreas',
    'waterways',
    'linearFeatures',
    'pois',
    'historicSites',
    'vegetationFeatures',
    'dynamicBuildingColliders',
    'overlayRuntimeBuildingColliders'
  ].forEach((name) => shiftFeatureList(name, offsetX, offsetZ));
  shiftActors(offsetX, offsetZ);

  appCtx.LOC = { lat: geo.lat, lon: geo.lon };
  if (appCtx.earthSessionState) {
    appCtx.earthSessionState.worldAnchor = { lat: geo.lat, lon: geo.lon };
  }
  rebuildBuildingIndex();
  appCtx.invalidateRoadCache?.();
  appCtx.invalidateTraversalNetworks?.('earth_origin_rebased');
  appCtx.clearTerrainMeshes?.();
  appCtx.resetTerrainStreamingState?.();
  appCtx.updateTerrainAround?.(0, 0);
  appCtx.acceptEarthStreamingAnchorRebase?.();

  appCtx.refreshBlockBuilderForCurrentLocation?.();
  appCtx.refreshMemoryMarkersForCurrentLocation?.();
  appCtx.refreshBoatAvailability?.(true);
  appCtx.refreshAstronomicalSky?.(true);
  void appCtx.refreshLiveWeather?.(true);
  globalThis.dispatchEvent?.(new CustomEvent('we3d:earth-origin-rebased', {
    detail: { lat: geo.lat, lon: geo.lon, offsetX, offsetZ }
  }));

  lastRebaseAt = performance.now();
  appCtx.earthOriginRebaseCount = (appCtx.earthOriginRebaseCount || 0) + 1;
  appCtx.setPerfLiveStat?.('earthOrigin', {
    lat: geo.lat,
    lon: geo.lon,
    rebases: appCtx.earthOriginRebaseCount
  });
  return true;
}

function maybeRebaseEarthOrigin(actor, snapshot) {
  if (!appCtx.initialEarthWorldRetired || !actor) return false;
  if (performance.now() - lastRebaseAt < REBASE_COOLDOWN_MS) return false;
  if (Math.hypot(Number(actor.x) || 0, Number(actor.z) || 0) < REBASE_DISTANCE_WORLD) return false;
  const vectorLayer = snapshot?.layers?.['global-vector'];
  if (
    vectorLayer?.centerLoaded !== true ||
    Number(vectorLayer?.loadedNearCenter || 0) < 6 ||
    Number(vectorLayer?.pending || 0) > 2
  ) return false;
  return rebaseEarthOrigin(actor);
}

Object.assign(appCtx, {
  maybeRebaseEarthOrigin,
  rebaseEarthOrigin
});

export { maybeRebaseEarthOrigin, rebaseEarthOrigin };
