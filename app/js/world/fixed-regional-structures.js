import { fixedRegionalContextBounds } from './fixed-regional-context.js?v=8';

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
  const generalizedSegments = projectedStructureSegments(way, worldNodes, originLatitude);
  if (generalizedSegments.length === 0) return false;
  let totalLength = 0;
  let matchedLength = 0;
  for (const segment of generalizedSegments) {
    totalLength += segment.length;
    const candidates = exactSpatialIndex.get(structureGridKey(family, segment.midX, segment.midY)) || [];
    const matched = candidates.some((exactSegment) => {
      const directionDot = Math.abs(segment.dx * exactSegment.dx + segment.dy * exactSegment.dy);
      if (directionDot < STRUCTURE_DUPLICATE_MIN_DIRECTION_DOT) return false;
      return pointToStructureSegmentDistance(segment.midX, segment.midY, exactSegment) <=
        STRUCTURE_DUPLICATE_DISTANCE_METERS;
    });
    if (matched) matchedLength += segment.length;
  }
  // Names and refs frequently change at a bridge anchorage, tunnel bore, or
  // jurisdiction boundary. A substantial same-family, same-direction spatial
  // overlap is the durable identity contract between generalized and exact
  // sources. Requiring length coverage prevents a nearby crossing structure
  // from deleting an unrelated way at one point.
  return matchedLength >= Math.min(18, totalLength) && matchedLength / totalLength >= 0.35;
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
  const worldNodes = structureNodeMap(worldElements);
  const exactNodes = structureNodeMap(exact.elements);
  const structureProjectionLatitude = structureProjectionOriginLatitude(exactNodes, worldNodes);
  const exactStructureSpatialIndex = buildExactStructureSpatialIndex(
    exactWays.filter((way) => structureFamily(way.tags)),
    exactNodes,
    structureProjectionLatitude
  );
  const existingExactWayIds = new Set(
    worldElements
      .filter((element) => element?.type === 'way' && Number(element.id) > 0)
      .map((element) => element.id)
  );
  const additions = exactWays.filter((way) => !existingExactWayIds.has(way.id));

  // Shortbread supplies regional continuity, but its schema intentionally omits
  // most engineered structure detail. Once the exact named OSM way is present,
  // the generalized copy is no longer an authority and must not be published as
  // a second deck/tunnel alongside it.
  const exactNamedFamilies = new Set(
    exactWays
      .map((way) => {
        const family = structureFamily(way.tags);
        const name = normalizedStructureName(way.tags);
        return family && name ? `${family}:${name}` : '';
      })
      .filter(Boolean)
  );
  const retainedWorldElements = worldElements.filter((element) => {
    if (element?.type !== 'way') return true;
    if (String(element.tags?._sourceCompleteness || '') !== 'generalized') return true;
    const name = normalizedStructureName(element.tags);
    const namedDuplicate = name && exactNamedFamilies.has(`${structureFamily(element.tags)}:${name}`);
    const spatialDuplicate = generalizedStructureDuplicatesExact(
      element,
      worldNodes,
      structureProjectionLatitude,
      exactStructureSpatialIndex
    );
    return !namedDuplicate && !spatialDuplicate;
  });

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
  const additionNodeIds = new Set(additions.flatMap((way) => way.nodes));
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
      replacedGeneralizedWays: worldElements.length - retainedWorldElements.length
    }
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
  if (outcome?.error) throw outcome.error;
  if (!outcome?.value) throw new Error('Fixed regional structures returned no source data.');
  const merged = mergeExactRegionalStructures(data, outcome.value);
  if (loadMetrics) loadMetrics.regionalStructures = merged._fixedRegionalStructures;
  return merged;
}

export {
  DRIVEABLE_HIGHWAYS,
  generalizedStructureDuplicatesExact,
  normalizedStructureName,
  structureFamily
};
