import assert from 'node:assert/strict';
import test from 'node:test';

import { ctx } from '../app/js/shared-context.js?v=55';
import { sampleInteriorWalkSurface } from '../app/js/interiors/runtime.js?v=12';

const deps = {
  finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  },
  pointInPolygonSafe(x, z, polygon) {
    return x >= polygon[0].x && x <= polygon[2].x && z >= polygon[0].z && z <= polygon[2].z;
  }
};

const floor = {
  kind: 'polygon',
  y: 0,
  pts: [
    { x: -2, z: -2 },
    { x: 12, z: -2 },
    { x: 12, z: 2 },
    { x: -2, z: 2 }
  ]
};

const stairs = {
  kind: 'ramp',
  start: { x: 0, z: 0 },
  end: { x: 10, z: 0 },
  yStart: 0,
  yEnd: 3.4,
  halfWidth: 1
};

test('interior stairs own an overlapping floor only when vertically continuous with the walker', () => {
  const previousInterior = ctx.activeInterior;
  try {
    ctx.activeInterior = {
      activeLevel: 0,
      floorBaseY: 0,
      floorPlan: { storyHeight: 3.4 },
      // Keep the flat floor first to prove the result does not depend on array order.
      walkSurfaces: [floor, stairs]
    };

    const climbing = sampleInteriorWalkSurface(2, 0, 0.66, deps);
    assert.equal(climbing?.source, 'interior_stairs');
    assert.ok(Math.abs(climbing.y - 0.68) < 0.001);

    const descending = sampleInteriorWalkSurface(8, 0, 2.75, deps);
    assert.equal(descending?.source, 'interior_stairs');
    assert.ok(Math.abs(descending.y - 2.72) < 0.001);

    const distantMidRamp = sampleInteriorWalkSurface(5, 0, 0, deps);
    assert.equal(distantMidRamp?.source, 'interior');
    assert.equal(distantMidRamp?.y, 0);
  } finally {
    ctx.activeInterior = previousInterior;
  }
});
