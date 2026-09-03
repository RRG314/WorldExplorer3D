// The mapped context must cover the fixed location visible from the map and
// aerial modes. Eight kilometres ended before northern Manhattan and exposed
// terrain-only sectors in nearby New Jersey even though the 22 km terrain LOD
// remained visible. Fourteen kilometres covers a complete metropolitan view
// without turning movement into a streaming trigger.
const FIXED_REGIONAL_CONTEXT_RADIUS_METERS = 14000;
const LATITUDE_METERS_PER_DEGREE = 110540;
const LONGITUDE_METERS_PER_DEGREE = 111320;

function longitudeMetersPerDegree(latitude) {
  return Math.max(
    1000,
    LONGITUDE_METERS_PER_DEGREE * Math.cos(Number(latitude || 0) * Math.PI / 180)
  );
}

export function fixedRegionalContextBounds(location, radiusMeters = FIXED_REGIONAL_CONTEXT_RADIUS_METERS) {
  const lat = Number(location?.lat);
  const lon = Number(location?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error('Fixed regional context requires a valid location.');
  }
  const radius = Math.max(1000, Number(radiusMeters) || FIXED_REGIONAL_CONTEXT_RADIUS_METERS);
  const latitudeRadius = radius / LATITUDE_METERS_PER_DEGREE;
  const longitudeRadius = radius / longitudeMetersPerDegree(lat);
  return Object.freeze({
    minLat: Math.max(-85.05112878, lat - latitudeRadius),
    minLon: Math.max(-180, lon - longitudeRadius),
    maxLat: Math.min(85.05112878, lat + latitudeRadius),
    maxLon: Math.min(180, lon + longitudeRadius)
  });
}

function distanceFromLocationMeters(node, location) {
  const north = (Number(node?.lat) - Number(location?.lat)) * LATITUDE_METERS_PER_DEGREE;
  const east = (Number(node?.lon) - Number(location?.lon)) * longitudeMetersPerDegree(location?.lat);
  return Math.hypot(north, east);
}

function mappedTagIsPresent(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized !== '' && normalized !== 'no' && normalized !== 'false' &&
    normalized !== '0' && normalized !== 'none';
}

function isEngineeredTransportWay(element) {
  const tags = element?.tags || {};
  return mappedTagIsPresent(tags.bridge) ||
    mappedTagIsPresent(tags.tunnel) ||
    mappedTagIsPresent(tags.covered) ||
    String(tags.location || '').trim().toLowerCase() === 'underground' ||
    (Number.isFinite(Number(tags.layer)) && Number(tags.layer) !== 0);
}

export function selectDetailedCoreTransport(data = {}) {
  const elements = Array.isArray(data?.elements) ? data.elements : [];
  const roadWays = elements.filter((element) =>
    element?.type === 'way' &&
    element?.tags?.highway &&
    String(element?.tags?._sourceFeatureId || '').startsWith('shortbread:streets:')
  );
  const roadWayIds = new Set(roadWays.map((way) => way.id));
  const nodeIds = new Set(roadWays.flatMap((way) => (way.nodes || []).map(String)));
  return {
    ...data,
    elements: elements.filter((element) =>
      (element?.type === 'way' && roadWayIds.has(element.id)) ||
      (element?.type === 'node' && nodeIds.has(String(element.id)))
    ),
    _overpassSource: 'shortbread-vector-z14-core'
  };
}

