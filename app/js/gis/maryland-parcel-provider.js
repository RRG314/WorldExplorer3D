import {
  MARYLAND_PARCEL_SOURCE,
  buildMarylandParcelQueryUrl,
  isLikelyMarylandCoordinate,
  normalizeMarylandParcelFeature
} from './maryland-parcel-core.js?v=1';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 8;
const MAX_PAGES = 2;
const PAGE_SIZE = 250;
const REQUEST_TIMEOUT_MS = 14000;
const cache = new Map();
const inFlight = new Map();

function cacheKey(lat, lon, radiusM) {
  return `${Math.round(Number(lat) * 200) / 200}:${Math.round(Number(lon) * 200) / 200}:${Math.round(Number(radiusM) / 100) * 100}`;
}

function trimCache() {
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
}

async function fetchPage(fetchImpl, request, offset, signal) {
  const response = await fetchImpl(buildMarylandParcelQueryUrl({ ...request, offset, limit: PAGE_SIZE }), {
    signal, headers: { Accept: 'application/geo+json,application/json' }, credentials: 'omit'
  });
  if (!response.ok) throw new Error(`Maryland parcel service returned ${response.status}.`);
  const payload = await response.json();
  if (payload?.error) throw new Error(String(payload.error.message || 'Maryland parcel service rejected the request.'));
  return payload;
}

async function loadMarylandParcels(request = {}, options = {}) {
  const lat = Number(request.lat);
  const lon = Number(request.lon);
  const radiusM = Math.max(80, Math.min(900, Number(request.radiusM) || 450));
  if (!isLikelyMarylandCoordinate(lat, lon)) {
    return Object.freeze({ status: 'outside-coverage', source: MARYLAND_PARCEL_SOURCE, parcels: Object.freeze([]), warnings: Object.freeze([]) });
  }
  const key = cacheKey(lat, lon, radiusM);
  const now = Date.now();
  const cached = cache.get(key);
  if (!options.force && cached && cached.expiresAt > now) return Object.freeze({ ...cached.value, fromCache: true });
  if (!options.force && inFlight.has(key)) return inFlight.get(key);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('Fetch is unavailable for the Maryland parcel provider.');

  const task = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error('Maryland parcel request timed out.')), REQUEST_TIMEOUT_MS);
    const abort = () => controller.abort(options.signal?.reason || new Error('Maryland parcel request cancelled.'));
    options.signal?.addEventListener?.('abort', abort, { once: true });
    try {
      const parcels = [];
      const seen = new Set();
      let truncated = false;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const payload = await fetchPage(fetchImpl, { lat, lon, radiusM }, page * PAGE_SIZE, controller.signal);
        const features = Array.isArray(payload?.features) ? payload.features : [];
        features.forEach((feature) => {
          const parcel = normalizeMarylandParcelFeature(feature);
          if (!parcel || seen.has(parcel.parcelId)) return;
          seen.add(parcel.parcelId);
          parcels.push(parcel);
        });
        if (features.length < PAGE_SIZE && payload?.exceededTransferLimit !== true) break;
        if (page === MAX_PAGES - 1) truncated = true;
      }
      const value = Object.freeze({
        status: parcels.length ? 'ready' : 'no-coverage-at-point',
        source: MARYLAND_PARCEL_SOURCE,
        parcels: Object.freeze(parcels),
        warnings: Object.freeze(truncated ? ['Parcel results were capped for this dense area. Move closer to narrow the search.'] : []),
        fetchedAt: new Date().toISOString(), fromCache: false, query: Object.freeze({ lat, lon, radiusM })
      });
      cache.set(key, { expiresAt: now + CACHE_TTL_MS, value });
      trimCache();
      return value;
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener?.('abort', abort);
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, task);
  return task;
}

function marylandParcelProviderSnapshot() {
  return Object.freeze({ sourceId: MARYLAND_PARCEL_SOURCE.id, cachedAreas: cache.size, activeRequests: inFlight.size });
}

function clearMarylandParcelCache() {
  cache.clear();
}

export { clearMarylandParcelCache, loadMarylandParcels, marylandParcelProviderSnapshot };
