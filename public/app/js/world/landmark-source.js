const LANDMARK_PACK_URL = new URL('../../data/featured-landmarks.json', import.meta.url);

let landmarkPackPromise = null;

function loadLandmarkPacks() {
  if (landmarkPackPromise) return landmarkPackPromise;
  landmarkPackPromise = fetch(LANDMARK_PACK_URL, { cache: 'default' })
    .then((response) => {
      if (!response.ok) throw new Error(`Featured landmark data: HTTP ${response.status}`);
      return response.json();
    })
    .catch((err) => {
      landmarkPackPromise = null;
      throw err;
    });
  return landmarkPackPromise;
}

function locationMatchesPack(pack, lat, lon) {
  const centerLat = Number(pack?.center?.lat);
  const centerLon = Number(pack?.center?.lon);
  const radius = Math.max(0.001, Number(pack?.radiusDegrees) || 0.01);
  if (![centerLat, centerLon, lat, lon].every(Number.isFinite)) return false;
  const lonScale = Math.max(0.25, Math.cos(centerLat * Math.PI / 180));
  return Math.hypot(lat - centerLat, (lon - centerLon) * lonScale) <= radius;
}

export async function fetchBundledLandmarkData(options = {}) {
  const lat = Number(options.lat);
  const lon = Number(options.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const data = await loadLandmarkPacks();
  const pack = (data?.packs || []).find((candidate) => locationMatchesPack(candidate, lat, lon));
  if (!pack || !Array.isArray(pack.elements)) return null;
  return {
    elements: pack.elements,
    _overpassSource: 'bundled-osm-landmark-pack',
    _overpassEndpoint: String(data.source || 'OpenStreetMap'),
    _landmarkPackId: String(pack.id || '')
  };
}
