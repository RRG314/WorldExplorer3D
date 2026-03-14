import { ctx as appCtx } from "./shared-context.js?v=55"; // ============================================================================
// world.js - OSM data loading, roads, buildings, landuse, POIs
// ============================================================================

const OVERPASS_ENDPOINTS = [
'https://overpass-api.de/api/interpreter',
'https://lz4.overpass-api.de/api/interpreter',
'https://overpass.kumi.systems/api/interpreter'];


const OVERPASS_STAGGER_MS = 220;
const OVERPASS_MIN_TIMEOUT_MS = 5000;
const OVERPASS_MEMORY_CACHE_TTL_MS = 6 * 60 * 1000;
const OVERPASS_MEMORY_CACHE_MAX = 6;
const OVERPASS_LOC_EPSILON = 1e-7;
const WATER_VECTOR_TILE_ZOOM = 13;
const WATER_VECTOR_TILE_FETCH_TIMEOUT_MS = 8000;
const WATER_VECTOR_TILE_ENDPOINT = (z, x, y) =>
`https://vector.openstreetmap.org/shortbread_v1/${z}/${x}/${y}.mvt`;
let _vectorTileLibPromise = null;
const BUILDING_INDEX_CELL_SIZE = 120;
let buildingSpatialIndex = new Map();
const FEATURE_TILE_DEGREES = 0.002;
const _rdtTileDepthCache = new Map();
const _overpassMemoryCache = [];
let _lastOverpassEndpoint = null;
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
const VEGETATION_ELIGIBLE_TYPES = new Set([
  'forest',
  'wood',
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

function sameLocation(a, b) {
  return Math.abs((a?.lat || 0) - (b?.lat || 0)) <= OVERPASS_LOC_EPSILON &&
  Math.abs((a?.lon || 0) - (b?.lon || 0)) <= OVERPASS_LOC_EPSILON;
}

function pruneOverpassMemoryCache(nowMs = Date.now()) {
  for (let i = _overpassMemoryCache.length - 1; i >= 0; i--) {
    if (nowMs - _overpassMemoryCache[i].savedAt > OVERPASS_MEMORY_CACHE_TTL_MS) {
      _overpassMemoryCache.splice(i, 1);
    }
  }
}

function findOverpassMemoryCache(meta) {
  if (!meta) return null;
  const nowMs = Date.now();
  pruneOverpassMemoryCache(nowMs);

  let best = null;
  for (let i = 0; i < _overpassMemoryCache.length; i++) {
    const entry = _overpassMemoryCache[i];
    if (!sameLocation(entry.meta, meta)) continue;
    if (entry.meta.roadsRadius + 1e-9 < meta.roadsRadius) continue;
    if (entry.meta.featureRadius + 1e-9 < meta.featureRadius) continue;
    if (entry.meta.poiRadius + 1e-9 < meta.poiRadius) continue;

    if (!best || entry.savedAt > best.savedAt) best = entry;
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
  sameLocation(entry.meta, meta) &&
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
      poiRadius: meta.poiRadius
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
  if (!_lastOverpassEndpoint || !OVERPASS_ENDPOINTS.includes(_lastOverpassEndpoint)) {
    return OVERPASS_ENDPOINTS.slice();
  }
  const rest = OVERPASS_ENDPOINTS.filter((ep) => ep !== _lastOverpassEndpoint);
  return [_lastOverpassEndpoint, ...rest];
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

function classifyLinearFeatureTags(tags = {}) {
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

  if (mode === 'baseline') {
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
  if (!tags) return null;
  if (tags.landuse && appCtx.LANDUSE_STYLES[tags.landuse]) return tags.landuse;
  if (tags.landuse === 'reservoir' || tags.landuse === 'basin') return 'water';
  if (tags.natural === 'water' || !!tags.water) return 'water';
  if (tags.natural === 'forest') return 'forest';
  if (tags.natural === 'wood') return 'wood';
  if (tags.natural === 'scrub' || tags.natural === 'grassland' || tags.natural === 'heath') return 'meadow';
  if (tags.natural === 'wetland') return 'grass';
  if (tags.leisure === 'park') return 'park';
  if (tags.leisure === 'garden') return 'garden';
  if (tags.leisure === 'nature_reserve') return 'forest';
  return null;
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

function resolveLinearFeatureBaseY(x, z, kind = 'footway') {
  const terrainY = typeof appCtx.terrainMeshHeightAt === 'function' ?
    appCtx.terrainMeshHeightAt(x, z) :
    appCtx.elevationWorldYAtWorldXZ(x, z);
  const fallbackTerrain = Number.isFinite(terrainY) ? terrainY : 0;
  const nearestRoad = typeof appCtx.findNearestRoad === 'function' ? appCtx.findNearestRoad(x, z) : null;
  const roadHalfWidth = nearestRoad?.road ? Number(nearestRoad.road.width || 0) * 0.5 : 0;
  const snapPadding =
    kind === 'footway' ? 2.4 :
    kind === 'cycleway' ? 2.0 :
    1.0;
  const shouldSnapToRoad = !!(
    nearestRoad?.road &&
    Number.isFinite(nearestRoad.dist) &&
    nearestRoad.dist <= roadHalfWidth + snapPadding
  );
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
}

function syncLinearFeatureOverlayVisibility() {
  const visible = appCtx.showPathOverlays !== false;
  if (!Array.isArray(appCtx.linearFeatureMeshes)) return;
  for (let i = 0; i < appCtx.linearFeatureMeshes.length; i++) {
    const mesh = appCtx.linearFeatureMeshes[i];
    if (mesh) mesh.visible = visible;
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
      const key = `${type}|${isWaterwayLine ? 1 : 0}|${mesh.renderOrder || 0}|${matKey}`;

      let group = groups.get(key);
      if (!group) {
        group = {
          meshes: [],
          material: mesh.material,
          renderOrder: mesh.renderOrder || 0,
          landuseType: type,
          isWaterwayLine,
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
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    return (appCtx.buildings || []).concat(appCtx.dynamicBuildingColliders || []);
  }
  if (!buildingSpatialIndex || buildingSpatialIndex.size === 0) {
    return (appCtx.buildings || []).concat(appCtx.dynamicBuildingColliders || []);
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

  return out;
}

async function fetchOverpassJSON(query, timeoutMs, deadlineMs = Infinity, cacheMeta = null) {
  const cached = findOverpassMemoryCache(cacheMeta);
  if (cached?.data?.elements) {
    cached.data._overpassEndpoint = cached.endpoint ? `${cached.endpoint} (memory-cache)` : 'memory-cache';
    cached.data._overpassSource = 'memory-cache';
    cached.data._overpassCacheAgeMs = Math.max(0, Date.now() - cached.savedAt);
    return cached.data;
  }

  const controllers = [];
  const errors = [];
  const endpoints = orderedOverpassEndpoints();
  const attempts = endpoints.map((endpoint, idx) => (async () => {
    const staggerMs = idx * OVERPASS_STAGGER_MS;
    if (staggerMs > 0) await delayMs(staggerMs);

    const now = performance.now();
    if (now >= deadlineMs - 300) {
      throw new Error(`[${endpoint}] skipped: load budget exhausted`);
    }

    const timeLeftMs = deadlineMs - now;
    const timeoutForEndpointMs = Math.max(
      3500,
      Math.min(
        Math.max(OVERPASS_MIN_TIMEOUT_MS, timeoutMs - idx * 1200),
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
        throw new Error(`HTTP ${res.status}`);
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
      return data;
    } catch (err) {
      const reason = err?.name === 'AbortError' ?
      `timeout after ${Math.floor(timeoutForEndpointMs)}ms` :
      err?.message || String(err);
      const wrapped = new Error(`[${endpoint}] ${reason}`);
      errors.push(wrapped.message);
      throw wrapped;
    } finally {
      clearTimeout(timeoutId);
    }
  })());

  try {
    const data = await firstSuccessful(attempts);
    controllers.forEach((c) => c.abort());
    return data;
  } catch {
    throw new Error(`All Overpass endpoints failed: ${errors.join(' | ')}`);
  }
}

async function loadRoads(retryPass = 0) {
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
    hideList(appCtx.buildingMeshes);
    hideList(appCtx.landuseMeshes);
    hideList(appCtx.poiMeshes);
    hideList(appCtx.streetFurnitureMeshes);
    hideList(appCtx.vegetationMeshes);
  };

  appCtx.showLoad('Loading ' + locName + '...');
  appCtx.worldLoading = true;
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
  appCtx.traversalNetworks = { walk: null, drive: null };
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
  appCtx.landuseMeshes = [];appCtx.landuses = [];appCtx.waterAreas = [];appCtx.waterways = [];
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
      levels: Number.isFinite(options.levels) ? options.levels : null,
      baseY: Number.isFinite(options.baseY) ? options.baseY : null
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
    if (typeof appCtx.alignStarFieldToLocation === 'function') {
      safeLoadCall('alignStarFieldToLocation', () => appCtx.alignStarFieldToLocation(appCtx.LOC.lat, appCtx.LOC.lon));
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
    disposeMeshList(appCtx.buildingMeshes);
    disposeMeshList(appCtx.landuseMeshes);
    disposeMeshList(appCtx.linearFeatureMeshes);
    disposeMeshList(appCtx.poiMeshes);
    disposeMeshList(appCtx.streetFurnitureMeshes);
    disposeMeshList(appCtx.vegetationMeshes);
    disposeMeshList(appCtx.historicMarkers);
    appCtx.roadMeshes = [];
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
    appCtx.waterAreas = [];
    appCtx.waterways = [];
    appCtx.traversalNetworks = { walk: null, drive: null };
    appCtx.navigationRoutePoints = [];
    appCtx.navigationRouteDistance = 0;
    appCtx.linearFeatures = [];
    appCtx.linearFeatureMeshes = [];
    appCtx.dynamicBuildingColliders = [];
    appCtx.pois = [];
    appCtx.historicSites = [];
    clearBuildingSpatialIndex();

    const makeRoad = (x1, z1, x2, z2, width = 10) => {
      const pts = [{ x: x1, z: z1 }, { x: x2, z: z2 }];
      appCtx.roads.push({
        pts,
        width,
        limit: 35,
        name: 'Main Street',
        type: 'primary',
        networkKind: 'road',
        walkable: true,
        driveable: true,
        lodDepth: 0,
        subdivideMaxDist: getRoadSubdivisionStep('primary', 0, perfModeNow)
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
      if (colliderRef) colliderRef.baseY = baseElevation;

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
      const featureRadius = r * featureRadiusScale;
      const poiRadius = r * poiRadiusScale;
      const geometryGuards = buildFeatureGeometryGuards(featureRadius);
      const buildingGeometryGuards = buildBuildingGeometryGuards(geometryGuards);
      const landuseGeometryGuards = buildLanduseGeometryGuards(geometryGuards);
      const waterGeometryGuards = buildWaterGeometryGuards(geometryGuards);
      const overpassCacheMeta = {
        lat: appCtx.LOC.lat,
        lon: appCtx.LOC.lon,
        roadsRadius: r,
        featureRadius,
        poiRadius
      };

      const roadsBounds = `(${appCtx.LOC.lat - r},${appCtx.LOC.lon - r},${appCtx.LOC.lat + r},${appCtx.LOC.lon + r})`;
      const featureBounds = `(${appCtx.LOC.lat - featureRadius},${appCtx.LOC.lon - featureRadius},${appCtx.LOC.lat + featureRadius},${appCtx.LOC.lon + featureRadius})`;
      const poiBounds = `(${appCtx.LOC.lat - poiRadius},${appCtx.LOC.lon - poiRadius},${appCtx.LOC.lat + poiRadius},${appCtx.LOC.lon + poiRadius})`;
      const linearFeatureRadius = Math.min(featureRadius, Math.max(r * 0.6, 0.008));
      const linearFeatureBounds = `(${appCtx.LOC.lat - linearFeatureRadius},${appCtx.LOC.lon - linearFeatureRadius},${appCtx.LOC.lat + linearFeatureRadius},${appCtx.LOC.lon + linearFeatureRadius})`;
      const deferredLinearFeatureQuery = `[out:json][timeout:${Math.max(8, Math.floor(Math.min(overpassTimeoutMs, 18000) / 1000))}];(
                way["railway"~"^(rail|light_rail|tram|subway|narrow_gauge)$"]${linearFeatureBounds};
                way["highway"~"^(cycleway|footway|pedestrian|path|steps)$"]${linearFeatureBounds};
            );out body;>;out skel qt;`;
      const scheduleDeferredLinearFeatureLoad = () => {
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
                  addLinearFeatureRibbon(pts, way.tags);
                });
              });
            } finally {
              endLoadPhase('buildLinearFeatureGeometryDeferred');
            }

            syncLinearFeatureOverlayVisibility();
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

      // Load roads, buildings, landuse, and POIs in one comprehensive query.
      const q = `[out:json][timeout:${Math.max(8, Math.floor(overpassTimeoutMs / 1000))}];(
                way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|unclassified|living_street|service)$"]${roadsBounds};
                way["building"]${featureBounds};
                way["landuse"]${featureBounds};
                way["natural"~"^(wood|forest|scrub|grassland|heath|wetland|tree_row)$"]${featureBounds};
                way["natural"="water"]${featureBounds};
                way["water"]${featureBounds};
                way["waterway"~"^(river|stream|canal|drain|ditch)$"]${featureBounds};
                way["leisure"~"^(park|garden|nature_reserve)$"]${featureBounds};
                node["natural"="tree"]${featureBounds};
                node["amenity"~"school|hospital|police|fire_station|parking|fuel|restaurant|cafe|bank|pharmacy|post_office"]${poiBounds};
                node["shop"]${poiBounds};
                node["tourism"]${poiBounds};
                node["historic"]${poiBounds};
                node["leisure"~"park|stadium|sports_centre|playground"]${poiBounds};
            );out body;>;out skel qt;`;
      const loadDeadline = loadStartedAt + maxTotalLoadMs;
      startLoadPhase('fetchOverpass');
      let data;
      try {
        data = await fetchOverpassJSON(q, overpassTimeoutMs, loadDeadline, overpassCacheMeta);
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

      const allBuildingWays = data.elements.filter((e) => e.type === 'way' && e.tags?.building);
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

      const allRailwayWays = data.elements.filter((e) =>
      e.type === 'way' &&
      classifyLinearFeatureTags(e.tags)?.kind === 'railway'
      );
      const railwayWays = limitWaysByTileBudget(allRailwayWays, nodes, {
        globalCap: Math.max(80, Math.floor(maxRoadWays * 0.22)),
        basePerTile: Math.max(6, Math.floor(tileBudgetCfg.roadsPerTile * 0.22)),
        minPerTile: Math.max(2, Math.floor(tileBudgetCfg.roadsMinPerTile * 0.18)),
        tileDegrees: tileBudgetCfg.tileDegrees,
        useRdt: useRdtBudgeting,
        compareFn: (a, b) =>
        linearFeaturePriority('railway', classifyLinearFeatureTags(b.tags)?.subtype) -
        linearFeaturePriority('railway', classifyLinearFeatureTags(a.tags)?.subtype)
      });

      const allFootwayWays = data.elements.filter((e) =>
      e.type === 'way' &&
      classifyLinearFeatureTags(e.tags)?.kind === 'footway'
      );
      const footwayWays = limitWaysByTileBudget(allFootwayWays, nodes, {
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
      });

      const allCyclewayWays = data.elements.filter((e) =>
      e.type === 'way' &&
      classifyLinearFeatureTags(e.tags)?.kind === 'cycleway'
      );
      const cyclewayWays = limitWaysByTileBudget(allCyclewayWays, nodes, {
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

      const roadMainMaterial = appCtx.asphaltTex ? new THREE.MeshStandardMaterial({
        map: appCtx.asphaltTex,
        normalMap: appCtx.asphaltNormal,
        normalScale: new THREE.Vector2(0.8, 0.8),
        roughnessMap: appCtx.asphaltRoughness,
        roughness: 0.95,
        metalness: 0.05,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        depthWrite: true,
        depthTest: true
      }) : new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.95,
        metalness: 0.05,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        depthWrite: true,
        depthTest: true
      });

      const roadSkirtMaterial = new THREE.MeshStandardMaterial({
        color: 0x222222,
        roughness: 0.95,
        metalness: 0.05,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });

      const roadMarkMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffee,
        emissive: 0x444444,
        emissiveIntensity: 0.3,
        roughness: 0.8,
        polygonOffset: true,
        polygonOffsetFactor: -6,
        polygonOffsetUnits: -6
      });

      roadWays.forEach((way) => {
        const rawPts = way.nodes.map((id) => nodes[id]).filter((n) => n).map((n) => appCtx.geoToWorld(n.lat, n.lon));
        const pts = sanitizeWorldPathPoints(rawPts, geometryGuards);
        if (pts.length < 2) return;
        const type = way.tags?.highway || 'residential';
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
        const roadSubdivideStep = getRoadSubdivisionStep(type, roadTileDepth, perfModeNow);
        const decimatedRoadPts = decimateRoadCenterlineByDepth(pts, type, roadTileDepth, perfModeNow);
        if (decimatedRoadPts.length < 2) return;

        appCtx.roads.push({
          pts: decimatedRoadPts,
          width,
          limit,
          name,
          type,
          networkKind: 'road',
          walkable: true,
          driveable: true,
          lodDepth: roadTileDepth,
          subdivideMaxDist: roadSubdivideStep
        });
        const hw = width / 2;

        // Curvature-aware subdivision: straight = 2-5m, curves = 0.5-2m
        const subdPts = typeof appCtx.subdivideRoadPoints === 'function' ?
        appCtx.subdivideRoadPoints(decimatedRoadPts, roadSubdivideStep) :
        decimatedRoadPts;
        loadMetrics.roads.sourcePoints += pts.length;
        loadMetrics.roads.decimatedPoints += decimatedRoadPts.length;
        loadMetrics.roads.subdividedPoints += subdPts.length;

        // Use cached height function if available
        const _tmh = typeof appCtx.cachedTerrainHeight === 'function' ? appCtx.cachedTerrainHeight :
        typeof appCtx.terrainMeshHeightAt === 'function' ? appCtx.terrainMeshHeightAt : appCtx.elevationWorldYAtWorldXZ;

        // Sample center heights and smooth them
        const cHeights = new Float64Array(subdPts.length);
        for (let ci = 0; ci < subdPts.length; ci++) {
          cHeights[ci] = _tmh(subdPts[ci].x, subdPts[ci].z);
        }
        for (let sp = 0; sp < 3; sp++) {
          for (let si = 1; si < subdPts.length - 1; si++) {
            cHeights[si] = cHeights[si] * 0.6 + (cHeights[si - 1] + cHeights[si + 1]) * 0.2;
          }
        }

        const verts = [],indices = [];
        const leftEdge = [],rightEdge = [];

        // Build road strip with DIRECT edge snapping
        for (let i = 0; i < subdPts.length; i++) {
          const p = subdPts[i];

          // Calculate tangent direction
          let dx, dz;
          if (i === 0) {
            dx = subdPts[1].x - p.x;
            dz = subdPts[1].z - p.z;
          } else if (i === subdPts.length - 1) {
            dx = p.x - subdPts[i - 1].x;
            dz = p.z - subdPts[i - 1].z;
          } else {
            dx = subdPts[i + 1].x - subdPts[i - 1].x;
            dz = subdPts[i + 1].z - subdPts[i - 1].z;
          }

          const len = Math.sqrt(dx * dx + dz * dz) || 1;
          const nx = -dz / len,nz = dx / len; // Perpendicular (left direction)
          const endpointExtend = Math.max(
            ROAD_ENDPOINT_EXTENSION_MIN,
            Math.min(ROAD_ENDPOINT_EXTENSION_MAX, hw * ROAD_ENDPOINT_EXTENSION_SCALE)
          );
          const isEndpoint = i === 0 || i === subdPts.length - 1;
          const endpointDir = i === 0 ? -1 : 1;
          const px = isEndpoint ? p.x + endpointDir * (dx / len) * endpointExtend : p.x;
          const pz = isEndpoint ? p.z + endpointDir * (dz / len) * endpointExtend : p.z;

          // Calculate left and right edge positions
          const leftX = px + nx * hw;
          const leftZ = pz + nz * hw;
          const rightX = px - nx * hw;
          const rightZ = pz - nz * hw;

          // DIRECTLY snap BOTH edges to terrain
          let leftY = _tmh(leftX, leftZ);
          let rightY = _tmh(rightX, rightZ);

          // Add vertical bias to prevent z-fighting and terrain peeking
          // Increased from 0.10 to 0.25 to handle steep slopes
          const verticalBias = 0.42; // Keep roads slightly proud to prevent terrain seams
          leftY += verticalBias;
          rightY += verticalBias;

          // Store edge vertices for skirt generation
          leftEdge.push({ x: leftX, y: leftY, z: leftZ });
          rightEdge.push({ x: rightX, y: rightY, z: rightZ });

          // Push vertices
          verts.push(leftX, leftY, leftZ);
          verts.push(rightX, rightY, rightZ);

          // Create quad indices
          if (i < subdPts.length - 1) {
            const vi = i * 2;
            indices.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);
          }
        }

        appendIndexedGeometry(roadMainBatchVerts, roadMainBatchIdx, verts, indices);
        loadMetrics.roads.vertices += verts.length / 3;

        // Build road skirts (edge curtains) to hide terrain peeking
        // Increased depth from 1.5 to 3.0 for better coverage on steep slopes
        if (typeof appCtx.buildRoadSkirts === 'function') {
            const skirtData = appCtx.buildRoadSkirts(leftEdge, rightEdge, 3.6);
          if (skirtData.verts.length > 0) {
            appendIndexedGeometry(roadSkirtBatchVerts, roadSkirtBatchIdx, skirtData.verts, skirtData.indices);
            loadMetrics.roads.vertices += skirtData.verts.length / 3;
          }
        }

        // Add lane markings only for major roads (performance optimization)
        if (width >= 12 && (type.includes('motorway') || type.includes('trunk') || type.includes('primary'))) {
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

      const buildRoadBatchMesh = (verts, indices, material, renderOrder, userData = null) => {
        if (!verts.length || !indices.length) return null;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        const vertexCount = verts.length / 3;
        const indexArray = vertexCount > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
        geo.setIndex(new THREE.BufferAttribute(indexArray, 1));
        geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, material);
        mesh.renderOrder = renderOrder;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        if (userData && typeof userData === 'object') {
          Object.assign(mesh.userData, userData);
        }
        appCtx.scene.add(mesh);
        appCtx.roadMeshes.push(mesh);
        return mesh;
      };

      buildRoadBatchMesh(roadMainBatchVerts, roadMainBatchIdx, roadMainMaterial, 2, { isRoadBatch: true });
      buildRoadBatchMesh(roadSkirtBatchVerts, roadSkirtBatchIdx, roadSkirtMaterial, 1, { isRoadBatch: true, isRoadSkirt: true });
      buildRoadBatchMesh(roadMarkBatchVerts, roadMarkBatchIdx, roadMarkMaterial, 3, { isRoadBatch: true, isRoadMarking: true });
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
      const toRoadCoreCellKey = (x, z) => `${Math.floor(x / roadCoreCellSize)},${Math.floor(z / roadCoreCellSize)}`;
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
      const pointOnRoadCore = (x, z) => roadCoreCells.has(toRoadCoreCellKey(x, z));
      const sampleFootprintRoadCore = (pts) => {
        if (!pts || pts.length < 3) return { total: 0, inside: 0, centroidInside: false };
        let sumX = 0,sumZ = 0;
        const samples = [];
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          sumX += p.x;
          sumZ += p.z;
          samples.push(p);
          if (i % 2 === 0) {
            const n = pts[(i + 1) % pts.length];
            samples.push({ x: (p.x + n.x) * 0.5, z: (p.z + n.z) * 0.5 });
          }
        }
        const centroid = { x: sumX / pts.length, z: sumZ / pts.length };
        samples.push(centroid);

        let inside = 0;
        for (let i = 0; i < samples.length; i++) {
          const s = samples[i];
          if (pointOnRoadCore(s.x, s.z)) inside++;
        }
        return {
          total: samples.length,
          inside,
          centroidInside: pointOnRoadCore(centroid.x, centroid.z)
        };
      };
      const overlapsRoadCore = (stats) => {
        if (!stats || stats.total <= 0) return false;
        const overlapRatio = stats.inside / stats.total;
        return stats.inside >= Math.max(4, Math.ceil(stats.total * 0.58)) && overlapRatio >= 0.55;
      };

      appCtx.roads.forEach((rd) => {
        if (!rd || !rd.pts) return;
        const roadHalfWidth = Number.isFinite(rd.width) ? rd.width * 0.5 : 4;
        const roadCoreRadius = Math.max(0.8, Math.max(0, roadHalfWidth * 0.32 - 0.25));
        const roadCoreRadiusCells = Math.max(0, Math.floor((roadCoreRadius + 0.25) / roadCoreCellSize));
        for (let i = 0; i < rd.pts.length; i++) {
          const p = rd.pts[i];
          const cx = Math.floor(p.x / roadBuildingCellSize);
          const cz = Math.floor(p.z / roadBuildingCellSize);
          roadCoverageCells.add(`${cx},${cz}`);
          markRoadCoreCell(p.x, p.z, roadCoreRadiusCells);
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
        for (let i = 0; i < pts.length; i++) {
          centerX += pts[i].x;
          centerZ += pts[i].z;
        }
        centerX /= pts.length;
        centerZ /= pts.length;
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

        // Get building height from tags or estimate
        let height = 10; // default
        if (way.tags['building:levels']) {
          height = parseFloat(way.tags['building:levels']) * 3.5;
        } else if (way.tags.height) {
          height = parseFloat(way.tags.height) || 10;
        } else {
          // Deterministic height based on building type (seeded by location + building id)
          const bt = way.tags.building;
          if (bt === 'house' || bt === 'residential' || bt === 'detached') height = 6 + br1 * 4;else
          if (bt === 'apartments' || bt === 'commercial') height = 12 + br1 * 20;else
          if (bt === 'industrial' || bt === 'warehouse') height = 8 + br1 * 6;else
          if (bt === 'church' || bt === 'cathedral') height = 15 + br1 * 15;else
          if (bt === 'skyscraper' || bt === 'office') height = 30 + br1 * 50;else
          height = 8 + br1 * 12;
        }

        const bt = way.tags.building || 'yes';
        const buildingLevels = Number.parseFloat(way.tags['building:levels']);
        const sourceBuildingId = way.id ? String(way.id) : `osm-${Math.round(centerX * 10)}-${Math.round(centerZ * 10)}`;
        const nearRoadCore = roadCoreStats.centroidInside || roadCoreStats.inside >= 2;
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

        const baseElevation = slopeRange >= 0.06 ? minElevation + 0.03 : avgElevation;
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
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }

        if (!mesh) return;
        mesh.userData.terrainAvgElevation = avgElevation;
        mesh.userData.lodTier = lodTier;
        mesh.userData.sourceBuildingId = sourceBuildingId;
        mesh.userData.buildingName = way.tags.name || '';
        mesh.userData.buildingType = bt;
        const colliderRef = registerBuildingCollision(pts, height, {
          detail: colliderDetail,
          centerX,
          centerZ,
          sourceBuildingId,
          name: way.tags.name || '',
          buildingType: bt,
          levels: Number.isFinite(buildingLevels) ? buildingLevels : null,
          baseY: baseElevation
        });
        if (colliderDetail === 'full') loadMetrics.colliders.full += 1;else
        loadMetrics.colliders.simplified += 1;
        if (colliderRef) {
          colliderRef.baseY = baseElevation;
        }

        appCtx.scene.add(mesh);
        appCtx.buildingMeshes.push(mesh);
        const roofDetailMesh = createRoofDetailMesh(pts, height, baseElevation, bSeed, bt, lodTier);
        if (roofDetailMesh) {
          roofDetailMesh.userData.sourceBuildingId = sourceBuildingId;
          roofDetailMesh.userData.terrainAvgElevation = avgElevation;
          appCtx.scene.add(roofDetailMesh);
          appCtx.buildingMeshes.push(roofDetailMesh);
        }
        if (lodTier === 'near') loadMetrics.lod.near += 1;else
        loadMetrics.lod.mid += 1;

        // On sloped terrain, add terrain-conforming ground support so building
        // bases do not appear to float above hills/step terrain.
        if (lodTier === 'near' && typeof appCtx.createBuildingGroundPatch === 'function' && slopeRange >= 0.15) {
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
          color: appCtx.LANDUSE_STYLES.water.color,
          emissive: 0x0f355a,
          emissiveIntensity: 0.24,
          roughness: 0.18,
          metalness: 0.05,
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

        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = 1;
        mesh.position.y = surfaceBaseElevation;
        mesh.userData.landuseFootprint = ring;
        mesh.userData.avgElevation = surfaceBaseElevation;
        mesh.userData.alwaysVisible = isWater;
        mesh.userData.landuseType = landuseType;
        mesh.userData.waterFlattenFactor = waterFlattenFactor;
        if (isWater) mesh.userData.waterSurfaceBase = surfaceBaseElevation;
        mesh.receiveShadow = false;
        mesh.visible = appCtx.landUseVisible || mesh.userData.alwaysVisible;
        appCtx.scene.add(mesh);
        appCtx.landuseMeshes.push(mesh);
        appCtx.landuses.push({ type: landuseType, pts: ring });

        if (isWater) {
          appCtx.waterAreas.push({ type: 'water', pts: ring });
        }
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
          color: 0x3f87d6,
          emissive: 0x0d2b4f,
          emissiveIntensity: 0.18,
          roughness: 0.26,
          metalness: 0.03,
          transparent: false,
          opacity: 1,
          side: THREE.DoubleSide,
          depthWrite: true,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = 1;
        mesh.receiveShadow = false;
        mesh.userData.isWaterwayLine = true;
        mesh.userData.alwaysVisible = true;
        mesh.userData.waterwayCenterline = centerline;
        mesh.userData.waterwayWidth = width;
        mesh.userData.waterwayBias = verticalBias;
        mesh.visible = true;
        appCtx.scene.add(mesh);
        appCtx.landuseMeshes.push(mesh);
        appCtx.waterways.push({
          type: tags?.kind || tags?.waterway || 'waterway',
          width,
          pts: centerline
        });
      }

      function addLinearFeatureRibbon(pts, tags) {
        if (!pts || pts.length < 2) return false;
        const classification = classifyLinearFeatureTags(tags);
        if (!classification) return false;
        const centerline = decimatePoints(pts, classification.kind === 'railway' ? 900 : 700, false);
        if (centerline.length < 2) return false;

        const spec = linearFeatureVisualSpec(classification, tags);
        const halfWidth = spec.width * 0.5;
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
          const leftY = resolveLinearFeatureBaseY(leftX, leftZ, classification.kind) + spec.bias;
          const rightY = resolveLinearFeatureBaseY(rightX, rightZ, classification.kind) + spec.bias;

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
        mesh.visible = appCtx.showPathOverlays !== false;
        appCtx.scene.add(mesh);
        appCtx.linearFeatureMeshes.push(mesh);
        appCtx.linearFeatures.push({
          kind: classification.kind,
          subtype: classification.subtype,
          networkKind: classification.kind,
          name: String(tags?.name || '').trim(),
          width: spec.width,
          bias: spec.bias,
          surfaceBias: spec.bias,
          pts: centerline,
          walkable: true,
          driveable: false
        });
        return true;
      }

      function addWaterPolygonFromVectorCoords(polygonCoords, properties = {}, guardOptions = null) {
        if (!Array.isArray(polygonCoords) || polygonCoords.length === 0) return false;
        const outer = normalizeWorldRingFromLonLat(polygonCoords[0], 1000, guardOptions);
        if (!outer) return false;

        const holes = [];
        for (let i = 1; i < polygonCoords.length; i++) {
          const hole = normalizeWorldRingFromLonLat(polygonCoords[i], 700, guardOptions);
          if (hole && Math.abs(signedPolygonAreaXZ(hole)) > FEATURE_MIN_HOLE_AREA) holes.push(hole);
        }

        addLandusePolygon(outer, 'water', holes, guardOptions);
        return true;
      }

      function addVectorWaterGeoJSON(geojson, guardOptions = null) {
        if (!geojson || !geojson.geometry) return { polygons: 0, lines: 0 };
        let polygons = 0;
        let lines = 0;
        const geom = geojson.geometry;
        const props = geojson.properties || {};

        if (geom.type === 'Polygon') {
          if (addWaterPolygonFromVectorCoords(geom.coordinates, props, guardOptions)) polygons++;
          return { polygons, lines };
        }
        if (geom.type === 'MultiPolygon') {
          geom.coordinates.forEach((polyCoords) => {
            if (addWaterPolygonFromVectorCoords(polyCoords, props, guardOptions)) polygons++;
          });
          return { polygons, lines };
        }
        if (geom.type === 'LineString') {
          const pts = worldLinePointsFromLonLat(geom.coordinates, 1000, guardOptions);
          if (pts && pts.length >= 2) {
            addWaterwayRibbon(pts, props);
            lines++;
          }
          return { polygons, lines };
        }
        if (geom.type === 'MultiLineString') {
          geom.coordinates.forEach((lineCoords) => {
            const pts = worldLinePointsFromLonLat(lineCoords, 1000, guardOptions);
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
        addLandusePolygon(fallbackOuter, 'water', [], waterGeometryGuards);
        return true;
      }

      async function loadVectorTileWaterCoverage(latMin, lonMin, latMax, lonMax, guardOptions = null) {
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
              const out = addVectorWaterGeoJSON(feature.toGeoJSON(x, y, z), guardOptions);
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
              const out = addVectorWaterGeoJSON(feature.toGeoJSON(x, y, z), guardOptions);
              polygons += out.polygons;
              lines += out.lines;
            }
          });
        });

        return { polygons, lines, tiles: tileJobs.length, okTiles };
      }

      appCtx.showLoad(`Loading land use... (${landuseWays.length})`);
      startLoadPhase('buildLanduseGeometry');
      landuseWays.forEach((way) => {
        const landuseType = classifyLanduseType(way.tags);
        if (!landuseType) return;
        const pts = way.nodes.map((id) => nodes[id]).filter((n) => n).map((n) => appCtx.geoToWorld(n.lat, n.lon));
        const guard = landuseType === 'water' ? waterGeometryGuards : landuseGeometryGuards;
        addLandusePolygon(pts, landuseType, [], guard);
      });

      if (Array.isArray(waterwayWays) && waterwayWays.length > 0) {
        waterwayWays.forEach((way) => {
          const pts = way.nodes.map((id) => nodes[id]).filter((n) => n).map((n) => appCtx.geoToWorld(n.lat, n.lon));
          addWaterwayRibbon(pts, way.tags || {});
        });
      }

      appCtx.showLoad('Loading water...');
      try {
        const waterRadius = featureRadius * 1.45;
        const waterSummary = await loadVectorTileWaterCoverage(
          appCtx.LOC.lat - waterRadius,
          appCtx.LOC.lon - waterRadius,
          appCtx.LOC.lat + waterRadius,
          appCtx.LOC.lon + waterRadius,
          waterGeometryGuards
        );
        if (waterSummary.polygons === 0 && waterSummary.lines === 0) {
          console.warn(`[Water] Vector tiles loaded but no water features in bounds (tiles ok ${waterSummary.okTiles}/${waterSummary.tiles}).`);
        }
      } catch (waterErr) {
        console.warn('[Water] Vector water load failed, continuing without vector water layer.', waterErr);
      }
      if (ensureWaterFallbackIfEmpty()) {
        console.warn('[Water] No water features loaded; injected deterministic fallback water surface.');
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

      startLoadPhase('buildLinearFeatureGeometry');
      const linearFeatureGroups = [railwayWays, cyclewayWays, footwayWays];
      linearFeatureGroups.forEach((featureWays) => {
        if (!Array.isArray(featureWays) || featureWays.length === 0) return;
        featureWays.forEach((way) => {
          const rawPts = way.nodes.map((id) => nodes[id]).filter((n) => n).map((n) => appCtx.geoToWorld(n.lat, n.lon));
          const pts = sanitizeWorldPathPoints(rawPts, geometryGuards);
          if (pts.length < 2) return;
          addLinearFeatureRibbon(pts, way.tags);
        });
      });
      syncLinearFeatureOverlayVisibility();
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
    return loadRoads(retryPass + 1);
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
  if (mode === 'walk') {
    if (kind === 'footway') return 0;
    if (kind === 'cycleway') return 4;
    if (kind === 'railway') return 16;
  }
  return 10;
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

function traversalFeatureKind(feature) {
  return String(feature?.networkKind || feature?.kind || 'road').toLowerCase();
}

function isWalkSurface(feature) {
  if (!feature) return false;
  if (feature.walkable === false) return false;
  const kind = traversalFeatureKind(feature);
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
  if (kind === 'footway') return 'Footpath';
  if (kind === 'cycleway') return 'Cycle Path';
  if (kind === 'railway') return 'Rail Corridor';
  return 'Road';
}

function traversableFeaturesForMode(mode = 'walk') {
  const drive = mode === 'drive';
  const features = [];

  if (Array.isArray(appCtx.roads)) {
    for (let i = 0; i < appCtx.roads.length; i++) {
      const road = appCtx.roads[i];
      if (drive ? isVehicleRoad(road) : isWalkSurface(road)) features.push(road);
    }
  }

  if (!drive && Array.isArray(appCtx.linearFeatures)) {
    for (let i = 0; i < appCtx.linearFeatures.length; i++) {
      const feature = appCtx.linearFeatures[i];
      if (isWalkSurface(feature)) features.push(feature);
    }
  }

  return features;
}

function traversalNodeKey(x, z) {
  return `${Math.round(x / TRAVERSAL_NODE_GRID)},${Math.round(z / TRAVERSAL_NODE_GRID)}`;
}

function buildTraversalGraph(mode = 'walk') {
  const features = traversableFeaturesForMode(mode);
  const nodes = [];
  const adjacency = [];
  const segments = [];
  const nodesByKey = new Map();
  const featureKinds = {};

  const upsertNode = (point) => {
    const key = traversalNodeKey(point.x, point.z);
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
    const nodeIds = feature.pts.map((point) => upsertNode(point));
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
  const walk = buildTraversalGraph('walk');
  const drive = buildTraversalGraph('drive');
  appCtx.traversalNetworks = { walk, drive };
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

function buildingContainingPoint(x, z, radius = 6) {
  const candidateBuildings = typeof appCtx.getNearbyBuildings === 'function' ?
    appCtx.getNearbyBuildings(x, z, radius + 12) :
    appCtx.buildings;
  if (!Array.isArray(candidateBuildings) || candidateBuildings.length === 0) return null;

  for (let i = 0; i < candidateBuildings.length; i++) {
    const building = candidateBuildings[i];
    if (!building) continue;
    if (x < building.minX || x > building.maxX || z < building.minZ || z > building.maxZ) continue;

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

function shouldIgnoreDriveCollision(buildingCheck, x, z) {
  if (!buildingCheck?.collision || typeof findNearestRoad !== 'function') return false;
  const nearestRoad = findNearestRoad(x, z);
  const road = nearestRoad?.road;
  if (!isVehicleRoad(road)) return false;
  const roadHalfWidth = Number.isFinite(road?.width) ? road.width * 0.5 : 0;
  if (!(roadHalfWidth > 0 && Number.isFinite(nearestRoad?.dist))) return false;

  const onRoadCenter = nearestRoad.dist <= Math.max(2.2, roadHalfWidth - 0.35);
  const onRoadCore = nearestRoad.dist <= Math.max(1.6, roadHalfWidth - 0.95);
  const colliderDetail = buildingCheck?.building?.colliderDetail === 'bbox' ? 'bbox' : 'full';
  const buildingType = String(buildingCheck?.building?.buildingType || '').toLowerCase();
  const isApproxCollider = colliderDetail !== 'full';
  const roofLikeCollider = buildingType === 'roof' || buildingType === 'canopy' || buildingType === 'carport';
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
  const walkBaseY = walkBaseYAtWorld(x, z);
  if (!Number.isFinite(terrainY)) return { valid: false, reason: 'terrain_missing' };
  if (buildingContainingPoint(x, z, 4)) return { valid: false, reason: 'inside_building', terrainY };
  if (walkBuildBlockCollision(x, z, terrainY)?.blocked) return { valid: false, reason: 'build_block', terrainY };

  const slopeDeg = slopeDegreesAt(x, z);
  if (slopeDeg > 40) return { valid: false, reason: 'slope_too_steep', terrainY, slopeDeg };

  return {
    valid: true,
    mode: 'walk',
    x,
    z,
    angle,
    road: null,
    onRoad: false,
    terrainY,
    walkY: walkBaseY + 1.7,
    carY: driveCenterYAtWorld(x, z, false),
    slopeDeg,
    source: options.source || 'direct'
  };
}

function evaluateDriveSpawnCandidate(x, z, options = {}) {
  const angle = finiteNumberOr(options.angle, finiteNumberOr(appCtx.car?.angle, 0));
  const terrainY = terrainYAtWorld(x, z);
  if (!Number.isFinite(terrainY)) return { valid: false, reason: 'terrain_missing' };

  const nearestRoad = typeof findNearestRoad === 'function' ? findNearestRoad(x, z) : null;
  const road = isVehicleRoad(nearestRoad?.road) ? nearestRoad.road : null;
  const roadHalfWidth = Number.isFinite(road?.width) ? road.width * 0.5 : 0;
  const onRoad = !!(road && Number.isFinite(nearestRoad?.dist) &&
    nearestRoad.dist <= Math.max(2.2, roadHalfWidth - 0.35));

  const desiredFeetY = Number.isFinite(options.feetY) ? options.feetY : NaN;
  if (Number.isFinite(desiredFeetY) && desiredFeetY > terrainY + 2.3) {
    return { valid: false, reason: 'elevated_surface', terrainY, onRoad, road };
  }
  if (driveBuildBlockCollision(x, z, terrainY)) {
    return { valid: false, reason: 'build_block', terrainY, onRoad, road };
  }

  const buildingCheck = typeof appCtx.checkBuildingCollision === 'function' ?
    appCtx.checkBuildingCollision(x, z, 2.0) :
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
    carY: driveCenterYAtWorld(x, z, !!road),
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
  const limits = [maxDistance, Infinity];

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
              requireRoad: true,
              source: 'road_search'
            }) :
            evaluateWalkSpawnCandidate(candidate.x, candidate.z, {
              angle,
              source: 'walk_surface_search'
            });
          if (!evaluated.valid) continue;

          const score = dist + spawnSurfacePenalty(feature, requestedMode) + slopePenaltyAt(candidate.x, candidate.z);
          if (!best || score < best.score) {
            const nextResult = { ...evaluated, score };
            if (requestedMode === 'walk' && isVehicleRoad(feature)) {
              nextResult.road = feature;
              nextResult.onRoad = true;
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

  if (mode === 'walk') {
    const direct = evaluateWalkSpawnCandidate(x, z, {
      angle,
      source: options.source || 'direct'
    });
    if (direct.valid) return direct;

    const surfaceFallback = searchNearestSafeRoadSpawn(x, z, {
      mode: 'walk',
      angle,
      maxDistance: options.maxRoadDistance
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
    source: options.source || 'direct'
  });
  if (direct.valid) return direct;

  const roadFallback = searchNearestSafeRoadSpawn(x, z, {
    mode: 'drive',
    angle,
    feetY: options.feetY,
    maxDistance: options.maxRoadDistance
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

function applySpawnTarget(worldX, worldZ, options = {}) {
  const resolved = resolveSafeWorldSpawn(worldX, worldZ, options);
  return applyResolvedWorldSpawn(resolved, options);
}

function applyCustomLocationSpawn(mode = 'walk', options = {}) {
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
        maxDistance: 180
      });
      if (randomSpawn) return applyResolvedWorldSpawn(randomSpawn, { mode: 'drive' });
    }
  }

  const originX = finiteNumberOr(opts.x, 0);
  const originZ = finiteNumberOr(opts.z, 0);
  const bestRoadSpawn = searchNearestSafeRoadSpawn(originX, originZ, {
    mode: 'drive',
    angle: appCtx.car?.angle,
    maxDistance: 320
  });
  if (bestRoadSpawn) return applyResolvedWorldSpawn(bestRoadSpawn, { mode: 'drive' });

  return applySpawnTarget(originX, originZ, {
    mode: 'drive',
    source: 'spawn_on_road_fallback'
  });
}

function teleportToLocation(worldX, worldZ) {
  const walkModeActive = !!(appCtx.Walk && appCtx.Walk.state && appCtx.Walk.state.mode === 'walk');
  const mode = walkModeActive ? 'walk' : 'drive';
  const currentAngle = walkModeActive ?
    finiteNumberOr(appCtx.Walk?.state?.walker?.angle, appCtx.car?.angle) :
    finiteNumberOr(appCtx.car?.angle, 0);
  const currentFeetY = walkModeActive ?
    finiteNumberOr(appCtx.Walk?.state?.walker?.y, 0) - 1.7 :
    NaN;

  const resolved = applySpawnTarget(worldX, worldZ, {
    mode,
    angle: currentAngle,
    feetY: currentFeetY,
    source: 'teleport'
  });

  if (appCtx.droneMode && resolved) {
    appCtx.drone.x = resolved.x;
    appCtx.drone.z = resolved.z;
    appCtx.drone.yaw = resolved.angle;
  }
}

// Convert minimap screen coordinates to world coordinates
function minimapScreenToWorld(screenX, screenY) {
  const ref = appCtx.Walk ? appCtx.Walk.getMapRefPosition(appCtx.droneMode, appCtx.drone) : { x: appCtx.car.x, z: appCtx.car.z };
  const refLat = appCtx.LOC.lat - ref.z / appCtx.SCALE;
  const refLon = appCtx.LOC.lon + ref.x / (appCtx.SCALE * Math.cos(appCtx.LOC.lat * Math.PI / 180));

  const zoom = 17; // Minimap zoom level
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
const _nearRoadResult = { road: null, dist: Infinity, pt: { x: 0, z: 0 } };

function findNearestRoad(x, z) {
  _nearRoadResult.road = null;
  _nearRoadResult.dist = Infinity;

  for (let r = 0; r < appCtx.roads.length; r++) {
    const road = appCtx.roads[r];
    const pts = road.pts;
    // Quick bounding box skip: check if first point is way too far
    const fp = pts[0];
    const roughDist = Math.abs(x - fp.x) + Math.abs(z - fp.z);
    if (roughDist > _nearRoadResult.dist + 500) continue;

    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i],p2 = pts[i + 1];
      const dx = p2.x - p1.x,dz = p2.z - p1.z,len2 = dx * dx + dz * dz;
      if (len2 === 0) continue;
      let t = ((x - p1.x) * dx + (z - p1.z) * dz) / len2;
      t = Math.max(0, Math.min(1, t));
      const nx = p1.x + t * dx,nz = p1.z + t * dz;
      const ddx = x - nx,ddz = z - nz;
      const d = Math.sqrt(ddx * ddx + ddz * ddz);
      if (d < _nearRoadResult.dist) {
        _nearRoadResult.road = road;
        _nearRoadResult.dist = d;
        _nearRoadResult.pt.x = nx;
        _nearRoadResult.pt.z = nz;
      }
    }
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

  const ref = appCtx.Walk && appCtx.Walk.state && appCtx.Walk.state.mode === 'walk' && appCtx.Walk.state.walker ?
  appCtx.Walk.state.walker :
  appCtx.droneMode ? appCtx.drone : appCtx.car;
  const refX = Number.isFinite(ref?.x) ? ref.x : 0;
  const refZ = Number.isFinite(ref?.z) ? ref.z : 0;

  if (!force && _lastLodReady) {
    const moved = Math.hypot(refX - _lastLodRefX, refZ - _lastLodRefZ);
    const minMoveForLodUpdate = appCtx.droneMode ? 4 : 8;
    if (moved < minMoveForLodUpdate) return;
  }
  _lastLodRefX = refX;
  _lastLodRefZ = refZ;
  _lastLodReady = true;

  const mode = getPerfModeValue();
  const dynamicBudgetState = getRuntimeDynamicBudget(mode);
  const depthForLod = typeof appCtx.rdtLoadComplexity === 'number' ? appCtx.rdtLoadComplexity :

  typeof appCtx.rdtComplexity === 'number' ? appCtx.rdtComplexity : 0;
  const lodThresholds = getWorldLodThresholds(depthForLod, mode, dynamicBudgetState.lodScale);
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

  const nr = typeof findNearestRoad === 'function' ? findNearestRoad(x, z) : { road: null, dist: Infinity };
  if (nr?.road && Number.isFinite(nr.dist) && nr.dist <= nr.road.width * 0.5 + roadPadding) {
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
  const budgetScale =
    appCtx.rdtComplexity >= 6 ? 0.55 :
    appCtx.rdtComplexity >= 4 ? 0.72 :
    appCtx.rdtComplexity >= 2 ? 0.88 : 1;
  const maxTrees = Math.max(120, Math.floor(MAX_GENERATED_TREE_INSTANCES * budgetScale));
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
      Math.max(2, Math.floor(area / Math.max(60, cfg.spacing * cfg.spacing * cfg.weight))),
      Math.max(4, Math.floor(cfg.maxPerPolygon * budgetScale))
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
        scale: 0.78 + appCtx.rand01FromInt(seed ^ 0x27d4eb2f) * (lu.type === 'forest' || lu.type === 'wood' ? 0.92 : 0.68),
        canopyStretch: 0.84 + appCtx.rand01FromInt(seed ^ 0x9e3779b9) * 0.38,
        rotation: appCtx.rand01FromInt(seed ^ 0x85ebca6b) * Math.PI * 2,
        color: (
          lu.type === 'forest' || lu.type === 'wood' ?
            [0x1d5620, 0x275f22, 0x2f6c27, 0x3d7a31] :
            lu.type === 'orchard' ?
              [0x356f2d, 0x4b8a3a, 0x5d9441] :
              [0x2f7329, 0x417f34, 0x4e8c41]
        )[Math.floor(appCtx.rand01FromInt(seed ^ 0xd3a2646c) * 4) % (lu.type === 'orchard' ? 3 : 4)],
        source: 'polygon',
        landuseType: lu.type,
        options: {
          roadPadding:
            lu.type === 'forest' || lu.type === 'wood' ? 2.2 :
            lu.type === 'orchard' ? 2.0 :
            1.45,
          buildingPadding: lu.type === 'forest' || lu.type === 'wood' ? 1.1 : 0.9
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
  buildVegetationInstancing(collectVegetationPlacements());

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
  largeMapScreenToWorld,
  loadRoads,
  measureRemainingPolylineDistance,
  minimapScreenToWorld,
  pickNavigationTargetPoint,
  pointInPolygon,
  resolveSafeWorldSpawn,
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
  largeMapScreenToWorld,
  loadRoads,
  measureRemainingPolylineDistance,
  minimapScreenToWorld,
  pickNavigationTargetPoint,
  pointInPolygon,
  resolveSafeWorldSpawn,
  syncLinearFeatureOverlayVisibility,
  surfaceDisplayName,
  spawnOnRoad,
  terrainYAtWorld,
  teleportToLocation,
  updateWorldLod };
