function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sideKey(side) {
  return `${String(side?.featureId || '')}@${finite(side?.distanceAlong).toFixed(2)}`;
}

function featureLength(feature) {
  const distances = feature?.transportSurfaceModel?.distances;
  return distances?.length ? finite(distances[distances.length - 1]) : 0;
}

function ownerScore(side, feature) {
  const atGrade = feature?.structureSemantics?.terrainMode === 'at_grade';
  const interior = side?.endpoint === 'interior';
  const link = /_link$/i.test(String(feature?.type || ''));
  return (
    (atGrade ? 1_000_000 : 0) +
    // At an endpoint-to-interior merge the through route owns the node
    // elevation; the terminating road supplies the graded approach.
    (interior ? 2_000_000 : 0) +
    (!link ? 10_000 : 0) +
    finite(feature?.width) * 100 +
    Math.min(9_999, featureLength(feature))
  );
}

function maximumGradeFor(feature) {
  if (feature?.structureSemantics?.terrainMode === 'subgrade') return 0.135;
  const type = String(
    feature?.transportRecord?.sourceTags?.highway ||
    feature?.transportRecord?.rawTags?.highway ||
    feature?.type ||
    ''
  ).toLowerCase();
  if (feature?.structureSemantics?.rampCandidate === true || /_link$/.test(type)) return 0.1;
  if (type === 'motorway' || type === 'trunk') return 0.06;
  return 0.085;
}

function hasEngineeredGraphConstraintAt(feature, side) {
  if (feature?.structureSemantics?.terrainMode !== 'at_grade') return false;
  // A compiled approach owns the elevation of the entire polyline. Every
  // mapped junction along it must return to the adjoining street's surface,
  // even when the original bridge/tunnel constraint is at another station.
  // Testing only the anchor station left side streets above excavated roads
  // and omitted those physical discontinuities from the audit as well.
  if (feature.transportSurfaceModel?.engineeredApproach === true) return true;
  const distance = finite(side?.distanceAlong);
  return (feature?.structureTransitionAnchors || []).some((anchor) =>
    anchor?.source === 'transport_graph_node' &&
    anchor?.engineeredApproach === true &&
    Math.abs(finite(anchor?.distance) - distance) <= 0.02
  );
}

function compiledSurfaceAtDistance(feature, distance) {
  const model = feature?.transportSurfaceModel;
  const distances = model?.distances;
  const heights = model?.centerHeights;
  if (!distances?.length || !heights?.length || distances.length !== heights.length) return NaN;
  const target = Math.max(0, Math.min(featureLength(feature), finite(distance)));
  let right = 1;
  while (right < distances.length && finite(distances[right]) < target) right += 1;
  if (right >= distances.length) return finite(heights[heights.length - 1], NaN);
  const left = Math.max(0, right - 1);
  const start = finite(distances[left]);
  const end = finite(distances[right]);
  const t = end > start ? (target - start) / (end - start) : 0;
  return finite(heights[left], NaN) +
    (finite(heights[right], NaN) - finite(heights[left], NaN)) * t;
}

