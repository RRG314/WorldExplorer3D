const SEARCH_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const CACHE_KEY = 'world-explorer-place-search-v1';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_LIMIT = 40;
const MIN_REQUEST_INTERVAL_MS = 1050;

const memoryCache = new Map();
const inFlight = new Map();
let networkQueue = Promise.resolve();
let lastRequestAt = 0;

function normalizedKey(query) {
  return String(query || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

function readStoredCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function getCached(key) {
  const memory = memoryCache.get(key);
  if (memory && Date.now() - memory.savedAt < CACHE_TTL_MS) return memory.results;
  const stored = readStoredCache()[key];
  if (!stored || Date.now() - Number(stored.savedAt || 0) >= CACHE_TTL_MS || !Array.isArray(stored.results)) return null;
  memoryCache.set(key, stored);
  return stored.results;
}

function setCached(key, results) {
  const record = { savedAt: Date.now(), results };
  memoryCache.set(key, record);
  try {
    const stored = readStoredCache();
    stored[key] = record;
    const entries = Object.entries(stored)
      .filter(([, value]) => Date.now() - Number(value?.savedAt || 0) < CACHE_TTL_MS)
      .sort((left, right) => Number(right[1]?.savedAt || 0) - Number(left[1]?.savedAt || 0))
      .slice(0, CACHE_LIMIT);
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Search still works when storage is disabled or full.
  }
}

function parseCoordinates(query) {
  const match = String(query || '').trim().match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return {
    id: `coordinates:${lat.toFixed(6)},${lon.toFixed(6)}`,
    name: `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
    displayName: `Coordinates ${lat.toFixed(4)}, ${lon.toFixed(4)}`,
    lat,
    lon,
    category: 'coordinate',
    type: 'coordinate',
    kindLabel: 'Coordinates',
    region: '',
    country: '',
    countryCode: '',
    arrivalMode: 'walk'
  };
}

function providerQuery(query) {
  const clean = String(query || '').trim();
  if (!/\bairports?\b/i.test(clean)) return clean;
  const acronym = clean.match(/\b([A-Za-z]{2,4})\b(?=\s+(?:international\s+)?airports?\b)/i)?.[1];
  return acronym ? `${acronym.toUpperCase()} aerodrome` : clean;
}

function firstText(...values) {
  return values.map((value) => String(value || '').trim()).find(Boolean) || '';
}

function normalizeProviderResult(result, index) {
  const lat = Number(result?.lat);
  const lon = Number(result?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const address = result.address || {};
  const named = result.namedetails || {};
  const extra = result.extratags || {};
  const name = firstText(
    named.name,
    result.name,
    address.aerodrome,
    address.city,
    address.town,
    address.village,
    String(result.display_name || '').split(',')[0]
  );
  const category = String(result.category || result.class || 'place');
  const type = String(result.type || 'place');
  const water = category === 'natural' && ['bay', 'strait', 'sea', 'water'].includes(type);
  const isAirport = category === 'aeroway' || type === 'aerodrome';
  const rawBounds = Array.isArray(result.boundingbox) ? result.boundingbox.map(Number) : [];
  const airportBounds = isAirport && rawBounds.length === 4 && rawBounds.every(Number.isFinite)
    ? Object.freeze({ minLat: rawBounds[0], maxLat: rawBounds[1], minLon: rawBounds[2], maxLon: rawBounds[3] })
    : null;
  const kindLabel = category === 'aeroway' || type === 'aerodrome' ? 'Airport' :
    category === 'place' ? (type === 'city' ? 'City' : type === 'town' ? 'Town' : 'Place') :
    type.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  return {
    id: `${result.osm_type || 'place'}:${result.osm_id || index}`,
    name: name || 'Mapped place',
    displayName: String(result.display_name || name || 'Mapped place'),
    lat,
    lon,
    category,
    type,
    kindLabel,
    region: firstText(address.state, address.region, address.county),
    country: firstText(address.country),
    countryCode: String(address.country_code || '').toLowerCase(),
    isAirport,
    airportBounds,
    airportClass: isAirport
      ? firstText(extra.aerodrome, extra['aerodrome:type'], extra.passenger)
      : '',
    iata: String(extra.iata || '').trim().toUpperCase(),
    icao: String(extra.icao || '').trim().toUpperCase(),
    arrivalMode: water ? 'boat' : 'walk'
  };
}

function queueProviderRequest(url, signal) {
  const request = networkQueue.then(async () => {
    const waitMs = Math.max(0, MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt));
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    if (signal?.aborted) throw new DOMException('Search cancelled', 'AbortError');
    lastRequestAt = Date.now();
    const response = await fetch(url, {
      signal,
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`Place search is unavailable (${response.status}).`);
    return response.json();
  });
  networkQueue = request.catch(() => undefined);
  return request;
}

async function searchPlaces(query, options = {}) {
  const clean = String(query || '').trim();
  if (!clean) return [];
  const coordinate = parseCoordinates(clean);
  if (coordinate) return [coordinate];
  const key = normalizedKey(clean);
  const cached = getCached(key);
  if (cached) return cached;
  if (inFlight.has(key)) return inFlight.get(key);

  const params = new URLSearchParams({
    q: providerQuery(clean),
    format: 'jsonv2',
    addressdetails: '1',
    namedetails: '1',
    extratags: '1',
    limit: String(Math.max(1, Math.min(8, Number(options.limit) || 8))),
    'accept-language': String(options.language || navigator.language || 'en')
  });
  const promise = queueProviderRequest(`${SEARCH_ENDPOINT}?${params}`, options.signal)
    .then((payload) => (Array.isArray(payload) ? payload : [])
      .map(normalizeProviderResult)
      .filter(Boolean))
    .then((results) => {
      setCached(key, results);
      return results;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

async function resolvePrimaryPlace(query, options = {}) {
  const results = await searchPlaces(query, options);
  return results[0] || null;
}

export { normalizeProviderResult, parseCoordinates, resolvePrimaryPlace, searchPlaces };
