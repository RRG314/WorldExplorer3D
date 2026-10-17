import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyBiomeProfile } from '../app/js/earth-core/biome-profile.js';
import { resolveCustomLocationArrival } from '../app/js/world/spawn-location-arrival.js';
import { ctx } from '../app/js/shared-context.js?v=55';
import { initWorldSpawning, resolveSafeWorldSpawn } from '../app/js/world/spawn.js';

test('Antarctic exposed rock and subpolar barren ground cannot become hot desert', () => {
  const signals = { arid: .471, cryo: .257, vegetated: 0 };
  assert.equal(classifyBiomeProfile({ latitude: -64.774, signals }).id, 'polar-desert');
  assert.equal(classifyBiomeProfile({ latitude: -64.774, signals: { ...signals, cryo: .8 } }).id, 'polar-cryosphere');
  assert.notEqual(classifyBiomeProfile({ latitude: 64, signals }).id, 'hot-desert');
  assert.equal(classifyBiomeProfile({ latitude: 36.1069, signals }).id, 'arid-mosaic');
});

test('a distant road cannot replace the selected canyon walking destination', () => {
  let request;
  const result = resolveCustomLocationArrival({
    appCtx: { customLoc: { arrivalMode: 'walk' }, LOC: { lat: 36.1069, lon: -112.1129 }, roads: [{}] },
    featuredArrivalNear: () => null,
    findGradeSeparatedRoadAt: () => ({ x: 4700, z: 80, dist: 4700, road: {} }),
    resolveSafeWorldSpawn: (x, z, options) => { request = { x, z, ...options }; return { x, z, valid: true }; },
    applyResolvedWorldSpawn: value => value, isSubgradeArrival: () => false,
    tryAutoEnterBoatAt: () => null,
    applySpawnTarget: () => { throw Error('unexpected fallback'); }
  }, 'walk');
  assert.deepEqual(result, { x: 0, z: 0, valid: true });
  assert.equal(request.maxRoadDistance, 160);
  assert.equal(request.maxGroundRadius, 96);
});

test('walking safety fallback stays bounded even when the only terrain is beside a distant road', () => {
  const previous = { ...initWorldSpawning() }, surface = ctx.SurfaceQuery;
  try {
    const road = { pts: [{ x: 4000, z: 0 }, { x: 4100, z: 0 }], width: 8 };
    ctx.SurfaceQuery = {
      terrainAt: (x) => ({ position: { y: x > 3900 ? 0 : NaN } }),
      walkAt: (x) => ({ position: { y: x > 3900 ? 0 : NaN } })
    };
    initWorldSpawning({ traversableFeaturesForMode: () => [road], findNearestRoad: () => null,
      isInsideWaterArea: () => false, buildingContainingPoint: () => null });
    const spawn = resolveSafeWorldSpawn(0, 0, { mode: 'walk', maxGroundRadius: 8, maxRoadDistance: 160 });
    assert.ok(Math.hypot(spawn.x, spawn.z) <= 160, 'must not silently expand a bounded destination search');
  } finally { ctx.SurfaceQuery = surface; initWorldSpawning(previous); }
});

test('polar latitude alone does not freeze every mapped water body', async () => {
  const {classifyWaterSurfaceProfile}=await import('../app/js/surface-rules.js');
  const bounds={latN:-77,latS:-78,lonW:166,lonE:167};
  assert.equal(classifyWaterSurfaceProfile({bounds,worldSurfaceProfile:{waterModeHint:'water'}}).mode,'water');
  assert.equal(classifyWaterSurfaceProfile({bounds,worldSurfaceProfile:{waterModeHint:'ice'}}).mode,'ice');
});

test('a local doorway check rejects blocked space without searching or relocating to another street', () => {
  const previous = { ...initWorldSpawning() }, surface = ctx.SurfaceQuery, collision = ctx.checkBuildingCollision;
  let surfaceQueries = 0, roadSearches = 0;
  try {
    ctx.SurfaceQuery = {
      terrainAt: () => { surfaceQueries++; return { position: { y: 0 } }; },
      walkAt: () => ({ position: { y: 0 } })
    };
    ctx.checkBuildingCollision = () => ({ collision: false });
    initWorldSpawning({ findNearestRoad: () => null, isInsideWaterArea: () => false,
      buildingContainingPoint: x => x === 0 ? { baseY: 0, height: 10 } : null,
      traversableFeaturesForMode: () => { roadSearches++; return []; } });
    const blocked = resolveSafeWorldSpawn(0, 0, { mode: 'walk', allowRelocation: false });
    assert.equal(blocked.valid, false); assert.equal(blocked.reason, 'inside_building');
    assert.equal(surfaceQueries, 1); assert.equal(roadSearches, 0);
    const doorway = resolveSafeWorldSpawn(3, 4, { mode: 'walk', allowRelocation: false });
    assert.equal(doorway.valid, true); assert.equal(doorway.x, 3); assert.equal(doorway.z, 4);
    assert.equal(roadSearches, 0);
    const arrival = resolveSafeWorldSpawn(0, 0, { mode: 'walk' });
    assert.equal(arrival.valid, true); assert.ok(Math.hypot(arrival.x, arrival.z) > 0);
  } finally { ctx.SurfaceQuery = surface; ctx.checkBuildingCollision = collision; initWorldSpawning(previous); }
});
