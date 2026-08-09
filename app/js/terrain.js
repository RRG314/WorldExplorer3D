import { ctx as appCtx } from "./shared-context.js?v=55"; // ============================================================================
import {
  clearStructureVisualMeshes,
  rebuildStructureVisualMeshes
} from "./terrain/structure-visuals.js?v=24";
import { createTerrainHeightSamplingApi } from "./terrain/height-sampling.js?v=6";
import { createTerrainMaterialCacheApi } from "./terrain/material-cache.js?v=3";
import { createTerrainReprojectionApi } from "./terrain/reprojection.js?v=12";
import {
  groundProviderCatalogSnapshot
} from "./terrain/ground-provider-registry.js?v=3";
import {
  compileGroundArtifact,
  loadGroundArtifact
} from "./terrain/ground-artifact.js?v=4";
import {
  createAcceptedGroundRuntime
} from "./terrain/accepted-ground-runtime.js?v=2";
import {
  loadAcceptedGroundCatalog
} from "./terrain/accepted-ground-catalog.js?v=1";
import {
  applyTerrainVisualProfile,
  classifyTerrainVisualProfile,
  computeElevationStatsMeters,
  refreshTerrainSurfaceProfiles,
  setWorldSurfaceProfile
} from "./terrain/surface-profiles.js?v=40";
import {
  applyHeightsToTerrainMesh,
  buildTerrainTileMesh,
  clearTerrainMeshes,
  decodeTerrariumRGB,
  getTerrainMeshKey,
  ensureTerrainGroup,
  getOrLoadTerrainTile,
  latLonToTileXY,
  pruneTerrainTileCache,
  sampleTileElevationMeters,
  terrainSourceSampleAtLatLon,
  terrainSourceSampleAtWorldXZ,
  terrainTileCacheSnapshot,
  terrainTileMeshKey,
  tileXYToLatLonBounds,
  waitForTerrainTileReadyAtZoom,
  waitForTerrainReadyAt as waitForTerrainTileReadyAt,
  waitForTerrainReadyBounds as waitForTerrainTileReadyBounds,
  worldToLatLon
} from "./terrain/tiles.js?v=42";
import {
  buildRoadSkirts,
  detectRoadIntersections,
  publishCompiledTransportMeshes
} from "./terrain/rebuild.js?v=28";
import {
  disableRoadDebugMode as disableRoadDebugModeInternal,
  toggleRoadDebugMode as toggleRoadDebugModeInternal,
  validateRoadTerrainConformance as validateRoadTerrainConformanceInternal
} from "./terrain/debug-tools.js?v=6";
import { createLocationTerrainApi } from "./terrain/location-world.js?v=4";
import { createFarFieldTerrainApi } from "./terrain/far-field.js?v=23";
import { reconcileActorsAfterSurfaceRebuild } from "./terrain/actor-reprojection.js?v=2";
import { waterBedDepthAtShorelineDistance } from "./terrain/water-terrain-mask.js?v=1";
import {
  distanceToWaterBoundary,
  pointInWaterBody
} from "./world/water-surface-registry.js?v=3";
// terrain.js - Accepted-ground artifact and terrain presentation system
// ============================================================================

// =====================
// TERRAIN HELPER FUNCTIONS
// =====================

// Namespace for terrain internal state
const terrain = {
  _raycaster: null,
  _rayOrigin: null,
  _rayDir: null,
  _roadMaterialCacheKey: '',
  _roadMaterials: null,
  _lastTerrainTileCount: 0
};
const acceptedGroundRuntime = createAcceptedGroundRuntime({ worldToLatLon });
let acceptedGroundCatalogState = Object.freeze({
  status: 'unloaded',
  reason: null,
  manifests: Object.freeze([]),
  url: ''
});
const clearAcceptedGroundRuntime = (reason) =>
  acceptedGroundRuntime.clear(reason);
const getAcceptedGroundRuntimeSnapshot = () =>
  acceptedGroundRuntime.snapshot();
const prepareAcceptedGroundForLocation = (options) =>
  acceptedGroundRuntime.prepare(options);
