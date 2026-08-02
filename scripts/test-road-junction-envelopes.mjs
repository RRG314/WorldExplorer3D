import assert from 'node:assert/strict';
import {
  appendCompactIntersectionCap,
  computeIntersectionCapRadius,
  shouldBuildCompactIntersectionCap
} from '../app/js/terrain/rebuild.js';
import { detectRoadIntersections } from '../app/js/terrain/intersections.js';

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

const verts = [];
const indices = [];
assert.equal(shouldBuildCompactIntersectionCap(intersection), true);
const compactRadius = computeIntersectionCapRadius(intersection);
assert.ok(compactRadius <= intersection.maxWidth * 0.34);
assert.equal(
  appendCompactIntersectionCap(intersection, verts, indices, (x, z) => 12 + x * 0.02 + z * 0.01),
  true
);
assert.equal(indices.length, 16 * 3);
assert.equal(verts.length, 17 * 3);
assert.ok(
  verts.every(Number.isFinite),
  'compact terrain-draped junction emitted an invalid vertex'
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
assert.equal(shouldBuildCompactIntersectionCap(stackedIntersection), false);
const elevatedContinuation = [
  road([{ x: 0, z: 0 }, { x: 30, z: 0 }], 8, 20),
  road([{ x: 0, z: 0 }, { x: 0, z: 30 }], 8, 20.2)
];
assert.equal(shouldBuildCompactIntersectionCap({ ...stackedIntersection, roads: elevatedContinuation }), false);

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
  junctionOwner: 'compact-terrain-draped-cap',
  branches: intersection.roads.length,
  radius: compactRadius,
  triangles: indices.length / 3
}, null, 2));
