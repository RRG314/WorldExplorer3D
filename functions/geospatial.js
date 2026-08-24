const https = require('node:https');
const DEFLOCK_BALTIMORE_SNAPSHOT = require('./data/deflock-baltimore.json');

const PANORAMAX_API = 'https://panoramax.openstreetmap.fr/api';
const KARTAVIEW_API = 'https://api.openstreetcam.org/2.0/photo/';
const OPENSKY_API = 'https://opensky-network.org/api/states/all';
const ADSB_LOL_API = 'https://api.adsb.lol/v2/point';
const DEFLOCK_OVERPASS_ENDPOINTS = Object.freeze([
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter'
]);
const MEMORY_CACHE = new Map();
const AIRCRAFT_CACHE = new Map();
const DEFLOCK_CACHE = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;
const AIRCRAFT_CACHE_TTL_MS = 60 * 1000;
const DEFLOCK_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const DEFLOCK_STALE_TTL_MS = 24 * 60 * 60 * 1000;
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
  if (!options.fetchImpl && options.forceIpv4) {
    return new Promise((resolve, reject) => {
      const request = https.get(url, {
        family: 4,
        headers: { Accept: 'application/json', 'User-Agent': 'WorldExplorer3D/3.1 geospatial-client' }
      }, (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
          if (body.length > 8 * 1024 * 1024) request.destroy(new Error('Upstream response exceeded 8 MB.'));
        });
        response.on('end', () => {
          if ((response.statusCode || 500) < 200 || (response.statusCode || 500) >= 300) {
            reject(new Error(`Upstream HTTP ${response.statusCode || 500}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error('Upstream returned invalid JSON.'));
          }
        });
      });
      request.setTimeout(options.timeoutMs || 9000, () => {
        const error = new Error('Upstream request timed out.');
        error.name = 'AbortError';
        request.destroy(error);
      });
      request.on('error', reject);
    });
  }
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

function normalizeDeFlockQuery(input = {}) {
  const lat = Number(input.lat);
  const lon = Number(input.lon);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    const error = new Error('Valid latitude and longitude are required.');
    error.statusCode = 400;
    throw error;
  }
  const radiusDegrees = numberInRange(input.radiusDegrees, 0.002, 0.04, 0.022);
  return { lat, lon, radiusDegrees };
}

function buildDeFlockOverpassQuery(query) {
  const { lat, lon, radiusDegrees } = query;
  const bounds = `(${(lat - radiusDegrees).toFixed(7)},${(lon - radiusDegrees).toFixed(7)},${(lat + radiusDegrees).toFixed(7)},${(lon + radiusDegrees).toFixed(7)})`;
  return `[out:json][timeout:18];node["man_made"="surveillance"]${bounds};out meta qt;`;
}

function isDeFlockCameraElement(element) {
  return element?.type === 'node' &&
    String(element?.tags?.man_made || '').toLowerCase() === 'surveillance' &&
    Number.isFinite(Number(element.lat)) &&
    Number.isFinite(Number(element.lon));
}

function bundledDeFlockFallback(query) {
  const south = query.lat - query.radiusDegrees;
  const north = query.lat + query.radiusDegrees;
  const west = query.lon - query.radiusDegrees;
  const east = query.lon + query.radiusDegrees;
  const snapshotElements = (DEFLOCK_BALTIMORE_SNAPSHOT.elements || []).filter(isDeFlockCameraElement);
  if (!snapshotElements.length) return null;
  const coverage = snapshotElements.reduce((bounds, element) => ({
    south: Math.min(bounds.south, Number(element.lat)),
    north: Math.max(bounds.north, Number(element.lat)),
    west: Math.min(bounds.west, Number(element.lon)),
    east: Math.max(bounds.east, Number(element.lon))
  }), { south: Infinity, north: -Infinity, west: Infinity, east: -Infinity });
  if (north < coverage.south || south > coverage.north || east < coverage.west || west > coverage.east) return null;
  const elements = snapshotElements.filter((element) => (
    isDeFlockCameraElement(element) &&
    Number(element.lat) >= south && Number(element.lat) <= north &&
    Number(element.lon) >= west && Number(element.lon) <= east
  ));
  if (elements.length === 0) return null;
  const fetchedAt = String(DEFLOCK_BALTIMORE_SNAPSHOT.fetchedAt || '');
  return {
    schemaVersion: 1,
    provider: 'OpenStreetMap',
    fetchedAt,
    query,
    endpoint: `${String(DEFLOCK_BALTIMORE_SNAPSHOT.source || 'OpenStreetMap')} (bundled last-good snapshot)`,
    elements: elements.slice(0, 750),
    cache: 'bundled-last-good',
    cacheAgeMs: fetchedAt ? Math.max(0, Date.now() - Date.parse(fetchedAt)) : 0,
    warnings: ['Live Overpass providers were unavailable; using a dated Baltimore OpenStreetMap cache snapshot.']
  };
}

async function fetchDeFlockOverpass(endpoint, overpassQuery, options, controllers) {
  const controller = new AbortController();
  controllers.push(controller);
  const timeoutId = setTimeout(() => controller.abort(), Number(options.timeoutMs) || 14000);
  try {
    const url = `${endpoint}?data=${encodeURIComponent(overpassQuery)}`;
    const response = await (options.fetchImpl || globalThis.fetch)(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'WorldExplorer3D-DeFlock/1.0 (public OSM camera query)'
      },
      signal: controller.signal
    });
    if (!response?.ok) throw new Error(`Upstream HTTP ${Number(response?.status) || 502}`);
    const payload = typeof response.json === 'function'
      ? await response.json()
      : JSON.parse(await response.text());
    if (!Array.isArray(payload?.elements)) throw new Error('Upstream returned an invalid Overpass payload.');
    return { endpoint, payload };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function queryDeFlockCameras(input = {}, options = {}) {
  const query = normalizeDeFlockQuery(input);
  const key = `${query.lat.toFixed(5)}:${query.lon.toFixed(5)}:${query.radiusDegrees.toFixed(5)}`;
  const now = Date.now();
  const cached = DEFLOCK_CACHE.get(key);
  if (!options.force && cached?.expiresAt > now) {
    return { ...cached.value, cache: 'memory', cacheAgeMs: now - cached.savedAt };
  }

  const endpoints = Array.isArray(options.endpoints) && options.endpoints.length
    ? options.endpoints
    : DEFLOCK_OVERPASS_ENDPOINTS;
  const controllers = [];
  const overpassQuery = buildDeFlockOverpassQuery(query);
  try {
    const winner = await Promise.any(endpoints.map((endpoint) => (
      fetchDeFlockOverpass(String(endpoint), overpassQuery, options, controllers)
    )));
    controllers.forEach((controller) => controller.abort());
    const value = {
      schemaVersion: 1,
      provider: 'OpenStreetMap',
      fetchedAt: new Date().toISOString(),
      query,
      endpoint: winner.endpoint,
      elements: winner.payload.elements.filter(isDeFlockCameraElement).slice(0, 750),
      cache: 'upstream',
      cacheAgeMs: 0
    };
    DEFLOCK_CACHE.set(key, {
      value,
      savedAt: now,
      expiresAt: now + DEFLOCK_CACHE_TTL_MS,
      staleUntil: now + DEFLOCK_STALE_TTL_MS
    });
    while (DEFLOCK_CACHE.size > 48) DEFLOCK_CACHE.delete(DEFLOCK_CACHE.keys().next().value);
    return value;
  } catch (error) {
    controllers.forEach((controller) => controller.abort());
    if (cached?.staleUntil > now) {
      return { ...cached.value, cache: 'stale-memory', cacheAgeMs: now - cached.savedAt };
    }
    const bundled = bundledDeFlockFallback(query);
    if (bundled) {
      DEFLOCK_CACHE.set(key, {
        value: bundled,
        savedAt: now,
        expiresAt: now + DEFLOCK_CACHE_TTL_MS,
        staleUntil: now + DEFLOCK_STALE_TTL_MS
      });
      return bundled;
    }
    const upstreamError = new Error('Mapped camera providers are temporarily unavailable.');
    upstreamError.statusCode = 502;
    upstreamError.cause = error;
    throw upstreamError;
  }
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

function normalizeAdsbLolState(state, query, responseTimeMs) {
  const lat = Number(state?.lat);
  const lon = Number(state?.lon);
  const icao24 = String(state?.hex || '').replace(/^~/, '').trim().toLowerCase();
  if (!icao24 || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const altitudeFt = Number(state.alt_geom ?? state.alt_baro);
  const seenSeconds = Math.max(0, Number(state.seen_pos ?? state.seen) || 0);
  return {
    id: `adsblol-${icao24}`,
    icao24,
    callsign: String(state.flight || state.r || icao24).trim(),
    originCountry: '',
    observedAt: new Date(responseTimeMs - seenSeconds * 1000).toISOString(),
    lat,
    lon,
    altitudeM: Number.isFinite(altitudeFt) ? altitudeFt * 0.3048 : null,
    onGround: state.alt_baro === 'ground',
    velocityKt: Number.isFinite(Number(state.gs)) ? Math.round(Number(state.gs)) : null,
    headingDeg: Number.isFinite(Number(state.track)) ? Number(state.track) : null,
    verticalRateMps: Number.isFinite(Number(state.geom_rate ?? state.baro_rate)) ? Number(state.geom_rate ?? state.baro_rate) * 0.00508 : null,
    squawk: String(state.squawk || ''),
    positionSource: String(state.type || ''),
    category: String(state.category || ''),
    distanceKm: Number.isFinite(Number(state.dst)) ? Math.round(Number(state.dst) * 1.852) : Math.round(distanceM(query.lat, query.lon, lat, lon) / 1000)
  };
}

async function queryAdsbLol(query, options = {}) {
  const radiusNm = Math.max(11, Math.min(250, Math.ceil(query.radiusKm / 1.852)));
  const url = `${ADSB_LOL_API}/${query.lat}/${query.lon}/${radiusNm}`;
  const payload = await fetchJson(url, { ...options, timeoutMs: 9000, forceIpv4: true });
  const responseTimeMs = Number(payload.now || payload.ctime) || Date.now();
  return {
    schemaVersion: 1,
    provider: 'adsb-lol',
    fetchedAt: new Date(responseTimeMs).toISOString(),
    query,
    bounds: aircraftBounds(query),
    items: (payload.ac || [])
      .map((state) => normalizeAdsbLolState(state, query, responseTimeMs))
      .filter(Boolean)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, query.limit),
    warnings: ['OpenSky was unavailable; current observations are supplied by ADSB.lol under ODbL.'],
    cache: 'upstream'
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
  let value;
  try {
    const payload = await fetchJson(url.href, { ...options, timeoutMs: 9000, forceIpv4: true });
    const responseTime = Number(payload.time) || Math.floor(Date.now() / 1000);
    value = {
      schemaVersion: 1,
      provider: 'opensky',
      fetchedAt: new Date(responseTime * 1000).toISOString(),
      query,
      bounds,
      items: (payload.states || [])
        .map((state) => normalizeOpenSkyState(state, query, responseTime))
        .filter(Boolean)
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, query.limit),
      warnings: [],
      cache: 'upstream'
    };
  } catch (openSkyError) {
    value = await queryAdsbLol(query, options);
  }
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
    getDeFlockCameras: functions.region('us-central1').https.onRequest(async (req, res) => {
      if (setCors(req, res)) return;
      if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      try {
        const payload = await queryDeFlockCameras(req.query || {});
        res.set('Cache-Control', 'public, max-age=300, s-maxage=21600, stale-while-revalidate=86400');
        res.status(200).json(payload);
      } catch (error) {
        const status = Number(error?.statusCode) || (error?.name === 'AbortError' ? 504 : 502);
        console.warn('[getDeFlockCameras] request failed:', error?.message || error);
        res.status(status).json({ error: error?.message || 'Mapped camera data is unavailable.' });
      }
    }),
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
  bundledDeFlockFallback,
  buildDeFlockOverpassQuery,
  buildGeospatialExports,
  normalizeDeFlockQuery,
  normalizeAircraftQuery,
  normalizeAdsbLolState,
  normalizeOpenSkyState,
  normalizeQuery,
  queryAircraft,
  queryDeFlockCameras,
  queryStreetImagery,
  normalizePanoramaxItem,
  normalizeKartaItem
};
