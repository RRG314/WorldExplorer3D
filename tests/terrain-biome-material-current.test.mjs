import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyTerrainSurfaceProfile} from '../app/js/surface-rules.js';
import {terrainSurfaceMixForProfile, terrainSurfaceClassForWorldCover, terrainSurfaceMixForClass} from '../app/js/terrain/surface-material-blend.js';

test('flat polar fallback is snow; alpine mixed material retains snow', () => {
  for (const latitude of [-83.1664, -70, 80]) {
    const profile = classifyTerrainSurfaceProfile({bounds:{latS:latitude-.01,latN:latitude+.01,lonW:0,lonE:.01},minElevationMeters:0,maxElevationMeters:5});
    assert.equal(profile.mode,'snow');
    assert.deepEqual(terrainSurfaceMixForProfile(profile.mode).mixB,[0,1]);
  }
  assert.deepEqual(terrainSurfaceMixForProfile('snowRock').mixB,[.35,.65]);
});

test('every mapped land-cover family has finite normalized material weights', () => {
  for (const name of ['built','tree','mangrove','crop','bare','snow','moss','wetland','grass','shrub']) {
    const mix=terrainSurfaceMixForClass(terrainSurfaceClassForWorldCover(name,39));
    const values=[...mix.mixA,...mix.mixB];
    assert.ok(values.every(v=>Number.isFinite(v)&&v>=0&&v<=1),name);
    assert.ok(values.reduce((a,b)=>a+b,0)<=1.00001,name);
  }
  assert.deepEqual(terrainSurfaceMixForProfile('sand').mixA,[0,1,0,0]);
  assert.deepEqual(terrainSurfaceMixForProfile('forest').mixA,[0,0,1,0]);
  assert.deepEqual(terrainSurfaceMixForProfile('rock').mixB,[1,0]);
  assert.notEqual(terrainSurfaceClassForWorldCover('moss'),terrainSurfaceClassForWorldCover('snow'));
});
