import { ctx as appCtx } from "../shared-context.js?v=55";

const TRAVERSAL_NODE_GRID = 2.5;
const TRAVERSAL_MAX_ANCHOR_DISTANCE = {
  drive: 260,
  walk: 180
};
const WALK_SURFACE_COST = {
  road: 1.08,
  footway: 0.92,
  cycleway: 0.96,
  railway: 1.35
};

const runtime = {
  enableLinearFeatures: () => false,
  featureTraversalKey: () => '',
  isFiniteWorldPointXZ: () => false,
  isVehicleRoad: () => false,
  runtimeRoadFeatures: () => []
};

let traversalNetworksDirty = true;

export function initWorldTraversal(deps = {}) {
  if (typeof deps.enableLinearFeatures === 'function') runtime.enableLinearFeatures = deps.enableLinearFeatures;
  if (typeof deps.featureTraversalKey === 'function') runtime.featureTraversalKey = deps.featureTraversalKey;
  if (typeof deps.isFiniteWorldPointXZ === 'function') runtime.isFiniteWorldPointXZ = deps.isFiniteWorldPointXZ;
  if (typeof deps.isVehicleRoad === 'function') runtime.isVehicleRoad = deps.isVehicleRoad;
  if (typeof deps.runtimeRoadFeatures === 'function') runtime.runtimeRoadFeatures = deps.runtimeRoadFeatures;
}

function traversalFeatureKind(feature) {
  return String(feature?.networkKind || feature?.kind || 'road').toLowerCase();
}

function isWalkSurface(feature) {
  if (!feature) return false;
  if (feature.walkable === false) return false;
  const kind = traversalFeatureKind(feature);
  if (!runtime.enableLinearFeatures()) return kind === 'road' || feature?.isStructureConnector === true;
  return kind === 'road' || kind === 'footway' || kind === 'cycleway' || kind === 'railway';
}

function walkSurfacePenalty(feature) {
  const kind = traversalFeatureKind(feature);
  return WALK_SURFACE_COST[kind] || 1;
}

export function surfaceDisplayName(feature) {
  if (!feature) return 'Terrain';
  const explicitName = String(feature.name || '').trim();
  if (explicitName) return explicitName;

  const kind = traversalFeatureKind(feature);
  const overlayFeature = String(feature?.sourceFeatureId || '').startsWith('overlay:') || !!feature?.overlayFeatureId;
  if (!runtime.enableLinearFeatures() && !overlayFeature && kind === 'road') return 'Road';
  if (kind === 'footway') return 'Footpath';
  if (kind === 'cycleway') return 'Cycle Path';
  if (kind === 'railway') return 'Rail Corridor';
  return 'Road';
}

export function traversableFeaturesForMode(mode = 'walk') {
  const drive = mode === 'drive';
  const features = [];

  const runtimeRoads = runtime.runtimeRoadFeatures();
  if (Array.isArray(runtimeRoads)) {
    for (let i = 0; i < runtimeRoads.length; i++) {
      const road = runtimeRoads[i];
      if (drive ? runtime.isVehicleRoad(road) : isWalkSurface(road)) features.push(road);
    }
  }

  if (!drive && Array.isArray(appCtx.linearFeatures)) {
    for (let i = 0; i < appCtx.linearFeatures.length; i++) {
      const feature = appCtx.linearFeatures[i];
      if ((runtime.enableLinearFeatures() || feature?.isStructureConnector === true) && isWalkSurface(feature)) {
        features.push(feature);
      }
    }
  }

  if (!drive && Array.isArray(appCtx.overlayRuntimeLinearFeatures)) {
    for (let i = 0; i < appCtx.overlayRuntimeLinearFeatures.length; i++) {
      const feature = appCtx.overlayRuntimeLinearFeatures[i];
      if (isWalkSurface(feature)) features.push(feature);
    }
  }

  return features;
}

export function invalidateTraversalNetworks(reason = 'world_data_change') {
  traversalNetworksDirty = true;
  appCtx.traversalNetworks = { walk: null, drive: null };
  return reason;
}

