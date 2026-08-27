import { fixedRegionalContextBounds } from './fixed-regional-context.js?v=8';
import { fetchBundledLandmarkData } from './landmark-source.js?v=3';

const DRIVEABLE_HIGHWAYS =
  'motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|unclassified|living_street|service';
const FALSE_STRUCTURE_VALUES = new Set(['', '0', 'false', 'no', 'none']);

function boundsExpression(bounds) {
  return `(${bounds.minLat},${bounds.minLon},${bounds.maxLat},${bounds.maxLon})`;
}

function activeStructureValue(value) {
  return !FALSE_STRUCTURE_VALUES.has(String(value ?? '').trim().toLowerCase());
}

function structureFamily(tags = {}) {
  if (activeStructureValue(tags.bridge)) return 'bridge';
  if (activeStructureValue(tags.tunnel)) return 'tunnel';
  return '';
}

function normalizedStructureName(tags = {}) {
  return String(
    tags.name || tags['bridge:name'] || tags['tunnel:name'] || tags.ref || ''
  )
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const STRUCTURE_DUPLICATE_DISTANCE_METERS = 42;
const STRUCTURE_DUPLICATE_GRID_METERS = 120;
const STRUCTURE_DUPLICATE_MIN_DIRECTION_DOT = 0.72;

function structureNodeMap(elements = []) {
  return new Map(
    elements
      .filter((element) => element?.type === 'node' && Number.isFinite(Number(element.lat)) && Number.isFinite(Number(element.lon)))
      .map((node) => [node.id, node])
  );
}

function structureNodeMapFromLookup(nodes = {}) {
  if (nodes instanceof Map) return nodes;
  const map = new Map();
  for (const node of Object.values(nodes)) {
    if (!Number.isFinite(Number(node?.lat)) || !Number.isFinite(Number(node?.lon))) continue;
    map.set(node.id, node);
    map.set(String(node.id), node);
  }
  return map;
}

function structureProjectionOriginLatitude(...nodeMaps) {
  for (const nodes of nodeMaps) {
    for (const node of nodes.values()) return Number(node.lat) || 0;
  }
  return 0;
}

function projectedStructurePoint(node, originLatitude) {
  if (!node) return null;
  const latitude = Number(node.lat);
  const longitude = Number(node.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    x: longitude * 111320 * Math.cos(originLatitude * Math.PI / 180),
    y: latitude * 110540
  };
}

function projectedStructureSegments(way, nodes, originLatitude) {
  const points = (way?.nodes || [])
    .map((nodeId) => projectedStructurePoint(nodes.get(nodeId), originLatitude))
    .filter(Boolean);
  const segments = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (!(length > 0.5)) continue;
    segments.push({
      a,
      b,
      dx: dx / length,
      dy: dy / length,
      length,
      midX: (a.x + b.x) * 0.5,
      midY: (a.y + b.y) * 0.5
    });
  }
  return segments;
}

function structureGridKey(family, x, y) {
  return `${family}:${Math.floor(x / STRUCTURE_DUPLICATE_GRID_METERS)}:${Math.floor(y / STRUCTURE_DUPLICATE_GRID_METERS)}`;
}

function pointToStructureSegmentDistance(x, y, segment) {
  const vx = segment.b.x - segment.a.x;
  const vy = segment.b.y - segment.a.y;
  const lengthSq = vx * vx + vy * vy;
  const t = lengthSq > 0
    ? Math.max(0, Math.min(1, ((x - segment.a.x) * vx + (y - segment.a.y) * vy) / lengthSq))
    : 0;
  return Math.hypot(x - (segment.a.x + vx * t), y - (segment.a.y + vy * t));
}

