import assert from 'node:assert/strict';
import {
  appendRoadJunctionGeometry,
  buildRoadJunctionEnvelope,
  convexHull,
  groupBranchesBySurfaceHeight
} from '../app/js/terrain/road-junctions.js';

function road(points, width = 8, height = 12) {
  const length = Math.hypot(points[1].x - points[0].x, points[1].z - points[0].z);
  return {
    pts: points,
    width,
    surfaceBias: 0.08,
    structureSemantics: { terrainMode: 'at_grade', gradeSeparated: false },
    transportSurfaceModel: {
      pathDistances: new Float32Array([0, length]),
      distances: new Float32Array([0, length]),
      centerHeights: new Float32Array([height, height]),
      leftHeights: new Float32Array([height, height]),
      rightHeights: new Float32Array([height, height]),
      width
    }
  };
}

const roads = [
  road([{ x: 0, z: 0 }, { x: 30, z: 0 }], 8),
  road([{ x: 0, z: 0 }, { x: 0, z: 30 }], 10),
  road([{ x: 0, z: 0 }, { x: -30, z: 0 }], 8)
];
const intersection = {
  x: 0,
  z: 0,
  maxWidth: 10,
  hasGradeSeparatedRoad: false,
  roads: [
    { roadIdx: 0, width: 8, dir: { x: 1, z: 0 } },
    { roadIdx: 1, width: 10, dir: { x: 0, z: 1 } },
    { roadIdx: 2, width: 8, dir: { x: -1, z: 0 } }
  ]
};

const hull = convexHull([
  { x: -1, y: 0, z: -1 },
  { x: 1, y: 0, z: -1 },
  { x: 1, y: 0, z: 1 },
  { x: -1, y: 0, z: 1 },
  { x: 0, y: 0, z: 0 }
]);
assert.equal(hull.length, 4, 'convex hull must discard interior fan points');

const envelope = buildRoadJunctionEnvelope(intersection, roads);
assert.ok(envelope);
assert.equal(envelope.branchCount, 3);
assert.ok(envelope.polygon.length >= 4);
assert.ok(envelope.polygon.every((point) => Number.isFinite(point.y)));

const verts = [];
const indices = [];
const stats = appendRoadJunctionGeometry({ intersections: [intersection], roads, verts, indices });
assert.equal(stats.count, 1);
assert.equal(indices.length, envelope.polygon.length * 3);
assert.equal(verts.length, (envelope.polygon.length + 1) * 3);

const stackedRoads = [
  road([{ x: 0, z: 0 }, { x: 30, z: 0 }], 8, 12),
  road([{ x: 0, z: 0 }, { x: 0, z: 30 }], 8, 20)
];
const stackedIntersection = {
  ...intersection,
  roads: [
    { roadIdx: 0, width: 8, dir: { x: 1, z: 0 } },
    { roadIdx: 1, width: 8, dir: { x: 0, z: 1 } }
  ],
  hasGradeSeparatedRoad: true
};
assert.equal(
  groupBranchesBySurfaceHeight(stackedIntersection, stackedRoads).length,
  0,
  'stacked roads at different elevations must not be welded into one junction'
);
const elevatedContinuation = [
  road([{ x: 0, z: 0 }, { x: 30, z: 0 }], 8, 20),
  road([{ x: 0, z: 0 }, { x: 0, z: 30 }], 8, 20.2)
];
assert.equal(
  groupBranchesBySurfaceHeight(stackedIntersection, elevatedContinuation).length,
  1,
  'connected elevated surfaces at the same deck elevation must share a junction envelope'
);

console.log(JSON.stringify({
  ok: true,
  junctionOwner: 'topology-derived-convex-envelope',
  branches: envelope.branchCount,
  polygonVertices: envelope.polygon.length,
  triangles: stats.triangleCount
}, null, 2));
