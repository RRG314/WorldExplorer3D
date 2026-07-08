import { ctx as appCtx } from "../shared-context.js?v=55";

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

export const OVERPASS_MIN_TIMEOUT_MS = 5000;
const OVERPASS_STAGGER_MS = 220;
const OVERPASS_MEMORY_CACHE_TTL_MS = 6 * 60 * 1000;
const OVERPASS_MEMORY_CACHE_MAX = 6;
const OVERPASS_LOC_EPSILON = 1e-7;

const overpassMemoryCache = [];
let lastOverpassEndpoint = null;
let readPerfModeValue = () => 'balanced';

export function initWorldOsmLoader(deps = {}) {
  if (typeof deps.getPerfModeValue === 'function') {
    readPerfModeValue = deps.getPerfModeValue;
  }
}

export function sameLocation(a, b) {
  return Math.abs((a?.lat || 0) - (b?.lat || 0)) <= OVERPASS_LOC_EPSILON &&
    Math.abs((a?.lon || 0) - (b?.lon || 0)) <= OVERPASS_LOC_EPSILON;
}

function pruneOverpassMemoryCache(nowMs = Date.now()) {
  for (let i = overpassMemoryCache.length - 1; i >= 0; i--) {
    if (nowMs - overpassMemoryCache[i].savedAt > OVERPASS_MEMORY_CACHE_TTL_MS) {
      overpassMemoryCache.splice(i, 1);
    }
  }
}

function findOverpassMemoryCache(meta) {
  if (!meta) return null;
  const nowMs = Date.now();
  pruneOverpassMemoryCache(nowMs);

  let best = null;
  for (let i = 0; i < overpassMemoryCache.length; i++) {
    const entry = overpassMemoryCache[i];
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

  const existingIdx = overpassMemoryCache.findIndex((entry) =>
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

  if (existingIdx >= 0) overpassMemoryCache.splice(existingIdx, 1);
  overpassMemoryCache.unshift(record);

  while (overpassMemoryCache.length > OVERPASS_MEMORY_CACHE_MAX) {
    overpassMemoryCache.pop();
  }
}

function orderedOverpassEndpoints() {
  if (!lastOverpassEndpoint || !OVERPASS_ENDPOINTS.includes(lastOverpassEndpoint)) {
    return OVERPASS_ENDPOINTS.slice();
  }
  const rest = OVERPASS_ENDPOINTS.filter((ep) => ep !== lastOverpassEndpoint);
  return [lastOverpassEndpoint, ...rest];
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

function formatBounds(location, radius) {
  return `(${location.lat - radius},${location.lon - radius},${location.lat + radius},${location.lon + radius})`;
}

export function buildWorldOverpassPlan({
  location,
  roadsRadius,
  featureRadiusScale,
  poiRadiusScale,
  overpassTimeoutMs,
  loadStartedAt,
  maxTotalLoadMs
}) {
  const featureRadius = roadsRadius * featureRadiusScale;
  const poiRadius = roadsRadius * poiRadiusScale;
  const roadsBounds = formatBounds(location, roadsRadius);
  const featureBounds = formatBounds(location, featureRadius);
  const poiBounds = formatBounds(location, poiRadius);
  const linearFeatureRadius = Math.min(featureRadius, Math.max(roadsRadius * 0.6, 0.008));
  const linearFeatureBounds = formatBounds(location, linearFeatureRadius);
  const queryTimeoutSeconds = Math.max(8, Math.floor(overpassTimeoutMs / 1000));
  const linearTimeoutSeconds = Math.max(8, Math.floor(Math.min(overpassTimeoutMs, 18000) / 1000));

  return {
    featureRadius,
    poiRadius,
    overpassCacheMeta: {
      lat: location.lat,
      lon: location.lon,
      roadsRadius,
      featureRadius,
      poiRadius
    },
    deferredLinearFeatureQuery: `[out:json][timeout:${linearTimeoutSeconds}];(
                way["railway"~"^(rail|light_rail|tram|subway|narrow_gauge)$"]${linearFeatureBounds};
                way["highway"~"^(cycleway|footway|pedestrian|path|steps)$"]${linearFeatureBounds};
            );out body;>;out skel qt;`,
    primaryQuery: `[out:json][timeout:${queryTimeoutSeconds}];(
                way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|unclassified|living_street|service)$"]${roadsBounds};
                way["building"]${featureBounds};
                way["building:part"]${featureBounds};
                way["highway"~"^(footway|pedestrian|path|corridor|steps)$"]["bridge"]${featureBounds};
                way["highway"~"^(footway|pedestrian|path|corridor|steps)$"]["layer"]${featureBounds};
                way["highway"~"^(footway|pedestrian|path|corridor|steps)$"]["level"]${featureBounds};
                way["highway"~"^(footway|pedestrian|path|corridor|steps)$"]["covered"]${featureBounds};
                way["highway"~"^(footway|pedestrian|path|corridor|steps)$"]["indoor"]${featureBounds};
                way["highway"~"^(footway|pedestrian|path|corridor|steps)$"]["min_height"]${featureBounds};
                way["landuse"]${featureBounds};
                way["natural"~"^(wood|forest|scrub|grassland|heath|wetland|tree_row|sand|beach|bare_rock|scree|shingle|glacier)$"]${featureBounds};
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
            );out body;>;out skel qt;`,
    loadDeadline: loadStartedAt + maxTotalLoadMs
  };
}

export async function fetchOverpassJSON(query, timeoutMs, deadlineMs = Infinity, cacheMeta = null) {
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
      lastOverpassEndpoint = endpoint;
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
    controllers.forEach((controller) => controller.abort());
    return data;
  } catch {
    throw new Error(`All Overpass endpoints failed: ${errors.join(' | ')}`);
  }
}

export function getWorldLoadSignature() {
  const selLoc = String(appCtx.selLoc || 'baltimore');
  const perfMode = readPerfModeValue();
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