function buildExactStructureSpatialIndex(exactWays, exactNodes, originLatitude) {
  const index = new Map();
  const padding = STRUCTURE_DUPLICATE_DISTANCE_METERS;
  for (const way of exactWays) {
    const family = structureFamily(way.tags);
    if (!family) continue;
    for (const segment of projectedStructureSegments(way, exactNodes, originLatitude)) {
      segment.structureName = normalizedStructureName(way.tags);
      const minCellX = Math.floor((Math.min(segment.a.x, segment.b.x) - padding) / STRUCTURE_DUPLICATE_GRID_METERS);
      const maxCellX = Math.floor((Math.max(segment.a.x, segment.b.x) + padding) / STRUCTURE_DUPLICATE_GRID_METERS);
      const minCellY = Math.floor((Math.min(segment.a.y, segment.b.y) - padding) / STRUCTURE_DUPLICATE_GRID_METERS);
      const maxCellY = Math.floor((Math.max(segment.a.y, segment.b.y) + padding) / STRUCTURE_DUPLICATE_GRID_METERS);
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
          const key = `${family}:${cellX}:${cellY}`;
          if (!index.has(key)) index.set(key, []);
          index.get(key).push(segment);
        }
      }
    }
  }
  return index;
}

function generalizedStructureDuplicatesExact(way, worldNodes, originLatitude, exactSpatialIndex) {
  const family = structureFamily(way?.tags);
  if (!family) return false;
  const structureName = String(
    way.tags?._reviewedStructureName || normalizedStructureName(way.tags)
  );
  const generalizedSegments = projectedStructureSegments(way, worldNodes, originLatitude);
  if (generalizedSegments.length === 0) return false;
  let totalLength = 0;
  let matchedLength = 0;
  for (const segment of generalizedSegments) {
    totalLength += segment.length;
    const candidates = exactSpatialIndex.get(structureGridKey(family, segment.midX, segment.midY)) || [];
    const matched = candidates.some((exactSegment) => {
      if (structureName && exactSegment.structureName !== structureName) return false;
      const directionDot = Math.abs(segment.dx * exactSegment.dx + segment.dy * exactSegment.dy);
      if (directionDot < STRUCTURE_DUPLICATE_MIN_DIRECTION_DOT) return false;
      return pointToStructureSegmentDistance(segment.midX, segment.midY, exactSegment) <=
        STRUCTURE_DUPLICATE_DISTANCE_METERS;
    });
    if (matched) matchedLength += segment.length;
  }
  // An explicitly named generalized corridor must only be retired by the same
  // accepted named corridor. Spatial overlap alone remains sufficient for
  // unnamed structures. Requiring length coverage prevents a nearby crossing
  // structure from deleting an unrelated way at one point.
  return matchedLength >= Math.min(18, totalLength) && matchedLength / totalLength >= 0.35;
}

function reviewedStructureNameForGeneralized(way, worldNodes, originLatitude, reviewedSpatialIndex) {
  const family = structureFamily(way?.tags);
  if (!family) return '';
  const generalizedSegments = projectedStructureSegments(way, worldNodes, originLatitude);
  if (generalizedSegments.length === 0) return '';
  const matchedLengthByName = new Map();
  const totalLength = generalizedSegments.reduce((total, segment) => total + segment.length, 0);
  for (const segment of generalizedSegments) {
    const names = new Set();
    const candidates = reviewedSpatialIndex.get(structureGridKey(family, segment.midX, segment.midY)) || [];
    for (const exactSegment of candidates) {
      const name = String(exactSegment.structureName || '');
      if (!name) continue;
      const directionDot = Math.abs(segment.dx * exactSegment.dx + segment.dy * exactSegment.dy);
      if (directionDot < STRUCTURE_DUPLICATE_MIN_DIRECTION_DOT) continue;
      if (pointToStructureSegmentDistance(segment.midX, segment.midY, exactSegment) >
          STRUCTURE_DUPLICATE_DISTANCE_METERS) continue;
      names.add(name);
    }
    for (const name of names) {
      matchedLengthByName.set(name, (matchedLengthByName.get(name) || 0) + segment.length);
    }
  }
  return [...matchedLengthByName.entries()]
    .filter(([, matchedLength]) =>
      matchedLength >= Math.min(18, totalLength) && matchedLength / totalLength >= 0.35
    )
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] || '';
}

function isDriveableStructureWay(element) {
  if (element?.type !== 'way' || !Array.isArray(element.nodes) || element.nodes.length < 2) {
    return false;
  }
  const highway = String(element.tags?.highway || '').toLowerCase();
  if (!new RegExp(`^(?:${DRIVEABLE_HIGHWAYS})$`).test(highway)) return false;
  return structureFamily(element.tags) !== '';
}

