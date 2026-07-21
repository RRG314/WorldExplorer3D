const PANORAMAX_API = 'https://panoramax.openstreetmap.fr/api';
const KARTAVIEW_API = 'https://api.openstreetcam.org/2.0/photo/';
const OPENSKY_API = 'https://opensky-network.org/api/states/all';
const MEMORY_CACHE = new Map();
const AIRCRAFT_CACHE = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;
const AIRCRAFT_CACHE_TTL_MS = 60 * 1000;
const MAX_CACHE_ENTRIES = 80;

function numberInRange(value, min, max, fallback = NaN) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function normalizeQuery(input = {}) {
  const lat = numberInRange(input.lat, -90, 90);
  const lon = numberInRange(input.lon, -180, 180);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    const error = new Error('Valid latitude and longitude are required.');
    error.statusCode = 400;
    throw error;
  }
  const provider = input.provider === 'kartaview' ? 'kartaview' : 'panoramax';
  const radiusM = Math.round(numberInRange(input.radiusM, 20, 1000, 300));
  const limit = Math.round(numberInRange(input.limit, 1, 12, 8));
  return { provider, lat, lon, radiusM, limit };
}

function distanceM(aLat, aLon, bLat, bLon) {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const value = sinLat * sinLat + Math.cos(aLat * rad) * Math.cos(bLat * rad) * sinLon * sinLon;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)));
}

