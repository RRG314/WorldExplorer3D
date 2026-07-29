import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { ctx as appCtx } from '../app/js/shared-context.js?v=55';
import {
  normalizeTransportSource,
  TRANSPORT_RAW_TAG_KEYS
} from '../app/js/world/compiler/transport-source-normalizer.js';
import {
  compileTransportNetworkModel
} from '../app/js/world/compiler/transport-network-model.js';
import {
  buildTraversalNetworks,
  findTraversalRoute,
  initWorldTraversal,
  invalidateTraversalNetworks
} from '../app/js/world/traversal.js';
import {
  compileTransportSurfaceModel,
  sampleTransportSurfaceAtDistance
} from '../app/js/world/compiler/transport-surface-model.js';
import {
  findNearestRoad,
  initWorldNavigation
} from '../app/js/world/navigation.js';

const root = path.resolve(import.meta.dirname, '..');
const atGrade = Object.freeze({
  terrainMode: 'at_grade',
  verticalOrder: 0,
  verticalGroup: 'at_grade:0:at_grade'
});
const elevated = Object.freeze({
  terrainMode: 'elevated',
  verticalOrder: 1,
  verticalGroup: 'elevated:1:bridge'
});

function feature(id, points, options = {}) {
  const tags = {
    highway: options.highway || 'primary',
    ...(options.tags || {})
  };
  return {
    sourceFeatureId: id,
    pts: points,
    width: 7,
    networkKind: 'road',
    driveable: true,
    walkable: true,
    structureSemantics: options.semantics || atGrade,
    transportRecord: normalizeTransportSource({
      sourceId: id,
      id,
      completeness: options.completeness || 'lossless'
    }, tags),
    sourceNodeIds: options.sourceNodeIds || [],
    sourceTopologyNodes: options.sourceTopologyNodes || []
  };
}

const fullTags = {
  highway: 'primary',
  bridge: 'movable',
  tunnel: 'building_passage',
  covered: 'yes',
  layer: '-2',
  level: 'B1',
  location: 'underground',
  cutting: 'yes',
  embankment: 'yes',
  incline: '-4%',
  lanes: '3',
  placement: 'transition',
  width: '24 ft',
  surface: 'asphalt',
  access: 'destination',
  maxheight: `12' 6"`,
  destination: 'Downtown',
  junction: 'roundabout',
  oneway: '-1'
};
const normalized = normalizeTransportSource({
  sourceId: 'osm:way:123',
  id: 123,
  geometryProvenance: 'osm-overpass'
}, fullTags);
for (const key of TRANSPORT_RAW_TAG_KEYS) {
  if (key in fullTags) assert.equal(normalized.rawTags[key], fullTags[key]);
}
assert.equal(normalized.identity, 'osm:way:123');
assert.equal(normalized.direction, 'reverse');
assert.equal(normalized.crossSection.lanes, 3);
assert.equal(normalized.crossSection.lanesSource, 'source:lanes');
assert.equal(normalized.crossSection.widthSource, 'source:width');
assert.ok(Math.abs(normalized.crossSection.widthMeters - 7.3152) < 0.001);
assert.equal(normalized.access.motorVehicle, 'restricted');
assert.ok(Math.abs(normalized.maxHeightMeters - 3.81) < 0.001);
assert.ok(Object.isFrozen(normalized.rawTags));
assert.deepEqual(
  Object.fromEntries(Object.keys(fullTags).map((key) => [key, normalized.sourceTags[key]])),
  fullTags
);
assert.ok(Object.isFrozen(normalized.sourceTags));

const fallbackCrossSection = normalizeTransportSource({
  sourceId: 'osm:way:124',
  id: 124
}, { highway: 'secondary' }).crossSection;
assert.equal(fallbackCrossSection.inferredLanes, true);
assert.equal(fallbackCrossSection.inferredWidth, true);
assert.equal(fallbackCrossSection.widthSource, 'fallback:road-class');
const placedCrossSection = normalizeTransportSource({
  sourceId: 'osm:way:125',
  id: 125
}, {
  highway: 'primary',
  lanes: '4',
  width: '12',
  placement: 'middle_of:1'
}).crossSection;
assert.equal(placedCrossSection.placement.status, 'source:placement');
assert.equal(placedCrossSection.placement.centerlineOffsetMeters, 4.5);

