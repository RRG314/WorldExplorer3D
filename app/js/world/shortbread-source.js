import { createRoadNameResolver } from './shortbread-road-labels.js?v=1';
import { runBoundedProviderBatch } from '../earth-core/bounded-provider-batch.js?v=1';

const SHORTBREAD_ZOOM = 14;
const SHORTBREAD_FETCH_TIMEOUT_MS = 8000;
const SHORTBREAD_TILE_CONCURRENCY = 8;
const DEFAULT_TILE_TEMPLATE =
  'https://vector.openstreetmap.org/shortbread_v1/{z}/{x}/{y}.mvt';

let vectorTileLibPromise = null;

function tileTemplate() {
  const configured =
    globalThis.WORLD_EXPLORER_CONFIG?.osmVectorTileUrl ||
    globalThis.document?.querySelector?.('meta[name="worldexplorer-osm-vector-tiles"]')?.content;
  return String(configured || DEFAULT_TILE_TEMPLATE).trim();
}

function tileUrl(z, x, y) {
  return tileTemplate()
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}

export async function getVectorTileLib() {
  if (vectorTileLibPromise) return vectorTileLibPromise;
  vectorTileLibPromise = Promise.all([
    import('https://cdn.jsdelivr.net/npm/pbf@3.2.1/+esm'),
    import('https://cdn.jsdelivr.net/npm/@mapbox/vector-tile@1.3.1/+esm')
  ]).then(([pbfMod, vtMod]) => ({
    Pbf: pbfMod.default || pbfMod.Pbf,
    VectorTile: vtMod.VectorTile
  })).catch((err) => {
    vectorTileLibPromise = null;
    throw err;
  });
  return vectorTileLibPromise;
}

function latLonToTileFloat(lat, lon, zoom) {
  const n = 2 ** zoom;
  const safeLat = Math.max(-85.05112878, Math.min(85.05112878, Number(lat) || 0));
  return {
    x: ((Number(lon) || 0) + 180) / 360 * n,
    y: (1 - Math.log(
      Math.tan(safeLat * Math.PI / 180) + 1 / Math.cos(safeLat * Math.PI / 180)
    ) / Math.PI) / 2 * n
  };
}

export function vectorTileRangeForBounds(latMin, lonMin, latMax, lonMax, zoom) {
  const nw = latLonToTileFloat(latMax, lonMin, zoom);
  const se = latLonToTileFloat(latMin, lonMax, zoom);
  const maxTile = 2 ** zoom - 1;
  return {
    xMin: Math.max(0, Math.min(maxTile, Math.floor(Math.min(nw.x, se.x)))),
    xMax: Math.max(0, Math.min(maxTile, Math.floor(Math.max(nw.x, se.x)))),
    yMin: Math.max(0, Math.min(maxTile, Math.floor(Math.min(nw.y, se.y)))),
    yMax: Math.max(0, Math.min(maxTile, Math.floor(Math.max(nw.y, se.y))))
  };
}

