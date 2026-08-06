const WAY_COLLECTION_KEYS = Object.freeze([
  'roadWays',
  'buildingWays',
  'landuseWays',
  'waterwayWays',
  'railwayWays',
  'footwayWays',
  'cyclewayWays',
  'structureConnectorWays',
  'treeRowWays'
]);

const NODE_COLLECTION_KEYS = Object.freeze([
  'treeNodes',
  'poiNodes'
]);

function nodeHasAcceptedGround(node, sampleGroundAtLatLon) {
  const latitude = Number(node?.lat);
  const longitude = Number(node?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  return sampleGroundAtLatLon(latitude, longitude)?.status === 'available';
}

export function filterSelectionToAcceptedGround(
  selection = {},
  nodes = {},
  sampleGroundAtLatLon
) {
  if (typeof sampleGroundAtLatLon !== 'function') {
    throw new TypeError('sampleGroundAtLatLon must be a function');
  }

  const acceptedNodeIds = new Set();
  const rejectedNodeIds = new Set();
  const acceptsNode = (nodeId) => {
    const key = String(nodeId);
    if (acceptedNodeIds.has(key)) return true;
    if (rejectedNodeIds.has(key)) return false;
    const accepted = nodeHasAcceptedGround(
      nodes[nodeId] ?? nodes[key],
      sampleGroundAtLatLon
    );
    (accepted ? acceptedNodeIds : rejectedNodeIds).add(key);
    return accepted;
  };
  const acceptsWay = (way) => (
    Array.isArray(way?.nodes) &&
    way.nodes.length > 0 &&
    way.nodes.every(acceptsNode)
  );

  const filtered = { ...selection };
  let rejectedWays = 0;
  let rejectedPointFeatures = 0;

  for (const key of WAY_COLLECTION_KEYS) {
    if (!Array.isArray(selection[key])) continue;
    filtered[key] = selection[key].filter((way) => {
      const accepted = acceptsWay(way);
      if (!accepted) rejectedWays += 1;
      return accepted;
    });
  }
  for (const key of NODE_COLLECTION_KEYS) {
    if (!Array.isArray(selection[key])) continue;
    filtered[key] = selection[key].filter((node) => {
      const accepted = nodeHasAcceptedGround(node, sampleGroundAtLatLon);
      if (!accepted) rejectedPointFeatures += 1;
      return accepted;
    });
  }

  return Object.freeze({
    selection: Object.freeze(filtered),
    diagnostics: Object.freeze({
      acceptedNodeCount: acceptedNodeIds.size,
      rejectedNodeCount: rejectedNodeIds.size,
      rejectedWayCount: rejectedWays,
      rejectedPointFeatureCount: rejectedPointFeatures
    })
  });
}
