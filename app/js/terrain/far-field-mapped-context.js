import {
  fetchShortbreadTile,
  vectorTileRangeForBounds
} from "../world/shortbread-source.js?v=10";
import { throwIfWorldLoadAborted } from '../earth-core/request-cancellation.js?v=1';

const FAR_CONTEXT_ZOOM = 14;
const FAR_WATER_CONTEXT_ZOOM = 11;
const FAR_CONTEXT_MAX_BUILDINGS = 10000;
const FAR_CONTEXT_TILE_CONCURRENCY = 8;
const FAR_WATER_MIN_SPAN_METERS = 200;
const FAR_WATER_VERTEX_SPACING_METERS = 45;
const FAR_WATER_MAX_RING_POINTS = 384;

const FAR_LAND_COLORS = Object.freeze({
  forest: [0.16, 0.25, 0.14],
  grass: [0.32, 0.42, 0.22],
  farmland: [0.43, 0.40, 0.27],
  developed: [0.39, 0.41, 0.40],
  industrial: [0.34, 0.35, 0.34],
  sand: [0.66, 0.58, 0.41]
});

function farLandClass(kind = '') {
  const value = String(kind || '').toLowerCase();
  if (/forest|wood|nature_reserve/.test(value)) return 'forest';
  if (/park|garden|grass|meadow|recreation|cemetery|village_green|golf|scrub|heath/.test(value)) return 'grass';
  if (/farm|orchard|vineyard|allotment|nursery/.test(value)) return 'farmland';
  if (/industrial|railway|quarry|landfill|construction|brownfield/.test(value)) return 'industrial';
  if (/residential|commercial|retail|school|university|hospital|parking/.test(value)) return 'developed';
  if (/sand|beach|dune|bare_rock|scree|shingle/.test(value)) return 'sand';
  return null;
}

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

function coordinateDistanceMeters(a, b) {
  const latitude = (Number(a?.[1]) + Number(b?.[1])) * 0.5;
  const dx = (Number(a?.[0]) - Number(b?.[0])) * 111320 * Math.cos(latitude * Math.PI / 180);
  const dy = (Number(a?.[1]) - Number(b?.[1])) * 110540;
  return Math.hypot(dx, dy);
}

function simplifyFarWaterRing(ring) {
  const source = ring?.length > 1 &&
    ring[0]?.[0] === ring.at(-1)?.[0] && ring[0]?.[1] === ring.at(-1)?.[1]
    ? ring.slice(0, -1)
    : (ring || []).slice();
  if (source.length <= 4) return [...source, source[0]].filter(Boolean);
  const spaced = [source[0]];
  for (let index = 1; index < source.length; index += 1) {
    if (coordinateDistanceMeters(source[index], spaced.at(-1)) >= FAR_WATER_VERTEX_SPACING_METERS) {
      spaced.push(source[index]);
    }
  }
  if (spaced.length < 3) return [...source, source[0]];
  const stride = Math.max(1, Math.ceil(spaced.length / FAR_WATER_MAX_RING_POINTS));
  const simplified = stride === 1 ? spaced : spaced.filter((_, index) => index % stride === 0);
  if (simplified.length < 3) return [...source, source[0]];
  return [...simplified, simplified[0]];
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
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      throwIfWorldLoadAborted(signal, 'Far mapped context aborted');
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await worker(items[index], signal);
      } catch (error) {
        throwIfWorldLoadAborted(signal, 'Far mapped context aborted');
        results[index] = null;
      }
    }
  });
  await Promise.all(runners);
  return results.filter(Boolean);
}

