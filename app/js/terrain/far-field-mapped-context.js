import {
  fetchShortbreadTile,
  vectorTileRangeForBounds
} from "../world/shortbread-source.js?v=15";
import { runBoundedProviderBatch } from '../earth-core/bounded-provider-batch.js?v=1';
import { yieldToMainThread } from '../world/cooperative-scheduling.js?v=1';

const FAR_CONTEXT_ZOOM = 14;
const FAR_WATER_CONTEXT_ZOOM = 11;
// Detailed city buildings remain complete. The fixed regional ring is an
// aerial continuity LOD: retain a spatially distributed subset and publish
// most of it as inexpensive oriented instances instead of converting nearly
// a million source footprints that are not individually resolvable.
const FAR_CONTEXT_MAX_BUILDINGS = 9000;
const FAR_CONTEXT_BUILDING_COVERAGE_TARGET = 0.45;
const FAR_CONTEXT_MAX_BUILDING_INSTANCES = 280000;
// The building layer is available at z14, not at the lower generalized zooms.
// A 14 km half-extent needs roughly 400 tiles at London's latitude, so this
// budget must cover every shipped fixed-location preset before zoom selection
// is allowed to step down. Terrain and mapped water retain their own smaller
// requests; this budget governs the one regional-building publication pass.
const FAR_CONTEXT_BUILDING_MAX_TILES = 512;
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

function farBuildingBoxDescriptor(ring, properties, identity) {
  const bounds = ringBounds(ring);
  const centerLat = (bounds.minLat + bounds.maxLat) * 0.5;
  const centerLon = (bounds.minLon + bounds.maxLon) * 0.5;
  if (![centerLat, centerLon].every(Number.isFinite)) return null;
  const eastMetersPerDegree = Math.max(1000, 111320 * Math.cos(centerLat * Math.PI / 180));
  const points = (ring || []).map((coordinate) => ({
    x: (Number(coordinate?.[0]) - centerLon) * eastMetersPerDegree,
    z: -(Number(coordinate?.[1]) - centerLat) * 110540
  })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.z));
  if (points.length < 3) return null;
  let meanX = 0;
  let meanZ = 0;
  for (const point of points) {
    meanX += point.x / points.length;
    meanZ += point.z / points.length;
  }
  let xx = 0;
  let xz = 0;
  let zz = 0;
  for (const point of points) {
    const dx = point.x - meanX;
    const dz = point.z - meanZ;
    xx += dx * dx;
    xz += dx * dz;
    zz += dz * dz;
  }
  const axisAngle = 0.5 * Math.atan2(2 * xz, xx - zz);
  const axisX = Math.cos(axisAngle);
  const axisZ = Math.sin(axisAngle);
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  let signedArea = 0;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const point = points[index];
    const u = point.x * axisX + point.z * axisZ;
    const v = -point.x * axisZ + point.z * axisX;
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
    signedArea += points[previous].x * point.z - point.x * points[previous].z;
  }
  const areaMeters = Math.abs(signedArea) * 0.5;
  const widthMeters = maxU - minU;
  const depthMeters = maxV - minV;
  if (![areaMeters, widthMeters, depthMeters].every(Number.isFinite) ||
      areaMeters < 14 || areaMeters > 350000 || widthMeters <= 0.5 || depthMeters <= 0.5) return null;
  const centerU = (minU + maxU) * 0.5;
  const centerV = (minV + maxV) * 0.5;
  const eastOffset = centerU * axisX - centerV * axisZ;
  const southOffset = centerU * axisZ + centerV * axisX;
  return {
    ring,
    properties,
    priority: areaMeters,
    centerLat: centerLat - southOffset / 110540,
    centerLon: centerLon + eastOffset / eastMetersPerDegree,
    widthMeters,
    depthMeters,
    areaMeters,
    rotationY: -axisAngle,
    identity
  };
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

function roundRobinSelect(buckets, maxCount) {
  const active = buckets
    .filter((bucket) => Array.isArray(bucket) && bucket.length > 0)
    .map((bucket) => ({ bucket, index: 0 }));
  const selected = [];
  let index = 0;
  while (active.length > 0 && selected.length < maxCount) {
    const cursor = active[index];
    selected.push(cursor.bucket[cursor.index]);
    cursor.index += 1;
    if (cursor.index >= cursor.bucket.length) {
      active.splice(index, 1);
      if (active.length === 0) break;
      index %= active.length;
    } else {
      index = (index + 1) % active.length;
    }
  }
  return selected;
}

function distributedFeatureIndices(featureCount, selectedCount) {
  const count = Math.max(0, Math.floor(Number(featureCount) || 0));
  const target = Math.max(0, Math.min(count, Math.floor(Number(selectedCount) || 0)));
  if (target === count) return Array.from({ length: count }, (_, index) => index);
  const indices = [];
  for (let sample = 0; sample < target; sample += 1) {
    indices.push(Math.min(count - 1, Math.floor((sample + 0.5) * count / target)));
  }
  return indices;
}

