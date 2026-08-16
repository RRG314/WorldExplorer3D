import assert from 'node:assert/strict';
import {
  barrierPointConflictsWithDriveableRoad,
  createDriveableRoadConflictIndex
} from '../app/js/world/bridge-safety.js';

function road(points, width, height = 0) {
  const distance = Math.hypot(
    points[1].x - points[0].x,
    points[1].z - points[0].z
  );
  return {
    driveable: true,
    pts: points,
    width,
    surfaceDistances: new Float32Array([0, distance]),
    surfaceHeights: new Float32Array([height, height]),
    structureSemantics: { terrainMode: 'elevated' }
  };
}

const bridge = road([{ x: -20, z: 0 }, { x: 20, z: 0 }], 6, 5);
const crossing = road([{ x: 0, z: -20 }, { x: 0, z: 20 }], 6, 5);
const farRoads = Array.from({ length: 5_000 }, (_, index) => {
  const x = 2_000 + index * 12;
  return road([{ x, z: 2_000 }, { x: x + 8, z: 2_000 }], 6, 5);
});
const roads = [bridge, crossing, ...farRoads];
const roadIndex = createDriveableRoadConflictIndex(roads);
const diagnostics = {};

const exhaustive = barrierPointConflictsWithDriveableRoad(bridge, {
  x: 0,
  z: 3.2,
  deckY: 5,
  roads
});
const indexed = barrierPointConflictsWithDriveableRoad(bridge, {
  x: 0,
  z: 3.2,
  deckY: 5,
  roadIndex,
  diagnostics
});

assert.equal(indexed, exhaustive, 'The indexed guardrail decision diverged from exhaustive evaluation.');
assert.equal(indexed, true, 'The same-level crossing was not retained as a passable corridor.');
assert.ok(diagnostics.candidates <= 3,
  `A local barrier query evaluated unrelated roads: ${JSON.stringify(diagnostics)}`);
assert.equal(roadIndex.snapshot().indexedRoads, roads.length);

console.log(JSON.stringify({
  ok: true,
  contract: 'indexed-bridge-road-conflict',
  roads: roads.length,
  evaluatedCandidates: diagnostics.candidates,
  index: roadIndex.snapshot()
}, null, 2));
