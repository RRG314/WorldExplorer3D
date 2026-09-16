import { ctx as appCtx } from "../shared-context.js?v=55";

const FEATURE_TILE_DEGREES = 0.002;

const runtime = {
  getPerfModeValue: () => 'baseline',
  limitNodesByDistance: (nodes) => nodes,
  limitWaysByDistance: (ways) => ways,
  nodeDistanceSq: () => 0
};

export function initWorldBudgets(deps = {}) {
  if (typeof deps.getPerfModeValue === 'function') runtime.getPerfModeValue = deps.getPerfModeValue;
  if (typeof deps.limitNodesByDistance === 'function') runtime.limitNodesByDistance = deps.limitNodesByDistance;
  if (typeof deps.limitWaysByDistance === 'function') runtime.limitWaysByDistance = deps.limitWaysByDistance;
  if (typeof deps.nodeDistanceSq === 'function') runtime.nodeDistanceSq = deps.nodeDistanceSq;
}

export function clampNumber(value, min, max, fallback = 1) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function scaledInt(value, scale, min = 1) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.round(value * scale));
}

export function getRuntimeDynamicBudget(mode = runtime.getPerfModeValue()) {
  const state = typeof appCtx.getDynamicBudgetState === 'function' ? appCtx.getDynamicBudgetState() : null;
  const defaultState = {
    auto: false,
    tier: 'balanced',
    budgetScale: 1,
    lodScale: 1
  };
  const source = state && typeof state === 'object' ? state : defaultState;
  const mobileLike = typeof appCtx.isLikelyMobileDevice === 'function'
    ? appCtx.isLikelyMobileDevice()
    : /android|iphone|ipad|mobile/i.test(String(globalThis.navigator?.userAgent || ''));
  const requestedBudgetScale =
    clampNumber(source.budgetScale, 0.30, 1.00, 1);
  const requestedLodScale =
    clampNumber(source.lodScale, 0.72, 1.00, 1);
  const budgetScale = mobileLike
    ? Math.min(requestedBudgetScale, 0.28)
    : requestedBudgetScale;
  const lodScale = mobileLike
    ? Math.min(requestedLodScale, 0.68)
    : requestedLodScale;
  return {
    ...source,
    budgetScale,
    lodScale,
    deviceClass: mobileLike ? 'mobile' : 'desktop',
    reason: mobileLike ? `${source.reason || 'init'}:mobile_cap` : source.reason
  };
}

export function wayCenterLatLon(way, nodeMap) {
  if (!way?.nodes?.length) return null;

  let latSum = 0;
  let lonSum = 0;
  let count = 0;
  const sampleCount = Math.min(way.nodes.length, 8);

  for (let i = 0; i < sampleCount; i++) {
    const node = nodeMap[way.nodes[i]];
    if (!node) continue;
    latSum += node.lat;
    lonSum += node.lon;
    count += 1;
  }
  if (count === 0) return null;

  return { lat: latSum / count, lon: lonSum / count };
}

export function featureTileKeyForLatLon(lat, lon, tileDegrees = FEATURE_TILE_DEGREES) {
  const cx = Math.floor(lat / tileDegrees);
  const cz = Math.floor(lon / tileDegrees);
  return `${cx},${cz}`;
}

function selectWaysAcrossArea(ways, nodeMap, limit, compareFn, options = {}) {
  if (ways.length <= limit) return ways;
  const coreRatio = Math.max(0.1, Math.min(0.9, Number(options.coreRatio) || 0.5));
  const ordered = ways.slice().sort((a, b) => {
    const priority = compareFn ? compareFn(a, b) : 0;
    return priority || runtime.nodeDistanceSq(nodeMap[a?.nodes?.[0]]) -
      runtime.nodeDistanceSq(nodeMap[b?.nodes?.[0]]);
  });
  const coreKeep = Math.max(1, Math.min(limit, Math.floor(limit * coreRatio)));
  const selected = ordered.slice(0, coreKeep);
  const selectedSet = new Set(selected);
  const spreadDegrees = Math.max(
    FEATURE_TILE_DEGREES,
    Number(options.tileDegrees || FEATURE_TILE_DEGREES) * 4
  );
  const buckets = new Map();
  for (const way of ordered) {
    if (selectedSet.has(way)) continue;
    const center = wayCenterLatLon(way, nodeMap);
    if (!center) continue;
    const key = featureTileKeyForLatLon(center.lat, center.lon, spreadDegrees);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(way);
  }
  const active = [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, bucket]) => bucket);
  let bucketIndex = 0;
  while (active.length > 0 && selected.length < limit) {
    const bucket = active[bucketIndex];
    const way = bucket.shift();
    if (way) selected.push(way);
    if (bucket.length === 0) {
      active.splice(bucketIndex, 1);
      if (active.length === 0) break;
      bucketIndex %= active.length;
    } else {
      bucketIndex = (bucketIndex + 1) % active.length;
    }
  }
  return selected.slice(0, limit);
}