export function connectedSideGroups(connections = []) {
  const parent = new Map();
  const sides = new Map();
  const ensure = (side) => {
    const key = sideKey(side);
    if (!parent.has(key)) parent.set(key, key);
    if (!sides.has(key)) sides.set(key, side);
    return key;
  };
  const find = (key) => {
    let root = parent.get(key);
    while (root !== parent.get(root)) root = parent.get(root);
    let cursor = key;
    while (parent.get(cursor) !== root) {
      const next = parent.get(cursor);
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  };
  for (const connection of connections) {
    if (!connection?.left || !connection?.right) continue;
    const left = ensure(connection.left);
    const right = ensure(connection.right);
    union(left, right);
  }
  const groups = new Map();
  for (const [key, side] of sides) {
    const root = find(key);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(side);
  }
  return [...groups.values()];
}

function completePhysicalSideGroups(connections, featureById) {
  // Source fidelity selects geometry, not a separate vertical coordinate
  // system. The accepted physical graph owns junctions across provider seams.
  // Neither a missing route nor a rejected source can become a height owner.
  return connectedSideGroups(connections.filter(connection => {
    const left = featureById.get(String(connection?.left?.featureId || ''));
    const right = featureById.get(String(connection?.right?.featureId || ''));
    return left && right &&
      left.transportRecord?.routeState !== 'incomplete' &&
      right.transportRecord?.routeState !== 'incomplete';
  }));
}

function physicalCorridorRoots(connections, featureById) {
  const parent = new Map();
  const root = id => {
    let current = parent.get(id);
    if (current === undefined) return undefined;
    while (current !== parent.get(current)) current = parent.get(current);
    let cursor = id;
    while (parent.get(cursor) !== current) {
      const next = parent.get(cursor); parent.set(cursor, current); cursor = next;
    }
    return current;
  };
  for (const connection of connections) {
    const leftId = String(connection?.left?.featureId || '');
    const rightId = String(connection?.right?.featureId || '');
    const left = featureById.get(leftId), right = featureById.get(rightId);
    if (!left || !right || left.transportRecord?.routeState === 'incomplete' ||
        right.transportRecord?.routeState === 'incomplete') continue;
    if (!parent.has(leftId)) parent.set(leftId, leftId);
    if (!parent.has(rightId)) parent.set(rightId, rightId);
    parent.set(root(rightId), root(leftId));
  }
  return new Map([...parent.keys()].map(id => [id, root(id)]));
}

export function auditTransportJunctionContinuity(
  features = [],
  transportNetworkModel = null,
  sampleSurfaceY = null,
  options = {}
) {
  const toleranceMeters = Math.max(0.01, finite(options.toleranceMeters, 0.25));
  const featureById = new Map();
  for (const feature of features) {
    const featureId = String(feature?.transportGraphRef?.featureId || '');
    if (featureId) featureById.set(featureId, feature);
  }
  const generalizedEngineeredApproaches = features.filter((feature) =>
    feature?.transportSurfaceModel?.engineeredApproach === true &&
    feature?.transportRecord?.completeness !== 'lossless'
  );
  // Both providers supply plan geometry. OSM layer describes crossing order,
  // not surveyed elevation. Require a complete published owner in the same
  // connected physical corridor, including a genuine cross-provider seam.
  // Merely sharing a provider is no authority to move an unrelated road.
  const corridorRoots = physicalCorridorRoots(transportNetworkModel?.connections || [], featureById);
  const invalidVerticalAnchors = [];
  let auditedVerticalAnchorCount = 0;
  for (const feature of features) {
    const anchors = (feature?.structureTransitionAnchors || []).filter((anchor) =>
      anchor?.source === 'transport_graph_node');
    if (feature?.transportSurfaceModel?.engineeredApproach === true && !anchors.length) {
      invalidVerticalAnchors.push(Object.freeze({
        featureId: String(feature?.transportGraphRef?.featureId || ''),
        reason: 'engineered_approach_without_graph_anchor'
      }));
    }
    for (const anchor of anchors) {
      auditedVerticalAnchorCount += 1;
      const owner = featureById.get(String(anchor.ownerFeatureId || ''));
      const featureId = String(feature?.transportGraphRef?.featureId || '');
      const ownerId = String(anchor.ownerFeatureId || '');
      const connectedOwner = corridorRoots.has(featureId) &&
        corridorRoots.get(featureId) === corridorRoots.get(ownerId);
      const reason = !owner ? 'missing_vertical_owner'
        : owner.transportRecord?.routeState === 'incomplete' ? 'incomplete_vertical_owner'
        : !connectedOwner ? 'unconnected_vertical_owner'
        : !Number.isFinite(anchor.targetSurfaceY) ? 'nonfinite_vertical_target' : null;
      if (reason) invalidVerticalAnchors.push(Object.freeze({
        featureId: String(feature?.transportGraphRef?.featureId || ''),
        ownerFeatureId: String(anchor.ownerFeatureId || ''), reason
      }));
    }
  }
  const verticalOwnership = Object.freeze({
    auditedVerticalAnchorCount,
    invalidVerticalAnchorCount: invalidVerticalAnchors.length,
    invalidVerticalAnchors: Object.freeze(invalidVerticalAnchors)
  });
  if (!transportNetworkModel?.connections?.length || typeof sampleSurfaceY !== 'function') {
    return Object.freeze({
      authority: 'compiled_transport_graph_node_continuity',
      ...verticalOwnership,
      toleranceMeters,
      authoritativeConnectionCount: 0,
      auditedConnectionCount: 0,
      generalizedConnectionCount: 0,
      sampledConnectionCount: 0,
      maximumVerticalDeltaMeters: 0,
      discontinuityCount: 0,
      discontinuities: Object.freeze([]),
      generalizedEngineeredApproachCount: generalizedEngineeredApproaches.length,
      generalizedEngineeredApproachIds: Object.freeze(generalizedEngineeredApproaches
        .slice(0, 12)
        .map((feature) => String(feature?.sourceFeatureId || feature?.transportGraphRef?.featureId || '')))
    });
  }

  let authoritativeConnectionCount = 0;
  let auditedConnectionCount = 0;
  let generalizedConnectionCount = 0;
  let sampledConnectionCount = 0;
  let maximumVerticalDeltaMeters = 0;
  const discontinuities = [];
  for (const connection of transportNetworkModel.connections) {
    const leftFeature = featureById.get(String(connection?.left?.featureId || ''));
    const rightFeature = featureById.get(String(connection?.right?.featureId || ''));
    if (!leftFeature || !rightFeature) continue;
    const complete = [leftFeature, rightFeature].every((feature) =>
      feature?.transportRecord?.routeState !== 'incomplete');
    const exactComplete = [leftFeature, rightFeature].every((feature) =>
      feature?.transportRecord?.completeness === 'lossless');
    const structureConnection = [
      { feature: leftFeature, side: connection.left },
      { feature: rightFeature, side: connection.right }
    ].some(({ feature, side }) =>
      feature?.structureSemantics?.terrainMode !== 'at_grade' ||
      hasEngineeredGraphConstraintAt(feature, side)
    );
    if (!complete || !structureConnection) continue;
    // Generalized coordinates are not surveyed elevations, but once rendered
    // as connected drivable surfaces their physical join must still agree.
    // Skipping them hid metre-scale steps whenever the exact provider failed.
    auditedConnectionCount += 1;
    if (exactComplete) authoritativeConnectionCount += 1;
    else generalizedConnectionCount += 1;
    const sampleSide = (feature, side) => Number(sampleSurfaceY(
      feature,
      finite(side?.point?.x),
      finite(side?.point?.z),
      {
        segIndex: finite(side?.segmentIndex),
        t: finite(side?.segmentT)
      }
    ));
    const leftY = sampleSide(leftFeature, connection.left);
    const rightY = sampleSide(rightFeature, connection.right);
    if (!Number.isFinite(leftY) || !Number.isFinite(rightY)) continue;
    sampledConnectionCount += 1;
    const verticalDeltaMeters = Math.abs(leftY - rightY);
    maximumVerticalDeltaMeters = Math.max(maximumVerticalDeltaMeters, verticalDeltaMeters);
    if (verticalDeltaMeters <= toleranceMeters) continue;
    const describeFeature = (feature) => Object.freeze({
      id: String(feature?.sourceFeatureId || feature?.transportGraphRef?.featureId || ''),
      name: String(feature?.name || ''),
      type: String(feature?.type || ''),
      terrainMode: String(feature?.structureSemantics?.terrainMode || ''),
      structureKind: String(feature?.structureSemantics?.structureKind || ''),
      bridge: feature?.structureSemantics?.isBridge === true,
      tunnel: feature?.structureSemantics?.isTunnel === true,
      engineeredApproach: feature?.transportSurfaceModel?.engineeredApproach === true,
      maximumGrade: finite(feature?.transportSurfaceModel?.stats?.maximumGrade),
      maximumFill: finite(feature?.transportSurfaceModel?.stats?.maximumFill),
      anchors: Object.freeze((feature?.structureTransitionAnchors || []).map((anchor) => Object.freeze({
        distance: finite(anchor?.distance),
        endpoint: anchor?.endpoint || null,
        targetSurfaceY: Number.isFinite(Number(anchor?.targetSurfaceY))
          ? Number(anchor.targetSurfaceY)
          : null,
        targetOffset: finite(anchor?.targetOffset),
        source: String(anchor?.source || ''),
        engineeredApproach: anchor?.engineeredApproach === true
      })))
    });
    discontinuities.push(Object.freeze({
      connectionId: String(connection.id || ''),
      kind: String(connection.kind || ''),
      provenance: String(connection?.provenance?.method || ''),
      sourceCompleteness: exactComplete ? 'lossless' : 'generalized',
      leftFeatureId: String(connection.left.featureId || ''),
      rightFeatureId: String(connection.right.featureId || ''),
      leftTerrainMode: String(leftFeature?.structureSemantics?.terrainMode || ''),
      rightTerrainMode: String(rightFeature?.structureSemantics?.terrainMode || ''),
      leftY,
      rightY,
      verticalDeltaMeters,
      leftFeature: describeFeature(leftFeature),
      rightFeature: describeFeature(rightFeature)
    }));
  }

  discontinuities.sort((left, right) => right.verticalDeltaMeters - left.verticalDeltaMeters);
  return Object.freeze({
    authority: 'compiled_transport_graph_node_continuity',
    ...verticalOwnership,
    toleranceMeters,
    authoritativeConnectionCount,
    auditedConnectionCount,
    generalizedConnectionCount,
    sampledConnectionCount,
    maximumVerticalDeltaMeters,
    discontinuityCount: discontinuities.length,
    // Preserve every structure-related failure, regardless of source fidelity,
    // so provider-dependent
    // topology cannot hide behind a top-N sample during repair.
    discontinuities: Object.freeze(discontinuities),
    generalizedEngineeredApproachCount: generalizedEngineeredApproaches.length,
    generalizedEngineeredApproachIds: Object.freeze(generalizedEngineeredApproaches
      .slice(0, 12)
      .map((feature) => String(feature?.sourceFeatureId || feature?.transportGraphRef?.featureId || '')))
  });
}

export function buildTransportContinuityRepairAnchors(
  features = [],
  transportNetworkModel = null,
  sampleSurfaceY = null,
  options = {}
) {
  if (!transportNetworkModel?.connections?.length || typeof sampleSurfaceY !== 'function') {
    return Object.freeze({ anchorsByFeature: new Map(), seedNodeCount: 0, propagatedNodeCount: 0 });
  }
  const toleranceMeters = Math.max(0.01, finite(options.toleranceMeters, 0.25));
  const featureById = new Map();
  for (const feature of features) {
    const featureId = String(feature?.transportGraphRef?.featureId || '');
    if (featureId) featureById.set(featureId, feature);
  }
  const groups = completePhysicalSideGroups(transportNetworkModel.connections, featureById).map((sides, index) => {
    const complete = sides.map((side) => ({
      side,
      feature: featureById.get(String(side.featureId || ''))
    })).filter(({ feature }) =>
      feature?.transportRecord && feature.transportRecord.routeState !== 'incomplete');
    // Once a complete generalized route is published as a physical road, its
    // shared junction and along-route grade constraints are just as binding.
    // Previously only the initial per-node pass handled these roads; each
    // independent profile then rejected incompatible nodes and left a step.
    // Conflation retires duplicate geometry before this pass. Every surviving
    // physical join shares one feasible height, regardless of source provider.
    return {id:index,sides:complete};
  });
  const membershipsByFeature = new Map();
  const targetByGroup = new Map();
  const ownerByGroup = new Map();
  let seedNodeCount = 0;
  const surfaceFor = ({ side, feature }) => Number(sampleSurfaceY(
    feature,
    finite(side?.point?.x),
    finite(side?.point?.z),
    { segIndex: finite(side?.segmentIndex), t: finite(side?.segmentT) }
  ));

  for (const group of groups) {
    for (const entry of group.sides) {
      if (!membershipsByFeature.has(entry.feature)) membershipsByFeature.set(entry.feature, []);
      membershipsByFeature.get(entry.feature).push({ group, ...entry });
    }
    const sampled = group.sides.map((entry) => ({ ...entry, surfaceY: surfaceFor(entry) }))
      .filter((entry) => Number.isFinite(entry.surfaceY));
    const elevated = sampled.filter(({ feature }) =>
      feature?.structureSemantics?.terrainMode === 'elevated');
    const subgrade = sampled.filter(({ feature }) =>
      feature?.structureSemantics?.terrainMode === 'subgrade');
    const atGrade = sampled.filter(({ feature }) =>
      feature?.structureSemantics?.terrainMode === 'at_grade');
    const engineeredAtGrade = atGrade.filter(({ feature, side }) =>
      hasEngineeredGraphConstraintAt(feature, side));
    const terrainFittedAtGrade = atGrade.filter(({ feature, side }) =>
      !hasEngineeredGraphConstraintAt(feature, side));
    const interior = sampled.filter(({ side }) => side?.endpoint === 'interior');
    let target = NaN;
    let owner = null;
    if (atGrade.length > 0 && (elevated.length > 0 || subgrade.length > 0)) {
      // Exact mapped surface roads own the physical portal/abutment elevation.
      // A provisional at-grade profile may already have been grade-smoothed
      // below the accepted terrain at a steep endpoint. That buried profile is
      // not a valid surface authority. Use the highest renderable incident
      // surface so both the structure and its approach meet on or above the
      // final ground instead of leaving a bridge end suspended over a road the
      // terrain pass later has to excavate.
      const surfaceCandidates = atGrade.map((entry) => {
        const point = entry.side?.point || entry.feature?.pts?.[0];
        const terrainY = Number(options.sampleTerrainY?.(finite(point?.x), finite(point?.z)));
        const surfaceBias = Number.isFinite(entry.feature?.surfaceBias)
          ? Number(entry.feature.surfaceBias)
          : 0.08;
        return {
          entry,
          surfaceY: Math.max(
            entry.surfaceY,
            Number.isFinite(terrainY) ? terrainY + surfaceBias : -Infinity
          )
        };
      }).filter((entry) => Number.isFinite(entry.surfaceY));
      surfaceCandidates.sort((left, right) => right.surfaceY - left.surfaceY);
      owner = surfaceCandidates[0]?.entry || null;
      target = surfaceCandidates[0]?.surfaceY;
    } else if (interior.length > 0 && engineeredAtGrade.length > 0) {
      owner = [...interior].sort((left, right) =>
        ownerScore(right.side, right.feature) - ownerScore(left.side, left.feature))[0];
      target = owner.surfaceY;
      if (atGrade.length === sampled.length) {
        // An endpoint-to-interior tie-in makes the through route the topology
        // owner, not a license to publish that provisional ribbon below the
        // accepted ground shared by both surfaces. This occurs when terrain
        // fitting smooths a steep DEM sample before exact node reconciliation.
        // Restrict this to a node already proven to be part of an engineered
        // corridor; ordinary exact T-junctions must remain terrain-fitted and
        // cannot become bridge approaches merely because they have an interior
        // source node. Preserve the through-route owner while raising the
        // physical node to the highest renderable at-grade surface floor.
        const terrainFloors = atGrade.map((entry) => {
          const point = entry.side?.point || entry.feature?.pts?.[0];
          const terrainY = Number(options.sampleTerrainY?.(finite(point?.x), finite(point?.z)));
          const surfaceBias = Number.isFinite(entry.feature?.surfaceBias)
            ? Number(entry.feature.surfaceBias)
            : 0.08;
          return Number.isFinite(terrainY) ? terrainY + surfaceBias : NaN;
        }).filter(Number.isFinite);
        if (terrainFloors.length > 0) target = Math.max(target, ...terrainFloors);
      }
    } else if (elevated.length > 0) {
      // All incident elevated ways share one mapped node, while their
      // clearance/stack heights are modeled. Reconcile downward to the lowest
      // already-feasible deck instead of using the highest estimate to lift a
      // whole interchange.
      owner = [...elevated].sort((left, right) => left.surfaceY - right.surfaceY)[0];
      target = owner.surfaceY;
    } else if (subgrade.length > 0) {
      // Internal tunnel way splits are solved as one connected corridor below.
      // Seeding each split from its provisional per-way surface samples the
      // hillside above the tunnel and falsely turns every OSM fragment into a
      // portal. Only a group that also contains an at-grade way is a measured
      // surface transition and was handled by the first branch.
      continue;
    } else if (engineeredAtGrade.length > 0 && terrainFittedAtGrade.length > 0) {
      // The far end of a graded bridge/tunnel approach must return to the
      // ordinary street network at the exact mapped node. The terrain-fitted
      // road owns that pure surface junction; otherwise the approach profile
      // can remain visibly suspended above the adjoining streets.
      owner = [...terrainFittedAtGrade].sort((left, right) =>
        ownerScore(right.side, right.feature) - ownerScore(left.side, left.feature))[0];
      target = owner.surfaceY;
    } else if (engineeredAtGrade.length > 0) {
      // Once every exact surface fragment incident to a node carries an
      // approach anchor, classification alone can no longer identify the
      // terrain-owned side of the transition. Leaving that node unseeded lets
      // finalization publish an unrelated endpoint target after this corridor
      // solve, producing mutually infeasible anchors and an open-air road end.
      // The shared mapped node is still a physical surface junction: seed its
      // minimum renderable elevation from accepted ground, then let the grade
      // propagation below raise it only as far as the connected engineered
      // corridor requires.
      const terrainCandidates = engineeredAtGrade.map((entry) => {
        const point = entry.side?.point || entry.feature?.pts?.[0];
        const terrainY = Number(options.sampleTerrainY?.(finite(point?.x), finite(point?.z)));
        const surfaceBias = Number.isFinite(entry.feature?.surfaceBias)
          ? Number(entry.feature.surfaceBias)
          : 0.08;
        return { entry, surfaceY: Number.isFinite(terrainY) ? terrainY + surfaceBias : NaN };
      }).filter((entry) => Number.isFinite(entry.surfaceY));
      if (terrainCandidates.length > 0) {
        terrainCandidates.sort((left, right) => right.surfaceY - left.surfaceY);
        owner = terrainCandidates[0].entry;
        target = terrainCandidates[0].surfaceY;
      }
    }
    if (!Number.isFinite(target)) continue;
    targetByGroup.set(group.id, target);
    ownerByGroup.set(group.id, owner);
    seedNodeCount += 1;
  }

  // Solve connected tunnel components from their real surface portals. The
  // graph is the source topology; edge lengths are mapped route distances.
  // Unknown internal way splits receive a harmonic interpolation between
  // portal elevations, so tunnel geometry never samples the terrain above it.
  const tunnelAdjacency = new Map();
  const tunnelMembershipByGroup = new Map();
  const addTunnelEdge = (leftId, rightId, run) => {
    if (leftId === rightId) return;
    if (!tunnelAdjacency.has(leftId)) tunnelAdjacency.set(leftId, []);
    if (!tunnelAdjacency.has(rightId)) tunnelAdjacency.set(rightId, []);
    tunnelAdjacency.get(leftId).push({ id: rightId, run });
    tunnelAdjacency.get(rightId).push({ id: leftId, run });
  };
  for (const [feature, memberships] of membershipsByFeature) {
    if (feature?.structureSemantics?.terrainMode !== 'subgrade') continue;
    const ordered = memberships
      .map((membership) => ({
        ...membership,
        distance: finite(membership?.side?.distanceAlong)
      }))
      .sort((left, right) => left.distance - right.distance);
    for (const membership of ordered) {
      tunnelMembershipByGroup.set(membership.group.id, membership);
      if (!tunnelAdjacency.has(membership.group.id)) tunnelAdjacency.set(membership.group.id, []);
    }
    for (let index = 1; index < ordered.length; index += 1) {
      addTunnelEdge(
        ordered[index - 1].group.id,
        ordered[index].group.id,
        Math.max(1, ordered[index].distance - ordered[index - 1].distance)
      );
    }
  }
  const visitedTunnelGroups = new Set();
  for (const startId of tunnelAdjacency.keys()) {
    if (visitedTunnelGroups.has(startId)) continue;
    const component = [];
    const queue = [startId];
    visitedTunnelGroups.add(startId);
    while (queue.length > 0) {
      const id = queue.shift();
      component.push(id);
      for (const edge of tunnelAdjacency.get(id) || []) {
        if (visitedTunnelGroups.has(edge.id)) continue;
        visitedTunnelGroups.add(edge.id);
        queue.push(edge.id);
      }
    }
    const fixed = component.filter((id) => Number.isFinite(targetByGroup.get(id)));
    if (fixed.length === 0) {
      // A fully enclosed/incomplete component has no mapped surface portal.
      // Seed it from the deepest already-contained compiled node rather than
      // from terrain, then hold that datum while smoothing the component.
      const candidates = component.map((id) => {
        const membership = tunnelMembershipByGroup.get(id);
        return { id, membership, surfaceY: membership ? surfaceFor(membership) : NaN };
      }).filter((entry) => Number.isFinite(entry.surfaceY));
      candidates.sort((left, right) => left.surfaceY - right.surfaceY);
      if (candidates.length > 0) {
        const seed = candidates[0];
        targetByGroup.set(seed.id, seed.surfaceY);
        ownerByGroup.set(seed.id, seed.membership);
        fixed.push(seed.id);
      }
    }
    if (fixed.length === 0) continue;
    const fixedSet = new Set(fixed);
    const initial = fixed.reduce((sum, id) => sum + targetByGroup.get(id), 0) / fixed.length;
    const values = new Map(component.map((id) => [
      id,
      Number.isFinite(targetByGroup.get(id)) ? targetByGroup.get(id) : initial
    ]));
    for (let pass = 0; pass < 160; pass += 1) {
      let maximumChange = 0;
      const next = new Map(values);
      for (const id of component) {
        if (fixedSet.has(id)) continue;
        let weighted = 0;
        let weightTotal = 0;
        for (const edge of tunnelAdjacency.get(id) || []) {
          const weight = 1 / Math.max(1, edge.run);
          weighted += finite(values.get(edge.id)) * weight;
          weightTotal += weight;
        }
        if (!(weightTotal > 0)) continue;
        const value = weighted / weightTotal;
        maximumChange = Math.max(maximumChange, Math.abs(value - finite(values.get(id))));
        next.set(id, value);
      }
      for (const [id, value] of next) values.set(id, value);
      if (maximumChange < 1e-4) break;
    }
    for (const id of component) {
      if (Number.isFinite(targetByGroup.get(id))) continue;
      targetByGroup.set(id, values.get(id));
      ownerByGroup.set(id, tunnelMembershipByGroup.get(id));
    }
  }

  // Solve the affected corridor to closure before publishing any profile.
  // A fixed number of compile/repair passes left a different road end open
  // after each newly adjusted approach. Activate an ordinary continuation only
  // when a shared node actually moves; its other nodes then participate in the
  // same solve. Descending height propagation with non-negative grade costs
  // terminates on this finite graph, independent of how OSM split the route.
  const activeFeatures = new Set();
  const gradeAdjacency = new Map();
  const heap = [];
  const pushHeight = (id, height) => {
    let index = heap.length;
    heap.push({id,height});
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (heap[parent].height >= height) break;
      heap[index] = heap[parent]; index = parent;
    }
    heap[index] = {id,height};
  };
  const popHeight = () => {
    const first = heap[0], last = heap.pop();
    if (heap.length) {
      let index = 0;
      while (index * 2 + 1 < heap.length) {
        let child = index * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1].height > heap[child].height) child++;
        if (last.height >= heap[child].height) break;
        heap[index] = heap[child]; index = child;
      }
      heap[index] = last;
    }
    return first;
  };
  const raiseNode = (id, height, owner) => {
    if (!Number.isFinite(height) || height <= (targetByGroup.get(id) ?? -Infinity) + 1e-6) return;
    targetByGroup.set(id,height);
    if (owner) ownerByGroup.set(id,owner);
    pushHeight(id,height);
  };
  const ensureNode = membership => {
    const {group} = membership;
    if (targetByGroup.has(group.id)) return;
    const candidates = group.sides.map(entry => {
      const point = entry.side.point;
      const terrain = Number(options.sampleTerrainY?.(finite(point?.x),finite(point?.z)));
      const bias = Number.isFinite(entry.feature.surfaceBias) ? entry.feature.surfaceBias : .08;
      return {entry,height:Number.isFinite(terrain) ? terrain + bias : surfaceFor(entry)};
    }).filter(row => Number.isFinite(row.height)).sort((a,b) => b.height-a.height);
    if (candidates.length) raiseNode(group.id,candidates[0].height,candidates[0].entry);
  };
  const activate = feature => {
    if (activeFeatures.has(feature)) return;
    activeFeatures.add(feature);
    const ordered = [...(membershipsByFeature.get(feature)||[])]
      .sort((a,b) => finite(a.side.distanceAlong)-finite(b.side.distanceAlong));
    const grade = maximumGradeFor(feature);
    for (const member of ordered) ensureNode(member);
    for (let index=1; index<ordered.length; index++) {
      const left=ordered[index-1],right=ordered[index];
      if (left.group.id===right.group.id) continue;
      const cost=grade*Math.abs(finite(right.side.distanceAlong)-finite(left.side.distanceAlong));
      for (const [from,to] of [[left,right],[right,left]]) {
        if (!gradeAdjacency.has(from.group.id)) gradeAdjacency.set(from.group.id,[]);
        gradeAdjacency.get(from.group.id).push({id:to.group.id,cost});
      }
    }
    for (const member of ordered) {
      // A modeled crossing clearance is also a hard vertical constraint. Its
      // grade cone must reach graph nodes before either adjoining deck builds.
      if (feature.structureSemantics?.terrainMode === 'elevated') {
        for (const station of feature.structureStations||[]) {
          const distance=Math.max(0,Math.min(featureLength(feature),finite(station.distance)));
          const height=compiledSurfaceAtDistance(feature,distance);
          raiseNode(member.group.id,height-grade*Math.abs(distance-finite(member.side.distanceAlong)),member);
        }
      }
      const height=targetByGroup.get(member.group.id);
      if (Number.isFinite(height)) pushHeight(member.group.id,height);
    }
  };
  for (const feature of membershipsByFeature.keys()) {
    if (feature.structureSemantics?.terrainMode !== 'at_grade' || feature.transportSurfaceModel?.engineeredApproach) activate(feature);
  }
  while (heap.length) {
    const {id,height}=popHeight();
    if (height < targetByGroup.get(id)-1e-6) continue;
    for (const entry of groups[id].sides) {
      if (activeFeatures.has(entry.feature)) continue;
      const current=surfaceFor(entry);
      if (Number.isFinite(current) && Math.abs(height-current)>toleranceMeters) activate(entry.feature);
    }
    for (const edge of gradeAdjacency.get(id)||[]) raiseNode(edge.id,height-edge.cost,ownerByGroup.get(id));
  }

  // Foundations are hard upper bounds, unlike adjustable terrain cover at a
  // portal. Carry their grade cones through the actual graph before compiling
  // either side of a join. Stop excavating where an ordinary surface node is
  // already below the cone; unrelated streets must retain their terrain fit.
  const foundationAffectedGroups = new Set();
  const ceilingByGroup = new Map();
  const adjacency = new Map();
  const ceilingQueue = [];
  const constrainCeiling = (groupId, ceiling, owner) => {
    if (!Number.isFinite(ceiling) || ceiling >= (ceilingByGroup.get(groupId) ?? Infinity) - 1e-6) return;
    ceilingByGroup.set(groupId, ceiling);
    ceilingQueue.push({groupId, ceiling, owner});
  };
  for (const [feature, memberships] of membershipsByFeature) {
    const grade = maximumGradeFor(feature);
    const ordered = [...memberships].sort((a,b) => finite(a.side.distanceAlong) - finite(b.side.distanceAlong));
    for (let i = 1; i < ordered.length; i++) {
      const left = ordered[i-1], right = ordered[i];
      const cost = grade * Math.abs(finite(right.side.distanceAlong) - finite(left.side.distanceAlong));
      for (const [from,to] of [[left,right],[right,left]]) {
        if (!adjacency.has(from.group.id)) adjacency.set(from.group.id,[]);
        adjacency.get(from.group.id).push({id:to.group.id,cost,feature});
      }
    }
    for (const member of ordered) for (const limit of feature.tunnelObstructionLimits || []) {
      const d = finite(member.side.distanceAlong);
      const run = Math.max(0, limit.start-d, d-limit.end);
      constrainCeiling(member.group.id,limit.maximumSurfaceY+grade*run,member);
    }
  }
  for (let index=0; index<ceilingQueue.length; index++) {
    const {groupId,ceiling,owner}=ceilingQueue[index];
    if (ceiling > ceilingByGroup.get(groupId)+1e-6) continue;
    let target=targetByGroup.get(groupId);
    if (!Number.isFinite(target)) {
      const samples=groups[groupId].sides.map(entry=>surfaceFor(entry)).filter(Number.isFinite);
      if (!samples.length) continue;
      target=Math.max(...samples);
    }
    const lowered=target>ceiling+1e-6;
    if (lowered) {
      targetByGroup.set(groupId,ceiling);
      ownerByGroup.set(groupId,owner);
      foundationAffectedGroups.add(groupId);
    }
    for (const edge of adjacency.get(groupId)||[]) {
      if (lowered || edge.feature.structureSemantics?.terrainMode !== 'at_grade' || edge.feature.transportSurfaceModel?.engineeredApproach) constrainCeiling(edge.id,ceiling+edge.cost,owner);
    }
  }

  const anchorsByFeature = new Map();
  for (const group of groups) {
    const targetSurfaceY = targetByGroup.get(group.id);
    if (!Number.isFinite(targetSurfaceY)) continue;
    const owner = ownerByGroup.get(group.id);
    for (const entry of group.sides) {
      const { feature, side } = entry;
      const currentSurfaceY = surfaceFor(entry);
      if (!Number.isFinite(currentSurfaceY)) continue;
      const terrainMode = feature?.structureSemantics?.terrainMode || 'at_grade';
      const point = side.point || feature.pts?.[0];
      const terrainY = Number(options.sampleTerrainY?.(finite(point?.x), finite(point?.z)));
      if (!Number.isFinite(terrainY)) continue;
      const surfaceBias = Number.isFinite(feature.surfaceBias) ? Number(feature.surfaceBias) : 0.08;
      const targetDelta = Math.abs(targetSurfaceY - currentSurfaceY);
      const constrainedMembershipCount = (membershipsByFeature.get(feature) || [])
        .filter((membership) => Number.isFinite(targetByGroup.get(membership.group.id)))
        .length;
      const conflictingPublishedTarget = (feature.structureTransitionAnchors || []).some((anchor) =>
        anchor?.source === 'transport_graph_node' &&
        Math.abs(finite(anchor?.distance) - finite(side?.distanceAlong)) <= 0.02 &&
        Number.isFinite(Number(anchor?.targetSurfaceY)) &&
        Math.abs(Number(anchor.targetSurfaceY) - targetSurfaceY) > 1e-5
      );
      // Continuity tolerance decides whether a visible node step is already
      // acceptable. It cannot discard a smaller adjustment that made two or
      // more graph constraints grade-feasible, or leave an older graph target
      // in place merely because the profile compiler already clipped the
      // rendered endpoint to the feasible grade cone. In both cases the solved
      // graph constraint must be published; otherwise the next compile reads
      // the stale target and restores the original metre-scale discontinuity.
      const hasPublishedNode = (feature.structureTransitionAnchors || []).some(anchor =>
        anchor?.source === 'transport_graph_node' &&
        Math.abs(finite(anchor.distance)-finite(side.distanceAlong)) <= .02);
      const requiredForGradeFeasibility = activeFeatures.has(feature) &&
        (constrainedMembershipCount > 1 && (targetDelta > 1e-5 || conflictingPublishedTarget) || !hasPublishedNode);
      const reconcilingAtGrade = terrainMode === 'at_grade' &&
        (targetDelta > toleranceMeters || requiredForGradeFeasibility) &&
        (targetSurfaceY >= terrainY + surfaceBias - 0.02 || foundationAffectedGroups.has(group.id));
      const reconcilingStructure = terrainMode !== 'at_grade' &&
        (targetDelta > toleranceMeters || requiredForGradeFeasibility);
      if (!reconcilingAtGrade && !reconcilingStructure) continue;
      const gradeRun = Math.abs(targetSurfaceY - currentSurfaceY) / maximumGradeFor(feature);
      if (!anchorsByFeature.has(feature)) anchorsByFeature.set(feature, []);
      anchorsByFeature.get(feature).push(Object.freeze({
        distance: Math.max(0, finite(side.distanceAlong)),
        targetOffset: targetSurfaceY - terrainY - surfaceBias,
        targetSurfaceY,
        span: Math.max(24, Math.min(featureLength(feature), gradeRun + 24)),
        endpoint: side.endpoint === 'start' || side.endpoint === 'end' ? side.endpoint : null,
        graphEndpoint: side.endpoint === 'start' || side.endpoint === 'end' ? side.endpoint : null,
        source: 'transport_graph_node',
        engineeredApproach: reconcilingAtGrade,
        continuityRepair: true,
        ownerFeatureId: String(owner?.side?.featureId || '')
      }));
    }
  }
  return Object.freeze({
    anchorsByFeature,
    seedNodeCount,
    propagatedNodeCount: Math.max(0, targetByGroup.size - seedNodeCount)
  });
}

