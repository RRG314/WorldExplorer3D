import { ctx as appCtx } from "./shared-context.js?v=55"; // ============================================================================
import {
  appendIndexedGeometryToGroupedBatch,
  buildGroupedIndexedBatchMeshes,
  createRoadSurfaceMaterials,
  disposeRoadSurfaceMaterials,
  roadSurfaceMaterialCacheKey
} from "./road-render.js?v=3";
import {
  classifyTerrainSurfaceProfile as classifySharedTerrainSurfaceProfile
} from "./surface-rules.js?v=3";
import {
  buildFeatureRibbonEdges,
  isRoadSurfaceReachable,
  polylineDistances,
  projectPointToFeature,
  sampleFeatureSurfaceY,
  shouldRenderRoadSkirts
} from "./structure-semantics.js?v=26";
import {
  assignContinuousWorldRegionKeysToTarget,
  buildContinuousWorldRegionKeysFromPoints,
  mergeContinuousWorldRegionKeysFromTargets
} from "./continuous-world-feature-manager.js?v=2";
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
  _lastSurfaceSyncSource: null,
  _surfaceSyncRequestCount: 0,
  _lastSurfaceSyncDurationMs: 0,
  _lastSurfaceSyncCompletedAt: 0,
  _surfaceSyncSamples: 0,
  _surfaceSyncTotalMs: 0,
  _surfaceSyncMaxMs: 0,
  _surfaceSyncMode: 'idle',
  _surfaceSyncPendingRoads: 0,
  _surfaceSyncLastBatchRoads: 0,
  _activeSurfaceSyncTask: null,
  _terrainTileLoadCount: 0,
  _activeTerrainTileLoadCount: 0,
  _focusTerrainTileLoadCount: 0,
  _prefetchTerrainTileLoadCount: 0,
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
  _lastTerrainTileCount: 0,
  _terrainMeshesByKey: new Map(),
  _activeTerrainTileKeys: new Set(),
  _activeTerrainRequiredKeys: new Set(),
  _activeTerrainNearKeys: new Set(),
  _activeTerrainFocusKeys: new Set(),
  _activeTerrainPrefetchKeys: new Set(),
  _activeTerrainCenterKey: null,
  _lastFocusDescriptorCount: 0,
  _lastFocusDescriptorKinds: [],
  _lastSurfaceSyncTargetBounds: null,
  _surfaceSyncRoadMutationState: null,
  _structureVisualsDirty: false,
  _lastStructureVisualDeferredReason: null,
  _structureVisualDeferredCount: 0,
  _structureVisualRebuildCount: 0,
  _pendingStructureVisualRebuild: null,
  _deferredDroneSurfaceSync: false,
  _deferredBuildingTerrainTimer: null
};
const ROAD_ENDPOINT_EXTENSION_SCALE = 0.5;
const ROAD_ENDPOINT_EXTENSION_MIN = 0.35;
const ROAD_ENDPOINT_EXTENSION_MAX = 2.0;
const ROAD_REBUILD_DEBOUNCE_MS = 90;
const ROAD_REBUILD_MIN_INTERVAL_MS = 420;
const ROAD_REBUILD_DRIVE_SPEED_GATE = 14;
const ROAD_REBUILD_PARTIAL_BATCH_SIZE = 48;
const ROAD_REBUILD_PARTIAL_BATCH_MIN_SIZE = 16;
const ROAD_REBUILD_BATCH_CONTINUE_MS = 18;
const TERRAIN_TILE_RETENTION_MARGIN = 1;
const TERRAIN_TILE_CACHE_SOFT_MAX = 54;
const TERRAIN_TILE_CACHE_HARD_MAX = 84;
const SIDEWALK_INNER_GAP = 0.18;
const SIDEWALK_MIN_WIDTH = 0.9;
const SIDEWALK_SEGMENT_MIN_WIDTH = 0.62;
const SIDEWALK_CLEARANCE = 0.4;
const SIDEWALK_HEIGHT_BIAS = 0.46;
const SIDEWALK_CURB_LIFT = 0.05;
const URBAN_CONTEXT_PAD = 26;
const SNOW_COLOR_HEX = 0xffffff;
const ALPINE_SNOW_COLOR_HEX = 0xe5ebf2;
const SAND_COLOR_HEX = 0xd7c08a;
const GRASS_COLOR_HEX = 0x6b8e4a;
const URBAN_GROUND_HEX = 0x8b8f96;
const SOIL_COLOR_HEX = 0x8c6b47;
const ROCK_COLOR_HEX = 0x7b7e82;
const GROUND_FALLBACK_GRASS_HEX = 0x4a7a2e;
const GROUND_FALLBACK_SNOW_HEX = 0xd6e2ef;
const GROUND_FALLBACK_ALPINE_HEX = 0xc6d0d8;
const GROUND_FALLBACK_SAND_HEX = 0xc8aa70;
const GROUND_FALLBACK_URBAN_HEX = 0x767a82;
const GROUND_FALLBACK_SOIL_HEX = 0x7d5e3d;
const GROUND_FALLBACK_ROCK_HEX = 0x6e7279;
const MIN_VALID_ELEVATION_METERS = -500;
const MAX_VALID_ELEVATION_METERS = 9000;
const URBAN_LANDUSE_TYPES = new Set([
  'residential',
  'commercial',
  'industrial',
  'retail',
  'construction',
  'brownfield',
  'garages',
  'railway',
  'harbour',
  'port',
  'military'
]);
const GREEN_LANDUSE_TYPES = new Set([
  'forest',
  'wood',
  'park',
  'garden',
  'grass',
  'meadow',
  'orchard',
  'vineyard',
  'allotments',
  'farmland',
  'recreation_ground',
  'village_green',
  'cemetery'
]);

function recordSurfaceSyncMetrics(source = 'unknown', durationMs = 0) {
  const safeDuration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
  terrain._lastSurfaceSyncSource = String(source || 'unknown');
  terrain._lastSurfaceSyncDurationMs = safeDuration;
  terrain._lastSurfaceSyncCompletedAt = performance.now();
  terrain._surfaceSyncSamples += 1;
  terrain._surfaceSyncTotalMs += safeDuration;
  terrain._surfaceSyncMaxMs = Math.max(terrain._surfaceSyncMaxMs, safeDuration);
  if (typeof appCtx.setPerfLiveStat === 'function') {
    appCtx.setPerfLiveStat('terrainSurfaceSync', {
      source: terrain._lastSurfaceSyncSource,
      lastMs: Number(safeDuration.toFixed(2)),
      avgMs: Number((terrain._surfaceSyncTotalMs / Math.max(1, terrain._surfaceSyncSamples)).toFixed(2)),
    maxMs: Number(terrain._surfaceSyncMaxMs.toFixed(2)),
    samples: terrain._surfaceSyncSamples,
    requests: terrain._surfaceSyncRequestCount,
    mode: terrain._surfaceSyncMode,
    pendingRoads: terrain._surfaceSyncPendingRoads,
    batchRoads: terrain._surfaceSyncLastBatchRoads
  });
  }
}

function cloneLocalBounds(bounds) {
  if (!bounds) return null;
  return {
    minX: Number(bounds.minX),
    maxX: Number(bounds.maxX),
    minZ: Number(bounds.minZ),
    maxZ: Number(bounds.maxZ)
  };
}

function snapshotStructureVisualRebuildOptions(options = {}) {
  const snapshot = {};
  const bounds = cloneLocalBounds(options?.bounds || terrain._lastSurfaceSyncTargetBounds || null);
  if (bounds) snapshot.bounds = bounds;
  const regionKeys =
    options?.regionKeys instanceof Set ?
      Array.from(options.regionKeys).filter((key) => typeof key === 'string' && key) :
      Array.isArray(options?.regionKeys) ?
        options.regionKeys.filter((key) => typeof key === 'string' && key) :
        [];
  if (regionKeys.length > 0) snapshot.regionKeys = regionKeys;
  return snapshot;
}

function activeTerrainLoadStats() {
  const activeKeys =
    terrain._activeTerrainRequiredKeys instanceof Set && terrain._activeTerrainRequiredKeys.size > 0 ?
      terrain._activeTerrainRequiredKeys :
      terrain._activeTerrainTileKeys;
  const nearKeys = terrain._activeTerrainNearKeys;
  const focusKeys = terrain._activeTerrainFocusKeys;
  let activeLoaded = 0;
  let activePending = 0;
  let nearLoaded = 0;
  let nearTotal = 0;
  let focusLoaded = 0;
  let focusTotal = 0;
  let centerLoaded = false;

  if (!(activeKeys instanceof Set) || activeKeys.size === 0) {
    return {
      activeLoaded,
      activePending,
      activeTotal: 0,
      nearLoaded,
      nearTotal,
      focusLoaded,
      focusTotal,
      centerLoaded
    };
  }

  activeKeys.forEach((key) => {
    const tile = appCtx.terrainTileCache.get(key);
    const loaded = !!tile?.loaded;
    if (loaded) activeLoaded += 1;
    else if (!tile?.failed) activePending += 1;
    if (key === terrain._activeTerrainCenterKey) centerLoaded = loaded;
    if (nearKeys?.has(key)) {
      nearTotal += 1;
      if (loaded) nearLoaded += 1;
    }
    if (focusKeys?.has(key)) {
      focusTotal += 1;
      if (loaded) focusLoaded += 1;
    }
  });

  return {
    activeLoaded,
    activePending,
    activeTotal: activeKeys.size,
    nearLoaded,
    nearTotal,
    focusLoaded,
    focusTotal,
    centerLoaded
  };
}

function canRebuildStructureVisualsNow() {
  if (appCtx.onMoon || !appCtx.scene) return false;
  const stats = activeTerrainLoadStats();
  if (!stats.centerLoaded) return false;

  const nearRatio = stats.nearTotal > 0 ? stats.nearLoaded / stats.nearTotal : 1;
  const focusRatio = stats.focusTotal > 0 ? stats.focusLoaded / stats.focusTotal : 1;
  const activePending = stats.activePending;
  const droneSpeed = Math.abs(Number(appCtx.drone?.speed || 0));

  if (appCtx.droneMode) {
    if (terrain._rebuildInFlight) return false;
    if (Number(terrain._surfaceSyncPendingRoads || 0) > 0) return false;
    if (nearRatio < 0.9) return false;
    if (focusRatio < 0.85) return false;
    if (activePending > Math.max(1, Math.floor((stats.activeTotal || 0) * 0.12))) return false;
    if (droneSpeed > 26 && activePending > 0) return false;
    return true;
  }

  if (nearRatio < 0.68) return false;
  if (focusRatio < 0.62) return false;
  return true;
}

function deferStructureVisualRebuild(options = {}, reason = 'terrain_unsettled') {
  terrain._structureVisualsDirty = true;
  terrain._lastStructureVisualDeferredReason = String(reason || 'terrain_unsettled');
  terrain._structureVisualDeferredCount += 1;
  terrain._pendingStructureVisualRebuild = snapshotStructureVisualRebuildOptions(options);
}

function maybeFlushDeferredStructureVisualRebuild(source = 'terrain_settled') {
  if (!terrain._structureVisualsDirty || terrain._rebuildInFlight) return false;
  if (!canRebuildStructureVisualsNow()) return false;
  const pending = terrain._pendingStructureVisualRebuild || {};
  const retryOptions = {
    skipSettledCheck: true,
    source
  };
  if (pending.bounds) retryOptions.bounds = pending.bounds;
  if (Array.isArray(pending.regionKeys) && pending.regionKeys.length > 0) {
    retryOptions.regionKeys = new Set(pending.regionKeys);
  }
  return rebuildStructureVisualMeshes(retryOptions);
}

function clampElevationMeters(meters) {
  if (!Number.isFinite(meters)) return 0;
  return Math.max(MIN_VALID_ELEVATION_METERS, Math.min(MAX_VALID_ELEVATION_METERS, meters));
}

function disposeRoadMaterialCache() {
  if (!terrain._roadMaterials) return;
  disposeRoadSurfaceMaterials(terrain._roadMaterials);
  terrain._roadMaterials = null;
  terrain._roadMaterialCacheKey = '';
}

function disposeUrbanSurfaceMaterialCache() {
  if (!terrain._urbanSurfaceMaterials) return;
  disposeRoadSurfaceMaterials(terrain._urbanSurfaceMaterials);
  terrain._urbanSurfaceMaterials = null;
  terrain._urbanSurfaceMaterialCacheKey = '';
}

function getSharedRoadMaterials() {
  const key = roadSurfaceMaterialCacheKey({
    asphaltTex: appCtx.asphaltTex,
    asphaltNormal: appCtx.asphaltNormal,
    asphaltRoughness: appCtx.asphaltRoughness
  });
  if (terrain._roadMaterials && terrain._roadMaterialCacheKey === key) return terrain._roadMaterials;

  disposeRoadMaterialCache();
  const materials = createRoadSurfaceMaterials({
    asphaltTex: appCtx.asphaltTex,
    asphaltNormal: appCtx.asphaltNormal,
    asphaltRoughness: appCtx.asphaltRoughness
  });

  terrain._roadMaterialCacheKey = key;
  terrain._roadMaterials = {
    roadMat: materials.roadMainMaterial,
    skirtMat: materials.roadSkirtMaterial,
    capMat: materials.roadCapMaterial
  };
  return terrain._roadMaterials;
}

function getSharedUrbanSurfaceMaterials() {
  const key = roadSurfaceMaterialCacheKey({ includeSidewalk: true });
  if (terrain._urbanSurfaceMaterials && terrain._urbanSurfaceMaterialCacheKey === key) {
    return terrain._urbanSurfaceMaterials;
  }

  disposeUrbanSurfaceMaterialCache();
  const materials = createRoadSurfaceMaterials({ includeSidewalk: true });

  terrain._urbanSurfaceMaterialCacheKey = key;
  terrain._urbanSurfaceMaterials = { sidewalkMat: materials.sidewalkMaterial };
  return terrain._urbanSurfaceMaterials;
}

function boundsIntersectLocal(a, b, padding = 0) {
  if (!a || !b) return false;
  return !(
    a.maxX < b.minX - padding ||
    a.minX > b.maxX + padding ||
    a.maxZ < b.minZ - padding ||
    a.minZ > b.maxZ + padding
  );
}

function expandBoundsLocal(bounds, padding = 0) {
  if (!bounds) return null;
  const pad = Number.isFinite(padding) ? Math.max(0, padding) : 0;
  return {
    minX: bounds.minX - pad,
    maxX: bounds.maxX + pad,
    minZ: bounds.minZ - pad,
    maxZ: bounds.maxZ + pad
  };
}

function mergeBoundsLocal(a, b) {
  if (!a && !b) return null;
  if (!a) return b ? { ...b } : null;
  if (!b) return a ? { ...a } : null;
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minZ: Math.min(a.minZ, b.minZ),
    maxZ: Math.max(a.maxZ, b.maxZ)
  };
}

function boundsContainBoundsLocal(outer, inner, padding = 0) {
  if (!outer || !inner) return false;
  const pad = Number.isFinite(padding) ? Math.max(0, padding) : 0;
  return (
    outer.minX <= inner.minX + pad &&
    outer.maxX >= inner.maxX - pad &&
    outer.minZ <= inner.minZ + pad &&
    outer.maxZ >= inner.maxZ - pad
  );
}

function pointsBoundsLocal(points = [], padding = 0) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
    return null;
  }
  return expandBoundsLocal({ minX, maxX, minZ, maxZ }, padding);
}

function boundsContainsPointLocal(bounds, x, z, padding = 0) {
  if (!bounds || !Number.isFinite(x) || !Number.isFinite(z)) return false;
  const pad = Number.isFinite(padding) ? Math.max(0, padding) : 0;
  return (
    x >= bounds.minX - pad &&
    x <= bounds.maxX + pad &&
    z >= bounds.minZ - pad &&
    z <= bounds.maxZ + pad
  );
}

function mergeRegionKeysIntoBatch(target = [], next = []) {
  const merged = new Set(Array.isArray(target) ? target.filter((key) => typeof key === 'string' && key) : []);
  if (Array.isArray(next)) {
    for (let i = 0; i < next.length; i++) {
      const key = next[i];
      if (typeof key === 'string' && key) merged.add(key);
    }
  }
  return Array.from(merged).sort();
}

const SIDEWALK_BATCH_SUPERCELL_SIZE = 2;
const SIDEWALK_BATCH_FALLBACK_BUCKET_SIZE = 420;

function sidewalkBatchSignature(regionKeys = [], verts = []) {
  const primaryRegionKey = String((Array.isArray(regionKeys) ? regionKeys[0] : '') || '').trim();
  const parts = primaryRegionKey.split(':');
  if (parts.length === 2) {
    const latIndex = Number(parts[0]);
    const lonIndex = Number(parts[1]);
    if (Number.isFinite(latIndex) && Number.isFinite(lonIndex)) {
      return `sidewalk:${Math.floor(latIndex / SIDEWALK_BATCH_SUPERCELL_SIZE)}:${Math.floor(lonIndex / SIDEWALK_BATCH_SUPERCELL_SIZE)}`;
    }
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < verts.length; i += 3) {
    const x = Number(verts[i]);
    const z = Number(verts[i + 2]);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  if (Number.isFinite(minX) && Number.isFinite(maxX) && Number.isFinite(minZ) && Number.isFinite(maxZ)) {
    const centerX = (minX + maxX) * 0.5;
    const centerZ = (minZ + maxZ) * 0.5;
    return `sidewalk:bucket:${Math.floor(centerX / SIDEWALK_BATCH_FALLBACK_BUCKET_SIZE)}:${Math.floor(centerZ / SIDEWALK_BATCH_FALLBACK_BUCKET_SIZE)}`;
  }
  return 'sidewalk:__default__';
}

function appendIndexedGeometryToSidewalkBatch(groups, regionKeys = [], verts = [], indices = []) {
  if (!(groups instanceof Map) || !Array.isArray(verts) || !Array.isArray(indices) || !verts.length || !indices.length) {
    return null;
  }
  const normalizedKeys = Array.from(new Set(
    (Array.isArray(regionKeys) ? regionKeys : []).filter((key) => typeof key === 'string' && key)
  )).sort();
  const primaryRegionKey = normalizedKeys[0] || '__default__';
  const signature = sidewalkBatchSignature(normalizedKeys, verts);
  let group = groups.get(signature);
  if (!group) {
    group = {
      verts: [],
      indices: [],
      continuousWorldRegionKeys: normalizedKeys,
      userData: {
        sidewalkPrimaryRegionKey: primaryRegionKey,
        sidewalkBatchSignature: signature
      }
    };
    groups.set(signature, group);
  } else {
    group.continuousWorldRegionKeys = mergeRegionKeysIntoBatch(group.continuousWorldRegionKeys, normalizedKeys);
  }
  const vertexOffset = group.verts.length / 3;
  group.verts.push(...verts);
  for (let i = 0; i < indices.length; i++) {
    group.indices.push(indices[i] + vertexOffset);
  }
  return group;
}

function meshBoundsLocal(mesh) {
  const pos = mesh?.geometry?.attributes?.position || null;
  if (!pos || pos.count <= 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const offsetX = Number(mesh.position?.x) || 0;
  const offsetZ = Number(mesh.position?.z) || 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + offsetX;
    const z = pos.getZ(i) + offsetZ;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
    return null;
  }
  return { minX, maxX, minZ, maxZ };
}

function getSurfaceSyncActorPosition() {
  if (appCtx.droneMode && Number.isFinite(appCtx.drone?.x) && Number.isFinite(appCtx.drone?.z)) {
    return { x: Number(appCtx.drone.x), z: Number(appCtx.drone.z) };
  }
  if (Number.isFinite(appCtx.car?.x) && Number.isFinite(appCtx.car?.z)) {
    return { x: Number(appCtx.car.x), z: Number(appCtx.car.z) };
  }
  const walker = appCtx.Walk?.state?.walker || null;
  if (Number.isFinite(walker?.x) && Number.isFinite(walker?.z)) {
    return { x: Number(walker.x), z: Number(walker.z) };
  }
  return null;
}

function getActorLocalSurfaceSyncBounds(radiusOverride = null) {
  const actor = getSurfaceSyncActorPosition();
  if (!actor) return null;
  const radius =
    Number.isFinite(radiusOverride) ?
      Math.max(48, Number(radiusOverride)) :
    appCtx.droneMode ? 120 :
    Math.abs(Number(appCtx.car?.speed || 0)) > 18 ? 240 :
      180;
  const driveAngle = Number(appCtx.car?.angle);
  const driveSpeed = Math.abs(Number(appCtx.car?.speed) || 0);
  const movingDriveCorridor =
    !appCtx.droneMode &&
    !!appCtx.car?.onRoad &&
    Number.isFinite(driveAngle) &&
    driveSpeed > 6;
  if (movingDriveCorridor) {
    const forwardUnitX = Math.sin(driveAngle);
    const forwardUnitZ = Math.cos(driveAngle);
    const rightUnitX = Math.cos(driveAngle);
    const rightUnitZ = -Math.sin(driveAngle);
    const forwardDistance = Math.max(84, radius * 1.15);
    const rearDistance = Math.max(60, radius * 0.42);
    const sideDistance = Math.max(72, Math.min(150, radius * 0.52));
    const corridorPoints = [
      {
        x: actor.x + forwardUnitX * forwardDistance + rightUnitX * sideDistance,
        z: actor.z + forwardUnitZ * forwardDistance + rightUnitZ * sideDistance
      },
      {
        x: actor.x + forwardUnitX * forwardDistance - rightUnitX * sideDistance,
        z: actor.z + forwardUnitZ * forwardDistance - rightUnitZ * sideDistance
      },
      {
        x: actor.x - forwardUnitX * rearDistance + rightUnitX * sideDistance,
        z: actor.z - forwardUnitZ * rearDistance + rightUnitZ * sideDistance
      },
      {
        x: actor.x - forwardUnitX * rearDistance - rightUnitX * sideDistance,
        z: actor.z - forwardUnitZ * rearDistance - rightUnitZ * sideDistance
      }
    ];
    const corridorBounds = pointsBoundsLocal(corridorPoints, 32);
    if (corridorBounds) return corridorBounds;
  }
  return {
    minX: actor.x - radius,
    maxX: actor.x + radius,
    minZ: actor.z - radius,
    maxZ: actor.z + radius
  };
}

function countVisibleRoadShellNearSurfaceSyncActor(radius = 240) {
  if (typeof appCtx.countVisibleRoadMeshesNearWorldPoint !== 'function') return Infinity;
  const actor = getSurfaceSyncActorPosition();
  if (!actor) return Infinity;
  return Number(appCtx.countVisibleRoadMeshesNearWorldPoint(actor.x, actor.z, radius)) || 0;
}

function countDriveableRoadFeaturesNearSurfaceSyncActor(radius = 280) {
  if (typeof appCtx.countDriveableRoadFeaturesNearWorldPoint !== 'function') return Infinity;
  const actor = getSurfaceSyncActorPosition();
  if (!actor) return Infinity;
  return Number(appCtx.countDriveableRoadFeaturesNearWorldPoint(actor.x, actor.z, radius)) || 0;
}

function surfaceSyncSourceIsActorLocal(source = terrain._lastSurfaceSyncSource || '') {
  const value = String(source || '');
  return (
    value === 'terrain_tiles_pending' ||
    value === 'terrain_tiles_changed' ||
    value === 'terrain_near_tile_loaded' ||
    value === 'terrain_center_tile_loaded' ||
    value === 'continuous_world_stream' ||
    value === 'continuous_world_stream_recovery' ||
    value === 'continuous_world_stream_followup' ||
    value === 'load_surface_settle' ||
    value === 'load_surface_settle_bg' ||
    value === 'post_build_spawn_visible_shell' ||
    value === 'startup_visible_road_shell' ||
    value === 'startup_local_roads' ||
    value === 'startup_roads_ready' ||
    value === 'actor_visible_road_gap' ||
    value === 'set_mode_walk' ||
    value === 'set_mode_walk_character' ||
    value === 'set_mode_drone' ||
    value === 'drive_sync'
  );
}

function surfaceSyncSourceIsCriticalRoadRecovery(source = terrain._lastSurfaceSyncSource || '') {
  const value = String(source || '');
  return (
    value === 'continuous_world_stream_recovery' ||
    value === 'actor_visible_road_gap' ||
    value === 'post_build_spawn_visible_shell' ||
    value === 'startup_visible_road_shell' ||
    value === 'startup_local_roads' ||
    value === 'startup_roads_ready' ||
    value === 'drive_sync'
  );
}

function surfaceSyncCriticalRoadRecoveryStillNeeded(source = terrain._lastSurfaceSyncSource || '') {
  if (!surfaceSyncSourceIsCriticalRoadRecovery(source)) return false;
  const movingDrive = !!appCtx.car?.onRoad && Math.abs(Number(appCtx.car?.speed) || 0) > 8;
  const visibleRoadRadius = appCtx.droneMode ? 180 : movingDrive ? 320 : 240;
  const featureRadius = appCtx.droneMode ? 220 : movingDrive ? 360 : 300;
  const visibleRoadShell = countVisibleRoadShellNearSurfaceSyncActor(visibleRoadRadius);
  const driveableRoadFeatures = countDriveableRoadFeaturesNearSurfaceSyncActor(featureRadius);
  const readyVisibleRoads = appCtx.droneMode ? 10 : 16;
  const readyRoadFeatures = appCtx.droneMode ? 40 : 80;
  return (
    visibleRoadShell < readyVisibleRoads ||
    (visibleRoadShell < readyVisibleRoads + 4 && driveableRoadFeatures < readyRoadFeatures)
  );
}

function surfaceSyncStartupLockActive() {
  const stage = String(appCtx.worldBuildStage || '');
  return stage === 'playable_core_loading' || stage === 'playable_core_ready';
}

function shouldDeferStructureVisualsAfterSurfaceSync(partialRebuild, finalBatch) {
  if (!partialRebuild || !finalBatch) return false;
  if (!surfaceSyncSourceIsActorLocal()) return false;
  const source = String(terrain._lastSurfaceSyncSource || '');
  if (
    source === 'load_surface_settle' ||
    source === 'load_surface_settle_bg' ||
    source === 'post_build_spawn_validation'
  ) {
    return true;
  }
  if (
    source === 'continuous_world_stream' ||
    source === 'continuous_world_stream_recovery' ||
    source === 'continuous_world_stream_followup' ||
    source === 'actor_visible_road_gap' ||
    source === 'terrain_tiles_pending' ||
    source === 'terrain_tiles_changed' ||
    source === 'terrain_center_tile_loaded' ||
    source === 'terrain_near_tile_loaded' ||
    source === 'startup_visible_road_shell' ||
    source === 'startup_local_roads' ||
    source === 'startup_roads_ready' ||
    source === 'set_mode_walk' ||
    source === 'set_mode_walk_character' ||
    source === 'set_mode_drone'
  ) {
    return true;
  }
  if (terrain._structureVisualsDirty) return true;

  const frameMs = Number(appCtx.perfStats?.live?.frameMs) || 0;
  const roadPending = Number(terrain._surfaceSyncPendingRoads) || 0;
  const carSpeed = Math.abs(Number(appCtx.car?.speed) || 0);
  const droneSpeed = Math.abs(Number(appCtx.drone?.speed) || 0);
  const movingDrive = !!appCtx.car?.onRoad && carSpeed > 10;
  const movingDrone = !!appCtx.droneMode && droneSpeed > 14;
  const visibleRoadShell = countVisibleRoadShellNearSurfaceSyncActor(movingDrive ? 320 : 240);
  const sourceIsCritical = surfaceSyncCriticalRoadRecoveryStillNeeded();

  if (roadPending > 0) return false;
  if (movingDrive && visibleRoadShell >= 16) return true;
  if (movingDrone && frameMs >= 26) return true;
  if (sourceIsCritical && frameMs >= 34 && visibleRoadShell >= 12) return true;
  return false;
}

function getActiveSurfaceSyncBounds(options = {}) {
  const source = String(options?.source || terrain._lastSurfaceSyncSource || '');
  const mutationState = terrain._surfaceSyncRoadMutationState;
  const mutationBounds = mutationState?.bounds || null;
  const actorLocalAppendMutation =
    mutationState?.type === 'append' &&
    surfaceSyncSourceIsActorLocal(mutationState?.source || source);
  const movementStreamingSource =
    source === 'continuous_world_stream' ||
    source === 'continuous_world_stream_recovery' ||
    source === 'continuous_world_stream_followup' ||
    source === 'actor_visible_road_gap' ||
    source === 'drive_sync' ||
    source === 'set_mode_walk' ||
    source === 'set_mode_walk_character' ||
    source === 'set_mode_drone';
  const emergencyRoadRecovery = surfaceSyncCriticalRoadRecoveryStillNeeded(source);
  const preferActorLocal =
    options?.immediateLocalOnly === true ||
    source === 'terrain_tiles_pending' ||
    source === 'terrain_tiles_changed' ||
    source === 'terrain_center_tile_loaded' ||
    source === 'terrain_near_tile_loaded' ||
    source === 'continuous_world_stream' ||
    source === 'continuous_world_stream_recovery' ||
    source === 'continuous_world_stream_followup' ||
    source === 'load_surface_settle' ||
    source === 'load_surface_settle_bg' ||
    source === 'post_build_spawn_validation' ||
    source === 'post_build_spawn_visible_shell' ||
    source === 'startup_visible_road_shell' ||
    source === 'startup_local_roads' ||
    source === 'startup_roads_ready' ||
    source === 'actor_visible_road_gap' ||
    source === 'set_mode_walk' ||
    source === 'set_mode_walk_character' ||
    source === 'set_mode_drone' ||
    source === 'drive_sync';
  if (preferActorLocal) {
    const actorPriorityRadius =
      source === 'continuous_world_stream_recovery' || source === 'actor_visible_road_gap' ? (appCtx.droneMode ? 180 : 320) :
      source === 'post_build_spawn_visible_shell' || source === 'startup_visible_road_shell' ? 280 :
      source === 'startup_local_roads' || source === 'startup_roads_ready' ? 260 :
      null;
    const localBounds = getActorLocalSurfaceSyncBounds(
      options?.immediateLocalOnly === true ?
        (actorPriorityRadius || (appCtx.droneMode ? 120 : Math.abs(Number(appCtx.car?.speed || 0)) > 18 ? 220 : 180)) :
        null
    );
    if (localBounds) {
      const mergeMutationBounds =
        !!mutationBounds &&
        boundsIntersectLocal(expandBoundsLocal(localBounds, 72), mutationBounds, 24) &&
        (!actorLocalAppendMutation || (emergencyRoadRecovery && !movementStreamingSource));
      const targetBounds = mergeMutationBounds ?
        mergeBoundsLocal(localBounds, expandBoundsLocal(mutationBounds, 18)) :
        localBounds;
      terrain._lastSurfaceSyncTargetBounds = targetBounds;
      return targetBounds;
    }
  }
  const sourceKeys =
    terrain._activeTerrainRequiredKeys instanceof Set && terrain._activeTerrainRequiredKeys.size > 0 ?
      terrain._activeTerrainRequiredKeys :
    terrain._activeTerrainFocusKeys instanceof Set && terrain._activeTerrainFocusKeys.size > 0 ?
      terrain._activeTerrainFocusKeys :
    terrain._activeTerrainNearKeys instanceof Set && terrain._activeTerrainNearKeys.size > 0 ?
      terrain._activeTerrainNearKeys :
      terrain._activeTerrainTileKeys;
  if (!(sourceKeys instanceof Set) || sourceKeys.size === 0) {
    terrain._lastSurfaceSyncTargetBounds = null;
    return null;
  }
  let merged = null;
  sourceKeys.forEach((key) => {
    const mesh = terrain._terrainMeshesByKey.get(key);
    const bounds = meshBoundsLocal(mesh);
    if (!bounds) return;
    if (!merged) {
      merged = { ...bounds };
      return;
    }
    merged.minX = Math.min(merged.minX, bounds.minX);
    merged.maxX = Math.max(merged.maxX, bounds.maxX);
    merged.minZ = Math.min(merged.minZ, bounds.minZ);
    merged.maxZ = Math.max(merged.maxZ, bounds.maxZ);
  });
  const expanded = expandBoundsLocal(merged, 24);
  const targetBounds =
    mutationBounds && expanded && boundsIntersectLocal(expandBoundsLocal(expanded, 48), mutationBounds, 24) ?
      mergeBoundsLocal(expanded, expandBoundsLocal(mutationBounds, 18)) :
      expanded;
  terrain._lastSurfaceSyncTargetBounds = targetBounds;
  return targetBounds;
}

function regionKeySetIntersects(keys, targetSet) {
  if (!(targetSet instanceof Set) || targetSet.size === 0 || !Array.isArray(keys) || keys.length === 0) return false;
  for (let i = 0; i < keys.length; i++) {
    if (targetSet.has(keys[i])) return true;
  }
  return false;
}

function getActiveSurfaceSyncRegionKeys(activeSyncBounds = null) {
  const targetSet = new Set();
  const mutationState = terrain._surfaceSyncRoadMutationState;
  const mutationSource = String(mutationState?.source || terrain._lastSurfaceSyncSource || '');
  const actorLocalAppendMutation =
    mutationState?.type === 'append' &&
    surfaceSyncSourceIsActorLocal(mutationSource);
  const includeMutationRegionKeys =
    !actorLocalAppendMutation ||
    surfaceSyncCriticalRoadRecoveryStillNeeded(mutationSource);
  if (!activeSyncBounds) {
    const snapshot =
      typeof appCtx.getContinuousWorldRuntimeSnapshot === 'function' ?
        appCtx.getContinuousWorldRuntimeSnapshot() :
        null;
    const activeKeys = snapshot?.regionManager?.activeKeys;
    if (Array.isArray(activeKeys)) {
      for (let i = 0; i < activeKeys.length; i++) {
        if (typeof activeKeys[i] === 'string' && activeKeys[i]) targetSet.add(activeKeys[i]);
      }
    }
  }
  if (activeSyncBounds && Array.isArray(appCtx.roads)) {
    for (let i = 0; i < appCtx.roads.length; i++) {
      const road = appCtx.roads[i];
      const roadBounds = road?.bounds || pointsBoundsLocal(road?.pts || [], (Number(road?.width) || 4) * 0.75 + 24);
      if (!roadBounds || !boundsIntersectLocal(roadBounds, activeSyncBounds, 24)) continue;
      const regionKeys =
        Array.isArray(road?.continuousWorldRegionKeys) && road.continuousWorldRegionKeys.length > 0 ?
          road.continuousWorldRegionKeys :
          buildContinuousWorldRegionKeysFromPoints(road?.pts || [], null, roadBounds);
      for (let j = 0; j < regionKeys.length; j++) {
        if (typeof regionKeys[j] === 'string' && regionKeys[j]) targetSet.add(regionKeys[j]);
      }
    }
  }
  if (includeMutationRegionKeys && mutationState && Array.isArray(mutationState.regionKeys)) {
    for (let i = 0; i < mutationState.regionKeys.length; i++) {
      const key = mutationState.regionKeys[i];
      if (typeof key === 'string' && key) targetSet.add(key);
    }
  }
  return targetSet;
}

function recordSurfaceSyncRoadMutation(options = {}) {
  const regionKeys = Array.isArray(options?.regionKeys) ? options.regionKeys.filter((key) => typeof key === 'string' && key) : [];
  const bounds = options?.bounds ? { ...options.bounds } : null;
  const source = String(options?.source || terrain._lastSurfaceSyncSource || '');
  if (!bounds && regionKeys.length === 0) {
    terrain._surfaceSyncRoadMutationState = null;
    return null;
  }
  const previous = terrain._surfaceSyncRoadMutationState;
  const replacePreviousActorLocalAppend =
    String(options?.mutationType || 'unknown') === 'append' &&
    surfaceSyncSourceIsActorLocal(source);
  const mergedRegionKeys = new Set(
    replacePreviousActorLocalAppend ? [] : Array.isArray(previous?.regionKeys) ? previous.regionKeys : []
  );
  for (let i = 0; i < regionKeys.length; i++) mergedRegionKeys.add(regionKeys[i]);
  const nextState = {
    type: String(options?.mutationType || 'unknown'),
    roadCount: Array.isArray(appCtx.roads) ? appCtx.roads.length : 0,
    bounds: replacePreviousActorLocalAppend ? bounds : mergeBoundsLocal(previous?.bounds || null, bounds),
    regionKeys: Array.from(mergedRegionKeys),
    source,
    at: Date.now()
  };
  terrain._surfaceSyncRoadMutationState = nextState;
  return nextState;
}

function mutationStateAllowsScopedRoadSync(mutationState, activeSyncBounds, activeRegionKeySet) {
  if (!mutationState) return false;
  if (Number(mutationState.roadCount || 0) !== (Array.isArray(appCtx.roads) ? appCtx.roads.length : 0)) return false;
  if (!(activeRegionKeySet instanceof Set) || activeRegionKeySet.size === 0) return false;
  const mutationRegionKeys = Array.isArray(mutationState.regionKeys) ? mutationState.regionKeys : [];
  const regionMatch = mutationRegionKeys.length === 0 || regionKeySetIntersects(mutationRegionKeys, activeRegionKeySet);
  const boundsMatch = !mutationState.bounds || !activeSyncBounds || boundsIntersectLocal(mutationState.bounds, activeSyncBounds, 36);
  return regionMatch || boundsMatch;
}

function maybeClearSurfaceSyncRoadMutationState(activeSyncBounds = null, activeRegionKeySet = null, completedRoadCount = 0) {
  const mutationState = terrain._surfaceSyncRoadMutationState;
  if (!mutationState) return;
  if (Number(mutationState.roadCount || 0) !== Number(completedRoadCount || 0)) return;
  const mutationRegionKeys = Array.isArray(mutationState.regionKeys) ? mutationState.regionKeys : [];
  const regionCovered =
    mutationRegionKeys.length === 0 ||
    (activeRegionKeySet instanceof Set && mutationRegionKeys.every((key) => activeRegionKeySet.has(key)));
  const boundsCovered =
    !mutationState.bounds ||
    (activeSyncBounds && boundsContainBoundsLocal(activeSyncBounds, mutationState.bounds, 24));
  if (regionCovered || boundsCovered) {
    terrain._surfaceSyncRoadMutationState = null;
  }
}

function stagedSurfaceSyncTaskStillRelevant(task, currentBounds = null) {
  if (!task || !task.activeSyncBounds || !(task.activeRegionKeySet instanceof Set) || task.activeRegionKeySet.size === 0) {
    return false;
  }
  if (Number(task.roadCount || 0) !== (Array.isArray(appCtx.roads) ? appCtx.roads.length : 0)) return false;
  if (!surfaceSyncSourceIsActorLocal()) return false;
  const actor = getSurfaceSyncActorPosition();
  if (actor) {
    const actorPadding =
      appCtx.droneMode ? 96 :
      Math.abs(Number(appCtx.car?.speed || 0)) > 14 ? 160 :
      112;
    if (!boundsContainsPointLocal(task.activeSyncBounds, actor.x, actor.z, actorPadding)) {
      return false;
    }
  }
  if (currentBounds && !boundsIntersectLocal(expandBoundsLocal(task.activeSyncBounds, 96), currentBounds, 36)) {
    return false;
  }
  return true;
}

function rebuildScopeIncludesRoad(road, bounds = null, regionKeySet = null) {
  if (!road || !Array.isArray(road.pts) || road.pts.length < 2) return false;
  const roadBounds = road.bounds || pointsBoundsLocal(road.pts, (Number(road.width) || 4) * 0.75 + 24);
  if (bounds) {
    return !!roadBounds && boundsIntersectLocal(roadBounds, bounds, 24);
  }
  if (regionKeySet instanceof Set && regionKeySet.size > 0) {
    const regionKeys =
      Array.isArray(road.continuousWorldRegionKeys) && road.continuousWorldRegionKeys.length > 0 ?
        road.continuousWorldRegionKeys :
        buildContinuousWorldRegionKeysFromPoints(road.pts, null, roadBounds || null);
    if (regionKeySetIntersects(regionKeys, regionKeySet)) return true;
  }
  return !bounds;
}

function pruneMeshesForRebuildScope(targetList, regionKeySet = null, bounds = null, options = {}) {
  if (!Array.isArray(targetList) || targetList.length === 0) return [];
  const preserveRebuildToken = String(options?.preserveRebuildToken || '');
  const kept = [];
  const removed = [];
  for (let i = 0; i < targetList.length; i++) {
    const mesh = targetList[i];
    const meshBounds = mesh?.userData?.localBounds || null;
    const boundsMatch = bounds ? boundsIntersectLocal(meshBounds, bounds, 24) : false;
    const regionMatch =
      !bounds &&
      regionKeySetIntersects(mesh?.userData?.continuousWorldRegionKeys, regionKeySet);
    if (!boundsMatch && !regionMatch) {
      kept.push(mesh);
      continue;
    }
    if (preserveRebuildToken && String(mesh?.userData?.surfaceSyncRebuildToken || '') === preserveRebuildToken) {
      kept.push(mesh);
      continue;
    }
    if (mesh?.parent === appCtx.scene) appCtx.scene.remove(mesh);
    if (mesh?.geometry && typeof mesh.geometry.dispose === 'function') mesh.geometry.dispose();
    if (mesh?.material && !mesh.userData?.sharedRoadMaterial && !mesh.userData?.sharedUrbanSurfaceMaterial) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((mat) => mat && typeof mat.dispose === 'function' && mat.dispose());
      } else if (typeof mesh.material.dispose === 'function') {
        mesh.material.dispose();
      }
    }
    removed.push(mesh);
  }
  targetList.length = 0;
  targetList.push(...kept);
  if (removed.length > 0 && targetList === appCtx.roadMeshes && typeof appCtx.markRoadMeshSpatialIndexDirty === 'function') {
    appCtx.markRoadMeshSpatialIndexDirty();
  }
  return removed;
}

