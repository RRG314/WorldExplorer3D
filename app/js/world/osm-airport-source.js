import { selectFacilitySourceElements } from '../transport/facility-compiler.js?v=4';
import {
  readPersistentOverpassCache,
  writePersistentOverpassCache
} from './osm-cache.js?v=3';

const OSM_MAP_ENDPOINT = 'https://api.openstreetmap.org/api/0.6/map.json';
const MAX_CELL_SPAN_DEGREES = .02;
const MAX_AIRPORT_SPAN_DEGREES = .085;
const MAX_CELL_REQUESTS = 30;
const MAX_SOURCE_ELEMENTS = 240000;
const memoryCache = new Map();
const MAX_MEMORY_ENTRIES = 2;
const MAX_MEMORY_ELEMENTS = 120000;
function cachedElementCount() {
  return [...memoryCache.values()].reduce((count, value) => count + value.elements.length, 0);
}
function rememberAirport(key, value) {
  memoryCache.delete(key);
  if (value.elements.length <= MAX_MEMORY_ELEMENTS) memoryCache.set(key, value);
  while (memoryCache.size > MAX_MEMORY_ENTRIES || cachedElementCount() > MAX_MEMORY_ELEMENTS) {
    memoryCache.delete(memoryCache.keys().next().value);
  }
}
function airportSourceCacheSnapshot() {
  return { entries: memoryCache.size, elements: cachedElementCount(), entryLimit: MAX_MEMORY_ENTRIES, elementLimit: MAX_MEMORY_ELEMENTS };
}


function finite(value, fallback = NaN) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isAirportSelection(location = {}) {
  const details = location.locationDetails || location.details || {};
  return details.isAirport === true || Boolean(
    String(details.airportClass || '').trim() ||
    String(details.iata || '').trim() ||
    String(details.icao || '').trim() ||
    /\b(?:airport|aerodrome|airfield)\b/i.test(String(location.name || location.label || ''))
  );
}

function normalizeAirportBounds(location = {}) {
  if (!isAirportSelection(location)) return null;
  const lat = finite(location.lat);
  const lon = finite(location.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) >= 85) return null;
  const details = location.locationDetails || location.details || {};
  const supplied = details.airportBounds || {};
  let minLat = finite(supplied.minLat);
  let maxLat = finite(supplied.maxLat);
  let minLon = finite(supplied.minLon);
  let maxLon = finite(supplied.maxLon);
  if (![minLat, maxLat, minLon, maxLon].every(Number.isFinite) || minLat >= maxLat || minLon >= maxLon) {
    const latitudeRadius = .026;
    const longitudeRadius = Math.min(.042, latitudeRadius / Math.max(.55, Math.cos(lat * Math.PI / 180)));
    minLat = lat - latitudeRadius;
    maxLat = lat + latitudeRadius;
    minLon = lon - longitudeRadius;
    maxLon = lon + longitudeRadius;
  }
  const pad = .0025;
  minLat -= pad;
  maxLat += pad;
  minLon -= pad;
  maxLon += pad;
  const halfLat = Math.min(MAX_AIRPORT_SPAN_DEGREES * .5, Math.max(.006, (maxLat - minLat) * .5));
  const halfLon = Math.min(MAX_AIRPORT_SPAN_DEGREES * .5, Math.max(.006, (maxLon - minLon) * .5));
  const centerLat = clamp((minLat + maxLat) * .5, lat - .012, lat + .012);
  const centerLon = clamp((minLon + maxLon) * .5, lon - .012, lon + .012);
  return Object.freeze({
    minLat: clamp(centerLat - halfLat, -85, 85),
    maxLat: clamp(centerLat + halfLat, -85, 85),
    minLon: clamp(centerLon - halfLon, -180, 180),
    maxLon: clamp(centerLon + halfLon, -180, 180)
  });
}

function splitBounds(bounds, maxSpan = MAX_CELL_SPAN_DEGREES) {
  const columns = Math.max(1, Math.ceil((bounds.maxLon - bounds.minLon) / maxSpan));
  const rows = Math.max(1, Math.ceil((bounds.maxLat - bounds.minLat) / maxSpan));
  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      cells.push({
        minLat: bounds.minLat + (bounds.maxLat - bounds.minLat) * row / rows,
        maxLat: bounds.minLat + (bounds.maxLat - bounds.minLat) * (row + 1) / rows,
        minLon: bounds.minLon + (bounds.maxLon - bounds.minLon) * column / columns,
        maxLon: bounds.minLon + (bounds.maxLon - bounds.minLon) * (column + 1) / columns
      });
    }
  }
  if (cells.length > MAX_CELL_REQUESTS) throw new Error('Mapped airport boundary exceeds the bounded source request limit.');
  return cells;
}

function cellUrl(cell) {
  const bbox = [cell.minLon, cell.minLat, cell.maxLon, cell.maxLat]
    .map((value) => Number(value).toFixed(7)).join(',');
  return `${OSM_MAP_ENDPOINT}?bbox=${encodeURIComponent(bbox)}`;
}

