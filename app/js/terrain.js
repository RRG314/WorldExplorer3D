import { ctx as appCtx } from "./shared-context.js?v=55"; // ============================================================================
import {
  clearStructureVisualMeshes,
  rebuildStructureVisualMeshes
} from "./terrain/structure-visuals.js?v=4";
import {
  boundsIntersectLocal,
  expandBoundsLocal,
  isGreenLanduseType,
  isUrbanLanduseType,
  pointsBoundsLocal
} from "./terrain/context-utils.js?v=1";
import { createTerrainHeightSamplingApi } from "./terrain/height-sampling.js?v=1";
import { createTerrainMaterialCacheApi } from "./terrain/material-cache.js?v=1";
import { createTerrainReprojectionApi } from "./terrain/reprojection.js?v=4";
import {
  applyTerrainVisualProfile,
  classifyTerrainVisualProfile,
  computeElevationStatsMeters,
  refreshTerrainSurfaceProfiles,
  setWorldSurfaceProfile
} from "./terrain/surface-profiles.js?v=26";
import {
  applyHeightsToTerrainMesh,
  buildTerrainTileMesh,
  clearTerrainMeshes,
  decodeTerrariumRGB,
  disposeTerrainMesh,
  getTerrainMeshKey,
  elevationMetersAtLatLon,
  elevationWorldYAtWorldXZ,
  ensureTerrainGroup,
  getOrLoadTerrainTile,
  latLonToTileXY,
  pruneTerrainTileCache,
  sampleTileElevationMeters,
  terrainTileCacheSnapshot,
  terrainTileMeshKey,
  tileXYToLatLonBounds,
  waitForTerrainReadyBounds,
  waitForTerrainReadyAt,
  worldToLatLon
} from "./terrain/tiles.js?v=27";
import {
  buildRoadSkirts,
  detectRoadIntersections,
  rebuildRoadsWithTerrain
} from "./terrain/rebuild.js?v=9";
import {
  disableRoadDebugMode as disableRoadDebugModeInternal,
  toggleRoadDebugMode as toggleRoadDebugModeInternal,
  validateRoadTerrainConformance as validateRoadTerrainConformanceInternal
} from "./terrain/debug-tools.js?v=3";
import { createTerrainSidewalkApi } from "./terrain/sidewalk-helpers.js?v=1";
import { createTerrainStreamingApi } from "./terrain/streaming.js?v=9";
import { reconcileActorsAfterSurfaceRebuild } from "./terrain/actor-reprojection.js?v=2";
// terrain.js - Terrain elevation system (Terrarium tiles)
// ============================================================================

// =====================
// TERRAIN HELPER FUNCTIONS
// =====================

// Namespace for terrain internal state
const terrain = {
  _rebuildTimer: null,
  _rebuildInFlight: false,
  _lastRoadRebuildAt: 0,
  _raycaster: null,
  _rayOrigin: null,
  _rayDir: null,
  _roadMaterialCacheKey: '',
  _roadMaterials: null,
  _urbanSurfaceMaterialCacheKey: '',
  _urbanSurfaceMaterials: null,
  // Performance optimization caching
  _lastUpdatePos: { x: 0, z: 0 },
  _cachedIntersections: null,
  _lastRoadCount: 0,
  _lastTerrainTileCount: 0
};
const ROAD_ENDPOINT_EXTENSION_SCALE = 0.5;
const ROAD_ENDPOINT_EXTENSION_MIN = 0.35;
const ROAD_ENDPOINT_EXTENSION_MAX = 2.0;
const ROAD_REBUILD_DEBOUNCE_MS = 90;
const ROAD_REBUILD_MIN_INTERVAL_MS = 420;
const SIDEWALK_INNER_GAP = 0.18;
const SIDEWALK_MIN_WIDTH = 0.9;
const SIDEWALK_SEGMENT_MIN_WIDTH = 0.62;
const SIDEWALK_CLEARANCE = 0.4;
const SIDEWALK_HEIGHT_BIAS = 0.13;
const SIDEWALK_CURB_LIFT = 0.05;
const URBAN_CONTEXT_PAD = 26;
const MIN_VALID_ELEVATION_METERS = -500;
const MAX_VALID_ELEVATION_METERS = 9000;

function clampElevationMeters(meters) {
  if (!Number.isFinite(meters)) return 0;
  return Math.max(MIN_VALID_ELEVATION_METERS, Math.min(MAX_VALID_ELEVATION_METERS, meters));
}