export function buildIntegratedApproachContinuationAnchors(
  features = [],
  transportNetworkModel = null,
  sampleSurfaceY = null,
  sampleTerrainY = null,
  options = {}
) {
  if (
    !transportNetworkModel?.connections?.length ||
    typeof sampleSurfaceY !== 'function' ||
    typeof sampleTerrainY !== 'function'
  ) return Object.freeze({ anchorsByFeature: new Map(), connectionCount: 0 });

  const toleranceMeters = Math.max(0.01, finite(options.toleranceMeters, 0.25));
  const featureById = new Map();
  for (const feature of features) {
    const featureId = String(feature?.transportGraphRef?.featureId || '');
    if (featureId) featureById.set(featureId, feature);
  }
  const anchorsByFeature = new Map();
  let connectionCount = 0;
  const sampleSide = (feature, side) => Number(sampleSurfaceY(
    feature,
    finite(side?.point?.x),
    finite(side?.point?.z),
    { segIndex: finite(side?.segmentIndex), t: finite(side?.segmentT) }
  ));

  for (const connection of transportNetworkModel.connections) {
    const leftFeature = featureById.get(String(connection?.left?.featureId || ''));
    const rightFeature = featureById.get(String(connection?.right?.featureId || ''));
    if (![leftFeature, rightFeature].every((feature) =>
      feature?.transportRecord?.completeness === 'lossless' &&
      feature?.transportRecord?.routeState !== 'incomplete' &&
      feature?.structureSemantics?.terrainMode === 'at_grade')) continue;

    const leftEngineered = leftFeature?.transportSurfaceModel?.engineeredApproach === true;
    const rightEngineered = rightFeature?.transportSurfaceModel?.engineeredApproach === true;
    if (leftEngineered === rightEngineered) continue;
    const source = leftEngineered
      ? { feature: leftFeature, side: connection.left }
      : { feature: rightFeature, side: connection.right };
    const destination = leftEngineered
      ? { feature: rightFeature, side: connection.right }
      : { feature: leftFeature, side: connection.left };
    if (!['start', 'end'].includes(String(destination.side?.endpoint || ''))) continue;

    const sourceSurfaceY = sampleSide(source.feature, source.side);
    const currentSurfaceY = sampleSide(destination.feature, destination.side);
    if (
      !Number.isFinite(sourceSurfaceY) ||
      !Number.isFinite(currentSurfaceY) ||
      sourceSurfaceY <= currentSurfaceY + toleranceMeters
    ) continue;
    const endpointToEndpoint = ['start', 'end'].includes(String(source.side?.endpoint || ''));
    // At an endpoint-to-endpoint continuation the ordinary terrain-fitted road
    // owns the return elevation. Extending the raised approach into each next
    // road caused positive feedback across whole city networks. Interior merges
    // are different: the engineered through route owns that junction.
    const target = endpointToEndpoint ? source : destination;
    const point = target.side.point || target.feature.pts?.[0];
    const terrainY = Number(sampleTerrainY(finite(point?.x), finite(point?.z)));
    if (!Number.isFinite(terrainY)) continue;
    const surfaceBias = Number.isFinite(target.feature.surfaceBias)
      ? Number(target.feature.surfaceBias)
      : 0.08;
    // A terrain-owned continuation cannot demand a surface below the accepted
    // ground at the engineered endpoint. Use the lowest physically renderable
    // common elevation; this avoids both a buried road and the old choice of
    // propagating the full raised deck into the next street.
    const targetSurfaceY = endpointToEndpoint
      ? Math.max(currentSurfaceY, terrainY + surfaceBias)
      : sourceSurfaceY;
    const gradeRun = Math.abs(sourceSurfaceY - currentSurfaceY) / maximumGradeFor(target.feature);
    const anchor = Object.freeze({
      distance: Math.max(0, finite(target.side.distanceAlong)),
      targetOffset: targetSurfaceY - terrainY - surfaceBias,
      targetSurfaceY,
      span: Math.max(24, Math.min(featureLength(target.feature), gradeRun + 24)),
      endpoint: target.side.endpoint,
      graphEndpoint: target.side.endpoint,
      source: 'transport_graph_node',
      engineeredApproach: true,
      approachContinuation: true,
      approachReturnToTerrain: endpointToEndpoint,
      ownerFeatureId: String((endpointToEndpoint ? destination : source).side?.featureId || '')
    });
    if (!anchorsByFeature.has(target.feature)) anchorsByFeature.set(target.feature, []);
    anchorsByFeature.get(target.feature).push(anchor);
    connectionCount += 1;
  }

  return Object.freeze({ anchorsByFeature, connectionCount });
}