const generalizedBridge = normalizeTransportSource({
  sourceId: 'shortbread:streets:14:1:2:3:0',
  id: -1,
  completeness: 'generalized'
}, { highway: 'primary', bridge: 'yes' });
assert.equal(generalizedBridge.routeState, 'uncertain');
assert.equal(generalizedBridge.safeForDriving, false);

const driftA = feature('osm:way:drift-a', [{ x: -10, z: 0 }, { x: 0, z: 0 }]);
const driftB = feature('osm:way:drift-b', [{ x: 0.42, z: 0 }, { x: 10, z: 0 }]);
const driftGraph = compileTransportNetworkModel([driftA, driftB]);
assert.equal(driftGraph.authority, 'compiled_transport_network');
assert.equal(driftGraph.connections.length, 1);
assert.equal(driftGraph.connections[0].kind, 'endpoint-endpoint');
assert.ok(driftGraph.connections[0].provenance.confidence >= 0.75);
assert.equal(driftA.connectedFeatures.end[0].feature, driftB);
assert.equal(driftB.connectedFeatures.start[0].feature, driftA);
assert.ok(Object.isFrozen(driftGraph.connections));
assert.ok(Object.isFrozen(driftA.connectedFeatures));
const splitIdentityA = feature('osm:way:split', [{ x: 0, z: 30 }, { x: 10, z: 30 }]);
const splitIdentityB = feature('osm:way:split', [{ x: 10, z: 30 }, { x: 20, z: 30 }]);
const splitIdentityGraph = compileTransportNetworkModel([splitIdentityA, splitIdentityB]);
assert.equal(splitIdentityGraph.features.length, 2);
assert.notEqual(splitIdentityGraph.features[0].featureId, splitIdentityGraph.features[1].featureId);
assert.equal(splitIdentityGraph.features[0].sourceIdentity, splitIdentityGraph.features[1].sourceIdentity);

const main = feature('osm:way:main', [{ x: 0, z: 0 }, { x: 20, z: 0 }]);
const ramp = feature('osm:way:ramp', [{ x: 10, z: 10 }, { x: 10, z: 0.35 }], {
  tags: { highway: 'primary_link', oneway: 'yes' }
});
const mergeGraph = compileTransportNetworkModel([main, ramp]);
assert.equal(mergeGraph.connections.length, 1);
assert.equal(mergeGraph.connections[0].kind, 'endpoint-interior');
assert.equal(mergeGraph.stats.endpointInteriorCount, 1);
assert.equal(ramp.connectedFeatures.end[0].feature, main);
assert.equal(ramp.connectedFeatures.end[0].endpoint, 'interior');

const planarA = feature('osm:way:planar-a', [{ x: -20, z: 0 }, { x: 20, z: 0 }]);
const planarB = feature('osm:way:planar-b', [{ x: 0, z: -20 }, { x: 0, z: 20 }]);
assert.equal(
  compileTransportNetworkModel([planarA, planarB]).connections.length,
  0,
  'a geometric crossing without source topology became a merge'
);
const overpassB = feature('osm:way:overpass-b', [{ x: 0, z: -20 }, { x: 0, z: 20 }], {
  semantics: elevated
});
assert.equal(
  compileTransportNetworkModel([planarA, overpassB]).connections.length,
  0,
  'a vertical crossing became a graph connection'
);