const terrainTileDeps = {
  clampElevationMeters,
  scheduleRoadAndBuildingRebuild: () => scheduleRoadAndBuildingRebuild(),
  applyStructureTerrainCuts: (worldX, worldZ, terrainY) => applyStructureTerrainCuts(worldX, worldZ, terrainY),
  computeElevationStatsMeters: (samplesMeters) => computeElevationStatsMeters(samplesMeters),
  reapplyTerrainMeshHeights: (mesh) => applyHeightsToTerrainMesh(mesh, terrainTileDeps),
  applyHeightsToTerrainMesh: (mesh) => applyHeightsToTerrainMesh(mesh, terrainTileDeps)
};

const {
  applyStructureTerrainCuts,
  baseTerrainHeightAt,
  cachedBaseTerrainHeight,
  cachedTerrainHeight,
  clearTerrainHeightCache,
  pointAlongPolyline,
  polylineCurvatureMetric,
  subdivideRoadPoints,
  terrainMeshHeightAt
} = createTerrainHeightSamplingApi({
  appCtx,
  terrainTileDeps,
  worldToLatLon,
  latLonToTileXY,
  getOrLoadTerrainTile,
  sampleTileElevationMeters,
  clampElevationMeters,
  elevationWorldYAtWorldXZ
});

const {
  getSharedRoadMaterials,
  getSharedUrbanSurfaceMaterials
} = createTerrainMaterialCacheApi({
  appCtx,
  terrainState: terrain
});

const { repositionBuildingsWithTerrain } = createTerrainReprojectionApi({
  appCtx,
  terrainMeshHeightAt,
  cachedBaseTerrainHeight,
  elevationWorldYAtWorldXZ
});

const {
  clampSidewalkWidthTransitions,
  computeSidewalkCornerScale,
  resolveSidewalkWidth,
  roadBaseSidewalkWidth,
  roadConnectedSidewalkContinuity,
  roadHasExplicitSidewalkHint,
  roadSupportsInferredUrbanSidewalks,
  roadSupportsSidewalks,
  smoothSidewalkOuterHeights
} = createTerrainSidewalkApi({
  SIDEWALK_CLEARANCE,
  SIDEWALK_MIN_WIDTH,
  SIDEWALK_SEGMENT_MIN_WIDTH
});

const terrainRebuildDeps = {
  terrain,
  constants: {
    SIDEWALK_INNER_GAP,
    SIDEWALK_MIN_WIDTH,
    SIDEWALK_SEGMENT_MIN_WIDTH,
    SIDEWALK_CURB_LIFT,
    SIDEWALK_HEIGHT_BIAS,
    URBAN_CONTEXT_PAD
  },
  disableRoadDebugMode,
  clearTerrainHeightCache,
  getSharedRoadMaterials,
  getSharedUrbanSurfaceMaterials,
  boundsIntersectLocal,
  expandBoundsLocal,
  pointsBoundsLocal,
  isUrbanLanduseType,
  isGreenLanduseType,
  roadHasExplicitSidewalkHint,
  roadConnectedSidewalkContinuity,
  roadSupportsInferredUrbanSidewalks,
  roadSupportsSidewalks,
  roadBaseSidewalkWidth,
  resolveSidewalkWidth,
  computeSidewalkCornerScale,
  clampSidewalkWidthTransitions,
  smoothSidewalkOuterHeights,
  cachedTerrainHeight,
  cachedBaseTerrainHeight,
  subdivideRoadPoints,
  pointAlongPolyline,
  polylineCurvatureMetric,
  rebuildStructureVisualMeshes,
  validateRoadTerrainConformance
};

