import {FAR_CONTEXT_MAX_BUILDINGS,FAR_CONTEXT_BUILDING_COVERAGE_TARGET,FAR_CONTEXT_MAX_BUILDING_INSTANCES,
  ringBounds,farBuildingBoxDescriptor,farBuildingPriority,selectFarBuildingCoverage,
  roundRobinSelect,distributedFeatureIndices,selectSpatiallyDistributedBuildings} from './far-building-selection.js';
import {createRegionalBuildingWorker} from './regional-building-runtime.js';
import { createRegionalRoadCoveragePlan } from './regional-road-coverage.js';
import {createGeographicRingIndex} from './geographic-ring-index.js';
import {
  fetchShortbreadTile,
  vectorTileRangeForBounds
} from "../world/shortbread-source.js?v=20";
import { runBoundedProviderBatch } from '../earth-core/bounded-provider-batch.js?v=1';
import { yieldToMainThread } from '../world/cooperative-scheduling.js?v=1';
import { regionalBuildingTileOwnsUrbanSurface } from '../surface-rules-local.js?v=4';
import { mappedGroundProfile } from './mapped-ground-evidence.js';

const FAR_CONTEXT_ZOOM = 14;
const FAR_WATER_CONTEXT_ZOOM = 11;
// Coverage and geometric detail have separate budgets. Keep almost all valid
// mapped footprints; only a bounded subset receives polygon-exact geometry.
// The safety ceiling bounds instance buffers, never an equal quota per tile.
// The building layer is available at z14, not at the lower generalized zooms.
// A 14 km half-extent needs roughly 400 tiles at London's latitude, so this
// budget must cover every shipped fixed-location preset before zoom selection
// is allowed to step down. Terrain and mapped water retain their own smaller
// requests; this budget governs the one regional-building publication pass.
const FAR_CONTEXT_BUILDING_MAX_TILES = 512;
const FAR_CONTEXT_TILE_CONCURRENCY = 8;
const FAR_WATER_MIN_SPAN_METERS = 200;
const FAR_LAND_SURFACE_PROFILES = Object.freeze({
  urban: Object.freeze({ mode: 'urban', tint: [0.76, 0.78, 0.80], priority: 1 })
});

