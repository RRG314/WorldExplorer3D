import assert from 'node:assert/strict';
import {
  buildGuardrailEdges,
  elevatedSegmentSafety,
  isProtectedRoadFeature
} from '../app/js/world/bridge-safety.js';

const points = [
  { x: 0, z: 0 },
  { x: 10, z: 0 },
  { x: 10, z: 10 }
];
const bridge = {
  driveable: true,
  pts: points,
  type: 'primary',
  width: 6,
  surfaceBias: 0.08,
  structureSemantics: {
    deckClearance: 8,
    featureCategory: 'road',
    isBridge: true,
    structureKind: 'bridge',
    terrainMode: 'elevated',
    verticalOrder: 1
  },
  surfaceDistances: new Float32Array([0, 10, 20]),
  surfaceHeights: new Float32Array([8, 8, 8])
};

assert.equal(isProtectedRoadFeature(bridge), true);
const edges = buildGuardrailEdges(bridge, points, {
  outsideGap: 0.3,
  sampleTerrainY: () => 0
});
assert.equal(edges.leftEdge.length, points.length);
assert.equal(edges.rightEdge.length, points.length);
for (let index = 0; index < points.length; index += 1) {
  for (const edge of [edges.leftEdge[index], edges.rightEdge[index]]) {
    const offset = Math.hypot(edge.x - points[index].x, edge.z - points[index].z);
    assert.ok(offset >= bridge.width * 0.5, `guardrail crossed the driveable ribbon at point ${index}`);
  }
}

const exposed = elevatedSegmentSafety(bridge, {
  deckY: 8,
  distance: 10,
  terrainY: 0,
  total: 20,
  x: 10,
  z: 0
});
assert.equal(exposed.protected, true);
assert.equal(exposed.reason, 'bridge');

const transition = elevatedSegmentSafety(bridge, {
  deckY: 0.4,
  distance: 1,
  terrainY: 0,
  total: 20,
  x: 1,
  z: 0
});
assert.equal(transition.protected, false);
assert.equal(transition.reason, 'ground_transition');

const overWater = elevatedSegmentSafety(bridge, {
  deckY: 0.4,
  distance: 1,
  terrainY: 0,
  total: 20,
  waterAreas: [{
    pts: [
      { x: -2, z: -2 },
      { x: 2, z: -2 },
      { x: 2, z: 2 },
      { x: -2, z: 2 }
    ]
  }],
  x: 0,
  z: 0
});
assert.equal(overWater.protected, true);
assert.equal(overWater.reason, 'water_crossing');

console.log(JSON.stringify({
  ok: true,
  joinedEdgesOutsideDriveableRibbon: true,
  exposedBridgeProtected: true,
  groundTransitionOpen: true,
  waterCrossingProtected: true
}, null, 2));