function recomputeUrbanSurfaceStats() {
  appCtx.urbanSurfaceStats = {
    sidewalkBatchCount: 0,
    sidewalkVertices: 0,
    sidewalkTriangles: 0,
    skippedBuildingAprons: Number(appCtx.urbanSurfaceStats?.skippedBuildingAprons || 0)
  };
  if (!Array.isArray(appCtx.urbanSurfaceMeshes)) return;
  appCtx.urbanSurfaceMeshes.forEach((mesh) => {
    if (!mesh?.userData?.isSidewalkBatch) return;
    const posCount = Number(mesh.geometry?.attributes?.position?.count || 0);
    const idxCount = Number(mesh.geometry?.index?.count || 0);
    appCtx.urbanSurfaceStats.sidewalkBatchCount += 1;
    appCtx.urbanSurfaceStats.sidewalkVertices += posCount;
    appCtx.urbanSurfaceStats.sidewalkTriangles += idxCount > 0 ? idxCount / 3 : Math.max(0, posCount - 2);
  });
}

function pointInPolygonXZLocal(x, z, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const zi = polygon[i].z;
    const xj = polygon[j].x;
    const zj = polygon[j].z;
    const intersects = (zi > z) !== (zj > z) &&
      x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-9) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointToSegmentDistanceXZLocal(x, z, p1, p2) {
  const dx = p2.x - p1.x;
  const dz = p2.z - p1.z;
  const len2 = dx * dx + dz * dz;
  if (len2 <= 1e-9) return Math.hypot(x - p1.x, z - p1.z);
  let t = ((x - p1.x) * dx + (z - p1.z) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = p1.x + dx * t;
  const pz = p1.z + dz * t;
  return Math.hypot(x - px, z - pz);
}

function distanceToPolygonEdgeXZLocal(x, z, pts) {
  if (!Array.isArray(pts) || pts.length < 2) return Infinity;
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const dist = pointToSegmentDistanceXZLocal(x, z, pts[i], pts[(i + 1) % pts.length]);
    if (dist < best) best = dist;
  }
  return best;
}

function isUrbanLanduseType(type = '') {
  return URBAN_LANDUSE_TYPES.has(type);
}

function isGreenLanduseType(type = '') {
  return GREEN_LANDUSE_TYPES.has(type);
}

function roadSupportsSidewalks(road) {
  const type = String(road?.type || '').toLowerCase();
  if (road?.structureSemantics?.terrainMode && road.structureSemantics.terrainMode !== 'at_grade') return false;
  if (road?.structureSemantics?.rampCandidate) return false;
  const explicitSidewalk = roadHasExplicitSidewalkHint(road);
  if (explicitSidewalk) return true;
  if (!type) return true;
  if (type.includes('motorway') || type.includes('trunk')) return false;
  if (
    type.includes('service') ||
    type.includes('parking_aisle') ||
    type.includes('driveway') ||
    type.includes('alley') ||
    type.includes('_link') ||
    type.includes('link')
  ) {
    return false;
  }
  if (road?.sidewalkHint === 'no' || road?.sidewalkHint === 'none') return false;
  return true;
}

function roadHasExplicitSidewalkHint(road) {
  return (
    road?.sidewalkHint === 'both' ||
    road?.sidewalkHint === 'left' ||
    road?.sidewalkHint === 'right'
  );
}

function roadBaseSidewalkWidth(road, denseUrban = false) {
  const type = String(road?.type || '').toLowerCase();
  let width =
    type.includes('pedestrian') || type.includes('living_street') ? 3.2 :
    type.includes('primary') ? 2.8 :
    type.includes('secondary') ? 2.5 :
    type.includes('tertiary') ? 2.25 :
    type.includes('service') ? 1.5 :
    2.0;
  if (road?.sidewalkHint === 'both') width += 0.35;
  else if (road?.sidewalkHint === 'left' || road?.sidewalkHint === 'right') width += 0.15;
  if (denseUrban) width += 0.2;
  return Math.max(SIDEWALK_MIN_WIDTH, Math.min(3.6, width));
}

function roadTypeFamily(type = '') {
  const normalized = String(type || '').toLowerCase();
  return normalized.replace(/_link$/i, '');
}

function roadPolylineLength(road) {
  const pts = Array.isArray(road?.pts) ? road.pts : [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  }
  return total;
}

function roadConnectedSidewalkContinuity(road, denseUrbanContext, ruralGreenContext) {
  if (!roadSupportsSidewalks(road)) return false;
  if (road?.sidewalkHint === 'no' || road?.sidewalkHint === 'none') return false;
  const roadName = String(road?.name || '').trim().toLowerCase();
  const family = roadTypeFamily(road?.type || '');
  const length = roadPolylineLength(road);
  const shortContinuation = length > 0 && length <= 170;
  const bridgeGapContinuation = length > 0 && length <= 80;
  if (denseUrbanContext && !ruralGreenContext) return true;
  if (ruralGreenContext && !shortContinuation) return false;
  const startConnections = Array.isArray(road?.connectedFeatures?.start) ? road.connectedFeatures.start : [];
  const endConnections = Array.isArray(road?.connectedFeatures?.end) ? road.connectedFeatures.end : [];
  const continuityScoreFor = (entries) => {
    let score = 0;
    let explicitCount = 0;
    let supportiveCount = 0;
    let strongCount = 0;
    let deadEnd = entries.length === 0;
    for (let i = 0; i < entries.length; i++) {
      const other = entries[i]?.feature || null;
      if (!other || !roadSupportsSidewalks(other)) continue;
      if (other?.structureSemantics?.terrainMode && other.structureSemantics.terrainMode !== 'at_grade') continue;
      const otherName = String(other?.name || '').trim().toLowerCase();
      const sameNamedRoad = !!roadName && roadName === otherName;
      const sameFamily = roadTypeFamily(other?.type || '') === family;
      const otherLength = roadPolylineLength(other);
      const otherShort = otherLength > 0 && otherLength <= 170;
      const explicitSidewalk = roadHasExplicitSidewalkHint(other);
      if (!sameNamedRoad && !sameFamily) continue;
      deadEnd = false;
      if (
        explicitSidewalk
      ) {
        explicitCount += 1;
        supportiveCount += 1;
        strongCount += 1;
        score += sameNamedRoad ? 4 : 3;
      } else if (sameNamedRoad) {
        supportiveCount += 1;
        strongCount += (otherShort || shortContinuation) ? 1 : 0;
        score += otherShort || shortContinuation ? 2.25 : 1.6;
      } else if (sameFamily) {
        supportiveCount += 1;
        score += otherShort || shortContinuation ? 1.35 : 0.9;
        if (otherShort || bridgeGapContinuation) strongCount += 1;
      }
    }
    return {
      score,
      explicitCount,
      supportiveCount,
      strongCount,
      deadEnd
    };
  };

  const startScore = continuityScoreFor(startConnections);
  const endScore = continuityScoreFor(endConnections);
  if (startScore.explicitCount + endScore.explicitCount >= 2) return true;
  if (startScore.strongCount > 0 && endScore.supportiveCount > 0) return true;
  if (endScore.strongCount > 0 && startScore.supportiveCount > 0) return true;
  if (shortContinuation && (startScore.score + endScore.score) >= 2.6) return true;
  if (bridgeGapContinuation && (
    (startScore.score >= 1.8 && endScore.deadEnd) ||
    (endScore.score >= 1.8 && startScore.deadEnd)
  )) {
    return true;
  }
  return startScore.score > 0 && endScore.score > 0;
}

function pointInsideBuildingCandidate(x, z, building) {
  if (!building) return false;
  if (Number.isFinite(building.minX) && Number.isFinite(building.maxX) && (
    x < building.minX || x > building.maxX || z < building.minZ || z > building.maxZ
  )) {
    return false;
  }
  if (Array.isArray(building.pts) && building.pts.length >= 3) {
    return pointInPolygonXZLocal(x, z, building.pts);
  }
  return true;
}

function resolveSidewalkWidth(originX, originZ, outwardX, outwardZ, innerOffset, desiredWidth, buildingCandidates) {
  const probes = [
    desiredWidth,
    desiredWidth * 0.82,
    desiredWidth * 0.64,
    desiredWidth * 0.48
  ];
  for (let i = 0; i < probes.length; i++) {
    const width = probes[i];
    if (!Number.isFinite(width) || width < SIDEWALK_MIN_WIDTH) continue;
    const testOffsets = [
      innerOffset + Math.min(0.35, width * 0.35),
      innerOffset + width * 0.58,
      innerOffset + Math.max(0.2, width - 0.15)
    ];
    let blocked = false;
    for (let s = 0; s < testOffsets.length && !blocked; s++) {
      const px = originX + outwardX * testOffsets[s];
      const pz = originZ + outwardZ * testOffsets[s];
      for (let b = 0; b < buildingCandidates.length; b++) {
        const building = buildingCandidates[b];
        if (!pointInsideBuildingCandidate(px, pz, building)) continue;
        if (Array.isArray(building.pts) && building.pts.length >= 3) {
          if (distanceToPolygonEdgeXZLocal(px, pz, building.pts) < SIDEWALK_CLEARANCE) {
            blocked = true;
            break;
          }
        } else {
          blocked = true;
          break;
        }
      }
    }
    if (!blocked) return width;
  }
  return 0;
}

function clampSidewalkWidthTransitions(widths, pts, caps = null, locked = null) {
  if (!(widths instanceof Float32Array) || !Array.isArray(pts) || pts.length !== widths.length || widths.length < 2) return;

  const applyCaps = () => {
    if (!(caps instanceof Float32Array) || caps.length !== widths.length) return;
    for (let i = 0; i < widths.length; i++) {
      widths[i] = Math.min(widths[i], Math.max(0, caps[i]));
    }
  };
  const applyLocks = () => {
    if (!(locked instanceof Uint8Array) || locked.length !== widths.length) return;
    for (let i = 0; i < widths.length; i++) {
      if (locked[i]) widths[i] = 0;
    }
  };

  for (let i = 1; i < widths.length; i++) {
    const segLen = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z) || 1;
    const maxDelta = Math.max(0.35, Math.min(0.95, segLen * 0.22));
    if (widths[i] > widths[i - 1] + maxDelta) widths[i] = widths[i - 1] + maxDelta;
  }
  applyCaps();
  applyLocks();
  for (let i = widths.length - 2; i >= 0; i--) {
    const segLen = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z) || 1;
    const maxDelta = Math.max(0.35, Math.min(0.95, segLen * 0.22));
    if (widths[i] > widths[i + 1] + maxDelta) widths[i] = widths[i + 1] + maxDelta;
  }
  applyCaps();
  applyLocks();

  for (let i = 0; i < widths.length; i++) {
    if (widths[i] < SIDEWALK_SEGMENT_MIN_WIDTH * 0.45) widths[i] = 0;
  }
  applyCaps();
  applyLocks();
}

function smoothSidewalkOuterHeights(heights, widths, pts) {
  if (!(heights instanceof Float32Array) || !(widths instanceof Float32Array) || !Array.isArray(pts) || heights.length !== widths.length || heights.length < 3) return;

  for (let pass = 0; pass < 1; pass++) {
    for (let i = 1; i < heights.length - 1; i++) {
      if (widths[i] <= 0) continue;
      const prevWeight = widths[i - 1] > 0 ? 1 : 0;
      const nextWeight = widths[i + 1] > 0 ? 1 : 0;
      if (!prevWeight && !nextWeight) continue;
      const neighborSum =
        (prevWeight ? heights[i - 1] : 0) +
        (nextWeight ? heights[i + 1] : 0);
      const neighborCount = prevWeight + nextWeight;
      if (!neighborCount) continue;
      heights[i] = heights[i] * 0.68 + (neighborSum / neighborCount) * 0.32;
    }
  }
}

function computeSidewalkCornerScale(pts, index, sideSign) {
  if (!Array.isArray(pts) || index <= 0 || index >= pts.length - 1) return 1;
  const prev = pts[index - 1];
  const curr = pts[index];
  const next = pts[index + 1];
  if (!prev || !curr || !next) return 1;

  const inX = curr.x - prev.x;
  const inZ = curr.z - prev.z;
  const outX = next.x - curr.x;
  const outZ = next.z - curr.z;
  const inLen = Math.hypot(inX, inZ) || 1;
  const outLen = Math.hypot(outX, outZ) || 1;
  const inDirX = inX / inLen;
  const inDirZ = inZ / inLen;
  const outDirX = outX / outLen;
  const outDirZ = outZ / outLen;

  const turnAngle = Math.acos(Math.max(-1, Math.min(1, inDirX * outDirX + inDirZ * outDirZ)));
  if (!Number.isFinite(turnAngle) || turnAngle < 0.14) return 1;

  const turnCross = inDirX * outDirZ - inDirZ * outDirX;
  const insideCorner = turnCross * sideSign > 0.02;
  if (!insideCorner) return 1;

  const severity = Math.max(0, Math.min(1, (turnAngle - 0.14) / 1.1));
  return Math.max(0.18, Math.min(1, 1 - severity * 0.78));
}

function scheduleRoadAndBuildingRebuild() {
  if (!appCtx.terrainEnabled || appCtx.onMoon || appCtx.roads.length === 0) return;
  appCtx.roadsNeedRebuild = true;
  if (terrain._rebuildTimer) return;

  const now = performance.now();
  const elapsed = now - terrain._lastRoadRebuildAt;
  const actorDrivenSource = surfaceSyncSourceIsActorLocal();
  const fastDriving =
    !!appCtx.car?.onRoad &&
    Math.abs(Number(appCtx.car?.speed) || 0) > 18;
  const debounceMs =
    fastDriving && actorDrivenSource ?
      48 :
    fastDriving ?
      Math.max(ROAD_REBUILD_DEBOUNCE_MS, 180) :
      ROAD_REBUILD_DEBOUNCE_MS;
  const minIntervalMs =
    fastDriving && actorDrivenSource ?
      150 :
    fastDriving ?
      Math.max(ROAD_REBUILD_MIN_INTERVAL_MS, 680) :
      ROAD_REBUILD_MIN_INTERVAL_MS;
  const waitMs = elapsed >= minIntervalMs ?
  debounceMs :
  Math.max(debounceMs, minIntervalMs - elapsed);

  terrain._rebuildTimer = setTimeout(() => {
    terrain._rebuildTimer = null;
    if (!appCtx.roadsNeedRebuild || appCtx.onMoon || !appCtx.terrainEnabled || appCtx.roads.length === 0) return;
    if (!canRunRoadAndBuildingRebuildNow()) {
      scheduleRoadAndBuildingRebuild();
      return;
    }
    if (terrain._rebuildInFlight) {
      scheduleRoadAndBuildingRebuild();
      return;
    }
    runRoadAndBuildingRebuildPass(terrain._lastSurfaceSyncSource || 'scheduled');
  }, waitMs);
}

function cancelRoadAndBuildingRebuild(options = {}) {
  const clearPendingFlag = options.clearPendingFlag !== false;
  if (terrain._rebuildTimer) {
    clearTimeout(terrain._rebuildTimer);
    terrain._rebuildTimer = null;
  }
  if (clearPendingFlag) appCtx.roadsNeedRebuild = false;
}

function canRunRoadAndBuildingRebuildNow() {
  if (!appCtx.terrainEnabled || appCtx.onMoon || appCtx.roads.length === 0) return false;
  const actorDrivenSource = surfaceSyncSourceIsActorLocal();
  const criticalRoadRecovery = surfaceSyncSourceIsCriticalRoadRecovery();
  const frameMs = Number(appCtx.perfStats?.live?.frameMs) || 0;
  const visibleRoadShellNearActor = countVisibleRoadShellNearSurfaceSyncActor(
    Math.abs(Number(appCtx.car?.speed) || 0) > 8 ? 320 : 240
  );
  const lowVisibleRoadShell = visibleRoadShellNearActor < 18;
  const drivingFast =
    !appCtx.worldLoading &&
    !!appCtx.car?.onRoad &&
    Math.abs(Number(appCtx.car?.speed) || 0) > ROAD_REBUILD_DRIVE_SPEED_GATE;
  const droneFast =
    !appCtx.worldLoading &&
    !!appCtx.droneMode &&
    Math.abs(Number(appCtx.drone?.speed) || 0) > 18;
  if (
    drivingFast &&
    !(
      (criticalRoadRecovery && frameMs <= 96) ||
      (actorDrivenSource && lowVisibleRoadShell && frameMs <= 92) ||
      (actorDrivenSource && frameMs <= 74)
    )
  ) {
    return false;
  }
  if (droneFast) return false;
  const activeKeys =
    terrain._activeTerrainRequiredKeys instanceof Set && terrain._activeTerrainRequiredKeys.size > 0 ?
      terrain._activeTerrainRequiredKeys :
      terrain._activeTerrainTileKeys;
  if (!(activeKeys instanceof Set) || activeKeys.size === 0) {
    let tilesLoaded = 0;
    let tilesTotal = 0;
    appCtx.terrainTileCache.forEach((tile) => {
      tilesTotal++;
      if (tile?.loaded) tilesLoaded++;
    });
    return tilesLoaded > 0 && tilesTotal > 0;
  }

  let tilesLoaded = 0;
  let tilesTotal = 0;
  let nearLoaded = 0;
  let nearTotal = 0;
  let focusLoaded = 0;
  let focusTotal = 0;
  let centerLoaded = false;

  activeKeys.forEach((key) => {
    tilesTotal++;
    const tile = appCtx.terrainTileCache.get(key);
    if (tile?.loaded) tilesLoaded++;
    if (key === terrain._activeTerrainCenterKey) centerLoaded = !!tile?.loaded;
    if (terrain._activeTerrainNearKeys?.has(key)) {
      nearTotal++;
      if (tile?.loaded) nearLoaded++;
    }
    if (terrain._activeTerrainFocusKeys?.has(key)) {
      focusTotal++;
      if (tile?.loaded) focusLoaded++;
    }
  });

  if (!centerLoaded) return false;
  if (nearTotal > 0 && nearLoaded / nearTotal < 0.55) return false;
  if (focusTotal > 1 && focusLoaded / focusTotal < 0.5) return false;
  return tilesLoaded / Math.max(1, tilesTotal) >= 0.34;
}