export function retainRegionalTransportOutsideCore(data, options = {}) {
  const location = options.location;
  const coreRadiusMeters = Math.max(0, Number(options.coreRadiusMeters) || 0);
  const overlapRadiusMeters = Math.max(
    0,
    Number(options.overlapRadiusMeters) || coreRadiusMeters * 0.82
  );
  const elements = Array.isArray(data?.elements) ? data.elements : [];
  const nodes = new Map(
    elements
      .filter((element) => element?.type === 'node')
      .map((node) => [node.id, node])
  );
  const includeCore = options.includeCore === true;
  const excludeCoreCrossingWays = options.excludeCoreCrossingWays === true;
  const retainCoreStructureFallbacks = options.retainCoreStructureFallbacks !== false;
  const classifiedWays = elements.map((element) => {
    if (element?.type !== 'way' || !Array.isArray(element.nodes)) return false;
    const points = element.nodes.map((id) => nodes.get(id)).filter(Boolean);
    if (points.length < 2) return null;
    const pointDistances = points.map((point) => distanceFromLocationMeters(point, location));
    const reachesRegionalDomain = pointDistances.some((distance) => distance >= overlapRadiusMeters);
    const entersCoreDomain = pointDistances.some((distance) => distance < overlapRadiusMeters);
    // A detailed Shortbread core and its coarse regional LOD must not render
    // the same physical segment. The detailed core deliberately extends past
    // this handoff ring, so discard z13 ways that cross back into its domain.
    const regional = reachesRegionalDomain && !(excludeCoreCrossingWays && entersCoreDomain);
    const coreStructureFallback = retainCoreStructureFallbacks && !regional && !includeCore &&
      isEngineeredTransportWay(element);
    if (!regional && !includeCore && !coreStructureFallback) return null;
    return {
      ...element,
      tags: {
        ...element.tags,
        ...(regional || coreStructureFallback
          ? { _regionalContext: 'fixed-location' }
          : {}),
        ...(coreStructureFallback
          ? { _fallbackStructureAuthority: 'generalized' }
          : {}),
        _sourceCompleteness: 'generalized'
      }
    };
  });
  const retainedWays = classifiedWays.filter(Boolean);
  const retainedNodeIds = new Set(retainedWays.flatMap((way) => way.nodes));
  const retainedNodes = elements.filter(
    (element) => element?.type === 'node' && retainedNodeIds.has(element.id)
  );
  return {
    ...data,
    elements: [...retainedNodes, ...retainedWays],
    _regionalContext: {
      radiusMeters: Number(options.radiusMeters) || FIXED_REGIONAL_CONTEXT_RADIUS_METERS,
      coreRadiusMeters,
      retainedWays: retainedWays.length,
      retainedRoads: retainedWays.filter((way) => way.tags?.highway).length,
      retainedCoreStructureFallbacks: retainedWays.filter(
        (way) => way.tags?._fallbackStructureAuthority === 'generalized'
      ).length,
      retainedNodes: retainedNodes.length
    }
  };
}

export function mergeFixedRegionalTransport(primaryData, regionalData) {
  const primaryElements = Array.isArray(primaryData?.elements) ? primaryData.elements : [];
  const regionalElements = Array.isArray(regionalData?.elements) ? regionalData.elements : [];
  const usedIds = new Set(primaryElements.map((element) => element?.id).filter(Number.isFinite));
  let nextId = -2;
  for (const id of usedIds) nextId = Math.min(nextId, id - 1);
  const regionalNodeIds = new Map();
  for (const element of regionalElements) {
    if (element?.type !== 'node' || !Number.isFinite(element.id)) continue;
    regionalNodeIds.set(element.id, nextId--);
  }
  const remappedRegionalElements = regionalElements.map((element) => {
    if (element?.type === 'node') return { ...element, id: regionalNodeIds.get(element.id) ?? nextId-- };
    if (element?.type === 'way') {
      return {
        ...element,
        id: nextId--,
        nodes: (element.nodes || []).map((id) => regionalNodeIds.get(id)).filter(Number.isFinite)
      };
    }
    return { ...element, id: nextId-- };
  });
  return {
    ...primaryData,
    elements: [...primaryElements, ...remappedRegionalElements],
    _fixedRegionalContext: regionalData?._regionalContext || null,
    _fixedRegionalTiles: regionalData?._shortbreadTiles || null
  };
}

export function beginFixedRegionalTransportLoad(options = {}) {
  const {
    fetchWorldData,
    location,
    runProviderWork,
    radiusMeters = FIXED_REGIONAL_CONTEXT_RADIUS_METERS
  } = options;
  if (typeof fetchWorldData !== 'function' || typeof runProviderWork !== 'function') {
    throw new TypeError('Fixed regional transport requires provider and source adapters.');
  }
  // Snapshot the selected location before any asynchronous provider work starts.
  // Location switches may replace or mutate appCtx.LOC while the previous load
  // is still cancelling; that load must never continue with the new coordinates.
  const fixedLocation = Object.freeze({
    lat: Number(location?.lat),
    lon: Number(location?.lon)
  });
  if (Math.abs(fixedLocation.lat) >= 86) {
    const bounds = Object.freeze({
      minLat: fixedLocation.lat,
      minLon: fixedLocation.lon,
      maxLat: fixedLocation.lat,
      maxLon: fixedLocation.lon
    });
    return {
      bounds,
      location: fixedLocation,
      outcome: Promise.resolve({
        value: {
          elements: [],
          _shortbreadTiles: [],
          _regionalContext: { skipped: true, reason: 'polar-cryosphere-domain' }
        },
        error: null
      }),
      radiusMeters
    };
  }
  const bounds = fixedRegionalContextBounds(fixedLocation, radiusMeters);
  const outcome = runProviderWork(
    'openstreetmap-shortbread',
    'fixed-regional-context',
    (signal) => fetchWorldData({
      lat: fixedLocation.lat,
      lon: fixedLocation.lon,
      bounds,
      includeBuildings: false,
      // Outer natural surfaces are already owned by the fixed terrain and
      // WorldCover. Decode only transport needed to close the regional gap.
      layerNames: ['streets'],
      // The exact playable core already owns lossless streets. The fixed
      // 14-kilometre context needs route continuity, not a second copy of
      // every local z14 vertex. A z13 outer ring preserves the one-shot fixed
      // world while cutting decoded source tiles and peak heap by about 4x.
      preferredZoom: 13,
      maxTiles: 128,
      minimumZoom: 10,
      signal
    })
  ).then(
    (value) => ({ value, error: null }),
    (error) => ({ value: null, error })
  );
  return { bounds, location: fixedLocation, outcome, radiusMeters };
}

