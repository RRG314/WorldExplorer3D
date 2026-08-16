import { createProvenance, getDataSource, normalizeGeoQuery } from './data-contract.js?v=3';
import { createProviderRegistry } from './provider-registry.js?v=2';

const STREET_PROVIDERS = Object.freeze(['panoramax', 'kartaview']);
const CACHE_TTL_MS = 15 * 60 * 1000;

function externalViewerUrl(providerId, lat, lon) {
  if (providerId === 'kartaview') return `https://kartaview.org/map/@${lat},${lon},17z`;
  return `https://panoramax.openstreetmap.fr/?focus=map&map=17/${lat}/${lon}`;
}

function normalizeStreetItem(item, providerId, fetchedAt) {
  const source = getDataSource(providerId);
  if (!source) return null;
  const lat = Number(item?.lat);
  const lon = Number(item?.lon);
  if (!item?.id || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const observedAt = String(item.capturedAt || '');
  return Object.freeze({
    id: String(item.id),
    providerId,
    lat,
    lon,
    headingDeg: Number.isFinite(Number(item.headingDeg)) ? Number(item.headingDeg) : null,
    capturedAt: observedAt,
    contributor: String(item.contributor || 'Community contributor'),
    thumbnailUrl: String(item.thumbnailUrl || ''),
    imageUrl: String(item.imageUrl || item.thumbnailUrl || ''),
    viewerUrl: String(item.viewerUrl || externalViewerUrl(providerId, lat, lon)),
    sequenceId: String(item.sequenceId || ''),
    distanceM: Number.isFinite(Number(item.distanceM)) ? Number(item.distanceM) : null,
    provenance: createProvenance({
      sourceId: providerId,
      observedAt,
      fetchedAt,
      accuracyM: item.accuracyM,
      licenseId: item.licenseId,
      licenseUrl: item.licenseUrl
    })
  });
}

function createStreetImageryService(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch?.bind(globalThis);
  const endpoint = String(options.endpoint || '/api/geospatial/street-imagery');
  if (typeof fetchImpl !== 'function') throw new Error('Street imagery requires fetch support.');
  const registry = createProviderRegistry({ now: options.now, maxCacheEntries: 48 });

  STREET_PROVIDERS.forEach((providerId) => {
    registry.register({
      id: providerId,
      sourceId: providerId,
      cacheTtlMs: CACHE_TTL_MS,
      timeoutMs: providerId === 'kartaview' ? 7000 : 10000,
      normalizeRequest: normalizeGeoQuery,
      async query(request, context) {
        const params = new URLSearchParams({
          provider: providerId,
          lat: String(request.lat),
          lon: String(request.lon),
          radiusM: String(request.radiusM),
          limit: String(request.limit)
        });
        const response = await fetchImpl(`${endpoint}?${params}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: context.signal,
          credentials: 'same-origin'
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || `${providerId} imagery request failed (${response.status}).`);
        const fetchedAt = String(payload.fetchedAt || new Date().toISOString());
        return {
          fetchedAt,
          warnings: payload.warnings,
          externalViewerUrl: payload.externalViewerUrl || externalViewerUrl(providerId, request.lat, request.lon),
          items: (payload.items || []).map((item) => normalizeStreetItem(item, providerId, fetchedAt)).filter(Boolean)
        };
      }
    });
  });

  return Object.freeze({
    providers: STREET_PROVIDERS.map((id) => getDataSource(id)),
    async search(providerId, query, searchOptions = {}) {
      const selectedProvider = STREET_PROVIDERS.includes(providerId) ? providerId : STREET_PROVIDERS[0];
      return registry.query(selectedProvider, query, searchOptions);
    },
    externalViewerUrl,
    diagnostics: () => registry.snapshot(),
    invalidate: (providerId = '') => registry.invalidate(providerId)
  });
}

const streetImageryService = createStreetImageryService();

export { STREET_PROVIDERS, createStreetImageryService, externalViewerUrl, streetImageryService };