function getSurfaceSyncBatchPlan() {
  const frameMs = Number(appCtx.perfStats?.live?.frameMs) || 0;
  const pendingRoads = Number(terrain._surfaceSyncPendingRoads) || 0;
  const movingOnRoad = !!appCtx.car?.onRoad && Math.abs(Number(appCtx.car?.speed) || 0) > 8;
  const actorDrivenSource = surfaceSyncSourceIsActorLocal();
  const source = String(terrain._lastSurfaceSyncSource || '');
  const lowVisibleRoadShell = countVisibleRoadShellNearSurfaceSyncActor(movingOnRoad ? 320 : 240) < 18;
  const recoveryClassSource =
    source === 'continuous_world_stream_recovery' ||
    source === 'actor_visible_road_gap' ||
    source === 'post_build_spawn_visible_shell' ||
    source === 'startup_visible_road_shell';
  const actorPriorityRecoverySource =
    recoveryClassSource &&
    surfaceSyncCriticalRoadRecoveryStillNeeded(source);
  const demotedRecoverySource =
    recoveryClassSource &&
    !actorPriorityRecoverySource;

  if ((actorPriorityRecoverySource || lowVisibleRoadShell) && pendingRoads > 900 && frameMs <= 78) {
    return { maxRoadsPerBatch: 160, minRoadsPerBatch: 32, maxBatchMs: 13, continueWaitMs: 6 };
  }
  if ((actorPriorityRecoverySource || lowVisibleRoadShell) && pendingRoads > 320 && frameMs <= 72) {
    return { maxRoadsPerBatch: 128, minRoadsPerBatch: 24, maxBatchMs: 12, continueWaitMs: 8 };
  }
  if (actorPriorityRecoverySource && pendingRoads > 900 && frameMs <= 70) {
    return { maxRoadsPerBatch: 144, minRoadsPerBatch: 28, maxBatchMs: 12, continueWaitMs: 8 };
  }
  if (actorPriorityRecoverySource && pendingRoads > 320 && frameMs <= 65) {
    return { maxRoadsPerBatch: 112, minRoadsPerBatch: 20, maxBatchMs: 11, continueWaitMs: 10 };
  }
  if (actorPriorityRecoverySource) {
    return { maxRoadsPerBatch: 88, minRoadsPerBatch: 16, maxBatchMs: 10, continueWaitMs: 12 };
  }

  if (demotedRecoverySource && pendingRoads > 640 && frameMs <= 64) {
    return { maxRoadsPerBatch: 72, minRoadsPerBatch: 16, maxBatchMs: 10, continueWaitMs: 12 };
  }
  if (demotedRecoverySource) {
    return { maxRoadsPerBatch: 56, minRoadsPerBatch: 12, maxBatchMs: 8, continueWaitMs: 16 };
  }

  if (actorDrivenSource && pendingRoads > 1000 && frameMs <= 65) {
    return { maxRoadsPerBatch: 96, minRoadsPerBatch: 20, maxBatchMs: 11, continueWaitMs: 10 };
  }
  if (actorDrivenSource && pendingRoads > 420 && frameMs <= 60) {
    return { maxRoadsPerBatch: 72, minRoadsPerBatch: 16, maxBatchMs: 10, continueWaitMs: 12 };
  }
  if (actorDrivenSource && movingOnRoad) {
    return lowVisibleRoadShell ?
      { maxRoadsPerBatch: 88, minRoadsPerBatch: 18, maxBatchMs: 10, continueWaitMs: 10 } :
      { maxRoadsPerBatch: 56, minRoadsPerBatch: 12, maxBatchMs: 8, continueWaitMs: 14 };
  }

  if (frameMs > 50 || pendingRoads > 1400) {
    return {
      maxRoadsPerBatch: ROAD_REBUILD_PARTIAL_BATCH_MIN_SIZE,
      minRoadsPerBatch: 8,
      maxBatchMs: 8,
      continueWaitMs: 42
    };
  }
  if (frameMs > 36 || pendingRoads > 800) {
    return { maxRoadsPerBatch: 24, minRoadsPerBatch: 8, maxBatchMs: 9, continueWaitMs: 32 };
  }
  if (frameMs > 28 || movingOnRoad || pendingRoads > 360) {
    return { maxRoadsPerBatch: 32, minRoadsPerBatch: 10, maxBatchMs: 10, continueWaitMs: 24 };
  }
  return {
    maxRoadsPerBatch: ROAD_REBUILD_PARTIAL_BATCH_SIZE,
    minRoadsPerBatch: 12,
    maxBatchMs: 12,
    continueWaitMs: ROAD_REBUILD_BATCH_CONTINUE_MS
  };
}

function shouldDeferUrbanSurfaceCatchup(partialRebuild = false, finalBatch = true) {
  if (!partialRebuild || !finalBatch) return false;
  const source = String(terrain._lastSurfaceSyncSource || '');
  if (
    source === 'load_surface_settle' ||
    source === 'load_surface_settle_bg' ||
    source === 'post_build_spawn_validation'
  ) {
    return true;
  }
  const actorDrivenSource = surfaceSyncSourceIsActorLocal();
  const criticalRoadRecovery = surfaceSyncSourceIsCriticalRoadRecovery();
  const movingOnRoad = !!appCtx.car?.onRoad && Math.abs(Number(appCtx.car?.speed) || 0) > 8;
  const frameMs = Number(appCtx.perfStats?.live?.frameMs) || 0;
  const lowVisibleRoadShell = countVisibleRoadShellNearSurfaceSyncActor(movingOnRoad ? 320 : 240) < 18;
  return criticalRoadRecovery || (actorDrivenSource && (movingOnRoad || lowVisibleRoadShell || frameMs > 40));
}

function shouldDeferBuildingTerrainCatchup(source = terrain._lastSurfaceSyncSource || '') {
  const value = String(source || '');
  if (!surfaceSyncSourceIsActorLocal(value)) return false;
  const movingDrive = !!appCtx.car?.onRoad && Math.abs(Number(appCtx.car?.speed) || 0) > 8;
  const movingDrone = !!appCtx.droneMode && Math.abs(Number(appCtx.drone?.speed) || 0) > 14;
  if (movingDrive || movingDrone) return true;
  return (
    value === 'terrain_tiles_pending' ||
    value === 'terrain_tiles_changed' ||
    value === 'terrain_near_tile_loaded' ||
    value === 'terrain_center_tile_loaded' ||
    value === 'continuous_world_stream' ||
    value === 'continuous_world_stream_recovery' ||
    value === 'continuous_world_stream_followup' ||
    value === 'load_surface_settle' ||
    value === 'load_surface_settle_bg' ||
    value === 'post_build_spawn_validation' ||
    value === 'actor_visible_road_gap' ||
    value === 'drive_sync'
  );
}

function scheduleDeferredBuildingTerrainCatchup(waitMs = 260) {
  if (terrain._deferredBuildingTerrainTimer) return;
  terrain._deferredBuildingTerrainTimer = setTimeout(() => {
    terrain._deferredBuildingTerrainTimer = null;
    if (!appCtx.terrainEnabled || appCtx.onMoon) return;
    const movingDrive = !!appCtx.car?.onRoad && Math.abs(Number(appCtx.car?.speed) || 0) > 1.5;
    const movingDrone = !!appCtx.droneMode && Math.abs(Number(appCtx.drone?.speed) || 0) > 3;
    const movingWalk =
      appCtx.Walk?.state?.mode === 'walk' &&
      Math.abs(Number(appCtx.Walk?.state?.walker?.speedMph || 0)) > 0.35;
    if (movingDrive || movingDrone || movingWalk) {
      scheduleDeferredBuildingTerrainCatchup(Math.max(420, waitMs));
      return;
    }
    if (terrain._rebuildInFlight || terrain._rebuildTimer || appCtx.roadsNeedRebuild) {
      scheduleDeferredBuildingTerrainCatchup(Math.max(260, waitMs));
      return;
    }
    repositionBuildingsWithTerrain();
  }, Math.max(0, waitMs));
}

function queuePendingSurfaceSyncBatch(waitMs = ROAD_REBUILD_BATCH_CONTINUE_MS) {
  if (terrain._rebuildTimer) return;
  terrain._rebuildTimer = setTimeout(() => {
    terrain._rebuildTimer = null;
    if (!appCtx.roadsNeedRebuild || appCtx.onMoon || !appCtx.terrainEnabled || appCtx.roads.length === 0) return;
    if (!canRunRoadAndBuildingRebuildNow()) {
      scheduleRoadAndBuildingRebuild();
      return;
    }
    if (terrain._rebuildInFlight) {
      queuePendingSurfaceSyncBatch(waitMs);
      return;
    }
    runRoadAndBuildingRebuildPass(terrain._lastSurfaceSyncSource || 'batched');
  }, Math.max(0, waitMs));
}

function runRoadAndBuildingRebuildPass(source = 'scheduled', options = {}) {
  terrain._rebuildInFlight = true;
  const syncStartedAt = performance.now();
  const batchPlan = getSurfaceSyncBatchPlan();
  let completed = false;
  try {
    completed = rebuildRoadsWithTerrain({
      maxRoadsPerBatch: batchPlan.maxRoadsPerBatch,
      minRoadsPerBatch: batchPlan.minRoadsPerBatch,
      maxBatchMs: batchPlan.maxBatchMs,
      immediateLocalOnly: options?.immediateLocalOnly === true
    });
    if (completed) {
      if (shouldDeferBuildingTerrainCatchup(source)) {
        scheduleDeferredBuildingTerrainCatchup();
      } else {
        repositionBuildingsWithTerrain();
      }
      if (typeof appCtx.invalidateRoadCache === 'function') appCtx.invalidateRoadCache();
      terrain._lastRoadRebuildAt = performance.now();
    }
    recordSurfaceSyncMetrics(source, performance.now() - syncStartedAt);
    return completed;
  } finally {
    terrain._rebuildInFlight = false;
    if (!completed && terrain._activeSurfaceSyncTask) {
      queuePendingSurfaceSyncBatch(batchPlan.continueWaitMs);
    } else if (appCtx.roadsNeedRebuild) {
      scheduleRoadAndBuildingRebuild();
    }
  }
}

function requestWorldSurfaceSync(options = {}) {
  if (!appCtx.terrainEnabled || appCtx.onMoon || appCtx.roads.length === 0) return false;
  const source = String(options.source || 'unknown');
  const hasMutationScope = !!options?.mutationType || !!options?.bounds || Array.isArray(options?.regionKeys);
  const pendingSurfaceWork =
    !!terrain._rebuildTimer ||
    !!terrain._rebuildInFlight ||
    !!terrain._activeSurfaceSyncTask;
  const repeatedActorPendingRequest =
    !hasMutationScope &&
    !options.force &&
    appCtx.roadsNeedRebuild &&
    pendingSurfaceWork &&
    (source === 'terrain_tiles_pending' || source === 'terrain_tiles_changed') &&
    (terrain._lastSurfaceSyncSource === source || surfaceSyncSourceIsActorLocal(source));
  if (repeatedActorPendingRequest) {
    return false;
  }
  if (source === 'load_surface_settle_bg' && pendingSurfaceWork) {
    return false;
  }
  if (
    source === 'load_surface_settle' &&
    pendingSurfaceWork &&
    appCtx.roadsNeedRebuild
  ) {
    return false;
  }
  if (
    source === 'post_build_spawn_validation' &&
    pendingSurfaceWork &&
    appCtx.roadsNeedRebuild
  ) {
    return false;
  }
  const startupLockActive = surfaceSyncStartupLockActive();
  const genericStartupBackgroundSource =
    source === 'terrain_tiles_changed' ||
    source === 'terrain_tiles_pending' ||
    source === 'continuous_world_stream' ||
    source === 'continuous_world_stream_followup' ||
    source === 'load_surface_settle_bg';
  if (
    startupLockActive &&
    genericStartupBackgroundSource &&
    (
      pendingSurfaceWork ||
      (appCtx.roadsNeedRebuild && surfaceSyncSourceIsCriticalRoadRecovery(terrain._lastSurfaceSyncSource || ''))
    )
  ) {
    return false;
  }
  const droneDeferrableSource =
    appCtx.droneMode &&
    (
      source === 'terrain_tiles_changed' ||
      source === 'terrain_tiles_pending' ||
      source === 'continuous_world_stream' ||
      source === 'continuous_world_stream_followup'
    );
  if (droneDeferrableSource && options.force !== true) {
    terrain._deferredDroneSurfaceSync = true;
    terrain._lastSurfaceSyncSource = source;
    return false;
  }
  terrain._surfaceSyncRequestCount += 1;
  terrain._lastSurfaceSyncSource = source;
  if (hasMutationScope) {
    recordSurfaceSyncRoadMutation(options);
  } else if (terrain._surfaceSyncRoadMutationState) {
    terrain._surfaceSyncRoadMutationState.source = source;
  }
  appCtx.roadsNeedRebuild = true;

  const force = options.force === true;
  const deferOnly = options.deferOnly === true;
  if (force && terrain._rebuildTimer) {
    clearTimeout(terrain._rebuildTimer);
    terrain._rebuildTimer = null;
  }

  if (deferOnly) {
    scheduleRoadAndBuildingRebuild();
    return false;
  }

  if (!force || terrain._rebuildInFlight || !canRunRoadAndBuildingRebuildNow()) {
    scheduleRoadAndBuildingRebuild();
    return false;
  }
  return runRoadAndBuildingRebuildPass(terrain._lastSurfaceSyncSource || 'forced', {
    immediateLocalOnly: true
  });
}

function primeRoadSurfaceSyncState(options = {}) {
  const mutationType = String(options?.mutationType || '').trim();
  const hasMutationScope = !!mutationType || !!options?.bounds || Array.isArray(options?.regionKeys);
  const clearHeightCache = options.clearHeightCache !== false;
  if (hasMutationScope) {
    const source = String(options?.source || terrain._lastSurfaceSyncSource || '');
    const actorPriorityAppend =
      mutationType === 'append' &&
      (
        source === 'startup_road_preload' ||
        source === 'startup_local_roads' ||
        source === 'startup_visible_road_shell' ||
        source === 'startup_roads_ready' ||
        source === 'actor_visible_road_gap' ||
        source === 'continuous_world_stream_recovery'
      );
    const preserveActiveTask = options.preserveActiveTask === true && !actorPriorityAppend;
    terrain._lastRoadCount = Array.isArray(appCtx.roads) ? appCtx.roads.length : 0;
    recordSurfaceSyncRoadMutation(options);
    if (options.invalidateIntersections === true) {
      terrain._cachedIntersections = null;
    }
    if (!preserveActiveTask) {
      terrain._activeSurfaceSyncTask = null;
      terrain._surfaceSyncPendingRoads = 0;
      terrain._surfaceSyncLastBatchRoads = 0;
    }
    if (clearHeightCache) clearTerrainHeightCache();
    return;
  }
  terrain._lastRoadCount = Array.isArray(appCtx.roads) ? appCtx.roads.length : 0;
  terrain._cachedIntersections = null;
  terrain._activeSurfaceSyncTask = null;
  terrain._surfaceSyncPendingRoads = 0;
  terrain._surfaceSyncLastBatchRoads = 0;
  terrain._surfaceSyncRoadMutationState = null;
  if (clearHeightCache) clearTerrainHeightCache();
}

function getCachedMeshLocalBounds(mesh, footprintKey) {
  if (!mesh) return null;
  const cached =
    mesh.userData?.localBounds ||
    mesh.userData?.cachedLocalBounds ||
    mesh.userData?.[footprintKey] ||
    null;
  if (
    Number.isFinite(cached?.minX) &&
    Number.isFinite(cached?.maxX) &&
    Number.isFinite(cached?.minZ) &&
    Number.isFinite(cached?.maxZ)
  ) {
    return cached;
  }
  const pts = mesh.userData?.buildingFootprint || mesh.userData?.landuseFootprint || null;
  if (!Array.isArray(pts) || pts.length === 0) return null;
  const bounds = pointsBoundsLocal(pts, 6);
  if (!bounds) return null;
  mesh.userData.cachedLocalBounds = bounds;
  if (footprintKey) mesh.userData[footprintKey] = bounds;
  if (!mesh.userData.localBounds) mesh.userData.localBounds = bounds;
  return bounds;
}

// =====================
// TERRAIN MESH GRID SAMPLER
// Reads vertex heights directly from terrain mesh geometry - O(1) per query.
// This gives the exact same height as the rendered terrain surface without
// expensive raycasting (which was O(triangles) and caused browser freezes).
// =====================
function terrainMeshHeightAt(x, z) {
  if (!appCtx.terrainGroup || appCtx.terrainGroup.children.length === 0) {
    return elevationWorldYAtWorldXZ(x, z);
  }

  const segs = appCtx.TERRAIN_SEGMENTS;
  const vps = segs + 1; // vertices per side

  for (let c = 0; c < appCtx.terrainGroup.children.length; c++) {
    const mesh = appCtx.terrainGroup.children[c];
    const info = mesh.userData?.terrainTile;
    if (!info) continue;

    const pos = mesh.geometry.attributes.position;
    if (!pos || pos.count < 4) continue;

    // Convert world position to mesh local space
    const lx = x - mesh.position.x;
    const lz = z - mesh.position.z;

    // Get mesh extents from corner vertices
    // Vertex 0 = top-left (-width/2, ?, -depth/2)
    // Vertex [segs] = top-right (width/2, ?, -depth/2)
    // Vertex [segs*vps] = bottom-left (-width/2, ?, depth/2)
    const x0 = pos.getX(0);
    const x1 = pos.getX(segs);
    const z0 = pos.getZ(0);
    const z1 = pos.getZ(segs * vps);

    // Bounds check - is point within this terrain tile?
    if (lx < x0 || lx > x1 || lz < z0 || lz > z1) continue;

    // Compute grid cell coordinates
    const fx = (lx - x0) / (x1 - x0) * segs;
    const fz = (lz - z0) / (z1 - z0) * segs;

    const col = Math.max(0, Math.min(segs - 1, Math.floor(fx)));
    const row = Math.max(0, Math.min(segs - 1, Math.floor(fz)));

    const sx = fx - col; // 0..1 within cell
    const sz = fz - row;

    // Get four corner vertex Y values + mesh base position
    const baseY = mesh.position.y;
    const y00 = pos.getY(row * vps + col) + baseY;
    const y10 = pos.getY(row * vps + col + 1) + baseY;
    const y01 = pos.getY((row + 1) * vps + col) + baseY;
    const y11 = pos.getY((row + 1) * vps + col + 1) + baseY;

    // Bilinear interpolation - matches GPU linear triangle interpolation
    const y0 = y00 + (y10 - y00) * sx;
    const y1 = y01 + (y11 - y01) * sx;
    return y0 + (y1 - y0) * sz;
  }

  // Point not on any terrain tile - use raw elevation
  return elevationWorldYAtWorldXZ(x, z);
}

// =====================
// TERRAIN HEIGHT CACHE
// Cache terrain height lookups to avoid repeated queries during road generation
// =====================
const terrainHeightCache = new Map();
const baseTerrainHeightCache = new Map();
let terrainHeightCacheEnabled = true;

function baseTerrainHeightAt(x, z) {
  const { lat, lon } = worldToLatLon(x, z);
  const t = latLonToTileXY(lat, lon, appCtx.TERRAIN_ZOOM);
  const tile = getOrLoadTerrainTile(appCtx.TERRAIN_ZOOM, t.x, t.y);
  if (tile.loaded) {
    const u = t.xf - t.x;
    const v = t.yf - t.y;
    const meters = clampElevationMeters(sampleTileElevationMeters(tile, u, v));
    return meters * appCtx.WORLD_UNITS_PER_METER * appCtx.TERRAIN_Y_EXAGGERATION;
  }
  const meshY = terrainMeshHeightAt(x, z);
  if (Number.isFinite(meshY)) return meshY;
  return elevationWorldYAtWorldXZ(x, z);
}

function cachedBaseTerrainHeight(x, z) {
  const key = `${Math.round(x * 10)},${Math.round(z * 10)}`;
  if (baseTerrainHeightCache.has(key)) return baseTerrainHeightCache.get(key);
  const h = baseTerrainHeightAt(x, z);
  baseTerrainHeightCache.set(key, h);
  return h;
}

function applyStructureTerrainCuts(worldX, worldZ, terrainY) {
  if (!Array.isArray(appCtx.structureTerrainCuts) || appCtx.structureTerrainCuts.length === 0 || !Number.isFinite(terrainY)) {
    return terrainY;
  }

  let adjustedY = terrainY;
  for (let i = 0; i < appCtx.structureTerrainCuts.length; i++) {
    const cut = appCtx.structureTerrainCuts[i];
    if (!cut?.feature || !cut?.bounds) continue;
    if (worldX < cut.bounds.minX || worldX > cut.bounds.maxX || worldZ < cut.bounds.minZ || worldZ > cut.bounds.maxZ) continue;

    const projected = projectPointToFeature(cut.feature, worldX, worldZ);
    if (!projected) continue;
    const width = Math.max(4.5, Number(cut.width) || Number(cut.feature?.width) || 6);
    const influenceRadius = width * 0.88 + 4.2;
    if (!Number.isFinite(projected.dist) || projected.dist > influenceRadius) continue;

    const surfaceY = sampleFeatureSurfaceY(cut.feature, worldX, worldZ, projected);
    if (!Number.isFinite(surfaceY)) continue;

    const clearance = Math.max(3.1, Number(cut.clearance) || 3.8);
    const targetY = surfaceY - clearance;
    if (!(targetY < adjustedY - 0.05)) continue;

    const lateralT = Math.max(0, Math.min(1, projected.dist / Math.max(0.5, influenceRadius)));
    let fade = 1 - (lateralT * lateralT * (3 - 2 * lateralT));
    const distances = cut.feature?.surfaceDistances;
    const points = cut.feature?.pts;
    if (distances instanceof Float32Array && Array.isArray(points) && points.length >= 2) {
      const lastIndex = distances.length - 1;
      const p1 = points[projected.segIndex];
      const p2 = points[projected.segIndex + 1];
      const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
      const distanceAlong = (Number(distances[projected.segIndex]) || 0) + segLen * projected.t;
      const totalDistance = Number(distances[lastIndex]) || 0;
      const portalLength = Math.max(6, Number(cut.portalLength) || 0);
      if (portalLength > 0 && totalDistance > 0) {
        const portalDistance = Math.min(distanceAlong, Math.max(0, totalDistance - distanceAlong));
        const portalT = Math.max(0, Math.min(1, portalDistance / portalLength));
        const portalFade = portalT * portalT * (3 - 2 * portalT);
        fade *= 0.24 + portalFade * 0.76;
      }
    }
    adjustedY = Math.min(adjustedY, adjustedY + (targetY - adjustedY) * fade);
  }

  return adjustedY;
}

function pointAlongPolyline(points = [], distance = 0) {
  if (!Array.isArray(points) || points.length === 0) return null;
  if (points.length === 1) return { x: points[0].x, z: points[0].z, tangentX: 1, tangentZ: 0 };
  let remaining = Math.max(0, Number(distance) || 0);
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const segLen = Math.hypot(dx, dz);
    if (segLen <= 1e-6) continue;
    if (remaining <= segLen) {
      const t = remaining / segLen;
      return {
        x: p1.x + dx * t,
        z: p1.z + dz * t,
        tangentX: dx / segLen,
        tangentZ: dz / segLen
      };
    }
    remaining -= segLen;
  }
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const dx = last.x - prev.x;
  const dz = last.z - prev.z;
  const len = Math.hypot(dx, dz) || 1;
  return {
    x: last.x,
    z: last.z,
    tangentX: dx / len,
    tangentZ: dz / len
  };
}

function polylineCurvatureMetric(points = []) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  let totalTurn = 0;
  let samples = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    const ax = curr.x - prev.x;
    const az = curr.z - prev.z;
    const bx = next.x - curr.x;
    const bz = next.z - curr.z;
    const aLen = Math.hypot(ax, az);
    const bLen = Math.hypot(bx, bz);
    if (!(aLen > 1e-5) || !(bLen > 1e-5)) continue;
    const dot = Math.max(-1, Math.min(1, (ax * bx + az * bz) / (aLen * bLen)));
    totalTurn += Math.acos(dot);
    samples += 1;
  }
  return samples > 0 ? totalTurn / samples : 0;
}

function countNearbyElevatedFeatures(feature, elevatedFeatures, padding = 28) {
  const featureBounds = feature?.bounds || polylineBounds(feature?.pts || [], (Number(feature?.width) || 4) + padding);
  if (!featureBounds) return 0;
  let count = 0;
  for (let i = 0; i < elevatedFeatures.length; i++) {
    const other = elevatedFeatures[i];
    if (!other || other === feature) continue;
    const otherBounds = other.bounds || polylineBounds(other.pts || [], (Number(other.width) || 4) + padding);
    if (!otherBounds) continue;
    if (boundsIntersectLocal(featureBounds, otherBounds, padding)) count += 1;
  }
  return count;
}

function maxTransitionAnchorOffset(feature) {
  const anchors = Array.isArray(feature?.structureTransitionAnchors) ? feature.structureTransitionAnchors : [];
  let maxOffset = 0;
  for (let i = 0; i < anchors.length; i++) {
    maxOffset = Math.max(maxOffset, Math.abs(Number(anchors[i]?.targetOffset) || 0));
  }
  return maxOffset;
}

function isTransitionVisualCandidate(feature) {
  const semantics = feature?.structureSemantics || null;
  if (!feature || !semantics || semantics.terrainMode === 'elevated') return false;
  const roadType = String(feature?.type || '').toLowerCase();
  const linkLike = /(?:^|_)link$/i.test(roadType);
  const rampLike = semantics.rampCandidate === true || linkLike;
  if (!rampLike) return false;
  const anchors = Array.isArray(feature?.structureTransitionAnchors) ? feature.structureTransitionAnchors : [];
  if (anchors.length === 0) return false;
  return maxTransitionAnchorOffset(feature) >= 2.5;
}