export function limitWaysByTileBudget(ways, nodeMap, options = {}) {
  if (!Array.isArray(ways) || ways.length === 0) return [];

  const globalCap = Number.isFinite(options.globalCap) ? Math.max(0, options.globalCap) : ways.length;
  const basePerTile = Number.isFinite(options.basePerTile) ? Math.max(1, options.basePerTile) : ways.length;
  const minPerTile = Number.isFinite(options.minPerTile) ? Math.max(1, options.minPerTile) : 1;
  const tileDegrees = Number.isFinite(options.tileDegrees) ? options.tileDegrees : FEATURE_TILE_DEGREES;
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
    const cap = basePerTile;

    if (bucket.length > cap) {
      selected.push(...runtime.limitWaysByDistance(
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
  if (spreadAcrossArea) {
    return selectWaysAcrossArea(selected, nodeMap, globalCap, compareFn, {
      coreRatio,
      tileDegrees
    });
  }
  return runtime.limitWaysByDistance(
    selected,
    nodeMap,
    globalCap,
    compareFn,
    spreadAcrossArea ? { spreadAcrossArea: true, coreRatio } : {}
  );
}

export function limitNodesByTileBudget(nodes, options = {}) {
  if (!Array.isArray(nodes) || nodes.length === 0) return [];

  const globalCap = Number.isFinite(options.globalCap) ? Math.max(0, options.globalCap) : nodes.length;
  const basePerTile = Number.isFinite(options.basePerTile) ? Math.max(1, options.basePerTile) : nodes.length;
  const minPerTile = Number.isFinite(options.minPerTile) ? Math.max(1, options.minPerTile) : 1;
  const tileDegrees = Number.isFinite(options.tileDegrees) ? options.tileDegrees : FEATURE_TILE_DEGREES;

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
    const cap = basePerTile;

    if (bucket.length > cap) {
      bucket.sort((a, b) => runtime.nodeDistanceSq(a) - runtime.nodeDistanceSq(b));
      selected.push(...bucket.slice(0, cap));
    } else {
      selected.push(...bucket);
    }
  });

  if (selected.length <= globalCap) return selected;
  return runtime.limitNodesByDistance(selected, globalCap);
}

export function getRoadSubdivisionStep(roadType, tileDepth, mode = runtime.getPerfModeValue()) {
  let maxDist = appCtx.boatMode?.active ? 3.0 : 3.6;

  if (roadType?.includes('motorway') || roadType?.includes('trunk')) {
    maxDist *= 0.82;
  } else if (roadType?.includes('primary') || roadType?.includes('secondary')) {
    maxDist *= 0.90;
  }

  return Math.max(2.0, Math.min(7.0, maxDist));
}

export function getWorldLodThresholds(loadDepth, mode = runtime.getPerfModeValue(), lodScale = 1) {
  const scale = clampNumber(lodScale, 0.75, 1.25, 1);
  const near = Math.max(900, Math.round(1200 * scale));
  const mid = Math.max(near + 600, Math.round(2400 * scale));
  return { near, mid, farVisible: Math.max(mid + 240, Math.round(2700 * scale)) };
}

export function getAdaptiveLoadProfile(
  loadDepth,
  mode = runtime.getPerfModeValue(),
  budgetScale = 1,
  deviceClass = 'desktop'
) {
  const scale = clampNumber(budgetScale, 0.22, 1.35, 1);
  const mobileLike = String(deviceClass || '').toLowerCase() === 'mobile';
  const radiusScale = clampNumber(Math.sqrt(scale), 0.58, 1.08, 1);
  const scaledRadii = (radii) => radii.map((r) => Number((r * radiusScale).toFixed(5)));

  return {
    radii: scaledRadii([0.02, 0.025, 0.03]),
    featureRadiusScale: clampNumber(1.0 * radiusScale, 0.90, 1.02, 1),
    poiRadiusScale: clampNumber(1.0 * radiusScale, 0.88, 1.02, 1),
    maxRoadWays: scaledInt(20000, scale, 3200),
    maxBuildingWays: scaledInt(26000, scale, 7000),
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
    overpassTimeoutMs: mobileLike ? 12000 : 30000,
    optionalProviderTimeoutMs: mobileLike ? 2500 : 9000,
    fixedRegionalGroundTimeoutMs: mobileLike ? 2500 : 35000,
    regionalContextRadiusMeters: mobileLike ? 6000 : 14000,
    maxTotalLoadMs: mobileLike ? 32000 : 62000
  };
}
