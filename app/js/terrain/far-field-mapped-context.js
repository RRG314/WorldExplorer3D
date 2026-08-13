import {
  fetchShortbreadTile,
  vectorTileRangeForBounds
} from "../world/shortbread-source.js?v=14";
import { runBoundedProviderBatch } from '../earth-core/bounded-provider-batch.js?v=1';

const FAR_CONTEXT_ZOOM = 14;
const FAR_WATER_CONTEXT_ZOOM = 11;
const FAR_CONTEXT_MAX_BUILDINGS = 10000;
const FAR_CONTEXT_TILE_CONCURRENCY = 8;
const FAR_WATER_MIN_SPAN_METERS = 200;

function polygonRings(geometry) {
  if (geometry?.type === 'Polygon') return geometry.coordinates?.[0] ? [geometry.coordinates[0]] : [];
  if (geometry?.type === 'MultiPolygon') {
    return (geometry.coordinates || []).map((polygon) => polygon?.[0]).filter(Array.isArray);
  }
  return [];
}

function polygonAreas(geometry) {
  if (geometry?.type === 'Polygon') return geometry.coordinates?.[0] ? [geometry.coordinates] : [];
  if (geometry?.type === 'MultiPolygon') {
    return (geometry.coordinates || []).filter((polygon) => Array.isArray(polygon?.[0]));
  }
  return [];
}

