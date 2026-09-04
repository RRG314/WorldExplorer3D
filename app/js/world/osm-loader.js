import { ctx as appCtx } from "../shared-context.js?v=55";
import {
  clearPersistentOverpassCache,
  readPersistentOverpassCache,
  readPersistentOverpassFallback,
  writePersistentOverpassCache
} from "./osm-cache.js?v=3";

const OVERPASS_ENDPOINTS = [
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter'
];

export const OVERPASS_MIN_TIMEOUT_MS = 5000;
const OVERPASS_STAGGER_MS = 2000;
const OVERPASS_MEMORY_CACHE_TTL_MS = 6 * 60 * 1000;
const OVERPASS_MEMORY_CACHE_MAX = 6;
const OVERPASS_LOC_EPSILON = 1e-7;
const OVERPASS_PROVIDER_COOLDOWN_MS = 2 * 60 * 1000;
const OVERPASS_PROVIDER_HEALTH_KEY = 'world-explorer:overpass-provider-health-v1';

const overpassMemoryCache = [];
let lastOverpassEndpoint = null;
let readPerfModeValue = () => 'balanced';

function readOverpassProviderHealth() {
  try {
    const parsed = JSON.parse(globalThis.sessionStorage?.getItem?.(OVERPASS_PROVIDER_HEALTH_KEY) || 'null');
    return {
      unavailableUntil: Math.max(0, Number(parsed?.unavailableUntil) || 0),
      lastSuccessAt: Math.max(0, Number(parsed?.lastSuccessAt) || 0)
    };
  } catch {
    return { unavailableUntil: 0, lastSuccessAt: 0 };
  }
}

function writeOverpassProviderHealth(health) {
  try {
    globalThis.sessionStorage?.setItem?.(OVERPASS_PROVIDER_HEALTH_KEY, JSON.stringify(health));
  } catch {
    // Provider health is an optimization only. Storage denial must not affect loading.
  }
}

function markOverpassProviderAvailable(nowMs = Date.now()) {
  writeOverpassProviderHealth({ unavailableUntil: 0, lastSuccessAt: nowMs });
}

function markOverpassProviderUnavailable(requestStartedAt, nowMs = Date.now()) {
  const health = readOverpassProviderHealth();
  // A sibling request from the same provider batch may have succeeded while
  // this request was still exhausting its endpoints. One success keeps the
  // provider available for the rest of the session.
  if (health.lastSuccessAt >= requestStartedAt) return;
  writeOverpassProviderHealth({
    unavailableUntil: nowMs + OVERPASS_PROVIDER_COOLDOWN_MS,
    lastSuccessAt: health.lastSuccessAt
  });
}

export function getOverpassProviderHealth() {
  const nowMs = Date.now();
  const health = readOverpassProviderHealth();
  return Object.freeze({
    status: health.unavailableUntil > nowMs ? 'cooldown' : 'probe-allowed',
    retryAfterMs: Math.max(0, health.unavailableUntil - nowMs),
    lastSuccessAt: health.lastSuccessAt || null
  });
}

export function getOverpassRuntimeCacheStats() {
  return Object.freeze({
    entryCount: overpassMemoryCache.length,
    elementCount: overpassMemoryCache.reduce(
      (count, entry) => count + (Array.isArray(entry?.data?.elements) ? entry.data.elements.length : 0),
      0
    ),
    entryLimit: OVERPASS_MEMORY_CACHE_MAX
  });
}

export function releaseOverpassRuntimeCache() {
  const stats = getOverpassRuntimeCacheStats();
  overpassMemoryCache.length = 0;
  return stats;
}

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
    if (entry.meta?.kind && meta?.kind && entry.meta.kind !== meta.kind) continue;
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
    String(entry.meta?.kind || '') === String(meta?.kind || '') &&
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
      kind: meta.kind || null
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

export async function invalidateOverpassCaches(location = null, kinds = null) {
  const hasLocation = Number.isFinite(Number(location?.lat)) && Number.isFinite(Number(location?.lon));
  const kindSet = Array.isArray(kinds) && kinds.length > 0 ? new Set(kinds) : null;
  for (let i = overpassMemoryCache.length - 1; i >= 0; i--) {
    const entry = overpassMemoryCache[i];
    const locationMatches = !hasLocation || sameLocation(entry.meta, location);
    const kindMatches = !kindSet || kindSet.has(String(entry.meta?.kind || 'core'));
    if (locationMatches && kindMatches) {
      overpassMemoryCache.splice(i, 1);
    }
  }
  return clearPersistentOverpassCache(hasLocation ? location : null, kinds);
}