export async function fetchShortbreadTile(z, x, y, options = {}) {
  const controller = new AbortController();
  const externalSignal = options.signal || null;
  const relayAbort = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener?.('abort', relayAbort, { once: true });
  const timeoutId = setTimeout(() => controller.abort(), SHORTBREAD_FETCH_TIMEOUT_MS);
  try {
    const { Pbf, VectorTile } = await getVectorTileLib();
    const response = await fetch(tileUrl(z, x, y), {
      signal: controller.signal,
      cache: 'default'
    });
    if (!response.ok) throw new Error(`Shortbread tile ${z}/${x}/${y}: HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    return { tile: new VectorTile(new Pbf(new Uint8Array(buffer))), z, x, y };
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener?.('abort', relayAbort);
  }
}

function roadTags(properties = {}) {
  const kind = String(properties.kind || '').toLowerCase();
  if (!kind) return null;
  const raw = (key) => properties[key] == null ? '' : String(properties[key]);
  const booleanTag = (key) => properties[key] === true
    ? 'yes'
    : properties[key] === false || properties[key] == null
      ? ''
      : String(properties[key]);
  if (properties.rail === true) {
    return {
      railway: kind,
      tunnel: booleanTag('tunnel'),
      bridge: booleanTag('bridge'),
      layer: raw('layer'),
      _sourceCompleteness: 'generalized'
    };
  }
  const highway = properties.link === true && !kind.endsWith('_link') ? `${kind}_link` : kind;
  return {
    highway,
    bridge: booleanTag('bridge'),
    tunnel: booleanTag('tunnel'),
    covered: booleanTag('covered'),
    layer: raw('layer'),
    level: raw('level'),
    location: raw('location'),
    cutting: booleanTag('cutting'),
    embankment: booleanTag('embankment'),
    incline: raw('incline'),
    lanes: raw('lanes'),
    placement: raw('placement'),
    oneway: properties.oneway ? (properties.oneway_reverse ? '-1' : 'yes') : '',
    service: raw('service'),
    surface: raw('surface'),
    width: raw('width'),
    access: raw('access'),
    maxheight: raw('maxheight'),
    destination: raw('destination'),
    junction: raw('junction'),
    footway: raw('footway'),
    sidewalk: raw('sidewalk'),
    tracktype: raw('tracktype'),
    bicycle: raw('bicycle'),
    horse: raw('horse'),
    _sourceCompleteness: 'generalized'
  };
}

function landTags(properties = {}) {
  const kind = String(properties.kind || '').toLowerCase();
  const directLanduse = new Set([
    'forest', 'grass', 'meadow', 'orchard', 'vineyard', 'allotments',
    'cemetery', 'village_green', 'recreation_ground', 'greenhouse_horticulture',
    'plant_nursery', 'residential', 'industrial', 'commercial', 'garages',
    'retail', 'railway', 'landfill', 'quarry', 'brownfield', 'greenfield',
    'farmyard', 'farmland'
  ]);
  if (directLanduse.has(kind)) return { landuse: kind };
  if (kind === 'grave_yard') return { amenity: 'grave_yard', landuse: 'cemetery' };
  if (kind === 'sand' || kind === 'beach') return { natural: kind };
  if (['heath', 'scrub', 'grassland', 'bare_rock', 'scree', 'shingle'].includes(kind)) {
    return { natural: kind };
  }
  if (['swamp', 'bog', 'string_bog', 'wet_meadow', 'marsh'].includes(kind)) {
    return { natural: 'wetland', wetland: kind };
  }
  if (['park', 'garden', 'playground', 'golf_course', 'miniature_golf'].includes(kind)) {
    return { leisure: kind };
  }
  return null;
}

function siteTags(properties = {}) {
  const kind = String(properties.kind || '').toLowerCase();
  if (kind === 'parking' || kind === 'bicycle_parking') return { amenity: kind };
  if (kind === 'construction') return { landuse: 'construction' };
  if (['sports_centre'].includes(kind)) return { leisure: kind };
  if (['university', 'college', 'school', 'hospital', 'prison'].includes(kind)) return { amenity: kind };
  return null;
}

function featureTags(layerName, properties = {}) {
  if (layerName === 'streets') return roadTags(properties);
  if (layerName === 'land') return landTags(properties);
  if (layerName === 'sites') return siteTags(properties);
  if (layerName === 'buildings') return { building: 'yes' };
  if (layerName === 'street_polygons') {
    const kind = String(properties.kind || '').toLowerCase();
    if (!kind) return null;
    return {
      'area:highway': kind,
      area: 'yes',
      surface: properties.surface || '',
      bridge: properties.bridge ? 'yes' : '',
      tunnel: properties.tunnel ? 'yes' : ''
    };
  }
  return null;
}

function geometryParts(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'LineString') return [{ coords: geometry.coordinates, polygon: false }];
  if (geometry.type === 'MultiLineString') {
    return geometry.coordinates.map((coords) => ({ coords, polygon: false }));
  }
  if (geometry.type === 'Polygon') {
    return geometry.coordinates.length > 0 ? [{ coords: geometry.coordinates[0], polygon: true }] : [];
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates
      .filter((polygon) => polygon.length > 0)
      .map((polygon) => ({ coords: polygon[0], polygon: true }));
  }
  return [];
}

function geometrySignature(layerName, part, tags) {
  const coords = part.coords || [];
  const first = coords[0] || [];
  const last = coords[coords.length - 1] || [];
  return [
    layerName,
    tags.highway || tags.landuse || tags.natural || tags.building || tags.amenity || tags['area:highway'] || '',
    coords.length,
    Number(first[0]).toFixed(7), Number(first[1]).toFixed(7),
    Number(last[0]).toFixed(7), Number(last[1]).toFixed(7)
  ].join(':');
}

function partIntersectsBounds(part, bounds) {
  if (!bounds || !Array.isArray(part?.coords) || part.coords.length === 0) return true;
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (let i = 0; i < part.coords.length; i++) {
    const lon = Number(part.coords[i]?.[0]);
    const lat = Number(part.coords[i]?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return minLon <= bounds.maxLon && maxLon >= bounds.minLon &&
    minLat <= bounds.maxLat && maxLat >= bounds.minLat;
}

function convertTilesToElements(tiles, layerNames, bounds = null) {
  const elements = [];
  const nodesByCoordinate = new Map();
  const featureSignatures = new Set();
  let nextNodeId = -1;
  let nextWayId = -1;
  const referenceLat = bounds ? (Number(bounds.minLat) + Number(bounds.maxLat)) * 0.5 : 0;
  const metersPerLonDegree = Math.max(1, Math.cos(referenceLat * Math.PI / 180) * 111320);
  const projectLine = (coordinates) => (coordinates || []).map((coordinate) => ({
    x: Number(coordinate?.[0]) * metersPerLonDegree,
    z: Number(coordinate?.[1]) * 110540
  })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.z));

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

  for (const { tile, x, y, z } of tiles) {
    const resolveRoadName = layerNames.includes('streets')
      ? createRoadNameResolver({ tile, x, y, z }, projectLine)
      : null;
    for (const layerName of layerNames) {
      const layer = tile.layers[layerName];
      if (!layer || !Number.isFinite(layer.length)) continue;
      for (let index = 0; index < layer.length; index++) {
        const feature = layer.feature(index);
        if (!feature || typeof feature.toGeoJSON !== 'function') continue;
        const geojson = feature.toGeoJSON(x, y, z);
        const tags = featureTags(layerName, geojson.properties || {});
        if (!tags) continue;
          const parts = geometryParts(geojson.geometry);
          for (let partIndex = 0; partIndex < parts.length; partIndex++) {
            const part = parts[partIndex];
            if (!Array.isArray(part.coords) || part.coords.length < (part.polygon ? 4 : 2)) continue;
            if (!partIntersectsBounds(part, bounds)) continue;
          const resolvedTags = {
            ...tags,
            ...(layerName === 'buildings' ? { _geometrySource: 'shortbread-vector' } : {})
          };
          if (layerName === 'streets' && resolveRoadName) {
            const roadName = resolveRoadName(projectLine(part.coords), geojson.properties?.kind);
            if (roadName) resolvedTags.name = roadName;
          }
          const signature = geometrySignature(layerName, part, resolvedTags);
          if (featureSignatures.has(signature)) continue;
          featureSignatures.add(signature);
          const nodeIds = part.coords.map(nodeIdFor).filter(Number.isFinite);
          if (nodeIds.length < (part.polygon ? 4 : 2)) continue;
          if (part.polygon && nodeIds[0] !== nodeIds[nodeIds.length - 1]) nodeIds.push(nodeIds[0]);
          const sourceFeatureId = [
            'shortbread', layerName, z, x, y,
            feature.id ?? index,
            partIndex
          ].join(':');
          elements.push({
            type: 'way',
            id: nextWayId--,
            nodes: nodeIds,
            tags: { ...resolvedTags, _sourceFeatureId: sourceFeatureId }
          });
        }
      }
    }
  }
  return elements;
}

async function fetchTileCoverage(lat, lon, radius, zoom, options = {}) {
  const safeRadius = Math.max(0.004, Math.min(0.04, Number(radius) || 0.012));
  const bounds = {
    minLat: lat - safeRadius,
    minLon: lon - safeRadius,
    maxLat: lat + safeRadius,
    maxLon: lon + safeRadius
  };
  const range = vectorTileRangeForBounds(
    lat - safeRadius,
    lon - safeRadius,
    lat + safeRadius,
    lon + safeRadius,
    zoom
  );
  const coordinates = [];
  for (let x = range.xMin; x <= range.xMax; x++) {
    for (let y = range.yMin; y <= range.yMax; y++) {
      coordinates.push({ x, y });
    }
  }
  const fetchTile = typeof options.shortbreadFetchTile === 'function'
    ? options.shortbreadFetchTile
    : fetchShortbreadTile;
  const { settled, metrics } = await runBoundedProviderBatch(
    coordinates,
    ({ x, y }, _index, signal) => fetchTile(zoom, x, y, { signal }),
    {
      signal: options.signal,
      concurrency: options.concurrency || SHORTBREAD_TILE_CONCURRENCY,
      abortMessage: 'Shortbread coverage aborted'
    }
  );
  const tiles = settled
    .filter((entry) => entry.status === 'fulfilled' && entry.value)
    .map((entry) => entry.value);
  const successfulTiles = settled.filter((entry) => entry.status === 'fulfilled').length;
  if (tiles.length === 0) {
    if (successfulTiles > 0) return { tiles, requestedTiles: coordinates.length, bounds, metrics };
    const reason = settled.find((entry) => entry.status === 'rejected')?.reason;
    throw new Error(`Shortbread coverage unavailable: ${reason?.message || reason || 'no tiles'}`);
  }
  return { tiles, requestedTiles: coordinates.length, bounds, metrics };
}

export async function fetchShortbreadWorldData(options = {}) {
  const lat = Number(options.lat);
  const lon = Number(options.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('Shortbread location is invalid.');
  const includeBuildings = options.includeBuildings !== false;
  const { tiles, requestedTiles, bounds, metrics } = await fetchTileCoverage(
    lat,
    lon,
    options.radius,
    SHORTBREAD_ZOOM,
    options
  );
  const layerNames = ['streets', 'land', 'sites', 'street_polygons'];
  if (includeBuildings) layerNames.push('buildings');
  const elements = convertTilesToElements(tiles, layerNames, bounds);
  return {
    elements,
    _overpassSource: 'shortbread-vector',
    _overpassEndpoint: tileTemplate(),
    _overpassCacheAgeMs: 0,
    _shortbreadTiles: {
      loaded: metrics.fulfilled,
      decoded: tiles.length,
      requested: requestedTiles,
      failed: metrics.rejected,
      maxInFlight: metrics.maxInFlight,
      zoom: SHORTBREAD_ZOOM,
      status: elements.length > 0 ? 'available' : 'authoritative-empty',
      capabilities: { transport: 'generalized', landuse: 'generalized', buildings: includeBuildings ? 'generalized' : 'not-requested' }
    }
  };
}

export async function fetchShortbreadBuildingData(options = {}) {
  const lat = Number(options.lat);
  const lon = Number(options.lon);
  const { tiles, requestedTiles, bounds, metrics } = await fetchTileCoverage(
    lat, lon, options.radius, SHORTBREAD_ZOOM, options
  );
  const elements = convertTilesToElements(tiles, ['buildings'], bounds);
  const coverageComplete = metrics.fulfilled === requestedTiles;
  elements.forEach((element) => {
    if (element?.type === 'way' && element.tags) {
      element.tags._geometryCoverageComplete = coverageComplete ? 'yes' : 'no';
    }
  });
  return {
    elements,
    _overpassSource: 'shortbread-vector-buildings',
    _overpassEndpoint: tileTemplate(),
    _overpassCacheAgeMs: 0,
    _shortbreadTiles: {
      loaded: metrics.fulfilled,
      decoded: tiles.length,
      requested: requestedTiles,
      failed: metrics.rejected,
      maxInFlight: metrics.maxInFlight,
      zoom: SHORTBREAD_ZOOM,
      coverageComplete,
      status: elements.some((element) => element.type === 'way') ? 'available' : 'authoritative-empty',
      capabilities: { buildings: 'generalized' }
    }
  };
}

export { SHORTBREAD_TILE_CONCURRENCY, SHORTBREAD_ZOOM };