function traversalNodeKey(x, z, feature = null) {
  return `${Math.round(x / TRAVERSAL_NODE_GRID)},${Math.round(z / TRAVERSAL_NODE_GRID)}:${runtime.featureTraversalKey(feature)}`;
}

function buildTraversalGraph(mode = 'walk') {
  const features = traversableFeaturesForMode(mode);
  const nodes = [];
  const adjacency = [];
  const segments = [];
  const nodesByKey = new Map();
  const featureKinds = {};

  const upsertNode = (point, feature, explicitKey = '') => {
    const key = explicitKey || traversalNodeKey(point.x, point.z, feature);
    const existingId = nodesByKey.get(key);
    if (existingId !== undefined) {
      const existing = nodes[existingId];
      existing.sampleCount += 1;
      existing.sumX += point.x;
      existing.sumZ += point.z;
      existing.x = existing.sumX / existing.sampleCount;
      existing.z = existing.sumZ / existing.sampleCount;
      return existingId;
    }

    const nodeId = nodes.length;
    nodesByKey.set(key, nodeId);
    nodes.push({
      x: point.x,
      z: point.z,
      sumX: point.x,
      sumZ: point.z,
      sampleCount: 1
    });
    adjacency.push([]);
    return nodeId;
  };

  const compiledPathPoints = (feature) => {
    const points = feature.pts;
    const stations = Array.isArray(feature?.transportGraphRef?.stations)
      ? feature.transportGraphRef.stations
      : [];
    const distances = new Float64Array(points.length);
    for (let index = 1; index < points.length; index += 1) {
      distances[index] = distances[index - 1] +
        Math.hypot(points[index].x - points[index - 1].x, points[index].z - points[index - 1].z);
    }
    if (stations.length === 0) {
      return points.map((point, index) => ({
        point,
        distanceAlong: distances[index],
        segmentIndex: Math.min(points.length - 2, index),
        segmentT: index === points.length - 1 ? 1 : 0,
        graphNodeId: ''
      }));
    }
    const samples = points.map((point, index) => ({
      point,
      distanceAlong: distances[index],
      segmentIndex: Math.min(points.length - 2, index),
      segmentT: index === points.length - 1 ? 1 : 0,
      graphNodeId: ''
    }));
    for (const station of stations) {
      samples.push({
        point: station.point,
        distanceAlong: Number(station.distanceAlong),
        segmentIndex: Number(station.segmentIndex),
        segmentT: Number(station.segmentT),
        graphNodeId: `transport:${station.nodeId}`
      });
    }
    samples.sort((left, right) => left.distanceAlong - right.distanceAlong);
    const compact = [];
    for (const sample of samples) {
      const previous = compact[compact.length - 1];
      if (previous && Math.abs(previous.distanceAlong - sample.distanceAlong) <= 0.02) {
        if (sample.graphNodeId) {
          previous.point = sample.point;
          previous.segmentIndex = sample.segmentIndex;
          previous.segmentT = sample.segmentT;
          previous.graphNodeId = sample.graphNodeId;
        }
        continue;
      }
      compact.push(sample);
    }
    return compact;
  };
  const sourceInterval = (feature, startDistance, endDistance) => {
    const midpoint = (startDistance + endDistance) * 0.5;
    let walked = 0;
    for (let index = 0; index < feature.pts.length - 1; index += 1) {
      const start = feature.pts[index];
      const end = feature.pts[index + 1];
      const length = Math.hypot(end.x - start.x, end.z - start.z);
      if (midpoint <= walked + length + 1e-6 || index === feature.pts.length - 2) {
        return {
          segmentIndex: index,
          startT: Math.max(0, Math.min(1, (startDistance - walked) / Math.max(1e-6, length))),
          endT: Math.max(0, Math.min(1, (endDistance - walked) / Math.max(1e-6, length)))
        };
      }
      walked += length;
    }
    return { segmentIndex: 0, startT: 0, endT: 1 };
  };

  for (let f = 0; f < features.length; f++) {
    const feature = features[f];
    if (!Array.isArray(feature?.pts) || feature.pts.length < 2) continue;

    const kind = traversalFeatureKind(feature);
    featureKinds[kind] = (featureKinds[kind] || 0) + 1;
    const pathPoints = compiledPathPoints(feature);
    const nodeIds = pathPoints.map((sample) =>
      upsertNode(sample.point, feature, sample.graphNodeId)
    );
    const segmentPenalty = mode === 'drive' ? 1 : walkSurfacePenalty(feature);
    const direction = mode === 'drive'
      ? String(feature?.transportGraphRef?.direction || 'both')
      : 'both';

    for (let i = 0; i < pathPoints.length - 1; i++) {
      const fromId = nodeIds[i];
      const toId = nodeIds[i + 1];
      if (fromId === toId) continue;

      const p1 = pathPoints[i].point;
      const p2 = pathPoints[i + 1].point;
      const length = Math.hypot(p2.x - p1.x, p2.z - p1.z);
      if (!(length > 0.05)) continue;
      const source = sourceInterval(
        feature,
        pathPoints[i].distanceAlong,
        pathPoints[i + 1].distanceAlong
      );

      const weight = length * segmentPenalty;
      if (direction !== 'reverse') adjacency[fromId].push({ to: toId, weight });
      if (direction !== 'forward') adjacency[toId].push({ to: fromId, weight });
      segments.push({
        feature,
        direction,
        segIndex: source.segmentIndex,
        sourceTStart: source.startT,
        sourceTEnd: source.endT,
        fromId,
        toId,
        p1,
        p2,
        length,
        penalty: segmentPenalty
      });
    }
  }

  return {
    mode,
    authority: appCtx.transportNetworkModel?.authority || 'legacy_traversal_graph',
    transportGraphId: appCtx.transportNetworkModel?.id || null,
    nodes: nodes.map((node) => ({ x: node.x, z: node.z })),
    adjacency,
    segments,
    featureKinds,
    featureCount: features.length,
    nodeCount: nodes.length,
    segmentCount: segments.length
  };
}

