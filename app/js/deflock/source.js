import { fetchOverpassJSON } from "../world/osm-loader.js?v=17";

const DEFLOCK_SOURCE_VERSION = "osm-surveillance-v1";
const DEFLOCK_RADIUS_DEGREES = 0.022;
const DEFLOCK_MAX_CAMERAS = 750;
const DEFLOCK_TIMEOUT_MS = 18000;

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeDirection(value) {
  const text = String(value ?? "").trim().toUpperCase();
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
  const payload = await fetchOverpassJSON(
    query,
    Number(options.timeoutMs) || DEFLOCK_TIMEOUT_MS,
    performance.now() + (Number(options.deadlineMs) || DEFLOCK_TIMEOUT_MS + 2500),
    cacheMeta,
    { signal: options.signal }
  );
  return {
    features: parseSurveillanceElements(payload, options),
    source: "OpenStreetMap",
    sourceVersion: DEFLOCK_SOURCE_VERSION,
    cacheSource: payload._overpassSource || "network",
    cacheAgeMs: finite(payload._overpassCacheAgeMs, 0),
    bounded: true,
    radiusDegrees: radius
  };
}

export {
  DEFLOCK_MAX_CAMERAS,
  DEFLOCK_RADIUS_DEGREES,
  DEFLOCK_SOURCE_VERSION,
  buildSurveillanceQuery,
  loadSurveillanceFeatures,
  normalizeDirection,
  parseSurveillanceElements
};