function collectStructureVisualInstances(options = {}) {
  const targetBounds = options?.bounds || null;
  const targetRegionKeySet = options?.regionKeys instanceof Set ? options.regionKeys : null;
  const includeFeature = (feature) => rebuildScopeIncludesRoad(feature, targetBounds, targetRegionKeySet);
  const supportInstances = [];
  const portalInstances = [];
  const deckInstances = [];
  const girderInstances = [];
  const capInstances = [];
  const wallInstances = [];
  const roofInstances = [];
  const elevatedFeatures = []
    .concat(Array.isArray(appCtx.roads) ? appCtx.roads : [])
    .concat(Array.isArray(appCtx.linearFeatures) ? appCtx.linearFeatures.filter((feature) => feature?.isStructureConnector === true) : []);
  const elevatedVisualFeatures = elevatedFeatures.filter((feature) =>
    (
      feature?.structureSemantics?.terrainMode === 'elevated' ||
      isTransitionVisualCandidate(feature)
    ) &&
    Array.isArray(feature?.pts) &&
    feature.pts.length >= 2 &&
    includeFeature(feature)
  );

  const addSupportInstance = (instance, regionKeys = null) => {
    if (!instance || !(instance.scaleY > 0.5)) return;
    if (Array.isArray(regionKeys) && regionKeys.length > 0) {
      instance.continuousWorldRegionKeys = regionKeys;
    }
    supportInstances.push(instance);
  };

  const addPortalBeam = (x, y, z, sx, sy, sz, rotationY = 0, regionKeys = null) => {
    if (!(sx > 0 && sy > 0 && sz > 0)) return;
    portalInstances.push({
      x,
      y,
      z,
      scaleX: sx,
      scaleY: sy,
      scaleZ: sz,
      rotationY,
      continuousWorldRegionKeys: Array.isArray(regionKeys) && regionKeys.length > 0 ? regionKeys : undefined
    });
  };

  const addDeckBody = (x, y, z, width, thickness, depth, rotationY = 0, quaternion = null, regionKeys = null) => {
    if (!(width > 0.4 && thickness > 0.12 && depth > 0.35)) return;
    deckInstances.push({
      x,
      y,
      z,
      scaleX: width,
      scaleY: thickness,
      scaleZ: depth,
      rotationY,
      quaternion,
      continuousWorldRegionKeys: Array.isArray(regionKeys) && regionKeys.length > 0 ? regionKeys : undefined
    });
  };

  const addBeam = (collection, x, y, z, sx, sy, sz, rotationY = 0, quaternion = null, regionKeys = null) => {
    if (!(sx > 0.08 && sy > 0.08 && sz > 0.2)) return;
    collection.push({
      x,
      y,
      z,
      scaleX: sx,
      scaleY: sy,
      scaleZ: sz,
      rotationY,
      quaternion,
      continuousWorldRegionKeys: Array.isArray(regionKeys) && regionKeys.length > 0 ? regionKeys : undefined
    });
  };

  const deckQuaternionForSegment = (p1, y1, p2, y2) => {
    const dx = p2.x - p1.x;
    const dy = y2 - y1;
    const dz = p2.z - p1.z;
    const length = Math.hypot(dx, dy, dz);
    if (!(length > 1e-5) || typeof THREE === 'undefined') return null;
    const direction = new THREE.Vector3(dx / length, dy / length, dz / length);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      direction
    );
    return { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w, length };
  };

  for (let i = 0; i < elevatedFeatures.length; i++) {
    const feature = elevatedFeatures[i];
    if (!includeFeature(feature)) continue;
    const semantics = feature?.structureSemantics;
    if (!feature || !Array.isArray(feature.pts) || feature.pts.length < 2 || !semantics) continue;
    const category = String(semantics.featureCategory || feature.networkKind || feature.kind || 'road').toLowerCase();
    const isConnectorLike = category === 'connector' || category === 'footway';
    const isSkywalk = semantics.skywalk === true;
    const enclosedSkywalk = isSkywalk && (semantics.covered || semantics.indoor);
    const suppressExteriorVisuals = semantics.embeddedInBuilding === true;
    const roadLinkFeature = /(?:^|_)link$/i.test(String(feature?.type || ''));
    const localRoadType = String(feature?.type || '').toLowerCase();
    const lowPriorityRoadVisual =
      !isConnectorLike &&
      /^(service|residential|unclassified|living_street|track)$/.test(localRoadType);
    const visualDetail =
      semantics.terrainMode === 'elevated' ?
        (isConnectorLike || isSkywalk ? 1.6 : 2.1) :
        0.8;
    const visualPts =
      typeof appCtx.subdivideRoadPoints === 'function' && feature.pts.length >= 2 ?
        appCtx.subdivideRoadPoints(feature.pts, visualDetail) :
        feature.pts;
    const featureRegionKeys = buildContinuousWorldRegionKeysFromPoints(visualPts, null, feature?.bounds || null);
    const structurePts = Array.isArray(visualPts) && visualPts.length >= 2 ? visualPts : feature.pts;
    const { distances, total } = polylineDistances(structurePts);
    const curvatureMetric = polylineCurvatureMetric(structurePts);
    const nearbyElevatedCount = semantics.terrainMode === 'elevated' ?
      countNearbyElevatedFeatures(feature, elevatedVisualFeatures) :
      0;
    const transitionVisualCandidate =
      !isConnectorLike &&
      !isSkywalk &&
      !suppressExteriorVisuals &&
      isTransitionVisualCandidate(feature);
    const rampVisualSuppressed =
      !isConnectorLike &&
      !isSkywalk &&
      (
        (!transitionVisualCandidate && roadLinkFeature) ||
        (!transitionVisualCandidate && !!semantics.rampCandidate) ||
        (total > 0 && total < 150 && nearbyElevatedCount >= 2) ||
        (total > 0 && total < 210 && curvatureMetric >= 0.12)
      );
    const transitionAnchorDistances =
      Array.isArray(feature?.structureTransitionAnchors) && feature.structureTransitionAnchors.length > 0 ?
        feature.structureTransitionAnchors
          .map((anchor) => Number(anchor?.distance))
          .filter((distance) => Number.isFinite(distance)) :
        [];
    if (semantics.terrainMode === 'elevated' || transitionVisualCandidate) {
      if (suppressExteriorVisuals) continue;
      const simpleRoadSpan = !isConnectorLike && !isSkywalk;
      const clutteredInterchange =
        !isConnectorLike &&
        !isSkywalk &&
        (
          rampVisualSuppressed ||
          roadLinkFeature ||
          !!semantics.rampCandidate ||
          (lowPriorityRoadVisual && nearbyElevatedCount >= 1) ||
          (total < 120 && nearbyElevatedCount >= 2) ||
          (nearbyElevatedCount >= 4) ||
          (curvatureMetric >= 0.22) ||
          (transitionAnchorDistances.length >= 2 && nearbyElevatedCount >= 2)
        );
      const renderRoadFullDeckBody = false;
      const renderRoadSideGirders = false;
      const renderRoadSupports =
        !isConnectorLike &&
        !isSkywalk &&
        total >= 18;
      const renderRoadAbutments = false;
      const renderCapBeams = enclosedSkywalk;
      const width = Math.max(2, Number(feature.width) || 4);
      const deckThickness = isConnectorLike ? 0.72 : Math.max(0.9, Math.min(1.6, width * 0.11));
      const girderDepth = isConnectorLike ? Math.max(0.34, deckThickness * 0.65) : Math.max(0.58, deckThickness * 0.72);
      for (let segIndex = 0; segIndex < structurePts.length - 1; segIndex++) {
        const p1 = structurePts[segIndex];
        const p2 = structurePts[segIndex + 1];
        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const segLen = Math.hypot(dx, dz);
        if (!(segLen > 0.35)) continue;
        const startY = sampleFeatureSurfaceY(feature, p1.x, p1.z);
        const endY = sampleFeatureSurfaceY(feature, p2.x, p2.z);
        const midX = (p1.x + p2.x) * 0.5;
        const midZ = (p1.z + p2.z) * 0.5;
        const deckY = sampleFeatureSurfaceY(feature, midX, midZ);
        if (!Number.isFinite(deckY) || !Number.isFinite(startY) || !Number.isFinite(endY)) continue;
        const rotationY = Math.atan2(dx, dz);
        const nx = -dz / (segLen || 1);
        const nz = dx / (segLen || 1);
        const segmentQuat = deckQuaternionForSegment(p1, startY, p2, endY);
        const deckDepth = segmentQuat?.length || segLen;
        const segmentStartDistance = Number(distances[segIndex]) || 0;
        const segmentEndDistance = Number(distances[segIndex + 1]) || segmentStartDistance + segLen;
        const segmentCenterDistance = (segmentStartDistance + segmentEndDistance) * 0.5;
        const slopeRatio = Math.abs(endY - startY) / Math.max(1, segLen);
        const terrainMidY = cachedTerrainHeight(midX, midZ);
        const segmentClearance = deckY - terrainMidY;
        const transitionVisualGap = Math.max(16, Math.min(42, width * 2.6));
        const nearTransitionVisual =
          !isConnectorLike &&
          !isSkywalk &&
          (
            segmentCenterDistance < transitionVisualGap ||
            segmentCenterDistance > Math.max(0, total - transitionVisualGap) ||
            transitionAnchorDistances.some((distance) => Math.abs(segmentCenterDistance - distance) < transitionVisualGap)
          );
        const rampVisualScale =
          isConnectorLike || isSkywalk ?
            1 :
            Math.max(0.24, 1 - Math.max(0, slopeRatio - 0.01) / 0.065);
        const renderMinimalRoadDeckBody = false;
        const renderTransitionDeckBody = false;
        const renderDeckBody =
          (
            enclosedSkywalk ||
            renderMinimalRoadDeckBody ||
            renderTransitionDeckBody
          );
        const renderSideGirders =
          !simpleRoadSpan &&
          !transitionVisualCandidate &&
          !nearTransitionVisual &&
          (
            enclosedSkywalk ||
            renderRoadSideGirders
          );
        const deckBodyThickness =
          enclosedSkywalk ?
            deckThickness :
            (
              Math.max(0.05, Math.min(0.11, width * 0.009)) * (0.94 + rampVisualScale * 0.06)
            );
        const deckBodyWidth =
          enclosedSkywalk ?
            width + 0.5 :
            width + 0.02 + rampVisualScale * 0.04;
        if (renderDeckBody) {
          addDeckBody(
            midX,
            deckY - deckBodyThickness * 0.5 - 0.04,
            midZ,
            deckBodyWidth,
            deckBodyThickness,
            deckDepth,
            rotationY,
            segmentQuat,
            featureRegionKeys
          );
        }

        const sideOffset = Math.max(0.7, width * 0.34);
        const sideBeamWidth =
          isConnectorLike ?
            0.24 :
            Math.max(0.12, Math.min(0.24, width * 0.022));
        const sideGirderDepth =
          isConnectorLike || isSkywalk ?
            girderDepth :
            Math.max(0.14, Math.min(0.24, girderDepth * 0.34));
        if (renderSideGirders) {
          addBeam(
            girderInstances,
            midX + nx * sideOffset,
            deckY - deckBodyThickness + sideGirderDepth * 0.5,
            midZ + nz * sideOffset,
            sideBeamWidth,
            sideGirderDepth,
            deckDepth,
            rotationY,
            segmentQuat,
            featureRegionKeys
          );
          addBeam(
            girderInstances,
            midX - nx * sideOffset,
            deckY - deckBodyThickness + sideGirderDepth * 0.5,
            midZ - nz * sideOffset,
            sideBeamWidth,
            sideGirderDepth,
            deckDepth,
            rotationY,
            segmentQuat,
            featureRegionKeys
          );
          if (!isConnectorLike && width > 9.5 && rampVisualScale >= 0.82) {
            addBeam(
              girderInstances,
              midX,
              deckY - deckBodyThickness + sideGirderDepth * 0.44,
              midZ,
              Math.max(0.26, Math.min(0.52, width * 0.05)),
              Math.max(0.28, sideGirderDepth * 0.82),
              deckDepth,
              rotationY,
              segmentQuat,
              featureRegionKeys
            );
          }
        }

        if (enclosedSkywalk) {
          const wallHeight = Math.max(1.8, Math.min(2.7, width * 0.22 + 1.2));
          const wallThickness = 0.18;
          const wallOffset = Math.max(0.8, width * 0.48);
          addBeam(
            wallInstances,
            midX + nx * wallOffset,
            deckY + wallHeight * 0.5,
            midZ + nz * wallOffset,
            wallThickness,
            wallHeight,
            deckDepth,
            rotationY,
            segmentQuat,
            featureRegionKeys
          );
          addBeam(
            wallInstances,
            midX - nx * wallOffset,
            deckY + wallHeight * 0.5,
            midZ - nz * wallOffset,
            wallThickness,
            wallHeight,
            deckDepth,
            rotationY,
            segmentQuat,
            featureRegionKeys
          );
          addBeam(
            roofInstances,
            midX,
            deckY + wallHeight + 0.12,
            midZ,
            width + 0.36,
            0.16,
            deckDepth,
            rotationY,
            segmentQuat,
            featureRegionKeys
          );
        }
      }

      const supportSpacing =
        isConnectorLike ?
          Math.max(16, width * 3.6) :
          Math.max(26, width * 3.8 + nearbyElevatedCount * 5) * (clutteredInterchange ? 1.45 : 1);
      const skipNear = Math.max(8, width * 0.9);
      const skipDistance = (distance) => {
        if (distance < skipNear || distance > total - skipNear) return true;
        if (!Array.isArray(feature.structureStations)) return false;
        return feature.structureStations.some((station) =>
          Math.abs(distance - station.distance) < Math.max(width * 1.6, station.span * 0.58)
        );
      };

      let featureSupportCount = 0;
      const addFeatureSupport = (instance) => {
        if (!instance || !(instance.scaleY > 0.5)) return;
        featureSupportCount += 1;
        addSupportInstance(instance, featureRegionKeys);
      };

      if (isConnectorLike || renderRoadSupports) {
        for (let distance = supportSpacing * 0.5; distance < total; distance += supportSpacing) {
          if (skipDistance(distance)) continue;
          const point = pointAlongPolyline(structurePts, distance);
          if (!point) continue;
          const terrainY = cachedTerrainHeight(point.x, point.z);
          const deckY = sampleFeatureSurfaceY(feature, point.x, point.z);
          const supportTopGap = isConnectorLike ? 0.12 : 0.02;
          const supportHeight = deckY - supportTopGap - terrainY;
          if (!(supportHeight > 2.4)) continue;
          const nx = -point.tangentZ;
          const nz = point.tangentX;
          const pierWidth =
            isConnectorLike ?
              Math.max(0.7, width * 0.22) :
              Math.max(2.4, Math.min(4.8, width * 0.32));
          if (isConnectorLike) {
            addFeatureSupport({
              x: point.x,
              y: terrainY + supportHeight * 0.5,
              z: point.z,
              scaleX: pierWidth,
              scaleY: supportHeight,
              scaleZ: pierWidth
            });
          } else {
            addFeatureSupport({
              x: point.x,
              y: terrainY + supportHeight * 0.5,
              z: point.z,
              scaleX: Math.max(2.2, Math.min(4.6, pierWidth)),
              scaleY: supportHeight,
              scaleZ: Math.max(2.0, Math.min(4.2, pierWidth * 0.88))
            });
          }
        }

        if (!isConnectorLike && renderRoadSupports && featureSupportCount === 0 && total >= 8) {
          const point = pointAlongPolyline(structurePts, total * 0.5);
          if (point) {
            const terrainY = cachedTerrainHeight(point.x, point.z);
            const deckY = sampleFeatureSurfaceY(feature, point.x, point.z);
            const supportHeight = deckY - 0.02 - terrainY;
            if (supportHeight > 2.4) {
              const pierWidth = Math.max(2.4, Math.min(4.8, width * 0.32));
              addFeatureSupport({
                x: point.x,
                y: terrainY + supportHeight * 0.5,
                z: point.z,
                scaleX: Math.max(2.2, Math.min(4.6, pierWidth)),
                scaleY: supportHeight,
                scaleZ: Math.max(2.0, Math.min(4.2, pierWidth * 0.88))
              });
            }
          }
        }
      }

      const addAbutmentAt = (distance) => {
        const point = pointAlongPolyline(structurePts, distance);
        if (!point) return;
        const terrainY = cachedTerrainHeight(point.x, point.z);
        const deckY = sampleFeatureSurfaceY(feature, point.x, point.z);
        const supportHeight = deckY - 0.45 - terrainY;
        if (!(supportHeight > 1.4)) return;
        const nx = -point.tangentZ;
        const nz = point.tangentX;
        const widthScale = Math.max(1.2, Number(feature.width) || 4);
        addSupportInstance({
          x: point.x + nx * 0.2,
          y: terrainY + supportHeight * 0.5,
          z: point.z + nz * 0.2,
          scaleX: Math.max(1.8, widthScale * 0.92),
          scaleY: supportHeight,
          scaleZ: Math.max(2.1, widthScale * 0.44)
        }, featureRegionKeys);
        if (!isConnectorLike && renderCapBeams) {
          addBeam(
            capInstances,
            point.x,
            deckY - deckThickness - 0.18,
            point.z,
            Math.max(2.6, widthScale * 0.92),
            0.32,
            Math.max(1.2, widthScale * 0.38),
            Math.atan2(point.tangentX, point.tangentZ),
            null,
            featureRegionKeys
          );
        }
      };
      if (isConnectorLike || renderRoadAbutments) {
        addAbutmentAt(Math.min(6, total * 0.12));
        addAbutmentAt(Math.max(0, total - Math.min(6, total * 0.12)));
      }
    } else if (semantics.terrainMode === 'subgrade') {
      const width = Math.max(3.4, Number(feature.width) || 6);
      const openingHalfWidth = width * 0.5 + 0.9;
      const beamThickness = 0.6;
      const portalInset = Math.min(4, Math.max(2, total * 0.08));
      const portalDistances = [portalInset, Math.max(0, total - portalInset)];
      for (let p = 0; p < portalDistances.length; p++) {
        const point = pointAlongPolyline(feature.pts, portalDistances[p]);
        if (!point) continue;
        const terrainY = cachedTerrainHeight(point.x, point.z);
        const roadY = sampleFeatureSurfaceY(feature, point.x, point.z);
        const openingHeight = terrainY - roadY - 0.15;
        if (!(openingHeight > 2.6)) continue;
        const nx = -point.tangentZ;
        const nz = point.tangentX;
        const pillarWidth = Math.max(0.75, width * 0.16);
        const pillarHeight = openingHeight;
        const sideOffset = openingHalfWidth + pillarWidth * 0.5;
        addPortalBeam(
          point.x + nx * sideOffset,
          roadY + pillarHeight * 0.5,
          point.z + nz * sideOffset,
          pillarWidth,
          pillarHeight,
          Math.max(0.8, width * 0.26),
          Math.atan2(point.tangentX, point.tangentZ),
          featureRegionKeys
        );
        addPortalBeam(
          point.x - nx * sideOffset,
          roadY + pillarHeight * 0.5,
          point.z - nz * sideOffset,
          pillarWidth,
          pillarHeight,
          Math.max(0.8, width * 0.26),
          Math.atan2(point.tangentX, point.tangentZ),
          featureRegionKeys
        );
        addPortalBeam(
          point.x,
          roadY + openingHeight + beamThickness * 0.5,
          point.z,
          width + pillarWidth * 2.2,
          beamThickness,
          Math.max(0.9, width * 0.34),
          Math.atan2(point.tangentX, point.tangentZ),
          featureRegionKeys
        );
        addBeam(
          portalInstances,
          point.x + nx * (openingHalfWidth + pillarWidth * 0.88),
          roadY + openingHeight * 0.48,
          point.z + nz * (openingHalfWidth + pillarWidth * 0.88),
          pillarWidth * 0.68,
          openingHeight * 0.84,
          Math.max(2.4, width * 0.66),
          Math.atan2(point.tangentX, point.tangentZ),
          null,
          featureRegionKeys
        );
        addBeam(
          portalInstances,
          point.x - nx * (openingHalfWidth + pillarWidth * 0.88),
          roadY + openingHeight * 0.48,
          point.z - nz * (openingHalfWidth + pillarWidth * 0.88),
          pillarWidth * 0.68,
          openingHeight * 0.84,
          Math.max(2.4, width * 0.66),
          Math.atan2(point.tangentX, point.tangentZ),
          null,
          featureRegionKeys
        );
      }
    }
  }

  return {
    supportInstances,
    portalInstances,
    deckInstances,
    girderInstances,
    capInstances,
    wallInstances,
    roofInstances
  };
}

function clearStructureVisualMeshes(options = {}) {
  const targetBounds = options?.bounds || null;
  const targetRegionKeySet = options?.regionKeys instanceof Set ? options.regionKeys : null;
  if (!Array.isArray(appCtx.structureVisualMeshes)) appCtx.structureVisualMeshes = [];
  const kept = [];
  appCtx.structureVisualMeshes.forEach((mesh) => {
    if (!mesh) return;
    const regionMatch = regionKeySetIntersects(mesh?.userData?.continuousWorldRegionKeys, targetRegionKeySet);
    const boundsMatch = !regionMatch && targetBounds && boundsIntersectLocal(mesh?.userData?.localBounds || null, targetBounds, 24);
    if (targetBounds || (targetRegionKeySet && targetRegionKeySet.size > 0)) {
      if (!regionMatch && !boundsMatch) {
        kept.push(mesh);
        return;
      }
    }
    if (typeof appCtx.recordRuntimeContentRetired === 'function') {
      appCtx.recordRuntimeContentRetired(mesh, 'structure_visual_clear');
    }
    if (mesh.parent === appCtx.scene) appCtx.scene.remove(mesh);
    if (mesh.geometry && typeof mesh.geometry.dispose === 'function') mesh.geometry.dispose();
    if (mesh.material && typeof mesh.material.dispose === 'function') mesh.material.dispose();
  });
  appCtx.structureVisualMeshes = kept;
  if (typeof appCtx.syncRuntimeContentInventory === 'function') {
    appCtx.syncRuntimeContentInventory('structure_visual_clear');
  }
}

function buildStructureVisualMesh(instances, material, userData = {}) {
  if (!Array.isArray(instances) || instances.length === 0 || typeof THREE === 'undefined') return null;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.InstancedMesh(geometry, material, instances.length);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  for (let i = 0; i < instances.length; i++) {
    const instance = instances[i];
    position.set(instance.x, instance.y, instance.z);
    if (instance?.quaternion && Number.isFinite(instance.quaternion.x) && Number.isFinite(instance.quaternion.y) && Number.isFinite(instance.quaternion.z) && Number.isFinite(instance.quaternion.w)) {
      quaternion.set(instance.quaternion.x, instance.quaternion.y, instance.quaternion.z, instance.quaternion.w);
    } else {
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Number(instance.rotationY) || 0);
    }
    scale.set(instance.scaleX, instance.scaleY, instance.scaleZ);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(i, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  let centerX = 0;
  let centerZ = 0;
  for (let i = 0; i < instances.length; i++) {
    centerX += Number(instances[i]?.x || 0);
    centerZ += Number(instances[i]?.z || 0);
  }
  centerX /= instances.length;
  centerZ /= instances.length;
  let maxRadius = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let maxScaleY = 0;
  let totalScaleY = 0;
  for (let i = 0; i < instances.length; i++) {
    const instance = instances[i];
    minX = Math.min(minX, Number(instance?.x || 0) - Math.max(Number(instance?.scaleX || 0), Number(instance?.scaleZ || 0)) * 0.5);
    maxX = Math.max(maxX, Number(instance?.x || 0) + Math.max(Number(instance?.scaleX || 0), Number(instance?.scaleZ || 0)) * 0.5);
    minZ = Math.min(minZ, Number(instance?.z || 0) - Math.max(Number(instance?.scaleX || 0), Number(instance?.scaleZ || 0)) * 0.5);
    maxZ = Math.max(maxZ, Number(instance?.z || 0) + Math.max(Number(instance?.scaleX || 0), Number(instance?.scaleZ || 0)) * 0.5);
    const scaleY = Math.max(0, Number(instance?.scaleY || 0));
    const posY = Number(instance?.y || 0);
    minY = Math.min(minY, posY - scaleY * 0.5);
    maxY = Math.max(maxY, posY + scaleY * 0.5);
    maxScaleY = Math.max(maxScaleY, scaleY);
    totalScaleY += scaleY;
    const halfSpan = Math.max(
      Number(instance?.scaleX || 0),
      Number(instance?.scaleZ || 0)
    ) * 0.5;
    const distance = Math.hypot(Number(instance?.x || 0) - centerX, Number(instance?.z || 0) - centerZ) + halfSpan;
    if (distance > maxRadius) maxRadius = distance;
  }
  Object.assign(mesh.userData, userData, { isStructureVisual: true });
  mesh.userData.lodCenter = { x: centerX, z: centerZ };
  mesh.userData.lodRadius = maxRadius;
  mesh.userData.localBounds =
    Number.isFinite(minX) && Number.isFinite(maxX) && Number.isFinite(minZ) && Number.isFinite(maxZ) ?
      { minX, maxX, minZ, maxZ } :
      null;
  assignContinuousWorldRegionKeysToTarget(mesh, {
    points: [],
    family: 'structures'
  });
  mesh.userData.continuousWorldRegionKeys = mergeContinuousWorldRegionKeysFromTargets(instances);
  mesh.userData.continuousWorldRegionCount = mesh.userData.continuousWorldRegionKeys.length;
  mesh.userData.continuousWorldFeatureFamily = 'structures';
  mesh.userData.instanceCount = instances.length;
  mesh.userData.maxScaleY = Number(maxScaleY.toFixed(3));
  mesh.userData.avgScaleY = Number((totalScaleY / Math.max(1, instances.length)).toFixed(3));
  mesh.userData.minY = Number.isFinite(minY) ? Number(minY.toFixed(3)) : null;
  mesh.userData.maxY = Number.isFinite(maxY) ? Number(maxY.toFixed(3)) : null;
  appCtx.scene.add(mesh);
  appCtx.structureVisualMeshes.push(mesh);
  return mesh;
}

function buildStructureVisualMeshGroups(instances, materialFactory, userData = {}) {
  if (!Array.isArray(instances) || instances.length === 0) return [];
  const groups = new Map();
  for (let i = 0; i < instances.length; i++) {
    const instance = instances[i];
    const keys = Array.isArray(instance?.continuousWorldRegionKeys) && instance.continuousWorldRegionKeys.length > 0 ?
      Array.from(new Set(instance.continuousWorldRegionKeys)).sort() :
      [];
    const signature = keys.length > 0 ? keys.join('|') : 'all';
    let group = groups.get(signature);
    if (!group) {
      group = [];
      groups.set(signature, group);
    }
    group.push(instance);
  }

  const builtMeshes = [];
  groups.forEach((groupInstances) => {
    const material = typeof materialFactory === 'function' ? materialFactory() : materialFactory;
    const mesh = buildStructureVisualMesh(groupInstances, material, userData);
    if (mesh) builtMeshes.push(mesh);
  });
  return builtMeshes;
}

function rebuildStructureVisualMeshes(options = {}) {
  if (options.skipSettledCheck !== true && !canRebuildStructureVisualsNow()) {
    deferStructureVisualRebuild(options, appCtx.droneMode ? 'drone_stream_unsettled' : 'terrain_unsettled');
    return false;
  }
  clearStructureVisualMeshes(options);
  if (appCtx.onMoon || !appCtx.scene) return;
  const {
    supportInstances,
    portalInstances,
    deckInstances,
    girderInstances,
    capInstances,
    wallInstances,
    roofInstances
  } = collectStructureVisualInstances(options);
  if (deckInstances.length > 0) {
    buildStructureVisualMeshGroups(
      deckInstances,
      () => new THREE.MeshStandardMaterial({
        color: 0x56606b,
        roughness: 0.92,
        metalness: 0.03
      }),
      { structureVisualType: 'decks' }
    );
  }
  if (girderInstances.length > 0) {
    buildStructureVisualMeshGroups(
      girderInstances,
      () => new THREE.MeshStandardMaterial({
        color: 0x404954,
        roughness: 0.88,
        metalness: 0.08
      }),
      { structureVisualType: 'girders' }
    );
  }
  if (capInstances.length > 0) {
    buildStructureVisualMeshGroups(
      capInstances,
      () => new THREE.MeshStandardMaterial({
        color: 0x646c76,
        roughness: 0.92,
        metalness: 0.03
      }),
      { structureVisualType: 'caps' }
    );
  }
  if (supportInstances.length > 0) {
    buildStructureVisualMeshGroups(
      supportInstances,
      () => new THREE.MeshStandardMaterial({
        color: 0x717983,
        roughness: 0.95,
        metalness: 0.02
      }),
      { structureVisualType: 'supports' }
    );
  }
  if (wallInstances.length > 0) {
    buildStructureVisualMeshGroups(
      wallInstances,
      () => new THREE.MeshStandardMaterial({
        color: 0x66727d,
        roughness: 0.88,
        metalness: 0.08
      }),
      { structureVisualType: 'walls' }
    );
  }
  if (roofInstances.length > 0) {
    buildStructureVisualMeshGroups(
      roofInstances,
      () => new THREE.MeshStandardMaterial({
        color: 0x4c5660,
        roughness: 0.84,
        metalness: 0.12
      }),
      { structureVisualType: 'roofs' }
    );
  }
  if (portalInstances.length > 0) {
    buildStructureVisualMeshGroups(
      portalInstances,
      () => new THREE.MeshStandardMaterial({
        color: 0x585e64,
        roughness: 0.96,
        metalness: 0.02
      }),
      { structureVisualType: 'portals' }
    );
  }
  terrain._structureVisualsDirty = false;
  terrain._lastStructureVisualDeferredReason = null;
  terrain._pendingStructureVisualRebuild = null;
  terrain._structureVisualRebuildCount += 1;
  return true;
}

function cachedTerrainHeight(x, z) {
  if (!terrainHeightCacheEnabled) return terrainMeshHeightAt(x, z);

  // Round to 0.1 precision for caching (10cm grid)
  const key = `${Math.round(x * 10)},${Math.round(z * 10)}`;
  if (terrainHeightCache.has(key)) return terrainHeightCache.get(key);

  const h = terrainMeshHeightAt(x, z);
  terrainHeightCache.set(key, h);
  return h;
}

function clearTerrainHeightCache() {
  terrainHeightCache.clear();
  baseTerrainHeightCache.clear();
}

function cloneTerrainTextureWithRepeat(sourceTexture, repeats) {
  if (!sourceTexture) return null;
  const texture = sourceTexture.clone();
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeats, repeats);
  texture.needsUpdate = true;
  return texture;
}

function isUsableTerrainTexture(texture) {
  return !!(texture && texture.image);
}

function isCompleteTerrainTextureSet(textureSet) {
  return !!(
    textureSet &&
    isUsableTerrainTexture(textureSet.map) &&
    isUsableTerrainTexture(textureSet.normalMap) &&
    isUsableTerrainTexture(textureSet.roughnessMap)
  );
}

const proceduralTerrainTextureBases = {
  snow: null,
  snowRock: null,
  sand: null,
  urban: null,
  soil: null,
  rock: null
};

function hashNoise2D(x, y, seed = 1) {
  const v = Math.sin((x * 127.1 + y * 311.7 + seed * 101.3) * 0.017453292519943295) * 43758.5453123;
  return v - Math.floor(v);
}

function makeProceduralTerrainTextureSet(mode = 'snow', size = 128) {
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const colorCtx = colorCanvas.getContext('2d');
  if (!colorCtx) return null;
  const colorImage = colorCtx.createImageData(size, size);

  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = size;
  normalCanvas.height = size;
  const normalCtx = normalCanvas.getContext('2d');
  if (!normalCtx) return null;
  const normalImage = normalCtx.createImageData(size, size);

  const roughnessCanvas = document.createElement('canvas');
  roughnessCanvas.width = size;
  roughnessCanvas.height = size;
  const roughnessCtx = roughnessCanvas.getContext('2d');
  if (!roughnessCtx) return null;
  const roughnessImage = roughnessCtx.createImageData(size, size);

  const isAlpine = mode === 'snowRock';
  const isSand = mode === 'sand';
  const isUrban = mode === 'urban';
  const isSoil = mode === 'soil';
  const isRock = mode === 'rock';
  const colorSeed = isAlpine ? 9 : 5;
  const normalSeed = isAlpine ? 12 : 7;
  const roughSeed = isAlpine ? 15 : 11;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const macro = hashNoise2D(x * 0.06, y * 0.06, colorSeed);
      const micro = hashNoise2D(x * 0.26, y * 0.26, colorSeed + 3);
      let r = 0;
      let g = 0;
      let b = 0;
      if (isSand) {
        const duneWave = Math.sin((x * 0.14 + y * 0.045) + macro * 5.2);
        const duneRipple = Math.sin((x * 0.34 - y * 0.08) + micro * 4.6);
        const duneBlend = Math.max(0, duneWave * 0.65 + duneRipple * 0.35);
        const baseTone = 196 + macro * 22 + micro * 10;
        const warmTone = 22 + duneBlend * 24;
        r = baseTone + warmTone;
        g = baseTone * 0.91 + duneBlend * 11;
        b = baseTone * 0.72 + duneBlend * 6;
      } else if (isUrban) {
        const slab = Math.sin((x * 0.11) + macro * 3.2) * 0.5 + Math.cos((y * 0.12) + micro * 2.9) * 0.5;
        const grime = hashNoise2D(x * 0.24, y * 0.24, colorSeed + 6);
        const baseTone = 118 + macro * 20 + micro * 10;
        const seam = slab > 0.92 || slab < -0.92 ? -28 : 0;
        r = baseTone + seam - grime * 9;
        g = baseTone + 4 + seam - grime * 8;
        b = baseTone + 10 + seam - grime * 7;
      } else if (isSoil) {
        const furrow = Math.sin((x * 0.19 - y * 0.05) + macro * 4.4);
        const clump = hashNoise2D(x * 0.31, y * 0.31, colorSeed + 8);
        const baseTone = 118 + macro * 26 + micro * 12;
        r = baseTone + 20 + furrow * 9;
        g = baseTone * 0.74 + clump * 12;
        b = baseTone * 0.48 + furrow * 6;
      } else if (isRock) {
        const fracture = Math.sin((x * 0.16 + y * 0.08) + macro * 5.1);
        const grain = hashNoise2D(x * 0.34, y * 0.34, colorSeed + 10);
        const baseTone = 122 + macro * 30 + micro * 18;
        r = baseTone + fracture * 8;
        g = baseTone + 4 + fracture * 6;
        b = baseTone + 10 + grain * 10;
      } else {
        const rockMaskRaw = isAlpine ? Math.max(0, macro * 1.25 - 0.55) : 0;
        const rockMask = isAlpine ? Math.min(1, Math.max(0, rockMaskRaw * 1.8 + micro * 0.22)) : 0;
        const snowTone = 232 + macro * 18 + micro * 10;
        const rockTone = 122 + macro * 34 + micro * 26;
        const tintBlue = isAlpine ? 2 : 6;

        r = snowTone * (1 - rockMask) + rockTone * rockMask;
        g = (snowTone + 3) * (1 - rockMask) + (rockTone + 7) * rockMask;
        b = (snowTone + tintBlue) * (1 - rockMask) + (rockTone + 14) * rockMask;
      }

      colorImage.data[idx] = Math.max(0, Math.min(255, Math.round(r)));
      colorImage.data[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
      colorImage.data[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
      colorImage.data[idx + 3] = 255;

      const nx = isSand ?
        Math.sin((x * 0.22 + y * 0.035) + macro * 4.1) * 46 + (hashNoise2D(x * 0.19, y * 0.19, normalSeed) - 0.5) * 10 :
        isUrban ?
          (hashNoise2D(x * 0.14, y * 0.14, normalSeed) - 0.5) * 12 :
          isSoil ?
            (hashNoise2D(x * 0.16, y * 0.16, normalSeed) - 0.5) * 28 :
            isRock ?
              (hashNoise2D(x * 0.16, y * 0.16, normalSeed) - 0.5) * 52 :
              (hashNoise2D(x * 0.16, y * 0.16, normalSeed) - 0.5) * (isAlpine ? 54 : 34);
      const ny = isSand ?
        Math.cos((x * 0.12 - y * 0.09) + micro * 3.8) * 28 + (hashNoise2D(x * 0.19 + 41, y * 0.19 - 29, normalSeed + 2) - 0.5) * 8 :
        isUrban ?
          (hashNoise2D(x * 0.14 + 41, y * 0.14 - 29, normalSeed + 2) - 0.5) * 12 :
          isSoil ?
            (hashNoise2D(x * 0.16 + 41, y * 0.16 - 29, normalSeed + 2) - 0.5) * 28 :
            isRock ?
              (hashNoise2D(x * 0.16 + 41, y * 0.16 - 29, normalSeed + 2) - 0.5) * 52 :
              (hashNoise2D(x * 0.16 + 41, y * 0.16 - 29, normalSeed + 2) - 0.5) * (isAlpine ? 54 : 34);
      normalImage.data[idx] = Math.max(0, Math.min(255, Math.round(128 + nx)));
      normalImage.data[idx + 1] = Math.max(0, Math.min(255, Math.round(128 + ny)));
      normalImage.data[idx + 2] = 255;
      normalImage.data[idx + 3] = 255;

      const roughBase = isSand ? 204 : isAlpine ? 168 : isUrban ? 148 : isSoil ? 196 : isRock ? 176 : 224;
      const roughVar = hashNoise2D(x * 0.18, y * 0.18, roughSeed) * (isSand ? 38 : isAlpine ? 64 : isUrban ? 26 : isSoil ? 34 : isRock ? 52 : 28);
      const roughMask = isSand ? 12 : isAlpine ? Math.max(0, macro * 18) : isUrban ? Math.max(0, micro * 12) : isRock ? Math.max(0, macro * 22) : 0;
      const rough = Math.max(0, Math.min(255, Math.round(roughBase + roughVar + roughMask)));
      roughnessImage.data[idx] = rough;
      roughnessImage.data[idx + 1] = rough;
      roughnessImage.data[idx + 2] = rough;
      roughnessImage.data[idx + 3] = 255;
    }
  }

  colorCtx.putImageData(colorImage, 0, 0);
  normalCtx.putImageData(normalImage, 0, 0);
  roughnessCtx.putImageData(roughnessImage, 0, 0);

  const makeTexture = (canvas, isColor = false) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    if (isColor) {
      if (typeof texture.colorSpace !== 'undefined' && typeof THREE.SRGBColorSpace !== 'undefined') {
        texture.colorSpace = THREE.SRGBColorSpace;
      } else if (typeof texture.encoding !== 'undefined' && typeof THREE.sRGBEncoding !== 'undefined') {
        texture.encoding = THREE.sRGBEncoding;
      }
    }
    texture.needsUpdate = true;
    return texture;
  };

  return {
    map: makeTexture(colorCanvas, true),
    normalMap: makeTexture(normalCanvas, false),
    roughnessMap: makeTexture(roughnessCanvas, false)
  };
}