const prepareAcceptedGroundFromCatalog = async (options = {}) => {
  acceptedGroundCatalogState = await loadAcceptedGroundCatalog({
    url: options.catalogUrl,
    fetchImpl: options.fetchImpl,
    signal: options.signal
  });
  if (acceptedGroundCatalogState.status !== 'accepted') {
    return acceptedGroundRuntime.clear(
      acceptedGroundCatalogState.reason || 'ground-catalog-rejected'
    );
  }
  return acceptedGroundRuntime.prepare({
    latitude: options.latitude,
    longitude: options.longitude,
    manifests: acceptedGroundCatalogState.manifests,
    coverageProbes: options.coverageProbes,
    signal: options.signal
  });
};
const getAcceptedGroundCatalogSnapshot = () => acceptedGroundCatalogState;
const sampleAcceptedGroundAtLatLon = (latitude, longitude) =>
  acceptedGroundRuntime.sampleAtLatLon(latitude, longitude);
const sampleAcceptedGroundAtWorldXZ = (x, z) =>
  acceptedGroundRuntime.sampleAtWorldXZ(x, z);
const verifyAcceptedGroundCoverage = (locations) =>
  acceptedGroundRuntime.verifyCoverage(locations);
const ROAD_ENDPOINT_EXTENSION_SCALE = 0.5;
const ROAD_ENDPOINT_EXTENSION_MIN = 0.35;
const ROAD_ENDPOINT_EXTENSION_MAX = 2.0;
const MIN_VALID_ELEVATION_METERS = -500;
const MAX_VALID_ELEVATION_METERS = 9000;

function clampElevationMeters(meters) {
  if (!Number.isFinite(meters)) return null;
  return Math.max(MIN_VALID_ELEVATION_METERS, Math.min(MAX_VALID_ELEVATION_METERS, meters));
}

function elevationMetersAtLatLon(latitude, longitude) {
  if (appCtx.worldLoadRuntimeState?.groundMode === 'worldwide-terrain-fallback') {
    const sample = terrainSourceSampleAtLatLon(latitude, longitude, terrainTileDeps);
    return sample.status === 'available' && Number.isFinite(Number(sample.elevationMeters))
      ? clampElevationMeters(Number(sample.elevationMeters))
      : null;
  }
  const sample = acceptedGroundRuntime.sampleAtLatLon(latitude, longitude);
  return sample.status === 'available' &&
    Number.isFinite(Number(sample.groundElevationMeters))
    ? clampElevationMeters(Number(sample.groundElevationMeters))
    : null;
}

function elevationWorldYAtWorldXZ(x, z) {
  if (appCtx.worldLoadRuntimeState?.groundMode === 'worldwide-terrain-fallback') {
    const sample = terrainSourceSampleAtWorldXZ(x, z, terrainTileDeps);
    return sample.status === 'available' && Number.isFinite(Number(sample.elevationMeters))
      ? clampElevationMeters(Number(sample.elevationMeters)) *
        appCtx.WORLD_UNITS_PER_METER * appCtx.TERRAIN_Y_EXAGGERATION
      : null;
  }
  const sample = acceptedGroundRuntime.sampleAtWorldXZ(x, z);
  if (
    sample.status !== 'available' ||
    !Number.isFinite(Number(sample.groundElevationMeters))
  ) return null;
  return clampElevationMeters(Number(sample.groundElevationMeters)) *
    appCtx.WORLD_UNITS_PER_METER *
    appCtx.TERRAIN_Y_EXAGGERATION;
}

function createWaterTerrainContext(tileBounds = null) {
  const areas = Array.isArray(appCtx.waterAreas) ? appCtx.waterAreas : [];
  if (!tileBounds || typeof appCtx.geoToWorld !== 'function') return areas;
  const northWest = appCtx.geoToWorld(tileBounds.latN, tileBounds.lonW);
  const southEast = appCtx.geoToWorld(tileBounds.latS, tileBounds.lonE);
  const minX = Math.min(northWest.x, southEast.x);
  const maxX = Math.max(northWest.x, southEast.x);
  const minZ = Math.min(northWest.z, southEast.z);
  const maxZ = Math.max(northWest.z, southEast.z);
  return areas.filter((area) => {
    const bounds = area?.bounds;
    return !bounds || (
      bounds.maxX >= minX && bounds.minX <= maxX &&
      bounds.maxZ >= minZ && bounds.minZ <= maxZ
    );
  });
}

