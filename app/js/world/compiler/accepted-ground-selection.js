import { pruneSupersededGeneralizedStructures } from '../fixed-regional-structures.js?v=6';

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
  sampleGroundAtLatLon,
  options = {}
) {
  if (typeof sampleGroundAtLatLon !== 'function') {
    throw new TypeError('sampleGroundAtLatLon must be a function');
  }

  const acceptedNodeIds = new Set();
  const rejectedNodeIds = new Set();
  const regionalNodeIds = new Set();
  const rejectedRegionalNodeIds = new Set();
  const sampleRegionalGroundAtLatLon = typeof options.sampleRegionalGroundAtLatLon === 'function'
    ? options.sampleRegionalGroundAtLatLon
    : null;
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
  const acceptsRegionalNode = (nodeId) => {
    const key = String(nodeId);
    if (regionalNodeIds.has(key)) return true;
    if (rejectedRegionalNodeIds.has(key)) return false;
    const node = nodes[nodeId] ?? nodes[key];
    const latitude = Number(node?.lat);
    const longitude = Number(node?.lon);
    const accepted = Number.isFinite(latitude) && Number.isFinite(longitude) &&
      sampleRegionalGroundAtLatLon?.(latitude, longitude)?.status === 'available';
    (accepted ? regionalNodeIds : rejectedRegionalNodeIds).add(key);
    return accepted;
  };
  const acceptsWay = (way) => {
    if (!Array.isArray(way?.nodes) || way.nodes.length === 0) return false;
    if (way.tags?._regionalContext === 'fixed-location' && sampleRegionalGroundAtLatLon) {
      return way.nodes.every(acceptsRegionalNode);
    }
    return way.nodes.every(acceptsNode);
  };

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
  const structureAuthority = pruneSupersededGeneralizedStructures(
    filtered.roadWays,
    nodes
  );
  filtered.roadWays = structureAuthority.ways;
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
      regionalAcceptedNodeCount: regionalNodeIds.size,
      regionalRejectedNodeCount: rejectedRegionalNodeIds.size,
      rejectedWayCount: rejectedWays,
      rejectedPointFeatureCount: rejectedPointFeatures,
      exactStructureAuthorities: structureAuthority.exactStructures,
      supersededGeneralizedStructures:
        structureAuthority.supersededGeneralizedStructures,
      retainedGeneralizedStructureFallbacks: filtered.roadWays.filter((way) =>
        way?.tags?._fallbackStructureAuthority === 'generalized'
      ).length
    })
  });
}