export function buildExactTransportNodeFinalizationAnchors(
  features = [],
  transportNetworkModel = null,
  sampleSurfaceY = null,
  sampleTerrainY = null,
  options = {}
) {
  if (
    !transportNetworkModel?.connections?.length ||
    typeof sampleSurfaceY !== 'function' ||
    typeof sampleTerrainY !== 'function'
  ) return Object.freeze({ anchorsByFeature: new Map(), nodeCount: 0 });
  const toleranceMeters = Math.max(0.01, finite(options.toleranceMeters, 0.25));
  const featureById = new Map();
  for (const feature of features) {
    const featureId = String(feature?.transportGraphRef?.featureId || '');
    if (featureId) featureById.set(featureId, feature);
  }
  const anchorsByFeature = new Map();
  let nodeCount = 0;
  for (const sides of connectedSideGroups(transportNetworkModel.connections)) {
    const entries = sides.map((side) => ({
      side,
      feature: featureById.get(String(side.featureId || ''))
    })).filter(({ feature }) =>
      feature?.transportRecord?.completeness === 'lossless' &&
      feature?.transportRecord?.routeState !== 'incomplete'
    ).map((entry) => ({
      ...entry,
      surfaceY: Number(sampleSurfaceY(
        entry.feature,
        finite(entry.side?.point?.x),
        finite(entry.side?.point?.z),
        { segIndex: finite(entry.side?.segmentIndex), t: finite(entry.side?.segmentT) }
      ))
    })).filter((entry) => Number.isFinite(entry.surfaceY));
    const structural = entries.filter(({ feature, side }) =>
      feature?.structureSemantics?.terrainMode !== 'at_grade' ||
      hasEngineeredGraphConstraintAt(feature, side)
    );
    if (entries.length < 2 || structural.length === 0) continue;
    const atGrade = entries.filter(({ feature }) =>
      feature?.structureSemantics?.terrainMode === 'at_grade');
    const elevated = entries.filter(({ feature }) =>
      feature?.structureSemantics?.terrainMode === 'elevated');
    const subgrade = entries.filter(({ feature }) =>
      feature?.structureSemantics?.terrainMode === 'subgrade');
    const completedStructures = entries.filter(({ feature }) =>
      feature?.structureSemantics?.terrainMode !== 'at_grade');
    const structuralInterior = completedStructures.filter(({ side }) =>
      side?.endpoint === 'interior');
    const engineeredAtGrade = atGrade.filter(({ feature, side }) =>
      hasEngineeredGraphConstraintAt(feature, side));
    const terrainFittedAtGrade = atGrade.filter(({ feature, side }) =>
      !hasEngineeredGraphConstraintAt(feature, side));
    // At this stage bridge/tunnel profiles have already been reconciled with
    // their clearance and containment constraints. They own a mixed
    // structure/surface join; choosing the terrain road again merely restores
    // the stale pre-reconciliation height. Prefer an interior structural
    // through-route, then the highest completed deck (or deepest tunnel).
    // For an all-surface continuation, the existing engineered approach owns
    // the node and is carried into the next terrain-fitted road.
    const owner = structuralInterior.length > 0
      ? [...structuralInterior].sort((left, right) =>
          ownerScore(right.side, right.feature) - ownerScore(left.side, left.feature))[0]
      : elevated.length > 0
        ? [...elevated].sort((left, right) => right.surfaceY - left.surfaceY)[0]
      : subgrade.length > 0
        ? [...subgrade].sort((left, right) => left.surfaceY - right.surfaceY)[0]
      : engineeredAtGrade.length > 0 && terrainFittedAtGrade.length > 0
        // An engineered surface approach must return to the ordinary mapped
        // street at an endpoint. The terrain-fitted continuation owns that
        // node; choosing the highest approach here propagates a bridge deck
        // through unrelated streets.
        ? [...terrainFittedAtGrade].sort((left, right) =>
            ownerScore(right.side, right.feature) - ownerScore(left.side, left.feature))[0]
        : [...atGrade].sort((left, right) =>
            ownerScore(right.side, right.feature) - ownerScore(left.side, left.feature))[0];
    let targetSurfaceY = owner?.surfaceY;
    if (completedStructures.length === 0 && engineeredAtGrade.length > 0 && terrainFittedAtGrade.length > 0) {
      // Surface-only approach nodes are owned by measured terrain, not by the
      // highest previously compiled ribbon. Use the minimum common surface
      // that clears the accepted terrain at every incident mapped side.
      const terrainFloors = entries.map((entry) => {
        const point = entry.side?.point || entry.feature?.pts?.[0];
        const terrainY = Number(sampleTerrainY(finite(point?.x), finite(point?.z)));
        const surfaceBias = Number.isFinite(entry.feature?.surfaceBias)
          ? Number(entry.feature.surfaceBias)
          : 0.08;
        return Number.isFinite(terrainY) ? terrainY + surfaceBias : NaN;
      }).filter(Number.isFinite);
      if (terrainFloors.length > 0) targetSurfaceY = Math.max(...terrainFloors);
    }
    if (!Number.isFinite(targetSurfaceY)) continue;
    // The corridor pass has already solved bridge/tunnel grades. Finalization
    // may only bring exact surface roads to that completed node; repeatedly
    // rewriting structural profiles here creates positive feedback through a
    // connected interchange.
    const adjusted = entries.filter((entry) => {
      if (entry.feature?.structureSemantics?.terrainMode !== 'at_grade') return false;
      if (Math.abs(targetSurfaceY - entry.surfaceY) <= toleranceMeters) return false;
      const point = entry.side.point || entry.feature.pts?.[0];
      const terrainY = Number(sampleTerrainY(finite(point?.x), finite(point?.z)));
      const surfaceBias = Number.isFinite(entry.feature.surfaceBias)
        ? Number(entry.feature.surfaceBias)
        : 0.08;
      // A completed through surface may replace a stale higher approach, but
      // an at-grade ribbon is never lowered into accepted terrain.
      return Number.isFinite(terrainY) && targetSurfaceY >= terrainY + surfaceBias - 0.02;
    });
    if (adjusted.length === 0) continue;
    nodeCount += 1;
    for (const entry of adjusted) {
      const point = entry.side.point || entry.feature.pts?.[0];
      const terrainY = Number(sampleTerrainY(finite(point?.x), finite(point?.z)));
      if (!Number.isFinite(terrainY)) continue;
      const surfaceBias = Number.isFinite(entry.feature.surfaceBias)
        ? Number(entry.feature.surfaceBias)
        : 0.08;
      const gradeRun = Math.abs(targetSurfaceY - entry.surfaceY) / maximumGradeFor(entry.feature);
      if (!anchorsByFeature.has(entry.feature)) anchorsByFeature.set(entry.feature, []);
      anchorsByFeature.get(entry.feature).push(Object.freeze({
        distance: Math.max(0, finite(entry.side.distanceAlong)),
        targetOffset: targetSurfaceY - terrainY - surfaceBias,
        targetSurfaceY,
        span: Math.max(24, Math.min(featureLength(entry.feature), gradeRun + 24)),
        endpoint: ['start', 'end'].includes(String(entry.side?.endpoint || ''))
          ? entry.side.endpoint
          : null,
        graphEndpoint: ['start', 'end'].includes(String(entry.side?.endpoint || ''))
          ? entry.side.endpoint
          : null,
        source: 'transport_graph_node',
        engineeredApproach: true,
        continuityRepair: true,
        finalNodeReconciliation: true,
        ownerFeatureId: String(owner?.side?.featureId || '')
      }));
    }
  }
  return Object.freeze({ anchorsByFeature, nodeCount });
}

