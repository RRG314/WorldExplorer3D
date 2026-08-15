import { isPolarCryosphereLocation } from '../../earth-core/world-surface-domain.js?v=2';

export const FAVORITE_STORAGE_KEY = "worldExplorer3D.globeSelector.savedFavorites";
export const MAX_SAVED_FAVORITES = 10;
export const RECENT_STORAGE_KEY = "worldExplorer3D.globeSelector.recentPlaces";
export const MAX_RECENT_PLACES = 8;

export function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function clampLatLon(lat, lon) {
  const clampedLat = Math.max(-90, Math.min(90, Number(lat) || 0));
  let clampedLon = Number(lon) || 0;
  while (clampedLon > 180) clampedLon -= 360;
  while (clampedLon < -180) clampedLon += 360;
  return { lat: clampedLat, lon: clampedLon };
}

export function normalizeCityName(name, lat, lon, fallbackPrefix = "Custom Location") {
  const trimmed = String(name || "").trim();
  if (trimmed && !/^resolving city/i.test(trimmed)) return trimmed;
  return `${fallbackPrefix} ${Number(lat).toFixed(3)}, ${Number(lon).toFixed(3)}`;
}

export function normalizeCityRecord(raw, source = "menu") {
  if (!raw || typeof raw !== "object") return null;
  const lat = toFiniteNumber(raw.lat);
  const lon = toFiniteNumber(raw.lon);
  if (lat == null || lon == null) return null;
  const clamped = clampLatLon(lat, lon);
  const name = normalizeCityName(raw.name, clamped.lat, clamped.lon, source === "saved" ? "Saved Custom" : "City");
  const normalizedSource = source === "saved" ? "saved" : source === "live" ? "live" : source === "curated" ? "curated" : "menu";
  return {
    key: String(raw.key || ""),
    name,
    lat: Number(clamped.lat),
    lon: Number(clamped.lon),
    source: normalizedSource,
    category: String(raw.category || ""),
    collection: String(raw.collection || ""),
    savedAt: Number(raw.savedAt || 0)
  };
}

export function cityDedupKey(city) {
  if (!city) return "";
  return `${Number(city.lat).toFixed(4)},${Number(city.lon).toFixed(4)}`;
}

export function cityLocationLabel(city) {
  if (!city) return "";
  return `${Number(city.lat).toFixed(2)}, ${Number(city.lon).toFixed(2)}`;
}

export function getMenuFavoriteCities(locs = {}) {
  return Object.entries(locs || {}).map(([key, entry]) => {
    const lat = toFiniteNumber(entry?.lat);
    const lon = toFiniteNumber(entry?.lon);
    if (lat == null || lon == null) return null;
    return {
      key: String(key || ""),
      name: String(entry?.name || key || "City").trim(),
      lat: Number(lat),
      lon: Number(lon),
      source: "menu"
    };
  }).filter(Boolean);
}

export function buildFavoriteCities({ menuFavoriteCities = [], savedFavoriteCities = [] }) {
  const out = [];
  const seen = new Set();
  const merged = [...savedFavoriteCities, ...menuFavoriteCities];
  merged.forEach((city) => {
    const normalized = normalizeCityRecord(city, city?.source || "menu");
    if (!normalized) return;
    const key = cityDedupKey(normalized);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(normalized);
  });
  return out;
}

export function getFavoriteCityGroups({ menuFavoriteCities = [], savedFavoriteCities = [] }) {
  const presets = menuFavoriteCities
    .map((city) => normalizeCityRecord(city, "menu"))
    .filter(Boolean);
  const saved = savedFavoriteCities
    .map((city) => normalizeCityRecord(city, "saved"))
    .filter(Boolean);

  const dedupe = (list = []) => {
    const out = [];
    const seen = new Set();
    list.forEach((city) => {
      const key = cityDedupKey(city);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(city);
    });
    return out;
  };

  return {
    presets: dedupe(presets),
    saved: dedupe(saved)
  };
}

