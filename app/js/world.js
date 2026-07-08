import { ctx as appCtx } from "./shared-context.js?v=55"; // ============================================================================
import {
  buildIndexedBatchMesh,
  createRoadSurfaceMaterials
} from "./road-render.js?v=1";
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
  sampleFeatureSurfaceY,
  shouldRenderRoadSkirts,
  updateFeatureSurfaceProfile
} from "./structure-semantics.js?v=9";
import {
  interpretBuildingSemantics
} from "./building-semantics.js?v=2";
import {
  applyCustomLocationSpawn,
  applyResolvedWorldSpawn,
  applySpawnTarget,
  initWorldSpawning,
  resolveSafeWorldSpawn,
  spawnOnRoad,
  terrainYAtWorld,
  tryAutoEnterBoatAt
} from "./world/spawn.js?v=1";
import {
  scheduleDeferredWorldLinearFeatureLoad
} from "./world/linear-features.js?v=1";
import {
  buildWorldOverpassPlan,
  fetchOverpassJSON,
  getWorldLoadSignature,
  initWorldOsmLoader,
  sameLocation
} from "./world/osm-loader.js?v=1";
import {
  buildWorldVegetationInstancing,
  collectWorldVegetationPlacements,
  initWorldVegetation,
  MAX_TREE_NODES,
  MAX_TREE_ROW_WAYS
} from "./world/vegetation.js?v=1";
// world.js - OSM data loading, roads, buildings, landuse, POIs
// ============================================================================

const WATER_VECTOR_TILE_ZOOM = 13;
const WATER_VECTOR_TILE_FETCH_TIMEOUT_MS = 8000;
const WATER_VECTOR_TILE_ENDPOINT = (z, x, y) =>
`https://vector.openstreetmap.org/shortbread_v1/${z}/${x}/${y}.mvt`;
let _vectorTileLibPromise = null;
const BUILDING_INDEX_CELL_SIZE = 120;
let buildingSpatialIndex = new Map();
const FEATURE_TILE_DEGREES = 0.002;
const _rdtTileDepthCache = new Map();
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
const INTERIOR_LEVEL_HEIGHT = 3.4;
let _activeWorldLoad = null;
let _traversalNetworksDirty = true;

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

