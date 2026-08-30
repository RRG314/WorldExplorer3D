const DEFLOCK_GLOBE_INDEX_VERSION = 1;
const DEFLOCK_GLOBE_INDEX_SOURCES = Object.freeze([
  Object.freeze({
    id: "us",
    label: "United States",
    binaryUrl: "https://tiles.dontgetflocked.com/cameras-us-hourly-index.bin",
    metadataUrl: "https://tiles.dontgetflocked.com/cameras-us-hourly-index.json"
  }),
  Object.freeze({
    id: "ca",
    label: "Canada",
    binaryUrl: "https://tiles.dontgetflocked.com/cameras-ca-hourly-index.bin",
    metadataUrl: "https://tiles.dontgetflocked.com/cameras-ca-hourly-index.json"
  })
]);

const CACHE_TTL_MS = 60 * 60 * 1000;
let cachedSnapshot = null;
let cachedAt = 0;
let activeLoad = null;

function finiteCoordinate(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function decodeDeFlockPositionIndex(bytes, metadata = {}, source = {}) {
  const buffer = bytes instanceof ArrayBuffer
    ? bytes.slice(0)
    : Uint8Array.prototype.slice.call(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).buffer;
  if (buffer.byteLength < 16) throw new Error("DeFlock camera index header is incomplete.");
  const header = new DataView(buffer);
  const magic = String.fromCharCode(...new Uint8Array(buffer, 0, 4));
  const version = header.getUint32(4, true);
  const count = header.getUint32(8, true);
  if (magic !== "FHIX" || version !== DEFLOCK_GLOBE_INDEX_VERSION) {
    throw new Error(`Unsupported DeFlock camera index ${magic}/${version}.`);
  }
  if (buffer.byteLength !== 16 + count * 9) throw new Error("DeFlock camera index size does not match its header.");
  if (Number(metadata?.count) !== count) throw new Error("DeFlock camera index metadata count does not match its binary data.");
  const latitudes = new Int32Array(buffer, 16, count);
  const longitudes = new Int32Array(buffer, 16 + count * 4, count);
  const brands = new Uint8Array(buffer, 16 + count * 8, count);
  return Object.freeze({
    sourceId: String(source.id || "index"),
    sourceLabel: String(source.label || "DeFlock camera index"),
    build: String(metadata?.build || "unknown"),
    count,
    brandLabels: Array.isArray(metadata?.brands) ? Object.freeze(metadata.brands.map(String)) : Object.freeze([]),
    latitudes,
    longitudes,
    brands
  });
}

function cameraAt(index, itemIndex) {
  if (!index || !Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= index.count) return null;
  const lat = index.latitudes[itemIndex] / 1e6;
  const lon = index.longitudes[itemIndex] / 1e6;
  const brandId = index.brands[itemIndex] || 0;
  return Object.freeze({
    id: `${index.sourceId}:${itemIndex}`,
    indexSourceId: index.sourceId,
    indexItem: itemIndex,
    lat,
    lon,
    brandId,
    brand: index.brandLabels[brandId] || "Unknown",
    indexBuild: index.build,
    sourceDataset: "DeFlock hourly OpenStreetMap ALPR index"
  });
}

function lowerBoundLatitude(index, latitude) {
  const target = Math.round(latitude * 1e6);
  let low = 0;
  let high = index.count;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (index.latitudes[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function longitudeDeltaDegrees(a, b) {
  return Math.abs(((Number(a) - Number(b) + 540) % 360) - 180);
}

function camerasNear(snapshot, lat, lon, options = {}) {
  const centerLat = finiteCoordinate(lat, -90, 90);
  const centerLon = finiteCoordinate(lon, -180, 180);
  if (centerLat == null || centerLon == null) return [];
  const radiusDegrees = Math.max(0.0001, Math.min(5, Number(options.radiusDegrees) || 0.04));
  const limit = Math.max(1, Math.min(100, Number(options.limit) || 24));
  const longitudeScale = Math.max(0.2, Math.cos(centerLat * Math.PI / 180));
  const longitudeRadius = radiusDegrees / longitudeScale;
  const matches = [];
  for (const index of snapshot?.indexes || []) {
    let cursor = lowerBoundLatitude(index, centerLat - radiusDegrees);
    const north = centerLat + radiusDegrees;
    while (cursor < index.count && index.latitudes[cursor] / 1e6 <= north) {
      const cameraLon = index.longitudes[cursor] / 1e6;
      const longitudeDelta = longitudeDeltaDegrees(cameraLon, centerLon);
      if (longitudeDelta <= longitudeRadius) {
        const camera = cameraAt(index, cursor);
        const distanceSquared = (camera.lat - centerLat) ** 2 + (longitudeDelta * longitudeScale) ** 2;
        matches.push({ ...camera, distanceSquared });
      }
      cursor += 1;
    }
  }
  return matches.sort((a, b) => a.distanceSquared - b.distanceSquared).slice(0, limit);
}

function nearestCamera(snapshot, lat, lon, options = {}) {
  return camerasNear(snapshot, lat, lon, { ...options, limit: 1 })[0] || null;
}

async function fetchIndexSource(source, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new TypeError("DeFlock globe index fetch is unavailable.");
  const request = { headers: { Accept: "application/json, application/octet-stream" }, signal: options.signal };
  const [metadataResponse, binaryResponse] = await Promise.all([
    fetchImpl(source.metadataUrl, request),
    fetchImpl(source.binaryUrl, request)
  ]);
  if (!metadataResponse?.ok || !binaryResponse?.ok) {
    throw new Error(`${source.label} camera index could not be loaded.`);
  }
  const [metadata, binary] = await Promise.all([metadataResponse.json(), binaryResponse.arrayBuffer()]);
  return decodeDeFlockPositionIndex(binary, metadata, source);
}

async function loadDeFlockGlobeIndex(options = {}) {
  const now = Date.now();
  if (!options.force && cachedSnapshot && now - cachedAt < CACHE_TTL_MS) return cachedSnapshot;
  if (activeLoad && !options.force) return activeLoad;
  const sources = Array.isArray(options.sources) && options.sources.length ? options.sources : DEFLOCK_GLOBE_INDEX_SOURCES;
  const load = Promise.allSettled(sources.map((source) => fetchIndexSource(source, options))).then((results) => {
    const indexes = results.filter((result) => result.status === "fulfilled").map((result) => result.value);
    if (!indexes.length) throw results.find((result) => result.status === "rejected")?.reason || new Error("No DeFlock camera indexes loaded.");
    const warnings = results.flatMap((result, index) => result.status === "rejected" ? [`${sources[index].label}: ${result.reason?.message || result.reason}`] : []);
    const snapshot = Object.freeze({
      version: DEFLOCK_GLOBE_INDEX_VERSION,
      indexes: Object.freeze(indexes),
      count: indexes.reduce((sum, index) => sum + index.count, 0),
      builds: Object.freeze(Object.fromEntries(indexes.map((index) => [index.sourceId, index.build]))),
      loadedAt: Date.now(),
      warnings: Object.freeze(warnings)
    });
    cachedSnapshot = snapshot;
    cachedAt = Date.now();
    return snapshot;
  }).finally(() => {
    if (activeLoad === load) activeLoad = null;
  });
  activeLoad = load;
  return load;
}

export {
  DEFLOCK_GLOBE_INDEX_SOURCES,
  DEFLOCK_GLOBE_INDEX_VERSION,
  cameraAt,
  camerasNear,
  decodeDeFlockPositionIndex,
  loadDeFlockGlobeIndex,
  longitudeDeltaDegrees,
  nearestCamera
};
