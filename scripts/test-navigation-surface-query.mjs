import assert from 'node:assert/strict';
import { ctx as appCtx } from '../app/js/shared-context.js?v=55';
import '../app/js/world/collection-registry.js?v=1';
import { findNearestRoad, initWorldNavigation } from '../app/js/world/navigation.js';

let fallbackSamples = 0;
initWorldNavigation({
  areRoadsConnected: () => false,
  isSuppressedBaseRoad: () => false,
  sampleFeatureSurfaceY: () => {
    fallbackSamples += 1;
    return 7;
  }
});

const profiledRoad = {
  bounds: { minX: 0, maxX: 10, minZ: -2, maxZ: 2 },
  pts: [{ x: 0, z: 0 }, { x: 10, z: 0 }],
  surfaceDistances: new Float32Array([0, 10]),
  surfaceHeights: new Float32Array([2, 4]),
  width: 6
};
appCtx.roads = [profiledRoad];
appCtx.overlayRuntimeRoads = [];

const typedProfileHit = findNearestRoad(5, 1, { y: 3, maxVerticalDelta: 10 });
assert.equal(typedProfileHit.road, profiledRoad);
assert.equal(typedProfileHit.y, 3);
assert.equal(typedProfileHit.dist, 1);
assert.equal(fallbackSamples, 0);

const terrainOwnedRoad = {
  ...profiledRoad,
  structureSemantics: { terrainMode: 'at_grade' },
  surfaceTerrainSampler: () => 6.92
};
appCtx.roads = [terrainOwnedRoad];
const terrainOwnedHit = findNearestRoad(5, 1, { y: 7, maxVerticalDelta: 10 });
assert.equal(terrainOwnedHit.road, terrainOwnedRoad);
assert.equal(terrainOwnedHit.y, 7);
assert.equal(
  fallbackSamples,
  1,
  'at-grade roads must use the live surface sampler instead of a stale typed profile'
);

const irregularRoad = {
  ...profiledRoad,
  surfaceHeights: new Float32Array([7])
};
appCtx.roads = [irregularRoad];
const fallbackHit = findNearestRoad(5, 1, { y: 7, maxVerticalDelta: 10 });
assert.equal(fallbackHit.road, irregularRoad);
assert.equal(fallbackHit.y, 7);
assert.ok(fallbackSamples > 0);

console.log(JSON.stringify({
  ok: true,
  typedProfileFastPath: true,
  atGradeTerrainOwnership: true,
  irregularProfileFallback: true
}, null, 2));
