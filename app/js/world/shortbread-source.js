import { createRoadNameResolver } from './shortbread-road-labels.js?v=1';
import { yieldToMainThread } from './cooperative-scheduling.js?v=1';
import { runBoundedProviderBatch } from '../earth-core/bounded-provider-batch.js?v=1';

const SHORTBREAD_ZOOM = 14;
const SHORTBREAD_FETCH_TIMEOUT_MS = 8000;
const SHORTBREAD_TILE_CONCURRENCY = 8;
// Roads and far buildings request the same z14 metropolitan tiles concurrently.
// Retain one complete London-sized set so the in-flight/cache owner can prevent
// a second provider pass instead of evicting early tiles during publication.
const SHORTBREAD_DECODED_TILE_CACHE_LIMIT = 544;
const DEFAULT_TILE_TEMPLATE =
  'https://vector.openstreetmap.org/shortbread_v1/{z}/{x}/{y}.mvt';

let vectorTileLibPromise = null;
const decodedTileCache = new Map();
const pendingTileRequests = new Map();

export function getShortbreadRuntimeCacheStats() {
  return Object.freeze({
    decodedTileCount: decodedTileCache.size,
    pendingTileCount: pendingTileRequests.size,
    decodedTileLimit: SHORTBREAD_DECODED_TILE_CACHE_LIMIT
  });
}

export function releaseShortbreadRuntimeCache() {
  const releasedTileCount = decodedTileCache.size;
  decodedTileCache.clear();
  return Object.freeze({
    releasedTileCount,
    pendingTileCount: pendingTileRequests.size
  });
}

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

function shortbreadAbortError(z, x, y) {
  const error = new Error(`Shortbread tile ${z}/${x}/${y} aborted`);
  error.name = 'AbortError';
  return error;
}