export function buildResidualAtGradeConnectionAnchors(
  features = [],
  transportNetworkModel = null,
  sampleSurfaceY = null,
  sampleTerrainY = null,
  options = {}
) {
  if (
    !transportNetworkModel?.connections?.length ||
    typeof sampleSurfaceY !== 'function' ||
    typeof sampleTerrainY !== 'function'
  ) return Object.freeze({ anchorsByFeature: new Map(), connectionCount: 0 });
  const toleranceMeters = Math.max(0.01, finite(options.toleranceMeters, 0.25));
  const featureById = new Map(features.map((feature) => [
    String(feature?.transportGraphRef?.featureId || ''),
    feature
  ]).filter(([id]) => id));
  const anchorsByFeature = new Map();
  let connectionCount = 0;
  const sampleSide = (feature, side) => Number(sampleSurfaceY(
    feature,
    finite(side?.point?.x),
    finite(side?.point?.z),
    { segIndex: finite(side?.segmentIndex), t: finite(side?.segmentT) }
  ));

  for (const connection of transportNetworkModel.connections) {
    const left = { side: connection?.left, feature: featureById.get(String(connection?.left?.featureId || '')) };
    const right = { side: connection?.right, feature: featureById.get(String(connection?.right?.featureId || '')) };
    if (![left.feature, right.feature].every((feature) =>
      feature?.transportRecord?.completeness === 'lossless' &&
      feature?.transportRecord?.routeState !== 'incomplete' &&
      feature?.structureSemantics?.terrainMode === 'at_grade'
    )) continue;
    if (![left.feature, right.feature].some((feature) =>
      feature?.transportSurfaceModel?.engineeredApproach === true
    )) continue;
    left.surfaceY = sampleSide(left.feature, left.side);
    right.surfaceY = sampleSide(right.feature, right.side);
    if (!Number.isFinite(left.surfaceY) || !Number.isFinite(right.surfaceY) ||
        Math.abs(left.surfaceY - right.surfaceY) <= toleranceMeters) continue;
    const leftEngineered = left.feature?.transportSurfaceModel?.engineeredApproach === true;
    const rightEngineered = right.feature?.transportSurfaceModel?.engineeredApproach === true;
    const terrainOwner = leftEngineered !== rightEngineered
      ? (leftEngineered ? right : left)
      : null;
    const terrainFloors = [left, right].map((entry) => {
      const point = entry.side?.point || entry.feature?.pts?.[0];
      const terrainY = Number(sampleTerrainY(finite(point?.x), finite(point?.z)));
      const surfaceBias = Number.isFinite(entry.feature?.surfaceBias)
        ? Number(entry.feature.surfaceBias)
        : 0.08;
      return Number.isFinite(terrainY) ? terrainY + surfaceBias : NaN;
    }).filter(Number.isFinite);
    const targetSurfaceY = terrainFloors.length > 0
      ? Math.max(...terrainFloors)
      : terrainOwner
        ? terrainOwner.surfaceY
        : Math.min(left.surfaceY, right.surfaceY);
    const adjusted = [left, right].filter((entry) =>
      Math.abs(entry.surfaceY - targetSurfaceY) > toleranceMeters);
    if (adjusted.length === 0) continue;
    for (const entry of adjusted) {
    const point = entry.side?.point || entry.feature?.pts?.[0];
    const terrainY = Number(sampleTerrainY(finite(point?.x), finite(point?.z)));
    if (!Number.isFinite(terrainY)) continue;
    const surfaceBias = Number.isFinite(entry.feature?.surfaceBias)
      ? Number(entry.feature.surfaceBias)
      : 0.08;
    if (targetSurfaceY < terrainY + surfaceBias - 0.02) continue;
    const gradeRun = Math.abs(targetSurfaceY - entry.surfaceY) / maximumGradeFor(entry.feature);
    const anchor = Object.freeze({
      distance: Math.max(0, finite(entry.side?.distanceAlong)),
      targetOffset: targetSurfaceY - terrainY - surfaceBias,
      targetSurfaceY,
      span: Math.max(24, Math.min(featureLength(entry.feature), gradeRun + 24)),
      endpoint: ['start', 'end'].includes(String(entry.side?.endpoint || '')) ? entry.side.endpoint : null,
      graphEndpoint: ['start', 'end'].includes(String(entry.side?.endpoint || '')) ? entry.side.endpoint : null,
      source: 'transport_graph_node',
      engineeredApproach: true,
      continuityRepair: true,
      residualAtGradeReconciliation: true,
      ownerFeatureId: String(terrainOwner?.side?.featureId || '')
    });
    if (!anchorsByFeature.has(entry.feature)) anchorsByFeature.set(entry.feature, []);
    anchorsByFeature.get(entry.feature).push(anchor);
    connectionCount += 1;
    }
  }
  return Object.freeze({ anchorsByFeature, connectionCount });
}