function resolveWaterTerrainY(x, z, terrainY, candidates = null) {
  if (!Number.isFinite(terrainY)) return terrainY;
  const areas = Array.isArray(candidates)
    ? candidates
    : Array.isArray(appCtx.waterAreas) ? appCtx.waterAreas : [];
  let resolvedY = terrainY;
  for (let i = 0; i < areas.length; i += 1) {
    const area = areas[i];
    const bounds = area?.bounds;
    if (bounds && (
      x < bounds.minX || x > bounds.maxX ||
      z < bounds.minZ || z > bounds.maxZ
    )) continue;
    if (!Number.isFinite(Number(area?.surfaceY))) continue;
    if (!pointInWaterBody(area, x, z)) continue;
    // Meet the terrain close to the registered shoreline, then deepen the bed
    // smoothly. A fixed cut makes an opaque water polygon read as a floating
    // slab at quays and beaches.
    const shorelineDistance = distanceToWaterBoundary(area, x, z);
    const bedDepth = waterBedDepthAtShorelineDistance(shorelineDistance);
    resolvedY = Math.min(resolvedY, Number(area.surfaceY) - bedDepth);
  }
  return resolvedY;
}

const terrainTileDeps = {
  clampElevationMeters,
  sampleAcceptedGroundAtLatLon,
  usesAcceptedGround: () =>
    appCtx.worldLoadRuntimeState?.groundMode !== 'worldwide-terrain-fallback',
  applyStructureTerrainCuts: (worldX, worldZ, terrainY) => applyStructureTerrainCuts(worldX, worldZ, terrainY),
  createWaterTerrainContext,
  resolveWaterTerrainY,
  computeElevationStatsMeters: (samplesMeters) => computeElevationStatsMeters(samplesMeters),
  reapplyTerrainMeshHeights: (mesh) => {
    applyHeightsToTerrainMesh(mesh, terrainTileDeps);
    if (mesh?.userData?.pendingTerrainTile === false) {
      appCtx.retireGroundFallbackPlaceholder?.();
    }
  },
  applyHeightsToTerrainMesh: (mesh) => applyHeightsToTerrainMesh(mesh, terrainTileDeps)
};

function applyWaterTerrainMask() {
  const meshes = (appCtx.terrainGroup?.children || []).filter((mesh) => mesh?.userData?.isTerrainMesh);
  const waterAreaCount = Number(appCtx.waterAreas?.length || 0);
  if (waterAreaCount === 0) {
    const stats = { terrainMeshes: meshes.length, waterAreas: 0, maskedVertices: 0, skipped: true };
    appCtx.waterTerrainMaskStats = stats;
    return stats;
  }
  let maskedVertices = 0;
  for (const mesh of meshes) {
    applyHeightsToTerrainMesh(mesh, terrainTileDeps, { reuseBaseElevations: true });
    maskedVertices += Number(mesh.userData?.waterMaskedVertices || 0);
  }
  clearTerrainHeightCache();
  const stats = {
    terrainMeshes: meshes.length,
    waterAreas: waterAreaCount,
    maskedVertices
  };
  appCtx.waterTerrainMaskStats = stats;
  return stats;
}

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
  elevationWorldYAtWorldXZ
});

const { getSharedRoadMaterials } = createTerrainMaterialCacheApi({
  appCtx,
  terrainState: terrain
});

const { repositionBuildingsWithTerrain } = createTerrainReprojectionApi({
  appCtx,
  terrainMeshHeightAt,
  cachedBaseTerrainHeight,
  elevationWorldYAtWorldXZ
});

const transportPublicationDeps = {
  disableRoadDebugMode,
  clearTerrainHeightCache,
  getSharedRoadMaterials,
  cachedTerrainHeight,
  cachedBaseTerrainHeight,
  subdivideRoadPoints,
  pointAlongPolyline,
  polylineCurvatureMetric,
  rebuildStructureVisualMeshes,
  validateRoadTerrainConformance
};

const {
  refreshFarTerrainSurfaceColors,
  resetFarTerrainClipmap,
  scheduleFarTerrainSurfaceRefresh,
  updateFarTerrainClipmap,
  waitForFarTerrainClipmap
} = createFarFieldTerrainApi({
  appCtx,
  clampElevationMeters,
  getOrLoadTerrainTile,
  latLonToTileXY,
  sampleAcceptedGroundAtLatLon,
  sampleTileElevationMeters,
  terrainTileDeps,
  tileXYToLatLonBounds,
  waitForTerrainTileReadyAtZoom,
  worldToLatLon
});

