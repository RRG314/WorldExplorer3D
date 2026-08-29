import { ctx as appCtx } from "./shared-context.js?v=55"; // ============================================================================
import {
  classifyWorldSurfaceProfile,
} from "./surface-rules.js?v=18";
import {
  inferWaterRenderContext
} from "./water-dynamics.js?v=9";
import {
  areRoadsConnected,
  assignFeatureConnections,
  buildFeatureRibbonEdges,
  buildFeatureStations,
  buildFeatureTransitionAnchors,
  classifyStructureSemantics,
  featureTraversalKey,
  isRoadSurfaceReachable,
  sampleFeatureSurfaceY,
  updateFeatureSurfaceProfile
} from "./structure-semantics.js?v=63";
import {
  applyCustomLocationSpawn,
  applyResolvedWorldSpawn,
  applySpawnTarget,
  initWorldSpawning,
  resolveSafeWorldSpawn,
  spawnOnRoad,
  terrainYAtWorld,
  tryAutoEnterBoatAt
} from "./world/spawn.js?v=41";
import {
  buildWorldOverpassPlan,
  fetchOverpassJSON,
  getWorldLoadSignature,
  initWorldOsmLoader,
  invalidateOverpassCaches,
  releaseOverpassRuntimeCache,
  sameLocation
} from "./world/osm-loader.js?v=24";
import {
  clampNumber,
  featureTileKeyForLatLon,
  getAdaptiveLoadProfile,
  getRoadSubdivisionStep,
  getRuntimeDynamicBudget,
  getWorldLodThresholds,
  initWorldBudgets,
  limitNodesByTileBudget,
  limitWaysByTileBudget,
  rdtDepthForFeatureTile,
  wayCenterLatLon
} from "./world/budgets.js?v=16";
import { publishLocationWorld } from "./world/publication.js?v=2";
import {
  buildPoiGeometryPass,
  buildStreetFurniturePass,
  buildWorldDetailPasses,
  createSyntheticFallbackWorld,
  finalizeLoadedWorld,
  recordWorldLoadWarning,
  safeWorldLoadCall
} from "./world/load-support.js?v=37";
import {
  earthSceneSuppressed,
  hideEarthSceneMeshes,
  resetWorldForReload
} from "./world/load-reset.js?v=18";
import {
  prepareWorldFeatureSelections
} from "./world/load-budgeting.js?v=19";
import {
  buildBuildingGeometryGuards,
  buildFeatureGeometryGuards,
  buildLanduseGeometryGuards,
  buildWaterGeometryGuards,
  classifyLanduseType,
  fetchVectorTileWater,
  initWorldLoadGeometry,
  normalizeWorldRingFromLonLat,
  polylineBounds,
  resolveWaterSurfaceVisualProfile,
  vectorTileRangeForBounds,
  waterSurfaceBaseElevation,
  WATER_VECTOR_TILE_ZOOM,
  worldLinePointsFromLonLat
} from "./world/load-geometry.js?v=28";
import {
  decimateRoadCenterlineByDepth,
  getPerfModeValue,
  isDriveableHighwayTag,
  linearFeaturePriority,
  linearFeatureVisualSpec,
  pickBuildingBaseColor,
  pickRoofColor,
  poiKeyFromTags,
  roadTypePriority,
  classifyLinearFeatureTags as classifyLinearFeatureTagsBase
} from "./world/load-style.js?v=3";
import {
  limitNodesByDistance,
  limitWaysByDistance,
  nodeDistanceSq
} from "./world/load-selection.js?v=1";
import { buildRoadGeometryPass } from "./world/load-road-pass.js?v=39";
import { buildBuildingGeometryPass } from "./world/load-building-pass.js?v=55";
import {
  batchLanduseMeshes,
  initWorldRenderSupport,
  registerWaterWaveMaterial
} from "./world/render-support.js?v=15";
import {
  buildingContainingPoint,
  findNearestRoad,
  initWorldNavigation,
  largeMapScreenToWorld,
  minimapScreenToWorld,
  pointInPolygon,
  runtimeRoadFeatures,
  teleportToLocation
} from "./world/navigation.js?v=6";
import {
  buildTraversalNetworks,
  findNearestTraversalFeature,
  findTraversalRoute,
  initWorldTraversal,
  invalidateTraversalNetworks,
  measureRemainingPolylineDistance,
  pickNavigationTargetPoint,
  surfaceDisplayName,
  traversableFeaturesForMode
} from "./world/traversal.js?v=4";
import {
  initWorldVegetation,
  MAX_TREE_NODES,
  MAX_TREE_ROW_WAYS
} from "./world/vegetation.js?v=10";
import {
  appendIndexedGeometry,
  decimatePoints,
  distanceToPolygonEdgeXZ,
  isFiniteWorldPointXZ,
  sanitizeWorldFootprintPoints,
  sanitizeWorldPathPoints,
  signedPolygonAreaXZ
} from "./world/world-geometry.js?v=3";
import { addWaterwayRibbon } from "./world/waterway-ribbon.js?v=32";
import {
  resetWorldFurnitureCaches
} from "./world/furniture.js?v=18";
import {
  addBuildingToSpatialIndex,
  clearBuildingSpatialIndex,
  getNearbyBuildings,
  isSuppressedBaseBuilding,
  isSuppressedBaseRoad
} from "./world/building-spatial-index.js?v=6";
import {
  applyBuildingContextSemanticsToFeature,
  cloneStructureSemantics,
  initWorldStructureAwareness,
  refreshStructureAwareFeatureProfiles,
  refreshStructureAwareFeatureProfilesCooperatively,
  syncLinearFeatureOverlayVisibility,
  worldBaseTerrainY
} from "./world/structure-aware.js?v=50";
import { createWorldRoadLoader } from "./world/load-roads.js?v=182";
import {
  fetchShortbreadBuildingData,
  fetchShortbreadWorldData,
  releaseShortbreadRuntimeCache
} from "./world/shortbread-source.js?v=19";
import { fetchGlobalBuildingData } from "./world/overture-building-source.js?v=14";
import { fetchBundledBuildingMetadata } from "./world/preset-building-metadata.js?v=2";
import { loadLandmarksForPublication } from "./world/landmark-detail.js?v=36";
import { verifyWorldPublicationStable } from "./world/load-runtime-session.js?v=78";
// world.js - OSM data loading, roads, buildings, landuse, POIs
// ============================================================================

