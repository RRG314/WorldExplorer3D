import assert from 'node:assert/strict';
import { resolveCustomLocationArrival } from '../app/js/world/spawn-location-arrival.js';

function harness(overrides = {}) {
  const calls = [];
  const deps = {
    appCtx: {
      LOC: { lat: 1, lon: 2 },
      roads: [{ id: 'road' }],
      Walk: { state: { walker: { angle: 0 } } },
      worldLoadRuntimeState: { surfaceDomain: { kind: 'land' } },
      geoToWorld: () => ({ x: 0, z: 0 })
    },
    applyResolvedWorldSpawn: (value) => (calls.push('resolved'), value),
    applySpawnTarget: (x, z, options) => (calls.push('target'), { x, z, ...options }),
    featuredArrivalNear: () => null,
    findGradeSeparatedRoadAt: () => ({ x: 2, z: 3, y: 0, dist: 0, road: { width: 8 } }),
    isSubgradeArrival: () => false,
    resolveSafeWorldSpawn: () => ({ valid: true, x: 4, z: 5 }),
    searchNearestSafeRoadSpawn: () => ({ valid: true, x: 6, z: 7 }),
    tryAutoEnterBoatAt: () => (calls.push('boat-query'), null),
    ...overrides
  };
  return { deps, calls };
}

const water = harness({
  tryAutoEnterBoatAt: () => ({ mode: 'boat', source: 'mapped-water' })
});
assert.equal(
  resolveCustomLocationArrival(water.deps, 'walk', { preferBoatIfWater: true }).mode,
  'boat',
  'An exact mapped water destination must enter the boat before selecting a nearby street.'
);

const waterfrontLand = harness();
const waterfrontResult = resolveCustomLocationArrival(
  waterfrontLand.deps,
  'walk',
  { preferBoatIfWater: true }
);
assert.equal(waterfrontResult.source, 'custom_mapped_walk_approach');
assert.deepEqual(waterfrontLand.calls.slice(0, 2), ['boat-query', 'resolved']);

const explicitWalk = harness();
explicitWalk.deps.appCtx.customLoc = { arrivalMode: 'walk' };
const explicitWalkResult = resolveCustomLocationArrival(
  explicitWalk.deps,
  'walk',
  { preferBoatIfWater: true }
);
assert.equal(explicitWalkResult.source, 'custom_mapped_walk_approach');
assert.deepEqual(explicitWalk.calls, ['resolved']);

const elevated = harness({
  findGradeSeparatedRoadAt: () => ({
    x: 8, z: 9, y: 24, dist: 0,
    road: { width: 10, structureSemantics: { terrainMode: 'elevated' } }
  }),
  tryAutoEnterBoatAt: () => {
    throw new Error('Elevated structure arrival must be resolved before water preference.');
  }
});
const elevatedResult = resolveCustomLocationArrival(
  elevated.deps,
  'walk',
  { preferBoatIfWater: true }
);
assert.equal(elevatedResult.feetY, 24);
assert.equal(elevatedResult.preserveElevatedSurface, true);

const tunnel = harness({
  findGradeSeparatedRoadAt: () => ({
    x: 0, z: 0, y: -28, dist: 0,
    road: { width: 10, structureSemantics: { terrainMode: 'subgrade' } }
  }),
  searchNearestSafeRoadSpawn: () => ({
    valid: true,
    mode: 'walk',
    x: 120,
    z: 0,
    source: 'portal-surface-approach'
  }),
  tryAutoEnterBoatAt: () => {
    throw new Error('A mapped tunnel must resolve its surface approach before water preference.');
  }
});
const tunnelResult = resolveCustomLocationArrival(
  tunnel.deps,
  'walk',
  { preferBoatIfWater: true }
);
assert.equal(tunnelResult.mode, 'walk');
assert.equal(tunnelResult.source, 'custom_mapped_walk_approach');

console.log(JSON.stringify({
  ok: true,
  waterPriority: true,
  waterfrontFallback: true,
  explicitWalkPriority: true,
  elevatedPriority: true,
  tunnelSurfacePriority: true
}, null, 2));