function scheduleRoadAndBuildingRebuild() {
  if (!appCtx.terrainEnabled || appCtx.onMoon || appCtx.initialEarthWorldRetired) return;
  appCtx.roadsNeedRebuild = true;
  if (terrain._rebuildTimer) return;

  const now = performance.now();
  const elapsed = now - terrain._lastRoadRebuildAt;
  const waitMs = elapsed >= ROAD_REBUILD_MIN_INTERVAL_MS ?
  ROAD_REBUILD_DEBOUNCE_MS :
  Math.max(ROAD_REBUILD_DEBOUNCE_MS, ROAD_REBUILD_MIN_INTERVAL_MS - elapsed);

  terrain._rebuildTimer = setTimeout(() => {
    terrain._rebuildTimer = null;
    if (!appCtx.roadsNeedRebuild || appCtx.onMoon || appCtx.initialEarthWorldRetired || !appCtx.terrainEnabled) return;
    if (terrain._rebuildInFlight) {
      scheduleRoadAndBuildingRebuild();
      return;
    }

    terrain._rebuildInFlight = true;
    try {
      if (appCtx.roads.length > 0) rebuildRoadsWithTerrain(terrainRebuildDeps);
      repositionBuildingsWithTerrain();
      reconcileActorsAfterSurfaceRebuild(appCtx);
      terrain._lastRoadRebuildAt = performance.now();
    } finally {
      terrain._rebuildInFlight = false;
      if (appCtx.roadsNeedRebuild) scheduleRoadAndBuildingRebuild();
    }
  }, waitMs);
}

function canRunRoadAndBuildingRebuildNow() {
  if (!appCtx.terrainEnabled || appCtx.onMoon || appCtx.initialEarthWorldRetired) return false;
  let tilesLoaded = 0;
  let tilesTotal = 0;
  appCtx.terrainTileCache.forEach((tile) => {
    tilesTotal++;
    if (tile?.loaded) tilesLoaded++;
  });
  return tilesLoaded > 0 && tilesTotal > 0;
}

function requestWorldSurfaceSync(options = {}) {
  if (!appCtx.terrainEnabled || appCtx.onMoon || appCtx.initialEarthWorldRetired) return false;
  appCtx.roadsNeedRebuild = true;

  const force = options.force === true;
  if (force && terrain._rebuildTimer) {
    clearTimeout(terrain._rebuildTimer);
    terrain._rebuildTimer = null;
  }

  if (!force || terrain._rebuildInFlight || !canRunRoadAndBuildingRebuildNow()) {
    scheduleRoadAndBuildingRebuild();
    return false;
  }

  terrain._rebuildInFlight = true;
  try {
    if (appCtx.roads.length > 0) rebuildRoadsWithTerrain(terrainRebuildDeps);
    repositionBuildingsWithTerrain();
    reconcileActorsAfterSurfaceRebuild(appCtx);
    terrain._lastRoadRebuildAt = performance.now();
    return true;
  } finally {
    terrain._rebuildInFlight = false;
    if (appCtx.roadsNeedRebuild) scheduleRoadAndBuildingRebuild();
  }
}

function cancelWorldSurfaceSync() {
  if (terrain._rebuildTimer) {
    clearTimeout(terrain._rebuildTimer);
    terrain._rebuildTimer = null;
  }
  appCtx.roadsNeedRebuild = false;
}
const {
  resetTerrainStreamingState,
  updateTerrainAround
} = createTerrainStreamingApi({
  appCtx,
  terrainState: terrain,
  ensureTerrainGroup,
  worldToLatLon,
  latLonToTileXY,
  buildTerrainTileMesh,
  terrainTileDeps,
  getTerrainMeshKey,
  terrainTileMeshKey,
  disposeTerrainMesh,
  getOrLoadTerrainTile,
  pruneTerrainTileCache,
  terrainTileCacheSnapshot,
  requestWorldSurfaceSync,
  clearTerrainHeightCache
});

async function waitForTerrainCoverageAt(x = 0, z = 0, timeoutMs = 5000, minLoadedRatio = 0.72) {
  if (!appCtx.terrainEnabled || appCtx.onMoon) return { ready: false, loaded: 0, total: 0 };
  if (![x, z].every(Number.isFinite)) return { ready: false, loaded: 0, total: 0 };
  updateTerrainAround(x, z);

  const deadline = performance.now() + Math.max(500, Number(timeoutMs) || 5000);
  const requiredRatio = Math.max(0.5, Math.min(1, Number(minLoadedRatio) || 0.72));
  let snapshot = { ready: false, loaded: 0, total: 0 };

  while (performance.now() < deadline) {
    const terrainMeshes = (appCtx.terrainGroup?.children || []).filter((mesh) => mesh?.userData?.isTerrainMesh);
    const tiles = terrainMeshes
      .map((mesh) => appCtx.terrainTileCache.get(mesh.userData?.terrainTileKey))
      .filter(Boolean);
    const loaded = tiles.filter((tile) => tile.loaded).length;
    snapshot = {
      ready: tiles.length > 0 && loaded / tiles.length >= requiredRatio,
      loaded,
      total: tiles.length
    };
    if (snapshot.ready) break;

    const pending = tiles.filter((tile) => !tile.loaded && !tile.failed && tile.ready instanceof Promise);
    await Promise.race([
      pending.length > 0 ? Promise.allSettled(pending.map((tile) => tile.ready)) : Promise.resolve(),
      new Promise((resolve) => globalThis.setTimeout(resolve, 140))
    ]);
  }

  if (snapshot.loaded > 0) {
    requestWorldSurfaceSync({ force: true, source: 'initial_terrain_coverage_ready' });
  }
  return snapshot;
}

