import assert from 'node:assert/strict';
import {
  compilePedestrianGraph,
  compileTrafficGraph
} from '../app/js/living-world/navigation-graphs.js';

function segment(id, options = {}) {
  const feature = {
    sourceFeatureId: id,
    kind: options.kind || 'road',
    width: options.width || 8,
    structureSemantics: {
      terrainMode: options.terrainMode || 'at_grade',
      structureKind: options.structureKind || 'none',
      gradeSeparated: options.terrainMode === 'elevated' || options.terrainMode === 'subgrade',
      verticalOrder: options.verticalOrder || 0
    },
    transportRecord: {
      identity: id,
      completeness: options.mapped === false ? 'generalized' : 'lossless',
      crossSection: {
        lanes: options.lanes || 2,
        lanesSource: options.mapped === false ? '' : 'osm:lanes'
      },
      speed: { metersPerSecond: options.speed || 13 }
    }
  };
  return {
    feature,
    direction: options.direction || 'both',
    segIndex: 0,
    sourceTStart: 0,
    sourceTEnd: 1,
    p1: { x: options.x || 0, z: options.z || 0 },
    p2: { x: (options.x || 0) + (options.dx || 80), z: (options.z || 0) + (options.dz || 0) },
    length: Math.hypot(options.dx || 80, options.dz || 0)
  };
}

const bridge = segment('road:bridge', {
  direction: 'forward',
  terrainMode: 'elevated',
  structureKind: 'bridge',
  verticalOrder: 1
});
const tunnel = segment('road:tunnel', {
  x: 0,
  z: 30,
  terrainMode: 'subgrade',
  structureKind: 'tunnel',
  verticalOrder: -1,
  mapped: false
});
const footway = segment('path:mapped', { x: 0, z: -30, kind: 'footway', width: 2.2 });
const sampleSurface = (feature) => feature.structureSemantics.terrainMode === 'elevated'
  ? 12
  : feature.structureSemantics.terrainMode === 'subgrade' ? -5 : 1;

const traffic = compileTrafficGraph({
  traversal: { authority: 'test-transport', segments: [bridge, tunnel] },
  sampleSurface,
  tier: 'balanced'
}).publication;
const bridgeEdges = traffic.edges.filter((edge) => edge.id.includes('road:bridge'));
const tunnelEdges = traffic.edges.filter((edge) => edge.id.includes('road:tunnel'));
assert.equal(bridgeEdges.length, 1, 'one-way bridge created a prohibited reverse lane');
assert.equal(bridgeEdges[0].direction, 'forward');
assert.equal(bridgeEdges[0].structure.terrainMode, 'elevated');
assert.ok(bridgeEdges[0].p1.y > 12, 'bridge traffic did not use the shared elevated surface');
assert.equal(tunnelEdges.length, 2, 'bidirectional tunnel did not create both directed lanes');
assert.ok(tunnelEdges.every((edge) => edge.p1.y < -4.8), 'tunnel traffic left the shared subgrade surface');
assert.equal(traffic.provenance.mappedLaneEdges, 1);
assert.equal(traffic.provenance.inferredLaneEdges, 2);

const pedestrians = compilePedestrianGraph({
  traversal: { authority: 'test-walk', segments: [bridge, footway] },
  entrances: [{
    id: 'entrance:building:1',
    buildingSourceId: 'building:1',
    provenance: 'mapped',
    approachX: 2,
    approachY: 1,
    approachZ: -26
  }],
  sampleSurface,
  tier: 'balanced'
}).publication;
assert.ok(pedestrians.edges.some((edge) => edge.provenance === 'inferred_sidewalk'));
assert.ok(pedestrians.edges.some((edge) => edge.provenance === 'mapped_path'));
assert.ok(pedestrians.edges.some((edge) => edge.role === 'crossing'));
assert.equal(pedestrians.edges.filter((edge) => edge.role === 'entrance').length, 2);
assert.doesNotThrow(() => JSON.stringify({ traffic, pedestrians }), 'published graphs contain runtime feature references');
assert.equal(traffic.provenance.additionalProviderQueries, 0);
assert.equal(pedestrians.provenance.additionalProviderQueries, 0);

console.log(JSON.stringify({
  ok: true,
  contract: 'living-world-navigation-v1',
  trafficEdges: traffic.edges.length,
  pedestrianEdges: pedestrians.edges.length,
  oneWayRespected: true,
  bridgeSurfaceY: bridgeEdges[0].p1.y,
  tunnelSurfaceY: tunnelEdges[0].p1.y,
  additionalProviderQueries: 0
}, null, 2));