export function buildTraversalNetworks() {
  const walkFeatureCount = traversableFeaturesForMode('walk').length;
  const driveFeatureCount = traversableFeaturesForMode('drive').length;
  const existingWalk = appCtx.traversalNetworks?.walk || null;
  const existingDrive = appCtx.traversalNetworks?.drive || null;
  const walkReady = !!existingWalk && (
    Number(existingWalk.featureCount || 0) > 0 ||
    walkFeatureCount === 0
  );
  const driveReady = !!existingDrive && (
    Number(existingDrive.featureCount || 0) > 0 ||
    driveFeatureCount === 0
  );

  if (!traversalNetworksDirty && walkReady && driveReady) {
    return appCtx.traversalNetworks;
  }
  const walk = buildTraversalGraph('walk');
  const drive = buildTraversalGraph('drive');
  appCtx.traversalNetworks = { walk, drive };
  traversalNetworksDirty = false;
  return appCtx.traversalNetworks;
}

function traversalGraphForMode(mode = 'walk') {
  const resolvedMode = mode === 'drive' ? 'drive' : 'walk';
  const graph = appCtx.traversalNetworks?.[resolvedMode];
  if (graph && Array.isArray(graph.segments) && graph.segments.length > 0) return graph;
  return buildTraversalNetworks()?.[resolvedMode] || null;
}