const FEATURE_MIN_POLYGON_AREA = 8;
const FEATURE_MIN_HOLE_AREA = 6;
// Publish only drivable transport surfaces. Mapped pedestrian, rail, and cycle
// data remain available from OSM for future validated systems, but they do not
// become visible world geometry or competing traversal surfaces.
const LINEAR_FEATURE_POLICY = Object.freeze({
  footway: false,
  cycleway: false,
  railway: false
});
const ENABLE_LINEAR_FEATURES = Object.values(LINEAR_FEATURE_POLICY).some(Boolean);
appCtx.linearFeaturePolicy = LINEAR_FEATURE_POLICY;
appCtx.linearFeaturePolicyEnabled = ENABLE_LINEAR_FEATURES;

function spawnPlayerForLoadedWorld() {
  const mode = appCtx.Walk?.state?.mode === 'walk' ? 'walk' : 'drive';
  if (appCtx.selLoc === 'custom') {
    return applyCustomLocationSpawn(mode, {
      source: 'published_world_arrival',
      preferBoatIfWater: true
    });
  }
  return spawnOnRoad();
}

const { loadRoads: loadOsmRoads, isVehicleRoad, isInsideWaterArea } = createWorldRoadLoader({
  ENABLE_LINEAR_FEATURES,
  LINEAR_FEATURE_POLICY,
  FEATURE_MIN_HOLE_AREA,
  FEATURE_MIN_POLYGON_AREA,
  WATER_VECTOR_TILE_ZOOM,
  MAX_TREE_NODES,
  MAX_TREE_ROW_WAYS,
  addBuildingToSpatialIndex,
  addWaterwayRibbon,
  appCtx,
  appendIndexedGeometry,
  applyBuildingContextSemanticsToFeature,
  batchLanduseMeshes,
  buildBuildingGeometryGuards,
  buildBuildingGeometryPass,
  buildFeatureGeometryGuards,
  buildFeatureRibbonEdges,
  buildLanduseGeometryGuards,
  buildPoiGeometryPass,
  buildRoadGeometryPass,
  buildWorldDetailPasses,
  loadLandmarksForPublication,
  buildStreetFurniturePass,
  buildTraversalNetworks,
  buildWaterGeometryGuards,
  buildWorldOverpassPlan,
  classifyLanduseType,
  classifyLinearFeatureTagsBase,
  classifyStructureSemantics,
  classifyWorldSurfaceProfile,
  clearBuildingSpatialIndex,
  cloneStructureSemantics,
  createSyntheticFallbackWorld,
  decimatePoints,
  decimateRoadCenterlineByDepth,
  earthSceneSuppressed,
  fetchOverpassJSON,
  fetchGlobalBuildingData,
  fetchBundledBuildingMetadata,
  fetchShortbreadBuildingData,
  fetchShortbreadWorldData,
  featureTileKeyForLatLon,
  fetchVectorTileWater,
  finalizeLoadedWorld,
  getAdaptiveLoadProfile,
  getPerfModeValue,
  getRoadSubdivisionStep,
  getRuntimeDynamicBudget,
  getWorldLoadSignature,
  getWorldLodThresholds,
  hideEarthSceneMeshes,
  inferWaterRenderContext,
  invalidateTraversalNetworks,
  isDriveableHighwayTag,
  limitNodesByTileBudget,
  limitWaysByTileBudget,
  linearFeaturePriority,
  linearFeatureVisualSpec,
  normalizeWorldRingFromLonLat,
  pickBuildingBaseColor,
  poiKeyFromTags,
  pointInPolygon,
  polylineBounds,
  prepareWorldFeatureSelections,
  rdtDepthForFeatureTile,
  recordWorldLoadWarning,
  refreshStructureAwareFeatureProfiles,
  refreshStructureAwareFeatureProfilesCooperatively,
  registerWaterWaveMaterial,
  resetWorldForReload,
  resetWorldFurnitureCaches,
  resolveWaterSurfaceVisualProfile,
  roadTypePriority,
  safeWorldLoadCall,
  sameLocation,
  sanitizeWorldFootprintPoints,
  sanitizeWorldPathPoints,
  signedPolygonAreaXZ,
  spawnPlayer: spawnPlayerForLoadedWorld,
  updateFeatureSurfaceProfile,
  publishLocationWorld,
  vectorTileRangeForBounds,
  waterSurfaceBaseElevation,
  wayCenterLatLon,
  worldBaseTerrainY,
  worldLinePointsFromLonLat
});

