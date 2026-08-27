import { vectorTileRangeForBounds } from "./shortbread-source.js?v=18";
import {
  OVERTURE_RELEASE,
  OVERTURE_RELEASE_POLICY,
  fetchOvertureThemeTile,
  overtureThemeArchiveUrl
} from './overture-tile-source.js?v=5';
import { shouldSuppressBuildingParent } from './building-provenance-model.js?v=1';
import { runBoundedProviderBatch } from '../earth-core/bounded-provider-batch.js?v=1';
import { throwIfWorldLoadAborted } from '../earth-core/request-cancellation.js?v=1';

const OVERTURE_BUILDING_ZOOM = 14;
const OVERTURE_TILE_CONCURRENCY = 8;

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
  tags._buildingMetadataSourceId = tags._sourceFeatureId;
  tags._buildingMetadataGeometryId = tags._sourceFeatureId;
  tags._buildingMetadataMapping = 'same_source_feature';
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

function convertTilesToElements(tiles, bounds, options = {}) {
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
      shouldSuppressBuildingParent({
        coverageComplete: options.coverageComplete === true,
        hasParts,
        stableId: candidate.stableId,
        parentIdsWithParts
      })
    ) {
      suppressedParents += 1;
      continue;
    }
    const nodeIds = candidate.coords.map(nodeIdFor).filter(Number.isFinite);
    if (nodeIds.length < 4) continue;
    if (nodeIds[0] !== nodeIds[nodeIds.length - 1]) nodeIds.push(nodeIds[0]);
    const tags = featureTags(
      candidate.layerName,
      candidate.properties,
      candidate.tileIdentity
    );
    tags._geometryCoverageComplete = options.coverageComplete === true ? 'yes' : 'no';
    elements.push({
      type: 'way',
      id: nextWayId--,
      nodes: nodeIds,
      tags
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

function fulfilledTiles(settled) {
  return settled
    .filter((entry) => entry.status === 'fulfilled' && entry.value)
    .map((entry) => entry.value);
}

async function fetchArchiveTileBatch(coordinates, options = {}) {
  const fetchTile = typeof options.fetchTile === 'function'
    ? options.fetchTile
    : fetchOvertureThemeTile;
  throwIfWorldLoadAborted(options.signal, 'Overture building coverage aborted');
  return runBoundedProviderBatch(
    coordinates,
    ({ x, y }, _index, signal) => fetchTile(
      'buildings', OVERTURE_BUILDING_ZOOM, x, y, { signal }
    ),
    {
      signal: options.signal,
      concurrency: options.concurrency || OVERTURE_TILE_CONCURRENCY,
      abortMessage: 'Overture building coverage aborted'
    }
  );
}

async function fetchCompleteArchiveTileBatch(coordinates, options = {}) {
  const maximumAttempts = Math.max(1, Math.min(3, Math.floor(Number(options.maximumAttempts) || 2)));
  const settled = new Array(coordinates.length);
  let attempts = 0;
  let started = 0;
  let maxInFlight = 0;
  let pendingIndices = coordinates.map((_coordinate, index) => index);

  while (pendingIndices.length > 0 && attempts < maximumAttempts) {
    attempts += 1;
    const batchCoordinates = pendingIndices.map((index) => coordinates[index]);
    const batch = await fetchArchiveTileBatch(batchCoordinates, options);
    started += Number(batch.metrics?.started || 0);
    maxInFlight = Math.max(maxInFlight, Number(batch.metrics?.maxInFlight || 0));
    const rejectedIndices = [];
    for (let batchIndex = 0; batchIndex < batch.settled.length; batchIndex++) {
      const coordinateIndex = pendingIndices[batchIndex];
      const entry = batch.settled[batchIndex];
      settled[coordinateIndex] = entry;
      if (entry?.status === 'rejected') rejectedIndices.push(coordinateIndex);
    }
    pendingIndices = rejectedIndices;
  }

  const fulfilled = settled.filter((entry) => entry?.status === 'fulfilled').length;
  const rejected = coordinates.length - fulfilled;
  if (rejected > 0) {
    const reason = settled.find((entry) => entry?.status === 'rejected')?.reason;
    throw new Error(
      `Overture building coverage incomplete: ${fulfilled}/${coordinates.length} tiles after ` +
      `${attempts} attempts (${reason?.message || reason || 'provider failure'})`
    );
  }
  return {
    settled,
    metrics: Object.freeze({
      requested: coordinates.length,
      started,
      fulfilled,
      rejected,
      maxInFlight,
      attempts
    })
  };
}

export async function fetchOvertureBuildingData(options = {}) {
  const lat = Number(options.lat);
  const lon = Number(options.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('Overture building location is invalid.');
  const explicitBounds = options.bounds ? {
    minLat: Number(options.bounds.minLat ?? options.bounds.latS),
    minLon: Number(options.bounds.minLon ?? options.bounds.lonW),
    maxLat: Number(options.bounds.maxLat ?? options.bounds.latN),
    maxLon: Number(options.bounds.maxLon ?? options.bounds.lonE)
  } : null;
  if (explicitBounds && (!Object.values(explicitBounds).every(Number.isFinite) ||
      explicitBounds.minLat >= explicitBounds.maxLat || explicitBounds.minLon >= explicitBounds.maxLon)) {
    throw new Error('Overture building coverage bounds are invalid.');
  }
  const fallbackRadius = Math.max(0.004, Math.min(0.04, Number(options.radius) || 0.012));
  const bounds = explicitBounds || {
    minLat: lat - fallbackRadius,
    minLon: lon - fallbackRadius,
    maxLat: lat + fallbackRadius,
    maxLon: lon + fallbackRadius
  };
  const radius = Math.max(
    (bounds.maxLat - bounds.minLat) * 0.5,
    (bounds.maxLon - bounds.minLon) * 0.5
  );
  const range = vectorTileRangeForBounds(
    bounds.minLat,
    bounds.minLon,
    bounds.maxLat,
    bounds.maxLon,
    OVERTURE_BUILDING_ZOOM
  );
  const coordinates = orderedTileCoordinates(range, lat, lon);
  const { settled, metrics } = await fetchCompleteArchiveTileBatch(coordinates, options);
  throwIfWorldLoadAborted(options.signal, 'Overture building coverage aborted');
  const tiles = fulfilledTiles(settled);
  const coverageComplete = true;
  const converted = convertTilesToElements(tiles, bounds, { coverageComplete });
  const ways = converted.elements.filter((element) => element.type === 'way');
  const parts = ways.filter((way) => way.tags?.['building:part']);
  const mappedHeights = ways.filter((way) => way.tags?.height || way.tags?.['building:levels']);
  const mappedRoofs = ways.filter((way) => way.tags?.['roof:shape']);
  return {
    elements: converted.elements,
    _overpassSource: 'overture-buildings-pmtiles',
    _overpassEndpoint: overtureThemeArchiveUrl('buildings'),
    _overpassCacheAgeMs: 0,
    _buildingProviderDecision: {
      selected: 'overture',
      authority: 'authoritative',
      status: ways.length > 0 ? 'available' : 'authoritative-empty',
      fallbackStarted: false
    },
    _overtureBuildings: {
      release: OVERTURE_RELEASE,
      releasePolicy: OVERTURE_RELEASE_POLICY,
      zoom: OVERTURE_BUILDING_ZOOM,
      attempts: metrics.attempts,
      loadedTiles: metrics.fulfilled,
      decodedTiles: tiles.length,
      emptyTiles: metrics.fulfilled - tiles.length,
      failedTiles: metrics.rejected,
      requestedTiles: coordinates.length,
      maxInFlight: metrics.maxInFlight,
      coverageComplete,
      status: ways.length > 0 ? 'available' : 'authoritative-empty',
      capabilities: { buildings: 'authoritative' },
      radiusDegrees: radius,
      coverageBounds: Object.freeze({ ...bounds }),
      visibilityRadiusWorld: Number.isFinite(Number(options.visibilityRadiusWorld))
        ? Number(options.visibilityRadiusWorld)
        : null,
      approximateRadiusMeters: Math.round(
        Number.isFinite(Number(options.visibilityRadiusWorld))
          ? Number(options.visibilityRadiusWorld)
          : radius * 111320
      ),
      buildingsAndParts: ways.length,
      parts: parts.length,
      mappedDimensions: mappedHeights.length,
      mappedRoofs: mappedRoofs.length,
      parentIdsWithParts: converted.parentIdsWithParts,
      suppressedParents: converted.suppressedParents
    }
  };
}

export async function fetchGlobalBuildingData(options = {}) {
  // Provider fallback is deliberately not performed inside this adapter.
  // Otherwise the world-load ledger records Overture as successful while a
  // different dataset is silently published. The publication coordinator owns
  // fallback selection and gives each provider its own lifecycle record.
  return fetchOvertureBuildingData(options);
}

export {
  OVERTURE_BUILDING_ZOOM,
  OVERTURE_TILE_CONCURRENCY,
  OVERTURE_RELEASE,
  fetchCompleteArchiveTileBatch
};