function orderedOverpassEndpoints() {
  if (!lastOverpassEndpoint || !OVERPASS_ENDPOINTS.includes(lastOverpassEndpoint)) {
    return OVERPASS_ENDPOINTS.slice();
  }
  const rest = OVERPASS_ENDPOINTS.filter((ep) => ep !== lastOverpassEndpoint);
  return [lastOverpassEndpoint, ...rest];
}

function delayMs(ms, signal = null) {
  if (!signal) return new Promise((resolve) => setTimeout(resolve, ms));
  if (signal.aborted) return Promise.reject(externalAbortError(signal));
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timeoutId);
      signal.removeEventListener('abort', abort);
      reject(externalAbortError(signal));
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}

function formatBounds(location, radius) {
  return `(${location.lat - radius},${location.lon - radius},${location.lat + radius},${location.lon + radius})`;
}

function formatCoverageBounds(bounds) {
  return `(${bounds.minLat},${bounds.minLon},${bounds.maxLat},${bounds.maxLon})`;
}

export function resolveBuildingPublicationBounds(location, visibleRadiusWorld, options = {}) {
  const lat = Number(location?.lat);
  const lon = Number(location?.lon);
  const radiusWorld = Math.max(0, Number(visibleRadiusWorld) || 0);
  const worldScale = Math.max(1, Number(options.worldScale) || 100000);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || radiusWorld <= 0) return null;

  // The fixed-location renderer measures building LOD in local world space.
  // Provider coverage must use the inverse of that same projection or its
  // advertised far-visible circle becomes an increasingly narrow rectangle at
  // higher latitudes. Polar locations normally skip settlement loading; the
  // floor keeps the bounds finite if mapped buildings are explicitly present.
  const longitudeScale = Math.max(0.01, Math.abs(Math.cos(lat * Math.PI / 180)));
  const latRadius = radiusWorld / worldScale;
  const lonRadius = radiusWorld / (worldScale * longitudeScale);
  return Object.freeze({
    minLat: lat - latRadius,
    minLon: lon - lonRadius,
    maxLat: lat + latRadius,
    maxLon: lon + lonRadius,
    latRadius,
    lonRadius,
    visibleRadiusWorld: radiusWorld,
    authority: 'building-far-visible-lod'
  });
}

