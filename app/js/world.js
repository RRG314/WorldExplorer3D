import { ctx as appCtx } from "./shared-context.js?v=55"; // ============================================================================
import {
  classifyWorldSurfaceProfile,
} from "./surface-rules.js?v=17";
import {
  inferWaterRenderContext
} from "./water-dynamics.js?v=4";
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
} from "./structure-semantics.js?v=16";
import {
  applyCustomLocationSpawn,
  applyResolvedWorldSpawn,
  applySpawnTarget,
  initWorldSpawning,
  resolveSafeWorldSpawn,
  spawnOnRoad,
  terrainYAtWorld,
  tryAutoEnterBoatAt
} from "./world/spawn.js?v=19";
import {
  scheduleDeferredStructureRefresh,
  scheduleDeferredWorldLinearFeatureLoad
} from "./world/linear-features.js?v=2";
import {
  buildWorldOverpassPlan,
  fetchOverpassJSON,
  getWorldLoadSignature,
  initWorldOsmLoader,
  invalidateOverpassCaches,
  sameLocation
} from "./world/osm-loader.js?v=12";
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
} from "./world/budgets.js?v=6";
import {
  initWorldLod,
  updateWorldLod
} from "./world/lod.js?v=12";
import {
  buildPoiGeometryPass,
  buildStreetFurniturePass,
  createSyntheticFallbackWorld,
  finalizeLoadedWorld,
  recordWorldLoadWarning,
  scheduleDeferredPoiLoad,
  scheduleDeferredWorldDetailPasses,
  safeWorldLoadCall
} from "./world/load-support.js?v=17";
import {
  earthSceneSuppressed,
  hideEarthSceneMeshes,
  resetWorldForReload
} from "./world/load-reset.js?v=8";
import {
  prepareWorldFeatureSelections
} from "./world/load-budgeting.js?v=3";
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
} from "./world/load-geometry.js?v=16";
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
import { buildRoadGeometryPass } from "./world/load-road-pass.js?v=10";
import { buildBuildingGeometryPass } from "./world/load-building-pass.js?v=20";
import {
  batchLanduseMeshes,
  initWorldRenderSupport,
  registerWaterWaveMaterial
} from "./world/render-support.js?v=5";
import {
  buildingContainingPoint,
  findNearestRoad,
  initWorldNavigation,
  largeMapScreenToWorld,
  minimapScreenToWorld,
  pointInPolygon,
  runtimeRoadFeatures,
  teleportToLocation
} from "./world/navigation.js?v=2";
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
} from "./world/traversal.js?v=1";
import {
  initWorldVegetation,
  MAX_TREE_NODES,
  MAX_TREE_ROW_WAYS
} from "./world/vegetation.js?v=6";
import {
  appendIndexedGeometry,
  decimatePoints,
  distanceToPolygonEdgeXZ,
  isFiniteWorldPointXZ,
  sanitizeWorldFootprintPoints,
  sanitizeWorldPathPoints,
  signedPolygonAreaXZ
} from "./world/world-geometry.js?v=2";
import { addWaterwayRibbon } from "./world/waterway-ribbon.js?v=15";
import {
  resetWorldFurnitureCaches
} from "./world/furniture.js?v=10";
import {
  addBuildingToSpatialIndex,
  clearBuildingSpatialIndex,
  getNearbyBuildings,
  isSuppressedBaseBuilding,
  isSuppressedBaseRoad
} from "./world/building-spatial-index.js?v=5";
import {
  applyBuildingContextSemanticsToFeature,
  cloneStructureSemantics,
  initWorldStructureAwareness,
  refreshStructureAwareFeatureProfiles,
  syncLinearFeatureOverlayVisibility,
  worldBaseTerrainY
} from "./world/structure-aware.js?v=5";
import { createWorldRoadLoader } from "./world/load-roads.js?v=53";
import {
  fetchShortbreadWorldData
} from "./world/shortbread-source.js?v=8";
import { fetchGlobalBuildingData } from "./world/overture-building-source.js?v=6";
import { fetchBundledBuildingMetadata } from "./world/preset-building-metadata.js?v=1";
import { scheduleDeferredLandmarkLoad } from "./world/landmark-detail.js?v=22";
// world.js - OSM data loading, roads, buildings, landuse, POIs
// ============================================================================

const FEATURE_MIN_POLYGON_AREA = 8;
const FEATURE_MIN_HOLE_AREA = 6;
// Mapped pedestrian surfaces are terrain-draped. Rail and cycle overlays remain
// disabled until they have dedicated intersection and rendering ownership.
const LINEAR_FEATURE_POLICY = Object.freeze({
  footway: true,
  cycleway: false,
  railway: false
});
const ENABLE_LINEAR_FEATURES = Object.values(LINEAR_FEATURE_POLICY).some(Boolean);
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
  scheduleDeferredPoiLoad,
  scheduleDeferredLandmarkLoad,
  scheduleDeferredWorldDetailPasses,
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
  registerWaterWaveMaterial,
  resetWorldForReload,
  resetWorldFurnitureCaches,
  resolveWaterSurfaceVisualProfile,
  roadTypePriority,
  safeWorldLoadCall,
  sameLocation,
  sanitizeWorldFootprintPoints,
  sanitizeWorldPathPoints,
  scheduleDeferredStructureRefresh,
  scheduleDeferredWorldLinearFeatureLoad,
  signedPolygonAreaXZ,
  spawnOnRoad,
  syncLinearFeatureOverlayVisibility,
  updateFeatureSurfaceProfile,
  updateWorldLod,
  vectorTileRangeForBounds,
  waterSurfaceBaseElevation,
  wayCenterLatLon,
  worldBaseTerrainY,
  worldLinePointsFromLonLat
});

async function loadRoads(retryPass = 0) {
  if (retryPass === 0 && appCtx.getContinuousWorldEnabled?.() === true) {
    if (typeof appCtx.loadContinuousEarthWorld !== 'function') {
      throw new Error('Continuous Earth loader is not registered.');
    }
    return appCtx.loadContinuousEarthWorld();
  }
  return loadOsmRoads(retryPass);
}

async function refreshAuthoritativeMapData() {
  if (appCtx.onMoon || appCtx.onMars || appCtx.spaceFlight?.active) {
    throw new Error('OpenStreetMap refresh is available on Earth.');
  }
  if (appCtx.getContinuousWorldEnabled?.() === true) {
    throw new Error('OpenStreetMap refresh is available in Quality Location mode.');
  }
  await invalidateOverpassCaches(appCtx.LOC, ['core', 'buildings', 'building-metadata']);
  return loadRoads();
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
initWorldBudgets({
  getPerfModeValue,
  limitNodesByDistance,
  limitWaysByDistance,
  nodeDistanceSq
});
initWorldLod({
  getPerfModeValue,
  getRuntimeDynamicBudget,
  getWorldLodThresholds
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
  refreshAuthoritativeMapData,
  resolveSafeWorldSpawn,
  sampleFeatureSurfaceY,
  syncLinearFeatureOverlayVisibility,
  surfaceDisplayName,
  spawnOnRoad,
  terrainYAtWorld,
  teleportToLocation,
  updateWorldLod
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
  refreshAuthoritativeMapData,
  resolveSafeWorldSpawn,
  sampleFeatureSurfaceY,
  syncLinearFeatureOverlayVisibility,
  surfaceDisplayName,
  spawnOnRoad,
  terrainYAtWorld,
  teleportToLocation,
  updateWorldLod };
