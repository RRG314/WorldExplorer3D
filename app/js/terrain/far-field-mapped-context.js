import {
  fetchShortbreadTile,
  vectorTileRangeForBounds
} from "../world/shortbread-source.js?v=9";

const FAR_CONTEXT_ZOOM = 14;
const FAR_CONTEXT_MAX_BUILDINGS = 10000;
const FAR_CONTEXT_TILE_CONCURRENCY = 8;

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

function contextTileCoordinates(bounds) {
  const range = vectorTileRangeForBounds(
    bounds.latS,
    bounds.lonW,
    bounds.latN,
    bounds.lonE,
    FAR_CONTEXT_ZOOM
  );
  const coordinates = [];
  for (let x = range.xMin; x <= range.xMax; x += 1) {
    for (let y = range.yMin; y <= range.yMax; y += 1) coordinates.push({ x, y });
  }
  return coordinates;
}

async function fetchWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await worker(items[index]);
      } catch {
        results[index] = null;
      }
    }
  });
  await Promise.all(runners);
  return results.filter(Boolean);
}

async function loadFarMappedContext(bounds, excludedBounds = null) {
  const coordinates = contextTileCoordinates(bounds);
  const tiles = await fetchWithConcurrency(
    coordinates,
    FAR_CONTEXT_TILE_CONCURRENCY,
    ({ x, y }) => fetchShortbreadTile(FAR_CONTEXT_ZOOM, x, y)
  );
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
  loadFarMappedContext,
  mappedSurfaceColor
};
