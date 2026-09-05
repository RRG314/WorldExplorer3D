import { ctx as appCtx } from "../shared-context.js?v=55";
import { clearBuildingExteriorMaterialPool } from "../engine/building-facade-materials.js?v=15";

const MATERIAL_TEXTURE_KEYS = Object.freeze([
  'map', 'alphaMap', 'aoMap', 'bumpMap', 'displacementMap', 'emissiveMap',
  'envMap', 'lightMap', 'metalnessMap', 'normalMap', 'roughnessMap', 'specularMap'
]);

function disposeOwnedMaterialTextures(material) {
  if (!material) return;
  MATERIAL_TEXTURE_KEYS.forEach((key) => {
    const texture = material[key];
    if (!texture || texture.userData?.sharedRuntimeTexture === true) return;
    texture.dispose?.();
  });
}

function disposeSceneMeshes(meshes, options = {}) {
  if (!Array.isArray(meshes)) return;
  const skipSharedUrbanSurfaceMaterial = options.skipSharedUrbanSurfaceMaterial === true;
  meshes.forEach((mesh) => {
    if (!mesh) return;
    if (typeof mesh.removeFromParent === 'function') mesh.removeFromParent();
    else mesh.parent?.remove?.(mesh);
    mesh.traverse?.((object) => {
      object.geometry?.dispose?.();
      if (!object.material) return;
      if (skipSharedUrbanSurfaceMaterial && object.userData?.sharedUrbanSurfaceMaterial) return;
      if (Array.isArray(object.material)) {
        object.material.forEach((material) => {
          disposeOwnedMaterialTextures(material);
          material?.dispose?.();
        });
      } else {
        disposeOwnedMaterialTextures(object.material);
        object.material.dispose?.();
      }
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
      if (mesh.parent === appCtx.scene) mesh.parent.remove(mesh);
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

  appCtx.disposeLivingWorldRuntime?.('world_reload');
  appCtx.buildingEntranceCatalog = null;
  appCtx.buildingEntranceByBuilding = null;
  appCtx.buildingFacadeEntrances = null;
  appCtx.disposeWorldDiscoveryRuntime?.('world_reload');
  appCtx.closeArExperience?.('world_reload');
  appCtx.disposeEditableWorldPresentation?.();
  appCtx.disposeUrbanSandboxRuntime?.('world_reload');
  appCtx.disposeAviationRuntime?.('world_reload');
  appCtx.disposeMaritimeRuntime?.('world_reload');
  appCtx.transportFacilityVisual?.dispose?.();
  appCtx.transportFacilityVisual = null;
  appCtx.transportFacilityGraph = null;

  if (typeof appCtx.resetEarthStreaming !== 'function') {
    throw new Error('Earth streaming lifecycle owner is unavailable during world reset.');
  }
  appCtx.resetEarthStreaming(options.reason || 'full_world_reload');
  appCtx.initialEarthDetailRadius = 0;
  appCtx.plannedEarthDetailRadiusWorld = 0;
  appCtx.fixedRegionalContextBounds = null;
  appCtx.fixedRegionalContextRadiusWorld = 0;
  appCtx.fixedRegionalStructureWaterAreas = [];

  if (options.showLoading !== false) appCtx.showLoad(`Loading ${locName}...`);
  appCtx.worldLoading = true;
  if (options.beginSceneLoad !== false) appCtx.beginEarthWorldSceneLoad?.(options.loadSequence);
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
  appCtx.clearWorldCollections(['roadMeshes', 'roads']);
  // A publication belongs to exactly one world-load sequence. Clearing it here
  // prevents the next feature compilation pass from appearing authoritative
  // before final terrain-aligned meshes have been created.
  appCtx.transportSurfacePublication = null;
  if (appCtx.car) {
    appCtx.car.road = null;
    appCtx.car.onRoad = false;
    appCtx.car._lastSurfaceY = null;
  }

  if (typeof appCtx.clearStructureVisualMeshes === 'function') {
    appCtx.clearStructureVisualMeshes();
  } else {
    appCtx.replaceWorldCollection('structureVisualMeshes');
  }

  disposeSceneMeshes(appCtx.urbanSurfaceMeshes, { skipSharedUrbanSurfaceMaterial: true });
  appCtx.replaceWorldCollection('urbanSurfaceMeshes');
  invalidateTraversalNetworks('world_reload_reset');
  appCtx.navigationRoutePoints = [];
  appCtx.navigationRouteDistance = 0;

  disposeSceneMeshes(appCtx.buildingMeshes);
  appCtx.clearWorldCollections(['buildingMeshes', 'buildings', 'dynamicBuildingColliders']);
  // Exterior materials and atlases are world-publication resources. Keeping
  // disposed materials in these pools makes the renderer allocate another GPU
  // texture set on every location rebuild while the old set remains counted.
  clearBuildingExteriorMaterialPool();
  clearBuildingSpatialIndex();

  disposeSceneMeshes(appCtx.landuseMeshes);
  appCtx.clearWorldCollections([
    'landuseMeshes',
    'landuses',
    'surfaceFeatureHints',
    'waterAreas',
    'waterways',
    'waterWaveVisuals'
  ]);
  if (typeof appCtx.setWorldSurfaceProfile === 'function') {
    appCtx.setWorldSurfaceProfile(null);
  } else {
    appCtx.worldSurfaceProfile = null;
  }
  appCtx.worldTraversalRadiusWorld = null;

  disposeSceneMeshes(appCtx.linearFeatureMeshes);
  appCtx.clearWorldCollections(['linearFeatureMeshes', 'linearFeatures']);

  disposeSceneMeshes(appCtx.poiMeshes);
  appCtx.clearWorldCollections(['poiMeshes', 'pois']);

  disposeSceneMeshes(appCtx.historicMarkers);
  appCtx.clearWorldCollections(['historicMarkers', 'historicSites']);
  appCtx.curatedLandmarkMetrics = null;
  appCtx.mappedLandmarkMetrics = null;
  appCtx.deferredTransportLandmarkPublishers = [];
  appCtx.pendingPublishedTransportSurfaceControls = [];
  appCtx.publishedTransportSurfaceControlApplication = null;

  disposeSceneMeshes(appCtx.streetFurnitureMeshes);
  appCtx.replaceWorldCollection('streetFurnitureMeshes');

  disposeSceneMeshes(appCtx.vegetationMeshes);
  appCtx.clearWorldCollections(['vegetationMeshes', 'vegetationFeatures']);
  appCtx.osmTreeNodes = [];
  appCtx.osmTreeRows = [];
  appCtx._worldLoadNodes = null;

  // The scene root is the authoritative owner. This removes any deferred or
  // previously batched world objects that are no longer reachable from a list.
  appCtx.clearEarthWorldSceneObjects?.();

  resetWorldFurnitureCaches();
  if (typeof appCtx.invalidateRoadCache === 'function') appCtx.invalidateRoadCache();
  appCtx.renderer?.renderLists?.dispose?.();

}
