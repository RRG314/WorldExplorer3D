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
    (interior ? 100_000 : 0) +
    (!link ? 10_000 : 0) +
    finite(feature?.width) * 100 +
    Math.min(9_999, featureLength(feature))
  );
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
    const candidates = group
      .map((side) => ({ side, feature: featureById.get(String(side.featureId || '')) }))
      .filter((entry) => entry.feature?.transportRecord?.completeness === 'lossless');
    if (candidates.length < 2) continue;
    candidates.sort((left, right) =>
      ownerScore(right.side, right.feature) - ownerScore(left.side, left.feature)
    );
    const owner = candidates[0];
    const ownerPoint = owner.side.point || owner.feature.pts?.[0];
    const targetSurfaceY = Number(sampleSurfaceY(
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
      if (feature?.structureSemantics?.terrainMode === 'at_grade') continue;
      const point = side.point || feature.pts?.[0];
      const terrainY = Number(sampleTerrainY(finite(point?.x), finite(point?.z)));
      if (!Number.isFinite(terrainY)) continue;
      const surfaceBias = Number.isFinite(feature.surfaceBias) ? Number(feature.surfaceBias) : 0.08;
      const isEndpoint = side.endpoint === 'start' || side.endpoint === 'end';
      if (!anchorsByFeature.has(feature)) anchorsByFeature.set(feature, []);
      anchorsByFeature.get(feature).push(Object.freeze({
        distance: Math.max(0, finite(side.distanceAlong)),
        targetOffset: targetSurfaceY - terrainY - surfaceBias,
        targetSurfaceY,
        // Graph-node elevation is an exact physical tie-in. Interior stations
        // use a longer blend; endpoint constraints need only enough run to
        // respect the road's grade bound and must not be weakened by the
        // generic endpoint transition gate.
        span: isEndpoint ? 2 : Math.max(18, Math.min(72, featureLength(feature) * 0.28)),
        endpoint: null,
        graphEndpoint: isEndpoint ? side.endpoint : null,
        source: 'transport_graph_node',
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