export function loadSavedFavoriteCities() {
  try {
    const raw = localStorage.getItem(FAVORITE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => normalizeCityRecord(entry, "saved"))
      .filter(Boolean)
      .sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0))
      .slice(0, MAX_SAVED_FAVORITES);
  } catch {
    return [];
  }
}

export function persistSavedFavoriteCities(savedFavoriteCities = []) {
  try {
    const payload = savedFavoriteCities
      .map((city) => ({
        key: String(city.key || ""),
        name: String(city.name || ""),
        lat: Number(city.lat),
        lon: Number(city.lon),
        savedAt: Number(city.savedAt || Date.now())
      }))
      .slice(0, MAX_SAVED_FAVORITES);
    localStorage.setItem(FAVORITE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage can fail in private mode; keep runtime-only list.
  }
}

export function loadRecentPlaces() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => normalizeCityRecord(entry, 'saved'))
      .filter(Boolean)
      .sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0))
      .slice(0, MAX_RECENT_PLACES);
  } catch {
    return [];
  }
}

export function addRecentPlace(selection, recentPlaces = []) {
  const normalized = normalizeCityRecord({
    ...selection,
    key: `recent-${Date.now()}`,
    savedAt: Date.now()
  }, 'saved');
  if (!normalized) return recentPlaces;
  const next = [normalized, ...recentPlaces.filter((city) => cityDedupKey(city) !== cityDedupKey(normalized))]
    .slice(0, MAX_RECENT_PLACES);
  try {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Recents remain available for this session when storage is unavailable.
  }
  return next;
}

export function distanceKmBetween(latA, lonA, latB, lonB) {
  const toRad = Math.PI / 180;
  const dLat = (latB - latA) * toRad;
  const dLon = (lonB - lonA) * toRad;
  const aLat = latA * toRad;
  const bLat = latB * toRad;
  const sinLat = Math.sin(dLat * 0.5);
  const sinLon = Math.sin(dLon * 0.5);
  const a = sinLat * sinLat + Math.cos(aLat) * Math.cos(bLat) * sinLon * sinLon;
  const c = 2 * Math.atan2(Math.sqrt(Math.max(0, a)), Math.sqrt(Math.max(0, 1 - a)));
  return 6371 * c;
}

