import test from 'node:test';
import assert from 'node:assert/strict';
import {buildingSeedFromIdentity,inferFallbackBuildingHeightMeters} from '../app/js/building-semantics.js';

test('canonical Earth building massing cannot vary with session or game mode seed',()=>{
 const id='overture:ba77061a-6e09-416a-aaf8-3057532ee880';
 const seeds=[0,1,1234567,0xffffffff].map(worldSeed=>buildingSeedFromIdentity(id,worldSeed));
 assert.equal(new Set(seeds).size,1);
 const heights=seeds.map(seed=>inferFallbackBuildingHeightMeters('yes',380,31,12,seed));
 assert.equal(new Set(heights).size,1);
 assert.notEqual(buildingSeedFromIdentity(id),buildingSeedFromIdentity('overture:another-building'));
});
