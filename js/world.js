import { ctx as appCtx } from "./shared-context.js?v=54"; // ============================================================================
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

function normalizeWorldRingFromLonLat(coords, maxPoints = 900) {
  if (!Array.isArray(coords) || coords.length < 3) return null;
  const pts = [];
  for (let i = 0; i < coords.length; i++) {
    const c = coords[i];
    if (!Array.isArray(c) || c.length < 2) continue;
    const p = appCtx.geoToWorld(c[1], c[0]); // GeoJSON: [lon, lat]
    pts.push(p);
  }
  if (pts.length < 3) return null;

  let ring = pts;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && first.x === last.x && first.z === last.z) {
    ring = ring.slice(0, -1);
  }
  if (ring.length < 3) return null;
  if (Math.abs(signedPolygonAreaXZ(ring)) < 10) return null;
  return decimatePoints(ring, maxPoints, false);
}

function worldLinePointsFromLonLat(coords, maxPoints = 1000) {
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const pts = [];
  for (let i = 0; i < coords.length; i++) {
    const c = coords[i];
    if (!Array.isArray(c) || c.length < 2) continue;
    pts.push(appCtx.geoToWorld(c[1], c[0]));
  }
  if (pts.length < 2) return null;
  return decimatePoints(pts, maxPoints, false);
}