function getProceduralTerrainTextureBase(mode = 'snow') {
  const key =
    mode === 'snowRock' ? 'snowRock' :
    mode === 'sand' ? 'sand' :
    mode === 'urban' ? 'urban' :
    mode === 'soil' ? 'soil' :
    mode === 'rock' ? 'rock' :
    'snow';
  if (!proceduralTerrainTextureBases[key]) {
    proceduralTerrainTextureBases[key] = makeProceduralTerrainTextureSet(key, 128);
  }
  return proceduralTerrainTextureBases[key];
}

function ensureTerrainTextureSet(mesh, repeats, mode = 'grass') {
  if (!mesh || !mesh.userData) return null;
  if (!mesh.userData.terrainTextureSetsByMode) mesh.userData.terrainTextureSetsByMode = {};
  const modeKey =
    mode === 'snowRock' ? 'snowRock' :
    mode === 'snow' ? 'snow' :
    mode === 'sand' ? 'sand' :
    mode === 'urban' ? 'urban' :
    mode === 'soil' ? 'soil' :
    mode === 'rock' ? 'rock' :
    'grass';
  const textureCacheKey = `${modeKey}:${Number(repeats) || 12}`;
  const cachedTextureSet = mesh.userData.terrainTextureSetsByMode[textureCacheKey];
  if (cachedTextureSet) {
    if (modeKey !== 'grass' || isCompleteTerrainTextureSet(cachedTextureSet)) {
      mesh.userData.terrainTextureSet = cachedTextureSet;
      return mesh.userData.terrainTextureSet;
    }
    delete mesh.userData.terrainTextureSetsByMode[textureCacheKey];
  }

  let source = null;
  if (modeKey === 'grass') {
    source = {
      map: appCtx.grassDiffuse,
      normalMap: appCtx.grassNormal,
      roughnessMap: appCtx.grassRoughness
    };
  } else if (modeKey === 'urban') {
    source =
      (appCtx.pavementDiffuse ? {
        map: appCtx.pavementDiffuse,
        normalMap: appCtx.pavementNormal,
        roughnessMap: appCtx.pavementRoughness
      } : null) ||
      (appCtx.concreteDiffuse ? {
        map: appCtx.concreteDiffuse,
        normalMap: appCtx.concreteNormal,
        roughnessMap: appCtx.concreteRoughness
      } : null) ||
      getProceduralTerrainTextureBase(modeKey);
  } else {
    source = getProceduralTerrainTextureBase(modeKey);
  }
  if (!source) return null;

  const textureSet = {
    map: cloneTerrainTextureWithRepeat(source.map, repeats),
    normalMap: cloneTerrainTextureWithRepeat(source.normalMap, repeats),
    roughnessMap: cloneTerrainTextureWithRepeat(source.roughnessMap, repeats)
  };

  if (modeKey === 'grass' && !isCompleteTerrainTextureSet(textureSet)) {
    mesh.userData.terrainTextureSet = textureSet;
    return textureSet;
  }

  mesh.userData.terrainTextureSetsByMode[textureCacheKey] = textureSet;
  mesh.userData.terrainTextureSet = textureSet;
  return textureSet;
}

let cachedGroundFallbackMesh = null;

function getGroundFallbackMesh() {
  if (cachedGroundFallbackMesh && cachedGroundFallbackMesh.parent) return cachedGroundFallbackMesh;
  cachedGroundFallbackMesh = null;
  if (!appCtx.scene) return null;
  for (let i = 0; i < appCtx.scene.children.length; i++) {
    const child = appCtx.scene.children[i];
    if (child?.userData?.isGroundPlane) {
      cachedGroundFallbackMesh = child;
      break;
    }
  }
  return cachedGroundFallbackMesh;
}

function applyGroundFallbackProfile(profile = null) {
  const ground = getGroundFallbackMesh();
  const material = ground?.material;
  if (!ground || !material || Array.isArray(material)) return;
  const mode = ['snow', 'snowRock', 'sand', 'urban', 'soil', 'rock'].includes(profile?.mode) ? profile.mode : 'grass';
  const colorHex = mode === 'snow' ?
    GROUND_FALLBACK_SNOW_HEX :
    mode === 'snowRock' ?
      GROUND_FALLBACK_ALPINE_HEX :
      mode === 'sand' ?
        GROUND_FALLBACK_SAND_HEX :
        mode === 'urban' ?
          GROUND_FALLBACK_URBAN_HEX :
          mode === 'soil' ?
            GROUND_FALLBACK_SOIL_HEX :
            mode === 'rock' ?
              GROUND_FALLBACK_ROCK_HEX :
      GROUND_FALLBACK_GRASS_HEX;
  material.color.setHex(colorHex);
  material.roughness =
    mode === 'grass' ? 0.95 :
    mode === 'sand' ? 0.92 :
    mode === 'urban' ? 0.84 :
    mode === 'soil' ? 0.9 :
    mode === 'rock' ? 0.87 :
    0.86;
  material.metalness = mode === 'urban' ? 0.03 : mode === 'grass' || mode === 'soil' || mode === 'sand' ? 0 : 0.02;
  material.needsUpdate = true;
}

function computeElevationStatsMeters(samplesMeters) {
  if (!Array.isArray(samplesMeters) || samplesMeters.length === 0) {
    return { min: 0, max: 0, p75: 0, p90: 0 };
  }
  const sorted = samplesMeters.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return { min: 0, max: 0, p75: 0, p90: 0 };
  const pick = (p) => {
    const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p)));
    return sorted[idx];
  };
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p75: pick(0.75),
    p90: pick(0.9)
  };
}

function classifyTerrainVisualProfile(bounds, minElevationMeters = null, maxElevationMeters = null, elevationStats = null) {
  return classifySharedTerrainSurfaceProfile({
    bounds,
    minElevationMeters,
    maxElevationMeters,
    elevationStats,
    worldSurfaceProfile: appCtx.worldSurfaceProfile || null
  });
}

function applyTerrainVisualProfile(mesh, profile, repeats = null) {
  if (!mesh || !mesh.material || Array.isArray(mesh.material)) return;
  if (!mesh.userData) mesh.userData = {};
  const mat = mesh.material;
  const tileBounds = mesh.userData.terrainTile?.bounds || null;
  const nextProfile = profile || classifyTerrainVisualProfile(tileBounds);
  const nextMode =
    nextProfile.mode === 'snowRock' ? 'snowRock' :
    nextProfile.mode === 'snow' ? 'snow' :
    nextProfile.mode === 'sand' ? 'sand' :
    nextProfile.mode === 'urban' ? 'urban' :
    nextProfile.mode === 'soil' ? 'soil' :
    nextProfile.mode === 'rock' ? 'rock' :
    'grass';
  const textureRepeats = Number.isFinite(repeats) && repeats > 0 ?
  repeats :
  Number(mesh.userData.terrainTextureRepeats) || 12;
  mesh.userData.terrainTextureRepeats = textureRepeats;

  if (nextMode === 'snow' || nextMode === 'snowRock') {
    const textures = ensureTerrainTextureSet(mesh, textureRepeats, nextMode);
    mat.map = textures?.map || null;
    mat.normalMap = textures?.normalMap || null;
    mat.roughnessMap = textures?.roughnessMap || null;
    mat.color.setHex(nextMode === 'snow' ? SNOW_COLOR_HEX : ALPINE_SNOW_COLOR_HEX);
    if (mat.emissive) mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0;
    mat.roughness = nextMode === 'snow' ? 0.94 : 0.86;
    mat.metalness = 0.01;
    mat.normalScale = nextMode === 'snow' ? new THREE.Vector2(0.2, 0.2) : new THREE.Vector2(0.45, 0.45);
  } else if (nextMode === 'sand') {
    const textures = ensureTerrainTextureSet(mesh, textureRepeats * 1.3, 'sand');
    mat.map = textures?.map || null;
    mat.normalMap = textures?.normalMap || null;
    mat.roughnessMap = textures?.roughnessMap || null;
    mat.color.setHex(mat.map ? 0xffffff : SAND_COLOR_HEX);
    if (mat.emissive) mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0;
    mat.roughness = 0.92;
    mat.metalness = 0.0;
    if (mat.normalMap) mat.normalScale = new THREE.Vector2(0.78, 0.42);
  } else if (nextMode === 'urban') {
    const textures = ensureTerrainTextureSet(mesh, textureRepeats * 1.1, 'urban');
    mat.map = textures?.map || null;
    mat.normalMap = textures?.normalMap || null;
    mat.roughnessMap = textures?.roughnessMap || null;
    mat.color.setHex(mat.map ? 0xffffff : URBAN_GROUND_HEX);
    if (mat.emissive) mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0;
    mat.roughness = 0.84;
    mat.metalness = 0.03;
    if (mat.normalMap) mat.normalScale = new THREE.Vector2(0.28, 0.28);
  } else if (nextMode === 'soil') {
    const textures = ensureTerrainTextureSet(mesh, textureRepeats * 1.05, 'soil');
    mat.map = textures?.map || null;
    mat.normalMap = textures?.normalMap || null;
    mat.roughnessMap = textures?.roughnessMap || null;
    mat.color.setHex(mat.map ? 0xffffff : SOIL_COLOR_HEX);
    if (mat.emissive) mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0;
    mat.roughness = 0.9;
    mat.metalness = 0.0;
    if (mat.normalMap) mat.normalScale = new THREE.Vector2(0.48, 0.48);
  } else if (nextMode === 'rock') {
    const textures = ensureTerrainTextureSet(mesh, textureRepeats * 0.95, 'rock');
    mat.map = textures?.map || null;
    mat.normalMap = textures?.normalMap || null;
    mat.roughnessMap = textures?.roughnessMap || null;
    mat.color.setHex(mat.map ? 0xffffff : ROCK_COLOR_HEX);
    if (mat.emissive) mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0;
    mat.roughness = 0.87;
    mat.metalness = 0.02;
    if (mat.normalMap) mat.normalScale = new THREE.Vector2(0.56, 0.56);
  } else {
    const textures = ensureTerrainTextureSet(mesh, textureRepeats, 'grass');
    mat.map = textures?.map || null;
    mat.normalMap = textures?.normalMap || null;
    mat.roughnessMap = textures?.roughnessMap || null;
    mat.color.setHex(mat.map ? 0xffffff : GRASS_COLOR_HEX);
    if (mat.emissive) mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0;
    mat.roughness = 0.95;
    mat.metalness = 0.0;
    if (mat.normalMap) mat.normalScale = new THREE.Vector2(0.6, 0.6);
  }

  mesh.userData.terrainVisualProfile = nextProfile;
  applyGroundFallbackProfile(nextProfile);
  mat.needsUpdate = true;
}

function refreshTerrainSurfaceProfiles(profile = null) {
  const nextProfile = profile || appCtx.worldSurfaceProfile || null;
  if (appCtx.terrainGroup?.children?.length) {
    appCtx.terrainGroup.children.forEach((mesh) => {
      if (!mesh?.userData?.isTerrainMesh) return;
      const bounds = mesh.userData?.terrainTile?.bounds || null;
      const minMeters = Number(mesh.userData?.minElevationMeters);
      const maxMeters = Number(mesh.userData?.maxElevationMeters);
      const elevationStats = mesh.userData?.elevationStatsMeters || null;
      applyTerrainVisualProfile(
        mesh,
        classifyTerrainVisualProfile(
          bounds,
          Number.isFinite(minMeters) ? minMeters : null,
          Number.isFinite(maxMeters) ? maxMeters : null,
          elevationStats
        )
      );
    });
    return;
  }
  applyGroundFallbackProfile(nextProfile);
}

function setWorldSurfaceProfile(profile = null) {
  appCtx.worldSurfaceProfile = profile || null;
  refreshTerrainSurfaceProfiles(profile || null);
}

// =====================
// CURVATURE-AWARE ROAD RESAMPLING
// Subdivides road polylines with adaptive density based on curvature
// =====================

// Calculate curvature at point i using neighboring points
function calculateCurvature(pts, i) {
  if (i === 0 || i >= pts.length - 1) return 0;

  const p0 = pts[i - 1];
  const p1 = pts[i];
  const p2 = pts[i + 1];

  // Vector from p0 to p1
  const dx1 = p1.x - p0.x;
  const dz1 = p1.z - p0.z;
  const len1 = Math.sqrt(dx1 * dx1 + dz1 * dz1) || 1;

  // Vector from p1 to p2
  const dx2 = p2.x - p1.x;
  const dz2 = p2.z - p1.z;
  const len2 = Math.sqrt(dx2 * dx2 + dz2 * dz2) || 1;

  // Normalize
  const nx1 = dx1 / len1,nz1 = dz1 / len1;
  const nx2 = dx2 / len2,nz2 = dz2 / len2;

  // Dot product gives cos(angle)
  const dot = nx1 * nx2 + nz1 * nz2;
  const angle = Math.acos(Math.max(-1, Math.min(1, dot)));

  // Curvature = angle / average segment length
  const avgLen = (len1 + len2) / 2;
  return angle / (avgLen || 1);
}

// Subdivide road points with curvature-aware adaptive sampling
// Straight segments: 2-5 meters, Curves: 0.5-2 meters
function subdivideRoadPoints(pts, maxDist) {
  if (pts.length < 2) return pts;

  const result = [pts[0]];

  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const dx = cur.x - prev.x;
    const dz = cur.z - prev.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Calculate curvature at prev and cur points
    const curvPrev = calculateCurvature(pts, i - 1);
    const curvCur = calculateCurvature(pts, i);
    const avgCurv = (curvPrev + curvCur) / 2;

    // Adaptive spacing based on curvature
    // Low curvature (< 0.1): use maxDist (2-5m)
    // High curvature (> 0.5): use minDist (0.5-2m)
    const minDist = maxDist * 0.2; // 0.5-1m for tight curves
    const curvFactor = Math.max(0, Math.min(1, avgCurv / 0.5));
    const adaptiveDist = maxDist * (1 - curvFactor * 0.8) || maxDist;

    if (dist > adaptiveDist) {
      const steps = Math.ceil(dist / adaptiveDist);
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        result.push({ x: prev.x + dx * t, z: prev.z + dz * t });
      }
    }
    result.push(cur);
  }

  return result;
}

function latLonToTileXY(lat, lon, z) {
  const n = Math.pow(2, z);
  const xt = (lon + 180) / 360 * n;
  const yt = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n;
  return { x: Math.floor(xt), y: Math.floor(yt), xf: xt, yf: yt };
}

function tileXYToLatLonBounds(x, y, z) {
  const n = Math.pow(2, z);
  const lonW = x / n * 360 - 180;
  const lonE = (x + 1) / n * 360 - 180;

  const latN = 180 / Math.PI * Math.atan(Math.sinh(Math.PI * (1 - 2 * (y / n))));
  const latS = 180 / Math.PI * Math.atan(Math.sinh(Math.PI * (1 - 2 * ((y + 1) / n))));

  return { latN, latS, lonW, lonE };
}

// Terrarium encoding: height_m = (R*256 + G + B/256) - 32768
function decodeTerrariumRGB(r, g, b) {
  return r * 256 + g + b / 256 - 32768;
}

function disposeTerrainTileCacheEntry(tile) {
  if (!tile) return;
  if (tile.img) {
    tile.img.onload = null;
    tile.img.onerror = null;
  }
  tile.img = null;
  tile.elev = null;
  tile.loaded = false;
  tile.failed = false;
}

function pruneTerrainTileCache(retainedKeys = null) {
  if (!(appCtx.terrainTileCache instanceof Map)) return;
  const cacheSize = appCtx.terrainTileCache.size;
  if (cacheSize <= TERRAIN_TILE_CACHE_SOFT_MAX) return;
  const keep = retainedKeys instanceof Set ? retainedKeys : new Set();
  const removable = [];
  appCtx.terrainTileCache.forEach((tile, key) => {
    if (keep.has(key)) return;
    removable.push({
      key,
      lastTouchedAt: Number(tile?.lastTouchedAt || 0)
    });
  });
  removable.sort((a, b) => a.lastTouchedAt - b.lastTouchedAt);
  const targetSize =
    cacheSize > TERRAIN_TILE_CACHE_HARD_MAX ?
      TERRAIN_TILE_CACHE_SOFT_MAX :
      Math.max(TERRAIN_TILE_CACHE_SOFT_MAX, cacheSize - 8);
  for (let i = 0; i < removable.length && appCtx.terrainTileCache.size > targetSize; i++) {
    const key = removable[i].key;
    const tile = appCtx.terrainTileCache.get(key);
    disposeTerrainTileCacheEntry(tile);
    appCtx.terrainTileCache.delete(key);
  }
}

function getOrLoadTerrainTile(z, x, y) {
  const key = `${z}/${x}/${y}`;
  if (appCtx.terrainTileCache.has(key)) {
    const cached = appCtx.terrainTileCache.get(key);
    if (cached) cached.lastTouchedAt = performance.now();
    return cached;
  }

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = appCtx.TERRAIN_TILE_URL(z, x, y);

  const tile = { img, loaded: false, failed: false, elev: null, w: 256, h: 256, lastTouchedAt: performance.now() };
  appCtx.terrainTileCache.set(key, tile);

  img.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 256;canvas.height = 256;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, 256, 256);

      // Store elevation as Float32Array (meters)
      const elev = new Float32Array(256 * 256);
      for (let i = 0, p = 0; i < elev.length; i++, p += 4) {
        elev[i] = decodeTerrariumRGB(data[p], data[p + 1], data[p + 2]);
      }

      tile.loaded = true;
      tile.failed = false;
      tile.elev = elev;
      tile.lastTouchedAt = performance.now();
      terrain._terrainTileLoadCount += 1;
      if (terrain._activeTerrainTileKeys.has(key)) terrain._activeTerrainTileLoadCount += 1;
      if (terrain._activeTerrainFocusKeys.has(key)) terrain._focusTerrainTileLoadCount += 1;
      if (terrain._activeTerrainPrefetchKeys.has(key)) terrain._prefetchTerrainTileLoadCount += 1;

      // IMPORTANT: After tile loads, reapply heights to any terrain meshes using this tile
      if (appCtx.terrainGroup) {
        appCtx.terrainGroup.children.forEach((mesh) => {
          const tileInfo = mesh.userData?.terrainTile;
          if (tileInfo && tileInfo.z === z && tileInfo.tx === x && tileInfo.ty === y) {
            // Tile loaded - reapply heights
            applyHeightsToTerrainMesh(mesh);
          }
        });
      }

      // Route active/focus tile completion through the shared surface-sync path so
      // road/building terrain conformance keeps up with forward streaming.
      const syncSource =
        key === terrain._activeTerrainCenterKey ? 'terrain_center_tile_loaded' :
        terrain._activeTerrainNearKeys.has(key) ? 'terrain_near_tile_loaded' :
        null;
      if (syncSource) {
        requestWorldSurfaceSync({ source: syncSource, deferOnly: true });
      }
    } catch (e) {
      console.warn('Terrain tile decode failed:', z, x, y, e);
      tile.loaded = false;
      tile.failed = true;
      tile.elev = null;
    }
  };

  img.onerror = () => {
    tile.loaded = false;
    tile.failed = true;
    tile.elev = null;
    tile.lastTouchedAt = performance.now();
  };

  return tile;
}

function clearTerrainTileCache() {
  if (!(appCtx.terrainTileCache instanceof Map)) return;
  appCtx.terrainTileCache.forEach((tile) => disposeTerrainTileCacheEntry(tile));
  appCtx.terrainTileCache.clear();
}

// Sample elevation (meters) from a loaded tile using bilinear interpolation
function sampleTileElevationMeters(tile, u, v) {
  if (!tile || !tile.loaded || !tile.elev) return 0;

  const w = 256,h = 256;
  const x = Math.max(0, Math.min(w - 1, u * (w - 1)));
  const y = Math.max(0, Math.min(h - 1, v * (h - 1)));

  const x0 = Math.floor(x),y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1),y1 = Math.min(h - 1, y0 + 1);

  const sx = x - x0,sy = y - y0;

  const i00 = y0 * w + x0;
  const i10 = y0 * w + x1;
  const i01 = y1 * w + x0;
  const i11 = y1 * w + x1;

  const e00 = tile.elev[i00],e10 = tile.elev[i10],e01 = tile.elev[i01],e11 = tile.elev[i11];

  const ex0 = e00 + (e10 - e00) * sx;
  const ex1 = e01 + (e11 - e01) * sx;
  return clampElevationMeters(ex0 + (ex1 - ex0) * sy);
}

function worldToLatLon(x, z) {
  const lat = appCtx.LOC.lat - z / appCtx.SCALE;
  const lon = appCtx.LOC.lon + x / (appCtx.SCALE * Math.cos(appCtx.LOC.lat * Math.PI / 180));
  return { lat, lon };
}

function elevationMetersAtLatLon(lat, lon) {
  const t = latLonToTileXY(lat, lon, appCtx.TERRAIN_ZOOM);
  const tile = getOrLoadTerrainTile(appCtx.TERRAIN_ZOOM, t.x, t.y);
  if (!tile.loaded) return 0;

  const u = t.xf - t.x;
  const v = t.yf - t.y;
  return sampleTileElevationMeters(tile, u, v);
}

function elevationWorldYAtWorldXZ(x, z) {
  const { lat, lon } = worldToLatLon(x, z);
  const meters = elevationMetersAtLatLon(lat, lon);
  return meters * appCtx.WORLD_UNITS_PER_METER * appCtx.TERRAIN_Y_EXAGGERATION;
}

function ensureTerrainGroup() {
  if (!appCtx.terrainGroup) {
    appCtx.terrainGroup = new THREE.Group();
    appCtx.terrainGroup.name = 'TerrainGroup';
    appCtx.scene.add(appCtx.terrainGroup);
  }
  if (!(terrain._terrainMeshesByKey instanceof Map)) {
    terrain._terrainMeshesByKey = new Map();
  }
}

function disposeTerrainMesh(mesh, reason = 'terrain_dispose') {
  if (!mesh) return;
  if (typeof appCtx.recordRuntimeContentRetired === 'function') {
    appCtx.recordRuntimeContentRetired(mesh, reason);
  }
  const textureSets = mesh?.userData?.terrainTextureSetsByMode;
  if (textureSets && typeof textureSets === 'object') {
    Object.values(textureSets).forEach((set) => {
      if (!set || typeof set !== 'object') return;
      Object.values(set).forEach((tex) => {
        if (tex && typeof tex.dispose === 'function') tex.dispose();
      });
    });
  } else {
    const texSet = mesh?.userData?.terrainTextureSet;
    if (texSet && typeof texSet === 'object') {
      Object.values(texSet).forEach((tex) => {
        if (tex && typeof tex.dispose === 'function') tex.dispose();
      });
    }
  }
  if (mesh.geometry) mesh.geometry.dispose();
  if (mesh.material) mesh.material.dispose();
}

function clearTerrainMeshes() {
  if (!appCtx.terrainGroup) return;
  const existingMeshes = [...appCtx.terrainGroup.children];
  existingMeshes.forEach((mesh) => {
    appCtx.terrainGroup.remove(mesh);
    disposeTerrainMesh(mesh, 'terrain_clear');
  });
  terrain._terrainMeshesByKey.clear();
  terrain._activeTerrainTileKeys = new Set();
  terrain._activeTerrainRequiredKeys = new Set();
  terrain._activeTerrainNearKeys = new Set();
  terrain._activeTerrainFocusKeys = new Set();
  terrain._activeTerrainPrefetchKeys = new Set();
  terrain._activeTerrainCenterKey = null;
  terrain._lastFocusDescriptorCount = 0;
  terrain._lastFocusDescriptorKinds = [];
  terrain._lastTerrainTileCount = 0;
  if (typeof appCtx.syncRuntimeContentInventory === 'function') {
    appCtx.syncRuntimeContentInventory('terrain_clear');
  }
}

function terrainTileKey(z, tx, ty) {
  return `${z}/${tx}/${ty}`;
}

function getTerrainStreamingSnapshot() {
  const modeCounts = {};
  let pendingTerrainTiles = 0;
  let loadedTerrainTiles = 0;
  let activeNearLoaded = 0;
  const terrainMeshes = Array.isArray(appCtx.terrainGroup?.children) ? appCtx.terrainGroup.children : [];
  const meshKeyCounts = new Map();
  let staleTerrainMeshes = 0;

  terrainMeshes.forEach((mesh) => {
    if (!mesh?.userData?.isTerrainMesh) return;
    const mode = mesh.userData?.terrainVisualProfile?.mode || 'unknown';
    modeCounts[mode] = (modeCounts[mode] || 0) + 1;
    if (mesh.userData?.pendingTerrainTile) pendingTerrainTiles++;
    else loadedTerrainTiles++;
    const tile = mesh.userData?.terrainTile;
    const key = tile ? terrainTileKey(tile.z, tile.tx, tile.ty) : '';
    if (key) {
      meshKeyCounts.set(key, (meshKeyCounts.get(key) || 0) + 1);
      if (!terrain._activeTerrainTileKeys.has(key)) staleTerrainMeshes++;
    }
  });

  let activeTilesLoaded = 0;
  let requiredTilesLoaded = 0;
  let missingActiveTerrainMeshes = 0;
  let duplicateTerrainMeshes = 0;
  let activeFocusTilesLoaded = 0;
  let activePrefetchTilesLoaded = 0;
  let cacheLoaded = 0;
  let cacheFailed = 0;
  let cachePending = 0;
  let cacheTotal = 0;

  appCtx.terrainTileCache.forEach((tile) => {
    cacheTotal++;
    if (tile?.loaded) cacheLoaded++;
    else if (tile?.failed) cacheFailed++;
    else cachePending++;
  });

  terrain._activeTerrainTileKeys.forEach((key) => {
    if (appCtx.terrainTileCache.get(key)?.loaded) {
      activeTilesLoaded++;
      if (terrain._activeTerrainNearKeys.has(key)) activeNearLoaded++;
      if (terrain._activeTerrainFocusKeys.has(key)) activeFocusTilesLoaded++;
      if (terrain._activeTerrainPrefetchKeys.has(key)) activePrefetchTilesLoaded++;
    }
    if (!meshKeyCounts.has(key)) missingActiveTerrainMeshes++;
  });

  terrain._activeTerrainRequiredKeys.forEach((key) => {
    if (appCtx.terrainTileCache.get(key)?.loaded) requiredTilesLoaded++;
  });

  meshKeyCounts.forEach((count) => {
    if (count > 1) duplicateTerrainMeshes += count - 1;
  });

  return {
    terrainMeshCount: terrainMeshes.length,
    pendingTerrainTiles,
    loadedTerrainTiles,
    activeTileCount: terrain._activeTerrainTileKeys.size,
    activeTilesLoaded,
    requiredTileCount: terrain._activeTerrainRequiredKeys.size,
    requiredTilesLoaded,
    activeNearTileCount: terrain._activeTerrainNearKeys.size,
    activeNearTilesLoaded: activeNearLoaded,
    activeFocusTileCount: terrain._activeTerrainFocusKeys.size,
    activeFocusTilesLoaded,
    activePrefetchTileCount: terrain._activeTerrainPrefetchKeys.size,
    activePrefetchTilesLoaded,
    focusDescriptorCount: Number(terrain._lastFocusDescriptorCount || 0),
    focusDescriptorKinds: Array.isArray(terrain._lastFocusDescriptorKinds) ? [...terrain._lastFocusDescriptorKinds] : [],
    terrainTileLoads: {
      total: terrain._terrainTileLoadCount,
      active: terrain._activeTerrainTileLoadCount,
      focus: terrain._focusTerrainTileLoadCount,
      prefetch: terrain._prefetchTerrainTileLoadCount
    },
    activeCenterKey: terrain._activeTerrainCenterKey,
    activeCenterLoaded: terrain._activeTerrainCenterKey ? !!appCtx.terrainTileCache.get(terrain._activeTerrainCenterKey)?.loaded : false,
    roadsNeedRebuild: !!appCtx.roadsNeedRebuild,
    rebuildInFlight: !!terrain._rebuildInFlight,
    surfaceSyncRequests: terrain._surfaceSyncRequestCount,
    lastSurfaceSyncSource: terrain._lastSurfaceSyncSource,
    surfaceSyncMode: terrain._surfaceSyncMode,
    pendingSurfaceSyncRoads: terrain._surfaceSyncPendingRoads,
    surfaceSyncRoadMutation: terrain._surfaceSyncRoadMutationState ? {
      type: terrain._surfaceSyncRoadMutationState.type,
      roadCount: Number(terrain._surfaceSyncRoadMutationState.roadCount || 0),
      regionKeyCount: Array.isArray(terrain._surfaceSyncRoadMutationState.regionKeys) ? terrain._surfaceSyncRoadMutationState.regionKeys.length : 0,
      hasBounds: !!terrain._surfaceSyncRoadMutationState.bounds
    } : null,
    lastSurfaceSyncBatchRoads: terrain._surfaceSyncLastBatchRoads,
    lastSurfaceSyncDurationMs: Number.isFinite(terrain._lastSurfaceSyncDurationMs) ? Number(terrain._lastSurfaceSyncDurationMs.toFixed(2)) : null,
    avgSurfaceSyncDurationMs: terrain._surfaceSyncSamples > 0 ?
      Number((terrain._surfaceSyncTotalMs / terrain._surfaceSyncSamples).toFixed(2)) :
      null,
    maxSurfaceSyncDurationMs: terrain._surfaceSyncSamples > 0 ? Number(terrain._surfaceSyncMaxMs.toFixed(2)) : null,
    surfaceSyncSamples: terrain._surfaceSyncSamples,
    deferredDroneSurfaceSync: !!terrain._deferredDroneSurfaceSync,
    structureVisualsDirty: !!terrain._structureVisualsDirty,
    deferredStructureVisualRebuilds: Number(terrain._structureVisualDeferredCount || 0),
    structureVisualRebuildCount: Number(terrain._structureVisualRebuildCount || 0),
    lastStructureVisualDeferredReason: terrain._lastStructureVisualDeferredReason || null,
    structureVisualMeshCount: Array.isArray(appCtx.structureVisualMeshes) ? appCtx.structureVisualMeshes.length : 0,
    lastRoadRebuildAgeMs: Number.isFinite(terrain._lastRoadRebuildAt) && terrain._lastRoadRebuildAt > 0 ?
      Math.max(0, Math.round(performance.now() - terrain._lastRoadRebuildAt)) :
      null,
    duplicateTerrainMeshes,
    staleTerrainMeshes,
    missingActiveTerrainMeshes,
    terrainTileCache: {
      total: cacheTotal,
      loaded: cacheLoaded,
      failed: cacheFailed,
      pending: cachePending
    },
    worldSurfaceProfile: appCtx.worldSurfaceProfile || null,
    modeCounts
  };
}

