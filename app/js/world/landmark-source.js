const LANDMARK_PACK_URL = new URL('../../data/featured-landmarks.json', import.meta.url);
const BUNDLED_LANDMARK_SCHEMA_VERSION = 1;

let landmarkPackPromise = null;

async function fetchLandmarkPacks(options = {}) {
  const fetchImpl = typeof options.fetchImpl === 'function' ? options.fetchImpl : globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new TypeError('Featured landmark data: fetch unavailable');
  const response = await fetchImpl(LANDMARK_PACK_URL, {
    cache: 'default',
    signal: options.signal
  });
  if (!response?.ok) throw new Error(`Featured landmark data: HTTP ${response?.status || 'unknown'}`);
  const data = await response.json();
  if (Number(data?.schemaVersion) !== BUNDLED_LANDMARK_SCHEMA_VERSION) {
    throw new Error('Featured landmark data: unsupported schema');
  }
  if (!Array.isArray(data.packs)) throw new Error('Featured landmark data: packs must be an array');
  for (const pack of data.packs) {
    if (!String(pack?.id || '') || !Array.isArray(pack?.elements)) {
      throw new Error('Featured landmark data: invalid pack');
    }
  }
  return data;
}

function loadLandmarkPacks(options = {}) {
  const fixtureFetch = typeof options.fetchImpl === 'function' && options.fetchImpl !== globalThis.fetch;
  if (fixtureFetch) return fetchLandmarkPacks(options);
  if (landmarkPackPromise) return landmarkPackPromise;
  landmarkPackPromise = fetchLandmarkPacks(options)
    .catch((err) => {
      landmarkPackPromise = null;
      throw err;
    });
  return landmarkPackPromise;
}

function locationMatchesPack(pack, lat, lon) {
  const centerLat = Number(pack?.center?.lat);
  const centerLon = Number(pack?.center?.lon);
  const configuredRadius = Math.max(0.001, Number(pack?.radiusDegrees) || 0.01);
  const radius = pack?.id === 'golden-gate-bridge'
    ? Math.max(0.09, configuredRadius)
    : configuredRadius;
  if (![centerLat, centerLon, lat, lon].every(Number.isFinite)) return false;
  const lonScale = Math.max(0.25, Math.cos(centerLat * Math.PI / 180));
  return Math.hypot(lat - centerLat, (lon - centerLon) * lonScale) <= radius;
}

export async function fetchBundledLandmarkData(options = {}) {
  const lat = Number(options.lat);
  const lon = Number(options.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const data = await loadLandmarkPacks(options);
  const pack = (data?.packs || []).find((candidate) => locationMatchesPack(candidate, lat, lon));
  if (!pack || !Array.isArray(pack.elements)) return null;
  return {
    elements: pack.elements,
    _overpassSource: 'bundled-osm-landmark-pack',
    _overpassEndpoint: String(data.source || 'OpenStreetMap'),
    _landmarkPackId: String(pack.id || ''),
    _landmarkSchemaVersion: BUNDLED_LANDMARK_SCHEMA_VERSION,
    _landmarkLicense: String(data.license || '')
  };
}

export { BUNDLED_LANDMARK_SCHEMA_VERSION };