export function buildTransportJunctionProfileAnchors(
  features = [],
  transportNetworkModel = null,
  sampleTerrainY = null,
  sampleSurfaceY = null
) {
  if (
    !transportNetworkModel?.connections?.length ||
    typeof sampleTerrainY !== 'function' ||
    typeof sampleSurfaceY !== 'function'
  ) return Object.freeze({ anchorsByFeature: new Map(), nodeCount: 0, constrainedFeatureCount: 0 });

  const featureById = new Map();
  for (const feature of features) {
    const featureId = String(feature?.transportGraphRef?.featureId || '');
    if (featureId) featureById.set(featureId, feature);
  }
  const anchorsByFeature = new Map();
  let nodeCount = 0;
  for (const group of completePhysicalSideGroups(transportNetworkModel.connections, featureById)) {
    const connectedCandidates = group
      .map((side) => ({ side, feature: featureById.get(String(side.featureId || '')) }))
      .filter((entry) => entry.feature?.transportRecord?.routeState !== 'incomplete');
    // This pass publishes vertical structure junctions. Running it on a pure
    // at-grade graph node gives an ordinary road intersection a synthetic
    // bridge-style anchor, after which later passes mistake that generated
    // label for structural evidence and propagate it through the street graph.
    // At-grade continuations are handled only after a real grade-separated
    // member has established the corridor.
    if (!connectedCandidates.some(({ feature }) =>
      feature?.structureSemantics?.terrainMode !== 'at_grade'
    )) continue;
    const candidates = connectedCandidates;
    if (candidates.length < 2) continue;
    candidates.sort((left, right) =>
      ownerScore(right.side, right.feature) - ownerScore(left.side, left.feature)
    );
    let owner = candidates[0];
    if (candidates.every(({ feature }) =>
      feature?.structureSemantics?.terrainMode === 'subgrade')) {
      const sampledCandidates = candidates.map((entry) => {
        const point = entry.side.point || entry.feature.pts?.[0];
        return {
          ...entry,
          surfaceY: Number(sampleSurfaceY(
            entry.feature,
            finite(point?.x),
            finite(point?.z),
            { segIndex: finite(entry.side.segmentIndex), t: finite(entry.side.segmentT) }
          ))
        };
      }).filter((entry) => Number.isFinite(entry.surfaceY));
      if (sampledCandidates.length > 0) {
        owner = sampledCandidates.sort((left, right) => left.surfaceY - right.surfaceY)[0];
      }
    }
    const ownerPoint = owner.side.point || owner.feature.pts?.[0];
    let targetSurfaceY = Number(sampleSurfaceY(
      owner.feature,
      finite(ownerPoint?.x),
      finite(ownerPoint?.z),
      {
        segIndex: finite(owner.side.segmentIndex),
        t: finite(owner.side.segmentT)
      }
    ));
    if (!Number.isFinite(targetSurfaceY)) continue;

    nodeCount += 1;
    for (const { side, feature } of candidates) {
      const point = side.point || feature.pts?.[0];
      const terrainY = Number(sampleTerrainY(finite(point?.x), finite(point?.z)));
      if (!Number.isFinite(terrainY)) continue;
      const surfaceBias = Number.isFinite(feature.surfaceBias) ? Number(feature.surfaceBias) : 0.08;
      const isEndpoint = side.endpoint === 'start' || side.endpoint === 'end';
      const currentSurfaceY = Number(sampleSurfaceY(
        feature,
        finite(point?.x),
        finite(point?.z),
        {
          segIndex: finite(side.segmentIndex),
          t: finite(side.segmentT)
        }
      ));
      const atGrade = feature?.structureSemantics?.terrainMode === 'at_grade';
      const exactVerticalSource = feature?.transportRecord?.completeness === 'lossless';
      const needsIntegratedApproach = atGrade &&
        exactVerticalSource &&
        isEndpoint &&
        Number.isFinite(currentSurfaceY) &&
        targetSurfaceY > currentSurfaceY + 0.2;
      if (atGrade && !needsIntegratedApproach) continue;
      const gradeRun = Number.isFinite(currentSurfaceY)
        ? Math.abs(currentSurfaceY - targetSurfaceY) / maximumGradeFor(feature)
        : 0;
      if (!anchorsByFeature.has(feature)) anchorsByFeature.set(feature, []);
      anchorsByFeature.get(feature).push(Object.freeze({
        distance: Math.max(0, finite(side.distanceAlong)),
        targetOffset: targetSurfaceY - terrainY - surfaceBias,
        targetSurfaceY,
        // Graph-node elevation is an exact physical tie-in. Interior stations
        // use a longer blend; endpoint constraints need only enough run to
        // respect the road's grade bound and must not be weakened by the
        // generic endpoint transition gate.
        span: isEndpoint
          ? Math.max(24, Math.min(featureLength(feature), gradeRun + 24))
          : Math.max(18, Math.min(72, featureLength(feature) * 0.28)),
        endpoint: isEndpoint ? side.endpoint : null,
        graphEndpoint: isEndpoint ? side.endpoint : null,
        source: 'transport_graph_node',
        engineeredApproach: needsIntegratedApproach,
        ownerFeatureId: String(owner.side.featureId || '')
      }));
    }
  }

  return Object.freeze({
    anchorsByFeature,
    nodeCount,
    constrainedFeatureCount: anchorsByFeature.size
  });
}
