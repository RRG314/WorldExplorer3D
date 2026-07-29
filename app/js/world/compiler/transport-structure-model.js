const STRUCTURE_MODEL_SCHEMA_VERSION = 1;

function stableHash(value = '') {
  let hash = 0x811c9dc5;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function featureIdentity(feature, index = 0) {
  return String(
    feature?.transportRecord?.identity ||
    feature?.sourceFeatureId ||
    feature?.id ||
    `structure:${index}`
  );
}

function structureKind(feature) {
  const semantics = feature?.structureSemantics || {};
  if (semantics.culvert) return 'culvert';
  if (semantics.isTunnel) return 'tunnel';
  if (semantics.buildingPassage) return 'building_passage';
  if (semantics.covered && semantics.indoor) return 'indoor_covered';
  if (semantics.covered) return 'covered';
  if (semantics.skywalk) return 'skywalk';
  if (semantics.isBridge) return 'bridge';
  if (semantics.terrainMode === 'elevated' && semantics.rampCandidate) return 'ramp';
  if (semantics.terrainMode === 'elevated') return 'overpass';
  if (semantics.cutting) return 'cutting';
  if (semantics.embankment) return 'embankment';
  return null;
}

function structureFamily(kind) {
  if (kind === 'tunnel') return 'tunnel';
  if (kind === 'bridge' || kind === 'ramp' || kind === 'overpass') return 'elevated_road';
  if (kind === 'skywalk') return 'elevated_walkway';
  if (kind === 'covered' || kind === 'indoor_covered' || kind === 'building_passage') return 'covered';
  return kind;
}

function compatibleChain(left, right) {
  if (!left || !right) return false;
  if (structureFamily(left.kind) !== structureFamily(right.kind)) return false;
  const leftSemantics = left.feature.structureSemantics || {};
  const rightSemantics = right.feature.structureSemantics || {};
  return (
    Number(leftSemantics.verticalOrder || 0) === Number(rightSemantics.verticalOrder || 0) &&
    String(leftSemantics.terrainMode || '') === String(rightSemantics.terrainMode || '')
  );
}

function endpointLinks(feature, endpoint) {
  return Array.isArray(feature?.connectedFeatures?.[endpoint])
    ? feature.connectedFeatures[endpoint]
    : [];
}

function compileEndpoint(entry, endpoint, entryByFeature) {
  const links = endpointLinks(entry.feature, endpoint);
  const linkedEntries = links
    .map((link) => entryByFeature.get(link?.feature))
    .filter(Boolean);
  const continuation = linkedEntries.find((linked) => compatibleChain(entry, linked)) || null;
  const surfaceTransition = links.some((link) =>
    link?.feature && !compatibleChain(entry, entryByFeature.get(link.feature))
  );
  const routeState = String(entry.feature?.transportRecord?.routeState || 'complete');
  const driveable = entry.feature?.driveable !== false &&
    entry.feature?.transportRecord?.safeForDriving !== false;
  let state = 'open_boundary';
  let policy = driveable ? 'transition_to_ground' : 'non_drivable';
  if (continuation) {
    state = 'structure_continuation';
    policy = 'continue_compiled_chain';
  } else if (surfaceTransition) {
    state = 'surface_transition';
    policy = 'match_connected_surface';
  } else if (routeState !== 'complete') {
    state = 'incomplete_source';
    policy = 'non_drivable';
  }
  return Object.freeze({
    endpoint,
    state,
    policy,
    continuationFeatureId: continuation?.featureId || null,
    connectionCount: links.length
  });
}

function structureSpecification(entry) {
  const feature = entry.feature;
  const semantics = feature.structureSemantics || {};
  const width = Math.max(2, Number(feature.width) || 4);
  const vehicle = String(semantics.featureCategory || feature.networkKind || 'road') === 'road';
  const deckThickness = vehicle
    ? Math.max(0.45, Math.min(1.6, width * 0.1))
    : Math.max(0.32, Math.min(0.8, width * 0.12));
  const minimumClearance = vehicle ? 5.5 : 4.2;
  const tunnelClearance = Math.max(
    vehicle ? 4.2 : 3.0,
    Math.min(vehicle ? 5.2 : 4.2, Number(semantics.cutDepth || 4.6) - 0.25)
  );
  return Object.freeze({
    width,
    deckThickness,
    fasciaDepth: Math.max(0.18, deckThickness * 0.62),
    barrierOffset: width * 0.5 + 0.3,
    barrierHeight: vehicle ? 1.25 : 1.1,
    supportSpacing: Math.max(vehicle ? 26 : 16, width * (vehicle ? 3.8 : 3.6)),
    minimumClearance,
    tunnelClearance,
    tunnelWallOffset: width * 0.5 + 0.72,
    roofThickness: 0.32
  });
}

function assignChains(entries) {
  const parent = new Map(entries.map((entry) => [entry, entry]));
  const find = (entry) => {
    let root = parent.get(entry);
    while (root !== parent.get(root)) root = parent.get(root);
    let cursor = entry;
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
    if (leftRoot === rightRoot) return;
    const leftWins = leftRoot.featureId.localeCompare(rightRoot.featureId) <= 0;
    parent.set(leftWins ? rightRoot : leftRoot, leftWins ? leftRoot : rightRoot);
  };
  const entryByFeature = new Map(entries.map((entry) => [entry.feature, entry]));
  for (const entry of entries) {
    for (const endpoint of ['start', 'end']) {
      for (const link of endpointLinks(entry.feature, endpoint)) {
        const linked = entryByFeature.get(link?.feature);
        if (linked && compatibleChain(entry, linked)) union(entry, linked);
      }
    }
  }
  const components = new Map();
  for (const entry of entries) {
    const root = find(entry);
    if (!components.has(root)) components.set(root, []);
    components.get(root).push(entry);
  }
  for (const component of components.values()) {
    component.sort((left, right) => left.featureId.localeCompare(right.featureId));
    const chainId = `transport-structure-chain:${stableHash(
      component.map((entry) => entry.featureId).join('|')
    )}`;
    for (const entry of component) entry.chainId = chainId;
  }
}

export function compileTransportStructureModel(features = [], options = {}) {
  const entries = [];
  const featureIdCounts = new Map();
  for (let index = 0; index < features.length; index += 1) {
    const feature = features[index];
    if (!Array.isArray(feature?.pts) || feature.pts.length < 2) continue;
    const kind = structureKind(feature);
    if (!kind) continue;
    const sourceIdentity = featureIdentity(feature, index);
    const fragmentIndex = featureIdCounts.get(sourceIdentity) || 0;
    featureIdCounts.set(sourceIdentity, fragmentIndex + 1);
    entries.push({
      feature,
      featureId: fragmentIndex === 0
        ? sourceIdentity
        : `${sourceIdentity}#structure-fragment:${fragmentIndex}`,
      sourceIdentity,
      kind,
      family: structureFamily(kind),
      chainId: ''
    });
  }
  entries.sort((left, right) => left.featureId.localeCompare(right.featureId));
  assignChains(entries);
  const entryByFeature = new Map(entries.map((entry) => [entry.feature, entry]));
  const compiledFeatures = entries.map((entry) => {
    const compiled = Object.freeze({
      featureId: entry.featureId,
      sourceIdentity: entry.sourceIdentity,
      kind: entry.kind,
      family: entry.family,
      chainId: entry.chainId,
      routeState: String(entry.feature?.transportRecord?.routeState || 'complete'),
      driveable: entry.feature?.driveable !== false &&
        entry.feature?.transportRecord?.safeForDriving !== false,
      start: compileEndpoint(entry, 'start', entryByFeature),
      end: compileEndpoint(entry, 'end', entryByFeature),
      specification: structureSpecification(entry)
    });
    entry.feature.transportStructureRef = compiled;
    return compiled;
  });
  const identityText = compiledFeatures
    .map((entry) => `${entry.featureId}:${entry.kind}:${entry.chainId}:${entry.routeState}`)
    .join('|');
  const chains = new Set(compiledFeatures.map((entry) => entry.chainId));
  const model = {
    schemaVersion: STRUCTURE_MODEL_SCHEMA_VERSION,
    id: `transport-structure-model:${stableHash(identityText)}`,
    authority: 'compiled_transport_structures',
    transportGraphId: String(options.transportGraphId || ''),
    features: Object.freeze(compiledFeatures),
    stats: Object.freeze({
      featureCount: compiledFeatures.length,
      chainCount: chains.size,
      incompleteCount: compiledFeatures.filter((entry) => entry.routeState !== 'complete').length,
      nonDrivableCount: compiledFeatures.filter((entry) => !entry.driveable).length
    })
  };
  return Object.freeze(model);
}

export {
  STRUCTURE_MODEL_SCHEMA_VERSION
};