function safeUrl(value, base = '') {
  try {
    const url = new URL(String(value || ''), base || undefined);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || 9000);
  try {
    const response = await (options.fetchImpl || globalThis.fetch)(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'WorldExplorer3D/3.0 geospatial-client' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Upstream HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeAircraftQuery(input = {}) {
  const lat = numberInRange(input.lat, -90, 90);
  const lon = numberInRange(input.lon, -180, 180);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    const error = new Error('Valid aircraft latitude and longitude are required.');
    error.statusCode = 400;
    throw error;
  }
  const radiusKm = Math.round(numberInRange(input.radiusKm, 20, 200, 160));
  const limit = Math.round(numberInRange(input.limit, 1, 120, 80));
  return { lat, lon, radiusKm, limit };
}

function aircraftBounds(query) {
  const latDelta = Math.min(2.4, query.radiusKm / 111.32);
  const rawLonDelta = query.radiusKm / (111.32 * Math.max(0.2, Math.cos(query.lat * Math.PI / 180)));
  const maxLonDeltaForCredits = 24 / Math.max(0.1, 4 * latDelta);
  const lonDelta = Math.min(4.5, rawLonDelta, maxLonDeltaForCredits);
  return {
    lamin: Math.max(-90, query.lat - latDelta),
    lomin: Math.max(-180, query.lon - lonDelta),
    lamax: Math.min(90, query.lat + latDelta),
    lomax: Math.min(180, query.lon + lonDelta)
  };
}

function normalizeOpenSkyState(state, query, responseTime) {
  if (!Array.isArray(state)) return null;
  const lon = Number(state[5]);
  const lat = Number(state[6]);
  const icao24 = String(state[0] || '').trim().toLowerCase();
  if (!icao24 || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const observedSeconds = Number(state[3] || state[4] || responseTime);
  const altitudeM = Number.isFinite(Number(state[13])) ? Number(state[13]) : (Number.isFinite(Number(state[7])) ? Number(state[7]) : null);
  const velocityKt = Number.isFinite(Number(state[9])) ? Number(state[9]) * 1.943844 : null;
  return {
    id: `opensky-${icao24}`,
    icao24,
    callsign: String(state[1] || '').trim() || icao24.toUpperCase(),
    originCountry: String(state[2] || 'Unknown'),
    observedAt: Number.isFinite(observedSeconds) ? new Date(observedSeconds * 1000).toISOString() : '',
    lat,
    lon,
    altitudeM,
    onGround: state[8] === true,
    velocityKt: Number.isFinite(velocityKt) ? Math.round(velocityKt) : null,
    headingDeg: Number.isFinite(Number(state[10])) ? Number(state[10]) : null,
    verticalRateMps: Number.isFinite(Number(state[11])) ? Number(state[11]) : null,
    squawk: String(state[14] || ''),
    positionSource: Number.isFinite(Number(state[16])) ? Number(state[16]) : null,
    category: Number.isFinite(Number(state[17])) ? Number(state[17]) : null,
    distanceKm: Math.round(distanceM(query.lat, query.lon, lat, lon) / 1000)
  };
}

function aircraftCacheKey(query) {
  return `${query.lat.toFixed(2)}:${query.lon.toFixed(2)}:${query.radiusKm}:${query.limit}`;
}

async function queryAircraft(input = {}, options = {}) {
  const query = normalizeAircraftQuery(input);
  const key = aircraftCacheKey(query);
  const cached = AIRCRAFT_CACHE.get(key);
  if (!options.force && cached?.expiresAt > Date.now()) return { ...cached.value, cache: 'memory' };
  const bounds = aircraftBounds(query);
  const url = new URL(OPENSKY_API);
  Object.entries({ ...bounds, extended: 1 }).forEach(([name, value]) => url.searchParams.set(name, String(value)));
  const payload = await fetchJson(url.href, { ...options, timeoutMs: 9000 });
  const responseTime = Number(payload.time) || Math.floor(Date.now() / 1000);
  const items = (payload.states || [])
    .map((state) => normalizeOpenSkyState(state, query, responseTime))
    .filter(Boolean)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, query.limit);
  const value = {
    schemaVersion: 1,
    provider: 'opensky',
    fetchedAt: new Date(responseTime * 1000).toISOString(),
    query,
    bounds,
    items,
    warnings: [],
    cache: 'upstream'
  };
  AIRCRAFT_CACHE.set(key, { value, expiresAt: Date.now() + AIRCRAFT_CACHE_TTL_MS });
  while (AIRCRAFT_CACHE.size > 24) AIRCRAFT_CACHE.delete(AIRCRAFT_CACHE.keys().next().value);
  return value;
}

function panoramaxViewerUrl(id, lat, lon) {
  return `https://panoramax.openstreetmap.fr/?focus=pic&map=17/${lat}/${lon}&pic=${encodeURIComponent(id)}`;
}

function normalizePanoramaxItem(feature, query) {
  const coordinates = feature?.geometry?.coordinates || [];
  const lon = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!feature?.id || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const properties = feature.properties || {};
  const licenseLink = (feature.links || []).find((link) => link.rel === 'license');
  return {
    id: String(feature.id),
    lat,
    lon,
    headingDeg: Number.isFinite(Number(properties['view:azimuth'])) ? Number(properties['view:azimuth']) : null,
    capturedAt: String(properties.datetime || properties.datetimetz || ''),
    contributor: String(properties['geovisio:producer'] || feature.providers?.[0]?.name || 'Community contributor'),
    thumbnailUrl: safeUrl(feature.assets?.thumb?.href || properties['geovisio:thumbnail']),
    imageUrl: safeUrl(feature.assets?.sd?.href || feature.assets?.hd?.href || properties['geovisio:image']),
    viewerUrl: panoramaxViewerUrl(feature.id, lat, lon),
    sequenceId: String(feature.collection || ''),
    distanceM: Math.round(distanceM(query.lat, query.lon, lat, lon)),
    accuracyM: numberInRange(properties['quality:horizontal_accuracy'], 0, 10000, null),
    licenseId: String(properties.license || 'CC-BY-SA-4.0'),
    licenseUrl: safeUrl(licenseLink?.href) || 'https://creativecommons.org/licenses/by-sa/4.0/'
  };
}

async function queryPanoramax(query, options = {}) {
  const latDelta = query.radiusM / 111320;
  const lonDelta = query.radiusM / (111320 * Math.max(0.15, Math.cos(query.lat * Math.PI / 180)));
  const bbox = [query.lon - lonDelta, query.lat - latDelta, query.lon + lonDelta, query.lat + latDelta]
    .map((value) => value.toFixed(7)).join(',');
  const url = `${PANORAMAX_API}/search?bbox=${bbox}&limit=${query.limit}`;
  const payload = await fetchJson(url, { ...options, timeoutMs: 10000 });
  const items = (payload.features || [])
    .map((feature) => normalizePanoramaxItem(feature, query))
    .filter(Boolean)
    .filter((item) => item.distanceM <= query.radiusM * 1.15)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, query.limit);
  return {
    items,
    externalViewerUrl: `https://panoramax.openstreetmap.fr/?focus=map&map=17/${query.lat}/${query.lon}`,
    warnings: []
  };
}

function kartaCandidates(payload) {
  const candidates = payload?.result?.data || payload?.result || payload?.data?.data || payload?.data || payload?.currentPageItems || [];
  return Array.isArray(candidates) ? candidates : Object.values(candidates || {}).filter((item) => item && typeof item === 'object');
}

function normalizeKartaItem(item, query) {
  const lat = Number(item.lat ?? item.latitude);
  const lon = Number(item.lng ?? item.lon ?? item.longitude);
  const id = item.id ?? item.photoId;
  if (!id || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    id: String(id),
    lat,
    lon,
    headingDeg: Number.isFinite(Number(item.heading)) ? Number(item.heading) : null,
    capturedAt: String(item.date_added || item.dateAdded || item.sequence?.dateAdded || ''),
    contributor: String(item.user || item.username || item.sequence?.user || 'Community contributor'),
    thumbnailUrl: safeUrl(item.lth_name || item.procUrl || item.th_name || item.name, KARTAVIEW_API),
    imageUrl: safeUrl(item.name || item.procUrl || item.lth_name, KARTAVIEW_API),
    viewerUrl: `https://kartaview.org/map/@${lat},${lon},19z`,
    sequenceId: String(item.sequence_id || item.sequenceId || item.sequence?.id || ''),
    distanceM: Math.round(distanceM(query.lat, query.lon, lat, lon)),
    accuracyM: numberInRange(item.gps_accuracy || item.gpsAccuracy, 0, 10000, null),
    licenseId: 'CC-BY-SA-4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/'
  };
}

async function queryKartaView(query, options = {}) {
  const url = new URL(KARTAVIEW_API);
  Object.entries({
    lat: query.lat,
    lng: query.lon,
    radius: query.radiusM,
    join: 'sequence',
    orderBy: 'id',
    orderDirection: 'desc'
  }).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  const payload = await fetchJson(url.href, { ...options, timeoutMs: 6000 });
  const items = kartaCandidates(payload)
    .map((item) => normalizeKartaItem(item, query))
    .filter(Boolean)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, query.limit);
  return {
    items,
    externalViewerUrl: `https://kartaview.org/map/@${query.lat},${query.lon},17z`,
    warnings: []
  };
}

