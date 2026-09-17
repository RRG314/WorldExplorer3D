import test from 'node:test';
import assert from 'node:assert/strict';
import { ctx } from '../app/js/shared-context.js?v=55';
import { initWorldSpawning, resolveSafeWorldSpawn } from '../app/js/world/spawn.js';
import { createBuildingCollisionQuery } from '../app/js/physics/building-collision.js';
import { pointInPolygonSafe } from '../app/js/interiors/core.js?v=4';

// Published Baltimore footprint captured by the failing mobile share journey.
const pts = [
  [6.61655206807937, 1.278267105675468], [7.031768475632995, 3.3543498311416897],
  [.8035223623286142, 3.7695664495629444], [-.8573432678858874, -24.880322497011775],
  [2.879604400096741, -25.295537415814806], [2.4643879925431156, -36.921545191859195],
  [20.733909924902633, -37.751973579958076], [22.394775555117135, .4478341899982752]
].map(([x, z]) => ({ x, z }));
const building = { pts, minX: -.857344, maxX: 22.394776, minZ: -37.751974, maxZ: 3.769567, baseY: 0, height: 8 };

test('walking pose restoration preserves a valid doorway pose while retaining wall rejection', () => {
  const oldDeps = { ...initWorldSpawning() };
  const oldSurface = ctx.SurfaceQuery;
  const oldCollision = ctx.checkBuildingCollision;
  try {
    ctx.SurfaceQuery = { terrainAt: () => ({ position: { y: 0 } }), walkAt: () => ({ position: { y: 0 } }) };
    ctx.checkBuildingCollision = createBuildingCollisionQuery({ buildings: [building], pointInPolygon: pointInPolygonSafe });
    initWorldSpawning({
      buildingContainingPoint: (x, z) => pointInPolygonSafe(x, z, pts) ? building : null,
      isInsideWaterArea: () => false, findNearestRoad: () => null,
      isVehicleRoad: () => false, traversableFeaturesForMode: () => []
    });
    const x = -.028642588406920588, z = 4.198814778292868;
    assert.equal(ctx.checkBuildingCollision(x, z, .35).collision, false);
    assert.equal(ctx.checkBuildingCollision(x, z, 1.5).collision, true);
    const options = { mode: 'walk', restorePose: true, source: 'shared_walk_pose', maxGroundRadius: 8 };
    const restored = resolveSafeWorldSpawn(x, z, options);
    assert.equal(restored.x, x);
    assert.equal(restored.z, z);
    assert.equal(restored.source, 'shared_walk_pose');
    const arrival = resolveSafeWorldSpawn(x, z, { ...options, restorePose: false });
    assert.notEqual(arrival.source, 'shared_walk_pose', 'fresh arrivals retain their wider clearance margin');
    for (const [blockedX, blockedZ] of [[5, -5], [.8035223623286142, 3.78]]) {
      assert.notEqual(resolveSafeWorldSpawn(blockedX, blockedZ, options).source, 'shared_walk_pose');
    }
  } finally {
    ctx.SurfaceQuery = oldSurface;
    ctx.checkBuildingCollision = oldCollision;
    initWorldSpawning(oldDeps);
  }
});