function projectPointToSegment(x, z, p1, p2) {
  const dx = p2.x - p1.x;
  const dz = p2.z - p1.z;
  const len2 = dx * dx + dz * dz;
  if (len2 <= 1e-9) {
    const dist = Math.hypot(x - p1.x, z - p1.z);
    return {
      x: p1.x,
      z: p1.z,
      t: 0,
      dist,
      length: 0
    };
  }

  let t = ((x - p1.x) * dx + (z - p1.z) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = p1.x + dx * t;
  const pz = p1.z + dz * t;
  return {
    x: px,
    z: pz,
    t,
    dist: Math.hypot(x - px, z - pz),
    length: Math.sqrt(len2)
  };
}

export function findNearestTraversalFeature(x, z, options = {}) {
  return findNearestTraversalFeatures(x, z, options)[0] || null;
}

function findNearestTraversalFeatures(x, z, options = {}) {
  const mode = options.mode === 'drive' ? 'drive' : 'walk';
  const excludeRoads = options.excludeRoads === true;
  const graph = traversalGraphForMode(mode);
  const segments = Array.isArray(graph?.segments) ? graph.segments : [];
  const maxDistance = Number.isFinite(options.maxDistance) ?
    Math.max(4, options.maxDistance) :
    TRAVERSAL_MAX_ANCHOR_DISTANCE[mode];
  const maximumCandidates = Math.max(1, Math.min(8, Number(options.maximumCandidates) || 4));

  const candidates = [];
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (excludeRoads && traversalFeatureKind(segment.feature) === 'road') continue;
    const projected = projectPointToSegment(x, z, segment.p1, segment.p2);
    if (!Number.isFinite(projected.dist) || projected.dist > maxDistance) continue;
    const weighted = projected.dist * (mode === 'drive' ? 1 : Math.max(0.85, segment.penalty));
    candidates.push({
      mode,
      feature: segment.feature,
      direction: segment.direction || 'both',
      dist: projected.dist,
      weightedDist: weighted,
      pt: { x: projected.x, z: projected.z },
      t: segment.sourceTStart +
        (segment.sourceTEnd - segment.sourceTStart) * projected.t,
      segIndex: segment.segIndex,
      fromId: segment.fromId,
      toId: segment.toId,
      p1: segment.p1,
      p2: segment.p2,
      length: segment.length,
      penalty: segment.penalty
    });
  }

  candidates.sort((left, right) =>
    left.weightedDist - right.weightedDist ||
    left.dist - right.dist
  );
  const bestWeightedDistance = candidates[0]?.weightedDist;
  if (!Number.isFinite(bestWeightedDistance)) return [];
  return candidates
    .filter((candidate) => candidate.weightedDist <= bestWeightedDistance + 0.5)
    .slice(0, maximumCandidates);
}

function compactRoutePoints(points, minSpacing = 0.35) {
  const compacted = [];
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    if (!runtime.isFiniteWorldPointXZ(point)) continue;
    const last = compacted[compacted.length - 1];
    if (last && Math.hypot(point.x - last.x, point.z - last.z) < minSpacing) continue;
    compacted.push({ x: point.x, z: point.z });
  }
  return compacted;
}

function measurePolylineDistance(points) {
  if (!Array.isArray(points) || points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].z - points[i].z);
  }
  return total;
}

export function measureRemainingPolylineDistance(x, z, points) {
  if (!Array.isArray(points) || points.length === 0) return 0;
  if (points.length === 1) return Math.hypot(points[0].x - x, points[0].z - z);

  let best = null;
  for (let i = 0, walked = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const projected = projectPointToSegment(x, z, p1, p2);
    const segmentLength = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    if (!best || projected.dist < best.dist) {
      best = {
        dist: projected.dist,
        walked,
        projected,
        segmentLength,
        segIndex: i
      };
    }
    walked += segmentLength;
  }

  if (!best) return Math.hypot(points[points.length - 1].x - x, points[points.length - 1].z - z);

  let remaining = Math.hypot(x - best.projected.x, z - best.projected.z);
  remaining += best.segmentLength * (1 - best.projected.t);
  for (let i = best.segIndex + 1; i < points.length - 1; i++) {
    remaining += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].z - points[i].z);
  }
  return remaining;
}

