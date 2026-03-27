const EARTHQUAKE_FEED_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';
const EARTHQUAKE_REFRESH_MS = 5 * 60 * 1000;

let _earthquakePromise = null;
let _lastEarthquakeAt = 0;
let _earthquakes = [];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatRelativeAge(timestampMs) {
  if (!Number.isFinite(timestampMs)) return 'Unknown time';
  const diffMs = Math.max(0, Date.now() - timestampMs);
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function formatDepthLabel(depthKm) {
  if (!Number.isFinite(depthKm)) return 'Depth unknown';
  return `${depthKm.toFixed(depthKm >= 100 ? 0 : 1)} km depth`;
}

function magnitudeTier(mag) {
  if (!Number.isFinite(mag)) return 'minor';
  if (mag >= 6.5) return 'major';
  if (mag >= 5) return 'strong';
  if (mag >= 4) return 'moderate';
  return 'minor';
}

function mapEarthquakeFeature(feature) {
  const coords = Array.isArray(feature?.geometry?.coordinates) ? feature.geometry.coordinates : [];
  const properties = feature?.properties || {};
  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  const depthKm = Number(coords[2]);
  const magnitude = Number(properties.mag);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    id: String(feature.id || properties.code || `${lat.toFixed(3)}:${lon.toFixed(3)}`),
    title: String(properties.title || '').trim() || `M ${Number.isFinite(magnitude) ? magnitude.toFixed(1) : '?'} earthquake`,
    place: String(properties.place || '').trim() || 'Open ocean',
    magnitude: Number.isFinite(magnitude) ? magnitude : null,
    significance: Number(properties.sig || 0),
    depthKm: Number.isFinite(depthKm) ? depthKm : null,
    lat,
    lon,
    url: String(properties.url || '').trim(),
    detailUrl: String(properties.detail || '').trim(),
    tsunami: Number(properties.tsunami || 0) === 1,
    alert: String(properties.alert || '').trim(),
    timeMs: Number(properties.time || 0),
    updatedMs: Number(properties.updated || 0),
    type: String(properties.type || 'earthquake'),
    magnitudeTier: magnitudeTier(magnitude),
    ageLabel: formatRelativeAge(Number(properties.time || 0)),
    depthLabel: formatDepthLabel(depthKm)
  };
}

async function refreshEarthquakes(force = false) {
  const now = Date.now();
  if (!force && _earthquakes.length && (now - _lastEarthquakeAt) < EARTHQUAKE_REFRESH_MS) {
    return _earthquakes;
  }
  if (_earthquakePromise && !force) return _earthquakePromise;
  _earthquakePromise = fetch(EARTHQUAKE_FEED_URL).then(async (response) => {
    if (!response.ok) throw new Error(`earthquake_feed_${response.status}`);
    return await response.json();
  }).then((payload) => {
    const features = Array.isArray(payload?.features) ? payload.features : [];
    const items = features.map(mapEarthquakeFeature).filter(Boolean);
    items.sort((a, b) => {
      const magDelta = (Number(b.magnitude) || 0) - (Number(a.magnitude) || 0);
      if (Math.abs(magDelta) > 0.01) return magDelta;
      return (Number(b.timeMs) || 0) - (Number(a.timeMs) || 0);
    });
    _earthquakes = items.slice(0, 140);
    _lastEarthquakeAt = Date.now();
    return _earthquakes;
  }).finally(() => {
    _earthquakePromise = null;
  });
  return _earthquakePromise;
}

function buildEarthquakeReplayProfile(event) {
  const magnitude = Number(event?.magnitude || 0);
  const significance = Number(event?.significance || 0);
  const amplitude = clamp(0.012 + Math.max(0, magnitude - 3) * 0.01 + significance / 10000, 0.012, 0.09);
  const durationMs = clamp(2400 + magnitude * 1200 + significance * 2, 2500, 9500);
  const frequency = clamp(7 + magnitude * 1.3, 7, 16);
  return {
    amplitude,
    durationMs,
    frequency
  };
}

export {
  buildEarthquakeReplayProfile,
  formatRelativeAge,
  refreshEarthquakes
};
