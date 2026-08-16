import assert from 'node:assert/strict';
import { barrierPointConflictsWithDriveableRoad } from '../app/js/world/bridge-safety.js';

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
const mergingRamp = road([{ x: 0, z: -20 }, { x: 0, z: 20 }], 6, 5);
assert.equal(barrierPointConflictsWithDriveableRoad(bridge, {
  x: 0,
  z: 3.2,
  deckY: 5,
  roads: [bridge, mergingRamp]
}), true, 'barrier crossing a same-level on-ramp corridor must be omitted');

const underpass = road([{ x: 0, z: -20 }, { x: 0, z: 20 }], 6, -2);
assert.equal(barrierPointConflictsWithDriveableRoad(bridge, {
  x: 0,
  z: 3.2,
  deckY: 5,
  roads: [bridge, underpass]
}), false, 'a vertically separated road must not remove bridge edge protection');

console.log(JSON.stringify({
  ok: true,
  sameLevelMergesRemainPassable: true,
  gradeSeparatedCrossingsRemainProtected: true
}, null, 2));
