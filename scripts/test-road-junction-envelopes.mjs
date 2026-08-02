import assert from 'node:assert/strict';
import {
  appendRoadJunctionGeometry,
  buildRoadJunctionEnvelope,
  convexHull,
  groupBranchesBySurfaceHeight,
  prepareRoadJunctionEnvelopes
} from '../app/js/terrain/road-junctions.js';
import { detectRoadIntersections } from '../app/js/terrain/intersections.js';
import { sampleFeatureSurfaceY } from '../app/js/structure-semantics.js';

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
assert.ok(envelope.plane);
for (const point of envelope.polygon) {
  const planeY = envelope.plane.centerY +
    envelope.plane.slopeX * (point.x - intersection.x) +
    envelope.plane.slopeZ * (point.z - intersection.z) +
    0.006;
  assert.ok(Math.abs(point.y - planeY) <= 1e-8, 'junction polygon folded away from its fitted plane');
}

const verts = [];
const indices = [];
prepareRoadJunctionEnvelopes([intersection], roads);
const stats = appendRoadJunctionGeometry({ intersections: [intersection], roads, verts, indices });
assert.equal(stats.count, 1);
assert.equal(indices.length, envelope.polygon.length * 3);
assert.equal(verts.length, (envelope.polygon.length + 1) * 3);
assert.ok(roads.every((candidate) => candidate.junctionTransitions.length === 1));
assert.ok(
  Math.abs(
    sampleFeatureSurfaceY(roads[0], 0, 0) -
    (intersection.junctionEnvelopes[0].plane.centerY + 0.006)
  ) <= 1e-6,
  'road gameplay height did not blend into the published junction plane'
);

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

const endpointToInteriorRoads = [
  { ...road([{ x: -20, z: 0 }, { x: 0, z: 0 }]), sourceNodeIds: ['a', 'junction'] },
  { ...road([{ x: 0, z: -20 }, { x: 0, z: 20 }]), sourceNodeIds: ['b', 'c'] }
];
const endpointToInterior = detectRoadIntersections(endpointToInteriorRoads).filter((candidate) =>
  Math.hypot(candidate.x, candidate.z) < 0.1
);
assert.equal(endpointToInterior.length, 1, 'endpoint/interior topology emitted duplicate junction fans');

const nearbyStackedRoads = [
  {
    ...road([{ x: -20, z: 50 }, { x: 0, z: 50 }], 8, 12),
    structureSemantics: { terrainMode: 'at_grade', gradeSeparated: false, verticalGroup: 'at_grade:0' }
  },
  {
    ...road([{ x: 0.2, z: 50 }, { x: 20, z: 50 }], 8, 20),
    structureSemantics: { terrainMode: 'elevated', gradeSeparated: true, verticalGroup: 'elevated:1' }
  }
];
assert.equal(
  detectRoadIntersections(nearbyStackedRoads).length,
  0,
  'nearby endpoints on unrelated vertical surfaces were merged into a junction'
);

console.log(JSON.stringify({
  ok: true,
  junctionOwner: 'topology-derived-convex-envelope',
  branches: envelope.branchCount,
  polygonVertices: envelope.polygon.length,
  triangles: stats.triangleCount
}, null, 2));