function ringBounds(ring) {
  const bounds = { minLat: Infinity, maxLat: -Infinity, minLon: Infinity, maxLon: -Infinity };
  for (const coordinate of ring || []) {
    const lon = Number(coordinate?.[0]);
    const lat = Number(coordinate?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    bounds.minLat = Math.min(bounds.minLat, lat);
    bounds.maxLat = Math.max(bounds.maxLat, lat);
    bounds.minLon = Math.min(bounds.minLon, lon);
    bounds.maxLon = Math.max(bounds.maxLon, lon);
  }
  return bounds;
}

function ringSpanMeters(ring) {
  const bounds = ringBounds(ring);
  const centerLatitude = (bounds.minLat + bounds.maxLat) * 0.5;
  const northSouth = (bounds.maxLat - bounds.minLat) * 110540;
  const eastWest = (bounds.maxLon - bounds.minLon) * 111320 * Math.cos(centerLatitude * Math.PI / 180);
  return Math.max(northSouth, eastWest);
}

function retainFarWaterRing(ring) {
  const source = (ring || []).filter((coordinate) => (
    Number.isFinite(Number(coordinate?.[0])) &&
    Number.isFinite(Number(coordinate?.[1]))
  ));
  if (source.length < 3) return [];
  const first = source[0];
  const last = source.at(-1);
  return first[0] === last[0] && first[1] === last[1]
    ? source.slice()
    : [...source, first];
}

function pointInLonLatRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = Number(ring[i]?.[0]);
    const yi = Number(ring[i]?.[1]);
    const xj = Number(ring[j]?.[0]);
    const yj = Number(ring[j]?.[1]);
    if (![xi, yi, xj, yj].every(Number.isFinite)) continue;
    const intersects = ((yi > lat) !== (yj > lat)) &&
      lon < (xj - xi) * (lat - yi) / ((yj - yi) || 1e-12) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInMappedWaterArea(lon, lat, area) {
  const bounds = area?.bounds;
  if (
    bounds &&
    (lon < bounds.minLon || lon > bounds.maxLon || lat < bounds.minLat || lat > bounds.maxLat)
  ) return false;
  if (!pointInLonLatRing(lon, lat, area?.outer || [])) return false;
  return !(area?.holes || []).some((hole) => pointInLonLatRing(lon, lat, hole));
}

function contextTileCount(bounds, zoom) {
  const range = vectorTileRangeForBounds(
    bounds.latS,
    bounds.lonW,
    bounds.latN,
    bounds.lonE,
    zoom
  );
  return (range.xMax - range.xMin + 1) * (range.yMax - range.yMin + 1);
}

function selectContextZoomForTileBudget(bounds, preferredZoom, maxTiles = 81, minimumZoom = 8) {
  let zoom = Math.max(minimumZoom, Math.floor(Number(preferredZoom) || minimumZoom));
  while (zoom > minimumZoom && contextTileCount(bounds, zoom) > maxTiles) zoom -= 1;
  return zoom;
}

function contextTileCoordinates(bounds, zoom = FAR_CONTEXT_ZOOM) {
  const range = vectorTileRangeForBounds(
    bounds.latS,
    bounds.lonW,
    bounds.latN,
    bounds.lonE,
    zoom
  );
  const coordinates = [];
  for (let x = range.xMin; x <= range.xMax; x += 1) {
    for (let y = range.yMin; y <= range.yMax; y += 1) coordinates.push({ x, y });
  }
  return coordinates;
}

async function fetchWithConcurrency(items, concurrency, worker, signal = null) {
  const { settled, metrics } = await runBoundedProviderBatch(
    items,
    (item, _index, batchSignal) => worker(item, batchSignal),
    { signal, concurrency, abortMessage: 'Far mapped context aborted' }
  );
  return {
    values: settled
      .filter((entry) => entry.status === 'fulfilled' && entry.value)
      .map((entry) => entry.value),
    metrics
  };
}

async function loadFarMappedWaterContext(bounds, options = {}) {
  const waterZoom = Number.isFinite(Number(options.waterZoom))
    ? Number(options.waterZoom)
    : selectContextZoomForTileBudget(bounds, FAR_WATER_CONTEXT_ZOOM);
  const coordinates = contextTileCoordinates(bounds, waterZoom);
  const fetchTile = typeof options.fetchTile === 'function' ? options.fetchTile : fetchShortbreadTile;
  const waterBatch = await fetchWithConcurrency(
    coordinates,
    FAR_CONTEXT_TILE_CONCURRENCY,
    ({ x, y }, signal) => fetchTile(waterZoom, x, y, { signal }),
    options.signal
  );
  const tiles = waterBatch.values;
  const waterAreas = [];

  for (const tileRecord of tiles) {
    for (const layerName of ['ocean', 'water_polygons']) {
      const layer = tileRecord.tile.layers[layerName];
      if (!layer) continue;
      for (let index = 0; index < layer.length; index += 1) {
        const feature = layer.feature(index);
        const geojson = feature?.toGeoJSON?.(tileRecord.x, tileRecord.y, tileRecord.z);
        for (const [polygonIndex, rings] of polygonAreas(geojson?.geometry).entries()) {
          const outer = rings?.[0];
          if (!Array.isArray(outer) || outer.length < 4) continue;
          const kind = layerName === 'ocean' ? 'ocean' : String(geojson?.properties?.kind || 'water');
          // Shortbread carries glaciers in water_polygons, but the detailed
          // pipeline correctly publishes them as glacier terrain, not water.
          if (kind.toLowerCase() === 'glacier') continue;
          const spanMeters = ringSpanMeters(outer);
          // At a 320 m horizon grid, smaller polygons are sub-pixel visual
          // noise but expensive to triangulate. Keep every ocean polygon and
          // only mapped inland water large enough to be visible at this LOD.
          if (kind !== 'ocean' && spanMeters < FAR_WATER_MIN_SPAN_METERS) continue;
          // These vector-tile rings are already bounded to one coarse tile.
          // Deleting every Nth vertex can make a concave coastline cross
          // itself, producing giant triangles and depth stripes. Preserve the
          // mapped topology; the 200 m feature filter owns the far-LOD budget.
          const retainedOuter = retainFarWaterRing(outer);
          if (retainedOuter.length < 4) continue;
          waterAreas.push({
            outer: retainedOuter,
            holes: (rings || []).slice(1)
              .filter((ring) => Array.isArray(ring) && ring.length >= 4)
              .map(retainFarWaterRing)
              .filter((ring) => ring.length >= 4),
            bounds: ringBounds(retainedOuter),
            kind,
            spanMeters,
            identity: `${tileRecord.z}/${tileRecord.x}/${tileRecord.y}/${layerName}/${feature.id ?? index}/${polygonIndex}`
          });
        }
      }
    }
  }

  return {
    waterAreas,
    waterTilesLoaded: tiles.length,
    waterTilesRequested: coordinates.length,
    waterMaxInFlight: waterBatch.metrics.maxInFlight,
    waterZoom
  };
}

async function loadFarMappedContext(bounds, excludedBounds = null, waterBounds = bounds, options = {}) {
  const contextZoom = Number.isFinite(Number(options.contextZoom))
    ? Number(options.contextZoom)
    : selectContextZoomForTileBudget(bounds, FAR_CONTEXT_ZOOM);
  const coordinates = contextTileCoordinates(bounds, contextZoom);
  const fetchTile = typeof options.fetchTile === 'function' ? options.fetchTile : fetchShortbreadTile;
  const [contextBatch, waterContext] = await Promise.all([
    fetchWithConcurrency(
      coordinates,
      FAR_CONTEXT_TILE_CONCURRENCY,
      ({ x, y }, signal) => fetchTile(contextZoom, x, y, { signal }),
      options.signal
    ),
    loadFarMappedWaterContext(waterBounds, { ...options, fetchTile })
  ]);
  const tiles = contextBatch.values;
  const buildings = [];
  let skippedNearBuildings = 0;

  for (const tileRecord of tiles) {
    const buildingLayer = tileRecord.tile.layers.buildings;
    if (!buildingLayer) continue;
    const tileBuildings = [];
    for (let index = 0; index < buildingLayer.length; index += 1) {
      const feature = buildingLayer.feature(index);
      const geojson = feature?.toGeoJSON?.(tileRecord.x, tileRecord.y, tileRecord.z);
      for (const ring of polygonRings(geojson?.geometry)) {
        if (ring.length < 4) continue;
        const bounds = ringBounds(ring);
        const centerLat = (bounds.minLat + bounds.maxLat) * 0.5;
        const centerLon = (bounds.minLon + bounds.maxLon) * 0.5;
        if (excludedBounds &&
            centerLat >= excludedBounds.latS && centerLat <= excludedBounds.latN &&
            centerLon >= excludedBounds.lonW && centerLon <= excludedBounds.lonE) {
          skippedNearBuildings += 1;
          continue;
        }
        const span = Math.max(bounds.maxLat - bounds.minLat, bounds.maxLon - bounds.minLon);
        tileBuildings.push({
          ring,
          properties: geojson.properties || {},
          priority: span,
          identity: `${tileRecord.x}/${tileRecord.y}/${feature.id ?? index}`
        });
      }
    }
    tileBuildings.sort((a, b) => b.priority - a.priority);
    buildings.push(...tileBuildings.slice(0, 180));
  }

  return {
    buildings: buildings.slice(0, FAR_CONTEXT_MAX_BUILDINGS),
    ...waterContext,
    skippedNearBuildings,
    contextZoom,
    loadedTiles: tiles.length,
    requestedTiles: coordinates.length,
    contextMaxInFlight: contextBatch.metrics.maxInFlight
  };
}

export {
  FAR_CONTEXT_MAX_BUILDINGS,
  FAR_CONTEXT_ZOOM,
  FAR_WATER_CONTEXT_ZOOM,
  FAR_WATER_MIN_SPAN_METERS,
  loadFarMappedContext,
  loadFarMappedWaterContext,
  pointInLonLatRing,
  pointInMappedWaterArea,
  retainFarWaterRing,
  selectContextZoomForTileBudget
};
