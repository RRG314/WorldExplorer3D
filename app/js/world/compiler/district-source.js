// Pure provider-normalization contract. This module intentionally has no
// shared-context, renderer, DOM, network, cache, or mutable runtime imports.

const DISTRICT_SOURCE_SCHEMA_VERSION = 1;
const FEATURE_COLLECTION_KEYS = Object.freeze([
  'roads',
  'buildings',
  'landuse',
  'waterways',
  'railways',
  'footways',
  'cycleways',
  'structureConnectors',
  'trees',
  'treeRows',
  'pois'
]);

function assertFinite(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
}

function compareSourceIds(a, b) {
  return String(a.sourceId).localeCompare(String(b.sourceId), 'en');
}

function immutableTags(tags = {}) {
  const normalized = {};
  for (const key of Object.keys(tags).sort()) {
    const value = tags[key];
    if (value == null) continue;
    normalized[String(key)] = String(value);
  }
  return Object.freeze(normalized);
}

function providerSourceId(provider, type, id) {
  const namespace = String(provider?.namespace || provider?.name || 'unknown')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-');
  return `${namespace}:${type}:${String(id)}`;
}

function normalizeNode(node, provider) {
  if (!node || node.id == null) throw new TypeError('Every node requires an id');
  const latitude = Number(node.lat);
  const longitude = Number(node.lon);
  assertFinite(latitude, `node ${String(node.id)} latitude`);
  assertFinite(longitude, `node ${String(node.id)} longitude`);
  if (latitude < -90 || latitude > 90) {
    throw new RangeError(`node ${String(node.id)} latitude is outside WGS84`);
  }
  if (longitude < -180 || longitude > 180) {
    throw new RangeError(`node ${String(node.id)} longitude is outside WGS84`);
  }

  return Object.freeze({
    type: 'node',
    id: String(node.id),
    sourceId: providerSourceId(provider, 'node', node.id),
    lat: latitude,
    lon: longitude,
    tags: immutableTags(node.tags)
  });
}

function normalizeWay(way, provider, normalizedNodes) {
  if (!way || way.id == null) throw new TypeError('Every way requires an id');
  if (!Array.isArray(way.nodes)) {
    throw new TypeError(`way ${String(way.id)} requires a node list`);
  }
  const nodeIds = way.nodes.map((nodeId) => String(nodeId));
  const missingNodeIds = nodeIds.filter((nodeId) => !normalizedNodes[nodeId]);
  if (missingNodeIds.length > 0) {
    throw new Error(
      `way ${String(way.id)} references missing nodes: ${missingNodeIds.join(', ')}`
    );
  }

  return Object.freeze({
    type: 'way',
    id: String(way.id),
    sourceId: providerSourceId(provider, 'way', way.id),
    nodes: Object.freeze(nodeIds),
    tags: immutableTags(way.tags)
  });
}

function freezeCompleteness(completeness = {}) {
  const selected = {};
  const requested = {};
  for (const key of FEATURE_COLLECTION_KEYS) {
    if (Number.isFinite(Number(completeness.selected?.[key]))) {
      selected[key] = Number(completeness.selected[key]);
    }
    if (Number.isFinite(Number(completeness.requested?.[key]))) {
      requested[key] = Number(completeness.requested[key]);
    }
  }
  return Object.freeze({
    status: completeness.status === 'complete' ? 'complete' : 'budgeted',
    selected: Object.freeze(selected),
    requested: Object.freeze(requested),
    providerResponse: String(completeness.providerResponse || 'available')
  });
}

export function createDistrictSource(options = {}) {
  const provider = Object.freeze({
    name: String(options.provider?.name || 'unknown'),
    namespace: String(
      options.provider?.namespace || options.provider?.name || 'unknown'
    ),
    endpoint: options.provider?.endpoint
      ? String(options.provider.endpoint)
      : null,
    retrieval: String(options.provider?.retrieval || 'unknown'),
    license: options.provider?.license
      ? String(options.provider.license)
      : null
  });
  const origin = {
    latitude: Number(options.origin?.latitude),
    longitude: Number(options.origin?.longitude),
    heightMeters: Number(options.origin?.heightMeters || 0)
  };
  assertFinite(origin.latitude, 'origin latitude');
  assertFinite(origin.longitude, 'origin longitude');
  assertFinite(origin.heightMeters, 'origin height');

  const inputNodes = options.nodes || {};
  const normalizedNodes = {};
  for (const rawId of Object.keys(inputNodes).sort((a, b) =>
    String(a).localeCompare(String(b), 'en')
  )) {
    const node = normalizeNode(inputNodes[rawId], provider);
    normalizedNodes[node.id] = node;
  }

  const waysBySourceId = new Map();
  const nodesBySourceId = new Map(
    Object.values(normalizedNodes).map((node) => [node.sourceId, node])
  );
  const featureCollections = {};
  const inputCollections = options.featureCollections || {};

  for (const key of FEATURE_COLLECTION_KEYS) {
    const records = Array.isArray(inputCollections[key])
      ? inputCollections[key]
      : [];
    const normalized = records.map((record) => {
      if (record?.type === 'node') {
        const node = normalizedNodes[String(record.id)] ||
          normalizeNode(record, provider);
        nodesBySourceId.set(node.sourceId, node);
        return node;
      }
      const sourceId = providerSourceId(provider, 'way', record?.id);
      if (!waysBySourceId.has(sourceId)) {
        waysBySourceId.set(
          sourceId,
          normalizeWay(record, provider, normalizedNodes)
        );
      }
      return waysBySourceId.get(sourceId);
    });
    featureCollections[key] = Object.freeze(
      [...new Map(normalized.map((record) => [record.sourceId, record])).values()]
        .sort(compareSourceIds)
    );
  }

  const sourceIds = [
    ...nodesBySourceId.keys(),
    ...waysBySourceId.keys()
  ].sort();
  const districtId = String(options.districtId ||
    `${origin.latitude.toFixed(7)},${origin.longitude.toFixed(7)}`);

  return Object.freeze({
    type: 'DistrictSource',
    schemaVersion: DISTRICT_SOURCE_SCHEMA_VERSION,
    districtId,
    origin: Object.freeze(origin),
    coordinateFrame: Object.freeze({
      horizontalDatum: 'WGS84',
      localAxes: 'east-up-south',
      horizontalUnit: 'metre',
      verticalUnit: 'metre'
    }),
    provider,
    completeness: freezeCompleteness(options.completeness),
    nodes: Object.freeze(normalizedNodes),
    features: Object.freeze(featureCollections),
    reconciliation: Object.freeze({
      nodeCount: nodesBySourceId.size,
      wayCount: waysBySourceId.size,
      sourceIds: Object.freeze(sourceIds)
    })
  });
}

export function districtSourceLegacySelection(districtSource) {
  if (districtSource?.type !== 'DistrictSource') {
    throw new TypeError('districtSource must be a DistrictSource');
  }
  return Object.freeze({
    nodes: districtSource.nodes,
    roadWays: districtSource.features.roads,
    buildingWays: districtSource.features.buildings,
    landuseWays: districtSource.features.landuse,
    waterwayWays: districtSource.features.waterways,
    railwayWays: districtSource.features.railways,
    footwayWays: districtSource.features.footways,
    cyclewayWays: districtSource.features.cycleways,
    structureConnectorWays: districtSource.features.structureConnectors,
    treeNodes: districtSource.features.trees,
    treeRowWays: districtSource.features.treeRows,
    poiNodes: districtSource.features.pois
  });
}
