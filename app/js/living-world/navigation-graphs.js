const GRAPH_BUDGET_BY_TIER = Object.freeze({
  low: Object.freeze({ pedestrianEdges: 180, trafficEdges: 140 }),
  performance: Object.freeze({ pedestrianEdges: 320, trafficEdges: 260 }),
  balanced: Object.freeze({ pedestrianEdges: 680, trafficEdges: 520 }),
  quality: Object.freeze({ pedestrianEdges: 1100, trafficEdges: 900 })
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function featureKind(feature) {
  return String(feature?.networkKind || feature?.kind || 'road').toLowerCase();
}

function featureId(feature, fallback) {
  return String(
    feature?.transportRecord?.identity ||
    feature?.sourceFeatureId ||
    feature?.sourceRoadId ||
    feature?.id ||
    fallback
  );
}

function structureState(feature) {
  const semantics = feature?.structureSemantics || {};
  return Object.freeze({
    terrainMode: String(semantics.terrainMode || 'at_grade'),
    structureKind: String(semantics.structureKind || 'none'),
    gradeSeparated: semantics.gradeSeparated === true,
    verticalOrder: finite(semantics.verticalOrder, 0)
  });
}

function makeNodeStore() {
  const nodes = [];
  const byKey = new Map();
  const upsert = (point, role = 'network') => {
    const key = `${Math.round(point.x * 4)},${Math.round(point.y * 4)},${Math.round(point.z * 4)}:${role}`;
    let id = byKey.get(key);
    if (id !== undefined) return id;
    id = nodes.length;
    byKey.set(key, id);
    nodes.push(Object.freeze({ id: `${role}:${id}`, x: point.x, y: point.y, z: point.z, role }));
    return id;
  };
  return { nodes, upsert };
}

function surfaceY(sampleSurface, segment, point, t) {
  if (typeof sampleSurface !== 'function') return finite(point.y, 0);
  const y = sampleSurface(segment.feature, point.x, point.z, {
    x: point.x,
    z: point.z,
    dist: 0,
    segIndex: segment.segIndex,
    t
  });
  return Number.isFinite(y) ? Number(y) : finite(point.y, 0);
}

function edgePointPair(segment, offset, sampleSurface) {
  const dx = segment.p2.x - segment.p1.x;
  const dz = segment.p2.z - segment.p1.z;
  const length = Math.hypot(dx, dz);
  if (!(length > 0.5)) return null;
  const normalX = -dz / length;
  const normalZ = dx / length;
  return {
    p1: {
      x: segment.p1.x + normalX * offset,
      y: surfaceY(sampleSurface, segment, segment.p1, segment.sourceTStart) + 0.08,
      z: segment.p1.z + normalZ * offset
    },
    p2: {
      x: segment.p2.x + normalX * offset,
      y: surfaceY(sampleSurface, segment, segment.p2, segment.sourceTEnd) + 0.08,
      z: segment.p2.z + normalZ * offset
    },
    length,
    normalX,
    normalZ
  };
}

function segmentPriority(segment) {
  const midpointX = (segment.p1.x + segment.p2.x) * 0.5;
  const midpointZ = (segment.p1.z + segment.p2.z) * 0.5;
  return Math.hypot(midpointX, midpointZ);
}

export function compilePedestrianGraph(options = {}) {
  const tier = String(options.tier || 'balanced').toLowerCase();
  const budget = GRAPH_BUDGET_BY_TIER[tier] || GRAPH_BUDGET_BY_TIER.balanced;
  const sourceSegments = (Array.isArray(options.traversal?.segments) ? options.traversal.segments : [])
    .filter((segment) => segment?.p1 && segment?.p2 && segmentPriority(segment) <= 900)
    .sort((a, b) => segmentPriority(a) - segmentPriority(b));
  const store = makeNodeStore();
  const edges = [];
  const runtimeFeatureByEdge = new Map();
  const entranceReserve = Math.min(
    Math.floor(budget.pedestrianEdges * 0.24),
    (Array.isArray(options.entrances) ? options.entrances.length : 0) * 2
  );
  const networkEdgeLimit = Math.max(8, budget.pedestrianEdges - entranceReserve);

  const addEdge = (pair, segment, suffix, fromPoint, toPoint, provenance, role = 'sidewalk') => {
    if (edges.length >= networkEdgeLimit && role !== 'entrance') return;
    if (edges.length >= budget.pedestrianEdges) return;
    const from = store.upsert(fromPoint, role);
    const to = store.upsert(toPoint, role);
    const id = `ped:${featureId(segment.feature, 'feature')}:${segment.segIndex}:${suffix}:${edges.length}`;
    edges.push(Object.freeze({
      id,
      from,
      to,
      p1: Object.freeze({ ...fromPoint }),
      p2: Object.freeze({ ...toPoint }),
      length: Math.hypot(toPoint.x - fromPoint.x, toPoint.z - fromPoint.z),
      role,
      provenance,
      structure: structureState(segment.feature)
    }));
    runtimeFeatureByEdge.set(id, segment.feature);
  };

  for (let index = 0; index < sourceSegments.length && edges.length < networkEdgeLimit; index += 1) {
    const segment = sourceSegments[index];
    const kind = featureKind(segment.feature);
    const mappedPath = kind === 'footway' || kind === 'cycleway';
    const roadHalfWidth = Math.max(2.4, finite(segment.feature?.width, finite(segment.feature?.transportRecord?.crossSection?.widthMeters, 6)) * 0.5);
    const offsets = mappedPath ? [0] : [roadHalfWidth + 1.35, -(roadHalfWidth + 1.35)];
    const pairs = offsets.map((offset) => edgePointPair(segment, offset, options.sampleSurface)).filter(Boolean);
    for (let side = 0; side < pairs.length && edges.length + 1 < networkEdgeLimit; side += 1) {
      const pair = pairs[side];
      if (typeof options.isBlockedPoint === 'function' && (
        options.isBlockedPoint(pair.p1.x, pair.p1.z) || options.isBlockedPoint(pair.p2.x, pair.p2.z)
      )) continue;
      const provenance = mappedPath ? 'mapped_path' : 'inferred_sidewalk';
      addEdge(pair, segment, `${side}:forward`, pair.p1, pair.p2, provenance);
      addEdge(pair, segment, `${side}:reverse`, pair.p2, pair.p1, provenance);
    }
    if (!mappedPath && pairs.length === 2 && index % 4 === 0 && edges.length + 1 < networkEdgeLimit) {
      addEdge(pairs[0], segment, 'crossing:forward', pairs[0].p1, pairs[1].p1, 'inferred_crossing', 'crossing');
      addEdge(pairs[0], segment, 'crossing:reverse', pairs[1].p1, pairs[0].p1, 'inferred_crossing', 'crossing');
    }
  }

  for (const entrance of Array.isArray(options.entrances) ? options.entrances : []) {
    if (edges.length + 1 >= budget.pedestrianEdges || store.nodes.length === 0) break;
    let nearest = null;
    for (let index = 0; index < store.nodes.length; index += 1) {
      const node = store.nodes[index];
      if (node.role === 'entrance') continue;
      const distance = Math.hypot(entrance.approachX - node.x, entrance.approachZ - node.z);
      if (!nearest || distance < nearest.distance) nearest = { index, node, distance };
    }
    if (!nearest || nearest.distance > 55) continue;
    const entrancePoint = { x: entrance.approachX, y: entrance.approachY + 0.08, z: entrance.approachZ };
    const entranceNode = store.upsert(entrancePoint, 'entrance');
    const edgeBase = {
      buildingSourceId: entrance.buildingSourceId,
      commercial: entrance.commercial === true,
      role: 'entrance',
      provenance: entrance.provenance
    };
    const outward = Object.freeze({
      id: `ped:${entrance.id}:out`,
      from: entranceNode,
      to: nearest.index,
      p1: Object.freeze(entrancePoint),
      p2: Object.freeze({ x: nearest.node.x, y: nearest.node.y, z: nearest.node.z }),
      length: nearest.distance,
      ...edgeBase
    });
    const inward = Object.freeze({
      ...outward,
      id: `ped:${entrance.id}:in`,
      from: nearest.index,
      to: entranceNode,
      p1: outward.p2,
      p2: outward.p1
    });
    edges.push(outward, inward);
  }

  return Object.freeze({
    publication: Object.freeze({
      type: 'PedestrianGraph',
      schemaVersion: 1,
      nodes: Object.freeze(store.nodes),
      edges: Object.freeze(edges),
      provenance: Object.freeze({
        authority: options.traversal?.authority || 'compiled-traversal',
        mappedPaths: edges.filter((edge) => edge.provenance === 'mapped_path').length,
        inferredSidewalks: edges.filter((edge) => edge.provenance === 'inferred_sidewalk').length,
        inferredCrossings: edges.filter((edge) => edge.provenance === 'inferred_crossing').length,
        entranceConnections: edges.filter((edge) => edge.role === 'entrance').length,
        additionalProviderQueries: 0
      }),
      diagnostics: Object.freeze({ tier, sourceSegments: sourceSegments.length, edgeLimit: budget.pedestrianEdges })
    }),
    runtimeFeatureByEdge
  });
}

export function compileTrafficGraph(options = {}) {
  const tier = String(options.tier || 'balanced').toLowerCase();
  const budget = GRAPH_BUDGET_BY_TIER[tier] || GRAPH_BUDGET_BY_TIER.balanced;
  const sourceSegments = (Array.isArray(options.traversal?.segments) ? options.traversal.segments : [])
    .filter((segment) => segment?.p1 && segment?.p2 && segmentPriority(segment) <= 1200)
    .sort((a, b) => segmentPriority(a) - segmentPriority(b));
  const store = makeNodeStore();
  const edges = [];
  const runtimeFeatureByEdge = new Map();
  const driveOnLeft = options.driveOnLeft === true;

  const addDirected = (segment, pair, reverse, directionName) => {
    if (edges.length >= budget.trafficEdges) return;
    const p1 = reverse ? pair.p2 : pair.p1;
    const p2 = reverse ? pair.p1 : pair.p2;
    const from = store.upsert(p1, 'lane');
    const to = store.upsert(p2, 'lane');
    const record = segment.feature?.transportRecord;
    const id = `traffic:${featureId(segment.feature, 'feature')}:${segment.segIndex}:${directionName}:${edges.length}`;
    edges.push(Object.freeze({
      id,
      from,
      to,
      p1: Object.freeze({ ...p1 }),
      p2: Object.freeze({ ...p2 }),
      length: pair.length,
      speedLimit: Math.max(4.5, Math.min(24, finite(record?.speed?.metersPerSecond, finite(segment.feature?.speedLimit, 12.5)))),
      laneCount: Math.max(1, Math.round(finite(record?.crossSection?.lanes, 1))),
      roadClass: String(segment.feature?.type || segment.feature?.networkKind || record?.classification?.highway || 'road'),
      laneProvenance: record?.crossSection?.lanesSource ? 'mapped' : 'inferred',
      direction: directionName,
      structure: structureState(segment.feature),
      provenance: record?.completeness === 'lossless' ? 'mapped_transport' : 'compiled_transport'
    }));
    runtimeFeatureByEdge.set(id, segment.feature);
  };

  for (const segment of sourceSegments) {
    if (edges.length >= budget.trafficEdges) break;
    const direction = String(segment.direction || 'both');
    const width = Math.max(4.8, finite(segment.feature?.width, finite(segment.feature?.transportRecord?.crossSection?.widthMeters, 7)));
    const laneOffset = Math.min(2.25, width * 0.24);
    const forwardOffset = driveOnLeft ? laneOffset : -laneOffset;
    const reverseOffset = -forwardOffset;
    if (direction !== 'reverse') {
      const pair = edgePointPair(segment, forwardOffset, options.sampleSurface);
      if (pair) addDirected(segment, pair, false, 'forward');
    }
    if (direction !== 'forward' && edges.length < budget.trafficEdges) {
      const pair = edgePointPair(segment, reverseOffset, options.sampleSurface);
      if (pair) addDirected(segment, pair, true, 'reverse');
    }
  }

  return Object.freeze({
    publication: Object.freeze({
      type: 'TrafficGraph',
      schemaVersion: 1,
      nodes: Object.freeze(store.nodes),
      edges: Object.freeze(edges),
      provenance: Object.freeze({
        authority: options.traversal?.authority || 'compiled-transport',
        mappedLaneEdges: edges.filter((edge) => edge.laneProvenance === 'mapped').length,
        inferredLaneEdges: edges.filter((edge) => edge.laneProvenance === 'inferred').length,
        driveOnLeft,
        additionalProviderQueries: 0
      }),
      diagnostics: Object.freeze({ tier, sourceSegments: sourceSegments.length, edgeLimit: budget.trafficEdges })
    }),
    runtimeFeatureByEdge
  });
}

export { GRAPH_BUDGET_BY_TIER };
