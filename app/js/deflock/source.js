import { fetchOverpassJSON } from "../world/osm-loader.js?v=19";

const DEFLOCK_SOURCE_VERSION = "osm-surveillance-v1";
const DEFLOCK_RADIUS_DEGREES = 0.022;
const DEFLOCK_MAX_CAMERAS = 750;
const DEFLOCK_TIMEOUT_MS = 18000;
const DEFLOCK_PROXY_TIMEOUT_MS = 20000;
const DEFLOCK_PROXY_ENDPOINT = "/api/geospatial/deflock-cameras";

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeDirection(value) {
  const text = String(value ?? "").trim().toUpperCase().split(/[;,]/)[0].trim();
  if (!text) return null;
  const numericText = text.replace(/[^0-9.+-]/g, "");
  const numeric = numericText ? Number(numericText) : Number.NaN;
  if (Number.isFinite(numeric)) return ((numeric % 360) + 360) % 360;
  const compass = {
    N: 0,
    NNE: 22.5,
    NE: 45,
    ENE: 67.5,
    E: 90,
    ESE: 112.5,
    SE: 135,
    SSE: 157.5,
    S: 180,
    SSW: 202.5,
    SW: 225,
    WSW: 247.5,
    W: 270,
    WNW: 292.5,
    NW: 315,
    NNW: 337.5
  };
  return compass[text] ?? null;
}

function normalizeText(value, maxLength = 120) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, maxLength) : null;
}

function normalizeHeightMeters(value) {
  const match = String(value ?? "").trim().match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const height = Number(match[0]);
  return Number.isFinite(height) && height >= 1.5 && height <= 20 ? height : null;
}

function isCameraRecord(tags = {}) {
  if (String(tags.man_made || "").toLowerCase() !== "surveillance") return false;
  const surveillanceType = String(tags["surveillance:type"] || "").toLowerCase();
  return !surveillanceType || surveillanceType.split(/[;,]/).some((value) => {
    const type = value.trim();
    return type === "camera" || type === "alpr" || type === "anpr";
  });
}

function cameraKind(tags = {}) {
  const surveillanceType = String(tags["surveillance:type"] || "").toLowerCase();
  if (surveillanceType.includes("alpr") || surveillanceType.includes("anpr")) return "ALPR";
  return normalizeText(tags["camera:type"], 32) || "camera";
}

function parseSurveillanceElements(payload = {}, options = {}) {
  const maxCameras = Math.max(1, Math.min(DEFLOCK_MAX_CAMERAS, Number(options.maxCameras) || DEFLOCK_MAX_CAMERAS));
  const rows = [];
  const seen = new Set();
  for (const element of Array.isArray(payload.elements) ? payload.elements : []) {
    if (element?.type !== "node" || !isCameraRecord(element.tags || {})) continue;
    const lat = finite(element.lat);
    const lon = finite(element.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const sourceId = `osm:node:${String(element.id || "")}`;
    if (sourceId.endsWith(":" ) || seen.has(sourceId)) continue;
    seen.add(sourceId);
    const tags = element.tags || {};
    rows.push({
      sourceId,
      sourceDataset: "OpenStreetMap",
      sourceVersion: DEFLOCK_SOURCE_VERSION,
      sourceTimestamp: normalizeText(element.timestamp, 40),
      lat,
      lon,
      cameraType: cameraKind(tags),
      cameraMount: normalizeText(tags["camera:mount"], 48),
      cameraHeightMeters: normalizeHeightMeters(tags["camera:height"] ?? tags.height),
      surveillanceType: normalizeText(tags["surveillance:type"], 48) || "unknown",
      surveillanceZone: normalizeText(tags["surveillance:zone"], 48),
      direction: normalizeDirection(tags.direction ?? tags["camera:direction"]),
      operator: normalizeText(tags.operator, 80),
      manufacturer: normalizeText(tags.manufacturer ?? tags.brand, 80),
      name: normalizeText(tags.name, 80),
      provenance: {
        source: "OpenStreetMap",
        license: "ODbL-1.0",
        elementType: "node",
        elementId: String(element.id),
        fetchedFrom: normalizeText(payload._overpassEndpoint, 180) || "fixture",
        cacheSource: normalizeText(payload._overpassSource, 40) || "fixture",
        cacheAgeMs: finite(payload._overpassCacheAgeMs, 0)
      }
    });
    if (rows.length >= maxCameras) break;
  }
  return rows;
}

function buildSurveillanceQuery(location, radiusDegrees = DEFLOCK_RADIUS_DEGREES) {
  const lat = finite(location?.lat, 0);
  const lon = finite(location?.lon, 0);
  const radius = Math.max(0.002, Math.min(0.04, finite(radiusDegrees, DEFLOCK_RADIUS_DEGREES)));
  const bounds = `(${(lat - radius).toFixed(7)},${(lon - radius).toFixed(7)},${(lat + radius).toFixed(7)},${(lon + radius).toFixed(7)})`;
  return `[out:json][timeout:${Math.ceil(DEFLOCK_TIMEOUT_MS / 1000)}];node["man_made"="surveillance"]${bounds};out meta qt;`;
}

async function fetchSurveillanceProxyJSON(location, radiusDegrees, options = {}) {
  const endpoint = String(options.proxyEndpoint || DEFLOCK_PROXY_ENDPOINT);
  const fetchImpl = typeof options.proxyFetchImpl === "function" ? options.proxyFetchImpl : globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new TypeError("Mapped camera proxy fetch is unavailable");
  const params = new URLSearchParams({
    lat: String(finite(location?.lat, 0)),
    lon: String(finite(location?.lon, 0)),
    radiusDegrees: String(radiusDegrees)
  });
  const controller = new AbortController();
  const externalSignal = options.signal || null;
  const relayAbort = () => controller.abort(externalSignal?.reason);
  externalSignal?.addEventListener?.("abort", relayAbort, { once: true });
  const timeoutId = setTimeout(() => controller.abort(), Number(options.proxyTimeoutMs) || DEFLOCK_PROXY_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${endpoint}?${params}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!response?.ok) throw new Error(`Mapped camera proxy HTTP ${Number(response?.status) || 502}`);
    const payload = await response.json();
    if (!Array.isArray(payload?.elements)) throw new Error("Mapped camera proxy returned an invalid payload");
    return {
      ...payload,
      _overpassEndpoint: payload.endpoint ? `${payload.endpoint} (server-proxy)` : "server-proxy",
      _overpassSource: payload.cache === "upstream" ? "server-proxy" : `server-${payload.cache || "proxy"}`,
      _overpassCacheAgeMs: finite(payload.cacheAgeMs, 0)
    };
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener?.("abort", relayAbort);
  }
}