function cacheKey(query) {
  return `${query.provider}:${query.lat.toFixed(4)}:${query.lon.toFixed(4)}:${query.radiusM}:${query.limit}`;
}

function trimCache() {
  while (MEMORY_CACHE.size > MAX_CACHE_ENTRIES) MEMORY_CACHE.delete(MEMORY_CACHE.keys().next().value);
}

async function queryStreetImagery(input = {}, options = {}) {
  const query = normalizeQuery(input);
  const key = cacheKey(query);
  const cached = MEMORY_CACHE.get(key);
  if (!options.force && cached?.expiresAt > Date.now()) return { ...cached.value, cache: 'memory' };
  const providerResult = query.provider === 'kartaview'
    ? await queryKartaView(query, options)
    : await queryPanoramax(query, options);
  const value = {
    schemaVersion: 1,
    provider: query.provider,
    fetchedAt: new Date().toISOString(),
    query,
    items: providerResult.items,
    warnings: providerResult.warnings,
    externalViewerUrl: providerResult.externalViewerUrl,
    cache: 'upstream'
  };
  MEMORY_CACHE.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  trimCache();
  return value;
}

function buildGeospatialExports({ functions, setCors }) {
  return {
    getStreetImagery: functions.region('us-central1').https.onRequest(async (req, res) => {
      if (setCors(req, res)) return;
      if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      try {
        const payload = await queryStreetImagery(req.query || {});
        res.set('Cache-Control', 'public, max-age=300, s-maxage=900, stale-while-revalidate=1800');
        res.status(200).json(payload);
      } catch (error) {
        const status = Number(error?.statusCode) || (error?.name === 'AbortError' ? 504 : 502);
        console.warn('[getStreetImagery] request failed:', error?.message || error);
        res.status(status).json({ error: status === 504 ? 'Street imagery provider timed out.' : (error?.message || 'Street imagery unavailable.') });
      }
    }),
    getAircraftStates: functions.region('us-central1').https.onRequest(async (req, res) => {
      if (setCors(req, res)) return;
      if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      try {
        const payload = await queryAircraft(req.query || {});
        res.set('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=120');
        res.status(200).json(payload);
      } catch (error) {
        const status = Number(error?.statusCode) || (error?.name === 'AbortError' ? 504 : 502);
        console.warn('[getAircraftStates] request failed:', error?.message || error);
        res.status(status).json({ error: status === 504 ? 'OpenSky timed out.' : (error?.message || 'Aircraft observations unavailable.') });
      }
    })
  };
}

module.exports = {
  buildGeospatialExports,
  normalizeAircraftQuery,
  normalizeOpenSkyState,
  normalizeQuery,
  queryAircraft,
  queryStreetImagery,
  normalizePanoramaxItem,
  normalizeKartaItem
};