const {
  publishLocationTerrain,
  resetLocationTerrainPublication
} = createLocationTerrainApi({
  appCtx,
  ensureTerrainGroup,
  worldToLatLon,
  latLonToTileXY,
  buildTerrainTileMesh,
  terrainTileDeps,
  getTerrainMeshKey,
  terrainTileMeshKey,
  getOrLoadTerrainTile,
  pruneTerrainTileCache,
  terrainTileCacheSnapshot,
  clearTerrainHeightCache,
  resetFarTerrainClipmap,
  updateFarTerrainClipmap
});

async function waitForTerrainCoverageAt(x = 0, z = 0, timeoutMs = 5000, minLoadedRatio = 0.72) {
  if (!appCtx.terrainEnabled || appCtx.onMoon) return { ready: false, loaded: 0, total: 0 };
  if (![x, z].every(Number.isFinite)) return { ready: false, loaded: 0, total: 0 };
  if (terrainTileDeps.usesAcceptedGround()) {
    const acceptedSample = sampleAcceptedGroundAtWorldXZ(x, z);
    if (acceptedSample.status !== 'available') {
      return {
        ready: false,
        loaded: 0,
        total: 1,
        reason: acceptedSample.reason || 'accepted-ground-unavailable'
      };
    }
  }
  const deadline = performance.now() + Math.max(500, Number(timeoutMs) || 5000);
  const requiredRatio = Math.max(0.5, Math.min(1, Number(minLoadedRatio) || 0.72));
  let snapshot = { ready: false, loaded: 0, total: 0 };

  while (performance.now() < deadline) {
    const terrainMeshes = (appCtx.terrainGroup?.children || []).filter((mesh) => mesh?.userData?.isTerrainMesh);
    const loaded = terrainMeshes.filter(
      (mesh) => mesh.visible !== false &&
        mesh.userData?.pendingTerrainTile !== true
    ).length;
    snapshot = {
      ready:
        terrainMeshes.length > 0 &&
        loaded / terrainMeshes.length >= requiredRatio,
      loaded,
      total: terrainMeshes.length
    };
    if (snapshot.ready) break;

    await new Promise((resolve) => globalThis.setTimeout(resolve, 140));
  }

  return snapshot;
}

async function waitForAcceptedGroundReadyAt(x, z) {
  if (!terrainTileDeps.usesAcceptedGround()) {
    return waitForTerrainTileReadyAt(x, z, 3000, terrainTileDeps);
  }
  return sampleAcceptedGroundAtWorldXZ(x, z).status === 'available';
}