const sourceIntersectionA = feature(
  'osm:way:source-a',
  [{ x: -20, z: 0 }, { x: 20, z: 0 }],
  {
    sourceNodeIds: ['1', '99', '2'],
    sourceTopologyNodes: [
      { id: '1', x: -20, z: 0 },
      { id: '99', x: 0, z: 0 },
      { id: '2', x: 20, z: 0 }
    ]
  }
);
const sourceIntersectionB = feature(
  'osm:way:source-b',
  [{ x: 0, z: -20 }, { x: 0, z: 20 }],
  {
    sourceNodeIds: ['3', '99', '4'],
    sourceTopologyNodes: [
      { id: '3', x: 0, z: -20 },
      { id: '99', x: 0, z: 0 },
      { id: '4', x: 0, z: 20 }
    ]
  }
);
const sourceIntersectionGraph = compileTransportNetworkModel([
  sourceIntersectionA,
  sourceIntersectionB
]);
assert.equal(sourceIntersectionGraph.connections.length, 1);
assert.equal(sourceIntersectionGraph.connections[0].kind, 'source-node-intersection');
assert.equal(sourceIntersectionGraph.connections[0].provenance.method, 'shared-source-node');
assert.equal(sourceIntersectionGraph.connections[0].provenance.confidence, 1);

appCtx.transportNetworkModel = mergeGraph;
appCtx.linearFeatures = [];
appCtx.overlayRuntimeLinearFeatures = [];
initWorldTraversal({
  enableLinearFeatures: () => false,
  featureTraversalKey: (candidate) => candidate.structureSemantics.verticalGroup,
  isFiniteWorldPointXZ: (point) => Number.isFinite(point?.x) && Number.isFinite(point?.z),
  isVehicleRoad: (candidate) => candidate?.driveable !== false,
  runtimeRoadFeatures: () => [main, ramp]
});
invalidateTraversalNetworks('phase2-test');
const mergeTraversal = buildTraversalNetworks().drive;
assert.equal(mergeTraversal.authority, 'compiled_transport_network');
assert.equal(mergeTraversal.transportGraphId, mergeGraph.id);
const mainTraversalNodeIds = new Set(
  mergeTraversal.segments
    .filter((segment) => segment.feature === main)
    .flatMap((segment) => [segment.fromId, segment.toId])
);
const rampTraversalNodeIds = new Set(
  mergeTraversal.segments
    .filter((segment) => segment.feature === ramp)
    .flatMap((segment) => [segment.fromId, segment.toId])
);
assert.ok(
  [...rampTraversalNodeIds].some((nodeId) => mainTraversalNodeIds.has(nodeId)),
  'endpoint-to-interior merge was not published into navigation'
);

const oneWay = feature('osm:way:oneway', [{ x: 0, z: 0 }, { x: 12, z: 0 }], {
  tags: { highway: 'primary', oneway: 'yes' }
});
const oneWayGraph = compileTransportNetworkModel([oneWay]);
appCtx.transportNetworkModel = oneWayGraph;
initWorldTraversal({ runtimeRoadFeatures: () => [oneWay] });
invalidateTraversalNetworks('oneway-test');
const oneWayTraversal = buildTraversalNetworks().drive;
assert.equal(oneWayTraversal.adjacency[0].length, 1);
assert.equal(oneWayTraversal.adjacency[1].length, 0);
assert.ok(findTraversalRoute(0, 0, 12, 0, { mode: 'drive', maxAnchorDistance: 4 }));
assert.equal(
  findTraversalRoute(12, 0, 0, 0, { mode: 'drive', maxAnchorDistance: 4 }),
  null,
  'route connectors bypassed one-way direction'
);

const compilationFixture = Array.from({ length: 600 }, (_, index) =>
  feature(
    `osm:way:perf-${index}`,
    [{ x: index * 30, z: 0 }, { x: index * 30 + 12, z: 0 }]
  )
);
const compileStarted = performance.now();
const performanceGraph = compileTransportNetworkModel(compilationFixture);
const compileDurationMs = performance.now() - compileStarted;
assert.equal(performanceGraph.stats.featureCount, 600);
assert.ok(
  compileDurationMs < 100,
  `transport graph compilation exceeded the 100 ms frame budget (${compileDurationMs.toFixed(2)} ms)`
);