function buildTerrainTileMesh(z, tx, ty) {
  const bounds = tileXYToLatLonBounds(tx, ty, z);
  const pNW = appCtx.geoToWorld(bounds.latN, bounds.lonW);
  const pNE = appCtx.geoToWorld(bounds.latN, bounds.lonE);
  const pSW = appCtx.geoToWorld(bounds.latS, bounds.lonW);
  const pCenter = appCtx.geoToWorld((bounds.latN + bounds.latS) * 0.5, (bounds.lonW + bounds.lonE) * 0.5);

  const width = Math.hypot(pNE.x - pNW.x, pNE.z - pNW.z);
  const depth = Math.hypot(pSW.x - pNW.x, pSW.z - pNW.z);

  const cx = pCenter.x;
  const cz = pCenter.z;

  const geo = new THREE.PlaneGeometry(width, depth, appCtx.TERRAIN_SEGMENTS, appCtx.TERRAIN_SEGMENTS);
  geo.rotateX(-Math.PI / 2);

  // Tile grass every ~25 world units (~28 meters) for visible detail from car/walking
  const repeats = Math.max(10, Math.round(width / 25));

  const mat = new THREE.MeshStandardMaterial({
    color: typeof appCtx.grassDiffuse !== 'undefined' && appCtx.grassDiffuse ? 0xffffff : GRASS_COLOR_HEX,
    roughness: 0.95,
    metalness: 0.0,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    wireframe: false
  });

  // Mark material for update
  mat.needsUpdate = true;

  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 0;
  mesh.position.set(cx, 0, cz);
  mesh.receiveShadow = true;
  mesh.castShadow = false; // Terrain doesn't cast shadows (performance)
  mesh.frustumCulled = false; // Don't cull terrain - always render it
  mesh.userData = { terrainTile: { z, tx, ty, bounds } };
  mesh.userData.isTerrainMesh = true; // Mark as terrain for debug mode
  mesh.userData.terrainTextureRepeats = repeats;

  applyTerrainVisualProfile(mesh, classifyTerrainVisualProfile(bounds), repeats);

  applyHeightsToTerrainMesh(mesh);

  return mesh;
}

function applyFlatFallbackToTerrainMesh(mesh) {
  if (!mesh || !mesh.geometry || !mesh.geometry.attributes?.position) return;
  const pos = mesh.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, 0);
  }
  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.position.y = 0;
  mesh.visible = true;
  const bounds = mesh.userData?.terrainTile?.bounds || null;
  applyTerrainVisualProfile(mesh, classifyTerrainVisualProfile(bounds));
}

function applyHeightsToTerrainMesh(mesh) {
  const info = mesh.userData?.terrainTile;
  if (!info) return;

  const { z, tx, ty, bounds } = info;
  const tile = getOrLoadTerrainTile(z, tx, ty);
  if (!tile.loaded) {
    mesh.userData.pendingTerrainTile = true;
    // Mobile networks can fail/lag elevation tile fetches; keep terrain visible
    // with a flat fallback mesh until decoded heights arrive.
    applyFlatFallbackToTerrainMesh(mesh);
    return;
  }

  const pos = mesh.geometry.attributes.position;
  const latRange = bounds.latN - bounds.latS || 1;
  const lonRange = bounds.lonE - bounds.lonW || 1;

  // First pass: sample elevations and find range
  let minElevation = Infinity;
  let maxElevation = -Infinity;
  const elevations = [];
  const elevationMetersSamples = [];

  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i) + mesh.position.x;
    const wz = pos.getZ(i) + mesh.position.z;
    const { lat, lon } = worldToLatLon(wx, wz);
    const u = (lon - bounds.lonW) / lonRange;
    const v = (bounds.latN - lat) / latRange;
    const meters = clampElevationMeters(sampleTileElevationMeters(tile, u, v));
    elevationMetersSamples.push(meters);
    const baseY = meters * appCtx.WORLD_UNITS_PER_METER * appCtx.TERRAIN_Y_EXAGGERATION;
    const y = applyStructureTerrainCuts(wx, wz, baseY);
    elevations.push(y);
    minElevation = Math.min(minElevation, y);
    maxElevation = Math.max(maxElevation, y);
  }

  // Position mesh base well below all vertices
  mesh.position.y = minElevation - 10;

  // Second pass: set vertex Y relative to mesh base
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, elevations[i] - mesh.position.y);
  }

  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.userData.pendingTerrainTile = false;
  mesh.visible = true;

  const unitsPerMeter = (appCtx.WORLD_UNITS_PER_METER || 1) * (appCtx.TERRAIN_Y_EXAGGERATION || 1);
  const minMeters = Number.isFinite(minElevation) && unitsPerMeter > 0 ? minElevation / unitsPerMeter : 0;
  const maxMeters = Number.isFinite(maxElevation) && unitsPerMeter > 0 ? maxElevation / unitsPerMeter : 0;

  // Store elevation range for debugging / style classification
  mesh.userData.minElevation = minElevation;
  mesh.userData.maxElevation = maxElevation;
  mesh.userData.minElevationMeters = minMeters;
  mesh.userData.maxElevationMeters = maxMeters;
  const elevationStats = computeElevationStatsMeters(elevationMetersSamples);
  mesh.userData.elevationStatsMeters = elevationStats;
  applyTerrainVisualProfile(mesh, classifyTerrainVisualProfile(bounds, minMeters, maxMeters, elevationStats));
}

function resetTerrainStreamingState() {
  lastTerrainCenterKey = null;
  lastDynamicTerrainRing = appCtx.TERRAIN_RING;
  lastTerrainFocusSignature = '';
  lastTerrainSurfaceSyncSignature = '';
  terrain._lastUpdatePos.x = 0;
  terrain._lastUpdatePos.z = 0;
  terrain._cachedIntersections = null;
  terrain._lastRoadCount = 0;
  terrain._lastTerrainTileCount = 0;
  terrain._activeTerrainTileKeys = new Set();
  terrain._activeTerrainRequiredKeys = new Set();
  terrain._activeTerrainNearKeys = new Set();
  terrain._activeTerrainFocusKeys = new Set();
  terrain._activeTerrainPrefetchKeys = new Set();
  terrain._activeTerrainCenterKey = null;
  terrain._lastFocusDescriptorCount = 0;
  terrain._lastFocusDescriptorKinds = [];
  terrain._lastSurfaceSyncTargetBounds = null;
  terrain._lastSurfaceSyncSource = null;
  terrain._surfaceSyncRoadMutationState = null;
  terrain._surfaceSyncRequestCount = 0;
  terrain._lastSurfaceSyncDurationMs = 0;
  terrain._lastSurfaceSyncCompletedAt = 0;
  terrain._surfaceSyncSamples = 0;
  terrain._surfaceSyncTotalMs = 0;
  terrain._surfaceSyncMaxMs = 0;
  terrain._surfaceSyncMode = 'idle';
  terrain._surfaceSyncPendingRoads = 0;
  terrain._surfaceSyncLastBatchRoads = 0;
  terrain._activeSurfaceSyncTask = null;
  terrain._structureVisualsDirty = false;
  terrain._lastStructureVisualDeferredReason = null;
  terrain._structureVisualDeferredCount = 0;
  terrain._structureVisualRebuildCount = 0;
  terrain._pendingStructureVisualRebuild = null;
  terrain._deferredDroneSurfaceSync = false;
  terrain._terrainTileLoadCount = 0;
  terrain._activeTerrainTileLoadCount = 0;
  terrain._focusTerrainTileLoadCount = 0;
  terrain._prefetchTerrainTileLoadCount = 0;
  terrain._terrainMeshesByKey.clear();
  clearTerrainHeightCache();
}

function shiftTerrainBoundsLocal(bounds, deltaX = 0, deltaZ = 0) {
  if (
    !bounds ||
    !Number.isFinite(bounds.minX) ||
    !Number.isFinite(bounds.maxX) ||
    !Number.isFinite(bounds.minZ) ||
    !Number.isFinite(bounds.maxZ)
  ) {
    return false;
  }
  bounds.minX += deltaX;
  bounds.maxX += deltaX;
  bounds.minZ += deltaZ;
  bounds.maxZ += deltaZ;
  return true;
}

function handleContinuousWorldRebase(deltaX = 0, deltaZ = 0) {
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaZ)) return false;
  if (Math.abs(deltaX) < 0.0001 && Math.abs(deltaZ) < 0.0001) return false;

  ensureTerrainGroup();
  const terrainMeshes = Array.isArray(appCtx.terrainGroup?.children) ? appCtx.terrainGroup.children : [];
  for (let i = 0; i < terrainMeshes.length; i++) {
    const mesh = terrainMeshes[i];
    if (!mesh) continue;
    if (Number.isFinite(mesh.position?.x)) mesh.position.x += deltaX;
    if (Number.isFinite(mesh.position?.z)) mesh.position.z += deltaZ;
    if (mesh.userData && typeof mesh.userData === 'object') {
      if (Number.isFinite(mesh.userData?.lodCenter?.x)) mesh.userData.lodCenter.x += deltaX;
      if (Number.isFinite(mesh.userData?.lodCenter?.z)) mesh.userData.lodCenter.z += deltaZ;
      shiftTerrainBoundsLocal(mesh.userData.localBounds, deltaX, deltaZ);
      shiftTerrainBoundsLocal(mesh.userData.cachedLocalBounds, deltaX, deltaZ);
      shiftTerrainBoundsLocal(mesh.userData.waterwayBounds, deltaX, deltaZ);
    }
    if (typeof mesh.updateMatrixWorld === 'function') mesh.updateMatrixWorld(true);
  }

  lastTerrainCenterKey = null;
  lastDynamicTerrainRing = appCtx.TERRAIN_RING;
  lastTerrainFocusSignature = '';
  lastTerrainSurfaceSyncSignature = '';
  terrain._lastUpdatePos.x = 0;
  terrain._lastUpdatePos.z = 0;
  terrain._cachedIntersections = null;
  terrain._lastRoadCount = 0;
  terrain._lastFocusDescriptorCount = 0;
  terrain._lastFocusDescriptorKinds = [];
  terrain._lastSurfaceSyncTargetBounds = null;
  terrain._lastSurfaceSyncSource = null;
  terrain._surfaceSyncRoadMutationState = null;
  terrain._surfaceSyncPendingRoads = 0;
  terrain._surfaceSyncLastBatchRoads = 0;
  terrain._activeSurfaceSyncTask = null;
  terrain._pendingStructureVisualRebuild = null;
  terrain._deferredDroneSurfaceSync = false;
  if (!(terrain._terrainMeshesByKey instanceof Map)) {
    terrain._terrainMeshesByKey = new Map();
  } else {
    terrain._terrainMeshesByKey.clear();
  }
  for (let i = 0; i < terrainMeshes.length; i++) {
    const mesh = terrainMeshes[i];
    const key = String(mesh?.userData?.terrainTileKey || '').trim();
    if (key) terrain._terrainMeshesByKey.set(key, mesh);
  }
  clearTerrainHeightCache();
  return true;
}

// =====================
// INTERSECTION DETECTION
// Detect road intersections by finding shared endpoint nodes
// =====================

function detectRoadIntersections(roads) {
  const intersections = new Map(); // key: "x,z" -> array of road indices

  roads.forEach((road, roadIdx) => {
    if (!road.pts || road.pts.length < 2) return;

    // Check first and last points (endpoints)
    [0, road.pts.length - 1].forEach((idx) => {
      const pt = road.pts[idx];
      const key = `${Math.round(pt.x * 10)},${Math.round(pt.z * 10)}`; // 0.1 precision

      if (!intersections.has(key)) {
        intersections.set(key, { x: pt.x, z: pt.z, roads: [] });
      }
      let dirX = 0;
      let dirZ = 0;
      if (idx === 0) {
        dirX = road.pts[1].x - road.pts[0].x;
        dirZ = road.pts[1].z - road.pts[0].z;
      } else {
        const last = road.pts.length - 1;
        dirX = road.pts[last - 1].x - road.pts[last].x;
        dirZ = road.pts[last - 1].z - road.pts[last].z;
      }
      const dirLen = Math.hypot(dirX, dirZ) || 1;
      intersections.get(key).roads.push({
        roadIdx,
        ptIdx: idx,
        width: road.width || 8,
        dir: { x: dirX / dirLen, z: dirZ / dirLen }
      });
    });
  });

  // Filter to only actual intersections (2+ roads meeting)
  const result = [];
  intersections.forEach((data, key) => {
    if (data.roads.length >= 2) {
      // Calculate max width for intersection cap sizing
      const maxWidth = Math.max(...data.roads.map((r) => r.width));
      result.push({ x: data.x, z: data.z, roads: data.roads, maxWidth });
    }
  });

  return result;
}

function shouldBuildIntersectionCap(intersection) {
  if (!intersection || !Array.isArray(intersection.roads)) return false;
  // Caps are now only used for dense 4+ way intersections; lower branch joints
  // stay clean and rely on strip overlap to avoid circular bulges.
  if (intersection.roads.length < 4) return false;
  return true;
}

function computeIntersectionCapRadius(intersection) {
  const maxWidth = Number(intersection?.maxWidth || 8);
  const roads = Array.isArray(intersection?.roads) ? intersection.roads : [];
  const branchCount = Math.max(2, roads.length);
  const avgWidth = roads.length > 0 ?
  roads.reduce((sum, r) => sum + Number(r?.width || maxWidth), 0) / roads.length :
  maxWidth;

  const halfWidth = Math.max(avgWidth * 0.46, maxWidth * 0.44);
  const branchBoost = Math.min(0.08, Math.max(0, (branchCount - 4) * 0.04));
  const unclamped = halfWidth * (1 + branchBoost);
  const minRadius = maxWidth * 0.40;
  const maxRadius = maxWidth * 0.52;
  return Math.max(minRadius, Math.min(maxRadius, unclamped));
}

function appendIndexedGeometry(targetVerts, targetIndices, verts, indices) {
  if (!Array.isArray(verts) || verts.length === 0) return;
  const baseVertex = targetVerts.length / 3;
  targetVerts.push(...verts);
  if (Array.isArray(indices) && indices.length > 0) {
    for (let i = 0; i < indices.length; i++) {
      targetIndices.push(indices[i] + baseVertex);
    }
  } else {
    const count = verts.length / 3;
    for (let i = 0; i < count; i++) {
      targetIndices.push(baseVertex + i);
    }
  }
}

// Build road skirts (vertical curtains) to hide terrain peeking
function buildRoadSkirts(leftEdge, rightEdge, skirtDepth = 1.5) {
  const verts = [];
  const indices = [];

  // Left skirt (curtain hanging down from left edge)
  for (let i = 0; i < leftEdge.length; i++) {
    const top = leftEdge[i];
    verts.push(top.x, top.y, top.z); // Top vertex
    verts.push(top.x, top.y - skirtDepth, top.z); // Bottom vertex

    if (i < leftEdge.length - 1) {
      const vi = i * 2;
      // Two triangles forming a quad
      indices.push(vi, vi + 1, vi + 2);
      indices.push(vi + 1, vi + 3, vi + 2);
    }
  }

  const leftSkirtStartIdx = indices.length;

  // Right skirt (curtain hanging down from right edge)
  for (let i = 0; i < rightEdge.length; i++) {
    const top = rightEdge[i];
    const baseIdx = leftEdge.length * 2 + i * 2;
    verts.push(top.x, top.y, top.z); // Top vertex
    verts.push(top.x, top.y - skirtDepth, top.z); // Bottom vertex

    if (i < rightEdge.length - 1) {
      const vi = baseIdx;
      indices.push(vi, vi + 1, vi + 2);
      indices.push(vi + 1, vi + 3, vi + 2);
    }
  }

  return { verts, indices };
}

// Build intersection cap patch (circular/square mesh covering intersection)
function buildIntersectionCap(x, z, radius, segments = 16) {
  const verts = [];
  const indices = [];

  // Center vertex
  const centerY = cachedTerrainHeight(x, z) + 0.35; // Slightly above roads
  verts.push(x, centerY, z);

  // Ring vertices
  for (let i = 0; i <= segments; i++) {
    const angle = i / segments * Math.PI * 2;
    const px = x + Math.cos(angle) * radius;
    const pz = z + Math.sin(angle) * radius;
    const py = cachedTerrainHeight(px, pz) + 0.35;
    verts.push(px, py, pz);
  }

  // Triangles from center to ring
  for (let i = 0; i < segments; i++) {
    indices.push(0, i + 1, i + 2);
  }

  return { verts, indices };
}

let lastTerrainCenterKey = null;
let lastDynamicTerrainRing = appCtx.TERRAIN_RING;
let lastTerrainFocusSignature = '';
let lastTerrainSurfaceSyncSignature = '';

function getStreamingSpeedMph() {
  if (appCtx.boatMode?.active) {
    const forwardSpeed = Math.abs(Number(appCtx.boat?.forwardSpeed || appCtx.boat?.speed || 0));
    const planarSpeed = Math.hypot(Number(appCtx.boat?.vx || 0), Number(appCtx.boat?.vz || 0));
    return Math.max(0, Math.max(forwardSpeed, planarSpeed) * 6);
  }
  if (appCtx.droneMode && appCtx.drone) return Math.max(0, Math.abs((appCtx.drone.speed || 0) * 1.8));
  if (appCtx.Walk && appCtx.Walk.state && appCtx.Walk.state.mode === 'walk') {
    return Math.max(0, Math.abs(appCtx.Walk.state.walker?.speedMph || 0));
  }
  return Math.max(0, Math.abs((appCtx.car?.speed || 0) * 0.5));
}

function getDynamicTerrainRing() {
  const baseRing = Math.max(1, appCtx.TERRAIN_RING);
  const mode = typeof appCtx.getPerfMode === 'function' ? appCtx.getPerfMode() : appCtx.perfMode || 'rdt';
  if (mode === 'baseline') return baseRing;

  const mph = getStreamingSpeedMph();
  if (mph >= 120) return Math.max(1, baseRing - 2);
  if (mph >= 70) return Math.max(1, baseRing - 1);
  return baseRing;
}

function getStreamingMotionVector() {
  if (appCtx.boatMode?.active) {
    const vx = Number(appCtx.boat?.vx || 0);
    const vz = Number(appCtx.boat?.vz || 0);
    if (Math.hypot(vx, vz) > 0.001) return { x: vx, z: vz };
    const angle = Number(appCtx.boat?.angle || 0);
    return { x: Math.sin(angle), z: Math.cos(angle) };
  }
  if (appCtx.droneMode) {
    const yaw = Number(appCtx.drone?.yaw || 0);
    return { x: Math.sin(yaw), z: Math.cos(yaw) };
  }
  if (appCtx.Walk?.state?.mode === 'walk') {
    const walker = appCtx.Walk.state.walker || {};
    const vx = Number(walker.vx || 0);
    const vz = Number(walker.vz || 0);
    if (Math.hypot(vx, vz) > 0.001) return { x: vx, z: vz };
    const angle = Number(walker.angle || walker.yaw || 0);
    return { x: Math.sin(angle), z: Math.cos(angle) };
  }
  const vx = Number(appCtx.car?.vx || 0);
  const vz = Number(appCtx.car?.vz || 0);
  if (Math.hypot(vx, vz) > 0.001) return { x: vx, z: vz };
  const angle = Number(appCtx.car?.angle || 0);
  return { x: Math.sin(angle), z: Math.cos(angle) };
}

function getTerrainStreamingFocusDescriptors(x, z, centerTile, activeRing) {
  const focus = [
    {
      tx: centerTile.x,
      ty: centerTile.y,
      ring: activeRing,
      kind: 'actor'
    }
  ];

  const mph = getStreamingSpeedMph();
  if (mph < 18) return focus;
  if (surfaceSyncStartupLockActive()) return focus;

  const loadStats = activeTerrainLoadStats();
  const nearRatio = loadStats.nearTotal > 0 ? loadStats.nearLoaded / loadStats.nearTotal : 1;
  const visibleRoadShell = countVisibleRoadShellNearSurfaceSyncActor(Math.abs(Number(appCtx.car?.speed || 0)) > 8 ? 320 : 240);
  const localSurfaceWorkPending =
    terrain._rebuildInFlight ||
    !!terrain._rebuildTimer ||
    !!terrain._activeSurfaceSyncTask ||
    (appCtx.roadsNeedRebuild && Number(terrain._surfaceSyncPendingRoads || 0) > 0);
  if (
    !loadStats.centerLoaded ||
    nearRatio < 0.78 ||
    visibleRoadShell < 12 ||
    localSurfaceWorkPending
  ) {
    return focus;
  }

  const motion = getStreamingMotionVector();
  const motionLen = Math.hypot(motion.x, motion.z);
  if (!(motionLen > 0.0001)) return focus;

  const dirX = motion.x / motionLen;
  const dirZ = motion.z / motionLen;
  const leadDistances = [];
  if (mph >= 95) {
    leadDistances.push(150, 280);
  } else if (mph >= 60) {
    leadDistances.push(120, 220);
  } else if (mph >= 30) {
    leadDistances.push(90);
  } else {
    leadDistances.push(55);
  }

  const seen = new Set([`${centerTile.x}/${centerTile.y}/${activeRing}`]);
  for (let i = 0; i < leadDistances.length; i++) {
    const leadDistance = leadDistances[i];
    const leadWorldX = x + dirX * leadDistance;
    const leadWorldZ = z + dirZ * leadDistance;
    const leadGeo = worldToLatLon(leadWorldX, leadWorldZ);
    const leadTile = latLonToTileXY(leadGeo.lat, leadGeo.lon, appCtx.TERRAIN_ZOOM);
    const leadRing = i === 0 ? Math.max(1, activeRing) : 1;
    const key = `${leadTile.x}/${leadTile.y}/${leadRing}`;
    if (seen.has(key)) continue;
    seen.add(key);
    focus.push({
      tx: leadTile.x,
      ty: leadTile.y,
      ring: leadRing,
      kind: i === 0 ? 'lead' : 'far_lead'
    });
  }

  return focus;
}

function syncTerrainTileMeshes(z, focusDescriptors) {
  ensureTerrainGroup();

  const descriptors = Array.isArray(focusDescriptors) && focusDescriptors.length > 0 ? focusDescriptors : [];
  if (descriptors.length === 0) return false;

  const actorFocus = descriptors[0];
  const desiredKeys = new Set();
  const requiredKeys = new Set();
  const retainedKeys = new Set();
  const nearKeys = new Set();
  const focusKeys = new Set();
  const prefetchKeys = new Set();
  let meshesChanged = false;

  for (let focusIndex = 0; focusIndex < descriptors.length; focusIndex++) {
    const focus = descriptors[focusIndex];
    const ring = Math.max(1, Number(focus.ring) || 1);
    const tx = Number(focus.tx);
    const ty = Number(focus.ty);
    const focusTileKey = terrainTileKey(z, tx, ty);
    focusKeys.add(focusTileKey);

    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        const tileX = tx + dx;
        const tileY = ty + dy;
        const key = terrainTileKey(z, tileX, tileY);
        desiredKeys.add(key);
        if (focusIndex === 0) requiredKeys.add(key);
        if (focusIndex === 0 && Math.abs(dx) <= 1 && Math.abs(dy) <= 1) nearKeys.add(key);
        if (focusIndex > 0) prefetchKeys.add(key);

        if (!terrain._terrainMeshesByKey.has(key)) {
          const mesh = buildTerrainTileMesh(z, tileX, tileY);
          mesh.userData.terrainTileKey = key;
          appCtx.terrainGroup.add(mesh);
          terrain._terrainMeshesByKey.set(key, mesh);
          meshesChanged = true;
        }
      }
    }

    for (let dx = -(ring + TERRAIN_TILE_RETENTION_MARGIN); dx <= ring + TERRAIN_TILE_RETENTION_MARGIN; dx++) {
      for (let dy = -(ring + TERRAIN_TILE_RETENTION_MARGIN); dy <= ring + TERRAIN_TILE_RETENTION_MARGIN; dy++) {
        retainedKeys.add(terrainTileKey(z, tx + dx, ty + dy));
      }
    }
  }

  retainedKeys.forEach((key) => {
    const tile = appCtx.terrainTileCache.get(key);
    if (tile) tile.lastTouchedAt = performance.now();
  });

  for (const [key, mesh] of [...terrain._terrainMeshesByKey.entries()]) {
    if (retainedKeys.has(key)) continue;
    appCtx.terrainGroup.remove(mesh);
    disposeTerrainMesh(mesh);
    terrain._terrainMeshesByKey.delete(key);
    meshesChanged = true;
  }

  terrain._activeTerrainTileKeys = desiredKeys;
  terrain._activeTerrainRequiredKeys = requiredKeys;
  terrain._activeTerrainNearKeys = nearKeys;
  terrain._activeTerrainFocusKeys = focusKeys;
  terrain._activeTerrainPrefetchKeys = prefetchKeys;
  terrain._activeTerrainCenterKey = terrainTileKey(z, actorFocus.tx, actorFocus.ty);
  terrain._lastTerrainTileCount = desiredKeys.size;
  pruneTerrainTileCache(retainedKeys);
  return meshesChanged;
}

function updateTerrainAround(x, z) {
  if (!appCtx.terrainEnabled) return;

  ensureTerrainGroup();

  const { lat, lon } = worldToLatLon(x, z);
  const t = latLonToTileXY(lat, lon, appCtx.TERRAIN_ZOOM);
  const centerKey = `${appCtx.TERRAIN_ZOOM}/${t.x}/${t.y}`;
  const activeRing = getDynamicTerrainRing();
  const focusDescriptors = getTerrainStreamingFocusDescriptors(x, z, t, activeRing);
  const focusSignature = focusDescriptors.map((focus) => `${focus.tx}/${focus.ty}/${focus.ring}/${focus.kind}`).join('|');
  const surfaceSyncSignature = focusDescriptors[0] ?
    `${centerKey}|${activeRing}|${focusDescriptors[0].tx}/${focusDescriptors[0].ty}/${focusDescriptors[0].ring}` :
    `${centerKey}|${activeRing}`;
  terrain._lastFocusDescriptorCount = focusDescriptors.length;
  terrain._lastFocusDescriptorKinds = focusDescriptors.map((focus) => focus.kind);
  const ringChanged = activeRing !== lastDynamicTerrainRing;
  const needsRoadRebuild = !!appCtx.roadsNeedRebuild && appCtx.roads.length > 0 && !appCtx.onMoon;
  const previousCenterKey = lastTerrainCenterKey;
  const previousSurfaceSyncSignature = lastTerrainSurfaceSyncSignature;
  lastDynamicTerrainRing = activeRing;
  if (typeof appCtx.setPerfLiveStat === 'function') appCtx.setPerfLiveStat('terrainRing', activeRing);

  // OPTIMIZATION: Skip if same tile AND haven't moved enough (but always run on first call)
  if (lastTerrainCenterKey !== null) {
    const dx = x - terrain._lastUpdatePos.x;
    const dz = z - terrain._lastUpdatePos.z;
    const distMoved = Math.sqrt(dx * dx + dz * dz);

    if (centerKey === lastTerrainCenterKey && distMoved < 5.0 && !ringChanged && !needsRoadRebuild && focusSignature === lastTerrainFocusSignature) return;
  }

  const tilesChanged = centerKey !== lastTerrainCenterKey || ringChanged || focusSignature !== lastTerrainFocusSignature;
  lastTerrainCenterKey = centerKey;
  lastTerrainFocusSignature = focusSignature;
  lastTerrainSurfaceSyncSignature = surfaceSyncSignature;
  terrain._lastUpdatePos.x = x;
  terrain._lastUpdatePos.z = z;

  // Only update the terrain ring when tiles actually change. Keep overlapping
  // tiles alive so seam crossings do not blank out the ground while new tiles stream in.
  if (tilesChanged) {
    const meshesChanged = syncTerrainTileMeshes(appCtx.TERRAIN_ZOOM, focusDescriptors);

    // Only rebuild roads when terrain tiles actually change (not every frame)
    const surfaceSyncRelevant =
      centerKey !== previousCenterKey ||
      ringChanged ||
      surfaceSyncSignature !== previousSurfaceSyncSignature;
    if (meshesChanged && surfaceSyncRelevant && appCtx.roads.length > 0 && !appCtx.onMoon) {
      requestWorldSurfaceSync({ source: 'terrain_tiles_changed' });
    }
  } else if (needsRoadRebuild) {
    requestWorldSurfaceSync({ source: 'terrain_tiles_pending' });
  }

  if (!appCtx.droneMode && terrain._deferredDroneSurfaceSync && !appCtx.roadsNeedRebuild) {
    terrain._deferredDroneSurfaceSync = false;
    requestWorldSurfaceSync({ source: 'drone_surface_sync_release', deferOnly: true });
  }

  if (terrain._structureVisualsDirty && !appCtx.roadsNeedRebuild) {
    maybeFlushDeferredStructureVisualRebuild('terrain_update_stable');
  }
}