function disableRoadDebugMode() {
  return disableRoadDebugModeInternal();
}

function toggleRoadDebugMode() {
  return toggleRoadDebugModeInternal({ terrainMeshHeightAt });
}

function validateRoadTerrainConformance() {
  return validateRoadTerrainConformanceInternal({ terrainMeshHeightAt, worldToLatLon });
}

function rebuildRoadsWithTerrainRuntime() {
  return rebuildRoadsWithTerrain(terrainRebuildDeps);
}

// =====================
// ROAD DEBUG MODE
// Toggle with 'R' key to visualize road-terrain conformance issues
// =====================

Object.assign(appCtx, {
  applyTerrainVisualProfile,
  applyHeightsToTerrainMesh,
  baseTerrainHeightAt: cachedBaseTerrainHeight,
  buildRoadSkirts,
  clearStructureVisualMeshes,
  buildTerrainTileMesh,
  cachedBaseTerrainHeight,
  cachedTerrainHeight,
  cancelWorldSurfaceSync,
  classifyTerrainVisualProfile,
  clearTerrainHeightCache,
  clearTerrainMeshes,
  decodeTerrariumRGB,
  detectRoadIntersections,
  elevationMetersAtLatLon,
  elevationWorldYAtWorldXZ,
  ensureTerrainGroup,
  getOrLoadTerrainTile,
  latLonToTileXY,
  pruneTerrainTileCache,
  rebuildRoadsWithTerrain: rebuildRoadsWithTerrainRuntime,
  requestWorldSurfaceSync,
  repositionBuildingsWithTerrain,
  rebuildStructureVisualMeshes,
  refreshTerrainSurfaceProfiles,
  resetTerrainStreamingState,
  sampleTileElevationMeters,
  terrainTileCacheSnapshot,
  setWorldSurfaceProfile,
  subdivideRoadPoints,
  terrainMeshHeightAt,
  tileXYToLatLonBounds,
  toggleRoadDebugMode,
  updateTerrainAround,
  validateRoadTerrainConformance,
  waitForTerrainCoverageAt,
  waitForTerrainReadyBounds: (bounds, timeoutMs) => waitForTerrainReadyBounds(bounds, timeoutMs, terrainTileDeps),
  waitForTerrainReadyAt: (x, z, timeoutMs) => waitForTerrainReadyAt(x, z, timeoutMs, terrainTileDeps),
  worldToLatLon
});

export {
  applyTerrainVisualProfile,
  applyHeightsToTerrainMesh,
  baseTerrainHeightAt,
  buildRoadSkirts,
  clearStructureVisualMeshes,
  buildTerrainTileMesh,
  cachedBaseTerrainHeight,
  cachedTerrainHeight,
  cancelWorldSurfaceSync,
  classifyTerrainVisualProfile,
  clearTerrainHeightCache,
  clearTerrainMeshes,
  decodeTerrariumRGB,
  detectRoadIntersections,
  elevationMetersAtLatLon,
  elevationWorldYAtWorldXZ,
  ensureTerrainGroup,
  getOrLoadTerrainTile,
  latLonToTileXY,
  pruneTerrainTileCache,
  rebuildRoadsWithTerrainRuntime as rebuildRoadsWithTerrain,
  requestWorldSurfaceSync,
  repositionBuildingsWithTerrain,
  rebuildStructureVisualMeshes,
  refreshTerrainSurfaceProfiles,
  resetTerrainStreamingState,
  sampleTileElevationMeters,
  terrainTileCacheSnapshot,
  setWorldSurfaceProfile,
  subdivideRoadPoints,
  terrainMeshHeightAt,
  tileXYToLatLonBounds,
  toggleRoadDebugMode,
  updateTerrainAround,
  validateRoadTerrainConformance,
  waitForTerrainCoverageAt,
  waitForTerrainReadyBounds,
  waitForTerrainReadyAt,
  worldToLatLon };