export async function completeFixedRegionalTransportLoad(options = {}) {
  const {
    appCtx,
    coreRadiusMeters,
    exactData,
    exactTransportLoaded,
    generalizedCoreData,
    loadMetrics,
    request
  } = options;
  const outcome = await request?.outcome;
  if (outcome?.error) throw outcome.error;
  if (!outcome?.value) throw new Error('Fixed regional transport returned no source data.');
  const generalizedCoreRoadCount = Array.isArray(generalizedCoreData?.elements)
    ? generalizedCoreData.elements.filter((element) => element?.type === 'way' && element?.tags?.highway).length
    : 0;
  const generalizedCoreLoaded = exactTransportLoaded !== true && generalizedCoreRoadCount > 0;
  const primaryCoreData = exactTransportLoaded === true ? exactData : generalizedCoreData;
  const primaryCoreLoaded = exactTransportLoaded === true || generalizedCoreLoaded;
  const regional = retainRegionalTransportOutsideCore(outcome.value, {
    location: request.location,
    coreRadiusMeters,
    includeCore: !primaryCoreLoaded,
    excludeCoreCrossingWays: generalizedCoreLoaded,
    retainCoreStructureFallbacks: exactTransportLoaded === true,
    // The detailed request covers 1.18x the playable core. Hand off inside
    // that overlap so a coarse z13 feature cannot re-enter the z14 scene and
    // publish a second, clipped bridge or ramp.
    overlapRadiusMeters: generalizedCoreLoaded ? coreRadiusMeters * 1.08 : undefined,
    radiusMeters: request.radiusMeters
  });
  const data = primaryCoreLoaded
    ? mergeFixedRegionalTransport(primaryCoreData, regional)
    : regional;
  loadMetrics.regionalTransport = {
    ...regional._regionalContext,
    coreSource: exactTransportLoaded === true
      ? 'osm-overpass-exact'
      : generalizedCoreLoaded ? 'shortbread-vector-z14' : 'shortbread-vector-z13',
    coreRoads: generalizedCoreLoaded ? generalizedCoreRoadCount : null,
    coreTiles: generalizedCoreLoaded ? generalizedCoreData?._shortbreadTiles || null : null,
    tiles: outcome.value._shortbreadTiles || null
  };
  appCtx.fixedRegionalContextBounds = request.bounds;
  appCtx.fixedRegionalContextRadiusWorld = request.radiusMeters;
  appCtx.worldTraversalRadiusWorld = Math.max(
    appCtx.worldTraversalRadiusWorld,
    request.radiusMeters - 120
  );
  return data;
}

export function fixedRegionalRoadGeometryGuards(baseGuards = {}) {
  return {
    ...baseGuards,
    maxDistanceFromOrigin: Math.max(
      Number(baseGuards.maxDistanceFromOrigin) || 0,
      FIXED_REGIONAL_CONTEXT_RADIUS_METERS + 300
    )
  };
}

export async function waitForFixedRegionalGround(
  appCtx,
  loadMetrics,
  startLoadPhase = () => {},
  endLoadPhase = () => {},
  options = {}
) {
  if (!(appCtx.fixedRegionalContextRadiusWorld > 0) ||
      typeof appCtx.waitForFarTerrainClipmap !== 'function') return false;
  startLoadPhase('waitForFixedRegionalGround');
  try {
    const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 35000);
    loadMetrics.regionalGroundReady = await appCtx.waitForFarTerrainClipmap(timeoutMs);
    loadMetrics.regionalGroundWaitTimeoutMs = timeoutMs;
    return loadMetrics.regionalGroundReady;
  } finally {
    endLoadPhase('waitForFixedRegionalGround');
  }
}

export function sampleFixedRegionalGround(appCtx, loadMetrics, latitude, longitude) {
  if (loadMetrics.regionalGroundReady !== true) return { status: 'unavailable' };
  const point = appCtx.geoToWorld(latitude, longitude);
  const worldY = appCtx.sampleFarTerrainWorldYAt?.(point.x, point.z);
  return Number.isFinite(worldY)
    ? { status: 'available', groundElevationWorld: worldY }
    : { status: 'unavailable' };
}

export {
  FIXED_REGIONAL_CONTEXT_RADIUS_METERS,
  LATITUDE_METERS_PER_DEGREE,
  LONGITUDE_METERS_PER_DEGREE
};
