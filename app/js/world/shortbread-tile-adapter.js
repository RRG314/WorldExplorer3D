function normalizedText(value = '') {
  return String(value ?? '').trim();
}

function shortbreadTransportTags(properties = {}) {
  const kind = normalizedText(properties.kind).toLowerCase();
  if (!kind) return null;
  if (properties.rail === true) {
    return {
      railway: kind,
      bridge: properties.bridge ? 'yes' : '',
      tunnel: properties.tunnel ? 'yes' : '',
      layer: properties.bridge ? '1' : properties.tunnel ? '-1' : '',
      name: normalizedText(properties.name),
      surface: normalizedText(properties.surface),
      width: normalizedText(properties.width)
    };
  }

  const highway = properties.link === true && !kind.endsWith('_link') ? `${kind}_link` : kind;
  return {
    highway,
    bridge: properties.bridge ? 'yes' : '',
    tunnel: properties.tunnel ? 'yes' : '',
    layer: properties.bridge ? '1' : properties.tunnel ? '-1' : '',
    oneway: properties.oneway ? (properties.oneway_reverse ? '-1' : 'yes') : normalizedText(properties.oneway),
    access: normalizedText(properties.access),
    bicycle: normalizedText(properties.bicycle),
    foot: normalizedText(properties.foot),
    footway: normalizedText(properties.footway),
    horse: normalizedText(properties.horse),
    lanes: normalizedText(properties.lanes),
    maxspeed: normalizedText(properties.maxspeed),
    name: normalizedText(properties.name),
    ref: normalizedText(properties.ref),
    service: normalizedText(properties.service),
    sidewalk: normalizedText(properties.sidewalk),
    surface: normalizedText(properties.surface),
    tracktype: normalizedText(properties.tracktype),
    width: normalizedText(properties.width)
  };
}

function adaptShortbreadTransportTile(tileRecord = {}) {
  const { tile, z, x, y } = tileRecord;
  if (!tile?.layers || !Number.isSafeInteger(z) || !Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
    throw new TypeError('A decoded Shortbread tile record with integer z/x/y coordinates is required.');
  }

  const layer = tile.layers.streets;
  if (!layer || !Number.isFinite(layer.length)) return [];
  const features = [];
  for (let index = 0; index < layer.length; index += 1) {
    const feature = layer.feature(index);
    if (!feature || typeof feature.toGeoJSON !== 'function') continue;
    const geojson = feature.toGeoJSON(x, y, z);
    const tags = shortbreadTransportTags(geojson?.properties);
    if (!tags || !geojson?.geometry) continue;
    features.push({
      sourceFeatureId: `shortbread:streets:${z}/${x}/${y}:${feature.id ?? index}`,
      tags,
      geometry: geojson.geometry
    });
  }
  return features;
}

export { adaptShortbreadTransportTile, shortbreadTransportTags };