function classifyLanduseType(tags) {
  if (!tags) return null;
  if (tags.landuse && appCtx.LANDUSE_STYLES[tags.landuse]) return tags.landuse;
  if (tags.natural === 'wood') return 'wood';
  if (tags.leisure === 'park') return 'park';
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

  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();

  for (let i = 0; i < posAttr.count; i++) {
    v.fromBufferAttribute(posAttr, i).applyMatrix4(matrix);
    batch.positions.push(v.x, v.y, v.z);

    if (normAttr) {
      n.fromBufferAttribute(normAttr, i).applyMatrix3(normalMatrix).normalize();
      batch.normals.push(n.x, n.y, n.z);
    } else {
      batch.normals.push(0, 1, 0);
    }

    if (uvAttr) {
      batch.uvs.push(uvAttr.getX(i), uvAttr.getY(i));
    } else {
      batch.uvs.push(0, 0);
    }
  }

  if (geometry.index) {
    const indexArr = geometry.index.array;
    for (let i = 0; i < indexArr.length; i++) {
      batch.indices.push(indexArr[i] + baseVertex);
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

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(batch.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(batch.normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(batch.uvs, 2));

  const vertexCount = batch.positions.length / 3;
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
      xzPoints.length = 0;

      for (let i = 0; i < group.meshes.length; i++) {
        const mesh = group.meshes[i];
        mesh.updateMatrixWorld(true);
        appendGeometryWithTransform(batch, mesh.geometry, mesh.matrixWorld);

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

      const geometry = buildMergedGeometry(batch);
      if (!geometry) {
        keep.push(...group.meshes);
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
        batchCount: group.meshes.length,
        lodCenter: { x: centerX, z: centerZ },
        lodRadius: maxRadius
      };

      appCtx.scene.add(mergedMesh);
      batchedMeshes.push(mergedMesh);

      for (let i = 0; i < group.meshes.length; i++) {
        const src = group.meshes[i];
        appCtx.scene.remove(src);
        if (src.geometry) src.geometry.dispose();
        if (src.material) src.material.dispose();
      }
      sourceMeshCount += group.meshes.length;
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
  if (!Number.isFinite(x) || !Number.isFinite(z)) return appCtx.buildings;
  if (!buildingSpatialIndex || buildingSpatialIndex.size === 0) return appCtx.buildings;

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
  };

  appCtx.showLoad('Loading ' + locName + '...');
  appCtx.worldLoading = true;
  if (typeof appCtx.clearMemoryMarkersForWorldReload === 'function') {
    appCtx.clearMemoryMarkersForWorldReload();
  }
  if (typeof appCtx.clearBlockBuilderForWorldReload === 'function') {
    appCtx.clearBlockBuilderForWorldReload();
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
  appCtx.rdtSeed = appCtx.hashGeoToInt(appCtx.LOC.lat, appCtx.LOC.lon, appCtx.gameMode === 'trial' ? 1 : appCtx.gameMode === 'checkpoint' ? 2 : 0);
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
      colliderDetail: detail
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
    if (appCtx.gameStarted) safeLoadCall('startMode', () => appCtx.startMode());
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

      // Load roads, buildings, landuse, and POIs in one comprehensive query.
      const q = `[out:json][timeout:${Math.max(8, Math.floor(overpassTimeoutMs / 1000))}];(
                way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|unclassified|living_street|service)$"]${roadsBounds};
                way["building"]${featureBounds};
                way["landuse"]${featureBounds};
                way["natural"="wood"]${featureBounds};
                way["leisure"="park"]${featureBounds};
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

      startLoadPhase('featureBudgeting');
      const allRoadWays = data.elements.filter((e) => e.type === 'way' && e.tags?.highway);
      const roadWays = limitWaysByTileBudget(allRoadWays, nodes, {
        globalCap: maxRoadWays,
        basePerTile: tileBudgetCfg.roadsPerTile,
        minPerTile: tileBudgetCfg.roadsMinPerTile,
        tileDegrees: tileBudgetCfg.tileDegrees,
        useRdt: useRdtBudgeting,
        compareFn: (a, b) => roadTypePriority(b.tags?.highway) - roadTypePriority(a.tags?.highway)
      });

      const allBuildingWays = data.elements.filter((e) => e.type === 'way' && e.tags?.building);
      const buildingWays = limitWaysByTileBudget(allBuildingWays, nodes, {
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
      e.tags.leisure === 'park')

      );
      const landuseWays = limitWaysByTileBudget(allLanduseWays, nodes, {
        globalCap: maxLanduseWays,
        basePerTile: tileBudgetCfg.landusePerTile,
        minPerTile: tileBudgetCfg.landuseMinPerTile,
        tileDegrees: tileBudgetCfg.tileDegrees,
        useRdt: useRdtBudgeting
      });

      const allPoiNodes = data.elements.filter((e) => e.type === 'node' && e.tags);
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
      loadMetrics.pois.requested = allPoiNodes.length;
      loadMetrics.pois.selected = poiNodes.length;
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
        const pts = way.nodes.map((id) => nodes[id]).filter((n) => n).map((n) => appCtx.geoToWorld(n.lat, n.lon));
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

        appCtx.roads.push({
          pts: decimatedRoadPts,
          width,
          limit,
          name,
          type,
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

          // Calculate left and right edge positions
          const leftX = p.x + nx * hw;
          const leftZ = p.z + nz * hw;
          const rightX = p.x - nx * hw;
          const rightZ = p.z - nz * hw;

          // DIRECTLY snap BOTH edges to terrain
          let leftY = _tmh(leftX, leftZ);
          let rightY = _tmh(rightX, rightZ);

          // Add vertical bias to prevent z-fighting and terrain peeking
          // Increased from 0.10 to 0.25 to handle steep slopes
          const verticalBias = 0.25; // 25cm above terrain
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
          const skirtData = appCtx.buildRoadSkirts(leftEdge, rightEdge, 3.0);
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
                const y = (typeof appCtx.terrainMeshHeightAt === 'function' ? appCtx.terrainMeshHeightAt(x, z) : appCtx.elevationWorldYAtWorldXZ(x, z)) + 0.25; // Just above road surface
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

      appCtx.roads.forEach((rd) => {
        if (!rd || !rd.pts) return;
        for (let i = 0; i < rd.pts.length; i += 2) {
          const p = rd.pts[i];
          const cx = Math.floor(p.x / roadBuildingCellSize);
          const cz = Math.floor(p.z / roadBuildingCellSize);
          roadCoverageCells.add(`${cx},${cz}`);
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
        const pts = way.nodes.map((id) => nodes[id]).filter((n) => n).map((n) => appCtx.geoToWorld(n.lat, n.lon));
        if (pts.length < 3) return;
        if (!isBuildingNearLoadedRoad(pts)) return;

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

        const colliderDetail = useRdtBudgeting && lodTier !== 'near' ? 'bbox' : 'full';
        registerBuildingCollision(pts, height, { detail: colliderDetail, centerX, centerZ });
        if (colliderDetail === 'full') loadMetrics.colliders.full += 1;else
        loadMetrics.colliders.simplified += 1;

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

        // Deterministic facade selection (matches original texture style)
        const colors = ['#888888', '#7788aa', '#998877', '#667788'];
        const baseColor = colors[Math.floor(br2 * colors.length)];
        const bt = way.tags.building || 'yes';
        const shape = new THREE.Shape();
        pts.forEach((p, i) => {
          if (i === 0) shape.moveTo(p.x, -p.z);else
          shape.lineTo(p.x, -p.z);
        });
        shape.closePath();

        const extrudeSettings = { depth: height, bevelEnabled: false };
        const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geo.rotateX(-Math.PI / 2);

        const bldgMat = typeof appCtx.getBuildingMaterial === 'function' ?
        appCtx.getBuildingMaterial(bt, bSeed, baseColor) :
        new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.85, metalness: 0.05 });

        const mesh = new THREE.Mesh(geo, bldgMat);
        mesh.position.y = avgElevation;
        mesh.userData.buildingFootprint = pts;
        mesh.userData.avgElevation = avgElevation;
        mesh.userData.lodTier = lodTier;
        mesh.castShadow = lodTier === 'near';
        mesh.receiveShadow = true;

        if (!mesh) return;
        appCtx.scene.add(mesh);
        appCtx.buildingMeshes.push(mesh);
        if (lodTier === 'near') loadMetrics.lod.near += 1;else
        loadMetrics.lod.mid += 1;

        // On steep terrain, add a terrain-conforming apron to hide
        // exposed flat foundation planes around the footprint.
        if (lodTier === 'near' && typeof appCtx.createBuildingGroundPatch === 'function' && slopeRange >= 0.7) {
          const groundPatch = appCtx.createBuildingGroundPatch(pts, avgElevation);
          if (groundPatch) {
            groundPatch.userData.landuseFootprint = pts;
            groundPatch.userData.landuseType = 'buildingGround';
            groundPatch.userData.avgElevation = avgElevation;
            groundPatch.userData.alwaysVisible = true;
            groundPatch.visible = true;
            appCtx.scene.add(groundPatch);
            appCtx.landuseMeshes.push(groundPatch);
          }
        }
      });
      endLoadPhase('buildBuildingGeometry');
      startLoadPhase('batchBuildingGeometry');
      const batchedNearCount = batchNearLodBuildingMeshes();
      if (batchedNearCount > 0) {
        loadMetrics.lod.nearBatched = batchedNearCount;
      }
      if (appCtx._lastBuildingBatchStats) {
        loadMetrics.buildingBatching = { ...appCtx._lastBuildingBatchStats };
      }
      endLoadPhase('batchBuildingGeometry');

      function addLandusePolygon(pts, landuseType, holeRings = []) {
        if (!pts || pts.length < 3) return;

        let ring = pts;
        const first = pts[0];
        const last = pts[pts.length - 1];
        if (first.x === last.x && first.z === last.z) {
          ring = pts.slice(0, -1);
        }
        if (ring.length < 3) return;
        if (Math.abs(signedPolygonAreaXZ(ring)) < 10) return;

        ring = decimatePoints(ring, 900, false);

        let avgElevation = 0;
        ring.forEach((p) => {
          avgElevation += appCtx.elevationWorldYAtWorldXZ(p.x, p.z);
        });
        avgElevation /= ring.length;

        const shape = new THREE.Shape();
        ring.forEach((p, i) => {
          if (i === 0) shape.moveTo(p.x, -p.z);else
          shape.lineTo(p.x, -p.z);
        });
        shape.closePath();

        if (holeRings && holeRings.length > 0) {
          holeRings.forEach((holeRing) => {
            if (!holeRing || holeRing.length < 3) return;
            const path = new THREE.Path();
            holeRing.forEach((p, i) => {
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
        const waterFlattenFactor = isWater ? 0.12 : 1.0;
        const positions = geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          const x = positions.getX(i);
          const z = positions.getZ(i);
          const terrainY = appCtx.elevationWorldYAtWorldXZ(x, z);
          const useY = terrainY === 0 && Math.abs(avgElevation) > 2 ? avgElevation : terrainY;
          positions.setY(i, (useY - avgElevation) * waterFlattenFactor + (isWater ? 0.08 : 0.02));
        }
        positions.needsUpdate = true;
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial(isWater ? {
          color: appCtx.LANDUSE_STYLES.water.color,
          emissive: 0x0f355a,
          emissiveIntensity: 0.30,
          roughness: 0.14,
          metalness: 0.06,
          transparent: true,
          opacity: 0.92,
          side: THREE.DoubleSide,
          depthWrite: false,
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
        mesh.position.y = avgElevation;
        mesh.userData.landuseFootprint = ring;
        mesh.userData.avgElevation = avgElevation;
        mesh.userData.alwaysVisible = isWater;
        mesh.userData.landuseType = landuseType;
        mesh.userData.waterFlattenFactor = waterFlattenFactor;
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
          emissiveIntensity: 0.22,
          roughness: 0.2,
          metalness: 0.04,
          transparent: true,
          opacity: 0.82,
          side: THREE.DoubleSide,
          depthWrite: false,
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

      function addWaterPolygonFromVectorCoords(polygonCoords, properties = {}) {
        if (!Array.isArray(polygonCoords) || polygonCoords.length === 0) return false;
        const outer = normalizeWorldRingFromLonLat(polygonCoords[0], 1000);
        if (!outer) return false;

        const holes = [];
        for (let i = 1; i < polygonCoords.length; i++) {
          const hole = normalizeWorldRingFromLonLat(polygonCoords[i], 700);
          if (hole && Math.abs(signedPolygonAreaXZ(hole)) > 12) holes.push(hole);
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

      appCtx.showLoad(`Loading land use... (${landuseWays.length})`);
      startLoadPhase('buildLanduseGeometry');
      landuseWays.forEach((way) => {
        const landuseType = classifyLanduseType(way.tags);
        if (!landuseType) return;
        const pts = way.nodes.map((id) => nodes[id]).filter((n) => n).map((n) => appCtx.geoToWorld(n.lat, n.lon));
        addLandusePolygon(pts, landuseType);
      });

      appCtx.showLoad('Loading water...');
      try {
        const waterSummary = await loadVectorTileWaterCoverage(
          appCtx.LOC.lat - featureRadius,
          appCtx.LOC.lon - featureRadius,
          appCtx.LOC.lat + featureRadius,
          appCtx.LOC.lon + featureRadius
        );
        if (waterSummary.polygons === 0 && waterSummary.lines === 0) {
          console.warn(`[Water] Vector tiles loaded but no water features in bounds (tiles ok ${waterSummary.okTiles}/${waterSummary.tiles}).`);
        }
      } catch (waterErr) {
        console.warn('[Water] Vector water load failed, continuing without vector water layer.', waterErr);
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

      // Process POIs for meaning in the world
      appCtx.showLoad(`Loading POIs... (${poiNodes.length})`);
      startLoadPhase('buildPoiGeometry');
      poiNodes.forEach((node) => {
        const tags = node.tags;
        let poiKey = null;

        // Determine POI type
        if (tags.amenity) {
          poiKey = `amenity=${tags.amenity}`;
        } else if (tags.shop === 'supermarket') {
          poiKey = 'shop=supermarket';
        } else if (tags.shop === 'mall') {
          poiKey = 'shop=mall';
        } else if (tags.shop === 'convenience') {
          poiKey = 'shop=convenience';
        } else if (tags.tourism) {
          poiKey = `tourism=${tags.tourism}`;
        } else if (tags.historic) {
          poiKey = tags.historic === 'monument' ? 'historic=monument' : 'historic=memorial';
        } else if (tags.leisure) {
          poiKey = `leisure=${tags.leisure}`;
        }

        if (poiKey && appCtx.POI_TYPES[poiKey]) {
          const pos = appCtx.geoToWorld(node.lat, node.lon);
          const poiData = appCtx.POI_TYPES[poiKey];
          const centerDist = Math.hypot(pos.x, pos.z);
          const poiTier = centerDist <= lodNearDist ?
          'near' :
          centerDist <= lodMidDist ? 'mid' : 'far';

          // Get terrain elevation at POI location
          const terrainY = appCtx.elevationWorldYAtWorldXZ(pos.x, pos.z);

          if (poiTier === 'near') {
            loadMetrics.pois.near += 1;
          } else if (poiTier === 'mid') {
            loadMetrics.pois.mid += 1;
          } else {
            loadMetrics.pois.far += 1;
          }

          if (poiTier !== 'far') {
            // Near: full marker + cap. Mid: simpler single marker.
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

          // Store POI data
          appCtx.pois.push({
            x: pos.x,
            z: pos.z,
            type: poiKey,
            name: tags.name || poiData.category,
            lodTier: poiTier,
            ...poiData
          });

          // Store historic sites separately for historic panel
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
        }
      });
      endLoadPhase('buildPoiGeometry');

      if (appCtx.roads.length > 0) {
        // Generate street furniture (signs, trees, lights, trash cans)
        appCtx.showLoad('Adding details...');
        startLoadPhase('buildStreetFurniture');
        try {
          generateStreetFurniture();
        } catch (err) {
          loadMetrics.streetFurnitureError = err?.message || String(err);
          recordLoadWarning('generateStreetFurniture', err);
        } finally {
          endLoadPhase('buildStreetFurniture');
        }

        finalizeLoadedWorld('primary');
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
      // If this is the last attempt and we still have no roads, create a default environment
      if (appCtx.roads.length === 0) {
        // Debug log removed
        appCtx.showLoad('Creating default environment...');

        // Create a simple crossroad
        const makeRoad = (x1, z1, x2, z2, width = 10) => {
          const pts = [{ x: x1, z: z1 }, { x: x2, z: z2 }];
          appCtx.roads.push({
            pts,
            width,
            limit: 35,
            name: 'Main Street',
            type: 'primary',
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

        // Create roads in a cross pattern
        makeRoad(-200, 0, 200, 0, 12); // Horizontal
        makeRoad(0, -200, 0, 200, 12); // Vertical
        makeRoad(-150, -150, 150, 150, 10); // Diagonal 1
        makeRoad(-150, 150, 150, -150, 10); // Diagonal 2

        // Create a few simple buildings
        const makeBuilding = (x, z, w, d, h) => {
          const pts = [
          { x: x - w / 2, z: z - d / 2 },
          { x: x + w / 2, z: z - d / 2 },
          { x: x + w / 2, z: z + d / 2 },
          { x: x - w / 2, z: z + d / 2 }];

          registerBuildingCollision(pts, h);

          const shape = new THREE.Shape();
          shape.moveTo(pts[0].x, pts[0].z);
          for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, pts[i].z);
          shape.lineTo(pts[0].x, pts[0].z);

          const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
          geo.rotateX(-Math.PI / 2);
          const color = [0x8899aa, 0x887766, 0x7788aa, 0x887799][Math.floor(Math.random() * 4)];
          const mat = new THREE.MeshLambertMaterial({ color });
          const mesh = new THREE.Mesh(geo, mat);

          // Calculate terrain stats for building
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
          mesh.position.y = avgElevation;
          mesh.userData.buildingFootprint = pts; // Store for repositioning
          mesh.userData.avgElevation = avgElevation;

          mesh.castShadow = true;
          mesh.receiveShadow = true;
          appCtx.scene.add(mesh);
          appCtx.buildingMeshes.push(mesh);

          if (typeof appCtx.createBuildingGroundPatch === 'function' && slopeRange >= 0.7) {
            const groundPatch = appCtx.createBuildingGroundPatch(pts, avgElevation);
            if (groundPatch) {
              groundPatch.userData.landuseFootprint = pts;
              groundPatch.userData.landuseType = 'buildingGround';
              groundPatch.userData.avgElevation = avgElevation;
              groundPatch.userData.alwaysVisible = true;
              groundPatch.visible = true;
              appCtx.scene.add(groundPatch);
              appCtx.landuseMeshes.push(groundPatch);
            }
          }
        };

        // Add buildings around the crossroad
        makeBuilding(-80, -80, 40, 30, 15);
        makeBuilding(80, -80, 35, 40, 20);
        makeBuilding(-80, 80, 45, 35, 18);
        makeBuilding(80, 80, 30, 35, 12);
        makeBuilding(-50, 50, 25, 20, 10);
        makeBuilding(50, -50, 30, 25, 14);

        finalizeLoadedWorld('synthetic_fallback');
      }
    }
  }
  if (!loaded && appCtx.roads.length > 0) {
    console.warn('[WorldLoad] Completing with partially loaded roads.');
    finalizeLoadedWorld('post_loop_partial');
  }
  if (!loaded && retryPass < 1) {
    console.warn('[WorldLoad] Initial pass failed. Retrying once automatically...');
    appCtx.showLoad('Retrying map data...');
    appCtx.worldLoading = false;
    return loadRoads(retryPass + 1);
  }
  if (!loaded) {
    appCtx.showLoad('Failed to load. Click to retry.');
    document.getElementById('loading').onclick = () => {
      document.getElementById('loading').onclick = null;
      loadRoads();
    };
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
    poiMeshes: appCtx.poiMeshes.length,
    landuseMeshes: appCtx.landuseMeshes.length
  });
}

function spawnOnRoad() {
  if (!appCtx.roads || appCtx.roads.length === 0) return;

  function spawnRoadPenalty(type) {
    if (!type) return 0;
    if (type.includes('motorway') || type.includes('trunk')) return 120;
    if (type.includes('primary')) return 40;
    if (type.includes('secondary')) return 20;
    if (type.includes('service')) return 12;
    return 0;
  }

  // Pick the road point closest to the location center, with light penalties for
  // highway-like roads so initial spawn stays in the city core.
  let best = null;
  appCtx.roads.forEach((rd) => {
    if (!rd || !rd.pts || rd.pts.length < 2) return;
    const penalty = spawnRoadPenalty(rd.type);
    for (let i = 0; i < rd.pts.length; i++) {
      const p = rd.pts[i];
      const score = Math.hypot(p.x, p.z) + penalty;
      if (!best || score < best.score) {
        best = { road: rd, idx: i, score };
      }
    }
  });
  if (!best) return;

  const rd = best.road;
  const idx = best.idx;
  appCtx.car.x = rd.pts[idx].x;
  appCtx.car.z = rd.pts[idx].z;

  if (idx < rd.pts.length - 1) {
    appCtx.car.angle = Math.atan2(rd.pts[idx + 1].x - rd.pts[idx].x, rd.pts[idx + 1].z - rd.pts[idx].z);
  } else if (idx > 0) {
    appCtx.car.angle = Math.atan2(rd.pts[idx].x - rd.pts[idx - 1].x, rd.pts[idx].z - rd.pts[idx - 1].z);
  }
  appCtx.car.speed = 0;appCtx.car.vx = 0;appCtx.car.vz = 0;
  const _spawnH = typeof appCtx.terrainMeshHeightAt === 'function' ? appCtx.terrainMeshHeightAt : appCtx.elevationWorldYAtWorldXZ;
  const spawnY = typeof appCtx.GroundHeight !== 'undefined' && appCtx.GroundHeight && typeof appCtx.GroundHeight.carCenterY === 'function' ?
  appCtx.GroundHeight.carCenterY(appCtx.car.x, appCtx.car.z, true, 1.2) :
  _spawnH(appCtx.car.x, appCtx.car.z) + 1.2;
  appCtx.car.y = spawnY;
  if (appCtx.carMesh) {
    appCtx.carMesh.position.set(appCtx.car.x, spawnY, appCtx.car.z);
    appCtx.carMesh.rotation.y = appCtx.car.angle;
  }

  // Keep walker state aligned with current car spawn so switching back to
  // driving mode cannot snap to stale coordinates from the previous city.
  if (appCtx.Walk && appCtx.Walk.state && appCtx.Walk.state.walker) {
    const groundY = spawnY - 1.2;
    appCtx.Walk.state.walker.x = appCtx.car.x;
    appCtx.Walk.state.walker.z = appCtx.car.z;
    appCtx.Walk.state.walker.y = groundY + 1.7;
    appCtx.Walk.state.walker.vy = 0;
    appCtx.Walk.state.walker.angle = appCtx.car.angle;
    appCtx.Walk.state.walker.yaw = appCtx.car.angle;
    if (appCtx.Walk.state.characterMesh && appCtx.Walk.state.mode === 'walk') {
      appCtx.Walk.state.characterMesh.position.set(appCtx.car.x, groundY, appCtx.car.z);
      appCtx.Walk.state.characterMesh.rotation.y = appCtx.car.angle;
    }
  }
}

function teleportToLocation(worldX, worldZ) {
  // Try to snap to nearest road if available
  const nearest = findNearestRoad(worldX, worldZ);
  let targetX = worldX,targetZ = worldZ;
  let targetAngle = appCtx.car.angle;

  // If we found a road within reasonable distance, snap to it
  if (nearest.road && nearest.dist < 50) {
    targetX = nearest.pt.x;
    targetZ = nearest.pt.z;

    // Find the road segment angle
    const road = nearest.road;
    let closestSegment = 0;
    let minDist = Infinity;
    for (let i = 0; i < road.pts.length - 1; i++) {
      const p1 = road.pts[i],p2 = road.pts[i + 1];
      const midX = (p1.x + p2.x) / 2;
      const midZ = (p1.z + p2.z) / 2;
      const d = Math.hypot(targetX - midX, targetZ - midZ);
      if (d < minDist) {
        minDist = d;
        closestSegment = i;
      }
    }
    if (closestSegment < road.pts.length - 1) {
      const p1 = road.pts[closestSegment];
      const p2 = road.pts[closestSegment + 1];
      targetAngle = Math.atan2(p2.x - p1.x, p2.z - p1.z);
    }
  }

  // Update car position
  appCtx.car.x = targetX;
  appCtx.car.z = targetZ;
  appCtx.car.angle = targetAngle;
  appCtx.car.speed = 0;
  appCtx.car.vx = 0;
  appCtx.car.vz = 0;
  const _teleH = typeof appCtx.terrainMeshHeightAt === 'function' ? appCtx.terrainMeshHeightAt : appCtx.elevationWorldYAtWorldXZ;
  const teleportY = typeof appCtx.GroundHeight !== 'undefined' && appCtx.GroundHeight && typeof appCtx.GroundHeight.carCenterY === 'function' ?
  appCtx.GroundHeight.carCenterY(appCtx.car.x, appCtx.car.z, true, 1.2) :
  _teleH(appCtx.car.x, appCtx.car.z) + 1.2;
  appCtx.car.y = teleportY;
  appCtx.carMesh.position.set(appCtx.car.x, teleportY, appCtx.car.z);
  appCtx.carMesh.rotation.y = appCtx.car.angle;

  // Keep walker position aligned with teleports so mode switching stays stable.
  if (appCtx.Walk && appCtx.Walk.state && appCtx.Walk.state.walker) {
    const groundY = teleportY - 1.2;
    appCtx.Walk.state.walker.x = targetX;
    appCtx.Walk.state.walker.z = targetZ;
    appCtx.Walk.state.walker.y = groundY + 1.7;
    appCtx.Walk.state.walker.vy = 0;
    appCtx.Walk.state.walker.angle = targetAngle;
    appCtx.Walk.state.walker.yaw = targetAngle;
    appCtx.Walk.state.walker.speed = 0;
    if (appCtx.Walk.state.characterMesh && appCtx.Walk.state.mode === 'walk') {
      appCtx.Walk.state.characterMesh.position.set(targetX, groundY, targetZ);
      appCtx.Walk.state.characterMesh.rotation.y = targetAngle;
    }
  }

  // Update drone position if in drone mode
  if (appCtx.droneMode) {
    appCtx.drone.x = targetX;
    appCtx.drone.z = targetZ;
    appCtx.drone.yaw = targetAngle;
  }

  // Debug log removed
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

  // --- TREES: place in parks and green areas ---
  appCtx.landuses.forEach((lu) => {
    if (lu.type !== 'park' && lu.type !== 'wood' && lu.type !== 'forest' &&
    lu.type !== 'garden' && lu.type !== 'grass' && lu.type !== 'meadow' &&
    lu.type !== 'village_green' && lu.type !== 'recreation_ground') return;

    // Get bounding box of this landuse area
    let minX = Infinity,maxX = -Infinity,minZ = Infinity,maxZ = -Infinity;
    lu.pts.forEach((p) => {
      minX = Math.min(minX, p.x);maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);maxZ = Math.max(maxZ, p.z);
    });

    const areaWidth = maxX - minX;
    const areaDepth = maxZ - minZ;
    const area = areaWidth * areaDepth;

    // Tree density based on type: woods are denser
    const isWoods = lu.type === 'wood' || lu.type === 'forest';
    const spacing = isWoods ? 25 : 35;
    const maxTrees = Math.min(isWoods ? 20 : 8, Math.floor(area / (spacing * spacing)));

    let treesPlaced = 0;
    for (let attempt = 0; attempt < maxTrees * 3 && treesPlaced < maxTrees; attempt++) {
      const tx = minX + Math.random() * areaWidth;
      const tz = minZ + Math.random() * areaDepth;

      // Check point is inside the polygon AND not on/near a road
      if (pointInPolygon(tx, tz, lu.pts)) {
        const nr = findNearestRoad(tx, tz);
        const roadClearance = nr.road ? nr.road.width / 2 + 4 : 0;
        if (!nr.road || nr.dist > roadClearance) {
          createTree(tx, tz, Math.random());
          treesPlaced++;
        }
      }
    }
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

Object.assign(appCtx, {
  findNearestRoad,
  getNearbyBuildings,
  largeMapScreenToWorld,
  loadRoads,
  minimapScreenToWorld,
  pointInPolygon,
  spawnOnRoad,
  teleportToLocation,
  updateWorldLod
});

export {
  findNearestRoad,
  getNearbyBuildings,
  largeMapScreenToWorld,
  loadRoads,
  minimapScreenToWorld,
  pointInPolygon,
  spawnOnRoad,
  teleportToLocation,
  updateWorldLod };