// Rebuild roads to follow current terrain elevation with improved conformance
function rebuildRoadsWithTerrain(options = {}) {
  if (!appCtx.terrainEnabled || appCtx.roads.length === 0 || appCtx.onMoon) return;
  const maxRoadsPerBatch = Number.isFinite(options.maxRoadsPerBatch) ?
    Math.max(1, Math.floor(options.maxRoadsPerBatch)) :
    Infinity;
  const minRoadsPerBatch = Number.isFinite(options.minRoadsPerBatch) ?
    Math.max(1, Math.floor(options.minRoadsPerBatch)) :
    1;
  const maxBatchMs = Number.isFinite(options.maxBatchMs) ?
    Math.max(4, Number(options.maxBatchMs)) :
    Infinity;

  // Clear local road-debug visuals before rebuild to avoid stale references,
  // but preserve the enabled state so we can refresh once the rebuild settles.
  if (roadDebugMode) {
    clearRoadDebugVisuals({ restoreMaterials: true, disposeResources: false });
  }

  // Check if terrain tiles are loaded
  let tilesLoaded = 0;
  let tilesTotal = 0;
  appCtx.terrainTileCache.forEach((tile) => {
    tilesTotal++;
    if (tile.loaded) tilesLoaded++;
  });

  if (tilesLoaded === 0 || tilesTotal === 0) return;

  // OPTIMIZATION: Only clear height cache if road count changed (roads added/removed)
  // Otherwise keep cached heights for better performance
  const roadCountChanged = appCtx.roads.length !== terrain._lastRoadCount;
  if (roadCountChanged && typeof appCtx.refreshStructureAwareFeatureProfiles === 'function') {
    appCtx.refreshStructureAwareFeatureProfiles();
  }
  let activeSyncBounds = getActiveSurfaceSyncBounds(options);
  let activeRegionKeySet = getActiveSurfaceSyncRegionKeys(activeSyncBounds);
  const mutationState = terrain._surfaceSyncRoadMutationState;
  const scopedRoadMutation = mutationStateAllowsScopedRoadSync(mutationState, activeSyncBounds, activeRegionKeySet);
  const actorScopedFallbackRebuild =
    roadCountChanged &&
    !scopedRoadMutation &&
    surfaceSyncSourceIsActorLocal() &&
    !!activeSyncBounds &&
    activeRegionKeySet instanceof Set &&
    activeRegionKeySet.size > 0;
  if (roadCountChanged && !scopedRoadMutation && !actorScopedFallbackRebuild) {
    clearTerrainHeightCache();
  }
  if (roadCountChanged) {
    terrain._lastRoadCount = appCtx.roads.length;
  }
  const partialRebuild =
    (scopedRoadMutation || actorScopedFallbackRebuild || !roadCountChanged) &&
    !!activeSyncBounds &&
    activeRegionKeySet instanceof Set &&
    activeRegionKeySet.size > 0;
  const canStagePartialRebuild =
    partialRebuild &&
    Number.isFinite(maxRoadsPerBatch) &&
    Number.isFinite(maxBatchMs);
  let stagedTask = canStagePartialRebuild ? terrain._activeSurfaceSyncTask : null;
  const reuseExistingActorTask =
    canStagePartialRebuild &&
    stagedTask &&
    stagedSurfaceSyncTaskStillRelevant(stagedTask, activeSyncBounds);
  if (reuseExistingActorTask) {
    activeSyncBounds = stagedTask.activeSyncBounds;
    activeRegionKeySet = stagedTask.activeRegionKeySet;
  }
  const roadRebuildSignature = partialRebuild ? [
    'partial',
    Array.from(activeRegionKeySet).sort().join('|'),
    Number(activeSyncBounds.minX).toFixed(1),
    Number(activeSyncBounds.maxX).toFixed(1),
    Number(activeSyncBounds.minZ).toFixed(1),
    Number(activeSyncBounds.maxZ).toFixed(1),
    appCtx.roads.length
  ].join(':') : `full:${appCtx.roads.length}`;
  const resetStagedTask =
    !canStagePartialRebuild ||
    (!scopedRoadMutation && !actorScopedFallbackRebuild && roadCountChanged) ||
    !stagedTask ||
    stagedTask.signature !== roadRebuildSignature;
  if (resetStagedTask) {
    terrain._activeSurfaceSyncTask = null;
    terrain._surfaceSyncPendingRoads = 0;
    terrain._surfaceSyncLastBatchRoads = 0;
  }

  const activeRebuildToken =
    partialRebuild ?
      String(
        stagedTask?.rebuildToken ||
        `surface_sync:${roadRebuildSignature}:${Math.floor(performance.now())}`
      ) :
      '';

  if (partialRebuild) {
    // Keep the current scoped shell visible until the replacement batches land.
  } else {
    pruneMeshesForRebuildScope(appCtx.roadMeshes, null, null);
    pruneMeshesForRebuildScope(appCtx.urbanSurfaceMeshes, null, null);
    recomputeUrbanSurfaceStats();
  }

  // OPTIMIZATION: Cache intersection detection - only recalculate if roads changed
  let intersections;
  if ((roadCountChanged && !scopedRoadMutation && !actorScopedFallbackRebuild) || !terrain._cachedIntersections) {
    intersections = detectRoadIntersections(appCtx.roads);
    terrain._cachedIntersections = intersections;
  } else {
    intersections = terrain._cachedIntersections;
  }

  const roadMainBatchGroups = new Map();
  const roadSkirtBatchGroups = new Map();
  const roadCapBatchGroups = new Map();
  const sidewalkBatchGroups = new Map();

  const sharedRoadMaterials = getSharedRoadMaterials();
  const roadMat = sharedRoadMaterials.roadMat;
  const skirtMat = sharedRoadMaterials.skirtMat;
  const capMat = sharedRoadMaterials.capMat;
  const urbanSurfaceMaterials = getSharedUrbanSurfaceMaterials();
  const sidewalkMat = urbanSurfaceMaterials.sidewalkMat;

  const buildSidewalkStrip = (
    pts,
    edgePoints,
    sideSign,
    halfWidth,
    desiredWidth,
    roadFeature,
    buildingCandidates,
    nearbyIntersections = [],
    endpointIntersections = null
  ) => {
    if (!Array.isArray(pts) || pts.length < 2 || !Array.isArray(edgePoints) || edgePoints.length !== pts.length) return;
    if (!Number.isFinite(desiredWidth) || desiredWidth < SIDEWALK_MIN_WIDTH) return;

    const widths = new Float32Array(pts.length);
    const widthCaps = new Float32Array(pts.length);
    const widthLocked = new Uint8Array(pts.length);
    let pathDistances = null;
    let totalPathLength = 0;
    if (endpointIntersections?.start || endpointIntersections?.end) {
      pathDistances = new Float32Array(pts.length);
      for (let i = 1; i < pts.length; i++) {
        totalPathLength += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
        pathDistances[i] = totalPathLength;
      }
    }
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      let dx;
      let dz;
      if (i === 0) {
        dx = pts[1].x - p.x;
        dz = pts[1].z - p.z;
      } else if (i === pts.length - 1) {
        dx = p.x - pts[i - 1].x;
        dz = p.z - pts[i - 1].z;
      } else {
        dx = pts[i + 1].x - pts[i - 1].x;
        dz = pts[i + 1].z - pts[i - 1].z;
      }
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;
      const outwardX = sideSign > 0 ? nx : -nx;
      const outwardZ = sideSign > 0 ? nz : -nz;
      let widthAtPoint = resolveSidewalkWidth(
        p.x,
        p.z,
        outwardX,
        outwardZ,
        halfWidth + SIDEWALK_INNER_GAP,
        desiredWidth,
        buildingCandidates
      );
      let widthCap = Math.max(0, desiredWidth * computeSidewalkCornerScale(pts, i, sideSign));
      if (widthAtPoint > widthCap) widthAtPoint = widthCap;
      if (pathDistances && widthAtPoint > 0) {
        const applyEndpointTaper = (intersection, distanceAlongRoad) => {
          if (!intersection || !Number.isFinite(distanceAlongRoad)) return;
          const capRadius = computeIntersectionCapRadius(intersection);
          const clearDistance = capRadius + Math.max(halfWidth * 0.35, 0.9);
          const taperDistance = clearDistance + Math.max(halfWidth + desiredWidth + 4.5, 10);
          if (distanceAlongRoad <= clearDistance) {
            widthAtPoint = 0;
            widthCap = 0;
            widthLocked[i] = 1;
            return;
          }
          if (distanceAlongRoad >= taperDistance) return;
          const t = Math.max(0, Math.min(1, (distanceAlongRoad - clearDistance) / Math.max(1, taperDistance - clearDistance)));
          const fade = t * t * (3 - 2 * t);
          widthCap = Math.min(widthCap, desiredWidth * fade);
          widthAtPoint = Math.min(widthAtPoint, widthCap);
        };
        if (endpointIntersections?.start) {
          applyEndpointTaper(endpointIntersections.start, pathDistances[i]);
        }
        if (!widthLocked[i] && endpointIntersections?.end) {
          applyEndpointTaper(endpointIntersections.end, totalPathLength - pathDistances[i]);
        }
      }
      if (widthAtPoint > 0 && nearbyIntersections.length > 0) {
        for (let j = 0; j < nearbyIntersections.length; j++) {
          const intersection = nearbyIntersections[j];
          const capRadius = computeIntersectionCapRadius(intersection);
          const taperRadius = capRadius + Math.max(halfWidth + desiredWidth + 2, 8);
          const dist = Math.hypot(p.x - intersection.x, p.z - intersection.z);
          if (dist >= taperRadius) continue;
          if (dist <= capRadius) {
            widthAtPoint = 0;
            widthCap = 0;
            widthLocked[i] = 1;
            break;
          }
          const t = Math.max(0, Math.min(1, (dist - capRadius) / Math.max(1, taperRadius - capRadius)));
          const fade = t * t * (3 - 2 * t);
          widthCap = Math.min(widthCap, desiredWidth * fade);
          widthAtPoint = Math.min(widthAtPoint, widthCap);
        }
      }
      widths[i] = widthAtPoint;
      widthCaps[i] = widthCap;
    }

    for (let pass = 0; pass < 1; pass++) {
      for (let i = 1; i < widths.length - 1; i++) {
        if (widthLocked[i]) {
          widths[i] = 0;
          continue;
        }
        let neighborSum = 0;
        let neighborCount = 0;
        if (!widthLocked[i - 1]) {
          neighborSum += widths[i - 1];
          neighborCount += 1;
        }
        if (!widthLocked[i + 1]) {
          neighborSum += widths[i + 1];
          neighborCount += 1;
        }
        if (!neighborCount) continue;
        const neighborAvg = neighborSum / neighborCount;
        const smoothed = widths[i] * 0.7 + neighborAvg * 0.3;
        widths[i] = Math.min(widthCaps[i], smoothed);
      }
    }
    clampSidewalkWidthTransitions(widths, pts, widthCaps, widthLocked);

    const outerHeights = new Float32Array(pts.length);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      let dx;
      let dz;
      if (i === 0) {
        dx = pts[1].x - p.x;
        dz = pts[1].z - p.z;
      } else if (i === pts.length - 1) {
        dx = p.x - pts[i - 1].x;
        dz = p.z - pts[i - 1].z;
      } else {
        dx = pts[i + 1].x - pts[i - 1].x;
        dz = pts[i + 1].z - pts[i - 1].z;
      }
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;
      const outwardX = sideSign > 0 ? nx : -nx;
      const outwardZ = sideSign > 0 ? nz : -nz;
      const innerOffset = halfWidth + SIDEWALK_INNER_GAP;
      const width = widths[i] >= SIDEWALK_MIN_WIDTH ? widths[i] : 0;
      const innerY = edgePoints[i].y + SIDEWALK_CURB_LIFT;
      const outerX = p.x + outwardX * (innerOffset + width);
      const outerZ = p.z + outwardZ * (innerOffset + width);
      const elevatedSurfaceY =
        roadFeature?.structureSemantics?.terrainMode !== 'at_grade' ?
          sampleFeatureSurfaceY(roadFeature, outerX, outerZ) :
          NaN;
      const outerTerrainY = Number.isFinite(elevatedSurfaceY) ?
        elevatedSurfaceY + SIDEWALK_CURB_LIFT :
        cachedTerrainHeight(outerX, outerZ) + SIDEWALK_HEIGHT_BIAS;
      outerHeights[i] = width > 0 ? Math.max(outerTerrainY, innerY - 0.18) : innerY;
    }
    smoothSidewalkOuterHeights(outerHeights, widths, pts);

    const localVerts = [];
    const localIdx = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      let dx;
      let dz;
      if (i === 0) {
        dx = pts[1].x - p.x;
        dz = pts[1].z - p.z;
      } else if (i === pts.length - 1) {
        dx = p.x - pts[i - 1].x;
        dz = p.z - pts[i - 1].z;
      } else {
        dx = pts[i + 1].x - pts[i - 1].x;
        dz = pts[i + 1].z - pts[i - 1].z;
      }
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;
      const outwardX = sideSign > 0 ? nx : -nx;
      const outwardZ = sideSign > 0 ? nz : -nz;
      const innerOffset = halfWidth + SIDEWALK_INNER_GAP;
      const width = widths[i] >= SIDEWALK_MIN_WIDTH ? widths[i] : 0;
      const innerX = p.x + outwardX * innerOffset;
      const innerZ = p.z + outwardZ * innerOffset;
      const outerX = p.x + outwardX * (innerOffset + width);
      const outerZ = p.z + outwardZ * (innerOffset + width);
      const innerY = edgePoints[i].y + SIDEWALK_CURB_LIFT;
      const outerY = width > 0 ? Math.max(outerHeights[i], innerY - 0.18) : innerY;
      localVerts.push(innerX, innerY, innerZ);
      localVerts.push(outerX, outerY, outerZ);
      if (i < pts.length - 1) {
        const nextWidth = widths[i + 1] >= SIDEWALK_MIN_WIDTH ? widths[i + 1] : 0;
        const segmentWidth = Math.max(width, nextWidth);
        const narrowSide = Math.min(width, nextWidth);
        if (segmentWidth >= SIDEWALK_SEGMENT_MIN_WIDTH && narrowSide >= SIDEWALK_SEGMENT_MIN_WIDTH * 0.25) {
          const vi = i * 2;
          localIdx.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);
        }
      }
    }

    if (localIdx.length > 0) {
      appendIndexedGeometryToSidewalkBatch(
        sidewalkBatchGroups,
        roadFeature?.continuousWorldRegionKeys || [],
        localVerts,
        localIdx
      );
    }
  };

  const allScopedRoads = partialRebuild ?
    appCtx.roads.filter((road) => rebuildScopeIncludesRoad(road, activeSyncBounds, activeRegionKeySet)) :
    appCtx.roads;
  let batchStart = 0;
  let batchEnd = allScopedRoads.length;
  let roadsToRebuild = allScopedRoads;
  let finalBatch = true;
  if (canStagePartialRebuild) {
    if (!stagedTask || resetStagedTask) {
      stagedTask = {
        signature: roadRebuildSignature,
        roads: allScopedRoads,
        cursor: 0,
        intersections,
        activeSyncBounds,
        activeRegionKeySet,
        roadCount: appCtx.roads.length,
        rebuildToken: activeRebuildToken
      };
      terrain._activeSurfaceSyncTask = stagedTask;
    }
    batchStart = Math.max(0, Number(stagedTask.cursor) || 0);
    batchEnd = Math.min(stagedTask.roads.length, batchStart + maxRoadsPerBatch);
    roadsToRebuild = stagedTask.roads;
    intersections = stagedTask.intersections;
  } else {
    terrain._surfaceSyncMode = partialRebuild ? 'partial_full' : 'full';
    terrain._surfaceSyncLastBatchRoads = roadsToRebuild.length;
    terrain._surfaceSyncPendingRoads = 0;
    terrain._activeSurfaceSyncTask = null;
  }
  const activeBatchWindow = Math.max(1, batchEnd - batchStart);
  const effectiveMinRoadsPerBatch = canStagePartialRebuild ?
    Math.max(
      1,
      Math.min(
        minRoadsPerBatch,
        activeBatchWindow,
        Math.max(1, Math.min(maxRoadsPerBatch, Math.ceil(maxRoadsPerBatch * 0.25)))
      )
    ) :
    activeBatchWindow;
  const hardBatchMs = canStagePartialRebuild ?
    Math.max(maxBatchMs + 4, maxBatchMs * 1.8) :
    maxBatchMs;
  const deferUrbanSurfaceRefresh = shouldDeferUrbanSurfaceCatchup(partialRebuild, finalBatch);

  // Rebuild each road with improved terrain conformance
  let processedRoadCount = 0;
  const batchLoopStartedAt = performance.now();
  for (let roadIndex = batchStart; roadIndex < batchEnd; roadIndex++) {
    const road = roadsToRebuild[roadIndex];
    if (!road || !Array.isArray(road.pts) || road.pts.length < 2) continue;
    const { width } = road;
    const hw = width / 2;

    // Curvature-aware subdivision: straight = 2-5m, curves = 0.5-2m
    const baseDetail = Number.isFinite(road?.subdivideMaxDist) ? road.subdivideMaxDist : 3.5;
    const hasTransitionAnchors = Array.isArray(road?.structureTransitionAnchors) && road.structureTransitionAnchors.length > 0;
    const detail =
      road?.structureSemantics?.terrainMode && road.structureSemantics.terrainMode !== 'at_grade' ?
        Math.min(baseDetail, 0.32) :
      hasTransitionAnchors ?
        Math.min(baseDetail, 0.38) :
        baseDetail;
    const pts = subdivideRoadPoints(road.pts, detail);
    if (!Array.isArray(road.continuousWorldRegionKeys) || road.continuousWorldRegionKeys.length === 0) {
      road.continuousWorldRegionKeys = buildContinuousWorldRegionKeysFromPoints(road.pts, null, road.bounds);
    }

    const verts = [];
    const indices = [];
    const leftEdge = [];
    const rightEdge = [];
    const roadBounds = road.bounds || pointsBoundsLocal(road.pts, width * 0.5 + URBAN_CONTEXT_PAD);
    const evaluateUrbanContext = !deferUrbanSurfaceRefresh && roadSupportsSidewalks(road);
    const contextBounds = evaluateUrbanContext ? expandBoundsLocal(roadBounds, URBAN_CONTEXT_PAD) : null;
    const buildingCandidates =
      evaluateUrbanContext ?
        (
          typeof appCtx.getBuildingsIntersectingBounds === 'function' ?
            appCtx.getBuildingsIntersectingBounds(contextBounds) :
            (Array.isArray(appCtx.buildings) ? appCtx.buildings.filter((building) =>
              boundsIntersectLocal(building, contextBounds)
            ) : [])
        ) :
        [];
    const nearbyLanduses =
      evaluateUrbanContext ?
        (
          typeof appCtx.getLandusesIntersectingBounds === 'function' ?
            appCtx.getLandusesIntersectingBounds(contextBounds) :
            (Array.isArray(appCtx.landuses) ? appCtx.landuses.filter((landuse) =>
              boundsIntersectLocal(landuse.bounds || pointsBoundsLocal(landuse.pts || []), contextBounds)
            ) : [])
        ) :
        [];
    const nearbyUrbanLanduses = evaluateUrbanContext ? nearbyLanduses.filter((landuse) => isUrbanLanduseType(landuse?.type)).length : 0;
    const nearbyGreenLanduses = evaluateUrbanContext ? nearbyLanduses.filter((landuse) => isGreenLanduseType(landuse?.type)).length : 0;
    const explicitSidewalkHint = evaluateUrbanContext ? roadHasExplicitSidewalkHint(road) : false;
    const denseUrbanContext =
      evaluateUrbanContext &&
      (
        nearbyUrbanLanduses > 0 ||
        buildingCandidates.length >= 8 ||
        (buildingCandidates.length >= 6 && width >= 10) ||
        (nearbyUrbanLanduses > 0 && buildingCandidates.length >= 3)
      );
    const ruralGreenContext =
      evaluateUrbanContext &&
      nearbyUrbanLanduses === 0 &&
      (nearbyGreenLanduses > 0 || buildingCandidates.length < 5);
    const continuitySidewalk = evaluateUrbanContext ? roadConnectedSidewalkContinuity(road, denseUrbanContext, ruralGreenContext) : false;
    const shouldBuildSidewalks =
      evaluateUrbanContext &&
      (explicitSidewalkHint || continuitySidewalk || (denseUrbanContext && !ruralGreenContext));
    const sidewalkWidth = shouldBuildSidewalks ? roadBaseSidewalkWidth(road, denseUrbanContext) : 0;
    const nearbyIntersections = shouldBuildSidewalks ? intersections.filter((intersection) =>
      boundsIntersectLocal(roadBounds, { minX: intersection.x, maxX: intersection.x, minZ: intersection.z, maxZ: intersection.z }, Math.max(width * 1.8, 14))
    ) : [];
    const endpointIntersections = shouldBuildSidewalks ? {
      start: nearbyIntersections.find((intersection) =>
        intersection?.roads?.some((entry) => appCtx.roads?.[entry.roadIdx] === road && entry.ptIdx === 0)
      ) || null,
      end: nearbyIntersections.find((intersection) =>
        intersection?.roads?.some((entry) => appCtx.roads?.[entry.roadIdx] === road && entry.ptIdx === road.pts.length - 1)
      ) || null
    } : null;

    const ribbonEdges = buildFeatureRibbonEdges(road, pts, hw, cachedBaseTerrainHeight, {
      surfaceBias: Number.isFinite(road?.surfaceBias) ? road.surfaceBias : 0.42
    });
    leftEdge.push(...ribbonEdges.leftEdge);
    rightEdge.push(...ribbonEdges.rightEdge);

    // OPTIMIZATION: Smooth edge heights to eliminate micro-bumps (reduced from 2 to 1 pass)
    const edgeSmoothPasses =
      road?.structureSemantics?.terrainMode === 'elevated' ?
        5 :
      road?.structureSemantics?.terrainMode && road.structureSemantics.terrainMode !== 'at_grade' ?
        4 :
      hasTransitionAnchors ?
        3 :
        1;
    for (let pass = 0; pass < edgeSmoothPasses; pass++) {
      for (let i = 1; i < leftEdge.length - 1; i++) {
        const selfWeight = hasTransitionAnchors || road?.structureSemantics?.terrainMode === 'elevated' ? 0.44 : 0.52;
        const neighborWeight = (1 - selfWeight) * 0.5;
        leftEdge[i].y = leftEdge[i].y * selfWeight + (leftEdge[i - 1].y + leftEdge[i + 1].y) * neighborWeight;
        rightEdge[i].y = rightEdge[i].y * selfWeight + (rightEdge[i - 1].y + rightEdge[i + 1].y) * neighborWeight;
      }
    }

    for (let i = 0; i < leftEdge.length; i++) {
      verts.push(leftEdge[i].x, leftEdge[i].y, leftEdge[i].z);
      verts.push(rightEdge[i].x, rightEdge[i].y, rightEdge[i].z);
      if (i < leftEdge.length - 1) {
        const vi = i * 2;
        indices.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);
      }
    }
    appendIndexedGeometryToGroupedBatch(
      roadMainBatchGroups,
      road.continuousWorldRegionKeys,
      verts,
      indices
    );

    // Build road skirts (edge curtains) to hide terrain peeking
    const terrainMode = road?.structureSemantics?.terrainMode;
    if (shouldRenderRoadSkirts(road)) {
      const skirtDepth =
        terrainMode === 'subgrade' ? 0.3 :
        3.6;
      const skirtData = buildRoadSkirts(leftEdge, rightEdge, skirtDepth);
      if (skirtData.verts.length > 0) {
        appendIndexedGeometryToGroupedBatch(
          roadSkirtBatchGroups,
          road.continuousWorldRegionKeys,
          skirtData.verts,
          skirtData.indices
        );
      }
    }

    if (shouldBuildSidewalks && !deferUrbanSurfaceRefresh) {
      const allowLeft = road.sidewalkHint !== 'right';
      const allowRight = road.sidewalkHint !== 'left';
      if (allowLeft) buildSidewalkStrip(pts, leftEdge, 1, hw, sidewalkWidth, road, buildingCandidates, nearbyIntersections, endpointIntersections);
      if (allowRight) buildSidewalkStrip(pts, rightEdge, -1, hw, sidewalkWidth, road, buildingCandidates, nearbyIntersections, endpointIntersections);
    }
    processedRoadCount += 1;
    const elapsedBatchMs = performance.now() - batchLoopStartedAt;
    const reachedSoftBatchBudget =
      processedRoadCount >= effectiveMinRoadsPerBatch &&
      elapsedBatchMs >= maxBatchMs;
    const reachedHardBatchBudget =
      processedRoadCount >= 1 &&
      elapsedBatchMs >= hardBatchMs;
    if (
      canStagePartialRebuild &&
      roadIndex + 1 < batchEnd &&
      (reachedSoftBatchBudget || reachedHardBatchBudget)
    ) {
      batchEnd = roadIndex + 1;
      break;
    }
  }

  if (canStagePartialRebuild) {
    const totalScopedRoads = Array.isArray(stagedTask?.roads) ? stagedTask.roads.length : allScopedRoads.length;
    if (!Number.isFinite(batchEnd) || batchEnd < batchStart) batchEnd = batchStart;
    if (!processedRoadCount && batchStart < totalScopedRoads) {
      batchEnd = Math.min(totalScopedRoads, batchStart + 1);
      processedRoadCount = Math.max(1, batchEnd - batchStart);
    }
    if (stagedTask) stagedTask.cursor = batchEnd;
    finalBatch = batchEnd >= totalScopedRoads;
    terrain._surfaceSyncMode = 'partial_batched';
    terrain._surfaceSyncLastBatchRoads = processedRoadCount;
    terrain._surfaceSyncPendingRoads = Math.max(0, totalScopedRoads - batchEnd);
  }

  if (finalBatch && !deferUrbanSurfaceRefresh) {
    intersections.forEach((intersection) => {
      if (partialRebuild) {
        const intersectionRegionKeys = buildContinuousWorldRegionKeysFromPoints([{ x: intersection.x, z: intersection.z }]);
        if (!regionKeySetIntersects(intersectionRegionKeys, activeRegionKeySet)) return;
      }
      const hasGradeSeparatedRoad = Array.isArray(intersection?.roads) && intersection.roads.some((entry) => {
        const road = appCtx.roads?.[entry?.roadIdx];
        return road?.structureSemantics?.terrainMode && road.structureSemantics.terrainMode !== 'at_grade';
      });
      if (hasGradeSeparatedRoad) return;
      if (!shouldBuildIntersectionCap(intersection)) return;
      const radius = computeIntersectionCapRadius(intersection);
      const capData = buildIntersectionCap(intersection.x, intersection.z, radius, 24);
      appendIndexedGeometryToGroupedBatch(
        roadCapBatchGroups,
        buildContinuousWorldRegionKeysFromPoints([{ x: intersection.x, z: intersection.z }]),
        capData.verts,
        capData.indices
      );
    });
  }

  buildGroupedIndexedBatchMeshes({
    scene: appCtx.scene,
    targetList: appCtx.roadMeshes,
    groups: roadMainBatchGroups,
    material: roadMat,
    renderOrder: 2,
    userData: {
      isRoadBatch: true,
      sharedRoadMaterial: true,
      continuousWorldFeatureFamily: 'roads',
      surfaceSyncRebuildToken: activeRebuildToken || undefined
    }
  });
  buildGroupedIndexedBatchMeshes({
    scene: appCtx.scene,
    targetList: appCtx.roadMeshes,
    groups: roadSkirtBatchGroups,
    material: skirtMat,
    renderOrder: 1,
    userData: {
      isRoadBatch: true,
      isRoadSkirt: true,
      sharedRoadMaterial: true,
      continuousWorldFeatureFamily: 'roads',
      surfaceSyncRebuildToken: activeRebuildToken || undefined
    }
  });
  buildGroupedIndexedBatchMeshes({
    scene: appCtx.scene,
    targetList: appCtx.roadMeshes,
    groups: roadCapBatchGroups,
    material: capMat,
    renderOrder: 3,
    userData: {
      isRoadBatch: true,
      isIntersectionCap: true,
      sharedRoadMaterial: true,
      continuousWorldFeatureFamily: 'roads',
      surfaceSyncRebuildToken: activeRebuildToken || undefined
    }
  });
  if (typeof appCtx.markRoadMeshSpatialIndexDirty === 'function') {
    appCtx.markRoadMeshSpatialIndexDirty();
  }
  if (!deferUrbanSurfaceRefresh) {
    const sidewalkGroups = Array.from(sidewalkBatchGroups.values());
    sidewalkGroups.forEach((group) => {
      appCtx.urbanSurfaceStats.sidewalkBatchCount += 1;
      appCtx.urbanSurfaceStats.sidewalkVertices += (Array.isArray(group?.verts) ? group.verts.length / 3 : 0);
      appCtx.urbanSurfaceStats.sidewalkTriangles += (Array.isArray(group?.indices) ? group.indices.length / 3 : 0);
    });
    buildGroupedIndexedBatchMeshes({
      scene: appCtx.scene,
      targetList: appCtx.urbanSurfaceMeshes,
      groups: sidewalkBatchGroups,
      material: sidewalkMat,
      renderOrder: 2,
      userData: {
        isUrbanSurfaceBatch: true,
        isSidewalkBatch: true,
        sharedUrbanSurfaceMaterial: true,
        continuousWorldFeatureFamily: 'surfaces',
        surfaceSyncRebuildToken: activeRebuildToken || undefined
      }
    });
  }

  if (finalBatch) {
    if (partialRebuild) {
      pruneMeshesForRebuildScope(appCtx.roadMeshes, activeRegionKeySet, activeSyncBounds, {
        preserveRebuildToken: activeRebuildToken
      });
      if (!deferUrbanSurfaceRefresh) {
        pruneMeshesForRebuildScope(appCtx.urbanSurfaceMeshes, activeRegionKeySet, activeSyncBounds, {
          preserveRebuildToken: activeRebuildToken
        });
        recomputeUrbanSurfaceStats();
      }
    }
    const structureVisualOptions = partialRebuild ? { bounds: activeSyncBounds, regionKeys: activeRegionKeySet } : {};
    if (shouldDeferStructureVisualsAfterSurfaceSync(partialRebuild, finalBatch)) {
      deferStructureVisualRebuild(
        structureVisualOptions,
        appCtx.droneMode ? 'motion_surface_sync_drone' : 'motion_surface_sync_drive'
      );
    } else {
      rebuildStructureVisualMeshes(structureVisualOptions);
    }
    appCtx.roadsNeedRebuild = false;
    terrain._activeSurfaceSyncTask = null;
    terrain._surfaceSyncPendingRoads = 0;
    terrain._surfaceSyncMode = partialRebuild ? 'partial_complete' : 'full_complete';
    maybeClearSurfaceSyncRoadMutationState(activeSyncBounds, activeRegionKeySet, appCtx.roads.length);
    if (roadDebugMode) {
      refreshRoadDebugMode();
    }

    // Run validation if enabled
    if (typeof validateRoadTerrainConformance === 'function') {
      setTimeout(() => validateRoadTerrainConformance(), 100);
    }
    return true;
  }

  appCtx.roadsNeedRebuild = true;
  return false;
}

