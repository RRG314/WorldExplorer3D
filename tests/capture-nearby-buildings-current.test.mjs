import test from 'node:test';
import assert from 'node:assert/strict';
import {buildingCenter,nearestCaptureBuildingIds} from '../app/js/reality-capture/nearby-buildings.js';

const oracle=(buildings,actor,limit=60)=>[...new Set(buildings.filter(b=>b.sourceBuildingId)
  .map(b=>({id:String(b.sourceBuildingId),center:buildingCenter(b)}))
  .sort((a,b)=>Math.hypot(a.center.x-actor.x,a.center.z-actor.z)-Math.hypot(b.center.x-actor.x,b.center.z-actor.z))
  .map(b=>b.id))].slice(0,limit);

test('bounded capture selection matches full-sort identity and order across dense moving-world inputs',()=>{
  const buildings=Array.from({length:23000},(_,i)=>({sourceBuildingId:'b'+(i%17000),centerX:(i*7919)%13001-6500,centerZ:(i*3571)%11003-5500}));
  for(const actor of [{x:0,z:0},{x:-4000,z:2300},{x:10000,z:-23000}]){
    assert.deepEqual(nearestCaptureBuildingIds(buildings,actor),oracle(buildings,actor));
  }
});
test('ties, closer duplicate IDs, missing IDs and footprint centers preserve existing selection',()=>{
  const buildings=[{sourceBuildingId:'a',centerX:10,centerZ:0},{sourceBuildingId:'b',centerX:-10,centerZ:0},
    {sourceBuildingId:'c',pts:[{x:1,z:0},{x:3,z:0}]},{sourceBuildingId:'a',centerX:1,centerZ:0},
    {sourceBuildingId:'d',minX:3,maxX:5,minZ:0,maxZ:0},{centerX:0,centerZ:0}];
  for(const limit of [0,1,2,3,60])assert.deepEqual(nearestCaptureBuildingIds(buildings,{x:0,z:0},limit),oracle(buildings,{x:0,z:0},limit));
  assert.deepEqual(nearestCaptureBuildingIds([],{x:0,z:0}),[]);
});
