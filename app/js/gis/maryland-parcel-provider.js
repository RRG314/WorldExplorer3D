import {
  MARYLAND_PARCEL_SOURCE,
  buildMarylandParcelQueryUrl,
  buildMarylandParcelIdsQueryUrl,
  buildMarylandParcelFeaturesQueryUrl,
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
  // Reuse only identical spatial envelopes. Coarse location buckets can serve
  // another area's parcels after a short walk or a change of query radius.
  return buildMarylandParcelQueryUrl({ lat, lon, radiusM, offset: 0, limit: PAGE_SIZE });
}

function trimCache() {
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
}

async function fetchPayload(fetchImpl, url, signal) {
  const response = await fetchImpl(url, {
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
      const request = { lat, lon, radiusM };
      const index = await fetchPayload(fetchImpl, buildMarylandParcelIdsQueryUrl(request), controller.signal);
      if (index?.objectIds !== null && !Array.isArray(index?.objectIds)) throw new Error('Maryland parcel service returned no spatial object-ID index.');
      const objectIds = [...new Set((index.objectIds || []).filter(id => Number.isSafeInteger(id) && id >= 0))].sort((a, b) => a - b);
      const truncated = objectIds.length > MAX_PAGES * PAGE_SIZE;
      const boundedIds = objectIds.slice(0, MAX_PAGES * PAGE_SIZE);
      for (let offset = 0; offset < boundedIds.length; offset += PAGE_SIZE) {
        const payload = await fetchPayload(fetchImpl,
          buildMarylandParcelFeaturesQueryUrl(request, boundedIds.slice(offset, offset + PAGE_SIZE)), controller.signal);
        const features = Array.isArray(payload?.features) ? payload.features : [];
        features.forEach((feature) => {
          const parcel = normalizeMarylandParcelFeature(feature);
          if (!parcel || seen.has(parcel.parcelId)) return;
          seen.add(parcel.parcelId);
          parcels.push(parcel);
        });
        if (payload?.exceededTransferLimit === true) throw new Error('Maryland parcel service truncated a bounded ID batch.');
      }
      const value = Object.freeze({
        status: parcels.length ? 'ready' : 'no-coverage-at-point',
        source: MARYLAND_PARCEL_SOURCE,
        parcels: Object.freeze(parcels),
        warnings: Object.freeze(truncated ? ['Parcel results were capped for this dense area. Move closer to narrow the search.'] : []),
        fetchedAt: new Date().toISOString(), fromCache: false, query: Object.freeze({ lat, lon, radiusM })
      });
      // A forced refresh may now own this key. Older work still resolves for
      // its original caller, but cannot publish over or untrack that refresh.
      if (inFlight.get(key) === task) {
        cache.set(key, { expiresAt: now + CACHE_TTL_MS, value });
        trimCache();
      }
      return value;
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener?.('abort', abort);
      if (inFlight.get(key) === task) inFlight.delete(key);
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