function overpassCacheKey(meta, query) {
  if (!meta || !query) return null;
  let hash = 2166136261;
  for (let i = 0; i < query.length; i++) {
    hash ^= query.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return [
    Number(meta.lat).toFixed(6),
    Number(meta.lon).toFixed(6),
    Number(meta.roadsRadius).toFixed(5),
    Number(meta.featureRadius).toFixed(5),
    Number(meta.poiRadius).toFixed(5),
    (hash >>> 0).toString(16)
  ].join(':');
}

export function buildWorldOverpassPlan({
  location,
  roadsRadius,
  featureRadiusScale,
  poiRadiusScale,
  buildingVisibleRadiusWorld,
  overpassTimeoutMs,
  loadStartedAt,
  maxTotalLoadMs
}) {
  const featureRadius = roadsRadius * featureRadiusScale;
  const waterStructureRadius = Math.min(
    0.022,
    Math.max(featureRadius, 0.014, roadsRadius * 1.2)
  );
  const buildingCoverage = resolveBuildingPublicationBounds(
    location,
    buildingVisibleRadiusWorld
  );
  const buildingRadius = buildingCoverage
    ? Math.max(buildingCoverage.latRadius, buildingCoverage.lonRadius)
    : waterStructureRadius;
  const buildingCoverageBounds = buildingCoverage || {
    minLat: location.lat - buildingRadius,
    minLon: location.lon - buildingRadius,
    maxLat: location.lat + buildingRadius,
    maxLon: location.lon + buildingRadius
  };
  const buildingMetadataRadius = Math.min(buildingRadius, Math.max(0.004, roadsRadius * 0.22));
  const poiRadius = roadsRadius * poiRadiusScale;
  const roadsBounds = formatBounds(location, roadsRadius);
  const featureBounds = formatBounds(location, featureRadius);
  const buildingBounds = formatCoverageBounds(buildingCoverageBounds);
  const waterStructureBounds = formatBounds(location, waterStructureRadius);
  // Airports are often several kilometres wide. Keep the exact aviation query
  // bounded, but do not clip runways to the smaller streets/land-use radius.
  const transportFacilityRadius = Math.min(0.045, Math.max(featureRadius, 0.036));
  const transportFacilityBounds = formatBounds(location, transportFacilityRadius);
  const buildingMetadataBounds = formatBounds(location, buildingMetadataRadius);
  const poiBounds = formatBounds(location, poiRadius);
  const queryTimeoutSeconds = Math.max(8, Math.floor(overpassTimeoutMs / 1000));

  return {
    featureRadius,
    poiRadius,
    overpassCacheMeta: {
      lat: location.lat,
      lon: location.lon,
      roadsRadius,
      featureRadius,
      poiRadius,
      kind: 'core'
    },
    buildingPublicationCacheMeta: {
      lat: location.lat,
      lon: location.lon,
      roadsRadius,
      featureRadius: buildingRadius,
      bounds: buildingCoverageBounds,
      visibleRadiusWorld: buildingCoverage?.visibleRadiusWorld || null,
      authority: buildingCoverage?.authority || 'legacy-angular-building-radius',
      poiRadius,
      kind: 'buildings'
    },
    buildingMetadataCacheMeta: {
      lat: location.lat,
      lon: location.lon,
      roadsRadius,
      featureRadius: buildingMetadataRadius,
      poiRadius,
      kind: 'building-metadata'
    },
    waterStructureCacheMeta: {
      lat: location.lat,
      lon: location.lon,
      roadsRadius,
      featureRadius: waterStructureRadius,
      poiRadius,
      kind: 'water-structures'
    },
    civicFacilityCacheMeta: {
      lat: location.lat,
      lon: location.lon,
      roadsRadius,
      featureRadius,
      poiRadius,
      kind: 'civic-facilities'
    },
    commercePlaceCacheMeta: {
      lat: location.lat,
      lon: location.lon,
      roadsRadius,
      featureRadius,
      poiRadius,
      kind: 'commerce-places'
    },
    transportFacilityCacheMeta: {
      lat: location.lat,
      lon: location.lon,
      roadsRadius,
      featureRadius: transportFacilityRadius,
      poiRadius,
      kind: 'transport-facilities-v1'
    },
    waterStructureQuery: `[out:json][timeout:${queryTimeoutSeconds}];(
                way["building"="ship"]${waterStructureBounds};
                way["historic"="ship"]${waterStructureBounds};
                way["building"="houseboat"]${waterStructureBounds};
            );out body;>;out skel qt;`,
    civicFacilityQuery: `[out:json][timeout:${queryTimeoutSeconds}];
            nwr["amenity"~"^(police|hospital)$"]${poiBounds};
            out body center qt;`,
    commercePlaceQuery: `[out:json][timeout:${queryTimeoutSeconds}];(
            nwr["shop"~"^(convenience|supermarket|hardware|doityourself|pawnbroker|second_hand|car_repair|car_parts|outdoor|fishing|boat|aviation)$"]${poiBounds};
            nwr["amenity"~"^(fuel|charging_station)$"]${poiBounds};
            );out body center qt;`,
    transportFacilityQuery: `[out:json][timeout:${queryTimeoutSeconds}];(
            nwr["aeroway"~"^(aerodrome|heliport|runway|taxiway|apron|terminal|helipad|hangar|parking_position|gate|control_tower)$"]${transportFacilityBounds};
            nwr["leisure"="marina"]${featureBounds};
            nwr["harbour"="yes"]${featureBounds};
            nwr["landuse"~"^(port|harbour)$"]${featureBounds};
            nwr["man_made"~"^(pier|quay)$"]${featureBounds};
            nwr["waterway"="dock"]${featureBounds};
            nwr["amenity"="ferry_terminal"]${featureBounds};
            nwr["route"="ferry"]${featureBounds};
            nwr["mooring"]${featureBounds};
            nwr["seamark:type"~"^(harbour|berth)$"]${featureBounds};
        );out body center;>;out skel qt;`,
    buildingMetadataQuery: `[out:json][timeout:${queryTimeoutSeconds}];(
                way["building"]${buildingMetadataBounds};
            );out tags center qt;`,
    buildingPublicationQuery: `[out:json][timeout:${queryTimeoutSeconds}];(
                way["building"]${buildingBounds};
                way["building:part"]${buildingBounds};
            );out body;>;out skel qt;`,
    primaryQuery: `[out:json][timeout:${queryTimeoutSeconds}];(
                way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|unclassified|living_street|service)$"]${roadsBounds};
                way["highway"~"^(footway|pedestrian|path|corridor|steps)$"]["bridge"]${featureBounds};
                way["highway"~"^(footway|pedestrian|path|corridor|steps)$"]["layer"]${featureBounds};
                way["highway"~"^(footway|pedestrian|path|corridor|steps)$"]["level"]${featureBounds};
                way["highway"~"^(footway|pedestrian|path|corridor|steps)$"]["covered"]${featureBounds};
                way["highway"~"^(footway|pedestrian|path|corridor|steps)$"]["indoor"]${featureBounds};
                way["highway"~"^(footway|pedestrian|path|corridor|steps)$"]["min_height"]${featureBounds};
                way["landuse"]${featureBounds};
                way["area:highway"]${featureBounds};
                way["amenity"="parking"]${featureBounds};
                way["highway"="pedestrian"]["area"="yes"]${featureBounds};
                way["place"="square"]${featureBounds};
                way["surface"~"^(paved|asphalt|concrete|concrete:plates|paving_stones|sett|cobblestone)$"]["area"="yes"]${featureBounds};
                way["natural"~"^(wood|forest|scrub|grassland|heath|wetland|tree_row|sand|beach|bare_rock|scree|shingle|glacier)$"]${featureBounds};
                node["natural"="tree"]${featureBounds};
                way["natural"="water"]${featureBounds};
                way["water"]${featureBounds};
                way["building"="ship"]${waterStructureBounds};
                way["historic"="ship"]${waterStructureBounds};
                way["building"="houseboat"]${waterStructureBounds};
                way["waterway"~"^(river|stream|canal|drain|ditch)$"]${featureBounds};
                way["leisure"~"^(park|garden|nature_reserve)$"]${featureBounds};
                nwr["aeroway"~"^(aerodrome|heliport|runway|taxiway|apron|terminal|helipad|hangar|parking_position|gate|control_tower)$"]${transportFacilityBounds};
                nwr["leisure"="marina"]${featureBounds};
                nwr["harbour"="yes"]${featureBounds};
                nwr["landuse"~"^(port|harbour)$"]${featureBounds};
                nwr["man_made"~"^(pier|quay)$"]${featureBounds};
                nwr["waterway"="dock"]${featureBounds};
                nwr["amenity"="ferry_terminal"]${featureBounds};
                nwr["route"="ferry"]${featureBounds};
                nwr["mooring"]${featureBounds};
                nwr["seamark:type"~"^(harbour|berth)$"]${featureBounds};
                nwr["amenity"~"^(police|hospital)$"]${poiBounds};
                nwr["shop"~"^(convenience|supermarket|hardware|doityourself|pawnbroker|second_hand|car_repair|car_parts|outdoor|fishing|boat|aviation)$"]${poiBounds};
                nwr["amenity"~"^(fuel|charging_station)$"]${poiBounds};
            );out body;>;out skel qt;`,
    loadDeadline: loadStartedAt + maxTotalLoadMs
  };
}

function externalAbortError(signal) {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException(String(signal?.reason || 'World load provider request aborted'), 'AbortError');
}

export async function fetchOverpassJSON(query, timeoutMs, deadlineMs = Infinity, cacheMeta = null, options = {}) {
  const requestStartedAt = Date.now();
  const externalSignal = options.signal || null;
  if (externalSignal?.aborted) throw externalAbortError(externalSignal);
  const cached = findOverpassMemoryCache(cacheMeta);
  if (cached?.data?.elements) {
    cached.data._overpassEndpoint = cached.endpoint ? `${cached.endpoint} (memory-cache)` : 'memory-cache';
    cached.data._overpassSource = 'memory-cache';
    cached.data._overpassCacheAgeMs = Math.max(0, Date.now() - cached.savedAt);
    return cached.data;
  }

  const persistentCacheKey = overpassCacheKey(cacheMeta, query);
  const persistent = await readPersistentOverpassCache(persistentCacheKey);
  if (persistent?.data?.elements) {
    persistent.data._overpassEndpoint = persistent.endpoint ? `${persistent.endpoint} (persistent-cache)` : 'persistent-cache';
    persistent.data._overpassSource = 'persistent-cache';
    persistent.data._overpassCacheAgeMs = Math.max(0, Date.now() - Number(persistent.savedAt || 0));
    storeOverpassMemoryCache(cacheMeta, persistent.data, persistent.endpoint);
    return persistent.data;
  }

  const usesDefaultProvider = !Array.isArray(options.endpoints) && typeof options.fetchImpl !== 'function';
  const providerHealth = usesDefaultProvider ? getOverpassProviderHealth() : null;
  if (providerHealth?.status === 'cooldown' && options.ignoreProviderCooldown !== true) {
    const error = new Error(`Overpass provider retry paused for ${Math.ceil(providerHealth.retryAfterMs / 1000)}s after a complete endpoint failure.`);
    error.code = 'OVERPASS_PROVIDER_COOLDOWN';
    throw error;
  }

  const errors = [];
  const configuredEndpoints = Array.isArray(options.endpoints)
    ? options.endpoints.map((endpoint) => String(endpoint || '').trim()).filter(Boolean)
    : [];
  const endpoints = configuredEndpoints.length > 0 ? configuredEndpoints : orderedOverpassEndpoints();
  const fetchImpl = typeof options.fetchImpl === 'function' ? options.fetchImpl : globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new TypeError('Overpass fetch implementation is unavailable');
  const retryDelayMs = Math.max(0, Number.isFinite(Number(options.staggerMs))
    ? Number(options.staggerMs)
    : OVERPASS_STAGGER_MS);
  // `timeoutMs` is the budget for the provider as a whole. Endpoint fallbacks
  // are deliberately serial: public Overpass instances prohibit parallel
  // application probes and the world loader already consolidates its exact
  // feature needs into one query.
  const requestedTimeoutMs = Math.max(1000, Number(timeoutMs) || OVERPASS_MIN_TIMEOUT_MS);
  const requestDeadlineMs = Math.min(
    Number.isFinite(deadlineMs) ? deadlineMs : Infinity,
    performance.now() + requestedTimeoutMs
  );
  const requestController = new AbortController();
  const abortRequest = () => requestController.abort(externalAbortError(externalSignal));
  externalSignal?.addEventListener?.('abort', abortRequest, { once: true });
  try {
    for (let idx = 0; idx < endpoints.length; idx += 1) {
      const endpoint = endpoints[idx];
      if (idx > 0 && retryDelayMs > 0) {
        const remainingBeforeDelay = requestDeadlineMs - performance.now();
        if (remainingBeforeDelay > retryDelayMs + 500) {
          await delayMs(Math.min(retryDelayMs, 500), requestController.signal);
        }
      }
      if (externalSignal?.aborted) throw externalAbortError(externalSignal);
      if (requestController.signal.aborted) throw externalAbortError(requestController.signal);
      const now = performance.now();
      if (now >= requestDeadlineMs - 300) break;
      const endpointsAfterThis = endpoints.length - idx - 1;
      const timeLeftMs = requestDeadlineMs - now;
      const timeoutForEndpointMs = Math.max(500, Math.min(
        timeLeftMs - 250,
        timeLeftMs - endpointsAfterThis * 750
      ));
      const controller = new AbortController();
      const relayAbort = () => controller.abort(externalAbortError(externalSignal));
      const relayRequestAbort = () => controller.abort(externalAbortError(requestController.signal));
      externalSignal?.addEventListener?.('abort', relayAbort, { once: true });
      requestController.signal.addEventListener('abort', relayRequestAbort, { once: true });
      const timeoutId = setTimeout(() => controller.abort(), timeoutForEndpointMs);
      try {
      const res = await fetchImpl(endpoint, {
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
      if (usesDefaultProvider) markOverpassProviderAvailable();
      storeOverpassMemoryCache(cacheMeta, data, endpoint);
      void writePersistentOverpassCache(persistentCacheKey, data, endpoint, cacheMeta);
      return data;
      } catch (err) {
        if (externalSignal?.aborted) throw externalAbortError(externalSignal);
        const reason = err?.name === 'AbortError' ?
          `timeout after ${Math.floor(timeoutForEndpointMs)}ms` :
          err?.message || String(err);
        errors.push(`[${endpoint}] ${reason}`);
      } finally {
        clearTimeout(timeoutId);
        externalSignal?.removeEventListener?.('abort', relayAbort);
        requestController.signal.removeEventListener('abort', relayRequestAbort);
      }
    }
    throw new Error(`All Overpass endpoints failed: ${errors.join(' | ')}`);
  } catch (error) {
    if (externalSignal?.aborted) throw externalAbortError(externalSignal);
    const fallback = await readPersistentOverpassFallback(cacheMeta);
    if (fallback?.data?.elements) {
      fallback.data._overpassEndpoint = fallback.endpoint ? `${fallback.endpoint} (persistent-fallback)` : 'persistent-fallback';
      fallback.data._overpassSource = 'persistent-fallback';
      fallback.data._overpassCacheAgeMs = Math.max(0, Date.now() - Number(fallback.savedAt || 0));
      storeOverpassMemoryCache(cacheMeta, fallback.data, fallback.endpoint);
      return fallback.data;
    }
    if (usesDefaultProvider) markOverpassProviderUnavailable(requestStartedAt);
    throw error?.message?.startsWith?.('All Overpass endpoints failed:')
      ? error
      : new Error(`All Overpass endpoints failed: ${errors.join(' | ')}`);
  } finally {
    externalSignal?.removeEventListener?.('abort', abortRequest);
    if (!requestController.signal.aborted) {
      requestController.abort(new DOMException('Overpass request finished', 'AbortError'));
    }
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
