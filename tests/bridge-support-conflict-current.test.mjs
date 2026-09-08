import test from 'node:test';
import assert from 'node:assert/strict';

import { supportPointConflictsWithDriveableRoad } from '../app/js/world/bridge-safety.js';

function roadAt(y) {
  return {
    width: 8,
    driveable: true,
    pts: [{ x: 0, z: -10 }, { x: 0, z: 10 }],
    transportSurfaceModel: {
      distances: new Float32Array([0, 20]),
      centerHeights: new Float32Array([y, y])
    }
  };
}

test('a same-elevation carriageway may share a support bent below both decks', () => {
  const feature = roadAt(10);
  const siblingCarriageway = roadAt(10);

  assert.equal(supportPointConflictsWithDriveableRoad(feature, {
    x: 0,
    z: 0,
    supportBottomY: 0,
    supportTopY: 9.2,
    columnRadius: 0.8,
    roads: [feature, siblingCarriageway]
  }), false);
});

test('a lower roadway crossing the pier interval remains protected', () => {
  const feature = roadAt(10);
  const crossingRoad = roadAt(5);

  assert.equal(supportPointConflictsWithDriveableRoad(feature, {
    x: 0,
    z: 0,
    supportBottomY: 0,
    supportTopY: 9.2,
    columnRadius: 0.8,
    roads: [feature, crossingRoad]
  }), true);
});