async function waitForAcceptedGroundReadyBounds(bounds) {
  if (!terrainTileDeps.usesAcceptedGround()) {
    return waitForTerrainTileReadyBounds(bounds, 8000, terrainTileDeps);
  }
  const south = Number(bounds?.latS);
  const north = Number(bounds?.latN);
  const west = Number(bounds?.lonW);
  const east = Number(bounds?.lonE);
  if (![south, north, west, east].every(Number.isFinite)) return false;
  const longitudeMidpoint = west <= east
    ? (west + east) * 0.5
    : ((((west + 360) + east) * 0.5 + 540) % 360) - 180;
  return verifyAcceptedGroundCoverage([
    { latitude: south, longitude: west },
    { latitude: south, longitude: east },
    { latitude: north, longitude: west },
    { latitude: north, longitude: east },
    {
      latitude: (south + north) * 0.5,
      longitude: longitudeMidpoint
    }
  ]).status === 'accepted';
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

function publishCompiledTransportMeshesRuntime() {
  return publishCompiledTransportMeshes(transportPublicationDeps);
}

// =====================
// ROAD DEBUG MODE
// Toggle with 'R' key to visualize road-terrain conformance issues
// =====================

Object.assign(appCtx, {
  applyTerrainVisualProfile,
  applyHeightsToTerrainMesh,
  applyWaterTerrainMask,
  baseTerrainHeightAt: cachedBaseTerrainHeight,
  buildRoadSkirts,
  clearStructureVisualMeshes,
  buildTerrainTileMesh,
  cachedBaseTerrainHeight,
  cachedTerrainHeight,
  classifyTerrainVisualProfile,
  clearTerrainHeightCache,
  clearTerrainMeshes,
  decodeTerrariumRGB,
  detectRoadIntersections,
  elevationMetersAtLatLon,
  elevationWorldYAtWorldXZ,
  ensureTerrainGroup,
  compileGroundArtifact,
  clearAcceptedGroundRuntime,
  getGroundProviderCatalogSnapshot: groundProviderCatalogSnapshot,
  getAcceptedGroundCatalogSnapshot,
  getAcceptedGroundRuntimeSnapshot,
  latLonToTileXY,
  loadGroundArtifact,
  prepareAcceptedGroundForLocation,
  prepareAcceptedGroundFromCatalog,
  pruneTerrainTileCache,
  reconcileActorsAfterSurfaceRebuild,
  publishCompiledTransportMeshes: publishCompiledTransportMeshesRuntime,
  repositionBuildingsWithTerrain,
  rebuildStructureVisualMeshes,
  refreshTerrainSurfaceProfiles,
  refreshFarTerrainSurfaceColors,
  resetFarTerrainClipmap,
  resetLocationTerrainPublication,
  sampleAcceptedGroundAtLatLon,
  sampleAcceptedGroundAtWorldXZ,
  scheduleFarTerrainSurfaceRefresh,
  terrainSourceSampleAtLatLon: (lat, lon) =>
    terrainSourceSampleAtLatLon(lat, lon, terrainTileDeps),
  terrainSourceSampleAtWorldXZ: (x, z) =>
    terrainSourceSampleAtWorldXZ(x, z, terrainTileDeps),
  terrainTileCacheSnapshot,
  updateFarTerrainClipmap,
  waitForFarTerrainClipmap,
  setWorldSurfaceProfile,
  subdivideRoadPoints,
  terrainMeshHeightAt,
  tileXYToLatLonBounds,
  toggleRoadDebugMode,
  publishLocationTerrain,
  validateRoadTerrainConformance,
  verifyAcceptedGroundCoverage,
  waitForTerrainCoverageAt,
  waitForTerrainReadyBounds: waitForAcceptedGroundReadyBounds,
  waitForTerrainReadyAt: waitForAcceptedGroundReadyAt,
  worldToLatLon
});

export {
  applyTerrainVisualProfile,
  applyHeightsToTerrainMesh,
  applyWaterTerrainMask,
  baseTerrainHeightAt,
  buildRoadSkirts,
  clearStructureVisualMeshes,
  buildTerrainTileMesh,
  cachedBaseTerrainHeight,
  cachedTerrainHeight,
  classifyTerrainVisualProfile,
  clearAcceptedGroundRuntime,
  clearTerrainHeightCache,
  clearTerrainMeshes,
  decodeTerrariumRGB,
  detectRoadIntersections,
  elevationMetersAtLatLon,
  elevationWorldYAtWorldXZ,
  ensureTerrainGroup,
  getAcceptedGroundRuntimeSnapshot,
  getAcceptedGroundCatalogSnapshot,
  latLonToTileXY,
  pruneTerrainTileCache,
  prepareAcceptedGroundForLocation,
  prepareAcceptedGroundFromCatalog,
  reconcileActorsAfterSurfaceRebuild,
  publishCompiledTransportMeshesRuntime as publishCompiledTransportMeshes,
  repositionBuildingsWithTerrain,
  rebuildStructureVisualMeshes,
  refreshTerrainSurfaceProfiles,
  resetLocationTerrainPublication,
  sampleAcceptedGroundAtLatLon,
  sampleAcceptedGroundAtWorldXZ,
  terrainSourceSampleAtLatLon,
  terrainSourceSampleAtWorldXZ,
  terrainTileCacheSnapshot,
  setWorldSurfaceProfile,
  subdivideRoadPoints,
  terrainMeshHeightAt,
  tileXYToLatLonBounds,
  toggleRoadDebugMode,
  publishLocationTerrain,
  validateRoadTerrainConformance,
  verifyAcceptedGroundCoverage,
  waitForFarTerrainClipmap,
  waitForTerrainCoverageAt,
  waitForAcceptedGroundReadyBounds as waitForTerrainReadyBounds,
  waitForAcceptedGroundReadyAt as waitForTerrainReadyAt,
  worldToLatLon };