function isDriveableWay(element) {
  if (element?.type !== 'way' || !Array.isArray(element.nodes) || element.nodes.length < 2) {
    return false;
  }
  const highway = String(element.tags?.highway || '').toLowerCase();
  return new RegExp(`^(?:${DRIVEABLE_HIGHWAYS})$`).test(highway);
}

export function pruneSupersededGeneralizedStructures(ways = [], nodes = {}) {
  const worldWays = Array.isArray(ways) ? ways : [];
  const nodeMap = structureNodeMapFromLookup(nodes);
  const exactWays = worldWays.filter((way) =>
    isDriveableStructureWay(way) &&
    String(way.tags?._sourceCompleteness || '') !== 'generalized'
  );
  if (exactWays.length === 0) {
    return Object.freeze({
      ways: worldWays,
      exactStructures: 0,
      supersededGeneralizedStructures: 0
    });
  }
  const originLatitude = structureProjectionOriginLatitude(nodeMap);
  const exactSpatialIndex = buildExactStructureSpatialIndex(
    exactWays,
    nodeMap,
    originLatitude
  );
  let supersededGeneralizedStructures = 0;
  const retained = worldWays.filter((way) => {
    if (!isDriveableStructureWay(way) ||
        String(way.tags?._sourceCompleteness || '') !== 'generalized') return true;
    const spatialDuplicate = generalizedStructureDuplicatesExact(
      way,
      nodeMap,
      originLatitude,
      exactSpatialIndex
    );
    // A structure name identifies a corridor, not a physical surface extent.
    // Current mapped ways can split one named bridge into deck and approach
    // fragments. Only proven same-family segment overlap may retire the
    // generalized fallback; otherwise a surviving approach can delete the
    // only complete deck after another exact fragment fails ground acceptance.
    if (!spatialDuplicate) return true;
    supersededGeneralizedStructures += 1;
    return false;
  });
  return Object.freeze({
    ways: retained,
    exactStructures: exactWays.length,
    supersededGeneralizedStructures
  });
}

export function buildFixedRegionalStructureQuery(bounds, timeoutSeconds = 20) {
  const bbox = boundsExpression(bounds);
  const timeout = Math.max(8, Math.floor(Number(timeoutSeconds) || 20));
  return `[out:json][timeout:${timeout}];
  way["highway"~"^(${DRIVEABLE_HIGHWAYS})$"]["bridge"]${bbox}->.bridges;
  way["highway"~"^(${DRIVEABLE_HIGHWAYS})$"]["tunnel"]${bbox}->.tunnels;
  (.bridges;.tunnels;)->.structures;
  node(w.structures)->.structure_nodes;
  (
    .structures;
    way(bn.structure_nodes)["highway"~"^(${DRIVEABLE_HIGHWAYS})$"];
  );out body;>;out skel qt;`;
}