function airportCacheKey(location, bounds) {
  return [
    'osm-airport-map-v2', finite(location.lat).toFixed(6), finite(location.lon).toFixed(6),
    bounds.minLat.toFixed(6), bounds.minLon.toFixed(6), bounds.maxLat.toFixed(6), bounds.maxLon.toFixed(6)
  ].join(':');
}

const retainAirportElements = selectFacilitySourceElements;

function externalAbortError(signal) {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException(String(signal?.reason || 'Mapped airport request aborted'), 'AbortError');
}

async function fetchCell(cell, options, depth = 0) {
  const signal = options.signal || null;
  if (signal?.aborted) throw externalAbortError(signal);
  const timeRemaining = options.deadline - performance.now();
  if (timeRemaining <= 500) throw new Error('Mapped airport request budget exhausted.');
  const controller = new AbortController();
  const relay = () => controller.abort(externalAbortError(signal));
  signal?.addEventListener?.('abort', relay, { once: true });
  const timeoutId = setTimeout(() => controller.abort(), Math.max(500, Math.min(options.cellTimeoutMs, timeRemaining)));
  try {
    if (options.requestCount >= MAX_CELL_REQUESTS) throw new Error('Mapped airport request count exhausted.');
    options.requestCount++;
    const response = await fetch(cellUrl(cell), {
      signal: controller.signal,
      cache: 'default',
      headers: { Accept: 'application/json' }
    });
    if (response.status === 400 && depth < 2) {
      const message = await response.text();
      if (/too many nodes/i.test(message)) {
        const children = splitBounds(cell, Math.max(.004, (cell.maxLat - cell.minLat) * .51));
        const parts = [];
        for (const child of children) parts.push(await fetchCell(child, options, depth + 1));
        return parts.flat();
      }
    }
    if (!response.ok) throw new Error(`OpenStreetMap airport map request failed (${response.status}).`);
    const payload = await response.json();
    if (!Array.isArray(payload?.elements)) throw new Error('OpenStreetMap airport map response was invalid.');
    options.elementCount += payload.elements.length;
    if (options.elementCount > MAX_SOURCE_ELEMENTS) throw new Error('Mapped airport source size exceeds the bounded request limit.');
    return payload.elements;
  } catch (error) {
    if (signal?.aborted) throw externalAbortError(signal);
    throw error?.name === 'AbortError'
      ? new Error('OpenStreetMap airport map request timed out.')
      : error;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener?.('abort', relay);
  }
}

async function fetchMappedAirportData(location = {}, options = {}) {
  const bounds = normalizeAirportBounds(location);
  if (!bounds) return null;
  const key = airportCacheKey(location, bounds);
  const cached = memoryCache.get(key);
  if (cached) { rememberAirport(key,cached); return cached; }
  const persistent = await readPersistentOverpassCache(key);
  if (persistent?.data?.elements) {
    const value = { ...persistent.data, _overpassSource: 'persistent-cache', _overpassEndpoint: OSM_MAP_ENDPOINT };
    rememberAirport(key, value);
    return value;
  }
  const timeoutMs = Math.max(5000, finite(options.timeoutMs, 28000));
  const requestOptions = {
    requestCount: 0,
    elementCount: 0,
    signal: options.signal || null,
    deadline: performance.now() + timeoutMs,
    cellTimeoutMs: Math.max(3000, Math.min(9000, timeoutMs * .45))
  };
  const elementsById = new Map();
  const cells = splitBounds(bounds);
  for (const cell of cells) {
    const elements = await fetchCell(cell, requestOptions);
    for (const element of elements) elementsById.set(`${element.type}:${element.id}`, element);
  }
  const value = {
    elements: retainAirportElements([...elementsById.values()]),
    _overpassSource: 'openstreetmap-map-api',
    _overpassEndpoint: OSM_MAP_ENDPOINT,
    _overpassCacheAgeMs: 0,
    _airportMapBounds: bounds,
    _airportMapCellCount: cells.length
  };
  rememberAirport(key, value);
  void writePersistentOverpassCache(key, value, OSM_MAP_ENDPOINT, {
    lat: finite(location.lat), lon: finite(location.lon), roadsRadius: 0,
    featureRadius: Math.max(bounds.maxLat - bounds.minLat, bounds.maxLon - bounds.minLon),
    poiRadius: 0, kind: 'airport-map-v2'
  });
  return value;
}

export {
  airportSourceCacheSnapshot,
  MAX_AIRPORT_SPAN_DEGREES,
  MAX_CELL_REQUESTS,
  MAX_CELL_SPAN_DEGREES,
  MAX_SOURCE_ELEMENTS,
  fetchMappedAirportData,
  isAirportSelection,
  normalizeAirportBounds,
  splitBounds
};