export function buildNearbyCities({ mappedCities = [], liveNearbyCity = null, lat, lon }) {
  const combined = [];
  if (liveNearbyCity) combined.push(liveNearbyCity);
  combined.push(...mappedCities);
  if (!combined.length) return [];

  const seen = new Set();
  const withDistance = combined
    .map((city) => {
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return { ...city, distanceKm: NaN };
      }
      return {
        ...city,
        distanceKm: distanceKmBetween(lat, lon, city.lat, city.lon)
      };
    })
    .filter((city) => {
      const key = cityDedupKey(city);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  withDistance.sort((a, b) => {
    const aDist = Number(a.distanceKm);
    const bDist = Number(b.distanceKm);
    if (Number.isFinite(aDist) && Number.isFinite(bDist)) return aDist - bDist;
    if (Number.isFinite(aDist)) return -1;
    if (Number.isFinite(bDist)) return 1;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  return withDistance.slice(0, 8);
}

export function latLonToLocalPoint(lat, lon, radius = 1.01) {
  const latRad = lat * Math.PI / 180;
  const lonRad = lon * Math.PI / 180;
  const cosLat = Math.cos(latRad);
  return {
    x: radius * cosLat * Math.cos(lonRad),
    y: radius * Math.sin(latRad),
    z: -radius * cosLat * Math.sin(lonRad)
  };
}

export function localPointToLatLon(point) {
  const len = Math.hypot(point.x, point.y, point.z) || 1;
  const nx = point.x / len;
  const ny = point.y / len;
  const nz = point.z / len;
  const lat = 90 - Math.acos(Math.max(-1, Math.min(1, ny))) * 180 / Math.PI;
  const lon = Math.atan2(-nz, nx) * 180 / Math.PI;
  return clampLatLon(lat, lon);
}

export function uniqueNonEmptyParts(parts = []) {
  const out = [];
  const seen = new Set();
  parts.forEach((part) => {
    const text = String(part || "").trim();
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(text);
  });
  return out;
}

export function parseReverseAddress(payload = {}) {
  const addr = payload?.address || {};
  const adminRows = Array.isArray(payload?.localityInfo?.administrative) ? payload.localityInfo.administrative : [];
  const countyFromBdc = adminRows.find((row) => Number(row?.adminLevel) === 6)?.name ||
    adminRows.find((row) => /county/i.test(String(row?.description || "")))?.name ||
    "";
  const cleanCountry = (value) => String(value || "").replace(/\s*\(the\)\s*$/i, "").trim();
  const city =
    addr.city ||
    addr.town ||
    addr.village ||
    addr.municipality ||
    addr.city_district ||
    addr.suburb ||
    addr.hamlet ||
    payload?.city ||
    payload?.locality ||
    "";
  const county =
    addr.county ||
    addr.borough ||
    addr.district ||
    addr.state_district ||
    countyFromBdc ||
    "";
  const region =
    addr.state ||
    addr.region ||
    addr.province ||
    addr.territory ||
    payload?.principalSubdivision ||
    "";
  const country = cleanCountry(addr.country || payload?.countryName || "");
  const parts = uniqueNonEmptyParts([city, county, region, country]);
  const display =
    parts.join(", ") ||
    String(payload?.display_name || "").split(",").slice(0, 4).map((v) => String(v || "").trim()).filter(Boolean).join(", ");
  // Only structured feature fields may classify a selected coordinate as
  // water. Names and display strings are labels, not point-in-water evidence
  // (for example, administrative regions and towns can contain "water").
  const structuredWaterText = [
    payload?.category,
    payload?.type,
    payload?.addresstype,
    addr.ocean,
    addr.sea,
    addr.water,
    addr.bay,
    addr.strait,
    addr.lake,
    addr.reservoir,
    addr.river,
    addr.canal
  ].filter(Boolean).join(' ');
  const waterKind = /\b(lake|reservoir|pond|loch)\b/i.test(structuredWaterText) ? 'lake' :
    /\b(harbour|harbor|marina|port)\b/i.test(structuredWaterText) ? 'harbor' :
    /\b(river|canal|channel)\b/i.test(structuredWaterText) ? 'channel' :
    /\b(bay|gulf|strait|sound|lagoon|estuary)\b/i.test(structuredWaterText) ? 'coastal' :
    /\b(ocean|sea|open water)\b/i.test(structuredWaterText) ? 'open_ocean' : null;

  return {
    display,
    queryLabel: city || county || region || country || "",
    details: { city, county, region, country, waterKind },
    waterKind
  };
}

async function fetchJsonWithTimeout(url, timeoutMs = 6000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchGebcoElevationMeters(lat, lon, timeoutMs = 6500) {
  const halfSpan = 0.01;
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.1.1',
    REQUEST: 'GetFeatureInfo',
    LAYERS: 'GEBCO_LATEST_2',
    QUERY_LAYERS: 'GEBCO_LATEST_2',
    STYLES: '',
    SRS: 'EPSG:4326',
    BBOX: `${lon - halfSpan},${lat - halfSpan},${lon + halfSpan},${lat + halfSpan}`,
    WIDTH: '64',
    HEIGHT: '64',
    FORMAT: 'image/png',
    INFO_FORMAT: 'text/plain',
    X: '32',
    Y: '32'
  });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`https://wms.gebco.net/mapserv?${params.toString()}`, {
      cache: 'force-cache',
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`GEBCO WMS HTTP ${response.status}`);
    const payload = await response.text();
    const match = payload.match(/value_list\s*=\s*'(-?\d+(?:\.\d+)?)/i);
    const elevation = match ? Number(match[1]) : NaN;
    return Number.isFinite(elevation) ? elevation : null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function resolveCoordinateSurfaceEvidence(lat, lon, reversePayload = null) {
  if (isPolarCryosphereLocation({ lat, lon })) {
    return Object.freeze({
      kind: 'cryosphere',
      verified: true,
      source: 'polar-coordinate-policy',
      elevationMeters: null
    });
  }
  const parsedKind = parseReverseAddress(reversePayload || {}).waterKind;
  try {
    const elevation = await fetchGebcoElevationMeters(lat, lon);
    if (Number.isFinite(elevation)) {
      return Object.freeze({
        kind: elevation <= -5 ? 'open_ocean' : 'land',
        verified: true,
        source: 'gebco-elevation-sample',
        elevationMeters: elevation
      });
    }
  } catch {
    // The structured reverse result is a conservative fallback when the
    // elevation service is unavailable. Unknown coordinates default to land
    // later so an outage cannot create synthetic ocean.
  }
  if (parsedKind === 'open_ocean') {
    return Object.freeze({
      kind: 'open_ocean',
      verified: true,
      source: 'structured-reverse-water-feature',
      elevationMeters: null
    });
  }
  return null;
}

export async function resolveCoordinateWaterKind(lat, lon, reversePayload = null) {
  const evidence = await resolveCoordinateSurfaceEvidence(lat, lon, reversePayload);
  return evidence?.kind === 'open_ocean' ? 'open_ocean' : null;
}

export async function fetchReversePayload(lat, lon) {
  const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1&lat=${encodeURIComponent(lat.toFixed(6))}&lon=${encodeURIComponent(lon.toFixed(6))}`;
  try {
    return await fetchJsonWithTimeout(nominatimUrl, 6000);
  } catch {
    const bdcUrl = `https://api-bdc.io/data/reverse-geocode-client?latitude=${encodeURIComponent(lat.toFixed(6))}&longitude=${encodeURIComponent(lon.toFixed(6))}&localityLanguage=en`;
    return await fetchJsonWithTimeout(bdcUrl, 7000);
  }
}

export function addSelectionToSavedFavorites(selection, savedFavorites = []) {
  if (!selection) return savedFavorites;
  const lat = toFiniteNumber(selection.lat);
  const lon = toFiniteNumber(selection.lon);
  if (lat == null || lon == null) return savedFavorites;
  const savedAt = Date.now();
  const normalized = normalizeCityRecord({
    key: `saved-${savedAt}`,
    name: normalizeCityName(selection.name, lat, lon, 'Saved Custom'),
    lat,
    lon,
    savedAt
  }, 'saved');
  if (!normalized) return savedFavorites;
  const next = savedFavorites.filter((city) =>
    Math.abs(city.lat - normalized.lat) > 0.0005 || Math.abs(city.lon - normalized.lon) > 0.0005
  );
  next.unshift(normalized);
  const limited = next.slice(0, MAX_SAVED_FAVORITES);
  persistSavedFavoriteCities(limited);
  return limited;
}

export function cityMatchesGlobeSelection(selection, city) {
  return !!selection && !!city &&
    Math.abs(selection.lat - city.lat) < 0.0005 &&
    Math.abs(selection.lon - city.lon) < 0.0005;
}

export function syncLegacyCustomSelection(appCtx, selection) {
  if (!selection) return;
  const legacyLat = document.getElementById('customLat');
  const legacyLon = document.getElementById('customLon');
  if (legacyLat) legacyLat.value = Number(selection.lat).toFixed(6);
  if (legacyLon) legacyLon.value = Number(selection.lon).toFixed(6);
  appCtx.setCustomLocation?.({
    lat: selection.lat,
    lon: selection.lon,
    name: selection.name || appCtx.customLoc?.name || 'Custom Location',
    arrivalMode: selection.arrivalMode || 'auto',
    waterKind: selection.waterKind || null,
    surfaceEvidence: selection.surfaceEvidence || null
  }, { transient: selection.fromGeolocation === true, syncInputs: false });
}

export function setGlobeSelectorScrollLock(locked) {
  document.body?.classList.toggle('globe-selector-open', !!locked);
}