export function retainExactRegionalStructures(data) {
  const elements = Array.isArray(data?.elements) ? data.elements : [];
  const structureWays = elements
    .filter(isDriveableStructureWay)
  const structuresByEndpoint = new Map();
  for (const way of structureWays) {
    for (const nodeId of [way.nodes[0], way.nodes.at(-1)]) {
      if (!structuresByEndpoint.has(nodeId)) structuresByEndpoint.set(nodeId, []);
      structuresByEndpoint.get(nodeId).push(way);
    }
  }
  const boundaryEndpointIds = new Set(
    [...structuresByEndpoint.entries()]
      .filter(([, ways]) => ways.length === 1)
      .map(([nodeId]) => nodeId)
  );
  const connectorCandidates = elements.filter((element) =>
    isDriveableWay(element) &&
    !isDriveableStructureWay(element) &&
    element.nodes.some((nodeId) => boundaryEndpointIds.has(nodeId))
  );
  const connectorSet = new Set();
  for (const endpointId of boundaryEndpointIds) {
    const structure = structuresByEndpoint.get(endpointId)?.[0];
    const structureHighway = String(structure?.tags?.highway || '');
    const structureName = normalizedStructureName(structure?.tags);
    const candidates = connectorCandidates
      .filter((way) => way.nodes.includes(endpointId))
      .sort((left, right) => {
        const score = (way) => {
          const highway = String(way.tags?.highway || '');
          const name = normalizedStructureName(way.tags);
          return (highway.endsWith('_link') ? 6 : 0) +
            (highway === structureHighway ? 4 : 0) +
            (structureName && name === structureName ? 3 : 0);
        };
        return score(right) - score(left) || String(left.id).localeCompare(String(right.id));
      });
    // Every exact structure boundary needs one exact topology mate. Importing
    // these only for tunnels left bridge ways such as Baltimore's JFX with no
    // graph stations after the generalized duplicate was correctly removed.
    // The shared OSM node is explicit connection evidence; the scoring merely
    // selects the most likely continuation when several ways meet there.
    if (candidates[0]) connectorSet.add(candidates[0]);
  }
  const connectorWays = [...connectorSet];
  const ways = [...structureWays, ...connectorWays].map((way) => ({
      ...way,
      tags: {
        ...way.tags,
        _sourceCompleteness: 'lossless',
        ...(isDriveableStructureWay(way)
          ? { _fixedRegionalStructure: 'exact' }
          : { _fixedRegionalStructureConnector: 'exact' }),
        _regionalContext: 'fixed-location',
        _sourceFeatureId: way.tags?._sourceFeatureId || `osm:way:${way.id}`
      }
    }));
  const nodeIds = new Set(ways.flatMap((way) => way.nodes));
  const nodes = elements.filter(
    (element) => element?.type === 'node' && nodeIds.has(element.id)
  );
  return {
    ...data,
    elements: [...nodes, ...ways],
    _fixedRegionalStructures: {
      exactWays: structureWays.length,
      connectors: connectorWays.length,
      bridges: structureWays.filter((way) => structureFamily(way.tags) === 'bridge').length,
      tunnels: structureWays.filter((way) => structureFamily(way.tags) === 'tunnel').length,
      covered: 0
    }
  };
}

export function mergeExactRegionalStructures(worldData, structureData) {
  const worldElements = Array.isArray(worldData?.elements) ? worldData.elements : [];
  const exact = retainExactRegionalStructures(structureData);
  const exactWays = exact.elements.filter((element) => element.type === 'way');
  const exactNodesById = new Map(
    exact.elements
      .filter((element) => element.type === 'node')
      .map((node) => [node.id, node])
  );
  const exactWaysById = new Map(exactWays.map((way) => [way.id, way]));
  const existingExactWayIds = new Set(
    worldElements
      .filter((element) => element?.type === 'way' && Number(element.id) > 0)
      .map((element) => element.id)
  );
  const additions = exactWays.filter((way) => !existingExactWayIds.has(way.id));
  let upgradedExistingWays = 0;
  let upgradedExistingNodes = 0;
  const retainedWorldElements = worldElements.map((element) => {
    if (element?.type === 'node' && exactNodesById.has(element.id)) {
      upgradedExistingNodes += 1;
      return { ...element, ...exactNodesById.get(element.id) };
    }
    if (element?.type !== 'way') return element;
    const exactWay = exactWaysById.get(element.id);
    if (!exactWay || Number(element.id) <= 0) return element;
    upgradedExistingWays += 1;
    return {
      ...element,
      nodes: exactWay.nodes,
      tags: { ...element.tags, ...exactWay.tags }
    };
  });

  // Keep generalized engineered ways until accepted-ground filtering has
  // established which exact structures can actually publish. That later pass
  // is the single deduplication authority; pruning here can leave zero decks
  // when an exact response exists but its ground contract is rejected.
  const deferredGeneralizedWays = retainedWorldElements.filter((element) =>
    element?.type === 'way' &&
    isDriveableStructureWay(element) &&
    String(element.tags?._sourceCompleteness || '') === 'generalized'
  ).length;

  const retainedNodeIds = new Set(
    retainedWorldElements
      .filter((element) => element?.type === 'way')
      .flatMap((way) => way.nodes || [])
  );
  const existingNodeIds = new Set(
    retainedWorldElements
      .filter((element) => element?.type === 'node')
      .map((node) => node.id)
  );
  // An existing live way can be upgraded to the reviewed way's complete node
  // sequence. Its newly referenced nodes are just as required as the nodes for
  // a wholly new way; omitting them causes selection to discard the upgrade.
  const additionNodeIds = new Set(exactWays.flatMap((way) => way.nodes));
  const additionNodes = exact.elements.filter(
    (element) => element?.type === 'node' &&
      additionNodeIds.has(element.id) &&
      !existingNodeIds.has(element.id)
  );
  const prunedWorldElements = retainedWorldElements.filter(
    (element) => element?.type !== 'node' || retainedNodeIds.has(element.id)
  );

  return {
    ...worldData,
    elements: [...prunedWorldElements, ...additionNodes, ...additions],
    _fixedRegionalStructures: {
      ...exact._fixedRegionalStructures,
      addedWays: additions.length,
      upgradedExistingWays,
      upgradedExistingNodes,
      deferredGeneralizedWays,
      replacedGeneralizedWays: 0
    }
  };
}