async function loadSurveillanceFeatures(location, options = {}) {
  const radius = Math.max(0.002, Math.min(0.04, finite(options.radiusDegrees, DEFLOCK_RADIUS_DEGREES)));
  const query = buildSurveillanceQuery(location, radius);
  const cacheMeta = {
    lat: finite(location?.lat, 0),
    lon: finite(location?.lon, 0),
    roadsRadius: radius,
    featureRadius: radius,
    poiRadius: radius,
    kind: DEFLOCK_SOURCE_VERSION
  };
  let payload = null;
  let proxyError = null;
  if (options.useProxy !== false) {
    try {
      payload = await fetchSurveillanceProxyJSON(location, radius, options);
    } catch (error) {
      if (options.signal?.aborted) throw error;
      proxyError = error;
    }
  }
  if (!payload) {
    try {
      payload = await fetchOverpassJSON(
        query,
        Number(options.timeoutMs) || DEFLOCK_TIMEOUT_MS,
        performance.now() + (Number(options.deadlineMs) || DEFLOCK_TIMEOUT_MS + 2500),
        cacheMeta,
        { signal: options.signal }
      );
    } catch (error) {
      if (proxyError) {
        throw new Error(`Mapped camera data could not be loaded. Proxy: ${proxyError.message}. Direct: ${error.message}`);
      }
      throw error;
    }
  }
  return {
    features: parseSurveillanceElements(payload, options),
    source: "OpenStreetMap",
    sourceVersion: DEFLOCK_SOURCE_VERSION,
    cacheSource: payload._overpassSource || "network",
    cacheAgeMs: finite(payload._overpassCacheAgeMs, 0),
    fetchedAt: normalizeText(payload.fetchedAt, 40),
    warnings: Array.isArray(payload.warnings) ? payload.warnings.map((warning) => normalizeText(warning, 180)).filter(Boolean) : [],
    bounded: true,
    radiusDegrees: radius
  };
}

export {
  DEFLOCK_MAX_CAMERAS,
  DEFLOCK_PROXY_ENDPOINT,
  DEFLOCK_RADIUS_DEGREES,
  DEFLOCK_SOURCE_VERSION,
  buildSurveillanceQuery,
  fetchSurveillanceProxyJSON,
  loadSurveillanceFeatures,
  normalizeDirection,
  normalizeHeightMeters,
  parseSurveillanceElements
};