function aStarTraversalPath(graph, startId, endId) {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.adjacency)) return null;
  if (!Number.isInteger(startId) || !Number.isInteger(endId)) return null;
  if (startId === endId) return { nodeIds: [startId], cost: 0 };

  const nodeCount = graph.nodes.length;
  const gScore = new Float64Array(nodeCount);
  const fScore = new Float64Array(nodeCount);
  const cameFrom = new Int32Array(nodeCount);
  const openEntries = [];

  for (let i = 0; i < nodeCount; i++) {
    gScore[i] = Infinity;
    fScore[i] = Infinity;
    cameFrom[i] = -1;
  }

  const heuristic = (aId, bId) => {
    const a = graph.nodes[aId];
    const b = graph.nodes[bId];
    return Math.hypot(b.x - a.x, b.z - a.z);
  };

  const pushOpen = (nodeId, priority) => {
    openEntries.push({ nodeId, priority });
    let idx = openEntries.length - 1;
    while (idx > 0) {
      const parent = Math.floor((idx - 1) / 2);
      if (openEntries[parent].priority <= openEntries[idx].priority) break;
      const tmp = openEntries[parent];
      openEntries[parent] = openEntries[idx];
      openEntries[idx] = tmp;
      idx = parent;
    }
  };

  const popOpen = () => {
    if (openEntries.length === 0) return null;
    const min = openEntries[0];
    const last = openEntries.pop();
    if (openEntries.length > 0 && last) {
      openEntries[0] = last;
      let idx = 0;
      while (true) {
        const left = idx * 2 + 1;
        const right = left + 1;
        let smallest = idx;
        if (left < openEntries.length && openEntries[left].priority < openEntries[smallest].priority) smallest = left;
        if (right < openEntries.length && openEntries[right].priority < openEntries[smallest].priority) smallest = right;
        if (smallest === idx) break;
        const tmp = openEntries[idx];
        openEntries[idx] = openEntries[smallest];
        openEntries[smallest] = tmp;
        idx = smallest;
      }
    }
    return min;
  };

  gScore[startId] = 0;
  fScore[startId] = heuristic(startId, endId);
  pushOpen(startId, fScore[startId]);

  while (openEntries.length > 0) {
    const current = popOpen();
    if (!current) break;
    const currentId = current.nodeId;
    if (current.priority > fScore[currentId] + 1e-6) continue;
    if (currentId === endId) break;

    const edges = graph.adjacency[currentId] || [];
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      const tentative = gScore[currentId] + edge.weight;
      if (tentative + 1e-6 >= gScore[edge.to]) continue;
      cameFrom[edge.to] = currentId;
      gScore[edge.to] = tentative;
      fScore[edge.to] = tentative + heuristic(edge.to, endId);
      pushOpen(edge.to, fScore[edge.to]);
    }
  }

  if (!Number.isFinite(gScore[endId])) return null;

  const nodeIds = [endId];
  let cursor = endId;
  while (cursor !== startId) {
    cursor = cameFrom[cursor];
    if (cursor < 0) return null;
    nodeIds.push(cursor);
  }
  nodeIds.reverse();
  return { nodeIds, cost: gScore[endId] };
}

function buildTraversalConnectorOptions(anchor, originX, originZ, role = 'start') {
  if (!anchor) return [];
  const offNetwork = Math.hypot(originX - anchor.pt.x, originZ - anchor.pt.z);
  const direction = String(anchor.direction || 'both');
  const fromDistance = Math.hypot(anchor.pt.x - anchor.p1.x, anchor.pt.z - anchor.p1.z);
  const toDistance = Math.hypot(anchor.pt.x - anchor.p2.x, anchor.pt.z - anchor.p2.z);
  const options = [];
  if (
    toDistance <= 0.02 ||
    direction === 'both' ||
    (role === 'start' && direction !== 'reverse') ||
    (role === 'end' && direction !== 'forward')
  ) {
    options.push({
      nodeId: anchor.toId,
      connectorCost: offNetwork + toDistance * anchor.penalty
    });
  }
  if (
    fromDistance <= 0.02 ||
    direction === 'both' ||
    (role === 'start' && direction !== 'forward') ||
    (role === 'end' && direction !== 'reverse')
  ) {
    options.push({
      nodeId: anchor.fromId,
      connectorCost: offNetwork + fromDistance * anchor.penalty
    });
  }

  if (options.length === 2 && options[0].nodeId === options[1].nodeId) return [options[0]];
  return options;
}