function removeLiveStructuresSupersededByReviewedPack(worldData, reviewedData) {
  const reviewed = retainExactRegionalStructures(reviewedData);
  const reviewedWays = reviewed.elements.filter((element) => element?.type === 'way');
  const reviewedIds = new Set(reviewedWays.map((way) => Number(way.id)));
  const reviewedNames = new Set(
    reviewedWays
      .filter(isDriveableStructureWay)
      .map((way) => normalizedStructureName(way.tags))
      .filter(Boolean)
  );
  let supersededLiveWays = 0;
  const elements = (worldData?.elements || []).filter((element) => {
    if (element?.type !== 'way' || !isDriveableStructureWay(element)) return true;
    if (Number(element.id) <= 0 ||
        String(element.tags?._sourceCompleteness || '') === 'generalized') return true;
    if (reviewedIds.has(Number(element.id))) return true;
    const name = normalizedStructureName(element.tags);
    if (!name || !reviewedNames.has(name)) return true;
    supersededLiveWays += 1;
    return false;
  });
  return {
    ...worldData,
    elements,
    _reviewedStructureSupersession: {
      reviewedWayCount: reviewedWays.length,
      reviewedNamedCorridors: reviewedNames.size,
      supersededLiveWays
    }
  };
}

function markReviewedGeneralizedStructureFallbacks(worldData, reviewedData) {
  const reviewed = retainExactRegionalStructures(reviewedData);
  const reviewedIds = new Set(
    reviewed.elements
      .filter((element) => element?.type === 'way' && isDriveableStructureWay(element))
      .map((way) => Number(way.id))
  );
  const elements = Array.isArray(worldData?.elements) ? worldData.elements : [];
  const nodes = structureNodeMap(elements);
  const reviewedWays = elements.filter((element) =>
    element?.type === 'way' && reviewedIds.has(Number(element.id))
  );
  const originLatitude = structureProjectionOriginLatitude(nodes);
  const reviewedSpatialIndex = buildExactStructureSpatialIndex(reviewedWays, nodes, originLatitude);
  let markedWays = 0;
  const markedElements = elements.map((element) => {
    if (!isDriveableStructureWay(element) ||
        String(element.tags?._sourceCompleteness || '') !== 'generalized') return element;
    const reviewedName = reviewedStructureNameForGeneralized(
      element,
      nodes,
      originLatitude,
      reviewedSpatialIndex
    );
    if (!reviewedName) return element;
    markedWays += 1;
    return {
      ...element,
      tags: {
        ...element.tags,
        _reviewedStructureFallback: 'reviewed-spatial-match',
        _reviewedStructureName: reviewedName
      }
    };
  });
  return {
    ...worldData,
    elements: markedElements,
    _reviewedGeneralizedStructureFallbacks: markedWays
  };
}