function mappedLandSurfaceProfile(kind = '', tags = {}) {
  return mappedGroundProfile(kind, tags);
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

function ringSpanMeters(ring) {
  const bounds = ringBounds(ring);
  const centerLatitude = (bounds.minLat + bounds.maxLat) * 0.5;
  const northSouth = (bounds.maxLat - bounds.minLat) * 110540;
  const eastWest = (bounds.maxLon - bounds.minLon) * 111320 * Math.cos(centerLatitude * Math.PI / 180);
  return Math.max(northSouth, eastWest);
}

const geographicRingIndexes=new WeakMap();

function retainFarWaterRing(ring) {
  const source = (ring || []).filter((coordinate) => (
    Number.isFinite(Number(coordinate?.[0])) &&
    Number.isFinite(Number(coordinate?.[1]))
  ));
  if (source.length < 3) return [];
  const first = source[0];
  const last = source.at(-1);
  const closed=first[0]===last[0]&&first[1]===last[1]?source:[...source,first];
  const retained=Object.freeze(closed.map(point=>Object.freeze([...point])));
  geographicRingIndexes.set(retained,createGeographicRingIndex(retained));
  return retained;
}

function pointInLonLatRing(lon, lat, ring) {
  const indexed=geographicRingIndexes.get(ring);
  if(indexed)return indexed(lon,lat);
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = Number(ring[i]?.[0]);
    const yi = Number(ring[i]?.[1]);
    const xj = Number(ring[j]?.[0]);
    const yj = Number(ring[j]?.[1]);
    if (!Number.isFinite(xi) || !Number.isFinite(yi) ||
        !Number.isFinite(xj) || !Number.isFinite(yj)) continue;
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
  for (const hole of area?.holes || []) {
    if (pointInLonLatRing(lon, lat, hole)) return false;
  }
  return true;
}

function pointInMappedLandArea(lon, lat, area) {
  const bounds = area?.bounds;
  if (
    bounds &&
    (lon < bounds.minLon || lon > bounds.maxLon || lat < bounds.minLat || lat > bounds.maxLat)
  ) return false;
  if (!pointInLonLatRing(lon, lat, area?.outer || [])) return false;
  for (const hole of area?.holes || []) {
    if (pointInLonLatRing(lon, lat, hole)) return false;
  }
  return true;
}

function createLandAreaSpatialBucket(areas, gridSize = 16) {
  if (!Array.isArray(areas) || areas.length === 0) return null;
  const bounds = areas.reduce((result, area) => ({
    minLon: Math.min(result.minLon, Number(area?.bounds?.minLon)),
    minLat: Math.min(result.minLat, Number(area?.bounds?.minLat)),
    maxLon: Math.max(result.maxLon, Number(area?.bounds?.maxLon)),
    maxLat: Math.max(result.maxLat, Number(area?.bounds?.maxLat))
  }), { minLon: Infinity, minLat: Infinity, maxLon: -Infinity, maxLat: -Infinity });
  if (!Object.values(bounds).every(Number.isFinite)) return null;
  const lonSpan = Math.max(1e-12, bounds.maxLon - bounds.minLon);
  const latSpan = Math.max(1e-12, bounds.maxLat - bounds.minLat);
  const size = Math.max(4, Math.floor(Number(gridSize) || 16));
  const cells = Array.from({ length: size * size }, () => []);
  const cellIndex = (lon, lat) => {
    const x = Math.max(0, Math.min(size - 1, Math.floor((lon - bounds.minLon) / lonSpan * size)));
    const y = Math.max(0, Math.min(size - 1, Math.floor((lat - bounds.minLat) / latSpan * size)));
    return { x, y };
  };
  // `areas` is already priority-sorted. Inserting in that order preserves the
  // exact winner chosen by the prior full-bucket scan while reducing each
  // vertex to only polygons whose bounds overlap its small cell.
  for (const area of areas) {
    const min = cellIndex(Number(area.bounds.minLon), Number(area.bounds.minLat));
    const max = cellIndex(Number(area.bounds.maxLon), Number(area.bounds.maxLat));
    for (let y = min.y; y <= max.y; y += 1) {
      for (let x = min.x; x <= max.x; x += 1) cells[y * size + x].push(area);
    }
  }
  return { bounds, cells, latSpan, lonSpan, size };
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

function limitContextTiles(coordinates, maxTiles) {
  if (coordinates.length <= maxTiles) return coordinates;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const tile of coordinates) {
    minX = Math.min(minX, tile.x); maxX = Math.max(maxX, tile.x);
    minY = Math.min(minY, tile.y); maxY = Math.max(maxY, tile.y);
  }
  const x = (minX + maxX) * .5, y = (minY + maxY) * .5;
  return coordinates.sort((a, b) =>
    Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y) || a.x - b.x || a.y - b.y
  ).slice(0, maxTiles);
}

function retryableTileFailure(error) {
  // Parent/world cancellation is handled by the batch owner. A timeout of an
  // otherwise healthy visible window is recoverable; denied/missing tiles and
  // provider cooldowns are not. Never defeat a provider's rate-limit policy.
  if (/HTTP\s+(403|404|429)\b|cooldown|recovery probe/i.test(String(error?.message))) return false;
  return ['AbortError','TimeoutError','TypeError'].includes(error?.name) ||
    /HTTP\s+(408|5\d\d)\b|Provider batch deadline/i.test(String(error?.message));
}