export function findTraversalRoute(fromX, fromZ, toX, toZ, options = {}) {
  const mode = options.mode === 'drive' ? 'drive' : 'walk';
  const graph = traversalGraphForMode(mode);
  if (!graph || !Array.isArray(graph.segments) || graph.segments.length === 0) return null;

  const startAnchors = findNearestTraversalFeatures(fromX, fromZ, {
    mode,
    maxDistance: options.maxAnchorDistance,
    maximumCandidates: 4
  });
  const endAnchors = findNearestTraversalFeatures(toX, toZ, {
    mode,
    maxDistance: options.maxAnchorDistance,
    maximumCandidates: 4
  });
  if (startAnchors.length === 0 || endAnchors.length === 0) return null;
  let best = null;

  for (const startAnchor of startAnchors) {
    for (const endAnchor of endAnchors) {
      if (startAnchor.feature === endAnchor.feature && startAnchor.segIndex === endAnchor.segIndex) {
        const allowedDirect = mode !== 'drive' ||
          startAnchor.direction === 'both' ||
          (startAnchor.direction === 'forward' && startAnchor.t <= endAnchor.t) ||
          (startAnchor.direction === 'reverse' && startAnchor.t >= endAnchor.t);
        if (allowedDirect) {
          const points = compactRoutePoints([
            { x: fromX, z: fromZ },
            startAnchor.pt,
            endAnchor.pt,
            { x: toX, z: toZ }
          ]);
          const totalCost = measurePolylineDistance(points);
          if (!best || totalCost < best.totalCost) {
            best = { totalCost, nodeIds: [], startAnchor, endAnchor, directPoints: points };
          }
        }
      }

      const startLinks = buildTraversalConnectorOptions(startAnchor, fromX, fromZ, 'start');
      const endLinks = buildTraversalConnectorOptions(endAnchor, toX, toZ, 'end');
      for (const startLink of startLinks) {
        for (const endLink of endLinks) {
          const core = aStarTraversalPath(graph, startLink.nodeId, endLink.nodeId);
          if (!core) continue;
          const totalCost = startLink.connectorCost + core.cost + endLink.connectorCost;
          if (!best || totalCost < best.totalCost) {
            best = {
              totalCost,
              nodeIds: core.nodeIds,
              startAnchor,
              endAnchor,
              directPoints: null
            };
          }
        }
      }
    }
  }

  if (!best) return null;
  if (best.directPoints) {
    return {
      mode,
      points: best.directPoints,
      distance: measurePolylineDistance(best.directPoints),
      startAnchor: best.startAnchor,
      endAnchor: best.endAnchor
    };
  }

  const routePoints = [{ x: fromX, z: fromZ }, best.startAnchor.pt];
  for (let i = 0; i < best.nodeIds.length; i++) {
    const node = graph.nodes[best.nodeIds[i]];
    if (node) routePoints.push({ x: node.x, z: node.z });
  }
  routePoints.push(best.endAnchor.pt, { x: toX, z: toZ });

  const points = compactRoutePoints(routePoints);
  return {
    mode,
    points,
    distance: measurePolylineDistance(points),
    startAnchor: best.startAnchor,
    endAnchor: best.endAnchor
  };
}

export function pickNavigationTargetPoint(currentX, currentZ, routePoints) {
  if (!Array.isArray(routePoints) || routePoints.length === 0) return null;
  if (routePoints.length === 1) return routePoints[0];

  let bestIndex = 0;
  let bestDist = Infinity;
  for (let i = 0; i < routePoints.length; i++) {
    const point = routePoints[i];
    const dist = Math.hypot(point.x - currentX, point.z - currentZ);
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = i;
    }
  }

  const lookahead = bestDist < 16 ? 2 : 1;
  const nextIndex = Math.min(routePoints.length - 1, bestIndex + lookahead);
  return routePoints[nextIndex];
}