const percentile95 = (samples) => {
  const ordered = [...samples].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * 0.95))];
};
const benchmarkSurface = compileTransportSurfaceModel({
  sourceFeatureId: 'osm:way:surface-benchmark',
  pts: [{ x: 0, z: 0 }, { x: 500, z: 0 }],
  width: 8,
  structureSemantics: atGrade
}, (x, z) => 40 + Math.sin(x / 35) + z * 0.01);
const surfaceQueryDurations = [];
for (let index = 0; index < 2000; index += 1) {
  const startedAt = performance.now();
  sampleTransportSurfaceAtDistance(
    benchmarkSurface,
    (index * 7.13) % 500,
    (index % 7) - 3
  );
  surfaceQueryDurations.push(performance.now() - startedAt);
}
const surfaceQueryP95Ms = percentile95(surfaceQueryDurations);
assert.ok(
  surfaceQueryP95Ms <= 0.25,
  `cached road-surface query p95 exceeded 0.25 ms (${surfaceQueryP95Ms.toFixed(4)} ms)`
);

const indexedRoads = compilationFixture.map((candidate) => ({
  ...candidate,
  transportSurfaceModel: benchmarkSurface,
  surfaceDistances: benchmarkSurface.distances,
  surfaceHeights: benchmarkSurface.centerHeights
}));
appCtx.roads = indexedRoads;
appCtx.overlayRuntimeRoads = [];
initWorldNavigation({
  areRoadsConnected: () => false,
  isSuppressedBaseRoad: () => false,
  sampleFeatureSurfaceY: () => 40
});
findNearestRoad(0, 0);
const spatialQueryDurations = [];
for (let index = 0; index < 800; index += 1) {
  const x = ((index * 97) % (indexedRoads.length * 30)) + 2;
  const startedAt = performance.now();
  findNearestRoad(x, 0);
  spatialQueryDurations.push(performance.now() - startedAt);
}
const spatialQueryP95Ms = percentile95(spatialQueryDurations);
assert.ok(
  spatialQueryP95Ms <= 0.5,
  `road spatial-query p95 exceeded 0.5 ms (${spatialQueryP95Ms.toFixed(4)} ms)`
);

const loadRoadsSource = fs.readFileSync(path.join(root, 'app/js/world/load-roads.js'), 'utf8');
const overpassPosition = loadRoadsSource.indexOf(
  'data = await fetchOverpassJSON(primaryQuery'
);
const shortbreadPosition = loadRoadsSource.indexOf(
  'data = await fetchShortbreadWorldData({',
  overpassPosition
);
assert.ok(overpassPosition >= 0 && shortbreadPosition > overpassPosition);
const roadPassSource = fs.readFileSync(path.join(root, 'app/js/world/load-road-pass.js'), 'utf8');
assert.equal(
  roadPassSource.includes('appCtx.terrainMeshHeightAt'),
  false,
  'road publication still samples terrain instead of the compiled transport surface'
);

console.log(JSON.stringify({
  ok: true,
  source: {
    preservedRawTagCount: TRANSPORT_RAW_TAG_KEYS.length,
    widthSource: normalized.crossSection.widthSource,
    generalizedStructurePolicy: generalizedBridge.routeState
  },
  graph: {
    driftConfidence: driftGraph.connections[0].provenance.confidence,
    endpointInteriorConnections: mergeGraph.stats.endpointInteriorCount,
    sourceTopologyConnections: sourceIntersectionGraph.connections.length,
    planarCrossingConnections: 0
  },
  navigation: {
    authority: mergeTraversal.authority,
    graphIdentity: mergeTraversal.transportGraphId,
    oneWayReverseEdges: oneWayTraversal.adjacency[1].length
  },
  performance: {
    features: performanceGraph.stats.featureCount,
    compileDurationMs: Number(compileDurationMs.toFixed(3)),
    compilationBudgetMs: 100,
    surfaceQueryP95Ms: Number(surfaceQueryP95Ms.toFixed(4)),
    surfaceQueryBudgetMs: 0.25,
    spatialQueryP95Ms: Number(spatialQueryP95Ms.toFixed(4)),
    spatialQueryBudgetMs: 0.5
  }
}, null, 2));
