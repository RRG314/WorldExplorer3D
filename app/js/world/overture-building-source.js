import {
  fetchShortbreadBuildingData,
  getVectorTileLib,
  vectorTileRangeForBounds
} from "./shortbread-source.js?v=4";

const OVERTURE_BUILDING_ZOOM = 14;
const OVERTURE_FETCH_TIMEOUT_MS = 10000;
const OVERTURE_RELEASE = '2026-06-17.0';
const DEFAULT_ARCHIVE_URL =
  `https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/${OVERTURE_RELEASE}/buildings.pmtiles`;

let pmtilesLibPromise = null;
let archive = null;
let archiveUrl = '';

function configuredArchiveUrl() {
  const configured =
    globalThis.WORLD_EXPLORER_CONFIG?.overtureBuildingsPmtilesUrl ||
    globalThis.document?.querySelector?.('meta[name="worldexplorer-overture-buildings"]')?.content;
  return String(configured || DEFAULT_ARCHIVE_URL).trim();
}

async function getArchive() {
  const url = configuredArchiveUrl();
  if (archive && archiveUrl === url) return archive;
  if (!pmtilesLibPromise) {
    pmtilesLibPromise = import('https://cdn.jsdelivr.net/npm/pmtiles@4.4.1/+esm')
      .catch((error) => {
        pmtilesLibPromise = null;
        throw error;
      });
  }
  const { PMTiles } = await pmtilesLibPromise;
  archive = new PMTiles(url);
  archiveUrl = url;
  return archive;
}

function geometryParts(geometry) {
  if (geometry?.type === 'Polygon') {
    return geometry.coordinates?.[0] ? [geometry.coordinates[0]] : [];
  }
  if (geometry?.type === 'MultiPolygon') {
    return (geometry.coordinates || [])
      .map((polygon) => polygon?.[0])
      .filter((ring) => Array.isArray(ring));
  }
  return [];
}

function normalizedValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function firstValue(properties, keys) {
  for (const key of keys) {
    const value = normalizedValue(properties?.[key]);
    if (value) return value;
  }
  return '';
}

function featureName(properties = {}) {
  const direct = firstValue(properties, ['@name', 'name']);
  if (direct) return direct;
  const names = properties.names;
  if (!names || typeof names !== 'object') return '';
  return firstValue(names, ['primary', 'common']);
}

function featureTags(layerName, properties = {}, tileIdentity = '') {
  const isPart = layerName === 'building_part';
  const stableId = firstValue(properties, ['id', '@id']);
  const parentId = firstValue(properties, ['building_id', 'buildingId']);
  const buildingType = firstValue(properties, ['subtype', 'class']) || 'yes';
  const tags = isPart ? { 'building:part': buildingType } : { building: buildingType };
  const mappings = [
    ['height', ['height']],
    ['building:levels', ['num_floors']],
    ['min_height', ['min_height']],
    ['building:min_level', ['min_floor']],
    ['roof:shape', ['roof_shape']],
    ['roof:height', ['roof_height']],
    ['roof:direction', ['roof_direction']],
    ['roof:orientation', ['roof_orientation']],
    ['building:colour', ['facade_color', 'facade_colour']],
    ['building:material', ['facade_material']],
    ['roof:colour', ['roof_color', 'roof_colour']],
    ['roof:material', ['roof_material']]
  ];
  for (const [tagName, propertyNames] of mappings) {
    const value = firstValue(properties, propertyNames);
    if (value) tags[tagName] = value;
  }
  const name = featureName(properties);
  if (name) tags.name = name;
  tags._sourceFeatureId = `overture:${stableId || tileIdentity}`;
  tags._geometrySource = 'overture';
  tags._heightSource = firstValue(properties, ['height_source']) || '';
  tags._overtureBuildingId = isPart ? parentId : stableId;
  tags._overtureFeatureId = stableId;
  tags._overtureParentBuildingId = parentId;
  tags._overtureHasParts = properties.has_parts === true || properties.has_parts === 'true' ? 'yes' : '';
  tags._buildingMetadataSourceId = stableId || parentId || tileIdentity;
  return tags;
}