function createMidLodBuildingMesh(pts, height, avgElevation, colorHex = '#7f8ca0') {
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

  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.92,
    metalness: 0.02
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((minX + maxX) * 0.5, avgElevation + h * 0.5, (minZ + maxZ) * 0.5);
  mesh.userData.buildingFootprint = pts;
  mesh.userData.midLodHalfHeight = h * 0.5;
  mesh.userData.midLodDims = { w, h, d };
  mesh.userData.midLodColor = colorHex;
  mesh.userData.avgElevation = avgElevation;
  mesh.userData.lodTier = 'mid';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

function createRoofDetailMesh(pts, height, baseElevation, bSeed, buildingType = 'yes', lodTier = 'near') {
  if (!pts || pts.length < 3 || lodTier !== 'near') return null;

  let minX = Infinity,maxX = -Infinity,minZ = Infinity,maxZ = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }

  const width = Math.max(0, maxX - minX);
  const depth = Math.max(0, maxZ - minZ);
  const area = Math.abs(signedPolygonAreaXZ(pts));
  const minSpan = Math.min(width, depth);
  const flatRoofType = ['apartments', 'commercial', 'office', 'industrial', 'warehouse', 'retail', 'supermarket', 'hospital', 'school'].includes(buildingType);
  const flatRoofLikely = flatRoofType || height >= 18;
  const detailGate = flatRoofType ? 0.0 : 0.64;
  if (!flatRoofLikely || appCtx.rand01FromInt(bSeed ^ 0x5f356495) < detailGate) return null;
  if (area < 90 || minSpan < 7 || height < 10) return null;

  const placementMargin = Math.min(1.8, Math.max(0.8, minSpan * 0.09));
  const roofW = Math.max(1.4, width - placementMargin * 2);
  const roofD = Math.max(1.4, depth - placementMargin * 2);
  if (roofW < 1.4 || roofD < 1.4) return null;

  const batch = { positions: [], normals: [], uvs: [], indices: [] };
  const matrix = new THREE.Matrix4();
  const addBox = (w, h, d, x, y, z) => {
    if (!(w > 0.05 && h > 0.05 && d > 0.05)) return false;
    const geo = new THREE.BoxGeometry(w, h, d);
    matrix.makeTranslation(x, y, z);
    const appended = appendGeometryWithTransform(batch, geo, matrix);
    geo.dispose();
    return appended > 0;
  };

  let unitCount = 0;
  if (buildingType === 'industrial' || buildingType === 'warehouse') {
    unitCount = area > 220 || height > 22 ? 2 : 1;
  } else if (buildingType === 'commercial' || buildingType === 'office' || buildingType === 'hospital' || buildingType === 'school' || buildingType === 'retail' || buildingType === 'supermarket') {
    unitCount = area > 260 || height > 30 ? 2 : area > 120 || height > 16 ? 1 : 0;
  } else if (buildingType === 'apartments') {
    unitCount = area > 190 || height > 26 ? 1 : 0;
  }

  const placedUnits = [];
  const tryPlaceUnit = (seed, unitW, unitD) => {
    const minEdgeClearance = Math.max(0.75, Math.hypot(unitW, unitD) * 0.42);
    const minSpacing = Math.max(unitW, unitD) + 0.7;
    const minXPos = minX + placementMargin;
    const maxXPos = maxX - placementMargin;
    const minZPos = minZ + placementMargin;
    const maxZPos = maxZ - placementMargin;
    if (!(maxXPos > minXPos && maxZPos > minZPos)) return null;

    for (let attempt = 0; attempt < 16; attempt++) {
      const attemptSeed = seed ^ ((attempt + 1) * 0x27d4eb2d);
      const x = minXPos + appCtx.rand01FromInt(attemptSeed ^ 0x9e3779b9) * (maxXPos - minXPos);
      const z = minZPos + appCtx.rand01FromInt(attemptSeed ^ 0x85ebca6b) * (maxZPos - minZPos);
      if (!pointInPolygon(x, z, pts)) continue;
      if (distanceToPolygonEdgeXZ(x, z, pts) < minEdgeClearance) continue;
      let overlaps = false;
      for (let j = 0; j < placedUnits.length; j++) {
        const placed = placedUnits[j];
        if (Math.hypot(placed.x - x, placed.z - z) < minSpacing) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) return { x, z };
    }
    return null;
  };

  for (let i = 0; i < unitCount; i++) {
    const seed = bSeed ^ ((i + 1) * 0x45d9f3b);
    const unitW = 1.1 + appCtx.rand01FromInt(seed ^ 0x27d4eb2f) * Math.min(2.4, roofW * 0.14);
    const unitD = 0.95 + appCtx.rand01FromInt(seed ^ 0x165667b1) * Math.min(2.0, roofD * 0.14);
    const unitH = 0.6 + appCtx.rand01FromInt(seed ^ 0xd3a2646c) * 0.95;
    const unitPos = tryPlaceUnit(seed, unitW, unitD);
    if (!unitPos) continue;
    const plinthH = Math.min(0.16, Math.max(0.08, unitH * 0.18));
    addBox(unitW + 0.18, plinthH, unitD + 0.18, unitPos.x, height + plinthH * 0.5 + 0.06, unitPos.z);
    addBox(unitW, unitH, unitD, unitPos.x, height + unitH * 0.5 + plinthH + 0.06, unitPos.z);
    placedUnits.push(unitPos);
  }

  const geometry = buildMergedGeometry(batch);
  if (!geometry) return null;

  const material = new THREE.MeshStandardMaterial({
    color: pickRoofColor(bSeed),
    roughness: 0.96,
    metalness: 0.03,
    emissive: 0x0f1114,
    emissiveIntensity: 0.05
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = baseElevation;
  mesh.userData.buildingFootprint = pts;
  mesh.userData.avgElevation = baseElevation;
  mesh.userData.lodTier = lodTier;
  mesh.userData.isRoofDetail = true;
  mesh.userData.buildingType = buildingType;
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
    if (mesh?.userData?.lodTier === 'mid' && !mesh.userData?.isBuildingBatch) {
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

  const endpointGroups = new Map();
  for (let i = 0; i < structureFeatures.length; i++) {
    const feature = structureFeatures[i];
    const semantics = feature?.structureSemantics;
    const points = Array.isArray(feature?.pts) ? feature.pts : null;
    const heights = feature?.surfaceHeights;
    const distances = feature?.surfaceDistances;
    if (!semantics?.gradeSeparated || !points || points.length < 2 || !(heights instanceof Float32Array) || !(distances instanceof Float32Array)) continue;
    const entries = [
      { index: 0, point: points[0] },
      { index: points.length - 1, point: points[points.length - 1] }
    ];
    for (let e = 0; e < entries.length; e++) {
      const entry = entries[e];
      const point = entry.point;
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) continue;
      const key = `${Math.round(point.x * 10)},${Math.round(point.z * 10)}:${semantics.verticalGroup || semantics.terrainMode || 'structure'}`;
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
    for (let i = 0; i < entries.length; i++) {
      const { feature, endpointIndex } = entries[i];
      const heights = feature?.surfaceHeights;
      const distances = feature?.surfaceDistances;
      if (!(heights instanceof Float32Array) || !(distances instanceof Float32Array) || heights.length !== distances.length) continue;
      const lastIndex = heights.length - 1;
      const anchorIndex = endpointIndex === 0 ? 0 : lastIndex;
      const delta = averageY - (Number(heights[anchorIndex]) || 0);
      if (Math.abs(delta) < 0.01) continue;
      const blendDistance = Math.max(12, Math.min(28, (Number(feature.width) || 6) * 2.6));
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

function smoothStructureSurfaceProfiles(structureFeatures) {
  if (!Array.isArray(structureFeatures) || structureFeatures.length === 0) return;

  for (let i = 0; i < structureFeatures.length; i++) {
    const feature = structureFeatures[i];
    const semantics = feature?.structureSemantics;
    const heights = feature?.surfaceHeights;
    const distances = feature?.surfaceDistances;
    const hasTransitionAnchors = Array.isArray(feature?.structureTransitionAnchors) && feature.structureTransitionAnchors.length > 0;
    if ((!semantics?.gradeSeparated && !hasTransitionAnchors) || !(heights instanceof Float32Array) || !(distances instanceof Float32Array) || heights.length < 4) continue;

    const smoothed = new Float32Array(heights);
    const passes =
      semantics.terrainMode === 'elevated' ?
        3 :
      semantics.terrainMode === 'subgrade' ?
        2 :
      hasTransitionAnchors ?
        2 :
        1;
    for (let pass = 0; pass < passes; pass++) {
      const next = new Float32Array(smoothed);
      const lastIndex = smoothed.length - 1;
      for (let h = 1; h < lastIndex; h++) {
        const current = smoothed[h];
        const neighborAverage = (smoothed[h - 1] + smoothed[h + 1]) * 0.5;
        let blend =
          semantics?.terrainMode === 'elevated' ? 0.46 :
          semantics?.terrainMode === 'subgrade' ? 0.4 :
          hasTransitionAnchors ? 0.26 :
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

  const profiledFeatures = [];
  for (let i = 0; i < transportFeatures.length; i++) {
    const feature = transportFeatures[i];
    if (!feature) continue;
    const hasTransitionAnchors = Array.isArray(feature.structureTransitionAnchors) && feature.structureTransitionAnchors.length > 0;
    if (!feature?.structureSemantics?.gradeSeparated && !hasTransitionAnchors) continue;
    updateFeatureSurfaceProfile(feature, worldBaseTerrainY, {
      surfaceBias: Number.isFinite(feature.surfaceBias) ? feature.surfaceBias : 0.42
    });
    profiledFeatures.push(feature);
  }

  normalizeStructureEndpointHeights(structureFeatures);
  smoothStructureSurfaceProfiles(profiledFeatures);

  if (structureFeatures.length > 0) {
    appCtx.structureTerrainCuts = structureFeatures
      .filter((feature) => feature?.structureSemantics?.terrainMode === 'subgrade')
      .map((feature) => ({
        feature,
        pts: feature.pts,
        width: Math.max(6.2, (Number(feature.width) || 6) + 3.2),
        clearance: Math.max(3.8, Number(feature?.structureSemantics?.cutDepth) ? 3.35 + Math.min(3.4, Number(feature.structureSemantics.cutDepth) * 0.45) : 3.8),
        portalLength: Math.max(12, Math.min(34, (Number(feature.width) || 6) * 2.2)),
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
      const key = `${tier}|${matKey}`;

      let group = groups.get(key);
      if (!group) {
        group = {
          meshes: [],
          material: mesh.material,
          renderOrder: mesh.renderOrder || 0,
          lodTier: tier
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
      const key = `${type}|${isWaterwayLine ? 1 : 0}|${mesh.renderOrder || 0}|${matKey}`;

      let group = groups.get(key);
      if (!group) {
        group = {
          meshes: [],
          material: mesh.material,
          renderOrder: mesh.renderOrder || 0,
          landuseType: type,
          isWaterwayLine,
          surfaceVariant,
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
  appCtx._lastBuildingBatchStats = null;
  appCtx._lastLanduseBatchStats = null;
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
    if (appCtx.onMoon || appCtx.travelingToMoon) return true;
    if (typeof appCtx.isEnv === 'function' && appCtx.ENV) {
      return !appCtx.isEnv(appCtx.ENV.EARTH);
    }
    return false;
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
  appCtx.roadMeshes.forEach((m) => {
    appCtx.scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) {
      if (Array.isArray(m.material)) {
        m.material.forEach((mat) => mat.dispose());
      } else {
        m.material.dispose();
      }
    }
  });
  appCtx.roadMeshes = [];appCtx.roads = [];
  if (typeof appCtx.clearStructureVisualMeshes === 'function') {
    appCtx.clearStructureVisualMeshes();
  } else {
    appCtx.structureVisualMeshes = [];
  }
  appCtx.urbanSurfaceMeshes.forEach((m) => {
    appCtx.scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material && !m.userData?.sharedUrbanSurfaceMaterial) {
      if (Array.isArray(m.material)) {
        m.material.forEach((mat) => mat && typeof mat.dispose === 'function' && mat.dispose());
      } else if (typeof m.material.dispose === 'function') {
        m.material.dispose();
      }
    }
  });
  appCtx.urbanSurfaceMeshes = [];
  invalidateTraversalNetworks('world_reload_reset');
  appCtx.navigationRoutePoints = [];
  appCtx.navigationRouteDistance = 0;

  appCtx.buildingMeshes.forEach((m) => {
    appCtx.scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) {
      if (Array.isArray(m.material)) {
        m.material.forEach((mat) => mat.dispose());
      } else {
        m.material.dispose();
      }
    }
  });
  appCtx.buildingMeshes = [];appCtx.buildings = [];
  appCtx.dynamicBuildingColliders = [];
  clearBuildingSpatialIndex();

  appCtx.landuseMeshes.forEach((m) => {
    appCtx.scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) {
      if (Array.isArray(m.material)) {
        m.material.forEach((mat) => mat.dispose());
      } else {
        m.material.dispose();
      }
    }
  });
  appCtx.landuseMeshes = [];appCtx.landuses = [];appCtx.surfaceFeatureHints = [];appCtx.waterAreas = [];appCtx.waterways = [];appCtx.waterWaveVisuals = [];
  if (typeof appCtx.setWorldSurfaceProfile === 'function') {
    appCtx.setWorldSurfaceProfile(null);
  } else {
    appCtx.worldSurfaceProfile = null;
  }
  appCtx.linearFeatureMeshes.forEach((m) => {
    appCtx.scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) {
      if (Array.isArray(m.material)) {
        m.material.forEach((mat) => mat.dispose());
      } else {
        m.material.dispose();
      }
    }
  });
  appCtx.linearFeatureMeshes = [];appCtx.linearFeatures = [];

  appCtx.poiMeshes.forEach((m) => {
    appCtx.scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) {
      if (Array.isArray(m.material)) {
        m.material.forEach((mat) => mat.dispose());
      } else {
        m.material.dispose();
      }
    }
  });
  appCtx.poiMeshes = [];appCtx.pois = [];

  appCtx.historicMarkers.forEach((m) => {
    appCtx.scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) {
      if (Array.isArray(m.material)) {
        m.material.forEach((mat) => mat.dispose());
      } else {
        m.material.dispose();
      }
    }
  });
  appCtx.historicMarkers = [];appCtx.historicSites = [];

  appCtx.streetFurnitureMeshes.forEach((m) => {
    appCtx.scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) {
      if (Array.isArray(m.material)) {
        m.material.forEach((mat) => mat.dispose());
      } else {
        m.material.dispose();
      }
    }
  });
  appCtx.streetFurnitureMeshes = [];
  appCtx.vegetationMeshes.forEach((m) => {
    appCtx.scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) {
      if (Array.isArray(m.material)) {
        m.material.forEach((mat) => mat.dispose && mat.dispose());
      } else if (m.material.dispose) {
        m.material.dispose();
      }
    }
  });
  appCtx.vegetationMeshes = [];
  appCtx.vegetationFeatures = [];
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
    const lat = parseFloat(document.getElementById('customLat').value);
    const lon = parseFloat(document.getElementById('customLon').value);
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

  function registerBuildingCollision(pts, height, options = {}) {
    if (!Array.isArray(pts) || pts.length < 3) return null;
    const detail = options.detail === 'bbox' ? 'bbox' : 'full';
    let minX = Infinity,maxX = -Infinity,minZ = Infinity,maxZ = -Infinity;
    let sumX = 0,sumZ = 0;
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
      structureSemantics: options.structureSemantics || null
    };
    appCtx.buildings.push(building);
    addBuildingToSpatialIndex(building);
    return building;
  }

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

  function finalizeLoadedWorld(reason = 'primary') {
    if (earthSceneSuppressed()) {
      loaded = true;
      loadMetrics.recoveryReason = 'env_changed_during_load';
      loadMetrics.partialRecovery = true;
      hideEarthSceneMeshes();
      appCtx.hideLoad();
      return;
    }

    loaded = true;
    if (reason && reason !== 'primary') {
      loadMetrics.recoveryReason = reason;
      loadMetrics.partialRecovery = true;
    }

    safeLoadCall('buildTraversalNetworks', () => buildTraversalNetworks());
    safeLoadCall('spawnOnRoad', () => spawnOnRoad());
    if (appCtx.terrainEnabled && !appCtx.onMoon && typeof appCtx.updateTerrainAround === 'function') {
      safeLoadCall('updateTerrainAround', () => appCtx.updateTerrainAround(appCtx.car.x, appCtx.car.z));
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
    appCtx.hideLoad();
    if (typeof appCtx.refreshAstronomicalSky === 'function') {
      safeLoadCall('refreshAstronomicalSky', () => appCtx.refreshAstronomicalSky(true));
    } else if (typeof appCtx.alignStarFieldToLocation === 'function') {
      safeLoadCall('alignStarFieldToLocation', () => appCtx.alignStarFieldToLocation(appCtx.LOC.lat, appCtx.LOC.lon));
    }
    if (typeof appCtx.refreshLiveWeather === 'function') {
      safeLoadCall('refreshLiveWeather', () => appCtx.refreshLiveWeather(true));
    }
    if (appCtx.gameStarted) {
      safeLoadCall('startMode', () => appCtx.startMode());
    }
  }

  function createSyntheticFallbackWorld() {
    if (appCtx.roads.length > 0) return;
    appCtx.showLoad('Creating default environment...');
    const isPolarFallback = Math.abs(Number(appCtx.LOC?.lat) || 0) >= 66;
    const enableFallbackBuildings = false;

    const disposeMeshList = (arr) => {
      if (!Array.isArray(arr)) return;
      arr.forEach((mesh) => {
        if (!mesh) return;
        if (mesh.parent === appCtx.scene) appCtx.scene.remove(mesh);
        if (mesh.geometry && typeof mesh.geometry.dispose === 'function') mesh.geometry.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((mat) => mat && typeof mat.dispose === 'function' && mat.dispose());
          } else if (typeof mesh.material.dispose === 'function') {
            mesh.material.dispose();
          }
        }
      });
    };

    // Remove any partially generated geometry before building a deterministic fallback.
    disposeMeshList(appCtx.roadMeshes);
    disposeMeshList(appCtx.urbanSurfaceMeshes);
    disposeMeshList(appCtx.structureVisualMeshes);
    disposeMeshList(appCtx.buildingMeshes);
    disposeMeshList(appCtx.landuseMeshes);
    disposeMeshList(appCtx.linearFeatureMeshes);
    disposeMeshList(appCtx.poiMeshes);
    disposeMeshList(appCtx.streetFurnitureMeshes);
    disposeMeshList(appCtx.vegetationMeshes);
    disposeMeshList(appCtx.historicMarkers);
    appCtx.roadMeshes = [];
    appCtx.urbanSurfaceMeshes = [];
    appCtx.structureVisualMeshes = [];
    appCtx.buildingMeshes = [];
    appCtx.landuseMeshes = [];
    appCtx.poiMeshes = [];
    appCtx.streetFurnitureMeshes = [];
    appCtx.vegetationMeshes = [];
    appCtx.vegetationFeatures = [];
    appCtx.historicMarkers = [];
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
    clearBuildingSpatialIndex();

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
      if (colliderRef) {
        colliderRef.baseY = baseElevation;
        colliderRef.minY = baseElevation;
        colliderRef.maxY = baseElevation + h;
      }

      mesh.castShadow = true;
      mesh.receiveShadow = true;
      appCtx.scene.add(mesh);
      appCtx.buildingMeshes.push(mesh);

      if (typeof appCtx.createBuildingGroundPatch === 'function' && slopeRange >= 0.15) {
        const groundPatchesRaw = appCtx.createBuildingGroundPatch(pts, baseElevation);
        const groundPatches = Array.isArray(groundPatchesRaw) ? groundPatchesRaw : groundPatchesRaw ? [groundPatchesRaw] : [];
        groundPatches.forEach((groundPatch) => {
          groundPatch.userData.landuseFootprint = pts;
          groundPatch.userData.landuseType = 'buildingGround';
          groundPatch.userData.avgElevation = baseElevation;
          groundPatch.userData.terrainAvgElevation = avgElevation;
          groundPatch.userData.alwaysVisible = true;
          groundPatch.visible = true;
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
    try {
      if (performance.now() - loadStartedAt > maxTotalLoadMs) {
        console.warn('[Overpass] Max load budget reached, switching to fallback world.');
        break;
      }

      appCtx.showLoad('Loading map data...');
      const overpassPlan = buildWorldOverpassPlan({
        location: appCtx.LOC,
        roadsRadius: r,
        featureRadiusScale,
        poiRadiusScale,
        overpassTimeoutMs,
        loadStartedAt,
        maxTotalLoadMs
      });
      const {
        deferredLinearFeatureQuery,
        featureRadius,
        loadDeadline,
        overpassCacheMeta,
        primaryQuery
      } = overpassPlan;
      const geometryGuards = buildFeatureGeometryGuards(featureRadius);
      const buildingGeometryGuards = buildBuildingGeometryGuards(geometryGuards);
      const landuseGeometryGuards = buildLanduseGeometryGuards(geometryGuards);
      const waterGeometryGuards = buildWaterGeometryGuards(geometryGuards);
      const scheduleDeferredLinearFeatureLoad = () => {
        scheduleDeferredWorldLinearFeatureLoad({
          enabled: ENABLE_LINEAR_FEATURES,
          isActiveLoadContext,
          overpassTimeoutMs,
          deferredLinearFeatureQuery,
          fetchOverpassJSON,
          classifyLinearFeatureTags,
          limitWaysByTileBudget,
          tileBudgetCfg,
          useRdtBudgeting,
          linearFeaturePriority,
          geometryGuards,
          geoToWorld: appCtx.geoToWorld,
          sanitizeWorldPathPoints,
          addLinearFeatureRibbon,
          startLoadPhase,
          endLoadPhase,
          syncLinearFeatureOverlayVisibility,
          rebuildStructureVisualMeshes: appCtx.rebuildStructureVisualMeshes,
          invalidateTraversalNetworks,
          buildTraversalNetworks,
          safeLoadCall,
          updateWorldLod,
          recordLoadWarning
        });
      };

      // Load roads, buildings, landuse, and POIs in one comprehensive query.
      startLoadPhase('fetchOverpass');
      let data;
      try {
        data = await fetchOverpassJSON(primaryQuery, overpassTimeoutMs, loadDeadline, overpassCacheMeta);
      } finally {
        endLoadPhase('fetchOverpass');
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
        globalCap: maxRoadWays,
        basePerTile: tileBudgetCfg.roadsPerTile,
        minPerTile: tileBudgetCfg.roadsMinPerTile,
        tileDegrees: tileBudgetCfg.tileDegrees,
        useRdt: useRdtBudgeting,
        compareFn: (a, b) => roadTypePriority(b.tags?.highway) - roadTypePriority(a.tags?.highway)
      });

      const allBuildingWays = data.elements.filter((e) => e.type === 'way' && (e.tags?.building || e.tags?.['building:part']));
      const buildingWays = baselineFullWorld ?
      allBuildingWays :
      limitWaysByTileBudget(allBuildingWays, nodes, {
        globalCap: maxBuildingWays,
        basePerTile: tileBudgetCfg.buildingsPerTile,
        minPerTile: tileBudgetCfg.buildingsMinPerTile,
        tileDegrees: tileBudgetCfg.tileDegrees,
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
        globalCap: maxLanduseWays,
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
        globalCap: maxPoiNodes,
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
      appCtx.showLoad(`Loading roads... (${roadWays.length})`);
      startLoadPhase('buildRoadGeometry');
      const roadMainBatchVerts = [];
      const roadMainBatchIdx = [];
      const roadSkirtBatchVerts = [];
      const roadSkirtBatchIdx = [];
      const roadMarkBatchVerts = [];
      const roadMarkBatchIdx = [];

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

      roadWays.forEach((way) => {
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
          sourceFeatureId: way.id ? String(way.id) : '',
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
        appCtx.roads.push(roadFeature);
        updateFeatureSurfaceProfile(roadFeature, worldBaseTerrainY, { surfaceBias: 0.42 });
        const hw = width / 2;

        // Curvature-aware subdivision: straight = 2-5m, curves = 0.5-2m
        const subdPts = typeof appCtx.subdivideRoadPoints === 'function' ?
        appCtx.subdivideRoadPoints(decimatedRoadPts, roadSubdivideStep) :
        decimatedRoadPts;
        loadMetrics.roads.sourcePoints += pts.length;
        loadMetrics.roads.decimatedPoints += decimatedRoadPts.length;
        loadMetrics.roads.subdividedPoints += subdPts.length;

        const _tmh = worldBaseTerrainY;

        const verts = [],indices = [];
        const { leftEdge, rightEdge } = buildFeatureRibbonEdges(roadFeature, subdPts, hw, _tmh, {
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

        appendIndexedGeometry(roadMainBatchVerts, roadMainBatchIdx, verts, indices);
        loadMetrics.roads.vertices += verts.length / 3;

        // Build road skirts (edge curtains) to hide terrain peeking
        // Increased depth from 1.5 to 3.0 for better coverage on steep slopes
        if (typeof appCtx.buildRoadSkirts === 'function' && shouldRenderRoadSkirts(roadFeature)) {
          const skirtDepth =
            roadFeature.structureSemantics?.terrainMode === 'subgrade' ? 0.3 :
            3.6;
          const skirtData = appCtx.buildRoadSkirts(leftEdge, rightEdge, skirtDepth);
          if (skirtData.verts.length > 0) {
            appendIndexedGeometry(roadSkirtBatchVerts, roadSkirtBatchIdx, skirtData.verts, skirtData.indices);
            loadMetrics.roads.vertices += skirtData.verts.length / 3;
          }
        }

        // Add lane markings only for major roads (performance optimization)
        if (
          roadFeature.structureSemantics?.terrainMode === 'at_grade' &&
          width >= 12 &&
          (type.includes('motorway') || type.includes('trunk') || type.includes('primary'))
        ) {
          const markVerts = [],markIdx = [];
          const mw = 0.15,dashLen = 6,gapLen = 6; // Increased gap for performance
          let dist = 0;
          for (let i = 0; i < decimatedRoadPts.length - 1; i++) {
            const p1 = decimatedRoadPts[i],p2 = decimatedRoadPts[i + 1];
            const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
            const dx = (p2.x - p1.x) / segLen,dz = (p2.z - p1.z) / segLen;
            const nx = -dz,nz = dx;
            let segDist = 0;
            while (segDist < segLen) {
              if (Math.floor((dist + segDist) / (dashLen + gapLen)) % 2 === 0) {
                const x = p1.x + dx * segDist,z = p1.z + dz * segDist;
                const len = Math.min(dashLen, segLen - segDist);
                const y = (typeof appCtx.terrainMeshHeightAt === 'function' ? appCtx.terrainMeshHeightAt(x, z) : appCtx.elevationWorldYAtWorldXZ(x, z)) + 0.35; // Just above road surface
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
            appendIndexedGeometry(roadMarkBatchVerts, roadMarkBatchIdx, markVerts, markIdx);
            loadMetrics.roads.vertices += markVerts.length / 3;
          }
        }
      });

      buildIndexedBatchMesh({
        scene: appCtx.scene,
        targetList: appCtx.roadMeshes,
        verts: roadMainBatchVerts,
        indices: roadMainBatchIdx,
        material: roadMainMaterial,
        renderOrder: 2,
        userData: { isRoadBatch: true, sharedRoadMaterial: true }
      });
      buildIndexedBatchMesh({
        scene: appCtx.scene,
        targetList: appCtx.roadMeshes,
        verts: roadSkirtBatchVerts,
        indices: roadSkirtBatchIdx,
        material: roadSkirtMaterial,
        renderOrder: 1,
        userData: { isRoadBatch: true, isRoadSkirt: true, sharedRoadMaterial: true }
      });
      buildIndexedBatchMesh({
        scene: appCtx.scene,
        targetList: appCtx.roadMeshes,
        verts: roadMarkBatchVerts,
        indices: roadMarkBatchIdx,
        material: roadMarkMaterial,
        renderOrder: 3,
        userData: { isRoadBatch: true, isRoadMarking: true, sharedRoadMaterial: true }
      });
      endLoadPhase('buildRoadGeometry');

      // Process buildings
      appCtx.showLoad(`Loading buildings... (${buildingWays.length})`);
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

      buildingWays.forEach((way) => {
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
        centerDist <= lodThresholds.farVisible ? 'mid' : 'far';
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
        const sourceBuildingId = way.id ? String(way.id) : `osm-${Math.round(centerX * 10)}-${Math.round(centerZ * 10)}`;
        const nearRoadCore = roadCoreStats.centroidInside || roadCoreStats.inside >= 2;
        const apronFootprint = expandFootprintForGroundApron(pts);
        const roadCorridorStats = sampleFootprintRoadCorridor(apronFootprint);
        const suppressGroundApron =
          nearRoadCore ||
          overlapsRoadCorridor(roadCorridorStats) ||
          structureSemantics.terrainMode === 'elevated' ||
          (
            roadCoreStats.total > 0 &&
            roadCoreStats.inside >= Math.max(1, Math.ceil(roadCoreStats.total * 0.18))
          );
        const colliderDetail = useRdtBudgeting && lodTier !== 'near' && !nearRoadCore ? 'bbox' : 'full';

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
        const baseColor = pickBuildingBaseColor(bt, bSeed ^ Math.floor(br2 * 0xffff));
        let mesh = null;

        if (lodTier === 'mid') {
          mesh = createMidLodBuildingMesh(pts, height, baseElevation, baseColor);
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

        appCtx.scene.add(mesh);
        appCtx.buildingMeshes.push(mesh);
        const roofDetailMesh = buildingSemantics.shouldCreateRoofDetail ?
          createRoofDetailMesh(pts, height, baseElevation, bSeed, bt, lodTier) :
          null;
        if (roofDetailMesh) {
          roofDetailMesh.userData.sourceBuildingId = sourceBuildingId;
          roofDetailMesh.userData.terrainAvgElevation = avgElevation;
          roofDetailMesh.userData.structureBaseOffset = structureBaseOffset;
          roofDetailMesh.userData.buildingSemantics = buildingSemantics;
          roofDetailMesh.userData.structureSemantics = structureSemantics;
          appCtx.scene.add(roofDetailMesh);
          appCtx.buildingMeshes.push(roofDetailMesh);
        }
        if (lodTier === 'near') loadMetrics.lod.near += 1;else
        loadMetrics.lod.mid += 1;

        // On sloped terrain, add terrain-conforming ground support so building
        // bases do not appear to float above hills/step terrain.
        if (lodTier === 'near' && buildingSemantics.shouldCreateGroundPatch && typeof appCtx.createBuildingGroundPatch === 'function' && slopeRange >= 0.15) {
          const groundPatchesRaw = appCtx.createBuildingGroundPatch(pts, baseElevation);
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
        const waterVisualProfile = isWater ? resolveWaterSurfaceVisualProfile() : null;
        const surfaceBaseElevation = isWater ?
          (Number.isFinite(avgElevation) ? avgElevation : waterSurfaceBaseElevation(sampledHeights)) :
          avgElevation;
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
          color: appCtx.LANDUSE_STYLES[landuseType].color,
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
        mesh.receiveShadow = false;
        mesh.visible = appCtx.landUseVisible || mesh.userData.alwaysVisible;
        appCtx.scene.add(mesh);
        appCtx.landuseMeshes.push(mesh);
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
        if (!ENABLE_LINEAR_FEATURES) return false;
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
        mesh.visible = options.alwaysVisible === true ? true : (ENABLE_LINEAR_FEATURES && appCtx.showPathOverlays !== false);
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

      async function runVectorWaterCoverage(options = {}) {
        const showStatus = options.showStatus === true;
        const injectFallback = options.injectFallback === true;
        const currentSignature = `${Number(appCtx.LOC?.lat || 0).toFixed(6)}:${Number(appCtx.LOC?.lon || 0).toFixed(6)}:${Number(featureRadius || 0).toFixed(6)}`;
        if (currentSignature !== loadSignature) return null;
        if (showStatus) {
          appCtx.showLoad('Loading water...');
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

      appCtx.showLoad(`Loading land use... (${landuseWays.length})`);
      startLoadPhase('buildLanduseGeometry');
      landuseWays.forEach((way) => {
        const landuseType = classifyLanduseType(way.tags);
        if (!landuseType) return;
        const pts = way.nodes.map((id) => nodes[id]).filter((n) => n).map((n) => appCtx.geoToWorld(n.lat, n.lon));
        const guard = landuseType === 'water' ? null : landuseGeometryGuards;
        cacheSurfaceFeatureHint(pts, landuseType, guard);
        addLandusePolygon(pts, landuseType, [], guard);
      });

      if (Array.isArray(waterwayWays) && waterwayWays.length > 0) {
        waterwayWays.forEach((way) => {
          const pts = way.nodes.map((id) => nodes[id]).filter((n) => n).map((n) => appCtx.geoToWorld(n.lat, n.lon));
          addWaterwayRibbon(pts, way.tags || {});
        });
      }

      if (likelyWaterNearby) {
        await runVectorWaterCoverage({ showStatus: true, injectFallback: true });
      } else {
        window.setTimeout(() => {
          void runVectorWaterCoverage({ showStatus: false, injectFallback: false });
        }, 220);
      }
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

      if (appCtx.roads.length > 0) {
        appCtx.showLoad(`Loading POIs... (${poiNodes.length})`);
        buildPoiGeometryPass('buildPoiGeometry');
        appCtx.showLoad('Adding details...');
        buildStreetFurniturePass('buildStreetFurniture');

        finalizeLoadedWorld('primary');
        scheduleDeferredLinearFeatureLoad();
      } else
      {
        console.warn('No roads found in data, trying larger area...');
        appCtx.showLoad('No roads found, trying larger area...');
      }
    } catch (e) {
      const isLastAttempt = r === radii[radii.length - 1];
      if (appCtx.roads.length > 0) {
        console.warn('[WorldLoad] Recovering with partially loaded world data.');
        loadMetrics.error = e?.message || String(e);
        finalizeLoadedWorld('partial_after_error');
        break;
      }
      if (!isLastAttempt) {
        console.warn('Road loading attempt failed, retrying with larger area...', e);
        appCtx.showLoad('Retrying map data...');
        continue;
      }

      console.error('Road loading failed after all attempts:', e);
      if (appCtx.roads.length === 0) {
        if (useSyntheticFallbackRoads) {
          createSyntheticFallbackWorld();
          finalizeLoadedWorld('synthetic_fallback');
        } else {
          finalizeLoadedWorld('no_roads_sparse');
        }
      }
    }
  }
  if (!loaded && appCtx.roads.length > 0) {
    console.warn('[WorldLoad] Completing with partially loaded roads.');
    finalizeLoadedWorld('post_loop_partial');
  }
  if (!loaded && appCtx.roads.length === 0) {
    if (useSyntheticFallbackRoads) {
      console.warn('[WorldLoad] No road data found for this location. Using synthetic fallback world.');
      createSyntheticFallbackWorld();
      finalizeLoadedWorld('synthetic_no_roads');
    } else {
      console.warn('[WorldLoad] No road data found for this location. Loading sparse terrain-only world.');
      finalizeLoadedWorld('no_roads_sparse');
    }
  }
  if (!loaded && retryPass < 1) {
    console.warn('[WorldLoad] Initial pass failed. Retrying once automatically...');
    appCtx.showLoad('Retrying map data...');
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
        finalizeLoadedWorld('synthetic_final_recovery');
      } else {
        finalizeLoadedWorld('no_roads_final_recovery');
      }
    } else {
      finalizeLoadedWorld('partial_final_recovery');
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

function finiteNumberOr(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function isVehicleRoad(road) {
  if (!road) return false;
  if (road.driveable === false) return false;
  return !road.networkKind || road.networkKind === 'road';
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
  return !!(sourceId && overlaySuppressionSet('buildingIds').has(sourceId));
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

function teleportToLocation(worldX, worldZ, options = {}) {
  const walkModeActive = !!(appCtx.Walk && appCtx.Walk.state && appCtx.Walk.state.mode === 'walk');
  const mode = walkModeActive ? 'walk' : 'drive';
  const currentAngle = walkModeActive ?
    finiteNumberOr(appCtx.Walk?.state?.walker?.angle, appCtx.car?.angle) :
    finiteNumberOr(appCtx.car?.angle, 0);
  const currentFeetY = walkModeActive ?
    finiteNumberOr(appCtx.Walk?.state?.walker?.y, 0) - 1.7 :
    NaN;

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
    source: options.source || 'teleport'
  });

  if (appCtx.droneMode && resolved) {
    appCtx.drone.x = resolved.x;
    appCtx.drone.z = resolved.z;
    appCtx.drone.yaw = resolved.angle;
  }
  return resolved;
}

// Convert minimap screen coordinates to world coordinates
function minimapScreenToWorld(screenX, screenY) {
  const ref = appCtx.Walk ? appCtx.Walk.getMapRefPosition(appCtx.droneMode, appCtx.drone) : { x: appCtx.car.x, z: appCtx.car.z };
  const refLat = appCtx.LOC.lat - ref.z / appCtx.SCALE;
  const refLon = appCtx.LOC.lon + ref.x / (appCtx.SCALE * Math.cos(appCtx.LOC.lat * Math.PI / 180));

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

  // Convert lat/lon to world coords
  const worldX = (lon - appCtx.LOC.lon) * appCtx.SCALE * Math.cos(appCtx.LOC.lat * Math.PI / 180);
  const worldZ = -(lat - appCtx.LOC.lat) * appCtx.SCALE;

  return { x: worldX, z: worldZ };
}

// Convert large map screen coordinates to world coordinates
function largeMapScreenToWorld(screenX, screenY) {
  const ref = appCtx.Walk ? appCtx.Walk.getMapRefPosition(appCtx.droneMode, appCtx.drone) : { x: appCtx.car.x, z: appCtx.car.z };
  const refLat = appCtx.LOC.lat - ref.z / appCtx.SCALE;
  const refLon = appCtx.LOC.lon + ref.x / (appCtx.SCALE * Math.cos(appCtx.LOC.lat * Math.PI / 180));

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

  // Convert lat/lon to world coords
  const worldX = (lon - appCtx.LOC.lon) * appCtx.SCALE * Math.cos(appCtx.LOC.lat * Math.PI / 180);
  const worldZ = -(lat - appCtx.LOC.lat) * appCtx.SCALE;

  return { x: worldX, z: worldZ };
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
  const endpoints = ['start', 'end'];
  for (let i = 0; i < endpoints.length; i++) {
    const linked = Array.isArray(preferredRoad?.connectedFeatures?.[endpoints[i]]) ? preferredRoad.connectedFeatures[endpoints[i]] : [];
    for (let j = 0; j < linked.length; j++) {
      const feature = linked[j]?.feature || null;
      if (!feature || seen.has(feature)) continue;
      seen.add(feature);
      candidates.push(feature);
    }
  }
  return candidates;
}

function evaluateNearestRoadCandidate(road, x, z, targetY, maxVerticalDelta, preferredRoad) {
  const pts = Array.isArray(road?.pts) ? road.pts : null;
  if (!pts || pts.length < 2) return null;
  const semantics = road?.structureSemantics || null;
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
    let verticalWeight =
      semantics?.terrainMode === 'elevated' ? 0.82 :
      semantics?.terrainMode === 'subgrade' ? 0.72 :
      0.38;
    let weightedDist = d + (Number.isFinite(targetY) && Number.isFinite(roadY) ? verticalDelta * verticalWeight : 0);
    if (preferredRoad) {
      const sameRoad = road === preferredRoad;
      const connectedRoad = !sameRoad && (
        Array.isArray(preferredRoad?.connectedFeatures?.start) && preferredRoad.connectedFeatures.start.some((entry) => entry?.feature === road) ||
        Array.isArray(preferredRoad?.connectedFeatures?.end) && preferredRoad.connectedFeatures.end.some((entry) => entry?.feature === road)
      );
      const sameVerticalGroup =
        preferredRoad?.structureSemantics?.verticalGroup &&
        road?.structureSemantics?.verticalGroup === preferredRoad.structureSemantics.verticalGroup;
      if (sameRoad) {
        weightedDist = d + verticalDelta * 0.12;
      } else if (connectedRoad) {
        weightedDist = d + verticalDelta * 0.2;
      } else if (sameVerticalGroup) {
        weightedDist = d + verticalDelta * 0.32;
      }
      if (sameRoad) weightedDist -= 3.4;
      else if (connectedRoad) weightedDist -= 2.25;
      else if (sameVerticalGroup) weightedDist -= 0.7;
      if ((sameRoad || connectedRoad) && (t < 0.08 || t > 0.92)) weightedDist -= 0.55;
    }
    const continuityAccess =
      !!preferredRoad && (
        road === preferredRoad ||
        areRoadsConnected(preferredRoad, road) ||
        (
          preferredRoad?.structureSemantics?.verticalGroup &&
          road?.structureSemantics?.verticalGroup === preferredRoad.structureSemantics.verticalGroup
        )
      );
    if (semantics?.gradeSeparated && !continuityAccess && Number.isFinite(verticalDelta)) {
      const directLockThreshold = semantics.terrainMode === 'elevated' ? 1.25 : 1.35;
      const transitionLockThreshold = semantics.terrainMode === 'elevated' ? 1.65 : 1.85;
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
  const preferredRoad = options?.preferredRoad || null;
  let bestWeighted = Infinity;

  const roads = runtimeRoadFeatures();
  if (preferredRoad) {
    const preferredCandidates = roadContinuityCandidates(preferredRoad);
    for (let i = 0; i < preferredCandidates.length; i++) {
      const preferredHit = evaluateNearestRoadCandidate(preferredCandidates[i], x, z, targetY, maxVerticalDelta, preferredRoad);
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
    const hit = evaluateNearestRoadCandidate(road, x, z, targetY, maxVerticalDelta, preferredRoad);
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

let _lastLodRefX = 0;
let _lastLodRefZ = 0;
let _lastLodReady = false;

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

  if ((!appCtx.buildingMeshes || appCtx.buildingMeshes.length === 0) && (
  !appCtx.poiMeshes || appCtx.poiMeshes.length === 0) && (
  !appCtx.landuseMeshes || appCtx.landuseMeshes.length === 0)) {
    return;
  }

  const ref = appCtx.boatMode?.active && appCtx.boat ?
  appCtx.boat :
  appCtx.Walk && appCtx.Walk.state && appCtx.Walk.state.mode === 'walk' && appCtx.Walk.state.walker ?
  appCtx.Walk.state.walker :
  appCtx.droneMode ? appCtx.drone : appCtx.car;
  const refX = Number.isFinite(ref?.x) ? ref.x : 0;
  const refZ = Number.isFinite(ref?.z) ? ref.z : 0;

  if (!force && _lastLodReady) {
    const moved = Math.hypot(refX - _lastLodRefX, refZ - _lastLodRefZ);
    const minMoveForLodUpdate = appCtx.droneMode ? 4 : appCtx.boatMode?.active ? 14 : 8;
    if (moved < minMoveForLodUpdate) return;
  }
  _lastLodRefX = refX;
  _lastLodRefZ = refZ;
  _lastLodReady = true;

  const mode = getPerfModeValue();
  const dynamicBudgetState = getRuntimeDynamicBudget(mode);
  const depthForLod = typeof appCtx.rdtLoadComplexity === 'number' ? appCtx.rdtLoadComplexity :

  typeof appCtx.rdtComplexity === 'number' ? appCtx.rdtComplexity : 0;
  const boatLodScale = appCtx.boatMode?.active ? Math.max(0.34, Math.min(1, Number(appCtx.boatMode.detailBias) || 1)) : 1;
  const lodThresholds = getWorldLodThresholds(depthForLod, mode, dynamicBudgetState.lodScale * boatLodScale);
  const poiMidSq = lodThresholds.mid * lodThresholds.mid;

  let nearVisible = 0;
  let midVisible = 0;

  if (mode === 'baseline') {
    for (let i = 0; i < appCtx.buildingMeshes.length; i++) {
      const mesh = appCtx.buildingMeshes[i];
      if (!mesh) continue;
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
      if (mesh.userData?.boatSuppressed) {
        mesh.visible = false;
        continue;
      }
      const alwaysVisible = !!mesh.userData?.alwaysVisible;
      mesh.visible = alwaysVisible || !!appCtx.landUseVisible;
    }

    if (typeof appCtx.setPerfLiveStat === 'function') {
      appCtx.setPerfLiveStat('lodVisible', { near: nearVisible, mid: midVisible });
    }
    return;
  }

  for (let i = 0; i < appCtx.buildingMeshes.length; i++) {
    const mesh = appCtx.buildingMeshes[i];
    if (!mesh) continue;

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

  if (typeof appCtx.setPerfLiveStat === 'function') {
    appCtx.setPerfLiveStat('lodVisible', { near: nearVisible, mid: midVisible });
  }

  if (Array.isArray(appCtx.streetFurnitureMeshes) && appCtx.streetFurnitureMeshes.length > 0) {
    const furnitureDist = (appCtx.boatMode?.active ? lodThresholds.mid * 0.6 : lodThresholds.mid) + 80;
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

  // --- STREET SIGNS: place at intervals along named roads ---
  const signSpacing = 120; // One sign every ~120 world units
  const signedRoads = new Set();
  appCtx.roads.forEach((road) => {
    if (!road.name || road.name === road.type.charAt(0).toUpperCase() + road.type.slice(1)) return;
    if (signedRoads.has(road.name)) return;
    signedRoads.add(road.name);

    let distAccum = 0;
    let signsPlaced = 0;
    for (let i = 0; i < road.pts.length - 1 && signsPlaced < 2; i++) {
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
  buildWorldVegetationInstancing(collectWorldVegetationPlacements(), {
    initFurnitureMaterials: _initFurnitureMaterials,
    initFurnitureGeometries: _initFurnitureGeometries,
    getResources: () => ({
      geoTreeTrunk: _geoTreeTrunk,
      geoTreeCanopy: _geoTreeCanopy,
      matTrunk: _matTrunk
    })
  });

  // --- LIGHT POSTS: along major roads at intervals ---
  const lampSpacing = 80;
  appCtx.roads.forEach((road) => {
    if (road.width < 12) return; // Only major roads
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
    if (i % 5 !== 0) return; // Every 5th POI
    const offset = 3 + Math.random() * 2;
    const angle = Math.random() * Math.PI * 2;
    createTrashCan(poi.x + Math.cos(angle) * offset, poi.z + Math.sin(angle) * offset);
  });
}

initWorldSpawning({
  buildingContainingPoint,
  findNearestRoad,
  isInsideWaterArea,
  isVehicleRoad,
  traversableFeaturesForMode
});
initWorldOsmLoader({
  getPerfModeValue
});
initWorldVegetation({
  findNearestRoad,
  getNearbyBuildings,
  isRoadSurfaceReachable,
  pointInPolygon,
  sanitizeWorldPathPoints,
  signedPolygonAreaXZ
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
  resolveSafeWorldSpawn,
  sampleFeatureSurfaceY,
  syncLinearFeatureOverlayVisibility,
  surfaceDisplayName,
  spawnOnRoad,
  terrainYAtWorld,
  teleportToLocation,
  updateWorldLod };
