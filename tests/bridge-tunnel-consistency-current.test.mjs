import test from 'node:test';
import assert from 'node:assert/strict';
import { compileTransportSurfaceModel } from '../app/js/world/compiler/transport-surface-model.js';
import { compileTunnelSystemModel } from '../app/js/world/compiler/tunnel-system-model.js';
import { resolveTunnelCameraEnvelope } from '../app/js/hud/tunnel-camera-envelope.js';
import { resolveTunnelCameraBoom } from '../app/js/hud/tunnel-camera-boom.js';
import { selectPortalMasksForBounds, terrainHeightWithPortalCuts, terrainPointRemovedByPortal } from '../app/js/terrain/structure-terrain-portals.js';
import { removeLiveStructuresSupersededByReviewedPack } from '../app/js/world/fixed-regional-structures.js';
import { compileStructureColliderDescriptors } from '../app/js/world/structure-colliders.js';
import { createSurfaceQuery } from '../app/js/world/surface-contract.js';
import { isVehicleBuildingCollisionBlocking, findSweptVehicleBuildingCollision } from '../app/js/physics/building-collision-response.js';
import { createBuildingCollisionQuery } from '../app/js/physics/building-collision.js';
import { constrainTunnelActorCeiling } from '../app/js/world/compiler/tunnel-space-query.js';
import { ctx } from '../app/js/shared-context.js?v=55';
import { initWorldSpawning, resolveSafeWorldSpawn } from '../app/js/world/spawn.js';

function tunnel() {
  const feature = { width: 8, pts: [{ x: 0, z: 0 }, { x: 0, z: 120 }],
    structureSemantics: { terrainMode: 'subgrade', structureKind: 'tunnel', isTunnel: true, cutDepth: 4.6 },
    transportRecord: { completeness: 'lossless', routeState: 'complete', safeForDriving: true },
    connectedFeatures: { start: [], end: [] } };
  feature.transportSurfaceModel = compileTransportSurfaceModel(feature, () => 20);
  feature.tunnelSystemModel = compileTunnelSystemModel(feature, () => 20);
  return feature;
}

test('default floor depth actually satisfies the roof publication contract', () => {
  const feature = tunnel();
  assert.equal(feature.tunnelSystemModel.shellRanges.length, 1);
  assert.equal(feature.tunnelSystemModel.shellRanges[0].start, 0);
  assert.equal(feature.tunnelSystemModel.shellRanges[0].end, 120);
  assert.ok(feature.transportSurfaceModel.centerHeights.every((y) => y + 4.35 + 0.32 + 0.75 <= 20));
});

test('mode handoff preserves an occupied tunnel but geographic arrivals and blocked spawns do not', () => {
  const feature = tunnel();
  const floor = feature.transportSurfaceModel.centerHeights[0];
  ctx.SurfaceQuery = {
    terrainAt: () => ({ position: { y: 20 } }),
    walkAt: () => ({ position: { y: floor } }),
    driveAt: () => ({ position: { y: floor } })
  };
  ctx.checkBuildingCollision = () => ({ collision: false });
  initWorldSpawning({
    findNearestRoad: () => ({ road: feature, y: floor, dist: 0, verticalDelta: 0 }),
    buildingContainingPoint: () => null, isInsideWaterArea: () => false,
    isVehicleRoad: () => true, traversableFeaturesForMode: () => []
  });
  for (const mode of ['walk', 'drive']) {
    const options = { mode, feetY: floor, preserveCurrentSupport: true };
    const handoff = resolveSafeWorldSpawn(0, 60, options);
    assert.equal(handoff.road, feature);
    assert.equal(handoff.walkY, floor + 1.7);
    assert.equal(resolveSafeWorldSpawn(0, 60, { ...options, preserveCurrentSupport: false }).road, null);
    assert.equal(resolveSafeWorldSpawn(0, 60, { ...options, feetY: 20 }).road, null);
  }
  ctx.checkBuildingCollision = () => ({ collision: true });
  assert.equal(resolveSafeWorldSpawn(0, 60, { mode: 'walk', feetY: floor, preserveCurrentSupport: true }).road, null);
  delete ctx.SurfaceQuery;
  delete ctx.checkBuildingCollision;
});

