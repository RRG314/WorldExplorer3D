import { ctx as appCtx } from "./shared-context.js?v=55"; // ============================================================================
import {
  appendIndexedGeometryToGroupedBatch,
  buildGroupedIndexedBatchMeshes,
  createRoadSurfaceMaterials
} from "./road-render.js?v=3";
import {
  classifyWaterSurfaceProfile,
  classifyWorldSurfaceProfile,
  normalizeLanduseSurfaceType
} from "./surface-rules.js?v=3";
import {
  buildWaterShaderLibrary,
  inferWaterRenderContext
} from "./water-dynamics.js?v=2";
import {
  areRoadsConnected,
  assignFeatureConnections,
  buildFeatureRibbonEdges,
  buildFeatureStations,
  buildFeatureTransitionAnchors,
  classifyStructureSemantics,
  featureTraversalKey,
  isRoadSurfaceReachable,
  projectPointToFeature,
  roadBehavesGradeSeparated,
  roadSurfaceAttachmentThreshold,
  roadSurfaceLateralThreshold,
  sampleProfileAtDistance,
  sampleFeatureSurfaceY,
  shouldRenderRoadSkirts,
  updateFeatureSurfaceProfile
} from "./structure-semantics.js?v=26";
import {
  interpretBuildingSemantics
} from "./building-semantics.js?v=2";
import {
  assignContinuousWorldRegionKeysToTarget,
  buildContinuousWorldRegionKeysFromPoints,
  mergeContinuousWorldRegionKeysFromTargets,
  targetIntersectsContinuousWorldTrackedRegions
} from "./continuous-world-feature-manager.js?v=2";
import {
  currentMapReferenceGeoPosition,
  geoPointToWorld
} from "./map-coordinates.js?v=1";
// world.js - OSM data loading, roads, buildings, landuse, POIs
// ============================================================================

const OVERPASS_ENDPOINTS = [
'https://overpass-api.de/api/interpreter',
'https://lz4.overpass-api.de/api/interpreter',
'https://overpass.kumi.systems/api/interpreter'];
const LOCAL_BROWSER_OVERPASS_ENDPOINTS = [
'https://lz4.overpass-api.de/api/interpreter',
'https://overpass-api.de/api/interpreter'];
const LOCAL_OVERPASS_PROXY_PATH = '/api/overpass';


const OVERPASS_STAGGER_MS = 220;
const OVERPASS_MIN_TIMEOUT_MS = 5000;
const OVERPASS_MEMORY_CACHE_TTL_MS = 6 * 60 * 1000;
const OVERPASS_MEMORY_CACHE_MAX = 6;
const OVERPASS_PERSISTENT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const OVERPASS_PERSISTENT_CACHE_STALE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const OVERPASS_PERSISTENT_CACHE_MAX = 18;
const OVERPASS_PERSISTENT_CACHE_DB = 'worldExplorer3D.overpassCache.v1';
const OVERPASS_PERSISTENT_CACHE_STORE = 'responses';
const OVERPASS_LOC_EPSILON = 1e-7;
const WATER_VECTOR_TILE_ZOOM = 13;
const WATER_VECTOR_TILE_FETCH_TIMEOUT_MS = 8000;
const WATER_VECTOR_TILE_ENDPOINT = (z, x, y) =>
`https://vector.openstreetmap.org/shortbread_v1/${z}/${x}/${y}.mvt`;
let _vectorTileLibPromise = null;
const BUILDING_INDEX_CELL_SIZE = 120;
const LANDUSE_INDEX_CELL_SIZE = 180;
const ROAD_MESH_INDEX_CELL_SIZE = 320;
let buildingSpatialIndex = new Map();
let landuseSpatialIndex = new Map();
let roadMeshSpatialIndex = new Map();
let roadMeshSpatialIndexDirty = true;
let roadMeshSpatialIndexMembers = new Set();
let roadMeshLodVisibleSet = new Set();
let lastRoadMeshLodCandidateCount = 0;
const FEATURE_TILE_DEGREES = 0.002;
const _rdtTileDepthCache = new Map();
const _overpassMemoryCache = [];
let _overpassPersistentCacheDbPromise = null;
let _lastOverpassEndpoint = null;
let _localOverpassProxyUnavailable = false;
const ROAD_ENDPOINT_EXTENSION_SCALE = 0.5;
const ROAD_ENDPOINT_EXTENSION_MIN = 0.35;
const ROAD_ENDPOINT_EXTENSION_MAX = 2.0;
const FEATURE_CLIP_RADIUS_SCALE = 1.75;
const FEATURE_CLIP_RADIUS_MIN = 1900;
const FEATURE_CLIP_RADIUS_MAX = 9000;
const FEATURE_MAX_SEGMENT_SCALE = 0.48;
const FEATURE_MAX_SEGMENT_MIN = 260;
const FEATURE_MAX_SEGMENT_MAX = 1700;
const FEATURE_MAX_SPAN_SCALE = 1.25;
const FEATURE_MAX_AREA_SCALE = 1.0;
const FEATURE_MIN_POLYGON_AREA = 8;
const FEATURE_MIN_HOLE_AREA = 6;
const CONTINUOUS_WORLD_INTERACTIVE_STREAM_MIN_INTERVAL_MS = 900;
const CONTINUOUS_WORLD_INTERACTIVE_STREAM_FAST_INTERVAL_MS = 260;
const CONTINUOUS_WORLD_INTERACTIVE_STREAM_MAX_COVERAGE = 10;
const CONTINUOUS_WORLD_INTERACTIVE_STREAM_RECENT_RETAIN_COUNT = 2;
const CONTINUOUS_WORLD_INTERACTIVE_STREAM_ROAD_RECENT_RETAIN_COUNT = 6;
const CONTINUOUS_WORLD_INTERACTIVE_STREAM_ROAD_RADIUS_MIN = 0.012;
const CONTINUOUS_WORLD_INTERACTIVE_STREAM_ROAD_RADIUS_MAX = 0.034;
const CONTINUOUS_WORLD_INTERACTIVE_STREAM_FEATURE_RADIUS_MIN = 0.016;
const CONTINUOUS_WORLD_INTERACTIVE_STREAM_FEATURE_RADIUS_MAX = 0.026;
const CONTINUOUS_WORLD_INTERACTIVE_STREAM_COLLIDER_RADIUS = 180;
const CONTINUOUS_WORLD_INTERACTIVE_STREAM_WALK_COLLIDER_RADIUS = 180;
const CONTINUOUS_WORLD_INTERACTIVE_STREAM_STARTUP_BUILDING_RADIUS_SCALE = 0.52;
const CONTINUOUS_WORLD_INTERACTIVE_STREAM_STARTUP_BUILDING_RADIUS_MIN = 0.010;
const CONTINUOUS_WORLD_BASE_EVICTION_MIN_DISTANCE = 900;
const CONTINUOUS_WORLD_BASE_EVICTION_MIN_INTERVAL_MS = 1800;
const CONTINUOUS_WORLD_BASE_EVICTION_SYNC_INTERVAL_MS = 650;
const CONTINUOUS_WORLD_BASE_EVICTION_MIN_BUILDING_MESHES = 420;
const CONTINUOUS_WORLD_BASE_EVICTION_MIN_MISC_MESHES = 180;
const CONTINUOUS_WORLD_BASE_EVICTION_MIN_ROAD_MESHES = 220;
const CONTINUOUS_WORLD_BASE_EVICTION_MIN_SURFACE_MESHES = 140;
const CONTINUOUS_WORLD_BASE_EVICTION_FAR_DISTANCE = 2200;
const CONTINUOUS_WORLD_BASE_EVICTION_ULTRA_DISTANCE = 4200;
const DRIVEABLE_HIGHWAY_TYPES = new Set([
  'motorway',
  'motorway_link',
  'trunk',
  'trunk_link',
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
  'tertiary',
  'tertiary_link',
  'residential',
  'unclassified',
  'living_street',
  'service'
]);
const LINEAR_FEATURE_STYLE_PRESETS = {
  railway: {
    width: 3.2,
    bias: 0.02,
    color: 0x53545a,
    emissive: 0x111317,
    emissiveIntensity: 0.08,
    roughness: 0.9,
    metalness: 0.07,
    opacity: 1
  },
  footway: {
    width: 2.9,
    bias: 0.018,
    color: 0xbfb8ad,
    emissive: 0x1c1a17,
    emissiveIntensity: 0.03,
    roughness: 0.98,
    metalness: 0.01,
    opacity: 1
  },
  cycleway: {
    width: 3.0,
    bias: 0.018,
    color: 0x6f847a,
    emissive: 0x131916,
    emissiveIntensity: 0.03,
    roughness: 0.95,
    metalness: 0.02,
    opacity: 1
  }
};
const _continuousWorldInteractiveStreamState = {
  enabled: true,
  autoKickEnabled: true,
  seededSignature: '',
  pending: false,
  pendingStartedAt: 0,
  pendingQueryLat: NaN,
  pendingQueryLon: NaN,
  pendingRegionKey: null,
  activeRequestId: 0,
  abortController: null,
  recoveryTimerId: null,
  recoveryShellTimerId: null,
  hardRecoveryTimerId: null,
  hardRecoveryInFlight: false,
  lastHardRecoveryAt: 0,
  lastKickAt: 0,
  lastLoadAt: 0,
  lastLoadReason: null,
  lastError: null,
  coverage: [],
  loadedRoadIds: new Set(),
  loadedBuildingIds: new Set(),
  loadedLanduseIds: new Set(),
  loadedWaterwayIds: new Set(),
  totalAddedRoads: 0,
  totalAddedBuildings: 0,
  totalAddedLanduseMeshes: 0,
  totalAddedWaterAreas: 0,
  totalAddedWaterways: 0,
  totalLoads: 0,
  forcedSurfaceSyncLoads: 0,
  deferredSurfaceSyncLoads: 0,
  skippedSurfaceSyncLoads: 0,
  lastSurfaceSyncPolicy: null,
  activeInteractiveRoads: 0,
  activeInteractiveBuildings: 0,
  activeInteractiveLanduse: 0,
  activeInteractiveWaterways: 0,
  evictedRoads: 0,
  evictedBuildings: 0,
  evictedLanduse: 0,
  evictedWaterways: 0,
  evictedMeshes: 0
};
const _replacedBaseBuildingSourceIds = new Set();
let _lastBaseWorldEvictionAt = 0;
const PLAYABLE_CORE_RESIDENCY_CONFIG = {
  driveRadius: 1800,
  walkRadius: 950,
  droneRadius: 2400,
  boatRadius: 1700,
  oceanRadius: 2200,
  structureRadiusScale: 1.2,
  recenterRatio: 0.34,
  minRecenterDistance: 180,
  terrainNearLoadRatio: 0.66,
  terrainFocusLoadRatio: 1.0,
  minRoadMeshesReady: {
    drive: 18,
    walk: 8,
    drone: 10,
    boat: 6,
    ocean: 6
  },
  minVisibleRoadMeshesReady: {
    drive: 16,
    walk: 4,
    drone: 4,
    boat: 4,
    ocean: 4
  }
};
const ACTOR_BUILDING_SHELL_CONFIG = {
  drive: {
    visibleRadius: 420,
    minVisibleBuildings: 28,
    minVisibleRoads: 16,
    minRoadFeatures: 14
  },
  walk: {
    visibleRadius: 260,
    minVisibleBuildings: 12,
    minVisibleRoads: 3,
    minRoadFeatures: 4
  },
  drone: {
    visibleRadius: 620,
    minVisibleBuildings: 24,
    minVisibleRoads: 3,
    minRoadFeatures: 8
  }
};
const ACTOR_ROAD_SHELL_CONFIG = {
  drive: {
    visibleRadius: 320,
    minVisibleRoads: 16,
    minRoadFeatures: 24
  },
  walk: {
    visibleRadius: 220,
    minVisibleRoads: 4,
    minRoadFeatures: 8
  },
  drone: {
    visibleRadius: 420,
    minVisibleRoads: 4,
    minRoadFeatures: 14
  }
};
const STARTUP_WORLD_BUILD_CONFIG = {
  coreRoadRadiusScale: 1.08,
  coreRoadRadiusMinDegrees: 0.0054,
  coreRoadBudgetScale: 0.96,
  coreRoadBasePerTileScale: 0.88,
  coreRoadMinPerTileScale: 1.0,
  coreQueryTimeoutMs: 6200,
  coreQueryDeadlineMs: 9200,
  localRoadRadiusScale: 1.38,
  localRoadQueryTimeoutMs: 3600,
  localRoadQueryDeadlineMs: 5000,
  localRoadBudgetScale: 1.08,
  localRoadBasePerTileScale: 0.96,
  localRoadMinPerTileScale: 1.0,
  shellRadiusScale: 0.9,
  shellRadiusMinDegrees: 0.0042,
  shellQueryTimeoutMs: 3200,
  shellQueryDeadlineMs: 4600,
  shellMaxBuildings: 220,
  shellDenseCellSize: 72,
  shellDenseCellCap: 10,
  placeholderShellEnabled: false
};

function continuousWorldStartupLocalShellEnabled() {
  return STARTUP_WORLD_BUILD_CONFIG.placeholderShellEnabled === true;
}

const BUILDING_GROUND_PATCH_CONFIG = {
  enabled: false,
  slopeThreshold: 0.28,
  untexturedSlopeThreshold: 0.42
};
const _playableCoreResidencyState = {
  ready: false,
  mode: 'drive',
  centerX: 0,
  centerZ: 0,
  radius: PLAYABLE_CORE_RESIDENCY_CONFIG.driveRadius,
  structureRadius: Math.round(PLAYABLE_CORE_RESIDENCY_CONFIG.driveRadius * PLAYABLE_CORE_RESIDENCY_CONFIG.structureRadiusScale),
  bounds: null,
  structureBounds: null,
  regionKeys: [],
  terrainReady: false,
  roadMeshCount: 0,
  urbanSurfaceCount: 0,
  structureMeshCount: 0,
  reason: 'init',
  lastUpdatedAt: 0
};
const CONTINUOUS_WORLD_INTERACTIVE_LOAD_LEVELS = {
  roads_only: 1,
  reduced: 2,
  full: 3
};
const TRAVERSAL_NODE_GRID = 2.5;
const TRAVERSAL_MAX_ANCHOR_DISTANCE = {
  drive: 260,
  walk: 180
};
const WALK_SURFACE_COST = {
  road: 1.08,
  footway: 0.92,
  cycleway: 0.96,
  railway: 1.35
};
const ENABLE_LINEAR_FEATURES = false;
const VEGETATION_ELIGIBLE_TYPES = new Set([
  'forest',
  'wood',
  'scrub',
  'park',
  'garden',
  'grass',
  'meadow',
  'orchard',
  'village_green',
  'recreation_ground',
  'cemetery',
  'allotments'
]);
const TREE_DENSITY_BY_LANDUSE = {
  forest: { spacing: 18, maxPerPolygon: 180, weight: 1.15 },
  wood: { spacing: 20, maxPerPolygon: 150, weight: 1.08 },
  scrub: { spacing: 24, maxPerPolygon: 92, weight: 0.88 },
  orchard: { spacing: 14, maxPerPolygon: 120, weight: 0.95 },
  park: { spacing: 28, maxPerPolygon: 36, weight: 0.72 },
  garden: { spacing: 22, maxPerPolygon: 28, weight: 0.78 },
  grass: { spacing: 34, maxPerPolygon: 18, weight: 0.42 },
  meadow: { spacing: 30, maxPerPolygon: 24, weight: 0.52 },
  village_green: { spacing: 24, maxPerPolygon: 18, weight: 0.56 },
  recreation_ground: { spacing: 26, maxPerPolygon: 22, weight: 0.58 },
  cemetery: { spacing: 24, maxPerPolygon: 28, weight: 0.62 },
  allotments: { spacing: 20, maxPerPolygon: 28, weight: 0.64 }
};
const TREE_ROW_SPACING = 11;
const MAX_TREE_NODES = 320;
const MAX_TREE_ROW_WAYS = 70;
const MAX_GENERATED_TREE_INSTANCES = 950;
const INTERIOR_LEVEL_HEIGHT = 3.4;
const CONTINUOUS_WORLD_VISIBLE_LOAD_MAX_ROAD_RADIUS = 0.04;
const CONTINUOUS_WORLD_VISIBLE_LOAD_MAX_FEATURE_RADIUS = 0.055;
const CONTINUOUS_WORLD_VISIBLE_LOAD_MAX_POI_RADIUS = 0.03;
const CONTINUOUS_WORLD_VISIBLE_LOAD_MAX_LINEAR_RADIUS = 0.04;
const CONTINUOUS_WORLD_VISIBLE_LOAD_MAX_BUDGET_SCALE = 1.72;
let _activeWorldLoad = null;
let _traversalNetworksDirty = true;
let _traversalRebuildTimer = null;

function vegetationWorldDensityScale() {
  const profile = appCtx.worldSurfaceProfile || null;
  if (!profile) return 1;
  const norm = profile?.signals?.normalized || {};
  let scale = 1;
  if (profile.terrainModeHint === 'snow' || profile.reason === 'polar_latitude') {
    scale *= 0.42;
  } else if (profile.reason === 'arid_surface') {
    scale *= 0.64;
  } else if ((Number(profile.absLat) || 0) <= 24 && (Number(norm.vegetated) || 0) >= 0.18) {
    scale *= 1.22;
  } else if ((Number(profile.absLat) || 0) <= 38 && (Number(norm.vegetated) || 0) >= 0.24) {
    scale *= 1.1;
  }
  if ((Number(norm.scrub) || 0) >= 0.1) scale *= 1.04;
  if ((Number(norm.water) || 0) >= 0.18 && (Number(norm.vegetated) || 0) >= 0.22) scale *= 1.06;
  return Math.max(0.38, Math.min(1.32, scale));
}

function vegetationLanduseDensityScale(landuseType = '') {
  const worldScale = vegetationWorldDensityScale();
  if (landuseType === 'forest' || landuseType === 'wood') return Math.min(1.4, worldScale * 1.08);
  if (landuseType === 'scrub') return Math.min(1.28, worldScale * 1.04);
  if (landuseType === 'park' || landuseType === 'garden' || landuseType === 'meadow') return Math.min(1.22, worldScale);
  return worldScale;
}

function sameLocation(a, b) {
  return Math.abs((a?.lat || 0) - (b?.lat || 0)) <= OVERPASS_LOC_EPSILON &&
  Math.abs((a?.lon || 0) - (b?.lon || 0)) <= OVERPASS_LOC_EPSILON;
}

function sameOverpassCacheScope(a, b) {
  if (!sameLocation(a, b)) return false;
  return String(a?.queryKind || 'legacy') === String(b?.queryKind || 'legacy');
}

function overpassQueryCapabilityTier(queryKind = 'legacy') {
  const kind = String(queryKind || 'legacy').trim();
  if (!kind || kind === 'legacy' || kind === 'full') return 4;
  if (kind === 'startup_playable_core') return 3;
  if (kind === 'startup_roads') return 1;
  if (kind.startsWith('interactive:prefetch:')) {
    const loadLevel = kind.split(':').pop();
    if (loadLevel === 'full') return 4;
    if (loadLevel === 'reduced') return 3;
    return 1;
  }
  if (kind.startsWith('interactive:')) {
    if (
      kind === 'interactive:actor_visible_road_gap_fast' ||
      kind === 'interactive:actor_visible_road_gap' ||
      kind === 'interactive:roads_only'
    ) {
      return 1;
    }
    if (
      kind === 'interactive:actor_building_gap' ||
      kind === 'interactive:building_continuity' ||
      kind === 'interactive:road_recovery_shell' ||
      kind === 'interactive:startup_local_shell' ||
      kind === 'interactive:fast_local_shell' ||
      kind === 'interactive:reduced'
    ) {
      return 3;
    }
    if (kind === 'interactive:full') return 4;
  }
  if (kind === 'reduced') return 3;
  if (kind === 'roads_only') return 1;
  return 2;
}

function overpassStoredQueryCanSatisfyRequest(storedQueryKind = 'legacy', requestQueryKind = 'legacy') {
  const stored = String(storedQueryKind || 'legacy').trim();
  const request = String(requestQueryKind || 'legacy').trim();
  if (stored === request) return true;
  if (stored === 'legacy' || stored === 'full') return true;
  return overpassQueryCapabilityTier(stored) >= overpassQueryCapabilityTier(request);
}

function overpassRadiusCanCoverRequest(storedCenter, requestCenter, storedRadius, requestRadius) {
  const stored = Math.max(0, Number(storedRadius) || 0);
  const request = Math.max(0, Number(requestRadius) || 0);
  const delta = Math.abs(Number(storedCenter) - Number(requestCenter));
  if (!(stored > 0) && !(request > 0)) return delta <= OVERPASS_LOC_EPSILON;
  if (!(stored > 0)) return false;
  return delta <= Math.max(OVERPASS_LOC_EPSILON, stored - request + OVERPASS_LOC_EPSILON);
}

function normalizeOverpassBounds(bounds = null) {
  if (!bounds || typeof bounds !== 'object') return null;
  const minLat = Number(bounds.minLat);
  const minLon = Number(bounds.minLon);
  const maxLat = Number(bounds.maxLat);
  const maxLon = Number(bounds.maxLon);
  if (
    !Number.isFinite(minLat) ||
    !Number.isFinite(minLon) ||
    !Number.isFinite(maxLat) ||
    !Number.isFinite(maxLon)
  ) {
    return null;
  }
  return {
    minLat: Number(Math.min(minLat, maxLat).toFixed(6)),
    minLon: Number(Math.min(minLon, maxLon).toFixed(6)),
    maxLat: Number(Math.max(minLat, maxLat).toFixed(6)),
    maxLon: Number(Math.max(minLon, maxLon).toFixed(6))
  };
}

function overpassBoundsCanCoverRequest(storedBounds, requestBounds) {
  const stored = normalizeOverpassBounds(storedBounds);
  const request = normalizeOverpassBounds(requestBounds);
  if (!stored || !request) return false;
  return (
    stored.minLat <= request.minLat + OVERPASS_LOC_EPSILON &&
    stored.minLon <= request.minLon + OVERPASS_LOC_EPSILON &&
    stored.maxLat >= request.maxLat - OVERPASS_LOC_EPSILON &&
    stored.maxLon >= request.maxLon - OVERPASS_LOC_EPSILON
  );
}

function overpassBoundsOverlap(storedBounds, requestBounds, extraAllowance = 0) {
  const stored = normalizeOverpassBounds(storedBounds);
  const request = normalizeOverpassBounds(requestBounds);
  if (!stored || !request) return false;
  const allowance = Math.max(0, Number(extraAllowance) || 0);
  return !(
    stored.maxLat < request.minLat - allowance ||
    stored.minLat > request.maxLat + allowance ||
    stored.maxLon < request.minLon - allowance ||
    stored.minLon > request.maxLon + allowance
  );
}

function overpassBoundsScore(storedBounds, requestBounds) {
  const stored = normalizeOverpassBounds(storedBounds);
  const request = normalizeOverpassBounds(requestBounds);
  if (!stored || !request) return Infinity;
  const latMiss =
    Math.max(0, request.minLat - stored.minLat) +
    Math.max(0, stored.maxLat - request.maxLat);
  const lonMiss =
    Math.max(0, request.minLon - stored.minLon) +
    Math.max(0, stored.maxLon - request.maxLon);
  return latMiss + lonMiss;
}

function overpassCacheEntryCanSatisfyRequest(storedMeta, requestMeta) {
  if (!storedMeta || !requestMeta) return false;
  if (!overpassStoredQueryCanSatisfyRequest(storedMeta.queryKind, requestMeta.queryKind)) return false;
  const storedRoadsBounds = normalizeOverpassBounds(storedMeta.roadsBounds);
  const requestRoadsBounds = normalizeOverpassBounds(requestMeta.roadsBounds);
  const storedFeatureBounds = normalizeOverpassBounds(storedMeta.featureBounds);
  const requestFeatureBounds = normalizeOverpassBounds(requestMeta.featureBounds);
  const storedPoiBounds = normalizeOverpassBounds(storedMeta.poiBounds);
  const requestPoiBounds = normalizeOverpassBounds(requestMeta.poiBounds);
  return (
    (
      (storedRoadsBounds && requestRoadsBounds && overpassBoundsCanCoverRequest(storedRoadsBounds, requestRoadsBounds)) ||
      (
        overpassRadiusCanCoverRequest(storedMeta.lat, requestMeta.lat, storedMeta.roadsRadius, requestMeta.roadsRadius) &&
        overpassRadiusCanCoverRequest(storedMeta.lon, requestMeta.lon, storedMeta.roadsRadius, requestMeta.roadsRadius)
      )
    ) &&
    (
      (storedFeatureBounds && requestFeatureBounds && overpassBoundsCanCoverRequest(storedFeatureBounds, requestFeatureBounds)) ||
      (
        overpassRadiusCanCoverRequest(storedMeta.lat, requestMeta.lat, storedMeta.featureRadius, requestMeta.featureRadius) &&
        overpassRadiusCanCoverRequest(storedMeta.lon, requestMeta.lon, storedMeta.featureRadius, requestMeta.featureRadius)
      )
    ) &&
    (
      (storedPoiBounds && requestPoiBounds && overpassBoundsCanCoverRequest(storedPoiBounds, requestPoiBounds)) ||
      (
        overpassRadiusCanCoverRequest(storedMeta.lat, requestMeta.lat, storedMeta.poiRadius, requestMeta.poiRadius) &&
        overpassRadiusCanCoverRequest(storedMeta.lon, requestMeta.lon, storedMeta.poiRadius, requestMeta.poiRadius)
      )
    )
  );
}

function overpassNearbyCacheEntryScore(storedMeta, requestMeta) {
  if (!storedMeta || !requestMeta) return Infinity;
  const boundsScore = Math.min(
    overpassBoundsScore(storedMeta.roadsBounds, requestMeta.roadsBounds),
    overpassBoundsScore(storedMeta.featureBounds, requestMeta.featureBounds),
    overpassBoundsScore(storedMeta.poiBounds, requestMeta.poiBounds)
  );
  if (Number.isFinite(boundsScore)) return boundsScore;
  const latDelta = Math.abs(Number(storedMeta.lat) - Number(requestMeta.lat));
  const lonDelta = Math.abs(Number(storedMeta.lon) - Number(requestMeta.lon));
  return latDelta + lonDelta;
}

function overpassNearbyCacheEntryCanHelp(storedMeta, requestMeta, options = {}) {
  if (!storedMeta || !requestMeta) return false;
  if (!overpassStoredQueryCanSatisfyRequest(storedMeta.queryKind, requestMeta.queryKind)) return false;
  const extraAllowance = Math.max(0.0025, Number(options.extraAllowance || 0));
  if (
    overpassBoundsOverlap(storedMeta.roadsBounds, requestMeta.roadsBounds, extraAllowance) ||
    overpassBoundsOverlap(storedMeta.featureBounds, requestMeta.featureBounds, extraAllowance) ||
    overpassBoundsOverlap(storedMeta.poiBounds, requestMeta.poiBounds, extraAllowance)
  ) {
    return true;
  }
  const roadsRadius = Math.max(0, Number(storedMeta.roadsRadius) || 0);
  const featureRadius = Math.max(0, Number(storedMeta.featureRadius) || 0);
  const requestRoadsRadius = Math.max(0, Number(requestMeta.roadsRadius) || 0);
  const requestFeatureRadius = Math.max(0, Number(requestMeta.featureRadius) || 0);
  const supportRadius = Math.max(
    roadsRadius,
    featureRadius,
    requestRoadsRadius,
    requestFeatureRadius
  );
  if (!(supportRadius > 0)) return false;
  const maxDelta = supportRadius + extraAllowance;
  const latDelta = Math.abs(Number(storedMeta.lat) - Number(requestMeta.lat));
  const lonDelta = Math.abs(Number(storedMeta.lon) - Number(requestMeta.lon));
  return latDelta <= maxDelta && lonDelta <= maxDelta;
}

function overpassBoundsFromCenterRadius(lat, lon, radius) {
  const centerLat = Number(lat);
  const centerLon = Number(lon);
  const degRadius = Math.max(0, Number(radius) || 0);
  if (!Number.isFinite(centerLat) || !Number.isFinite(centerLon) || !(degRadius > 0)) return null;
  return normalizeOverpassBounds({
    minLat: centerLat - degRadius,
    minLon: centerLon - degRadius,
    maxLat: centerLat + degRadius,
    maxLon: centerLon + degRadius
  });
}

function worldUnitsToLatDegrees(worldUnits = 0) {
  const scale = Math.max(1, Number(appCtx.SCALE) || 1);
  const units = Math.max(0, Number(worldUnits) || 0);
  return units / scale;
}

function playableCoreRadiusForMode(mode = 'drive') {
  switch (String(mode || 'drive')) {
  case 'walk':
    return PLAYABLE_CORE_RESIDENCY_CONFIG.walkRadius;
  case 'drone':
    return PLAYABLE_CORE_RESIDENCY_CONFIG.droneRadius;
  case 'boat':
    return PLAYABLE_CORE_RESIDENCY_CONFIG.boatRadius;
  case 'ocean':
    return PLAYABLE_CORE_RESIDENCY_CONFIG.oceanRadius;
  default:
    return PLAYABLE_CORE_RESIDENCY_CONFIG.driveRadius;
  }
}

function playableCoreBoundsFromCenter(centerX, centerZ, radius) {
  const r = Math.max(80, Number(radius) || PLAYABLE_CORE_RESIDENCY_CONFIG.driveRadius);
  return {
    minX: centerX - r,
    maxX: centerX + r,
    minZ: centerZ - r,
    maxZ: centerZ + r
  };
}

function boundsContainPoint(bounds, x, z, padding = 0) {
  if (!bounds || !Number.isFinite(x) || !Number.isFinite(z)) return false;
  return (
    x >= Number(bounds.minX) - padding &&
    x <= Number(bounds.maxX) + padding &&
    z >= Number(bounds.minZ) - padding &&
    z <= Number(bounds.maxZ) + padding
  );
}

function boundsIntersect(a, b, padding = 0) {
  if (!a || !b) return false;
  return !(
    Number(a.maxX) < Number(b.minX) - padding ||
    Number(a.minX) > Number(b.maxX) + padding ||
    Number(a.maxZ) < Number(b.minZ) - padding ||
    Number(a.minZ) > Number(b.maxZ) + padding
  );
}

function playableCoreTargetBounds(target) {
  const slot = target?.userData && typeof target.userData === 'object' ? target.userData : target;
  const localBounds = slot?.localBounds;
  if (
    Number.isFinite(localBounds?.minX) &&
    Number.isFinite(localBounds?.maxX) &&
    Number.isFinite(localBounds?.minZ) &&
    Number.isFinite(localBounds?.maxZ)
  ) {
    return localBounds;
  }
  const center = slot?.lodCenter || slot?.poiPosition || null;
  const radius = Math.max(0, Number(slot?.lodRadius) || 0);
  if (center && Number.isFinite(center.x) && Number.isFinite(center.z)) {
    return playableCoreBoundsFromCenter(center.x, center.z, Math.max(16, radius));
  }
  const position = target?.position;
  if (Number.isFinite(position?.x) && Number.isFinite(position?.z)) {
    return playableCoreBoundsFromCenter(position.x, position.z, Math.max(16, radius));
  }
  return null;
}

function clearRoadMeshSpatialIndex() {
  roadMeshSpatialIndex = new Map();
  roadMeshSpatialIndexDirty = true;
  roadMeshSpatialIndexMembers = new Set();
  roadMeshLodVisibleSet = new Set();
  lastRoadMeshLodCandidateCount = 0;
}

function markRoadMeshSpatialIndexDirty() {
  roadMeshSpatialIndexDirty = true;
}

function roadMeshIndexCellKey(cellX, cellZ) {
  return `${cellX},${cellZ}`;
}

function addRoadMeshToSpatialIndex(mesh) {
  const bounds = playableCoreTargetBounds(mesh);
  if (!bounds) return;
  const minCellX = Math.floor(bounds.minX / ROAD_MESH_INDEX_CELL_SIZE);
  const maxCellX = Math.floor(bounds.maxX / ROAD_MESH_INDEX_CELL_SIZE);
  const minCellZ = Math.floor(bounds.minZ / ROAD_MESH_INDEX_CELL_SIZE);
  const maxCellZ = Math.floor(bounds.maxZ / ROAD_MESH_INDEX_CELL_SIZE);
  for (let cx = minCellX; cx <= maxCellX; cx++) {
    for (let cz = minCellZ; cz <= maxCellZ; cz++) {
      const key = roadMeshIndexCellKey(cx, cz);
      let bucket = roadMeshSpatialIndex.get(key);
      if (!bucket) {
        bucket = [];
        roadMeshSpatialIndex.set(key, bucket);
      }
      bucket.push(mesh);
    }
  }
}

function rebuildRoadMeshSpatialIndexFromLoadedRoadMeshes() {
  roadMeshSpatialIndex = new Map();
  roadMeshSpatialIndexMembers = new Set();
  const roadMeshes = Array.isArray(appCtx.roadMeshes) ? appCtx.roadMeshes : [];
  for (let i = 0; i < roadMeshes.length; i++) {
    const mesh = roadMeshes[i];
    if (!mesh) continue;
    roadMeshSpatialIndexMembers.add(mesh);
    addRoadMeshToSpatialIndex(mesh);
  }
  roadMeshSpatialIndexDirty = false;
  return roadMeshSpatialIndex;
}

function ensureRoadMeshSpatialIndex() {
  if (!roadMeshSpatialIndexDirty) return roadMeshSpatialIndex;
  return rebuildRoadMeshSpatialIndexFromLoadedRoadMeshes();
}

function mergeWorldBounds(base, next) {
  if (!base) return next ? { ...next } : null;
  if (!next) return { ...base };
  return {
    minX: Math.min(Number(base.minX), Number(next.minX)),
    maxX: Math.max(Number(base.maxX), Number(next.maxX)),
    minZ: Math.min(Number(base.minZ), Number(next.minZ)),
    maxZ: Math.max(Number(base.maxZ), Number(next.maxZ))
  };
}

function expandWorldBounds(bounds, padding = 0) {
  if (!bounds) return null;
  const pad = Math.max(0, Number(padding) || 0);
  return {
    minX: Number(bounds.minX) - pad,
    maxX: Number(bounds.maxX) + pad,
    minZ: Number(bounds.minZ) - pad,
    maxZ: Number(bounds.maxZ) + pad
  };
}

function worldBoundsFromContinuousWorldRegionKey(regionKey, runtimeSnapshot = null) {
  const parts = String(regionKey || '').split(':');
  if (parts.length !== 2) return null;
  const latIndex = Number(parts[0]);
  const lonIndex = Number(parts[1]);
  const sizeDegrees = Math.max(0.0001, Number(runtimeSnapshot?.regionConfig?.degrees) || 0.02);
  if (!Number.isFinite(latIndex) || !Number.isFinite(lonIndex) || typeof appCtx.geoToWorld !== 'function') return null;
  const lat0 = latIndex * sizeDegrees;
  const lon0 = lonIndex * sizeDegrees;
  const lat1 = lat0 + sizeDegrees;
  const lon1 = lon0 + sizeDegrees;
  const corners = [
    appCtx.geoToWorld(lat0, lon0),
    appCtx.geoToWorld(lat0, lon1),
    appCtx.geoToWorld(lat1, lon0),
    appCtx.geoToWorld(lat1, lon1)
  ].filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.z));
  if (corners.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < corners.length; i++) {
    const point = corners[i];
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  return { minX, maxX, minZ, maxZ };
}

function roadMeshQueryBoundsFromRetainKeys(retainKeys, runtimeSnapshot = null, playableCoreState = null) {
  let bounds = playableCoreState?.bounds ? expandWorldBounds(playableCoreState.bounds, 64) : null;
  if (retainKeys instanceof Set && retainKeys.size > 0) {
    retainKeys.forEach((key) => {
      bounds = mergeWorldBounds(bounds, worldBoundsFromContinuousWorldRegionKey(key, runtimeSnapshot));
    });
  }
  return bounds ? expandWorldBounds(bounds, 96) : null;
}

function getRoadMeshesIntersectingBounds(bounds, padding = 0) {
  const roadMeshes = Array.isArray(appCtx.roadMeshes) ? appCtx.roadMeshes : [];
  if (roadMeshes.length === 0) return [];
  if (!bounds) return roadMeshes.slice();
  ensureRoadMeshSpatialIndex();
  const queryBounds = expandWorldBounds(bounds, padding);
  const minCellX = Math.floor(queryBounds.minX / ROAD_MESH_INDEX_CELL_SIZE);
  const maxCellX = Math.floor(queryBounds.maxX / ROAD_MESH_INDEX_CELL_SIZE);
  const minCellZ = Math.floor(queryBounds.minZ / ROAD_MESH_INDEX_CELL_SIZE);
  const maxCellZ = Math.floor(queryBounds.maxZ / ROAD_MESH_INDEX_CELL_SIZE);
  const out = [];
  const seen = new Set();
  for (let cx = minCellX; cx <= maxCellX; cx++) {
    for (let cz = minCellZ; cz <= maxCellZ; cz++) {
      const bucket = roadMeshSpatialIndex.get(roadMeshIndexCellKey(cx, cz));
      if (!bucket) continue;
      for (let i = 0; i < bucket.length; i++) {
        const mesh = bucket[i];
        if (!mesh || seen.has(mesh)) continue;
        const meshBounds = playableCoreTargetBounds(mesh);
        if (!meshBounds || !boundsIntersect(meshBounds, queryBounds, 0)) continue;
        seen.add(mesh);
        out.push(mesh);
      }
    }
  }
  return out;
}

function countRoadMeshesIntersectingPlayableCore(coreState = _playableCoreResidencyState) {
  if (!coreState?.bounds) return 0;
  const candidates = getRoadMeshesIntersectingBounds(coreState.bounds, 32);
  let count = 0;
  for (let i = 0; i < candidates.length; i++) {
    if (playableCoreIntersectsTarget(candidates[i], coreState, { structure: false })) count += 1;
  }
  return count;
}

function getRoadMeshSpatialIndexSnapshot() {
  return {
    dirty: roadMeshSpatialIndexDirty,
    cellCount: roadMeshSpatialIndex.size,
    meshCount: roadMeshSpatialIndexMembers.size,
    visibleCount: roadMeshLodVisibleSet.size,
    lastCandidateCount: lastRoadMeshLodCandidateCount
  };
}

function playableCoreIntersectsTarget(target, coreState = _playableCoreResidencyState, options = {}) {
  if (!coreState?.bounds) return false;
  const useStructureBounds = options.structure === true && coreState.structureBounds;
  const bounds = useStructureBounds ? coreState.structureBounds : coreState.bounds;
  const padding = Number.isFinite(options.padding) ? Math.max(0, options.padding) : 0;
  const targetBounds = playableCoreTargetBounds(target);
  if (targetBounds) return boundsIntersect(targetBounds, bounds, padding);
  return false;
}

function playableCoreRegionKeysForBounds(bounds, runtimeSnapshot = null, mode = 'drive') {
  const keys = new Set();
  const snapshot = runtimeSnapshot || appCtx.getContinuousWorldRuntimeSnapshot?.();
  if (snapshot?.activeRegion?.key) keys.add(String(snapshot.activeRegion.key));
  const addBand = (cells) => {
    (Array.isArray(cells) ? cells : []).forEach((cell) => {
      const key = String(cell?.key || '').trim();
      if (key) keys.add(key);
    });
  };
  addBand(snapshot?.activeRegionRings?.near);
  addBand(snapshot?.activeRegionRings?.mid);
  if (String(mode || 'drive') === 'drone') addBand(snapshot?.activeRegionRings?.far);
  if (bounds) {
    const samplePoints = [
      { x: bounds.minX, z: bounds.minZ },
      { x: bounds.maxX, z: bounds.minZ },
      { x: bounds.maxX, z: bounds.maxZ },
      { x: bounds.minX, z: bounds.maxZ },
      { x: (bounds.minX + bounds.maxX) * 0.5, z: (bounds.minZ + bounds.maxZ) * 0.5 },
      { x: bounds.minX, z: (bounds.minZ + bounds.maxZ) * 0.5 },
      { x: bounds.maxX, z: (bounds.minZ + bounds.maxZ) * 0.5 },
      { x: (bounds.minX + bounds.maxX) * 0.5, z: bounds.minZ },
      { x: (bounds.minX + bounds.maxX) * 0.5, z: bounds.maxZ }
    ];
    const pointKeys = buildContinuousWorldRegionKeysFromPoints(samplePoints, snapshot, bounds);
    for (let i = 0; i < pointKeys.length; i++) keys.add(pointKeys[i]);
  }
  return Array.from(keys).sort();
}

function continuousWorldForwardRoadCorridorState(actorState = null, runtimeSnapshot = null) {
  const actor = actorState || continuousWorldInteractiveActorMotionState();
  const mode = String(actor?.mode || 'drive');
  if (mode !== 'drive' && mode !== 'drone') return null;
  const actorX = Number(actor?.x);
  const actorZ = Number(actor?.z);
  if (!Number.isFinite(actorX) || !Number.isFinite(actorZ)) return null;
  const speed = Math.abs(Number(actor?.speed || 0));
  const yaw = Number.isFinite(actor?.yaw) ? actor.yaw : 0;
  const headingX = Math.sin(yaw);
  const headingZ = Math.cos(yaw);
  if (!Number.isFinite(headingX) || !Number.isFinite(headingZ)) return null;
  const baseRadius = playableCoreRadiusForMode(mode);
  const length =
    mode === 'drone' ?
      clampNumber(
        Math.max(baseRadius * 0.42, speed >= 12 ? 1800 : speed >= 6 ? 1400 : 960),
        720,
        2200,
        1200
      ) :
      clampNumber(
        Math.max(baseRadius * 0.52, speed >= 12 ? 1600 : speed >= 8 ? 1280 : speed >= 4 ? 980 : 760),
        640,
        1800,
        960
      );
  const halfWidth =
    mode === 'drone' ?
      320 :
    speed >= 8 ?
      260 :
      220;
  const endX = actorX + headingX * length;
  const endZ = actorZ + headingZ * length;
  const perpX = -headingZ;
  const perpZ = headingX;
  const points = [
    { x: actorX + perpX * halfWidth, z: actorZ + perpZ * halfWidth },
    { x: actorX - perpX * halfWidth, z: actorZ - perpZ * halfWidth },
    { x: endX + perpX * halfWidth, z: endZ + perpZ * halfWidth },
    { x: endX - perpX * halfWidth, z: endZ - perpZ * halfWidth },
    { x: endX, z: endZ }
  ];
  const bounds = {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minZ: Math.min(...points.map((point) => point.z)),
    maxZ: Math.max(...points.map((point) => point.z))
  };
  return {
    mode,
    length,
    halfWidth,
    bounds,
    regionKeys: playableCoreRegionKeysForBounds(bounds, runtimeSnapshot, mode)
  };
}

function continuousWorldForwardRoadCorridorCoverageState(actorState = null, runtimeSnapshot = null) {
  const corridor = continuousWorldForwardRoadCorridorState(actorState, runtimeSnapshot);
  const keys = Array.isArray(corridor?.regionKeys) ? corridor.regionKeys.filter(Boolean) : [];
  if (keys.length <= 0) {
    return {
      corridor,
      totalKeys: 0,
      coveredKeys: 0,
      strongCoveredKeys: 0,
      minCoveredKeys: 0,
      missingKeys: []
    };
  }
  const uniqueKeys = Array.from(new Set(keys));
  let coveredKeys = 0;
  let strongCoveredKeys = 0;
  const missingKeys = [];
  for (let i = 0; i < uniqueKeys.length; i++) {
    const key = uniqueKeys[i];
    const rank = continuousWorldInteractiveCoverageLevelForRegion(key, {
      includeSeeded: false
    });
    if (rank >= CONTINUOUS_WORLD_INTERACTIVE_LOAD_LEVELS.roads_only) coveredKeys += 1;
    if (rank >= CONTINUOUS_WORLD_INTERACTIVE_LOAD_LEVELS.reduced) strongCoveredKeys += 1;
    if (rank < CONTINUOUS_WORLD_INTERACTIVE_LOAD_LEVELS.roads_only) missingKeys.push(key);
  }
  const minCoveredKeys =
    corridor?.mode === 'drone' ?
      Math.min(uniqueKeys.length, Math.max(2, Math.ceil(uniqueKeys.length * 0.42))) :
      Math.min(uniqueKeys.length, Math.max(2, Math.ceil(uniqueKeys.length * 0.55)));
  return {
    corridor,
    totalKeys: uniqueKeys.length,
    coveredKeys,
    strongCoveredKeys,
    minCoveredKeys,
    missingKeys
  };
}

function continuousWorldGeoBoundsForRegionKeys(regionKeys, runtimeSnapshot = null) {
  const snapshot = runtimeSnapshot || appCtx.getContinuousWorldRuntimeSnapshot?.();
  const sizeDegrees = continuousWorldInteractiveRegionDegrees(snapshot);
  const keys = Array.isArray(regionKeys) ? regionKeys.map((key) => String(key || '').trim()).filter(Boolean) : [];
  if (keys.length <= 0) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (let i = 0; i < keys.length; i++) {
    const parts = keys[i].split(':');
    if (parts.length !== 2) continue;
    const latIndex = Number(parts[0]);
    const lonIndex = Number(parts[1]);
    if (!Number.isFinite(latIndex) || !Number.isFinite(lonIndex)) continue;
    const lat0 = latIndex * sizeDegrees;
    const lon0 = lonIndex * sizeDegrees;
    const lat1 = lat0 + sizeDegrees;
    const lon1 = lon0 + sizeDegrees;
    minLat = Math.min(minLat, lat0);
    maxLat = Math.max(maxLat, lat1);
    minLon = Math.min(minLon, lon0);
    maxLon = Math.max(maxLon, lon1);
  }
  if (!Number.isFinite(minLat) || !Number.isFinite(maxLat) || !Number.isFinite(minLon) || !Number.isFinite(maxLon)) {
    return null;
  }
  return { minLat, maxLat, minLon, maxLon };
}

function expandContinuousWorldGeoBounds(bounds, paddingDegrees = 0) {
  if (!bounds) return null;
  const pad = Math.max(0, Number(paddingDegrees) || 0);
  return {
    minLat: Number(bounds.minLat) - pad,
    maxLat: Number(bounds.maxLat) + pad,
    minLon: Number(bounds.minLon) - pad,
    maxLon: Number(bounds.maxLon) + pad
  };
}

function continuousWorldForwardRoadCorridorQueryPlan(actorState = null, runtimeSnapshot = null, reason = 'forward_road_corridor') {
  const snapshot = runtimeSnapshot || appCtx.getContinuousWorldRuntimeSnapshot?.();
  const actor = actorState || continuousWorldInteractiveActorMotionState();
  const coverage = continuousWorldForwardRoadCorridorCoverageState(actor, snapshot);
  const corridor = coverage?.corridor;
  const allRegionKeys = Array.isArray(corridor?.regionKeys) ? corridor.regionKeys.map((key) => String(key || '').trim()).filter(Boolean) : [];
  if (allRegionKeys.length <= 0) return null;
  const targetRegionKey = continuousWorldInteractiveReasonTargetRegionKey(reason);

  const actorX = Number(actor?.x);
  const actorZ = Number(actor?.z);
  const yaw = Number.isFinite(actor?.yaw) ? actor.yaw : 0;
  const headingX = Math.sin(yaw);
  const headingZ = Math.cos(yaw);
  const speed = Math.abs(Number(actor?.speed || 0));
  const preferredKeys = Array.isArray(coverage?.missingKeys) && coverage.missingKeys.length > 0 ? coverage.missingKeys : allRegionKeys;
  const candidates = preferredKeys
    .map((key) => {
      const center = continuousWorldInteractiveRegionCellCenter({
        key,
        latIndex: Number(String(key).split(':')[0]),
        lonIndex: Number(String(key).split(':')[1])
      }, snapshot);
      if (!center) return null;
      const centerWorld = geoPointToWorld(center.lat, center.lon);
      const dx = Number(centerWorld?.x) - actorX;
      const dz = Number(centerWorld?.z) - actorZ;
      const distance = Math.hypot(dx, dz);
      const projection = dx * headingX + dz * headingZ;
      const lateral = Math.abs(dx * (-headingZ) + dz * headingX);
      return {
        key,
        center,
        centerWorld,
        distance,
        projection,
        lateral
      };
    })
    .filter(Boolean);
  if (candidates.length <= 0) return null;

  const aheadCandidates = candidates.filter((candidate) => candidate.projection >= -120);
  const working = aheadCandidates.length > 0 ? aheadCandidates : candidates;
  const anchorCandidate =
    (targetRegionKey ? working.find((candidate) => candidate.key === targetRegionKey) : null) ||
    (targetRegionKey ? candidates.find((candidate) => candidate.key === targetRegionKey) : null) ||
    null;
  working.sort((a, b) => {
    if (anchorCandidate) {
      const aAnchorDistance = Math.hypot(
        Number(a.centerWorld?.x || 0) - Number(anchorCandidate.centerWorld?.x || 0),
        Number(a.centerWorld?.z || 0) - Number(anchorCandidate.centerWorld?.z || 0)
      );
      const bAnchorDistance = Math.hypot(
        Number(b.centerWorld?.x || 0) - Number(anchorCandidate.centerWorld?.x || 0),
        Number(b.centerWorld?.z || 0) - Number(anchorCandidate.centerWorld?.z || 0)
      );
      const aBehindAnchor = a.projection < anchorCandidate.projection - 160;
      const bBehindAnchor = b.projection < anchorCandidate.projection - 160;
      if (aBehindAnchor !== bBehindAnchor) return aBehindAnchor ? 1 : -1;
      if (Math.abs(aAnchorDistance - bAnchorDistance) > 60) return aAnchorDistance - bAnchorDistance;
      if (Math.abs(a.projection - b.projection) > 60) return a.projection - b.projection;
      return a.lateral - b.lateral;
    }
    const aBehind = a.projection < 0;
    const bBehind = b.projection < 0;
    if (aBehind !== bBehind) return aBehind ? 1 : -1;
    if (Math.abs(a.projection - b.projection) > 60) return a.projection - b.projection;
    if (Math.abs(a.lateral - b.lateral) > 40) return a.lateral - b.lateral;
    return a.distance - b.distance;
  });

  const maxKeys =
    corridor?.mode === 'drone' ? 4 :
    speed >= 10 ? 4 :
    3;
  const selected = working.slice(0, Math.max(2, Math.min(maxKeys, working.length)));
  const selectedKeys = Array.from(new Set([
    ...(anchorCandidate ? [anchorCandidate.key] : []),
    ...selected.map((candidate) => candidate.key)
  ]));
  const sizeDegrees = continuousWorldInteractiveRegionDegrees(snapshot);
  const baseBounds = continuousWorldGeoBoundsForRegionKeys(selectedKeys, snapshot);
  const paddedBounds = expandContinuousWorldGeoBounds(baseBounds, sizeDegrees * 0.08);
  if (!paddedBounds) return null;
  const centerLat = (paddedBounds.minLat + paddedBounds.maxLat) * 0.5;
  const centerLon = (paddedBounds.minLon + paddedBounds.maxLon) * 0.5;
  const roadRadius = Math.max(
    sizeDegrees * 0.6,
    (paddedBounds.maxLat - paddedBounds.minLat) * 0.5,
    (paddedBounds.maxLon - paddedBounds.minLon) * 0.5
  );
  return {
    regionKeys: selectedKeys,
    primaryRegionKey: anchorCandidate?.key || selectedKeys[0] || null,
    centerLat,
    centerLon,
    bounds: paddedBounds,
    roadRadius
  };
}

function continuousWorldInteractiveCoverageRegionKeysForGeoQuery(centerLat, centerLon, radiusDegrees, runtimeSnapshot = null) {
  const radius = Math.max(0, Number(radiusDegrees) || 0);
  if (!Number.isFinite(centerLat) || !Number.isFinite(centerLon) || !(radius > 0) || typeof appCtx.geoToWorld !== 'function') {
    return [];
  }
  const points = [
    appCtx.geoToWorld(centerLat - radius, centerLon - radius),
    appCtx.geoToWorld(centerLat - radius, centerLon + radius),
    appCtx.geoToWorld(centerLat + radius, centerLon + radius),
    appCtx.geoToWorld(centerLat + radius, centerLon - radius),
    appCtx.geoToWorld(centerLat, centerLon)
  ];
  return buildContinuousWorldRegionKeysFromPoints(points, runtimeSnapshot, null)
    .map((key) => String(key || '').trim())
    .filter(Boolean);
}

function startupPlayableCoreRoadRadiusDegrees(roadsQueryRadius = 0, mode = 'drive') {
  const queryRadius = Math.max(0, Number(roadsQueryRadius) || 0);
  if (!(queryRadius > 0)) return STARTUP_WORLD_BUILD_CONFIG.coreRoadRadiusMinDegrees;
  const playableCoreDegrees = worldUnitsToLatDegrees(playableCoreRadiusForMode(mode));
  return clampNumber(
    Math.max(
      STARTUP_WORLD_BUILD_CONFIG.coreRoadRadiusMinDegrees,
      playableCoreDegrees * STARTUP_WORLD_BUILD_CONFIG.coreRoadRadiusScale
    ),
    STARTUP_WORLD_BUILD_CONFIG.coreRoadRadiusMinDegrees,
    queryRadius,
    Math.min(queryRadius, playableCoreDegrees)
  );
}

function pruneOverpassMemoryCache(nowMs = Date.now()) {
  for (let i = _overpassMemoryCache.length - 1; i >= 0; i--) {
    if (nowMs - _overpassMemoryCache[i].savedAt > OVERPASS_MEMORY_CACHE_TTL_MS) {
      _overpassMemoryCache.splice(i, 1);
    }
  }
}

function overpassPersistentCacheAvailable() {
  return typeof indexedDB !== 'undefined';
}

function normalizeOverpassCacheMeta(meta) {
  if (!meta) return null;
  const lat = Number(meta.lat);
  const lon = Number(meta.lon);
  const roadsRadius = Number(meta.roadsRadius);
  const featureRadius = Number(meta.featureRadius);
  const poiRadius = Number(meta.poiRadius);
  const queryKind = String(
    meta.queryKind ||
    (meta.startupRoadPreload ? 'startup_roads' :
    meta.continuousWorldInteractive ? `interactive:${String(meta.loadLevel || 'full')}` :
    'full')
  ).trim();
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    !Number.isFinite(roadsRadius) ||
    !Number.isFinite(featureRadius) ||
    !Number.isFinite(poiRadius) ||
    !queryKind
  ) {
    return null;
  }
  return {
    lat: Number(lat.toFixed(6)),
    lon: Number(lon.toFixed(6)),
    roadsRadius: Number(roadsRadius.toFixed(5)),
    featureRadius: Number(featureRadius.toFixed(5)),
    poiRadius: Number(poiRadius.toFixed(5)),
    queryKind,
    roadsBounds: normalizeOverpassBounds(meta.roadsBounds),
    featureBounds: normalizeOverpassBounds(meta.featureBounds),
    poiBounds: normalizeOverpassBounds(meta.poiBounds)
  };
}

function overpassPersistentCacheKey(meta) {
  const normalized = normalizeOverpassCacheMeta(meta);
  if (!normalized) return null;
  return [
    normalized.lat.toFixed(6),
    normalized.lon.toFixed(6),
    normalized.roadsRadius.toFixed(5),
    normalized.featureRadius.toFixed(5),
    normalized.poiRadius.toFixed(5),
    normalized.queryKind,
    normalized.roadsBounds ? `${normalized.roadsBounds.minLat}:${normalized.roadsBounds.minLon}:${normalized.roadsBounds.maxLat}:${normalized.roadsBounds.maxLon}` : 'no-roads-bounds',
    normalized.featureBounds ? `${normalized.featureBounds.minLat}:${normalized.featureBounds.minLon}:${normalized.featureBounds.maxLat}:${normalized.featureBounds.maxLon}` : 'no-feature-bounds',
    normalized.poiBounds ? `${normalized.poiBounds.minLat}:${normalized.poiBounds.minLon}:${normalized.poiBounds.maxLat}:${normalized.poiBounds.maxLon}` : 'no-poi-bounds'
  ].join(':');
}

function overpassRequestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

function openOverpassPersistentCacheDb() {
  if (!overpassPersistentCacheAvailable()) return Promise.resolve(null);
  if (_overpassPersistentCacheDbPromise) return _overpassPersistentCacheDbPromise;
  _overpassPersistentCacheDbPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(OVERPASS_PERSISTENT_CACHE_DB, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(OVERPASS_PERSISTENT_CACHE_STORE)) {
          const store = db.createObjectStore(OVERPASS_PERSISTENT_CACHE_STORE, { keyPath: 'key' });
          store.createIndex('savedAt', 'savedAt', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.warn('[WorldLoad] Overpass persistent cache unavailable:', request.error || 'unknown IndexedDB error');
        resolve(null);
      };
    } catch (error) {
      console.warn('[WorldLoad] Overpass persistent cache init failed:', error);
      resolve(null);
    }
  });
  return _overpassPersistentCacheDbPromise;
}

async function pruneOverpassPersistentCache(db, nowMs = Date.now()) {
  if (!db) return;
  try {
    const tx = db.transaction(OVERPASS_PERSISTENT_CACHE_STORE, 'readwrite');
    const store = tx.objectStore(OVERPASS_PERSISTENT_CACHE_STORE);
    const entries = await overpassRequestToPromise(store.getAll());
    const staleBefore = nowMs - OVERPASS_PERSISTENT_CACHE_STALE_TTL_MS;
    const survivors = [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry || !Number.isFinite(entry.savedAt) || entry.savedAt < staleBefore) {
        if (entry?.key) store.delete(entry.key);
        continue;
      }
      survivors.push(entry);
    }
    survivors.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    for (let i = OVERPASS_PERSISTENT_CACHE_MAX; i < survivors.length; i++) {
      if (survivors[i]?.key) store.delete(survivors[i].key);
    }
    await new Promise((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (error) {
    console.warn('[WorldLoad] Overpass persistent cache prune failed:', error);
  }
}

async function findOverpassPersistentCache(meta, { allowStale = false } = {}) {
  const normalized = normalizeOverpassCacheMeta(meta);
  if (!normalized) return null;
  const db = await openOverpassPersistentCacheDb();
  if (!db) return null;
  const nowMs = Date.now();
  try {
    const tx = db.transaction(OVERPASS_PERSISTENT_CACHE_STORE, 'readonly');
    const store = tx.objectStore(OVERPASS_PERSISTENT_CACHE_STORE);
    const entries = await overpassRequestToPromise(store.getAll());
    const maxAge = allowStale ? OVERPASS_PERSISTENT_CACHE_STALE_TTL_MS : OVERPASS_PERSISTENT_CACHE_TTL_MS;
    let best = null;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry?.meta || !entry?.data?.elements) continue;
      if (!overpassCacheEntryCanSatisfyRequest(entry.meta, normalized)) continue;
      const ageMs = nowMs - Number(entry.savedAt || 0);
      if (!(ageMs >= 0 && ageMs <= maxAge)) continue;
      if (!best || Number(entry.savedAt || 0) > Number(best.savedAt || 0)) {
        best = entry;
      }
    }
    if (!best) return null;
    return {
      ...best,
      ageMs: Math.max(0, nowMs - Number(best.savedAt || nowMs)),
      stale: nowMs - Number(best.savedAt || 0) > OVERPASS_PERSISTENT_CACHE_TTL_MS
    };
  } catch (error) {
    console.warn('[WorldLoad] Overpass persistent cache read failed:', error);
    return null;
  }
}

async function findNearbyOverpassPersistentCache(meta, { allowStale = false, extraAllowance = 0.0035 } = {}) {
  const normalized = normalizeOverpassCacheMeta(meta);
  if (!normalized) return null;
  const db = await openOverpassPersistentCacheDb();
  if (!db) return null;
  const nowMs = Date.now();
  try {
    const tx = db.transaction(OVERPASS_PERSISTENT_CACHE_STORE, 'readonly');
    const store = tx.objectStore(OVERPASS_PERSISTENT_CACHE_STORE);
    const entries = await overpassRequestToPromise(store.getAll());
    const maxAge = allowStale ? OVERPASS_PERSISTENT_CACHE_STALE_TTL_MS : OVERPASS_PERSISTENT_CACHE_TTL_MS;
    let best = null;
    let bestScore = Infinity;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry?.meta || !entry?.data?.elements) continue;
      const ageMs = nowMs - Number(entry.savedAt || 0);
      if (!(ageMs >= 0 && ageMs <= maxAge)) continue;
      if (!overpassNearbyCacheEntryCanHelp(entry.meta, normalized, { extraAllowance })) continue;
      const score = overpassNearbyCacheEntryScore(entry.meta, normalized);
      if (
        score < bestScore ||
        (Math.abs(score - bestScore) < 1e-9 && Number(entry.savedAt || 0) > Number(best?.savedAt || 0))
      ) {
        best = entry;
        bestScore = score;
      }
    }
    if (!best) return null;
    return {
      ...best,
      ageMs: Math.max(0, nowMs - Number(best.savedAt || nowMs)),
      stale: nowMs - Number(best.savedAt || 0) > OVERPASS_PERSISTENT_CACHE_TTL_MS
    };
  } catch (error) {
    console.warn('[WorldLoad] Nearby Overpass persistent cache read failed:', error);
    return null;
  }
}

async function storeOverpassPersistentCache(meta, data, endpoint) {
  const normalized = normalizeOverpassCacheMeta(meta);
  if (!normalized || !data || !Array.isArray(data.elements)) return;
  const db = await openOverpassPersistentCacheDb();
  if (!db) return;
  const key = overpassPersistentCacheKey(normalized);
  if (!key) return;
  try {
    const tx = db.transaction(OVERPASS_PERSISTENT_CACHE_STORE, 'readwrite');
    const store = tx.objectStore(OVERPASS_PERSISTENT_CACHE_STORE);
    store.put({
      key,
      meta: normalized,
      data,
      endpoint: endpoint || null,
      savedAt: Date.now()
    });
    await new Promise((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => resolve();
      tx.onerror = () => resolve();
    });
    void pruneOverpassPersistentCache(db);
  } catch (error) {
    console.warn('[WorldLoad] Overpass persistent cache write failed:', error);
  }
}

function findOverpassMemoryCache(meta) {
  if (!meta) return null;
  const nowMs = Date.now();
  pruneOverpassMemoryCache(nowMs);

  let best = null;
  for (let i = 0; i < _overpassMemoryCache.length; i++) {
    const entry = _overpassMemoryCache[i];
    if (!overpassCacheEntryCanSatisfyRequest(entry.meta, meta)) continue;

    if (!best || entry.savedAt > best.savedAt) best = entry;
  }
  if (!best) return null;

  best.lastHitAt = nowMs;
  return best;
}

function findNearbyOverpassMemoryCache(meta, { extraAllowance = 0.0035 } = {}) {
  if (!meta) return null;
  const nowMs = Date.now();
  pruneOverpassMemoryCache(nowMs);

  let best = null;
  let bestScore = Infinity;
  for (let i = 0; i < _overpassMemoryCache.length; i++) {
    const entry = _overpassMemoryCache[i];
    if (!overpassNearbyCacheEntryCanHelp(entry.meta, meta, { extraAllowance })) continue;
    const score = overpassNearbyCacheEntryScore(entry.meta, meta);
    if (
      score < bestScore ||
      (Math.abs(score - bestScore) < 1e-9 && entry.savedAt > Number(best?.savedAt || 0))
    ) {
      best = entry;
      bestScore = score;
    }
  }
  if (!best) return null;

  best.lastHitAt = nowMs;
  return best;
}

function storeOverpassMemoryCache(meta, data, endpoint) {
  if (!meta || !data || !Array.isArray(data.elements)) return;

  const nowMs = Date.now();
  pruneOverpassMemoryCache(nowMs);

  const existingIdx = _overpassMemoryCache.findIndex((entry) =>
  sameOverpassCacheScope(entry.meta, meta) &&
  Math.abs(entry.meta.roadsRadius - meta.roadsRadius) < 1e-9 &&
  Math.abs(entry.meta.featureRadius - meta.featureRadius) < 1e-9 &&
  Math.abs(entry.meta.poiRadius - meta.poiRadius) < 1e-9
  );

  const record = {
      meta: {
        lat: meta.lat,
        lon: meta.lon,
        roadsRadius: meta.roadsRadius,
        featureRadius: meta.featureRadius,
        poiRadius: meta.poiRadius,
        roadsBounds: normalizeOverpassBounds(meta.roadsBounds),
        featureBounds: normalizeOverpassBounds(meta.featureBounds),
        poiBounds: normalizeOverpassBounds(meta.poiBounds),
        queryKind: String(meta.queryKind || 'full')
      },
    data,
    endpoint: endpoint || null,
    savedAt: nowMs,
    lastHitAt: nowMs
  };

  if (existingIdx >= 0) _overpassMemoryCache.splice(existingIdx, 1);
  _overpassMemoryCache.unshift(record);

  while (_overpassMemoryCache.length > OVERPASS_MEMORY_CACHE_MAX) {
    _overpassMemoryCache.pop();
  }
}

function orderedOverpassEndpoints() {
  const baseEndpoints = !_lastOverpassEndpoint || !OVERPASS_ENDPOINTS.includes(_lastOverpassEndpoint) ?
    OVERPASS_ENDPOINTS.slice() :
    [_lastOverpassEndpoint, ...OVERPASS_ENDPOINTS.filter((ep) => ep !== _lastOverpassEndpoint)];
  try {
    const origin = String(window?.location?.origin || '').trim();
    const host = String(window?.location?.hostname || '').trim().toLowerCase();
    const localHost =
      host === '127.0.0.1' ||
      host === 'localhost' ||
      host === '[::1]';
    if (localHost && origin) {
      const proxyEndpoint = new URL(LOCAL_OVERPASS_PROXY_PATH, origin).href;
      if (_localOverpassProxyUnavailable) {
        return LOCAL_BROWSER_OVERPASS_ENDPOINTS.slice();
      }
      // On localhost, keep the proxy as the only authority so browser clients
      // do not duplicate upstream pressure after the proxy already retried/cached.
      return [proxyEndpoint];
    }
  } catch {}
  return baseEndpoints;
}

async function getVectorTileLib() {
  if (_vectorTileLibPromise) return _vectorTileLibPromise;
  _vectorTileLibPromise = Promise.all([
  import('https://cdn.jsdelivr.net/npm/pbf@3.2.1/+esm'),
  import('https://cdn.jsdelivr.net/npm/@mapbox/vector-tile@1.3.1/+esm')]
  ).then(([pbfMod, vtMod]) => ({
    Pbf: pbfMod.default || pbfMod.Pbf,
    VectorTile: vtMod.VectorTile
  })).catch((err) => {
    _vectorTileLibPromise = null;
    throw err;
  });
  return _vectorTileLibPromise;
}

function delayMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createAbortError(message = 'aborted') {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function firstSuccessful(promises) {
  return new Promise((resolve, reject) => {
    const errors = new Array(promises.length);
    let pending = promises.length;
    promises.forEach((promise, idx) => {
      Promise.resolve(promise).then(resolve).catch((err) => {
        errors[idx] = err;
        pending -= 1;
        if (pending === 0) reject(errors);
      });
    });
  });
}

function roadTypePriority(type) {
  if (!type) return 0;
  if (type.includes('motorway')) return 6;
  if (type.includes('trunk')) return 5;
  if (type.includes('primary')) return 4;
  if (type.includes('secondary')) return 3;
  if (type.includes('tertiary')) return 2;
  if (type.includes('residential') || type.includes('unclassified') || type.includes('living_street')) return 2;
  if (type.includes('service')) return 1;
  return 1;
}

function isDriveableHighwayTag(highway = '') {
  return DRIVEABLE_HIGHWAY_TYPES.has(String(highway || '').toLowerCase());
}

function classifyLinearFeatureTags(tags = {}, options = {}) {
  if (!ENABLE_LINEAR_FEATURES && options.force !== true) return null;
  const highway = String(tags?.highway || '').toLowerCase();
  const railway = String(tags?.railway || '').toLowerCase();
  const bicycle = String(tags?.bicycle || '').toLowerCase();

  if (/^(rail|light_rail|tram|subway|narrow_gauge)$/.test(railway)) {
    return { kind: 'railway', subtype: railway };
  }

  if (highway === 'cycleway') {
    return { kind: 'cycleway', subtype: highway };
  }

  if (highway === 'path' && bicycle === 'designated') {
    return { kind: 'cycleway', subtype: 'shared_path' };
  }

  if (/^(footway|pedestrian|steps|path)$/.test(highway)) {
    return { kind: 'footway', subtype: highway || 'footway' };
  }

  return null;
}

function linearFeaturePriority(kind, subtype = '') {
  if (kind === 'railway') {
    if (subtype === 'rail') return 4;
    if (subtype === 'light_rail' || subtype === 'tram') return 3;
    return 2;
  }
  if (kind === 'cycleway') return subtype === 'cycleway' ? 3 : 2;
  if (kind === 'footway') {
    if (subtype === 'pedestrian') return 3;
    if (subtype === 'footway') return 2;
    return 1;
  }
  return 0;
}

function clampLinearFeatureWidth(width, fallback) {
  if (!Number.isFinite(width)) return fallback;
  return Math.max(0.9, Math.min(7.5, width));
}

function linearFeatureVisualSpec(classification, tags = {}) {
  const kind = classification?.kind;
  const preset = LINEAR_FEATURE_STYLE_PRESETS[kind] || LINEAR_FEATURE_STYLE_PRESETS.footway;
  const parsedWidth = Number.parseFloat(tags?.width);
  let width = preset.width;

  if (kind === 'railway') {
    if (classification?.subtype === 'tram') width = 2.4;
    if (classification?.subtype === 'subway') width = 2.2;
  } else if (kind === 'footway') {
    if (classification?.subtype === 'pedestrian') width = 3.3;
    if (classification?.subtype === 'footway') width = 3.0;
    if (classification?.subtype === 'steps') width = 1.4;
  } else if (kind === 'cycleway' && classification?.subtype === 'shared_path') {
    width = 2.5;
  }

  return {
    ...preset,
    width: clampLinearFeatureWidth(parsedWidth, width)
  };
}

function buildingPaletteForType(buildingType = 'yes') {
  switch (buildingType) {
  case 'house':
  case 'residential':
  case 'detached':
    return ['#d4c7b5', '#c7aa8a', '#b99176', '#a8826d', '#c9beb0'];
  case 'apartments':
    return ['#c5c1b8', '#b6b6ae', '#8f99a4', '#cbb4a4', '#9da7b3'];
  case 'commercial':
  case 'office':
    return ['#acb4bd', '#8e99a5', '#d0c1b2', '#b7afa4', '#8a949f'];
  case 'industrial':
  case 'warehouse':
    return ['#9ba0a4', '#898b8f', '#7d858c', '#aca79a', '#8d8d84'];
  case 'church':
  case 'cathedral':
    return ['#9d8d7c', '#b19b85', '#85796e', '#c0b1a0', '#8d745f'];
  default:
    return ['#a8b0b7', '#95897b', '#76828e', '#c3bbb0', '#8d7364', '#b3bcc4'];
  }
}

function pickBuildingBaseColor(buildingType, bSeed) {
  const palette = buildingPaletteForType(buildingType);
  const baseIdx = Math.floor(appCtx.rand01FromInt(bSeed ^ 0x514e2d3b) * palette.length) % palette.length;
  const baseColor = new THREE.Color(palette[baseIdx]);
  const hueShift = (appCtx.rand01FromInt(bSeed ^ 0x9e3779b9) - 0.5) * 0.03;
  const satShift = (appCtx.rand01FromInt(bSeed ^ 0x85ebca6b) - 0.5) * 0.08;
  const lightShift = (appCtx.rand01FromInt(bSeed ^ 0xc2b2ae35) - 0.5) * 0.12;
  baseColor.offsetHSL(hueShift, satShift, lightShift);
  return `#${baseColor.getHexString()}`;
}

function pickRoofColor(bSeed) {
  const palette = ['#5b5f66', '#6b6258', '#7b7469', '#4d5661', '#7b6e60'];
  const idx = Math.floor(appCtx.rand01FromInt(bSeed ^ 0x7f4a7c15) * palette.length) % palette.length;
  const color = new THREE.Color(palette[idx]);
  color.offsetHSL(
    (appCtx.rand01FromInt(bSeed ^ 0x165667b1) - 0.5) * 0.02,
    (appCtx.rand01FromInt(bSeed ^ 0xd3a2646c) - 0.5) * 0.05,
    (appCtx.rand01FromInt(bSeed ^ 0x27d4eb2f) - 0.5) * 0.08
  );
  return `#${color.getHexString()}`;
}

function wayCenterDistanceSq(way, nodeMap) {
  if (!way?.nodes?.length) return Infinity;

  let latSum = 0;
  let lonSum = 0;
  let count = 0;
  const sampleCount = Math.min(way.nodes.length, 8);

  for (let i = 0; i < sampleCount; i++) {
    const n = nodeMap[way.nodes[i]];
    if (!n) continue;
    latSum += n.lat;
    lonSum += n.lon;
    count += 1;
  }

  if (count === 0) return Infinity;

  const lat = latSum / count;
  const lon = lonSum / count;
  const dLat = lat - appCtx.LOC.lat;
  const dLon = (lon - appCtx.LOC.lon) * Math.cos(appCtx.LOC.lat * Math.PI / 180);
  return dLat * dLat + dLon * dLon;
}

function nodeDistanceSq(node) {
  if (!node) return Infinity;
  const dLat = node.lat - appCtx.LOC.lat;
  const dLon = (node.lon - appCtx.LOC.lon) * Math.cos(appCtx.LOC.lat * Math.PI / 180);
  return dLat * dLat + dLon * dLon;
}

function limitWaysByDistance(ways, nodeMap, limit, compareFn, options = {}) {
  if (ways.length <= limit) return ways;

  const sorted = ways.
  slice().
  sort((a, b) => {
    const cmp = compareFn ? compareFn(a, b) : 0;
    if (cmp !== 0) return cmp;
    return wayCenterDistanceSq(a, nodeMap) - wayCenterDistanceSq(b, nodeMap);
  });

  // Optional spatial spread mode: keep a dense city-core slice, then sample
  // evenly across the remaining distance-sorted tail so outskirts are represented.
  if (options?.spreadAcrossArea) {
    const coreRatio = Math.max(0.1, Math.min(0.9, options.coreRatio ?? 0.5));
    const coreKeep = Math.max(1, Math.min(limit, Math.floor(limit * coreRatio)));
    const selected = sorted.slice(0, coreKeep);
    const tail = sorted.slice(coreKeep);
    let remaining = limit - selected.length;

    if (remaining > 0 && tail.length > 0) {
      if (tail.length <= remaining) {
        selected.push(...tail);
      } else {
        const picked = new Set();
        for (let i = 0; i < remaining; i++) {
          let idx = Math.floor(i * tail.length / remaining);
          while (idx < tail.length - 1 && picked.has(idx)) idx++;
          if (picked.has(idx)) {
            while (idx > 0 && picked.has(idx)) idx--;
          }
          if (!picked.has(idx)) {
            picked.add(idx);
            selected.push(tail[idx]);
          }
        }
      }
    }

    return selected.slice(0, limit);
  }

  return sorted.slice(0, limit);
}

function limitNodesByDistance(nodes, limit) {
  if (nodes.length <= limit) return nodes;
  return nodes.slice().sort((a, b) => nodeDistanceSq(a) - nodeDistanceSq(b)).slice(0, limit);
}

function getPerfModeValue() {
  const mode = typeof appCtx.getPerfMode === 'function' ? appCtx.getPerfMode() : appCtx.perfMode;
  return mode === 'baseline' ? 'baseline' : 'rdt';
}

function clampNumber(value, min, max, fallback = 1) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function scaledInt(value, scale, min = 1) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.round(value * scale));
}

function getRuntimeDynamicBudget(mode = getPerfModeValue()) {
  const state = typeof appCtx.getDynamicBudgetState === 'function' ?
  appCtx.getDynamicBudgetState() :
  null;
  const defaultState = {
    auto: false,
    tier: 'balanced',
    budgetScale: 1,
    lodScale: 1
  };
  const source = state && typeof state === 'object' ? state : defaultState;
  const budgetScale =
  mode === 'baseline' ?
  clampNumber(source.budgetScale, 0.80, 1.00, 1) :
  clampNumber(source.budgetScale, 0.78, 1.16, 1);
  const lodScale =
  mode === 'baseline' ?
  clampNumber(source.lodScale, 0.90, 1.00, 1) :
  clampNumber(source.lodScale, 0.85, 1.14, 1);
  return {
    ...source,
    budgetScale,
    lodScale
  };
}

function wayCenterLatLon(way, nodeMap) {
  if (!way?.nodes?.length) return null;

  let latSum = 0;
  let lonSum = 0;
  let count = 0;
  const sampleCount = Math.min(way.nodes.length, 8);

  for (let i = 0; i < sampleCount; i++) {
    const n = nodeMap[way.nodes[i]];
    if (!n) continue;
    latSum += n.lat;
    lonSum += n.lon;
    count += 1;
  }
  if (count === 0) return null;

  return { lat: latSum / count, lon: lonSum / count };
}

function featureTileKeyForLatLon(lat, lon, tileDegrees = FEATURE_TILE_DEGREES) {
  const cx = Math.floor(lat / tileDegrees);
  const cz = Math.floor(lon / tileDegrees);
  return `${cx},${cz}`;
}

function rdtDepthForFeatureTile(tileKey, tileDegrees = FEATURE_TILE_DEGREES) {
  const cacheKey = `${tileDegrees}:${tileKey}`;
  if (_rdtTileDepthCache.has(cacheKey)) return _rdtTileDepthCache.get(cacheKey);

  const [cxRaw, czRaw] = tileKey.split(',');
  const cx = Number(cxRaw);
  const cz = Number(czRaw);
  const lat = Number.isFinite(cx) ? cx * tileDegrees : 0;
  const lon = Number.isFinite(cz) ? cz * tileDegrees : 0;
  const seed = appCtx.hashGeoToInt(lat, lon, 31);
  const depth = appCtx.rdtDepth(seed % 1000000 + 2, 1.5);
  _rdtTileDepthCache.set(cacheKey, depth);
  return depth;
}

function rdtTileCap(baseCap, minCap, depth) {
  const d = Math.max(0, depth | 0);
  const scale =
  d <= 2 ? 1.0 :
  d === 3 ? 0.90 :
  d === 4 ? 0.82 :
  d === 5 ? 0.72 :
  0.62;
  return Math.max(minCap, Math.floor(baseCap * scale));
}

function limitWaysByTileBudget(ways, nodeMap, options = {}) {
  if (!Array.isArray(ways) || ways.length === 0) return [];

  const globalCap = Number.isFinite(options.globalCap) ? Math.max(0, options.globalCap) : ways.length;
  const basePerTile = Number.isFinite(options.basePerTile) ? Math.max(1, options.basePerTile) : ways.length;
  const minPerTile = Number.isFinite(options.minPerTile) ? Math.max(1, options.minPerTile) : 1;
  const tileDegrees = Number.isFinite(options.tileDegrees) ? options.tileDegrees : FEATURE_TILE_DEGREES;
  const useRdt = !!options.useRdt;
  const compareFn = typeof options.compareFn === 'function' ? options.compareFn : null;
  const spreadAcrossArea = !!options.spreadAcrossArea;
  const coreRatio = Number.isFinite(options.coreRatio) ? options.coreRatio : 0.5;

  if (globalCap <= 0) return [];

  const buckets = new Map();
  ways.forEach((way) => {
    const center = wayCenterLatLon(way, nodeMap);
    if (!center) return;
    const tileKey = featureTileKeyForLatLon(center.lat, center.lon, tileDegrees);
    let bucket = buckets.get(tileKey);
    if (!bucket) {
      bucket = [];
      buckets.set(tileKey, bucket);
    }
    bucket.push(way);
  });

  const selected = [];
  buckets.forEach((bucket, tileKey) => {
    let cap = basePerTile;
    if (useRdt) {
      const depth = rdtDepthForFeatureTile(tileKey, tileDegrees);
      cap = rdtTileCap(basePerTile, minPerTile, depth);
    }

    if (bucket.length > cap) {
      selected.push(...limitWaysByDistance(
        bucket,
        nodeMap,
        cap,
        compareFn,
        spreadAcrossArea ? { spreadAcrossArea: true, coreRatio } : {}
      ));
    } else {
      selected.push(...bucket);
    }
  });

  if (selected.length <= globalCap) return selected;
  return limitWaysByDistance(
    selected,
    nodeMap,
    globalCap,
    compareFn,
    spreadAcrossArea ? { spreadAcrossArea: true, coreRatio } : {}
  );
}

function limitNodesByTileBudget(nodes, options = {}) {
  if (!Array.isArray(nodes) || nodes.length === 0) return [];

  const globalCap = Number.isFinite(options.globalCap) ? Math.max(0, options.globalCap) : nodes.length;
  const basePerTile = Number.isFinite(options.basePerTile) ? Math.max(1, options.basePerTile) : nodes.length;
  const minPerTile = Number.isFinite(options.minPerTile) ? Math.max(1, options.minPerTile) : 1;
  const tileDegrees = Number.isFinite(options.tileDegrees) ? options.tileDegrees : FEATURE_TILE_DEGREES;
  const useRdt = !!options.useRdt;

  if (globalCap <= 0) return [];

  const buckets = new Map();
  nodes.forEach((node) => {
    if (!Number.isFinite(node?.lat) || !Number.isFinite(node?.lon)) return;
    const tileKey = featureTileKeyForLatLon(node.lat, node.lon, tileDegrees);
    let bucket = buckets.get(tileKey);
    if (!bucket) {
      bucket = [];
      buckets.set(tileKey, bucket);
    }
    bucket.push(node);
  });

  const selected = [];
  buckets.forEach((bucket, tileKey) => {
    let cap = basePerTile;
    if (useRdt) {
      const depth = rdtDepthForFeatureTile(tileKey, tileDegrees);
      cap = rdtTileCap(basePerTile, minPerTile, depth);
    }

    if (bucket.length > cap) {
      bucket.sort((a, b) => nodeDistanceSq(a) - nodeDistanceSq(b));
      selected.push(...bucket.slice(0, cap));
    } else {
      selected.push(...bucket);
    }
  });

  if (selected.length <= globalCap) return selected;
  return limitNodesByDistance(selected, globalCap);
}

function getRoadSubdivisionStep(roadType, tileDepth, mode = getPerfModeValue()) {
  let maxDist = 3.5;

  if (mode === 'baseline' && !appCtx.boatMode?.active) {
    maxDist = 3.6;
  } else if (tileDepth >= 6) {
    maxDist = 6.0;
  } else if (tileDepth === 5) {
    maxDist = 5.0;
  } else if (tileDepth === 4) {
    maxDist = 4.2;
  } else if (tileDepth === 3) {
    maxDist = 3.6;
  } else {
    maxDist = 3.0;
  }

  if (roadType?.includes('motorway') || roadType?.includes('trunk')) {
    maxDist *= 0.82;
  } else if (roadType?.includes('primary') || roadType?.includes('secondary')) {
    maxDist *= 0.90;
  }

  return Math.max(2.0, Math.min(7.0, maxDist));
}

function getWorldLodThresholds(loadDepth, mode = getPerfModeValue(), lodScale = 1) {
  const scale = clampNumber(lodScale, 0.75, 1.25, 1);
  if (mode === 'baseline') {
    const nearBase = 1200;
    const near = Math.max(900, Math.round(nearBase * scale));
    const mid = Math.max(near + 600, Math.round(2400 * scale));
    const farVisible = Math.max(mid + 240, Math.round(2700 * scale));
    return { near, mid, farVisible };
  }

  const depth = Math.max(0, loadDepth | 0);
  // Keep RDT adaptive with smoother pop control, but avoid over-expanding visibility.
  const nearBase = Math.max(980, 1500 - depth * 45);
  const near = Math.max(900, Math.round(nearBase * scale));
  const mid = Math.max(near + 540, Math.round((nearBase + 1320) * scale));
  return { near, mid, farVisible: mid + 450 };
}

function getAdaptiveLoadProfile(loadDepth, mode = getPerfModeValue(), budgetScale = 1) {
  const depth = Math.max(0, loadDepth | 0);
  const scale = clampNumber(budgetScale, 0.65, 1.35, 1);
  const radiusScale = clampNumber(Math.sqrt(scale), 0.88, 1.08, 1);
  const scaledRadii = (radii) => radii.map((r) => Number((r * radiusScale).toFixed(5)));

  if (mode === 'baseline') {
    return {
      radii: scaledRadii([0.02, 0.025, 0.03]),
      featureRadiusScale: clampNumber(1.0 * radiusScale, 0.90, 1.02, 1),
      poiRadiusScale: clampNumber(1.0 * radiusScale, 0.88, 1.02, 1),
      maxRoadWays: scaledInt(20000, scale, 3200),
      maxBuildingWays: scaledInt(50000, scale, 7000),
      maxLanduseWays: scaledInt(15000, scale, 2200),
      maxPoiNodes: scaledInt(8000, scale, 1200),
      tileBudgetCfg: {
        tileDegrees: FEATURE_TILE_DEGREES,
        roadsPerTile: scaledInt(520, scale, 120),
        roadsMinPerTile: scaledInt(240, scale, 48),
        buildingsPerTile: scaledInt(1200, scale, 220),
        buildingsMinPerTile: scaledInt(600, scale, 120),
        landusePerTile: scaledInt(320, scale, 70),
        landuseMinPerTile: scaledInt(150, scale, 35),
        poiPerTile: scaledInt(200, scale, 40),
        poiMinPerTile: scaledInt(90, scale, 20)
      },
      overpassTimeoutMs: 30000,
      maxTotalLoadMs: 62000
    };
  }

  // Depth-aware RDT budgets: high depth = much tighter caps.
  const profileByDepth =
  depth >= 6 ? {
    radii: [0.019, 0.024, 0.029],
    featureRadiusScale: 0.96,
    poiRadiusScale: 0.88,
    maxRoadWays: 3400,
    maxBuildingWays: 18000,
    maxLanduseWays: 4200,
    maxPoiNodes: 1600,
    roadsPerTile: 155,
    roadsMinPerTile: 40,
    buildingsPerTile: 460,
    buildingsMinPerTile: 130,
    landusePerTile: 100,
    landuseMinPerTile: 22,
    poiPerTile: 52,
    poiMinPerTile: 14,
    overpassTimeoutMs: 19000,
    maxTotalLoadMs: 50000
  } :
  depth === 5 ? {
    radii: [0.019, 0.024, 0.028],
    featureRadiusScale: 0.94,
    poiRadiusScale: 0.86,
    maxRoadWays: 3900,
    maxBuildingWays: 17000,
    maxLanduseWays: 5200,
    maxPoiNodes: 1900,
    roadsPerTile: 165,
    roadsMinPerTile: 40,
    buildingsPerTile: 430,
    buildingsMinPerTile: 120,
    landusePerTile: 124,
    landuseMinPerTile: 28,
    poiPerTile: 66,
    poiMinPerTile: 18,
    overpassTimeoutMs: 19000,
    maxTotalLoadMs: 44000
  } :
  depth === 4 ? {
    radii: [0.019, 0.024, 0.028],
    featureRadiusScale: 0.93,
    poiRadiusScale: 0.86,
    maxRoadWays: 4300,
    maxBuildingWays: 15000,
    maxLanduseWays: 6200,
    maxPoiNodes: 2200,
    roadsPerTile: 185,
    roadsMinPerTile: 48,
    buildingsPerTile: 420,
    buildingsMinPerTile: 110,
    landusePerTile: 138,
    landuseMinPerTile: 30,
    poiPerTile: 80,
    poiMinPerTile: 20,
    overpassTimeoutMs: 22000,
    maxTotalLoadMs: 50000
  } : {
    radii: [0.02, 0.025, 0.03],
    featureRadiusScale: 0.95,
    poiRadiusScale: 0.90,
    maxRoadWays: 5600,
    maxBuildingWays: 17000,
    maxLanduseWays: 8500,
    maxPoiNodes: 2800,
    roadsPerTile: 220,
    roadsMinPerTile: 60,
    buildingsPerTile: 500,
    buildingsMinPerTile: 140,
    landusePerTile: 165,
    landuseMinPerTile: 44,
    poiPerTile: 100,
    poiMinPerTile: 28,
    overpassTimeoutMs: 26000,
    maxTotalLoadMs: 56000
  };

  return {
    radii: scaledRadii(profileByDepth.radii),
    featureRadiusScale: clampNumber(profileByDepth.featureRadiusScale * radiusScale, 0.75, 1.12, profileByDepth.featureRadiusScale),
    poiRadiusScale: clampNumber(profileByDepth.poiRadiusScale * radiusScale, 0.70, 1.12, profileByDepth.poiRadiusScale),
    maxRoadWays: scaledInt(profileByDepth.maxRoadWays, scale, 900),
    maxBuildingWays: scaledInt(profileByDepth.maxBuildingWays, scale, 2400),
    maxLanduseWays: scaledInt(profileByDepth.maxLanduseWays, scale, 600),
    maxPoiNodes: scaledInt(profileByDepth.maxPoiNodes, scale, 240),
    tileBudgetCfg: {
      tileDegrees: FEATURE_TILE_DEGREES,
      roadsPerTile: scaledInt(profileByDepth.roadsPerTile, scale, 18),
      roadsMinPerTile: scaledInt(profileByDepth.roadsMinPerTile, scale, 8),
      buildingsPerTile: scaledInt(profileByDepth.buildingsPerTile, scale, 32),
      buildingsMinPerTile: scaledInt(profileByDepth.buildingsMinPerTile, scale, 14),
      landusePerTile: scaledInt(profileByDepth.landusePerTile, scale, 10),
      landuseMinPerTile: scaledInt(profileByDepth.landuseMinPerTile, scale, 4),
      poiPerTile: scaledInt(profileByDepth.poiPerTile, scale, 6),
      poiMinPerTile: scaledInt(profileByDepth.poiMinPerTile, scale, 3)
    },
    overpassTimeoutMs: profileByDepth.overpassTimeoutMs,
    maxTotalLoadMs: profileByDepth.maxTotalLoadMs
  };
}

function getContinuousWorldVisibleLoadPlan({
  roadRadius = 0,
  featureRadius = 0,
  poiRadius = 0,
  linearFeatureRadius = 0,
  maxRoadWays = 0,
  maxBuildingWays = 0,
  maxLanduseWays = 0,
  maxPoiNodes = 0
} = {}) {
  const snapshot = typeof appCtx.getContinuousWorldRuntimeSnapshot === 'function' ?
    appCtx.getContinuousWorldRuntimeSnapshot() :
    null;
  if (!snapshot?.enabled) return null;

  const regionDegrees = Number(snapshot?.regionConfig?.degrees || 0);
  const farRadius = Number(snapshot?.regionConfig?.farRadius || 0);
  const midRadius = Number(snapshot?.regionConfig?.midRadius || 0);
  if (!(regionDegrees > 0 && farRadius >= 1)) return null;

  const farEnvelopeHalfDegrees = regionDegrees * (farRadius + 1);
  const startupPhase = !appCtx.gameStarted || !!appCtx.worldLoading;
  const startupEnvelopeHalfDegrees = regionDegrees * (Math.max(1, midRadius) + 0.75);
  const effectiveEnvelopeHalfDegrees = startupPhase ? startupEnvelopeHalfDegrees : farEnvelopeHalfDegrees;
  if (!(effectiveEnvelopeHalfDegrees > featureRadius * 1.1)) return null;

  const expandedRoadRadius = clampNumber(
    Math.max(roadRadius * (startupPhase ? 1.08 : 1.72), effectiveEnvelopeHalfDegrees * (startupPhase ? 0.44 : 0.7)),
    Math.max(roadRadius, 0.006),
    CONTINUOUS_WORLD_VISIBLE_LOAD_MAX_ROAD_RADIUS,
    roadRadius
  );
  const expandedFeatureRadius = clampNumber(
    Math.max(featureRadius * (startupPhase ? 1.1 : 1.95), effectiveEnvelopeHalfDegrees * (startupPhase ? 0.56 : 0.94)),
    Math.max(featureRadius, 0.008),
    CONTINUOUS_WORLD_VISIBLE_LOAD_MAX_FEATURE_RADIUS,
    featureRadius
  );
  const expandedPoiRadius = clampNumber(
    Math.max(poiRadius * (startupPhase ? 1.0 : 1.35), effectiveEnvelopeHalfDegrees * (startupPhase ? 0.24 : 0.52)),
    Math.max(poiRadius, 0.006),
    CONTINUOUS_WORLD_VISIBLE_LOAD_MAX_POI_RADIUS,
    poiRadius
  );
  const expandedLinearRadius = clampNumber(
    Math.max(linearFeatureRadius * (startupPhase ? 1.02 : 1.45), effectiveEnvelopeHalfDegrees * (startupPhase ? 0.32 : 0.62)),
    Math.max(linearFeatureRadius, 0.006),
    CONTINUOUS_WORLD_VISIBLE_LOAD_MAX_LINEAR_RADIUS,
    linearFeatureRadius
  );
  const expansionRatio = expandedFeatureRadius / Math.max(featureRadius, 1e-6);
  const budgetScale = clampNumber(
    1 + (expansionRatio - 1) * 0.58,
    1,
    startupPhase ? 1.08 : CONTINUOUS_WORLD_VISIBLE_LOAD_MAX_BUDGET_SCALE,
    1
  );
  const roadBudgetScale = startupPhase ? 0.82 : budgetScale;
  const buildingBudgetScale = startupPhase ? 0.58 : budgetScale;
  const landuseBudgetScale = startupPhase ? 0.72 : budgetScale;
  const poiBudgetScale = startupPhase ? 0.74 : budgetScale;
  const worldScale = Math.max(1, Number(appCtx.SCALE) || 1);
  const buildingFarLoadDistance = Math.round(clampNumber(
    worldScale * expandedFeatureRadius * (startupPhase ? 0.56 : 0.9),
    Math.max(1800, worldScale * featureRadius * 0.72),
    startupPhase ? 3000 : 9000,
    Math.max(1800, worldScale * featureRadius * 0.72)
  ));

  return {
    enabled: true,
    regionDegrees,
    farRadius,
    farEnvelopeHalfDegrees,
    startupPhase,
    effectiveEnvelopeHalfDegrees,
    expansionRatio,
    budgetScale,
    roadRadius: expandedRoadRadius,
    featureRadius: expandedFeatureRadius,
    poiRadius: expandedPoiRadius,
    linearFeatureRadius: expandedLinearRadius,
    maxRoadWays: scaledInt(maxRoadWays, roadBudgetScale, Math.max(900, Math.floor(maxRoadWays * 0.6))),
    maxBuildingWays: scaledInt(maxBuildingWays, buildingBudgetScale, Math.max(1400, Math.floor(maxBuildingWays * 0.28))),
    maxLanduseWays: scaledInt(maxLanduseWays, landuseBudgetScale, Math.max(600, Math.floor(maxLanduseWays * 0.55))),
    maxPoiNodes: scaledInt(maxPoiNodes, poiBudgetScale, Math.max(180, Math.floor(maxPoiNodes * 0.55))),
    buildingFarLoadDistance
  };
}

function continuousWorldGeoDistanceWorldUnits(latA, lonA, latB, lonB) {
  const scale = Math.max(1, Number(appCtx.SCALE) || 1);
  const midLat = (Number(latA || 0) + Number(latB || 0)) * 0.5;
  const cosLat = Math.cos(midLat * Math.PI / 180) || 1;
  const dx = (Number(lonB || 0) - Number(lonA || 0)) * scale * cosLat;
  const dz = -(Number(latB || 0) - Number(latA || 0)) * scale;
  return Math.hypot(dx, dz);
}

function resetContinuousWorldInteractiveStreamState(reason = 'world_load_reset') {
  if (_traversalRebuildTimer) {
    clearTimeout(_traversalRebuildTimer);
    _traversalRebuildTimer = null;
  }
  if (_continuousWorldInteractiveStreamState.recoveryTimerId) {
    clearTimeout(_continuousWorldInteractiveStreamState.recoveryTimerId);
    _continuousWorldInteractiveStreamState.recoveryTimerId = null;
  }
  if (_continuousWorldInteractiveStreamState.recoveryShellTimerId) {
    clearTimeout(_continuousWorldInteractiveStreamState.recoveryShellTimerId);
    _continuousWorldInteractiveStreamState.recoveryShellTimerId = null;
  }
  if (_continuousWorldInteractiveStreamState.abortController) {
    try {
      _continuousWorldInteractiveStreamState.abortController.abort();
    } catch {}
    _continuousWorldInteractiveStreamState.abortController = null;
  }
  _continuousWorldInteractiveStreamState.pending = false;
  _continuousWorldInteractiveStreamState.lastKickAt = 0;
  _continuousWorldInteractiveStreamState.lastLoadAt = 0;
  _continuousWorldInteractiveStreamState.lastLoadReason = reason;
  _continuousWorldInteractiveStreamState.lastError = null;
  _continuousWorldInteractiveStreamState.coverage = [];
  _continuousWorldInteractiveStreamState.loadedRoadIds = new Set();
  _continuousWorldInteractiveStreamState.loadedBuildingIds = new Set();
  _continuousWorldInteractiveStreamState.loadedLanduseIds = new Set();
  _continuousWorldInteractiveStreamState.loadedWaterwayIds = new Set();
  _continuousWorldInteractiveStreamState.totalAddedRoads = 0;
  _continuousWorldInteractiveStreamState.totalAddedBuildings = 0;
  _continuousWorldInteractiveStreamState.totalAddedLanduseMeshes = 0;
  _continuousWorldInteractiveStreamState.totalAddedWaterAreas = 0;
  _continuousWorldInteractiveStreamState.totalAddedWaterways = 0;
  _continuousWorldInteractiveStreamState.totalLoads = 0;
  _continuousWorldInteractiveStreamState.forcedSurfaceSyncLoads = 0;
  _continuousWorldInteractiveStreamState.deferredSurfaceSyncLoads = 0;
  _continuousWorldInteractiveStreamState.skippedSurfaceSyncLoads = 0;
  _continuousWorldInteractiveStreamState.lastSurfaceSyncPolicy = null;
  _continuousWorldInteractiveStreamState.activeInteractiveRoads = 0;
  _continuousWorldInteractiveStreamState.activeInteractiveBuildings = 0;
  _continuousWorldInteractiveStreamState.activeInteractiveLanduse = 0;
  _continuousWorldInteractiveStreamState.activeInteractiveWaterways = 0;
  _continuousWorldInteractiveStreamState.evictedRoads = 0;
  _continuousWorldInteractiveStreamState.evictedBuildings = 0;
  _continuousWorldInteractiveStreamState.evictedLanduse = 0;
  _continuousWorldInteractiveStreamState.evictedWaterways = 0;
  _continuousWorldInteractiveStreamState.evictedMeshes = 0;
  _continuousWorldInteractiveStreamState.seededSignature = '';
  _continuousWorldInteractiveStreamState.pending = false;
  _continuousWorldInteractiveStreamState.pendingStartedAt = 0;
  _continuousWorldInteractiveStreamState.pendingQueryLat = NaN;
  _continuousWorldInteractiveStreamState.pendingQueryLon = NaN;
  _continuousWorldInteractiveStreamState.pendingRegionKey = null;
  _continuousWorldInteractiveStreamState.activeRequestId = 0;
  _lastBaseWorldEvictionAt = 0;
}

function seedContinuousWorldInteractiveStreamState() {
  const loadConfig = appCtx._continuousWorldVisibleLoadConfig;
  const baseLat = Number(loadConfig?.location?.lat ?? appCtx.LOC?.lat);
  const baseLon = Number(loadConfig?.location?.lon ?? appCtx.LOC?.lon);
  if (!loadConfig?.enabled || !Number.isFinite(baseLat) || !Number.isFinite(baseLon)) return null;
  const runtimeSnapshot = appCtx.getContinuousWorldRuntimeSnapshot?.();
  const seedRegionKey = continuousWorldInteractiveRegionKeyFromLatLon(baseLat, baseLon, runtimeSnapshot);

  const signature = [
    baseLat.toFixed(6),
    baseLon.toFixed(6),
    Number(loadConfig.roadRadius || 0).toFixed(5),
    Number(loadConfig.featureRadius || 0).toFixed(5)
  ].join(':');
  if (_continuousWorldInteractiveStreamState.seededSignature === signature) {
    return getContinuousWorldInteractiveStreamSnapshot();
  }

  resetContinuousWorldInteractiveStreamState('seed_from_visible_load');
  _continuousWorldInteractiveStreamState.seededSignature = signature;
  const startupRoadCount = Array.isArray(appCtx.roads) ? appCtx.roads.length : 0;
  const startupBuildingCount = Array.isArray(appCtx.buildings) ? appCtx.buildings.length : 0;
  const startupLanduseCount = Array.isArray(appCtx.landuseMeshes) ? appCtx.landuseMeshes.length : 0;
  const startupSeedLoadLevel =
    startupBuildingCount > 0 || startupLanduseCount > 0 ? 'reduced' :
    startupRoadCount > 0 ? 'roads_only' :
    'roads_only';
  _continuousWorldInteractiveStreamState.coverage.push({
    key: `seed:${signature}`,
    lat: baseLat,
    lon: baseLon,
    regionKey: seedRegionKey,
    roadRadius: Number(loadConfig.roadRadius || 0),
    featureRadius: Number(loadConfig.featureRadius || 0),
    loadLevel: startupSeedLoadLevel,
    seeded: true,
    addedRoads: startupRoadCount,
    addedBuildings: startupBuildingCount,
    addedLanduseMeshes: startupLanduseCount,
    reason: 'initial_visible_load',
    at: Date.now()
  });

  const regionStats = new Map();
  const touchRegionStat = (regionKey, family = 'roads') => {
    const key = String(regionKey || '').trim();
    if (!key || key === seedRegionKey) return;
    let stat = regionStats.get(key);
    if (!stat) {
      stat = {
        roads: 0,
        buildings: 0,
        landuse: 0
      };
      regionStats.set(key, stat);
    }
    if (family === 'buildings') stat.buildings += 1;
    else if (family === 'landuse') stat.landuse += 1;
    else stat.roads += 1;
  };
  const collectRegionKeys = (list, family = 'roads', keyField = 'continuousWorldRegionKeys') => {
    (Array.isArray(list) ? list : []).forEach((item) => {
      const keys = Array.isArray(item?.[keyField]) ? item[keyField] : Array.isArray(item?.userData?.[keyField]) ? item.userData[keyField] : [];
      keys.forEach((key) => {
        touchRegionStat(key, family);
      });
    });
  };
  collectRegionKeys(appCtx.roads, 'roads');
  collectRegionKeys(appCtx.buildings, 'buildings');
  collectRegionKeys(appCtx.roadMeshes, 'roads');
  collectRegionKeys(appCtx.buildingMeshes, 'buildings');
  collectRegionKeys(appCtx.landuseMeshes, 'landuse');
  const extraRegions = Array.from(regionStats.entries())
    .sort((a, b) => (b[1].roads + b[1].buildings + b[1].landuse) - (a[1].roads + a[1].buildings + a[1].landuse))
    .slice(0, Math.max(0, CONTINUOUS_WORLD_INTERACTIVE_STREAM_MAX_COVERAGE - 1));
  extraRegions.forEach(([regionKey, stat]) => {
    const [latIndexRaw, lonIndexRaw] = String(regionKey).split(':');
    const latIndex = Number(latIndexRaw);
    const lonIndex = Number(lonIndexRaw);
    const center = continuousWorldInteractiveRegionCellCenter({ latIndex, lonIndex, key: regionKey }, runtimeSnapshot);
    if (!center) return;
    const seededLoadLevel =
      Number(stat?.buildings || 0) > 0 || Number(stat?.landuse || 0) > 0 ? 'reduced' :
      Number(stat?.roads || 0) > 0 ? 'roads_only' :
      'roads_only';
    _continuousWorldInteractiveStreamState.coverage.push({
      key: `seed-region:${regionKey}`,
      lat: center.lat,
      lon: center.lon,
      regionKey,
      roadRadius: Number(loadConfig.roadRadius || 0),
      featureRadius: Number(loadConfig.featureRadius || 0),
      loadLevel: seededLoadLevel,
      seeded: true,
      addedRoads: Number(stat?.roads || 0),
      addedBuildings: Number(stat?.buildings || 0),
      addedLanduseMeshes: Number(stat?.landuse || 0),
      reason: 'initial_visible_regions',
      at: Date.now()
    });
  });

  (Array.isArray(appCtx.roads) ? appCtx.roads : []).forEach((road) => {
    const id = String(road?.sourceFeatureId || '').trim();
    if (id) _continuousWorldInteractiveStreamState.loadedRoadIds.add(id);
  });
  const baseDetailedBuildingIds = collectBaseDetailedBuildingSourceIds();
  (Array.isArray(appCtx.buildings) ? appCtx.buildings : []).forEach((building) => {
    const id = String(building?.sourceBuildingId || '').trim();
    if (id && baseDetailedBuildingIds.has(id)) _continuousWorldInteractiveStreamState.loadedBuildingIds.add(id);
  });

  refreshContinuousWorldInteractiveActiveCounts();

  return getContinuousWorldInteractiveStreamSnapshot();
}

function continuousWorldInteractiveChunkPlan() {
  const base = appCtx._continuousWorldVisibleLoadConfig;
  if (!base?.enabled) return null;
  const actor = continuousWorldInteractiveActorMotionState();
  const mode = String(actor?.mode || 'drive');
  const speed = Math.abs(Number(actor?.speed || 0));
  const visibleRoadMeshesNearActor =
    mode === 'drive' ?
      countVisibleRoadMeshesNearWorldPoint(actor?.x, actor?.z, speed >= 8 ? 320 : 240) :
      0;
  const offRoadRecovery =
    mode === 'drive' &&
    (
      actor?.onRoad === false ||
      visibleRoadMeshesNearActor < (
        PLAYABLE_CORE_RESIDENCY_CONFIG.minVisibleRoadMeshesReady?.drive ||
        12
      )
    );
  const fastDrive = mode === 'drive' && speed >= 14;
  const waterTravel = mode === 'boat' || mode === 'ocean';
  const roadRadiusScale =
    mode === 'walk' ? 0.9 :
    waterTravel ? 0.76 :
    mode === 'drone' ? 1.26 :
    offRoadRecovery ? 2.18 :
    fastDrive ? 1.92 :
    1.52;
  const featureRadiusScale =
    mode === 'walk' ? 0.9 :
    waterTravel ? 0.62 :
    mode === 'drone' ? 0.5 :
    offRoadRecovery ? 0.42 :
    fastDrive ? 0.54 :
    0.68;
  const roadBudgetScale =
    waterTravel ? 0.82 :
    mode === 'drone' ? 1.28 :
    offRoadRecovery ? 2.52 :
    fastDrive ? 2.18 :
    1.64;
  const buildingBudgetScale =
    mode === 'walk' ? 0.7 :
    waterTravel ? 0.08 :
    mode === 'drone' ? 0.1 :
    offRoadRecovery ? 0.08 :
    fastDrive ? 0.14 :
    0.28;
  const landuseBudgetScale =
    waterTravel ? 0.42 :
    mode === 'drone' ? 0.42 :
    offRoadRecovery ? 0.18 :
    fastDrive ? 0.24 :
    0.42;
  const waterwayBudgetScale =
    waterTravel ? 1.45 :
    mode === 'drone' ? 0.6 :
    0.9;
  const overpassTimeoutMs =
    offRoadRecovery ? 4200 :
    mode === 'drive' && speed >= 10 ? 6200 :
    mode === 'drive' && speed >= 2 ? 7600 :
    16000;
  const maxTotalLoadMs =
    offRoadRecovery ? 6200 :
    mode === 'drive' && speed >= 10 ? 8200 :
    mode === 'drive' && speed >= 2 ? 9800 :
    22000;
  return {
    roadRadius: clampNumber(
      Math.max(Number(base.roadRadius || 0) * 0.3 * roadRadiusScale, CONTINUOUS_WORLD_INTERACTIVE_STREAM_ROAD_RADIUS_MIN),
      CONTINUOUS_WORLD_INTERACTIVE_STREAM_ROAD_RADIUS_MIN,
      CONTINUOUS_WORLD_INTERACTIVE_STREAM_ROAD_RADIUS_MAX,
      CONTINUOUS_WORLD_INTERACTIVE_STREAM_ROAD_RADIUS_MIN
    ),
    featureRadius: clampNumber(
      Math.max(Number(base.featureRadius || 0) * 0.3 * featureRadiusScale, CONTINUOUS_WORLD_INTERACTIVE_STREAM_FEATURE_RADIUS_MIN),
      CONTINUOUS_WORLD_INTERACTIVE_STREAM_FEATURE_RADIUS_MIN,
      CONTINUOUS_WORLD_INTERACTIVE_STREAM_FEATURE_RADIUS_MAX,
      CONTINUOUS_WORLD_INTERACTIVE_STREAM_FEATURE_RADIUS_MIN
    ),
    maxRoadWays: clampNumber(Math.round(Math.max(600, Number(base.maxRoadWays || 0)) * 0.16 * roadBudgetScale), 520, 2200, 980),
    maxBuildingWays: clampNumber(Math.round(Math.max(1800, Number(base.maxBuildingWays || 0)) * 0.05 * buildingBudgetScale), 0, 1800, 720),
    maxLanduseWays: clampNumber(Math.round(Math.max(900, Number(base.maxLanduseWays || 0)) * 0.08 * landuseBudgetScale), 0, 840, 320),
    maxWaterwayWays: clampNumber(Math.round(Math.max(180, Number(base.maxLanduseWays || 0) * 0.25) * 0.4 * waterwayBudgetScale), 0, 260, 96),
    maxTotalLoadMs,
    overpassTimeoutMs
  };
}

function continuousWorldInteractiveLoadLevelRank(level = 'full') {
  return CONTINUOUS_WORLD_INTERACTIVE_LOAD_LEVELS[String(level || 'full')] || CONTINUOUS_WORLD_INTERACTIVE_LOAD_LEVELS.full;
}

function continuousWorldInteractiveCoverageLevelForRegion(regionKey = null, options = {}) {
  const key = String(regionKey || '').trim();
  if (!key) return 0;
  const includeSeeded = options?.includeSeeded !== false;
  let bestRank = 0;
  for (let i = 0; i < _continuousWorldInteractiveStreamState.coverage.length; i++) {
    const entry = _continuousWorldInteractiveStreamState.coverage[i];
    const regionKeys = Array.isArray(entry?.regionKeys) ?
      entry.regionKeys.map((entryKey) => String(entryKey || '').trim()).filter(Boolean) :
      null;
    const matchesRegion =
      regionKeys?.length ?
        regionKeys.includes(key) :
        String(entry?.regionKey || '').trim() === key;
    if (!matchesRegion) continue;
    if (!includeSeeded && entry?.seeded === true) continue;
    const addedRoads = Number(entry?.addedRoads || 0);
    const addedBuildings = Number(entry?.addedBuildings || 0);
    const addedLanduseMeshes = Number(entry?.addedLanduseMeshes || 0);
    if (entry?.seeded === true && addedRoads <= 0 && addedBuildings <= 0 && addedLanduseMeshes <= 0) continue;
    const rank = continuousWorldInteractiveLoadLevelRank(entry?.loadLevel || 'full');
    if (rank > bestRank) bestRank = rank;
  }
  return bestRank;
}

function continuousWorldInteractiveRegionDegrees(runtimeSnapshot = null) {
  return Math.max(
    0.0001,
    Number(
      runtimeSnapshot?.regionConfig?.degrees ||
      appCtx.getContinuousWorldRuntimeSnapshot?.()?.regionConfig?.degrees
    ) || 0.02
  );
}

function continuousWorldInteractiveRegionKeyFromLatLon(lat, lon, runtimeSnapshot = null) {
  const size = continuousWorldInteractiveRegionDegrees(runtimeSnapshot);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return `${Math.floor(lat / size)}:${Math.floor(lon / size)}`;
}

function continuousWorldInteractiveCoverageRegionKeys(runtimeSnapshot = null) {
  const keys = new Set();
  _continuousWorldInteractiveStreamState.coverage.forEach((entry) => {
    if (Array.isArray(entry?.regionKeys) && entry.regionKeys.length > 0) {
      entry.regionKeys.forEach((entryKey) => {
        const key = String(entryKey || '').trim();
        if (key) keys.add(key);
      });
      return;
    }
    const key =
      String(entry?.regionKey || '').trim() ||
      continuousWorldInteractiveRegionKeyFromLatLon(entry?.lat, entry?.lon, runtimeSnapshot);
    if (key) keys.add(key);
  });
  return keys;
}

function continuousWorldInteractiveRegionCellCenter(cell, runtimeSnapshot = null) {
  const size = continuousWorldInteractiveRegionDegrees(runtimeSnapshot);
  const latIndex = Number(cell?.latIndex);
  const lonIndex = Number(cell?.lonIndex);
  if (!Number.isFinite(latIndex) || !Number.isFinite(lonIndex)) return null;
  return {
    key: String(cell?.key || `${latIndex}:${lonIndex}`),
    lat: (latIndex + 0.5) * size,
    lon: (lonIndex + 0.5) * size
  };
}

function continuousWorldInteractiveReasonIsActorCritical(reason = 'actor_drift') {
  const reasonText = String(reason || 'actor_drift');
  return (
    reasonText === 'main_loop' ||
    reasonText === 'actor_drift' ||
    reasonText === 'actor_visible_road_gap' ||
    reasonText === 'actor_building_gap' ||
    reasonText === 'forward_road_corridor' ||
    reasonText.startsWith('forward_road_corridor:') ||
    reasonText === 'road_recovery_shell' ||
    reasonText.startsWith('building_continuity_')
  );
}

function continuousWorldInteractiveReasonIsForwardRoadCorridor(reason = 'actor_drift') {
  const reasonText = String(reason || 'actor_drift');
  return (
    reasonText === 'forward_road_corridor' ||
    reasonText.startsWith('forward_road_corridor:')
  );
}

function continuousWorldInteractiveReasonIsRoutine(reason = 'actor_drift') {
  const reasonText = String(reason || 'actor_drift');
  return (
    reasonText === 'runtime_tick' ||
    reasonText === 'main_loop' ||
    reasonText === 'actor_drift'
  );
}

function continuousWorldInteractiveShouldYieldToSurfaceSync(
  actorState = null,
  terrainSnapshot = null,
  reason = 'actor_drift',
  roadShellGap = false,
  buildingShellGap = false,
  forwardCorridorNeedsRoads = false
) {
  if (roadShellGap || buildingShellGap || forwardCorridorNeedsRoads) return false;
  const reasonText = String(reason || 'actor_drift');
  if (
    !continuousWorldInteractiveReasonIsRoutine(reasonText) &&
    !reasonText.startsWith('region_prefetch:')
  ) {
    return false;
  }
  const actor = actorState || continuousWorldInteractiveActorMotionState();
  const mode = String(actor?.mode || 'drive');
  const pendingSurfaceSyncRoads = Number(terrainSnapshot?.pendingSurfaceSyncRoads || 0);
  const rebuildInFlight = !!terrainSnapshot?.rebuildInFlight;
  const backlogThreshold =
    mode === 'walk' ? 36 :
    mode === 'boat' || mode === 'ocean' ? 42 :
    mode === 'drone' ? 56 :
    64;
  return rebuildInFlight || pendingSurfaceSyncRoads >= backlogThreshold;
}

function continuousWorldInteractiveReasonTargetRegionKey(reason = 'actor_drift') {
  const reasonText = String(reason || 'actor_drift');
  const match = reasonText.match(/^(?:forward_road_corridor|region_prefetch):[^:]+:(-?\d+:-?\d+)$/);
  return match?.[1] ? String(match[1]) : null;
}

function continuousWorldInteractiveReasonNeedsLocalShell(reason = 'actor_drift') {
  const reasonText = String(reason || 'actor_drift');
  return (
    reasonText === 'startup_local_shell' ||
    reasonText === 'road_recovery_shell' ||
    reasonText === 'actor_building_gap' ||
    reasonText.startsWith('building_continuity_')
  );
}

function continuousWorldInteractiveBackgroundFullLoadActive() {
  if (!_activeWorldLoad) return false;
  const stage = String(appCtx.worldBuildStage || '');
  return stage === 'playable_core_ready' || stage === 'partial_world_ready' || stage === 'full_world_ready';
}

function continuousWorldInteractiveStartupLockActive() {
  if (!_activeWorldLoad) return false;
  const stage = String(appCtx.worldBuildStage || '');
  return stage === 'playable_core_loading' || stage === 'playable_core_ready';
}

function continuousWorldInteractiveStartupLocalShellCovered(actorState = null) {
  const actor = actorState || continuousWorldInteractiveActorMotionState();
  if (!Number.isFinite(actor?.x) || !Number.isFinite(actor?.z)) return false;
  const cfg =
    ACTOR_BUILDING_SHELL_CONFIG[String(actor?.mode || 'drive')] ||
    ACTOR_BUILDING_SHELL_CONFIG.drive;
  const visibleRadius = Math.max(260, Number(cfg?.visibleRadius || 320));
  const visibleBuildings = countVisibleDetailedBuildingMeshesNearWorldPoint(actor.x, actor.z, visibleRadius);
  const visibleRoads = countVisibleRoadMeshesNearWorldPoint(actor.x, actor.z, Math.max(220, visibleRadius * 0.8));
  const roadFeatures = countDriveableRoadFeaturesNearWorldPoint(actor.x, actor.z, Math.max(240, visibleRadius));
  return (
    visibleBuildings >= Math.max(22, Number(cfg?.minVisibleBuildings || 18)) &&
    (
      visibleRoads >= Math.max(12, Number(cfg?.minVisibleRoads || 8)) ||
      roadFeatures >= Math.max(16, Number(cfg?.minRoadFeatures || 10))
    )
  );
}

function continuousWorldInteractiveActorMotionState() {
  if (appCtx.oceanMode?.active) {
    const ocean = typeof appCtx.getOceanModeDebugState === 'function' ? appCtx.getOceanModeDebugState() : null;
    return {
      mode: 'ocean',
      x: Number(ocean?.position?.x || 0),
      z: Number(ocean?.position?.z || 0),
      yaw: Number(ocean?.yaw || 0),
      speed: Math.abs(Number(ocean?.speed || 0))
    };
  }
  if (appCtx.boatMode?.active) {
    return {
      mode: 'boat',
      x: Number(appCtx.boat?.x || 0),
      z: Number(appCtx.boat?.z || 0),
      yaw: Number(appCtx.boat?.angle || 0),
      speed: Math.abs(Number(appCtx.boat?.speed || 0))
    };
  }
  if (appCtx.droneMode) {
    return {
      mode: 'drone',
      x: Number(appCtx.drone?.x || 0),
      z: Number(appCtx.drone?.z || 0),
      yaw: Number(appCtx.drone?.yaw || 0),
      speed: Math.abs(Number(appCtx.drone?.speed || 0))
    };
  }
  if (appCtx.Walk?.state?.mode === 'walk' && appCtx.Walk?.state?.walker) {
    return {
      mode: 'walk',
      x: Number(appCtx.Walk.state.walker.x || 0),
      z: Number(appCtx.Walk.state.walker.z || 0),
      yaw: Number(appCtx.Walk.state.walker.angle || appCtx.Walk.state.walker.yaw || 0),
      speed: Math.abs(Number(appCtx.Walk.state.walker.speedMph || 0))
    };
  }
  return {
    mode: 'drive',
    x: Number(appCtx.car?.x || 0),
    z: Number(appCtx.car?.z || 0),
    yaw: Number(appCtx.car?.angle || 0),
    speed: Math.abs(Number(appCtx.car?.speed || 0)),
    onRoad: !!appCtx.car?.onRoad
  };
}

function continuousWorldInteractiveActorMostlyIdle(actorState = null) {
  const actor = actorState || continuousWorldInteractiveActorMotionState();
  const mode = String(actor?.mode || 'drive');
  const speed = Math.abs(Number(actor?.speed || 0));
  if (mode === 'walk') return speed < 0.35;
  if (mode === 'drone') return speed < 1.5;
  if (mode === 'boat' || mode === 'ocean') return speed < 1.5;
  return speed < 1.2;
}

function continuousWorldInteractiveShouldDeferDriveBuildingShell(actorState = null, reason = 'actor_drift') {
  const actor = actorState || continuousWorldInteractiveActorMotionState();
  if (String(actor?.mode || 'drive') !== 'drive') return false;
  if (actor?.onRoad === false) return false;
  const speed = Math.abs(Number(actor?.speed || 0));
  if (speed < 8) return false;
  const actorX = Number(actor?.x);
  const actorZ = Number(actor?.z);
  if (
    Number.isFinite(actorX) &&
    Number.isFinite(actorZ) &&
    recentExplicitTeleportTargetState(actorX, actorZ, { radius: 260 }).active
  ) {
    return false;
  }
  const reasonText = String(reason || 'actor_drift');
  if (reasonText === 'actor_visible_road_gap' || reasonText === 'road_recovery_shell') return false;
  return true;
}

function continuousWorldInteractiveDesiredLoadLevel(actorState = null, reason = 'actor_drift') {
  const actor = actorState || continuousWorldInteractiveActorMotionState();
  const mode = String(actor?.mode || 'drive');
  const speed = Math.abs(Number(actor?.speed || 0));
  const reasonText = String(reason || 'actor_drift');
  const forwardRoadCorridorPrefetch = continuousWorldInteractiveReasonIsForwardRoadCorridor(reasonText);
  const explicitTeleportContinuity =
    mode === 'drive' &&
    recentExplicitTeleportTargetState(actor?.x, actor?.z, { radius: 260 }).active;
  const actorPrimaryReason =
    reasonText === 'main_loop' ||
    reasonText === 'actor_drift' ||
    reasonText.startsWith('building_continuity_');
  const backgroundFullLoadActive = continuousWorldInteractiveBackgroundFullLoadActive();
  const roadShellGap = continuousWorldInteractiveNeedsRoadShellRecovery(actor);
  const actorNearbyRoadFeatures =
    Number.isFinite(actor?.x) && Number.isFinite(actor?.z) ?
      countDriveableRoadFeaturesNearWorldPoint(actor.x, actor.z, Math.max(240, speed >= 8 ? 360 : 280)) :
      0;
  const lowVisibleRoadState =
    mode === 'drive' &&
    countVisibleRoadMeshesNearWorldPoint(actor?.x, actor?.z, speed >= 8 ? 320 : 240) <
      (PLAYABLE_CORE_RESIDENCY_CONFIG.minVisibleRoadMeshesReady?.drive || 12);
  const buildingShellGap = continuousWorldInteractiveNeedsBuildingShellRecovery(actor);
  const deferDriveBuildingShell = continuousWorldInteractiveShouldDeferDriveBuildingShell(actor, reasonText);
  const actorMostlyIdle = continuousWorldInteractiveActorMostlyIdle(actor);
  const fastDriveRoadPriority =
    mode === 'drive' &&
    actor?.onRoad !== false &&
    speed >= 6 &&
    !roadShellGap &&
    !buildingShellGap &&
    !lowVisibleRoadState;
  const nearPrefetch = reasonText.startsWith('region_prefetch:near');
  const midPrefetch = reasonText.startsWith('region_prefetch:mid');
  const farPrefetch = reasonText.startsWith('region_prefetch:far');
  const activeMovementMainLoop =
    !actorMostlyIdle &&
    (
      reasonText === 'main_loop' ||
      reasonText === 'actor_drift'
    );

  if (backgroundFullLoadActive) {
    if (activeMovementMainLoop) {
      if (mode === 'drive') return 'roads_only';
      if (mode === 'drone') return 'reduced';
      if (mode === 'boat' || mode === 'ocean') return 'roads_only';
      if (mode === 'walk') return 'reduced';
    }
    if (forwardRoadCorridorPrefetch) return 'roads_only';
    if (nearPrefetch) {
      if (mode === 'walk') return 'full';
      if (mode === 'drone') return 'reduced';
      if (mode === 'drive') return 'roads_only';
      return 'roads_only';
    }
    if (midPrefetch) {
      if (mode === 'drone') return 'reduced';
      if (mode === 'drive') return 'reduced';
      if (mode === 'walk') return 'reduced';
      return 'roads_only';
    }
    if (farPrefetch) {
      if (mode === 'drone') return 'reduced';
      return 'roads_only';
    }
    if (reasonText === 'startup_local_shell') return 'reduced';
    if (reasonText === 'road_recovery_shell') {
      if (mode === 'drive') return 'roads_only';
      return 'reduced';
    }
    if (reasonText === 'actor_visible_road_gap') {
      if (mode === 'drive' && explicitTeleportContinuity) return 'full';
      if (mode === 'drive') return 'roads_only';
      return mode === 'walk' ? 'full' : 'reduced';
    }
    if (reasonText.startsWith('building_continuity_') && mode === 'drive' && explicitTeleportContinuity) return 'full';
    if (reasonText === 'actor_building_gap') {
      if (mode === 'drive' && deferDriveBuildingShell) return 'roads_only';
      return mode === 'walk' ? 'full' : 'reduced';
    }
    if (mode === 'walk') return 'full';
    if (mode === 'drone') return 'reduced';
    if (fastDriveRoadPriority && actorPrimaryReason) return 'roads_only';
    if (mode === 'drive' && actor?.onRoad === false && lowVisibleRoadState && !roadShellGap && !buildingShellGap) return 'roads_only';
    if (roadShellGap) return 'reduced';
    if (mode === 'drive' && buildingShellGap && deferDriveBuildingShell) return 'roads_only';
    if (buildingShellGap) return 'reduced';
    return 'reduced';
  }

  if (activeMovementMainLoop) {
    if (mode === 'drive') return 'roads_only';
    if (mode === 'drone') return 'reduced';
    if (mode === 'boat' || mode === 'ocean') return 'roads_only';
    if (mode === 'walk') return 'reduced';
  }
  if (mode === 'boat' || mode === 'ocean') return speed >= 4 ? 'roads_only' : 'reduced';
  if (forwardRoadCorridorPrefetch) return 'roads_only';
  if (reasonText === 'actor_visible_road_gap') {
    if (mode === 'drive' && explicitTeleportContinuity) return 'full';
    if (mode === 'drive') return 'roads_only';
    return mode === 'walk' ? 'full' : 'reduced';
  }
  if (reasonText.startsWith('building_continuity_') && mode === 'drive' && explicitTeleportContinuity) return 'full';
  if (reasonText === 'actor_building_gap') {
    if (mode === 'drive' && deferDriveBuildingShell) return 'roads_only';
    return mode === 'walk' ? 'full' : 'reduced';
  }
  if (mode === 'drone') return 'reduced';
  if (mode === 'walk') return 'full';
  if (reasonText === 'road_recovery_shell') {
    if (mode === 'drive') return 'roads_only';
    return 'reduced';
  }
  if (nearPrefetch) {
    if (mode === 'walk') return 'full';
    if (mode === 'drone') return 'reduced';
    if (mode === 'drive') return 'roads_only';
    return 'roads_only';
  }
  if (midPrefetch) {
    if (mode === 'drone') return 'reduced';
    if (mode === 'drive') return 'reduced';
    if (mode === 'walk') return 'reduced';
    return 'roads_only';
  }
  if (farPrefetch) {
    if (mode === 'drone') return 'reduced';
    return 'roads_only';
  }
  if (reasonText.startsWith('region_prefetch:')) return 'roads_only';
  if (mode === 'drive' && actorPrimaryReason) return fastDriveRoadPriority ? 'roads_only' : 'reduced';
  if (mode === 'drive' && actor?.onRoad === false && !roadShellGap && !buildingShellGap) return 'roads_only';
  if (mode === 'drive' && buildingShellGap && deferDriveBuildingShell) return 'roads_only';
  if (mode === 'drive' && lowVisibleRoadState && !roadShellGap && !buildingShellGap) return 'reduced';
  if (mode === 'drive') return 'reduced';
  return 'full';
}

function waterFeatureBounds(feature = null) {
  if (!feature) return null;
  if (feature.bounds) return feature.bounds;
  if (Array.isArray(feature.pts) && feature.pts.length >= 2) {
    if (feature.type === 'waterway' || Number.isFinite(feature.width)) {
      const width = Math.max(6, Number(feature.width) || 8);
      feature.bounds = polylineBounds(feature.pts, width * 0.5 + 18);
    } else {
      feature.bounds = polygonBoundsXZ(feature.pts);
    }
  }
  return feature.bounds || null;
}

function boundsDistanceSqToWorldPoint(bounds, x, z) {
  if (!bounds || !Number.isFinite(x) || !Number.isFinite(z)) return Infinity;
  const dx =
    x < bounds.minX ? bounds.minX - x :
    x > bounds.maxX ? x - bounds.maxX :
      0;
  const dz =
    z < bounds.minZ ? bounds.minZ - z :
    z > bounds.maxZ ? z - bounds.maxZ :
      0;
  return dx * dx + dz * dz;
}

function hasWaterFeaturesNearWorldPoint(x, z, radius = 260) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  const paddedRadiusSq = Math.max(0, Number(radius) || 0) ** 2;
  const areas = Array.isArray(appCtx.waterAreas) ? appCtx.waterAreas : [];
  for (let i = 0; i < areas.length; i++) {
    const bounds = waterFeatureBounds(areas[i]);
    if (boundsDistanceSqToWorldPoint(bounds, x, z) <= paddedRadiusSq) return true;
  }
  const waterways = Array.isArray(appCtx.waterways) ? appCtx.waterways : [];
  for (let i = 0; i < waterways.length; i++) {
    const bounds = waterFeatureBounds(waterways[i]);
    if (boundsDistanceSqToWorldPoint(bounds, x, z) <= paddedRadiusSq) return true;
  }
  return false;
}

function continuousWorldInteractiveWaterRelevant(actorState = null, reason = 'actor_drift') {
  const actor = actorState || continuousWorldInteractiveActorMotionState();
  const mode = String(actor?.mode || 'drive');
  if (mode === 'boat' || mode === 'ocean' || appCtx.boatMode?.active === true || appCtx.oceanMode?.active === true) {
    return true;
  }

  const waterSignals = appCtx.worldSurfaceProfile?.signals?.normalized || {};
  const likelyWaterByProfile =
    Number(waterSignals.water || 0) >= 0.06 ||
    Number(waterSignals.explicitBlue || 0) >= 0.045;

  const searchRadius =
    mode === 'drone' ? 540 :
    mode === 'walk' ? 240 :
    360;
  const nearbyLoadedWater =
    Number.isFinite(actor?.x) &&
    Number.isFinite(actor?.z) &&
    hasWaterFeaturesNearWorldPoint(actor.x, actor.z, searchRadius);

  if (nearbyLoadedWater) return true;
  if (!likelyWaterByProfile) return false;

  const reasonText = String(reason || '');
  return (
    reasonText === 'startup_local_shell' ||
    reasonText.startsWith('region_prefetch:near') ||
    reasonText.startsWith('building_continuity_') ||
    reasonText === 'actor_building_gap'
  );
}

function continuousWorldInteractiveContentPlan(actorState = null, chunkPlan = null, reason = 'actor_drift') {
  const actor = actorState || continuousWorldInteractiveActorMotionState();
  const plan = chunkPlan || continuousWorldInteractiveChunkPlan();
  const reasonText = String(reason || 'actor_drift');
  const forwardRoadCorridorPrefetch = continuousWorldInteractiveReasonIsForwardRoadCorridor(reasonText);
  const startupLocalShell = reasonText === 'startup_local_shell';
  const roadShellRecovery = reasonText === 'actor_visible_road_gap';
  const buildingGapRecovery = reasonText === 'actor_building_gap';
  const localShellPriority = continuousWorldInteractiveReasonNeedsLocalShell(reasonText);
  const buildingContinuityRecovery = reasonText.startsWith('building_continuity_');
  const loadLevel = continuousWorldInteractiveDesiredLoadLevel(actor, reason);
  const rank = continuousWorldInteractiveLoadLevelRank(loadLevel);
  const reduced = rank <= CONTINUOUS_WORLD_INTERACTIVE_LOAD_LEVELS.reduced;
  const roadsOnly = rank <= CONTINUOUS_WORLD_INTERACTIVE_LOAD_LEVELS.roads_only;
  const actorMode = String(actor?.mode || 'drive');
  const isWaterTravel = actorMode === 'boat' || actorMode === 'ocean';
  const waterRelevant = continuousWorldInteractiveWaterRelevant(actor, reasonText);
  const landuseRelevant = isWaterTravel || appCtx.landUseVisible === true || waterRelevant;
  const waterwayRelevant = isWaterTravel || waterRelevant;
  const driveRoadsOnly = roadsOnly && actorMode === 'drive';
  const strictDriveRoadsOnly = driveRoadsOnly && !isWaterTravel;
  const corridorRoadPriority = forwardRoadCorridorPrefetch && actorMode === 'drive';
  const aggressiveRoadRecovery = driveRoadsOnly && actor?.onRoad === false;
  const roadRecoveryMode =
    driveRoadsOnly &&
    !startupLocalShell &&
    (aggressiveRoadRecovery || reasonText === 'actor_drift' || reasonText === 'main_loop');
  const includeLandmarkBuildings = driveRoadsOnly && !roadRecoveryMode;
  const featureRadius = Number(plan?.featureRadius || 0);
  const waterFeatureRadius =
    strictDriveRoadsOnly ?
      0 :
    waterwayRelevant ?
      isWaterTravel ?
        clampNumber(featureRadius * (roadsOnly ? 0.72 : 0.82), 0.006, featureRadius, featureRadius) :
        featureRadius :
      0;
  const buildingRadius =
    strictDriveRoadsOnly || corridorRoadPriority ?
      0 :
    startupLocalShell ?
      clampNumber(featureRadius * 0.24, 0.0042, featureRadius, featureRadius) :
    buildingContinuityRecovery ?
      clampNumber(featureRadius * (actorMode === 'drone' ? 0.84 : actorMode === 'walk' ? 0.8 : 0.78), 0.0072, featureRadius, featureRadius) :
    roadShellRecovery ?
      clampNumber(featureRadius * (actorMode === 'drone' ? 0.56 : actorMode === 'walk' ? 0.62 : 0.48), 0.0058, featureRadius, featureRadius) :
    buildingGapRecovery ?
      clampNumber(featureRadius * (actorMode === 'drone' ? 0.8 : actorMode === 'walk' ? 0.76 : 0.74), 0.0068, featureRadius, featureRadius) :
    aggressiveRoadRecovery ?
      clampNumber(featureRadius * 0.1, 0.0032, featureRadius, featureRadius) :
    driveRoadsOnly ?
      clampNumber(featureRadius * 0.14, 0.0038, featureRadius, featureRadius) :
    roadsOnly ?
      clampNumber(featureRadius * 0.26, 0.0045, featureRadius, featureRadius) :
    reduced ?
      clampNumber(featureRadius * ((actorMode === 'drive' || actorMode === 'drone') ? 0.58 : 0.48), 0.0055, featureRadius, featureRadius) :
      featureRadius;
  const landuseRadius =
    strictDriveRoadsOnly || !landuseRelevant ?
      0 :
    corridorRoadPriority ?
      0 :
    startupLocalShell ?
      clampNumber(featureRadius * 0.22, 0.0048, featureRadius, featureRadius) :
    buildingContinuityRecovery ?
      clampNumber(featureRadius * 0.62, 0.0058, featureRadius, featureRadius) :
    roadShellRecovery ?
      clampNumber(featureRadius * 0.34, 0.005, featureRadius, featureRadius) :
    buildingGapRecovery ?
      clampNumber(featureRadius * 0.52, 0.0052, featureRadius, featureRadius) :
    roadsOnly && !isWaterTravel ?
      0 :
    reduced ?
      clampNumber(featureRadius * 0.56, 0.0055, featureRadius, featureRadius) :
      featureRadius;
  return {
    loadLevel,
    roadsOnly,
    reduced,
    includeBuildings:
      strictDriveRoadsOnly || corridorRoadPriority ?
        false :
        (!roadsOnly || isWaterTravel || (driveRoadsOnly && !roadRecoveryMode)),
    includeLandmarkBuildings:
      strictDriveRoadsOnly || corridorRoadPriority ?
        false :
        includeLandmarkBuildings,
    includeBuildingParts: !reduced && !roadsOnly,
    includeLanduse:
      strictDriveRoadsOnly || corridorRoadPriority ?
        false :
        (landuseRelevant && (!roadsOnly || isWaterTravel)),
    includeWaterways:
      strictDriveRoadsOnly || corridorRoadPriority ?
        false :
        (waterwayRelevant && (!roadsOnly || isWaterTravel)),
    buildingRadius,
    landuseRadius,
    waterFeatureRadius,
    maxRoadWays:
      corridorRoadPriority ?
        Math.max(720, Math.floor(Number(plan?.maxRoadWays || 0) * 0.82)) :
        Number(plan?.maxRoadWays || 0),
    maxBuildingWays:
      strictDriveRoadsOnly || corridorRoadPriority ?
        0 :
      startupLocalShell ?
        Math.max(180, Math.floor(Number(plan?.maxBuildingWays || 0) * 0.16)) :
      buildingContinuityRecovery ?
        Math.max(actorMode === 'drone' ? 320 : 520, Math.floor(Number(plan?.maxBuildingWays || 0) * 0.78)) :
      roadShellRecovery ?
        Math.max(actorMode === 'drone' ? 140 : 220, Math.floor(Number(plan?.maxBuildingWays || 0) * 0.3)) :
      buildingGapRecovery ?
        Math.max(actorMode === 'drone' ? 280 : 420, Math.floor(Number(plan?.maxBuildingWays || 0) * 0.62)) :
      aggressiveRoadRecovery ?
        Math.max(18, Math.floor(Number(plan?.maxBuildingWays || 0) * 0.03)) :
      driveRoadsOnly ?
        Math.max(56, Math.floor(Number(plan?.maxBuildingWays || 0) * 0.06)) :
      roadsOnly ?
        (isWaterTravel ? Math.max(120, Math.floor(Number(plan?.maxBuildingWays || 0) * 0.12)) : 0) :
      reduced ?
        Math.max(actorMode === 'drive' || actorMode === 'drone' ? 240 : 180, Math.floor(Number(plan?.maxBuildingWays || 0) * 0.42)) :
        Number(plan?.maxBuildingWays || 0),
    maxLanduseWays:
      strictDriveRoadsOnly || !landuseRelevant || corridorRoadPriority ?
        0 :
      startupLocalShell ?
        Math.max(48, Math.floor(Number(plan?.maxLanduseWays || 0) * 0.18)) :
      localShellPriority && !isWaterTravel ?
        Math.max(120, Math.floor(Number(plan?.maxLanduseWays || 0) * 0.52)) :
      roadsOnly && !isWaterTravel ? 0 :
      reduced ?
        Math.max(80, Math.floor(Number(plan?.maxLanduseWays || 0) * 0.45)) :
        Number(plan?.maxLanduseWays || 0),
    maxWaterwayWays:
      strictDriveRoadsOnly || !waterwayRelevant || corridorRoadPriority ?
        0 :
      roadsOnly && !isWaterTravel ? 0 :
      reduced ?
        Math.max(24, Math.floor(Number(plan?.maxWaterwayWays || 0) * 0.6)) :
        Number(plan?.maxWaterwayWays || 0)
  };
}

function continuousWorldInteractiveStreamIntervalMs(actorState = null) {
  const actor = actorState || continuousWorldInteractiveActorMotionState();
  if (!actor) return CONTINUOUS_WORLD_INTERACTIVE_STREAM_MIN_INTERVAL_MS;
  if (continuousWorldInteractiveBackgroundFullLoadActive()) {
    if (actor.mode === 'drive' && actor?.onRoad === false) return 120;
    if (actor.mode === 'drive') return 150;
    if (actor.mode === 'walk') return 420;
    if (actor.mode === 'drone') return 240;
    if (actor.mode === 'boat' || actor.mode === 'ocean') return 320;
  }
  const speed = Math.abs(Number(actor.speed || 0));
  if (actor.mode === 'drive' && actor?.onRoad === false) return 150;
  if (actor.mode === 'drive' && speed >= 18) return 180;
  if (actor.mode === 'drive' && speed >= 8) return 210;
  if (actor.mode === 'drive' && speed >= 4) return 240;
  if ((actor.mode === 'boat' || actor.mode === 'ocean') && speed >= 5) return 420;
  if (actor.mode === 'drone' && speed >= 8) return 320;
  if (actor.mode === 'walk' && speed >= 4) return 800;
  return CONTINUOUS_WORLD_INTERACTIVE_STREAM_MIN_INTERVAL_MS;
}

function continuousWorldInteractiveSurfaceSyncPolicy(actorState = null, regionKey = null, runtimeSnapshot = null, reason = 'actor_drift') {
  const actor = actorState || continuousWorldInteractiveActorMotionState();
  const mode = String(actor?.mode || 'drive');
  const reasonText = String(reason || 'actor_drift');
  const nearKeys = new Set(
    Array.isArray(runtimeSnapshot?.activeRegionRings?.near) ?
      runtimeSnapshot.activeRegionRings.near
        .map((cell) => String(cell?.key || '').trim())
        .filter(Boolean) :
      []
  );
  const activeKeys = new Set(
    Array.isArray(runtimeSnapshot?.regionManager?.activeKeys) ?
      runtimeSnapshot.regionManager.activeKeys
        .map((key) => String(key || '').trim())
        .filter(Boolean) :
      []
  );
  const nearActorRegion = !!regionKey && (nearKeys.has(regionKey) || activeKeys.has(regionKey));
  const roadGapReason =
    reasonText === 'actor_visible_road_gap' ||
    reasonText === 'road_recovery_shell';
  const buildingGapReason =
    reasonText === 'actor_building_gap' ||
    reasonText.startsWith('building_continuity_');
  const prefetchReason =
    reasonText.startsWith('region_prefetch:near') ||
    reasonText.startsWith('region_prefetch:mid');
  const generalActorReason =
    reasonText === 'actor_drift' ||
    reasonText === 'main_loop';
  const actorDrivenReason =
    generalActorReason ||
    roadGapReason ||
    buildingGapReason ||
    prefetchReason;
  const visibleRoads =
    mode === 'drive' && Number.isFinite(actor?.x) && Number.isFinite(actor?.z) &&
    typeof countVisibleRoadMeshesNearWorldPoint === 'function' ?
      Number(countVisibleRoadMeshesNearWorldPoint(actor.x, actor.z, 280)) || 0 :
      Infinity;
  const roadFeatures =
    mode === 'drive' && Number.isFinite(actor?.x) && Number.isFinite(actor?.z) &&
    typeof countDriveableRoadFeaturesNearWorldPoint === 'function' ?
      Number(countDriveableRoadFeaturesNearWorldPoint(actor.x, actor.z, 300)) || 0 :
      Infinity;
  const localRoadGap =
    mode === 'drive' &&
    (
      visibleRoads < 18 ||
      (visibleRoads < 24 && roadFeatures < 120)
    );
  const severeLocalRoadGap =
    mode === 'drive' &&
    (
      visibleRoads < 12 ||
      (visibleRoads < 16 && roadFeatures < 80)
    );

  if (mode === 'drone') {
    return { request: false, force: false, policy: 'drone_skip_surface_sync', source: 'continuous_world_stream_followup' };
  }
  if (mode === 'boat' || mode === 'ocean') {
    return { request: false, force: false, policy: `${mode}_skip_surface_sync`, source: 'continuous_world_stream_followup' };
  }
  if (mode === 'walk') {
    return {
      request: nearActorRegion || actorDrivenReason,
      force: false,
      policy: nearActorRegion || actorDrivenReason ? 'walk_deferred_surface_sync' : 'walk_skip_surface_sync',
      source: 'continuous_world_stream_followup'
    };
  }
  if (mode === 'drive' && actor?.onRoad === false && actorDrivenReason) {
    return {
      request: true,
      force: true,
      policy: 'drive_offroad_forced_surface_sync',
      source: 'continuous_world_stream_recovery'
    };
  }
  if (nearActorRegion && (roadGapReason || (generalActorReason && severeLocalRoadGap))) {
    return {
      request: true,
      force: true,
      policy: 'drive_forced_surface_sync',
      source: 'continuous_world_stream_recovery'
    };
  }
  if (nearActorRegion || actorDrivenReason) {
    return {
      request: true,
      force: false,
      policy: 'drive_deferred_surface_sync',
      source: 'continuous_world_stream_followup'
    };
  }
  return {
    request: false,
    force: false,
    policy: 'drive_prefetch_skip_surface_sync',
    source: 'continuous_world_stream_followup'
  };
}

function continuousWorldInteractiveSelectPrefetchTarget(actorGeo = null, runtimeSnapshot = null, actorState = null) {
  const snapshot = runtimeSnapshot || appCtx.getContinuousWorldRuntimeSnapshot?.();
  if (!snapshot?.activeRegionRings) return null;
  const coveredKeys = continuousWorldInteractiveCoverageRegionKeys(snapshot);
  const actor = actorState || continuousWorldInteractiveActorMotionState();
  const actorX = Number(actor?.x);
  const actorZ = Number(actor?.z);
  const actorSpeed = Math.abs(Number(actor?.speed || 0));
  const headingX = Number.isFinite(actor?.yaw) ? Math.sin(actor.yaw) : 0;
  const headingZ = Number.isFinite(actor?.yaw) ? Math.cos(actor.yaw) : 0;
  const useHeadingBias = actorSpeed >= (actor?.mode === 'walk' ? 3 : 6) && (Math.abs(headingX) + Math.abs(headingZ)) > 0.2;
  const driveLookahead = actor?.mode === 'drive' && actorSpeed >= 6;
  const forwardCorridor = continuousWorldForwardRoadCorridorState(actor, snapshot);
  const forwardCorridorKeys = new Set(Array.isArray(forwardCorridor?.regionKeys) ? forwardCorridor.regionKeys : []);
  const candidates = [];
  const addBand = (band, cells, priority) => {
    (Array.isArray(cells) ? cells : []).forEach((cell) => {
      const center = continuousWorldInteractiveRegionCellCenter(cell, snapshot);
      if (!center?.key || coveredKeys.has(center.key)) return;
      const centerWorld = geoPointToWorld(center.lat, center.lon);
      const dx = Number(centerWorld?.x) - actorX;
      const dz = Number(centerWorld?.z) - actorZ;
      const vectorLength = Math.hypot(dx, dz);
      const headingAlignment =
        useHeadingBias && vectorLength > 1 ?
          ((dx / vectorLength) * headingX + (dz / vectorLength) * headingZ) :
          0;
      const inForwardCorridor = forwardCorridorKeys.has(center.key);
      const corridorRoadPriority =
        actor?.mode === 'drive' &&
        actorSpeed >= 4 &&
        inForwardCorridor &&
        (band === 'mid' || band === 'far');
      const adjustedPriority =
        corridorRoadPriority && band === 'far' ? priority - 3 :
        corridorRoadPriority && band === 'mid' ? priority - 2 :
        driveLookahead && band === 'far' && inForwardCorridor ? priority - 2 :
        driveLookahead && band === 'mid' && inForwardCorridor ? priority - 1 :
        driveLookahead && band === 'near' && !inForwardCorridor ? priority + 2 :
        priority;
      candidates.push({
        ...center,
        band,
        priority: adjustedPriority,
        corridorRoadPriority,
        inForwardCorridor,
        headingAlignment,
        distance: actorGeo ?
          continuousWorldGeoDistanceWorldUnits(actorGeo.lat, actorGeo.lon, center.lat, center.lon) :
          Infinity
      });
    });
  };
  addBand('near', snapshot.activeRegionRings.near, 0);
  addBand('mid', snapshot.activeRegionRings.mid, 1);
  if ((actor?.mode === 'drive' && actorSpeed >= 8) || actor?.mode === 'drone') {
    addBand('far', snapshot.activeRegionRings.far, 2);
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.corridorRoadPriority !== b.corridorRoadPriority) return a.corridorRoadPriority ? -1 : 1;
    if (a.inForwardCorridor !== b.inForwardCorridor) return a.inForwardCorridor ? -1 : 1;
    if (useHeadingBias && Math.abs(a.headingAlignment - b.headingAlignment) > 0.08) {
      return b.headingAlignment - a.headingAlignment;
    }
    return a.distance - b.distance;
  });
  const target = candidates[0];
  return {
    ...target,
    loadReason:
      target.corridorRoadPriority ?
        `forward_road_corridor:${target.band}:${target.key}` :
        `region_prefetch:${target.band}:${target.key}`
  };
}

function getContinuousWorldInteractiveStreamSnapshot() {
  const runtimeSnapshot = appCtx.getContinuousWorldRuntimeSnapshot?.();
  const coveredRegionKeys = Array.from(continuousWorldInteractiveCoverageRegionKeys(runtimeSnapshot));
  return {
    enabled: !!_continuousWorldInteractiveStreamState.enabled,
    autoKickEnabled: !!_continuousWorldInteractiveStreamState.autoKickEnabled,
    seeded: _continuousWorldInteractiveStreamState.coverage.length > 0,
    pending: !!_continuousWorldInteractiveStreamState.pending,
    pendingStartedAt: _continuousWorldInteractiveStreamState.pendingStartedAt || 0,
    pendingQueryLat: Number.isFinite(_continuousWorldInteractiveStreamState.pendingQueryLat) ? _continuousWorldInteractiveStreamState.pendingQueryLat : null,
    pendingQueryLon: Number.isFinite(_continuousWorldInteractiveStreamState.pendingQueryLon) ? _continuousWorldInteractiveStreamState.pendingQueryLon : null,
    pendingRegionKey: _continuousWorldInteractiveStreamState.pendingRegionKey || null,
    pendingAgeMs:
      _continuousWorldInteractiveStreamState.pending && Number(_continuousWorldInteractiveStreamState.pendingStartedAt) > 0 ?
        Math.max(0, Math.round(Date.now() - Number(_continuousWorldInteractiveStreamState.pendingStartedAt))) :
        0,
    lastKickAt: _continuousWorldInteractiveStreamState.lastKickAt || 0,
    lastLoadAt: _continuousWorldInteractiveStreamState.lastLoadAt || 0,
    lastLoadReason: _continuousWorldInteractiveStreamState.lastLoadReason || null,
    lastError: _continuousWorldInteractiveStreamState.lastError || null,
    coverageCount: _continuousWorldInteractiveStreamState.coverage.length,
    totalLoads: _continuousWorldInteractiveStreamState.totalLoads,
    totalAddedRoads: _continuousWorldInteractiveStreamState.totalAddedRoads,
    totalAddedBuildings: _continuousWorldInteractiveStreamState.totalAddedBuildings,
    totalAddedLanduseMeshes: _continuousWorldInteractiveStreamState.totalAddedLanduseMeshes,
    totalAddedWaterAreas: _continuousWorldInteractiveStreamState.totalAddedWaterAreas,
    totalAddedWaterways: _continuousWorldInteractiveStreamState.totalAddedWaterways,
    forcedSurfaceSyncLoads: _continuousWorldInteractiveStreamState.forcedSurfaceSyncLoads,
    deferredSurfaceSyncLoads: _continuousWorldInteractiveStreamState.deferredSurfaceSyncLoads,
    skippedSurfaceSyncLoads: _continuousWorldInteractiveStreamState.skippedSurfaceSyncLoads,
    lastSurfaceSyncPolicy: _continuousWorldInteractiveStreamState.lastSurfaceSyncPolicy || null,
    activeInteractiveRoads: _continuousWorldInteractiveStreamState.activeInteractiveRoads || 0,
    activeInteractiveBuildings: _continuousWorldInteractiveStreamState.activeInteractiveBuildings || 0,
    activeInteractiveLanduse: _continuousWorldInteractiveStreamState.activeInteractiveLanduse || 0,
    activeInteractiveWaterways: _continuousWorldInteractiveStreamState.activeInteractiveWaterways || 0,
    evictedRoads: _continuousWorldInteractiveStreamState.evictedRoads || 0,
    evictedBuildings: _continuousWorldInteractiveStreamState.evictedBuildings || 0,
    evictedLanduse: _continuousWorldInteractiveStreamState.evictedLanduse || 0,
    evictedWaterways: _continuousWorldInteractiveStreamState.evictedWaterways || 0,
    evictedMeshes: _continuousWorldInteractiveStreamState.evictedMeshes || 0,
    coveredRegionCount: coveredRegionKeys.length,
    coveredRegionKeys: coveredRegionKeys.slice(0, 8),
    coverage: _continuousWorldInteractiveStreamState.coverage.slice(-4).map((entry) => ({
      key: entry.key,
      regionKey: entry.regionKey || null,
      lat: Number(entry.lat.toFixed(6)),
      lon: Number(entry.lon.toFixed(6)),
      roadRadius: Number(entry.roadRadius.toFixed(5)),
      featureRadius: Number(entry.featureRadius.toFixed(5)),
      loadLevel: entry.loadLevel || 'full',
      addedRoads: entry.addedRoads,
      addedBuildings: entry.addedBuildings,
      addedLanduseMeshes: entry.addedLanduseMeshes || 0,
      addedWaterAreas: entry.addedWaterAreas || 0,
      addedWaterways: entry.addedWaterways || 0,
      reason: entry.reason,
      at: entry.at
    }))
  };
}

function scheduleContinuousWorldInteractiveRecoveryShell(delayMs = 220) {
  if (_continuousWorldInteractiveStreamState.recoveryShellTimerId) {
    clearTimeout(_continuousWorldInteractiveStreamState.recoveryShellTimerId);
    _continuousWorldInteractiveStreamState.recoveryShellTimerId = null;
  }
  _continuousWorldInteractiveStreamState.recoveryShellTimerId = window.setTimeout(() => {
    _continuousWorldInteractiveStreamState.recoveryShellTimerId = null;
    if (!continuousWorldInteractiveCanStream()) return;
    kickContinuousWorldInteractiveStreaming('road_recovery_shell');
  }, Math.max(80, Number(delayMs) || 0));
}

async function attemptContinuousWorldActorAreaSoftRecovery(geo, mode = 'drive', targetX = NaN, targetZ = NaN, source = 'soft_recovery') {
  if (
    !Number.isFinite(geo?.lat) ||
    !Number.isFinite(geo?.lon) ||
    typeof loadContinuousWorldInteractiveChunk !== 'function'
  ) {
    return { recovered: false, reason: 'interactive_loader_unavailable' };
  }

  const roadRadius = mode === 'drone' ? 420 : mode === 'walk' ? 220 : 320;
  const buildingRadius = mode === 'drone' ? 560 : mode === 'walk' ? 260 : 360;
  const featureRadius = mode === 'drone' ? 520 : mode === 'walk' ? 240 : 360;
  const buildingReason =
    mode === 'drive' ? 'building_continuity_drive' :
    mode === 'walk' ? 'building_continuity_walk' :
    mode === 'drone' ? 'building_continuity_drone' :
    'actor_building_gap';
  const countShell = () => ({
    visibleRoads: countVisibleRoadMeshesNearWorldPoint(targetX, targetZ, roadRadius),
    visibleBuildings: countVisibleBuildingMeshesNearWorldPoint(targetX, targetZ, buildingRadius),
    roadFeatures: countDriveableRoadFeaturesNearWorldPoint(targetX, targetZ, featureRadius)
  });

  let before = countShell();
  if (before.roadFeatures <= 0 || before.visibleRoads <= 0) {
    await loadContinuousWorldInteractiveChunk(geo.lat, geo.lon, 'actor_visible_road_gap');
    before = countShell();
  }
  if (
    (before.roadFeatures > 0 || before.visibleRoads > 0) &&
    before.visibleBuildings < (mode === 'drive' ? 14 : 10)
  ) {
    await loadContinuousWorldInteractiveChunk(geo.lat, geo.lon, buildingReason);
    before = countShell();
  }
  if (
    before.roadFeatures <= 0 &&
    before.visibleRoads <= 0 &&
    before.visibleBuildings <= 0
  ) {
    await loadContinuousWorldInteractiveChunk(geo.lat, geo.lon, buildingReason);
    before = countShell();
  }
  if (
    before.roadFeatures <= 0 &&
    before.visibleRoads <= 0 &&
    before.visibleBuildings <= 0
  ) {
    return { recovered: false, reason: `${source}_no_local_shell` };
  }

  return {
    recovered: true,
    reason: source,
    shell: before
  };
}

function scheduleContinuousWorldActorAreaHardRecovery(options = {}) {
  if (_continuousWorldInteractiveStreamState.hardRecoveryTimerId) {
    clearTimeout(_continuousWorldInteractiveStreamState.hardRecoveryTimerId);
    _continuousWorldInteractiveStreamState.hardRecoveryTimerId = null;
  }
  const delayMs = Math.max(600, Number(options.delayMs || 0) || 2200);
  _continuousWorldInteractiveStreamState.hardRecoveryTimerId = window.setTimeout(async () => {
    _continuousWorldInteractiveStreamState.hardRecoveryTimerId = null;
    if (_continuousWorldInteractiveStreamState.hardRecoveryInFlight) return;
    if (Date.now() - Number(_continuousWorldInteractiveStreamState.lastHardRecoveryAt || 0) < 15000) return;
    if (typeof appCtx.loadRoads !== 'function' || typeof appCtx.worldToLatLon !== 'function') return;

    const mode = String(options.mode || appCtx.getCurrentTravelMode?.() || 'drive');
    const actor = continuousWorldInteractiveActorMotionState();
    const targetX = finiteNumberOr(options.targetX, actor?.x);
    const targetZ = finiteNumberOr(options.targetZ, actor?.z);
    if (!Number.isFinite(targetX) || !Number.isFinite(targetZ)) return;

    const explicitTarget = recentExplicitTeleportTargetState(targetX, targetZ, { radius: 280 });
    if (!explicitTarget.active && mode === 'drive') return;

    const visibleRoads = countVisibleRoadMeshesNearWorldPoint(targetX, targetZ, mode === 'drone' ? 420 : mode === 'walk' ? 220 : 320);
    const visibleBuildings = countVisibleBuildingMeshesNearWorldPoint(targetX, targetZ, mode === 'drone' ? 560 : mode === 'walk' ? 260 : 360);
    const roadFeatures = countDriveableRoadFeaturesNearWorldPoint(targetX, targetZ, mode === 'drone' ? 520 : mode === 'walk' ? 240 : 360);
    if (visibleRoads > 0 || visibleBuildings > 0 || roadFeatures > 0) {
      if (explicitTarget.active) clearRecentExplicitTeleportTarget('teleport_shell_ready');
      return;
    }

    const geo = appCtx.worldToLatLon(targetX, targetZ);
    if (!Number.isFinite(geo?.lat) || !Number.isFinite(geo?.lon)) return;

    _continuousWorldInteractiveStreamState.hardRecoveryInFlight = true;
    _continuousWorldInteractiveStreamState.lastHardRecoveryAt = Date.now();
    _continuousWorldInteractiveStreamState.lastError = String(options.source || 'hard_recovery');

    try {
      if (_continuousWorldInteractiveStreamState.pending) {
        if (_continuousWorldInteractiveStreamState.abortController) {
          try {
            _continuousWorldInteractiveStreamState.abortController.abort();
          } catch {}
        }
        _continuousWorldInteractiveStreamState.pending = false;
        _continuousWorldInteractiveStreamState.pendingStartedAt = 0;
        _continuousWorldInteractiveStreamState.pendingQueryLat = NaN;
        _continuousWorldInteractiveStreamState.pendingQueryLon = NaN;
        _continuousWorldInteractiveStreamState.pendingRegionKey = null;
        _continuousWorldInteractiveStreamState.abortController = null;
        _continuousWorldInteractiveStreamState.activeRequestId =
          Number(_continuousWorldInteractiveStreamState.activeRequestId || 0) + 1;
      }
      const softRecovery = await attemptContinuousWorldActorAreaSoftRecovery(
        geo,
        mode,
        targetX,
        targetZ,
        options.source || 'hard_recovery_soft'
      );
      if (softRecovery?.recovered) {
        clearRecentExplicitTeleportTarget('teleport_soft_recovered');
        if (typeof appCtx.setTravelMode === 'function') {
          appCtx.setTravelMode(mode, { source: options.source || 'hard_recovery_soft', force: true, emitTutorial: false });
        }
        if (mode === 'drive') {
          const resolved = resolveSafeWorldSpawn(targetX, targetZ, {
            mode: 'drive',
            angle: finiteNumberOr(appCtx.car?.angle, 0),
            maxRoadDistance: 320,
            strictMaxDistance: true,
            preferVisibleShell: false,
            source: options.source || 'hard_recovery_soft'
          });
          if (resolved?.valid) {
            applyResolvedWorldSpawn(resolved, { mode: 'drive', syncCar: true, syncWalker: true });
          }
        } else if (mode === 'walk') {
          applySpawnTarget(targetX, targetZ, {
            mode: 'walk',
            strictMaxDistance: true,
            source: options.source || 'hard_recovery_soft'
          });
        } else if (mode === 'drone' && appCtx.drone) {
          appCtx.drone.x = targetX;
          appCtx.drone.z = targetZ;
          appCtx.drone.y = Math.max(Number(appCtx.drone.y || 0), 160);
        }
        _continuousWorldInteractiveStreamState.lastError = null;
        return;
      }
      clearRecentExplicitTeleportTarget('teleport_local_recovery_failed');
      _continuousWorldInteractiveStreamState.lastError = `${options.source || 'hard_recovery'}_local_shell_unavailable`;
      if (typeof appCtx.requestWorldSurfaceSync === 'function') {
        try {
          appCtx.requestWorldSurfaceSync({
            force: true,
            source: options.source || 'hard_recovery_local_only'
          });
        } catch {}
      }
      if (typeof appCtx.updateTerrainAround === 'function') {
        try {
          appCtx.updateTerrainAround(targetX, targetZ);
        } catch {}
      }
      scheduleContinuousWorldInteractiveRecoveryShell(120);
      return;
    } catch (error) {
      _continuousWorldInteractiveStreamState.lastError = `hard_recovery_failed:${error?.message || String(error)}`;
    } finally {
      _continuousWorldInteractiveStreamState.hardRecoveryInFlight = false;
    }
  }, delayMs);
}

function scheduleContinuousWorldInteractiveDriveRecovery(options = {}) {
  if (_continuousWorldInteractiveStreamState.recoveryTimerId) {
    clearTimeout(_continuousWorldInteractiveStreamState.recoveryTimerId);
    _continuousWorldInteractiveStreamState.recoveryTimerId = null;
  }
  const attemptsRemaining = Math.max(1, Number(options.attempts || 5));
  const delayMs = Math.max(120, Number(options.delayMs || 260));
  const shellAfterRecovery = options.shellAfterRecovery !== false;
  _continuousWorldInteractiveStreamState.recoveryTimerId = window.setTimeout(() => {
    _continuousWorldInteractiveStreamState.recoveryTimerId = null;
    const actorState = continuousWorldInteractiveActorMotionState();
    if (String(actorState?.mode || 'drive') !== 'drive') return;
    const actor = currentMapReferenceGeoPosition();
    const spawn = resolveSafeWorldSpawn(actor.x, actor.z, {
      mode: 'drive',
      angle: finiteNumberOr(appCtx.car?.angle, 0),
      preferredRoad: appCtx.car?.road || appCtx.car?._lastStableRoad || null,
      maxRoadDistance: Math.max(220, Number(options.maxRoadDistance || 0)),
      strictMaxDistance: true,
      source: options.source || 'continuous_world_stream_recovery'
    });
    const recoveredOnRoad = !!(spawn?.valid && spawn?.onRoad);
    if (recoveredOnRoad && !appCtx.car?.onRoad) {
      applyResolvedWorldSpawn(spawn, { mode: 'drive', syncCar: true, syncWalker: false });
    }
    if (recoveredOnRoad || appCtx.car?.onRoad) {
      if (shellAfterRecovery) scheduleContinuousWorldInteractiveRecoveryShell(140);
      return;
    }
    if (attemptsRemaining > 1) {
      scheduleContinuousWorldInteractiveDriveRecovery({
        attempts: attemptsRemaining - 1,
        delayMs: Math.min(520, delayMs + 80),
        shellAfterRecovery,
        maxRoadDistance: Math.max(220, Number(options.maxRoadDistance || 0)),
        source: options.source || 'continuous_world_stream_recovery'
      });
      return;
    }
    if (shellAfterRecovery) scheduleContinuousWorldInteractiveRecoveryShell(220);
  }, delayMs);
}

function updatePlayableCoreResidency(force = false, options = {}) {
  const actor = options.actorState || continuousWorldInteractiveActorMotionState();
  const mode = String(actor?.mode || 'drive');
  const actorX = Number(actor?.x || 0);
  const actorZ = Number(actor?.z || 0);
  const radius = playableCoreRadiusForMode(mode);
  const structureRadius = Math.round(radius * PLAYABLE_CORE_RESIDENCY_CONFIG.structureRadiusScale);
  const minRoadMeshesReady =
    Number(
      PLAYABLE_CORE_RESIDENCY_CONFIG.minRoadMeshesReady?.[mode] ??
      PLAYABLE_CORE_RESIDENCY_CONFIG.minRoadMeshesReady?.drive ??
      1
    ) || 1;
  const minVisibleRoadMeshesReady =
    Number(
      PLAYABLE_CORE_RESIDENCY_CONFIG.minVisibleRoadMeshesReady?.[mode] ??
      PLAYABLE_CORE_RESIDENCY_CONFIG.minVisibleRoadMeshesReady?.drive ??
      1
    ) || 1;
  const recenterThreshold = Math.max(
    PLAYABLE_CORE_RESIDENCY_CONFIG.minRecenterDistance,
    radius * PLAYABLE_CORE_RESIDENCY_CONFIG.recenterRatio
  );
  const centerDistance = Math.hypot(
    actorX - Number(_playableCoreResidencyState.centerX || 0),
    actorZ - Number(_playableCoreResidencyState.centerZ || 0)
  );
  const shouldRecenter =
    force ||
    !_playableCoreResidencyState.bounds ||
    _playableCoreResidencyState.mode !== mode ||
    centerDistance >= recenterThreshold;

  if (shouldRecenter) {
    const nextBounds = playableCoreBoundsFromCenter(actorX, actorZ, radius);
    const nextStructureBounds = playableCoreBoundsFromCenter(actorX, actorZ, structureRadius);
    const nextState = {
      ..._playableCoreResidencyState,
      centerX: actorX,
      centerZ: actorZ,
      radius,
      structureRadius,
      bounds: nextBounds,
      structureBounds: nextStructureBounds,
      mode
    };
    const nextRoadMeshCount = countRoadMeshesIntersectingPlayableCore(nextState);
    const nextVisibleRoadMeshesNearActor =
      mode === 'drive' ?
        countVisibleRoadMeshesNearWorldPoint(actorX, actorZ, 240) :
        nextRoadMeshCount;
    const preserveLoadedCoreForShortMove =
      !!_playableCoreResidencyState.bounds &&
      !!_playableCoreResidencyState.ready &&
      _playableCoreResidencyState.mode === mode &&
      centerDistance < radius * 0.55 &&
      (
        nextRoadMeshCount < minRoadMeshesReady ||
        nextVisibleRoadMeshesNearActor < minVisibleRoadMeshesReady
      );
    if (!preserveLoadedCoreForShortMove) {
      _playableCoreResidencyState.centerX = actorX;
      _playableCoreResidencyState.centerZ = actorZ;
      _playableCoreResidencyState.radius = radius;
      _playableCoreResidencyState.structureRadius = structureRadius;
      _playableCoreResidencyState.bounds = nextBounds;
      _playableCoreResidencyState.structureBounds = nextStructureBounds;
      _playableCoreResidencyState.mode = mode;
    }
  }

  const runtimeSnapshot =
    options.runtimeSnapshot ||
    (typeof appCtx.getContinuousWorldRuntimeSnapshot === 'function' ? appCtx.getContinuousWorldRuntimeSnapshot() : null);
  _playableCoreResidencyState.regionKeys = playableCoreRegionKeysForBounds(
    _playableCoreResidencyState.bounds,
    runtimeSnapshot,
    mode
  );

  let roadMeshCount = 0;
  let urbanSurfaceCount = 0;
  let structureMeshCount = 0;
  const countIntersecting = (list, structure = false) => {
    let count = 0;
    if (!Array.isArray(list)) return count;
    for (let i = 0; i < list.length; i++) {
      const target = list[i];
      if (!target) continue;
      if (playableCoreIntersectsTarget(target, _playableCoreResidencyState, { structure })) count += 1;
    }
    return count;
  };
  roadMeshCount = countRoadMeshesIntersectingPlayableCore(_playableCoreResidencyState);
  urbanSurfaceCount = countIntersecting(appCtx.urbanSurfaceMeshes, false);
  structureMeshCount = countIntersecting(appCtx.structureVisualMeshes, true);

  const terrainSnapshot =
    options.terrainSnapshot ||
    (typeof appCtx.getTerrainStreamingSnapshot === 'function' ? appCtx.getTerrainStreamingSnapshot() : null);
  const nearTileCount = Number(terrainSnapshot?.activeNearTileCount || 0);
  const nearLoaded = Number(terrainSnapshot?.activeNearTilesLoaded || 0);
  const focusTileCount = Number(terrainSnapshot?.activeFocusTileCount || 0);
  const focusLoaded = Number(terrainSnapshot?.activeFocusTilesLoaded || 0);
  const nearRatio = nearTileCount > 0 ? nearLoaded / nearTileCount : 1;
  const focusRatio = focusTileCount > 0 ? focusLoaded / focusTileCount : 1;
  const terrainReady =
    !!terrainSnapshot?.activeCenterLoaded &&
    nearRatio >= PLAYABLE_CORE_RESIDENCY_CONFIG.terrainNearLoadRatio &&
    focusRatio >= PLAYABLE_CORE_RESIDENCY_CONFIG.terrainFocusLoadRatio;

  _playableCoreResidencyState.terrainReady = terrainReady;
  _playableCoreResidencyState.roadMeshCount = roadMeshCount;
  _playableCoreResidencyState.urbanSurfaceCount = urbanSurfaceCount;
  _playableCoreResidencyState.structureMeshCount = structureMeshCount;
  const visibleRoadMeshesNearActor =
    mode === 'drive' ?
      countVisibleRoadMeshesNearWorldPoint(actorX, actorZ, 240) :
      roadMeshCount;
  _playableCoreResidencyState.ready =
    terrainReady &&
    (
      roadMeshCount >= minRoadMeshesReady ||
      visibleRoadMeshesNearActor >= minVisibleRoadMeshesReady
    );
  _playableCoreResidencyState.reason = String(options.reason || (shouldRecenter ? 'recenter' : 'refresh'));
  _playableCoreResidencyState.lastUpdatedAt = performance.now();
  return _playableCoreResidencyState;
}

function getPlayableCoreResidencySnapshot() {
  const state = updatePlayableCoreResidency(false, { reason: 'snapshot' });
  return {
    ready: !!state.ready,
    mode: state.mode,
    center: {
      x: Number((state.centerX || 0).toFixed(2)),
      z: Number((state.centerZ || 0).toFixed(2))
    },
    bounds: state.bounds ? {
      minX: Number(state.bounds.minX.toFixed(2)),
      maxX: Number(state.bounds.maxX.toFixed(2)),
      minZ: Number(state.bounds.minZ.toFixed(2)),
      maxZ: Number(state.bounds.maxZ.toFixed(2))
    } : null,
    structureBounds: state.structureBounds ? {
      minX: Number(state.structureBounds.minX.toFixed(2)),
      maxX: Number(state.structureBounds.maxX.toFixed(2)),
      minZ: Number(state.structureBounds.minZ.toFixed(2)),
      maxZ: Number(state.structureBounds.maxZ.toFixed(2))
    } : null,
    radius: Number(state.radius || 0),
    structureRadius: Number(state.structureRadius || 0),
    regionKeys: Array.isArray(state.regionKeys) ? state.regionKeys.slice(0, 16) : [],
    regionKeyCount: Array.isArray(state.regionKeys) ? state.regionKeys.length : 0,
    terrainReady: !!state.terrainReady,
    roadMeshCount: Number(state.roadMeshCount || 0),
    urbanSurfaceCount: Number(state.urbanSurfaceCount || 0),
    structureMeshCount: Number(state.structureMeshCount || 0),
    reason: state.reason || null,
    lastUpdatedAt: Number.isFinite(state.lastUpdatedAt) ? Number(state.lastUpdatedAt.toFixed(1)) : 0
  };
}

function continuousWorldInteractiveRetainRegionKeys(runtimeSnapshot = null, focusRegionKey = null, actorState = null) {
  const retain = new Set();
  const actor = actorState || continuousWorldInteractiveActorMotionState();
  const mode = String(actor?.mode || 'drive');
  const speed = Math.abs(Number(actor?.speed || 0));
  const worldBuildStage = String(appCtx.worldBuildStage || '');
  const strictRegionScope = continuousWorldRuntimeUsesStrictRegionScope(runtimeSnapshot);
  const keepMidBand =
    mode === 'walk' ||
    (mode === 'drive' && speed < 6);
  const addBand = (cells) => {
    (Array.isArray(cells) ? cells : []).forEach((cell) => {
      const key = String(cell?.key || '').trim();
      if (key) retain.add(key);
    });
  };
  const snapshot = runtimeSnapshot || appCtx.getContinuousWorldRuntimeSnapshot?.();
  if (snapshot?.activeRegion?.key) retain.add(String(snapshot.activeRegion.key));
  addBand(snapshot?.activeRegionRings?.near);
  if (keepMidBand) addBand(snapshot?.activeRegionRings?.mid);
  if (focusRegionKey) retain.add(String(focusRegionKey));
  if (!strictRegionScope && _continuousWorldInteractiveStreamState.pendingRegionKey) {
    retain.add(String(_continuousWorldInteractiveStreamState.pendingRegionKey));
  }
  const recentCoverageCount =
    strictRegionScope ? 0 : CONTINUOUS_WORLD_INTERACTIVE_STREAM_RECENT_RETAIN_COUNT;
  const recentCoverage = Array.isArray(_continuousWorldInteractiveStreamState.coverage) ?
    _continuousWorldInteractiveStreamState.coverage.slice(-recentCoverageCount) :
    [];
  recentCoverage.forEach((entry) => {
    const key = String(entry?.regionKey || '').trim();
    if (key) retain.add(key);
  });
  const keepPlayableCoreRegions =
    !strictRegionScope &&
    (
      worldBuildStage !== 'full_world_ready' ||
      mode === 'walk'
    );
  if (keepPlayableCoreRegions) {
    const playableCore = updatePlayableCoreResidency(false, {
      actorState: actor,
      runtimeSnapshot: snapshot,
      reason: 'retain_regions'
    });
    if (Array.isArray(playableCore?.regionKeys)) {
      for (let i = 0; i < playableCore.regionKeys.length; i++) {
        retain.add(playableCore.regionKeys[i]);
      }
    }
  }
  return retain;
}

function continuousWorldRuntimeUsesStrictRegionScope(runtimeSnapshot = null) {
  const snapshot = runtimeSnapshot || appCtx.getContinuousWorldRuntimeSnapshot?.();
  const nearRadius = Number(snapshot?.regionConfig?.nearRadius || 0);
  const midRadius = Number(snapshot?.regionConfig?.midRadius || 0);
  const farRadius = Number(snapshot?.regionConfig?.farRadius || 0);
  return nearRadius <= 0 && midRadius <= 0 && farRadius <= 0;
}

function continuousWorldRoadRetainPlayableRegionKeys(actorState = null, runtimeSnapshot = null) {
  const actor = actorState || continuousWorldInteractiveActorMotionState();
  const mode = String(actor?.mode || 'drive');
  const snapshot = runtimeSnapshot || appCtx.getContinuousWorldRuntimeSnapshot?.();
  const worldBuildStage = String(appCtx.worldBuildStage || '');
  if (continuousWorldRuntimeUsesStrictRegionScope(snapshot)) return [];
  const playableCore = updatePlayableCoreResidency(false, {
    actorState: actor,
    runtimeSnapshot: snapshot,
    reason: 'road_retain_regions'
  });
  if (!Array.isArray(playableCore?.regionKeys) || playableCore.regionKeys.length === 0) return [];
  if (worldBuildStage !== 'full_world_ready' || mode === 'walk') {
    return playableCore.regionKeys.slice();
  }
  if (!Number.isFinite(actor?.x) || !Number.isFinite(actor?.z)) {
    return playableCore.regionKeys.slice();
  }
  if (mode === 'drive' || mode === 'drone') {
    const roadCfg = ACTOR_ROAD_SHELL_CONFIG[mode] || ACTOR_ROAD_SHELL_CONFIG.drive;
    const speed = Math.abs(Number(actor?.speed || 0));
    const radius =
      mode === 'drone' ?
        Math.max(roadCfg.visibleRadius || 420, 520) :
        Math.max(
          roadCfg.visibleRadius || 320,
          speed >= 8 ? 340 : 260
        );
    const actorBounds = playableCoreBoundsFromCenter(actor.x, actor.z, radius);
    return playableCoreRegionKeysForBounds(actorBounds, snapshot, mode);
  }
  return playableCore.regionKeys.slice();
}

function continuousWorldInteractiveRoadRetainRegionKeys(runtimeSnapshot = null, focusRegionKey = null, actorState = null) {
  const retain = continuousWorldInteractiveRetainRegionKeys(runtimeSnapshot, focusRegionKey, actorState);
  const actor = actorState || continuousWorldInteractiveActorMotionState();
  const mode = String(actor?.mode || 'drive');
  const speed = Math.abs(Number(actor?.speed || 0));
  const snapshot = runtimeSnapshot || appCtx.getContinuousWorldRuntimeSnapshot?.();
  const worldBuildStage = String(appCtx.worldBuildStage || '');
  const strictRegionScope = continuousWorldRuntimeUsesStrictRegionScope(snapshot);
  const forwardCorridor = continuousWorldForwardRoadCorridorState(actor, snapshot);
  const addBand = (cells) => {
    (Array.isArray(cells) ? cells : []).forEach((cell) => {
      const key = String(cell?.key || '').trim();
      if (key) retain.add(key);
    });
  };
  if (mode === 'drive' || mode === 'drone') {
    addBand(snapshot?.activeRegionRings?.mid);
  }
  if (mode === 'drive' && speed >= 8) {
    addBand(snapshot?.activeRegionRings?.far);
  }
  const recentCoverageCount =
    strictRegionScope ? 0 :
    worldBuildStage !== 'full_world_ready' ? CONTINUOUS_WORLD_INTERACTIVE_STREAM_ROAD_RECENT_RETAIN_COUNT :
    mode === 'drive' ? 2 :
    mode === 'drone' ? 3 :
    CONTINUOUS_WORLD_INTERACTIVE_STREAM_ROAD_RECENT_RETAIN_COUNT;
  const recentCoverage = Array.isArray(_continuousWorldInteractiveStreamState.coverage) ?
    _continuousWorldInteractiveStreamState.coverage.slice(-recentCoverageCount) :
    [];
  recentCoverage.forEach((entry) => {
    const key = String(entry?.regionKey || '').trim();
    if (key) retain.add(key);
  });
  const forwardCorridorCoverage = Array.isArray(_continuousWorldInteractiveStreamState.coverage) ?
    _continuousWorldInteractiveStreamState.coverage
      .filter((entry) => continuousWorldInteractiveReasonIsForwardRoadCorridor(entry?.reason))
      .slice(-4) :
    [];
  forwardCorridorCoverage.forEach((entry) => {
    const key = String(entry?.regionKey || '').trim();
    if (key) retain.add(key);
  });
  if (!strictRegionScope && _continuousWorldInteractiveStreamState.pendingRegionKey) {
    retain.add(String(_continuousWorldInteractiveStreamState.pendingRegionKey));
  }
  const playableRoadKeys = continuousWorldRoadRetainPlayableRegionKeys(actor, snapshot);
  for (let i = 0; i < playableRoadKeys.length; i++) {
    retain.add(playableRoadKeys[i]);
  }
  if (Array.isArray(forwardCorridor?.regionKeys)) {
    for (let i = 0; i < forwardCorridor.regionKeys.length; i++) {
      retain.add(forwardCorridor.regionKeys[i]);
    }
  }
  return retain;
}

function continuousWorldBaseRetainRegionKeys(runtimeSnapshot = null, focusRegionKey = null, actorState = null, options = {}) {
  const retain = new Set();
  const actor = actorState || continuousWorldInteractiveActorMotionState();
  const mode = String(actor?.mode || 'drive');
  const speed = Math.abs(Number(actor?.speed || 0));
  const snapshot = runtimeSnapshot || appCtx.getContinuousWorldRuntimeSnapshot?.();
  const actorDistance = Math.hypot(Number(actor?.x || 0), Number(actor?.z || 0));
  const farTravel = actorDistance >= CONTINUOUS_WORLD_BASE_EVICTION_FAR_DISTANCE;
  const forwardCorridor = options.roads === true ? continuousWorldForwardRoadCorridorState(actor, snapshot) : null;
  const keepMidBand =
    mode === 'walk' ||
    (mode === 'drive' && speed < 6 && !farTravel) ||
    options.roads === true;
  const addBand = (cells) => {
    (Array.isArray(cells) ? cells : []).forEach((cell) => {
      const key = String(cell?.key || '').trim();
      if (key) retain.add(key);
    });
  };
  if (snapshot?.activeRegion?.key) retain.add(String(snapshot.activeRegion.key));
  addBand(snapshot?.activeRegionRings?.near);
  if (keepMidBand) addBand(snapshot?.activeRegionRings?.mid);
  if (options.roads === true && (mode === 'drive' || mode === 'drone')) {
    addBand(snapshot?.activeRegionRings?.mid);
    if (mode === 'drive' && speed >= 8) addBand(snapshot?.activeRegionRings?.far);
  }
  if (focusRegionKey) retain.add(String(focusRegionKey));
  if (_continuousWorldInteractiveStreamState.pendingRegionKey) {
    retain.add(String(_continuousWorldInteractiveStreamState.pendingRegionKey));
  }
  if (options.roads === true) {
    const forwardCorridorCoverage = Array.isArray(_continuousWorldInteractiveStreamState.coverage) ?
      _continuousWorldInteractiveStreamState.coverage
        .filter((entry) => continuousWorldInteractiveReasonIsForwardRoadCorridor(entry?.reason))
        .slice(-4) :
      [];
    forwardCorridorCoverage.forEach((entry) => {
      const key = String(entry?.regionKey || '').trim();
      if (key) retain.add(key);
    });
  }
  const includePlayableCore =
    (options.roads === true && !continuousWorldRuntimeUsesStrictRegionScope(snapshot)) ||
    mode === 'walk' ||
    (mode === 'drive' && speed < 4 && !farTravel);
  if (includePlayableCore) {
    const playableKeys =
      options.roads === true ?
        continuousWorldRoadRetainPlayableRegionKeys(actor, snapshot) :
        (() => {
          const playableCore = updatePlayableCoreResidency(false, {
            actorState: actor,
            runtimeSnapshot: snapshot,
            reason: options.roads === true ? 'base_road_retain_regions' : 'base_retain_regions'
          });
          return Array.isArray(playableCore?.regionKeys) ? playableCore.regionKeys : [];
        })();
    for (let i = 0; i < playableKeys.length; i++) {
      retain.add(playableKeys[i]);
    }
  }
  if (Array.isArray(forwardCorridor?.regionKeys)) {
    for (let i = 0; i < forwardCorridor.regionKeys.length; i++) {
      retain.add(forwardCorridor.regionKeys[i]);
    }
  }
  return retain;
}

function shouldDeferInteractiveRoadEviction(actorState = null) {
  const actor = actorState || continuousWorldInteractiveActorMotionState();
  const mode = String(actor?.mode || 'drive');
  if (mode !== 'drive') return false;
  const speed = Math.abs(Number(actor?.speed || 0));
  const visibleRoadsNearActor = countVisibleRoadMeshesNearWorldPoint(actor?.x, actor?.z, speed >= 8 ? 320 : 240);
  const lowVisibleRoadState =
    visibleRoadsNearActor < (PLAYABLE_CORE_RESIDENCY_CONFIG.minVisibleRoadMeshesReady?.drive || 12);
  const pendingActorScoped =
    !!_continuousWorldInteractiveStreamState.pending &&
    (
      ['main_loop', 'actor_drift', 'startup_roads_ready', 'road_recovery_shell'].includes(
        String(_continuousWorldInteractiveStreamState.lastLoadReason || '')
      ) ||
      continuousWorldInteractiveReasonIsForwardRoadCorridor(_continuousWorldInteractiveStreamState.lastLoadReason || '')
    );
  return pendingActorScoped || speed >= 0.5 || lowVisibleRoadState;
}

function deriveContinuousWorldRegionKeysForFeature(feature) {
  if (!feature || typeof feature !== 'object') return [];
  const directKeys = Array.isArray(feature?.continuousWorldRegionKeys) ? feature.continuousWorldRegionKeys.filter((key) => typeof key === 'string' && key) : [];
  if (directKeys.length > 0) return directKeys;

  const userDataKeys = Array.isArray(feature?.userData?.continuousWorldRegionKeys) ?
    feature.userData.continuousWorldRegionKeys.filter((key) => typeof key === 'string' && key) :
    [];
  if (userDataKeys.length > 0) return userDataKeys;

  const explicitBounds =
    Number.isFinite(feature?.bounds?.minX) &&
    Number.isFinite(feature?.bounds?.maxX) &&
    Number.isFinite(feature?.bounds?.minZ) &&
    Number.isFinite(feature?.bounds?.maxZ) ?
      feature.bounds :
      Number.isFinite(feature?.minX) &&
        Number.isFinite(feature?.maxX) &&
        Number.isFinite(feature?.minZ) &&
        Number.isFinite(feature?.maxZ) ?
          {
            minX: feature.minX,
            maxX: feature.maxX,
            minZ: feature.minZ,
            maxZ: feature.maxZ
          } :
          Number.isFinite(feature?.x) && Number.isFinite(feature?.z) ?
            {
              minX: feature.x,
              maxX: feature.x,
              minZ: feature.z,
              maxZ: feature.z
            } :
            null;
  const points = Array.isArray(feature?.pts) && feature.pts.length > 0 ?
    feature.pts :
    explicitBounds ? [
      { x: explicitBounds.minX, z: explicitBounds.minZ },
      { x: explicitBounds.minX, z: explicitBounds.maxZ },
      { x: explicitBounds.maxX, z: explicitBounds.maxZ },
      { x: explicitBounds.maxX, z: explicitBounds.minZ }
    ] :
    null;
  if (!points || points.length === 0) return [];
  const derivedKeys = buildContinuousWorldRegionKeysFromPoints(points, null, explicitBounds || null)
    .filter((key) => typeof key === 'string' && key);
  if (derivedKeys.length > 0 && feature && typeof feature === 'object') {
    feature.continuousWorldRegionKeys = derivedKeys.slice();
  }
  return derivedKeys;
}

function continuousWorldInteractiveFeatureIntersectsRetainedRegions(feature, retainKeys) {
  if (!(retainKeys instanceof Set) || retainKeys.size === 0) return true;
  const featureKeys = deriveContinuousWorldRegionKeysForFeature(feature);
  if (featureKeys.length === 0) return true;
  for (let i = 0; i < featureKeys.length; i++) {
    if (retainKeys.has(featureKeys[i])) return true;
  }
  return false;
}

const RUNTIME_CONTENT_TRACKED_ARRAYS = Object.freeze([
  ['roadMeshes', 'road_mesh'],
  ['urbanSurfaceMeshes', 'urban_surface_mesh'],
  ['structureVisualMeshes', 'structure_visual_mesh'],
  ['buildingMeshes', 'building_mesh'],
  ['landuseMeshes', 'landuse_mesh'],
  ['linearFeatureMeshes', 'linear_feature_mesh'],
  ['poiMeshes', 'poi_mesh'],
  ['streetFurnitureMeshes', 'street_furniture_mesh'],
  ['vegetationMeshes', 'vegetation_mesh'],
  ['historicMarkers', 'historic_marker_mesh']
]);

const runtimeContentInventory = {
  active: new Map(),
  totalRegistered: 0,
  totalRetired: 0,
  untrackedRetirements: 0,
  missingWithoutRetire: 0,
  retiredByReason: Object.create(null),
  lastSyncAt: 0,
  lastSyncReason: null,
  lastRetireAt: 0,
  lastRetireReason: null
};

function recordRuntimeContentReason(reason = 'unknown') {
  const key = String(reason || 'unknown').trim() || 'unknown';
  runtimeContentInventory.retiredByReason[key] =
    Number(runtimeContentInventory.retiredByReason[key] || 0) + 1;
}

function runtimeContentKindForTarget(target, arrayKey = '') {
  if (arrayKey === 'overlayPublishedGroup') {
    const overlayClass = String(target?.userData?.overlayFeatureClass || '').trim().toLowerCase();
    return overlayClass ? `overlay_${overlayClass}` : 'overlay_mesh';
  }
  if (arrayKey === 'terrainGroup') return 'terrain_tile_mesh';
  return arrayKey ? String(arrayKey).replace(/Meshes$/, '').replace(/Markers$/, '_marker') : 'mesh';
}

function runtimeContentSourceForTarget(target, arrayKey = '') {
  const userData = target?.userData || {};
  const sourceId =
    String(userData?.sourceFeatureId || userData?.sourceBuildingId || userData?.overlayFeatureId || '').trim();
  if (
    arrayKey === 'overlayPublishedGroup' ||
    sourceId.startsWith('overlay:') ||
    !!userData?.overlayFeatureId ||
    !!userData?.overlayFeatureClass
  ) {
    return 'overlay';
  }
  if (userData?.continuousWorldInteractiveChunk === true || target?.continuousWorldInteractiveChunk === true) {
    return 'interactive';
  }
  if (userData?.syntheticFallbackWorld === true || target?.syntheticFallbackWorld === true) {
    return 'synthetic';
  }
  return 'base';
}

function upsertRuntimeContentInventoryEntry(target, arrayKey = '') {
  const id = String(target?.uuid || '').trim();
  if (!id) return '';
  const existing = runtimeContentInventory.active.get(id);
  const regionKeys = deriveContinuousWorldRegionKeysForFeature(target?.userData || target);
  const localBounds = target?.userData?.localBounds || target?.localBounds || null;
  const entry = {
    id,
    kind: runtimeContentKindForTarget(target, arrayKey),
    arrayKey: arrayKey || existing?.arrayKey || 'unknown',
    source: runtimeContentSourceForTarget(target, arrayKey),
    objectType: String(target?.type || existing?.objectType || 'Object3D'),
    sceneAttached: !!target?.parent,
    regionKeyCount: Array.isArray(regionKeys) ? regionKeys.length : 0,
    hasBounds: !!localBounds,
    childMeshCount: Number(target?.userData?.runtimeChildMeshCount || 0),
    registeredAt: Number(existing?.registeredAt || Date.now()),
    lastSeenAt: Date.now(),
    retiredAt: 0,
    retireReason: null
  };
  if (!existing) {
    runtimeContentInventory.totalRegistered += 1;
  }
  runtimeContentInventory.active.set(id, entry);
  return id;
}

function recordRuntimeContentRetired(target, reason = 'removed') {
  const id = String(target?.uuid || '').trim();
  const retireReason = String(reason || 'removed').trim() || 'removed';
  if (!id) {
    runtimeContentInventory.untrackedRetirements += 1;
    recordRuntimeContentReason(`untracked:${retireReason}`);
    runtimeContentInventory.lastRetireAt = Date.now();
    runtimeContentInventory.lastRetireReason = retireReason;
    return;
  }
  const existing = runtimeContentInventory.active.get(id);
  if (!existing) {
    runtimeContentInventory.untrackedRetirements += 1;
    recordRuntimeContentReason(`untracked:${retireReason}`);
    runtimeContentInventory.lastRetireAt = Date.now();
    runtimeContentInventory.lastRetireReason = retireReason;
    return;
  }
  if (!existing.retiredAt) {
    runtimeContentInventory.totalRetired += 1;
    recordRuntimeContentReason(retireReason);
  }
  existing.retiredAt = Date.now();
  existing.retireReason = retireReason;
  existing.sceneAttached = !!target?.parent;
  existing.lastSeenAt = Date.now();
  runtimeContentInventory.active.set(id, existing);
  runtimeContentInventory.lastRetireAt = existing.retiredAt;
  runtimeContentInventory.lastRetireReason = retireReason;
}

function trackedRuntimeContentCollections() {
  const collections = [];
  for (let i = 0; i < RUNTIME_CONTENT_TRACKED_ARRAYS.length; i++) {
    const [arrayKey, kind] = RUNTIME_CONTENT_TRACKED_ARRAYS[i];
    const source = appCtx[arrayKey];
    if (Array.isArray(source) && source.length > 0) {
      collections.push({ arrayKey, kind, items: source });
    }
  }
  const overlayGroup =
    appCtx.overlayPublishedGroup ||
    (typeof appCtx.scene?.getObjectByName === 'function' ? appCtx.scene.getObjectByName('overlayPublishedGroup') : null);
  if (Array.isArray(overlayGroup?.children) && overlayGroup.children.length > 0) {
    collections.push({ arrayKey: 'overlayPublishedGroup', kind: 'overlay_mesh', items: overlayGroup.children });
  }
  if (Array.isArray(appCtx.terrainGroup?.children) && appCtx.terrainGroup.children.length > 0) {
    collections.push({ arrayKey: 'terrainGroup', kind: 'terrain_tile_mesh', items: appCtx.terrainGroup.children });
  }
  return collections;
}

function syncRuntimeContentInventory(reason = 'manual') {
  const seen = new Set();
  const collections = trackedRuntimeContentCollections();
  for (let i = 0; i < collections.length; i++) {
    const collection = collections[i];
    const items = collection.items;
    for (let j = 0; j < items.length; j++) {
      const target = items[j];
      if (!target) continue;
      const id = upsertRuntimeContentInventoryEntry(target, collection.arrayKey);
      if (id) seen.add(id);
    }
  }

  for (const [id, entry] of runtimeContentInventory.active.entries()) {
    if (seen.has(id)) continue;
    if (!entry.retiredAt) {
      runtimeContentInventory.missingWithoutRetire += 1;
      recordRuntimeContentReason('missing_without_retire');
    }
    runtimeContentInventory.active.delete(id);
  }

  runtimeContentInventory.lastSyncAt = Date.now();
  runtimeContentInventory.lastSyncReason = String(reason || 'manual');
  return getRuntimeContentInventorySnapshot();
}

function getRuntimeContentInventorySnapshot() {
  const bySource = {};
  const byKind = {};
  const byArrayKey = {};
  runtimeContentInventory.active.forEach((entry) => {
    bySource[entry.source] = (bySource[entry.source] || 0) + 1;
    byKind[entry.kind] = (byKind[entry.kind] || 0) + 1;
    byArrayKey[entry.arrayKey] = (byArrayKey[entry.arrayKey] || 0) + 1;
  });
  return {
    activeCount: runtimeContentInventory.active.size,
    totalRegistered: runtimeContentInventory.totalRegistered,
    totalRetired: runtimeContentInventory.totalRetired,
    untrackedRetirements: runtimeContentInventory.untrackedRetirements,
    missingWithoutRetire: runtimeContentInventory.missingWithoutRetire,
    lastSyncAt: runtimeContentInventory.lastSyncAt || 0,
    lastSyncReason: runtimeContentInventory.lastSyncReason || null,
    lastRetireAt: runtimeContentInventory.lastRetireAt || 0,
    lastRetireReason: runtimeContentInventory.lastRetireReason || null,
    bySource,
    byKind,
    byArrayKey,
    retiredByReason: { ...runtimeContentInventory.retiredByReason }
  };
}

function getRuntimeContentInventorySourceStats(source = 'base') {
  const normalizedSource = String(source || 'base').trim() || 'base';
  const stats = {
    activeCount: 0,
    sceneAttachedCount: 0,
    byKind: {},
    byArrayKey: {}
  };
  runtimeContentInventory.active.forEach((entry) => {
    if (entry?.source !== normalizedSource) return;
    stats.activeCount += 1;
    if (entry?.sceneAttached) stats.sceneAttachedCount += 1;
    const kind = String(entry?.kind || 'unknown');
    const arrayKey = String(entry?.arrayKey || 'unknown');
    stats.byKind[kind] = (stats.byKind[kind] || 0) + 1;
    stats.byArrayKey[arrayKey] = (stats.byArrayKey[arrayKey] || 0) + 1;
  });
  return stats;
}

function disposeMeshForContinuousWorldEviction(mesh, reason = 'eviction') {
  if (!mesh) return;
  recordRuntimeContentRetired(mesh, reason);
  if (mesh.parent === appCtx.scene) appCtx.scene.remove(mesh);
  const disposedGeometries = new Set();
  const disposedMaterials = new Set();
  const disposedTextures = new Set();
  const sharedFurnitureMaterial =
    mesh?.material === _matPole ||
    mesh?.material === _matSignBg ||
    mesh?.material === _matTrunk ||
    mesh?.material === _matLampHead ||
    mesh?.material === _matTrashBody ||
    mesh?.material === _matTrashLid ||
    (Array.isArray(_matTreeShades) && _matTreeShades.includes(mesh?.material));
  const sharedFurnitureGeometry =
    mesh?.geometry === _geoSignPole ||
    mesh?.geometry === _geoSignBoard ||
    mesh?.geometry === _geoTreeCanopy ||
    mesh?.geometry === _geoTreeTrunk ||
    mesh?.geometry === _geoLampPole ||
    mesh?.geometry === _geoLampHead ||
    mesh?.geometry === _geoTrashBody ||
    mesh?.geometry === _geoTrashLid;
  const disposeMaterialTextures = (material) => {
    if (!material || disposedMaterials.has(material)) return;
    disposedMaterials.add(material);
    const sharedMaterial =
      !!material.userData?.sharedRoadMaterial ||
      !!material.userData?.sharedUrbanSurfaceMaterial ||
      !!material.userData?.sharedStreetSignMaterial ||
      !!material.userData?.sharedContinuousWorldMaterial ||
      material === _matPole ||
      material === _matSignBg ||
      material === _matTrunk ||
      material === _matLampHead ||
      material === _matTrashBody ||
      material === _matTrashLid ||
      (Array.isArray(_matTreeShades) && _matTreeShades.includes(material));
    if (sharedMaterial) return;
    [
      'map',
      'normalMap',
      'roughnessMap',
      'metalnessMap',
      'emissiveMap',
      'alphaMap',
      'aoMap',
      'bumpMap',
      'displacementMap',
      'lightMap',
      'specularMap',
      'gradientMap'
    ].forEach((key) => {
      const texture = material[key];
      if (
        texture &&
        !disposedTextures.has(texture) &&
        typeof texture.dispose === 'function' &&
        !texture.userData?.sharedStreetSignTexture &&
        !texture.userData?.sharedOceanTexture &&
        !texture.userData?.sharedContinuousWorldTexture
      ) {
        disposedTextures.add(texture);
        texture.dispose();
      }
    });
    if (typeof material.dispose === 'function') {
      material.dispose();
    }
  };
  const disposeObject = (obj) => {
    if (!obj) return;
    const geometry = obj.geometry;
    if (
      geometry &&
      !disposedGeometries.has(geometry) &&
      typeof geometry.dispose === 'function' &&
      geometry !== _geoSignPole &&
      geometry !== _geoSignBoard &&
      geometry !== _geoTreeCanopy &&
      geometry !== _geoTreeTrunk &&
      geometry !== _geoLampPole &&
      geometry !== _geoLampHead &&
      geometry !== _geoTrashBody &&
      geometry !== _geoTrashLid
    ) {
      disposedGeometries.add(geometry);
      geometry.dispose();
    }
    const material = obj.material;
    if (Array.isArray(material)) {
      material.forEach(disposeMaterialTextures);
    } else {
      disposeMaterialTextures(material);
    }
  };
  if (typeof mesh.traverse === 'function') {
    mesh.traverse(disposeObject);
    return;
  }
  if (mesh.geometry && typeof mesh.geometry.dispose === 'function' && !sharedFurnitureGeometry) {
    mesh.geometry.dispose();
  }
  const material = mesh.material;
  const ownsRoadMaterial = !!mesh.userData?.sharedRoadMaterial;
  const ownsUrbanMaterial = !!mesh.userData?.sharedUrbanSurfaceMaterial;
  if (material && !ownsRoadMaterial && !ownsUrbanMaterial && !sharedFurnitureMaterial) {
    if (Array.isArray(material)) {
      material.forEach(disposeMaterialTextures);
    } else {
      disposeMaterialTextures(material);
    }
  }
}

function disposeTrackedMeshList(targetList, reason = 'dispose_list') {
  if (!Array.isArray(targetList) || targetList.length === 0) return;
  for (let i = 0; i < targetList.length; i++) {
    disposeMeshForContinuousWorldEviction(targetList[i], reason);
  }
  targetList.length = 0;
}

function mergeRoadMutationBounds(targetBounds, nextBounds) {
  if (!nextBounds) return targetBounds || null;
  if (!targetBounds) return { ...nextBounds };
  return {
    minX: Math.min(targetBounds.minX, nextBounds.minX),
    maxX: Math.max(targetBounds.maxX, nextBounds.maxX),
    minZ: Math.min(targetBounds.minZ, nextBounds.minZ),
    maxZ: Math.max(targetBounds.maxZ, nextBounds.maxZ)
  };
}

function recordRoadMutationFeature(collector, feature) {
  if (!collector || !feature) return;
  collector.bounds = mergeRoadMutationBounds(
    collector.bounds || null,
    feature?.bounds || (Array.isArray(feature?.pts) ? polylineBounds(feature.pts, (Number(feature?.width) || 4) * 0.5 + 18) : null)
  );
  const keys = Array.isArray(feature?.continuousWorldRegionKeys) ? feature.continuousWorldRegionKeys : [];
  if (!(collector.regionKeys instanceof Set)) collector.regionKeys = new Set();
  for (let i = 0; i < keys.length; i++) {
    if (typeof keys[i] === 'string' && keys[i]) collector.regionKeys.add(keys[i]);
  }
}

function removeInteractiveFeaturesByRegion(source, retainKeys, countsKey, idSet = null, idField = '', collector = null) {
  if (!Array.isArray(source) || source.length === 0) return;
  const kept = [];
  let removed = 0;
  for (let i = 0; i < source.length; i++) {
    const feature = source[i];
    const isInteractive = feature?.continuousWorldInteractiveChunk === true;
    if (
      isInteractive &&
      !continuousWorldInteractiveFeatureIntersectsRetainedRegions(feature, retainKeys)
    ) {
      removed += 1;
      recordRoadMutationFeature(collector, feature);
      const sourceId = String(feature?.[idField] || '').trim();
      if (sourceId && idSet instanceof Set) idSet.delete(sourceId);
      continue;
    }
    kept.push(feature);
  }
  source.length = 0;
  for (let i = 0; i < kept.length; i++) source.push(kept[i]);
  _continuousWorldInteractiveStreamState[countsKey] =
    Number(_continuousWorldInteractiveStreamState[countsKey] || 0) + removed;
}

function removeInteractiveMeshesByRegion(targetList, retainKeys) {
  if (!Array.isArray(targetList) || targetList.length === 0) return 0;
  const kept = [];
  let removed = 0;
  for (let i = 0; i < targetList.length; i++) {
    const mesh = targetList[i];
    const isInteractive = mesh?.userData?.continuousWorldInteractiveChunk === true;
    if (
      isInteractive &&
      !continuousWorldInteractiveFeatureIntersectsRetainedRegions(mesh?.userData, retainKeys)
    ) {
      disposeMeshForContinuousWorldEviction(mesh, 'interactive_eviction');
      removed += 1;
      continue;
    }
    kept.push(mesh);
  }
  targetList.length = 0;
  for (let i = 0; i < kept.length; i++) targetList.push(kept[i]);
  if (removed > 0 && targetList === appCtx.roadMeshes) {
    markRoadMeshSpatialIndexDirty();
  }
  return removed;
}

function removeBaseFeaturesByRegion(source, retainKeys) {
  if (!Array.isArray(source) || source.length === 0) return 0;
  const kept = [];
  let removed = 0;
  for (let i = 0; i < source.length; i++) {
    const feature = source[i];
    const isInteractive = feature?.continuousWorldInteractiveChunk === true;
    if (!isInteractive && !continuousWorldInteractiveFeatureIntersectsRetainedRegions(feature, retainKeys)) {
      removed += 1;
      continue;
    }
    kept.push(feature);
  }
  source.length = 0;
  for (let i = 0; i < kept.length; i++) source.push(kept[i]);
  return removed;
}

function removeBaseMeshesByRegion(targetList, retainKeys) {
  if (!Array.isArray(targetList) || targetList.length === 0) return 0;
  const kept = [];
  let removed = 0;
  for (let i = 0; i < targetList.length; i++) {
    const mesh = targetList[i];
    const isInteractive = mesh?.userData?.continuousWorldInteractiveChunk === true;
    if (!isInteractive && !continuousWorldInteractiveFeatureIntersectsRetainedRegions(mesh?.userData || mesh, retainKeys)) {
      disposeMeshForContinuousWorldEviction(mesh, 'base_eviction');
      removed += 1;
      continue;
    }
    kept.push(mesh);
  }
  targetList.length = 0;
  for (let i = 0; i < kept.length; i++) targetList.push(kept[i]);
  return removed;
}

function refreshContinuousWorldInteractiveActiveCounts() {
  _continuousWorldInteractiveStreamState.activeInteractiveRoads = (Array.isArray(appCtx.roads) ? appCtx.roads : [])
    .filter((road) => road?.continuousWorldInteractiveChunk === true).length;
  _continuousWorldInteractiveStreamState.activeInteractiveBuildings = (Array.isArray(appCtx.buildings) ? appCtx.buildings : [])
    .filter((building) => building?.continuousWorldInteractiveChunk === true).length;
  _continuousWorldInteractiveStreamState.activeInteractiveLanduse = (Array.isArray(appCtx.landuses) ? appCtx.landuses : [])
    .filter((feature) => feature?.continuousWorldInteractiveChunk === true).length;
  _continuousWorldInteractiveStreamState.activeInteractiveWaterways = (Array.isArray(appCtx.waterways) ? appCtx.waterways : [])
    .filter((feature) => feature?.continuousWorldInteractiveChunk === true).length;
}

function countBaseContentMeshes(targetList) {
  if (!Array.isArray(targetList) || targetList.length === 0) return 0;
  let count = 0;
  for (let i = 0; i < targetList.length; i++) {
    if (targetList[i]?.userData?.continuousWorldInteractiveChunk === true) continue;
    count += 1;
  }
  return count;
}

function shouldEvictBaseWorldContent(retainKeys, actorState = null) {
  if (!(retainKeys instanceof Set) || retainKeys.size === 0) return false;
  if (appCtx.worldLoading || appCtx.onMoon) return false;
  if (Date.now() - _lastBaseWorldEvictionAt < CONTINUOUS_WORLD_BASE_EVICTION_MIN_INTERVAL_MS) return false;
  if (Date.now() - Number(runtimeContentInventory.lastSyncAt || 0) >= CONTINUOUS_WORLD_BASE_EVICTION_SYNC_INTERVAL_MS) {
    syncRuntimeContentInventory('base_eviction_check');
  }
  const actor = actorState || continuousWorldInteractiveActorMotionState();
  if (!Number.isFinite(actor?.x) || !Number.isFinite(actor?.z)) return false;
  const actorDistance = Math.hypot(actor.x, actor.z);
  if (actorDistance < CONTINUOUS_WORLD_BASE_EVICTION_MIN_DISTANCE) return false;
  if (!!_continuousWorldInteractiveStreamState.pending && String(_continuousWorldInteractiveStreamState.lastLoadReason || '').includes('actor_')) {
    const mode = String(actor?.mode || 'drive');
    const roadCfg = ACTOR_ROAD_SHELL_CONFIG[mode] || ACTOR_ROAD_SHELL_CONFIG.drive;
    const buildingCfg = ACTOR_BUILDING_SHELL_CONFIG[mode] || ACTOR_BUILDING_SHELL_CONFIG.drive;
    const visibleRoads = countVisibleRoadMeshesNearWorldPoint(actor.x, actor.z, Math.max(roadCfg.visibleRadius || 240, 240));
    const roadFeatures = countDriveableRoadFeaturesNearWorldPoint(actor.x, actor.z, Math.max(roadCfg.visibleRadius || 240, 260));
    const visibleBuildings = countVisibleDetailedBuildingMeshesNearWorldPoint(actor.x, actor.z, Math.max(buildingCfg.visibleRadius || 320, 260));
    const localRoadReady =
      visibleRoads >= Number(roadCfg.minVisibleRoads || 0) ||
      roadFeatures >= Number(roadCfg.minRoadFeatures || 0);
    const localBuildingReady =
      visibleBuildings >= Math.max(
        10,
        Math.floor(Number(buildingCfg.minVisibleBuildings || 0) * (mode === 'drive' ? 0.5 : 0.75))
      );
    if (!(localRoadReady && (mode === 'drive' ? localBuildingReady : true))) {
      return false;
    }
  }

  const baseBuildingMeshes = countBaseContentMeshes(appCtx.buildingMeshes);
  const baseRoadMeshes = countBaseContentMeshes(appCtx.roadMeshes);
  const baseSurfaceMeshes =
    countBaseContentMeshes(appCtx.urbanSurfaceMeshes) +
    countBaseContentMeshes(appCtx.structureVisualMeshes) +
    countBaseContentMeshes(appCtx.linearFeatureMeshes);
  const baseMiscMeshes =
    countBaseContentMeshes(appCtx.landuseMeshes) +
    countBaseContentMeshes(appCtx.poiMeshes) +
    countBaseContentMeshes(appCtx.streetFurnitureMeshes) +
    countBaseContentMeshes(appCtx.vegetationMeshes) +
    countBaseContentMeshes(appCtx.historicMarkers);
  const inventoryBase = getRuntimeContentInventorySourceStats('base');
  const farTravel = actorDistance >= CONTINUOUS_WORLD_BASE_EVICTION_FAR_DISTANCE;
  const ultraTravel = actorDistance >= CONTINUOUS_WORLD_BASE_EVICTION_ULTRA_DISTANCE;
  const buildingThreshold =
    ultraTravel ? Math.max(100, Math.floor(CONTINUOUS_WORLD_BASE_EVICTION_MIN_BUILDING_MESHES * 0.35)) :
    farTravel ? Math.max(160, Math.floor(CONTINUOUS_WORLD_BASE_EVICTION_MIN_BUILDING_MESHES * 0.55)) :
    CONTINUOUS_WORLD_BASE_EVICTION_MIN_BUILDING_MESHES;
  const miscThreshold =
    ultraTravel ? Math.max(60, Math.floor(CONTINUOUS_WORLD_BASE_EVICTION_MIN_MISC_MESHES * 0.35)) :
    farTravel ? Math.max(90, Math.floor(CONTINUOUS_WORLD_BASE_EVICTION_MIN_MISC_MESHES * 0.55)) :
    CONTINUOUS_WORLD_BASE_EVICTION_MIN_MISC_MESHES;
  const roadThreshold =
    ultraTravel ? Math.max(90, Math.floor(CONTINUOUS_WORLD_BASE_EVICTION_MIN_ROAD_MESHES * 0.45)) :
    farTravel ? Math.max(130, Math.floor(CONTINUOUS_WORLD_BASE_EVICTION_MIN_ROAD_MESHES * 0.65)) :
    CONTINUOUS_WORLD_BASE_EVICTION_MIN_ROAD_MESHES;
  const surfaceThreshold =
    ultraTravel ? Math.max(50, Math.floor(CONTINUOUS_WORLD_BASE_EVICTION_MIN_SURFACE_MESHES * 0.4)) :
    farTravel ? Math.max(80, Math.floor(CONTINUOUS_WORLD_BASE_EVICTION_MIN_SURFACE_MESHES * 0.6)) :
    CONTINUOUS_WORLD_BASE_EVICTION_MIN_SURFACE_MESHES;

  return (
    baseRoadMeshes >= roadThreshold ||
    baseSurfaceMeshes >= surfaceThreshold ||
    baseBuildingMeshes >= buildingThreshold ||
    baseMiscMeshes >= miscThreshold ||
    inventoryBase.activeCount >= (ultraTravel ? 420 : farTravel ? 620 : 980) ||
    inventoryBase.sceneAttachedCount >= (ultraTravel ? 300 : farTravel ? 460 : 760)
  );
}

function evictContinuousWorldBaseContent(retainKeys, roadRetainKeys = null, actorState = null) {
  const safeRoadRetainKeys =
    roadRetainKeys instanceof Set && roadRetainKeys.size > 0 ?
      roadRetainKeys :
      retainKeys;
  if (!shouldEvictBaseWorldContent(safeRoadRetainKeys, actorState)) {
    return { removedMeshes: 0, removedRoads: 0 };
  }

  const removedRoads = removeBaseFeaturesByRegion(appCtx.roads, safeRoadRetainKeys);
  removeBaseFeaturesByRegion(appCtx.buildings, retainKeys);
  removeBaseFeaturesByRegion(appCtx.landuses, retainKeys);
  removeBaseFeaturesByRegion(appCtx.surfaceFeatureHints, retainKeys);
  removeBaseFeaturesByRegion(appCtx.waterAreas, retainKeys);
  removeBaseFeaturesByRegion(appCtx.waterways, retainKeys);
  removeBaseFeaturesByRegion(appCtx.pois, retainKeys);
  removeBaseFeaturesByRegion(appCtx.linearFeatures, retainKeys);
  removeBaseFeaturesByRegion(appCtx.historicSites, retainKeys);

  const removedMeshes =
    removeBaseMeshesByRegion(appCtx.roadMeshes, safeRoadRetainKeys) +
    removeBaseMeshesByRegion(appCtx.urbanSurfaceMeshes, safeRoadRetainKeys) +
    removeBaseMeshesByRegion(appCtx.structureVisualMeshes, safeRoadRetainKeys) +
    removeBaseMeshesByRegion(appCtx.buildingMeshes, retainKeys) +
    removeBaseMeshesByRegion(appCtx.landuseMeshes, retainKeys) +
    removeBaseMeshesByRegion(appCtx.linearFeatureMeshes, retainKeys) +
    removeBaseMeshesByRegion(appCtx.poiMeshes, retainKeys) +
    removeBaseMeshesByRegion(appCtx.streetFurnitureMeshes, retainKeys) +
    removeBaseMeshesByRegion(appCtx.vegetationMeshes, retainKeys) +
    removeBaseMeshesByRegion(appCtx.historicMarkers, retainKeys);

  if (removedMeshes > 0 || removedRoads > 0) {
    _lastBaseWorldEvictionAt = Date.now();
    rebuildBuildingSpatialIndexFromLoadedBuildings();
    rebuildLanduseSpatialIndexFromLoadedLanduses();
    if (typeof appCtx.invalidateRoadCache === 'function') {
      appCtx.invalidateRoadCache();
    }
    scheduleTraversalNetworksRebuild('base_eviction', 240);
    markWorldLodDirty('base_eviction');
    syncRuntimeContentInventory('base_eviction');
  }
  return { removedMeshes, removedRoads };
}

function evictContinuousWorldInteractiveContent(runtimeSnapshot = null, focusRegionKey = null, actorState = null) {
  const retainKeys = continuousWorldInteractiveRetainRegionKeys(runtimeSnapshot, focusRegionKey, actorState);
  const roadRetainKeys = continuousWorldInteractiveRoadRetainRegionKeys(runtimeSnapshot, focusRegionKey, actorState);
  const baseRetainKeys = continuousWorldBaseRetainRegionKeys(runtimeSnapshot, focusRegionKey, actorState, { roads: false });
  const baseRoadRetainKeys = continuousWorldBaseRetainRegionKeys(runtimeSnapshot, focusRegionKey, actorState, { roads: true });
  if (!(retainKeys instanceof Set) || retainKeys.size === 0) return { removedMeshes: 0 };
  if (!(roadRetainKeys instanceof Set) || roadRetainKeys.size === 0) return { removedMeshes: 0 };
  if (!(baseRetainKeys instanceof Set) || baseRetainKeys.size === 0) return { removedMeshes: 0 };
  if (!(baseRoadRetainKeys instanceof Set) || baseRoadRetainKeys.size === 0) return { removedMeshes: 0 };
  const deferRoadEviction = shouldDeferInteractiveRoadEviction(actorState);

  const removedRoadMutation = { bounds: null, regionKeys: new Set() };
  if (!deferRoadEviction) {
    removeInteractiveFeaturesByRegion(
      appCtx.roads,
      roadRetainKeys,
      'evictedRoads',
      _continuousWorldInteractiveStreamState.loadedRoadIds,
      'sourceFeatureId',
      removedRoadMutation
    );
  }
  removeInteractiveFeaturesByRegion(
    appCtx.buildings,
    retainKeys,
    'evictedBuildings',
    _continuousWorldInteractiveStreamState.loadedBuildingIds,
    'sourceBuildingId'
  );
  removeInteractiveFeaturesByRegion(
    appCtx.landuses,
    retainKeys,
    'evictedLanduse',
    _continuousWorldInteractiveStreamState.loadedLanduseIds,
    'sourceFeatureId'
  );
  removeInteractiveFeaturesByRegion(
    appCtx.waterAreas,
    retainKeys,
    'evictedLanduse',
    _continuousWorldInteractiveStreamState.loadedLanduseIds,
    'sourceFeatureId'
  );
  removeInteractiveFeaturesByRegion(
    appCtx.waterways,
    retainKeys,
    'evictedWaterways',
    _continuousWorldInteractiveStreamState.loadedWaterwayIds,
    'sourceFeatureId'
  );
  removeInteractiveFeaturesByRegion(
    appCtx.linearFeatures,
    retainKeys,
    'evictedLanduse',
    null,
    'sourceFeatureId'
  );
  removeInteractiveFeaturesByRegion(
    appCtx.historicSites,
    retainKeys,
    'evictedLanduse',
    null,
    'sourceHistoricId'
  );

  const removedMeshes =
    (deferRoadEviction ? 0 : removeInteractiveMeshesByRegion(appCtx.roadMeshes, roadRetainKeys)) +
    removeInteractiveMeshesByRegion(appCtx.buildingMeshes, retainKeys) +
    removeInteractiveMeshesByRegion(appCtx.landuseMeshes, retainKeys) +
    (deferRoadEviction ? 0 : removeInteractiveMeshesByRegion(appCtx.urbanSurfaceMeshes, roadRetainKeys)) +
    removeInteractiveMeshesByRegion(appCtx.linearFeatureMeshes, retainKeys) +
    removeInteractiveMeshesByRegion(appCtx.poiMeshes, retainKeys) +
    removeInteractiveMeshesByRegion(appCtx.streetFurnitureMeshes, retainKeys) +
    removeInteractiveMeshesByRegion(appCtx.vegetationMeshes, retainKeys) +
    removeInteractiveMeshesByRegion(appCtx.historicMarkers, retainKeys);

  _continuousWorldInteractiveStreamState.evictedMeshes =
    Number(_continuousWorldInteractiveStreamState.evictedMeshes || 0) + removedMeshes;
  if (removedMeshes > 0) markWorldLodDirty('interactive_eviction');

  _continuousWorldInteractiveStreamState.coverage = _continuousWorldInteractiveStreamState.coverage.filter((entry) => {
    const key = String(entry?.regionKey || '').trim();
    return !key || retainKeys.has(key);
  });

  const baseEviction = evictContinuousWorldBaseContent(baseRetainKeys, baseRoadRetainKeys, actorState);
  rebuildBuildingSpatialIndexFromLoadedBuildings();
  rebuildLanduseSpatialIndexFromLoadedLanduses();
  refreshReplacedBaseBuildingSources();
  if (removedMeshes > 0 || Number(baseEviction?.removedMeshes || 0) > 0 || Number(baseEviction?.removedRoads || 0) > 0) {
    syncRuntimeContentInventory('interactive_eviction');
  }
  if (typeof appCtx.primeRoadSurfaceSyncState === 'function') {
    appCtx.primeRoadSurfaceSyncState({
      clearHeightCache: false,
      preserveActiveTask: true,
      mutationType: 'evict',
      source: 'interactive_eviction',
      bounds: removedRoadMutation.bounds,
      regionKeys: Array.from(removedRoadMutation.regionKeys || [])
    });
  }
  if (typeof appCtx.invalidateRoadCache === 'function') {
    appCtx.invalidateRoadCache();
  }
  if (removedMeshes > 0 || Number(baseEviction?.removedRoads || 0) > 0) {
    scheduleTraversalNetworksRebuild('continuous_world_eviction', 280);
  }
  refreshContinuousWorldInteractiveActiveCounts();
  return {
    removedMeshes: removedMeshes + Number(baseEviction?.removedMeshes || 0),
    removedBaseMeshes: Number(baseEviction?.removedMeshes || 0),
    removedBaseRoads: Number(baseEviction?.removedRoads || 0)
  };
}

function configureContinuousWorldInteractiveStreaming(config = {}) {
  if (!config || typeof config !== 'object') return getContinuousWorldInteractiveStreamSnapshot();
  if (typeof config.enabled === 'boolean') {
    _continuousWorldInteractiveStreamState.enabled = config.enabled;
  }
  if (typeof config.autoKickEnabled === 'boolean') {
    _continuousWorldInteractiveStreamState.autoKickEnabled = config.autoKickEnabled;
  }
  return getContinuousWorldInteractiveStreamSnapshot();
}

function decimateRoadCenterlineByDepth(pts, roadType, tileDepth, mode = getPerfModeValue()) {
  if (!Array.isArray(pts) || pts.length < 3) return pts;
  if (mode === 'baseline') return pts;

  const depth = Math.max(0, tileDepth | 0);
  if (depth < 4) return pts;

  let minSpacing =
  depth >= 6 ? 16 :
  depth === 5 ? 12 :
  8;
  if (roadType?.includes('motorway') || roadType?.includes('trunk')) {
    minSpacing *= 0.75;
  } else if (roadType?.includes('service') || roadType?.includes('residential')) {
    minSpacing *= 1.15;
  }

  const maxStraightTurn =
  depth >= 6 ? 0.20 :
  depth === 5 ? 0.24 :
  0.28;

  const out = [pts[0]];
  let lastKept = pts[0];

  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const next = pts[i + 1];

    const dLast = Math.hypot(curr.x - lastKept.x, curr.z - lastKept.z);

    const ax = curr.x - prev.x;
    const az = curr.z - prev.z;
    const bx = next.x - curr.x;
    const bz = next.z - curr.z;
    const al = Math.hypot(ax, az);
    const bl = Math.hypot(bx, bz);

    let turn = 0;
    if (al > 1e-6 && bl > 1e-6) {
      const dot = (ax * bx + az * bz) / (al * bl);
      turn = Math.acos(Math.max(-1, Math.min(1, dot)));
    }

    const isTurn = turn > maxStraightTurn;
    if (!isTurn && dLast < minSpacing) continue;

    out.push(curr);
    lastKept = curr;
  }

  const last = pts[pts.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function createMidLodBuildingMesh(
  pts,
  height,
  avgElevation,
  colorHex = '#7f8ca0',
  {
    buildingType = 'yes',
    buildingSeed = 0
  } = {}
) {
  if (!pts || pts.length < 3) return null;

  let minX = Infinity,maxX = -Infinity,minZ = Infinity,maxZ = -Infinity;
  pts.forEach((p) => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  });

  const w = Math.max(4, maxX - minX);
  const d = Math.max(4, maxZ - minZ);
  const h = Math.max(6, Number.isFinite(height) ? height : 10);

  const footprintPoints =
    pts.length > 18 ?
      decimatePoints(pts, 18, false) :
      pts;
  const shape = new THREE.Shape();
  footprintPoints.forEach((p, i) => {
    if (i === 0) shape.moveTo(p.x, -p.z);
    else shape.lineTo(p.x, -p.z);
  });
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: h,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1
  });
  geo.rotateX(-Math.PI / 2);
  if (!geometryHasFinitePositions(geo)) {
    geo.dispose();
    return null;
  }
  const mat = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.92,
    metalness: 0.02
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, avgElevation, 0);
  mesh.userData.buildingFootprint = pts;
  mesh.userData.localBounds = { minX, maxX, minZ, maxZ };
  mesh.userData.buildingFootprintBounds = mesh.userData.localBounds;
  mesh.userData.midLodHalfHeight = 0;
  mesh.userData.midLodDims = { w, h, d };
  mesh.userData.midLodColor = colorHex;
  mesh.userData.avgElevation = avgElevation;
  mesh.userData.lodTier = 'mid';
  mesh.userData.isBuildingProxy = true;
  mesh.userData.midLodUsesFootprintGeometry = true;
  mesh.userData.midLodBoxProxy = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

function createDetailedBuildingMesh(
  pts,
  height,
  baseElevation,
  {
    buildingType = 'yes',
    buildingSeed = 0,
    baseColor = '#9fa7b2',
    buildingSemantics = null,
    structureSemantics = null
  } = {}
) {
  if (!pts || pts.length < 3) return null;

  let minX = Infinity,maxX = -Infinity,minZ = Infinity,maxZ = -Infinity;
  pts.forEach((p) => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  });

  const shape = new THREE.Shape();
  pts.forEach((p, i) => {
    if (i === 0) shape.moveTo(p.x, -p.z);
    else shape.lineTo(p.x, -p.z);
  });
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  if (!geometryHasFinitePositions(geometry)) {
    geometry.dispose();
    return null;
  }

  const material = typeof appCtx.getBuildingMaterial === 'function' ?
    appCtx.getBuildingMaterial(buildingType, buildingSeed >>> 0, baseColor) :
    new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: 0.85,
      metalness: 0.05
    });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = baseElevation;
  mesh.userData.buildingFootprint = pts;
  mesh.userData.localBounds = { minX, maxX, minZ, maxZ };
  mesh.userData.buildingFootprintBounds = mesh.userData.localBounds;
  mesh.userData.avgElevation = baseElevation;
  mesh.userData.buildingSemantics = buildingSemantics;
  mesh.userData.structureSemantics = structureSemantics;
  mesh.userData.lodTier = 'near';
  mesh.userData.isDetailedBuilding = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function batchMidLodBuildingMeshes() {
  if (!Array.isArray(appCtx.buildingMeshes) || appCtx.buildingMeshes.length === 0) return 0;

  const mids = [];
  const keep = [];
  for (let i = 0; i < appCtx.buildingMeshes.length; i++) {
    const mesh = appCtx.buildingMeshes[i];
    if (
      mesh?.userData?.lodTier === 'mid' &&
      !mesh.userData?.isBuildingBatch &&
      mesh.userData?.midLodBoxProxy === true
    ) {
      mids.push(mesh);
    } else {
      keep.push(mesh);
    }
  }

  if (mids.length < 2) return 0;

  const instGeom = new THREE.BoxGeometry(1, 1, 1);
  const instMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.02
  });
  const instanced = new THREE.InstancedMesh(instGeom, instMat, mids.length);
  instanced.castShadow = false;
  instanced.receiveShadow = true;
  // InstancedMesh bounds can become stale for large-spread instance sets.
  // Keep visible and rely on explicit world LOD gating to avoid pop/disappear artifacts.
  instanced.frustumCulled = false;
  instanced.userData = {
    lodTier: 'mid',
    isBuildingBatch: true,
    isMidBuildingInstanceBatch: true,
    batchCount: mids.length
  };

  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  let sumX = 0;
  let sumZ = 0;
  const instanceXZ = new Array(mids.length);

  for (let i = 0; i < mids.length; i++) {
    const mesh = mids[i];
    const dims = mesh.userData?.midLodDims || { w: 1, h: 1, d: 1 };
    position.set(mesh.position.x, mesh.position.y, mesh.position.z);
    scale.set(dims.w || 1, dims.h || 1, dims.d || 1);
    matrix.compose(position, quat, scale);
    instanced.setMatrixAt(i, matrix);

    const c = mesh.userData?.midLodColor || '#7f8ca0';
    color.set(c);
    instanced.setColorAt(i, color);
    sumX += mesh.position.x;
    sumZ += mesh.position.z;
    instanceXZ[i] = { x: mesh.position.x, z: mesh.position.z };

    appCtx.scene.remove(mesh);
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) mesh.material.dispose();
  }

  const centerX = mids.length > 0 ? sumX / mids.length : 0;
  const centerZ = mids.length > 0 ? sumZ / mids.length : 0;
  let maxRadius = 0;
  for (let i = 0; i < instanceXZ.length; i++) {
    const p = instanceXZ[i];
    if (!p) continue;
    const d = Math.hypot(p.x - centerX, p.z - centerZ);
    if (d > maxRadius) maxRadius = d;
  }
  instanced.userData.lodCenter = { x: centerX, z: centerZ };
  instanced.userData.lodRadius = maxRadius;
  instanced.userData.continuousWorldRegionKeys = mergeContinuousWorldRegionKeysFromTargets(mids);
  instanced.userData.continuousWorldRegionCount = instanced.userData.continuousWorldRegionKeys.length;
  instanced.userData.continuousWorldFeatureFamily = 'buildings';

  instanced.instanceMatrix.needsUpdate = true;
  if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;

  appCtx.scene.add(instanced);
  appCtx.buildingMeshes = [...keep, instanced];
  return mids.length;
}

function latLonToTileFloat(lat, lon, zoom) {
  const n = Math.pow(2, zoom);
  const x = (lon + 180) / 360 * n;
  const y = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n;
  return { x, y };
}

function vectorTileRangeForBounds(latMin, lonMin, latMax, lonMax, zoom) {
  const nw = latLonToTileFloat(latMax, lonMin, zoom);
  const se = latLonToTileFloat(latMin, lonMax, zoom);
  const n = Math.pow(2, zoom) - 1;

  return {
    xMin: Math.max(0, Math.min(n, Math.floor(Math.min(nw.x, se.x)))),
    xMax: Math.max(0, Math.min(n, Math.floor(Math.max(nw.x, se.x)))),
    yMin: Math.max(0, Math.min(n, Math.floor(Math.min(nw.y, se.y)))),
    yMax: Math.max(0, Math.min(n, Math.floor(Math.max(nw.y, se.y))))
  };
}

async function fetchVectorTileWater(z, x, y) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WATER_VECTOR_TILE_FETCH_TIMEOUT_MS);
  try {
    const { Pbf, VectorTile } = await getVectorTileLib();
    const res = await fetch(WATER_VECTOR_TILE_ENDPOINT(z, x, y), { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    const tile = new VectorTile(new Pbf(new Uint8Array(buf)));
    return { tile, z, x, y };
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeWorldRingFromLonLat(coords, maxPoints = 900, guardOptions = null) {
  if (!Array.isArray(coords) || coords.length < 3) return null;
  const pts = [];
  for (let i = 0; i < coords.length; i++) {
    const c = coords[i];
    if (!Array.isArray(c) || c.length < 2) continue;
    const p = appCtx.geoToWorld(c[1], c[0]); // GeoJSON: [lon, lat]
    pts.push(p);
  }
  if (pts.length < 3) return null;
  const ring = sanitizeWorldFootprintPoints(
    decimatePoints(pts, maxPoints, false),
    FEATURE_MIN_POLYGON_AREA,
    guardOptions || undefined
  );
  return ring.length >= 3 ? ring : null;
}

function worldLinePointsFromLonLat(coords, maxPoints = 1000, guardOptions = null) {
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const pts = [];
  for (let i = 0; i < coords.length; i++) {
    const c = coords[i];
    if (!Array.isArray(c) || c.length < 2) continue;
    pts.push(appCtx.geoToWorld(c[1], c[0]));
  }
  if (pts.length < 2) return null;
  const cleaned = sanitizeWorldPathPoints(
    decimatePoints(pts, maxPoints, false),
    guardOptions || undefined
  );
  return cleaned.length >= 2 ? cleaned : null;
}

function classifyLanduseType(tags) {
  return normalizeLanduseSurfaceType(tags);
}

const NON_RENDERED_URBAN_LANDUSE_TYPES = new Set([
  'residential',
  'commercial',
  'industrial',
  'retail',
  'construction',
  'brownfield',
  'greenfield'
]);

function shouldRenderLanduseSurfaceMesh(landuseType = '') {
  const normalized = String(landuseType || '').trim().toLowerCase();
  if (!normalized) return false;
  return !NON_RENDERED_URBAN_LANDUSE_TYPES.has(normalized);
}

function polygonBoundsXZ(pts) {
  if (!Array.isArray(pts) || pts.length < 3) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const point = pts[i];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) continue;
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
    return null;
  }
  return { minX, maxX, minZ, maxZ };
}

function boundsOverlapXZ(a, b, padding = 0) {
  if (!a || !b) return false;
  const pad = Number.isFinite(padding) ? padding : 0;
  return !(
    a.maxX < b.minX - pad ||
    a.minX > b.maxX + pad ||
    a.maxZ < b.minZ - pad ||
    a.minZ > b.maxZ + pad
  );
}

function buildSuppressedParentBuildingIdSet(buildingWays = [], nodes = {}, geometryGuards = null) {
  if (!Array.isArray(buildingWays) || buildingWays.length < 2) return new Set();

  const parentEntries = [];
  const partEntries = [];

  for (let i = 0; i < buildingWays.length; i++) {
    const way = buildingWays[i];
    const sourceId = String(way?.id || '').trim();
    if (!sourceId) continue;
    const isPart = !!way?.tags?.['building:part'];
    const isParent = !!way?.tags?.building && !isPart;
    if (!isPart && !isParent) continue;

    const rawPts = Array.isArray(way?.nodes) ?
      way.nodes.map((id) => nodes[id]).filter(Boolean).map((node) => appCtx.geoToWorld(node.lat, node.lon)) :
      [];
    const pts = sanitizeWorldFootprintPoints(rawPts, FEATURE_MIN_POLYGON_AREA, geometryGuards || undefined);
    if (pts.length < 3) continue;

    const area = Math.abs(signedPolygonAreaXZ(pts));
    if (!Number.isFinite(area) || area < FEATURE_MIN_POLYGON_AREA) continue;

    let centerX = 0;
    let centerZ = 0;
    for (let p = 0; p < pts.length; p++) {
      centerX += pts[p].x;
      centerZ += pts[p].z;
    }
    centerX /= pts.length;
    centerZ /= pts.length;

    const bounds = polygonBoundsXZ(pts);
    if (!bounds) continue;

    const entry = {
      id: sourceId,
      pts,
      area,
      centerX,
      centerZ,
      bounds
    };

    if (isPart) partEntries.push(entry);
    else parentEntries.push(entry);
  }

  if (!parentEntries.length || !partEntries.length) return new Set();

  const suppressed = new Set();
  for (let i = 0; i < parentEntries.length; i++) {
    const parent = parentEntries[i];
    let containedPartCount = 0;
    let coveredArea = 0;

    for (let j = 0; j < partEntries.length; j++) {
      const part = partEntries[j];
      if (!boundsOverlapXZ(parent.bounds, part.bounds, 0.5)) continue;
      if (!pointInPolygon(part.centerX, part.centerZ, parent.pts)) continue;
      containedPartCount += 1;
      coveredArea += Math.min(part.area, parent.area);
    }

    const coverageRatio = parent.area > 0 ? coveredArea / parent.area : 0;
    if (
      containedPartCount >= 2 ||
      (containedPartCount >= 1 && coverageRatio >= 0.4)
    ) {
      suppressed.add(parent.id);
    }
  }

  return suppressed;
}

function polylineBounds(pts, padding = 0) {
  if (!Array.isArray(pts) || pts.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
    return null;
  }
  const pad = Number.isFinite(padding) ? Math.max(0, padding) : 0;
  return {
    minX: minX - pad,
    maxX: maxX + pad,
    minZ: minZ - pad,
    maxZ: maxZ + pad
  };
}

function poiKeyFromTags(tags = {}) {
  if (!tags || typeof tags !== 'object') return null;
  if (tags.amenity) return `amenity=${tags.amenity}`;
  if (tags.shop === 'supermarket') return 'shop=supermarket';
  if (tags.shop === 'mall') return 'shop=mall';
  if (tags.shop === 'convenience') return 'shop=convenience';
  if (tags.tourism) return `tourism=${tags.tourism}`;
  if (tags.historic) return tags.historic === 'monument' ? 'historic=monument' : 'historic=memorial';
  if (tags.leisure) return `leisure=${tags.leisure}`;
  return null;
}

function signedPolygonAreaXZ(pts) {
  if (!pts || pts.length < 3) return 0;
  let area = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    area += pts[j].x * pts[i].z - pts[i].x * pts[j].z;
  }
  return area * 0.5;
}

function decimatePoints(pts, maxPoints, preserveClosedRing = false) {
  if (!pts || pts.length <= maxPoints) return pts;
  if (maxPoints < 3) return pts.slice(0, Math.max(2, maxPoints));

  const out = [];
  const end = preserveClosedRing ? pts.length - 1 : pts.length;
  const step = Math.max(1, Math.ceil((end - 1) / (maxPoints - 1)));
  for (let i = 0; i < end; i += step) out.push(pts[i]);
  if (out[out.length - 1] !== pts[end - 1]) out.push(pts[end - 1]);
  if (preserveClosedRing && pts.length > 2) {
    const first = out[0];
    const last = out[out.length - 1];
    if (first !== last) out.push(first);
  }
  return out;
}

function isFiniteWorldPointXZ(point) {
  return !!point &&
  Number.isFinite(point.x) &&
  Number.isFinite(point.z);
}

function buildFeatureGeometryGuards(featureRadiusDeg = 0.02) {
  const radiusWorld = Math.abs(Number(featureRadiusDeg) || 0) * appCtx.SCALE;
  const clipRadius = clampNumber(
    radiusWorld * FEATURE_CLIP_RADIUS_SCALE,
    FEATURE_CLIP_RADIUS_MIN,
    FEATURE_CLIP_RADIUS_MAX,
    FEATURE_CLIP_RADIUS_MIN
  );
  const maxSegmentLength = clampNumber(
    clipRadius * FEATURE_MAX_SEGMENT_SCALE,
    FEATURE_MAX_SEGMENT_MIN,
    FEATURE_MAX_SEGMENT_MAX,
    FEATURE_MAX_SEGMENT_MAX
  );
  const maxSpan = Math.max(FEATURE_CLIP_RADIUS_MIN, clipRadius * FEATURE_MAX_SPAN_SCALE);
  const maxArea = Math.max(2500000, clipRadius * clipRadius * FEATURE_MAX_AREA_SCALE);
  return {
    maxArea,
    maxDistanceFromOrigin: clipRadius,
    maxSegmentLength,
    maxSpan
  };
}

function buildBuildingGeometryGuards(baseGuards) {
  const guards = baseGuards && typeof baseGuards === 'object' ? baseGuards : buildFeatureGeometryGuards(0.02);
  return {
    ...guards,
    maxArea: Math.min(guards.maxArea, 220000),
    maxSegmentLength: Math.min(guards.maxSegmentLength, 650),
    maxSpan: Math.min(guards.maxSpan, 950)
  };
}

function buildLanduseGeometryGuards(baseGuards) {
  const guards = baseGuards && typeof baseGuards === 'object' ? baseGuards : buildFeatureGeometryGuards(0.02);
  const maxSpan = Math.min(guards.maxSpan, Math.max(1200, guards.maxDistanceFromOrigin * 1.05));
  return {
    ...guards,
    maxArea: Math.min(guards.maxArea, maxSpan * maxSpan * 0.72),
    maxSegmentLength: Math.min(guards.maxSegmentLength, 900),
    maxSpan
  };
}

function buildWaterGeometryGuards(baseGuards) {
  const guards = baseGuards && typeof baseGuards === 'object' ? baseGuards : buildFeatureGeometryGuards(0.02);
  const maxDistanceFromOrigin = Math.min(
    Math.max(guards.maxDistanceFromOrigin * 3.2, 4800),
    FEATURE_CLIP_RADIUS_MAX * 2.8
  );
  const maxSpan = Math.min(
    Math.max(guards.maxSpan * 4.2, 8600),
    Math.max(12000, maxDistanceFromOrigin * 1.65)
  );
  return {
    ...guards,
    maxDistanceFromOrigin,
    maxArea: Math.min(Math.max(guards.maxArea * 12.0, 38000000), maxSpan * maxSpan * 1.45),
    maxSegmentLength: Math.min(Math.max(guards.maxSegmentLength * 4.8, 4200), 6800),
    maxSpan
  };
}

function waterSurfaceBaseElevation(heights) {
  if (!Array.isArray(heights) || heights.length === 0) return 0;
  const finite = heights.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return 0;
  finite.sort((a, b) => a - b);
  const min = finite[0];
  const percentileIdx = Math.max(0, Math.min(finite.length - 1, Math.floor((finite.length - 1) * 0.12)));
  return Math.min(finite[percentileIdx], min + 0.1);
}

function resolveWaterSurfaceVisualProfile(bounds = null) {
  const surfaceProfile = classifyWaterSurfaceProfile({
    bounds,
    worldSurfaceProfile: appCtx.worldSurfaceProfile || null
  });
  if (surfaceProfile.mode === 'ice') {
    return {
      mode: 'ice',
      color: appCtx.LANDUSE_STYLES?.glacier?.color || 0xdfe9f4,
      emissive: 0x8fa6bd,
      emissiveIntensity: 0.1,
      roughness: 0.84,
      metalness: 0.02
    };
  }
  return {
    mode: 'water',
    color: appCtx.LANDUSE_STYLES?.water?.color || 0x4a90e2,
    emissive: 0x0a2542,
    emissiveIntensity: 0.14,
    roughness: 0.44,
    metalness: 0.02
  };
}

function registerWaterWaveMaterial(material, options = {}) {
  if (!material || material.userData?.weWaterWavePatched || typeof THREE === 'undefined') return material;
  const waveScale = Number.isFinite(options.waveScale) ? options.waveScale : 1;
  const waveBase = Number.isFinite(options.waveBase) ? options.waveBase : 1;
  const visualBase = Number.isFinite(options.visualBase) ? options.visualBase : 1;
  const foamBase = Number.isFinite(options.foamBase) ? options.foamBase : 1;
  const edgeFade = Number.isFinite(options.edgeFade) ? options.edgeFade : 0;
  const shaderKey = String(options.shaderKey || 'base');
  const shaderHook = typeof options.shaderHook === 'function' ? options.shaderHook : null;
  const waterKind = inferWaterRenderContext({
    kindHint: options.waterKind,
    area: options.area,
    span: options.span,
    width: options.width
  });
  const shaderLibrary = buildWaterShaderLibrary();
  material.userData.weWaterWavePatched = true;
  material.userData.weWaterWaveConfig = {
    waveScale,
    waveBase,
    visualBase,
    foamBase,
    edgeFade,
    waterKind,
    energyBase: Number.isFinite(options.energyBase) ? options.energyBase : 1,
    shorelineDistance: Number.isFinite(options.shorelineDistance) ? options.shorelineDistance : null,
    localPatch: options.localPatch === true,
    useRuntimeKind: options.useRuntimeKind === true
  };

  const previousOnBeforeCompile = material.onBeforeCompile;
  material.customProgramCacheKey = () =>
    `we3d-water-wave-${waveScale.toFixed(3)}-${waveBase.toFixed(3)}-${edgeFade.toFixed(3)}-${waterKind}-${shaderKey}`;
  material.onBeforeCompile = (shader, renderer) => {
    if (typeof previousOnBeforeCompile === 'function') previousOnBeforeCompile(shader, renderer);
    shader.uniforms.weWaveTime = { value: 0 };
    shader.uniforms.weWaveAmplitude = { value: 0 };
    shader.uniforms.weWaveSecondaryAmplitude = { value: 0 };
    shader.uniforms.weWaveSwellAmplitude = { value: 0 };
    shader.uniforms.weWaveRippleAmplitude = { value: 0 };
    shader.uniforms.weWaveScale = { value: waveScale };
    shader.uniforms.weWaveSpeed = { value: 0.52 };
    shader.uniforms.weWaveVisualStrength = { value: 0.16 };
    shader.uniforms.weWaveFoamStrength = { value: 0.08 };
    shader.uniforms.weWaveEdgeFade = { value: edgeFade };
    material.userData.weWaterWaveShader = shader;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
${shaderLibrary}`
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3(position);
vec4 weWorldPos = modelMatrix * vec4(transformed, 1.0);
vWeWaveWorldXZ = weWorldPos.xz;
#ifdef USE_UV
vWePatchUv = uv;
#else
vWePatchUv = vec2(0.5);
#endif
transformed.y += weWaveField(weWorldPos.xz);`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
${shaderLibrary}`
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec4 diffuseColor = vec4( diffuse, opacity );
float weWaveHeight = weWaveField(vWeWaveWorldXZ);
float weWaveCrestValue = weWaveCrest(vWeWaveWorldXZ);
float weWaveGlint = clamp(0.44 + weWaveHeight * 0.22 + weWaveCrestValue * 0.14, 0.0, 1.0);
float weFoamBands = smoothstep(0.42, 0.94, weWaveCrestValue) * clamp(weWaveFoamStrength, 0.0, 1.8);
float weWhitecapBands = smoothstep(0.72, 1.28, weWaveCrestValue) * clamp(weWaveFoamStrength * 0.62, 0.0, 1.4);
float weSurfaceGrain = 0.5 + 0.5 * sin(vWeWaveWorldXZ.x * 0.085 + weWaveTime * 1.24) * sin(vWeWaveWorldXZ.y * 0.073 - weWaveTime * 1.08);
vec3 weWaveTint = mix(vec3(0.72, 0.79, 0.88), vec3(0.92, 0.98, 1.04), weWaveGlint);
diffuseColor.rgb *= mix(vec3(0.9), weWaveTint, clamp(weWaveVisualStrength * 0.64, 0.0, 1.0));
diffuseColor.rgb *= mix(vec3(0.97), vec3(1.03), weSurfaceGrain * clamp(weWaveVisualStrength * 0.18, 0.0, 0.14));
diffuseColor.rgb += vec3(0.05, 0.07, 0.09) * (weFoamBands * 0.44 + weWhitecapBands * 0.5);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.93, 0.98), clamp(weWhitecapBands * 0.18, 0.0, 0.22));
if (weWaveEdgeFade > 0.0) {
  float weEdge = min(min(vWePatchUv.x, 1.0 - vWePatchUv.x), min(vWePatchUv.y, 1.0 - vWePatchUv.y));
  float wePatchMask = smoothstep(0.0, weWaveEdgeFade, weEdge);
  diffuseColor.a *= wePatchMask;
}`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(0.024, 0.038, 0.054) * max(0.0, weWaveGlint - 0.5) * (weWaveVisualStrength * 1.4);
totalEmissiveRadiance += vec3(0.036, 0.052, 0.072) * (weFoamBands * 0.44 + weWhitecapBands * 0.28) * (weWaveVisualStrength * 0.52);`
      );
    if (shaderHook) shaderHook(shader, { material, waterKind });
  };

  if (Array.isArray(appCtx.waterWaveVisuals)) {
    appCtx.waterWaveVisuals.push(material);
  } else {
    appCtx.waterWaveVisuals = [material];
  }
  material.needsUpdate = true;
  return material;
}

function cacheContinuousWorldSurfaceFeatureHint(pts, landuseType, guardOptions = null, sourceFeatureId = '') {
  if (!pts || pts.length < 3 || !landuseType) return false;
  let ring = sanitizeWorldFootprintPoints(
    pts,
    FEATURE_MIN_POLYGON_AREA,
    guardOptions || undefined
  );
  if (ring.length < 3) return false;
  ring = sanitizeWorldFootprintPoints(
    decimatePoints(ring, 140, false),
    FEATURE_MIN_POLYGON_AREA,
    guardOptions || undefined
  );
  if (ring.length < 3) return false;
  const area = Math.abs(signedPolygonAreaXZ(ring));
  if (!Number.isFinite(area) || area < FEATURE_MIN_POLYGON_AREA) return false;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  ring.forEach((p) => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  });
  appCtx.surfaceFeatureHints.push({
    type: landuseType,
    pts: ring,
    bounds: { minX, maxX, minZ, maxZ },
    sourceFeatureId: sourceFeatureId || null
  });
  return true;
}

function continuousWorldInteractiveWaterwayWidthFromTags(tags) {
  const kind = (tags?.kind || tags?.waterway || '').toString();
  if (kind.includes('ocean') || kind.includes('coast')) return 220;
  if (kind.includes('river')) return 18;
  if (kind.includes('canal')) return 12;
  if (kind.includes('drain')) return 4;
  if (kind.includes('ditch')) return 3;
  if (kind.includes('stream')) return 6;
  return 8;
}

function addContinuousWorldInteractiveLandusePolygon(pts, landuseType, sourceFeatureId = '', holeRings = [], guardOptions = null) {
  if (!pts || pts.length < 3) return { addedMesh: false, addedWater: false };

  let ring = sanitizeWorldFootprintPoints(
    pts,
    FEATURE_MIN_POLYGON_AREA,
    guardOptions || undefined
  );
  if (ring.length < 3) return { addedMesh: false, addedWater: false };
  ring = sanitizeWorldFootprintPoints(
    decimatePoints(ring, 900, false),
    FEATURE_MIN_POLYGON_AREA,
    guardOptions || undefined
  );
  if (ring.length < 3) return { addedMesh: false, addedWater: false };

  const outerArea = Math.abs(signedPolygonAreaXZ(ring));
  if (!Number.isFinite(outerArea) || outerArea < FEATURE_MIN_POLYGON_AREA) {
    return { addedMesh: false, addedWater: false };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  ring.forEach((p) => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  });

  const sampledHeights = [];
  let avgElevation = 0;
  ring.forEach((p) => {
    const sample = appCtx.elevationWorldYAtWorldXZ(p.x, p.z);
    sampledHeights.push(sample);
    avgElevation += sample;
  });
  avgElevation /= ring.length;

  const shape = new THREE.Shape();
  ring.forEach((p, i) => {
    if (i === 0) shape.moveTo(p.x, -p.z);
    else shape.lineTo(p.x, -p.z);
  });
  shape.closePath();

  if (holeRings && holeRings.length > 0) {
    holeRings.forEach((holeRing) => {
      if (!holeRing || holeRing.length < 3) return;
      const cleanedHole = sanitizeWorldFootprintPoints(
        holeRing,
        FEATURE_MIN_HOLE_AREA,
        guardOptions || undefined
      );
      if (cleanedHole.length < 3) return;
      const holeArea = Math.abs(signedPolygonAreaXZ(cleanedHole));
      if (!Number.isFinite(holeArea) || holeArea < FEATURE_MIN_HOLE_AREA) return;
      if (holeArea >= outerArea * 0.92) return;
      const path = new THREE.Path();
      cleanedHole.forEach((p, i) => {
        if (i === 0) path.moveTo(p.x, -p.z);
        else path.lineTo(p.x, -p.z);
      });
      path.closePath();
      shape.holes.push(path);
    });
  }

  const geometry = new THREE.ShapeGeometry(shape, 20);
  geometry.rotateX(-Math.PI / 2);

  const isWater = landuseType === 'water';
  const renderSurfaceMesh = shouldRenderLanduseSurfaceMesh(landuseType) || isWater;
  const waterVisualProfile = isWater ? resolveWaterSurfaceVisualProfile() : null;
  const surfaceBaseElevation = isWater ?
    (Number.isFinite(avgElevation) ? avgElevation : waterSurfaceBaseElevation(sampledHeights)) :
    avgElevation;
  const regionKeys = buildContinuousWorldRegionKeysFromPoints(ring, null, {
    minX,
    maxX,
    minZ,
    maxZ
  });
  let mesh = null;
  if (renderSurfaceMesh) {
    const waterFlattenFactor = isWater ? 0.12 : 1.0;
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      const terrainY = appCtx.elevationWorldYAtWorldXZ(x, z);
      const useY = terrainY === 0 && Math.abs(surfaceBaseElevation) > 2 ? surfaceBaseElevation : terrainY;
      positions.setY(i, (useY - surfaceBaseElevation) * waterFlattenFactor + (isWater ? 0.08 : 0.02));
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();

    const landuseStyle = appCtx.LANDUSE_STYLES?.[landuseType] || appCtx.LANDUSE_STYLES?.grass || { color: 0x7cb342 };
    const material = new THREE.MeshStandardMaterial(isWater ? {
      color: waterVisualProfile?.color || appCtx.LANDUSE_STYLES.water.color,
      emissive: waterVisualProfile?.emissive || 0x0f355a,
      emissiveIntensity: waterVisualProfile?.emissiveIntensity ?? 0.18,
      roughness: waterVisualProfile?.roughness ?? 0.34,
      metalness: waterVisualProfile?.metalness ?? 0.02,
      transparent: false,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -6
    } : {
      color: landuseStyle.color,
      roughness: 0.95,
      metalness: 0.0,
      transparent: true,
      opacity: 0.85,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    if (isWater) {
      registerWaterWaveMaterial(material, {
        waveScale: 1.0,
        waveBase: 1.0,
        area: outerArea,
        span: Math.max(maxX - minX, maxZ - minZ),
        waterKind: inferWaterRenderContext({
          area: outerArea,
          span: Math.max(maxX - minX, maxZ - minZ)
        })
      });
    }

    mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 1;
    mesh.position.y = surfaceBaseElevation;
    mesh.userData.landuseFootprint = ring;
    mesh.userData.avgElevation = surfaceBaseElevation;
    mesh.userData.alwaysVisible = isWater;
    mesh.userData.landuseType = landuseType;
    mesh.userData.waterFlattenFactor = waterFlattenFactor;
    mesh.userData.surfaceVariant = isWater ? waterVisualProfile?.mode || 'water' : landuseType;
    mesh.userData.sourceFeatureId = sourceFeatureId || null;
    mesh.userData.continuousWorldInteractiveChunk = true;
    if (isWater) mesh.userData.waterSurfaceBase = surfaceBaseElevation;
    assignContinuousWorldRegionKeysToTarget(mesh, {
      points: ring,
      family: isWater ? 'water' : 'landuse'
    });
    mesh.receiveShadow = false;
    mesh.visible = appCtx.landUseVisible || mesh.userData.alwaysVisible;
    appCtx.scene.add(mesh);
    appCtx.landuseMeshes.push(mesh);
  } else {
    geometry.dispose();
  }

  appCtx.landuses.push({
    type: landuseType,
    pts: ring,
    bounds: {
      minX,
      maxX,
      minZ,
      maxZ
    },
    sourceFeatureId: sourceFeatureId || null,
    continuousWorldRegionKeys: regionKeys.slice(),
    continuousWorldInteractiveChunk: true
  });
  addLanduseToSpatialIndex(appCtx.landuses[appCtx.landuses.length - 1]);

  if (!isWater) return { addedMesh: true, addedWater: false };

  const centroid = ring.reduce((acc, p) => {
    acc.x += p.x;
    acc.z += p.z;
    return acc;
  }, { x: 0, z: 0 });
  appCtx.waterAreas.push({
    type: 'water',
    pts: ring,
    area: outerArea,
    centerX: centroid.x / ring.length,
    centerZ: centroid.z / ring.length,
    surfaceY: surfaceBaseElevation + 0.08,
    bounds: {
      minX,
      maxX,
      minZ,
      maxZ
    },
    sourceFeatureId: sourceFeatureId || null,
    continuousWorldRegionKeys: Array.isArray(mesh.userData?.continuousWorldRegionKeys) ? mesh.userData.continuousWorldRegionKeys.slice() : [],
    continuousWorldInteractiveChunk: true
  });
  return { addedMesh: true, addedWater: true };
}

function addContinuousWorldInteractiveWaterwayRibbon(pts, tags = {}) {
  if (!pts || pts.length < 2) return false;
  const centerline = decimatePoints(pts, 1000, false);
  if (centerline.length < 2) return false;

  const width = continuousWorldInteractiveWaterwayWidthFromTags(tags);
  const waterwayBounds = polylineBounds(centerline, Math.max(14, width * 0.5 + 18));
  const waterVisualProfile = resolveWaterSurfaceVisualProfile();
  const halfWidth = width * 0.5;
  const verticalBias = 0.14;
  const _h = typeof appCtx.terrainMeshHeightAt === 'function' ? appCtx.terrainMeshHeightAt : appCtx.elevationWorldYAtWorldXZ;
  const verts = [];
  const indices = [];

  for (let i = 0; i < centerline.length; i++) {
    const p = centerline[i];

    let dx;
    let dz;
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
    const leftY = _h(leftX, leftZ) + verticalBias;
    const rightY = _h(rightX, rightZ) + verticalBias;

    verts.push(leftX, leftY, leftZ);
    verts.push(rightX, rightY, rightZ);

    if (i < centerline.length - 1) {
      const vi = i * 2;
      indices.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);
    }
  }

  if (verts.length < 12 || indices.length < 6) return false;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: waterVisualProfile.color,
    emissive: waterVisualProfile.mode === 'ice' ? 0x8fa6bd : 0x0d2b4f,
    emissiveIntensity: waterVisualProfile.mode === 'ice' ? 0.08 : 0.14,
    roughness: waterVisualProfile.mode === 'ice' ? 0.82 : 0.38,
    metalness: waterVisualProfile.mode === 'ice' ? 0.02 : 0.02,
    transparent: false,
    opacity: 1,
    side: THREE.DoubleSide,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4
  });
  registerWaterWaveMaterial(material, {
    waveScale: clampNumber(width / 42, 0.55, 1.1, 0.7),
    waveBase: clampNumber(width / 60, 0.4, 0.85, 0.55),
    width,
    waterKind: inferWaterRenderContext({ width })
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 1;
  mesh.receiveShadow = false;
  mesh.userData.isWaterwayLine = true;
  mesh.userData.alwaysVisible = true;
  mesh.userData.waterwayCenterline = centerline;
  mesh.userData.waterwayWidth = width;
  mesh.userData.waterwayBias = verticalBias;
  mesh.userData.waterwayBounds = waterwayBounds;
  mesh.userData.surfaceVariant = waterVisualProfile.mode;
  mesh.userData.sourceFeatureId = tags?.sourceFeatureId ? String(tags.sourceFeatureId) : null;
  mesh.userData.continuousWorldInteractiveChunk = true;
  assignContinuousWorldRegionKeysToTarget(mesh, {
    points: centerline,
    family: 'water'
  });
  mesh.visible = true;
  appCtx.scene.add(mesh);
  appCtx.landuseMeshes.push(mesh);
  appCtx.waterways.push({
    type: tags?.kind || tags?.waterway || 'waterway',
    width,
    surfaceY: verticalBias,
    pts: centerline,
    bounds: waterwayBounds,
    sourceFeatureId: tags?.sourceFeatureId ? String(tags.sourceFeatureId) : null,
    continuousWorldRegionKeys: Array.isArray(mesh.userData?.continuousWorldRegionKeys) ? mesh.userData.continuousWorldRegionKeys.slice() : [],
    continuousWorldInteractiveChunk: true
  });
  return true;
}

function resolveLinearFeatureBaseY(x, z, kind = 'footway') {
  const terrainY = typeof appCtx.baseTerrainHeightAt === 'function' ?
    appCtx.baseTerrainHeightAt(x, z) :
    typeof appCtx.terrainMeshHeightAt === 'function' ?
      appCtx.terrainMeshHeightAt(x, z) :
    appCtx.elevationWorldYAtWorldXZ(x, z);
  const fallbackTerrain = Number.isFinite(terrainY) ? terrainY : 0;
  const nearestRoad = typeof appCtx.findNearestRoad === 'function' ? appCtx.findNearestRoad(x, z, {
    y: fallbackTerrain + 1.2,
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
    const roadY = sampleFeatureSurfaceY(nearestRoad.road, x, z, nearestRoad);
    if (Number.isFinite(roadY)) return roadY;
    return fallbackTerrain + 0.2;
  }
  return fallbackTerrain;
}

function worldBaseTerrainY(x, z) {
  if (typeof appCtx.baseTerrainHeightAt === 'function') {
    return appCtx.baseTerrainHeightAt(x, z);
  }
  if (typeof appCtx.terrainMeshHeightAt === 'function') {
    return appCtx.terrainMeshHeightAt(x, z);
  }
  return appCtx.elevationWorldYAtWorldXZ(x, z);
}

function structureAwareLinearFeatures() {
  if (!Array.isArray(appCtx.linearFeatures)) return [];
  return appCtx.linearFeatures.filter((feature) => feature?.structureSemantics?.gradeSeparated);
}

function smoothstep01Local(value) {
  const t = Math.max(0, Math.min(1, Number(value) || 0));
  return t * t * (3 - 2 * t);
}

function cloneStructureSemantics(semantics) {
  return semantics ? { ...semantics } : null;
}

function featureBuildingContainmentStats(feature) {
  const points = Array.isArray(feature?.pts) ? feature.pts : null;
  if (!points || points.length < 2 || typeof getNearbyBuildings !== 'function') {
    return {
      total: 0,
      inside: 0,
      near: 0,
      endpointInside: 0,
      insideRatio: 0,
      nearRatio: 0
    };
  }

  const sampleIndices = new Set([
    0,
    points.length - 1,
    Math.floor((points.length - 1) * 0.25),
    Math.floor((points.length - 1) * 0.5),
    Math.floor((points.length - 1) * 0.75)
  ]);

  let total = 0;
  let inside = 0;
  let near = 0;
  let endpointInside = 0;
  for (const index of sampleIndices) {
    const point = points[index];
    if (!point) continue;
    const candidates = getNearbyBuildings(point.x, point.z, 16);
    if (!Array.isArray(candidates) || candidates.length === 0) {
      total += 1;
      continue;
    }

    let insideBuilding = false;
    let nearBuilding = false;
    for (let i = 0; i < candidates.length; i++) {
      const building = candidates[i];
      if (!building) continue;
      const withinBounds =
        point.x >= (Number(building.minX) || 0) - 2.4 &&
        point.x <= (Number(building.maxX) || 0) + 2.4 &&
        point.z >= (Number(building.minZ) || 0) - 2.4 &&
        point.z <= (Number(building.maxZ) || 0) + 2.4;
      if (!withinBounds) continue;
      if (Array.isArray(building.pts) && building.pts.length >= 3 && pointInPolygon(point.x, point.z, building.pts)) {
        insideBuilding = true;
        break;
      }
      nearBuilding = true;
    }

    total += 1;
    if (insideBuilding) {
      inside += 1;
      if (index === 0 || index === points.length - 1) endpointInside += 1;
    } else if (nearBuilding) {
      near += 1;
    }
  }

  return {
    total,
    inside,
    near,
    endpointInside,
    insideRatio: total > 0 ? inside / total : 0,
    nearRatio: total > 0 ? near / total : 0
  };
}

function applyBuildingContextSemanticsToFeature(feature) {
  if (!feature) return;
  if (!feature.baseStructureSemantics) {
    feature.baseStructureSemantics = cloneStructureSemantics(feature.structureSemantics);
  }

  const baseSemantics = feature.baseStructureSemantics || feature.structureSemantics || null;
  if (!baseSemantics) return;

  const stats = featureBuildingContainmentStats(feature);
  const embeddedInBuilding =
    baseSemantics.terrainMode === 'elevated' &&
    !baseSemantics.isBridge &&
    stats.total > 0 &&
    (
      stats.insideRatio >= 0.62 ||
      (
        stats.endpointInside >= 1 &&
        (stats.inside + stats.near) >= Math.max(3, Math.ceil(stats.total * 0.72))
      )
    );

  if (!embeddedInBuilding) {
    feature.structureSemantics = {
      ...cloneStructureSemantics(baseSemantics),
      embeddedInBuilding: false
    };
    if (feature.isStructureConnector === true) {
      feature.isStructureConnector = feature.structureSemantics.gradeSeparated || feature.structureSemantics.skywalk === true;
    }
    return;
  }

  const coveredLike = baseSemantics.covered || baseSemantics.indoor;
  feature.structureSemantics = {
    ...cloneStructureSemantics(baseSemantics),
    structureKind: coveredLike ? 'covered' : 'at_grade',
    terrainMode: 'at_grade',
    gradeSeparated: false,
    skywalk: false,
    verticalOrder: 0,
    deckClearance: 0,
    cutDepth: 0,
    embeddedInBuilding: true,
    verticalGroup: `at_grade:0:${coveredLike ? 'covered' : 'at_grade'}`
  };
  if (feature.isStructureConnector === true) feature.isStructureConnector = false;
}

function normalizeStructureEndpointHeights(structureFeatures) {
  if (!Array.isArray(structureFeatures) || structureFeatures.length === 0) return;

  const normalizedRoadString = (value = '') => String(value || '').trim().toLowerCase();
  const featureTypeFamilyLocal = (feature) => normalizedRoadString(feature?.type || feature?.subtype || feature?.structureTags?.highway || '').replace(/_link$/i, '');
  const featureNameKeyLocal = (feature) => normalizedRoadString(feature?.name || feature?.structureTags?.name || '');
  const endpointGroupKey = (feature, endpointIndex, point, semantics) => {
    let groupKey = semantics?.verticalGroup || semantics?.terrainMode || 'structure';
    const hasTransitionAnchors = Array.isArray(feature?.structureTransitionAnchors) && feature.structureTransitionAnchors.length > 0;
    const eligibleApproach =
      !semantics?.gradeSeparated &&
      !roadBehavesGradeSeparated(feature) &&
      hasTransitionAnchors;
    if (eligibleApproach) {
      const links =
        endpointIndex === 0 ?
          (Array.isArray(feature?.connectedFeatures?.start) ? feature.connectedFeatures.start : []) :
          (Array.isArray(feature?.connectedFeatures?.end) ? feature.connectedFeatures.end : []);
      for (let i = 0; i < links.length; i++) {
        const other = links[i]?.feature || null;
        const otherSemantics = other?.structureSemantics || null;
        if (!other || !otherSemantics) continue;
        if (!(otherSemantics.gradeSeparated || roadBehavesGradeSeparated(other))) continue;
        const sameName = featureNameKeyLocal(feature) && featureNameKeyLocal(feature) === featureNameKeyLocal(other);
        const sameFamily = featureTypeFamilyLocal(feature) && featureTypeFamilyLocal(feature) === featureTypeFamilyLocal(other);
        const alignment = roadConnectionAlignment(feature, endpointIndex === 0 ? 'start' : 'end', other, Number(links[i]?.endpointIndex) || 0);
        const otherLinkLike =
          otherSemantics?.rampCandidate === true ||
          /_link$/i.test(String(other?.type || '')) ||
          normalizedRoadString(otherSemantics?.placement) === 'transition';
        const alignedRampApproach = otherLinkLike && links.length <= 3 && alignment >= 0.68;
        if (!sameName && !sameFamily && !alignedRampApproach) continue;
        groupKey = otherSemantics.verticalGroup || otherSemantics.terrainMode || groupKey;
        break;
      }
    }
    return `${Math.round(point.x * 10)},${Math.round(point.z * 10)}:${groupKey}`;
  };

  const endpointGroups = new Map();
  for (let i = 0; i < structureFeatures.length; i++) {
    const feature = structureFeatures[i];
    const semantics = feature?.structureSemantics;
    const points = Array.isArray(feature?.pts) ? feature.pts : null;
    const heights = feature?.surfaceHeights;
    const distances = feature?.surfaceDistances;
    const hasTransitionAnchors = Array.isArray(feature?.structureTransitionAnchors) && feature.structureTransitionAnchors.length > 0;
    const weldEligible = semantics?.gradeSeparated || roadBehavesGradeSeparated(feature) || hasTransitionAnchors;
    if (!weldEligible || !points || points.length < 2 || !(heights instanceof Float32Array) || !(distances instanceof Float32Array)) continue;
    const entries = [
      { index: 0, point: points[0] },
      { index: points.length - 1, point: points[points.length - 1] }
    ];
    for (let e = 0; e < entries.length; e++) {
      const entry = entries[e];
      const point = entry.point;
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) continue;
      const key = endpointGroupKey(feature, entry.index, point, semantics);
      let group = endpointGroups.get(key);
      if (!group) {
        group = [];
        endpointGroups.set(key, group);
      }
      group.push({ feature, endpointIndex: entry.index, y: Number(heights[entry.index]) || 0 });
    }
  }

  endpointGroups.forEach((entries) => {
    if (!Array.isArray(entries) || entries.length < 2) return;
    const averageY = entries.reduce((sum, entry) => sum + entry.y, 0) / entries.length;
    let averageWidth = 0;
    let rampLikeGroup = false;
    let anchoredGroup = false;
    const nameCounts = new Map();
    const familyCounts = new Map();
    for (let i = 0; i < entries.length; i++) {
      const feature = entries[i]?.feature || null;
      averageWidth += Math.max(4, Number(feature?.width) || 6);
      if (roadBehavesGradeSeparated(feature)) rampLikeGroup = true;
      if (Array.isArray(feature?.structureTransitionAnchors) && feature.structureTransitionAnchors.length > 0) anchoredGroup = true;
      const nameKey = featureNameKeyLocal(feature);
      const familyKey = featureTypeFamilyLocal(feature);
      if (nameKey) nameCounts.set(nameKey, (nameCounts.get(nameKey) || 0) + 1);
      if (familyKey) familyCounts.set(familyKey, (familyCounts.get(familyKey) || 0) + 1);
    }
    averageWidth /= Math.max(1, entries.length);
    const namedContinuationGroup =
      [...nameCounts.values()].some((count) => count > 1) ||
      [...familyCounts.values()].some((count) => count > 1);
    for (let i = 0; i < entries.length; i++) {
      const { feature, endpointIndex } = entries[i];
      const heights = feature?.surfaceHeights;
      const distances = feature?.surfaceDistances;
      if (!(heights instanceof Float32Array) || !(distances instanceof Float32Array) || heights.length !== distances.length) continue;
      const lastIndex = heights.length - 1;
      const anchorIndex = endpointIndex === 0 ? 0 : lastIndex;
      const delta = averageY - (Number(heights[anchorIndex]) || 0);
      if (Math.abs(delta) < 0.01) continue;
      const blendDistance =
        rampLikeGroup ?
          Math.max(22, Math.min(72, averageWidth * 4.6)) :
        anchoredGroup && namedContinuationGroup ?
          Math.max(24, Math.min(56, averageWidth * 4.2)) :
        anchoredGroup ?
          Math.max(18, Math.min(42, averageWidth * 3.5)) :
          Math.max(12, Math.min(28, (Number(feature.width) || 6) * 2.6));
      const totalDistance = Number(distances[lastIndex]) || 0;
      for (let h = 0; h < heights.length; h++) {
        const distanceFromEndpoint = endpointIndex === 0 ?
          (Number(distances[h]) || 0) :
          Math.max(0, totalDistance - (Number(distances[h]) || 0));
        if (distanceFromEndpoint > blendDistance) continue;
        const weight = 1 - smoothstep01Local(distanceFromEndpoint / Math.max(1, blendDistance));
        heights[h] += delta * weight;
      }
      feature.structureSurfaceMinY = heights.reduce((best, value) => Math.min(best, value), Infinity);
      feature.structureSurfaceMaxY = heights.reduce((best, value) => Math.max(best, value), -Infinity);
    }
  });
}

function weldStructureEndpointProfiles(structureFeatures) {
  if (!Array.isArray(structureFeatures) || structureFeatures.length === 0) return;

  const normalizedRoadString = (value = '') => String(value || '').trim().toLowerCase();
  const featureTypeFamilyLocal = (feature) => normalizedRoadString(feature?.type || feature?.subtype || feature?.structureTags?.highway || '').replace(/_link$/i, '');
  const featureNameKeyLocal = (feature) => normalizedRoadString(feature?.name || feature?.structureTags?.name || '');
  const endpointWeldGroupKey = (feature, endpointIndex, point, semantics) => {
    let groupKey = semantics?.verticalGroup || semantics?.terrainMode || 'structure';
    const hasTransitionAnchors = Array.isArray(feature?.structureTransitionAnchors) && feature.structureTransitionAnchors.length > 0;
    const eligibleApproach =
      !semantics?.gradeSeparated &&
      !roadBehavesGradeSeparated(feature) &&
      hasTransitionAnchors;
    if (eligibleApproach) {
      const links =
        endpointIndex === 0 ?
          (Array.isArray(feature?.connectedFeatures?.start) ? feature.connectedFeatures.start : []) :
          (Array.isArray(feature?.connectedFeatures?.end) ? feature.connectedFeatures.end : []);
      for (let i = 0; i < links.length; i++) {
        const other = links[i]?.feature || null;
        const otherSemantics = other?.structureSemantics || null;
        if (!other || !otherSemantics) continue;
        if (!(otherSemantics.gradeSeparated || roadBehavesGradeSeparated(other))) continue;
        const sameName = featureNameKeyLocal(feature) && featureNameKeyLocal(feature) === featureNameKeyLocal(other);
        const sameFamily = featureTypeFamilyLocal(feature) && featureTypeFamilyLocal(feature) === featureTypeFamilyLocal(other);
        const alignment = roadConnectionAlignment(feature, endpointIndex === 0 ? 'start' : 'end', other, Number(links[i]?.endpointIndex) || 0);
        const otherLinkLike =
          otherSemantics?.rampCandidate === true ||
          /_link$/i.test(String(other?.type || '')) ||
          normalizedRoadString(otherSemantics?.placement) === 'transition';
        const alignedRampApproach = otherLinkLike && links.length <= 3 && alignment >= 0.68;
        if (!sameName && !sameFamily && !alignedRampApproach) continue;
        groupKey = otherSemantics.verticalGroup || otherSemantics.terrainMode || groupKey;
        break;
      }
    }
    return `${Math.round(point.x * 10)},${Math.round(point.z * 10)}:${groupKey}`;
  };

  const endpointGroups = new Map();
  for (let i = 0; i < structureFeatures.length; i++) {
    const feature = structureFeatures[i];
    const semantics = feature?.structureSemantics;
    const points = Array.isArray(feature?.pts) ? feature.pts : null;
    const heights = feature?.surfaceHeights;
    const distances = feature?.surfaceDistances;
    const hasTransitionAnchors = Array.isArray(feature?.structureTransitionAnchors) && feature.structureTransitionAnchors.length > 0;
    const weldEligible = semantics?.gradeSeparated || roadBehavesGradeSeparated(feature) || hasTransitionAnchors;
    if (!weldEligible || !points || points.length < 2 || !(heights instanceof Float32Array) || !(distances instanceof Float32Array)) continue;
    const entries = [
      { endpointIndex: 0, point: points[0] },
      { endpointIndex: points.length - 1, point: points[points.length - 1] }
    ];
    for (let e = 0; e < entries.length; e++) {
      const entry = entries[e];
      const point = entry.point;
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) continue;
      const key = endpointWeldGroupKey(feature, entry.endpointIndex, point, semantics);
      let group = endpointGroups.get(key);
      if (!group) {
        group = [];
        endpointGroups.set(key, group);
      }
      group.push({
        feature,
        endpointIndex: entry.endpointIndex
      });
    }
  }

  const sampleHeightIntoFeature = (feature, endpointIndex, offsetDistance) => {
    const distances = feature?.surfaceDistances;
    const heights = feature?.surfaceHeights;
    if (!(distances instanceof Float32Array) || !(heights instanceof Float32Array) || distances.length !== heights.length || distances.length === 0) {
      return NaN;
    }
    const totalDistance = Number(distances[distances.length - 1]) || 0;
    const sampleDistance = endpointIndex === 0 ?
      Math.max(0, Math.min(totalDistance, offsetDistance)) :
      Math.max(0, totalDistance - Math.max(0, Math.min(totalDistance, offsetDistance)));
    return sampleProfileAtDistance(distances, heights, sampleDistance);
  };

  endpointGroups.forEach((entries) => {
    if (!Array.isArray(entries) || entries.length < 2) return;
    let averageWidth = 0;
    let rampLikeGroup = false;
    let anchoredGroup = false;
    const nameCounts = new Map();
    const familyCounts = new Map();
    for (let i = 0; i < entries.length; i++) {
      const feature = entries[i]?.feature || null;
      averageWidth += Math.max(4, Number(feature?.width) || 6);
      if (roadBehavesGradeSeparated(feature)) rampLikeGroup = true;
      if (Array.isArray(feature?.structureTransitionAnchors) && feature.structureTransitionAnchors.length > 0) anchoredGroup = true;
      const nameKey = featureNameKeyLocal(feature);
      const familyKey = featureTypeFamilyLocal(feature);
      if (nameKey) nameCounts.set(nameKey, (nameCounts.get(nameKey) || 0) + 1);
      if (familyKey) familyCounts.set(familyKey, (familyCounts.get(familyKey) || 0) + 1);
    }
    averageWidth /= Math.max(1, entries.length);
    const namedContinuationGroup =
      [...nameCounts.values()].some((count) => count > 1) ||
      [...familyCounts.values()].some((count) => count > 1);
    const blendDistance =
      rampLikeGroup ?
        Math.max(34, Math.min(96, averageWidth * 5.2)) :
      anchoredGroup && namedContinuationGroup ?
        Math.max(34, Math.min(84, averageWidth * 4.8)) :
      anchoredGroup ?
        Math.max(28, Math.min(68, averageWidth * 4.1)) :
        Math.max(22, Math.min(58, averageWidth * 3.9));

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const feature = entry.feature;
      const heights = feature?.surfaceHeights;
      const distances = feature?.surfaceDistances;
      if (!(heights instanceof Float32Array) || !(distances instanceof Float32Array) || heights.length !== distances.length || heights.length < 2) continue;
      const lastIndex = heights.length - 1;
      const totalDistance = Number(distances[lastIndex]) || 0;
      for (let h = 0; h < heights.length; h++) {
        const distanceFromEndpoint = entry.endpointIndex === 0 ?
          (Number(distances[h]) || 0) :
          Math.max(0, totalDistance - (Number(distances[h]) || 0));
        if (distanceFromEndpoint > blendDistance) continue;
        let targetSum = 0;
        let targetCount = 0;
        for (let j = 0; j < entries.length; j++) {
          const targetHeight = sampleHeightIntoFeature(entries[j].feature, entries[j].endpointIndex, distanceFromEndpoint);
          if (!Number.isFinite(targetHeight)) continue;
          targetSum += targetHeight;
          targetCount += 1;
        }
        if (targetCount < 2) continue;
        const averageHeight = targetSum / targetCount;
        const weight = 1 - smoothstep01Local(distanceFromEndpoint / Math.max(1, blendDistance));
        heights[h] = heights[h] * (1 - weight) + averageHeight * weight;
      }
      feature.structureSurfaceMinY = heights.reduce((best, value) => Math.min(best, value), Infinity);
      feature.structureSurfaceMaxY = heights.reduce((best, value) => Math.max(best, value), -Infinity);
    }
  });
}

function smoothStructureSurfaceProfiles(structureFeatures) {
  if (!Array.isArray(structureFeatures) || structureFeatures.length === 0) return;

  for (let i = 0; i < structureFeatures.length; i++) {
    const feature = structureFeatures[i];
    const semantics = feature?.structureSemantics;
    const heights = feature?.surfaceHeights;
    const distances = feature?.surfaceDistances;
    const hasTransitionAnchors = Array.isArray(feature?.structureTransitionAnchors) && feature.structureTransitionAnchors.length > 0;
    const rampProfile = hasTransitionAnchors && (semantics?.rampCandidate || roadBehavesGradeSeparated(feature));
    if ((!semantics?.gradeSeparated && !hasTransitionAnchors) || !(heights instanceof Float32Array) || !(distances instanceof Float32Array) || heights.length < 4) continue;

    const smoothed = new Float32Array(heights);
    const passes =
      semantics.terrainMode === 'elevated' ?
        (rampProfile ? 7 : 3) :
      semantics.terrainMode === 'subgrade' ?
        (rampProfile ? 4 : 2) :
      rampProfile ?
        5 :
      hasTransitionAnchors ?
        2 :
        1;
    const transitionAnchors = Array.isArray(feature?.structureTransitionAnchors) ? feature.structureTransitionAnchors : [];
    for (let pass = 0; pass < passes; pass++) {
      const next = new Float32Array(smoothed);
      const lastIndex = smoothed.length - 1;
      for (let h = 1; h < lastIndex; h++) {
        const current = smoothed[h];
        const neighborAverage = (smoothed[h - 1] + smoothed[h + 1]) * 0.5;
        let blend =
          semantics?.terrainMode === 'elevated' ? (rampProfile ? 0.42 : 0.46) :
          semantics?.terrainMode === 'subgrade' ? (rampProfile ? 0.38 : 0.4) :
          hasTransitionAnchors ? (rampProfile ? 0.32 : 0.26) :
          0.42;
        if (Array.isArray(feature.structureStations) && feature.structureStations.length > 0) {
          const distance = Number(distances[h]) || 0;
          let nearestWeight = Infinity;
          for (let s = 0; s < feature.structureStations.length; s++) {
            const station = feature.structureStations[s];
            const stationSpan = Math.max(1, Number(station?.span) || 1);
            const normalizedDistance = Math.abs(distance - (Number(station?.distance) || 0)) / stationSpan;
            nearestWeight = Math.min(nearestWeight, normalizedDistance);
          }
          if (nearestWeight < 0.35) blend = semantics?.terrainMode === 'elevated' ? 0.16 : 0.18;
          else if (nearestWeight < 0.7) blend = semantics?.terrainMode === 'elevated' ? 0.24 : 0.28;
        }
        if (transitionAnchors.length > 0 && rampProfile) {
          const distance = Number(distances[h]) || 0;
          let nearestTransition = Infinity;
          for (let t = 0; t < transitionAnchors.length; t++) {
            const anchorDistance = Number(transitionAnchors[t]?.distance);
            const anchorSpan = Math.max(1, Number(transitionAnchors[t]?.span) || 1);
            if (!Number.isFinite(anchorDistance)) continue;
            nearestTransition = Math.min(nearestTransition, Math.abs(distance - anchorDistance) / anchorSpan);
          }
          if (nearestTransition < 0.35) blend = Math.max(blend, semantics?.terrainMode === 'subgrade' ? 0.54 : 0.62);
          else if (nearestTransition < 0.7) blend = Math.max(blend, semantics?.terrainMode === 'subgrade' ? 0.46 : 0.54);
        }
        next[h] = current * (1 - blend) + neighborAverage * blend;
      }
      smoothed.set(next);
    }
    heights.set(smoothed);
    feature.structureSurfaceMinY = heights.reduce((best, value) => Math.min(best, value), Infinity);
    feature.structureSurfaceMaxY = heights.reduce((best, value) => Math.max(best, value), -Infinity);
  }
}

function refreshStructureAwareFeatureProfiles() {
  const roadFeatures = Array.isArray(appCtx.roads) ? appCtx.roads : [];
  const connectorFeatures = structureAwareLinearFeatures();
  const transportFeatures = roadFeatures.concat(connectorFeatures);

  for (let i = 0; i < transportFeatures.length; i++) {
    applyBuildingContextSemanticsToFeature(transportFeatures[i]);
  }

  if (Array.isArray(appCtx.linearFeatureMeshes)) {
    for (let i = 0; i < appCtx.linearFeatureMeshes.length; i++) {
      const mesh = appCtx.linearFeatureMeshes[i];
      const feature = mesh?.userData?.linearFeatureRef || null;
      if (!mesh || !feature) continue;
      mesh.userData.structureConnector = feature.isStructureConnector === true;
      mesh.userData.structureSemantics = feature.structureSemantics || null;
    }
  }

  const structureFeatures = transportFeatures.filter((feature) => feature?.structureSemantics?.gradeSeparated);

  assignFeatureConnections(transportFeatures);

  for (let i = 0; i < structureFeatures.length; i++) {
    const feature = structureFeatures[i];
    if (!feature?.structureSemantics?.gradeSeparated) continue;
    feature.structureStations = buildFeatureStations(feature, {
      features: structureFeatures,
      waterAreas: appCtx.waterAreas
    });
  }

  for (let i = 0; i < structureFeatures.length; i++) {
    const feature = structureFeatures[i];
    if (!feature) continue;
    updateFeatureSurfaceProfile(feature, worldBaseTerrainY, {
      surfaceBias: Number.isFinite(feature.surfaceBias) ? feature.surfaceBias : 0.42
    });
  }

  for (let i = 0; i < transportFeatures.length; i++) {
    const feature = transportFeatures[i];
    if (!feature) continue;
    buildFeatureTransitionAnchors(feature, worldBaseTerrainY);
  }

  for (let i = 0; i < transportFeatures.length; i++) {
    const feature = transportFeatures[i];
    if (!feature) continue;
    const hasTransitionAnchors = Array.isArray(feature.structureTransitionAnchors) && feature.structureTransitionAnchors.length > 0;
    if (!feature?.structureSemantics?.gradeSeparated && !hasTransitionAnchors) continue;
    updateFeatureSurfaceProfile(feature, worldBaseTerrainY, {
      surfaceBias: Number.isFinite(feature.surfaceBias) ? feature.surfaceBias : 0.42
    });
  }

  // Run one extra anchor/profile pass so newly anchored at-grade approach roads
  // can feed their updated endpoint heights back into adjacent elevated segments.
  for (let i = 0; i < transportFeatures.length; i++) {
    const feature = transportFeatures[i];
    if (!feature) continue;
    buildFeatureTransitionAnchors(feature, worldBaseTerrainY);
  }

  const settledProfiledFeatures = [];
  for (let i = 0; i < transportFeatures.length; i++) {
    const feature = transportFeatures[i];
    if (!feature) continue;
    const hasTransitionAnchors = Array.isArray(feature.structureTransitionAnchors) && feature.structureTransitionAnchors.length > 0;
    if (!feature?.structureSemantics?.gradeSeparated && !hasTransitionAnchors) continue;
    updateFeatureSurfaceProfile(feature, worldBaseTerrainY, {
      surfaceBias: Number.isFinite(feature.surfaceBias) ? feature.surfaceBias : 0.42
    });
    settledProfiledFeatures.push(feature);
  }

  normalizeStructureEndpointHeights(settledProfiledFeatures);
  smoothStructureSurfaceProfiles(settledProfiledFeatures);
  weldStructureEndpointProfiles(settledProfiledFeatures);
  smoothStructureSurfaceProfiles(settledProfiledFeatures);
  normalizeStructureEndpointHeights(settledProfiledFeatures);

  if (structureFeatures.length > 0) {
    appCtx.structureTerrainCuts = structureFeatures
      .filter((feature) => feature?.structureSemantics?.terrainMode === 'subgrade')
      .map((feature) => ({
        feature,
        pts: feature.pts,
        width: Math.max(7.2, (Number(feature.width) || 6) + 5.0),
        clearance: Math.max(4.2, Number(feature?.structureSemantics?.cutDepth) ? 3.7 + Math.min(4.1, Number(feature.structureSemantics.cutDepth) * 0.56) : 4.2),
        portalLength: Math.max(22, Math.min(60, (Number(feature.width) || 6) * 3.5)),
        bounds: feature.bounds
      }));
  } else {
    appCtx.structureTerrainCuts = [];
  }
}

function syncLinearFeatureOverlayVisibility() {
  const visible = ENABLE_LINEAR_FEATURES && appCtx.showPathOverlays !== false;
  if (!Array.isArray(appCtx.linearFeatureMeshes)) return;
  for (let i = 0; i < appCtx.linearFeatureMeshes.length; i++) {
    const mesh = appCtx.linearFeatureMeshes[i];
    if (mesh) {
      const alwaysVisible = mesh.userData?.structureConnector === true;
      mesh.visible = !mesh.userData?.boatSuppressed && (alwaysVisible || visible);
    }
  }
}

function pointToSegmentDistanceXZ(x, z, p1, p2) {
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

function distanceToPolygonEdgeXZ(x, z, pts) {
  if (!Array.isArray(pts) || pts.length < 2) return 0;
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const dist = pointToSegmentDistanceXZ(x, z, pts[i], pts[(i + 1) % pts.length]);
    if (dist < best) best = dist;
  }
  return Number.isFinite(best) ? best : 0;
}

function sanitizeWorldPathPoints(pts, options = {}) {
  if (!Array.isArray(pts) || pts.length < 2) return [];
  const maxDistanceFromOrigin = Number.isFinite(options.maxDistanceFromOrigin) ?
  Math.max(32, options.maxDistanceFromOrigin) :
  Infinity;
  const maxSegmentLength = Number.isFinite(options.maxSegmentLength) ?
  Math.max(12, options.maxSegmentLength) :
  Infinity;
  const cleaned = [];

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (!isFiniteWorldPointXZ(p)) continue;
    if (Math.hypot(p.x, p.z) > maxDistanceFromOrigin) continue;

    if (cleaned.length > 0) {
      const prev = cleaned[cleaned.length - 1];
      const segLen = Math.hypot(p.x - prev.x, p.z - prev.z);
      if (segLen <= 1e-4) continue;
      if (segLen > maxSegmentLength) return [];
    }
    cleaned.push({ x: p.x, z: p.z });
  }

  return cleaned.length >= 2 ? cleaned : [];
}

function sanitizeWorldFootprintPoints(pts, minArea = FEATURE_MIN_POLYGON_AREA, options = {}) {
  if (!Array.isArray(pts) || pts.length < 3) return [];
  const maxDistanceFromOrigin = Number.isFinite(options.maxDistanceFromOrigin) ?
  Math.max(32, options.maxDistanceFromOrigin) :
  Infinity;
  const maxSegmentLength = Number.isFinite(options.maxSegmentLength) ?
  Math.max(12, options.maxSegmentLength) :
  Infinity;
  const maxSpan = Number.isFinite(options.maxSpan) ?
  Math.max(40, options.maxSpan) :
  Infinity;
  const maxArea = Number.isFinite(options.maxArea) ?
  Math.max(200, options.maxArea) :
  Infinity;
  const cleaned = [];

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (!isFiniteWorldPointXZ(p)) continue;
    if (Math.hypot(p.x, p.z) > maxDistanceFromOrigin) continue;

    if (cleaned.length > 0) {
      const prev = cleaned[cleaned.length - 1];
      const segLen = Math.hypot(p.x - prev.x, p.z - prev.z);
      if (segLen <= 1e-4) continue;
      if (segLen > maxSegmentLength) return [];
    }
    cleaned.push({ x: p.x, z: p.z });
  }

  if (cleaned.length >= 2) {
    const first = cleaned[0];
    const last = cleaned[cleaned.length - 1];
    const closeLen = Math.hypot(first.x - last.x, first.z - last.z);
    if (closeLen <= 1e-4) {
      cleaned.pop();
    } else if (closeLen > maxSegmentLength * 1.35) {
      return [];
    }
  }

  if (cleaned.length < 3) return [];

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < cleaned.length; i++) {
    const p = cleaned[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }

  if ((maxX - minX) > maxSpan || (maxZ - minZ) > maxSpan) return [];

  const area = Math.abs(signedPolygonAreaXZ(cleaned));
  if (area < minArea || area > maxArea) return [];
  return cleaned;
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
    const addedVerts = verts.length / 3;
    for (let i = 0; i < addedVerts; i++) {
      targetIndices.push(baseVertex + i);
    }
  }
}

function geometryHasFinitePositions(geometry) {
  const arr = geometry?.attributes?.position?.array;
  if (!arr || !Number.isFinite(arr.length)) return false;
  for (let i = 0; i < arr.length; i++) {
    if (!Number.isFinite(arr[i])) return false;
  }
  return true;
}

function materialBatchKey(material) {
  if (!material || Array.isArray(material)) return null;
  const colorHex = material.color ? material.color.getHexString() : '';
  const emissiveHex = material.emissive ? material.emissive.getHexString() : '';
  const mapId = material.map ? material.map.uuid : '-';
  const normalId = material.normalMap ? material.normalMap.uuid : '-';
  const roughnessId = material.roughnessMap ? material.roughnessMap.uuid : '-';
  return [
  material.type || '',
  mapId,
  normalId,
  roughnessId,
  colorHex,
  emissiveHex,
  Number(material.emissiveIntensity || 0).toFixed(3),
  Number(material.roughness || 0).toFixed(3),
  Number(material.metalness || 0).toFixed(3),
  material.transparent ? 1 : 0,
  Number(material.opacity ?? 1).toFixed(3),
  material.side ?? 0,
  material.depthWrite ? 1 : 0,
  material.depthTest ? 1 : 0,
  material.polygonOffset ? 1 : 0,
  Number(material.polygonOffsetFactor || 0).toFixed(3),
  Number(material.polygonOffsetUnits || 0).toFixed(3)].
  join('|');
}

function appendGeometryWithTransform(batch, geometry, matrix) {
  if (!geometry?.attributes?.position) return 0;

  const posAttr = geometry.attributes.position;
  const normAttr = geometry.attributes.normal;
  const uvAttr = geometry.attributes.uv;
  const baseVertex = batch.positions.length / 3;
  const startPos = batch.positions.length;
  const startNormals = batch.normals.length;
  const startUvs = batch.uvs.length;
  const startIdx = batch.indices.length;

  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();

  const rollback = () => {
    batch.positions.length = startPos;
    batch.normals.length = startNormals;
    batch.uvs.length = startUvs;
    batch.indices.length = startIdx;
  };

  for (let i = 0; i < posAttr.count; i++) {
    v.fromBufferAttribute(posAttr, i).applyMatrix4(matrix);
    if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) {
      rollback();
      return -1;
    }
    batch.positions.push(v.x, v.y, v.z);

    if (normAttr) {
      n.fromBufferAttribute(normAttr, i).applyMatrix3(normalMatrix).normalize();
      if (Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.z)) {
        batch.normals.push(n.x, n.y, n.z);
      } else {
        batch.normals.push(0, 1, 0);
      }
    } else {
      batch.normals.push(0, 1, 0);
    }

    if (uvAttr) {
      const u = uvAttr.getX(i);
      const vUv = uvAttr.getY(i);
      batch.uvs.push(Number.isFinite(u) ? u : 0, Number.isFinite(vUv) ? vUv : 0);
    } else {
      batch.uvs.push(0, 0);
    }
  }

  if (geometry.index) {
    const indexArr = geometry.index.array;
    for (let i = 0; i < indexArr.length; i++) {
      const idx = Number(indexArr[i]);
      if (!Number.isFinite(idx) || idx < 0 || idx >= posAttr.count) {
        rollback();
        return -1;
      }
      batch.indices.push(idx + baseVertex);
    }
  } else {
    for (let i = 0; i < posAttr.count; i++) {
      batch.indices.push(baseVertex + i);
    }
  }

  return posAttr.count;
}

function buildMergedGeometry(batch) {
  if (!batch.positions.length || !batch.indices.length) return null;
  if (batch.positions.length % 3 !== 0 || batch.normals.length % 3 !== 0 || batch.uvs.length % 2 !== 0) return null;
  if (batch.normals.length !== batch.positions.length) return null;
  if (batch.uvs.length !== batch.positions.length / 3 * 2) return null;

  for (let i = 0; i < batch.positions.length; i++) {
    if (!Number.isFinite(batch.positions[i])) return null;
  }
  for (let i = 0; i < batch.normals.length; i++) {
    if (!Number.isFinite(batch.normals[i])) return null;
  }
  for (let i = 0; i < batch.uvs.length; i++) {
    if (!Number.isFinite(batch.uvs[i])) return null;
  }
  const vertexCount = batch.positions.length / 3;
  for (let i = 0; i < batch.indices.length; i++) {
    const idx = batch.indices[i];
    if (!Number.isFinite(idx) || idx < 0 || idx >= vertexCount) return null;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(batch.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(batch.normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(batch.uvs, 2));

  const indexArray = vertexCount > 65535 ? new Uint32Array(batch.indices) : new Uint16Array(batch.indices);
  geometry.setIndex(new THREE.BufferAttribute(indexArray, 1));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

function runtimeMeshLifecycleKey(mesh) {
  if (mesh?.userData?.overlayFeatureId || mesh?.userData?.overlayFeatureClass) return 'overlay';
  if (mesh?.userData?.syntheticFallbackWorld === true || mesh?.syntheticFallbackWorld === true) return 'synthetic';
  if (mesh?.userData?.continuousWorldInteractiveChunk === true || mesh?.continuousWorldInteractiveChunk === true) return 'interactive';
  return 'base';
}

function applyMergedRuntimeLifecycleMetadata(target, sourceMeshes = []) {
  if (!target || !Array.isArray(sourceMeshes) || sourceMeshes.length === 0) return;
  const lifecycle = runtimeMeshLifecycleKey(sourceMeshes[0]);
  if (lifecycle === 'interactive') {
    target.userData.continuousWorldInteractiveChunk = true;
    target.continuousWorldInteractiveChunk = true;
    return;
  }
  if (lifecycle === 'synthetic') {
    target.userData.syntheticFallbackWorld = true;
    target.syntheticFallbackWorld = true;
    return;
  }
  if (lifecycle === 'overlay') {
    const sourceOverlay = sourceMeshes.find((mesh) => mesh?.userData?.overlayFeatureId || mesh?.userData?.overlayFeatureClass) || null;
    if (sourceOverlay?.userData?.overlayFeatureId) target.userData.overlayFeatureId = sourceOverlay.userData.overlayFeatureId;
    if (sourceOverlay?.userData?.overlayFeatureClass) target.userData.overlayFeatureClass = sourceOverlay.userData.overlayFeatureClass;
  }
}

function batchNearLodBuildingMeshes() {
  try {
    if (!Array.isArray(appCtx.buildingMeshes) || appCtx.buildingMeshes.length < 2) return 0;

    const keep = [];
    const groups = new Map();

    for (let i = 0; i < appCtx.buildingMeshes.length; i++) {
      const mesh = appCtx.buildingMeshes[i];
      if (!mesh) continue;
      const tier = mesh.userData?.lodTier || 'near';
      if (tier !== 'near' && tier !== 'mid' || mesh.userData?.isBuildingBatch) {
        keep.push(mesh);
        continue;
      }
      if (!mesh.geometry || !mesh.material || Array.isArray(mesh.material)) {
        keep.push(mesh);
        continue;
      }

      const matKey = materialBatchKey(mesh.material);
      if (!matKey) {
        keep.push(mesh);
        continue;
      }
      const lifecycle = runtimeMeshLifecycleKey(mesh);
      const key = `${lifecycle}|${tier}|${matKey}`;

      let group = groups.get(key);
      if (!group) {
        group = {
          meshes: [],
          material: mesh.material,
          renderOrder: mesh.renderOrder || 0,
          lodTier: tier,
          lifecycle
        };
        groups.set(key, group);
      }
      group.meshes.push(mesh);
    }

    if (groups.size === 0) return 0;

    const batchedMeshes = [];
    let sourceMeshCount = 0;
    const xzPoints = [];

    groups.forEach((group) => {
      if (!group || !Array.isArray(group.meshes) || group.meshes.length < 2) {
        if (group?.meshes?.length === 1) keep.push(group.meshes[0]);
        return;
      }

      const batch = { positions: [], normals: [], uvs: [], indices: [] };
      const sourceMeshes = [];
      xzPoints.length = 0;

      for (let i = 0; i < group.meshes.length; i++) {
        const mesh = group.meshes[i];
        mesh.updateMatrixWorld(true);
        const appendCount = appendGeometryWithTransform(batch, mesh.geometry, mesh.matrixWorld);
        if (appendCount <= 0) {
          keep.push(mesh);
          continue;
        }
        sourceMeshes.push(mesh);

        let cx = Number.isFinite(mesh.position?.x) ? mesh.position.x : 0;
        let cz = Number.isFinite(mesh.position?.z) ? mesh.position.z : 0;
        const footprint = mesh.userData?.buildingFootprint;
        if (Array.isArray(footprint) && footprint.length > 0) {
          let sumX = 0;
          let sumZ = 0;
          for (let p = 0; p < footprint.length; p++) {
            sumX += footprint[p].x;
            sumZ += footprint[p].z;
          }
          cx = sumX / footprint.length;
          cz = sumZ / footprint.length;
        } else if (mesh.geometry) {
          if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
          const bs = mesh.geometry.boundingSphere;
          if (bs) {
            cx = bs.center.x + cx;
            cz = bs.center.z + cz;
          }
        }
        xzPoints.push({ x: cx, z: cz });
      }

      if (sourceMeshes.length < 2) {
        keep.push(...sourceMeshes);
        return;
      }

      const geometry = buildMergedGeometry(batch);
      if (!geometry) {
        keep.push(...sourceMeshes);
        return;
      }

      const material = group.material.clone();
      const mergedMesh = new THREE.Mesh(geometry, material);
      mergedMesh.renderOrder = group.renderOrder;
      mergedMesh.castShadow = true;
      mergedMesh.receiveShadow = true;
      mergedMesh.frustumCulled = false;

      let centerX = 0;
      let centerZ = 0;
      for (let i = 0; i < xzPoints.length; i++) {
        centerX += xzPoints[i].x;
        centerZ += xzPoints[i].z;
      }
      centerX /= xzPoints.length;
      centerZ /= xzPoints.length;

      let maxRadius = 0;
      for (let i = 0; i < xzPoints.length; i++) {
        const d = Math.hypot(xzPoints[i].x - centerX, xzPoints[i].z - centerZ);
        if (d > maxRadius) maxRadius = d;
      }

      mergedMesh.userData = {
        lodTier: group.lodTier || 'near',
        isBuildingBatch: true,
        isNearBuildingBatch: true,
        batchCount: sourceMeshes.length,
        lodCenter: { x: centerX, z: centerZ },
        lodRadius: maxRadius
      };
      mergedMesh.userData.continuousWorldRegionKeys = mergeContinuousWorldRegionKeysFromTargets(sourceMeshes);
      mergedMesh.userData.continuousWorldRegionCount = mergedMesh.userData.continuousWorldRegionKeys.length;
      mergedMesh.userData.continuousWorldFeatureFamily = 'buildings';
      applyMergedRuntimeLifecycleMetadata(mergedMesh, sourceMeshes);

      appCtx.scene.add(mergedMesh);
      batchedMeshes.push(mergedMesh);

      for (let i = 0; i < sourceMeshes.length; i++) {
        const src = sourceMeshes[i];
        appCtx.scene.remove(src);
        if (src.geometry) src.geometry.dispose();
        if (src.material) src.material.dispose();
      }
      sourceMeshCount += sourceMeshes.length;
    });

    if (!batchedMeshes.length) {
      appCtx._lastBuildingBatchStats = {
        groupCount: groups.size,
        batchMeshCount: 0,
        sourceMeshCount: 0
      };
      return 0;
    }
    appCtx.buildingMeshes = [...keep, ...batchedMeshes];
    appCtx._lastBuildingBatchStats = {
      groupCount: groups.size,
      batchMeshCount: batchedMeshes.length,
      sourceMeshCount
    };
    return sourceMeshCount;
  } catch (err) {
    console.warn('[WorldLoad] batchNearLodBuildingMeshes failed:', err);
    appCtx._lastBuildingBatchStats = {
      groupCount: 0,
      batchMeshCount: 0,
      sourceMeshCount: 0,
      error: err?.message || String(err)
    };
    return 0;
  }
}

function batchLanduseMeshes() {
  try {
    if (!Array.isArray(appCtx.landuseMeshes) || appCtx.landuseMeshes.length < 4) return 0;

    const keep = [];
    const groups = new Map();

    for (let i = 0; i < appCtx.landuseMeshes.length; i++) {
      const mesh = appCtx.landuseMeshes[i];
      if (!mesh || mesh.userData?.isLanduseBatch) {
        if (mesh) keep.push(mesh);
        continue;
      }
      if (!mesh.geometry || !mesh.material || Array.isArray(mesh.material)) {
        keep.push(mesh);
        continue;
      }

      const matKey = materialBatchKey(mesh.material);
      if (!matKey) {
        keep.push(mesh);
        continue;
      }
      const type = mesh.userData?.landuseType || 'unknown';
      const isWaterwayLine = !!mesh.userData?.isWaterwayLine;
      const surfaceVariant = mesh.userData?.surfaceVariant || type;
      const lifecycle = runtimeMeshLifecycleKey(mesh);
      const key = `${lifecycle}|${type}|${isWaterwayLine ? 1 : 0}|${mesh.renderOrder || 0}|${matKey}`;

      let group = groups.get(key);
      if (!group) {
        group = {
          meshes: [],
          material: mesh.material,
          renderOrder: mesh.renderOrder || 0,
          landuseType: type,
          isWaterwayLine,
          surfaceVariant,
          lifecycle,
          alwaysVisible: false,
          anyVisible: false
        };
        groups.set(key, group);
      }
      group.meshes.push(mesh);
      group.alwaysVisible = group.alwaysVisible || !!mesh.userData?.alwaysVisible;
      group.anyVisible = group.anyVisible || !!mesh.visible;
    }

    if (!groups.size) return 0;

    const batched = [];
    let sourceCount = 0;
    const xzPoints = [];

    groups.forEach((group) => {
      if (!group || !Array.isArray(group.meshes) || group.meshes.length < 2) {
        if (group?.meshes?.length === 1) keep.push(group.meshes[0]);
        return;
      }

      const batch = { positions: [], normals: [], uvs: [], indices: [] };
      xzPoints.length = 0;

      for (let i = 0; i < group.meshes.length; i++) {
        const mesh = group.meshes[i];
        mesh.updateMatrixWorld(true);
        appendGeometryWithTransform(batch, mesh.geometry, mesh.matrixWorld);

        let cx = Number.isFinite(mesh.position?.x) ? mesh.position.x : 0;
        let cz = Number.isFinite(mesh.position?.z) ? mesh.position.z : 0;
        const footprint = mesh.userData?.landuseFootprint || mesh.userData?.waterwayCenterline;
        if (Array.isArray(footprint) && footprint.length > 0) {
          let sumX = 0;
          let sumZ = 0;
          for (let p = 0; p < footprint.length; p++) {
            sumX += footprint[p].x;
            sumZ += footprint[p].z;
          }
          cx = sumX / footprint.length;
          cz = sumZ / footprint.length;
        } else if (mesh.geometry) {
          if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
          const bs = mesh.geometry.boundingSphere;
          if (bs) {
            cx = bs.center.x + cx;
            cz = bs.center.z + cz;
          }
        }
        xzPoints.push({ x: cx, z: cz });
      }

      const geometry = buildMergedGeometry(batch);
      if (!geometry) {
        keep.push(...group.meshes);
        return;
      }

      const material = group.material.clone();
      const mergedMesh = new THREE.Mesh(geometry, material);
      mergedMesh.renderOrder = group.renderOrder;
      mergedMesh.receiveShadow = false;
      mergedMesh.castShadow = false;
      mergedMesh.frustumCulled = false;

      let centerX = 0;
      let centerZ = 0;
      for (let i = 0; i < xzPoints.length; i++) {
        centerX += xzPoints[i].x;
        centerZ += xzPoints[i].z;
      }
      centerX /= xzPoints.length;
      centerZ /= xzPoints.length;

      let maxRadius = 0;
      for (let i = 0; i < xzPoints.length; i++) {
        const d = Math.hypot(xzPoints[i].x - centerX, xzPoints[i].z - centerZ);
        if (d > maxRadius) maxRadius = d;
      }

      mergedMesh.userData = {
        landuseType: group.landuseType,
        isWaterwayLine: !!group.isWaterwayLine,
        surfaceVariant: group.surfaceVariant,
        isLanduseBatch: true,
        alwaysVisible: group.alwaysVisible,
        batchCount: group.meshes.length,
        lodCenter: { x: centerX, z: centerZ },
        lodRadius: maxRadius
      };
      mergedMesh.userData.continuousWorldRegionKeys = mergeContinuousWorldRegionKeysFromTargets(group.meshes);
      mergedMesh.userData.continuousWorldRegionCount = mergedMesh.userData.continuousWorldRegionKeys.length;
      mergedMesh.userData.continuousWorldFeatureFamily = group.landuseType === 'water' || group.isWaterwayLine ? 'water' : 'landuse';
      applyMergedRuntimeLifecycleMetadata(mergedMesh, group.meshes);
      mergedMesh.visible = group.anyVisible || group.alwaysVisible;

      appCtx.scene.add(mergedMesh);
      batched.push(mergedMesh);

      for (let i = 0; i < group.meshes.length; i++) {
        const src = group.meshes[i];
        appCtx.scene.remove(src);
        if (src.geometry) src.geometry.dispose();
        if (src.material) src.material.dispose();
      }
      sourceCount += group.meshes.length;
    });

    if (!batched.length) {
      appCtx._lastLanduseBatchStats = {
        groupCount: groups.size,
        batchMeshCount: 0,
        sourceMeshCount: 0
      };
      return 0;
    }
    appCtx.landuseMeshes = [...keep, ...batched];
    appCtx._lastLanduseBatchStats = {
      groupCount: groups.size,
      batchMeshCount: batched.length,
      sourceMeshCount: sourceCount
    };
    return sourceCount;
  } catch (err) {
    console.warn('[WorldLoad] batchLanduseMeshes failed:', err);
    appCtx._lastLanduseBatchStats = {
      groupCount: 0,
      batchMeshCount: 0,
      sourceMeshCount: 0,
      error: err?.message || String(err)
    };
    return 0;
  }
}

function clearBuildingSpatialIndex() {
  buildingSpatialIndex = new Map();
}

function clearLanduseSpatialIndex() {
  landuseSpatialIndex = new Map();
}

function rebuildBuildingSpatialIndexFromLoadedBuildings() {
  clearBuildingSpatialIndex();
  const buildings = Array.isArray(appCtx.buildings) ? appCtx.buildings : [];
  for (let i = 0; i < buildings.length; i++) {
    const building = buildings[i];
    if (!building || building.collisionDisabled) continue;
    addBuildingToSpatialIndex(building);
  }
}

function rebuildLanduseSpatialIndexFromLoadedLanduses() {
  clearLanduseSpatialIndex();
  const landuses = Array.isArray(appCtx.landuses) ? appCtx.landuses : [];
  for (let i = 0; i < landuses.length; i++) {
    addLanduseToSpatialIndex(landuses[i]);
  }
}

const CONTINUOUS_WORLD_REBASE_FEATURE_ARRAY_KEYS = Object.freeze([
  'roads',
  'buildings',
  'dynamicBuildingColliders',
  'landuses',
  'surfaceFeatureHints',
  'waterAreas',
  'waterways',
  'linearFeatures',
  'pois',
  'historicSites',
  'vegetationFeatures',
  'overlayRuntimeRoads',
  'overlayRuntimeLinearFeatures',
  'overlayRuntimePois',
  'overlayRuntimeBuildingColliders',
  'navigationRoutePoints'
]);

const CONTINUOUS_WORLD_REBASE_MESH_ARRAY_KEYS = Object.freeze([
  'roadMeshes',
  'urbanSurfaceMeshes',
  'structureVisualMeshes',
  'buildingMeshes',
  'startupShellBuildingMeshes',
  'landuseMeshes',
  'linearFeatureMeshes',
  'poiMeshes',
  'streetFurnitureMeshes',
  'vegetationMeshes',
  'historicMarkers'
]);

const CONTINUOUS_WORLD_REBASE_BOUNDS_KEYS = Object.freeze([
  'bounds',
  'localBounds',
  'cachedLocalBounds',
  'waterwayBounds',
  'structureBounds'
]);

const CONTINUOUS_WORLD_REBASE_POINT_OBJECT_KEYS = Object.freeze([
  'lodCenter',
  'poiPosition',
  'center',
  'pos',
  'look',
  'lookTarget',
  'target'
]);

const CONTINUOUS_WORLD_REBASE_POINT_ARRAY_KEYS = Object.freeze([
  'pts',
  'buildingFootprint',
  'landuseFootprint',
  'waterwayCenterline'
]);

function shiftRuntimeBoundsInPlace(bounds, deltaX = 0, deltaZ = 0) {
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

function shiftRuntimePointXZ(target, deltaX = 0, deltaZ = 0, xKey = 'x', zKey = 'z') {
  if (!target || typeof target !== 'object') return false;
  if (!Number.isFinite(target[xKey]) || !Number.isFinite(target[zKey])) return false;
  target[xKey] += deltaX;
  target[zKey] += deltaZ;
  return true;
}

function shiftRuntimeWorldValue(value, deltaX = 0, deltaZ = 0, seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      shiftRuntimeWorldValue(value[i], deltaX, deltaZ, seen);
    }
    return;
  }

  const position = value.position;
  if (position && typeof position === 'object') {
    shiftRuntimePointXZ(position, deltaX, deltaZ);
  }
  shiftRuntimePointXZ(value, deltaX, deltaZ);
  shiftRuntimePointXZ(value, deltaX, deltaZ, 'centerX', 'centerZ');
  shiftRuntimeBoundsInPlace(value, deltaX, deltaZ);

  for (let i = 0; i < CONTINUOUS_WORLD_REBASE_BOUNDS_KEYS.length; i++) {
    shiftRuntimeBoundsInPlace(value[CONTINUOUS_WORLD_REBASE_BOUNDS_KEYS[i]], deltaX, deltaZ);
  }
  for (let i = 0; i < CONTINUOUS_WORLD_REBASE_POINT_OBJECT_KEYS.length; i++) {
    shiftRuntimeWorldValue(value[CONTINUOUS_WORLD_REBASE_POINT_OBJECT_KEYS[i]], deltaX, deltaZ, seen);
  }
  for (let i = 0; i < CONTINUOUS_WORLD_REBASE_POINT_ARRAY_KEYS.length; i++) {
    shiftRuntimeWorldValue(value[CONTINUOUS_WORLD_REBASE_POINT_ARRAY_KEYS[i]], deltaX, deltaZ, seen);
  }
  if (value.userData && typeof value.userData === 'object') {
    shiftRuntimeWorldValue(value.userData, deltaX, deltaZ, seen);
  }
  if (typeof value.updateMatrixWorld === 'function') {
    value.updateMatrixWorld(true);
  }
}

function shiftRuntimeWorldArray(list, deltaX = 0, deltaZ = 0, seen = new WeakSet()) {
  if (!Array.isArray(list) || list.length === 0) return;
  for (let i = 0; i < list.length; i++) {
    shiftRuntimeWorldValue(list[i], deltaX, deltaZ, seen);
  }
}

function shiftActorStateForContinuousWorldRebase(deltaX = 0, deltaZ = 0) {
  if (appCtx.car && typeof appCtx.car === 'object') {
    if (Number.isFinite(appCtx.car.x)) appCtx.car.x += deltaX;
    if (Number.isFinite(appCtx.car.z)) appCtx.car.z += deltaZ;
  }
  if (appCtx.drone && typeof appCtx.drone === 'object') {
    if (Number.isFinite(appCtx.drone.x)) appCtx.drone.x += deltaX;
    if (Number.isFinite(appCtx.drone.z)) appCtx.drone.z += deltaZ;
  }
  if (appCtx.boat && typeof appCtx.boat === 'object') {
    if (Number.isFinite(appCtx.boat.x)) appCtx.boat.x += deltaX;
    if (Number.isFinite(appCtx.boat.z)) appCtx.boat.z += deltaZ;
  }
  const walker = appCtx.Walk?.state?.walker;
  if (walker && typeof walker === 'object') {
    if (Number.isFinite(walker.x)) walker.x += deltaX;
    if (Number.isFinite(walker.z)) walker.z += deltaZ;
  }
  if (appCtx.carMesh?.position) {
    shiftRuntimePointXZ(appCtx.carMesh.position, deltaX, deltaZ);
  }
  if (Array.isArray(appCtx.wheelMeshes)) {
    for (let i = 0; i < appCtx.wheelMeshes.length; i++) {
      shiftRuntimePointXZ(appCtx.wheelMeshes[i]?.position, deltaX, deltaZ);
    }
  }
  if (appCtx.boatMode?.mesh?.position) {
    shiftRuntimePointXZ(appCtx.boatMode.mesh.position, deltaX, deltaZ);
  }
  if (appCtx.camera?.position) {
    shiftRuntimePointXZ(appCtx.camera.position, deltaX, deltaZ);
  }
  if (appCtx.camera?.userData?.carrig) {
    shiftRuntimeWorldValue(appCtx.camera.userData.carrig, deltaX, deltaZ);
  }
  if (appCtx.camera?.userData?.boatrig) {
    shiftRuntimeWorldValue(appCtx.camera.userData.boatrig, deltaX, deltaZ);
  }
}

function applyContinuousWorldRebase(targetGeo = null, options = {}) {
  const lat = Number(targetGeo?.lat);
  const lon = Number(targetGeo?.lon);
  const deltaX = -Number(options?.actorX);
  const deltaZ = -Number(options?.actorZ);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { applied: false, reason: 'invalid_target_geo' };
  }
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaZ)) {
    return { applied: false, reason: 'invalid_actor_offset' };
  }
  if (Math.hypot(deltaX, deltaZ) < 0.5) {
    return { applied: false, reason: 'actor_already_local' };
  }
  if (appCtx.worldLoading || appCtx.onMoon || appCtx.oceanMode?.active === true) {
    return { applied: false, reason: 'blocked_runtime_state' };
  }

  const seen = new WeakSet();
  shiftActorStateForContinuousWorldRebase(deltaX, deltaZ);
  for (let i = 0; i < CONTINUOUS_WORLD_REBASE_FEATURE_ARRAY_KEYS.length; i++) {
    shiftRuntimeWorldArray(appCtx[CONTINUOUS_WORLD_REBASE_FEATURE_ARRAY_KEYS[i]], deltaX, deltaZ, seen);
  }
  for (let i = 0; i < CONTINUOUS_WORLD_REBASE_MESH_ARRAY_KEYS.length; i++) {
    shiftRuntimeWorldArray(appCtx[CONTINUOUS_WORLD_REBASE_MESH_ARRAY_KEYS[i]], deltaX, deltaZ, seen);
  }
  shiftRuntimeWorldArray(appCtx.overlayPublishedGroup?.children, deltaX, deltaZ, seen);
  if (typeof appCtx.handleContinuousWorldRebase === 'function') {
    appCtx.handleContinuousWorldRebase(deltaX, deltaZ);
  }

  appCtx.LOC = { lat, lon };
  clearRoadMeshSpatialIndex();
  rebuildBuildingSpatialIndexFromLoadedBuildings();
  rebuildLanduseSpatialIndexFromLoadedLanduses();
  if (typeof appCtx.invalidateRoadCache === 'function') appCtx.invalidateRoadCache();
  if (typeof appCtx.updatePlayableCoreResidency === 'function') {
    appCtx.updatePlayableCoreResidency(true, { reason: 'runtime_rebase' });
  }
  if (typeof appCtx.syncRuntimeContentInventory === 'function') {
    appCtx.syncRuntimeContentInventory('runtime_rebase');
  }
  markWorldLodDirty('runtime_rebase');
  return {
    applied: true,
    deltaX,
    deltaZ,
    lat,
    lon
  };
}

function addBuildingToSpatialIndex(building) {
  if (!building) return;
  const minCellX = Math.floor(building.minX / BUILDING_INDEX_CELL_SIZE);
  const maxCellX = Math.floor(building.maxX / BUILDING_INDEX_CELL_SIZE);
  const minCellZ = Math.floor(building.minZ / BUILDING_INDEX_CELL_SIZE);
  const maxCellZ = Math.floor(building.maxZ / BUILDING_INDEX_CELL_SIZE);

  for (let cx = minCellX; cx <= maxCellX; cx++) {
    for (let cz = minCellZ; cz <= maxCellZ; cz++) {
      const key = `${cx},${cz}`;
      let bucket = buildingSpatialIndex.get(key);
      if (!bucket) {
        bucket = [];
        buildingSpatialIndex.set(key, bucket);
      }
      bucket.push(building);
    }
  }
}

function addLanduseToSpatialIndex(landuse) {
  const bounds = landuse?.bounds;
  const minX = Number(bounds?.minX);
  const maxX = Number(bounds?.maxX);
  const minZ = Number(bounds?.minZ);
  const maxZ = Number(bounds?.maxZ);
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) return;

  const minCellX = Math.floor(minX / LANDUSE_INDEX_CELL_SIZE);
  const maxCellX = Math.floor(maxX / LANDUSE_INDEX_CELL_SIZE);
  const minCellZ = Math.floor(minZ / LANDUSE_INDEX_CELL_SIZE);
  const maxCellZ = Math.floor(maxZ / LANDUSE_INDEX_CELL_SIZE);

  for (let cx = minCellX; cx <= maxCellX; cx++) {
    for (let cz = minCellZ; cz <= maxCellZ; cz++) {
      const key = `${cx},${cz}`;
      let bucket = landuseSpatialIndex.get(key);
      if (!bucket) {
        bucket = [];
        landuseSpatialIndex.set(key, bucket);
      }
      bucket.push(landuse);
    }
  }
}

function registerBuildingCollision(pts, height, options = {}) {
  if (!Array.isArray(pts) || pts.length < 3) return null;
  const detail = options.detail === 'bbox' ? 'bbox' : 'full';
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let sumX = 0;
  let sumZ = 0;
  pts.forEach((p) => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
    sumX += p.x;
    sumZ += p.z;
  });
  const centerX = Number.isFinite(options.centerX) ? options.centerX : sumX / pts.length;
  const centerZ = Number.isFinite(options.centerZ) ? options.centerZ : sumZ / pts.length;
  const baseY = Number.isFinite(options.baseY) ? options.baseY : null;
  const regionKeys = Array.isArray(options.continuousWorldRegionKeys) && options.continuousWorldRegionKeys.length > 0 ?
    options.continuousWorldRegionKeys.slice() :
    buildContinuousWorldRegionKeysFromPoints(pts, 'buildings', { minX, maxX, minZ, maxZ });
  const building = {
    pts: detail === 'full' ? pts : null,
    minX,
    maxX,
    minZ,
    maxZ,
    height,
    centerX,
    centerZ,
    colliderDetail: detail,
    sourceBuildingId: options.sourceBuildingId || null,
    name: String(options.name || '').trim(),
    buildingType: options.buildingType || 'yes',
    buildingPartKind: options.buildingPartKind || 'full',
    collisionKind: options.collisionKind || 'solid',
    allowsPassageBelow: options.allowsPassageBelow === true,
    levels: Number.isFinite(options.levels) ? options.levels : null,
    minLevels: Number.isFinite(options.minLevels) ? options.minLevels : null,
    baseY,
    minY: baseY,
    maxY: Number.isFinite(baseY) ? baseY + height : null,
    buildingSemantics: options.buildingSemantics || null,
    structureSemantics: options.structureSemantics || null,
    continuousWorldRegionKeys: regionKeys,
    continuousWorldInteractiveChunk: options.continuousWorldInteractiveChunk === true
  };
  appCtx.buildings.push(building);
  addBuildingToSpatialIndex(building);
  return building;
}

function clearStartupShellBuildingMeshes() {
  const list = Array.isArray(appCtx.startupShellBuildingMeshes) ? appCtx.startupShellBuildingMeshes : [];
  if (!list.length) return 0;
  const removeSet = new Set(list);
  let removed = 0;
  appCtx.startupShellBuildingMeshes = [];
  if (Array.isArray(appCtx.buildingMeshes) && appCtx.buildingMeshes.length > 0) {
    appCtx.buildingMeshes = appCtx.buildingMeshes.filter((mesh) => {
      if (!mesh) return false;
      if (!removeSet.has(mesh)) return true;
      removed += 1;
      if (mesh.parent === appCtx.scene) appCtx.scene.remove(mesh);
      if (mesh.geometry && typeof mesh.geometry.dispose === 'function') mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((mat) => {
        if (mat && typeof mat.dispose === 'function') mat.dispose();
      });
      return false;
    });
  }
  return removed;
}

function getNearbyBuildings(x, z, radius = 80) {
  const overlayColliders = Array.isArray(appCtx.overlayRuntimeBuildingColliders) ? appCtx.overlayRuntimeBuildingColliders : [];
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    return (appCtx.buildings || []).filter((building) => !isSuppressedBaseBuilding(building)).concat(appCtx.dynamicBuildingColliders || [], overlayColliders);
  }
  if (!buildingSpatialIndex || buildingSpatialIndex.size === 0) {
    return (appCtx.buildings || []).filter((building) => !isSuppressedBaseBuilding(building)).concat(appCtx.dynamicBuildingColliders || [], overlayColliders);
  }

  const queryRadius = Math.max(20, radius);
  const minCellX = Math.floor((x - queryRadius) / BUILDING_INDEX_CELL_SIZE);
  const maxCellX = Math.floor((x + queryRadius) / BUILDING_INDEX_CELL_SIZE);
  const minCellZ = Math.floor((z - queryRadius) / BUILDING_INDEX_CELL_SIZE);
  const maxCellZ = Math.floor((z + queryRadius) / BUILDING_INDEX_CELL_SIZE);

  const out = [];
  const seen = new Set();

  for (let cx = minCellX; cx <= maxCellX; cx++) {
    for (let cz = minCellZ; cz <= maxCellZ; cz++) {
      const bucket = buildingSpatialIndex.get(`${cx},${cz}`);
      if (!bucket) continue;
      for (let i = 0; i < bucket.length; i++) {
        const b = bucket[i];
        if (seen.has(b)) continue;
        if (isSuppressedBaseBuilding(b)) continue;
        seen.add(b);
        out.push(b);
      }
    }
  }

  if (Array.isArray(appCtx.dynamicBuildingColliders) && appCtx.dynamicBuildingColliders.length > 0) {
    for (let i = 0; i < appCtx.dynamicBuildingColliders.length; i++) {
      const b = appCtx.dynamicBuildingColliders[i];
      if (!b || seen.has(b)) continue;
      if (
        x < b.minX - queryRadius ||
        x > b.maxX + queryRadius ||
        z < b.minZ - queryRadius ||
        z > b.maxZ + queryRadius
      ) {
        continue;
      }
      seen.add(b);
      out.push(b);
    }
  }

  if (overlayColliders.length > 0) {
    for (let i = 0; i < overlayColliders.length; i++) {
      const b = overlayColliders[i];
      if (!b || seen.has(b)) continue;
      if (
        x < b.minX - queryRadius ||
        x > b.maxX + queryRadius ||
        z < b.minZ - queryRadius ||
        z > b.maxZ + queryRadius
      ) {
        continue;
      }
      seen.add(b);
      out.push(b);
    }
  }

  return out;
}

function getBuildingsIntersectingBounds(bounds, padding = 0) {
  const overlayColliders = Array.isArray(appCtx.overlayRuntimeBuildingColliders) ? appCtx.overlayRuntimeBuildingColliders : [];
  const dynamicColliders = Array.isArray(appCtx.dynamicBuildingColliders) ? appCtx.dynamicBuildingColliders : [];
  const minX = Number(bounds?.minX);
  const maxX = Number(bounds?.maxX);
  const minZ = Number(bounds?.minZ);
  const maxZ = Number(bounds?.maxZ);
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
    return (appCtx.buildings || []).filter((building) => !isSuppressedBaseBuilding(building))
      .concat(dynamicColliders, overlayColliders);
  }

  const queryMinX = minX - padding;
  const queryMaxX = maxX + padding;
  const queryMinZ = minZ - padding;
  const queryMaxZ = maxZ + padding;

  const pushIfIntersecting = (target, seen, out) => {
    if (!target || seen.has(target)) return;
    if (
      queryMaxX < target.minX ||
      queryMinX > target.maxX ||
      queryMaxZ < target.minZ ||
      queryMinZ > target.maxZ
    ) {
      return;
    }
    seen.add(target);
    out.push(target);
  };

  const out = [];
  const seen = new Set();
  if (!buildingSpatialIndex || buildingSpatialIndex.size === 0) {
    (appCtx.buildings || []).forEach((building) => {
      if (!isSuppressedBaseBuilding(building)) pushIfIntersecting(building, seen, out);
    });
  } else {
    const minCellX = Math.floor(queryMinX / BUILDING_INDEX_CELL_SIZE);
    const maxCellX = Math.floor(queryMaxX / BUILDING_INDEX_CELL_SIZE);
    const minCellZ = Math.floor(queryMinZ / BUILDING_INDEX_CELL_SIZE);
    const maxCellZ = Math.floor(queryMaxZ / BUILDING_INDEX_CELL_SIZE);
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cz = minCellZ; cz <= maxCellZ; cz++) {
        const bucket = buildingSpatialIndex.get(`${cx},${cz}`);
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const building = bucket[i];
          if (isSuppressedBaseBuilding(building)) continue;
          pushIfIntersecting(building, seen, out);
        }
      }
    }
  }

  dynamicColliders.forEach((building) => pushIfIntersecting(building, seen, out));
  overlayColliders.forEach((building) => pushIfIntersecting(building, seen, out));
  return out;
}

function getLandusesIntersectingBounds(bounds, padding = 0) {
  const minX = Number(bounds?.minX);
  const maxX = Number(bounds?.maxX);
  const minZ = Number(bounds?.minZ);
  const maxZ = Number(bounds?.maxZ);
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
    return Array.isArray(appCtx.landuses) ? appCtx.landuses.slice() : [];
  }

  const queryMinX = minX - padding;
  const queryMaxX = maxX + padding;
  const queryMinZ = minZ - padding;
  const queryMaxZ = maxZ + padding;
  const out = [];
  const seen = new Set();

  const pushIfIntersecting = (landuse) => {
    if (!landuse || seen.has(landuse)) return;
    const targetBounds = landuse.bounds || pointsBoundsLocal(landuse.pts || []);
    if (!targetBounds) return;
    if (
      queryMaxX < targetBounds.minX ||
      queryMinX > targetBounds.maxX ||
      queryMaxZ < targetBounds.minZ ||
      queryMinZ > targetBounds.maxZ
    ) {
      return;
    }
    seen.add(landuse);
    out.push(landuse);
  };

  if (!landuseSpatialIndex || landuseSpatialIndex.size === 0) {
    (appCtx.landuses || []).forEach((landuse) => pushIfIntersecting(landuse));
    return out;
  }

  const minCellX = Math.floor(queryMinX / LANDUSE_INDEX_CELL_SIZE);
  const maxCellX = Math.floor(queryMaxX / LANDUSE_INDEX_CELL_SIZE);
  const minCellZ = Math.floor(queryMinZ / LANDUSE_INDEX_CELL_SIZE);
  const maxCellZ = Math.floor(queryMaxZ / LANDUSE_INDEX_CELL_SIZE);

  for (let cx = minCellX; cx <= maxCellX; cx++) {
    for (let cz = minCellZ; cz <= maxCellZ; cz++) {
      const bucket = landuseSpatialIndex.get(`${cx},${cz}`);
      if (!bucket) continue;
      for (let i = 0; i < bucket.length; i++) {
        pushIfIntersecting(bucket[i]);
      }
    }
  }

  return out;
}

async function fetchOverpassJSON(query, timeoutMs, deadlineMs = Infinity, cacheMeta = null, requestOptions = null) {
  const forwardRoadCorridorQuery = String(requestOptions?.reason || '').startsWith('forward_road_corridor');
  const startupPlayableCoreQuery = String(cacheMeta?.queryKind || '') === 'startup_playable_core';
  const interactiveQuery = !!cacheMeta?.continuousWorldInteractive;
  const fastRoadsOnlyQuery = interactiveQuery && String(cacheMeta?.loadLevel || '') === 'roads_only';
  const allowNearbyCacheAssist = forwardRoadCorridorQuery || fastRoadsOnlyQuery || startupPlayableCoreQuery;
  const cached = findOverpassMemoryCache(cacheMeta);
  if (cached?.data?.elements) {
    cached.data._overpassEndpoint = cached.endpoint ? `${cached.endpoint} (memory-cache)` : 'memory-cache';
    cached.data._overpassSource = 'memory-cache';
    cached.data._overpassCacheAgeMs = Math.max(0, Date.now() - cached.savedAt);
    return cached.data;
  }

  if (allowNearbyCacheAssist) {
    const nearbyCached = findNearbyOverpassMemoryCache(cacheMeta, { extraAllowance: 0.0045 });
    if (nearbyCached?.data?.elements) {
      nearbyCached.data._overpassEndpoint = nearbyCached.endpoint ? `${nearbyCached.endpoint} (memory-cache-nearby)` : 'memory-cache-nearby';
      nearbyCached.data._overpassSource = 'memory-cache-nearby';
      nearbyCached.data._overpassCacheAgeMs = Math.max(0, Date.now() - nearbyCached.savedAt);
      return nearbyCached.data;
    }
  }

  const persistentCached = await findOverpassPersistentCache(cacheMeta);
  if (persistentCached?.data?.elements) {
    persistentCached.data._overpassEndpoint = persistentCached.endpoint ? `${persistentCached.endpoint} (persistent-cache)` : 'persistent-cache';
    persistentCached.data._overpassSource = persistentCached.stale ? 'persistent-cache-stale' : 'persistent-cache';
    persistentCached.data._overpassCacheAgeMs = Math.max(0, persistentCached.ageMs || 0);
    storeOverpassMemoryCache(cacheMeta, persistentCached.data, persistentCached.endpoint);
    return persistentCached.data;
  }

  if (allowNearbyCacheAssist) {
    const nearbyPersistentCached = await findNearbyOverpassPersistentCache(cacheMeta, {
      allowStale: true,
      extraAllowance: 0.0045
    });
    if (nearbyPersistentCached?.data?.elements) {
      nearbyPersistentCached.data._overpassEndpoint = nearbyPersistentCached.endpoint ? `${nearbyPersistentCached.endpoint} (persistent-cache-nearby)` : 'persistent-cache-nearby';
      nearbyPersistentCached.data._overpassSource = nearbyPersistentCached.stale ? 'persistent-cache-nearby-stale' : 'persistent-cache-nearby';
      nearbyPersistentCached.data._overpassCacheAgeMs = Math.max(0, nearbyPersistentCached.ageMs || 0);
      storeOverpassMemoryCache(cacheMeta, nearbyPersistentCached.data, nearbyPersistentCached.endpoint);
      return nearbyPersistentCached.data;
    }
  }

  const requestSignal = requestOptions?.signal || null;
  if (requestSignal?.aborted) {
    throw createAbortError('request aborted before fetch');
  }
  const controllers = [];
  const errors = [];
  const endpoints = orderedOverpassEndpoints();
  const minTimeoutMs =
    forwardRoadCorridorQuery ? 1800 :
    fastRoadsOnlyQuery ? 2400 :
    startupPlayableCoreQuery ? 3600 :
    interactiveQuery ? 3200 :
    OVERPASS_MIN_TIMEOUT_MS;
  const staggerMsBase =
    forwardRoadCorridorQuery ? 40 :
    fastRoadsOnlyQuery ? 90 :
    startupPlayableCoreQuery ? 90 :
    interactiveQuery ? 120 :
    OVERPASS_STAGGER_MS;
  const abortAllControllers = () => {
    controllers.forEach((controller) => {
      try {
        controller.abort();
      } catch {}
    });
  };
  const abortListener = requestSignal ? () => abortAllControllers() : null;
  if (requestSignal && abortListener) {
    requestSignal.addEventListener('abort', abortListener, { once: true });
  }

  try {
    for (let idx = 0; idx < endpoints.length; idx++) {
      const endpoint = endpoints[idx];
    const staggerMs = idx * staggerMsBase;
    if (staggerMs > 0) await delayMs(staggerMs);

    const now = performance.now();
    if (now >= deadlineMs - 300) {
      errors.push(`[${endpoint}] skipped: load budget exhausted`);
      continue;
    }

    const timeLeftMs = deadlineMs - now;
    const localProxyEndpoint = endpoint.endsWith(LOCAL_OVERPASS_PROXY_PATH);
    const timeoutForEndpointMs = localProxyEndpoint ?
      (() => {
        const proxyMinTimeoutMs =
          forwardRoadCorridorQuery ? 4200 :
          fastRoadsOnlyQuery ? 14000 :
          startupPlayableCoreQuery ? 16000 :
          interactiveQuery ? 16000 :
          19000;
        const proxyTargetTimeoutMs =
          forwardRoadCorridorQuery ? Math.max(timeoutMs + 900, proxyMinTimeoutMs) :
          fastRoadsOnlyQuery ? Math.max(timeoutMs + 2600, proxyMinTimeoutMs) :
          startupPlayableCoreQuery ? Math.max(timeoutMs + 3200, proxyMinTimeoutMs) :
          interactiveQuery ? Math.max(timeoutMs + 2600, proxyMinTimeoutMs) :
          Math.max(timeoutMs + 2200, proxyMinTimeoutMs);
        return Math.max(
          proxyMinTimeoutMs,
          Math.min(proxyTargetTimeoutMs, timeLeftMs - 250)
        );
      })() :
      Math.max(
        fastRoadsOnlyQuery ? 2400 : startupPlayableCoreQuery ? 3200 : 3500,
        Math.min(
          Math.max(
            minTimeoutMs,
            timeoutMs - idx * (interactiveQuery || startupPlayableCoreQuery ? 700 : 1200)
          ),
          timeLeftMs - 250
        )
      );

    const controller = new AbortController();
    controllers.push(controller);
    const timeoutId = setTimeout(() => controller.abort(), timeoutForEndpointMs);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: 'data=' + encodeURIComponent(query),
        signal: controller.signal
      });

      if (!res.ok) {
        const responseText = await res.text().catch(() => '');
        let responseDetail = '';
        try {
          const payload = JSON.parse(responseText);
          if (Array.isArray(payload?.failures) && payload.failures.length > 0) {
            responseDetail = payload.failures.join(' | ');
          } else if (payload?.error) {
            responseDetail = String(payload.error);
          }
        } catch {}
        if (localProxyEndpoint && (res.status === 404 || res.status === 405 || res.status === 501)) {
          _localOverpassProxyUnavailable = true;
        }
        throw new Error(
          responseDetail ?
            `HTTP ${res.status}: ${responseDetail}` :
            `HTTP ${res.status}`
        );
      }

      const text = await res.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('non-JSON response');
      }

      if (!data || !Array.isArray(data.elements)) {
        throw new Error('invalid payload');
      }

      data._overpassEndpoint = endpoint;
      data._overpassSource = 'network';
      data._overpassCacheAgeMs = 0;
      _lastOverpassEndpoint = endpoint;
      storeOverpassMemoryCache(cacheMeta, data, endpoint);
      void storeOverpassPersistentCache(cacheMeta, data, endpoint);
      abortAllControllers();
      return data;
    } catch (err) {
      if (localProxyEndpoint && err?.name !== 'AbortError') {
        const errorText = String(err?.message || err || '');
        const proxyTransportUnavailable =
          /Failed to fetch|NetworkError|Load failed|ERR_|TypeError/i.test(errorText) &&
          !/HTTP 5\d\d/.test(errorText);
        if (proxyTransportUnavailable) {
          _localOverpassProxyUnavailable = true;
        }
      }
      const reason = err?.name === 'AbortError' ?
      `timeout after ${Math.floor(timeoutForEndpointMs)}ms` :
      err?.message || String(err);
      errors.push(`[${endpoint}] ${reason}`);
    } finally {
      clearTimeout(timeoutId);
    }
    }
    if (requestSignal?.aborted) {
      throw createAbortError('request aborted during fetch');
    }
    const staleCached = await findOverpassPersistentCache(cacheMeta, { allowStale: true });
    if (staleCached?.data?.elements) {
      staleCached.data._overpassEndpoint = staleCached.endpoint ? `${staleCached.endpoint} (persistent-cache-stale)` : 'persistent-cache-stale';
      staleCached.data._overpassSource = 'persistent-cache-stale';
      staleCached.data._overpassCacheAgeMs = Math.max(0, staleCached.ageMs || 0);
      storeOverpassMemoryCache(cacheMeta, staleCached.data, staleCached.endpoint);
      return staleCached.data;
    }
    if (allowNearbyCacheAssist) {
      const nearbyStaleCached = await findNearbyOverpassPersistentCache(cacheMeta, {
        allowStale: true,
        extraAllowance: 0.0045
      });
      if (nearbyStaleCached?.data?.elements) {
        nearbyStaleCached.data._overpassEndpoint = nearbyStaleCached.endpoint ? `${nearbyStaleCached.endpoint} (persistent-cache-nearby-stale)` : 'persistent-cache-nearby-stale';
        nearbyStaleCached.data._overpassSource = 'persistent-cache-nearby-stale';
        nearbyStaleCached.data._overpassCacheAgeMs = Math.max(0, nearbyStaleCached.ageMs || 0);
        storeOverpassMemoryCache(cacheMeta, nearbyStaleCached.data, nearbyStaleCached.endpoint);
        return nearbyStaleCached.data;
      }
    }
    throw new Error(`All Overpass endpoints failed: ${errors.join(' | ')}`);
  } finally {
    if (requestSignal && abortListener) {
      requestSignal.removeEventListener('abort', abortListener);
    }
  }
}

function getWorldLoadSignature() {
  const selLoc = String(appCtx.selLoc || 'baltimore');
  const perfMode = getPerfModeValue();
  const customLat = selLoc === 'custom' ? Number(appCtx.customLoc?.lat) : null;
  const customLon = selLoc === 'custom' ? Number(appCtx.customLoc?.lon) : null;
  const customName = selLoc === 'custom' ? String(appCtx.customLoc?.name || 'Custom') : '';
  return JSON.stringify({
    selLoc,
    customLat: Number.isFinite(customLat) ? Number(customLat.toFixed(6)) : null,
    customLon: Number.isFinite(customLon) ? Number(customLon.toFixed(6)) : null,
    customName,
    gameMode: String(appCtx.gameMode || 'free'),
    perfMode,
    seedOverride: Number.isFinite(Number(appCtx.sharedSeedOverride)) ? Number(appCtx.sharedSeedOverride) : null
  });
}

function cancelWorldLoad(options = {}) {
  const hideOverlay = options.hideOverlay !== false;
  resetContinuousWorldInteractiveStreamState('cancel_world_load');
  _activeWorldLoad = null;
  appCtx._worldLoadSequence = (appCtx._worldLoadSequence || 0) + 1;
  appCtx.worldLoading = false;
  appCtx.worldBuildStage = 'idle';
  appCtx.worldBuildReadyReason = null;
  if (hideOverlay && typeof appCtx.hideLoad === 'function') {
    appCtx.hideLoad();
  }
}

async function awaitPlayableWorldShell(options = {}) {
  if (appCtx.onMoon || appCtx.travelingToMoon) {
    return { ready: true, reason: 'non_earth' };
  }
  if (typeof appCtx.isEnv === 'function' && appCtx.ENV && !appCtx.isEnv(appCtx.ENV.EARTH)) {
    return { ready: true, reason: 'non_earth' };
  }
  const source = String(options.source || 'world_shell_gate');
  const timeoutMs = clampNumber(Number(options.timeoutMs), 1200, 12000, 7000);
  const loadSignature = String(options.loadSignature || getWorldLoadSignature());
  const showLoad = options.showLoad !== false;
  const loadingText = String(options.loadingText || 'Finalizing location...');
  const deadline = performance.now() + timeoutMs;
  let forcedSurfaceSync = false;
  let showedOverlay = false;
  let lastInteractiveRecoveryAt = 0;
  let lastSnapshot = {
    ready: false,
    reason: 'pending',
    visibleRoads: 0,
    roadFeatures: 0,
    visibleBuildings: 0,
    terrainReady: false
  };

  while (performance.now() < deadline) {
    if (loadSignature !== getWorldLoadSignature()) {
      return {
        ...lastSnapshot,
        ready: false,
        reason: 'location_changed'
      };
    }

    const actorState = continuousWorldInteractiveActorMotionState();
    const mode = String(options.mode || actorState?.mode || 'drive');
    const actorX = Number.isFinite(Number(actorState?.x)) ? Number(actorState.x) : Number(appCtx.car?.x || 0);
    const actorZ = Number.isFinite(Number(actorState?.z)) ? Number(actorState.z) : Number(appCtx.car?.z || 0);
    const roadRadius =
      mode === 'drone' ? 420 :
      mode === 'walk' ? 220 :
      320;
    const buildingRadius =
      mode === 'drone' ? 560 :
      mode === 'walk' ? 320 :
      440;
    const minVisibleRoads =
      Number.isFinite(options.minVisibleRoads) ?
        Math.max(1, Number(options.minVisibleRoads)) :
      mode === 'drive' ?
        10 :
      mode === 'drone' ?
        6 :
        5;
    const minRoadFeatures =
      Number.isFinite(options.minRoadFeatures) ?
        Math.max(1, Number(options.minRoadFeatures)) :
        Math.max(8, minVisibleRoads);
    const minVisibleBuildings =
      Number.isFinite(options.minVisibleBuildings) ?
        Math.max(0, Number(options.minVisibleBuildings)) :
      mode === 'drive' ?
        0 :
      mode === 'drone' ?
        0 :
        0;

    const terrainSnapshot =
      typeof appCtx.getTerrainStreamingSnapshot === 'function' ?
        appCtx.getTerrainStreamingSnapshot() :
        null;
    const terrainReady =
      appCtx.onMoon ||
      !appCtx.terrainEnabled ||
      !!terrainSnapshot?.activeCenterLoaded;
    const playableCore = updatePlayableCoreResidency(true, {
      reason: `${source}_await_shell`
    });
    const visibleRoads = countVisibleRoadMeshesNearWorldPoint(actorX, actorZ, roadRadius);
    const roadFeatures = countDriveableRoadFeaturesNearWorldPoint(actorX, actorZ, roadRadius);
    const visibleBuildings = countVisibleDetailedBuildingMeshesNearWorldPoint(actorX, actorZ, buildingRadius);
    const buildingRequirementMet =
      minVisibleBuildings <= 0 ||
      visibleBuildings >= minVisibleBuildings;
    const ready =
      !!playableCore?.ready &&
      terrainReady &&
      (visibleRoads >= minVisibleRoads || roadFeatures >= minRoadFeatures) &&
      buildingRequirementMet;

    lastSnapshot = {
      ready,
      reason: ready ? 'ready' : 'waiting',
      mode,
      visibleRoads,
      roadFeatures,
      visibleBuildings,
      terrainReady,
      playableCoreReady: !!playableCore?.ready,
      pendingSurfaceSyncRoads: Number(terrainSnapshot?.pendingSurfaceSyncRoads || 0),
      roadsNeedRebuild: !!terrainSnapshot?.roadsNeedRebuild
    };

    if (ready) {
      if (visibleBuildings < minVisibleBuildings) {
        kickContinuousWorldInteractiveStreaming(
          mode === 'drive' ? 'building_continuity_drive' :
          mode === 'walk' ? 'building_continuity_walk' :
          mode === 'drone' ? 'building_continuity_drone' :
          'actor_building_gap'
        );
      }
      if (showedOverlay && typeof appCtx.hideLoad === 'function') {
        appCtx.hideLoad();
      }
      return lastSnapshot;
    }

    if (!showedOverlay && showLoad && typeof appCtx.showLoad === 'function') {
      appCtx.showLoad(loadingText);
      showedOverlay = true;
    }

    if (!terrainReady && typeof appCtx.updateTerrainAround === 'function') {
      try {
        appCtx.updateTerrainAround(actorX, actorZ);
      } catch {}
    }

    if (
      typeof appCtx.requestWorldSurfaceSync === 'function' &&
      (
        terrainSnapshot?.roadsNeedRebuild ||
        visibleRoads < minVisibleRoads ||
        Number(terrainSnapshot?.pendingSurfaceSyncRoads || 0) > 0
      )
    ) {
      try {
        appCtx.requestWorldSurfaceSync({
          force: !forcedSurfaceSync,
          deferOnly: forcedSurfaceSync,
          source: `${source}_await_shell`
        });
        forcedSurfaceSync = true;
      } catch {}
    }

    const shouldRecoverRoadGap = roadFeatures <= 0 || visibleRoads <= 0;
    const shouldRecoverBuildingGap = !buildingRequirementMet;
    const recoveryReason =
      shouldRecoverRoadGap ?
        'actor_visible_road_gap' :
      shouldRecoverBuildingGap ?
        (mode === 'drive' ? 'building_continuity_drive' :
        mode === 'walk' ? 'building_continuity_walk' :
        mode === 'drone' ? 'building_continuity_drone' :
        'actor_building_gap') :
        '';
    const now = performance.now();
    if (recoveryReason && (now - lastInteractiveRecoveryAt) >= 360) {
      try {
        const actorGeo = currentMapReferenceGeoPosition();
        if (Number.isFinite(actorGeo?.lat) && Number.isFinite(actorGeo?.lon)) {
          void loadContinuousWorldInteractiveChunk(actorGeo.lat, actorGeo.lon, recoveryReason);
          lastInteractiveRecoveryAt = now;
        }
      } catch {}
    }
    if (shouldRecoverRoadGap) {
      kickContinuousWorldInteractiveStreaming('actor_visible_road_gap');
    } else if (shouldRecoverBuildingGap) {
      kickContinuousWorldInteractiveStreaming(recoveryReason);
    }

    await delayMs(120);
  }

  if (showedOverlay && typeof appCtx.hideLoad === 'function') {
    appCtx.hideLoad();
  }
  return {
    ...lastSnapshot,
    ready: false,
    reason: 'timeout'
  };
}

async function loadRoadsInternal(retryPass = 0) {
  const locName = appCtx.selLoc === 'custom' ? appCtx.customLoc?.name || 'Custom' : appCtx.LOCS[appCtx.selLoc].name;
  const perfModeNow = getPerfModeValue();
  const useRdtBudgeting = perfModeNow === 'rdt';
  const loadMetrics = {
    mode: perfModeNow,
    location: locName,
    retryPass,
    success: false,
    lod: { near: 0, mid: 0, midSkipped: 0, farSkipped: 0 },
    roads: { requested: 0, selected: 0, sourcePoints: 0, decimatedPoints: 0, subdividedPoints: 0, vertices: 0 },
    buildings: { requested: 0, selected: 0 },
    colliders: { full: 0, simplified: 0 },
    landuse: { requested: 0, selected: 0 },
    linearFeatures: {
      railway: { requested: 0, selected: 0 },
      footway: { requested: 0, selected: 0 },
      cycleway: { requested: 0, selected: 0 }
    },
    vegetation: {
      treesRequested: 0,
      treesSelected: 0,
      treeRowsRequested: 0,
      treeRowsSelected: 0,
      generated: 0
    },
    pois: { requested: 0, selected: 0, near: 0, mid: 0, far: 0 },
    phases: {}
  };
  let runCriticalWaterCoverage = async () => false;
  appCtx._lastBuildingBatchStats = null;
  appCtx._lastLanduseBatchStats = null;
  appCtx._continuousWorldVisibleLoadConfig = null;
  resetContinuousWorldInteractiveStreamState('full_world_load');
  if (typeof appCtx.startPerfLoad === 'function') {
    appCtx.startPerfLoad('world-load', { mode: perfModeNow, location: locName });
  }

  let _perfLoadFinalized = false;
  const finalizePerfLoad = (success, extra = {}) => {
    if (_perfLoadFinalized) return;
    _perfLoadFinalized = true;
    loadMetrics.success = !!success;
    const payload = { ...loadMetrics, ...extra };
    if (typeof appCtx.finishPerfLoad === 'function') appCtx.finishPerfLoad(payload);
  };
  const _phaseStartedAt = Object.create(null);
  const _phaseTotals = Object.create(null);
  const startLoadPhase = (name) => {
    if (!name) return;
    _phaseStartedAt[name] = performance.now();
  };
  const endLoadPhase = (name) => {
    if (!name) return;
    const startedAt = _phaseStartedAt[name];
    if (!Number.isFinite(startedAt)) return;
    const dt = performance.now() - startedAt;
    _phaseTotals[name] = (_phaseTotals[name] || 0) + dt;
    delete _phaseStartedAt[name];
  };
  const earthSceneSuppressed = () => {
    const titleVisible = !!document.getElementById('titleScreen') && !document.getElementById('titleScreen').classList.contains('hidden');
    if (appCtx.onMoon || appCtx.travelingToMoon) return true;
    if (typeof appCtx.isEnv === 'function' && appCtx.ENV) {
      if (!appCtx.isEnv(appCtx.ENV.EARTH)) return true;
    }
    return titleVisible || appCtx.gameStarted === false;
  };
  const hideEarthSceneMeshes = () => {
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
    hideList(appCtx.streetFurnitureMeshes);
    hideList(appCtx.vegetationMeshes);
  };

  appCtx.showLoad('Loading ' + locName + '...');
  appCtx.worldLoading = true;
  appCtx.worldBuildStage = 'seed';
  if (typeof appCtx.cancelRoadAndBuildingRebuild === 'function') {
    appCtx.cancelRoadAndBuildingRebuild();
  }
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
  // Properly dispose of all meshes to prevent memory leaks
  disposeTrackedMeshList(appCtx.roadMeshes, 'world_reload_reset');
  appCtx.roads = [];
  clearRoadMeshSpatialIndex();
  if (typeof appCtx.clearStructureVisualMeshes === 'function') {
    appCtx.clearStructureVisualMeshes();
  } else {
    appCtx.structureVisualMeshes = [];
  }
  disposeTrackedMeshList(appCtx.urbanSurfaceMeshes, 'world_reload_reset');
  invalidateTraversalNetworks('world_reload_reset');
  appCtx.navigationRoutePoints = [];
  appCtx.navigationRouteDistance = 0;

  disposeTrackedMeshList(appCtx.buildingMeshes, 'world_reload_reset');
  appCtx.buildings = [];
  appCtx.dynamicBuildingColliders = [];
  clearBuildingSpatialIndex();
  clearLanduseSpatialIndex();

  disposeTrackedMeshList(appCtx.landuseMeshes, 'world_reload_reset');
  appCtx.landuses = [];appCtx.surfaceFeatureHints = [];appCtx.waterAreas = [];appCtx.waterways = [];appCtx.waterWaveVisuals = [];
  if (typeof appCtx.setWorldSurfaceProfile === 'function') {
    appCtx.setWorldSurfaceProfile(null);
  } else {
    appCtx.worldSurfaceProfile = null;
  }
  disposeTrackedMeshList(appCtx.linearFeatureMeshes, 'world_reload_reset');
  appCtx.linearFeatures = [];

  disposeTrackedMeshList(appCtx.poiMeshes, 'world_reload_reset');
  appCtx.pois = [];

  disposeTrackedMeshList(appCtx.historicMarkers, 'world_reload_reset');
  appCtx.historicSites = [];

  disposeTrackedMeshList(appCtx.streetFurnitureMeshes, 'world_reload_reset');
  disposeTrackedMeshList(appCtx.vegetationMeshes, 'world_reload_reset');
  appCtx.vegetationFeatures = [];
  syncRuntimeContentInventory('world_reload_reset');
  appCtx.osmTreeNodes = [];
  appCtx.osmTreeRows = [];
  appCtx._worldLoadNodes = null;
  _signTextureCache.clear();_geoSignText = null;
  if (typeof appCtx.clearWindowTextureCache === 'function') {
    appCtx.clearWindowTextureCache(); // Clear RDT-keyed window texture cache for new location
  } else {
    appCtx.windowTextures = {};
  }
  if (typeof appCtx.invalidateRoadCache === 'function') appCtx.invalidateRoadCache(); // Clear cached road result

  // Flag that roads will need rebuilding after terrain loads
  appCtx.roadsNeedRebuild = true;

  if (appCtx.selLoc === 'custom') {
    const latField = document.getElementById('customLat');
    const lonField = document.getElementById('customLon');
    const lat = parseFloat(latField?.value ?? appCtx.customLoc?.lat);
    const lon = parseFloat(lonField?.value ?? appCtx.customLoc?.lon);
    if (isNaN(lat) || isNaN(lon)) {
      appCtx.showLoad('Enter valid coordinates');
      appCtx.worldLoading = false;
      finalizePerfLoad(false, { reason: 'invalid_coordinates' });
      return;
    }
    appCtx.LOC = { lat, lon };
    appCtx.customLoc = { lat, lon, name: appCtx.customLoc?.name || 'Custom' };
  } else {
    appCtx.LOC = { lat: appCtx.LOCS[appCtx.selLoc].lat, lon: appCtx.LOCS[appCtx.selLoc].lon };
  }
  const loadLocation = { lat: appCtx.LOC.lat, lon: appCtx.LOC.lon };
  if (typeof appCtx.resetContinuousWorldSession === 'function') {
    appCtx.resetContinuousWorldSession(loadLocation, 'location_load');
  }
  const loadSequence = appCtx._worldLoadSequence = (appCtx._worldLoadSequence || 0) + 1;
  const isActiveLoadContext = () =>
    appCtx._worldLoadSequence === loadSequence &&
    sameLocation(appCtx.LOC, loadLocation) &&
    !earthSceneSuppressed();
  // Prevent old-city coordinates from driving terrain stream while loading.
  appCtx.car.x = 0;
  appCtx.car.z = 0;
  appCtx.car.vx = 0;
  appCtx.car.vz = 0;
  appCtx.car.vy = 0;
  if (appCtx.drone) {
    appCtx.drone.x = 0;
    appCtx.drone.z = 0;
  }
  if (appCtx.Walk && appCtx.Walk.state && appCtx.Walk.state.walker) {
    appCtx.Walk.state.walker.x = 0;
    appCtx.Walk.state.walker.z = 0;
    appCtx.Walk.state.walker.vy = 0;
  }

  // Reset terrain streaming state when location origin changes so stale tiles
  // from the previous city cannot remain at mismatched world coordinates.
  if (appCtx.terrainEnabled && !appCtx.onMoon) {
    if (typeof appCtx.clearTerrainTileCache === 'function') appCtx.clearTerrainTileCache();
    if (typeof appCtx.resetTerrainStreamingState === 'function') appCtx.resetTerrainStreamingState();
    if (typeof appCtx.clearTerrainMeshes === 'function') appCtx.clearTerrainMeshes();
    if (typeof appCtx.updateTerrainAround === 'function') appCtx.updateTerrainAround(0, 0);
  }

  // RDT complexity index: location-derived complexity used by adaptive mode.
  appCtx.rdtSeed = appCtx.hashGeoToInt(
    appCtx.LOC.lat,
    appCtx.LOC.lon,
    appCtx.gameMode === 'trial' ? 1 :
    appCtx.gameMode === 'checkpoint' ? 2 :
    appCtx.gameMode === 'painttown' ? 3 :
    0
  );
  const sharedSeedOverrideRaw = Number(appCtx.sharedSeedOverride);
  if (Number.isFinite(sharedSeedOverrideRaw)) {
    appCtx.rdtSeed = (Math.floor(sharedSeedOverrideRaw) | 0) >>> 0;
  }
  const rawRdtComplexity = appCtx.rdtDepth(appCtx.rdtSeed, 1.5);
  const rdtLoadComplexity = appCtx.rdtDepth(appCtx.rdtSeed % 1000000 + 2, 1.5);
  appCtx.rdtComplexity = useRdtBudgeting ? rawRdtComplexity : 0;

  const dynamicBudgetState = getRuntimeDynamicBudget(perfModeNow);
  const loadProfile = getAdaptiveLoadProfile(rdtLoadComplexity, perfModeNow, dynamicBudgetState.budgetScale);
  const radii = loadProfile.radii.slice();
  const featureRadiusScale = loadProfile.featureRadiusScale;
  const poiRadiusScale = loadProfile.poiRadiusScale;
  const maxRoadWays = loadProfile.maxRoadWays;
  const maxBuildingWays = loadProfile.maxBuildingWays;
  const maxLanduseWays = loadProfile.maxLanduseWays;
  const maxPoiNodes = loadProfile.maxPoiNodes;
  const tileBudgetCfg = loadProfile.tileBudgetCfg;

  const lodThresholds = getWorldLodThresholds(rdtLoadComplexity, perfModeNow, dynamicBudgetState.lodScale);
  appCtx.dynamicBudgetScale = dynamicBudgetState.budgetScale;
  appCtx.dynamicLodScale = dynamicBudgetState.lodScale;

  const overpassTimeoutMs = loadProfile.overpassTimeoutMs;
  const maxTotalLoadMs = loadProfile.maxTotalLoadMs;
  const loadStartedAt = performance.now();

  loadMetrics.rdtLoadComplexity = rdtLoadComplexity;
  appCtx.rdtLoadComplexity = rdtLoadComplexity;
  loadMetrics.rdtComplexity = rawRdtComplexity;
  loadMetrics.radii = radii.slice();
  loadMetrics.lodThresholds = lodThresholds;
  loadMetrics.loadProfile = {
    dynamicBudgetScale: dynamicBudgetState.budgetScale,
    dynamicLodScale: dynamicBudgetState.lodScale,
    maxRoadWays,
    maxBuildingWays,
    maxLanduseWays,
    maxPoiNodes,
    tileBudgetCfg,
    overpassTimeoutMs,
    maxTotalLoadMs
  };
  loadMetrics.dynamicBudget = {
    auto: !!dynamicBudgetState.auto,
    tier: dynamicBudgetState.tier || 'balanced',
    budgetScale: dynamicBudgetState.budgetScale,
    lodScale: dynamicBudgetState.lodScale,
    reason: dynamicBudgetState.reason || null
  };

  let loaded = false;
  const useSyntheticFallbackRoads =
  appCtx.gameMode === 'trial' ||
  appCtx.gameMode === 'checkpoint' ||
  appCtx.gameMode === 'painttown';

  function recordLoadWarning(label, err) {
    const message = `${label}: ${err?.message || err}`;
    if (!Array.isArray(loadMetrics.warnings)) loadMetrics.warnings = [];
    if (loadMetrics.warnings.length < 10) loadMetrics.warnings.push(message);
    console.warn(`[WorldLoad] ${label} failed:`, err);
  }

  function safeLoadCall(label, fn) {
    try {
      return fn();
    } catch (err) {
      recordLoadWarning(label, err);
      return null;
    }
  }

  let startupRoadsReadyPromoted = false;
  let startupLocalRoadBoostPromise = null;
  let startupShellPromise = null;
  let startupPromotionCheckTimer = null;
  let startupShellPhaseOpen = true;
  let startupLoadPhase = false;
  let startupCoreRoadRadius = 0;
  let startupQueryRoadRadius = 0;
  let startupShellRadius = 0;
  let startupRoadsBounds = '';
  let startupShellBounds = '';
  let maxRoadWaysForPass = maxRoadWays;
  let maxBuildingWaysForPass = maxBuildingWays;
  let maxLanduseWaysForPass = maxLanduseWays;
  let maxPoiNodesForPass = maxPoiNodes;
  let overpassCacheMeta = null;
  let geometryGuards = null;
  const preloadedRoadIds = new Set();
  appCtx.startupShellBuildingMeshes = Array.isArray(appCtx.startupShellBuildingMeshes) ? appCtx.startupShellBuildingMeshes : [];
  const canShowBlockingWorldLoadProgress = () =>
    startupLoadPhase &&
    !!appCtx.worldLoading &&
    !startupRoadsReadyPromoted &&
    isActiveLoadContext() &&
    !earthSceneSuppressed();
  const showWorldLoadProgress = (text) => {
    if (canShowBlockingWorldLoadProgress()) appCtx.showLoad(text);
  };

  const scheduleStartupPromotionCheck = (delayMs = 140) => {
    if (startupRoadsReadyPromoted || !startupLoadPhase || earthSceneSuppressed() || !isActiveLoadContext()) return;
    if (startupPromotionCheckTimer) return;
    startupPromotionCheckTimer = window.setTimeout(async () => {
      startupPromotionCheckTimer = null;
      if (startupRoadsReadyPromoted || !startupLoadPhase || earthSceneSuppressed() || !isActiveLoadContext()) return;
      await promoteRoadsReadyWorld('startup_recheck');
      if (!startupRoadsReadyPromoted && startupShellPhaseOpen) {
        scheduleStartupPromotionCheck(180);
      }
    }, Math.max(0, delayMs));
  };

  const appendRoadWaysToWorld = (
    roadWays,
    nodes,
    geometryGuards,
    {
      roadMainBatchGroups,
      roadSkirtBatchGroups,
      roadMarkBatchGroups = null,
      includeMarkings = true,
      roadMainMaterial,
      roadSkirtMaterial,
      roadMarkMaterial = null,
      registerPreloaded = false,
      roadMutationCollector = null
    } = {}
  ) => {
    let addedRoads = 0;
    roadWays.forEach((way) => {
      const sourceFeatureId = way.id ? String(way.id) : '';
      const seededRoadIds =
        startupRoadsReadyPromoted && _continuousWorldInteractiveStreamState.loadedRoadIds instanceof Set ?
          _continuousWorldInteractiveStreamState.loadedRoadIds :
          null;
      if (sourceFeatureId && (preloadedRoadIds.has(sourceFeatureId) || seededRoadIds?.has(sourceFeatureId))) return;
      const rawPts = way.nodes.map((id) => nodes[id]).filter((n) => n).map((n) => appCtx.geoToWorld(n.lat, n.lon));
      const pts = sanitizeWorldPathPoints(rawPts, geometryGuards);
      if (pts.length < 2) return;
      const type = way.tags?.highway || 'residential';
      const structureSemantics = classifyStructureSemantics(way.tags || {}, {
        featureKind: 'road',
        subtype: type
      });
      const width = type.includes('motorway') ? 16 : type.includes('trunk') ? 14 : type.includes('primary') ? 12 : type.includes('secondary') ? 10 : 8;
      const limit = type.includes('motorway') ? 65 : type.includes('trunk') ? 55 : type.includes('primary') ? 40 : type.includes('secondary') ? 35 : 25;
      const name = way.tags?.name || type.charAt(0).toUpperCase() + type.slice(1);
      const centerLatLon = wayCenterLatLon(way, nodes);
      const roadTileKey = centerLatLon ?
        featureTileKeyForLatLon(centerLatLon.lat, centerLatLon.lon, tileBudgetCfg.tileDegrees) :
        null;
      const roadTileDepth = useRdtBudgeting && roadTileKey ?
        rdtDepthForFeatureTile(roadTileKey, tileBudgetCfg.tileDegrees) :
        0;
      const roadSubdivideStepBase = getRoadSubdivisionStep(type, roadTileDepth, perfModeNow);
      const roadSubdivideStep =
        structureSemantics?.terrainMode && structureSemantics.terrainMode !== 'at_grade' ?
          Math.min(roadSubdivideStepBase, 0.55) :
        structureSemantics?.rampCandidate ?
          Math.min(roadSubdivideStepBase, 0.65) :
          roadSubdivideStepBase;
      const decimatedRoadPts = decimateRoadCenterlineByDepth(pts, type, roadTileDepth, perfModeNow);
      if (decimatedRoadPts.length < 2) return;

      const roadFeature = {
        pts: decimatedRoadPts,
        width,
        limit,
        name,
        sourceFeatureId,
        type,
        sidewalkHint: String(way.tags?.sidewalk || '').toLowerCase(),
        networkKind: 'road',
        walkable: true,
        driveable: true,
        structureTags: {
          bridge: way.tags?.bridge || '',
          tunnel: way.tags?.tunnel || '',
          layer: way.tags?.layer || '',
          level: way.tags?.level || '',
          placement: way.tags?.placement || '',
          ramp: way.tags?.ramp || '',
          covered: way.tags?.covered || '',
          indoor: way.tags?.indoor || '',
          location: way.tags?.location || '',
          min_height: way.tags?.min_height || '',
          man_made: way.tags?.man_made || ''
        },
        structureSemantics,
        baseStructureSemantics: cloneStructureSemantics(structureSemantics),
        surfaceBias: 0.42,
        lodDepth: roadTileDepth,
        subdivideMaxDist: roadSubdivideStep,
        bounds: polylineBounds(decimatedRoadPts, width * 0.5 + 18)
      };
      roadFeature.continuousWorldRegionKeys = buildContinuousWorldRegionKeysFromPoints(
        roadFeature.pts,
        null,
        roadFeature.bounds
      );
      recordRoadMutationFeature(roadMutationCollector, roadFeature);
      appCtx.roads.push(roadFeature);
      updateFeatureSurfaceProfile(roadFeature, worldBaseTerrainY, { surfaceBias: 0.42 });
      const hw = width / 2;

      const subdPts = typeof appCtx.subdivideRoadPoints === 'function' ?
        appCtx.subdivideRoadPoints(decimatedRoadPts, roadSubdivideStep) :
        decimatedRoadPts;
      loadMetrics.roads.sourcePoints += pts.length;
      loadMetrics.roads.decimatedPoints += decimatedRoadPts.length;
      loadMetrics.roads.subdividedPoints += subdPts.length;

      const verts = [];
      const indices = [];
      const { leftEdge, rightEdge } = buildFeatureRibbonEdges(roadFeature, subdPts, hw, worldBaseTerrainY, {
        surfaceBias: 0.42
      });
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
        roadFeature.continuousWorldRegionKeys,
        verts,
        indices
      );
      loadMetrics.roads.vertices += verts.length / 3;

      if (typeof appCtx.buildRoadSkirts === 'function' && shouldRenderRoadSkirts(roadFeature)) {
        const skirtDepth =
          roadFeature.structureSemantics?.terrainMode === 'subgrade' ? 0.3 :
          3.6;
        const skirtData = appCtx.buildRoadSkirts(leftEdge, rightEdge, skirtDepth);
        if (skirtData.verts.length > 0) {
          appendIndexedGeometryToGroupedBatch(
            roadSkirtBatchGroups,
            roadFeature.continuousWorldRegionKeys,
            skirtData.verts,
            skirtData.indices
          );
          loadMetrics.roads.vertices += skirtData.verts.length / 3;
        }
      }

      if (
        includeMarkings &&
        roadMarkBatchGroups &&
        roadMarkMaterial &&
        roadFeature.structureSemantics?.terrainMode === 'at_grade' &&
        width >= 12 &&
        (type.includes('motorway') || type.includes('trunk') || type.includes('primary'))
      ) {
        const markVerts = [];
        const markIdx = [];
        const mw = 0.15;
        const dashLen = 6;
        const gapLen = 6;
        let dist = 0;
        for (let i = 0; i < decimatedRoadPts.length - 1; i++) {
          const p1 = decimatedRoadPts[i], p2 = decimatedRoadPts[i + 1];
          const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
          const dx = (p2.x - p1.x) / segLen, dz = (p2.z - p1.z) / segLen;
          const nx = -dz, nz = dx;
          let segDist = 0;
          while (segDist < segLen) {
            if (Math.floor((dist + segDist) / (dashLen + gapLen)) % 2 === 0) {
              const x = p1.x + dx * segDist, z = p1.z + dz * segDist;
              const len = Math.min(dashLen, segLen - segDist);
              const y = (typeof appCtx.terrainMeshHeightAt === 'function' ? appCtx.terrainMeshHeightAt(x, z) : appCtx.elevationWorldYAtWorldXZ(x, z)) + 0.35;
              const vi = markVerts.length / 3;
              markVerts.push(
                x + nx * mw, y, z + nz * mw,
                x - nx * mw, y, z - nz * mw,
                x + dx * len + nx * mw, y, z + dz * len + nz * mw,
                x + dx * len - nx * mw, y, z + dz * len - nz * mw
              );
              markIdx.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);
            }
            segDist += dashLen + gapLen;
          }
          dist += segLen;
        }
        if (markVerts.length > 0) {
          appendIndexedGeometryToGroupedBatch(
            roadMarkBatchGroups,
            roadFeature.continuousWorldRegionKeys,
            markVerts,
            markIdx
          );
          loadMetrics.roads.vertices += markVerts.length / 3;
        }
      }

      if (sourceFeatureId) {
        if (registerPreloaded) preloadedRoadIds.add(sourceFeatureId);
        if (seededRoadIds) seededRoadIds.add(sourceFeatureId);
      }
      addedRoads += 1;
    });

    buildGroupedIndexedBatchMeshes({
      scene: appCtx.scene,
      targetList: appCtx.roadMeshes,
      groups: roadMainBatchGroups,
      material: roadMainMaterial,
      renderOrder: 2,
      userData: {
        isRoadBatch: true,
        sharedRoadMaterial: true,
        continuousWorldFeatureFamily: 'roads'
      }
    });
    buildGroupedIndexedBatchMeshes({
      scene: appCtx.scene,
      targetList: appCtx.roadMeshes,
      groups: roadSkirtBatchGroups,
      material: roadSkirtMaterial,
      renderOrder: 1,
      userData: {
        isRoadBatch: true,
        isRoadSkirt: true,
        sharedRoadMaterial: true,
        continuousWorldFeatureFamily: 'roads'
      }
    });
    if (includeMarkings && roadMarkBatchGroups && roadMarkMaterial) {
      buildGroupedIndexedBatchMeshes({
        scene: appCtx.scene,
        targetList: appCtx.roadMeshes,
        groups: roadMarkBatchGroups,
        material: roadMarkMaterial,
        renderOrder: 3,
        userData: {
          isRoadBatch: true,
          isRoadMarking: true,
          sharedRoadMaterial: true,
          continuousWorldFeatureFamily: 'roads'
        }
      });
    }
    markRoadMeshSpatialIndexDirty();
    return addedRoads;
  };

  const appendStartupShellBuildingsToWorld = (buildingWays, nodes, geometryGuards) => {
    if (!startupShellPhaseOpen) return 0;
    if (!Array.isArray(buildingWays) || buildingWays.length === 0) return 0;
    const denseCellSize = STARTUP_WORLD_BUILD_CONFIG.shellDenseCellSize;
    const denseCellCap = STARTUP_WORLD_BUILD_CONFIG.shellDenseCellCap;
    const acceptedByCell = new Map();
    let added = 0;
    for (let i = 0; i < buildingWays.length; i++) {
      const way = buildingWays[i];
      const rawPts = way.nodes.map((id) => nodes[id]).filter(Boolean).map((node) => appCtx.geoToWorld(node.lat, node.lon));
      const pts = sanitizeWorldFootprintPoints(rawPts, FEATURE_MIN_POLYGON_AREA, geometryGuards);
      if (pts.length < 3) continue;

      let centerX = 0;
      let centerZ = 0;
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (let j = 0; j < pts.length; j++) {
        const point = pts[j];
        centerX += point.x;
        centerZ += point.z;
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minZ = Math.min(minZ, point.z);
        maxZ = Math.max(maxZ, point.z);
      }
      centerX /= pts.length;
      centerZ /= pts.length;
      const sourceBuildingId = way.id ? String(way.id) : `startup-shell-${Math.round(centerX * 10)}-${Math.round(centerZ * 10)}`;
      const cellKey = `${Math.floor(centerX / denseCellSize)},${Math.floor(centerZ / denseCellSize)}`;
      const accepted = acceptedByCell.get(cellKey) || 0;
      const buildingType = way.tags?.building || 'yes';
      const footprintArea = Math.abs(signedPolygonAreaXZ(pts));
      const structureSemantics = classifyStructureSemantics(way.tags || {}, {
        featureKind: 'building',
        subtype: buildingType
      });
      const buildingSemantics = interpretBuildingSemantics(way.tags || {}, {
        fallbackHeight: 10,
        fallbackPartHeight: 3.8,
        footprintArea,
        footprintWidth: Math.max(0, maxX - minX),
        footprintDepth: Math.max(0, maxZ - minZ)
      });
      const height = buildingSemantics.heightMeters;
      const isImportantBuilding =
        !!String(way.tags?.name || '').trim() ||
        height >= 28 ||
        footprintArea >= 1600 ||
        Number.isFinite(buildingSemantics?.levels) && buildingSemantics.levels >= 8;
      if (accepted >= denseCellCap && !isImportantBuilding) continue;
      acceptedByCell.set(cellKey, accepted + 1);

      let avgElevation = 0;
      let minElevation = Infinity;
      let maxElevation = -Infinity;
      for (let j = 0; j < pts.length; j++) {
        const terrainY = appCtx.elevationWorldYAtWorldXZ(pts[j].x, pts[j].z);
        avgElevation += terrainY;
        minElevation = Math.min(minElevation, terrainY);
        maxElevation = Math.max(maxElevation, terrainY);
      }
      avgElevation /= pts.length;
      const slopeRange =
        Number.isFinite(minElevation) && Number.isFinite(maxElevation) ?
          maxElevation - minElevation :
          0;
      const baseElevation = slopeRange >= 0.08 ? minElevation + 0.03 : avgElevation;
      const colorSeed = (appCtx.rdtSeed ^ (Number(way.id) >>> 0) ^ (accepted * 2654435761 >>> 0)) >>> 0;
      const color = pickBuildingBaseColor(buildingType, colorSeed);
      const mesh = createMidLodBuildingMesh(pts, height, baseElevation, color, {
        buildingType,
        buildingSeed: colorSeed
      });
      if (!mesh) continue;
      mesh.userData.sourceBuildingId = sourceBuildingId;
      mesh.userData.buildingType = buildingType;
      mesh.userData.buildingName = way.tags?.name || '';
      mesh.userData.structureSemantics = structureSemantics;
      mesh.userData.buildingSemantics = buildingSemantics;
      mesh.userData.startupShellPlaceholder = true;
      mesh.userData.alwaysVisible = true;
      assignContinuousWorldRegionKeysToTarget(mesh, {
        points: pts,
        family: 'buildings'
      });
      appCtx.scene.add(mesh);
      appCtx.buildingMeshes.push(mesh);
      appCtx.startupShellBuildingMeshes.push(mesh);
      added += 1;
    }
    return added;
  };

  const startStartupShellLoad = () => {
    if (startupShellPromise || !startupLoadPhase || earthSceneSuppressed() || !isActiveLoadContext()) {
      return startupShellPromise;
    }
    if (STARTUP_WORLD_BUILD_CONFIG.placeholderShellEnabled !== true) {
      startupShellPromise = Promise.resolve(0);
      loadMetrics.startupLocalShell = {
        disabled: true,
        reason: 'placeholder_shell_disabled'
      };
      return startupShellPromise;
    }
      startupShellPromise = (async () => {
      startLoadPhase('fetchOverpassStartupShell');
      try {
        const shellTimeoutMs = Math.min(overpassTimeoutMs, STARTUP_WORLD_BUILD_CONFIG.shellQueryTimeoutMs);
        const shellDeadline = performance.now() + STARTUP_WORLD_BUILD_CONFIG.shellQueryDeadlineMs;
        const startupShellQuery = `[out:json][timeout:${Math.max(4, Math.floor(shellTimeoutMs / 1000))}];(
          way["building"]${startupShellBounds};
        );out body;>;out skel qt;`;
        const shellData = await fetchOverpassJSON(startupShellQuery, shellTimeoutMs, shellDeadline, {
          ...overpassCacheMeta,
          roadsRadius: startupCoreRoadRadius,
          featureRadius: startupShellRadius,
          queryKind: 'startup_local_shell',
          startupLocalShell: true
        });
        if (earthSceneSuppressed() || !isActiveLoadContext() || !startupShellPhaseOpen) return 0;
        const shellNodes = {};
        shellData.elements.filter((e) => e.type === 'node').forEach((n) => shellNodes[n.id] = n);
        const allShellBuildings = shellData.elements.filter((e) => e.type === 'way' && !!e.tags?.building);
        const shellBuildings = limitWaysByTileBudget(allShellBuildings, shellNodes, {
          globalCap: STARTUP_WORLD_BUILD_CONFIG.shellMaxBuildings,
          basePerTile: 40,
          minPerTile: 16,
          tileDegrees: FEATURE_TILE_DEGREES,
          useRdt: false,
          spreadAcrossArea: true,
          coreRatio: 0.72
        });
        const addedShellBuildings = appendStartupShellBuildingsToWorld(
          shellBuildings,
          shellNodes,
          buildBuildingGeometryGuards(geometryGuards)
        );
        if (addedShellBuildings > 0 && typeof updateWorldLod === 'function') {
          safeLoadCall('updateWorldLod_startup_shell', () => updateWorldLod(true));
        }
        if (addedShellBuildings > 0) {
          await promoteRoadsReadyWorld('startup_local_shell');
          scheduleStartupPromotionCheck(150);
        }
        loadMetrics.startupLocalShell = {
          requested: allShellBuildings.length,
          selected: shellBuildings.length,
          added: addedShellBuildings,
          overpassSource: shellData?._overpassSource || 'unknown',
          overpassEndpoint: shellData?._overpassEndpoint || null
        };
        return addedShellBuildings;
      } catch (err) {
        recordLoadWarning('fetchOverpassStartupShell', err);
        return 0;
      } finally {
        endLoadPhase('fetchOverpassStartupShell');
      }
    })();
    return startupShellPromise;
  };

  const startStartupLocalRoadBoost = (centerLat, centerLon) => {
    if (
      startupLocalRoadBoostPromise ||
      !startupLoadPhase ||
      earthSceneSuppressed() ||
      !isActiveLoadContext() ||
      !Number.isFinite(centerLat) ||
      !Number.isFinite(centerLon)
    ) {
      return startupLocalRoadBoostPromise;
    }
    startupLocalRoadBoostPromise = (async () => {
      startLoadPhase('fetchOverpassStartupLocalRoads');
      try {
        const localRoadRadius = clampNumber(
          Math.max(
            STARTUP_WORLD_BUILD_CONFIG.coreRoadRadiusMinDegrees,
            startupCoreRoadRadius * STARTUP_WORLD_BUILD_CONFIG.localRoadRadiusScale
          ),
          STARTUP_WORLD_BUILD_CONFIG.coreRoadRadiusMinDegrees,
          Math.max(startupQueryRoadRadius, STARTUP_WORLD_BUILD_CONFIG.coreRoadRadiusMinDegrees),
          startupCoreRoadRadius
        );
        const localRoadBounds = `(${centerLat - localRoadRadius},${centerLon - localRoadRadius},${centerLat + localRoadRadius},${centerLon + localRoadRadius})`;
        const localRoadTimeoutMs = Math.min(overpassTimeoutMs, STARTUP_WORLD_BUILD_CONFIG.localRoadQueryTimeoutMs);
        const localRoadDeadline = performance.now() + STARTUP_WORLD_BUILD_CONFIG.localRoadQueryDeadlineMs;
        const localRoadQuery = `[out:json][timeout:${Math.max(4, Math.floor(localRoadTimeoutMs / 1000))}];(
          way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|unclassified|living_street|service)$"]${localRoadBounds};
        );out body;>;out skel qt;`;
        const localRoadData = await fetchOverpassJSON(localRoadQuery, localRoadTimeoutMs, localRoadDeadline, {
          ...overpassCacheMeta,
          lat: Number(centerLat.toFixed(5)),
          lon: Number(centerLon.toFixed(5)),
          roadsRadius: localRoadRadius,
          featureRadius: localRoadRadius,
          queryKind: 'startup_local_roads',
          startupLocalRoadBoost: true
        });
        if (earthSceneSuppressed() || !isActiveLoadContext()) return 0;
        const localRoadNodes = {};
        localRoadData.elements.filter((e) => e.type === 'node').forEach((n) => localRoadNodes[n.id] = n);
        const allLocalRoadWays = localRoadData.elements.filter((e) =>
          e.type === 'way' &&
          isDriveableHighwayTag(e.tags?.highway)
        );
        const localRoadWays = limitWaysByTileBudget(allLocalRoadWays, localRoadNodes, {
          globalCap: Math.max(480, Math.floor(maxRoadWaysForPass * STARTUP_WORLD_BUILD_CONFIG.localRoadBudgetScale)),
          basePerTile: Math.max(42, Math.floor(tileBudgetCfg.roadsPerTile * STARTUP_WORLD_BUILD_CONFIG.localRoadBasePerTileScale)),
          minPerTile: Math.max(22, Math.floor(tileBudgetCfg.roadsMinPerTile * STARTUP_WORLD_BUILD_CONFIG.localRoadMinPerTileScale)),
          tileDegrees: tileBudgetCfg.tileDegrees,
          useRdt: false,
          compareFn: (a, b) => roadTypePriority(b.tags?.highway) - roadTypePriority(a.tags?.highway)
        });
        const localRoadMainBatchGroups = new Map();
        const localRoadSkirtBatchGroups = new Map();
        const {
          roadMainMaterial: localRoadMainMaterial,
          roadSkirtMaterial: localRoadSkirtMaterial
        } = createRoadSurfaceMaterials({
          asphaltTex: appCtx.asphaltTex,
          asphaltNormal: appCtx.asphaltNormal,
          asphaltRoughness: appCtx.asphaltRoughness,
          includeMarkings: false
        });
        const startupRoadMutation = { bounds: null, regionKeys: new Set() };
        const addedLocalRoads = appendRoadWaysToWorld(localRoadWays, localRoadNodes, geometryGuards, {
          roadMainBatchGroups: localRoadMainBatchGroups,
          roadSkirtBatchGroups: localRoadSkirtBatchGroups,
          includeMarkings: false,
          roadMainMaterial: localRoadMainMaterial,
          roadSkirtMaterial: localRoadSkirtMaterial,
          registerPreloaded: true,
          roadMutationCollector: startupRoadMutation
        });
        if (addedLocalRoads > 0) {
          if (typeof appCtx.primeRoadSurfaceSyncState === 'function') {
            appCtx.primeRoadSurfaceSyncState({
              clearHeightCache: false,
              preserveActiveTask: true,
              mutationType: 'append',
              source: 'startup_local_roads',
              bounds: startupRoadMutation.bounds,
              regionKeys: Array.from(startupRoadMutation.regionKeys || [])
            });
          }
          const playableCore = updatePlayableCoreResidency(true, { reason: 'startup_local_roads' });
          if (typeof updateWorldLod === 'function') {
            safeLoadCall('updateWorldLod_startup_local_roads', () => updateWorldLod(true));
          }
          loadMetrics.startupLocalRoadBoost = {
            requested: allLocalRoadWays.length,
            selected: localRoadWays.length,
            added: addedLocalRoads,
            roadMeshCount: Number(playableCore?.roadMeshCount || 0),
            overpassSource: localRoadData?._overpassSource || 'unknown',
            overpassEndpoint: localRoadData?._overpassEndpoint || null
          };
          await promoteRoadsReadyWorld('startup_local_roads');
          scheduleStartupPromotionCheck(140);
        }
        return addedLocalRoads;
      } catch (err) {
        recordLoadWarning('fetchOverpassStartupLocalRoads', err);
        return 0;
      } finally {
        endLoadPhase('fetchOverpassStartupLocalRoads');
      }
    })();
    return startupLocalRoadBoostPromise;
  };

  const promoteRoadsReadyWorld = async (reason = 'startup_roads_ready') => {
    if (startupRoadsReadyPromoted || earthSceneSuppressed() || !isActiveLoadContext()) return false;
    const playableCore = updatePlayableCoreResidency(true, { reason });
    if (typeof updateWorldLod === 'function') {
      safeLoadCall('updateWorldLod_roads_ready_gate', () => updateWorldLod(true));
    }
    if (!playableCore?.ready) return false;
    const actorState = continuousWorldInteractiveActorMotionState();
    const minVisibleRoadMeshesReady =
      Number(
        PLAYABLE_CORE_RESIDENCY_CONFIG.minVisibleRoadMeshesReady?.[String(actorState?.mode || 'drive')] ??
        PLAYABLE_CORE_RESIDENCY_CONFIG.minVisibleRoadMeshesReady?.drive ??
        1
      ) || 1;
    const visibleRoadMeshesNearActor = countVisibleRoadMeshesNearWorldPoint(
      Number(actorState?.x || 0),
      Number(actorState?.z || 0),
      String(actorState?.mode || 'drive') === 'drive' ? 240 : 180
    );
    const nearbyDriveableRoadFeatures = countDriveableRoadFeaturesNearWorldPoint(
      Number(actorState?.x || 0),
      Number(actorState?.z || 0),
      String(actorState?.mode || 'drive') === 'drive' ? 260 : 180
    );
    if (visibleRoadMeshesNearActor < minVisibleRoadMeshesReady) {
      if (
        nearbyDriveableRoadFeatures >= Math.max(8, minVisibleRoadMeshesReady) &&
        typeof appCtx.requestWorldSurfaceSync === 'function'
      ) {
        safeLoadCall(
          'requestWorldSurfaceSync_startup_visible_road_shell',
          () => appCtx.requestWorldSurfaceSync({ force: true, source: 'startup_visible_road_shell' })
        );
      }
      const actorGeo = currentMapReferenceGeoPosition();
      if (startupLoadPhase) {
        safeLoadCall(
          'startStartupLocalRoadBoost_roads_gate',
          () => startStartupLocalRoadBoost(actorGeo.lat, actorGeo.lon)
        );
      }
      scheduleStartupPromotionCheck(160);
      return false;
    }
    startupRoadsReadyPromoted = true;
    if (startupPromotionCheckTimer) {
      clearTimeout(startupPromotionCheckTimer);
      startupPromotionCheckTimer = null;
    }
    appCtx.worldLoading = false;
    appCtx.worldBuildStage = 'playable_core_ready';
    safeLoadCall('buildTraversalNetworks_roads_ready', () => buildTraversalNetworks());
    if (!shouldPreserveExplicitPlayerTarget(0, 0)) {
      safeLoadCall('spawnOnRoad_roads_ready', () => spawnOnRoad());
    }
    if (typeof appCtx.primeRoadSurfaceSyncState === 'function') {
      safeLoadCall('primeRoadSurfaceSyncState_roads_ready', () => appCtx.primeRoadSurfaceSyncState());
    }
    if (appCtx.terrainEnabled && !appCtx.onMoon && typeof appCtx.updateTerrainAround === 'function') {
      safeLoadCall('updateTerrainAround_roads_ready', () => appCtx.updateTerrainAround(appCtx.car.x, appCtx.car.z));
    }
    if (typeof updateWorldLod === 'function') {
      safeLoadCall('updateWorldLod_roads_ready', () => updateWorldLod(true));
    }
    safeLoadCall('seedContinuousWorldInteractiveStreamState_roads_ready', () => seedContinuousWorldInteractiveStreamState());
    const actorGeo = safeLoadCall('currentMapReferenceGeoPosition_roads_ready', () => currentMapReferenceGeoPosition());
    if (Number.isFinite(actorGeo?.lat) && Number.isFinite(actorGeo?.lon)) {
      safeLoadCall(
        'startStartupLocalRoadBoost_roads_ready',
        () => startStartupLocalRoadBoost(actorGeo.lat, actorGeo.lon)
      );
      if (continuousWorldStartupLocalShellEnabled()) {
        safeLoadCall(
          'loadContinuousWorldInteractiveChunk_startup_local_shell',
          () => void loadContinuousWorldInteractiveChunk(actorGeo.lat, actorGeo.lon, 'startup_local_shell')
        );
      }
    }
    appCtx.hideLoad();
    if (typeof appCtx.markPerfMilestone === 'function') {
      appCtx.markPerfMilestone('world:roads_ready', {
        reason,
        roads: Array.isArray(appCtx.roads) ? appCtx.roads.length : 0,
        buildingMeshes: Array.isArray(appCtx.buildingMeshes) ? appCtx.buildingMeshes.length : 0
      });
    }
    if (appCtx.gameStarted) {
      safeLoadCall('startMode_roads_ready', () => appCtx.startMode());
    }
    return true;
  };

  const settleLoadedWorldSurface = async (originX = 0, originZ = 0, options = {}) => {
    if (!isActiveLoadContext()) return null;
    if (appCtx.onMoon || !appCtx.terrainEnabled || typeof appCtx.updateTerrainAround !== 'function') return null;

    const background = options.background === true;
    const deadline = performance.now() + (background ? 2200 : 4500);
    let settled = null;
    let lastSurfaceRequestAt = 0;
    let forcedLocalSyncIssued = false;
    while (performance.now() < deadline) {
      if (!isActiveLoadContext()) return settled;

      appCtx.updateTerrainAround(appCtx.car.x, appCtx.car.z);
      let surfaceApplied = false;
      if (typeof appCtx.requestWorldSurfaceSync === 'function') {
        const terrainSnapshot =
          typeof appCtx.getTerrainStreamingSnapshot === 'function' ?
            appCtx.getTerrainStreamingSnapshot() :
            null;
        const pendingSurfaceSyncRoads = Number(terrainSnapshot?.pendingSurfaceSyncRoads || 0);
        const rebuildInFlight = !!terrainSnapshot?.rebuildInFlight;
        const roadsNeedRebuild = terrainSnapshot ? !!terrainSnapshot.roadsNeedRebuild : !!appCtx.roadsNeedRebuild;
        const requestCooldownMs = background ? 320 : 180;
        const requestReady =
          roadsNeedRebuild &&
          !rebuildInFlight &&
          pendingSurfaceSyncRoads <= 0 &&
          (performance.now() - lastSurfaceRequestAt) >= requestCooldownMs;
        if (requestReady) {
          const requestForce = !background && !forcedLocalSyncIssued;
          surfaceApplied = !!appCtx.requestWorldSurfaceSync({
            force: requestForce,
            deferOnly: !requestForce,
            source: background ? 'load_surface_settle_bg' : 'load_surface_settle'
          });
          lastSurfaceRequestAt = performance.now();
          if (requestForce) forcedLocalSyncIssued = true;
        }
      } else if (typeof appCtx.rebuildRoadsWithTerrain === 'function') {
        appCtx.rebuildRoadsWithTerrain();
        if (typeof appCtx.repositionBuildingsWithTerrain === 'function') {
          appCtx.repositionBuildingsWithTerrain();
        }
        surfaceApplied = true;
      }

      const currentRoad = appCtx.car?.road || appCtx.car?._lastStableRoad || null;
      const currentFeetY = finiteNumberOr(appCtx.car?.y, 1.2) - 1.2;
      const currentConflict = !!findSpawnOverheadConflict(
        currentRoad,
        finiteNumberOr(appCtx.car?.x, 0),
        finiteNumberOr(appCtx.car?.z, 0),
        currentFeetY
      );

      let nextSpawn = null;
      if (currentConflict || !appCtx.car?.onRoad || !currentRoad) {
        nextSpawn = searchNearestSafeRoadSpawn(originX, originZ, {
          mode: 'drive',
          angle: finiteNumberOr(appCtx.car?.angle, 0),
          feetY: currentFeetY,
          maxDistance: 360,
          avoidOverhead: true,
          strictMaxDistance: true
        });
      } else {
        nextSpawn = resolveSafeWorldSpawn(appCtx.car.x, appCtx.car.z, {
          mode: 'drive',
          angle: finiteNumberOr(appCtx.car?.angle, 0),
          feetY: currentFeetY,
          maxRoadDistance: 120,
          strictMaxDistance: true,
          source: 'load_surface_settle'
        });
      }

      if (nextSpawn?.valid) {
        settled = applyResolvedWorldSpawn(nextSpawn, {
          mode: 'drive',
          syncCar: true,
          syncWalker: true
        });
      }

      if (!appCtx.roadsNeedRebuild && settled) return settled;
      await delayMs(surfaceApplied ? 80 : (background ? 120 : 140));
    }

    return settled;
  };

  async function finalizeLoadedWorld(reason = 'primary') {
    if (startupPromotionCheckTimer) {
      clearTimeout(startupPromotionCheckTimer);
      startupPromotionCheckTimer = null;
    }
    if (earthSceneSuppressed()) {
      loaded = true;
      loadMetrics.recoveryReason = 'env_changed_during_load';
      loadMetrics.partialRecovery = true;
      hideEarthSceneMeshes();
      appCtx.hideLoad();
      appCtx.worldBuildStage = 'suppressed';
      return;
    }

    loaded = true;
    if (reason && reason !== 'primary') {
      loadMetrics.recoveryReason = reason;
      loadMetrics.partialRecovery = true;
    }
    const partialRecovery = !!(reason && reason !== 'primary');

    const preservePlayerState = startupRoadsReadyPromoted || shouldPreserveExplicitPlayerTarget(0, 0);

    safeLoadCall('buildTraversalNetworks', () => buildTraversalNetworks());
    if (!preservePlayerState) {
      safeLoadCall('spawnOnRoad', () => spawnOnRoad());
    }
    if (typeof appCtx.primeRoadSurfaceSyncState === 'function') {
      safeLoadCall('primeRoadSurfaceSyncState', () => appCtx.primeRoadSurfaceSyncState());
    }
    let backgroundSurfaceSettle = false;
    if (appCtx.terrainEnabled && !appCtx.onMoon && typeof appCtx.updateTerrainAround === 'function') {
      safeLoadCall('updateTerrainAround', () => appCtx.updateTerrainAround(appCtx.car.x, appCtx.car.z));
      const needsCriticalSurfaceSettle = !startupRoadsReadyPromoted && !appCtx.car?.onRoad;
      if (needsCriticalSurfaceSettle) {
        await settleLoadedWorldSurface(0, 0);
      } else if (!startupRoadsReadyPromoted && appCtx.roadsNeedRebuild && typeof appCtx.requestWorldSurfaceSync === 'function') {
        safeLoadCall(
          'requestWorldSurfaceSync_local',
          () => appCtx.requestWorldSurfaceSync({
            deferOnly: true,
            source: startupRoadsReadyPromoted ? 'load_surface_settle_bg' : 'load_surface_settle'
          })
        );
        backgroundSurfaceSettle = !startupRoadsReadyPromoted;
      } else if (!startupRoadsReadyPromoted) {
        backgroundSurfaceSettle = !startupRoadsReadyPromoted;
      }
    }
    if (typeof appCtx.refreshMemoryMarkersForCurrentLocation === 'function') {
      safeLoadCall('refreshMemoryMarkersForCurrentLocation', () => appCtx.refreshMemoryMarkersForCurrentLocation());
    }
    if (typeof appCtx.refreshBlockBuilderForCurrentLocation === 'function') {
      safeLoadCall('refreshBlockBuilderForCurrentLocation', () => appCtx.refreshBlockBuilderForCurrentLocation());
    }
    if (typeof updateWorldLod === 'function') {
      safeLoadCall('updateWorldLod', () => updateWorldLod(true));
    }
    const validatedSpawn = preservePlayerState ?
      null :
      safeLoadCall(
        'validateActiveDriveSpawnAfterWorldBuild',
        () => validateActiveDriveSpawnAfterWorldBuild({
          source: `finalize_loaded_world:${reason}`,
          maxRoadDistance: preservePlayerState ? 360 : 280
        })
      );
    if (validatedSpawn) {
      loadMetrics.postBuildSpawnValidation = {
        corrected: true,
        source: validatedSpawn.source || null,
        mode: validatedSpawn.mode || 'drive',
        x: Number(validatedSpawn.x || 0),
        z: Number(validatedSpawn.z || 0)
      };
      if (appCtx.terrainEnabled && !appCtx.onMoon && typeof appCtx.updateTerrainAround === 'function') {
        safeLoadCall('updateTerrainAround_postBuildSpawnValidation', () => appCtx.updateTerrainAround(appCtx.car.x, appCtx.car.z));
      }
      if (typeof updateWorldLod === 'function') {
        safeLoadCall('updateWorldLod_postBuildSpawnValidation', () => updateWorldLod(true));
      }
      if (typeof appCtx.requestWorldSurfaceSync === 'function') {
        safeLoadCall(
          'requestWorldSurfaceSync_postBuildSpawnValidation',
          () => appCtx.requestWorldSurfaceSync({
            deferOnly: true,
            source: 'post_build_spawn_validation'
          })
        );
      }
    } else {
      loadMetrics.postBuildSpawnValidation = {
        corrected: false
      };
    }
    safeLoadCall('seedContinuousWorldInteractiveStreamState', () => seedContinuousWorldInteractiveStreamState());
    if (!preservePlayerState) appCtx.hideLoad();
    appCtx.worldBuildStage = partialRecovery ? 'partial_world_ready' : 'full_world_ready';
    appCtx.worldBuildReadyReason = reason || 'primary';
    syncRuntimeContentInventory('world_ready');
    if (typeof appCtx.markPerfMilestone === 'function') {
      appCtx.markPerfMilestone('world:ready', {
        reason,
        roads: Array.isArray(appCtx.roads) ? appCtx.roads.length : 0,
        buildingMeshes: Array.isArray(appCtx.buildingMeshes) ? appCtx.buildingMeshes.length : 0,
        landuseMeshes: Array.isArray(appCtx.landuseMeshes) ? appCtx.landuseMeshes.length : 0
      });
    }
    if (
      Array.isArray(appCtx.vegetationMeshes) &&
      appCtx.vegetationMeshes.length === 0 &&
      (
        (Array.isArray(appCtx.landuses) && appCtx.landuses.length > 0) ||
        (Array.isArray(appCtx.osmTreeNodes) && appCtx.osmTreeNodes.length > 0) ||
        (Array.isArray(appCtx.osmTreeRows) && appCtx.osmTreeRows.length > 0)
      )
    ) {
      safeLoadCall('generateStreetFurniture_recovery', () => generateStreetFurniture());
    }
    if (typeof appCtx.refreshAstronomicalSky === 'function') {
      safeLoadCall('refreshAstronomicalSky', () => appCtx.refreshAstronomicalSky(true));
    } else if (typeof appCtx.alignStarFieldToLocation === 'function') {
      safeLoadCall('alignStarFieldToLocation', () => appCtx.alignStarFieldToLocation(appCtx.LOC.lat, appCtx.LOC.lon));
    }
    if (typeof appCtx.refreshLiveWeather === 'function') {
      safeLoadCall('refreshLiveWeather', () => appCtx.refreshLiveWeather(true));
    }
    if (appCtx.gameStarted && !preservePlayerState) {
      safeLoadCall('startMode', () => appCtx.startMode());
    }
    if (partialRecovery) {
      window.setTimeout(() => {
        if (!isActiveLoadContext()) return;
        try {
          const actorState = continuousWorldInteractiveActorMotionState();
          const nearbyVisibleRoads = countVisibleRoadMeshesNearWorldPoint(
            Number(actorState?.x || 0),
            Number(actorState?.z || 0),
            320
          );
          const nearbyRoadFeatures = countDriveableRoadFeaturesNearWorldPoint(
            Number(actorState?.x || 0),
            Number(actorState?.z || 0),
            320
          );
          const nearbyVisibleBuildings = countVisibleBuildingMeshesNearWorldPoint(
            Number(actorState?.x || 0),
            Number(actorState?.z || 0),
            420
          );
          if (nearbyVisibleRoads <= 4 || nearbyRoadFeatures <= 8) {
            kickContinuousWorldInteractiveStreaming('actor_visible_road_gap');
            return;
          }
          if (nearbyVisibleBuildings < 24) {
            kickContinuousWorldInteractiveStreaming(
              actorState?.mode === 'drive' ? 'building_continuity_drive' : 'actor_building_gap'
            );
          }
        } catch (err) {
          recordLoadWarning('partial_world_recovery_kick', err);
        }
      }, 120);
    }
    if (backgroundSurfaceSettle) {
      window.setTimeout(() => {
        if (!isActiveLoadContext()) return;
        void settleLoadedWorldSurface(0, 0, { background: true });
      }, 160);
    }
  }

  function createSyntheticFallbackWorld() {
    if (appCtx.roads.length > 0) return;
    appCtx.showLoad('Creating default environment...');
    const isPolarFallback = Math.abs(Number(appCtx.LOC?.lat) || 0) >= 66;
    const enableFallbackBuildings = false;

    // Remove any partially generated geometry before building a deterministic fallback.
    disposeTrackedMeshList(appCtx.roadMeshes, 'fallback_world_reset');
    disposeTrackedMeshList(appCtx.urbanSurfaceMeshes, 'fallback_world_reset');
    disposeTrackedMeshList(appCtx.structureVisualMeshes, 'fallback_world_reset');
    disposeTrackedMeshList(appCtx.buildingMeshes, 'fallback_world_reset');
    disposeTrackedMeshList(appCtx.landuseMeshes, 'fallback_world_reset');
    disposeTrackedMeshList(appCtx.linearFeatureMeshes, 'fallback_world_reset');
    disposeTrackedMeshList(appCtx.poiMeshes, 'fallback_world_reset');
    disposeTrackedMeshList(appCtx.streetFurnitureMeshes, 'fallback_world_reset');
    disposeTrackedMeshList(appCtx.vegetationMeshes, 'fallback_world_reset');
    disposeTrackedMeshList(appCtx.historicMarkers, 'fallback_world_reset');
    clearRoadMeshSpatialIndex();
    appCtx.vegetationFeatures = [];
    appCtx.roads = [];
    appCtx.buildings = [];
    appCtx.landuses = [];
    appCtx.surfaceFeatureHints = [];
    appCtx.waterAreas = [];
    appCtx.waterways = [];
    appCtx.waterWaveVisuals = [];
    invalidateTraversalNetworks('fallback_world_reset');
    appCtx.navigationRoutePoints = [];
    appCtx.navigationRouteDistance = 0;
    appCtx.linearFeatures = [];
    appCtx.linearFeatureMeshes = [];
    appCtx.dynamicBuildingColliders = [];
    appCtx.pois = [];
    appCtx.historicSites = [];
    appCtx.urbanSurfaceStats = {
      sidewalkBatchCount: 0,
      sidewalkVertices: 0,
      sidewalkTriangles: 0,
      skippedBuildingAprons: 0
    };
    syncRuntimeContentInventory('fallback_world_reset');
    clearBuildingSpatialIndex();
    clearLanduseSpatialIndex();

    const makeRoad = (x1, z1, x2, z2, width = 10) => {
      const pts = [{ x: x1, z: z1 }, { x: x2, z: z2 }];
      appCtx.roads.push({
        pts,
        width,
        limit: 35,
        name: 'Main Street',
        sourceFeatureId: `fallback-road:${x1}:${z1}:${x2}:${z2}`,
        type: 'primary',
        sidewalkHint: 'both',
        networkKind: 'road',
        walkable: true,
        driveable: true,
        lodDepth: 0,
        subdivideMaxDist: getRoadSubdivisionStep('primary', 0, perfModeNow),
        bounds: polylineBounds(pts, width * 0.5 + 18)
      });

      const hw = width / 2;
      const verts = [],indices = [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const dx = pts[1].x - pts[0].x,dz = pts[1].z - pts[0].z;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        const nx = -dz / len,nz = dx / len;
        const y1 = appCtx.elevationWorldYAtWorldXZ(p.x + nx * hw, p.z + nz * hw) + 0.3;
        const y2 = appCtx.elevationWorldYAtWorldXZ(p.x - nx * hw, p.z - nz * hw) + 0.3;
        verts.push(p.x + nx * hw, y1, p.z + nz * hw);
        verts.push(p.x - nx * hw, y2, p.z - nz * hw);
        if (i < pts.length - 1) {const vi = i * 2;indices.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);}
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      const roadMat = new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.95,
        metalness: 0.05,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
      });
      const mesh = new THREE.Mesh(geo, roadMat);
      mesh.renderOrder = 2;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      appCtx.scene.add(mesh);appCtx.roadMeshes.push(mesh);
    };

    makeRoad(-200, 0, 200, 0, 12);
    makeRoad(0, -200, 0, 200, 12);
    makeRoad(-150, -150, 150, 150, 10);
    makeRoad(-150, 150, 150, -150, 10);
    markRoadMeshSpatialIndexDirty();

    const makeBuilding = (x, z, w, d, h, idx = 0) => {
      const pts = [
      { x: x - w / 2, z: z - d / 2 },
      { x: x + w / 2, z: z - d / 2 },
      { x: x + w / 2, z: z + d / 2 },
      { x: x - w / 2, z: z + d / 2 }];

      const sourceBuildingId = `fallback-${idx}-${Math.round(x)}-${Math.round(z)}`;
      const colliderRef = registerBuildingCollision(pts, h, {
        sourceBuildingId,
        buildingType: 'fallback',
        name: 'Fallback Building'
      });

      const shape = new THREE.Shape();
      shape.moveTo(pts[0].x, pts[0].z);
      for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, pts[i].z);
      shape.lineTo(pts[0].x, pts[0].z);

      const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      const color = [0x8899aa, 0x887766, 0x7788aa, 0x887799][Math.floor(Math.random() * 4)];
      const mat = new THREE.MeshLambertMaterial({ color });
      const mesh = new THREE.Mesh(geo, mat);

      let avgElevation = 0;
      let minElevation = Infinity;
      let maxElevation = -Infinity;
      pts.forEach((p) => {
        const hTerrain = appCtx.elevationWorldYAtWorldXZ(p.x, p.z);
        avgElevation += hTerrain;
        if (hTerrain < minElevation) minElevation = hTerrain;
        if (hTerrain > maxElevation) maxElevation = hTerrain;
      });
      avgElevation /= pts.length;
      const slopeRange = Number.isFinite(minElevation) && Number.isFinite(maxElevation) ?
      maxElevation - minElevation :
      0;
      const baseElevation = slopeRange >= 0.15 ? minElevation + 0.05 : avgElevation;
      mesh.position.y = baseElevation;
      mesh.userData.buildingFootprint = pts;
      mesh.userData.avgElevation = baseElevation;
      mesh.userData.terrainAvgElevation = avgElevation;
      mesh.userData.sourceBuildingId = sourceBuildingId;
      mesh.userData.buildingType = 'fallback';
      assignContinuousWorldRegionKeysToTarget(mesh, {
        points: pts,
        family: 'buildings'
      });
      if (colliderRef) {
        colliderRef.baseY = baseElevation;
        colliderRef.minY = baseElevation;
        colliderRef.maxY = baseElevation + h;
      }

      mesh.castShadow = true;
      mesh.receiveShadow = true;
      appCtx.scene.add(mesh);
      appCtx.buildingMeshes.push(mesh);

      const fallbackGroundPatchThreshold =
        appCtx.pavementDiffuse ?
          BUILDING_GROUND_PATCH_CONFIG.slopeThreshold :
          BUILDING_GROUND_PATCH_CONFIG.untexturedSlopeThreshold;
      if (
        BUILDING_GROUND_PATCH_CONFIG.enabled === true &&
        typeof appCtx.createBuildingGroundPatch === 'function' &&
        slopeRange >= fallbackGroundPatchThreshold
      ) {
        const groundPatchesRaw = appCtx.createBuildingGroundPatch(pts, baseElevation, {
          includeApron: false,
          includeFoundationSkirt: false
        });
        const groundPatches = Array.isArray(groundPatchesRaw) ? groundPatchesRaw : groundPatchesRaw ? [groundPatchesRaw] : [];
        groundPatches.forEach((groundPatch) => {
          groundPatch.userData.landuseFootprint = pts;
          groundPatch.userData.landuseType = 'buildingGround';
          groundPatch.userData.avgElevation = baseElevation;
          groundPatch.userData.terrainAvgElevation = avgElevation;
          groundPatch.userData.alwaysVisible = true;
          groundPatch.visible = true;
          assignContinuousWorldRegionKeysToTarget(groundPatch, {
            points: pts,
            family: 'landuse'
          });
          appCtx.scene.add(groundPatch);
          appCtx.landuseMeshes.push(groundPatch);
        });
      }
    };

    if (enableFallbackBuildings && !isPolarFallback) {
      makeBuilding(-80, -80, 40, 30, 15, 0);
      makeBuilding(80, -80, 35, 40, 20, 1);
      makeBuilding(-80, 80, 45, 35, 18, 2);
      makeBuilding(80, 80, 30, 35, 12, 3);
      makeBuilding(-50, 50, 25, 20, 10, 4);
      makeBuilding(50, -50, 30, 25, 14, 5);
    }
  }

  for (const r of radii) {
    if (loaded) break;
    let waterCoveragePriority = false;
    try {
      if (performance.now() - loadStartedAt > maxTotalLoadMs) {
        console.warn('[Overpass] Max load budget reached, switching to fallback world.');
        break;
      }

      showWorldLoadProgress('Loading map data...');
      const defaultFeatureRadius = r * featureRadiusScale;
      const defaultPoiRadius = r * poiRadiusScale;
      const defaultLinearFeatureRadius = Math.min(defaultFeatureRadius, Math.max(r * 0.6, 0.008));
      const continuousWorldVisibleLoadPlan = getContinuousWorldVisibleLoadPlan({
        roadRadius: r,
        featureRadius: defaultFeatureRadius,
        poiRadius: defaultPoiRadius,
        linearFeatureRadius: defaultLinearFeatureRadius,
        maxRoadWays,
        maxBuildingWays,
        maxLanduseWays,
        maxPoiNodes
      });
      const roadsQueryRadius = continuousWorldVisibleLoadPlan?.roadRadius || r;
      const featureRadius = continuousWorldVisibleLoadPlan?.featureRadius || defaultFeatureRadius;
      const poiRadius = continuousWorldVisibleLoadPlan?.poiRadius || defaultPoiRadius;
      const linearFeatureRadius = continuousWorldVisibleLoadPlan?.linearFeatureRadius || defaultLinearFeatureRadius;
      maxRoadWaysForPass = continuousWorldVisibleLoadPlan?.maxRoadWays || maxRoadWays;
      maxBuildingWaysForPass = continuousWorldVisibleLoadPlan?.maxBuildingWays || maxBuildingWays;
      maxLanduseWaysForPass = continuousWorldVisibleLoadPlan?.maxLanduseWays || maxLanduseWays;
      maxPoiNodesForPass = continuousWorldVisibleLoadPlan?.maxPoiNodes || maxPoiNodes;
      appCtx._continuousWorldVisibleLoadConfig = continuousWorldVisibleLoadPlan ? {
        ...continuousWorldVisibleLoadPlan,
        location: {
          lat: Number(appCtx.LOC?.lat || 0),
          lon: Number(appCtx.LOC?.lon || 0)
        }
      } : null;
      loadMetrics.continuousWorldVisibleLoad = continuousWorldVisibleLoadPlan ? {
        enabled: true,
        roadRadius: Number(roadsQueryRadius.toFixed(5)),
        featureRadius: Number(featureRadius.toFixed(5)),
        poiRadius: Number(poiRadius.toFixed(5)),
        linearFeatureRadius: Number(linearFeatureRadius.toFixed(5)),
        budgetScale: Number(continuousWorldVisibleLoadPlan.budgetScale.toFixed(2)),
        buildingFarLoadDistance: continuousWorldVisibleLoadPlan.buildingFarLoadDistance
      } : { enabled: false };
      geometryGuards = buildFeatureGeometryGuards(featureRadius);
      const buildingGeometryGuards = buildBuildingGeometryGuards(geometryGuards);
      const landuseGeometryGuards = buildLanduseGeometryGuards(geometryGuards);
      const waterGeometryGuards = buildWaterGeometryGuards(geometryGuards);
      startupLoadPhase = !!continuousWorldVisibleLoadPlan?.startupPhase;
      if (startupLoadPhase) appCtx.worldBuildStage = 'playable_core_loading';
      startupCoreRoadRadius = startupLoadPhase ?
        startupPlayableCoreRoadRadiusDegrees(roadsQueryRadius, 'drive') :
        roadsQueryRadius;
      startupQueryRoadRadius = roadsQueryRadius;
      const genericBuildingRadius = startupLoadPhase ?
        clampNumber(
          Math.max(featureRadius * CONTINUOUS_WORLD_INTERACTIVE_STREAM_STARTUP_BUILDING_RADIUS_SCALE, roadsQueryRadius * 0.92),
          CONTINUOUS_WORLD_INTERACTIVE_STREAM_STARTUP_BUILDING_RADIUS_MIN,
          featureRadius,
          featureRadius
        ) :
        featureRadius;
      startupShellRadius = startupLoadPhase ?
        Math.max(
          STARTUP_WORLD_BUILD_CONFIG.shellRadiusMinDegrees,
          genericBuildingRadius * STARTUP_WORLD_BUILD_CONFIG.shellRadiusScale
        ) :
        genericBuildingRadius;
      const broaderFeatureRadius = startupLoadPhase ?
        clampNumber(Math.max(featureRadius * 0.82, genericBuildingRadius), genericBuildingRadius, featureRadius, featureRadius) :
        featureRadius;
      const poiQueryRadius = startupLoadPhase ? clampNumber(Math.max(poiRadius * 0.84, roadsQueryRadius * 0.44), 0.004, poiRadius, poiRadius) : poiRadius;
      overpassCacheMeta = {
        lat: appCtx.LOC.lat,
        lon: appCtx.LOC.lon,
        roadsRadius: roadsQueryRadius,
        featureRadius: startupLoadPhase ? broaderFeatureRadius : featureRadius,
        poiRadius: poiQueryRadius,
        roadsBounds: overpassBoundsFromCenterRadius(appCtx.LOC.lat, appCtx.LOC.lon, roadsQueryRadius),
        featureBounds: overpassBoundsFromCenterRadius(
          appCtx.LOC.lat,
          appCtx.LOC.lon,
          startupLoadPhase ? broaderFeatureRadius : featureRadius
        ),
        poiBounds: overpassBoundsFromCenterRadius(appCtx.LOC.lat, appCtx.LOC.lon, poiQueryRadius),
        startupPhase: startupLoadPhase
      };

      const roadsBounds = `(${appCtx.LOC.lat - roadsQueryRadius},${appCtx.LOC.lon - roadsQueryRadius},${appCtx.LOC.lat + roadsQueryRadius},${appCtx.LOC.lon + roadsQueryRadius})`;
      startupRoadsBounds = `(${appCtx.LOC.lat - startupCoreRoadRadius},${appCtx.LOC.lon - startupCoreRoadRadius},${appCtx.LOC.lat + startupCoreRoadRadius},${appCtx.LOC.lon + startupCoreRoadRadius})`;
      startupShellBounds = `(${appCtx.LOC.lat - startupShellRadius},${appCtx.LOC.lon - startupShellRadius},${appCtx.LOC.lat + startupShellRadius},${appCtx.LOC.lon + startupShellRadius})`;
      const buildingBounds = `(${appCtx.LOC.lat - genericBuildingRadius},${appCtx.LOC.lon - genericBuildingRadius},${appCtx.LOC.lat + genericBuildingRadius},${appCtx.LOC.lon + genericBuildingRadius})`;
      const broaderFeatureBounds = `(${appCtx.LOC.lat - broaderFeatureRadius},${appCtx.LOC.lon - broaderFeatureRadius},${appCtx.LOC.lat + broaderFeatureRadius},${appCtx.LOC.lon + broaderFeatureRadius})`;
      const fullFeatureBounds = `(${appCtx.LOC.lat - featureRadius},${appCtx.LOC.lon - featureRadius},${appCtx.LOC.lat + featureRadius},${appCtx.LOC.lon + featureRadius})`;
      const poiBounds = `(${appCtx.LOC.lat - poiQueryRadius},${appCtx.LOC.lon - poiQueryRadius},${appCtx.LOC.lat + poiQueryRadius},${appCtx.LOC.lon + poiQueryRadius})`;
      const linearFeatureBounds = `(${appCtx.LOC.lat - linearFeatureRadius},${appCtx.LOC.lon - linearFeatureRadius},${appCtx.LOC.lat + linearFeatureRadius},${appCtx.LOC.lon + linearFeatureRadius})`;
      const deferredLinearFeatureQuery = `[out:json][timeout:${Math.max(8, Math.floor(Math.min(overpassTimeoutMs, 18000) / 1000))}];(
                way["railway"~"^(rail|light_rail|tram|subway|narrow_gauge)$"]${linearFeatureBounds};
                way["highway"~"^(cycleway|footway|pedestrian|path|steps)$"]${linearFeatureBounds};
            );out body;>;out skel qt;`;
      const scheduleDeferredLinearFeatureLoad = () => {
        if (!ENABLE_LINEAR_FEATURES) return;
        window.setTimeout(async () => {
          if (!isActiveLoadContext()) return;
          try {
            const extendedDeadline = performance.now() + Math.max(12000, Math.min(overpassTimeoutMs, 18000));
            const linearData = await fetchOverpassJSON(
              deferredLinearFeatureQuery,
              Math.min(overpassTimeoutMs, 18000),
              extendedDeadline,
              null
            );
            if (!isActiveLoadContext()) return;

            const linearNodes = {};
            linearData.elements.filter((e) => e.type === 'node').forEach((n) => linearNodes[n.id] = n);

            const allRailwayWays = linearData.elements.filter((e) =>
              e.type === 'way' &&
              classifyLinearFeatureTags(e.tags)?.kind === 'railway'
            );
            const railwayWays = limitWaysByTileBudget(allRailwayWays, linearNodes, {
              globalCap: 24,
              basePerTile: Math.max(3, Math.floor(tileBudgetCfg.roadsPerTile * 0.08)),
              minPerTile: 1,
              tileDegrees: tileBudgetCfg.tileDegrees,
              useRdt: useRdtBudgeting,
              compareFn: (a, b) =>
                linearFeaturePriority('railway', classifyLinearFeatureTags(b.tags)?.subtype) -
                linearFeaturePriority('railway', classifyLinearFeatureTags(a.tags)?.subtype)
            });

            const allFootwayWays = linearData.elements.filter((e) =>
              e.type === 'way' &&
              classifyLinearFeatureTags(e.tags)?.kind === 'footway'
            );
            const footwayWays = limitWaysByTileBudget(allFootwayWays, linearNodes, {
              globalCap: 80,
              basePerTile: Math.max(6, Math.floor(tileBudgetCfg.landusePerTile * 0.18)),
              minPerTile: 2,
              tileDegrees: tileBudgetCfg.tileDegrees,
              useRdt: useRdtBudgeting,
              compareFn: (a, b) =>
                linearFeaturePriority('footway', classifyLinearFeatureTags(b.tags)?.subtype) -
                linearFeaturePriority('footway', classifyLinearFeatureTags(a.tags)?.subtype)
            });

            const allCyclewayWays = linearData.elements.filter((e) =>
              e.type === 'way' &&
              classifyLinearFeatureTags(e.tags)?.kind === 'cycleway'
            );
            const cyclewayWays = limitWaysByTileBudget(allCyclewayWays, linearNodes, {
              globalCap: 40,
              basePerTile: Math.max(4, Math.floor(tileBudgetCfg.landusePerTile * 0.12)),
              minPerTile: 1,
              tileDegrees: tileBudgetCfg.tileDegrees,
              useRdt: useRdtBudgeting,
              compareFn: (a, b) =>
                linearFeaturePriority('cycleway', classifyLinearFeatureTags(b.tags)?.subtype) -
                linearFeaturePriority('cycleway', classifyLinearFeatureTags(a.tags)?.subtype)
            });

            startLoadPhase('buildLinearFeatureGeometryDeferred');
            try {
              const linearFeatureGroups = [railwayWays, cyclewayWays, footwayWays];
              linearFeatureGroups.forEach((featureWays) => {
                if (!Array.isArray(featureWays) || featureWays.length === 0) return;
                featureWays.forEach((way) => {
                  const rawPts = way.nodes.map((id) => linearNodes[id]).filter((n) => n).map((n) => appCtx.geoToWorld(n.lat, n.lon));
                  const pts = sanitizeWorldPathPoints(rawPts, geometryGuards);
                  if (pts.length < 2) return;
                  addLinearFeatureRibbon(pts, { ...(way.tags || {}), sourceFeatureId: way.id ? String(way.id) : '' });
                });
              });
            } finally {
              endLoadPhase('buildLinearFeatureGeometryDeferred');
            }

            syncLinearFeatureOverlayVisibility();
            if (typeof appCtx.rebuildStructureVisualMeshes === 'function') {
              appCtx.rebuildStructureVisualMeshes();
            }
            invalidateTraversalNetworks('deferred_linear_features_ready');
            safeLoadCall('buildTraversalNetworksDeferred', () => buildTraversalNetworks());
            if (typeof updateWorldLod === 'function') {
              safeLoadCall('updateWorldLodDeferred', () => updateWorldLod(true));
            }
            console.log(
              `[WorldLoad] Deferred linear features ready (${railwayWays.length} rail, ${footwayWays.length} foot, ${cyclewayWays.length} cycle).`
            );
          } catch (err) {
            recordLoadWarning('deferredLinearFeatures', err);
          }
        }, 0);
      };

      if (startupLoadPhase) {
        safeLoadCall(
          'startStartupLocalRoadBoost_initial',
          () => startStartupLocalRoadBoost(appCtx.LOC.lat, appCtx.LOC.lon)
        );
      }

      // Load roads, buildings, landuse, and POIs in one comprehensive query.
      const q = `[out:json][timeout:${Math.max(8, Math.floor(overpassTimeoutMs / 1000))}];(
                way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|unclassified|living_street|service)$"]${roadsBounds};
                way["building"]${buildingBounds};
                way["building:part"]${buildingBounds};
                way["building"]["name"]${fullFeatureBounds};
                way["building"]["height"]${broaderFeatureBounds};
                way["building"]["building:levels"]${broaderFeatureBounds};
                way["highway"~"^(footway|pedestrian|path|corridor|steps)$"]["bridge"]${broaderFeatureBounds};
                way["highway"~"^(footway|pedestrian|path|corridor|steps)$"]["layer"]${broaderFeatureBounds};
                way["highway"~"^(footway|pedestrian|path|corridor|steps)$"]["level"]${broaderFeatureBounds};
                way["highway"~"^(footway|pedestrian|path|corridor|steps)$"]["covered"]${broaderFeatureBounds};
                way["highway"~"^(footway|pedestrian|path|corridor|steps)$"]["indoor"]${broaderFeatureBounds};
                way["highway"~"^(footway|pedestrian|path|corridor|steps)$"]["min_height"]${broaderFeatureBounds};
                way["landuse"]${broaderFeatureBounds};
                way["natural"~"^(wood|forest|scrub|grassland|heath|wetland|tree_row|sand|beach|bare_rock|scree|shingle|glacier)$"]${broaderFeatureBounds};
                way["natural"="water"]${broaderFeatureBounds};
                way["water"]${broaderFeatureBounds};
                way["waterway"~"^(river|stream|canal|drain|ditch)$"]${broaderFeatureBounds};
                way["leisure"~"^(park|garden|nature_reserve)$"]${broaderFeatureBounds};
                node["natural"="tree"]${broaderFeatureBounds};
                node["amenity"~"school|hospital|police|fire_station|parking|fuel|restaurant|cafe|bank|pharmacy|post_office"]${poiBounds};
                node["shop"]${poiBounds};
                node["tourism"]${poiBounds};
                node["historic"]${poiBounds};
                node["leisure"~"park|stadium|sports_centre|playground"]${poiBounds};
            );out body;>;out skel qt;`;
      const loadDeadline = loadStartedAt + maxTotalLoadMs;
      const fullDataPromise = startupLoadPhase ? (async () => {
        startLoadPhase('fetchOverpass');
        try {
          return await fetchOverpassJSON(q, overpassTimeoutMs, loadDeadline, overpassCacheMeta);
        } finally {
          endLoadPhase('fetchOverpass');
        }
      })() : null;
      if (startupLoadPhase) {
        const coreRoadTimeoutMs = Math.min(overpassTimeoutMs, STARTUP_WORLD_BUILD_CONFIG.coreQueryTimeoutMs);
      const startupRoadsQuery = `[out:json][timeout:${Math.max(4, Math.floor(coreRoadTimeoutMs / 1000))}];(
                way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|unclassified|living_street|service)$"]${startupRoadsBounds};
            );out body;>;out skel qt;`;
        startLoadPhase('fetchOverpassRoadPreload');
        try {
          const preloadDeadline = performance.now() + Math.min(maxTotalLoadMs * 0.34, STARTUP_WORLD_BUILD_CONFIG.coreQueryDeadlineMs);
          const roadPreloadData = await fetchOverpassJSON(startupRoadsQuery, coreRoadTimeoutMs, preloadDeadline, {
            ...overpassCacheMeta,
            roadsRadius: startupCoreRoadRadius,
            featureRadius: startupCoreRoadRadius,
            roadsBounds: overpassBoundsFromCenterRadius(appCtx.LOC.lat, appCtx.LOC.lon, startupCoreRoadRadius),
            featureBounds: overpassBoundsFromCenterRadius(appCtx.LOC.lat, appCtx.LOC.lon, startupCoreRoadRadius),
            poiBounds: null,
            queryKind: 'startup_playable_core',
            startupRoadPreload: true
          });
          loadMetrics.startupRoadPreload = {
            radius: Number(startupCoreRoadRadius.toFixed(5)),
            overpassSource: roadPreloadData?._overpassSource || 'unknown',
            overpassEndpoint: roadPreloadData?._overpassEndpoint || null
          };
          if (!earthSceneSuppressed()) {
            const preloadNodes = {};
            roadPreloadData.elements.filter((e) => e.type === 'node').forEach((n) => preloadNodes[n.id] = n);
            const allPreloadRoadWays = roadPreloadData.elements.filter((e) =>
              e.type === 'way' &&
              isDriveableHighwayTag(e.tags?.highway)
            );
            const preloadRoadWays = limitWaysByTileBudget(allPreloadRoadWays, preloadNodes, {
              globalCap: Math.max(420, Math.floor(maxRoadWaysForPass * STARTUP_WORLD_BUILD_CONFIG.coreRoadBudgetScale)),
              basePerTile: Math.max(32, Math.floor(tileBudgetCfg.roadsPerTile * STARTUP_WORLD_BUILD_CONFIG.coreRoadBasePerTileScale)),
              minPerTile: Math.max(18, Math.floor(tileBudgetCfg.roadsMinPerTile * STARTUP_WORLD_BUILD_CONFIG.coreRoadMinPerTileScale)),
              tileDegrees: tileBudgetCfg.tileDegrees,
              useRdt: false,
              compareFn: (a, b) => roadTypePriority(b.tags?.highway) - roadTypePriority(a.tags?.highway)
            });
            loadMetrics.startupRoadPreload.requested = allPreloadRoadWays.length;
            loadMetrics.startupRoadPreload.selected = preloadRoadWays.length;

            startLoadPhase('buildRoadGeometryPreload');
            const preloadRoadMainBatchGroups = new Map();
            const preloadRoadSkirtBatchGroups = new Map();
            const startupPreloadRoadMutation = { bounds: null, regionKeys: new Set() };
            const {
              roadMainMaterial: preloadRoadMainMaterial,
              roadSkirtMaterial: preloadRoadSkirtMaterial
            } = createRoadSurfaceMaterials({
              asphaltTex: appCtx.asphaltTex,
              asphaltNormal: appCtx.asphaltNormal,
              asphaltRoughness: appCtx.asphaltRoughness,
              includeMarkings: false
            });
            const addedPreloadRoads = appendRoadWaysToWorld(preloadRoadWays, preloadNodes, geometryGuards, {
              roadMainBatchGroups: preloadRoadMainBatchGroups,
              roadSkirtBatchGroups: preloadRoadSkirtBatchGroups,
              includeMarkings: false,
              roadMainMaterial: preloadRoadMainMaterial,
              roadSkirtMaterial: preloadRoadSkirtMaterial,
              registerPreloaded: true,
              roadMutationCollector: startupPreloadRoadMutation
            });
            endLoadPhase('buildRoadGeometryPreload');
            loadMetrics.startupRoadPreload.added = addedPreloadRoads;
            if (addedPreloadRoads > 0) {
              if (typeof appCtx.primeRoadSurfaceSyncState === 'function') {
                appCtx.primeRoadSurfaceSyncState({
                  clearHeightCache: false,
                  preserveActiveTask: true,
                  mutationType: 'append',
                  source: 'startup_road_preload',
                  bounds: startupPreloadRoadMutation.bounds,
                  regionKeys: Array.from(startupPreloadRoadMutation.regionKeys || [])
                });
              }
              if (typeof appCtx.requestWorldSurfaceSync === 'function') {
                safeLoadCall(
                  'requestWorldSurfaceSync_startup_road_preload',
                  () => appCtx.requestWorldSurfaceSync({ force: true, source: 'startup_road_preload' })
                );
              }
              await promoteRoadsReadyWorld('startup_roads_ready');
              scheduleStartupPromotionCheck(140);
              startStartupShellLoad();
            }
          }
        } catch (err) {
          recordLoadWarning('fetchOverpassRoadPreload', err);
        } finally {
          endLoadPhase('fetchOverpassRoadPreload');
        }
      }

      let data;
      if (fullDataPromise) {
        data = await fullDataPromise;
      } else {
        startLoadPhase('fetchOverpass');
        try {
          data = await fetchOverpassJSON(q, overpassTimeoutMs, loadDeadline, overpassCacheMeta);
        } finally {
          endLoadPhase('fetchOverpass');
        }
      }
      if (data?._overpassSource) loadMetrics.overpassSource = data._overpassSource;
      if (data?._overpassEndpoint) loadMetrics.overpassEndpoint = data._overpassEndpoint;
      if (Number.isFinite(data?._overpassCacheAgeMs)) {
        loadMetrics.overpassCacheAgeMs = Math.floor(data._overpassCacheAgeMs);
      }
      if (earthSceneSuppressed()) {
        loaded = true;
        loadMetrics.recoveryReason = 'env_changed_during_fetch';
        loadMetrics.partialRecovery = true;
        hideEarthSceneMeshes();
        break;
      }
      const nodes = {};
      data.elements.filter((e) => e.type === 'node').forEach((n) => nodes[n.id] = n);
      appCtx._worldLoadNodes = nodes;
      const baselineFullWorld = perfModeNow === 'baseline';

      startLoadPhase('featureBudgeting');
      const allRoadWays = data.elements.filter((e) =>
        e.type === 'way' &&
        isDriveableHighwayTag(e.tags?.highway)
      );
      const roadWays = limitWaysByTileBudget(allRoadWays, nodes, {
        globalCap: maxRoadWaysForPass,
        basePerTile: tileBudgetCfg.roadsPerTile,
        minPerTile: tileBudgetCfg.roadsMinPerTile,
        tileDegrees: tileBudgetCfg.tileDegrees,
        useRdt: useRdtBudgeting,
        compareFn: (a, b) => roadTypePriority(b.tags?.highway) - roadTypePriority(a.tags?.highway)
      });

      const allBuildingWays = data.elements.filter((e) => e.type === 'way' && (e.tags?.building || e.tags?.['building:part']));
      const buildingBudgetCfg = continuousWorldVisibleLoadPlan?.startupPhase ? {
        ...tileBudgetCfg,
        buildingsPerTile: Math.max(18, Math.floor(tileBudgetCfg.buildingsPerTile * 0.46)),
        buildingsMinPerTile: Math.max(6, Math.floor(tileBudgetCfg.buildingsMinPerTile * 0.4))
      } : tileBudgetCfg;
      const buildingWays = baselineFullWorld ?
      allBuildingWays :
      limitWaysByTileBudget(allBuildingWays, nodes, {
        globalCap: maxBuildingWaysForPass,
        basePerTile: buildingBudgetCfg.buildingsPerTile,
        minPerTile: buildingBudgetCfg.buildingsMinPerTile,
        tileDegrees: buildingBudgetCfg.tileDegrees,
        useRdt: useRdtBudgeting,
        spreadAcrossArea: true,
        coreRatio: useRdtBudgeting ? 0.35 : 0.45
      });

      const allLanduseWays = data.elements.filter((e) =>
      e.type === 'way' &&
      e.tags && (

      !!e.tags.landuse ||
      e.tags.natural === 'wood' ||
      e.tags.natural === 'forest' ||
      e.tags.natural === 'scrub' ||
      e.tags.natural === 'grassland' ||
      e.tags.natural === 'heath' ||
      e.tags.natural === 'wetland' ||
      e.tags.natural === 'sand' ||
      e.tags.natural === 'beach' ||
      e.tags.natural === 'bare_rock' ||
      e.tags.natural === 'scree' ||
      e.tags.natural === 'shingle' ||
      e.tags.natural === 'glacier' ||
      e.tags.natural === 'water' ||
      !!e.tags.water ||
      e.tags.leisure === 'park' ||
      e.tags.leisure === 'garden' ||
      e.tags.leisure === 'nature_reserve')

      );
      const landuseWays = limitWaysByTileBudget(allLanduseWays, nodes, {
        globalCap: maxLanduseWaysForPass,
        basePerTile: tileBudgetCfg.landusePerTile,
        minPerTile: tileBudgetCfg.landuseMinPerTile,
        tileDegrees: tileBudgetCfg.tileDegrees,
        useRdt: useRdtBudgeting
      });

      const allWaterwayWays = data.elements.filter((e) =>
      e.type === 'way' &&
      e.tags &&
      !!e.tags.waterway
      );
      const waterwayWays = baselineFullWorld ?
      allWaterwayWays :
      limitWaysByTileBudget(allWaterwayWays, nodes, {
        globalCap: Math.max(240, Math.floor(maxLanduseWays * 0.8)),
        basePerTile: Math.max(20, Math.floor(tileBudgetCfg.landusePerTile * 0.7)),
        minPerTile: Math.max(8, Math.floor(tileBudgetCfg.landuseMinPerTile * 0.6)),
        tileDegrees: tileBudgetCfg.tileDegrees,
        useRdt: useRdtBudgeting
      });

      const allRailwayWays = ENABLE_LINEAR_FEATURES ? data.elements.filter((e) =>
      e.type === 'way' &&
      classifyLinearFeatureTags(e.tags)?.kind === 'railway'
      ) : [];
      const railwayWays = ENABLE_LINEAR_FEATURES ? limitWaysByTileBudget(allRailwayWays, nodes, {
        globalCap: Math.max(80, Math.floor(maxRoadWays * 0.22)),
        basePerTile: Math.max(6, Math.floor(tileBudgetCfg.roadsPerTile * 0.22)),
        minPerTile: Math.max(2, Math.floor(tileBudgetCfg.roadsMinPerTile * 0.18)),
        tileDegrees: tileBudgetCfg.tileDegrees,
        useRdt: useRdtBudgeting,
        compareFn: (a, b) =>
        linearFeaturePriority('railway', classifyLinearFeatureTags(b.tags)?.subtype) -
        linearFeaturePriority('railway', classifyLinearFeatureTags(a.tags)?.subtype)
      }) : [];

      const allFootwayWays = ENABLE_LINEAR_FEATURES ? data.elements.filter((e) =>
      e.type === 'way' &&
      classifyLinearFeatureTags(e.tags)?.kind === 'footway'
      ) : [];
      const footwayWays = ENABLE_LINEAR_FEATURES ? limitWaysByTileBudget(allFootwayWays, nodes, {
        globalCap: Math.max(150, Math.floor(maxLanduseWays * 0.65)),
        basePerTile: Math.max(10, Math.floor(tileBudgetCfg.landusePerTile * 0.55)),
        minPerTile: Math.max(4, Math.floor(tileBudgetCfg.landuseMinPerTile * 0.5)),
        tileDegrees: tileBudgetCfg.tileDegrees,
        useRdt: useRdtBudgeting,
        spreadAcrossArea: true,
        coreRatio: 0.45,
        compareFn: (a, b) =>
        linearFeaturePriority('footway', classifyLinearFeatureTags(b.tags)?.subtype) -
        linearFeaturePriority('footway', classifyLinearFeatureTags(a.tags)?.subtype)
      }) : [];

      const allCyclewayWays = ENABLE_LINEAR_FEATURES ? data.elements.filter((e) =>
      e.type === 'way' &&
      classifyLinearFeatureTags(e.tags)?.kind === 'cycleway'
      ) : [];
      const cyclewayWays = ENABLE_LINEAR_FEATURES ? limitWaysByTileBudget(allCyclewayWays, nodes, {
        globalCap: Math.max(110, Math.floor(maxLanduseWays * 0.45)),
        basePerTile: Math.max(8, Math.floor(tileBudgetCfg.landusePerTile * 0.36)),
        minPerTile: Math.max(3, Math.floor(tileBudgetCfg.landuseMinPerTile * 0.32)),
        tileDegrees: tileBudgetCfg.tileDegrees,
        useRdt: useRdtBudgeting,
        spreadAcrossArea: true,
        coreRatio: 0.45,
        compareFn: (a, b) =>
        linearFeaturePriority('cycleway', classifyLinearFeatureTags(b.tags)?.subtype) -
        linearFeaturePriority('cycleway', classifyLinearFeatureTags(a.tags)?.subtype)
      }) : [];

      const allStructureConnectorWays = data.elements.filter((e) => {
        if (e.type !== 'way') return false;
        const classification = classifyLinearFeatureTags(e.tags, { force: true });
        if (!classification || classification.kind !== 'footway') return false;
        const semantics = classifyStructureSemantics(e.tags || {}, {
          featureKind: classification.kind,
          subtype: classification.subtype
        });
        return semantics.gradeSeparated || semantics.skywalk;
      });
      const structureConnectorWays = limitWaysByTileBudget(allStructureConnectorWays, nodes, {
        globalCap: Math.max(36, Math.floor(tileBudgetCfg.landusePerTile * 1.4)),
        basePerTile: Math.max(3, Math.floor(tileBudgetCfg.landusePerTile * 0.16)),
        minPerTile: 1,
        tileDegrees: tileBudgetCfg.tileDegrees,
        useRdt: useRdtBudgeting,
        compareFn: (a, b) => {
          const aSemantics = classifyStructureSemantics(a.tags || {}, { featureKind: 'footway', subtype: a.tags?.highway || '' });
          const bSemantics = classifyStructureSemantics(b.tags || {}, { featureKind: 'footway', subtype: b.tags?.highway || '' });
          const aScore = (aSemantics.skywalk ? 4 : aSemantics.gradeSeparated ? 3 : 1);
          const bScore = (bSemantics.skywalk ? 4 : bSemantics.gradeSeparated ? 3 : 1);
          return bScore - aScore;
        }
      });

      const allTreeNodes = data.elements.filter((e) =>
        e.type === 'node' &&
        e.tags?.natural === 'tree'
      );
      const treeNodes = limitNodesByTileBudget(allTreeNodes, {
        globalCap: MAX_TREE_NODES,
        basePerTile: Math.max(6, Math.floor(tileBudgetCfg.landusePerTile * 0.22)),
        minPerTile: Math.max(2, Math.floor(tileBudgetCfg.landuseMinPerTile * 0.18)),
        tileDegrees: tileBudgetCfg.tileDegrees,
        useRdt: useRdtBudgeting
      });

      const allTreeRowWays = data.elements.filter((e) =>
        e.type === 'way' &&
        e.tags?.natural === 'tree_row'
      );
      const treeRowWays = limitWaysByTileBudget(allTreeRowWays, nodes, {
        globalCap: MAX_TREE_ROW_WAYS,
        basePerTile: Math.max(3, Math.floor(tileBudgetCfg.landusePerTile * 0.14)),
        minPerTile: 1,
        tileDegrees: tileBudgetCfg.tileDegrees,
        useRdt: useRdtBudgeting,
        spreadAcrossArea: true,
        coreRatio: 0.5
      });

      const allPoiNodes = data.elements.filter((e) =>
        e.type === 'node' &&
        !!poiKeyFromTags(e.tags)
      );
      const poiNodes = limitNodesByTileBudget(allPoiNodes, {
        globalCap: maxPoiNodesForPass,
        basePerTile: tileBudgetCfg.poiPerTile,
        minPerTile: tileBudgetCfg.poiMinPerTile,
        tileDegrees: tileBudgetCfg.tileDegrees,
        useRdt: useRdtBudgeting
      });

      loadMetrics.roads.requested = allRoadWays.length;
      loadMetrics.roads.selected = roadWays.length;
      loadMetrics.buildings.requested = allBuildingWays.length;
      loadMetrics.buildings.selected = buildingWays.length;
      loadMetrics.landuse.requested = allLanduseWays.length;
      loadMetrics.landuse.selected = landuseWays.length;
      loadMetrics.linearFeatures.railway.requested = allRailwayWays.length;
      loadMetrics.linearFeatures.railway.selected = railwayWays.length;
      loadMetrics.linearFeatures.footway.requested = allFootwayWays.length;
      loadMetrics.linearFeatures.footway.selected = footwayWays.length;
      loadMetrics.linearFeatures.cycleway.requested = allCyclewayWays.length;
      loadMetrics.linearFeatures.cycleway.selected = cyclewayWays.length;
      loadMetrics.vegetation.treesRequested = allTreeNodes.length;
      loadMetrics.vegetation.treesSelected = treeNodes.length;
      loadMetrics.vegetation.treeRowsRequested = allTreeRowWays.length;
      loadMetrics.vegetation.treeRowsSelected = treeRowWays.length;
      loadMetrics.pois.requested = allPoiNodes.length;
      loadMetrics.pois.selected = poiNodes.length;
      loadMetrics.waterways = {
        requested: allWaterwayWays.length,
        selected: waterwayWays.length
      };
      const worldSurfaceProfile = classifyWorldSurfaceProfile({
        centerLat: appCtx.LOC?.lat,
        landuseWays,
        waterwayWays
      });
      loadMetrics.surfaceProfile = {
        reason: worldSurfaceProfile.reason,
        terrainModeHint: worldSurfaceProfile.terrainModeHint,
        waterModeHint: worldSurfaceProfile.waterModeHint,
        absLat: Number(worldSurfaceProfile.absLat?.toFixed?.(2) || worldSurfaceProfile.absLat || 0),
        signals: worldSurfaceProfile.signals?.normalized || {}
      };
      if (typeof appCtx.setWorldSurfaceProfile === 'function') {
        appCtx.setWorldSurfaceProfile(worldSurfaceProfile);
      } else {
        appCtx.worldSurfaceProfile = worldSurfaceProfile;
      }
      appCtx.osmTreeNodes = treeNodes;
      appCtx.osmTreeRows = treeRowWays;
      endLoadPhase('featureBudgeting');

      if (
      roadWays.length < allRoadWays.length ||
      buildingWays.length < allBuildingWays.length ||
      landuseWays.length < allLanduseWays.length ||
      poiNodes.length < allPoiNodes.length)
      {
        console.warn(
          `[WorldLoad] Applied adaptive limits ` +
          `(roads ${roadWays.length}/${allRoadWays.length}, ` +
          `buildings ${buildingWays.length}/${allBuildingWays.length}, ` +
          `landuse ${landuseWays.length}/${allLanduseWays.length}, ` +
          `pois ${poiNodes.length}/${allPoiNodes.length}).`
        );
      }

      // Process roads
      showWorldLoadProgress(`Loading roads... (${roadWays.length})`);
      startLoadPhase('buildRoadGeometry');
      const roadMainBatchGroups = new Map();
      const roadSkirtBatchGroups = new Map();
      const roadMarkBatchGroups = new Map();

      const {
        roadMainMaterial,
        roadSkirtMaterial,
        roadMarkMaterial
      } = createRoadSurfaceMaterials({
        asphaltTex: appCtx.asphaltTex,
        asphaltNormal: appCtx.asphaltNormal,
        asphaltRoughness: appCtx.asphaltRoughness,
        includeMarkings: true
      });
      appendRoadWaysToWorld(roadWays, nodes, geometryGuards, {
        roadMainBatchGroups,
        roadSkirtBatchGroups,
        roadMarkBatchGroups,
        includeMarkings: true,
        roadMainMaterial,
        roadSkirtMaterial,
        roadMarkMaterial
      });
      endLoadPhase('buildRoadGeometry');
      if (!startupRoadsReadyPromoted && roadWays.length > 0) {
        await promoteRoadsReadyWorld('full_query_roads_ready');
      }

      // Process buildings
      startupShellPhaseOpen = false;
      const clearedStartupShellMeshes = clearStartupShellBuildingMeshes();
      if (loadMetrics.startupLocalShell && clearedStartupShellMeshes > 0) {
        loadMetrics.startupLocalShell.cleared = clearedStartupShellMeshes;
      }
      showWorldLoadProgress(`Loading buildings... (${buildingWays.length})`);
      startLoadPhase('buildBuildingGeometry');
      const roadBuildingCellSize = 120;
      const buildingRoadRadiusCells = useRdtBudgeting ?
      rdtLoadComplexity >= 6 ? 5 : 4 :
      3;
      const roadCoverageCells = new Set();
      const roadCoreCellSize = 6;
      const roadCoreCells = new Set();
      const roadCorridorCellSize = 4;
      const roadCorridorCells = new Set();
      const toRoadCoreCellKey = (x, z) => `${Math.floor(x / roadCoreCellSize)},${Math.floor(z / roadCoreCellSize)}`;
      const toRoadCorridorCellKey = (x, z) => `${Math.floor(x / roadCorridorCellSize)},${Math.floor(z / roadCorridorCellSize)}`;
      const markRoadCoreCell = (x, z, radiusCells) => {
        const cx = Math.floor(x / roadCoreCellSize);
        const cz = Math.floor(z / roadCoreCellSize);
        const r = Math.max(0, radiusCells | 0);
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            roadCoreCells.add(`${cx + dx},${cz + dz}`);
          }
        }
      };
      const markRoadCorridorCell = (x, z, radiusCells) => {
        const cx = Math.floor(x / roadCorridorCellSize);
        const cz = Math.floor(z / roadCorridorCellSize);
        const r = Math.max(0, radiusCells | 0);
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            roadCorridorCells.add(`${cx + dx},${cz + dz}`);
          }
        }
      };
      const markRoadCorridorSegment = (p0, p1, radiusCells) => {
        if (!p0 || !p1) return;
        const segLen = Math.hypot(p1.x - p0.x, p1.z - p0.z);
        const steps = Math.max(1, Math.ceil(segLen / Math.max(1.75, roadCorridorCellSize * 0.75)));
        for (let step = 0; step <= steps; step++) {
          const t = step / steps;
          markRoadCorridorCell(
            p0.x + (p1.x - p0.x) * t,
            p0.z + (p1.z - p0.z) * t,
            radiusCells
          );
        }
      };
      const pointOnRoadCore = (x, z) => roadCoreCells.has(toRoadCoreCellKey(x, z));
      const pointOnRoadCorridor = (x, z) => roadCorridorCells.has(toRoadCorridorCellKey(x, z));
      const expandFootprintForGroundApron = (pts) => {
        if (!pts || pts.length < 3) return pts || [];
        let sumX = 0;
        let sumZ = 0;
        for (let i = 0; i < pts.length; i++) {
          sumX += pts[i].x;
          sumZ += pts[i].z;
        }
        const cx = sumX / pts.length;
        const cz = sumZ / pts.length;
        const maxRadius = pts.reduce((best, p) => Math.max(best, Math.hypot(p.x - cx, p.z - cz)), 0);
        const apronOutset = Math.min(1.5, Math.max(0.65, maxRadius * 0.08));
        return pts.map((p) => {
          const dx = p.x - cx;
          const dz = p.z - cz;
          const len = Math.hypot(dx, dz);
          if (!(len > 1e-4)) return { x: p.x, z: p.z };
          return {
            x: p.x + dx / len * apronOutset,
            z: p.z + dz / len * apronOutset
          };
        });
      };
      const sampleFootprintCoverage = (pts, tester) => {
        if (!pts || pts.length < 3 || typeof tester !== 'function') {
          return { total: 0, inside: 0, centroidInside: false };
        }
        let sumX = 0, sumZ = 0;
        const samples = [];
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          const n = pts[(i + 1) % pts.length];
          sumX += p.x;
          sumZ += p.z;
          samples.push(p);
          samples.push({ x: (p.x + n.x) * 0.5, z: (p.z + n.z) * 0.5 });
          samples.push({ x: p.x + (n.x - p.x) * 0.25, z: p.z + (n.z - p.z) * 0.25 });
          samples.push({ x: p.x + (n.x - p.x) * 0.75, z: p.z + (n.z - p.z) * 0.75 });
        }
        const centroid = { x: sumX / pts.length, z: sumZ / pts.length };
        samples.push(centroid);

        let inside = 0;
        for (let i = 0; i < samples.length; i++) {
          if (tester(samples[i].x, samples[i].z)) inside += 1;
        }
        return {
          total: samples.length,
          inside,
          centroidInside: tester(centroid.x, centroid.z)
        };
      };
      const sampleFootprintRoadCore = (pts) => {
        return sampleFootprintCoverage(pts, pointOnRoadCore);
      };
      const sampleFootprintRoadCorridor = (pts) => {
        return sampleFootprintCoverage(pts, pointOnRoadCorridor);
      };
      const overlapsRoadCore = (stats) => {
        if (!stats || stats.total <= 0) return false;
        const overlapRatio = stats.inside / stats.total;
        return stats.inside >= Math.max(4, Math.ceil(stats.total * 0.58)) && overlapRatio >= 0.55;
      };
      const overlapsRoadCorridor = (stats) => {
        if (!stats || stats.total <= 0) return false;
        const overlapRatio = stats.inside / stats.total;
        return stats.centroidInside || (stats.inside >= Math.max(3, Math.ceil(stats.total * 0.24)) && overlapRatio >= 0.18);
      };

      appCtx.roads.forEach((rd) => {
        if (!rd || !rd.pts) return;
        const roadHalfWidth = Number.isFinite(rd.width) ? rd.width * 0.5 : 4;
        const roadCoreRadius = Math.max(0.8, Math.max(0, roadHalfWidth * 0.32 - 0.25));
        const roadCoreRadiusCells = Math.max(0, Math.floor((roadCoreRadius + 0.25) / roadCoreCellSize));
        const corridorRadius = Math.max(1.6, roadHalfWidth + 2.4);
        const corridorRadiusCells = Math.max(0, Math.ceil((corridorRadius + 0.25) / roadCorridorCellSize));
        for (let i = 0; i < rd.pts.length; i++) {
          const p = rd.pts[i];
          const cx = Math.floor(p.x / roadBuildingCellSize);
          const cz = Math.floor(p.z / roadBuildingCellSize);
          roadCoverageCells.add(`${cx},${cz}`);
          markRoadCoreCell(p.x, p.z, roadCoreRadiusCells);
          markRoadCorridorCell(p.x, p.z, corridorRadiusCells);
          if (i < rd.pts.length - 1) {
            markRoadCorridorSegment(p, rd.pts[i + 1], corridorRadiusCells);
          }
        }
      });

      function isBuildingNearLoadedRoad(pts) {
        if (useRdtBudgeting) return true;
        if (!pts || pts.length === 0 || roadCoverageCells.size === 0) return true;
        let sumX = 0,sumZ = 0;
        for (let i = 0; i < pts.length; i++) {
          sumX += pts[i].x;
          sumZ += pts[i].z;
        }
        const cx = Math.floor(sumX / pts.length / roadBuildingCellSize);
        const cz = Math.floor(sumZ / pts.length / roadBuildingCellSize);
        for (let dx = -buildingRoadRadiusCells; dx <= buildingRoadRadiusCells; dx++) {
          for (let dz = -buildingRoadRadiusCells; dz <= buildingRoadRadiusCells; dz++) {
            if (roadCoverageCells.has(`${cx + dx},${cz + dz}`)) return true;
          }
        }
        return false;
      }
      const lodNearDist = lodThresholds.near;
      const lodMidDist = lodThresholds.mid;
      const buildingFarLoadDistance =
        continuousWorldVisibleLoadPlan?.buildingFarLoadDistance || lodThresholds.farVisible;
      const startupPhase = !!continuousWorldVisibleLoadPlan?.startupPhase;
      const acceptedBuildingsByCell = new Map();
      const suppressedParentBuildingIds = buildSuppressedParentBuildingIdSet(
        buildingWays,
        nodes,
        buildingGeometryGuards
      );
      const denseBuildingCellSize = startupPhase ? 84 : 72;
      const importantBuildingTypes = new Set(['hospital', 'school', 'university', 'station', 'transportation', 'civic', 'government', 'cathedral', 'church', 'museum', 'stadium', 'terminal']);

      buildingWays.forEach((way) => {
        const waySourceBuildingId = way.id ? String(way.id) : '';
        if (!way.tags?.['building:part'] && waySourceBuildingId && suppressedParentBuildingIds.has(waySourceBuildingId)) {
          loadMetrics.buildingsSkippedParentShell = (loadMetrics.buildingsSkippedParentShell || 0) + 1;
          return;
        }
        const rawPts = way.nodes.map((id) => nodes[id]).filter((n) => n).map((n) => appCtx.geoToWorld(n.lat, n.lon));
        const pts = sanitizeWorldFootprintPoints(rawPts, FEATURE_MIN_POLYGON_AREA, buildingGeometryGuards);
        if (pts.length < 3) return;
        if (!isBuildingNearLoadedRoad(pts)) return;
        const roadCoreStats = sampleFootprintRoadCore(pts);
        if (overlapsRoadCore(roadCoreStats)) {
          loadMetrics.buildingsSkippedRoadOverlap = (loadMetrics.buildingsSkippedRoadOverlap || 0) + 1;
          return;
        }

        let centerX = 0;
        let centerZ = 0;
        let minFootprintX = Infinity;
        let maxFootprintX = -Infinity;
        let minFootprintZ = Infinity;
        let maxFootprintZ = -Infinity;
        for (let i = 0; i < pts.length; i++) {
          centerX += pts[i].x;
          centerZ += pts[i].z;
          minFootprintX = Math.min(minFootprintX, pts[i].x);
          maxFootprintX = Math.max(maxFootprintX, pts[i].x);
          minFootprintZ = Math.min(minFootprintZ, pts[i].z);
          maxFootprintZ = Math.max(maxFootprintZ, pts[i].z);
        }
        centerX /= pts.length;
        centerZ /= pts.length;
        const footprintWidth = Math.max(0, maxFootprintX - minFootprintX);
        const footprintDepth = Math.max(0, maxFootprintZ - minFootprintZ);
        const footprintArea = Math.abs(signedPolygonAreaXZ(pts));
        const centerDist = Math.hypot(centerX, centerZ);
        const lodTier = centerDist <= lodNearDist ?
        'near' :
        centerDist <= buildingFarLoadDistance ? 'mid' : 'far';
        if (lodTier === 'far') {
          loadMetrics.lod.farSkipped += 1;
          return;
        }

        // RDT-seeded deterministic random for this building
        const bSeed = (appCtx.rdtSeed ^ way.id >>> 0) >>> 0;
        const br1 = appCtx.rand01FromInt(bSeed);
        const br2 = appCtx.rand01FromInt(bSeed ^ 0x9e3779b9);

        const bt = way.tags.building || way.tags['building:part'] || 'yes';
        let fallbackHeight = 10;
        if (!way.tags['building:part']) {
          if (bt === 'house' || bt === 'residential' || bt === 'detached') fallbackHeight = 6 + br1 * 4;else
          if (bt === 'apartments' || bt === 'commercial') fallbackHeight = 12 + br1 * 20;else
          if (bt === 'industrial' || bt === 'warehouse') fallbackHeight = 8 + br1 * 6;else
          if (bt === 'church' || bt === 'cathedral') fallbackHeight = 15 + br1 * 15;else
          if (bt === 'skyscraper' || bt === 'office') fallbackHeight = 30 + br1 * 50;else
          fallbackHeight = 8 + br1 * 12;
        }
        const structureSemantics = classifyStructureSemantics(way.tags || {}, {
          featureKind: 'building',
          subtype: bt
        });
        const buildingSemantics = interpretBuildingSemantics(way.tags || {}, {
          fallbackHeight,
          fallbackPartHeight: 3.4 + br1 * 1.6,
          footprintArea,
          footprintWidth,
          footprintDepth
        });
        const height = buildingSemantics.heightMeters;
        const buildingLevels = Number.parseFloat(way.tags['building:levels']);
        const sourceBuildingId = waySourceBuildingId || `osm-${Math.round(centerX * 10)}-${Math.round(centerZ * 10)}`;
        const nearRoadCore = roadCoreStats.centroidInside || roadCoreStats.inside >= 2;
        const apronFootprint = expandFootprintForGroundApron(pts);
        const roadCorridorStats = sampleFootprintRoadCorridor(apronFootprint);
        const severeRoadCorridorOverlap =
          roadCorridorStats.total > 0 &&
          roadCorridorStats.inside >= Math.max(5, Math.ceil(roadCorridorStats.total * 0.42));
        const isImportantBuilding =
          !!String(way.tags.name || '').trim() ||
          importantBuildingTypes.has(String(bt || '').toLowerCase()) ||
          footprintArea >= 1200 ||
          height >= 38 ||
          (Number.isFinite(buildingLevels) && buildingLevels >= 10);
        if (severeRoadCorridorOverlap && !isImportantBuilding) {
          loadMetrics.buildingsSkippedRoadOverlap = (loadMetrics.buildingsSkippedRoadOverlap || 0) + 1;
          return;
        }
        const cellKey = `${Math.floor(centerX / denseBuildingCellSize)},${Math.floor(centerZ / denseBuildingCellSize)}`;
        const acceptedInCell = acceptedBuildingsByCell.get(cellKey) || 0;
        const denseCellCap = startupPhase ?
          (lodTier === 'near' ? 12 : 5) :
          (lodTier === 'near' ? 28 : 12);
        const denseOverflow = acceptedInCell - denseCellCap;
        if (denseOverflow >= 0 && !isImportantBuilding) {
          const keepChance =
            lodTier === 'near' ?
              Math.max(0.1, 0.36 - denseOverflow * 0.05) :
              Math.max(0.05, 0.18 - denseOverflow * 0.03);
          if (br2 > keepChance) {
            loadMetrics.buildingsSkippedDense = (loadMetrics.buildingsSkippedDense || 0) + 1;
            return;
          }
        }
        acceptedBuildingsByCell.set(cellKey, acceptedInCell + 1);
        const suppressGroundApron =
          nearRoadCore ||
          overlapsRoadCorridor(roadCorridorStats) ||
          structureSemantics.terrainMode === 'elevated' ||
          (
            roadCoreStats.total > 0 &&
            roadCoreStats.inside >= Math.max(1, Math.ceil(roadCoreStats.total * 0.18))
          );
        const interactiveColliderRadius = startupPhase ? 160 : 280;
        const needsInteractiveCollider = centerDist <= interactiveColliderRadius || isImportantBuilding;
        const denseColliderPressure = acceptedInCell >= Math.max(4, Math.floor(denseCellCap * 0.7));
        const colliderDetail =
          ((useRdtBudgeting && lodTier !== 'near' && !nearRoadCore) ||
          (!needsInteractiveCollider && !nearRoadCore && (startupPhase || denseColliderPressure))) ?
            'bbox' :
            'full';

        // Calculate terrain stats for building footprint
        let avgElevation = 0;
        let minElevation = Infinity;
        let maxElevation = -Infinity;
        pts.forEach((p) => {
          const h = appCtx.elevationWorldYAtWorldXZ(p.x, p.z);
          avgElevation += h;
          if (h < minElevation) minElevation = h;
          if (h > maxElevation) maxElevation = h;
        });
        avgElevation /= pts.length;
        const slopeRange = Number.isFinite(minElevation) && Number.isFinite(maxElevation) ?
        maxElevation - minElevation :
        0;

        const baseElevationRaw = slopeRange >= 0.06 ? minElevation + 0.03 : avgElevation;
        const structureBaseOffset = Number.isFinite(buildingSemantics.baseOffsetMeters) ?
          buildingSemantics.baseOffsetMeters :
          0;
        const baseElevation = baseElevationRaw + structureBaseOffset;
        if (buildingSemantics.roofLike === true && buildingSemantics.intentionalVerticalStructure !== true) {
          return;
        }

        const baseColor = pickBuildingBaseColor(bt, bSeed ^ Math.floor(br2 * 0xffff));
        let mesh = null;

        if (lodTier === 'mid') {
          mesh = createMidLodBuildingMesh(pts, height, baseElevation, baseColor, {
            buildingType: bt,
            buildingSeed: bSeed
          });
        } else {
          const shape = new THREE.Shape();
          pts.forEach((p, i) => {
            if (i === 0) shape.moveTo(p.x, -p.z);else
            shape.lineTo(p.x, -p.z);
          });
          shape.closePath();

          const extrudeSettings = { depth: height, bevelEnabled: false };
          const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
          geo.rotateX(-Math.PI / 2);
          if (!geometryHasFinitePositions(geo)) {
            geo.dispose();
            return;
          }

          const bldgMat = typeof appCtx.getBuildingMaterial === 'function' ?
            appCtx.getBuildingMaterial(bt, bSeed, baseColor) :
            new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.85, metalness: 0.05 });

          mesh = new THREE.Mesh(geo, bldgMat);
          mesh.position.y = baseElevation;
          mesh.userData.buildingFootprint = pts;
          mesh.userData.avgElevation = baseElevation;
          mesh.userData.structureBaseOffset = structureBaseOffset;
          mesh.userData.structureSemantics = structureSemantics;
          mesh.userData.buildingSemantics = buildingSemantics;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }

        if (!mesh) return;
        mesh.userData.terrainAvgElevation = avgElevation;
        mesh.userData.lodTier = lodTier;
        mesh.userData.sourceBuildingId = sourceBuildingId;
        mesh.userData.buildingName = way.tags.name || '';
        mesh.userData.buildingType = bt;
        mesh.userData.buildingPartKind = buildingSemantics.partKind;
        mesh.userData.collisionKind = buildingSemantics.collisionKind;
        mesh.userData.allowsPassageBelow = buildingSemantics.allowsPassageBelow;
        mesh.userData.buildingSemantics = buildingSemantics;
        mesh.userData.structureBaseOffset = structureBaseOffset;
        mesh.userData.structureSemantics = structureSemantics;
        const colliderRef = registerBuildingCollision(pts, height, {
          detail: colliderDetail,
          centerX,
          centerZ,
          sourceBuildingId,
          name: way.tags.name || '',
          buildingType: bt,
          buildingPartKind: buildingSemantics.partKind,
          collisionKind: buildingSemantics.collisionKind,
          allowsPassageBelow: buildingSemantics.allowsPassageBelow,
          levels: Number.isFinite(buildingLevels) ? buildingLevels : null,
          minLevels: Number.isFinite(buildingSemantics.buildingMinLevel) ? buildingSemantics.buildingMinLevel : null,
          baseY: baseElevation,
          buildingSemantics,
          structureSemantics
        });
        if (colliderDetail === 'full') loadMetrics.colliders.full += 1;else
        loadMetrics.colliders.simplified += 1;
        if (colliderRef) {
          colliderRef.baseY = baseElevation;
          colliderRef.minY = baseElevation;
          colliderRef.maxY = baseElevation + height;
        }

        assignContinuousWorldRegionKeysToTarget(mesh, {
          points: pts,
          family: 'buildings'
        });
        appCtx.scene.add(mesh);
        appCtx.buildingMeshes.push(mesh);
        if (lodTier === 'near') loadMetrics.lod.near += 1;else
        loadMetrics.lod.mid += 1;

        // On sloped terrain, add terrain-conforming ground support so building
        // bases do not appear to float above hills/step terrain.
        const buildingGroundPatchThreshold =
          startupPhase || !appCtx.pavementDiffuse ?
            BUILDING_GROUND_PATCH_CONFIG.untexturedSlopeThreshold :
            BUILDING_GROUND_PATCH_CONFIG.slopeThreshold;
        if (
          BUILDING_GROUND_PATCH_CONFIG.enabled === true &&
          lodTier === 'near' &&
          buildingSemantics.shouldCreateGroundPatch &&
          typeof appCtx.createBuildingGroundPatch === 'function' &&
          slopeRange >= buildingGroundPatchThreshold
        ) {
          const groundPatchesRaw = appCtx.createBuildingGroundPatch(pts, baseElevation, {
            includeApron: false,
            includeFoundationSkirt: false
          });
          const groundPatches = Array.isArray(groundPatchesRaw) ? groundPatchesRaw : groundPatchesRaw ? [groundPatchesRaw] : [];
          groundPatches.forEach((groundPatch) => {
            if (groundPatch.userData?.isGroundApron && suppressGroundApron) {
              appCtx.urbanSurfaceStats.skippedBuildingAprons += 1;
              return;
            }
            groundPatch.userData.landuseFootprint = pts;
            groundPatch.userData.landuseType = 'buildingGround';
            groundPatch.userData.avgElevation = baseElevation;
            groundPatch.userData.terrainAvgElevation = avgElevation;
            groundPatch.userData.alwaysVisible = true;
            groundPatch.visible = true;
            assignContinuousWorldRegionKeysToTarget(groundPatch, {
              points: pts,
              family: 'landuse'
            });
            appCtx.scene.add(groundPatch);
            appCtx.landuseMeshes.push(groundPatch);
          });
        }
      });
      endLoadPhase('buildBuildingGeometry');
      startLoadPhase('batchBuildingGeometry');
      const batchedNearCount = appCtx.disableNearBuildingBatching ? 0 : batchNearLodBuildingMeshes();
      if (batchedNearCount > 0) {
        loadMetrics.lod.nearBatched = batchedNearCount;
      }
      const batchedMidCount = batchMidLodBuildingMeshes();
      if (batchedMidCount > 0) {
        loadMetrics.lod.midBatched = batchedMidCount;
      }
      if (appCtx._lastBuildingBatchStats) {
        loadMetrics.buildingBatching = { ...appCtx._lastBuildingBatchStats };
      }
      endLoadPhase('batchBuildingGeometry');
      const deferNonCriticalStartupEnrichment =
        startupLoadPhase &&
        !baselineFullWorld &&
        !!appCtx._continuousWorldVisibleLoadConfig?.enabled;
      let deferredStartupEnrichmentTimer = null;
      let deferredStartupEnrichmentRunning = false;

      function addLandusePolygon(pts, landuseType, holeRings = [], guardOptions = null) {
        if (!pts || pts.length < 3) return;

        let ring = sanitizeWorldFootprintPoints(
          pts,
          FEATURE_MIN_POLYGON_AREA,
          guardOptions || undefined
        );
        if (ring.length < 3) return;
        ring = sanitizeWorldFootprintPoints(
          decimatePoints(ring, 900, false),
          FEATURE_MIN_POLYGON_AREA,
          guardOptions || undefined
        );
        if (ring.length < 3) return;
        const outerArea = Math.abs(signedPolygonAreaXZ(ring));
        if (!Number.isFinite(outerArea) || outerArea < FEATURE_MIN_POLYGON_AREA) return;
        let minX = Infinity,maxX = -Infinity,minZ = Infinity,maxZ = -Infinity;
        ring.forEach((p) => {
          minX = Math.min(minX, p.x);
          maxX = Math.max(maxX, p.x);
          minZ = Math.min(minZ, p.z);
          maxZ = Math.max(maxZ, p.z);
        });

        const sampledHeights = [];
        let avgElevation = 0;
        ring.forEach((p) => {
          const sample = appCtx.elevationWorldYAtWorldXZ(p.x, p.z);
          sampledHeights.push(sample);
          avgElevation += sample;
        });
        avgElevation /= ring.length;
        const minElevation = sampledHeights.reduce((best, value) =>
          Number.isFinite(value) ? Math.min(best, value) : best,
        Infinity);

        const shape = new THREE.Shape();
        ring.forEach((p, i) => {
          if (i === 0) shape.moveTo(p.x, -p.z);else
          shape.lineTo(p.x, -p.z);
        });
        shape.closePath();

        if (holeRings && holeRings.length > 0) {
          holeRings.forEach((holeRing) => {
            if (!holeRing || holeRing.length < 3) return;
            const cleanedHole = sanitizeWorldFootprintPoints(
              holeRing,
              FEATURE_MIN_HOLE_AREA,
              guardOptions || undefined
            );
            if (cleanedHole.length < 3) return;
            const holeArea = Math.abs(signedPolygonAreaXZ(cleanedHole));
            if (!Number.isFinite(holeArea) || holeArea < FEATURE_MIN_HOLE_AREA) return;
            if (holeArea >= outerArea * 0.92) return;
            const path = new THREE.Path();
            cleanedHole.forEach((p, i) => {
              if (i === 0) path.moveTo(p.x, -p.z);else
              path.lineTo(p.x, -p.z);
            });
            path.closePath();
            shape.holes.push(path);
          });
        }

        const geometry = new THREE.ShapeGeometry(shape, 20);
        geometry.rotateX(-Math.PI / 2);

        const isWater = landuseType === 'water';
        const renderSurfaceMesh = shouldRenderLanduseSurfaceMesh(landuseType) || isWater;
        const waterVisualProfile = isWater ? resolveWaterSurfaceVisualProfile() : null;
        const surfaceBaseElevation = isWater ?
          (Number.isFinite(avgElevation) ? avgElevation : waterSurfaceBaseElevation(sampledHeights)) :
          avgElevation;

        if (renderSurfaceMesh) {
          const waterFlattenFactor = isWater ? 0.12 : 1.0;
          const positions = geometry.attributes.position;
          for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const z = positions.getZ(i);
            const terrainY = appCtx.elevationWorldYAtWorldXZ(x, z);
            const useY = terrainY === 0 && Math.abs(surfaceBaseElevation) > 2 ? surfaceBaseElevation : terrainY;
            positions.setY(i, (useY - surfaceBaseElevation) * waterFlattenFactor + (isWater ? 0.08 : 0.02));
          }
          positions.needsUpdate = true;
          geometry.computeVertexNormals();

          const landuseStyle = appCtx.LANDUSE_STYLES?.[landuseType] || appCtx.LANDUSE_STYLES?.grass || { color: 0x7cb342 };
          const material = new THREE.MeshStandardMaterial(isWater ? {
            color: waterVisualProfile?.color || appCtx.LANDUSE_STYLES.water.color,
            emissive: waterVisualProfile?.emissive || 0x0f355a,
            emissiveIntensity: waterVisualProfile?.emissiveIntensity ?? 0.18,
            roughness: waterVisualProfile?.roughness ?? 0.34,
            metalness: waterVisualProfile?.metalness ?? 0.02,
            transparent: false,
            opacity: 1,
            side: THREE.DoubleSide,
            depthWrite: true,
            polygonOffset: true,
            polygonOffsetFactor: -6,
            polygonOffsetUnits: -6
          } : {
            color: landuseStyle.color,
            roughness: 0.95,
            metalness: 0.0,
            transparent: true,
            opacity: 0.85,
            depthWrite: true,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2
          });
          if (isWater) {
            registerWaterWaveMaterial(material, {
              waveScale: 1.0,
              waveBase: 1.0,
              area: outerArea,
              span: Math.max(maxX - minX, maxZ - minZ),
              waterKind: inferWaterRenderContext({
                area: outerArea,
                span: Math.max(maxX - minX, maxZ - minZ)
              })
            });
          }

          const mesh = new THREE.Mesh(geometry, material);
          mesh.renderOrder = 1;
          mesh.position.y = surfaceBaseElevation;
          mesh.userData.landuseFootprint = ring;
          mesh.userData.avgElevation = surfaceBaseElevation;
          mesh.userData.alwaysVisible = isWater;
          mesh.userData.landuseType = landuseType;
          mesh.userData.waterFlattenFactor = waterFlattenFactor;
          mesh.userData.surfaceVariant = isWater ? waterVisualProfile?.mode || 'water' : landuseType;
          if (isWater) mesh.userData.waterSurfaceBase = surfaceBaseElevation;
          assignContinuousWorldRegionKeysToTarget(mesh, {
            points: ring,
            family: isWater ? 'water' : 'landuse'
          });
          mesh.receiveShadow = false;
          mesh.visible = appCtx.landUseVisible || mesh.userData.alwaysVisible;
          appCtx.scene.add(mesh);
          appCtx.landuseMeshes.push(mesh);
        } else {
          geometry.dispose();
        }
        appCtx.landuses.push({
          type: landuseType,
          pts: ring,
          bounds: {
            minX,
            maxX,
            minZ,
            maxZ
          }
        });
        addLanduseToSpatialIndex(appCtx.landuses[appCtx.landuses.length - 1]);

        if (isWater) {
          const centroid = ring.reduce((acc, p) => {
            acc.x += p.x;
            acc.z += p.z;
            return acc;
          }, { x: 0, z: 0 });
          appCtx.waterAreas.push({
            type: 'water',
            pts: ring,
            area: outerArea,
            centerX: centroid.x / ring.length,
            centerZ: centroid.z / ring.length,
            surfaceY: surfaceBaseElevation + 0.08,
            bounds: {
              minX,
              maxX,
              minZ,
              maxZ
            }
          });
        }
      }

      function cacheSurfaceFeatureHint(pts, landuseType, guardOptions = null) {
        if (!pts || pts.length < 3 || !landuseType) return;
        let ring = sanitizeWorldFootprintPoints(
          pts,
          FEATURE_MIN_POLYGON_AREA,
          guardOptions || undefined
        );
        if (ring.length < 3) return;
        ring = sanitizeWorldFootprintPoints(
          decimatePoints(ring, 140, false),
          FEATURE_MIN_POLYGON_AREA,
          guardOptions || undefined
        );
        if (ring.length < 3) return;
        const area = Math.abs(signedPolygonAreaXZ(ring));
        if (!Number.isFinite(area) || area < FEATURE_MIN_POLYGON_AREA) return;
        let minX = Infinity,maxX = -Infinity,minZ = Infinity,maxZ = -Infinity;
        ring.forEach((p) => {
          minX = Math.min(minX, p.x);
          maxX = Math.max(maxX, p.x);
          minZ = Math.min(minZ, p.z);
          maxZ = Math.max(maxZ, p.z);
        });
        appCtx.surfaceFeatureHints.push({
          type: landuseType,
          pts: ring,
          bounds: { minX, maxX, minZ, maxZ }
        });
      }

      function waterwayWidthFromTags(tags) {
        const kind = (tags?.kind || tags?.waterway || '').toString();
        if (kind.includes('ocean') || kind.includes('coast')) return 220;
        if (kind.includes('river')) return 18;
        if (kind.includes('canal')) return 12;
        if (kind.includes('drain')) return 4;
        if (kind.includes('ditch')) return 3;
        if (kind.includes('stream')) return 6;
        return 8;
      }

      function addWaterwayRibbon(pts, tags) {
        if (!pts || pts.length < 2) return;
        const centerline = decimatePoints(pts, 1000, false);
        if (centerline.length < 2) return;

        const width = waterwayWidthFromTags(tags);
        const waterVisualProfile = resolveWaterSurfaceVisualProfile();
        const halfWidth = width * 0.5;
        const verticalBias = 0.14;
        const _h = typeof appCtx.terrainMeshHeightAt === 'function' ? appCtx.terrainMeshHeightAt : appCtx.elevationWorldYAtWorldXZ;
        const verts = [];
        const indices = [];

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
          const leftY = _h(leftX, leftZ) + verticalBias;
          const rightY = _h(rightX, rightZ) + verticalBias;

          verts.push(leftX, leftY, leftZ);
          verts.push(rightX, rightY, rightZ);

          if (i < centerline.length - 1) {
            const vi = i * 2;
            indices.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);
          }
        }

        if (verts.length < 12 || indices.length < 6) return;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
          color: waterVisualProfile.color,
          emissive: waterVisualProfile.mode === 'ice' ? 0x8fa6bd : 0x0d2b4f,
          emissiveIntensity: waterVisualProfile.mode === 'ice' ? 0.08 : 0.14,
          roughness: waterVisualProfile.mode === 'ice' ? 0.82 : 0.38,
          metalness: waterVisualProfile.mode === 'ice' ? 0.02 : 0.02,
          transparent: false,
          opacity: 1,
          side: THREE.DoubleSide,
          depthWrite: true,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4
        });
        registerWaterWaveMaterial(material, {
          waveScale: clampNumber(width / 42, 0.55, 1.1, 0.7),
          waveBase: clampNumber(width / 60, 0.4, 0.85, 0.55),
          width,
          waterKind: inferWaterRenderContext({ width })
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = 1;
        mesh.receiveShadow = false;
        mesh.userData.isWaterwayLine = true;
        mesh.userData.alwaysVisible = true;
        mesh.userData.waterwayCenterline = centerline;
        mesh.userData.waterwayWidth = width;
        mesh.userData.waterwayBias = verticalBias;
        mesh.userData.surfaceVariant = waterVisualProfile.mode;
        assignContinuousWorldRegionKeysToTarget(mesh, {
          points: centerline,
          family: 'water'
        });
        mesh.visible = true;
        appCtx.scene.add(mesh);
        appCtx.landuseMeshes.push(mesh);
        appCtx.waterways.push({
          type: tags?.kind || tags?.waterway || 'waterway',
          width,
          surfaceY: verticalBias,
          pts: centerline
        });
      }

      function addLinearFeatureRibbon(pts, tags, options = {}) {
        if (!ENABLE_LINEAR_FEATURES && options.force !== true) return false;
        if (!pts || pts.length < 2) return false;
        const classification = classifyLinearFeatureTags(tags, options);
        if (!classification) return false;
        const centerline = decimatePoints(pts, classification.kind === 'railway' ? 900 : 700, false);
        if (centerline.length < 2) return false;

        const spec = linearFeatureVisualSpec(classification, tags);
        const halfWidth = spec.width * 0.5;
        const verts = [];
        const indices = [];
        const structureSemantics = classifyStructureSemantics(tags || {}, {
          featureKind: classification.kind,
          subtype: classification.subtype
        });
        const feature = {
          kind: classification.kind,
          subtype: classification.subtype,
          networkKind: classification.kind,
          name: String(tags?.name || '').trim(),
          sourceFeatureId: tags?.sourceFeatureId ? String(tags.sourceFeatureId) : '',
          width: spec.width,
          bias: spec.bias,
          surfaceBias: spec.bias,
          pts: centerline,
          walkable: true,
          driveable: false,
          structureSemantics,
          baseStructureSemantics: cloneStructureSemantics(structureSemantics),
          structureTags: {
            bridge: tags?.bridge || '',
            tunnel: tags?.tunnel || '',
            layer: tags?.layer || '',
            level: tags?.level || '',
            placement: tags?.placement || '',
            ramp: tags?.ramp || '',
            covered: tags?.covered || '',
            indoor: tags?.indoor || '',
            location: tags?.location || '',
            min_height: tags?.min_height || '',
            man_made: tags?.man_made || ''
          },
          bounds: polylineBounds(centerline, spec.width * 0.5 + 12),
          isStructureConnector: options.force === true
        };
        applyBuildingContextSemanticsToFeature(feature);
        feature.isStructureConnector =
          options.force === true &&
          (feature?.structureSemantics?.gradeSeparated || feature?.structureSemantics?.skywalk === true);
        if (options.force === true && !feature.isStructureConnector) return false;
        updateFeatureSurfaceProfile(feature, worldBaseTerrainY, { surfaceBias: spec.bias });
        const ribbonEdges = buildFeatureRibbonEdges(feature, centerline, halfWidth, worldBaseTerrainY, {
          surfaceBias: spec.bias
        });

        for (let i = 0; i < ribbonEdges.leftEdge.length; i++) {
          const leftEdge = ribbonEdges.leftEdge[i];
          const rightEdge = ribbonEdges.rightEdge[i];
          verts.push(leftEdge.x, leftEdge.y, leftEdge.z);
          verts.push(rightEdge.x, rightEdge.y, rightEdge.z);
          if (i < ribbonEdges.leftEdge.length - 1) {
            const vi = i * 2;
            indices.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);
          }
        }

        if (verts.length < 12 || indices.length < 6) return false;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
          color: spec.color,
          emissive: spec.emissive,
          emissiveIntensity: spec.emissiveIntensity,
          roughness: spec.roughness,
          metalness: spec.metalness,
          transparent: false,
          opacity: spec.opacity,
          side: THREE.DoubleSide,
          depthWrite: true,
          polygonOffset: true,
          polygonOffsetFactor: -3,
          polygonOffsetUnits: -3
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = 2;
        mesh.receiveShadow = false;
        mesh.userData.isLinearFeatureLine = true;
        mesh.userData.linearFeatureCenterline = centerline;
        mesh.userData.linearFeatureKind = classification.kind;
        mesh.userData.linearFeatureSubtype = classification.subtype;
        mesh.userData.linearFeatureWidth = spec.width;
        mesh.userData.linearFeatureBias = spec.bias;
        mesh.userData.linearFeatureRef = feature;
        mesh.userData.structureSemantics = structureSemantics;
        mesh.userData.structureConnector = options.force === true;
        mesh.visible = options.alwaysVisible === true ? true : appCtx.showPathOverlays !== false;
        appCtx.scene.add(mesh);
        appCtx.linearFeatureMeshes.push(mesh);
        appCtx.linearFeatures.push(feature);
        return true;
      }

      function addWaterPolygonFromVectorCoords(polygonCoords, properties = {}) {
        if (!Array.isArray(polygonCoords) || polygonCoords.length === 0) return false;
        const outer = normalizeWorldRingFromLonLat(polygonCoords[0], 1000);
        if (!outer) return false;

        const holes = [];
        for (let i = 1; i < polygonCoords.length; i++) {
          const hole = normalizeWorldRingFromLonLat(polygonCoords[i], 700);
          if (hole && Math.abs(signedPolygonAreaXZ(hole)) > FEATURE_MIN_HOLE_AREA) holes.push(hole);
        }

        addLandusePolygon(outer, 'water', holes);
        return true;
      }

      function addVectorWaterGeoJSON(geojson) {
        if (!geojson || !geojson.geometry) return { polygons: 0, lines: 0 };
        let polygons = 0;
        let lines = 0;
        const geom = geojson.geometry;
        const props = geojson.properties || {};

        if (geom.type === 'Polygon') {
          if (addWaterPolygonFromVectorCoords(geom.coordinates, props)) polygons++;
          return { polygons, lines };
        }
        if (geom.type === 'MultiPolygon') {
          geom.coordinates.forEach((polyCoords) => {
            if (addWaterPolygonFromVectorCoords(polyCoords, props)) polygons++;
          });
          return { polygons, lines };
        }
        if (geom.type === 'LineString') {
          const pts = worldLinePointsFromLonLat(geom.coordinates, 1000);
          if (pts && pts.length >= 2) {
            addWaterwayRibbon(pts, props);
            lines++;
          }
          return { polygons, lines };
        }
        if (geom.type === 'MultiLineString') {
          geom.coordinates.forEach((lineCoords) => {
            const pts = worldLinePointsFromLonLat(lineCoords, 1000);
            if (pts && pts.length >= 2) {
              addWaterwayRibbon(pts, props);
              lines++;
            }
          });
        }
        return { polygons, lines };
      }

      function ensureWaterFallbackIfEmpty() {
        const existingCount = (Array.isArray(appCtx.waterAreas) ? appCtx.waterAreas.length : 0) +
          (Array.isArray(appCtx.waterways) ? appCtx.waterways.length : 0);
        if (existingCount > 0) return false;

        // Guarantee at least one visible water surface so sparse/remote loads
        // never present a fully dry/broken world due upstream data outages.
        const ringHalfWidth = Math.max(280, Math.min(820, appCtx.SCALE * featureRadius * 0.35));
        const zNear = ringHalfWidth * 0.75;
        const zFar = ringHalfWidth * 1.45;
        const fallbackOuter = [
          { x: -ringHalfWidth, z: zNear },
          { x: ringHalfWidth, z: zNear },
          { x: ringHalfWidth, z: zFar },
          { x: -ringHalfWidth, z: zFar },
          { x: -ringHalfWidth, z: zNear }
        ];
        addLandusePolygon(fallbackOuter, 'water', []);
        return true;
      }

      async function loadVectorTileWaterCoverage(latMin, lonMin, latMax, lonMax) {
        const tr = vectorTileRangeForBounds(latMin, lonMin, latMax, lonMax, WATER_VECTOR_TILE_ZOOM);
        const tileJobs = [];
        for (let tx = tr.xMin; tx <= tr.xMax; tx++) {
          for (let ty = tr.yMin; ty <= tr.yMax; ty++) {
            tileJobs.push(fetchVectorTileWater(WATER_VECTOR_TILE_ZOOM, tx, ty));
          }
        }
        if (tileJobs.length === 0) return { polygons: 0, lines: 0, tiles: 0, okTiles: 0 };

        const settled = await Promise.allSettled(tileJobs);
        let polygons = 0;
        let lines = 0;
        let okTiles = 0;

        settled.forEach((result) => {
          if (result.status !== 'fulfilled') return;
          okTiles++;
          const { tile, x, y, z } = result.value;
          const polygonLayers = ['ocean', 'water_polygons'];
          const lineLayers = ['water_lines'];

          polygonLayers.forEach((layerName) => {
              const layer = tile.layers[layerName];
              if (!layer || !Number.isFinite(layer.length)) return;
              for (let i = 0; i < layer.length; i++) {
                const feature = layer.feature(i);
                if (!feature || typeof feature.toGeoJSON !== 'function') continue;
                const out = addVectorWaterGeoJSON(feature.toGeoJSON(x, y, z));
                polygons += out.polygons;
                lines += out.lines;
              }
          });

          lineLayers.forEach((layerName) => {
              const layer = tile.layers[layerName];
              if (!layer || !Number.isFinite(layer.length)) return;
              for (let i = 0; i < layer.length; i++) {
                const feature = layer.feature(i);
                if (!feature || typeof feature.toGeoJSON !== 'function') continue;
                const out = addVectorWaterGeoJSON(feature.toGeoJSON(x, y, z));
                polygons += out.polygons;
                lines += out.lines;
              }
          });
        });

        return { polygons, lines, tiles: tileJobs.length, okTiles };
      }

      const currentWaterFeatureCount = () =>
        (Array.isArray(appCtx.waterAreas) ? appCtx.waterAreas.length : 0) +
        (Array.isArray(appCtx.waterways) ? appCtx.waterways.length : 0);

      const loadSignature = `${Number(appCtx.LOC?.lat || 0).toFixed(6)}:${Number(appCtx.LOC?.lon || 0).toFixed(6)}:${Number(featureRadius || 0).toFixed(6)}`;
      const waterSignals = worldSurfaceProfile?.signals?.normalized || {};
      const likelyWaterNearby =
        currentWaterFeatureCount() > 0 ||
        Number(waterSignals.water || 0) >= 0.05 ||
        Number(waterSignals.explicitBlue || 0) >= 0.04 ||
        appCtx.boatMode?.active === true ||
        appCtx.oceanMode?.active === true;
      waterCoveragePriority =
        currentWaterFeatureCount() > 0 ||
        likelyWaterNearby ||
        Number(waterSignals.water || 0) >= 0.02 ||
        Number(waterSignals.explicitBlue || 0) >= 0.015;
      let waterCoveragePhaseRan = false;
      let waterCoveragePromise = null;
      runCriticalWaterCoverage = async () => currentWaterFeatureCount() > 0;

      async function runVectorWaterCoverage(options = {}) {
        const showStatus = options.showStatus === true;
        const injectFallback = options.injectFallback === true;
        const currentSignature = `${Number(appCtx.LOC?.lat || 0).toFixed(6)}:${Number(appCtx.LOC?.lon || 0).toFixed(6)}:${Number(featureRadius || 0).toFixed(6)}`;
        if (currentSignature !== loadSignature) return null;
        if (showStatus) {
          showWorldLoadProgress('Loading water...');
        }
        try {
          const waterSummary = await loadVectorTileWaterCoverage(
            appCtx.LOC.lat - featureRadius,
            appCtx.LOC.lon - featureRadius,
            appCtx.LOC.lat + featureRadius,
            appCtx.LOC.lon + featureRadius
          );
          if (waterSummary.polygons === 0 && waterSummary.lines === 0 && showStatus) {
            console.warn(`[Water] Vector tiles loaded but no water features in bounds (tiles ok ${waterSummary.okTiles}/${waterSummary.tiles}).`);
          }
        } catch (waterErr) {
          console.warn('[Water] Vector water load failed, continuing without vector water layer.', waterErr);
        }
        if (injectFallback && ensureWaterFallbackIfEmpty()) {
          console.warn('[Water] No water features loaded; injected deterministic fallback water surface.');
        }
        return true;
      }

      runCriticalWaterCoverage = async (options = {}) => {
        const force = options.force === true;
        const allowAfterLoad = options.allowAfterLoad === true;
        const showStatus = options.showStatus === true;
        const injectFallback = options.injectFallback === true;
        const updateLodAfter = options.updateLod !== false;
        const inventoryReason = String(options.inventoryReason || 'startup_water_coverage');
        const currentSignature = `${Number(appCtx.LOC?.lat || 0).toFixed(6)}:${Number(appCtx.LOC?.lon || 0).toFixed(6)}:${Number(featureRadius || 0).toFixed(6)}`;
        if (currentSignature !== loadSignature) return false;
        if (!force && waterCoveragePhaseRan) return currentWaterFeatureCount() > 0;
        if (!allowAfterLoad && (!isActiveLoadContext() || earthSceneSuppressed())) return false;
        if (allowAfterLoad && earthSceneSuppressed()) return false;
        if (waterCoveragePromise) return waterCoveragePromise;

        waterCoveragePromise = (async () => {
          waterCoveragePhaseRan = true;
          startLoadPhase('buildWaterGeometry');
          try {
            if (showStatus) showWorldLoadProgress('Loading water...');
            landuseWays.forEach((way) => {
              const landuseType = classifyLanduseType(way.tags);
              if (landuseType !== 'water') return;
              const pts = way.nodes.map((id) => nodes[id]).filter((n) => n).map((n) => appCtx.geoToWorld(n.lat, n.lon));
              cacheSurfaceFeatureHint(pts, landuseType, waterGeometryGuards);
              addLandusePolygon(pts, landuseType, [], waterGeometryGuards);
            });

            if (Array.isArray(waterwayWays) && waterwayWays.length > 0) {
              waterwayWays.forEach((way) => {
                const pts = way.nodes.map((id) => nodes[id]).filter((n) => n).map((n) => appCtx.geoToWorld(n.lat, n.lon));
                addWaterwayRibbon(pts, way.tags || {});
              });
            }

            await runVectorWaterCoverage({
              showStatus: false,
              injectFallback
            });
          } finally {
            endLoadPhase('buildWaterGeometry');
          }

          startLoadPhase('batchWaterGeometry');
          try {
            const batchedLanduseCount = batchLanduseMeshes();
            if (batchedLanduseCount > 0) {
              loadMetrics.lod.landuseBatched = batchedLanduseCount;
            }
            if (appCtx._lastLanduseBatchStats) {
              loadMetrics.landuseBatching = { ...appCtx._lastLanduseBatchStats };
            }
          } finally {
            endLoadPhase('batchWaterGeometry');
          }

          syncRuntimeContentInventory(inventoryReason);
          if (updateLodAfter && typeof updateWorldLod === 'function') {
            safeLoadCall(
              `updateWorldLod_${inventoryReason}`,
              () => updateWorldLod(true)
            );
          }
          return currentWaterFeatureCount() > 0;
        })().finally(() => {
          waterCoveragePromise = null;
        });

        return waterCoveragePromise;
      };

      appCtx.ensureWaterRuntimeCoverage = (options = {}) =>
        runCriticalWaterCoverage({
          force: options.force === true,
          allowAfterLoad: true,
          showStatus: options.showStatus === true,
          injectFallback: options.injectFallback === true,
          updateLod: options.updateLod !== false,
          inventoryReason: String(options.reason || 'runtime_water_coverage')
        });

      const buildPoiGeometryPass = (phaseName = 'buildPoiGeometry') => {
        startLoadPhase(phaseName);
        try {
          poiNodes.forEach((node) => {
            const tags = node.tags;
            const poiKey = poiKeyFromTags(tags);

            if (!(poiKey && appCtx.POI_TYPES[poiKey])) return;

            const pos = appCtx.geoToWorld(node.lat, node.lon);
            const poiData = appCtx.POI_TYPES[poiKey];
            const centerDist = Math.hypot(pos.x, pos.z);
            const poiTier = centerDist <= lodNearDist ?
              'near' :
              centerDist <= lodMidDist ? 'mid' : 'far';
            const terrainY = appCtx.elevationWorldYAtWorldXZ(pos.x, pos.z);

            if (poiTier === 'near') {
              loadMetrics.pois.near += 1;
            } else if (poiTier === 'mid') {
              loadMetrics.pois.mid += 1;
            } else {
              loadMetrics.pois.far += 1;
            }

            if (poiTier !== 'far') {
              const markerRadius = poiTier === 'near' ? 1.5 : 1.2;
              const markerHeight = poiTier === 'near' ? 4 : 3;
              const markerSegments = poiTier === 'near' ? 8 : 6;
              const geometry = new THREE.CylinderGeometry(markerRadius, markerRadius, markerHeight, markerSegments);
              const material = new THREE.MeshLambertMaterial({
                color: poiData.color,
                emissive: poiData.color,
                emissiveIntensity: poiTier === 'near' ? 0.3 : 0.18
              });
              const mesh = new THREE.Mesh(geometry, material);
              mesh.position.set(pos.x, terrainY + markerHeight * 0.5, pos.z);
              mesh.userData.poiPosition = { x: pos.x, z: pos.z };
              mesh.userData.isPOIMarker = true;
              mesh.userData.lodTier = poiTier;
              mesh.castShadow = false;
              mesh.visible = !!appCtx.poiMode;
              appCtx.scene.add(mesh);
              appCtx.poiMeshes.push(mesh);

              if (poiTier === 'near') {
                const capGeo = new THREE.SphereGeometry(1.8, 8, 6);
                const capMat = new THREE.MeshLambertMaterial({
                  color: poiData.color,
                  emissive: poiData.color,
                  emissiveIntensity: 0.4
                });
                const cap = new THREE.Mesh(capGeo, capMat);
                cap.position.set(pos.x, terrainY + 4, pos.z);
                cap.userData.poiPosition = { x: pos.x, z: pos.z };
                cap.userData.isCapMesh = true;
                cap.userData.isPOIMarker = true;
                cap.userData.lodTier = 'near';
                cap.visible = !!appCtx.poiMode;
                appCtx.scene.add(cap);
                appCtx.poiMeshes.push(cap);
              }
            }

            appCtx.pois.push({
              x: pos.x,
              z: pos.z,
              sourceFeatureId: node.id ? String(node.id) : '',
              type: poiKey,
              name: tags.name || poiData.category,
              lodTier: poiTier,
              ...poiData
            });

            if (tags.historic) {
              appCtx.historicSites.push({
                x: pos.x,
                z: pos.z,
                lat: node.lat,
                lon: node.lon,
                type: tags.historic,
                name: tags.name || 'Historic Site',
                description: tags.description || tags['name:en'] || null,
                wikipedia: tags.wikipedia || tags['wikipedia:en'] || null,
                wikidata: tags.wikidata || null,
                lodTier: poiTier,
                ...poiData
              });
            }
          });
        } finally {
          endLoadPhase(phaseName);
        }
      };

      const buildStreetFurniturePass = (phaseName = 'buildStreetFurniture') => {
        startLoadPhase(phaseName);
        try {
          generateStreetFurniture();
          loadMetrics.vegetation.generated = Array.isArray(appCtx.vegetationFeatures) ? appCtx.vegetationFeatures.length : 0;
        } catch (err) {
          loadMetrics.streetFurnitureError = err?.message || String(err);
          recordLoadWarning('generateStreetFurniture', err);
        } finally {
          endLoadPhase(phaseName);
        }
      };

      const runNonCriticalWorldEnrichment = async ({ deferred = false } = {}) => {
        if (!isActiveLoadContext() || earthSceneSuppressed()) return false;
        if (!deferred) {
          showWorldLoadProgress(`Loading land use... (${landuseWays.length})`);
        }
        startLoadPhase('buildLanduseGeometry');
        landuseWays.forEach((way) => {
          const landuseType = classifyLanduseType(way.tags);
          if (!landuseType || landuseType === 'water') return;
          const pts = way.nodes.map((id) => nodes[id]).filter((n) => n).map((n) => appCtx.geoToWorld(n.lat, n.lon));
          cacheSurfaceFeatureHint(pts, landuseType, landuseGeometryGuards);
          addLandusePolygon(pts, landuseType, [], landuseGeometryGuards);
        });
        endLoadPhase('buildLanduseGeometry');
        startLoadPhase('batchLanduseGeometry');
        const batchedLanduseCount = batchLanduseMeshes();
        if (batchedLanduseCount > 0) {
          loadMetrics.lod.landuseBatched = batchedLanduseCount;
        }
        if (appCtx._lastLanduseBatchStats) {
          loadMetrics.landuseBatching = { ...appCtx._lastLanduseBatchStats };
        }
        endLoadPhase('batchLanduseGeometry');

        refreshStructureAwareFeatureProfiles();
        startLoadPhase('buildLinearFeatureGeometry');
        const linearFeatureGroups = [
          { ways: railwayWays, force: false, alwaysVisible: false },
          { ways: cyclewayWays, force: false, alwaysVisible: false },
          { ways: footwayWays, force: false, alwaysVisible: false },
          { ways: structureConnectorWays, force: true, alwaysVisible: true }
        ];
        linearFeatureGroups.forEach((group) => {
          const featureWays = group.ways;
          if (!Array.isArray(featureWays) || featureWays.length === 0) return;
          featureWays.forEach((way) => {
            const rawPts = way.nodes.map((id) => nodes[id]).filter((n) => n).map((n) => appCtx.geoToWorld(n.lat, n.lon));
            const pts = sanitizeWorldPathPoints(rawPts, geometryGuards);
            if (pts.length < 2) return;
            addLinearFeatureRibbon(pts, { ...(way.tags || {}), sourceFeatureId: way.id ? String(way.id) : '' }, {
              force: group.force === true,
              alwaysVisible: group.alwaysVisible === true
            });
          });
        });
        refreshStructureAwareFeatureProfiles();
        syncLinearFeatureOverlayVisibility();
        if (typeof appCtx.rebuildStructureVisualMeshes === 'function') {
          appCtx.rebuildStructureVisualMeshes();
        }
        endLoadPhase('buildLinearFeatureGeometry');

        buildPoiGeometryPass('buildPoiGeometry');
        buildStreetFurniturePass('buildStreetFurniture');
        scheduleDeferredLinearFeatureLoad();
        syncRuntimeContentInventory(deferred ? 'startup_deferred_enrichment' : 'startup_enrichment');
        if (typeof updateWorldLod === 'function') {
          safeLoadCall(
            deferred ? 'updateWorldLod_startup_deferred_enrichment' : 'updateWorldLod_startup_enrichment',
            () => updateWorldLod(true)
          );
        }
        return true;
      };

      const scheduleDeferredStartupEnrichment = (delayMs = 6500) => {
        if (!deferNonCriticalStartupEnrichment || deferredStartupEnrichmentRunning) return;
        if (deferredStartupEnrichmentTimer) return;
        deferredStartupEnrichmentTimer = window.setTimeout(async () => {
          deferredStartupEnrichmentTimer = null;
          if (!isActiveLoadContext() || earthSceneSuppressed()) return;
          const actorState = continuousWorldInteractiveActorMotionState();
          const movementSpeed = Math.abs(Number(actorState?.speed || 0));
          const moving =
            actorState?.mode === 'walk' ?
              movementSpeed >= 0.6 :
              movementSpeed >= 2.5;
          const streamState = appCtx.getContinuousWorldInteractiveStreamSnapshot?.();
          const streamBusy =
            !!streamState?.pending ||
            (Date.now() - Number(streamState?.lastLoadAt || 0)) < 2200;
          const perfTierNow = String(appCtx.getPerfAutoQualityTier?.() || appCtx.perfAutoQualityTier || 'balanced');
          const frameMsNow = Number(appCtx.perfStats?.live?.frameMs || 0);
          const underPressure = frameMsNow >= (perfTierNow === 'performance' ? 34 : 48);
          if (moving || streamBusy || underPressure) {
            scheduleDeferredStartupEnrichment(2200);
            return;
          }
          deferredStartupEnrichmentRunning = true;
          try {
            await runNonCriticalWorldEnrichment({ deferred: true });
          } finally {
            deferredStartupEnrichmentRunning = false;
          }
        }, Math.max(0, delayMs));
      };

      if (appCtx.roads.length > 0) {
        await runCriticalWaterCoverage({
          force: true,
          showStatus: waterCoveragePriority,
          injectFallback: waterCoveragePriority,
          updateLod: false,
          inventoryReason: 'startup_water_coverage'
        });
        if (deferNonCriticalStartupEnrichment) {
          scheduleDeferredStartupEnrichment();
          await finalizeLoadedWorld('primary');
        } else {
          await runNonCriticalWorldEnrichment({ deferred: false });
          await finalizeLoadedWorld('primary');
        }
      } else {
        console.warn('No roads found in data, trying larger area...');
        showWorldLoadProgress('No roads found, trying larger area...');
      }
    } catch (e) {
      const isLastAttempt = r === radii[radii.length - 1];
      if (appCtx.roads.length > 0) {
        console.warn('[WorldLoad] Recovering with partially loaded world data.');
        loadMetrics.error = e?.message || String(e);
        await runCriticalWaterCoverage({
          force: true,
          showStatus: false,
          injectFallback: waterCoveragePriority,
          updateLod: false,
          inventoryReason: 'partial_error_water_coverage'
        });
        await finalizeLoadedWorld('partial_after_error');
        break;
      }
      if (!isLastAttempt) {
        console.warn('Road loading attempt failed, retrying with larger area...', e);
        showWorldLoadProgress('Retrying map data...');
        continue;
      }

      console.error('Road loading failed after all attempts:', e);
      if (appCtx.roads.length === 0) {
        if (useSyntheticFallbackRoads) {
          createSyntheticFallbackWorld();
          await finalizeLoadedWorld('synthetic_fallback');
        } else {
          await finalizeLoadedWorld('no_roads_sparse');
        }
      }
    }
  }
  if (!loaded && appCtx.roads.length > 0) {
    console.warn('[WorldLoad] Completing with partially loaded roads.');
    await appCtx.ensureWaterRuntimeCoverage?.({
      force: true,
      injectFallback: waterCoveragePriority,
      updateLod: false,
      reason: 'post_loop_partial_water_coverage'
    });
    await finalizeLoadedWorld('post_loop_partial');
  }
  if (!loaded && appCtx.roads.length === 0) {
    if (useSyntheticFallbackRoads) {
      console.warn('[WorldLoad] No road data found for this location. Using synthetic fallback world.');
      createSyntheticFallbackWorld();
      await finalizeLoadedWorld('synthetic_no_roads');
    } else {
      console.warn('[WorldLoad] No road data found for this location. Loading sparse terrain-only world.');
      await finalizeLoadedWorld('no_roads_sparse');
    }
  }
  if (!loaded && retryPass < 1) {
    console.warn('[WorldLoad] Initial pass failed. Retrying once automatically...');
    showWorldLoadProgress('Retrying map data...');
    appCtx.worldLoading = false;
    return loadRoadsInternal(retryPass + 1);
  }
  if (!loaded) {
    // Final safety net for upstream outages: do not leave users blocked behind
    // a manual retry screen; recover with whichever fallback mode is appropriate.
    console.warn('[WorldLoad] Final load path failed. Entering fallback recovery mode.');
    if (appCtx.roads.length === 0) {
      if (useSyntheticFallbackRoads) {
        createSyntheticFallbackWorld();
        await finalizeLoadedWorld('synthetic_final_recovery');
      } else {
        await finalizeLoadedWorld('no_roads_final_recovery');
      }
    } else {
      await appCtx.ensureWaterRuntimeCoverage?.({
        force: true,
        injectFallback: waterCoveragePriority,
        updateLod: false,
        reason: 'partial_final_recovery_water_coverage'
      });
      await finalizeLoadedWorld('partial_final_recovery');
    }
  }
  appCtx.worldLoading = false;
  if (typeof appCtx.setPerfLiveStat === 'function') {
    appCtx.setPerfLiveStat('lodVisible', { near: loadMetrics.lod.near, mid: loadMetrics.lod.mid });
    appCtx.setPerfLiveStat('worldCounts', {
      roads: appCtx.roads.length,
      buildings: appCtx.buildingMeshes.length,
      poiMeshes: appCtx.poiMeshes.length,
      landuseMeshes: appCtx.landuseMeshes.length
    });
  }
  if (_phaseTotals && typeof _phaseTotals === 'object') {
    loadMetrics.phases = Object.fromEntries(
      Object.entries(_phaseTotals).map(([name, ms]) => [name, Math.round(ms)])
    );
  }
  finalizePerfLoad(loaded, {
    roadsFinal: appCtx.roads.length,
    roadVertices: Math.round(loadMetrics.roads.vertices || 0),
    buildingMeshes: appCtx.buildingMeshes.length,
    buildingColliders: appCtx.buildings.length,
    buildingCollidersFull: loadMetrics.colliders.full,
    buildingCollidersSimplified: loadMetrics.colliders.simplified,
    linearFeaturesFinal: Array.isArray(appCtx.linearFeatures) ? appCtx.linearFeatures.length : 0,
    linearFeatureMeshes: Array.isArray(appCtx.linearFeatureMeshes) ? appCtx.linearFeatureMeshes.length : 0,
    poiMeshes: appCtx.poiMeshes.length,
    landuseMeshes: appCtx.landuseMeshes.length
  });
}

async function loadRoads(retryPass = 0) {
  if (retryPass > 0) return loadRoadsInternal(retryPass);

  if (appCtx.boatMode?.active && typeof appCtx.stopBoatMode === 'function') {
    appCtx.stopBoatMode({ targetMode: 'walk' });
  }

  const signature = getWorldLoadSignature();
  if (_activeWorldLoad && _activeWorldLoad.signature === signature) {
    return _activeWorldLoad.promise;
  }

  const promise = loadRoadsInternal(0).finally(() => {
    if (_activeWorldLoad?.promise === promise) {
      _activeWorldLoad = null;
    }
  });

  _activeWorldLoad = { signature, promise };
  return promise;
}

function continuousWorldInteractiveCanStream(reason = 'actor_drift') {
  if (!_continuousWorldInteractiveStreamState.enabled) return false;
  const backgroundFullLoadActive = continuousWorldInteractiveBackgroundFullLoadActive();
  const actorCriticalReason = continuousWorldInteractiveReasonIsActorCritical(reason);
  const startupLockActive = continuousWorldInteractiveStartupLockActive();
  const reasonText = String(reason || 'actor_drift');
  const startupReason =
    reasonText === 'startup_local_shell' ||
    reasonText === 'startup_local_roads' ||
    reasonText === 'startup_roads_ready';
  if (_continuousWorldInteractiveStreamState.hardRecoveryInFlight) return false;
  if ((appCtx.worldLoading || _activeWorldLoad) && !backgroundFullLoadActive && !actorCriticalReason) return false;
  if (startupLockActive && !startupReason) return false;
  if (appCtx.onMoon || appCtx.travelingToMoon) return false;
  if (typeof appCtx.isEnv === 'function' && appCtx.ENV && !appCtx.isEnv(appCtx.ENV.EARTH)) return false;
  if (!appCtx.gameStarted) return false;
  if (!appCtx._continuousWorldVisibleLoadConfig?.enabled) return false;
  return true;
}

function continuousWorldInteractiveNeedsLoad(actorGeo, chunkPlan, desiredLoadLevel = 'full', runtimeSnapshot = null, reason = 'actor_drift') {
  if (!actorGeo || !chunkPlan) return false;
  const regionKey = continuousWorldInteractiveRegionKeyFromLatLon(actorGeo.lat, actorGeo.lon, runtimeSnapshot);
  const desiredRank = continuousWorldInteractiveLoadLevelRank(desiredLoadLevel);
  const actor = continuousWorldInteractiveActorMotionState();
  const mode = String(actor?.mode || 'drive');
  const speed = Math.abs(Number(actor?.speed || 0));
  const reasonText = String(reason || 'actor_drift');
  const actorPrimaryReason =
    reasonText === 'main_loop' ||
    reasonText === 'actor_drift' ||
    reasonText === 'actor_visible_road_gap' ||
    reasonText === 'actor_building_gap' ||
    reasonText.startsWith('building_continuity_');
  const coverageRank = continuousWorldInteractiveCoverageLevelForRegion(regionKey, {
    includeSeeded: !actorPrimaryReason
  });
  if (desiredRank > 0 && coverageRank < desiredRank) {
    return true;
  }
  if (_continuousWorldInteractiveStreamState.coverage.length === 0) return true;
  let nearestDistance = Infinity;
  for (let i = 0; i < _continuousWorldInteractiveStreamState.coverage.length; i++) {
    const coverage = _continuousWorldInteractiveStreamState.coverage[i];
    const dist = continuousWorldGeoDistanceWorldUnits(coverage.lat, coverage.lon, actorGeo.lat, actorGeo.lon);
    nearestDistance = Math.min(nearestDistance, dist);
  }
  const worldRadius = Math.max(1200, Number(chunkPlan.featureRadius || 0) * Math.max(1, Number(appCtx.SCALE) || 1));
  const thresholdScale =
    mode === 'drive' && actor?.onRoad === false ? 0.1 :
    mode === 'drive' && speed >= 18 ? 0.14 :
    mode === 'drive' && speed >= 8 ? 0.2 :
    mode === 'drive' && speed >= 4 ? 0.24 :
    mode === 'drone' ? 0.24 :
    (mode === 'boat' || mode === 'ocean') ? 0.36 :
    0.48;
  return nearestDistance >= worldRadius * thresholdScale;
}

function continuousWorldInteractiveBuildingColor(buildingType = 'yes') {
  const type = String(buildingType || '').toLowerCase();
  if (type === 'house' || type === 'residential' || type === 'detached') return '#b89f8f';
  if (type === 'apartments' || type === 'commercial') return '#9aa4af';
  if (type === 'industrial' || type === 'warehouse') return '#8d8479';
  if (type === 'office' || type === 'retail' || type === 'supermarket') return '#a7adb7';
  if (type === 'church' || type === 'cathedral') return '#b6a58e';
  return '#9fa7b2';
}

function continuousWorldInteractiveBuildingIsImportant(tags = {}, semantics = null, footprintArea = 0, height = 0) {
  const name = String(tags?.name || '').trim();
  const buildingType = String(tags?.building || tags?.['building:part'] || '').toLowerCase();
  if (name) return true;
  if (Number.isFinite(height) && height >= 28) return true;
  if (Number.isFinite(footprintArea) && footprintArea >= 1800) return true;
  if (Number.isFinite(semantics?.levels) && semantics.levels >= 8) return true;
  return (
    buildingType === 'hospital' ||
    buildingType === 'school' ||
    buildingType === 'university' ||
    buildingType === 'station' ||
    buildingType === 'transportation' ||
    buildingType === 'government' ||
    buildingType === 'civic' ||
    buildingType === 'stadium' ||
    buildingType === 'terminal' ||
    buildingType === 'museum' ||
    buildingType === 'cathedral' ||
    buildingType === 'church'
  );
}

async function loadContinuousWorldInteractiveChunk(centerLat, centerLon, reason = 'actor_drift') {
  if (!continuousWorldInteractiveCanStream(reason)) return getContinuousWorldInteractiveStreamSnapshot();
  if (String(reason || 'actor_drift') === 'startup_local_shell' && !continuousWorldStartupLocalShellEnabled()) {
    return getContinuousWorldInteractiveStreamSnapshot();
  }

  const chunkPlan = continuousWorldInteractiveChunkPlan();
  if (!chunkPlan) return getContinuousWorldInteractiveStreamSnapshot();
  const actorState = continuousWorldInteractiveActorMotionState();
  const contentPlan = continuousWorldInteractiveContentPlan(actorState, chunkPlan, reason);
  const runtimeSnapshot = appCtx.getContinuousWorldRuntimeSnapshot?.();
  const actorCriticalReason = continuousWorldInteractiveReasonIsActorCritical(reason);
  const reasonText = String(reason || 'actor_drift');
  const forwardRoadCorridorPrefetch = continuousWorldInteractiveReasonIsForwardRoadCorridor(reasonText);
  const forwardRoadCorridorPlan =
    forwardRoadCorridorPrefetch ?
      continuousWorldForwardRoadCorridorQueryPlan(actorState, runtimeSnapshot) :
      null;
  const resolvedCenterLat =
    forwardRoadCorridorPlan && Number.isFinite(forwardRoadCorridorPlan.centerLat) ?
      forwardRoadCorridorPlan.centerLat :
      centerLat;
  const resolvedCenterLon =
    forwardRoadCorridorPlan && Number.isFinite(forwardRoadCorridorPlan.centerLon) ?
      forwardRoadCorridorPlan.centerLon :
      centerLon;
  const regionKey =
    String(forwardRoadCorridorPlan?.primaryRegionKey || '').trim() ||
    continuousWorldInteractiveRegionKeyFromLatLon(resolvedCenterLat, resolvedCenterLon, runtimeSnapshot);
  if (_continuousWorldInteractiveStreamState.pending) {
    const pendingAgeMs = Date.now() - Number(_continuousWorldInteractiveStreamState.pendingStartedAt || 0);
    const pendingReason = String(_continuousWorldInteractiveStreamState.lastLoadReason || '');
    const pendingForwardRoadCorridor = continuousWorldInteractiveReasonIsForwardRoadCorridor(pendingReason);
    const pendingRegionKey = String(_continuousWorldInteractiveStreamState.pendingRegionKey || '');
    const pendingQueryLat = Number(_continuousWorldInteractiveStreamState.pendingQueryLat);
    const pendingQueryLon = Number(_continuousWorldInteractiveStreamState.pendingQueryLon);
    const sameRegion = regionKey && pendingRegionKey && regionKey === pendingRegionKey;
    const pendingActorCritical = continuousWorldInteractiveReasonIsActorCritical(pendingReason);
    const actorGapReason =
      reasonText === 'actor_visible_road_gap' ||
      reasonText === 'actor_building_gap' ||
      reasonText.startsWith('building_continuity_');
    const pendingCriticalWithoutRegion = pendingActorCritical && !pendingRegionKey;
    const pendingQueryDistanceWorldUnits =
      Number.isFinite(resolvedCenterLat) &&
      Number.isFinite(resolvedCenterLon) &&
      Number.isFinite(pendingQueryLat) &&
      Number.isFinite(pendingQueryLon) ?
        continuousWorldGeoDistanceWorldUnits(resolvedCenterLat, resolvedCenterLon, pendingQueryLat, pendingQueryLon) :
        NaN;
    const pendingDriftThresholdWorldUnits =
      pendingForwardRoadCorridor ?
        520 :
      actorState?.mode === 'drive' ?
        (actorGapReason ? 150 : 220) :
      actorState?.mode === 'drone' ?
        260 :
      actorState?.mode === 'walk' ?
        120 :
        180;
    const pendingMovedBeyondQueryCenter =
      pendingActorCritical &&
      Number.isFinite(pendingQueryDistanceWorldUnits) &&
      pendingQueryDistanceWorldUnits >= pendingDriftThresholdWorldUnits;
    const shouldPreemptPending =
      actorCriticalReason &&
      (
        (!pendingActorCritical && pendingAgeMs >= 450) ||
        (pendingForwardRoadCorridor && reasonText === 'actor_visible_road_gap' && pendingAgeMs >= 700) ||
        (!pendingForwardRoadCorridor && regionKey && pendingRegionKey && !sameRegion && pendingAgeMs >= 650) ||
        (!pendingForwardRoadCorridor && pendingMovedBeyondQueryCenter && pendingAgeMs >= 700) ||
        (actorGapReason && pendingCriticalWithoutRegion && pendingAgeMs >= 700) ||
        (!pendingForwardRoadCorridor && pendingActorCritical && !sameRegion && pendingAgeMs >= 900) ||
        (!pendingForwardRoadCorridor && !sameRegion && pendingAgeMs >= 1800) ||
        pendingAgeMs >= 9000
      );
    if (shouldPreemptPending) {
      if (_continuousWorldInteractiveStreamState.abortController) {
        try {
          _continuousWorldInteractiveStreamState.abortController.abort();
        } catch {}
      }
      _continuousWorldInteractiveStreamState.pending = false;
      _continuousWorldInteractiveStreamState.pendingStartedAt = 0;
      _continuousWorldInteractiveStreamState.pendingQueryLat = NaN;
      _continuousWorldInteractiveStreamState.pendingQueryLon = NaN;
      _continuousWorldInteractiveStreamState.pendingRegionKey = null;
      _continuousWorldInteractiveStreamState.abortController = null;
      _continuousWorldInteractiveStreamState.activeRequestId =
        Number(_continuousWorldInteractiveStreamState.activeRequestId || 0) + 1;
      _continuousWorldInteractiveStreamState.lastError = `preempted_pending:${pendingReason || 'unknown'}`;
    } else {
      return getContinuousWorldInteractiveStreamSnapshot();
    }
  }
  const regionCellCenter = regionKey ? continuousWorldInteractiveRegionCellCenter({
    key: regionKey,
    latIndex: Number(String(regionKey).split(':')[0]),
    lonIndex: Number(String(regionKey).split(':')[1])
  }, runtimeSnapshot) : null;
  const offRoadRecoveryQuery =
    String(actorState?.mode || 'drive') === 'drive' &&
    actorState?.onRoad === false &&
    (reasonText === 'actor_drift' || reasonText === 'main_loop');
  const actorDrivenPrimaryQuery =
    (String(actorState?.mode || 'drive') === 'drive' || String(actorState?.mode || 'drive') === 'walk') &&
    (
      reasonText === 'actor_drift' ||
      reasonText === 'main_loop' ||
      reasonText === 'actor_visible_road_gap' ||
      reasonText === 'actor_building_gap' ||
      reasonText === 'road_recovery_shell' ||
      reasonText.startsWith('building_continuity_')
    );
  const localShellPriorityQuery = continuousWorldInteractiveReasonNeedsLocalShell(reasonText);
  const buildingContinuityRecovery = reasonText.startsWith('building_continuity_');
  const fastActorLocalShellQuery =
    localShellPriorityQuery &&
    !buildingContinuityRecovery &&
    String(actorState?.mode || 'drive') === 'drive' &&
    (
      actorState?.onRoad === false ||
      countDriveableRoadFeaturesNearWorldPoint(actorState?.x, actorState?.z, 260) <= 0
    );
  const fastActorRoadShellQuery =
    reasonText === 'actor_visible_road_gap' &&
    String(actorState?.mode || 'drive') === 'drive' &&
    countDriveableRoadFeaturesNearWorldPoint(actorState?.x, actorState?.z, 280) <= 0;
  const fastActorBuildingShellQuery =
    reasonText === 'actor_building_gap' &&
    String(actorState?.mode || 'drive') === 'drive' &&
    countDriveableRoadFeaturesNearWorldPoint(actorState?.x, actorState?.z, 280) > 0;
  const useRegionCenteredQuery =
    reasonText !== 'startup_local_shell' &&
    reasonText !== 'road_recovery_shell' &&
    !forwardRoadCorridorPrefetch &&
    !fastActorRoadShellQuery &&
    !fastActorBuildingShellQuery &&
    !fastActorLocalShellQuery;
  const queryLat = Number(
    forwardRoadCorridorPlan?.centerLat ??
    regionCellCenter?.lat ??
    resolvedCenterLat
  );
  const queryLon = Number(
    forwardRoadCorridorPlan?.centerLon ??
    regionCellCenter?.lon ??
    resolvedCenterLon
  );
  const requestAbortController = new AbortController();

  _continuousWorldInteractiveStreamState.pending = true;
  _continuousWorldInteractiveStreamState.pendingStartedAt = Date.now();
  _continuousWorldInteractiveStreamState.pendingQueryLat = queryLat;
  _continuousWorldInteractiveStreamState.pendingQueryLon = queryLon;
  _continuousWorldInteractiveStreamState.pendingRegionKey = regionKey || null;
  const requestId = Number(_continuousWorldInteractiveStreamState.activeRequestId || 0) + 1;
  _continuousWorldInteractiveStreamState.activeRequestId = requestId;
  _continuousWorldInteractiveStreamState.abortController = requestAbortController;
  _continuousWorldInteractiveStreamState.lastError = null;
  _continuousWorldInteractiveStreamState.lastLoadReason = reason;
  const loadStartedAt = performance.now();

  try {
  const queryKind =
      fastActorRoadShellQuery ? 'interactive:actor_visible_road_gap_fast' :
      fastActorBuildingShellQuery ? 'interactive:actor_building_gap' :
      fastActorLocalShellQuery ? 'interactive:fast_local_shell' :
      forwardRoadCorridorPrefetch ? 'interactive:forward_road_corridor' :
      reasonText === 'actor_visible_road_gap' ? 'interactive:actor_visible_road_gap' :
      reasonText === 'actor_building_gap' ? 'interactive:actor_building_gap' :
      reasonText === 'road_recovery_shell' ? 'interactive:road_recovery_shell' :
      reasonText === 'startup_local_shell' ? 'interactive:startup_local_shell' :
      buildingContinuityRecovery ? 'interactive:building_continuity' :
      reasonText.startsWith('region_prefetch:') ? `interactive:prefetch:${contentPlan.loadLevel}` :
      `interactive:${String(contentPlan.loadLevel || 'full')}`;
    const queryTimeoutSeconds =
      (fastActorRoadShellQuery || fastActorLocalShellQuery) ?
        5 :
      forwardRoadCorridorPrefetch ?
        5 :
        Math.max(contentPlan.roadsOnly ? 5 : 8, Math.floor(chunkPlan.overpassTimeoutMs / 1000));
    const queryRoadRadius =
      fastActorRoadShellQuery ?
        clampNumber(Math.min(Number(chunkPlan.roadRadius || 0), 0.0138), 0.0072, Math.max(Number(chunkPlan.roadRadius || 0), 0.0138), 0.0108) :
      forwardRoadCorridorPrefetch ?
        clampNumber(
          Math.max(
            Number(forwardRoadCorridorPlan?.roadRadius || 0),
            Math.min(Math.max(Number(chunkPlan.roadRadius || 0), 0.0128), 0.0146)
          ),
          0.0098,
          0.024,
          0.0128
        ) :
      fastActorBuildingShellQuery ?
        0 :
      fastActorLocalShellQuery ?
        clampNumber(Math.min(Number(chunkPlan.roadRadius || 0), 0.0124), 0.0068, Math.max(Number(chunkPlan.roadRadius || 0), 0.0124), 0.0096) :
        Number(chunkPlan.roadRadius || 0);
    const queryBuildingRadius =
      fastActorRoadShellQuery ?
        0 :
      fastActorBuildingShellQuery ?
        clampNumber(Math.min(Number(contentPlan.buildingRadius || 0), 0.0116), 0.0074, Math.max(Number(contentPlan.buildingRadius || 0), 0.0116), 0.0102) :
      fastActorLocalShellQuery ?
        clampNumber(Math.min(Number(contentPlan.buildingRadius || 0), 0.0072), 0.0048, Math.max(Number(contentPlan.buildingRadius || 0), 0.0072), 0.0062) :
        Number(contentPlan.buildingRadius || 0);
    const queryLanduseRadius = (fastActorRoadShellQuery || fastActorLocalShellQuery || fastActorBuildingShellQuery) ? 0 : Number(contentPlan.landuseRadius || 0);
    const queryWaterRadius = (fastActorRoadShellQuery || fastActorLocalShellQuery || fastActorBuildingShellQuery) ? 0 : Number(contentPlan.waterFeatureRadius || 0);
    const queryMaxRoadWays =
      fastActorRoadShellQuery ? Math.min(Math.max(Number(chunkPlan.maxRoadWays || 0), 420), 560) :
      forwardRoadCorridorPrefetch ?
        Math.min(
          Math.max(
            Number(contentPlan.maxRoadWays || 0),
            640 + Math.max(0, ((forwardRoadCorridorPlan?.regionKeys?.length || 0) - 2) * 110)
          ),
          1080
        ) :
      fastActorBuildingShellQuery ? 0 :
      fastActorLocalShellQuery ? Math.min(Number(chunkPlan.maxRoadWays || 0), 320) :
      Number(chunkPlan.maxRoadWays || 0);
    const queryMaxBuildingWays =
      fastActorRoadShellQuery ? 0 :
      fastActorBuildingShellQuery ? Math.min(Math.max(Number(contentPlan.maxBuildingWays || 0), 360), 520) :
      fastActorLocalShellQuery ? Math.min(Number(contentPlan.maxBuildingWays || 0), 140) :
      Number(contentPlan.maxBuildingWays || 0);
    const queryMaxLanduseWays = (fastActorRoadShellQuery || fastActorLocalShellQuery || fastActorBuildingShellQuery) ? 0 : Number(contentPlan.maxLanduseWays || 0);
    const queryMaxWaterwayWays = (fastActorRoadShellQuery || fastActorLocalShellQuery || fastActorBuildingShellQuery) ? 0 : Number(contentPlan.maxWaterwayWays || 0);
    const includeFastLocalBuildings = fastActorLocalShellQuery || contentPlan.includeBuildings || contentPlan.includeLandmarkBuildings;
    const includeLandmarkOnlyBuildings = !includeFastLocalBuildings && contentPlan.includeLandmarkBuildings;
    const roadsBounds =
      forwardRoadCorridorPlan?.bounds ?
        `(${forwardRoadCorridorPlan.bounds.minLat},${forwardRoadCorridorPlan.bounds.minLon},${forwardRoadCorridorPlan.bounds.maxLat},${forwardRoadCorridorPlan.bounds.maxLon})` :
        `(${queryLat - queryRoadRadius},${queryLon - queryRoadRadius},${queryLat + queryRoadRadius},${queryLon + queryRoadRadius})`;
    const buildingBounds =
      `(${queryLat - queryBuildingRadius},${queryLon - queryBuildingRadius},${queryLat + queryBuildingRadius},${queryLon + queryBuildingRadius})`;
    const landuseBounds =
      `(${queryLat - queryLanduseRadius},${queryLon - queryLanduseRadius},${queryLat + queryLanduseRadius},${queryLon + queryLanduseRadius})`;
    const waterBounds =
      `(${queryLat - queryWaterRadius},${queryLon - queryWaterRadius},${queryLat + queryWaterRadius},${queryLon + queryWaterRadius})`;
    const query = `[out:json][timeout:${queryTimeoutSeconds}];(
      ${queryMaxRoadWays > 0 ? `way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|unclassified|living_street|service)$"]${roadsBounds};` : ''}
      ${includeFastLocalBuildings ? `way["building"]${buildingBounds};` : ''}
      ${contentPlan.includeBuildingParts && !fastActorLocalShellQuery ? `way["building:part"]${buildingBounds};` : ''}
      ${includeLandmarkOnlyBuildings ? `way["building"]["name"]${buildingBounds};` : ''}
      ${includeLandmarkOnlyBuildings ? `way["building"]["height"]${buildingBounds};` : ''}
      ${includeLandmarkOnlyBuildings ? `way["building"]["building:levels"]${buildingBounds};` : ''}
      ${queryMaxLanduseWays > 0 ? `way["landuse"]${landuseBounds};` : ''}
      ${queryMaxLanduseWays > 0 ? `way["natural"~"^(wood|forest|scrub|grassland|heath|wetland|sand|beach|bare_rock|scree|shingle|glacier)$"]${landuseBounds};` : ''}
      ${queryMaxLanduseWays > 0 ? `way["leisure"~"^(park|garden|nature_reserve)$"]${landuseBounds};` : ''}
      ${(queryMaxLanduseWays > 0 || queryMaxWaterwayWays > 0) ? `way["natural"="water"]${waterBounds};` : ''}
      ${(queryMaxLanduseWays > 0 || queryMaxWaterwayWays > 0) ? `way["water"]${waterBounds};` : ''}
      ${queryMaxWaterwayWays > 0 ? `way["waterway"~"^(river|stream|canal|drain|ditch)$"]${waterBounds};` : ''}
    );out body;>;out skel qt;`;

    const cacheMeta = {
      lat: Number(queryLat.toFixed(5)),
      lon: Number(queryLon.toFixed(5)),
      roadsRadius: Number((forwardRoadCorridorPlan?.roadRadius || queryRoadRadius).toFixed(5)),
      featureRadius: Math.max(queryBuildingRadius, queryLanduseRadius, queryWaterRadius),
      poiRadius: 0,
      roadsBounds:
        forwardRoadCorridorPlan?.bounds ?
          normalizeOverpassBounds(forwardRoadCorridorPlan.bounds) :
          overpassBoundsFromCenterRadius(queryLat, queryLon, queryRoadRadius),
      featureBounds: overpassBoundsFromCenterRadius(
        queryLat,
        queryLon,
        Math.max(queryBuildingRadius, queryLanduseRadius, queryWaterRadius)
      ),
      poiBounds: null,
      loadLevel: contentPlan.loadLevel,
      continuousWorldInteractive: true,
      queryKind
    };
    const requestTimeoutMs =
      fastActorRoadShellQuery ?
        3400 :
      forwardRoadCorridorPrefetch ?
        3600 :
      fastActorBuildingShellQuery ?
        5400 :
      fastActorLocalShellQuery ?
        3800 :
      localShellPriorityQuery && !buildingContinuityRecovery && String(actorState?.mode || 'drive') === 'drive' ?
        Math.max(chunkPlan.overpassTimeoutMs, actorState?.onRoad === false ? 9000 : 8200) :
        chunkPlan.overpassTimeoutMs;
    const requestMaxTotalLoadMs =
      fastActorRoadShellQuery ?
        4600 :
      forwardRoadCorridorPrefetch ?
        4800 :
      fastActorBuildingShellQuery ?
        7600 :
      fastActorLocalShellQuery ?
        4600 :
      localShellPriorityQuery && !buildingContinuityRecovery && String(actorState?.mode || 'drive') === 'drive' ?
        Math.max(chunkPlan.maxTotalLoadMs, actorState?.onRoad === false ? 12500 : 11000) :
        chunkPlan.maxTotalLoadMs;
    const deadline = performance.now() + requestMaxTotalLoadMs;
    const data = await fetchOverpassJSON(
      query,
      requestTimeoutMs,
      deadline,
      cacheMeta,
      {
        signal: requestAbortController.signal,
        reason: reasonText
      }
    );
    if (requestId !== _continuousWorldInteractiveStreamState.activeRequestId) {
      return getContinuousWorldInteractiveStreamSnapshot();
    }
    if (!continuousWorldInteractiveCanStream()) return getContinuousWorldInteractiveStreamSnapshot();

    const nodes = {};
    data.elements.filter((e) => e.type === 'node').forEach((node) => {
      nodes[node.id] = node;
    });
    const chunkCenterWorld = appCtx.geoToWorld(centerLat, centerLon);
    const chunkCenterDistance = Math.hypot(Number(chunkCenterWorld?.x || 0), Number(chunkCenterWorld?.z || 0));
    const baseGeometryGuards = buildFeatureGeometryGuards(chunkPlan.featureRadius);
    baseGeometryGuards.maxDistanceFromOrigin = Math.max(
      baseGeometryGuards.maxDistanceFromOrigin,
      chunkCenterDistance + Math.max(900, baseGeometryGuards.maxDistanceFromOrigin * 0.8)
    );
    const buildingGeometryGuards = buildBuildingGeometryGuards(baseGeometryGuards);
    const landuseGeometryGuards = buildLanduseGeometryGuards(baseGeometryGuards);
    const waterGeometryGuards = buildWaterGeometryGuards(baseGeometryGuards);

    const allRoadWays = data.elements.filter((e) =>
      e.type === 'way' &&
      DRIVEABLE_HIGHWAY_TYPES.has(String(e.tags?.highway || '').toLowerCase())
    );
    const roadWays = limitWaysByTileBudget(allRoadWays, nodes, {
      globalCap: queryMaxRoadWays,
      basePerTile: 120,
      minPerTile: 40,
      tileDegrees: FEATURE_TILE_DEGREES,
      useRdt: false
    });
    const allBuildingWays = data.elements.filter((e) => e.type === 'way' && (!!e.tags?.building || !!e.tags?.['building:part']));
    const buildingWays = limitWaysByTileBudget(allBuildingWays, nodes, {
      globalCap: queryMaxBuildingWays,
      basePerTile: 260,
      minPerTile: 80,
      tileDegrees: FEATURE_TILE_DEGREES,
      useRdt: false,
      spreadAcrossArea: true,
      coreRatio: 0.5
    });
    const allLanduseWays = data.elements.filter((e) =>
      e.type === 'way' &&
      e.tags && (
        !!e.tags.landuse ||
        e.tags.natural === 'wood' ||
        e.tags.natural === 'forest' ||
        e.tags.natural === 'scrub' ||
        e.tags.natural === 'grassland' ||
        e.tags.natural === 'heath' ||
        e.tags.natural === 'wetland' ||
        e.tags.natural === 'sand' ||
        e.tags.natural === 'beach' ||
        e.tags.natural === 'bare_rock' ||
        e.tags.natural === 'scree' ||
        e.tags.natural === 'shingle' ||
        e.tags.natural === 'glacier' ||
        e.tags.natural === 'water' ||
        !!e.tags.water ||
        e.tags.leisure === 'park' ||
        e.tags.leisure === 'garden' ||
        e.tags.leisure === 'nature_reserve'
      )
    );
    const landuseWays = limitWaysByTileBudget(allLanduseWays, nodes, {
      globalCap: queryMaxLanduseWays,
      basePerTile: 72,
      minPerTile: 18,
      tileDegrees: FEATURE_TILE_DEGREES,
      useRdt: false
    });
    const allWaterwayWays = data.elements.filter((e) =>
      e.type === 'way' &&
      e.tags &&
      !!e.tags.waterway
    );
    const waterwayWays = limitWaysByTileBudget(allWaterwayWays, nodes, {
      globalCap: queryMaxWaterwayWays,
      basePerTile: 26,
      minPerTile: 8,
      tileDegrees: FEATURE_TILE_DEGREES,
      useRdt: false
    });

    const roadMainBatchGroups = new Map();
    const roadSkirtBatchGroups = new Map();
    const { roadMainMaterial, roadSkirtMaterial } = createRoadSurfaceMaterials({
      asphaltTex: appCtx.asphaltTex,
      asphaltNormal: appCtx.asphaltNormal,
      asphaltRoughness: appCtx.asphaltRoughness,
      includeMarkings: false
    });
    const interactiveRoadMutation = {
      bounds: null,
      regionKeys: new Set()
    };

    let addedRoads = 0;
    let addedBuildings = 0;
    let addedLanduseMeshes = 0;
    let addedWaterAreas = 0;
    let addedWaterways = 0;

    roadWays.forEach((way) => {
      const sourceFeatureId = way.id ? String(way.id) : '';
      if (sourceFeatureId && _continuousWorldInteractiveStreamState.loadedRoadIds.has(sourceFeatureId)) return;
      const rawPts = way.nodes.map((id) => nodes[id]).filter(Boolean).map((node) => appCtx.geoToWorld(node.lat, node.lon));
      const pts = sanitizeWorldPathPoints(rawPts, baseGeometryGuards);
      if (pts.length < 2) return;

      const type = way.tags?.highway || 'residential';
      const structureSemantics = classifyStructureSemantics(way.tags || {}, {
        featureKind: 'road',
        subtype: type
      });
      const width =
        type.includes('motorway') ? 16 :
        type.includes('trunk') ? 14 :
        type.includes('primary') ? 12 :
        type.includes('secondary') ? 10 :
        8;
      const limit =
        type.includes('motorway') ? 65 :
        type.includes('trunk') ? 55 :
        type.includes('primary') ? 40 :
        type.includes('secondary') ? 35 :
        25;
      const roadFeature = {
        pts,
        width,
        limit,
        name: way.tags?.name || type.charAt(0).toUpperCase() + type.slice(1),
        sourceFeatureId,
        type,
        sidewalkHint: 'none',
        networkKind: 'road',
        walkable: true,
        driveable: true,
        structureTags: {
          bridge: way.tags?.bridge || '',
          tunnel: way.tags?.tunnel || '',
          layer: way.tags?.layer || '',
          level: way.tags?.level || '',
          placement: way.tags?.placement || '',
          ramp: way.tags?.ramp || '',
          covered: way.tags?.covered || '',
          indoor: way.tags?.indoor || '',
          location: way.tags?.location || '',
          min_height: way.tags?.min_height || '',
          man_made: way.tags?.man_made || ''
        },
        structureSemantics,
        baseStructureSemantics: cloneStructureSemantics(structureSemantics),
        surfaceBias: 0.42,
        lodDepth: 0,
        subdivideMaxDist: getRoadSubdivisionStep(type, 0, getPerfModeValue()),
        bounds: polylineBounds(pts, width * 0.5 + 18),
        continuousWorldInteractiveChunk: true
      };
      roadFeature.continuousWorldRegionKeys = buildContinuousWorldRegionKeysFromPoints(
        roadFeature.pts,
        null,
        roadFeature.bounds
      );
      recordRoadMutationFeature(interactiveRoadMutation, roadFeature);
      appCtx.roads.push(roadFeature);
      updateFeatureSurfaceProfile(roadFeature, terrainYAtWorld, { surfaceBias: 0.42 });

      const hw = width / 2;
      const verts = [];
      const indices = [];
      const { leftEdge, rightEdge } = buildFeatureRibbonEdges(roadFeature, pts, hw, 0, {
        surfaceBias: 0.42
      });
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
        roadFeature.continuousWorldRegionKeys,
        verts,
        indices
      );
      if (typeof appCtx.buildRoadSkirts === 'function' && shouldRenderRoadSkirts(roadFeature)) {
        const skirtData = appCtx.buildRoadSkirts(leftEdge, rightEdge, 3.4);
        if (skirtData?.verts?.length) {
          appendIndexedGeometryToGroupedBatch(
            roadSkirtBatchGroups,
            roadFeature.continuousWorldRegionKeys,
            skirtData.verts,
            skirtData.indices
          );
        }
      }
      if (sourceFeatureId) _continuousWorldInteractiveStreamState.loadedRoadIds.add(sourceFeatureId);
      addedRoads += 1;
    });

    buildGroupedIndexedBatchMeshes({
      scene: appCtx.scene,
      targetList: appCtx.roadMeshes,
      groups: roadMainBatchGroups,
      material: roadMainMaterial,
      renderOrder: 2,
      userData: {
        isRoadBatch: true,
        sharedRoadMaterial: true,
        continuousWorldFeatureFamily: 'roads',
        continuousWorldInteractiveChunk: true
      }
    });
    buildGroupedIndexedBatchMeshes({
      scene: appCtx.scene,
      targetList: appCtx.roadMeshes,
      groups: roadSkirtBatchGroups,
      material: roadSkirtMaterial,
      renderOrder: 1,
      userData: {
        isRoadBatch: true,
        isRoadSkirt: true,
        sharedRoadMaterial: true,
        continuousWorldFeatureFamily: 'roads',
        continuousWorldInteractiveChunk: true
      }
    });
    markRoadMeshSpatialIndexDirty();

    const acceptedInteractiveBuildingsByCell = new Map();
    const suppressedInteractiveParentBuildingIds = buildSuppressedParentBuildingIdSet(
      buildingWays,
      nodes,
      buildingGeometryGuards
    );
    buildingWays.forEach((way) => {
      const sourceBuildingId = way.id ? String(way.id) : '';
      if (sourceBuildingId && _continuousWorldInteractiveStreamState.loadedBuildingIds.has(sourceBuildingId)) return;
      if (!way.tags?.['building:part'] && sourceBuildingId && suppressedInteractiveParentBuildingIds.has(sourceBuildingId)) {
        _continuousWorldInteractiveStreamState.loadedBuildingIds.add(sourceBuildingId);
        return;
      }
      const rawPts = way.nodes.map((id) => nodes[id]).filter(Boolean).map((node) => appCtx.geoToWorld(node.lat, node.lon));
      const pts = sanitizeWorldFootprintPoints(rawPts, FEATURE_MIN_POLYGON_AREA, buildingGeometryGuards);
      if (pts.length < 3) return;

      let centerX = 0;
      let centerZ = 0;
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      let avgElevation = 0;
      pts.forEach((point) => {
        centerX += point.x;
        centerZ += point.z;
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minZ = Math.min(minZ, point.z);
        maxZ = Math.max(maxZ, point.z);
        avgElevation += appCtx.elevationWorldYAtWorldXZ(point.x, point.z);
      });
      centerX /= pts.length;
      centerZ /= pts.length;
      avgElevation /= pts.length;

      const buildingType = way.tags?.building || 'yes';
      const footprintArea = Math.abs(signedPolygonAreaXZ(pts));
      const buildingSemantics = interpretBuildingSemantics(way.tags || {}, {
        fallbackHeight: 9.5,
        fallbackPartHeight: 4,
        footprintArea,
        footprintWidth: Math.max(0, maxX - minX),
        footprintDepth: Math.max(0, maxZ - minZ)
      });
      const height = buildingSemantics.heightMeters;
      const structureSemantics = classifyStructureSemantics(way.tags || {}, {
        featureKind: 'building',
        subtype: buildingType
      });
      const regionKeys = buildContinuousWorldRegionKeysFromPoints(pts, null, {
        minX,
        maxX,
        minZ,
        maxZ
      });
      const isImportantBuilding = continuousWorldInteractiveBuildingIsImportant(way.tags || {}, buildingSemantics, footprintArea, height);
      const denseCellKey = `${Math.floor(centerX / 72)},${Math.floor(centerZ / 72)}`;
      const acceptedInCell = acceptedInteractiveBuildingsByCell.get(denseCellKey) || 0;
      const boostedDenseBuildingShell =
        fastActorBuildingShellQuery ||
        reasonText === 'actor_building_gap' ||
        reasonText.startsWith('building_continuity_');
      const denseCellCap =
        actorState?.mode === 'walk' ? (boostedDenseBuildingShell ? 28 : 22) :
        actorState?.mode === 'drive' ? (boostedDenseBuildingShell ? 26 : 16) :
        actorState?.mode === 'drone' ? (boostedDenseBuildingShell ? 14 : 8) :
        5;
      if (acceptedInCell >= denseCellCap && !isImportantBuilding) return;
      const corridorNearest =
        typeof appCtx.findNearestRoad === 'function' ?
          appCtx.findNearestRoad(centerX, centerZ, { maxVerticalDelta: 60 }) :
          null;
      const corridorHalfWidth = corridorNearest?.road?.width ? corridorNearest.road.width * 0.5 : 0;
      const roadProjectionInsideFootprint =
        corridorNearest?.pt &&
        Number.isFinite(corridorNearest.pt.x) &&
        Number.isFinite(corridorNearest.pt.z) &&
        pointInPolygon(corridorNearest.pt.x, corridorNearest.pt.z, pts);
      if (
        !isImportantBuilding &&
        corridorHalfWidth > 0 &&
        Number.isFinite(corridorNearest?.dist) &&
        corridorNearest.dist <= Math.max(3.5, corridorHalfWidth + 1.25) &&
        roadProjectionInsideFootprint
      ) {
        return;
      }
      acceptedInteractiveBuildingsByCell.set(denseCellKey, acceptedInCell + 1);
      const actorX = Number(actorState?.x || centerX);
      const actorZ = Number(actorState?.z || centerZ);
      const actorDistance = Math.hypot(centerX - actorX, centerZ - actorZ);
      const colliderRadius =
        actorState?.mode === 'boat' || actorState?.mode === 'ocean' || actorState?.mode === 'drone' ?
          0 :
        actorState?.mode === 'walk' ?
          CONTINUOUS_WORLD_INTERACTIVE_STREAM_WALK_COLLIDER_RADIUS :
          CONTINUOUS_WORLD_INTERACTIVE_STREAM_COLLIDER_RADIUS;
      const detailRadius =
        actorState?.mode === 'drone' ?
          (boostedDenseBuildingShell ? 460 : 340) :
        actorState?.mode === 'walk' ?
          (boostedDenseBuildingShell ? 320 : 240) :
        actorState?.mode === 'drive' ?
          (boostedDenseBuildingShell ? 280 : 220) :
          180;
      const preferDetailedInteractiveBuildings =
        !!appCtx.customLocTransient ||
        fastActorBuildingShellQuery ||
        reasonText === 'actor_building_gap' ||
        reasonText.startsWith('building_continuity_');
      const renderDetailedBuilding =
        isImportantBuilding ||
        (preferDetailedInteractiveBuildings && actorDistance <= detailRadius);
      if (sourceBuildingId && renderDetailedBuilding) {
        pruneBaseProxyBuildingShells(sourceBuildingId, 'interactive_building_detail_upgrade');
      }
      if (buildingSemantics?.roofLike === true && buildingSemantics?.intentionalVerticalStructure !== true) {
        return;
      }

      const structureBaseOffset = Number.isFinite(buildingSemantics?.baseOffsetMeters) ?
        buildingSemantics.baseOffsetMeters :
        0;
      const baseElevation = avgElevation + structureBaseOffset;
      const buildingSeed =
        Number.isFinite(Number(way.id)) ?
          (Number(way.id) >>> 0) :
          ((Math.round(centerX * 31) ^ Math.round(centerZ * 17)) >>> 0);
      const mesh = renderDetailedBuilding ?
        createDetailedBuildingMesh(
          pts,
          height,
          baseElevation,
          {
            buildingType,
            buildingSeed,
            baseColor: continuousWorldInteractiveBuildingColor(buildingType),
            buildingSemantics,
            structureSemantics
          }
        ) :
        createMidLodBuildingMesh(
          pts,
          height,
          baseElevation,
          continuousWorldInteractiveBuildingColor(buildingType),
          {
            buildingType,
            buildingSeed
          }
        );
      if (mesh) {
        if (isImportantBuilding || actorDistance <= colliderRadius) {
          registerBuildingCollision(pts, height, {
            detail: isImportantBuilding ? 'full' : 'bbox',
            centerX,
            centerZ,
            sourceBuildingId,
            name: way.tags?.name || '',
            buildingType,
            buildingPartKind: buildingSemantics.partKind || 'full',
            collisionKind: buildingSemantics.collisionKind || 'solid',
            allowsPassageBelow: buildingSemantics.allowsPassageBelow === true,
            levels: Number.isFinite(Number.parseFloat(way.tags?.['building:levels'])) ? Number.parseFloat(way.tags['building:levels']) : null,
            minLevels: Number.isFinite(Number.parseFloat(way.tags?.['building:min_level'])) ? Number.parseFloat(way.tags['building:min_level']) : null,
            baseY: avgElevation,
            buildingSemantics,
            structureSemantics,
            continuousWorldRegionKeys: regionKeys,
            continuousWorldInteractiveChunk: true
          });
        }
        mesh.userData.sourceBuildingId = sourceBuildingId;
        mesh.userData.buildingType = buildingType;
        mesh.userData.continuousWorldInteractiveChunk = true;
        mesh.userData.continuousWorldRegionKeys = regionKeys.slice();
        mesh.userData.continuousWorldRegionCount = regionKeys.length;
        mesh.userData.continuousWorldPrimaryRegionKey = String(regionKeys[0] || regionKey || '');
        mesh.userData.buildingSemantics = buildingSemantics;
        mesh.userData.structureSemantics = structureSemantics;
        appCtx.scene.add(mesh);
        appCtx.buildingMeshes.push(mesh);

      }

      if (sourceBuildingId) _continuousWorldInteractiveStreamState.loadedBuildingIds.add(sourceBuildingId);
      addedBuildings += 1;
    });

    landuseWays.forEach((way) => {
      const sourceFeatureId = way.id ? String(way.id) : '';
      if (sourceFeatureId && _continuousWorldInteractiveStreamState.loadedLanduseIds.has(sourceFeatureId)) return;
      const landuseType = classifyLanduseType(way.tags);
      if (!landuseType) return;
      const rawPts = way.nodes.map((id) => nodes[id]).filter(Boolean).map((node) => appCtx.geoToWorld(node.lat, node.lon));
      const guard = landuseType === 'water' ? waterGeometryGuards : landuseGeometryGuards;
      cacheContinuousWorldSurfaceFeatureHint(rawPts, landuseType, guard, sourceFeatureId);
      const addResult = addContinuousWorldInteractiveLandusePolygon(
        rawPts,
        landuseType,
        sourceFeatureId,
        [],
        guard
      );
      if (!addResult?.addedMesh) return;
      if (sourceFeatureId) _continuousWorldInteractiveStreamState.loadedLanduseIds.add(sourceFeatureId);
      addedLanduseMeshes += 1;
      if (addResult.addedWater) addedWaterAreas += 1;
    });

    waterwayWays.forEach((way) => {
      const sourceFeatureId = way.id ? String(way.id) : '';
      if (sourceFeatureId && _continuousWorldInteractiveStreamState.loadedWaterwayIds.has(sourceFeatureId)) return;
      const rawPts = way.nodes.map((id) => nodes[id]).filter(Boolean).map((node) => appCtx.geoToWorld(node.lat, node.lon));
      const pts = sanitizeWorldPathPoints(rawPts, waterGeometryGuards);
      if (pts.length < 2) return;
      const added = addContinuousWorldInteractiveWaterwayRibbon(pts, {
        ...(way.tags || {}),
        sourceFeatureId
      });
      if (!added) return;
      if (sourceFeatureId) _continuousWorldInteractiveStreamState.loadedWaterwayIds.add(sourceFeatureId);
      addedWaterways += 1;
    });

    if (addedLanduseMeshes > 0 || addedWaterways > 0) {
      batchLanduseMeshes();
    }

    const coverageKey = [
      Number(useRegionCenteredQuery ? queryLat : centerLat).toFixed(5),
      Number(useRegionCenteredQuery ? queryLon : centerLon).toFixed(5),
      Number(chunkPlan.featureRadius).toFixed(5)
    ].join(':');
    const coverageRegionKeys = continuousWorldInteractiveCoverageRegionKeysForGeoQuery(
      useRegionCenteredQuery ? queryLat : resolvedCenterLat,
      useRegionCenteredQuery ? queryLon : resolvedCenterLon,
      Math.max(queryRoadRadius, queryBuildingRadius, queryLanduseRadius, queryWaterRadius),
      runtimeSnapshot
    );
    const effectiveCoverageRegionKeys =
      forwardRoadCorridorPlan?.regionKeys?.length ?
        forwardRoadCorridorPlan.regionKeys.slice() :
        coverageRegionKeys;
    _continuousWorldInteractiveStreamState.coverage.push({
      key: coverageKey,
      regionKey,
      regionKeys: effectiveCoverageRegionKeys,
      lat: useRegionCenteredQuery ? queryLat : resolvedCenterLat,
      lon: useRegionCenteredQuery ? queryLon : resolvedCenterLon,
      roadRadius: queryRoadRadius,
      featureRadius: Math.max(queryBuildingRadius, queryLanduseRadius, queryWaterRadius),
      addedRoads,
      addedBuildings,
      addedLanduseMeshes,
      addedWaterAreas,
      addedWaterways,
      loadLevel: contentPlan.loadLevel,
      reason,
      at: Date.now()
    });
    if (_continuousWorldInteractiveStreamState.coverage.length > CONTINUOUS_WORLD_INTERACTIVE_STREAM_MAX_COVERAGE) {
      _continuousWorldInteractiveStreamState.coverage.splice(
        0,
        _continuousWorldInteractiveStreamState.coverage.length - CONTINUOUS_WORLD_INTERACTIVE_STREAM_MAX_COVERAGE
      );
    }
    _continuousWorldInteractiveStreamState.totalAddedRoads += addedRoads;
    _continuousWorldInteractiveStreamState.totalAddedBuildings += addedBuildings;
    _continuousWorldInteractiveStreamState.totalAddedLanduseMeshes += addedLanduseMeshes;
    _continuousWorldInteractiveStreamState.totalAddedWaterAreas += addedWaterAreas;
    _continuousWorldInteractiveStreamState.totalAddedWaterways += addedWaterways;
    _continuousWorldInteractiveStreamState.totalLoads += 1;
    _continuousWorldInteractiveStreamState.lastLoadAt = Date.now();
    _continuousWorldInteractiveStreamState.lastLoadReason = reason;
    markWorldLodDirty(`interactive_load:${reason}`);
    const surfaceSyncPolicy = continuousWorldInteractiveSurfaceSyncPolicy(actorState, regionKey, runtimeSnapshot, reason);
    _continuousWorldInteractiveStreamState.lastSurfaceSyncPolicy = surfaceSyncPolicy.policy;

    const eviction = evictContinuousWorldInteractiveContent(runtimeSnapshot, regionKey, actorState);
    if (addedRoads > 0) {
      scheduleTraversalNetworksRebuild('continuous_world_stream', 520);
      const surfaceSyncSource = String(surfaceSyncPolicy.source || 'continuous_world_stream_followup');
      if (typeof appCtx.primeRoadSurfaceSyncState === 'function') {
        appCtx.primeRoadSurfaceSyncState({
          clearHeightCache: false,
          preserveActiveTask: true,
          mutationType: 'append',
          source: surfaceSyncSource,
          bounds: interactiveRoadMutation.bounds,
          regionKeys: Array.from(interactiveRoadMutation.regionKeys || [])
        });
      }
      if (typeof appCtx.invalidateRoadCache === 'function') appCtx.invalidateRoadCache();
      if (typeof appCtx.requestWorldSurfaceSync === 'function' && surfaceSyncPolicy.request) {
        appCtx.requestWorldSurfaceSync(
          surfaceSyncPolicy.force ?
            { force: true, source: surfaceSyncSource } :
            { deferOnly: true, source: surfaceSyncSource }
        );
        if (surfaceSyncPolicy.force) _continuousWorldInteractiveStreamState.forcedSurfaceSyncLoads += 1;
        else _continuousWorldInteractiveStreamState.deferredSurfaceSyncLoads += 1;
      } else if (addedRoads > 0) {
        _continuousWorldInteractiveStreamState.skippedSurfaceSyncLoads += 1;
      }
      if (actorState.mode === 'drive' && typeof appCtx.resolveSafeWorldSpawn === 'function') {
        const actor = currentMapReferenceGeoPosition();
        const spawn = resolveSafeWorldSpawn(actor.x, actor.z, {
          mode: 'drive',
          angle: finiteNumberOr(appCtx.car?.angle, 0),
          maxRoadDistance: 220,
          strictMaxDistance: true,
          source: String(surfaceSyncPolicy?.source || 'continuous_world_stream_followup')
        });
        if (spawn?.valid && !appCtx.car?.onRoad) {
          applyResolvedWorldSpawn(spawn, { mode: 'drive', syncCar: true, syncWalker: false });
        }
        const roadRecoveryShell =
          actorState?.onRoad === false &&
          addedBuildings <= 0 &&
          (reason === 'actor_drift' || reason === 'main_loop');
        scheduleContinuousWorldInteractiveDriveRecovery({
          attempts: roadRecoveryShell ? 6 : 4,
          delayMs: surfaceSyncPolicy.force ? 180 : 280,
          maxRoadDistance: roadRecoveryShell ? 320 : 240,
          shellAfterRecovery: roadRecoveryShell,
          source: 'continuous_world_stream_followup'
        });
      }
    }
    if (
      actorState.mode === 'drive' &&
      addedRoads > 0 &&
      !fastActorBuildingShellQuery &&
      !continuousWorldInteractiveShouldDeferDriveBuildingShell(actorState, reasonText) &&
      Number.isFinite(actorState?.x) &&
      Number.isFinite(actorState?.z)
    ) {
      const driveBuildingCfg = ACTOR_BUILDING_SHELL_CONFIG.drive;
      const nearbyVisibleBuildings = countVisibleDetailedBuildingMeshesNearWorldPoint(
        actorState.x,
        actorState.z,
        driveBuildingCfg?.visibleRadius || 360
      );
      const nearbyRoadFeatures = countDriveableRoadFeaturesNearWorldPoint(
        actorState.x,
        actorState.z,
        Math.max(260, driveBuildingCfg?.visibleRadius || 360)
      );
      if (
        nearbyRoadFeatures >= (driveBuildingCfg?.minRoadFeatures || 10) &&
        nearbyVisibleBuildings < (driveBuildingCfg?.minVisibleBuildings || 18)
      ) {
        const severeBuildingShellGap =
          nearbyVisibleBuildings < (driveBuildingCfg?.minVisibleBuildings || 18);
        const followupReason =
          severeBuildingShellGap || reasonText === 'actor_visible_road_gap' ?
            'building_continuity_drive' :
            'actor_building_gap';
        window.setTimeout(() => {
          if (!continuousWorldInteractiveCanStream(followupReason)) return;
          const actorGeoPosition = currentMapReferenceGeoPosition();
          if (!Number.isFinite(actorGeoPosition?.lat) || !Number.isFinite(actorGeoPosition?.lon)) return;
          void loadContinuousWorldInteractiveChunk(actorGeoPosition.lat, actorGeoPosition.lon, followupReason);
        }, 140);
      }
    }
    if (typeof updateWorldLod === 'function') updateWorldLod(true);
    appCtx.setPerfLiveStat?.('continuousWorldInteractiveStream', {
      loads: _continuousWorldInteractiveStreamState.totalLoads,
      roads: _continuousWorldInteractiveStreamState.totalAddedRoads,
      buildings: _continuousWorldInteractiveStreamState.totalAddedBuildings,
      landuse: _continuousWorldInteractiveStreamState.totalAddedLanduseMeshes,
      waterways: _continuousWorldInteractiveStreamState.totalAddedWaterways,
      loadMs: Math.round(performance.now() - loadStartedAt),
      loadLevel: contentPlan.loadLevel,
      surfaceSyncPolicy: _continuousWorldInteractiveStreamState.lastSurfaceSyncPolicy,
      forcedSurfaceSyncLoads: _continuousWorldInteractiveStreamState.forcedSurfaceSyncLoads,
      deferredSurfaceSyncLoads: _continuousWorldInteractiveStreamState.deferredSurfaceSyncLoads,
      skippedSurfaceSyncLoads: _continuousWorldInteractiveStreamState.skippedSurfaceSyncLoads,
      evictedMeshes: Number(eviction?.removedMeshes || 0)
    });
  } catch (error) {
    if (requestId === _continuousWorldInteractiveStreamState.activeRequestId) {
      _continuousWorldInteractiveStreamState.lastError = error?.message || String(error);
    }
  } finally {
    if (requestId === _continuousWorldInteractiveStreamState.activeRequestId) {
      _continuousWorldInteractiveStreamState.pending = false;
      _continuousWorldInteractiveStreamState.pendingStartedAt = 0;
      _continuousWorldInteractiveStreamState.pendingQueryLat = NaN;
      _continuousWorldInteractiveStreamState.pendingQueryLon = NaN;
      _continuousWorldInteractiveStreamState.pendingRegionKey = null;
      _continuousWorldInteractiveStreamState.abortController = null;
    } else if (_continuousWorldInteractiveStreamState.abortController === requestAbortController) {
      _continuousWorldInteractiveStreamState.abortController = null;
    }
  }
  return getContinuousWorldInteractiveStreamSnapshot();
}

function kickContinuousWorldInteractiveStreaming(reason = 'runtime_tick') {
  if (!continuousWorldInteractiveCanStream(reason)) return getContinuousWorldInteractiveStreamSnapshot();
  if (!_continuousWorldInteractiveStreamState.autoKickEnabled) return getContinuousWorldInteractiveStreamSnapshot();
  const actorState = continuousWorldInteractiveActorMotionState();
  const reasonText = String(reason || 'runtime_tick');
  const now = performance.now();
  if (
    !_continuousWorldInteractiveStreamState.pending &&
    continuousWorldInteractiveReasonIsRoutine(reasonText) &&
    (now - _continuousWorldInteractiveStreamState.lastKickAt) < continuousWorldInteractiveStreamIntervalMs(actorState)
  ) {
    return getContinuousWorldInteractiveStreamSnapshot();
  }
  if (continuousWorldInteractiveStartupLockActive()) {
    if (
      continuousWorldStartupLocalShellEnabled() &&
      !_continuousWorldInteractiveStreamState.pending &&
      !continuousWorldInteractiveStartupLocalShellCovered(actorState)
    ) {
      const actorGeo = currentMapReferenceGeoPosition();
      if (Number.isFinite(actorGeo?.lat) && Number.isFinite(actorGeo?.lon)) {
        void loadContinuousWorldInteractiveChunk(actorGeo.lat, actorGeo.lon, 'startup_local_shell');
      }
    }
    return getContinuousWorldInteractiveStreamSnapshot();
  }
  const roadShellGap = continuousWorldInteractiveNeedsRoadShellRecovery(actorState);
  const buildingShellGap = continuousWorldInteractiveNeedsBuildingShellRecovery(actorState);
  const actorGeo = currentMapReferenceGeoPosition();
  const actorRegionKey =
    Number.isFinite(actorGeo?.lat) && Number.isFinite(actorGeo?.lon) ?
      continuousWorldInteractiveRegionKeyFromLatLon(actorGeo.lat, actorGeo.lon, null) :
      null;
  if (_continuousWorldInteractiveStreamState.pending) {
    const pendingAgeMs = Date.now() - Number(_continuousWorldInteractiveStreamState.pendingStartedAt || 0);
    if (
      pendingAgeMs < 420 &&
      !roadShellGap &&
      !buildingShellGap &&
      !continuousWorldInteractiveReasonIsForwardRoadCorridor(reasonText)
    ) {
      return getContinuousWorldInteractiveStreamSnapshot();
    }
    const pendingReason = String(_continuousWorldInteractiveStreamState.lastLoadReason || '');
    const pendingForwardRoadCorridor = continuousWorldInteractiveReasonIsForwardRoadCorridor(pendingReason);
    const pendingQueryLat = Number(_continuousWorldInteractiveStreamState.pendingQueryLat);
    const pendingQueryLon = Number(_continuousWorldInteractiveStreamState.pendingQueryLon);
    const pendingStartupLocalShell = pendingReason === 'startup_local_shell';
    const pendingPrefetch = pendingReason.startsWith('region_prefetch:');
    const pendingActorScoped =
      pendingReason === 'main_loop' ||
      pendingReason === 'actor_drift' ||
      pendingReason === 'startup_roads_ready' ||
      pendingReason === 'actor_visible_road_gap' ||
      pendingReason === 'actor_building_gap' ||
      continuousWorldInteractiveReasonIsForwardRoadCorridor(pendingReason) ||
      pendingReason.startsWith('building_continuity_');
    const pendingSameActorRegion =
      pendingActorScoped &&
      actorRegionKey &&
      _continuousWorldInteractiveStreamState.pendingRegionKey &&
      actorRegionKey === _continuousWorldInteractiveStreamState.pendingRegionKey;
    const pendingCriticalWithoutRegion =
      pendingActorScoped &&
      !_continuousWorldInteractiveStreamState.pendingRegionKey;
    const actorPriorityKick = !reasonText.startsWith('region_prefetch:') && reasonText !== 'startup_local_shell';
    const pendingMovedOffRegion =
      pendingActorScoped &&
      !pendingForwardRoadCorridor &&
      actorRegionKey &&
      _continuousWorldInteractiveStreamState.pendingRegionKey &&
      actorRegionKey !== _continuousWorldInteractiveStreamState.pendingRegionKey;
    const pendingActorDistanceWorldUnits =
      Number.isFinite(actorGeo?.lat) &&
      Number.isFinite(actorGeo?.lon) &&
      Number.isFinite(pendingQueryLat) &&
      Number.isFinite(pendingQueryLon) ?
        continuousWorldGeoDistanceWorldUnits(actorGeo.lat, actorGeo.lon, pendingQueryLat, pendingQueryLon) :
        NaN;
    const pendingDriftThresholdWorldUnits =
      pendingForwardRoadCorridor ?
        520 :
      actorState?.mode === 'drive' ?
        (roadShellGap ? 150 : buildingShellGap ? 180 : 220) :
      actorState?.mode === 'drone' ?
        260 :
      actorState?.mode === 'walk' ?
        120 :
        180;
    const pendingMovedBeyondQueryCenter =
      pendingActorScoped &&
      Number.isFinite(pendingActorDistanceWorldUnits) &&
      pendingActorDistanceWorldUnits >= pendingDriftThresholdWorldUnits;
    const stalePendingThresholdMs =
      actorState?.mode === 'drive' && actorState?.onRoad === false ? 5200 :
      actorState?.mode === 'drive' ? 7600 :
      actorState?.mode === 'walk' ? 9000 :
      8200;
    const priorityPreemptThresholdMs =
      pendingForwardRoadCorridor ?
        2600 :
      actorState?.mode === 'drive' && actorState?.onRoad === false ? 900 :
      actorState?.mode === 'drive' ? 1200 :
      actorState?.mode === 'walk' ? 1500 :
      1400;
    const actorGapPriority = roadShellGap || buildingShellGap;
    const shouldResetPending =
      (pendingStartupLocalShell && !continuousWorldStartupLocalShellEnabled()) ||
      (!pendingSameActorRegion && pendingAgeMs >= stalePendingThresholdMs) ||
      (pendingSameActorRegion && pendingAgeMs >= 15000) ||
      (pendingForwardRoadCorridor && roadShellGap && pendingAgeMs >= 700) ||
      (roadShellGap && pendingSameActorRegion && pendingReason === 'actor_visible_road_gap' && pendingAgeMs >= 2400) ||
      (actorGapPriority && pendingCriticalWithoutRegion && pendingAgeMs >= 700) ||
      (pendingMovedOffRegion && pendingAgeMs >= 700) ||
      (!pendingForwardRoadCorridor && pendingMovedBeyondQueryCenter && pendingAgeMs >= priorityPreemptThresholdMs) ||
      (
        actorGapPriority &&
        (pendingPrefetch || (continuousWorldInteractiveReasonIsForwardRoadCorridor(pendingReason) && !pendingForwardRoadCorridor)) &&
        pendingAgeMs >= 350
      ) ||
      (
        actorGapPriority &&
        pendingActorScoped &&
        pendingReason !== 'actor_visible_road_gap' &&
        pendingReason !== 'actor_building_gap' &&
        !pendingForwardRoadCorridor &&
        !pendingReason.startsWith('building_continuity_') &&
        pendingAgeMs >= 900
      ) ||
      (actorPriorityKick && (pendingStartupLocalShell || pendingPrefetch) && pendingAgeMs >= priorityPreemptThresholdMs);
    if (shouldResetPending) {
      if (_continuousWorldInteractiveStreamState.abortController) {
        try {
          _continuousWorldInteractiveStreamState.abortController.abort();
        } catch {}
        _continuousWorldInteractiveStreamState.abortController = null;
      }
      _continuousWorldInteractiveStreamState.pending = false;
      _continuousWorldInteractiveStreamState.pendingStartedAt = 0;
      _continuousWorldInteractiveStreamState.pendingQueryLat = NaN;
      _continuousWorldInteractiveStreamState.pendingQueryLon = NaN;
      _continuousWorldInteractiveStreamState.pendingRegionKey = null;
      _continuousWorldInteractiveStreamState.activeRequestId =
        Number(_continuousWorldInteractiveStreamState.activeRequestId || 0) + 1;
      _continuousWorldInteractiveStreamState.lastError = `stale_pending_reset:${_continuousWorldInteractiveStreamState.lastLoadReason || 'unknown'}`;
    }
  }
  const runtimeSnapshot = appCtx.getContinuousWorldRuntimeSnapshot?.();
  const forwardCorridorCoverage = continuousWorldForwardRoadCorridorCoverageState(actorState, runtimeSnapshot);
  const prefetchTarget = continuousWorldInteractiveSelectPrefetchTarget(actorGeo, runtimeSnapshot, actorState);
  const corridorPrefetchTarget = prefetchTarget?.corridorRoadPriority ? prefetchTarget : null;
  const actorMostlyIdle = continuousWorldInteractiveActorMostlyIdle(actorState);
  const deferDriveBuildingShell = continuousWorldInteractiveShouldDeferDriveBuildingShell(actorState, reason);
  const forwardCorridorNeedsRoads =
    actorState?.mode === 'drive' &&
    Math.abs(Number(actorState?.speed || 0)) >= 4 &&
    forwardCorridorCoverage.totalKeys > 0 &&
    forwardCorridorCoverage.coveredKeys < forwardCorridorCoverage.minCoveredKeys;
  const terrainSnapshot =
    typeof appCtx.getTerrainStreamingSnapshot === 'function' ?
      appCtx.getTerrainStreamingSnapshot() :
      null;
  if (
    !_continuousWorldInteractiveStreamState.pending &&
    continuousWorldInteractiveShouldYieldToSurfaceSync(
      actorState,
      terrainSnapshot,
      reasonText,
      roadShellGap,
      buildingShellGap,
      forwardCorridorNeedsRoads
    )
  ) {
    return getContinuousWorldInteractiveStreamSnapshot();
  }
  if (now - _continuousWorldInteractiveStreamState.lastKickAt < continuousWorldInteractiveStreamIntervalMs(actorState)) {
    return getContinuousWorldInteractiveStreamSnapshot();
  }
  _continuousWorldInteractiveStreamState.lastKickAt = now;

  if (!_continuousWorldInteractiveStreamState.seededSignature || _continuousWorldInteractiveStreamState.coverage.length === 0) {
    seedContinuousWorldInteractiveStreamState();
  }

  const chunkPlan = continuousWorldInteractiveChunkPlan();
  if (!Number.isFinite(actorGeo?.lat) || !Number.isFinite(actorGeo?.lon) || !chunkPlan) {
    return getContinuousWorldInteractiveStreamSnapshot();
  }
  const effectiveReason =
    roadShellGap ?
      'actor_visible_road_gap' :
    buildingShellGap ?
      (
        actorState?.mode === 'drive' && deferDriveBuildingShell ?
          reason :
        actorState?.mode === 'drive' ?
          'building_continuity_drive' :
          'actor_building_gap'
      ) :
    reason;
  const desiredLoadLevel = continuousWorldInteractiveDesiredLoadLevel(actorState, effectiveReason);
  if (
    roadShellGap &&
    actorRegionKey &&
    (
      actorRegionKey !== _lastActorVisibleRoadGapRegionKey ||
      Date.now() - _lastActorVisibleRoadGapLoadAt >= 2500
    )
  ) {
    _lastActorVisibleRoadGapRegionKey = actorRegionKey;
    _lastActorVisibleRoadGapLoadAt = Date.now();
    void loadContinuousWorldInteractiveChunk(
      actorGeo.lat,
      actorGeo.lon,
      'actor_visible_road_gap'
    );
    return getContinuousWorldInteractiveStreamSnapshot();
  }
  if (forwardCorridorNeedsRoads && corridorPrefetchTarget) {
    void loadContinuousWorldInteractiveChunk(
      corridorPrefetchTarget.lat,
      corridorPrefetchTarget.lon,
      corridorPrefetchTarget.loadReason || 'forward_road_corridor'
    );
    return getContinuousWorldInteractiveStreamSnapshot();
  }
  if (
    buildingShellGap &&
    !deferDriveBuildingShell &&
    !forwardCorridorNeedsRoads &&
    actorRegionKey &&
    (
      actorRegionKey !== _lastActorBuildingGapRegionKey ||
      Date.now() - _lastActorBuildingGapLoadAt >= 1800
    )
  ) {
    _lastActorBuildingGapRegionKey = actorRegionKey;
    _lastActorBuildingGapLoadAt = Date.now();
    const nearbyRoadFeatures = countDriveableRoadFeaturesNearWorldPoint(
      actorState?.x,
      actorState?.z,
      Math.max(260, ACTOR_BUILDING_SHELL_CONFIG.drive?.visibleRadius || 360)
    );
    const nearbyVisibleBuildings = countVisibleBuildingMeshesNearWorldPoint(
      actorState?.x,
      actorState?.z,
      ACTOR_BUILDING_SHELL_CONFIG.drive?.visibleRadius || 360
    );
    const strongerDriveContinuityReason =
      actorState?.mode === 'drive' &&
      nearbyRoadFeatures >= (ACTOR_BUILDING_SHELL_CONFIG.drive?.minRoadFeatures || 10) &&
      nearbyVisibleBuildings < (ACTOR_BUILDING_SHELL_CONFIG.drive?.minVisibleBuildings || 18);
    void loadContinuousWorldInteractiveChunk(
      actorGeo.lat,
      actorGeo.lon,
      strongerDriveContinuityReason ? 'building_continuity_drive' : 'actor_building_gap'
    );
    return getContinuousWorldInteractiveStreamSnapshot();
  }
  if (continuousWorldInteractiveNeedsLoad(actorGeo, chunkPlan, desiredLoadLevel, runtimeSnapshot, effectiveReason)) {
    void loadContinuousWorldInteractiveChunk(actorGeo.lat, actorGeo.lon, effectiveReason);
    return getContinuousWorldInteractiveStreamSnapshot();
  }
  if (_continuousWorldInteractiveStreamState.totalLoads === 0 && _continuousWorldInteractiveStreamState.coverage.length <= 1) {
    return getContinuousWorldInteractiveStreamSnapshot();
  }
  if (prefetchTarget) {
    const suppressIdlePrefetch =
      actorMostlyIdle &&
      !roadShellGap &&
      !buildingShellGap &&
      !forwardCorridorNeedsRoads &&
      _continuousWorldInteractiveStreamState.totalLoads > 0;
    if (suppressIdlePrefetch) {
      return getContinuousWorldInteractiveStreamSnapshot();
    }
    void loadContinuousWorldInteractiveChunk(
      prefetchTarget.lat,
      prefetchTarget.lon,
      prefetchTarget.loadReason || `region_prefetch:${prefetchTarget.band}:${prefetchTarget.key}`
    );
    return getContinuousWorldInteractiveStreamSnapshot();
  }
  return getContinuousWorldInteractiveStreamSnapshot();
}

function finiteNumberOr(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function terrainYAtWorld(x, z) {
  if (appCtx.onMoon && appCtx.moonSurface) {
    appCtx.moonSurface.updateMatrixWorld(true);
    const raycaster = typeof appCtx._getPhysRaycaster === 'function' ? appCtx._getPhysRaycaster() : null;
    if (raycaster && appCtx._physRayStart && appCtx._physRayDir) {
      appCtx._physRayStart.set(x, 1200, z);
      raycaster.set(appCtx._physRayStart, appCtx._physRayDir);
      const hits = raycaster.intersectObject(appCtx.moonSurface, false);
      if (hits.length > 0 && Number.isFinite(hits[0]?.point?.y)) return hits[0].point.y;
    }
  }

  const sample = typeof appCtx.terrainMeshHeightAt === 'function' ?
    appCtx.terrainMeshHeightAt(x, z) :
    typeof appCtx.elevationWorldYAtWorldXZ === 'function' ?
      appCtx.elevationWorldYAtWorldXZ(x, z) :
      0;
  return finiteNumberOr(sample, 0);
}

function driveCenterYAtWorld(x, z, preferRoad = false) {
  if (appCtx.onMoon) return terrainYAtWorld(x, z) + 1.2;
  if (typeof appCtx.GroundHeight !== 'undefined' &&
      appCtx.GroundHeight &&
      typeof appCtx.GroundHeight.carCenterY === 'function') {
    return finiteNumberOr(appCtx.GroundHeight.carCenterY(x, z, preferRoad, 1.2), terrainYAtWorld(x, z) + 1.2);
  }
  return terrainYAtWorld(x, z) + 1.2;
}

function walkBaseYAtWorld(x, z) {
  if (appCtx.onMoon) return terrainYAtWorld(x, z);
  if (typeof appCtx.GroundHeight !== 'undefined' &&
      appCtx.GroundHeight &&
      typeof appCtx.GroundHeight.walkSurfaceY === 'function') {
    return finiteNumberOr(appCtx.GroundHeight.walkSurfaceY(x, z), terrainYAtWorld(x, z));
  }
  return terrainYAtWorld(x, z);
}

function spawnRoadPenalty(type) {
  if (!type) return 0;
  if (type.includes('motorway') || type.includes('trunk')) return 120;
  if (type.includes('primary')) return 40;
  if (type.includes('secondary')) return 20;
  if (type.includes('service')) return 12;
  return 0;
}

function spawnSurfacePenalty(feature, mode = 'drive') {
  if (!feature) return 0;
  const kind = traversalFeatureKind(feature);
  if (kind === 'road') return spawnRoadPenalty(String(feature.type || ''));
  if (ENABLE_LINEAR_FEATURES && mode === 'walk') {
    if (kind === 'footway') return 0;
    if (kind === 'cycleway') return 4;
    if (kind === 'railway') return 16;
  }
  return 10;
}

function findSpawnOverheadConflict(feature, x, z, actorFeetY = NaN) {
  if (!feature || !Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(actorFeetY)) return null;
  const focusSemantics = feature?.structureSemantics || null;
  if (focusSemantics?.terrainMode === 'elevated') return null;

  const roadFeatures = runtimeRoadFeatures();
  let best = null;
  for (let i = 0; i < roadFeatures.length; i++) {
    const other = roadFeatures[i];
    if (!other || other === feature) continue;
    const semantics = other.structureSemantics || null;
    if (!semantics?.gradeSeparated || semantics.terrainMode !== 'elevated') continue;
    if (areRoadsConnected(feature, other)) continue;

    const projection = projectPointToFeature(other, x, z);
    if (!projection) continue;

    const halfWidth = Number.isFinite(other?.width) ? other.width * 0.5 : 4;
    const lateralLimit = Math.max(4.5, halfWidth + 1.35);
    if (!Number.isFinite(projection.dist) || projection.dist > lateralLimit) continue;

    const surfaceY = sampleFeatureSurfaceY(other, x, z, projection);
    if (!Number.isFinite(surfaceY)) continue;

    const clearance = surfaceY - actorFeetY;
    if (!Number.isFinite(clearance) || clearance <= 2.6) continue;

    if (!best || clearance < best.clearance) {
      best = {
        road: other,
        y: surfaceY,
        dist: projection.dist,
        clearance
      };
    }
  }
  return best;
}

function spawnStructurePenalty(feature, evaluated, mode = 'drive', options = {}) {
  if (!feature || !evaluated?.valid) return 0;

  let penalty = 0;
  const semantics = feature.structureSemantics || null;
  const type = String(feature.type || '').toLowerCase();
  const actorFeetY =
    mode === 'drive' ?
      Number(evaluated.carY) - 1.2 :
      Number(evaluated.walkY) - 1.7;

  if (semantics?.gradeSeparated) {
    penalty += semantics.terrainMode === 'elevated' ? 60 : 46;
  }
  if (semantics?.rampCandidate) penalty += 22;
  if (/_link$/.test(type)) penalty += 46;
  if (type.includes('service')) penalty += 24;

  if (options.avoidOverhead === true && Number.isFinite(actorFeetY)) {
    const overhead = findSpawnOverheadConflict(feature, evaluated.x, evaluated.z, actorFeetY);
    if (overhead) {
      penalty += 140 + Math.max(0, 14 - overhead.clearance) * 9;
    }
  }

  return penalty;
}

function spawnCorridorPenalty(feature, evaluated, mode = 'drive', options = {}) {
  if (mode !== 'drive' || !feature || !evaluated?.valid) return 0;

  let penalty = 0;
  const type = String(feature?.type || '').toLowerCase();
  const width = Math.max(0, Number(feature?.width || 0));

  if (width > 0) penalty -= Math.min(18, width * 1.15);
  penalty -= Math.min(14, roadTypePriority(type) * 0.09);

  if (options.preferVisibleShell !== false) {
    const visibleRoadShell = countVisibleRoadMeshesNearWorldPoint(evaluated.x, evaluated.z, 180);
    penalty += Math.max(0, 6 - visibleRoadShell) * 12;
  }

  if (typeof appCtx.getNearbyBuildings === 'function') {
    const nearbyBuildings = appCtx.getNearbyBuildings(evaluated.x, evaluated.z, 20);
    if (Array.isArray(nearbyBuildings) && nearbyBuildings.length > 0) {
      let blockingBuildings = 0;
      for (let i = 0; i < nearbyBuildings.length; i++) {
        const building = nearbyBuildings[i];
        if (!building) continue;
        if (building.allowsPassageBelow === true) continue;
        if (building.collisionKind === 'thin_part') continue;
        blockingBuildings += 1;
      }
      penalty += Math.max(0, blockingBuildings - 1) * 7;
    }
  }

  return penalty;
}

function slopePenaltyAt(x, z) {
  const step = 8;
  const hL = terrainYAtWorld(x - step, z);
  const hR = terrainYAtWorld(x + step, z);
  const hU = terrainYAtWorld(x, z - step);
  const hD = terrainYAtWorld(x, z + step);
  const slopeX = (hR - hL) / (step * 2);
  const slopeZ = (hD - hU) / (step * 2);
  const gradient = Math.hypot(slopeX, slopeZ);
  const slopeDeg = Math.atan(gradient) * 180 / Math.PI;
  if (!Number.isFinite(slopeDeg)) return 0;
  if (slopeDeg <= 16) return 0;
  if (slopeDeg >= 55) return 1800;
  return (slopeDeg - 16) * 42;
}

function slopeDegreesAt(x, z) {
  const step = 6;
  const hL = terrainYAtWorld(x - step, z);
  const hR = terrainYAtWorld(x + step, z);
  const hU = terrainYAtWorld(x, z - step);
  const hD = terrainYAtWorld(x, z + step);
  const slopeX = (hR - hL) / (step * 2);
  const slopeZ = (hD - hU) / (step * 2);
  const gradient = Math.hypot(slopeX, slopeZ);
  return Number.isFinite(gradient) ? Math.atan(gradient) * 180 / Math.PI : 0;
}

function resolveRoadHeading(road, pointIndex, fallbackAngle = 0) {
  if (!road || !Array.isArray(road.pts) || road.pts.length < 2) return fallbackAngle;
  if (pointIndex < road.pts.length - 1) {
    return Math.atan2(road.pts[pointIndex + 1].x - road.pts[pointIndex].x, road.pts[pointIndex + 1].z - road.pts[pointIndex].z);
  }
  if (pointIndex > 0) {
    return Math.atan2(road.pts[pointIndex].x - road.pts[pointIndex - 1].x, road.pts[pointIndex].z - road.pts[pointIndex - 1].z);
  }
  return fallbackAngle;
}

function isVehicleRoad(road) {
  if (!road) return false;
  if (road.driveable === false) return false;
  return !road.networkKind || road.networkKind === 'road';
}

function overlaySuppressionSet(key = 'roadIds') {
  const source = appCtx.overlaySuppression?.[key];
  if (source instanceof Set) return source;
  if (Array.isArray(source)) return new Set(source);
  return new Set();
}

function isSuppressedBaseRoad(road) {
  if (!road || String(road?.sourceFeatureId || '').startsWith('overlay:')) return false;
  const sourceId = String(road?.sourceFeatureId || '');
  return !!(sourceId && overlaySuppressionSet('roadIds').has(sourceId));
}

function isSuppressedBaseBuilding(building) {
  if (!building || String(building?.sourceBuildingId || '').startsWith('overlay:')) return false;
  const sourceId = String(building?.sourceBuildingId || '');
  return !!(
    building?.continuousWorldReplaced === true ||
    (sourceId && overlaySuppressionSet('buildingIds').has(sourceId)) ||
    (sourceId && _replacedBaseBuildingSourceIds.has(sourceId))
  );
}

function isDetailedBuildingRenderable(mesh) {
  if (!mesh) return false;
  if (mesh?.userData?.isBuildingProxy) return false;
  if (String(mesh?.userData?.lodTier || '') === 'mid') return false;
  return true;
}

function collectBaseDetailedBuildingSourceIds() {
  const ids = new Set();
  const buildingMeshes = Array.isArray(appCtx.buildingMeshes) ? appCtx.buildingMeshes : [];
  for (let i = 0; i < buildingMeshes.length; i++) {
    const mesh = buildingMeshes[i];
    const sourceBuildingId = String(mesh?.userData?.sourceBuildingId || '').trim();
    if (!sourceBuildingId) continue;
    if (mesh?.userData?.continuousWorldInteractiveChunk === true) continue;
    if (!isDetailedBuildingRenderable(mesh)) continue;
    ids.add(sourceBuildingId);
  }
  return ids;
}

function pruneBaseProxyBuildingShells(sourceBuildingId, reason = 'building_detail_upgrade') {
  const sourceId = String(sourceBuildingId || '').trim();
  if (!sourceId) return false;

  let removedProxyMesh = false;
  const buildingMeshes = Array.isArray(appCtx.buildingMeshes) ? appCtx.buildingMeshes : [];
  for (let i = buildingMeshes.length - 1; i >= 0; i--) {
    const mesh = buildingMeshes[i];
    if (!mesh) continue;
    if (mesh?.userData?.continuousWorldInteractiveChunk === true) continue;
    if (String(mesh?.userData?.sourceBuildingId || '').trim() !== sourceId) continue;
    if (isDetailedBuildingRenderable(mesh)) continue;
    disposeMeshForContinuousWorldEviction(mesh, reason);
    buildingMeshes.splice(i, 1);
    removedProxyMesh = true;
  }

  let suppressedBaseCollider = false;
  const buildings = Array.isArray(appCtx.buildings) ? appCtx.buildings : [];
  for (let i = 0; i < buildings.length; i++) {
    const building = buildings[i];
    if (!building || building?.continuousWorldInteractiveChunk === true) continue;
    if (String(building?.sourceBuildingId || '').trim() !== sourceId) continue;
    if (building.continuousWorldReplaced === true) continue;
    building.continuousWorldReplaced = true;
    suppressedBaseCollider = true;
  }

  if (removedProxyMesh || suppressedBaseCollider) {
    _replacedBaseBuildingSourceIds.add(sourceId);
    rebuildBuildingSpatialIndexFromLoadedBuildings();
    rebuildLanduseSpatialIndexFromLoadedLanduses();
    markWorldLodDirty(reason);
    syncRuntimeContentInventory(reason);
  }
  return removedProxyMesh || suppressedBaseCollider;
}

function refreshReplacedBaseBuildingSources() {
  if (_replacedBaseBuildingSourceIds.size === 0) return;

  const activeInteractiveSourceIds = new Set();
  const buildingMeshes = Array.isArray(appCtx.buildingMeshes) ? appCtx.buildingMeshes : [];
  const buildings = Array.isArray(appCtx.buildings) ? appCtx.buildings : [];

  for (let i = 0; i < buildingMeshes.length; i++) {
    const mesh = buildingMeshes[i];
    if (mesh?.userData?.continuousWorldInteractiveChunk !== true) continue;
    const sourceBuildingId = String(mesh?.userData?.sourceBuildingId || '').trim();
    if (sourceBuildingId) activeInteractiveSourceIds.add(sourceBuildingId);
  }
  for (let i = 0; i < buildings.length; i++) {
    const building = buildings[i];
    if (building?.continuousWorldInteractiveChunk !== true) continue;
    const sourceBuildingId = String(building?.sourceBuildingId || '').trim();
    if (sourceBuildingId) activeInteractiveSourceIds.add(sourceBuildingId);
  }

  let restoredBaseBuilding = false;
  for (const sourceId of Array.from(_replacedBaseBuildingSourceIds)) {
    if (activeInteractiveSourceIds.has(sourceId)) continue;
    _replacedBaseBuildingSourceIds.delete(sourceId);
    for (let i = 0; i < buildings.length; i++) {
      const building = buildings[i];
      if (!building || building?.continuousWorldInteractiveChunk === true) continue;
      if (String(building?.sourceBuildingId || '').trim() !== sourceId) continue;
      if (building.continuousWorldReplaced !== true) continue;
      building.continuousWorldReplaced = false;
      restoredBaseBuilding = true;
    }
  }

  if (restoredBaseBuilding) {
    rebuildBuildingSpatialIndexFromLoadedBuildings();
    rebuildLanduseSpatialIndexFromLoadedLanduses();
    markWorldLodDirty('building_detail_restore');
  }
}

function runtimeRoadFeatures() {
  const features = [];
  if (Array.isArray(appCtx.roads)) {
    for (let i = 0; i < appCtx.roads.length; i++) {
      const road = appCtx.roads[i];
      if (!isSuppressedBaseRoad(road)) features.push(road);
    }
  }
  if (Array.isArray(appCtx.overlayRuntimeRoads)) {
    for (let i = 0; i < appCtx.overlayRuntimeRoads.length; i++) {
      features.push(appCtx.overlayRuntimeRoads[i]);
    }
  }
  return features;
}

function traversalFeatureKind(feature) {
  return String(feature?.networkKind || feature?.kind || 'road').toLowerCase();
}

function isWalkSurface(feature) {
  if (!feature) return false;
  if (feature.walkable === false) return false;
  const kind = traversalFeatureKind(feature);
  if (!ENABLE_LINEAR_FEATURES) return kind === 'road' || feature?.isStructureConnector === true;
  return kind === 'road' || kind === 'footway' || kind === 'cycleway' || kind === 'railway';
}

function walkSurfacePenalty(feature) {
  const kind = traversalFeatureKind(feature);
  return WALK_SURFACE_COST[kind] || 1;
}

function surfaceDisplayName(feature) {
  if (!feature) return 'Off Road';
  const explicitName = String(feature.name || '').trim();
  if (explicitName) return explicitName;

  const kind = traversalFeatureKind(feature);
  const overlayFeature = String(feature?.sourceFeatureId || '').startsWith('overlay:') || !!feature?.overlayFeatureId;
  if (!ENABLE_LINEAR_FEATURES && !overlayFeature && kind === 'road') return 'Road';
  if (kind === 'footway') return 'Footpath';
  if (kind === 'cycleway') return 'Cycle Path';
  if (kind === 'railway') return 'Rail Corridor';
  return 'Road';
}

function traversableFeaturesForMode(mode = 'walk') {
  const drive = mode === 'drive';
  const features = [];

  const runtimeRoads = runtimeRoadFeatures();
  if (Array.isArray(runtimeRoads)) {
    for (let i = 0; i < runtimeRoads.length; i++) {
      const road = runtimeRoads[i];
      if (drive ? isVehicleRoad(road) : isWalkSurface(road)) features.push(road);
    }
  }

  if (!drive && Array.isArray(appCtx.linearFeatures)) {
    for (let i = 0; i < appCtx.linearFeatures.length; i++) {
      const feature = appCtx.linearFeatures[i];
      if ((ENABLE_LINEAR_FEATURES || feature?.isStructureConnector === true) && isWalkSurface(feature)) features.push(feature);
    }
  }

  if (!drive && Array.isArray(appCtx.overlayRuntimeLinearFeatures)) {
    for (let i = 0; i < appCtx.overlayRuntimeLinearFeatures.length; i++) {
      const feature = appCtx.overlayRuntimeLinearFeatures[i];
      if (isWalkSurface(feature)) features.push(feature);
    }
  }

  return features;
}

function invalidateTraversalNetworks(reason = 'world_data_change') {
  _traversalNetworksDirty = true;
  appCtx.traversalNetworks = { walk: null, drive: null };
  return reason;
}

function scheduleTraversalNetworksRebuild(reason = 'world_data_change', delayMs = 420) {
  invalidateTraversalNetworks(reason);
  if (_traversalRebuildTimer) {
    clearTimeout(_traversalRebuildTimer);
  }
  _traversalRebuildTimer = window.setTimeout(() => {
    _traversalRebuildTimer = null;
    try {
      buildTraversalNetworks();
    } catch (error) {
      console.warn('[Traversal] deferred rebuild failed:', error);
    }
  }, Math.max(0, Number(delayMs) || 0));
}

function traversalNodeKey(x, z, feature = null) {
  return `${Math.round(x / TRAVERSAL_NODE_GRID)},${Math.round(z / TRAVERSAL_NODE_GRID)}:${featureTraversalKey(feature)}`;
}

function buildTraversalGraph(mode = 'walk') {
  const features = traversableFeaturesForMode(mode);
  const nodes = [];
  const adjacency = [];
  const segments = [];
  const nodesByKey = new Map();
  const featureKinds = {};

  const upsertNode = (point, feature) => {
    const key = traversalNodeKey(point.x, point.z, feature);
    const existingId = nodesByKey.get(key);
    if (existingId !== undefined) {
      const existing = nodes[existingId];
      existing.sampleCount += 1;
      existing.sumX += point.x;
      existing.sumZ += point.z;
      existing.x = existing.sumX / existing.sampleCount;
      existing.z = existing.sumZ / existing.sampleCount;
      return existingId;
    }

    const nodeId = nodes.length;
    nodesByKey.set(key, nodeId);
    nodes.push({
      x: point.x,
      z: point.z,
      sumX: point.x,
      sumZ: point.z,
      sampleCount: 1
    });
    adjacency.push([]);
    return nodeId;
  };

  for (let f = 0; f < features.length; f++) {
    const feature = features[f];
    if (!Array.isArray(feature?.pts) || feature.pts.length < 2) continue;

    const kind = traversalFeatureKind(feature);
    featureKinds[kind] = (featureKinds[kind] || 0) + 1;
    const nodeIds = feature.pts.map((point) => upsertNode(point, feature));
    const segmentPenalty = mode === 'drive' ? 1 : walkSurfacePenalty(feature);

    for (let i = 0; i < feature.pts.length - 1; i++) {
      const fromId = nodeIds[i];
      const toId = nodeIds[i + 1];
      if (fromId === toId) continue;

      const p1 = feature.pts[i];
      const p2 = feature.pts[i + 1];
      const length = Math.hypot(p2.x - p1.x, p2.z - p1.z);
      if (!(length > 0.05)) continue;

      const weight = length * segmentPenalty;
      adjacency[fromId].push({ to: toId, weight });
      adjacency[toId].push({ to: fromId, weight });
      segments.push({
        feature,
        segIndex: i,
        fromId,
        toId,
        p1,
        p2,
        length,
        penalty: segmentPenalty
      });
    }
  }

  return {
    mode,
    nodes: nodes.map((node) => ({ x: node.x, z: node.z })),
    adjacency,
    segments,
    featureKinds,
    featureCount: features.length,
    nodeCount: nodes.length,
    segmentCount: segments.length
  };
}

function buildTraversalNetworks() {
  const walkFeatureCount = traversableFeaturesForMode('walk').length;
  const driveFeatureCount = traversableFeaturesForMode('drive').length;
  const existingWalk = appCtx.traversalNetworks?.walk || null;
  const existingDrive = appCtx.traversalNetworks?.drive || null;
  const walkReady = !!existingWalk && (
    Number(existingWalk.featureCount || 0) > 0 ||
    walkFeatureCount === 0
  );
  const driveReady = !!existingDrive && (
    Number(existingDrive.featureCount || 0) > 0 ||
    driveFeatureCount === 0
  );

  if (!_traversalNetworksDirty && walkReady && driveReady) {
    return appCtx.traversalNetworks;
  }
  const walk = buildTraversalGraph('walk');
  const drive = buildTraversalGraph('drive');
  appCtx.traversalNetworks = { walk, drive };
  _traversalNetworksDirty = false;
  return appCtx.traversalNetworks;
}

function traversalGraphForMode(mode = 'walk') {
  const resolvedMode = mode === 'drive' ? 'drive' : 'walk';
  const graph = appCtx.traversalNetworks?.[resolvedMode];
  if (graph && Array.isArray(graph.segments) && graph.segments.length > 0) return graph;
  return buildTraversalNetworks()?.[resolvedMode] || null;
}

function projectPointToSegment(x, z, p1, p2) {
  const dx = p2.x - p1.x;
  const dz = p2.z - p1.z;
  const len2 = dx * dx + dz * dz;
  if (len2 <= 1e-9) {
    const dist = Math.hypot(x - p1.x, z - p1.z);
    return {
      x: p1.x,
      z: p1.z,
      t: 0,
      dist,
      length: 0
    };
  }

  let t = ((x - p1.x) * dx + (z - p1.z) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = p1.x + dx * t;
  const pz = p1.z + dz * t;
  return {
    x: px,
    z: pz,
    t,
    dist: Math.hypot(x - px, z - pz),
    length: Math.sqrt(len2)
  };
}

function findNearestTraversalFeature(x, z, options = {}) {
  const mode = options.mode === 'drive' ? 'drive' : 'walk';
  const graph = traversalGraphForMode(mode);
  const segments = Array.isArray(graph?.segments) ? graph.segments : [];
  const maxDistance = Number.isFinite(options.maxDistance) ?
    Math.max(4, options.maxDistance) :
    TRAVERSAL_MAX_ANCHOR_DISTANCE[mode];

  let best = null;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const projected = projectPointToSegment(x, z, segment.p1, segment.p2);
    if (!Number.isFinite(projected.dist) || projected.dist > maxDistance) continue;
    const weighted = projected.dist * (mode === 'drive' ? 1 : Math.max(0.85, segment.penalty));
    if (!best || weighted < best.weightedDist) {
      best = {
        mode,
        feature: segment.feature,
        dist: projected.dist,
        weightedDist: weighted,
        pt: { x: projected.x, z: projected.z },
        t: projected.t,
        segIndex: segment.segIndex,
        fromId: segment.fromId,
        toId: segment.toId,
        p1: segment.p1,
        p2: segment.p2,
        length: segment.length,
        penalty: segment.penalty
      };
    }
  }

  return best;
}

function compactRoutePoints(points, minSpacing = 0.35) {
  const compacted = [];
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    if (!isFiniteWorldPointXZ(point)) continue;
    const last = compacted[compacted.length - 1];
    if (last && Math.hypot(point.x - last.x, point.z - last.z) < minSpacing) continue;
    compacted.push({ x: point.x, z: point.z });
  }
  return compacted;
}

function measurePolylineDistance(points) {
  if (!Array.isArray(points) || points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].z - points[i].z);
  }
  return total;
}

function measureRemainingPolylineDistance(x, z, points) {
  if (!Array.isArray(points) || points.length === 0) return 0;
  if (points.length === 1) return Math.hypot(points[0].x - x, points[0].z - z);

  let best = null;
  let walked = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const projected = projectPointToSegment(x, z, p1, p2);
    const segmentLength = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    if (!best || projected.dist < best.dist) {
      best = {
        dist: projected.dist,
        walked,
        projected,
        segmentLength,
        segIndex: i
      };
    }
    walked += segmentLength;
  }

  if (!best) return Math.hypot(points[points.length - 1].x - x, points[points.length - 1].z - z);

  let remaining = Math.hypot(x - best.projected.x, z - best.projected.z);
  remaining += best.segmentLength * (1 - best.projected.t);
  for (let i = best.segIndex + 1; i < points.length - 1; i++) {
    remaining += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].z - points[i].z);
  }
  return remaining;
}

function aStarTraversalPath(graph, startId, endId) {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.adjacency)) return null;
  if (!Number.isInteger(startId) || !Number.isInteger(endId)) return null;
  if (startId === endId) return { nodeIds: [startId], cost: 0 };

  const nodeCount = graph.nodes.length;
  const gScore = new Float64Array(nodeCount);
  const fScore = new Float64Array(nodeCount);
  const cameFrom = new Int32Array(nodeCount);
  const openEntries = [];

  for (let i = 0; i < nodeCount; i++) {
    gScore[i] = Infinity;
    fScore[i] = Infinity;
    cameFrom[i] = -1;
  }

  const heuristic = (aId, bId) => {
    const a = graph.nodes[aId];
    const b = graph.nodes[bId];
    return Math.hypot(b.x - a.x, b.z - a.z);
  };

  const pushOpen = (nodeId, priority) => {
    openEntries.push({ nodeId, priority });
    let idx = openEntries.length - 1;
    while (idx > 0) {
      const parent = Math.floor((idx - 1) / 2);
      if (openEntries[parent].priority <= openEntries[idx].priority) break;
      const tmp = openEntries[parent];
      openEntries[parent] = openEntries[idx];
      openEntries[idx] = tmp;
      idx = parent;
    }
  };

  const popOpen = () => {
    if (openEntries.length === 0) return null;
    const min = openEntries[0];
    const last = openEntries.pop();
    if (openEntries.length > 0 && last) {
      openEntries[0] = last;
      let idx = 0;
      while (true) {
        const left = idx * 2 + 1;
        const right = left + 1;
        let smallest = idx;
        if (left < openEntries.length && openEntries[left].priority < openEntries[smallest].priority) smallest = left;
        if (right < openEntries.length && openEntries[right].priority < openEntries[smallest].priority) smallest = right;
        if (smallest === idx) break;
        const tmp = openEntries[idx];
        openEntries[idx] = openEntries[smallest];
        openEntries[smallest] = tmp;
        idx = smallest;
      }
    }
    return min;
  };

  gScore[startId] = 0;
  fScore[startId] = heuristic(startId, endId);
  pushOpen(startId, fScore[startId]);

  while (openEntries.length > 0) {
    const current = popOpen();
    if (!current) break;
    const currentId = current.nodeId;
    if (current.priority > fScore[currentId] + 1e-6) continue;
    if (currentId === endId) break;

    const edges = graph.adjacency[currentId] || [];
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      const tentative = gScore[currentId] + edge.weight;
      if (tentative + 1e-6 >= gScore[edge.to]) continue;
      cameFrom[edge.to] = currentId;
      gScore[edge.to] = tentative;
      fScore[edge.to] = tentative + heuristic(edge.to, endId);
      pushOpen(edge.to, fScore[edge.to]);
    }
  }

  if (!Number.isFinite(gScore[endId])) return null;

  const nodeIds = [endId];
  let cursor = endId;
  while (cursor !== startId) {
    cursor = cameFrom[cursor];
    if (cursor < 0) return null;
    nodeIds.push(cursor);
  }
  nodeIds.reverse();
  return { nodeIds, cost: gScore[endId] };
}

function buildTraversalConnectorOptions(anchor, originX, originZ) {
  if (!anchor) return [];
  const offNetwork = Math.hypot(originX - anchor.pt.x, originZ - anchor.pt.z);
  const options = [
    {
      nodeId: anchor.fromId,
      connectorCost: offNetwork + Math.hypot(anchor.pt.x - anchor.p1.x, anchor.pt.z - anchor.p1.z) * anchor.penalty
    },
    {
      nodeId: anchor.toId,
      connectorCost: offNetwork + Math.hypot(anchor.pt.x - anchor.p2.x, anchor.pt.z - anchor.p2.z) * anchor.penalty
    }
  ];

  if (options[0].nodeId === options[1].nodeId) return [options[0]];
  return options;
}

function findTraversalRoute(fromX, fromZ, toX, toZ, options = {}) {
  const mode = options.mode === 'drive' ? 'drive' : 'walk';
  const graph = traversalGraphForMode(mode);
  if (!graph || !Array.isArray(graph.segments) || graph.segments.length === 0) return null;

  const startAnchor = findNearestTraversalFeature(fromX, fromZ, {
    mode,
    maxDistance: options.maxAnchorDistance
  });
  const endAnchor = findNearestTraversalFeature(toX, toZ, {
    mode,
    maxDistance: options.maxAnchorDistance
  });
  if (!startAnchor || !endAnchor) return null;

  if (startAnchor.feature === endAnchor.feature && startAnchor.segIndex === endAnchor.segIndex) {
    const points = compactRoutePoints([
      { x: fromX, z: fromZ },
      startAnchor.pt,
      endAnchor.pt,
      { x: toX, z: toZ }
    ]);
    return {
      mode,
      points,
      distance: measurePolylineDistance(points),
      startAnchor,
      endAnchor
    };
  }

  const startLinks = buildTraversalConnectorOptions(startAnchor, fromX, fromZ);
  const endLinks = buildTraversalConnectorOptions(endAnchor, toX, toZ);
  let best = null;

  for (let i = 0; i < startLinks.length; i++) {
    for (let j = 0; j < endLinks.length; j++) {
      const startLink = startLinks[i];
      const endLink = endLinks[j];
      const core = aStarTraversalPath(graph, startLink.nodeId, endLink.nodeId);
      if (!core) continue;
      const totalCost = startLink.connectorCost + core.cost + endLink.connectorCost;
      if (!best || totalCost < best.totalCost) {
        best = {
          totalCost,
          nodeIds: core.nodeIds
        };
      }
    }
  }

  if (!best) return null;

  const routePoints = [{ x: fromX, z: fromZ }, startAnchor.pt];
  for (let i = 0; i < best.nodeIds.length; i++) {
    const node = graph.nodes[best.nodeIds[i]];
    if (node) routePoints.push({ x: node.x, z: node.z });
  }
  routePoints.push(endAnchor.pt, { x: toX, z: toZ });

  const points = compactRoutePoints(routePoints);
  return {
    mode,
    points,
    distance: measurePolylineDistance(points),
    startAnchor,
    endAnchor
  };
}

function pickNavigationTargetPoint(currentX, currentZ, routePoints) {
  if (!Array.isArray(routePoints) || routePoints.length === 0) return null;
  if (routePoints.length === 1) return routePoints[0];

  let bestIndex = 0;
  let bestDist = Infinity;
  for (let i = 0; i < routePoints.length; i++) {
    const point = routePoints[i];
    const dist = Math.hypot(point.x - currentX, point.z - currentZ);
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = i;
    }
  }

  const lookahead = bestDist < 16 ? 2 : 1;
  const nextIndex = Math.min(routePoints.length - 1, bestIndex + lookahead);
  return routePoints[nextIndex];
}

function buildingContainingPoint(x, z, radius = 6, options = {}) {
  const candidateBuildings = typeof appCtx.getNearbyBuildings === 'function' ?
    appCtx.getNearbyBuildings(x, z, radius + 12) :
    appCtx.buildings;
  const actorBaseY = Number.isFinite(options?.y) ? Number(options.y) : NaN;
  const actorHeight = Number.isFinite(options?.actorHeight) ? Math.max(0.5, Number(options.actorHeight)) : NaN;
  const actorTopY = Number.isFinite(actorBaseY) && Number.isFinite(actorHeight) ? actorBaseY + actorHeight : NaN;
  const verticalTolerance = Number.isFinite(options?.tolerance) ? Math.max(0, Number(options.tolerance)) : 0.35;
  if (!Array.isArray(candidateBuildings) || candidateBuildings.length === 0) return null;

  for (let i = 0; i < candidateBuildings.length; i++) {
    const building = candidateBuildings[i];
    if (!building) continue;
    if (x < building.minX || x > building.maxX || z < building.minZ || z > building.maxZ) continue;
    if (Number.isFinite(actorBaseY) && Number.isFinite(actorTopY)) {
      const minY = Number.isFinite(building.minY) ? building.minY : Number.isFinite(building.baseY) ? building.baseY : NaN;
      const maxY = Number.isFinite(building.maxY) ? building.maxY : Number.isFinite(minY) && Number.isFinite(building.height) ? minY + building.height : NaN;
      if (Number.isFinite(minY) && Number.isFinite(maxY) &&
          (actorTopY < minY - verticalTolerance || actorBaseY > maxY + verticalTolerance)) {
        continue;
      }
    }

    const inside = Array.isArray(building.pts) && building.pts.length >= 3 ?
      pointInPolygon(x, z, building.pts) :
      true;
    if (inside) return building;
  }
  return null;
}

function driveBuildBlockCollision(x, z, carFeetY) {
  if (typeof appCtx.getBuildCollisionAtWorldXZ !== 'function') return null;
  const samples = [
    [0, 0],
    [2.0, 0],
    [-2.0, 0],
    [0, 2.0],
    [0, -2.0]
  ];
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const hit = appCtx.getBuildCollisionAtWorldXZ(x + sample[0], z + sample[1], carFeetY, 0.12);
    if (hit && hit.blocked) return hit;
  }
  return null;
}

function walkBuildBlockCollision(x, z, terrainY) {
  if (typeof appCtx.getBuildCollisionAtWorldXZ !== 'function') return null;
  return appCtx.getBuildCollisionAtWorldXZ(x, z, terrainY, 0.65, 1.7 * 0.95);
}

function shouldIgnoreDriveCollision(buildingCheck, x, z, nearestRoadOverride = null) {
  if (!buildingCheck?.collision) return false;
  const actorBaseY = Number.isFinite(buildingCheck?.actorBaseY) ? buildingCheck.actorBaseY : NaN;
  const nearestRoad =
    nearestRoadOverride ||
    (typeof findNearestRoad === 'function' ? findNearestRoad(x, z, {
      y: Number.isFinite(actorBaseY) ? actorBaseY + 1.2 : NaN,
      maxVerticalDelta: 14
    }) : null);
  const road = nearestRoad?.road;
  if (!isVehicleRoad(road)) return false;
  if (!isRoadSurfaceReachable(nearestRoad, {
    extraVerticalAllowance: 0.4
  })) return false;

  const roadHalfWidth = Number.isFinite(road?.width) ? road.width * 0.5 : 0;
  const onRoadCenter = nearestRoad.dist <= Math.max(2.2, roadHalfWidth - 0.35);
  const onRoadCore = nearestRoad.dist <= Math.max(1.6, roadHalfWidth - 0.95);
  const colliderDetail = buildingCheck?.building?.colliderDetail === 'bbox' ? 'bbox' : 'full';
  const buildingType = String(buildingCheck?.building?.buildingType || '').toLowerCase();
  const isApproxCollider = colliderDetail !== 'full';
  const partKind = String(buildingCheck?.building?.buildingPartKind || '').toLowerCase();
  const roofLikeCollider =
    buildingType === 'roof' ||
    buildingType === 'canopy' ||
    buildingType === 'carport' ||
    partKind === 'roof' ||
    partKind === 'balcony' ||
    partKind === 'canopy' ||
    buildingCheck?.building?.collisionKind === 'thin_part' ||
    buildingCheck?.building?.allowsPassageBelow === true;
  const shallowRoadsideCollision = !!buildingCheck.collision &&
    onRoadCenter &&
    !buildingCheck.inside &&
    Number.isFinite(buildingCheck.penetration) &&
    buildingCheck.penetration < 1.25;
  const likelyRoadGhostCollision = !!buildingCheck.collision &&
    ((onRoadCenter && isApproxCollider) ||
      (onRoadCore && buildingCheck.inside) ||
      (onRoadCenter && roofLikeCollider));

  return shallowRoadsideCollision || likelyRoadGhostCollision;
}

function evaluateWalkSpawnCandidate(x, z, options = {}) {
  const angle = finiteNumberOr(options.angle, finiteNumberOr(appCtx.car?.angle, 0));
  const terrainY = terrainYAtWorld(x, z);
  if (!Number.isFinite(terrainY)) return { valid: false, reason: 'terrain_missing' };
  const desiredFeetY = Number.isFinite(options.feetY) ? options.feetY : NaN;
  const actorFeetY = Number.isFinite(desiredFeetY) ? desiredFeetY : terrainY;
  const preferredRoad = options.preferredRoad || appCtx.car?.road || appCtx.car?._lastStableRoad || null;
  const nearestRoad = typeof findNearestRoad === 'function' ? findNearestRoad(x, z, {
    y: actorFeetY + 1.2,
    maxVerticalDelta: 12,
    preferredRoad
  }) : null;
  const walkSurfaceInfo =
    appCtx.GroundHeight && typeof appCtx.GroundHeight.walkSurfaceInfo === 'function' ?
      appCtx.GroundHeight.walkSurfaceInfo(x, z, actorFeetY) :
      null;
  const walkBaseY =
    Number.isFinite(walkSurfaceInfo?.y) ?
      walkSurfaceInfo.y :
      walkBaseYAtWorld(x, z);
  const onRoadSurface = isRoadSurfaceReachable(nearestRoad, {
    currentRoad: preferredRoad,
    extraLateralPadding: 0.25
  });
  if (isInsideWaterArea(x, z) && !onRoadSurface) {
    return { valid: false, reason: 'inside_water', terrainY };
  }
  if (buildingContainingPoint(x, z, 4, {
    y: actorFeetY,
    actorHeight: 1.9,
    tolerance: 0.45
  })) return { valid: false, reason: 'inside_building', terrainY };
  if (walkBuildBlockCollision(x, z, terrainY)?.blocked) return { valid: false, reason: 'build_block', terrainY };

  const slopeDeg = slopeDegreesAt(x, z);
  if (slopeDeg > 40) return { valid: false, reason: 'slope_too_steep', terrainY, slopeDeg };

  return {
    valid: true,
    mode: 'walk',
    x,
    z,
    angle,
    road: onRoadSurface ? nearestRoad?.road || preferredRoad || null : null,
    onRoad: !!onRoadSurface,
    terrainY,
    walkY: walkBaseY + 1.7,
    carY: driveCenterYAtWorld(x, z, !!onRoadSurface),
    slopeDeg,
    source: options.source || 'direct'
  };
}

function evaluateDriveSpawnCandidate(x, z, options = {}) {
  const angle = finiteNumberOr(options.angle, finiteNumberOr(appCtx.car?.angle, 0));
  const terrainY = terrainYAtWorld(x, z);
  if (!Number.isFinite(terrainY)) return { valid: false, reason: 'terrain_missing' };

  const preferredRoad = options.preferredRoad || appCtx.car?.road || appCtx.car?._lastStableRoad || null;
  const preferredProjection = preferredRoad ? projectPointToFeature(preferredRoad, x, z) : null;
  const preferredRoadY =
    preferredRoad &&
    preferredProjection &&
    Number.isFinite(preferredProjection.dist) &&
    preferredProjection.dist <= roadSurfaceLateralThreshold(preferredRoad, { extraLateralPadding: 1.05 }) ?
      sampleFeatureSurfaceY(preferredRoad, x, z, preferredProjection) :
      NaN;
  const desiredFeetY = Number.isFinite(options.feetY) ? options.feetY : NaN;
  const actorFeetY =
    Number.isFinite(desiredFeetY) ? desiredFeetY :
    Number.isFinite(preferredRoadY) ? preferredRoadY :
    terrainY;
  const nearestRoad = typeof findNearestRoad === 'function' ? findNearestRoad(x, z, {
    y: actorFeetY + 1.2,
    maxVerticalDelta: 18,
    preferredRoad
  }) : null;
  const road = isVehicleRoad(nearestRoad?.road) ? nearestRoad.road : null;
  const onRoad = isRoadSurfaceReachable(nearestRoad, {
    currentRoad: preferredRoad,
    extraVerticalAllowance: 0.5
  }) && !!road;
  if (isInsideWaterArea(x, z) && !onRoad) {
    return { valid: false, reason: 'inside_water', terrainY, onRoad, road };
  }

  if (Number.isFinite(desiredFeetY) && desiredFeetY > terrainY + 2.8 && !onRoad) {
    return { valid: false, reason: 'elevated_surface', terrainY, onRoad, road };
  }
  if (driveBuildBlockCollision(x, z, actorFeetY)) {
    return { valid: false, reason: 'build_block', terrainY, onRoad, road };
  }

  const buildingCheck = typeof appCtx.checkBuildingCollision === 'function' ?
    appCtx.checkBuildingCollision(x, z, 2.0, {
      actorBaseY: actorFeetY,
      actorHeight: 1.9
    }) :
    { collision: false };
  if (buildingCheck?.collision && !shouldIgnoreDriveCollision(buildingCheck, x, z)) {
    return { valid: false, reason: 'building_collision', terrainY, onRoad, road, buildingCheck };
  }

  const slopeDeg = slopeDegreesAt(x, z);
  if (!onRoad && slopeDeg > 30) {
    return { valid: false, reason: 'slope_too_steep', terrainY, slopeDeg, onRoad, road };
  }
  if (options.requireRoad && !onRoad) {
    return { valid: false, reason: 'road_required', terrainY, slopeDeg, onRoad, road };
  }

  return {
    valid: true,
    mode: 'drive',
    x,
    z,
    angle,
    road,
    onRoad,
    terrainY,
    walkY: terrainY + 1.7,
    carY: Number.isFinite(nearestRoad?.y) ? nearestRoad.y + 1.2 : driveCenterYAtWorld(x, z, !!road),
    slopeDeg,
    source: options.source || 'direct'
  };
}

function searchNearestSafeGroundSpawn(targetX, targetZ, options = {}) {
  const maxRadius = Number.isFinite(options.maxRadius) ? Math.max(4, options.maxRadius) : 72;
  const step = Number.isFinite(options.step) ? Math.max(2, options.step) : 6;
  let best = null;

  for (let radius = step; radius <= maxRadius; radius += step) {
    const steps = Math.max(8, Math.round(radius * 1.6));
    for (let i = 0; i < steps; i++) {
      const theta = i / steps * Math.PI * 2;
      const x = targetX + Math.cos(theta) * radius;
      const z = targetZ + Math.sin(theta) * radius;
      const evaluated = evaluateWalkSpawnCandidate(x, z, {
        angle: options.angle,
        source: 'ground_search'
      });
      if (!evaluated.valid) continue;
      const score = radius + evaluated.slopeDeg * 0.6;
      if (!best || score < best.score) best = { ...evaluated, score };
    }
    if (best) break;
  }

  return best;
}

function searchNearestSafeRoadSpawn(targetX, targetZ, options = {}) {
  const requestedMode = options.mode === 'walk' ? 'walk' : 'drive';
  const traversableFeatures = traversableFeaturesForMode(requestedMode);
  if (!Array.isArray(traversableFeatures) || traversableFeatures.length === 0) return null;
  const maxDistance = Number.isFinite(options.maxDistance) ? Math.max(32, options.maxDistance) : 220;
  const limits = options.strictMaxDistance === true ? [maxDistance] : [maxDistance, Infinity];

  for (let pass = 0; pass < limits.length; pass++) {
    const limit = limits[pass];
    let best = null;

    for (let r = 0; r < traversableFeatures.length; r++) {
      const feature = traversableFeatures[r];
      if (!Array.isArray(feature?.pts) || feature.pts.length < 2) continue;
      for (let i = 0; i < feature.pts.length; i++) {
        const basePoint = feature.pts[i];
        const candidates = [{ x: basePoint.x, z: basePoint.z, idx: i }];
        if (i < feature.pts.length - 1 && (i % 2 === 0 || feature.pts.length <= 12)) {
          const next = feature.pts[i + 1];
          candidates.push({
            x: (basePoint.x + next.x) * 0.5,
            z: (basePoint.z + next.z) * 0.5,
            idx: i
          });
        }

        for (let c = 0; c < candidates.length; c++) {
          const candidate = candidates[c];
          const dist = Math.hypot(candidate.x - targetX, candidate.z - targetZ);
          if (dist > limit) continue;

          const angle = resolveRoadHeading(feature, candidate.idx, options.angle);
          const evaluated = requestedMode === 'drive' ?
            evaluateDriveSpawnCandidate(candidate.x, candidate.z, {
              angle,
              feetY: options.feetY,
              preferredRoad: options.preferredRoad,
              requireRoad: true,
              source: 'road_search'
            }) :
            evaluateWalkSpawnCandidate(candidate.x, candidate.z, {
              angle,
              feetY: options.feetY,
              preferredRoad: options.preferredRoad,
              source: 'walk_surface_search'
            });
          if (!evaluated.valid) continue;

          const score =
            dist +
            spawnSurfacePenalty(feature, requestedMode) +
            spawnStructurePenalty(feature, evaluated, requestedMode, options) +
            spawnCorridorPenalty(feature, evaluated, requestedMode, options) +
            slopePenaltyAt(candidate.x, candidate.z);
          if (!best || score < best.score) {
            const nextResult = { ...evaluated, score, targetDistance: dist };
            if (requestedMode === 'walk' && isVehicleRoad(feature)) {
              nextResult.road = feature;
              nextResult.onRoad = nextResult.onRoad || true;
            }
            best = nextResult;
          }
        }
      }
    }

    if (best) return best;
  }

  return null;
}

function fallbackResolvedSpawn(mode = 'drive', options = {}) {
  const x = finiteNumberOr(options.x, 0);
  const z = finiteNumberOr(options.z, 0);
  const terrainY = terrainYAtWorld(x, z);
  return {
    valid: true,
    mode: mode === 'walk' ? 'walk' : 'drive',
    x,
    z,
    angle: finiteNumberOr(options.angle, 0),
    road: null,
    onRoad: false,
    terrainY,
    walkY: walkBaseYAtWorld(x, z) + 1.7,
    carY: driveCenterYAtWorld(x, z, false),
    slopeDeg: slopeDegreesAt(x, z),
    source: options.source || 'fallback_origin'
  };
}

function resolveSafeWorldSpawn(targetX, targetZ, options = {}) {
  const mode = options.mode === 'walk' ? 'walk' : 'drive';
  const x = finiteNumberOr(targetX, 0);
  const z = finiteNumberOr(targetZ, 0);
  const angle = finiteNumberOr(options.angle, finiteNumberOr(appCtx.car?.angle, 0));
  const strictMaxDistance = options.strictMaxDistance === true;

  if (mode === 'walk') {
    const direct = evaluateWalkSpawnCandidate(x, z, {
      angle,
      feetY: options.feetY,
      preferredRoad: options.preferredRoad,
      source: options.source || 'direct'
    });
    if (direct.valid) return direct;

    const surfaceFallback = searchNearestSafeRoadSpawn(x, z, {
      mode: 'walk',
      angle,
      feetY: options.feetY,
      preferredRoad: options.preferredRoad,
      maxDistance: options.maxRoadDistance,
      strictMaxDistance
    });
    if (surfaceFallback) return surfaceFallback;

    const groundFallback = searchNearestSafeGroundSpawn(x, z, {
      angle,
      maxRadius: options.maxGroundRadius
    });
    if (groundFallback) return groundFallback;

    return fallbackResolvedSpawn('walk', { x, z, angle, source: 'walk_fallback' });
  }

  const direct = evaluateDriveSpawnCandidate(x, z, {
    angle,
    feetY: options.feetY,
    preferredRoad: options.preferredRoad,
    source: options.source || 'direct'
  });
  if (direct.valid) return direct;

  const roadFallback = searchNearestSafeRoadSpawn(x, z, {
    mode: 'drive',
    angle,
    feetY: options.feetY,
    preferredRoad: options.preferredRoad,
    maxDistance: options.maxRoadDistance,
    preferVisibleShell: options.preferVisibleShell !== false,
    strictMaxDistance
  });
  if (roadFallback) return roadFallback;

  return fallbackResolvedSpawn('drive', { x, z, angle, source: 'drive_fallback' });
}

function applyResolvedWorldSpawn(spawn, options = {}) {
  if (!spawn) return null;
  const resolved = spawn.valid === false ?
    fallbackResolvedSpawn(options.mode || spawn.mode || 'drive', {
      x: spawn.x,
      z: spawn.z,
      angle: spawn.angle,
      source: 'invalid_spawn_fallback'
    }) :
    spawn;

  const syncCar = options.syncCar !== false;
  const syncWalker = options.syncWalker !== false;

  if (syncCar && appCtx.car) {
    appCtx.car.x = resolved.x;
    appCtx.car.z = resolved.z;
    appCtx.car.angle = finiteNumberOr(resolved.angle, appCtx.car.angle);
    appCtx.car.y = resolved.carY;
    appCtx.car.speed = 0;
    appCtx.car.vx = 0;
    appCtx.car.vz = 0;
    appCtx.car.vy = 0;
    appCtx.car.vFwd = 0;
    appCtx.car.vLat = 0;
    appCtx.car.yawRate = 0;
    appCtx.car.rearSlip = 0;
    appCtx.car._lastSurfaceY = null;
    appCtx.car._terrainAirTimer = 0;
    appCtx.car.isAirborne = false;
    appCtx.car.onRoad = !!resolved.onRoad;
    appCtx.car.road = resolved.road || null;
    appCtx.car._lastStableRoad = resolved.road || null;
    if (typeof appCtx.invalidateRoadCache === 'function') appCtx.invalidateRoadCache();
    if (appCtx.carMesh) {
      appCtx.carMesh.position.set(resolved.x, resolved.carY, resolved.z);
      appCtx.carMesh.rotation.y = appCtx.car.angle;
      appCtx.carMesh.updateMatrixWorld(true);
    }
  }

  if (syncWalker && appCtx.Walk?.state?.walker) {
    const walker = appCtx.Walk.state.walker;
    walker.x = resolved.x;
    walker.z = resolved.z;
    walker.y = resolved.walkY;
    walker.vy = 0;
    walker.angle = finiteNumberOr(resolved.angle, walker.angle);
    walker.yaw = finiteNumberOr(resolved.angle, walker.yaw);
    walker.speedMph = 0;
    walker.onBuilding = false;
    if (appCtx.Walk.state.characterMesh && appCtx.Walk.state.mode === 'walk') {
      appCtx.Walk.state.characterMesh.position.set(resolved.x, resolved.walkY - 1.7, resolved.z);
      appCtx.Walk.state.characterMesh.rotation.y = walker.angle;
    }
  }

  return resolved;
}

function shouldPreserveExplicitPlayerTarget(originX = 0, originZ = 0) {
  const lastTeleport = appCtx.lastExplicitTeleport;
  if (!lastTeleport || typeof lastTeleport !== 'object') return false;
  const teleportAt = Number(lastTeleport.at || 0);
  if (!Number.isFinite(teleportAt) || Date.now() - teleportAt > 30000) return false;
  const targetX = finiteNumberOr(lastTeleport.x, NaN);
  const targetZ = finiteNumberOr(lastTeleport.z, NaN);
  if (!Number.isFinite(targetX) || !Number.isFinite(targetZ)) return false;
  const actor = currentMapReferenceGeoPosition();
  const actorNearExplicitTarget =
    Number.isFinite(actor?.x) &&
    Number.isFinite(actor?.z) &&
    Math.hypot(actor.x - targetX, actor.z - targetZ) <= 220;
  if (!actorNearExplicitTarget) return false;
  return Math.hypot(targetX - finiteNumberOr(originX, 0), targetZ - finiteNumberOr(originZ, 0)) >= 520;
}

function clearRecentExplicitTeleportTarget(reason = '') {
  if (!appCtx.lastExplicitTeleport || typeof appCtx.lastExplicitTeleport !== 'object') return;
  appCtx.lastExplicitTeleport = null;
  if (reason) {
    _continuousWorldInteractiveStreamState.lastError = String(reason);
  }
}

function recentExplicitTeleportTargetState(actorX = NaN, actorZ = NaN, options = {}) {
  const lastTeleport = appCtx.lastExplicitTeleport;
  if (!lastTeleport || typeof lastTeleport !== 'object') return { active: false };
  const teleportAt = Number(lastTeleport.at || 0);
  const storedMaxAgeMs = Number(lastTeleport.maxAgeMs);
  const maxAgeMs =
    Number.isFinite(options.maxAgeMs) ? Math.max(0, options.maxAgeMs) :
    Number.isFinite(storedMaxAgeMs) ? Math.max(0, storedMaxAgeMs) :
      12000;
  if (!Number.isFinite(teleportAt) || Date.now() - teleportAt > maxAgeMs) return { active: false };
  const targetX = finiteNumberOr(lastTeleport.x, NaN);
  const targetZ = finiteNumberOr(lastTeleport.z, NaN);
  if (!Number.isFinite(targetX) || !Number.isFinite(targetZ)) return { active: false };
  const radius = Number.isFinite(options.radius) ? Math.max(0, options.radius) : 240;
  const actorNearTarget =
    Number.isFinite(actorX) &&
    Number.isFinite(actorZ) &&
    Math.hypot(actorX - targetX, actorZ - targetZ) <= radius;
  return {
    active: actorNearTarget,
    x: targetX,
    z: targetZ,
    source: String(lastTeleport.source || '')
  };
}

function validateActiveDriveSpawnAfterWorldBuild(options = {}) {
  if (!appCtx.car || typeof appCtx.resolveSafeWorldSpawn !== 'function') return null;
  const carX = finiteNumberOr(appCtx.car.x, 0);
  const carZ = finiteNumberOr(appCtx.car.z, 0);
  const actorFeetY = finiteNumberOr(appCtx.car.y, 1.2) - 1.2;
  const preferredRoad = appCtx.car.road || appCtx.car._lastStableRoad || null;
  const nearestRoad = typeof findNearestRoad === 'function' ?
    findNearestRoad(carX, carZ, {
      y: actorFeetY + 1.2,
      maxVerticalDelta: 18,
      preferredRoad
    }) :
    null;
  const onRoad = isRoadSurfaceReachable(nearestRoad, {
    currentRoad: preferredRoad,
    extraVerticalAllowance: 0.5
  }) && !!nearestRoad?.road;
  const roadHalfWidth = Math.max(0, Number(nearestRoad?.road?.width || 0) * 0.5);
  const closeRoadContact =
    !!nearestRoad?.road &&
    Number.isFinite(nearestRoad?.dist) &&
    nearestRoad.dist <= Math.max(4.5, roadHalfWidth + 1.8);
  const visibleRoadMeshesNearActor = countVisibleRoadMeshesNearWorldPoint(carX, carZ, 220);
  const nearbyDriveableRoadFeatures = countDriveableRoadFeaturesNearWorldPoint(carX, carZ, 240);
  const minVisibleSpawnRoadShell = 4;
  const buildingCheck = typeof appCtx.checkBuildingCollision === 'function' ?
    appCtx.checkBuildingCollision(carX, carZ, 2.0, {
      actorBaseY: actorFeetY,
      actorHeight: 1.9
    }) :
    { collision: false };
  const blockedByBuilding = !!(buildingCheck?.collision && !shouldIgnoreDriveCollision(buildingCheck, carX, carZ));
  if (
    !blockedByBuilding &&
    onRoad &&
    closeRoadContact &&
    visibleRoadMeshesNearActor >= minVisibleSpawnRoadShell
  ) {
    return null;
  }

  if (
    nearbyDriveableRoadFeatures >= 8 &&
    typeof appCtx.requestWorldSurfaceSync === 'function'
  ) {
    appCtx.requestWorldSurfaceSync({ force: true, source: 'post_build_spawn_visible_shell' });
  }

  const resolved = resolveSafeWorldSpawn(carX, carZ, {
    mode: 'drive',
    angle: finiteNumberOr(appCtx.car?.angle, 0),
    feetY: actorFeetY,
    preferredRoad,
    maxRoadDistance: Number.isFinite(options.maxRoadDistance) ? options.maxRoadDistance : 420,
    strictMaxDistance: true,
    preferVisibleShell: true,
    source: options.source || 'post_build_spawn_validation'
  });
  if (!resolved?.valid) return null;
  return applyResolvedWorldSpawn(resolved, {
    mode: 'drive',
    syncCar: true,
    syncWalker: true
  });
}

function applySpawnTarget(worldX, worldZ, options = {}) {
  const resolved = resolveSafeWorldSpawn(worldX, worldZ, options);
  return applyResolvedWorldSpawn(resolved, options);
}

function tryAutoEnterBoatAt(worldX, worldZ, options = {}) {
  if (!options?.preferBoatIfWater) return null;
  if (typeof appCtx.setTravelMode !== 'function' && typeof appCtx.enterBoatAtWorldPoint !== 'function') return null;
  const entryMode = options.mode === 'walk' ? 'walk' : 'drive';
  const maxWaterDistance = Number.isFinite(options.maxWaterDistance) ? Number(options.maxWaterDistance) : 140;
  const allowSynthetic = !!(
    options.allowSyntheticWater ||
    (
      appCtx.selLoc === 'custom' &&
      (!Array.isArray(appCtx.roads) || appCtx.roads.length === 0) &&
      (!Array.isArray(appCtx.waterAreas) || appCtx.waterAreas.length === 0) &&
      (!Array.isArray(appCtx.waterways) || appCtx.waterways.length === 0)
    )
  );
  const candidate =
    options.candidate ||
    (
      typeof appCtx.inspectBoatCandidate === 'function' ?
        appCtx.inspectBoatCandidate(worldX, worldZ, maxWaterDistance) :
        null
    );
  if (!candidate) {
    if (typeof appCtx.ensureWaterRuntimeCoverage === 'function') {
      void appCtx.ensureWaterRuntimeCoverage({
        force: false,
        showStatus: false,
        updateLod: false,
        reason: 'teleport_water_candidate'
      });
    }
    return null;
  }
  const started =
    typeof appCtx.startBoatMode === 'function' ?
      !!appCtx.startBoatMode({
        source: options.source || 'water_target',
        force: true,
        emitTutorial: options.emitTutorial !== false,
        candidate,
        spawnX: Number.isFinite(candidate.spawnX) ? candidate.spawnX : undefined,
        spawnZ: Number.isFinite(candidate.spawnZ) ? candidate.spawnZ : undefined,
        entryMode,
        waterKind: candidate.waterKind || options.waterKind || 'open_ocean'
      }) :
    typeof appCtx.setTravelMode === 'function' ?
      appCtx.setTravelMode('boat', {
        source: options.source || 'water_target',
        force: true,
        emitTutorial: options.emitTutorial !== false,
        candidate,
        spawnX: Number.isFinite(candidate.spawnX) ? candidate.spawnX : undefined,
        spawnZ: Number.isFinite(candidate.spawnZ) ? candidate.spawnZ : undefined,
        entryMode,
        allowSynthetic,
        waterKind: candidate.waterKind || options.waterKind || 'open_ocean'
      }) === 'boat' :
      appCtx.enterBoatAtWorldPoint(worldX, worldZ, {
        source: options.source || 'water_target',
        entryMode,
        emitTutorial: options.emitTutorial !== false,
        maxDistance: maxWaterDistance,
        allowSynthetic,
        waterKind: options.waterKind || 'open_ocean',
        candidate
      });
  if (!started) return null;
  if (typeof appCtx.syncTravelModeButtons === 'function') {
    appCtx.syncTravelModeButtons();
  }
  if (typeof appCtx.updateControlsModeUI === 'function') {
    appCtx.updateControlsModeUI();
  }
  return {
    valid: true,
    mode: 'boat',
    x: Number(appCtx.boat?.x || worldX),
    z: Number(appCtx.boat?.z || worldZ),
    y: Number(appCtx.boat?.y || 0),
    angle: Number(appCtx.boat?.angle || 0),
    onRoad: false,
    source: options.source || 'water_target'
  };
}

function applyCustomLocationSpawn(mode = 'walk', options = {}) {
  const boatSpawn = tryAutoEnterBoatAt(0, 0, {
    ...options,
    mode,
    source: options.source || 'custom_location'
  });
  if (boatSpawn) return boatSpawn;
  return applySpawnTarget(0, 0, {
    ...options,
    mode
  });
}

function spawnOnRoad(options = {}) {
  const opts = options && typeof options === 'object' ? options : {};

  if (!appCtx.roads || appCtx.roads.length === 0) {
    return applySpawnTarget(0, 0, {
      mode: 'drive',
      source: 'no_roads_fallback'
    });
  }

  if (opts.random === true) {
    const randomRoad = appCtx.roads[Math.floor(Math.random() * appCtx.roads.length)];
    if (randomRoad?.pts?.length) {
      const point = randomRoad.pts[Math.floor(Math.random() * randomRoad.pts.length)];
      const randomSpawn = searchNearestSafeRoadSpawn(point.x, point.z, {
        mode: 'drive',
        angle: appCtx.car?.angle,
        maxDistance: 180,
        avoidOverhead: true,
        preferVisibleShell: true
      });
      if (randomSpawn) return applyResolvedWorldSpawn(randomSpawn, { mode: 'drive' });
    }
  }

  const originX = finiteNumberOr(opts.x, 0);
  const originZ = finiteNumberOr(opts.z, 0);
  const bestRoadSpawn = searchNearestSafeRoadSpawn(originX, originZ, {
    mode: 'drive',
    angle: appCtx.car?.angle,
    maxDistance: 420,
    avoidOverhead: true,
    preferVisibleShell: true
  });
  if (bestRoadSpawn) return applyResolvedWorldSpawn(bestRoadSpawn, { mode: 'drive' });

  return applySpawnTarget(originX, originZ, {
    mode: 'drive',
    source: 'spawn_on_road_fallback'
  });
}

function teleportToLocation(worldX, worldZ, options = {}) {
  const walkModeActive = !!(appCtx.Walk && appCtx.Walk.state && appCtx.Walk.state.mode === 'walk');
  const mode = walkModeActive ? 'walk' : 'drive';
  const currentAngle = walkModeActive ?
    finiteNumberOr(appCtx.Walk?.state?.walker?.angle, appCtx.car?.angle) :
    finiteNumberOr(appCtx.car?.angle, 0);
  const currentFeetY = walkModeActive ?
    finiteNumberOr(appCtx.Walk?.state?.walker?.y, 0) - 1.7 :
    NaN;
  const currentX = walkModeActive ?
    finiteNumberOr(appCtx.Walk?.state?.walker?.x, appCtx.car?.x) :
    finiteNumberOr(appCtx.car?.x, 0);
  const currentZ = walkModeActive ?
    finiteNumberOr(appCtx.Walk?.state?.walker?.z, appCtx.car?.z) :
    finiteNumberOr(appCtx.car?.z, 0);
  const targetDistance = Math.hypot(finiteNumberOr(worldX, 0) - currentX, finiteNumberOr(worldZ, 0) - currentZ);
  const strictTargetTeleport =
    options.strictMaxDistance === true ||
    (
      mode === 'drive' &&
      targetDistance >= 640 &&
      (
        !!options.preferredRoad ||
        /(?:^|_)(teleport|map|continuity|streaming|feature|overlay|regions)(?:_|$)/i.test(String(options.source || ''))
      )
    );

  const boatSpawn = tryAutoEnterBoatAt(worldX, worldZ, {
    ...options,
    mode,
    source: options.source || 'teleport'
  });
  if (boatSpawn) {
    if (appCtx.droneMode) {
      appCtx.drone.x = boatSpawn.x;
      appCtx.drone.z = boatSpawn.z;
      appCtx.drone.yaw = boatSpawn.angle;
    }
    return boatSpawn;
  }

  const resolved = applySpawnTarget(worldX, worldZ, {
    ...options,
    mode,
    angle: currentAngle,
    feetY: currentFeetY,
    preferredRoad: options.preferredRoad || appCtx.car?.road || appCtx.car?._lastStableRoad || null,
    strictMaxDistance: strictTargetTeleport,
    source: options.source || 'teleport'
  });

  if (appCtx.droneMode && resolved) {
    appCtx.drone.x = resolved.x;
    appCtx.drone.z = resolved.z;
    appCtx.drone.yaw = resolved.angle;
  }
  if (resolved?.valid) {
    appCtx.lastExplicitTeleport = {
      x: Number(resolved.x || 0),
      z: Number(resolved.z || 0),
      at: Date.now(),
      maxAgeMs: strictTargetTeleport ? 12000 : 6000,
      source: String(options.source || 'teleport')
    };
    if (strictTargetTeleport) {
      if (_continuousWorldInteractiveStreamState.pending) {
        if (_continuousWorldInteractiveStreamState.abortController) {
          try {
            _continuousWorldInteractiveStreamState.abortController.abort();
          } catch {}
        }
        _continuousWorldInteractiveStreamState.pending = false;
        _continuousWorldInteractiveStreamState.pendingStartedAt = 0;
        _continuousWorldInteractiveStreamState.pendingQueryLat = NaN;
        _continuousWorldInteractiveStreamState.pendingQueryLon = NaN;
        _continuousWorldInteractiveStreamState.pendingRegionKey = null;
        _continuousWorldInteractiveStreamState.abortController = null;
        _continuousWorldInteractiveStreamState.activeRequestId =
          Number(_continuousWorldInteractiveStreamState.activeRequestId || 0) + 1;
        _continuousWorldInteractiveStreamState.lastError = 'teleport_preempt_pending';
      }
      _continuousWorldInteractiveStreamState.lastKickAt = 0;
      const visibleRoadsNearTarget = countVisibleRoadMeshesNearWorldPoint(resolved.x, resolved.z, mode === 'drone' ? 420 : mode === 'walk' ? 220 : 320);
      const visibleBuildingsNearTarget = countVisibleBuildingMeshesNearWorldPoint(resolved.x, resolved.z, mode === 'drone' ? 560 : mode === 'walk' ? 260 : 360);
      const roadFeaturesNearTarget = countDriveableRoadFeaturesNearWorldPoint(resolved.x, resolved.z, mode === 'drone' ? 520 : mode === 'walk' ? 240 : 360);
      const teleportFollowupReason =
        mode === 'drive' ?
          (
            roadFeaturesNearTarget <= 0 || visibleRoadsNearTarget <= 0 ?
              'actor_visible_road_gap' :
            visibleBuildingsNearTarget < Math.max(10, Number(ACTOR_BUILDING_SHELL_CONFIG.drive?.minVisibleBuildings || 0)) ?
              'building_continuity_drive' :
              null
          ) :
        roadFeaturesNearTarget <= 0 || visibleRoadsNearTarget <= 0 ?
          'actor_visible_road_gap' :
        mode === 'walk' && visibleBuildingsNearTarget < 10 ?
          'building_continuity_walk' :
        mode === 'drone' && visibleBuildingsNearTarget < 10 ?
          'building_continuity_drone' :
          null;
      if (teleportFollowupReason) {
        window.setTimeout(() => {
          const targetGeo = typeof appCtx.worldToLatLon === 'function' ? appCtx.worldToLatLon(resolved.x, resolved.z) : null;
          if (!Number.isFinite(targetGeo?.lat) || !Number.isFinite(targetGeo?.lon)) return;
          if (typeof loadContinuousWorldInteractiveChunk === 'function') {
            void loadContinuousWorldInteractiveChunk(targetGeo.lat, targetGeo.lon, teleportFollowupReason);
          }
        }, 0);
      }
      scheduleContinuousWorldActorAreaHardRecovery({
        targetX: resolved.x,
        targetZ: resolved.z,
        mode,
        delayMs: 2600,
        source: 'teleport_hard_recovery'
      });
    }
  }
  return resolved;
}

// Convert minimap screen coordinates to world coordinates
function minimapScreenToWorld(screenX, screenY) {
  const refGeo = currentMapReferenceGeoPosition();
  const refLat = Number(refGeo?.lat);
  const refLon = Number(refGeo?.lon);

  const zoom = Number.isFinite(appCtx.minimapZoom) ? appCtx.minimapZoom : 15;
  const n = Math.pow(2, zoom);
  const xtile_float = (refLon + 180) / 360 * n;
  const ytile_float = (1 - Math.log(Math.tan(refLat * Math.PI / 180) + 1 / Math.cos(refLat * Math.PI / 180)) / Math.PI) / 2 * n;

  const centerTileX = Math.floor(xtile_float);
  const centerTileY = Math.floor(ytile_float);
  const pixelOffsetX = (xtile_float - centerTileX) * 256;
  const pixelOffsetY = (ytile_float - centerTileY) * 256;

  // Convert screen coords to tile coords
  const mx = 75,my = 75; // Minimap center (150x150 canvas / 2)
  const px = screenX - mx;
  const py = screenY - my;

  const xt = centerTileX + (px + pixelOffsetX) / 256;
  const yt = centerTileY + (py + pixelOffsetY) / 256;

  // Convert tile coords to lat/lon
  const lon = xt / n * 360 - 180;
  const lat_rad = Math.atan(Math.sinh(Math.PI * (1 - 2 * yt / n)));
  const lat = lat_rad * 180 / Math.PI;

  return geoPointToWorld(lat, lon);
}

// Convert large map screen coordinates to world coordinates
function largeMapScreenToWorld(screenX, screenY) {
  const refGeo = currentMapReferenceGeoPosition();
  const refLat = Number(refGeo?.lat);
  const refLon = Number(refGeo?.lon);

  const zoom = appCtx.largeMapZoom;
  const n = Math.pow(2, zoom);
  const xtile_float = (refLon + 180) / 360 * n;
  const ytile_float = (1 - Math.log(Math.tan(refLat * Math.PI / 180) + 1 / Math.cos(refLat * Math.PI / 180)) / Math.PI) / 2 * n;

  const centerTileX = Math.floor(xtile_float);
  const centerTileY = Math.floor(ytile_float);
  const pixelOffsetX = (xtile_float - centerTileX) * 256;
  const pixelOffsetY = (ytile_float - centerTileY) * 256;

  // Convert screen coords to tile coords
  const mx = 400,my = 400; // Large map center (800x800 canvas / 2)
  const px = screenX - mx;
  const py = screenY - my;

  const xt = centerTileX + (px + pixelOffsetX) / 256;
  const yt = centerTileY + (py + pixelOffsetY) / 256;

  // Convert tile coords to lat/lon
  const lon = xt / n * 360 - 180;
  const lat_rad = Math.atan(Math.sinh(Math.PI * (1 - 2 * yt / n)));
  const lat = lat_rad * 180 / Math.PI;

  return geoPointToWorld(lat, lon);
}

// Reuse result object to avoid GC
const _nearRoadResult = {
  road: null,
  dist: Infinity,
  pt: { x: 0, z: 0 },
  y: NaN,
  verticalDelta: Infinity,
  distanceAlong: NaN,
  distanceToEndpoint: Infinity,
  distanceToTransitionZone: Infinity
};

function roadContinuityCandidates(preferredRoad) {
  if (!preferredRoad) return [];
  const candidates = [preferredRoad];
  const seen = new Set([preferredRoad]);
  const strongCorridorSeeds = [];
  const endpoints = ['start', 'end'];
  for (let i = 0; i < endpoints.length; i++) {
    const linked = Array.isArray(preferredRoad?.connectedFeatures?.[endpoints[i]]) ? preferredRoad.connectedFeatures[endpoints[i]] : [];
    for (let j = 0; j < linked.length; j++) {
      const feature = linked[j]?.feature || null;
      if (!feature || seen.has(feature)) continue;
      seen.add(feature);
      candidates.push(feature);
      if (roadContinuityStrength(preferredRoad, feature) >= 1.5) {
        strongCorridorSeeds.push(feature);
      }
    }
  }
  for (let i = 0; i < strongCorridorSeeds.length; i++) {
    const road = strongCorridorSeeds[i];
    for (let j = 0; j < endpoints.length; j++) {
      const linked = Array.isArray(road?.connectedFeatures?.[endpoints[j]]) ? road.connectedFeatures[endpoints[j]] : [];
      for (let k = 0; k < linked.length; k++) {
        const feature = linked[k]?.feature || null;
        if (!feature || seen.has(feature)) continue;
        if (roadContinuityStrength(road, feature) < 1.35) continue;
        seen.add(feature);
        candidates.push(feature);
      }
    }
  }
  return candidates;
}

function normalizedRoadNameKey(road) {
  const value = road?.name || road?.structureTags?.name || '';
  return String(value).trim().toLowerCase();
}

function normalizedRoadTypeFamily(road) {
  const value = road?.type || road?.subtype || road?.structureTags?.highway || '';
  return String(value).trim().toLowerCase().replace(/_link$/i, '');
}

function roadLinkLike(road) {
  if (!road) return false;
  const type = String(road?.type || road?.subtype || road?.structureTags?.highway || '');
  return /_link$/i.test(type) || road?.structureSemantics?.rampCandidate === true;
}

function roadEndpointDirection(road, endpointName) {
  const points = Array.isArray(road?.pts) ? road.pts : null;
  if (!points || points.length < 2) return null;
  const from = endpointName === 'start' ? points[0] : points[points.length - 1];
  const toward = endpointName === 'start' ? points[1] : points[points.length - 2];
  if (!from || !toward) return null;
  const dx = toward.x - from.x;
  const dz = toward.z - from.z;
  const length = Math.hypot(dx, dz);
  if (!(length > 1e-5)) return null;
  return { x: dx / length, z: dz / length };
}

function roadConnectionAlignment(road, endpointName, other, otherEndpointIndex) {
  const a = roadEndpointDirection(road, endpointName);
  const b = roadEndpointDirection(other, otherEndpointIndex <= 0 ? 'start' : 'end');
  if (!a || !b) return -1;
  return Math.abs(Math.max(-1, Math.min(1, a.x * b.x + a.z * b.z)));
}

function directRoadContinuityStrength(preferredRoad, road) {
  if (!preferredRoad || !road || preferredRoad === road) return preferredRoad === road ? 3 : 0;
  const preferredName = normalizedRoadNameKey(preferredRoad);
  const roadName = normalizedRoadNameKey(road);
  const preferredFamily = normalizedRoadTypeFamily(preferredRoad);
  const roadFamily = normalizedRoadTypeFamily(road);
  const sameName = !!preferredName && preferredName === roadName;
  const sameFamily = !!preferredFamily && preferredFamily === roadFamily;
  const preferredLinkLike = roadLinkLike(preferredRoad);
  const roadIsLinkLike = roadLinkLike(road);
  let best = 0;
  const endpoints = ['start', 'end'];
  for (let i = 0; i < endpoints.length; i++) {
    const endpointName = endpoints[i];
    const linked = Array.isArray(preferredRoad?.connectedFeatures?.[endpointName]) ? preferredRoad.connectedFeatures[endpointName] : [];
    for (let j = 0; j < linked.length; j++) {
      const entry = linked[j];
      if (entry?.feature !== road) continue;
      const alignment = roadConnectionAlignment(preferredRoad, endpointName, road, Number(entry?.endpointIndex) || 0);
      let strength = 0;
      if (sameName && alignment >= 0.48) {
        strength = preferredLinkLike || roadIsLinkLike ? 2.35 : 2.7;
      } else if (!preferredLinkLike && !roadIsLinkLike && sameFamily && alignment >= 0.78) {
        strength = 2.1;
      } else if ((preferredLinkLike || roadIsLinkLike) && (sameName || sameFamily) && alignment >= 0.8) {
        strength = 1.65;
      } else if (!preferredLinkLike && !roadIsLinkLike && sameFamily && alignment >= 0.92) {
        strength = 1.15;
      } else if (!preferredLinkLike && !roadIsLinkLike && alignment >= 0.985) {
        strength = 0.7;
      }
      if (strength > best) best = strength;
    }
  }
  return best;
}

function roadContinuityStrength(preferredRoad, road) {
  if (!preferredRoad || !road) return 0;
  if (preferredRoad === road) return 3;
  const direct = directRoadContinuityStrength(preferredRoad, road);
  if (direct > 0) return direct;

  const endpoints = ['start', 'end'];
  let best = 0;
  for (let i = 0; i < endpoints.length; i++) {
    const linked = Array.isArray(preferredRoad?.connectedFeatures?.[endpoints[i]]) ? preferredRoad.connectedFeatures[endpoints[i]] : [];
    for (let j = 0; j < linked.length; j++) {
      const middleRoad = linked[j]?.feature || null;
      if (!middleRoad || middleRoad === road) continue;
      const firstHop = directRoadContinuityStrength(preferredRoad, middleRoad);
      if (firstHop < 1.5) continue;
      const secondHop = directRoadContinuityStrength(middleRoad, road);
      if (secondHop < 1.35) continue;
      const strength = Math.min(firstHop, secondHop) - 0.35;
      if (strength > best) best = strength;
    }
  }
  return best;
}

function preferredRoadHardLockSatisfied(hit, preferredRoad) {
  if (!hit || !preferredRoad || hit.road !== preferredRoad) return false;
  const maxDist = roadSurfaceLateralThreshold(preferredRoad, { extraLateralPadding: 0.95 });
  if (!Number.isFinite(hit.dist) || hit.dist > maxDist) return false;
  if (Number.isFinite(hit.verticalDelta)) {
    const maxVertical = roadSurfaceAttachmentThreshold(preferredRoad, { extraVerticalAllowance: 1.45 });
    if (hit.verticalDelta > maxVertical) return false;
  }
  return true;
}

function preferredRoadNeedsJoinRelease(hit, preferredRoad) {
  if (!hit || !preferredRoad || hit.road !== preferredRoad) return false;
  const semantics = preferredRoad?.structureSemantics || null;
  if (semantics?.gradeSeparated || roadBehavesGradeSeparated(preferredRoad)) return false;
  if (!Number.isFinite(hit.distanceAlong) || !Number.isFinite(hit.distanceToEndpoint)) return false;
  if (hit.distanceToEndpoint > 12) return false;

  const profileDistances = preferredRoad?.surfaceDistances instanceof Float32Array ? preferredRoad.surfaceDistances : null;
  const totalDistance =
    profileDistances && profileDistances.length > 0 ?
      Number(profileDistances[profileDistances.length - 1]) || 0 :
      0;
  const nearStart = hit.distanceAlong <= 12;
  const nearEnd = totalDistance > 0 ? (totalDistance - hit.distanceAlong) <= 12 : hit.distanceToEndpoint <= 12;
  const endpointLinks = [];
  if (nearStart) endpointLinks.push(...(Array.isArray(preferredRoad?.connectedFeatures?.start) ? preferredRoad.connectedFeatures.start : []));
  if (nearEnd) endpointLinks.push(...(Array.isArray(preferredRoad?.connectedFeatures?.end) ? preferredRoad.connectedFeatures.end : []));

  return endpointLinks.some((entry) => {
    const feature = entry?.feature || null;
    if (!feature) return false;
    return feature?.structureSemantics?.gradeSeparated || roadBehavesGradeSeparated(feature);
  });
}

function preferredRoadRelevantAtPoint(preferredRoad, x, z, targetY, maxVerticalDelta) {
  if (!preferredRoad || !Array.isArray(preferredRoad?.pts) || preferredRoad.pts.length < 2) return false;
  const projection = projectPointToFeature(preferredRoad, x, z);
  if (!projection || !Number.isFinite(projection.dist)) return false;
  const maxDist = roadSurfaceLateralThreshold(preferredRoad, { extraLateralPadding: 1.2 });
  if (projection.dist > maxDist) return false;
  if (Number.isFinite(targetY)) {
    const preferredY = sampleFeatureSurfaceY(preferredRoad, x, z, projection);
    if (Number.isFinite(preferredY)) {
      const maxVertical = Math.max(
        maxVerticalDelta,
        roadSurfaceAttachmentThreshold(preferredRoad, { extraVerticalAllowance: 1.6 }) + 3
      );
      if (Math.abs(preferredY - targetY) > maxVertical) return false;
    }
  }
  return true;
}

function evaluateNearestRoadCandidate(road, x, z, targetY, maxVerticalDelta, preferredRoad, terrainYAtPoint = NaN) {
  const pts = Array.isArray(road?.pts) ? road.pts : null;
  if (!pts || pts.length < 2) return null;
  const semantics = road?.structureSemantics || null;
  const gradeSeparatedLike = semantics?.gradeSeparated || roadBehavesGradeSeparated(road);
  const transitionRampLike =
    semantics?.rampCandidate === true &&
    gradeSeparatedLike &&
    semantics?.terrainMode !== 'elevated' &&
    semantics?.terrainMode !== 'subgrade';
  const queryWithoutHeight = !Number.isFinite(targetY);
  const profileDistances = road?.surfaceDistances instanceof Float32Array ? road.surfaceDistances : null;
  const transitionAnchors = Array.isArray(road?.structureTransitionAnchors) ? road.structureTransitionAnchors : [];
  let totalDistance = Number.isFinite(profileDistances?.[profileDistances.length - 1]) ? Number(profileDistances[profileDistances.length - 1]) : NaN;
  if (!Number.isFinite(totalDistance) || totalDistance <= 0) {
    totalDistance = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      totalDistance += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
    }
  }
  let best = null;
  let cumulativeDistance = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const len2 = dx * dx + dz * dz;
    if (len2 === 0) continue;
    const segLen = Math.sqrt(len2);
    let t = ((x - p1.x) * dx + (z - p1.z) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const nx = p1.x + t * dx;
    const nz = p1.z + t * dz;
    const d = Math.hypot(x - nx, z - nz);
    const projected = { x: nx, z: nz, dist: d, segIndex: i, t };
    const roadY = sampleFeatureSurfaceY(road, x, z, projected);
    const verticalDelta = Number.isFinite(targetY) && Number.isFinite(roadY) ? Math.abs(roadY - targetY) : 0;
    const distanceAlong =
      profileDistances && profileDistances.length > i ?
        Number(profileDistances[i]) + segLen * t :
        cumulativeDistance + segLen * t;
    const distanceToEndpoint = Math.min(distanceAlong, Math.max(0, totalDistance - distanceAlong));
    let distanceToTransitionZone = Infinity;
    for (let j = 0; j < transitionAnchors.length; j++) {
      const anchor = transitionAnchors[j];
      const anchorDistance = Number(anchor?.distance);
      if (!Number.isFinite(anchorDistance)) continue;
      const span = Math.max(0, Number(anchor?.span) || 0);
      const zoneDistance = Math.max(0, Math.abs(distanceAlong - anchorDistance) - span);
      if (zoneDistance < distanceToTransitionZone) distanceToTransitionZone = zoneDistance;
    }
    if (verticalDelta > maxVerticalDelta) {
      cumulativeDistance += segLen;
      continue;
    }
    const elevatedLike = semantics?.terrainMode === 'elevated' || (gradeSeparatedLike && !transitionRampLike);
    let verticalWeight =
      transitionRampLike ? 0.62 :
      elevatedLike ? 0.82 :
      semantics?.terrainMode === 'subgrade' ? 0.72 :
      0.38;
    let weightedDist = d + (Number.isFinite(targetY) && Number.isFinite(roadY) ? verticalDelta * verticalWeight : 0);
    if (preferredRoad) {
      const sameRoad = road === preferredRoad;
      const connectedRoad = !sameRoad && (
        Array.isArray(preferredRoad?.connectedFeatures?.start) && preferredRoad.connectedFeatures.start.some((entry) => entry?.feature === road) ||
        Array.isArray(preferredRoad?.connectedFeatures?.end) && preferredRoad.connectedFeatures.end.some((entry) => entry?.feature === road)
      );
      const continuityStrength = sameRoad ? 3 : roadContinuityStrength(preferredRoad, road);
      const sameVerticalGroup =
        preferredRoad?.structureSemantics?.verticalGroup &&
        road?.structureSemantics?.verticalGroup === preferredRoad.structureSemantics.verticalGroup;
      if (sameRoad) {
        weightedDist = d + verticalDelta * 0.12;
      } else if (continuityStrength >= 2.2) {
        weightedDist = d + verticalDelta * 0.13;
      } else if (continuityStrength >= 1.45) {
        weightedDist = d + verticalDelta * 0.17;
      } else if (connectedRoad) {
        weightedDist = d + verticalDelta * 0.24;
      } else if (sameVerticalGroup) {
        weightedDist = d + verticalDelta * 0.32;
      }
      if (sameRoad) weightedDist -= 3.4;
      else if (continuityStrength >= 2.2) weightedDist -= 2.75;
      else if (continuityStrength >= 1.45) weightedDist -= 1.95;
      else if (connectedRoad) weightedDist -= 0.7;
      else if (sameVerticalGroup) weightedDist -= 0.7;
      if ((sameRoad || continuityStrength >= 1.45) && (t < 0.08 || t > 0.92)) weightedDist -= 0.55;
      if (
        !roadBehavesGradeSeparated(preferredRoad) &&
        !roadBehavesGradeSeparated(road) &&
        connectedRoad &&
        continuityStrength < 1.0 &&
        Number.isFinite(distanceToEndpoint) &&
        distanceToEndpoint <= 18
      ) {
        weightedDist += 1.4;
      }
    }
    const continuityAccess =
      !!preferredRoad && (
        road === preferredRoad ||
        roadContinuityStrength(preferredRoad, road) >= 1.0 ||
        areRoadsConnected(preferredRoad, road) ||
        (
          preferredRoad?.structureSemantics?.verticalGroup &&
          road?.structureSemantics?.verticalGroup === preferredRoad.structureSemantics.verticalGroup
        )
      );
    const roadHeightAboveTerrain =
      Number.isFinite(terrainYAtPoint) && Number.isFinite(roadY) ?
        roadY - terrainYAtPoint :
        NaN;
    if (queryWithoutHeight && Number.isFinite(d) && d <= 0.85) {
      const exactProjectionWeight = d <= 0.35 ? 22 : 22 * Math.max(0, 1 - ((d - 0.35) / 0.5));
      weightedDist -= exactProjectionWeight;
      if (Number.isFinite(roadHeightAboveTerrain)) {
        if (transitionRampLike) {
          weightedDist -= Math.min(2.2, Math.max(0, 6.5 - roadHeightAboveTerrain) * 0.32);
        } else if (roadHeightAboveTerrain > 5.5) {
          weightedDist += Math.min(14, (roadHeightAboveTerrain - 5.5) * 1.3);
        }
      }
    }
    const surfaceReferenceY = Number.isFinite(targetY) ? targetY : terrainYAtPoint;
    const surfaceNearTerrain =
      Number.isFinite(surfaceReferenceY) &&
      Number.isFinite(terrainYAtPoint) &&
      Math.abs(surfaceReferenceY - terrainYAtPoint) <= 2.4;
    if (
      elevatedLike &&
      !continuityAccess &&
      surfaceNearTerrain &&
      Number.isFinite(roadHeightAboveTerrain) &&
      roadHeightAboveTerrain > 8
    ) {
      weightedDist += 9 + Math.min(24, (roadHeightAboveTerrain - 8) * 1.35);
    }
    if (
      preferredRoad &&
      !roadBehavesGradeSeparated(preferredRoad) &&
      elevatedLike &&
      !continuityAccess &&
      Number.isFinite(roadHeightAboveTerrain) &&
      roadHeightAboveTerrain > 5.5
    ) {
      weightedDist += 4.5 + Math.min(18, (roadHeightAboveTerrain - 5.5) * 1.2);
    }
    if (gradeSeparatedLike && !continuityAccess && Number.isFinite(verticalDelta)) {
      const directLockThreshold = elevatedLike ? 1.25 : 1.35;
      const transitionLockThreshold = elevatedLike ? 1.65 : 1.85;
      const nearTransition = Number.isFinite(distanceToTransitionZone) && distanceToTransitionZone <= 1.2;
      const attachable =
        verticalDelta <= directLockThreshold ||
        (nearTransition && verticalDelta <= transitionLockThreshold);
      if (!attachable) {
        weightedDist += 5.5 + Math.min(10, verticalDelta * 1.8);
      }
    }
    if (!best || weightedDist < best.weightedDist) {
      best = {
        road,
        dist: d,
        pt: { x: nx, z: nz },
        y: roadY,
        verticalDelta,
        weightedDist,
        distanceAlong,
        distanceToEndpoint,
        distanceToTransitionZone
      };
    }
    cumulativeDistance += segLen;
  }
  return best;
}

function findNearestRoad(x, z, options = {}) {
  _nearRoadResult.road = null;
  _nearRoadResult.dist = Infinity;
  _nearRoadResult.y = NaN;
  _nearRoadResult.verticalDelta = Infinity;
  _nearRoadResult.distanceAlong = NaN;
  _nearRoadResult.distanceToEndpoint = Infinity;
  _nearRoadResult.distanceToTransitionZone = Infinity;
  const targetY = Number.isFinite(options?.y) ? Number(options.y) : NaN;
  const maxVerticalDelta = Number.isFinite(options?.maxVerticalDelta) ? Math.max(0.5, Number(options.maxVerticalDelta)) : Infinity;
  const requestedPreferredRoad = options?.preferredRoad || null;
  const preferredRoad = preferredRoadRelevantAtPoint(requestedPreferredRoad, x, z, targetY, maxVerticalDelta) ? requestedPreferredRoad : null;
  const terrainYAtPoint =
    typeof appCtx.GroundHeight?.terrainY === 'function' ?
      Number(appCtx.GroundHeight.terrainY(x, z)) :
    typeof appCtx.terrainMeshHeightAt === 'function' ?
      Number(appCtx.terrainMeshHeightAt(x, z)) :
    typeof appCtx.elevationWorldYAtWorldXZ === 'function' ?
      Number(appCtx.elevationWorldYAtWorldXZ(x, z)) :
      NaN;
  let bestWeighted = Infinity;

  const roads = runtimeRoadFeatures();
  if (preferredRoad) {
    const preferredCandidates = roadContinuityCandidates(preferredRoad);
    for (let i = 0; i < preferredCandidates.length; i++) {
      const preferredHit = evaluateNearestRoadCandidate(preferredCandidates[i], x, z, targetY, maxVerticalDelta, preferredRoad, terrainYAtPoint);
      if (!preferredHit) continue;
      if (preferredHit.weightedDist < bestWeighted) {
        bestWeighted = preferredHit.weightedDist;
        _nearRoadResult.road = preferredHit.road;
        _nearRoadResult.dist = preferredHit.dist;
        _nearRoadResult.pt.x = preferredHit.pt.x;
        _nearRoadResult.pt.z = preferredHit.pt.z;
        _nearRoadResult.y = preferredHit.y;
        _nearRoadResult.verticalDelta = preferredHit.verticalDelta;
        _nearRoadResult.distanceAlong = preferredHit.distanceAlong;
        _nearRoadResult.distanceToEndpoint = preferredHit.distanceToEndpoint;
        _nearRoadResult.distanceToTransitionZone = preferredHit.distanceToTransitionZone;
      }
      if (preferredRoadHardLockSatisfied(preferredHit, preferredRoad) && !preferredRoadNeedsJoinRelease(preferredHit, preferredRoad)) {
        return _nearRoadResult;
      }
    }
  }

  for (let r = 0; r < roads.length; r++) {
    const road = roads[r];
    if (preferredRoad && road === preferredRoad) continue;
    const pts = road.pts;
    // Quick bounding box skip: check if first point is way too far
    const fp = pts[0];
    const roughDist = Math.abs(x - fp.x) + Math.abs(z - fp.z);
    if (roughDist > _nearRoadResult.dist + 500) continue;
    const hit = evaluateNearestRoadCandidate(road, x, z, targetY, maxVerticalDelta, preferredRoad, terrainYAtPoint);
    if (!hit || hit.weightedDist >= bestWeighted) continue;
    bestWeighted = hit.weightedDist;
    _nearRoadResult.road = hit.road;
    _nearRoadResult.dist = hit.dist;
    _nearRoadResult.pt.x = hit.pt.x;
    _nearRoadResult.pt.z = hit.pt.z;
    _nearRoadResult.y = hit.y;
    _nearRoadResult.verticalDelta = hit.verticalDelta;
    _nearRoadResult.distanceAlong = hit.distanceAlong;
    _nearRoadResult.distanceToEndpoint = hit.distanceToEndpoint;
    _nearRoadResult.distanceToTransitionZone = hit.distanceToTransitionZone;
  }
  return _nearRoadResult;
}

// Point-in-polygon test using ray casting algorithm
function pointInPolygon(x, z, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x,zi = polygon[i].z;
    const xj = polygon[j].x,zj = polygon[j].z;
    const intersect = zi > z !== zj > z && x < (xj - xi) * (z - zi) / (zj - zi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function getMeshLodCenter(mesh) {
  if (!mesh) return null;
  const cached = mesh.userData?.lodCenter;
  if (cached && Number.isFinite(cached.x) && Number.isFinite(cached.z)) return cached;

  const poiPos = mesh.userData?.poiPosition;
  if (poiPos && Number.isFinite(poiPos.x) && Number.isFinite(poiPos.z)) {
    return poiPos;
  }

  const footprint = mesh.userData?.buildingFootprint || mesh.userData?.landuseFootprint;
  if (Array.isArray(footprint) && footprint.length > 0) {
    let sumX = 0;
    let sumZ = 0;
    for (let i = 0; i < footprint.length; i++) {
      sumX += footprint[i].x;
      sumZ += footprint[i].z;
    }
    const center = { x: sumX / footprint.length, z: sumZ / footprint.length };
    mesh.userData.lodCenter = center;
    return center;
  }

  if (mesh.geometry) {
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    const bs = mesh.geometry.boundingSphere;
    if (bs && Number.isFinite(bs.center.x) && Number.isFinite(bs.center.z)) {
      const px = Number.isFinite(mesh.position?.x) ? mesh.position.x : 0;
      const pz = Number.isFinite(mesh.position?.z) ? mesh.position.z : 0;
      const center = { x: bs.center.x + px, z: bs.center.z + pz };
      mesh.userData.lodCenter = center;
      return center;
    }
  }

  if (mesh.position && Number.isFinite(mesh.position.x) && Number.isFinite(mesh.position.z)) {
    return { x: mesh.position.x, z: mesh.position.z };
  }
  return null;
}

function countVisibleRoadMeshesNearWorldPoint(x, z, maxDistance = 220) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
  let count = 0;
  const roadMeshes = Array.isArray(appCtx.roadMeshes) ? appCtx.roadMeshes : [];
  const limit = Math.max(48, Number(maxDistance) || 0);
  const actorBounds = playableCoreBoundsFromCenter(x, z, limit);
  for (let i = 0; i < roadMeshes.length; i++) {
    const mesh = roadMeshes[i];
    if (!mesh?.visible) continue;
    const bounds = playableCoreTargetBounds(mesh);
    if (bounds) {
      if (boundsIntersect(bounds, actorBounds, 24)) count += 1;
      continue;
    }
    const center = getMeshLodCenter(mesh) || mesh.position;
    if (center && Math.hypot(Number(center.x || 0) - x, Number(center.z || 0) - z) <= limit) count += 1;
  }
  return count;
}

function countVisibleBuildingMeshesNearWorldPoint(x, z, maxDistance = 320) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
  const buildingMeshes = Array.isArray(appCtx.buildingMeshes) ? appCtx.buildingMeshes : [];
  const limit = Math.max(64, Number(maxDistance) || 0);
  const seen = new Set();
  let count = 0;
  for (let i = 0; i < buildingMeshes.length; i++) {
    const mesh = buildingMeshes[i];
    if (!mesh?.visible) continue;
    const center = getMeshLodCenter(mesh);
    if (!center) continue;
    if (Math.hypot(Number(center.x || 0) - x, Number(center.z || 0) - z) > limit) continue;
    const sourceBuildingId = String(mesh?.userData?.sourceBuildingId || '').trim();
    if (sourceBuildingId) {
      if (seen.has(sourceBuildingId)) continue;
      seen.add(sourceBuildingId);
      count += 1;
      continue;
    }
    if (mesh?.userData?.isBuildingBatch) {
      count += Math.max(1, Number(mesh.userData?.batchCount || 1));
      continue;
    }
    count += 1;
  }

  const overlayGroup =
    appCtx.overlayPublishedGroup ||
    (typeof appCtx.scene?.getObjectByName === 'function' ? appCtx.scene.getObjectByName('overlayPublishedGroup') : null);
  const overlayChildren = Array.isArray(overlayGroup?.children) ? overlayGroup.children : [];
  if (overlayGroup?.visible !== false && overlayChildren.length > 0) {
    for (let i = 0; i < overlayChildren.length; i++) {
      const object = overlayChildren[i];
      if (!object?.visible) continue;
      if (String(object?.userData?.overlayFeatureClass || '').toLowerCase() !== 'building') continue;
      const center = getMeshLodCenter(object);
      if (!center) continue;
      if (Math.hypot(Number(center.x || 0) - x, Number(center.z || 0) - z) > limit) continue;
      const sourceBuildingId = String(object?.userData?.sourceBuildingId || object?.userData?.overlayFeatureId || '').trim();
      if (sourceBuildingId) {
        if (seen.has(sourceBuildingId)) continue;
        seen.add(sourceBuildingId);
        count += 1;
        continue;
      }
      count += 1;
    }
  }
  return count;
}

function countVisibleDetailedBuildingMeshesNearWorldPoint(x, z, maxDistance = 320) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
  const buildingMeshes = Array.isArray(appCtx.buildingMeshes) ? appCtx.buildingMeshes : [];
  const limit = Math.max(64, Number(maxDistance) || 0);
  const seen = new Set();
  let count = 0;
  for (let i = 0; i < buildingMeshes.length; i++) {
    const mesh = buildingMeshes[i];
    if (!mesh?.visible) continue;
    if (mesh?.userData?.isBuildingProxy || String(mesh?.userData?.lodTier || 'near') === 'mid') continue;
    const center = getMeshLodCenter(mesh);
    if (!center) continue;
    if (Math.hypot(Number(center.x || 0) - x, Number(center.z || 0) - z) > limit) continue;
    const sourceBuildingId = String(mesh?.userData?.sourceBuildingId || '').trim();
    if (sourceBuildingId) {
      if (seen.has(sourceBuildingId)) continue;
      seen.add(sourceBuildingId);
      count += 1;
      continue;
    }
    if (mesh?.userData?.isBuildingBatch) {
      count += Math.max(1, Number(mesh.userData?.batchCount || 1));
      continue;
    }
    count += 1;
  }

  const overlayGroup =
    appCtx.overlayPublishedGroup ||
    (typeof appCtx.scene?.getObjectByName === 'function' ? appCtx.scene.getObjectByName('overlayPublishedGroup') : null);
  const overlayChildren = Array.isArray(overlayGroup?.children) ? overlayGroup.children : [];
  if (overlayGroup?.visible !== false && overlayChildren.length > 0) {
    for (let i = 0; i < overlayChildren.length; i++) {
      const object = overlayChildren[i];
      if (!object?.visible) continue;
      if (String(object?.userData?.overlayFeatureClass || '').toLowerCase() !== 'building') continue;
      const center = getMeshLodCenter(object);
      if (!center) continue;
      if (Math.hypot(Number(center.x || 0) - x, Number(center.z || 0) - z) > limit) continue;
      const sourceBuildingId = String(object?.userData?.sourceBuildingId || object?.userData?.overlayFeatureId || '').trim();
      if (sourceBuildingId) {
        if (seen.has(sourceBuildingId)) continue;
        seen.add(sourceBuildingId);
        count += 1;
        continue;
      }
      count += 1;
    }
  }
  return count;
}

let _lastLodRefX = 0;
let _lastLodRefZ = 0;
let _lastLodReady = false;
let _lastLodActorRegionKey = '';
let _lastLodMode = '';
let _worldLodDirtyReason = '';
let _lastActorVisibleRoadGapSyncAt = 0;
let _lastActorVisibleRoadGapLoadAt = 0;
let _lastActorVisibleRoadGapRegionKey = '';
let _lastActorBuildingGapLoadAt = 0;
let _lastActorBuildingGapRegionKey = '';

function driveableRoadFeatureBounds(road) {
  if (!road) return null;
  if (
    Number.isFinite(road?.bounds?.minX) &&
    Number.isFinite(road?.bounds?.maxX) &&
    Number.isFinite(road?.bounds?.minZ) &&
    Number.isFinite(road?.bounds?.maxZ)
  ) {
    return road.bounds;
  }
  const points = Array.isArray(road?.pts) ? road.pts : null;
  if (!points || points.length < 2) return null;
  return polylineBounds(points, Math.max(6, Number(road?.width || 6)));
}

function countDriveableRoadFeaturesNearWorldPoint(x, z, maxDistance = 220) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
  const queryBounds = playableCoreBoundsFromCenter(x, z, Math.max(48, Number(maxDistance) || 0));
  const roads = runtimeRoadFeatures();
  let count = 0;
  for (let i = 0; i < roads.length; i++) {
    const road = roads[i];
    if (!isVehicleRoad(road)) continue;
    const bounds = driveableRoadFeatureBounds(road);
    if (!boundsIntersect(bounds, queryBounds, 12)) continue;
    count += 1;
  }
  return count;
}

function continuousWorldInteractiveNeedsRoadShellRecovery(actorState = null) {
  const actor = actorState || continuousWorldInteractiveActorMotionState();
  const mode = String(actor?.mode || 'drive');
  const cfg = ACTOR_ROAD_SHELL_CONFIG[mode];
  if (!cfg) return false;
  if (!Number.isFinite(actor?.x) || !Number.isFinite(actor?.z)) return false;
  const visibleRoads = countVisibleRoadMeshesNearWorldPoint(actor.x, actor.z, cfg.visibleRadius);
  const roadFeatures = countDriveableRoadFeaturesNearWorldPoint(actor.x, actor.z, Math.max(cfg.visibleRadius + 40, cfg.visibleRadius));
  const startupPhase = !!appCtx._continuousWorldVisibleLoadConfig?.startupPhase;
  const worldBuildStage = String(appCtx.worldBuildStage || '');
  const startupProtectedRoadShell =
    startupPhase &&
    (
      worldBuildStage === 'playable_core_ready' ||
      worldBuildStage === 'partial_world_ready' ||
      worldBuildStage === 'full_world_ready'
    ) &&
    Math.hypot(actor.x, actor.z) <= Math.max(260, Number(cfg.visibleRadius || 320) * 0.75) &&
    Math.abs(Number(actor?.speed || 0)) < 6;
  const explicitTeleportContinuity =
    mode === 'drive' &&
    recentExplicitTeleportTargetState(actor.x, actor.z, { radius: 260 }).active;
  if (
    startupProtectedRoadShell &&
    roadFeatures >= Math.max(8, Math.floor(Number(cfg.minRoadFeatures || 0) * 0.5)) &&
    visibleRoads >= Math.max(6, Number(cfg.minVisibleRoads || 0) - 4)
  ) {
    return false;
  }
  if (
    mode === 'drive' &&
    visibleRoads <= 0 &&
    roadFeatures <= 0 &&
    (actor?.onRoad === false || explicitTeleportContinuity)
  ) {
    return true;
  }
  const minRoadFeaturesForRecovery =
    mode === 'drive' ?
      Math.max(cfg.minVisibleRoads, Math.floor(Number(cfg.minRoadFeatures || 0) * 0.5)) :
      Number(cfg.minRoadFeatures || 0);
  return roadFeatures >= minRoadFeaturesForRecovery && visibleRoads < cfg.minVisibleRoads;
}

function continuousWorldInteractiveNeedsBuildingShellRecovery(actorState = null) {
  const actor = actorState || continuousWorldInteractiveActorMotionState();
  const mode = String(actor?.mode || 'drive');
  const cfg = ACTOR_BUILDING_SHELL_CONFIG[mode];
  if (!cfg) return false;
  if (!Number.isFinite(actor?.x) || !Number.isFinite(actor?.z)) return false;
  const runtimeSnapshot =
    typeof appCtx.getContinuousWorldRuntimeSnapshot === 'function' ?
      appCtx.getContinuousWorldRuntimeSnapshot() :
      null;
  const actorRegionKey = String(runtimeSnapshot?.activeRegion?.key || '').trim();
  const startupPhase = !!appCtx._continuousWorldVisibleLoadConfig?.startupPhase;
  const worldBuildStage = String(appCtx.worldBuildStage || '');
  const activeRegionBuildingCount = Number(runtimeSnapshot?.featureRegions?.activeRegion?.buildings?.count || 0);
  const startupProtectedShell =
    startupPhase &&
    (
      worldBuildStage === 'playable_core_ready' ||
      worldBuildStage === 'partial_world_ready' ||
      worldBuildStage === 'full_world_ready'
    ) &&
    Math.hypot(actor.x, actor.z) <= Math.max(260, Number(cfg.visibleRadius || 320) * 0.75) &&
    (
      activeRegionBuildingCount >= 160 ||
      Number(Array.isArray(appCtx.buildingMeshes) ? appCtx.buildingMeshes.length : 0) >= 220 ||
      Number(Array.isArray(appCtx.startupShellBuildingMeshes) ? appCtx.startupShellBuildingMeshes.length : 0) >= 80
    );
  const recentZeroResultGapCount =
    actorRegionKey ?
      _continuousWorldInteractiveStreamState.coverage.reduce((count, entry) => {
        if (!entry) return count;
        if (String(entry.regionKey || '').trim() !== actorRegionKey) return count;
        const reason = String(entry.reason || '');
        if (reason !== 'actor_building_gap' && !reason.startsWith('building_continuity_')) return count;
        if (Number(entry.addedBuildings || 0) > 0) return count;
        const ageMs = Date.now() - Number(entry.at || 0);
        if (!Number.isFinite(ageMs) || ageMs > 9000) return count;
        return count + 1;
      }, 0) :
      0;
  const visibleBuildings = countVisibleDetailedBuildingMeshesNearWorldPoint(actor.x, actor.z, cfg.visibleRadius);
  const visibleRoads = countVisibleRoadMeshesNearWorldPoint(actor.x, actor.z, Math.max(220, cfg.visibleRadius * 0.8));
  const roadFeatures = countDriveableRoadFeaturesNearWorldPoint(actor.x, actor.z, Math.max(240, cfg.visibleRadius));
  const roadCorridorReady =
    visibleRoads >= cfg.minVisibleRoads ||
    roadFeatures >= cfg.minRoadFeatures;
  if (startupProtectedShell && roadCorridorReady) return false;
  if (recentZeroResultGapCount >= 2 && roadCorridorReady) return false;
  return (
    visibleBuildings < cfg.minVisibleBuildings &&
    roadCorridorReady
  );
}

function markWorldLodDirty(reason = 'runtime_change') {
  _worldLodDirtyReason = String(reason || 'runtime_change');
}

function updateWorldLod(force = false) {
  if (appCtx.onMoon || appCtx.travelingToMoon || (typeof appCtx.isEnv === 'function' && appCtx.ENV && !appCtx.isEnv(appCtx.ENV.EARTH))) {
    const hideList = (arr) => {
      if (!Array.isArray(arr)) return;
      for (let i = 0; i < arr.length; i++) {
        const mesh = arr[i];
        if (!mesh) continue;
        mesh.visible = false;
        if (mesh.parent === appCtx.scene) appCtx.scene.remove(mesh);
      }
    };
    hideList(appCtx.roadMeshes);
    roadMeshLodVisibleSet.clear();
    hideList(appCtx.urbanSurfaceMeshes);
    hideList(appCtx.buildingMeshes);
    hideList(appCtx.landuseMeshes);
    hideList(appCtx.poiMeshes);
    hideList(appCtx.streetFurnitureMeshes);
    if (typeof appCtx.setPerfLiveStat === 'function') {
      appCtx.setPerfLiveStat('lodVisible', { near: 0, mid: 0 });
    }
    return;
  }

  const hasRoadManagedContent =
    (Array.isArray(appCtx.roadMeshes) && appCtx.roadMeshes.length > 0) ||
    (Array.isArray(appCtx.urbanSurfaceMeshes) && appCtx.urbanSurfaceMeshes.length > 0) ||
    (Array.isArray(appCtx.structureVisualMeshes) && appCtx.structureVisualMeshes.length > 0);
  const hasFeatureManagedContent =
    (Array.isArray(appCtx.buildingMeshes) && appCtx.buildingMeshes.length > 0) ||
    (Array.isArray(appCtx.poiMeshes) && appCtx.poiMeshes.length > 0) ||
    (Array.isArray(appCtx.landuseMeshes) && appCtx.landuseMeshes.length > 0) ||
    (Array.isArray(appCtx.streetFurnitureMeshes) && appCtx.streetFurnitureMeshes.length > 0);
  if (!hasRoadManagedContent && !hasFeatureManagedContent) {
    return;
  }

  const ref = appCtx.boatMode?.active && appCtx.boat ?
  appCtx.boat :
  appCtx.Walk && appCtx.Walk.state && appCtx.Walk.state.mode === 'walk' && appCtx.Walk.state.walker ?
  appCtx.Walk.state.walker :
  appCtx.droneMode ? appCtx.drone : appCtx.car;
  const refX = Number.isFinite(ref?.x) ? ref.x : 0;
  const refZ = Number.isFinite(ref?.z) ? ref.z : 0;
  const continuousWorldSnapshot =
    typeof appCtx.getContinuousWorldRuntimeSnapshot === 'function' ?
      appCtx.getContinuousWorldRuntimeSnapshot() :
      null;
  const actorRegionKey = String(continuousWorldSnapshot?.activeRegion?.key || '');
  const actorMode = appCtx.boatMode?.active ? 'boat' :
    appCtx.Walk && appCtx.Walk.state && appCtx.Walk.state.mode === 'walk' ? 'walk' :
    appCtx.droneMode ? 'drone' :
    appCtx.oceanMode?.active ? 'ocean' :
    'drive';
  const mustRefreshForRuntimeMutation =
    !!_worldLodDirtyReason ||
    actorRegionKey !== _lastLodActorRegionKey ||
    actorMode !== _lastLodMode;

  if (!force && _lastLodReady && !mustRefreshForRuntimeMutation) {
    const moved = Math.hypot(refX - _lastLodRefX, refZ - _lastLodRefZ);
    const minMoveForLodUpdate = appCtx.droneMode ? 4 : appCtx.boatMode?.active ? 14 : 8;
    if (moved < minMoveForLodUpdate) return;
  }
  _lastLodRefX = refX;
  _lastLodRefZ = refZ;
  _lastLodReady = true;
  _lastLodActorRegionKey = actorRegionKey;
  _lastLodMode = actorMode;
  _worldLodDirtyReason = '';

  const mode = getPerfModeValue();
  const dynamicBudgetState = getRuntimeDynamicBudget(mode);
  const depthForLod = typeof appCtx.rdtLoadComplexity === 'number' ? appCtx.rdtLoadComplexity :

  typeof appCtx.rdtComplexity === 'number' ? appCtx.rdtComplexity : 0;
  const boatLodScale = appCtx.boatMode?.active ? Math.max(0.34, Math.min(1, Number(appCtx.boatMode.detailBias) || 1)) : 1;
  const lodThresholds = getWorldLodThresholds(depthForLod, mode, dynamicBudgetState.lodScale * boatLodScale);
  const poiMidSq = lodThresholds.mid * lodThresholds.mid;
  const actorState = continuousWorldInteractiveActorMotionState();
  const playableCoreState = updatePlayableCoreResidency(force, {
    actorState,
    runtimeSnapshot: continuousWorldSnapshot,
    reason: 'update_world_lod'
  });
  const roadVisibleRegionKeys = continuousWorldInteractiveRoadRetainRegionKeys(continuousWorldSnapshot, null, actorState);
  const withinActiveFeatureRegions = (mesh) =>
    targetIntersectsContinuousWorldTrackedRegions(mesh, continuousWorldSnapshot);
  const withinRoadFeatureRegions = (mesh) =>
    continuousWorldInteractiveFeatureIntersectsRetainedRegions(mesh?.userData || mesh, roadVisibleRegionKeys);
  const withinPlayableRoadCore = (mesh) =>
    playableCoreIntersectsTarget(mesh, playableCoreState, { structure: false, padding: 32 });
  const withinPlayableStructureCore = (mesh) =>
    playableCoreIntersectsTarget(mesh, playableCoreState, { structure: true, padding: 48 });
  const minVisibleRoadMeshesReady =
    Number(
      PLAYABLE_CORE_RESIDENCY_CONFIG.minVisibleRoadMeshesReady?.[actorMode] ??
      PLAYABLE_CORE_RESIDENCY_CONFIG.minVisibleRoadMeshesReady?.drive ??
      1
    ) || 1;
  const strictRoadRegionScope = continuousWorldRuntimeUsesStrictRegionScope(continuousWorldSnapshot);
  const usePlayableCoreRoadVisibility =
    !strictRoadRegionScope &&
    (
      actorMode !== 'drive' ||
      appCtx.worldLoading ||
      String(appCtx.worldBuildStage || '') !== 'full_world_ready'
    );
  const actorRoadKeepRadius =
    actorMode === 'drive' ?
      Math.max(260, Math.min(playableCoreState.radius * 0.22, Math.abs(Number(actorState?.speed || 0)) >= 8 ? 360 : 300)) :
      0;
  const actorRoadKeepBounds =
    actorRoadKeepRadius > 0 ?
      playableCoreBoundsFromCenter(refX, refZ, actorRoadKeepRadius) :
      null;
  const forwardRoadCorridor = continuousWorldForwardRoadCorridorState(actorState, continuousWorldSnapshot);
  const roadPriorityBounds = mergeWorldBounds(actorRoadKeepBounds, forwardRoadCorridor?.bounds || null);

  if (Array.isArray(appCtx.roadMeshes) && appCtx.roadMeshes.length > 0) {
    if (appCtx.showRoads === false) {
      const hiddenSet = new Set();
      for (let i = 0; i < appCtx.roadMeshes.length; i++) {
        const mesh = appCtx.roadMeshes[i];
        if (!mesh) continue;
        mesh.visible = false;
        hiddenSet.add(mesh);
      }
      roadMeshLodVisibleSet = hiddenSet;
    } else {
    const roadCandidateBounds = roadMeshQueryBoundsFromRetainKeys(
      roadVisibleRegionKeys,
      continuousWorldSnapshot,
      usePlayableCoreRoadVisibility ? playableCoreState : null
    );
    const roadCandidates = getRoadMeshesIntersectingBounds(roadCandidateBounds, 64);
    lastRoadMeshLodCandidateCount = roadCandidates.length;
    const deferRoadHide = shouldDeferInteractiveRoadEviction(actorState);
    const nextRoadVisibleSet = new Set();
    for (let i = 0; i < appCtx.roadMeshes.length; i++) {
      const mesh = appCtx.roadMeshes[i];
      if (!mesh) continue;
      mesh.visible = false;
    }
    const keepActorLocalRoads =
      !strictRoadRegionScope &&
      !!actorRoadKeepBounds &&
      (deferRoadHide || countVisibleRoadMeshesNearWorldPoint(refX, refZ, actorRoadKeepRadius * 0.85) < minVisibleRoadMeshesReady);
    ensureRoadMeshSpatialIndex();
    for (let i = 0; i < roadCandidates.length; i++) {
      const mesh = roadCandidates[i];
      if (!mesh) continue;
      const visible =
        withinRoadFeatureRegions(mesh) ||
        (usePlayableCoreRoadVisibility && withinPlayableRoadCore(mesh)) ||
        (forwardRoadCorridor?.bounds && boundsIntersect(playableCoreTargetBounds(mesh), forwardRoadCorridor.bounds, 40));
      mesh.visible = visible;
      if (visible) nextRoadVisibleSet.add(mesh);
    }
    if (keepActorLocalRoads) {
      const actorRoadCandidates = getRoadMeshesIntersectingBounds(roadPriorityBounds, 48);
      for (let i = 0; i < actorRoadCandidates.length; i++) {
        const mesh = actorRoadCandidates[i];
        if (!mesh) continue;
        mesh.visible = true;
        nextRoadVisibleSet.add(mesh);
      }
    }
    if (
      !strictRoadRegionScope &&
      actorMode === 'drive' &&
      roadPriorityBounds &&
      nextRoadVisibleSet.size < minVisibleRoadMeshesReady
    ) {
      for (let i = 0; i < appCtx.roadMeshes.length; i++) {
        const mesh = appCtx.roadMeshes[i];
        if (!mesh) continue;
        const bounds = playableCoreTargetBounds(mesh);
        if (!boundsIntersect(bounds, roadPriorityBounds, 48)) continue;
        mesh.visible = true;
        nextRoadVisibleSet.add(mesh);
      }
    }
    roadMeshLodVisibleSet.forEach((mesh) => {
      if (!mesh || nextRoadVisibleSet.has(mesh)) return;
      if (roadMeshSpatialIndexMembers.size > 0 && !roadMeshSpatialIndexMembers.has(mesh)) return;
      if (deferRoadHide) {
        mesh.visible = true;
        nextRoadVisibleSet.add(mesh);
        return;
      }
      mesh.visible = false;
    });
    roadMeshLodVisibleSet = nextRoadVisibleSet;
    }
  } else {
    clearRoadMeshSpatialIndex();
  }

  const actorVisibleRoadCount =
    actorMode === 'drive' ?
      countVisibleRoadMeshesNearWorldPoint(refX, refZ, Math.max(220, actorRoadKeepRadius || 220)) :
      0;
  const actorNearbyDriveableRoadFeatures =
    actorMode === 'drive' ?
      countDriveableRoadFeaturesNearWorldPoint(refX, refZ, Math.max(240, actorRoadKeepRadius || 240)) :
      0;
  if (
    actorMode === 'drive' &&
    actorNearbyDriveableRoadFeatures > 0 &&
    actorVisibleRoadCount < minVisibleRoadMeshesReady &&
    typeof appCtx.requestWorldSurfaceSync === 'function' &&
    !appCtx.worldLoading &&
    !continuousWorldInteractiveStartupLockActive()
  ) {
    const now = performance.now();
    if (now - _lastActorVisibleRoadGapSyncAt > 320) {
      _lastActorVisibleRoadGapSyncAt = now;
      appCtx.requestWorldSurfaceSync({ force: true, source: 'actor_visible_road_gap' });
    }
  }

  if (Array.isArray(appCtx.urbanSurfaceMeshes) && appCtx.urbanSurfaceMeshes.length > 0) {
    if (appCtx.showRoads === false) {
      for (let i = 0; i < appCtx.urbanSurfaceMeshes.length; i++) {
        const mesh = appCtx.urbanSurfaceMeshes[i];
        if (mesh) mesh.visible = false;
      }
    } else {
    const keepActorLocalUrban = !strictRoadRegionScope && !!actorRoadKeepBounds && actorMode === 'drive';
    const deferUrbanHide = actorMode === 'drive' && shouldDeferInteractiveRoadEviction(actorState);
    for (let i = 0; i < appCtx.urbanSurfaceMeshes.length; i++) {
      const mesh = appCtx.urbanSurfaceMeshes[i];
      if (!mesh) continue;
      const wasVisible = !!mesh.visible;
      if (deferUrbanHide && wasVisible) {
        mesh.visible = true;
        continue;
      }
      mesh.visible =
        withinRoadFeatureRegions(mesh) ||
        (usePlayableCoreRoadVisibility && withinPlayableRoadCore(mesh)) ||
        (keepActorLocalUrban && boundsIntersect(playableCoreTargetBounds(mesh), actorRoadKeepBounds, 24));
    }
    if (
      !strictRoadRegionScope &&
      actorMode === 'drive' &&
      actorRoadKeepBounds &&
      countVisibleRoadMeshesNearWorldPoint(refX, refZ, Math.max(220, actorRoadKeepRadius || 220)) < minVisibleRoadMeshesReady
    ) {
      for (let i = 0; i < appCtx.urbanSurfaceMeshes.length; i++) {
        const mesh = appCtx.urbanSurfaceMeshes[i];
        if (!mesh) continue;
        if (boundsIntersect(playableCoreTargetBounds(mesh), actorRoadKeepBounds, 24)) mesh.visible = true;
      }
    }
    }
  }

  let nearVisible = 0;
  let midVisible = 0;

  if (mode === 'baseline') {
    for (let i = 0; i < appCtx.buildingMeshes.length; i++) {
      const mesh = appCtx.buildingMeshes[i];
      if (!mesh) continue;
      if (!withinActiveFeatureRegions(mesh)) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      const tier = mesh.userData?.lodTier || 'near';
      const isBatch = !!mesh.userData?.isBuildingBatch;
      const count = isBatch ? Math.max(1, mesh.userData?.batchCount || 1) : 1;
      if (tier === 'mid') midVisible += count;else nearVisible += count;
    }

    for (let i = 0; i < appCtx.poiMeshes.length; i++) {
      const mesh = appCtx.poiMeshes[i];
      if (!mesh) continue;
      mesh.visible = !!appCtx.poiMode;
    }

    for (let i = 0; i < appCtx.landuseMeshes.length; i++) {
      const mesh = appCtx.landuseMeshes[i];
      if (!mesh) continue;
      if (!withinActiveFeatureRegions(mesh)) {
        mesh.visible = false;
        continue;
      }
      if (mesh.userData?.boatSuppressed) {
        mesh.visible = false;
        continue;
      }
      const alwaysVisible = !!mesh.userData?.alwaysVisible;
      mesh.visible = alwaysVisible || !!appCtx.landUseVisible;
    }

    if (Array.isArray(appCtx.structureVisualMeshes)) {
      for (let i = 0; i < appCtx.structureVisualMeshes.length; i++) {
        const mesh = appCtx.structureVisualMeshes[i];
        if (!mesh) continue;
        mesh.visible = withinActiveFeatureRegions(mesh) || withinPlayableStructureCore(mesh);
      }
    }

    if (typeof appCtx.setPerfLiveStat === 'function') {
      appCtx.setPerfLiveStat('lodVisible', { near: nearVisible, mid: midVisible });
    }
    return;
  }

  for (let i = 0; i < appCtx.buildingMeshes.length; i++) {
    const mesh = appCtx.buildingMeshes[i];
    if (!mesh) continue;
    if (!withinActiveFeatureRegions(mesh)) {
      mesh.visible = false;
      continue;
    }

    const center = getMeshLodCenter(mesh);
    if (!center) continue;

    const tier = mesh.userData?.lodTier || 'near';
    const isBatch = !!mesh.userData?.isBuildingBatch;
    const radius = Number.isFinite(mesh.userData?.lodRadius) ? mesh.userData.lodRadius : 0;
    let visibleDist;
    if (tier === 'mid') {
      const batchBoost = isBatch ? Math.min(900, radius * 0.65) : Math.min(450, radius);
      visibleDist = lodThresholds.mid + batchBoost;
    } else {
      const batchBoost = isBatch ? Math.min(1300, radius) : Math.min(800, radius);
      visibleDist = lodThresholds.farVisible + batchBoost;
    }
    const dx = center.x - refX;
    const dz = center.z - refZ;
    const distSq = dx * dx + dz * dz;
    const hysteresis = tier === 'mid' ?
    appCtx.droneMode ? 460 : 280 :
    appCtx.droneMode ? 380 : 220;
    const limitDist = mesh.visible ? visibleDist + hysteresis : visibleDist;
    const visible = distSq <= limitDist * limitDist;
    mesh.visible = visible;
    if (!visible) continue;

    const count = isBatch ? Math.max(1, mesh.userData?.batchCount || 1) : 1;
    if (tier === 'mid') midVisible += count;else
    nearVisible += count;
  }

  for (let i = 0; i < appCtx.poiMeshes.length; i++) {
    const mesh = appCtx.poiMeshes[i];
    if (!mesh) continue;
    const center = getMeshLodCenter(mesh);
    if (!center) continue;

    const dx = center.x - refX;
    const dz = center.z - refZ;
    const distSq = dx * dx + dz * dz;
    const tier = mesh.userData?.lodTier || 'near';
    const radius = Number.isFinite(mesh.userData?.lodRadius) ? mesh.userData.lodRadius : 0;
    const nearDist = lodThresholds.farVisible + Math.min(600, radius);
    const withinLod = tier === 'mid' ? distSq <= poiMidSq : distSq <= nearDist * nearDist;
    mesh.visible = !!appCtx.poiMode && withinLod;
  }

  const landuseVisibleDist = lodThresholds.mid + 120;
  const landuseSq = landuseVisibleDist * landuseVisibleDist;
  for (let i = 0; i < appCtx.landuseMeshes.length; i++) {
    const mesh = appCtx.landuseMeshes[i];
    if (!mesh) continue;
    if (!withinActiveFeatureRegions(mesh)) {
      mesh.visible = false;
      continue;
    }
    if (mesh.userData?.boatSuppressed) {
      mesh.visible = false;
      continue;
    }

    const alwaysVisible = !!mesh.userData?.alwaysVisible;
    if (!appCtx.landUseVisible && !alwaysVisible) {
      mesh.visible = false;
      continue;
    }
    if (alwaysVisible) {
      mesh.visible = true;
      continue;
    }

    if (mesh.userData?.isLanduseBatch) {
      mesh.visible = !!appCtx.landUseVisible;
      continue;
    }

    const center = getMeshLodCenter(mesh);
    if (!center) {
      mesh.visible = appCtx.landUseVisible;
      continue;
    }

    const dx = center.x - refX;
    const dz = center.z - refZ;
    const distSq = dx * dx + dz * dz;
    mesh.visible = distSq <= landuseSq;
  }

  if (Array.isArray(appCtx.structureVisualMeshes) && appCtx.structureVisualMeshes.length > 0) {
    const structureBaseDist = lodThresholds.farVisible + 220;
    for (let i = 0; i < appCtx.structureVisualMeshes.length; i++) {
      const mesh = appCtx.structureVisualMeshes[i];
      if (!mesh) continue;
      if (withinPlayableStructureCore(mesh)) {
        mesh.visible = true;
        continue;
      }
      if (!withinActiveFeatureRegions(mesh)) {
        mesh.visible = false;
        continue;
      }
      const center = getMeshLodCenter(mesh);
      if (!center) {
        mesh.visible = true;
        continue;
      }
      const radius = Number.isFinite(mesh.userData?.lodRadius) ? mesh.userData.lodRadius : 0;
      const visibleDist = structureBaseDist + Math.min(700, radius);
      const hysteresis = appCtx.droneMode ? 260 : 180;
      const limitDist = mesh.visible ? visibleDist + hysteresis : visibleDist;
      const dx = center.x - refX;
      const dz = center.z - refZ;
      mesh.visible = dx * dx + dz * dz <= limitDist * limitDist;
    }
  }

  if (typeof appCtx.setPerfLiveStat === 'function') {
    appCtx.setPerfLiveStat('lodVisible', { near: nearVisible, mid: midVisible });
  }

  if (Array.isArray(appCtx.streetFurnitureMeshes) && appCtx.streetFurnitureMeshes.length > 0) {
    const perfTier = String(appCtx.getPerfAutoQualityTier?.() || appCtx.perfAutoQualityTier || 'balanced');
    const performanceTier = perfTier === 'performance';
    const driveFast = actorMode === 'drive' && Math.abs(Number(appCtx.car?.speed) || 0) > 10;
    const droneActive = !!appCtx.droneMode;
    if (performanceTier) {
      for (let i = 0; i < appCtx.streetFurnitureMeshes.length; i++) {
        const mesh = appCtx.streetFurnitureMeshes[i];
        if (mesh) mesh.visible = false;
      }
      return;
    }
    const furnitureDist =
      appCtx.boatMode?.active ? 160 :
      droneActive ? (performanceTier ? 140 : 180) :
      driveFast ? (performanceTier ? 150 : 210) :
      performanceTier ? 220 : (lodThresholds.mid * 0.45) + 60;
    const furnitureSq = furnitureDist * furnitureDist;
    for (let i = 0; i < appCtx.streetFurnitureMeshes.length; i++) {
      const mesh = appCtx.streetFurnitureMeshes[i];
      if (!mesh) continue;
      if (mesh.userData?.boatSuppressed) {
        mesh.visible = false;
        continue;
      }
      const center = getMeshLodCenter(mesh) || mesh.userData?.furniturePos || mesh.position;
      if (!center) continue;
      const dx = center.x - refX;
      const dz = center.z - refZ;
      mesh.visible = dx * dx + dz * dz <= furnitureSq;
    }
  }
}

// ============================================================================
// Street Furniture - signs, trees, light posts, trash cans
// ============================================================================

// Shared materials (created once, reused for all instances)
let _furnitureMatsReady = false;
let _matPole, _matSignBg, _matTreeShades, _matTrunk, _matLampHead, _matTrashBody, _matTrashLid;

function _initFurnitureMaterials() {
  if (_furnitureMatsReady) return;
  _matPole = new THREE.MeshLambertMaterial({ color: 0x666666 });
  _matSignBg = new THREE.MeshLambertMaterial({ color: 0x2a6e2a });
  _matTreeShades = [
  new THREE.MeshLambertMaterial({ color: 0x1a5c1a }),
  new THREE.MeshLambertMaterial({ color: 0x2d7a2d }),
  new THREE.MeshLambertMaterial({ color: 0x3d8b3d }),
  new THREE.MeshLambertMaterial({ color: 0x4a9e3a }),
  new THREE.MeshLambertMaterial({ color: 0x2a6b3e }),
  new THREE.MeshLambertMaterial({ color: 0x1f6e2f })];

  _matTrunk = new THREE.MeshLambertMaterial({ color: 0x5c3a1e });
  _matLampHead = new THREE.MeshLambertMaterial({ color: 0xdddddd, emissive: 0xffffaa, emissiveIntensity: 0.5 });
  _matTrashBody = new THREE.MeshLambertMaterial({ color: 0x3a5a3a });
  _matTrashLid = new THREE.MeshLambertMaterial({ color: 0x4a4a4a });
  [
    _matPole,
    _matSignBg,
    _matTrunk,
    _matLampHead,
    _matTrashBody,
    _matTrashLid,
    ...(_matTreeShades || [])
  ].forEach((mat) => {
    if (!mat) return;
    mat.userData = { ...(mat.userData || {}), sharedContinuousWorldMaterial: true };
  });
  _furnitureMatsReady = true;
}

// Shared geometries (created once)
let _geoSignPole, _geoSignBoard, _geoTreeCanopy, _geoTreeTrunk, _geoLampPole, _geoLampHead, _geoTrashBody, _geoTrashLid;
let _furnitureGeosReady = false;

function _initFurnitureGeometries() {
  if (_furnitureGeosReady) return;
  _geoSignPole = new THREE.CylinderGeometry(0.1, 0.1, 3.5, 6);
  _geoSignBoard = new THREE.BoxGeometry(4, 0.8, 0.1);
  _geoTreeTrunk = new THREE.CylinderGeometry(0.3, 0.5, 4, 6);
  _geoTreeCanopy = new THREE.SphereGeometry(3, 8, 6);
  _geoLampPole = new THREE.CylinderGeometry(0.12, 0.15, 6, 6);
  _geoLampHead = new THREE.SphereGeometry(0.5, 8, 6);
  _geoTrashBody = new THREE.CylinderGeometry(0.4, 0.35, 1.0, 8);
  _geoTrashLid = new THREE.CylinderGeometry(0.45, 0.45, 0.1, 8);
  _furnitureGeosReady = true;
}

// Cache sign textures/materials by road name to avoid redundant canvas creation
const _signTextureCache = new Map();
let _geoSignText = null;

function _getSignMaterial(name) {
  if (_signTextureCache.has(name)) return _signTextureCache.get(name);

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2a6e2a';
  ctx.fillRect(0, 0, 256, 64);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, 252, 60);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let displayName = name.length > 18 ? name.substring(0, 17) + '…' : name;
  ctx.fillText(displayName, 128, 32);

  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.MeshBasicMaterial({ map: texture });
  texture.userData = { ...(texture.userData || {}), sharedStreetSignTexture: true };
  mat.userData = { ...(mat.userData || {}), sharedStreetSignMaterial: true };
  _signTextureCache.set(name, mat);
  return mat;
}

function createStreetSign(x, z, name, roadAngle) {
  const y = typeof appCtx.terrainMeshHeightAt === 'function' ? appCtx.terrainMeshHeightAt(x, z) : appCtx.elevationWorldYAtWorldXZ(x, z);
  const group = new THREE.Group();

  // Pole
  const pole = new THREE.Mesh(_geoSignPole, _matPole);
  pole.position.y = 1.75;
  group.add(pole);

  // Sign board
  const board = new THREE.Mesh(_geoSignBoard, _matSignBg);
  board.position.y = 3.6;
  group.add(board);

  // Text label - cached per road name
  if (!_geoSignText) _geoSignText = new THREE.PlaneGeometry(4, 0.8);
  const textMat = _getSignMaterial(name);
  const textPlane = new THREE.Mesh(_geoSignText, textMat);
  textPlane.position.y = 3.6;
  textPlane.position.z = 0.06;
  group.add(textPlane);

  // Back side text (same name readable from other side)
  const textPlaneBack = new THREE.Mesh(_geoSignText, textMat);
  textPlaneBack.position.y = 3.6;
  textPlaneBack.position.z = -0.06;
  textPlaneBack.rotation.y = Math.PI;
  group.add(textPlaneBack);

  group.position.set(x, y, z);
  group.rotation.y = roadAngle;
  group.userData.furniturePos = { x, z };
  appCtx.scene.add(group);
  appCtx.streetFurnitureMeshes.push(group);
}

function vegetationSeed(seed) {
  let v = (seed >>> 0) ^ 0x9e3779b9;
  v ^= v >>> 16;
  v = Math.imul(v, 0x7feb352d);
  v ^= v >>> 15;
  v = Math.imul(v, 0x846ca68b);
  v ^= v >>> 16;
  return v >>> 0;
}

function samplePolylinePointAtDistance(pts, distance) {
  if (!Array.isArray(pts) || pts.length < 2) return null;
  let remaining = Math.max(0, Number(distance) || 0);
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    if (!(segLen > 0)) continue;
    if (remaining <= segLen || i === pts.length - 2) {
      const t = segLen > 0 ? Math.max(0, Math.min(1, remaining / segLen)) : 0;
      return {
        x: p1.x + (p2.x - p1.x) * t,
        z: p1.z + (p2.z - p1.z) * t
      };
    }
    remaining -= segLen;
  }
  return pts[pts.length - 1] ? { x: pts[pts.length - 1].x, z: pts[pts.length - 1].z } : null;
}

function polylineLength(pts) {
  let total = 0;
  if (!Array.isArray(pts)) return total;
  for (let i = 0; i < pts.length - 1; i++) {
    total += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
  }
  return total;
}

function isInsideBuildingCollider(x, z, building) {
  if (!building || building.collisionDisabled) return false;
  if (x < building.minX || x > building.maxX || z < building.minZ || z > building.maxZ) return false;
  if (Array.isArray(building.pts) && building.pts.length >= 3) {
    return pointInPolygon(x, z, building.pts);
  }
  return true;
}

function isInsideWaterArea(x, z) {
  if (!Array.isArray(appCtx.waterAreas) || appCtx.waterAreas.length === 0) return false;
  for (let i = 0; i < appCtx.waterAreas.length; i++) {
    const area = appCtx.waterAreas[i];
    if (!Array.isArray(area?.pts) || area.pts.length < 3) continue;
    if (pointInPolygon(x, z, area.pts)) return true;
  }
  return false;
}

function isVegetationPlacementBlocked(x, z, options = {}) {
  const roadPadding = Number.isFinite(options.roadPadding) ? options.roadPadding : 4.5;
  const buildingPadding = Number.isFinite(options.buildingPadding) ? options.buildingPadding : 1.8;
  const terrainY = typeof appCtx.baseTerrainHeightAt === 'function' ?
    appCtx.baseTerrainHeightAt(x, z) :
    typeof appCtx.terrainMeshHeightAt === 'function' ?
      appCtx.terrainMeshHeightAt(x, z) :
      appCtx.elevationWorldYAtWorldXZ(x, z);

  const nr = typeof findNearestRoad === 'function' ? findNearestRoad(x, z, {
    y: Number.isFinite(terrainY) ? terrainY + 0.4 : NaN,
    maxVerticalDelta: 4.5
  }) : { road: null, dist: Infinity };
  if (isRoadSurfaceReachable(nr, {
    extraLateralPadding: roadPadding - 1.35,
    extraVerticalAllowance: 0.2
  })) {
    return true;
  }

  const nearbyBuildings = typeof getNearbyBuildings === 'function' ?
    getNearbyBuildings(x, z, buildingPadding + 10) :
    (Array.isArray(appCtx.buildings) ? appCtx.buildings : []);
  for (let i = 0; i < nearbyBuildings.length; i++) {
    const building = nearbyBuildings[i];
    if (!building || building.collisionDisabled) continue;
    if (
      x < building.minX - buildingPadding ||
      x > building.maxX + buildingPadding ||
      z < building.minZ - buildingPadding ||
      z > building.maxZ + buildingPadding
    ) {
      continue;
    }
    if (isInsideBuildingCollider(x, z, building)) return true;
  }

  if (isInsideWaterArea(x, z)) return true;
  return false;
}

function collectVegetationPlacements() {
  const placements = [];
  const treeNodes = Array.isArray(appCtx.osmTreeNodes) ? appCtx.osmTreeNodes : [];
  const treeRows = Array.isArray(appCtx.osmTreeRows) ? appCtx.osmTreeRows : [];
  const worldDensityScale = vegetationWorldDensityScale();
  const budgetScale =
    appCtx.rdtComplexity >= 6 ? 0.55 :
    appCtx.rdtComplexity >= 4 ? 0.72 :
    appCtx.rdtComplexity >= 2 ? 0.88 : 1;
  const maxTrees = Math.max(120, Math.floor(MAX_GENERATED_TREE_INSTANCES * budgetScale * worldDensityScale));
  const pushPlacement = (placement) => {
    if (!placement || placements.length >= maxTrees) return false;
    if (!Number.isFinite(placement.x) || !Number.isFinite(placement.z)) return false;
    if (isVegetationPlacementBlocked(placement.x, placement.z, placement.options || undefined)) return false;
    placements.push(placement);
    return true;
  };

  for (let i = 0; i < treeNodes.length && placements.length < maxTrees; i++) {
    const node = treeNodes[i];
    if (!node || !Number.isFinite(node.lat) || !Number.isFinite(node.lon)) continue;
    const pos = appCtx.geoToWorld(node.lat, node.lon);
    const seed = vegetationSeed((appCtx.rdtSeed ^ Number(node.id || i + 1)) >>> 0);
    pushPlacement({
      x: pos.x,
      z: pos.z,
      scale: 0.82 + appCtx.rand01FromInt(seed ^ 0x7f4a7c15) * 0.78,
      canopyStretch: 0.82 + appCtx.rand01FromInt(seed ^ 0x165667b1) * 0.32,
      rotation: appCtx.rand01FromInt(seed ^ 0x27d4eb2f) * Math.PI * 2,
      color: [0x265f24, 0x2f7329, 0x3f7d32, 0x4d8f40][Math.floor(appCtx.rand01FromInt(seed ^ 0x85ebca6b) * 4) % 4],
      source: 'node',
      landuseType: 'tree',
      options: { roadPadding: 1.25, buildingPadding: 0.9 }
    });
  }

  for (let i = 0; i < treeRows.length && placements.length < maxTrees; i++) {
    const way = treeRows[i];
    const rawPts = way?.nodes?.map((id) => appCtx._worldLoadNodes?.[id]).filter(Boolean).map((n) => appCtx.geoToWorld(n.lat, n.lon)) || [];
    const pts = sanitizeWorldPathPoints(rawPts);
    if (pts.length < 2) continue;
    const totalLength = polylineLength(pts);
    const rowCount = Math.min(32, Math.max(2, Math.floor(totalLength / TREE_ROW_SPACING)));
    const rowSeed = vegetationSeed((appCtx.rdtSeed ^ Number(way.id || i + 1)) >>> 0);
    for (let p = 0; p < rowCount && placements.length < maxTrees; p++) {
      const spacingNoise = 0.65 + appCtx.rand01FromInt(rowSeed ^ p ^ 0x9e3779b9) * 0.7;
      const point = samplePolylinePointAtDistance(pts, p * TREE_ROW_SPACING * spacingNoise);
      if (!point) continue;
      const seed = vegetationSeed(rowSeed ^ p ^ 0x85ebca6b);
      pushPlacement({
        x: point.x,
        z: point.z,
        scale: 0.86 + appCtx.rand01FromInt(seed ^ 0x7f4a7c15) * 0.62,
        canopyStretch: 0.88 + appCtx.rand01FromInt(seed ^ 0x27d4eb2f) * 0.24,
        rotation: appCtx.rand01FromInt(seed ^ 0x165667b1) * Math.PI * 2,
        color: [0x2c6726, 0x356f2d, 0x3a7b33][Math.floor(appCtx.rand01FromInt(seed ^ 0xd3a2646c) * 3) % 3],
        source: 'tree_row',
        landuseType: 'tree_row',
        options: { roadPadding: 1.75, buildingPadding: 1.0 }
      });
    }
  }

  for (let i = 0; i < appCtx.landuses.length && placements.length < maxTrees; i++) {
    const lu = appCtx.landuses[i];
    if (!lu || !VEGETATION_ELIGIBLE_TYPES.has(lu.type) || !Array.isArray(lu.pts) || lu.pts.length < 3) continue;
    const cfg = TREE_DENSITY_BY_LANDUSE[lu.type] || TREE_DENSITY_BY_LANDUSE.park;
    const densityScale = vegetationLanduseDensityScale(lu.type);
    const area = Math.abs(signedPolygonAreaXZ(lu.pts));
    if (!(area > 24)) continue;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let p = 0; p < lu.pts.length; p++) {
      const point = lu.pts[p];
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minZ = Math.min(minZ, point.z);
      maxZ = Math.max(maxZ, point.z);
    }
    const width = maxX - minX;
    const depth = maxZ - minZ;
    if (!(width > 2) || !(depth > 2)) continue;

    const desired = Math.min(
      Math.max(2, Math.floor(area / Math.max(60, cfg.spacing * cfg.spacing * cfg.weight / Math.max(0.42, densityScale)))),
      Math.max(4, Math.floor(cfg.maxPerPolygon * budgetScale * densityScale))
    );
    const polySeed = vegetationSeed((appCtx.rdtSeed ^ (i + 1) ^ Math.floor(area * 10)) >>> 0);
    for (let attempt = 0; attempt < desired * 8 && placements.length < maxTrees; attempt++) {
      const seed = vegetationSeed(polySeed ^ attempt);
      const tx = minX + appCtx.rand01FromInt(seed ^ 0x7f4a7c15) * width;
      const tz = minZ + appCtx.rand01FromInt(seed ^ 0x165667b1) * depth;
      if (!pointInPolygon(tx, tz, lu.pts)) continue;
      pushPlacement({
        x: tx,
        z: tz,
        scale: 0.78 + appCtx.rand01FromInt(seed ^ 0x27d4eb2f) * (lu.type === 'forest' || lu.type === 'wood' ? 0.92 : lu.type === 'scrub' ? 0.58 : 0.68),
        canopyStretch: 0.84 + appCtx.rand01FromInt(seed ^ 0x9e3779b9) * 0.38,
        rotation: appCtx.rand01FromInt(seed ^ 0x85ebca6b) * Math.PI * 2,
        color: (
          lu.type === 'forest' || lu.type === 'wood' ?
            [0x1d5620, 0x275f22, 0x2f6c27, 0x3d7a31] :
            lu.type === 'scrub' ?
              [0x607d3b, 0x6f8a41, 0x7d9550] :
            lu.type === 'orchard' ?
              [0x356f2d, 0x4b8a3a, 0x5d9441] :
              [0x2f7329, 0x417f34, 0x4e8c41]
        )[Math.floor(appCtx.rand01FromInt(seed ^ 0xd3a2646c) * 4) % (lu.type === 'orchard' || lu.type === 'scrub' ? 3 : 4)],
        source: 'polygon',
        landuseType: lu.type,
        options: {
          roadPadding:
            lu.type === 'forest' || lu.type === 'wood' ? 2.2 :
            lu.type === 'scrub' ? 1.85 :
            lu.type === 'orchard' ? 2.0 :
            1.45,
          buildingPadding: lu.type === 'forest' || lu.type === 'wood' ? 1.1 : lu.type === 'scrub' ? 1.0 : 0.9
        }
      });
    }
  }

  if (placements.length === 0 && Array.isArray(appCtx.landuses)) {
    for (let i = 0; i < appCtx.landuses.length && placements.length < 24; i++) {
      const lu = appCtx.landuses[i];
      if (!lu || !VEGETATION_ELIGIBLE_TYPES.has(lu.type) || !Array.isArray(lu.pts) || lu.pts.length < 3) continue;
      const centroid = polygonCentroid(lu.pts);
      if (!centroid || isVegetationPlacementBlocked(centroid.x, centroid.z, { roadPadding: 0.8, buildingPadding: 0.6 })) continue;
      placements.push({
        x: centroid.x,
        z: centroid.z,
        scale: 0.92,
        canopyStretch: 1.0,
        rotation: 0,
        color: 0x356f2d,
        source: 'fallback_polygon',
        landuseType: lu.type,
        options: { roadPadding: 0.8, buildingPadding: 0.6 }
      });
    }
  }

  if (placements.length === 0 && treeNodes.length > 0) {
    for (let i = 0; i < treeNodes.length && placements.length < 16; i++) {
      const node = treeNodes[i];
      if (!node || !Number.isFinite(node.lat) || !Number.isFinite(node.lon)) continue;
      const pos = appCtx.geoToWorld(node.lat, node.lon);
      if (isVegetationPlacementBlocked(pos.x, pos.z, { roadPadding: 0.45, buildingPadding: 0.3 })) continue;
      const seed = vegetationSeed((appCtx.rdtSeed ^ Number(node.id || i + 1) ^ 0x6a09e667) >>> 0);
      placements.push({
        x: pos.x,
        z: pos.z,
        scale: 0.84 + appCtx.rand01FromInt(seed ^ 0x7f4a7c15) * 0.42,
        canopyStretch: 0.9 + appCtx.rand01FromInt(seed ^ 0x165667b1) * 0.2,
        rotation: appCtx.rand01FromInt(seed ^ 0x27d4eb2f) * Math.PI * 2,
        color: [0x2c6726, 0x356f2d, 0x3d7a31][Math.floor(appCtx.rand01FromInt(seed ^ 0x85ebca6b) * 3) % 3],
        source: 'fallback_tree_node',
        landuseType: 'tree',
        options: { roadPadding: 0.45, buildingPadding: 0.3 }
      });
    }
  }

  if (placements.length === 0 && treeNodes.length > 0) {
    for (let i = 0; i < treeNodes.length && placements.length < 8; i++) {
      const node = treeNodes[i];
      if (!node || !Number.isFinite(node.lat) || !Number.isFinite(node.lon)) continue;
      const pos = appCtx.geoToWorld(node.lat, node.lon);
      const seed = vegetationSeed((appCtx.rdtSeed ^ Number(node.id || i + 1) ^ 0x510e527f) >>> 0);
      placements.push({
        x: pos.x,
        z: pos.z,
        scale: 0.82 + appCtx.rand01FromInt(seed ^ 0x7f4a7c15) * 0.28,
        canopyStretch: 0.94 + appCtx.rand01FromInt(seed ^ 0x165667b1) * 0.16,
        rotation: appCtx.rand01FromInt(seed ^ 0x27d4eb2f) * Math.PI * 2,
        color: [0x2c6726, 0x356f2d, 0x3d7a31][Math.floor(appCtx.rand01FromInt(seed ^ 0x85ebca6b) * 3) % 3],
        source: 'fallback_tree_node_unblocked',
        landuseType: 'tree',
        options: { roadPadding: 0, buildingPadding: 0 }
      });
    }
  }

  return placements;
}

function buildVegetationInstancing(placements) {
  if (typeof THREE === 'undefined' || !Array.isArray(placements) || placements.length === 0) return 0;
  _initFurnitureMaterials();
  _initFurnitureGeometries();

  const trunkMesh = new THREE.InstancedMesh(_geoTreeTrunk, _matTrunk, placements.length);
  const canopyMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
  const canopyMesh = new THREE.InstancedMesh(_geoTreeCanopy, canopyMat, placements.length);
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();

  trunkMesh.castShadow = false;
  trunkMesh.receiveShadow = false;
  canopyMesh.castShadow = false;
  canopyMesh.receiveShadow = false;
  trunkMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  canopyMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

  for (let i = 0; i < placements.length; i++) {
    const placement = placements[i];
    const baseY = typeof appCtx.terrainMeshHeightAt === 'function' ?
      appCtx.terrainMeshHeightAt(placement.x, placement.z) :
      appCtx.elevationWorldYAtWorldXZ(placement.x, placement.z);
    const trunkScale = Math.max(0.65, Number(placement.scale) || 1);
    const canopyStretch = Math.max(0.72, Number(placement.canopyStretch) || 1);
    euler.set(0, Number(placement.rotation) || 0, 0);
    quat.setFromEuler(euler);

    scale.set(trunkScale, trunkScale, trunkScale);
    matrix.compose(
      new THREE.Vector3(placement.x, baseY + 2 * trunkScale, placement.z),
      quat,
      scale
    );
    trunkMesh.setMatrixAt(i, matrix);

    scale.set(trunkScale, trunkScale * canopyStretch, trunkScale);
    matrix.compose(
      new THREE.Vector3(placement.x, baseY + (4 + 2.5) * trunkScale, placement.z),
      quat,
      scale
    );
    canopyMesh.setMatrixAt(i, matrix);
    color.setHex(Number(placement.color) || 0x2f7329);
    canopyMesh.setColorAt(i, color);
  }

  trunkMesh.instanceMatrix.needsUpdate = true;
  canopyMesh.instanceMatrix.needsUpdate = true;
  if (canopyMesh.instanceColor) canopyMesh.instanceColor.needsUpdate = true;

  trunkMesh.userData.isVegetationBatch = true;
  canopyMesh.userData.isVegetationBatch = true;
  trunkMesh.frustumCulled = false;
  canopyMesh.frustumCulled = false;
  appCtx.scene.add(trunkMesh);
  appCtx.scene.add(canopyMesh);
  appCtx.vegetationMeshes.push(trunkMesh, canopyMesh);
  appCtx.vegetationFeatures = placements;
  return placements.length;
}

function createTree(x, z, sizeVariation) {
  const y = typeof appCtx.terrainMeshHeightAt === 'function' ? appCtx.terrainMeshHeightAt(x, z) : appCtx.elevationWorldYAtWorldXZ(x, z);
  const group = new THREE.Group();
  const scale = 0.7 + sizeVariation * 0.8;

  // Trunk
  const trunk = new THREE.Mesh(_geoTreeTrunk, _matTrunk);
  trunk.position.y = 2 * scale;
  trunk.scale.set(scale, scale, scale);
  group.add(trunk);

  // Canopy - pick random shade from pre-made pool
  const canopy = new THREE.Mesh(_geoTreeCanopy, _matTreeShades[Math.floor(Math.random() * _matTreeShades.length)]);
  canopy.position.y = (4 + 2.5) * scale;
  canopy.scale.set(scale, scale * (0.8 + Math.random() * 0.4), scale);
  canopy.castShadow = false; // Disabled for performance
  group.add(canopy);

  group.position.set(x, y, z);
  group.userData.furniturePos = { x, z };
  appCtx.scene.add(group);
  appCtx.streetFurnitureMeshes.push(group);
}

function createLightPost(x, z) {
  const y = typeof appCtx.terrainMeshHeightAt === 'function' ? appCtx.terrainMeshHeightAt(x, z) : appCtx.elevationWorldYAtWorldXZ(x, z);
  const group = new THREE.Group();

  const pole = new THREE.Mesh(_geoLampPole, _matPole);
  pole.position.y = 3;
  group.add(pole);

  const head = new THREE.Mesh(_geoLampHead, _matLampHead);
  head.position.y = 6.2;
  group.add(head);

  group.position.set(x, y, z);
  group.userData.furniturePos = { x, z };
  appCtx.scene.add(group);
  appCtx.streetFurnitureMeshes.push(group);
}

function createTrashCan(x, z) {
  const y = typeof appCtx.terrainMeshHeightAt === 'function' ? appCtx.terrainMeshHeightAt(x, z) : appCtx.elevationWorldYAtWorldXZ(x, z);
  const group = new THREE.Group();

  const body = new THREE.Mesh(_geoTrashBody, _matTrashBody);
  body.position.y = 0.5;
  group.add(body);

  const lid = new THREE.Mesh(_geoTrashLid, _matTrashLid);
  lid.position.y = 1.05;
  group.add(lid);

  group.position.set(x, y, z);
  group.userData.furniturePos = { x, z };
  appCtx.scene.add(group);
  appCtx.streetFurnitureMeshes.push(group);
}

function generateStreetFurniture() {
  _initFurnitureMaterials();
  _initFurnitureGeometries();
  const perfTier = String(appCtx.getPerfAutoQualityTier?.() || appCtx.perfAutoQualityTier || 'balanced');
  const performanceTier = perfTier === 'performance';
  if (performanceTier) {
    buildVegetationInstancing(collectVegetationPlacements());
    return;
  }
  const signSpacing = performanceTier ? 220 : 120;
  const maxSignsPerRoad = performanceTier ? 1 : 2;
  const lampSpacing = performanceTier ? 150 : 80;
  const trashCanStep = performanceTier ? 14 : 5;
  const allowRoadFurniture = (road) => {
    if (!road) return false;
    if (!performanceTier) return true;
    const type = String(road.type || '');
    return (
      Number(road.width || 0) >= 14 ||
      type === 'motorway' ||
      type === 'trunk' ||
      type === 'primary' ||
      type === 'secondary' ||
      type === 'tertiary'
    );
  };

  // --- STREET SIGNS: place at intervals along named roads ---
  const signedRoads = new Set();
  appCtx.roads.forEach((road) => {
    if (!allowRoadFurniture(road)) return;
    if (!road.name || road.name === road.type.charAt(0).toUpperCase() + road.type.slice(1)) return;
    if (signedRoads.has(road.name)) return;
    signedRoads.add(road.name);

    let distAccum = 0;
    let signsPlaced = 0;
    for (let i = 0; i < road.pts.length - 1 && signsPlaced < maxSignsPerRoad; i++) {
      const p1 = road.pts[i],p2 = road.pts[i + 1];
      const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
      distAccum += segLen;

      if (distAccum >= signSpacing) {
        distAccum = 0;
        signsPlaced++;
        const dx = p2.x - p1.x,dz = p2.z - p1.z;
        const angle = Math.atan2(dx, dz);
        // Offset sign to the side of the road
        const nx = -dz / (Math.hypot(dx, dz) || 1);
        const nz = dx / (Math.hypot(dx, dz) || 1);
        const offset = road.width / 2 + 2;
        createStreetSign(
          p1.x + nx * offset,
          p1.z + nz * offset,
          road.name,
          angle
        );
      }
    }
  });

  // --- VEGETATION: trees from parks, woods, tree rows, and individual tree nodes ---
  buildVegetationInstancing(collectVegetationPlacements());

  // --- LIGHT POSTS: along major roads at intervals ---
  appCtx.roads.forEach((road) => {
    if (!allowRoadFurniture(road)) return;
    if (road.width < (performanceTier ? 14 : 12)) return; // Only major roads
    let distAccum = 0;
    for (let i = 0; i < road.pts.length - 1; i++) {
      const p1 = road.pts[i],p2 = road.pts[i + 1];
      const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
      distAccum += segLen;

      if (distAccum >= lampSpacing) {
        distAccum = 0;
        const dx = p2.x - p1.x,dz = p2.z - p1.z;
        const len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len,nz = dx / len;
        const offset = road.width / 2 + 1.5;
        createLightPost(p1.x + nx * offset, p1.z + nz * offset);
      }
    }
  });

  // --- TRASH CANS: near some POIs ---
  appCtx.pois.forEach((poi, i) => {
    if (i % trashCanStep !== 0) return;
    const offset = 3 + Math.random() * 2;
    const angle = Math.random() * Math.PI * 2;
    createTrashCan(poi.x + Math.cos(angle) * offset, poi.z + Math.sin(angle) * offset);
  });
}

Object.assign(appCtx, {
  awaitPlayableWorldShell,
  countVisibleBuildingMeshesNearWorldPoint,
  countVisibleDetailedBuildingMeshesNearWorldPoint,
  countVisibleRoadMeshesNearWorldPoint,
  applyContinuousWorldRebase,
  applyCustomLocationSpawn,
  applyResolvedWorldSpawn,
  applySpawnTarget,
  buildTraversalNetworks,
  cancelWorldLoad,
  configureContinuousWorldInteractiveStreaming,
  countDriveableRoadFeaturesNearWorldPoint,
  fetchOverpassJSON,
  findNearestRoad,
  findNearestTraversalFeature,
  findTraversalRoute,
  getContinuousWorldInteractiveStreamSnapshot,
  getPlayableCoreResidencySnapshot,
  getBuildingsIntersectingBounds,
  getLandusesIntersectingBounds,
  getNearbyBuildings,
  getRoadMeshSpatialIndexSnapshot,
  invalidateTraversalNetworks,
  kickContinuousWorldInteractiveStreaming,
  loadContinuousWorldInteractiveChunk,
  largeMapScreenToWorld,
  loadRoads,
  measureRemainingPolylineDistance,
  markRoadMeshSpatialIndexDirty,
  minimapScreenToWorld,
  getRuntimeContentInventorySnapshot,
  pickNavigationTargetPoint,
  pointInPolygon,
  recordRuntimeContentRetired,
  registerWaterWaveMaterial,
  resetContinuousWorldInteractiveStreamState,
  refreshStructureAwareFeatureProfiles,
  resolveSafeWorldSpawn,
  sampleFeatureSurfaceY,
  seedContinuousWorldInteractiveStreamState,
  driveBuildBlockCollision,
  shouldIgnoreDriveCollision,
  syncRuntimeContentInventory,
  syncLinearFeatureOverlayVisibility,
  surfaceDisplayName,
  spawnOnRoad,
  terrainYAtWorld,
  teleportToLocation,
  updatePlayableCoreResidency,
  updateWorldLod
});

export {
  awaitPlayableWorldShell,
  countVisibleBuildingMeshesNearWorldPoint,
  countVisibleDetailedBuildingMeshesNearWorldPoint,
  countVisibleRoadMeshesNearWorldPoint,
  applyContinuousWorldRebase,
  applyCustomLocationSpawn,
  applyResolvedWorldSpawn,
  applySpawnTarget,
  buildTraversalNetworks,
  cancelWorldLoad,
  configureContinuousWorldInteractiveStreaming,
  countDriveableRoadFeaturesNearWorldPoint,
  fetchOverpassJSON,
  findNearestRoad,
  findNearestTraversalFeature,
  findTraversalRoute,
  getContinuousWorldInteractiveStreamSnapshot,
  getPlayableCoreResidencySnapshot,
  getBuildingsIntersectingBounds,
  getLandusesIntersectingBounds,
  getNearbyBuildings,
  getRoadMeshSpatialIndexSnapshot,
  invalidateTraversalNetworks,
  kickContinuousWorldInteractiveStreaming,
  loadContinuousWorldInteractiveChunk,
  largeMapScreenToWorld,
  loadRoads,
  measureRemainingPolylineDistance,
  markRoadMeshSpatialIndexDirty,
  minimapScreenToWorld,
  getRuntimeContentInventorySnapshot,
  pickNavigationTargetPoint,
  pointInPolygon,
  recordRuntimeContentRetired,
  registerWaterWaveMaterial,
  resetContinuousWorldInteractiveStreamState,
  refreshStructureAwareFeatureProfiles,
  resolveSafeWorldSpawn,
  sampleFeatureSurfaceY,
  seedContinuousWorldInteractiveStreamState,
  driveBuildBlockCollision,
  shouldIgnoreDriveCollision,
  syncRuntimeContentInventory,
  syncLinearFeatureOverlayVisibility,
  surfaceDisplayName,
  spawnOnRoad,
  terrainYAtWorld,
  teleportToLocation,
  updatePlayableCoreResidency,
  updateWorldLod };