async function fetchWithConcurrency(items, concurrency, worker, signal = null, options = {}) {
  const { settled, metrics } = await runBoundedProviderBatch(
    items,
    (item, _index, batchSignal) => worker(item, batchSignal),
    { signal, concurrency, maxElapsedMs:options.maxElapsedMs ?? 30000, abortMessage: 'Far mapped context aborted' }
  );
  const failed = [];
  for(let index=0;index<settled.length;index++)if(settled[index].status==='rejected')failed.push(index);
  let recovery=null;
  // Healthy large windows can miss a small tail at the primary deadline.
  // Recover at most 5% (minimum 8, absolute maximum 32) once, still with two
  // requests and a 10s deadline. Outages/denials never double the request set.
  const recoveryLimit = Math.max(8, Math.min(32, Math.ceil(items.length * .05)));
  if(failed.length>0 && failed.length<=recoveryLimit && metrics.fulfilled>=Math.max(1,Math.floor(items.length*.9))){
    const eligible=failed.filter(index=>retryableTileFailure(settled[index].reason));
    if(eligible.length){
      const retried=await runBoundedProviderBatch(eligible,
        (index,_retryIndex,retrySignal)=>worker(items[index],retrySignal),
        {signal,concurrency:2,maxElapsedMs:options.recoveryMaxElapsedMs ?? 10000,abortMessage:'Far mapped context recovery aborted'});
      recovery=retried.metrics;
      for(let index=0;index<eligible.length;index++)settled[eligible[index]]=retried.settled[index];
    }
  }
  return {
    values: settled
      .filter((entry) => entry.status === 'fulfilled' && entry.value)
      .map((entry) => entry.value),
    metrics:Object.freeze({...metrics,recovery}),
    missingTiles:items.filter((_item,index)=>settled[index].status==='rejected')
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
    waterBatchMetrics:waterBatch.metrics,
    waterMissingTiles:waterBatch.missingTiles,
    waterZoom
  };
}

