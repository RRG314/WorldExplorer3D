import { createProvenance } from './data-contract.js?v=5';
import { createProviderRegistry } from './provider-registry.js?v=2';

const DEFAULT_ENDPOINT = '/api/geospatial/aircraft';

function normalizeAircraftRequest(input = {}) {
  const lat = Number(input.lat);
  const lon = Number(input.lon);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new RangeError('Aircraft latitude is invalid.');
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new RangeError('Aircraft longitude is invalid.');
  const radiusKm = Math.max(20, Math.min(200, Math.round(Number(input.radiusKm) || 160)));
  const limit = Math.max(1, Math.min(120, Math.round(Number(input.limit) || 80)));
  return Object.freeze({ lat, lon, radiusKm, limit });
}

function normalizeAircraftItem(item, fetchedAt, providerId = 'opensky') {
  return Object.freeze({
    ...item,
    id: String(item.id || item.icao24 || ''),
    label: String(item.callsign || item.icao24 || 'Aircraft').trim(),
    lat: Number(item.lat),
    lon: Number(item.lon),
    headingDeg: Number.isFinite(Number(item.headingDeg)) ? Number(item.headingDeg) : 0,
    altitude: 1.024 + Math.min(0.04, Math.max(0.004, (Number(item.altitudeM) || 0) / 400000)),
    dataSource: providerId,
    provenance: createProvenance({
      sourceId: providerId,
      observedAt: item.observedAt,
      fetchedAt
    })
  });
}

function createAircraftService(options = {}) {
  const endpoint = options.endpoint || DEFAULT_ENDPOINT;
  const fetchImpl = options.fetchImpl || globalThis.fetch?.bind(globalThis);
  const registry = createProviderRegistry({ maxCacheEntries: 24 });
  if (typeof fetchImpl !== 'function') throw new Error('Aircraft service requires fetch().');

  registry.register({
    id: 'opensky',
    sourceId: 'opensky',
    cacheTtlMs: 60 * 1000,
    timeoutMs: 10000,
    normalizeRequest: normalizeAircraftRequest,
    async query(request, context) {
      const query = new URLSearchParams(Object.entries(request).map(([key, value]) => [key, String(value)]));
      const response = await fetchImpl(`${endpoint}?${query}`, {
        headers: { Accept: 'application/json' },
        signal: context.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Aircraft provider failed (${response.status}).`);
      return {
        fetchedAt: payload.fetchedAt,
        items: (payload.items || []).map((item) => normalizeAircraftItem(item, payload.fetchedAt, payload.provider || 'opensky')),
        warnings: payload.warnings || []
      };
    }
  });

  return Object.freeze({
    search(request, queryOptions = {}) {
      return registry.query('opensky', request, queryOptions);
    },
    inspect() {
      return registry.snapshot();
    }
  });
}

const aircraftService = createAircraftService();

export { aircraftService, createAircraftService, normalizeAircraftRequest };