test('steep cross-slope containment uses the shell exterior, not just the road edges', () => {
  const feature = tunnel();
  const terrain = (x) => 20 - Math.abs(x) * 2;
  feature.transportSurfaceModel = compileTransportSurfaceModel(feature, terrain);
  feature.tunnelSystemModel = compileTunnelSystemModel(feature, terrain);
  assert.equal(feature.tunnelSystemModel.shellRanges.length, 1);
  assert.equal(feature.tunnelSystemModel.shellRanges[0].end, 120);
});

test('portal excavation continues past a low roadside edge until the whole lane is clear', () => {
  const feature = tunnel();
  feature.connectedFeatures.start = [{ feature: { structureSemantics: { terrainMode: 'at_grade' } } }];
  const floor = feature.transportSurfaceModel.centerHeights[0];
  feature.tunnelSystemModel = compileTunnelSystemModel(feature, (x, z) =>
    Math.abs(x) > 4 && z < 60 ? floor : 20);
  const approach = feature.tunnelSystemModel.portalZones.find(zone => zone.endpoint === 'start');
  assert.ok(approach && approach.approachEnd >= 55);
  assert.equal(approach.approachStart, 0, 'a low edge is not evidence that the road center is clear');
  const walls = compileStructureColliderDescriptors([feature], { sampleTerrain: () => floor + 0.5 });
  const approachWall = walls.find(wall => wall.minZ > 10 && wall.maxZ < 20);
  assert.ok(approachWall && approachWall.maxY < floor + 0.7,
    'a low retaining wall must not retain an invisible full-height collision wall');
});

test('absent airport contact never replaces a below-sea-level tunnel; a real zero-height runway still works', () => {
  const ground = { terrainY: () => 12, driveSurfaceInfo: () => ({ y: -18, source: 'road' }),
    walkSurfaceInfo: () => ({ y: -18, source: 'road' }) };
  for (const missing of [null, undefined, '', NaN]) {
    const query = createSurfaceQuery({ transportFacilityVisual: { surfaceYAt: () => missing } }, ground);
    assert.equal(query.driveAt(0, 0, { currentY: -18 }).position.y, -18);
    assert.equal(query.walkAt(0, 0, { currentY: -18 }).position.y, -18);
  }
  const query = createSurfaceQuery({ transportFacilityVisual: { surfaceYAt: () => 0 } }, ground);
  assert.equal(query.driveAt(0, 0).position.y, 0);
});

test('camera uses actor layer and the rendered arched shoulder, not a rectangular roof', () => {
  const feature = tunnel();
  const floor = feature.transportSurfaceModel.centerHeights[0];
  assert.equal(resolveTunnelCameraEnvelope(feature, 0, 60, 21.7).inside, false);
  const center = resolveTunnelCameraEnvelope(feature, 0, 60, floor + 1.7);
  const edge = resolveTunnelCameraEnvelope(feature, 3.5, 60, floor + 1.7);
  assert.ok(edge.ceilingY < center.ceilingY - 0.8);
  const anchor = { x: 0, y: floor + 1.7, z: 60 };
  for (const target of [{ x: 8, y: floor + 2, z: 55 }, { x: 0, y: floor + 45, z: 55 }]) {
    const safe = resolveTunnelCameraBoom(feature, anchor, target);
    assert.equal(safe.collided, true);
    const envelope = resolveTunnelCameraEnvelope(feature, safe.x, safe.z, safe.y);
    assert.equal(envelope.inside, true);
    assert.ok(safe.y < envelope.ceilingY - 0.3);
    assert.ok(envelope.lateralDistance < envelope.halfWidth - 0.3);
  }
});