function partIntersectsBounds(coords, bounds) {
  if (!bounds || !Array.isArray(coords) || coords.length === 0) return true;
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const coordinate of coords) {
    const lon = Number(coordinate?.[0]);
    const lat = Number(coordinate?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return minLon <= bounds.maxLon && maxLon >= bounds.minLon &&
    minLat <= bounds.maxLat && maxLat >= bounds.minLat;
}

function geometrySignature(layerName, stableId, coords) {
  const first = coords?.[0] || [];
  const last = coords?.[coords.length - 1] || [];
  return [
    layerName,
    stableId,
    coords?.length || 0,
    Number(first[0]).toFixed(7),
    Number(first[1]).toFixed(7),
    Number(last[0]).toFixed(7),
    Number(last[1]).toFixed(7)
  ].join(':');
}

function convertTilesToElements(tiles, bounds) {
  const elements = [];
  const nodesByCoordinate = new Map();
  const signatures = new Set();
  const parentIdsWithParts = new Set();
  const candidates = [];
  let nextNodeId = -1;
  let nextWayId = -1;

  const nodeIdFor = (coordinate) => {
    const lon = Number(coordinate?.[0]);
    const lat = Number(coordinate?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const key = `${lat.toFixed(7)}:${lon.toFixed(7)}`;
    if (nodesByCoordinate.has(key)) return nodesByCoordinate.get(key);
    const id = nextNodeId--;
    nodesByCoordinate.set(key, id);
    elements.push({ type: 'node', id, lat, lon });
    return id;
  };

  for (const { tile, z, x, y } of tiles) {
    for (const layerName of ['building', 'building_part']) {
      const layer = tile.layers[layerName];
      if (!layer || !Number.isFinite(layer.length)) continue;
      for (let index = 0; index < layer.length; index++) {
        const feature = layer.feature(index);
        if (!feature || typeof feature.toGeoJSON !== 'function') continue;
        const geojson = feature.toGeoJSON(x, y, z);
        const properties = geojson.properties || {};
        const stableId = firstValue(properties, ['id', '@id']) || String(feature.id ?? index);
        const parentId = firstValue(properties, ['building_id', 'buildingId']);
        if (layerName === 'building_part' && parentId) parentIdsWithParts.add(parentId);
        const rings = geometryParts(geojson.geometry);
        for (let partIndex = 0; partIndex < rings.length; partIndex++) {
          const coords = rings[partIndex];
          if (!Array.isArray(coords) || coords.length < 4 || !partIntersectsBounds(coords, bounds)) continue;
          const signature = geometrySignature(layerName, stableId, coords);
          if (signatures.has(signature)) continue;
          signatures.add(signature);
          candidates.push({
            coords,
            layerName,
            properties,
            stableId,
            tileIdentity: `${z}:${x}:${y}:${feature.id ?? index}:${partIndex}`
          });
        }
      }
    }
  }

  let suppressedParents = 0;
  for (const candidate of candidates) {
    const hasParts = candidate.properties.has_parts === true || candidate.properties.has_parts === 'true';
    if (
      candidate.layerName === 'building' &&
      hasParts &&
      parentIdsWithParts.has(candidate.stableId)
    ) {
      suppressedParents += 1;
      continue;
    }
    const nodeIds = candidate.coords.map(nodeIdFor).filter(Number.isFinite);
    if (nodeIds.length < 4) continue;
    if (nodeIds[0] !== nodeIds[nodeIds.length - 1]) nodeIds.push(nodeIds[0]);
    elements.push({
      type: 'way',
      id: nextWayId--,
      nodes: nodeIds,
      tags: featureTags(
        candidate.layerName,
        candidate.properties,
        candidate.tileIdentity
      )
    });
  }

  return {
    elements,
    parentIdsWithParts: parentIdsWithParts.size,
    suppressedParents
  };
}

function orderedTileCoordinates(range, centerLat, centerLon) {
  const centerRange = vectorTileRangeForBounds(
    centerLat,
    centerLon,
    centerLat,
    centerLon,
    OVERTURE_BUILDING_ZOOM
  );
  const centerX = centerRange.xMin;
  const centerY = centerRange.yMin;
  const coordinates = [];
  for (let x = range.xMin; x <= range.xMax; x++) {
    for (let y = range.yMin; y <= range.yMax; y++) coordinates.push({ x, y });
  }
  coordinates.sort((a, b) =>
    Math.hypot(a.x - centerX, a.y - centerY) - Math.hypot(b.x - centerX, b.y - centerY)
  );
  return coordinates;
}

async function fetchArchiveTile(pmtiles, z, x, y) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), OVERTURE_FETCH_TIMEOUT_MS);
  try {
    const result = await pmtiles.getZxy(z, x, y, controller.signal);
    if (!result?.data) return null;
    const { Pbf, VectorTile } = await getVectorTileLib();
    return { tile: new VectorTile(new Pbf(result.data)), z, x, y };
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export async function fetchOvertureBuildingData(options = {}) {
  const lat = Number(options.lat);
  const lon = Number(options.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('Overture building location is invalid.');
  const radius = Math.max(0.004, Math.min(0.04, Number(options.radius) || 0.012));
  const bounds = {
    minLat: lat - radius,
    minLon: lon - radius,
    maxLat: lat + radius,
    maxLon: lon + radius
  };
  const range = vectorTileRangeForBounds(
    bounds.minLat,
    bounds.minLon,
    bounds.maxLat,
    bounds.maxLon,
    OVERTURE_BUILDING_ZOOM
  );
  const pmtiles = await getArchive();
  const coordinates = orderedTileCoordinates(range, lat, lon);
  const settled = await Promise.allSettled(
    coordinates.map(({ x, y }) => fetchArchiveTile(pmtiles, OVERTURE_BUILDING_ZOOM, x, y))
  );
  const tiles = settled
    .filter((entry) => entry.status === 'fulfilled' && entry.value)
    .map((entry) => entry.value);
  if (tiles.length === 0) {
    const reason = settled.find((entry) => entry.status === 'rejected')?.reason;
    throw new Error(`Overture building coverage unavailable: ${reason?.message || reason || 'no tiles'}`);
  }
  const converted = convertTilesToElements(tiles, bounds);
  const ways = converted.elements.filter((element) => element.type === 'way');
  const parts = ways.filter((way) => way.tags?.['building:part']);
  const mappedHeights = ways.filter((way) => way.tags?.height || way.tags?.['building:levels']);
  const mappedRoofs = ways.filter((way) => way.tags?.['roof:shape']);
  return {
    elements: converted.elements,
    _overpassSource: 'overture-buildings-pmtiles',
    _overpassEndpoint: configuredArchiveUrl(),
    _overpassCacheAgeMs: 0,
    _overtureBuildings: {
      release: OVERTURE_RELEASE,
      zoom: OVERTURE_BUILDING_ZOOM,
      loadedTiles: tiles.length,
      requestedTiles: coordinates.length,
      radiusDegrees: radius,
      approximateRadiusMeters: Math.round(radius * 111320),
      buildingsAndParts: ways.length,
      parts: parts.length,
      mappedDimensions: mappedHeights.length,
      mappedRoofs: mappedRoofs.length,
      parentIdsWithParts: converted.parentIdsWithParts,
      suppressedParents: converted.suppressedParents
    }
  };
}

export async function fetchGlobalBuildingData(options = {}, onFallback = null) {
  try {
    return await fetchOvertureBuildingData(options);
  } catch (error) {
    if (typeof onFallback === 'function') onFallback(error);
    return fetchShortbreadBuildingData(options);
  }
}

export {
  OVERTURE_BUILDING_ZOOM,
  OVERTURE_RELEASE
};
