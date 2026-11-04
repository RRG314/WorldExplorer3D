import test from 'node:test';
import assert from 'node:assert/strict';
import { planFieldworkWalk } from '../scripts/verification/fieldwork-walk-plan.mjs';
test('a verification walking route can include the existing read-only urban actor collision query and walk around its solid vehicle', () => {
  const ctx = {
    METERS_PER_WORLD_UNIT: 1,
    Walk: { state: { walker: { x: 0, z: 0, y: 1.7 } }, CFG: { eyeHeight: 1.7 } },
    buildings: [],
    dynamicBuildingColliders: [],
    SurfaceQuery: { walkAt: () => ({ kind: 'path', position: { y: 0 } }), waterAt: () => null },
    resolveUrbanActorCollision(a, b, o) {
      assert.equal(o.mode, 'walk');
      const crosses =
        Math.min(a.x, b.x) < 1.4 &&
        Math.max(a.x, b.x) > 0.6 &&
        Math.min(a.z, b.z) < 1.3 &&
        Math.max(a.z, b.z) > -1.3;
      return crosses
        ? { x: a.x, z: a.z, collision: true, targetKind: 'vehicle' }
        : { ...b, collision: false };
    },
  };
  assert.deepEqual(planFieldworkWalk(ctx, { x: 3, z: 0 }), [{ x: 3, z: 0 }]);
  const route = planFieldworkWalk(ctx, { x: 3, z: 0 }, { includeUrbanActors: true });
  assert.ok(route.some((p) => Math.abs(p.z) >= 1.3));
  assert.deepEqual(route.at(-1), { x: 3, z: 0 });
});
