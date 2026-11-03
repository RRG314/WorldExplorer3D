import test from 'node:test';
import assert from 'node:assert/strict';
import { planFieldworkWalk } from '../scripts/verification/fieldwork-walk-plan.mjs';
test('an explicit city approach can step a measured road-edge kerb while retaining real solid and water rejection', () => {
  const ctx = {
      Walk: { state: { walker: { x: 0, z: 0, y: 1.7 } } },
      METERS_PER_WORLD_UNIT: 1,
      buildings: [],
      dynamicBuildingColliders: [],
      SurfaceQuery: {
        walkAt: (x, z) => ({ kind: x < 1 ? 'path' : 'terrain', position: { y: x < 1 ? 0 : 0.18 } }),
        waterAt: () => null,
      },
    },
    goal = { x: 2, z: 0 };
  assert.throws(() => planFieldworkWalk(ctx, goal));
  assert.deepEqual(planFieldworkWalk(ctx, goal, { stepHeightMeters: 0.25 }), [goal]);
  ctx.dynamicBuildingColliders.push({
    minX: 0.9,
    maxX: 1.1,
    minZ: -100,
    maxZ: 100,
    minY: -1,
    maxY: 3,
    isInteriorCollider: true,
  });
  assert.throws(() => planFieldworkWalk(ctx, goal, { stepHeightMeters: 0.25 }));
  ctx.dynamicBuildingColliders = [];
  ctx.SurfaceQuery.waterAt = (x) => (x >= 1 ? { feature: {}, position: { y: 1 } } : null);
  assert.throws(() => planFieldworkWalk(ctx, goal, { stepHeightMeters: 0.25 }));
});