async function loadFarMappedWaterContext(bounds, options = {}) {
  const coordinates = contextTileCoordinates(bounds, FAR_WATER_CONTEXT_ZOOM);
  const fetchTile = typeof options.fetchTile === 'function' ? options.fetchTile : fetchShortbreadTile;
  const tiles = await fetchWithConcurrency(
    coordinates,
    FAR_CONTEXT_TILE_CONCURRENCY,
    ({ x, y }, signal) => fetchTile(FAR_WATER_CONTEXT_ZOOM, x, y, { signal }),
    options.signal
  );
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
          const simplifiedOuter = simplifyFarWaterRing(outer);
          if (simplifiedOuter.length < 4) continue;
          waterAreas.push({
            outer: simplifiedOuter,
            holes: (rings || []).slice(1)
              .filter((ring) => Array.isArray(ring) && ring.length >= 4 && ringSpanMeters(ring) >= FAR_WATER_MIN_SPAN_METERS * 0.5)
              .map(simplifyFarWaterRing),
            bounds: ringBounds(simplifiedOuter),
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
    waterZoom: FAR_WATER_CONTEXT_ZOOM
  };
}

async function loadFarMappedContext(bounds, excludedBounds = null, waterBounds = bounds, options = {}) {
  const coordinates = contextTileCoordinates(bounds, FAR_CONTEXT_ZOOM);
  const fetchTile = typeof options.fetchTile === 'function' ? options.fetchTile : fetchShortbreadTile;
  const [tiles, waterContext] = await Promise.all([
    fetchWithConcurrency(
      coordinates,
      FAR_CONTEXT_TILE_CONCURRENCY,
      ({ x, y }, signal) => fetchTile(FAR_CONTEXT_ZOOM, x, y, { signal }),
      options.signal
    ),
    loadFarMappedWaterContext(waterBounds, { ...options, fetchTile })
  ]);
  const landByTile = new Map();
  const buildings = [];
  let skippedNearBuildings = 0;

  for (const tileRecord of tiles) {
    const tileKey = `${tileRecord.x}/${tileRecord.y}`;
    const landPolygons = [];
    for (const layerName of ['land', 'sites']) {
      const layer = tileRecord.tile.layers[layerName];
      if (!layer) continue;
      for (let index = 0; index < layer.length; index += 1) {
        const feature = layer.feature(index);
        const geojson = feature?.toGeoJSON?.(tileRecord.x, tileRecord.y, tileRecord.z);
        const landClass = farLandClass(geojson?.properties?.kind);
        if (!landClass) continue;
        for (const ring of polygonRings(geojson.geometry)) {
          if (ring.length < 4) continue;
          landPolygons.push({ landClass, ring, bounds: ringBounds(ring) });
        }
      }
    }
    landByTile.set(tileKey, landPolygons);

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
    landByTile,
    ...waterContext,
    skippedNearBuildings,
    loadedTiles: tiles.length,
    requestedTiles: coordinates.length
  };
}

function mappedSurfaceColor(latitude, longitude, mappedContext) {
  if (!mappedContext) return null;
  const n = 2 ** FAR_CONTEXT_ZOOM;
  const safeLat = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const x = Math.floor((longitude + 180) / 360 * n);
  const y = Math.floor((1 - Math.log(
    Math.tan(safeLat * Math.PI / 180) + 1 / Math.cos(safeLat * Math.PI / 180)
  ) / Math.PI) / 2 * n);
  const candidates = mappedContext.landByTile.get(`${x}/${y}`) || [];
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    if (latitude < candidate.bounds.minLat || latitude > candidate.bounds.maxLat ||
        longitude < candidate.bounds.minLon || longitude > candidate.bounds.maxLon) continue;
    if (pointInLonLatRing(longitude, latitude, candidate.ring)) {
      return FAR_LAND_COLORS[candidate.landClass] || null;
    }
  }
  return null;
}

export {
  FAR_CONTEXT_MAX_BUILDINGS,
  FAR_CONTEXT_ZOOM,
  FAR_WATER_CONTEXT_ZOOM,
  FAR_WATER_MIN_SPAN_METERS,
  loadFarMappedContext,
  loadFarMappedWaterContext,
  mappedSurfaceColor,
  pointInLonLatRing
};