async function loadRoads(retryPass = 0) {
  try {
    const result = await loadOsmRoads(retryPass);
    void appCtx.refreshWaterEnvironmentEvidence?.(false);
    return result;
  } finally {
    // Vector-tile decoders and raw provider responses are compilation staging,
    // not part of the fixed playable world. HTTP/IndexedDB remain the reload
    // caches; retaining the decoded source graph here duplicates the compiled
    // roads/buildings and can keep more than a gigabyte alive in dense cities.
    appCtx.worldProviderStagingRelease = Object.freeze({
      shortbread: releaseShortbreadRuntimeCache(),
      overpass: releaseOverpassRuntimeCache(),
      releasedAt: performance.now()
    });
  }
}

async function refreshAuthoritativeMapData() {
  if (appCtx.onMoon || appCtx.onMars || appCtx.spaceFlight?.active) {
    throw new Error('OpenStreetMap refresh is available on Earth.');
  }
  await invalidateOverpassCaches(appCtx.LOC, ['core', 'buildings', 'building-metadata']);
  return loadRoads();
}

function releaseEarthWorldForTitle() {
  const before = Object.freeze({
    roads: Number(appCtx.roads?.length || 0),
    buildings: Number(appCtx.buildings?.length || 0),
    rendererGeometries: Number(appCtx.renderer?.info?.memory?.geometries || 0),
    rendererTextures: Number(appCtx.renderer?.info?.memory?.textures || 0)
  });
  resetWorldForReload({
    beginSceneLoad: false,
    clearBuildingSpatialIndex,
    invalidateTraversalNetworks,
    locName: appCtx.LOC?.name || 'World',
    resetWorldFurnitureCaches,
    showLoading: false
  });
  appCtx.worldSnapshotStore?.clear?.('title_screen_release');
  appCtx.worldPublication = null;
  appCtx.initialEarthWorldReady = false;
  appCtx.worldDetailState = {};
  appCtx.buildingProvenanceRecords = [];
  appCtx.buildingProvenanceFeatureIds = new Set();
  appCtx.buildingProvenanceModel = null;
  appCtx.waterSurfaceRegistry = null;
  appCtx.waterSurfaceRegistrySnapshot = null;
  appCtx.worldLoading = false;
  appCtx.renderer?.renderLists?.dispose?.();
  appCtx.worldProviderStagingRelease = Object.freeze({
    shortbread: releaseShortbreadRuntimeCache(),
    overpass: releaseOverpassRuntimeCache(),
    releasedAt: performance.now(),
    reason: 'title_screen_release'
  });
  const after = Object.freeze({
    roads: Number(appCtx.roads?.length || 0),
    buildings: Number(appCtx.buildings?.length || 0),
    terrainTiles: Number(appCtx.terrainTileCache?.size || 0),
    rendererGeometries: Number(appCtx.renderer?.info?.memory?.geometries || 0),
    rendererTextures: Number(appCtx.renderer?.info?.memory?.textures || 0)
  });
  appCtx.lastEarthWorldRelease = Object.freeze({
    released: true,
    reason: 'title_screen_release',
    before,
    after,
    releasedAt: performance.now()
  });
  return appCtx.lastEarthWorldRelease;
}

