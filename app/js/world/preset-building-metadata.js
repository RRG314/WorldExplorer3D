const INDEX_URL = new URL('../../data/buildings/index.json', import.meta.url);

let indexPromise = null;
const packPromises = new Map();

function loadIndex() {
  if (!indexPromise) {
    indexPromise = fetch(INDEX_URL, { cache: 'default' })
      .then((response) => {
        if (!response.ok) throw new Error(`Preset building metadata index: HTTP ${response.status}`);
        return response.json();
      })
      .catch((error) => {
        indexPromise = null;
        throw error;
      });
  }
  return indexPromise;
}

function locationMatches(pack, lat, lon) {
  const centerLat = Number(pack?.center?.lat);
  const centerLon = Number(pack?.center?.lon);
  const radius = Math.max(0.001, Number(pack?.matchRadiusDegrees) || 0.006);
  if (![centerLat, centerLon, lat, lon].every(Number.isFinite)) return false;
  const lonScale = Math.max(0.25, Math.cos(centerLat * Math.PI / 180));
  return Math.hypot(lat - centerLat, (lon - centerLon) * lonScale) <= radius;
}

function loadPack(id) {
  if (packPromises.has(id)) return packPromises.get(id);
  const promise = fetch(new URL(`${encodeURIComponent(id)}.json`, INDEX_URL), { cache: 'default' })
    .then((response) => {
      if (!response.ok) throw new Error(`Preset building metadata ${id}: HTTP ${response.status}`);
      return response.json();
    })
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
  const index = await loadIndex();
  const key = String(options.locationKey || '').trim().toLowerCase();
  const record = (index?.packs || []).find((pack) =>
    (key && key !== 'custom' && String(pack.id || '') === key) || locationMatches(pack, lat, lon)
  );
  if (!record?.id) return null;

  const pack = await loadPack(String(record.id));
  if (!Array.isArray(pack?.elements)) return null;
  return {
    elements: pack.elements,
    _overpassSource: 'bundled-osm-building-metadata',
    _overpassEndpoint: String(pack.source || index.source || 'OpenStreetMap'),
    _buildingMetadataPackId: String(pack.id || record.id)
  };
}