export function beginFixedRegionalStructureLoad(options = {}) {
  const {
    fetchOverpassJSON,
    location,
    runProviderWork,
    radiusMeters = 8000,
    timeoutMs = 20000,
    deadlineMs = Infinity
  } = options;
  if (typeof fetchOverpassJSON !== 'function' || typeof runProviderWork !== 'function') {
    throw new TypeError('Fixed regional structures require an Overpass adapter and provider coordinator.');
  }
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
      cacheMeta: { kind: 'fixed-regional-structures', skipped: true },
      location: fixedLocation,
      outcome: Promise.resolve({
        value: {
          elements: [],
          _fixedRegionalStructures: {
            exactWays: 0,
            connectors: 0,
            bridges: 0,
            tunnels: 0,
            covered: 0,
            skipped: true,
            reason: 'polar-cryosphere-domain'
          }
        },
        error: null
      }),
      radiusMeters
    };
  }
  const bounds = fixedRegionalContextBounds(fixedLocation, radiusMeters);
  const query = buildFixedRegionalStructureQuery(bounds, timeoutMs / 1000);
  const radiusDegrees = radiusMeters / 110540;
  const cacheMeta = {
    lat: fixedLocation.lat,
    lon: fixedLocation.lon,
    roadsRadius: radiusDegrees,
    featureRadius: radiusDegrees,
    poiRadius: 0,
    kind: 'fixed-regional-structures'
  };
  const outcome = runProviderWork(
    'osm-overpass',
    'fixed-regional-structures',
    (signal) => fetchOverpassJSON(
      query,
      timeoutMs,
      deadlineMs,
      cacheMeta,
      { signal }
    )
  ).then(
    (value) => ({ value, error: null }),
    (error) => ({ value: null, error })
  );
  return { bounds, cacheMeta, location: fixedLocation, outcome, radiusMeters };
}

export async function completeFixedRegionalStructureLoad(options = {}) {
  const { data, loadMetrics, request } = options;
  const outcome = await request?.outcome;
  const reviewedLandmarkData = await fetchBundledLandmarkData({
    lat: request?.location?.lat,
    lon: request?.location?.lon
  }).catch(() => null);
  const reviewedExact = reviewedLandmarkData
    ? retainExactRegionalStructures(reviewedLandmarkData)
    : null;
  const reviewedExactWays = Number(reviewedExact?._fixedRegionalStructures?.exactWays || 0);
  if (!outcome?.value && reviewedExactWays === 0) {
    if (outcome?.error) throw outcome.error;
    throw new Error('Fixed regional structures returned no source data.');
  }
  let merged = outcome?.value
    ? mergeExactRegionalStructures(data, outcome.value)
    : data;
  if (reviewedExactWays > 0) {
    // The bundled landmark pack is the reviewed, versioned structure snapshot.
    // Live OSM may split the same named deck into new overlapping way ids. If
    // those enter compilation first, geometric deduplication can discard the
    // reviewed carriageways and their published surface controls. Retire only
    // same-named live engineered ways that are not part of the reviewed pack;
    // unrelated live roads and the reviewed ids remain intact.
    merged = removeLiveStructuresSupersededByReviewedPack(merged, reviewedLandmarkData);
    merged = mergeExactRegionalStructures(merged, reviewedLandmarkData);
    merged = markReviewedGeneralizedStructureFallbacks(merged, reviewedLandmarkData);
  }
  merged._fixedRegionalStructures.source = reviewedExactWays > 0
    ? outcome?.value
      ? 'live-plus-bundled-reviewed-openstreetmap-landmark-pack'
      : 'bundled-reviewed-openstreetmap-landmark-pack'
    : 'live-openstreetmap';
  merged._fixedRegionalStructures.reviewedLandmarkExactWays = reviewedExactWays;
  merged._fixedRegionalStructures.supersededLiveReviewedCorridorWays =
    Number(merged._reviewedStructureSupersession?.supersededLiveWays || 0);
  merged._fixedRegionalStructures.reviewedGeneralizedFallbackWays =
    Number(merged._reviewedGeneralizedStructureFallbacks || 0);
  merged._fixedRegionalStructures.liveProviderError = outcome?.error?.message || '';
  if (loadMetrics) loadMetrics.regionalStructures = merged._fixedRegionalStructures;
  return merged;
}

export {
  DRIVEABLE_HIGHWAYS,
  generalizedStructureDuplicatesExact,
  normalizedStructureName,
  structureFamily
};