initWorldSpawning({
  buildingContainingPoint,
  findNearestRoad,
  isInsideWaterArea,
  isVehicleRoad,
  sampleFeatureSurfaceY,
  traversableFeaturesForMode
});
initWorldOsmLoader({
  getPerfModeValue
});
initWorldNavigation({
  applySpawnTarget,
  areRoadsConnected,
  isSuppressedBaseRoad,
  sampleFeatureSurfaceY,
  tryAutoEnterBoatAt
});
let editableWorldRuntimePromise = null;
appCtx.ensureEditableWorldRuntime = () => {
  if (typeof appCtx.getSuppressedEditableBuildingIds === 'function') return Promise.resolve(true);
  editableWorldRuntimePromise ||= import('./editable-world/runtime.js?v=2')
    .then(({ initEditableWorldRuntime }) => {
      initEditableWorldRuntime(appCtx);
      return true;
    })
    .catch((error) => {
      editableWorldRuntimePromise = null;
      throw error;
    });
  return editableWorldRuntimePromise;
};
initWorldBudgets({
  getPerfModeValue,
  limitNodesByDistance,
  limitWaysByDistance,
  nodeDistanceSq
});
initWorldStructureAwareness({
  enableLinearFeatures: () => ENABLE_LINEAR_FEATURES,
  getNearbyBuildings,
  pointInPolygon
});
initWorldTraversal({
  enableLinearFeatures: () => ENABLE_LINEAR_FEATURES,
  featureTraversalKey,
  isFiniteWorldPointXZ,
  isVehicleRoad,
  runtimeRoadFeatures
});
initWorldVegetation({
  findNearestRoad,
  getNearbyBuildings,
  isRoadSurfaceReachable,
  pointInPolygon,
  sanitizeWorldPathPoints,
  signedPolygonAreaXZ
});
initWorldRenderSupport({
  distanceToPolygonEdgeXZ,
  pickRoofColor,
  pointInPolygon,
  signedPolygonAreaXZ
});
initWorldLoadGeometry({
  clampNumber,
  decimatePoints,
  featureMinPolygonArea: FEATURE_MIN_POLYGON_AREA,
  sanitizeWorldFootprintPoints,
  sanitizeWorldPathPoints
});

Object.assign(appCtx, {
  areRoadsConnected,
  applyCustomLocationSpawn,
  applyResolvedWorldSpawn,
  applySpawnTarget,
  buildTraversalNetworks,
  fetchOverpassJSON,
  findNearestRoad,
  findNearestTraversalFeature,
  findTraversalRoute,
  getNearbyBuildings,
  invalidateTraversalNetworks,
  largeMapScreenToWorld,
  loadRoads,
  measureRemainingPolylineDistance,
  minimapScreenToWorld,
  pickNavigationTargetPoint,
  pointInPolygon,
  registerWaterWaveMaterial,
  refreshStructureAwareFeatureProfiles,
  refreshStructureAwareFeatureProfilesCooperatively,
  refreshAuthoritativeMapData,
  releaseEarthWorldForTitle,
  resolveSafeWorldSpawn,
  sampleFeatureSurfaceY,
  syncLinearFeatureOverlayVisibility,
  surfaceDisplayName,
  spawnOnRoad,
  terrainYAtWorld,
  teleportToLocation,
  publishLocationWorld,
  verifyWorldPublicationStable: () =>
    verifyWorldPublicationStable(appCtx, appCtx.worldPublication)
});

export {
  applyCustomLocationSpawn,
  applyResolvedWorldSpawn,
  applySpawnTarget,
  buildTraversalNetworks,
  fetchOverpassJSON,
  findNearestRoad,
  findNearestTraversalFeature,
  findTraversalRoute,
  getNearbyBuildings,
  invalidateTraversalNetworks,
  largeMapScreenToWorld,
  loadRoads,
  measureRemainingPolylineDistance,
  minimapScreenToWorld,
  pickNavigationTargetPoint,
  pointInPolygon,
  registerWaterWaveMaterial,
  refreshStructureAwareFeatureProfiles,
  refreshStructureAwareFeatureProfilesCooperatively,
  refreshAuthoritativeMapData,
  resolveSafeWorldSpawn,
  sampleFeatureSurfaceY,
  syncLinearFeatureOverlayVisibility,
  surfaceDisplayName,
  spawnOnRoad,
  terrainYAtWorld,
  teleportToLocation,
  publishLocationWorld };