async function loadFarMappedContext(bounds, excludedBounds = null, waterBounds = bounds, options = {}) {
  // Building geometry exists only at z14. Never satisfy a request budget by
  // switching to an empty building layer. Bound requests explicitly and report
  // missing tile coverage (not 95% worldwide coverage) if the window is too big.
  const contextZoom = FAR_CONTEXT_ZOOM;
  const requestedCoordinates = contextTileCoordinates(bounds, contextZoom);
  const coordinates = limitContextTiles(requestedCoordinates, FAR_CONTEXT_BUILDING_MAX_TILES);
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
  const useWorker = typeof Worker === 'function' && tiles.every(tile => tile.bytes instanceof Uint8Array) &&
    (!options.isWithinDetailedBuildingDomain || options.detailedBuildingFrame) &&
    (!options.roadCoverageFrame || options.detailedBuildingFrame);
  const buildingWorker = useWorker ? await createRegionalBuildingWorker({
    bounds, excludedBounds, tileCount: tiles.length, detailedFrame: options.detailedBuildingFrame,
    unitsPerMeter: options.roadCoverageFrame?.unitsPerMeter || 1, maxInstances: options.maxInstances,
    roadFrame: options.roadCoverageFrame ? { bounds: options.roadCoverageFrame.bounds,
      unitsPerMeter: options.roadCoverageFrame.unitsPerMeter, maxTextureSize: options.roadCoverageFrame.maxTextureSize,
      origin: options.detailedBuildingFrame.origin, scale: options.detailedBuildingFrame.scale } : null
  }, { signal: options.signal }) : null;
  let roadCoveragePlan = options.roadCoverageFrame && !buildingWorker?.roadWorkerEnabled
    ? createRegionalRoadCoveragePlan(options.roadCoverageFrame) : null;
  const buildingBuckets = [];
  const landAreasByTile = new Map();
  const landAreaSpatialByTile = new Map();
  const surfaceFallbackByTile = new Map();
  let landAreas = 0;
  let skippedNearBuildings = 0;
  let sourceBuildings = 0;
  let invalidBuildings = 0;
  let outsideBuildings = 0;
  let sliceStarted = performance.now();

  try {
  for (let tileIndex = 0; tileIndex < tiles.length; tileIndex += 1) {
    options.signal?.throwIfAborted();
    const tileRecord = tiles[tileIndex];
    const landBucket = [];
    const streetLayer = roadCoveragePlan && tileRecord.tile.layers.streets;
    if (streetLayer) for (let i=0;i<streetLayer.length;i++) {
      const feature=streetLayer.feature(i)?.toGeoJSON?.(tileRecord.x,tileRecord.y,tileRecord.z);
      roadCoveragePlan.addGeometry(feature?.geometry,feature?.properties);
      if(performance.now()-sliceStarted>=8){options.signal?.throwIfAborted();await yieldToMainThread();sliceStarted=performance.now();}
    }
    for (const layerName of ['land', 'sites']) {
      const layer = tileRecord.tile.layers[layerName];
      if (!layer) continue;
      for (let index = 0; index < layer.length; index += 1) {
        const feature = layer.feature(index);
        const geojson = feature?.toGeoJSON?.(tileRecord.x, tileRecord.y, tileRecord.z);
        const profile = mappedLandSurfaceProfile(geojson?.properties?.kind, geojson?.properties);
        if (!profile) continue;
        for (const rings of polygonAreas(geojson?.geometry)) {
          const outer = retainFarWaterRing(rings?.[0]);
          if (outer.length < 4) continue;
          landBucket.push({
            outer,
            holes: (rings || []).slice(1).map(retainFarWaterRing).filter((ring) => ring.length >= 4),
            bounds: ringBounds(outer),
            tint: profile.tint,
            mode: profile.mode,
            priority: profile.priority,
            evidence: profile.evidence,
            sourceFeatureId: `shortbread:${layerName}:${tileRecord.z}:${tileRecord.x}:${tileRecord.y}:${feature.id ?? index}`,
            kind: String(geojson?.properties?.kind || '')
          });
        }
      }
    }
    if (landBucket.length > 0) {
      const area = (entry) => (entry.bounds.maxLon - entry.bounds.minLon) *
        (entry.bounds.maxLat - entry.bounds.minLat);
      landBucket.sort((left, right) => Number(right.priority || 0) - Number(left.priority || 0) ||
        area(left) - area(right) || left.sourceFeatureId.localeCompare(right.sourceFeatureId));
      const tileKey = `${tileRecord.z}/${tileRecord.x}/${tileRecord.y}`;
      landAreasByTile.set(tileKey, landBucket);
      landAreaSpatialByTile.set(tileKey, createLandAreaSpatialBucket(landBucket));
      landAreas += landBucket.length;
    }
    if (buildingWorker) {
      const { tileAvailableBuildings } = await buildingWorker.addTile(tileRecord);
      if (regionalBuildingTileOwnsUrbanSurface(tileAvailableBuildings)) surfaceFallbackByTile.set(
        `${tileRecord.z}/${tileRecord.x}/${tileRecord.y}`, FAR_LAND_SURFACE_PROFILES.urban);
      continue;
    }
    const buildingLayer = tileRecord.tile.layers.buildings;
    if (!buildingLayer) {
      if ((tileIndex + 1) % 2 === 0) await yieldToMainThread();
      continue;
    }
    const tileBuildings = [];
    let tileAvailableBuildings = 0;
    for (let index = 0; index < buildingLayer.length; index += 1) {
      const feature = buildingLayer.feature(index);
      const geojson = feature?.toGeoJSON?.(tileRecord.x, tileRecord.y, tileRecord.z);
      const rings = polygonRings(geojson?.geometry);
      sourceBuildings += rings.length;
      tileAvailableBuildings += rings.length;
      for (let ringIndex = 0; ringIndex < rings.length; ringIndex++) {
        const ring = rings[ringIndex];
        if (ring.length < 4) { invalidBuildings++; continue; }
        const footprintBounds = ringBounds(ring);
        const centerLat = (footprintBounds.minLat + footprintBounds.maxLat) * 0.5;
        const centerLon = (footprintBounds.minLon + footprintBounds.maxLon) * 0.5;
        if (centerLat < bounds.latS || centerLat > bounds.latN || centerLon < bounds.lonW || centerLon > bounds.lonE) {
          outsideBuildings++; continue;
        }
        if (excludedBounds &&
            centerLat >= excludedBounds.latS && centerLat <= excludedBounds.latN &&
            centerLon >= excludedBounds.lonW && centerLon <= excludedBounds.lonE &&
            (typeof options.isWithinDetailedBuildingDomain !== 'function' ||
              options.isWithinDetailedBuildingDomain(centerLat, centerLon))) {
          skippedNearBuildings += 1;
          continue;
        }
        const descriptor = farBuildingBoxDescriptor(
          ring,
          geojson.properties || {},
          `${tileRecord.x}/${tileRecord.y}/${feature.id ?? index}/${ringIndex}`
        );
        if (descriptor) tileBuildings.push(descriptor);
        else invalidBuildings++;
        if (performance.now() - sliceStarted >= 8) {
          options.signal?.throwIfAborted();
          await yieldToMainThread();
          sliceStarted = performance.now();
        }
      }
    }
    if (regionalBuildingTileOwnsUrbanSurface(tileAvailableBuildings)) {
      surfaceFallbackByTile.set(
        `${tileRecord.z}/${tileRecord.x}/${tileRecord.y}`,
        FAR_LAND_SURFACE_PROFILES.urban
      );
    }
    // Retain only a small exact-shape candidate set per source tile. Compact
    // descriptors retain EVERY eligible building until the global selection;
    // hundreds of thousands of source polygon arrays need not survive decoding.
    const exactCandidates = Math.max(32, Math.ceil(FAR_CONTEXT_MAX_BUILDINGS / Math.max(1, tiles.length)) * 2);
    tileBuildings.sort((a, b) => b.priority - a.priority || a.identity.localeCompare(b.identity));
    for (let i = exactCandidates; i < tileBuildings.length; i++) tileBuildings[i].ring = null;
    buildingBuckets.push(tileBuildings);
    if ((tileIndex + 1) % 2 === 0) await yieldToMainThread();
  }

  const selection = buildingWorker ? await buildingWorker.finish() : selectFarBuildingCoverage(buildingBuckets, options);
  if (buildingWorker) {
    ({ sourceBuildings, invalidBuildings, outsideBuildings, skippedNearBuildings } = selection);
    roadCoveragePlan = selection.roadCoveragePlan || roadCoveragePlan;
  }
  const { availableBuildings, selectedBuildingTarget, buildings } = selection;
  if (!buildingWorker) {
  const exactBuildingIds = new Set(selectSpatiallyDistributedBuildings(
    buildings.filter(building => building.ring),
    FAR_CONTEXT_MAX_BUILDINGS
  ).map((building) => building.identity));
  for (const building of buildings) if (!exactBuildingIds.has(building.identity)) building.ring = null;
  }

  return {
    ...selection,
    roadCoveragePlan,
    sourceBuildings, invalidBuildings, outsideBuildings,
    buildings,
    availableBuildings,
    selectedBuildingTarget,
    selectedBuildingCoverage: availableBuildings > 0 ? buildings.length / availableBuildings : 1,
    ...waterContext,
    skippedNearBuildings,
    contextZoom,
    loadedTiles: tiles.length,
    requestedTiles: requestedCoordinates.length,
    scheduledTiles: coordinates.length,
    sourceCoverageComplete: tiles.length === requestedCoordinates.length,
    coverageStatus: tiles.length !== requestedCoordinates.length ? 'incomplete-source'
      : selection.buildingBudgetExceeded ? 'incomplete-budget' : 'complete',
    contextMaxInFlight: contextBatch.metrics.maxInFlight,
    contextBatchMetrics:contextBatch.metrics,
    contextMissingTiles:contextBatch.missingTiles,
    landAreas,
    landAreasByTile,
    landAreaSpatialByTile,
    surfaceFallbackByTile
  };
  } catch (error) {
    roadCoveragePlan?.dispose();
    throw error;
  } finally { buildingWorker?.dispose(); }
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
  limitContextTiles,
  farBuildingPriority,
  selectFarBuildingCoverage,
  loadFarMappedContext,
  loadFarMappedWaterContext,
  pointInLonLatRing,
  pointInMappedLandArea,
  pointInMappedWaterArea,
  retainFarWaterRing,
  roundRobinSelect,
  selectSpatiallyDistributedBuildings,
  selectContextZoomForTileBudget,
  fetchWithConcurrency
};
