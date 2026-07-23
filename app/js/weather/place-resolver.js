import { ctx as appCtx } from '../shared-context.js?v=55';

const PLACE_API_TIMEOUT_MS = 6500;
const PLACE_LOCATION_PRECISION = 2;
const WEATHER_LOCATION_PRECISION = 1;
let _pendingPlaceRequest = null;

function getActiveWeatherLocationLabel() {
  if (appCtx.selLoc === 'custom') {
    const name = String(appCtx.customLoc?.name || '').trim();
    return name || 'Custom Location';
  }
  const preset = appCtx.LOCS?.[appCtx.selLoc];
  if (preset?.name) return String(preset.name);
  const fallback = String(appCtx.customLoc?.name || '').trim();
  return fallback || 'Current Location';
}

function weatherCacheKey(lat, lon) {
  return `${lat.toFixed(WEATHER_LOCATION_PRECISION)}:${lon.toFixed(WEATHER_LOCATION_PRECISION)}`;
}

function placeCacheKey(lat, lon) {
  return `${lat.toFixed(PLACE_LOCATION_PRECISION)}:${lon.toFixed(PLACE_LOCATION_PRECISION)}`;
}

function placeStateMatchesLocation(place, location, maxDistanceKm = 30) {
  const latA = Number(place?.lat);
  const lonA = Number(place?.lon);
  const latB = Number(location?.lat);
  const lonB = Number(location?.lon);
  if (![latA, lonA, latB, lonB].every(Number.isFinite)) return false;
  const toRad = Math.PI / 180;
  const dLat = (latB - latA) * toRad;
  const dLon = (lonB - lonA) * toRad;
  const a = Math.sin(dLat * 0.5) ** 2 +
    Math.cos(latA * toRad) * Math.cos(latB * toRad) * Math.sin(dLon * 0.5) ** 2;
  const distanceKm = 6371 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a))));
  return distanceKm <= Math.max(1, Number(maxDistanceKm) || 30);
}

function cleanCountry(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text === 'United States of America' ? 'United States' : text;
}

function uniqueNonEmptyParts(parts) {
  const out = [];
  const seen = new Set();
  for (const part of parts || []) {
    const text = String(part || '').trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function parseReverseAddress(payload) {
  const addr = payload?.address || {};
  const adminRows = Array.isArray(payload?.localityInfo?.administrative) ? payload.localityInfo.administrative : [];
  const countyFromBdc = adminRows.find((row) => Number(row?.adminLevel) === 6)?.name ||
    adminRows.find((row) => /county/i.test(String(row?.description || '')))?.name ||
    '';
  const city =
    addr.city ||
    addr.town ||
    addr.village ||
    addr.hamlet ||
    addr.municipality ||
    addr.city_district ||
    payload?.city ||
    payload?.locality ||
    '';
  const county =
    addr.county ||
    addr.state_district ||
    addr.district ||
    countyFromBdc ||
    '';
  const region =
    addr.state ||
    addr.region ||
    addr.province ||
    addr.territory ||
    payload?.principalSubdivision ||
    '';
  const country = cleanCountry(addr.country || payload?.countryName || '');
  const parts = uniqueNonEmptyParts([city, county, region, country]);
  const display =
    parts.join(', ') ||
    String(payload?.display_name || '').split(',').slice(0, 4).map((v) => String(v || '').trim()).filter(Boolean).join(', ');
  return {
    display,
    shortLabel: city || county || region || country || '',
    details: { city, county, region, country },
    resolutionSource: 'reverse-geocode'
  };
}

async function fetchJsonWithTimeout(url, timeoutMs = PLACE_API_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function fetchPlaceForLocation(lat, lon) {
  const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1&lat=${encodeURIComponent(lat.toFixed(6))}&lon=${encodeURIComponent(lon.toFixed(6))}`;
  try {
    return parseReverseAddress(await fetchJsonWithTimeout(nominatimUrl, 6000));
  } catch {
    const bdcUrl = `https://api-bdc.io/data/reverse-geocode-client?latitude=${encodeURIComponent(lat.toFixed(6))}&longitude=${encodeURIComponent(lon.toFixed(6))}&localityLanguage=en`;
    return parseReverseAddress(await fetchJsonWithTimeout(bdcUrl, 7000));
  }
}

function getFallbackPlaceLabel(location) {
  const activeName = getActiveWeatherLocationLabel();
  return {
    display: activeName,
    shortLabel: activeName,
    details: null,
    resolutionSource: 'selection-fallback'
  };
}

function assignResolvedPlace(place, location) {
  const resolved = place?.display ? place : getFallbackPlaceLabel(location);
  appCtx.livePlaceState = {
    ...resolved,
    lat: location.lat,
    lon: location.lon,
    key: placeCacheKey(location.lat, location.lon)
  };
  return appCtx.livePlaceState;
}

async function refreshLivePlace(location, force = false) {
  if (!Number.isFinite(location?.lat) || !Number.isFinite(location?.lon)) return appCtx.livePlaceState || null;
  const key = placeCacheKey(location.lat, location.lon);
  const cache = appCtx.placeCache instanceof Map ? appCtx.placeCache : (appCtx.placeCache = new Map());
  const cached = cache.get(key) || null;
  if (!force && cached) return assignResolvedPlace(cached, location);
  if (_pendingPlaceRequest?.key === key && !force) {
    try {
      await _pendingPlaceRequest.promise;
    } catch {
      // fall through to current value
    }
    return appCtx.livePlaceState || null;
  }
  const promise = fetchPlaceForLocation(location.lat, location.lon).then((place) => {
    cache.set(key, place);
    return assignResolvedPlace(place, location);
  }).catch(() => assignResolvedPlace(getFallbackPlaceLabel(location), location)).finally(() => {
    if (_pendingPlaceRequest?.key === key) _pendingPlaceRequest = null;
  });
  _pendingPlaceRequest = { key, promise };
  return await promise;
}


export {
  getActiveWeatherLocationLabel,
  weatherCacheKey,
  placeCacheKey,
  placeStateMatchesLocation,
  cleanCountry,
  uniqueNonEmptyParts,
  parseReverseAddress,
  fetchJsonWithTimeout,
  fetchPlaceForLocation,
  getFallbackPlaceLabel,
  assignResolvedPlace,
  refreshLivePlace
};
