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

function connectedSideGroups(connections = []) {
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
  if (!transportNetworkModel?.connections?.length || typeof sampleSurfaceY !== 'function') {
    return Object.freeze({
      authority: 'compiled_transport_graph_node_continuity',
      toleranceMeters,
      authoritativeConnectionCount: 0,
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
  let sampledConnectionCount = 0;
  let maximumVerticalDeltaMeters = 0;
  const discontinuities = [];
  for (const connection of transportNetworkModel.connections) {
    const leftFeature = featureById.get(String(connection?.left?.featureId || ''));
    const rightFeature = featureById.get(String(connection?.right?.featureId || ''));
    if (!leftFeature || !rightFeature) continue;
    const exactComplete = [leftFeature, rightFeature].every((feature) =>
      feature?.transportRecord?.completeness === 'lossless' &&
      feature?.transportRecord?.routeState !== 'incomplete'
    );
    const structureConnection = [leftFeature, rightFeature].some((feature) =>
      feature?.structureSemantics?.terrainMode !== 'at_grade' ||
      feature?.transportSurfaceModel?.engineeredApproach === true
    );
    if (!exactComplete || !structureConnection) continue;
    authoritativeConnectionCount += 1;
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
    toleranceMeters,
    authoritativeConnectionCount,
    sampledConnectionCount,
    maximumVerticalDeltaMeters,
    discontinuityCount: discontinuities.length,
    // This is a bounded release diagnostic (exact structure-related graph
    // joins only). Preserve the complete failing set so provider-dependent
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
  const groups = connectedSideGroups(transportNetworkModel.connections).map((sides, index) => ({
    id: index,
    sides: sides.map((side) => ({
      side,
      feature: featureById.get(String(side.featureId || ''))
    })).filter(({ feature }) =>
      feature?.transportRecord?.completeness === 'lossless' &&
      feature?.transportRecord?.routeState !== 'incomplete')
  }));
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
    const engineeredAtGrade = atGrade.filter(({ feature }) =>
      feature?.transportSurfaceModel?.engineeredApproach === true);
    const terrainFittedAtGrade = atGrade.filter(({ feature }) =>
      feature?.transportSurfaceModel?.engineeredApproach !== true);
    const interior = sampled.filter(({ side }) => side?.endpoint === 'interior');
    let target = NaN;
    let owner = null;
    if (atGrade.length > 0 && (elevated.length > 0 || subgrade.length > 0)) {
      // Exact mapped surface roads own the physical portal/abutment elevation.
      // Use the highest incident terrain-fitted surface so a connected road is
      // never cut into the rendered ground.
      owner = [...atGrade].sort((left, right) => right.surfaceY - left.surfaceY)[0];
      target = owner.surfaceY;
    } else if (interior.length > 0) {
      owner = [...interior].sort((left, right) =>
        ownerScore(right.side, right.feature) - ownerScore(left.side, left.feature))[0];
      target = owner.surfaceY;
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

  // A short bridge/tunnel fragment can have two terrain-owned endpoints whose
  // DEM elevations exceed its feasible grade cone. Raise only the lower node
  // enough to make that exact structure fragment feasible. Propagation is
  // restricted to the mapped structure itself; ordinary roads are handled
  // later only when they physically share the adjusted node.
  for (let pass = 0; pass < 48; pass += 1) {
    let changed = false;
    for (const [feature, memberships] of membershipsByFeature) {
      const terrainMode = feature?.structureSemantics?.terrainMode || 'at_grade';
      // Once an exact at-grade road has been promoted to an engineered
      // approach, its two graph nodes are part of the same vertical-alignment
      // problem as the bridge/tunnel they connect to. Skipping it here left
      // mutually infeasible endpoint targets in place; the per-feature
      // compiler then made both nodes exact by publishing a near-vertical
      // ramp between them. Ordinary terrain-fitted roads remain excluded so
      // bridge elevations cannot propagate through the city street graph.
      if (
        terrainMode === 'at_grade' &&
        feature?.transportSurfaceModel?.engineeredApproach !== true
      ) continue;
      const grade = maximumGradeFor(feature);
      const constrained = memberships
        .map((membership) => ({ membership, target: targetByGroup.get(membership.group.id) }))
        .filter((entry) => Number.isFinite(entry.target));

      // Crossing/clearance stations are part of the same vertical alignment
      // problem as graph nodes. If they are considered only by the later
      // per-feature profile compiler, that compiler has to reject an otherwise
      // shared endpoint and the rendered decks separate again. Project each
      // mapped hard station's grade cone onto every incident graph node before
      // anchors are published so the graph and profile solvers receive one
      // feasible set of constraints.
      const stations = Array.isArray(feature?.structureStations)
        ? feature.structureStations
        : [];
      if (feature?.structureSemantics?.terrainMode === 'elevated') {
        for (const entry of constrained) {
          let requiredTarget = entry.target;
          for (const station of stations) {
            const stationDistance = Math.max(0, Math.min(
              featureLength(feature),
              finite(station?.distance)
            ));
            const stationSurfaceY = compiledSurfaceAtDistance(feature, stationDistance);
            if (!Number.isFinite(stationSurfaceY)) continue;
            const run = Math.abs(
              stationDistance - finite(entry.membership.side?.distanceAlong)
            );
            requiredTarget = Math.max(requiredTarget, stationSurfaceY - grade * run);
          }
          if (requiredTarget <= entry.target + 1e-6) continue;
          targetByGroup.set(entry.membership.group.id, requiredTarget);
          entry.target = requiredTarget;
          changed = true;
        }
      }
      for (let leftIndex = 0; leftIndex < constrained.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < constrained.length; rightIndex += 1) {
          const left = constrained[leftIndex];
          const right = constrained[rightIndex];
          const run = Math.abs(
            finite(right.membership.side?.distanceAlong) -
            finite(left.membership.side?.distanceAlong)
          );
          const maximumDelta = grade * run;
          if (Math.abs(right.target - left.target) <= maximumDelta + 1e-6) continue;
          const lower = left.target < right.target ? left : right;
          const higher = lower === left ? right : left;
          const feasibleLower = higher.target - maximumDelta;
          if (feasibleLower <= lower.target + 1e-6) continue;
          targetByGroup.set(lower.membership.group.id, feasibleLower);
          ownerByGroup.set(
            lower.membership.group.id,
            ownerByGroup.get(higher.membership.group.id) || higher.membership
          );
          lower.target = feasibleLower;
          changed = true;
        }
      }
    }
    if (!changed) break;
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
      const reconcilingAtGrade = terrainMode === 'at_grade' &&
        Math.abs(targetSurfaceY - currentSurfaceY) > toleranceMeters &&
        targetSurfaceY >= terrainY + surfaceBias - 0.02;
      const reconcilingStructure = terrainMode !== 'at_grade' &&
        Math.abs(targetSurfaceY - currentSurfaceY) > toleranceMeters;
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
    const structural = entries.filter(({ feature }) =>
      feature?.structureSemantics?.terrainMode !== 'at_grade' ||
      feature?.transportSurfaceModel?.engineeredApproach === true
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
    const engineeredAtGrade = atGrade.filter(({ feature }) =>
      feature?.transportSurfaceModel?.engineeredApproach === true);
    const terrainFittedAtGrade = atGrade.filter(({ feature }) =>
      feature?.transportSurfaceModel?.engineeredApproach !== true);
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
  for (const group of connectedSideGroups(transportNetworkModel.connections)) {
    const connectedCandidates = group
      .map((side) => ({ side, feature: featureById.get(String(side.featureId || '')) }))
      .filter((entry) => entry.feature?.transportRecord?.routeState !== 'incomplete');
    const bridgeCandidates = connectedCandidates.filter(({ feature }) =>
      feature?.structureSemantics?.terrainMode === 'elevated' &&
      feature?.structureSemantics?.isBridge === true &&
      feature?.structureSemantics?.rampCandidate !== true &&
      !/_link$/i.test(String(feature?.type || ''))
    );
    // Exact OSM and generalized regional vectors can be conflated at their
    // endpoints for route continuity, but they are not interchangeable
    // vertical-survey records. Carrying an exact bridge elevation into a
    // generalized road can lift a duplicate regional route tens of metres
    // above its DEM terrain. Compile each junction profile inside the most
    // authoritative bridge's own source-resolution family instead.
    const controllingBridge = [...bridgeCandidates].sort((left, right) =>
      (right.feature?.transportRecord?.completeness === 'lossless' ? 1 : 0) -
      (left.feature?.transportRecord?.completeness === 'lossless' ? 1 : 0)
    )[0] || null;
    const controllingCompleteness = String(
      controllingBridge?.feature?.transportRecord?.completeness || 'lossless'
    );
    const candidates = connectedCandidates.filter(({ feature }) =>
      String(feature?.transportRecord?.completeness || 'generalized') === controllingCompleteness
    );
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
