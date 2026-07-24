import { fetchShortbreadTile } from './shortbread-source.js?v=13';

const OSM_STREAMING_RELEASE = 'shortbread_v1';

function wrappedFeature(record, layerName, feature, index) {
  const sourceId = feature?.id ?? index;
  return {
    id: `osm:${layerName}:${record.z}/${record.x}/${record.y}:${sourceId}`,
    toGeoJSON() {
      return feature.toGeoJSON(record.x, record.y, record.z);
    }
  };
}

function collectFeatures(record, layerNames, accept = null) {
  const features = [];
  for (let layerIndex = 0; layerIndex < layerNames.length; layerIndex += 1) {
    const layerName = layerNames[layerIndex];
    const layer = record?.tile?.layers?.[layerName];
    const count = Math.max(0, Number(layer?.length) || 0);
    for (let index = 0; index < count; index += 1) {
      const feature = layer.feature(index);
      if (!feature || typeof feature.toGeoJSON !== 'function') continue;
      const wrapped = wrappedFeature(record, layerName, feature, index);
      if (accept && !accept(wrapped.toGeoJSON(), layerName)) continue;
      features.push(wrapped);
    }
  }
  return {
    length: features.length,
    feature(index) {
      return features[index] || null;
    }
  };
}

function waterIsOcean(geojson) {
  const kind = String(
    geojson?.properties?.kind ||
    geojson?.properties?.natural ||
    geojson?.properties?.water ||
    ''
  ).toLowerCase();
  return kind === 'ocean' || kind === 'sea';
}

function buildOsmStreamingLayers(record) {
  if (!record?.tile?.layers) throw new TypeError('OSM streaming tiles require decoded Shortbread layers.');
  return {
    streets: collectFeatures(record, ['streets']),
    street_labels: collectFeatures(record, ['street_labels']),
    buildings: collectFeatures(record, ['buildings']),
    land: collectFeatures(record, ['land', 'sites']),
    ocean: collectFeatures(record, ['water_polygons'], waterIsOcean),
    water_polygons: collectFeatures(record, ['water_polygons'], (geojson) => !waterIsOcean(geojson)),
    water_lines: collectFeatures(record, ['water_lines'])
  };
}

async function fetchOsmStreamingTile(z, x, y, options = {}) {
  const decoded = await fetchShortbreadTile(z, x, y, options);
  if (options.signal?.aborted) throw new DOMException('OSM streaming tile aborted', 'AbortError');
  return {
    tile: { layers: buildOsmStreamingLayers(decoded) },
    source: 'osm-shortbread',
    release: OSM_STREAMING_RELEASE,
    z,
    x,
    y
  };
}

export {
  OSM_STREAMING_RELEASE,
  buildOsmStreamingLayers,
  fetchOsmStreamingTile,
  waterIsOcean
};
