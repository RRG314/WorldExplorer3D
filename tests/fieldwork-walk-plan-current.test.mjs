import test from 'node:test';
import assert from 'node:assert/strict';
import { planFieldworkWalk } from '../scripts/verification/fieldwork-walk-plan.mjs';
function runtime() {
  return {
    Walk: { state: { walker: { x: 0, z: 0 } } },
    METERS_PER_WORLD_UNIT: 1,
    buildings: [],
    dynamicBuildingColliders: [
      { minX: 3, maxX: 5, minZ: -1, maxZ: 1, minY: 0, maxY: 1, isInteriorCollider: true }
    ],
    SurfaceQuery: { walkAt: () => ({ position: { y: 0 } }), waterAt: () => null }
  };
}
test('verification plans around solid field furniture but returns only waypoints', () => {
  const c = runtime(),
    before = structuredClone(c.Walk.state.walker),
    route = planFieldworkWalk(c, { x: 8, z: 0 });
  assert.ok(route.length >= 2);
  assert.deepEqual(route.at(-1), { x: 8, z: 0 });
  assert.deepEqual(c.Walk.state.walker, before);
  assert.ok(route.some((p) => Math.abs(p.z) > 1.4));
});
test('verification route remains bounded and cannot cross fully wet ground', () => {
  const c = runtime();
  assert.throws(() => planFieldworkWalk(c, { x: 1000, z: 0 }), /bounded/);
  c.SurfaceQuery.waterAt = () => ({ feature: {}, position: { y: 1 } });
  assert.throws(() => planFieldworkWalk(c, { x: 8, z: 0 }), /No supported/);
});