function selectSpatiallyDistributedBuildings(buildings, maxCount) {
  if (buildings.length <= maxCount) return buildings;
  const finite = buildings.filter((building) => (
    Number.isFinite(building.centerLat) && Number.isFinite(building.centerLon)
  ));
  if (finite.length <= maxCount) return finite;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const building of finite) {
    minLat = Math.min(minLat, building.centerLat);
    maxLat = Math.max(maxLat, building.centerLat);
    minLon = Math.min(minLon, building.centerLon);
    maxLon = Math.max(maxLon, building.centerLon);
  }
  const gridSize = 12;
  const buckets = new Map();
  for (const building of finite) {
    const row = Math.min(gridSize - 1, Math.floor(
      (building.centerLat - minLat) / Math.max(1e-9, maxLat - minLat) * gridSize
    ));
    const column = Math.min(gridSize - 1, Math.floor(
      (building.centerLon - minLon) / Math.max(1e-9, maxLon - minLon) * gridSize
    ));
    const key = row * gridSize + column;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(building);
  }
  const orderedBuckets = [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, bucket]) => bucket.sort((a, b) => (
      b.priority - a.priority || String(a.identity).localeCompare(String(b.identity))
    )));
  return roundRobinSelect(orderedBuckets, maxCount);
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

  for (let tileIndex = 0; tileIndex < tiles.length; tileIndex += 1) {
    const tileRecord = tiles[tileIndex];
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
    : selectContextZoomForTileBudget(
        bounds,
        FAR_CONTEXT_ZOOM,
        FAR_CONTEXT_BUILDING_MAX_TILES
      );
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
  const buildingBuckets = [];
  let skippedNearBuildings = 0;
  let availableBuildings = 0;
  const perTileBuildingBudget = Math.max(
    1,
    Math.ceil(FAR_CONTEXT_MAX_BUILDING_INSTANCES / Math.max(1, tiles.length))
  );

  for (let tileIndex = 0; tileIndex < tiles.length; tileIndex += 1) {
    const tileRecord = tiles[tileIndex];
    const buildingLayer = tileRecord.tile.layers.buildings;
    if (!buildingLayer) continue;
    const tileBuildings = [];
    let remainingTileBudget = perTileBuildingBudget;
    for (let index = 0; index < buildingLayer.length; index += 1) {
      const feature = buildingLayer.feature(index);
      const geojson = feature?.toGeoJSON?.(tileRecord.x, tileRecord.y, tileRecord.z);
      const rings = polygonRings(geojson?.geometry);
      availableBuildings += rings.length;
      const selectedRingIndices = distributedFeatureIndices(
        rings.length,
        Math.min(
          remainingTileBudget,
          Math.ceil(rings.length * FAR_CONTEXT_BUILDING_COVERAGE_TARGET)
        )
      );
      remainingTileBudget -= selectedRingIndices.length;
      for (const ringIndex of selectedRingIndices) {
        const ring = rings[ringIndex];
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
        const descriptor = farBuildingBoxDescriptor(
          ring,
          geojson.properties || {},
          `${tileRecord.x}/${tileRecord.y}/${feature.id ?? index}/${tileBuildings.length}`
        );
        if (descriptor) tileBuildings.push(descriptor);
      }
      if (remainingTileBudget <= 0) break;
    }
    buildingBuckets.push(tileBuildings);
    if ((tileIndex + 1) % 2 === 0) await yieldToMainThread();
  }

  const selectedBuildingTarget = Math.min(
    FAR_CONTEXT_MAX_BUILDING_INSTANCES,
    buildingBuckets.reduce((total, bucket) => total + bucket.length, 0)
  );
  const selectedBuildings = roundRobinSelect(buildingBuckets, selectedBuildingTarget);
  const exactBuildingIds = new Set(selectSpatiallyDistributedBuildings(
    selectedBuildings.slice(),
    Math.min(FAR_CONTEXT_MAX_BUILDINGS, selectedBuildings.length)
  ).map((building) => building.identity));
  const buildings = selectedBuildings.map((building) => exactBuildingIds.has(building.identity)
    ? building
    : { ...building, ring: null });

  return {
    buildings,
    availableBuildings,
    selectedBuildingTarget,
    selectedBuildingCoverage: availableBuildings > 0 ? buildings.length / availableBuildings : 1,
    ...waterContext,
    skippedNearBuildings,
    contextZoom,
    loadedTiles: tiles.length,
    requestedTiles: coordinates.length,
    contextMaxInFlight: contextBatch.metrics.maxInFlight
  };
}

export {
  FAR_CONTEXT_BUILDING_COVERAGE_TARGET,
  FAR_CONTEXT_MAX_BUILDINGS,
  FAR_CONTEXT_MAX_BUILDING_INSTANCES,
  FAR_CONTEXT_BUILDING_MAX_TILES,
  FAR_CONTEXT_ZOOM,
  FAR_WATER_CONTEXT_ZOOM,
  FAR_WATER_MIN_SPAN_METERS,
  distributedFeatureIndices,
  loadFarMappedContext,
  loadFarMappedWaterContext,
  pointInLonLatRing,
  pointInMappedWaterArea,
  retainFarWaterRing,
  roundRobinSelect,
  selectSpatiallyDistributedBuildings,
  selectContextZoomForTileBudget
};