function reprojectWaterwayMeshToTerrain(mesh) {
  const centerline = mesh.userData?.waterwayCenterline;
  if (!centerline || centerline.length < 2) return false;

  const width = mesh.userData?.waterwayWidth || 6;
  const halfWidth = width * 0.5;
  const verticalBias = Number.isFinite(mesh.userData?.waterwayBias) ? mesh.userData.waterwayBias : 0.08;
  const positions = mesh.geometry?.attributes?.position;
  if (!positions || positions.count < centerline.length * 2) return false;

  for (let i = 0; i < centerline.length; i++) {
    const p = centerline[i];

    let dx, dz;
    if (i === 0) {
      dx = centerline[1].x - p.x;
      dz = centerline[1].z - p.z;
    } else if (i === centerline.length - 1) {
      dx = p.x - centerline[i - 1].x;
      dz = p.z - centerline[i - 1].z;
    } else {
      dx = centerline[i + 1].x - centerline[i - 1].x;
      dz = centerline[i + 1].z - centerline[i - 1].z;
    }

    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;

    const leftX = p.x + nx * halfWidth;
    const leftZ = p.z + nz * halfWidth;
    const rightX = p.x - nx * halfWidth;
    const rightZ = p.z - nz * halfWidth;
    const leftY = terrainMeshHeightAt(leftX, leftZ) + verticalBias;
    const rightY = terrainMeshHeightAt(rightX, rightZ) + verticalBias;

    positions.setXYZ(i * 2, leftX, leftY, leftZ);
    positions.setXYZ(i * 2 + 1, rightX, rightY, rightZ);
  }

  positions.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  return true;
}

function reprojectLinearFeatureMeshToTerrain(mesh) {
  const centerline = mesh.userData?.linearFeatureCenterline;
  if (!centerline || centerline.length < 2) return false;

  const width = mesh.userData?.linearFeatureWidth || 2;
  const halfWidth = width * 0.5;
  const verticalBias = Number.isFinite(mesh.userData?.linearFeatureBias) ? mesh.userData.linearFeatureBias : 0.05;
  const positions = mesh.geometry?.attributes?.position;
  if (!positions || positions.count < centerline.length * 2) return false;
  const featureRef = mesh.userData?.linearFeatureRef || null;
  if (featureRef?.structureSemantics?.gradeSeparated) {
    const ribbonEdges = buildFeatureRibbonEdges(featureRef, centerline, halfWidth, cachedBaseTerrainHeight, {
      surfaceBias: verticalBias
    });
    if (ribbonEdges.leftEdge.length === centerline.length && ribbonEdges.rightEdge.length === centerline.length) {
      for (let i = 0; i < centerline.length; i++) {
        const leftEdge = ribbonEdges.leftEdge[i];
        const rightEdge = ribbonEdges.rightEdge[i];
        positions.setXYZ(i * 2, leftEdge.x, leftEdge.y, leftEdge.z);
        positions.setXYZ(i * 2 + 1, rightEdge.x, rightEdge.y, rightEdge.z);
      }
      positions.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
      return true;
    }
  }

  const resolveBaseY = (x, z, kind) => {
    const terrainY = terrainMeshHeightAt(x, z);
    const fallbackTerrain = Number.isFinite(terrainY) ? terrainY : 0;
    const nearestRoad = typeof appCtx.findNearestRoad === 'function' ? appCtx.findNearestRoad(x, z, {
      y: fallbackTerrain + 0.4,
      maxVerticalDelta: 6
    }) : null;
    const snapPadding =
      kind === 'footway' ? 2.4 :
      kind === 'cycleway' ? 2.0 :
      1.0;
    const shouldSnapToRoad = isRoadSurfaceReachable(nearestRoad, {
      extraLateralPadding: snapPadding - 1.35
    });
    if (shouldSnapToRoad) {
      const roadSampleX = Number.isFinite(nearestRoad?.pt?.x) ? nearestRoad.pt.x : x;
      const roadSampleZ = Number.isFinite(nearestRoad?.pt?.z) ? nearestRoad.pt.z : z;
      const roadY =
        appCtx.GroundHeight && typeof appCtx.GroundHeight.roadMeshY === 'function' ?
          appCtx.GroundHeight.roadMeshY(roadSampleX, roadSampleZ) :
          null;
      if (Number.isFinite(roadY)) return roadY;
      if (appCtx.GroundHeight && typeof appCtx.GroundHeight.roadSurfaceY === 'function') {
        return appCtx.GroundHeight.roadSurfaceY(roadSampleX, roadSampleZ);
      }
      return fallbackTerrain + 0.2;
    }
    return fallbackTerrain;
  };
  const kind = String(mesh.userData?.linearFeatureKind || '').toLowerCase();

  for (let i = 0; i < centerline.length; i++) {
    const p = centerline[i];

    let dx, dz;
    if (i === 0) {
      dx = centerline[1].x - p.x;
      dz = centerline[1].z - p.z;
    } else if (i === centerline.length - 1) {
      dx = p.x - centerline[i - 1].x;
      dz = p.z - centerline[i - 1].z;
    } else {
      dx = centerline[i + 1].x - centerline[i - 1].x;
      dz = centerline[i + 1].z - centerline[i - 1].z;
    }

    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const leftX = p.x + nx * halfWidth;
    const leftZ = p.z + nz * halfWidth;
    const rightX = p.x - nx * halfWidth;
    const rightZ = p.z - nz * halfWidth;
    const leftY = resolveBaseY(leftX, leftZ, kind) + verticalBias;
    const rightY = resolveBaseY(rightX, rightZ, kind) + verticalBias;

    positions.setXYZ(i * 2, leftX, leftY, leftZ);
    positions.setXYZ(i * 2 + 1, rightX, rightY, rightZ);
  }

  positions.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  return true;
}

// Reposition buildings and landuse to follow terrain
function repositionBuildingsWithTerrain() {
  if (!appCtx.terrainEnabled || appCtx.onMoon) return;

  let buildingsRepositioned = 0;
  let landuseRepositioned = 0;
  let poisRepositioned = 0;
  const activeSyncBounds = getActiveSurfaceSyncBounds();

  // Reposition buildings using terrain mesh surface
  appCtx.buildingMeshes.forEach((mesh) => {
    const pts = mesh.userData.buildingFootprint;
    if (!pts || pts.length === 0) return;
    const footprintBounds = getCachedMeshLocalBounds(mesh, 'buildingFootprintBounds');
    if (activeSyncBounds && footprintBounds && !boundsIntersectLocal(footprintBounds, activeSyncBounds)) return;

    const fallbackElevation = Number.isFinite(mesh.userData?.avgElevation) ?
    mesh.userData.avgElevation :
    0;

    // Use minimum elevation of footprint corners so building sits on terrain.
    // Prefer terrain mesh samples; if unavailable, fall back to base elevation
    // model to avoid buildings popping/floating while tiles stream in.
    let minElevation = Infinity;
    let maxElevation = -Infinity;
    let sampleCount = 0;
    pts.forEach((p) => {
      let h = terrainMeshHeightAt(p.x, p.z);
      if ((!Number.isFinite(h) || h === 0) && typeof elevationWorldYAtWorldXZ === 'function') {
        h = elevationWorldYAtWorldXZ(p.x, p.z);
      }
      if (h === 0 && Math.abs(fallbackElevation) > 2) h = fallbackElevation;
      if (!Number.isFinite(h)) return;
      minElevation = Math.min(minElevation, h);
      maxElevation = Math.max(maxElevation, h);
      sampleCount++;
    });
    if (!Number.isFinite(minElevation) || sampleCount === 0) {
      minElevation = Number.isFinite(fallbackElevation) ? fallbackElevation : 0;
      maxElevation = minElevation;
    }
    const slopeRange = Number.isFinite(maxElevation) && Number.isFinite(minElevation) ?
    Math.max(0, maxElevation - minElevation) :
    0;
    const reliefLift = slopeRange >= 0.15 ?
    Math.min(0.35, slopeRange * 0.22) :
    0.05;
    const structureBaseOffset = Number.isFinite(mesh.userData?.structureBaseOffset) ?
      mesh.userData.structureBaseOffset :
      0;
    const baseElevation = minElevation + reliefLift + structureBaseOffset;

    const midLodUsesFootprintGeometry = mesh.userData?.midLodUsesFootprintGeometry === true;
    const midLodHalfHeight = Number.isFinite(mesh.userData?.midLodHalfHeight) ?
    mesh.userData.midLodHalfHeight :
    0;
    mesh.position.y = midLodUsesFootprintGeometry ? baseElevation : baseElevation + midLodHalfHeight;
    mesh.userData.avgElevation = baseElevation;
    const sourceBuildingId = String(mesh.userData?.sourceBuildingId || '');
    if (sourceBuildingId && Array.isArray(appCtx.buildings)) {
      for (let i = 0; i < appCtx.buildings.length; i++) {
        const building = appCtx.buildings[i];
        if (!building || String(building.sourceBuildingId || '') !== sourceBuildingId) continue;
        building.baseY = baseElevation;
        building.minY = baseElevation;
        building.maxY = baseElevation + (Number.isFinite(building.height) ? building.height : 0);
      }
    }
    buildingsRepositioned++;
  });

  // Reposition landuse areas - deform vertices to follow terrain mesh surface
  appCtx.landuseMeshes.forEach((mesh) => {
    if (mesh.userData?.isWaterwayLine) {
      const lineBounds =
        mesh.userData?.localBounds ||
        pointsBoundsLocal(mesh.userData?.waterwayCenterline || [], 8);
      if (lineBounds && !mesh.userData?.localBounds) mesh.userData.localBounds = lineBounds;
      if (activeSyncBounds && lineBounds && !boundsIntersectLocal(lineBounds, activeSyncBounds)) return;
      if (reprojectWaterwayMeshToTerrain(mesh)) landuseRepositioned++;
      return;
    }

    const pts = mesh.userData.landuseFootprint;
    if (!pts || pts.length === 0) return;
    const footprintBounds = getCachedMeshLocalBounds(mesh, 'landuseFootprintBounds');
    if (activeSyncBounds && footprintBounds && !boundsIntersectLocal(footprintBounds, activeSyncBounds)) return;

    // Recalculate average elevation from terrain mesh
    let avgElevation = 0;
    pts.forEach((p) => {
      const h = terrainMeshHeightAt(p.x, p.z);
      avgElevation += h;
    });
    avgElevation /= pts.length;
    const isWaterPolygon = mesh.userData?.landuseType === 'water';
    mesh.position.y = avgElevation;

    // Deform each vertex to follow actual terrain mesh surface
    const positions = mesh.geometry.attributes.position;
    if (positions) {
      const flattenFactor = isWaterPolygon ?
      Number.isFinite(mesh.userData?.waterFlattenFactor) ? mesh.userData.waterFlattenFactor : 0.12 :
      1.0;
      const vertexOffset = isWaterPolygon ? 0.08 : 0.05;
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const z = positions.getZ(i);
        const tY = terrainMeshHeightAt(x, z);
        positions.setY(i, (tY - avgElevation) * flattenFactor + vertexOffset);
      }
      positions.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
      if (isWaterPolygon) mesh.userData.waterSurfaceBase = avgElevation;
      landuseRepositioned++;
    }
  });

  appCtx.linearFeatureMeshes.forEach((mesh) => {
    const lineBounds =
      mesh.userData?.localBounds ||
      pointsBoundsLocal(mesh.userData?.linearFeatureCenterline || [], 8);
    if (lineBounds && !mesh.userData?.localBounds) mesh.userData.localBounds = lineBounds;
    if (activeSyncBounds && lineBounds && !boundsIntersectLocal(lineBounds, activeSyncBounds)) return;
    if (reprojectLinearFeatureMeshToTerrain(mesh)) landuseRepositioned++;
  });

  // Reposition POI markers using terrain mesh surface
  appCtx.poiMeshes.forEach((mesh) => {
    const pos = mesh.userData.poiPosition;
    if (!pos) return;
    if (activeSyncBounds && !boundsContainsPointLocal(activeSyncBounds, pos.x, pos.z, 10)) return;

    const tY = terrainMeshHeightAt(pos.x, pos.z);
    const offset = mesh.userData.isCapMesh ? 4 : 2;
    mesh.position.y = tY + offset;
    poisRepositioned++;
  });

  // Reposition street furniture using terrain mesh surface
  appCtx.streetFurnitureMeshes.forEach((group) => {
    if (!group.userData || !group.userData.furniturePos) return;
    const pos = group.userData.furniturePos;
    if (activeSyncBounds && !boundsContainsPointLocal(activeSyncBounds, pos.x, pos.z, 10)) return;
    const tY = terrainMeshHeightAt(pos.x, pos.z);
    group.position.y = tY;
  });

  // Debug log removed
}

// =====================
// ROAD DEBUG MODE
// Toggle with 'R' key to visualize road-terrain conformance issues
// =====================
let roadDebugMode = false;
let roadDebugMeshes = [];
const ROAD_DEBUG_CONFIG = {
  maxRoadMeshes: 72,
  driveRadius: 720,
  walkRadius: 420,
  droneRadius: 1200,
  boatRadius: 520,
  oceanRadius: 0,
  maxProblemMarkers: 96
};
const roadDebugState = {
  mode: 'drive',
  centerX: 0,
  centerZ: 0,
  radius: ROAD_DEBUG_CONFIG.driveRadius,
  selectedMeshCount: 0,
  warningCount: 0
};
let roadDebugResources = null;

function currentRoadDebugActorState() {
  if (appCtx.oceanMode?.active) {
    const ocean = typeof appCtx.getOceanModeDebugState === 'function' ? appCtx.getOceanModeDebugState() : null;
    return {
      mode: 'ocean',
      x: Number(ocean?.position?.x || 0),
      z: Number(ocean?.position?.z || 0)
    };
  }
  if (appCtx.boatMode?.active) {
    return {
      mode: 'boat',
      x: Number(appCtx.boat?.x || 0),
      z: Number(appCtx.boat?.z || 0)
    };
  }
  if (appCtx.droneMode) {
    return {
      mode: 'drone',
      x: Number(appCtx.drone?.x || 0),
      z: Number(appCtx.drone?.z || 0)
    };
  }
  if (appCtx.Walk?.state?.mode === 'walk' && appCtx.Walk?.state?.walker) {
    return {
      mode: 'walk',
      x: Number(appCtx.Walk.state.walker.x || 0),
      z: Number(appCtx.Walk.state.walker.z || 0)
    };
  }
  return {
    mode: 'drive',
    x: Number(appCtx.car?.x || 0),
    z: Number(appCtx.car?.z || 0)
  };
}

function roadDebugRadiusForMode(mode = 'drive') {
  switch (String(mode || 'drive')) {
  case 'walk':
    return ROAD_DEBUG_CONFIG.walkRadius;
  case 'drone':
    return ROAD_DEBUG_CONFIG.droneRadius;
  case 'boat':
    return ROAD_DEBUG_CONFIG.boatRadius;
  case 'ocean':
    return ROAD_DEBUG_CONFIG.oceanRadius;
  default:
    return ROAD_DEBUG_CONFIG.driveRadius;
  }
}

function roadDebugBounds(centerX, centerZ, radius) {
  const r = Math.max(80, Number(radius) || ROAD_DEBUG_CONFIG.driveRadius);
  return {
    minX: centerX - r,
    maxX: centerX + r,
    minZ: centerZ - r,
    maxZ: centerZ + r
  };
}

function roadDebugMeshBounds(mesh) {
  const localBounds = mesh?.userData?.localBounds;
  if (
    Number.isFinite(localBounds?.minX) &&
    Number.isFinite(localBounds?.maxX) &&
    Number.isFinite(localBounds?.minZ) &&
    Number.isFinite(localBounds?.maxZ)
  ) {
    return localBounds;
  }
  const center = mesh?.userData?.lodCenter;
  const radius = Math.max(0, Number(mesh?.userData?.lodRadius || 0));
  if (center && Number.isFinite(center.x) && Number.isFinite(center.z)) {
    const r = Math.max(16, radius);
    return {
      minX: center.x - r,
      maxX: center.x + r,
      minZ: center.z - r,
      maxZ: center.z + r
    };
  }
  return null;
}

function roadDebugBoundsIntersect(a, b, padding = 0) {
  if (!a || !b) return false;
  return !(
    Number(a.maxX) < Number(b.minX) - padding ||
    Number(a.minX) > Number(b.maxX) + padding ||
    Number(a.maxZ) < Number(b.minZ) - padding ||
    Number(a.minZ) > Number(b.maxZ) + padding
  );
}

function roadDebugMeshDistanceSq(mesh, x, z) {
  const center = mesh?.userData?.lodCenter;
  if (center && Number.isFinite(center.x) && Number.isFinite(center.z)) {
    const dx = center.x - x;
    const dz = center.z - z;
    return dx * dx + dz * dz;
  }
  const bounds = roadDebugMeshBounds(mesh);
  if (!bounds) return Infinity;
  const cx = (Number(bounds.minX) + Number(bounds.maxX)) * 0.5;
  const cz = (Number(bounds.minZ) + Number(bounds.maxZ)) * 0.5;
  const dx = cx - x;
  const dz = cz - z;
  return dx * dx + dz * dz;
}

function ensureRoadDebugResources() {
  if (roadDebugResources) return roadDebugResources;
  roadDebugResources = {
    roadMaterial: new THREE.MeshBasicMaterial({
      color: 0xff0000,
      side: THREE.DoubleSide
    }),
    lineMaterial: new THREE.LineBasicMaterial({ color: 0xffff00 }),
    sphereGeometry: new THREE.SphereGeometry(0.3, 8, 8),
    sphereMaterial: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    markerGeometry: new THREE.BoxGeometry(0.5, 2, 0.5),
    markerMaterial: new THREE.MeshBasicMaterial({ color: 0xff00ff })
  };
  return roadDebugResources;
}

function disposeRoadDebugResources() {
  if (!roadDebugResources) return;
  Object.values(roadDebugResources).forEach((resource) => {
    if (resource && typeof resource.dispose === 'function') resource.dispose();
  });
  roadDebugResources = null;
}

function clearRoadDebugVisuals(options = {}) {
  const restoreMaterials = options.restoreMaterials !== false;
  if (restoreMaterials) {
    appCtx.roadMeshes.forEach((mesh) => {
      if (mesh?.userData?._roadDebugOriginalMaterial) {
        mesh.material = mesh.userData._roadDebugOriginalMaterial;
        delete mesh.userData._roadDebugOriginalMaterial;
      }
    });
  }
  roadDebugMeshes.forEach((m) => {
    appCtx.scene.remove(m);
    if (m.geometry && !m.userData?._sharedDebugGeometry) m.geometry.dispose();
  });
  roadDebugMeshes = [];
  roadDebugState.selectedMeshCount = 0;
  roadDebugState.warningCount = 0;
  if (options.disposeResources === true) disposeRoadDebugResources();
}

// Force disable debug mode and restore materials (useful if stuck)
function disableRoadDebugMode() {
  if (!roadDebugMode) return;

  roadDebugMode = false;
  clearRoadDebugVisuals({ restoreMaterials: true, disposeResources: true });
  if (typeof appCtx.updateEnvDebug === 'function') appCtx.updateEnvDebug();

  console.log('🔍 Road Debug Mode FORCE DISABLED - Materials restored');
}

function refreshRoadDebugMode() {
  if (!roadDebugMode) return false;

  clearRoadDebugVisuals({ restoreMaterials: true, disposeResources: false });
  const actor = currentRoadDebugActorState();
  const radius = roadDebugRadiusForMode(actor.mode);
  roadDebugState.mode = actor.mode;
  roadDebugState.centerX = actor.x;
  roadDebugState.centerZ = actor.z;
  roadDebugState.radius = radius;
  if (!(radius > 0)) return false;

  const bounds = roadDebugBounds(actor.x, actor.z, radius);
  const resources = ensureRoadDebugResources();
  const candidates = appCtx.roadMeshes
    .filter((mesh) => {
      if (!mesh || mesh.userData?.isRoadSkirt || mesh.userData?.isIntersectionCap || mesh.userData?.isRoadMarking) return false;
      return roadDebugBoundsIntersect(roadDebugMeshBounds(mesh), bounds, 24);
    })
    .sort((a, b) => roadDebugMeshDistanceSq(a, actor.x, actor.z) - roadDebugMeshDistanceSq(b, actor.x, actor.z))
    .slice(0, ROAD_DEBUG_CONFIG.maxRoadMeshes);

  let warningCount = 0;
  candidates.forEach((mesh) => {
    if (!mesh.userData._roadDebugOriginalMaterial) {
      mesh.userData._roadDebugOriginalMaterial = mesh.material;
    }
    mesh.material = resources.roadMaterial;

    const pos = mesh.geometry?.attributes?.position;
    if (!pos) return;

    const points = [];
    for (let i = 0; i < pos.count; i += 2) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (!roadDebugBoundsIntersect({ minX: x, maxX: x, minZ: z, maxZ: z }, bounds, 12)) continue;
      points.push(new THREE.Vector3(x, y + 0.5, z));
    }

    if (points.length > 1) {
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(lineGeo, resources.lineMaterial);
      appCtx.scene.add(line);
      roadDebugMeshes.push(line);
    }

    const pointStep = Math.max(12, Math.floor(points.length / 18) || 12);
    for (let i = 0; i < points.length; i += pointStep) {
      const sphere = new THREE.Mesh(resources.sphereGeometry, resources.sphereMaterial);
      sphere.userData._sharedDebugGeometry = true;
      sphere.position.copy(points[i]);
      appCtx.scene.add(sphere);
      roadDebugMeshes.push(sphere);
    }

    for (let i = 0; i < pos.count; i++) {
      if (warningCount >= ROAD_DEBUG_CONFIG.maxProblemMarkers) break;
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (!roadDebugBoundsIntersect({ minX: x, maxX: x, minZ: z, maxZ: z }, bounds, 12)) continue;
      const terrainY = terrainMeshHeightAt(x, z);
      if (y - terrainY < -0.05) {
        const marker = new THREE.Mesh(resources.markerGeometry, resources.markerMaterial);
        marker.userData._sharedDebugGeometry = true;
        marker.position.set(x, y + 1, z);
        appCtx.scene.add(marker);
        roadDebugMeshes.push(marker);
        warningCount += 1;
      }
    }
  });

  roadDebugState.selectedMeshCount = candidates.length;
  roadDebugState.warningCount = warningCount;
  if (typeof appCtx.updateEnvDebug === 'function') appCtx.updateEnvDebug();
  return true;
}

function toggleRoadDebugMode() {
  roadDebugMode = !roadDebugMode;

  if (roadDebugMode) {
    console.log('🔍 Road Debug Mode ENABLED');
    refreshRoadDebugMode();

  } else {
    console.log('🔍 Road Debug Mode DISABLED');
    clearRoadDebugVisuals({ restoreMaterials: true, disposeResources: true });
    if (typeof appCtx.updateEnvDebug === 'function') appCtx.updateEnvDebug();
  }
}

// =====================
// ROAD-TERRAIN CONFORMANCE VALIDATOR
// Automated runtime checks for road-terrain alignment
// =====================

function validateRoadTerrainConformance() {
  if (!appCtx.terrainEnabled || appCtx.roads.length === 0 || appCtx.onMoon) return;

  console.log('🔬 Validating road-terrain conformance...');

  let totalSamples = 0;
  let issuesFound = 0;
  const worstDeltas = [];

  appCtx.roadMeshes.forEach((mesh, meshIdx) => {
    if (mesh.userData.isRoadSkirt || mesh.userData.isIntersectionCap) return;

    const pos = mesh.geometry.attributes.position;
    if (!pos) return;

    const roadIdx = mesh.userData.roadIdx;
    const road = appCtx.roads[roadIdx];
    if (!road) return;

    // Sample every 5th vertex (performance)
    for (let i = 0; i < pos.count; i += 5) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);

      const terrainY = terrainMeshHeightAt(x, z);
      const delta = y - terrainY;

      totalSamples++;

      // Flag issues
      if (delta < -0.05) {
        issuesFound++;
        const { lat, lon } = worldToLatLon(x, z);
        worstDeltas.push({
          roadName: road.name || `Road ${roadIdx}`,
          delta: delta.toFixed(3),
          lat: lat.toFixed(6),
          lon: lon.toFixed(6),
          worldPos: `(${x.toFixed(1)}, ${z.toFixed(1)})`
        });
      }
    }
  });

  // Sort by worst delta
  worstDeltas.sort((a, b) => parseFloat(a.delta) - parseFloat(b.delta));

  console.log(`✅ Validation complete: ${totalSamples} samples checked`);

  if (issuesFound > 0) {
    console.warn(`⚠️  Found ${issuesFound} points where road is below terrain (delta < -0.05)`);
    console.warn('Worst 10 deltas:');
    worstDeltas.slice(0, 10).forEach((d) => {
      console.warn(`  ${d.roadName}: delta=${d.delta}m at ${d.worldPos} (${d.lat}, ${d.lon})`);
    });
  } else {
    console.log('✅ No issues found - all roads conform to terrain!');
  }

  // Check for gaps at intersections
  const intersections = detectRoadIntersections(appCtx.roads);
  console.log(`📍 Detected ${intersections.length} intersections`);

  return {
    totalSamples,
    issuesFound,
    worstDeltas: worstDeltas.slice(0, 10),
    intersectionCount: intersections.length
  };
}

function isRoadDebugModeEnabled() {
  return roadDebugMode === true;
}

function getRoadDebugModeSnapshot() {
  return {
    enabled: roadDebugMode === true,
    mode: roadDebugState.mode,
    centerX: roadDebugState.centerX,
    centerZ: roadDebugState.centerZ,
    radius: roadDebugState.radius,
    selectedMeshCount: roadDebugState.selectedMeshCount,
    warningCount: roadDebugState.warningCount,
    debugMeshCount: roadDebugMeshes.length
  };
}

Object.assign(appCtx, {
  applyTerrainVisualProfile,
  applyHeightsToTerrainMesh,
  baseTerrainHeightAt: cachedBaseTerrainHeight,
  buildRoadSkirts,
  cancelRoadAndBuildingRebuild,
  clearStructureVisualMeshes,
  clearTerrainTileCache,
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
  getTerrainStreamingSnapshot,
  getOrLoadTerrainTile,
  handleContinuousWorldRebase,
  latLonToTileXY,
  primeRoadSurfaceSyncState,
  rebuildRoadsWithTerrain,
  requestWorldSurfaceSync,
  repositionBuildingsWithTerrain,
  rebuildStructureVisualMeshes,
  refreshTerrainSurfaceProfiles,
  resetTerrainStreamingState,
  sampleTileElevationMeters,
  setWorldSurfaceProfile,
  subdivideRoadPoints,
  terrainMeshHeightAt,
  isRoadDebugModeEnabled,
  getRoadDebugModeSnapshot,
  tileXYToLatLonBounds,
  toggleRoadDebugMode,
  updateTerrainAround,
  validateRoadTerrainConformance,
  worldToLatLon
});

export {
  applyTerrainVisualProfile,
  applyHeightsToTerrainMesh,
  baseTerrainHeightAt,
  buildRoadSkirts,
  cancelRoadAndBuildingRebuild,
  clearStructureVisualMeshes,
  clearTerrainTileCache,
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
  getTerrainStreamingSnapshot,
  getOrLoadTerrainTile,
  handleContinuousWorldRebase,
  latLonToTileXY,
  primeRoadSurfaceSyncState,
  rebuildRoadsWithTerrain,
  requestWorldSurfaceSync,
  repositionBuildingsWithTerrain,
  rebuildStructureVisualMeshes,
  refreshTerrainSurfaceProfiles,
  resetTerrainStreamingState,
  sampleTileElevationMeters,
  setWorldSurfaceProfile,
  subdivideRoadPoints,
  terrainMeshHeightAt,
  isRoadDebugModeEnabled,
  getRoadDebugModeSnapshot,
  tileXYToLatLonBounds,
  toggleRoadDebugMode,
  updateTerrainAround,
  validateRoadTerrainConformance,
  worldToLatLon };