function waitForSharedTileRequest(entry, signal, z, x, y) {
  const consumer = {};
  entry.consumers.add(consumer);
  let rejectAbort = null;
  const abortPromise = new Promise((resolve, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () => rejectAbort?.(shortbreadAbortError(z, x, y));
  if (signal?.aborted) onAbort();
  else signal?.addEventListener?.('abort', onAbort, { once: true });
  return Promise.race([entry.promise, abortPromise]).finally(() => {
    signal?.removeEventListener?.('abort', onAbort);
    entry.consumers.delete(consumer);
    if (!entry.settled && entry.consumers.size === 0) entry.controller.abort();
  });
}

export async function fetchShortbreadTile(z, x, y, options = {}) {
  const cacheKey = `${tileTemplate()}:${z}/${x}/${y}`;
  const cached = decodedTileCache.get(cacheKey);
  if (cached) {
    decodedTileCache.delete(cacheKey);
    decodedTileCache.set(cacheKey, cached);
    return cached;
  }
  const externalSignal = options.signal || null;
  if (externalSignal?.aborted) throw shortbreadAbortError(z, x, y);
  let entry = pendingTileRequests.get(cacheKey);
  if (!entry) {
    const controller = new AbortController();
    entry = { controller, consumers: new Set(), promise: null, settled: false };
    const timeoutId = setTimeout(() => controller.abort(), SHORTBREAD_FETCH_TIMEOUT_MS);
    entry.promise = (async () => {
      const { Pbf, VectorTile } = await getVectorTileLib();
      const response = await fetch(tileUrl(z, x, y), {
        signal: controller.signal,
        cache: 'default'
      });
      if (!response.ok) throw new Error(`Shortbread tile ${z}/${x}/${y}: HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      const record = { tile: new VectorTile(new Pbf(new Uint8Array(buffer))), z, x, y };
      decodedTileCache.set(cacheKey, record);
      while (decodedTileCache.size > SHORTBREAD_DECODED_TILE_CACHE_LIMIT) {
        decodedTileCache.delete(decodedTileCache.keys().next().value);
      }
      return record;
    })().finally(() => {
      clearTimeout(timeoutId);
      entry.settled = true;
      if (pendingTileRequests.get(cacheKey) === entry) pendingTileRequests.delete(cacheKey);
    });
    pendingTileRequests.set(cacheKey, entry);
  }
  return waitForSharedTileRequest(entry, externalSignal, z, x, y);
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
  // The Shortbread streets layer carries OSM aeroway=runway/taxiway in the
  // same `kind` field as highways. Preserve that source meaning instead of
  // publishing an invented highway whose value happens to be "runway".
  if (kind === 'runway' || kind === 'taxiway') {
    return {
      aeroway: kind,
      bridge: booleanTag('bridge'),
      tunnel: booleanTag('tunnel'),
      layer: raw('layer'),
      surface: raw('surface'),
      width: raw('width'),
      access: raw('access'),
      ref: raw('ref'),
      name: raw('name'),
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

function poiTags(properties = {}) {
  const supportedKeys = [
    'amenity', 'leisure', 'tourism', 'shop', 'man_made',
    'historic', 'emergency', 'highway'
  ];
  const tags = {};
  supportedKeys.forEach((key) => {
    const value = String(properties[key] || '').trim();
    if (value) tags[key] = value;
  });
  if (Object.keys(tags).length === 0) return null;
  ['name', 'name_en', 'name_de', 'ref'].forEach((key) => {
    const value = String(properties[key] || '').trim();
    if (value) tags[key === 'name_en' ? 'name:en' : key === 'name_de' ? 'name:de' : key] = value;
  });
  return tags;
}

function publicTransportTags(properties = {}) {
  const kind = String(properties.kind || '').toLowerCase();
  if (kind === 'aerodrome' || kind === 'helipad') {
    return {
      aeroway: kind,
      name: String(properties.name || ''),
      ref: String(properties.ref || ''),
      iata: String(properties.iata || ''),
      icao: String(properties.icao || ''),
      _sourceCompleteness: 'generalized'
    };
  }
  if (kind === 'ferry_terminal') {
    return {
      amenity: 'ferry_terminal',
      name: String(properties.name || ''),
      ref: String(properties.ref || ''),
      _sourceCompleteness: 'generalized'
    };
  }
  return null;
}

function featureTags(layerName, properties = {}) {
  if (layerName === 'streets') return roadTags(properties);
  if (layerName === 'land') return landTags(properties);
  if (layerName === 'sites') return siteTags(properties);
  if (layerName === 'pois') return poiTags(properties);
  if (layerName === 'public_transport') return publicTransportTags(properties);
  if (layerName === 'ferries') return {
    route: 'ferry',
    name: String(properties.name || ''),
    ref: String(properties.ref || ''),
    _sourceCompleteness: 'generalized'
  };
  if (layerName === 'pier_lines' || layerName === 'pier_polygons') return {
    man_made: String(properties.kind || 'pier'),
    name: String(properties.name || ''),
    _sourceCompleteness: 'generalized'
  };
  if (layerName === 'buildings') return { building: 'yes' };
  if (layerName === 'street_polygons') {
    const kind = String(properties.kind || '').toLowerCase();
    if (!kind) return null;
    if (kind === 'runway' || kind === 'taxiway') {
      return {
        'area:aeroway': kind,
        aeroway: kind,
        area: 'yes',
        surface: properties.surface || '',
        bridge: properties.bridge ? 'yes' : '',
        tunnel: properties.tunnel ? 'yes' : '',
        _sourceCompleteness: 'generalized'
      };
    }
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

async function convertTilesToElements(tiles, layerNames, bounds = null) {
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

  let sliceStartedAt = globalThis.performance?.now?.() ?? Date.now();
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
        if (geojson.geometry?.type === 'Point') {
          const lon = Number(geojson.geometry.coordinates?.[0]);
          const lat = Number(geojson.geometry.coordinates?.[1]);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
          if (bounds && (
            lat < bounds.minLat || lat > bounds.maxLat ||
            lon < bounds.minLon || lon > bounds.maxLon
          )) continue;
          const sourceFeatureId = [
            'shortbread', layerName, z, x, y,
            feature.id ?? index
          ].join(':');
          const signature = `${layerName}:${sourceFeatureId}:${lat.toFixed(7)}:${lon.toFixed(7)}`;
          if (featureSignatures.has(signature)) continue;
          featureSignatures.add(signature);
          const id = sourceFeatureId;
          elements.push({
            type: 'node',
            id,
            lat,
            lon,
            sourceElementType: 'node',
            sourceElementId: sourceFeatureId,
            tags: {
              ...tags,
              _sourceFeatureId: sourceFeatureId,
              _sourceElementType: 'node',
              _sourceElementId: sourceFeatureId
            }
          });
          continue;
        }
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
        const now = globalThis.performance?.now?.() ?? Date.now();
        if (now - sliceStartedAt >= 24) {
          await yieldToMainThread();
          sliceStartedAt = globalThis.performance?.now?.() ?? Date.now();
        }
      }
    }
  }
  return elements;
}

function normalizeCoverageBounds(lat, lon, radius, explicitBounds = null, maxRadius = 0.04) {
  if (explicitBounds) {
    const bounds = {
      minLat: Number(explicitBounds.minLat ?? explicitBounds.latS),
      minLon: Number(explicitBounds.minLon ?? explicitBounds.lonW),
      maxLat: Number(explicitBounds.maxLat ?? explicitBounds.latN),
      maxLon: Number(explicitBounds.maxLon ?? explicitBounds.lonE)
    };
    if (Object.values(bounds).every(Number.isFinite) &&
        bounds.minLat < bounds.maxLat && bounds.minLon < bounds.maxLon) return bounds;
    throw new Error('Shortbread coverage bounds are invalid.');
  }
  const safeRadius = Math.max(0.004, Math.min(maxRadius, Number(radius) || 0.012));
  return {
    minLat: lat - safeRadius,
    minLon: lon - safeRadius,
    maxLat: lat + safeRadius,
    maxLon: lon + safeRadius
  };
}

export function shortbreadTileCountForBounds(bounds, zoom = SHORTBREAD_ZOOM) {
  const range = vectorTileRangeForBounds(
    bounds.minLat ?? bounds.latS,
    bounds.minLon ?? bounds.lonW,
    bounds.maxLat ?? bounds.latN,
    bounds.maxLon ?? bounds.lonE,
    zoom
  );
  return (range.xMax - range.xMin + 1) * (range.yMax - range.yMin + 1);
}

export function selectShortbreadZoomForBounds(bounds, options = {}) {
  const minimumZoom = Math.max(8, Math.floor(Number(options.minimumZoom) || 10));
  const maxTiles = Math.max(1, Math.floor(Number(options.maxTiles) || 81));
  let zoom = Math.max(minimumZoom, Math.floor(Number(options.preferredZoom) || SHORTBREAD_ZOOM));
  while (zoom > minimumZoom && shortbreadTileCountForBounds(bounds, zoom) > maxTiles) zoom -= 1;
  return zoom;
}

async function fetchTileCoverage(lat, lon, radius, zoom, options = {}) {
  const bounds = normalizeCoverageBounds(
    lat,
    lon,
    radius,
    options.bounds,
    Number(options.maxRadius) || 0.04
  );
  const range = vectorTileRangeForBounds(
    bounds.minLat,
    bounds.minLon,
    bounds.maxLat,
    bounds.maxLon,
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
  const coverageBounds = options.bounds || null;
  const zoom = Number.isFinite(Number(options.zoom))
    ? Math.floor(Number(options.zoom))
    : coverageBounds
      ? selectShortbreadZoomForBounds(coverageBounds, options)
      : SHORTBREAD_ZOOM;
  const { tiles, requestedTiles, bounds, metrics } = await fetchTileCoverage(
    lat,
    lon,
    options.radius,
    zoom,
    options
  );
  const layerNames = Array.isArray(options.layerNames)
    ? options.layerNames.slice()
    : ['streets', 'land', 'sites', 'pois', 'street_polygons'];
  if (includeBuildings && !layerNames.includes('buildings')) layerNames.push('buildings');
  const elements = await convertTilesToElements(tiles, layerNames, bounds);
  if (metrics.rejected > 0) {
    for (const element of elements) {
      if (element?.type === 'way' && element?.tags?.highway) {
        element.tags._sourceTruncated = 'yes';
      }
    }
  }
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
      zoom,
      bounds,
      status: elements.length > 0 ? 'available' : 'authoritative-empty',
      capabilities: {
        transport: 'generalized',
        landuse: 'generalized',
        pois: layerNames.includes('pois') ? 'shortbread-schema' : 'not-requested',
        buildings: includeBuildings ? 'generalized' : 'not-requested'
      }
    }
  };
}

export async function fetchShortbreadBuildingData(options = {}) {
  const lat = Number(options.lat);
  const lon = Number(options.lon);
  const { tiles, requestedTiles, bounds, metrics } = await fetchTileCoverage(
    lat, lon, options.radius, SHORTBREAD_ZOOM, options
  );
  const elements = await convertTilesToElements(tiles, ['buildings'], bounds);
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

export {
  featureTags as shortbreadFeatureTags,
  SHORTBREAD_DECODED_TILE_CACHE_LIMIT,
  SHORTBREAD_TILE_CONCURRENCY,
  SHORTBREAD_ZOOM
};
