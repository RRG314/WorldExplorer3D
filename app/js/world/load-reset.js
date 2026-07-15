import { ctx as appCtx } from "../shared-context.js?v=55";

function disposeSceneMeshes(meshes, options = {}) {
  if (!Array.isArray(meshes)) return;
  const skipSharedUrbanSurfaceMaterial = options.skipSharedUrbanSurfaceMaterial === true;
  meshes.forEach((mesh) => {
    if (!mesh) return;
    appCtx.scene.remove(mesh);
    mesh.traverse?.((object) => {
      object.geometry?.dispose?.();
      if (!object.material) return;
      if (skipSharedUrbanSurfaceMaterial && object.userData?.sharedUrbanSurfaceMaterial) return;
      if (Array.isArray(object.material)) object.material.forEach((material) => material?.dispose?.());
      else object.material.dispose?.();
    });
  });
}

export function earthSceneSuppressed() {
  if (appCtx.onMoon || appCtx.travelingToMoon) return true;
  if (typeof appCtx.isEnv === 'function' && appCtx.ENV) {
    return !appCtx.isEnv(appCtx.ENV.EARTH);
  }
  return false;
}

export function hideEarthSceneMeshes() {
  const hideList = (arr) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((mesh) => {
      if (!mesh) return;
      mesh.visible = false;
      if (mesh.parent === appCtx.scene) appCtx.scene.remove(mesh);
    });
  };
  hideList(appCtx.roadMeshes);
  hideList(appCtx.urbanSurfaceMeshes);
  hideList(appCtx.structureVisualMeshes);
  hideList(appCtx.buildingMeshes);
  hideList(appCtx.landuseMeshes);
  hideList(appCtx.poiMeshes);
  hideList(appCtx.historicMarkers);
  hideList(appCtx.streetFurnitureMeshes);
  hideList(appCtx.vegetationMeshes);
}

export function resetWorldForReload(options = {}) {
  const locName = options.locName || 'World';
  const invalidateTraversalNetworks = typeof options.invalidateTraversalNetworks === 'function' ? options.invalidateTraversalNetworks : () => {};
  const clearBuildingSpatialIndex = typeof options.clearBuildingSpatialIndex === 'function' ? options.clearBuildingSpatialIndex : () => {};
  const resetWorldFurnitureCaches = typeof options.resetWorldFurnitureCaches === 'function' ? options.resetWorldFurnitureCaches : () => {};

  if (typeof appCtx.resetEarthStreaming === 'function') {
    appCtx.resetEarthStreaming('full_world_reload');
  }
  appCtx.initialEarthWorldRetired = false;
  appCtx.initialEarthDetailRadius = 0;

  appCtx.showLoad(`Loading ${locName}...`);
  appCtx.worldLoading = true;
  appCtx.urbanSurfaceStats = {
    sidewalkBatchCount: 0,
    sidewalkVertices: 0,
    sidewalkTriangles: 0,
    skippedBuildingAprons: 0
  };
  if (typeof appCtx.clearMemoryMarkersForWorldReload === 'function') {
    appCtx.clearMemoryMarkersForWorldReload();
  }
  if (typeof appCtx.clearBlockBuilderForWorldReload === 'function') {
    appCtx.clearBlockBuilderForWorldReload();
  }
  if (typeof appCtx.clearActiveInterior === 'function') {
    appCtx.clearActiveInterior({ restorePlayer: false, preserveCache: true });
  }

  disposeSceneMeshes(appCtx.roadMeshes);
  appCtx.roadMeshes = [];
  appCtx.roads = [];

  if (typeof appCtx.clearStructureVisualMeshes === 'function') {
    appCtx.clearStructureVisualMeshes();
  } else {
    appCtx.structureVisualMeshes = [];
  }

  disposeSceneMeshes(appCtx.urbanSurfaceMeshes, { skipSharedUrbanSurfaceMaterial: true });
  appCtx.urbanSurfaceMeshes = [];
  invalidateTraversalNetworks('world_reload_reset');
  appCtx.navigationRoutePoints = [];
  appCtx.navigationRouteDistance = 0;

  disposeSceneMeshes(appCtx.buildingMeshes);
  appCtx.buildingMeshes = [];
  appCtx.buildings = [];
  appCtx.dynamicBuildingColliders = [];
  clearBuildingSpatialIndex();

  disposeSceneMeshes(appCtx.landuseMeshes);
  appCtx.landuseMeshes = [];
  appCtx.landuses = [];
  appCtx.surfaceFeatureHints = [];
  appCtx.waterAreas = [];
  appCtx.waterways = [];
  appCtx.waterWaveVisuals = [];
  if (typeof appCtx.setWorldSurfaceProfile === 'function') {
    appCtx.setWorldSurfaceProfile(null);
  } else {
    appCtx.worldSurfaceProfile = null;
  }

  disposeSceneMeshes(appCtx.linearFeatureMeshes);
  appCtx.linearFeatureMeshes = [];
  appCtx.linearFeatures = [];

  disposeSceneMeshes(appCtx.poiMeshes);
  appCtx.poiMeshes = [];
  appCtx.pois = [];

  disposeSceneMeshes(appCtx.historicMarkers);
  appCtx.historicMarkers = [];
  appCtx.historicSites = [];
  appCtx.curatedLandmarkMetrics = null;

  disposeSceneMeshes(appCtx.streetFurnitureMeshes);
  appCtx.streetFurnitureMeshes = [];

  disposeSceneMeshes(appCtx.vegetationMeshes);
  appCtx.vegetationMeshes = [];
  appCtx.vegetationFeatures = [];
  appCtx.osmTreeNodes = [];
  appCtx.osmTreeRows = [];
  appCtx._worldLoadNodes = null;

  resetWorldFurnitureCaches();
  if (typeof appCtx.clearWindowTextureCache === 'function') {
    appCtx.clearWindowTextureCache();
  } else {
    appCtx.windowTextures = {};
  }
  if (typeof appCtx.invalidateRoadCache === 'function') appCtx.invalidateRoadCache();

  appCtx.roadsNeedRebuild = true;
}