test('portal aperture agrees between CPU and ray hits, preserves overlying ground, has no 32-mask loss', () => {
  const mask = { x: 0, z: 0, tangentX: 0, tangentZ: 1, roadY: 2, grade: 0.1,
    halfWidth: 4, halfDepth: 5, cutHeight: 5 };
  assert.equal(terrainPointRemovedByPortal(mask, { x: 0, y: 4, z: 2 }), true);
  assert.equal(terrainPointRemovedByPortal(mask, { x: 0, y: 2.21, z: 2 }), true, 'thin terrain above pavement must not leave a visible grass band');
  assert.equal(terrainPointRemovedByPortal(mask, { x: 0, y: 2.1, z: 2 }), false, 'ground safely below the road is retained');
  assert.equal(terrainHeightWithPortalCuts([mask], 0, 2, 4), 2.2);
  assert.equal(terrainHeightWithPortalCuts([mask], 0, 2, 20), 20);
  assert.equal(terrainHeightWithPortalCuts([mask], 5, 2, 4), 4);
  assert.equal(terrainHeightWithPortalCuts([mask], 0, 6, 4), 4);
  assert.equal(selectPortalMasksForBounds({ minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
    Array.from({ length: 45 }, () => ({ ...mask }))).length, 45);
});

test('tunnel wall collision inner face matches visual lining', () => {
  const feature = tunnel();
  const colliders = compileStructureColliderDescriptors([feature]);
  assert.ok(colliders.length > 0);
  const nearestFace = Math.min(...colliders.flatMap((c) => c.pts.map((p) => Math.abs(p.x))));
  assert.ok(Math.abs(nearestFace - 4.02) < 1e-5);
});

test('fallback tunnel walls block a swept high-speed vehicle and cannot be waived as road ghosts', () => {
  const feature = tunnel();
  feature.transportRecord.completeness = 'generalized';
  const colliders = compileStructureColliderDescriptors([feature]);
  assert.ok(colliders.length > 0, 'a visible fallback tunnel needs physical walls');
  const wall = colliders.find((c) => c.minX > 0);
  assert.equal(isVehicleBuildingCollisionBlocking({ collision: true, building: wall },
    { road: feature, dist: 0 }), true);
  const context = { buildings: [], transportStructureColliders: colliders,
    car: { angle: Math.PI / 2, road: feature },
    pointInPolygon: (x, z, pts) => x >= Math.min(...pts.map(p=>p.x)) && x <= Math.max(...pts.map(p=>p.x)) &&
      z >= Math.min(...pts.map(p=>p.z)) && z <= Math.max(...pts.map(p=>p.z)),
    findNearestRoad: () => ({ road: feature, dist: 0 }) };
  const hit = findSweptVehicleBuildingCollision(context, createBuildingCollisionQuery(context),
    0, 60, 15, 60, feature.transportSurfaceModel.centerHeights[0]);
  assert.ok(hit && hit.lastSafeX < 4.02, 'sweep must stop before escaping the lining');
});

test('jumping into a tunnel roof is stopped without capturing people standing above it', () => {
  const feature = tunnel(), floor = feature.transportSurfaceModel.centerHeights[0];
  const hit = constrainTunnelActorCeiling(feature, { x: 0, y: floor + 1.7, z: 60 }, floor + 10);
  assert.equal(hit.collided, true);
  assert.ok(hit.y <= floor + 4.35 - 0.25 + 1e-5);
  assert.equal(constrainTunnelActorCeiling(feature, { x: 0, y: 22, z: 60 }, 23).collided, false);
});

test('reviewed bridge replacement preserves distant spans, parallel lanes, partial extensions, and levels', () => {
  const node = (id, x, y = 0) => ({ type: 'node', id, lat: 39 + y / 110540, lon: -76 + x / (111320 * Math.cos(39 * Math.PI / 180)) });
  const way = (id, nodes, layer = '1') => ({ type: 'way', id, nodes,
    tags: { name: 'Same Highway', highway: 'motorway', bridge: 'yes', layer } });
  const reviewed = { elements: [node(1, 0), node(2, 100), way(100, [1, 2])] };
  const live = { elements: [...reviewed.elements, way(101, [1, 2]),
    node(3, 1000), node(4, 1100), way(102, [3, 4]),
    node(5, 0, 8), node(6, 100, 8), way(103, [5, 6]),
    node(7, 200), way(104, [1, 7]), way(105, [1, 2], '2')] };
  const result = removeLiveStructuresSupersededByReviewedPack(live, reviewed);
  assert.deepEqual(result.elements.filter((e) => e.type === 'way').map((e) => e.id), [100, 102, 103, 104, 105]);
});
