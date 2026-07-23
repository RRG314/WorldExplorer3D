import { fetchOvertureThemeTile } from './overture-tile-source.js?v=3';

const STREAMING_THEMES = Object.freeze(['transportation', 'buildings', 'base']);

function parsed(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed || !/^[\[{]/.test(trimmed)) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function scalar(value) {
  const normalized = parsed(value);
  if (normalized === null || normalized === undefined) return '';
  if (typeof normalized === 'string' || typeof normalized === 'number') return normalized;
  if (Array.isArray(normalized)) {
    for (const item of normalized) {
      const candidate = scalar(item);
      if (candidate !== '') return candidate;
    }
    return '';
  }
  if (typeof normalized === 'object') {
    for (const key of ['primary', 'value', 'name', 'surface', 'class', 'subtype', 'type']) {
      const candidate = scalar(normalized[key]);
      if (candidate !== '') return candidate;
    }
    for (const candidateValue of Object.values(normalized)) {
      const candidate = scalar(candidateValue);
      if (candidate !== '') return candidate;
    }
  }
  return '';
}

function first(properties, keys, fallback = '') {
  for (const key of keys) {
    const value = scalar(properties?.[key]);
    if (value !== '') return value;
  }
  return fallback;
}

function flag(properties, keys) {
  for (const key of keys) {
    const value = parsed(properties?.[key]);
    if (value === true || value === 1) return true;
    if (typeof value === 'string' && /^(?:yes|true|1)$/i.test(value.trim())) return true;
    if (Array.isArray(value) && value.some((item) => flag({ item }, ['item']))) return true;
    if (value && typeof value === 'object' && Object.values(value).some((item) => flag({ item }, ['item']))) return true;
  }
  return false;
}

function geometryKind(geometry) {
  const type = String(geometry?.type || '');
  if (type.includes('Polygon')) return 'polygon';
  if (type.includes('LineString')) return 'line';
  return '';
}

function featureName(properties) {
  return String(first(properties, ['@name', 'name', 'names'], '') || '');
}

function normalizeRoad(properties = {}) {
  const subtype = String(first(properties, ['subtype', 'type'], 'road')).toLowerCase();
  const roadClass = String(first(properties, ['class', 'subclass'], subtype === 'road' ? 'road' : subtype)).toLowerCase();
  const isRoad = subtype === 'road' || /road|street|motorway|trunk|primary|secondary|tertiary|residential|service|track|path/.test(roadClass);
  return {
    ...properties,
    kind: roadClass || 'road',
    name: featureName(properties),
    rail: !isRoad,
    bridge: flag(properties, ['bridge', 'is_bridge']) || /bridge/.test(String(properties.structure || '')),
    tunnel: flag(properties, ['tunnel', 'is_tunnel']) || /tunnel/.test(String(properties.structure || '')),
    layer: first(properties, ['layer', 'level'], ''),
    oneway: flag(properties, ['oneway', 'is_oneway']),
    surface: String(first(properties, ['surface', 'road_surface'], '')).toLowerCase(),
    speed_limit: first(properties, ['speed_limit', 'speed_limits'], '')
  };
}

function normalizeBuilding(properties = {}, layerName = 'building') {
  return {
    ...properties,
    kind: String(first(properties, ['subtype', 'class'], 'yes')).toLowerCase(),
    name: featureName(properties),
    height: first(properties, ['height'], ''),
    levels: first(properties, ['num_floors', 'levels'], ''),
    min_height: first(properties, ['min_height'], ''),
    building_id: first(properties, ['building_id', 'buildingId'], ''),
    is_part: layerName === 'building_part'
  };
}

function normalizedLandKind(properties = {}) {
  const value = String(first(properties, ['subtype', 'class', 'type'], '')).toLowerCase();
  const aliases = {
    agriculture: 'farmland',
    agricultural: 'farmland',
    barren: 'bare_rock',
    built_up: '',
    cropland: 'farmland',
    developed: '',
    forest: 'forest',
    grass: 'grass',
    grassland: 'grassland',
    horticulture: 'orchard',
    mangrove: 'wetland',
    managed: 'grass',
    park: 'park',
    recreation: 'recreation_ground',
    sand: 'sand',
    scrub: 'scrub',
    shrub: 'scrub',
    snow: 'bare_rock',
    urban: '',
    wetland: 'wetland',
    wood: 'wood'
  };
  return Object.hasOwn(aliases, value) ? aliases[value] : value;
}

function normalizeLand(properties = {}) {
  const kind = normalizedLandKind(properties);
  return { ...properties, kind, landuse: kind, natural: kind };
}

function normalizeWater(properties = {}) {
  const kind = String(first(properties, ['subtype', 'class', 'type'], 'water')).toLowerCase();
  return {
    ...properties,
    kind,
    waterway: kind,
    width: first(properties, ['width'], ''),
    navigable: flag(properties, ['navigable'])
  };
}

function wrappedFeature(rawFeature, tileRecord, normalize) {
  return {
    id: rawFeature.id,
    toGeoJSON() {
      const geojson = rawFeature.toGeoJSON(tileRecord.x, tileRecord.y, tileRecord.z);
      return {
        ...geojson,
        properties: normalize(geojson.properties || {}, geojson)
      };
    }
  };
}

function adaptedLayer(entries) {
  return {
    length: entries.length,
    feature(index) {
      return entries[index] || null;
    }
  };
}

function appendLayer(target, record, sourceLayerName, normalize, filter = null) {
  const layer = record?.tile?.layers?.[sourceLayerName];
  if (!layer || !Number.isFinite(layer.length)) return;
  for (let index = 0; index < layer.length; index += 1) {
    const rawFeature = layer.feature(index);
    if (!rawFeature || typeof rawFeature.toGeoJSON !== 'function') continue;
    const wrapped = wrappedFeature(rawFeature, record, normalize);
    if (filter) {
      const geojson = wrapped.toGeoJSON();
      if (!filter(geojson, rawFeature)) continue;
    }
    target.push(wrapped);
  }
}

function buildAdaptedLayers(records) {
  const transportation = records.transportation;
  const buildings = records.buildings;
  const base = records.base;
  const roads = [];
  const buildingFeatures = [];
  const land = [];
  const ocean = [];
  const waterPolygons = [];
  const waterLines = [];

  appendLayer(roads, transportation, 'segment', normalizeRoad, (geojson) => geometryKind(geojson.geometry) === 'line');

  const buildingParts = [];
  appendLayer(buildingParts, buildings, 'building_part', (properties) => normalizeBuilding(properties, 'building_part'));
  const parentIdsWithParts = new Set(buildingParts.map((feature) => String(feature.toGeoJSON().properties.building_id || '')).filter(Boolean));
  appendLayer(buildingFeatures, buildings, 'building', (properties) => normalizeBuilding(properties, 'building'), (geojson) => {
    const properties = geojson.properties || {};
    const id = String(first(properties, ['id', '@id'], ''));
    return !(flag(properties, ['has_parts']) && parentIdsWithParts.has(id));
  });
  buildingFeatures.push(...buildingParts);

  for (const layerName of ['land_cover', 'land_use']) {
    appendLayer(land, base, layerName, normalizeLand, (geojson) =>
      geometryKind(geojson.geometry) === 'polygon' && Boolean(geojson.properties?.kind)
    );
  }
  appendLayer(waterPolygons, base, 'water', normalizeWater, (geojson) => {
    if (geometryKind(geojson.geometry) !== 'polygon') return false;
    const kind = String(geojson.properties?.kind || '');
    if (/ocean|sea/.test(kind)) {
      ocean.push(wrappedFeature({
        id: geojson.id,
        toGeoJSON: () => geojson
      }, { x: 0, y: 0, z: 0 }, (properties) => properties));
      return false;
    }
    return true;
  });
  appendLayer(waterLines, base, 'water', normalizeWater, (geojson) => geometryKind(geojson.geometry) === 'line');

  return {
    streets: adaptedLayer(roads),
    buildings: adaptedLayer(buildingFeatures),
    land: adaptedLayer(land),
    ocean: adaptedLayer(ocean),
    water_polygons: adaptedLayer(waterPolygons),
    water_lines: adaptedLayer(waterLines)
  };
}

async function fetchOvertureStreamingTile(z, x, y, options = {}) {
  const settled = await Promise.all(STREAMING_THEMES.map(async (theme) => [
    theme,
    await fetchOvertureThemeTile(theme, z, x, y, options)
  ]));
  const records = Object.fromEntries(settled);
  return {
    tile: { layers: buildAdaptedLayers(records) },
    source: 'overture-pmtiles',
    release: records.transportation?.release || records.buildings?.release || records.base?.release || '',
    z,
    x,
    y
  };
}

export {
  STREAMING_THEMES,
  buildAdaptedLayers,
  fetchOvertureStreamingTile,
  normalizeBuilding,
  normalizeLand,
  normalizeRoad,
  normalizeWater
};
