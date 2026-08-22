const INDEX_URL = new URL('../../data/buildings/index.json', import.meta.url);
const BUNDLED_BUILDING_SCHEMA_VERSION = 1;

let indexPromise = null;
const packPromises = new Map();

async function fetchBundledJson(url, label, options = {}) {
  const fetchImpl = typeof options.fetchImpl === 'function' ? options.fetchImpl : globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new TypeError(`${label}: fetch unavailable`);
  const response = await fetchImpl(url, { cache: 'default', signal: options.signal });
  if (!response?.ok) throw new Error(`${label}: HTTP ${response?.status || 'unknown'}`);
  return response.json();
}

function validateIndex(index) {
  if (Number(index?.schemaVersion) !== BUNDLED_BUILDING_SCHEMA_VERSION) {
    throw new Error('Preset building metadata index: unsupported schema');
  }
  if (!Array.isArray(index.packs)) throw new Error('Preset building metadata index: packs must be an array');
  return index;
}

function validatePack(pack, expectedId) {
  if (Number(pack?.schemaVersion) !== BUNDLED_BUILDING_SCHEMA_VERSION) {
    throw new Error(`Preset building metadata ${expectedId}: unsupported schema`);
  }
  if (String(pack?.id || '') !== String(expectedId || '')) {
    throw new Error(`Preset building metadata ${expectedId}: pack identity mismatch`);
  }
  if (!Array.isArray(pack.elements)) {
    throw new Error(`Preset building metadata ${expectedId}: elements must be an array`);
  }
  return pack;
}

function loadIndex(options = {}) {
  const fixtureFetch = typeof options.fetchImpl === 'function' && options.fetchImpl !== globalThis.fetch;
  if (fixtureFetch) {
    return fetchBundledJson(INDEX_URL, 'Preset building metadata index', options).then(validateIndex);
  }
  if (!indexPromise) {
    indexPromise = fetchBundledJson(INDEX_URL, 'Preset building metadata index', options)
      .then(validateIndex)
      .catch((error) => {
        indexPromise = null;
        throw error;
      });
  }
  return indexPromise;
}

function locationDistanceDegrees(pack, lat, lon) {
  const centerLat = Number(pack?.center?.lat);
  const centerLon = Number(pack?.center?.lon);
  if (![centerLat, centerLon, lat, lon].every(Number.isFinite)) return Infinity;
  const lonScale = Math.max(0.25, Math.cos(centerLat * Math.PI / 180));
  return Math.hypot(lat - centerLat, (lon - centerLon) * lonScale);
}

function locationMatches(pack, lat, lon, coverageRadiusDegrees = 0) {
  const packRadius = Math.max(0.001, Number(pack?.matchRadiusDegrees) || 0.006);
  const publicationRadius = Math.max(0, Number(coverageRadiusDegrees) || 0);
  return locationDistanceDegrees(pack, lat, lon) <= packRadius + publicationRadius;
}

function loadPack(id, options = {}) {
  const fixtureFetch = typeof options.fetchImpl === 'function' && options.fetchImpl !== globalThis.fetch;
  if (fixtureFetch) {
    return fetchBundledJson(
      new URL(`${encodeURIComponent(id)}.json`, INDEX_URL),
      `Preset building metadata ${id}`,
      options
    ).then((pack) => validatePack(pack, id));
  }
  if (packPromises.has(id)) return packPromises.get(id);
  const promise = fetchBundledJson(
    new URL(`${encodeURIComponent(id)}.json`, INDEX_URL),
    `Preset building metadata ${id}`,
    options
  )
    .then((pack) => validatePack(pack, id))
    .catch((error) => {
      packPromises.delete(id);
      throw error;
    });
  packPromises.set(id, promise);
  return promise;
}

export async function fetchBundledBuildingMetadata(options = {}) {
  const lat = Number(options.lat);
  const lon = Number(options.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const index = await loadIndex(options);
  const key = String(options.locationKey || '').trim().toLowerCase();
  const coverageRadiusDegrees = Math.max(0, Number(options.coverageRadiusDegrees) || 0);
  const packs = index?.packs || [];
  const keyedRecord = key && key !== 'custom'
    ? packs.find((pack) => String(pack.id || '') === key)
    : null;
  const record = keyedRecord || packs
    .filter((pack) => locationMatches(pack, lat, lon, coverageRadiusDegrees))
    .sort((left, right) =>
      locationDistanceDegrees(left, lat, lon) - locationDistanceDegrees(right, lat, lon) ||
      String(left?.id || '').localeCompare(String(right?.id || ''))
    )[0];
  if (!record?.id) return null;

  const pack = await loadPack(String(record.id), options);
  return {
    elements: pack.elements,
    _overpassSource: 'bundled-osm-building-metadata',
    _overpassEndpoint: String(pack.source || index.source || 'OpenStreetMap'),
    _buildingMetadataPackId: String(pack.id || record.id),
    _buildingMetadataSchemaVersion: BUNDLED_BUILDING_SCHEMA_VERSION,
    _buildingMetadataLicense: String(pack.license || index.license || ''),
    _buildingMetadataSelection: {
      authority: 'building-publication-coverage',
      coverageRadiusDegrees,
      packMatchRadiusDegrees: Math.max(0.001, Number(record.matchRadiusDegrees) || 0.006),
      distanceDegrees: locationDistanceDegrees(record, lat, lon),
      reason: keyedRecord ? 'selected-location-identity' : 'publication-coverage-intersection'
    }
  };
}

export { BUNDLED_BUILDING_SCHEMA_VERSION };
