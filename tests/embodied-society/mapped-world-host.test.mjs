import test from 'node:test';import assert from 'node:assert/strict';
import {createMappedWorldHost} from '../../app/js/experiments/embodied-society/mapped-world-host.mjs';
import {createWorkshopState} from '../../app/js/experiments/embodied-society/workshop.mjs';
const publication=Object.freeze({type:'WorldSnapshot',id:'published-test'});
function options(sample) {
 return {THREE:{},appCtx:{worldPublication:publication,METERS_PER_WORLD_UNIT:1.11,scene:{add(){},remove(){}},SurfaceQuery:{walkAt:()=>sample},checkBuildingCollision:()=>({collision:false})},
 manifest:{environment:'isolated-research',runId:'test',worldSnapshotId:publication.id,spawn:{x:0,y:1.7,z:0,yaw:0},radiusMeters:40},initialState:createWorkshopState({runId:'test',actorIds:['a']}),persistWorkshop:async()=>{}};
}
test('host requires an immutable matching mapped publication and isolated single-resident manifest',()=>{
 assert.throws(()=>createMappedWorldHost({}),/isolated/);
 const input=options(null);input.manifest.worldSnapshotId='other';assert.throws(()=>createMappedWorldHost(input),/isolated/);
 input.manifest.worldSnapshotId=publication.id;input.appCtx.worldPublication={...publication};assert.throws(()=>createMappedWorldHost(input),/isolated/);
});
test('absent, fallback, water, interior and unaccepted terrain cannot become resident ground',()=>{
 for(const sample of [null,{position:{x:0,y:0,z:0},kind:'water',traversal:{walk:true}},{position:{x:0,y:0,z:0},kind:'interior',traversal:{walk:true}},{position:{x:0,y:0,z:0},kind:'terrain',traversal:{walk:true},provenance:{source:'accepted_ground_unavailable',fallback:false}},{position:{x:0,y:0,z:0},kind:'road',traversal:{walk:true},provenance:{fallback:true}}])assert.throws(()=>createMappedWorldHost(options(sample)),/accepted outdoor/);
});
test('a geometrically mismatched spawn is rejected before a resident mesh is created',()=>{
 const input=options({position:{x:0,y:20,z:0},kind:'road',traversal:{walk:true},provenance:{fallback:false}});
 assert.throws(()=>createMappedWorldHost(input),/Spawn does not match/);
});

test('resource observations report the same full three-dimensional reach used by authority',async()=>{
 const {resourceReachObservation}=await import('../../app/js/experiments/embodied-society/mapped-world-host.mjs');
 const from={x:0,y:1.7,z:0};
 assert.equal(resourceReachObservation(from,{x:0,y:0,z:2.7},1.11).withinReach,false);
 assert.equal(resourceReachObservation(from,{x:0,y:0,z:1},1.11).withinReach,true);
 assert.ok(resourceReachObservation(from,{x:0,y:0,z:2.7},1.11).distanceMeters>3);
});

test('resource bearing predicts a turn then movement using the real motor, including wrapped headings',async()=>{
 const {targetDirectionObservation}=await import('../../app/js/experiments/embodied-society/mapped-world-host.mjs');
 const {createResidentMotor}=await import('../../app/js/experiments/embodied-society/resident-body.mjs');
 for(const yaw of [0,2.9,-2.9,130])for(const target of [{x:5,y:0,z:1},{x:-5,y:0,z:-1}]){
  const a=createResidentMotor({actorId:'a',spawn:{x:0,y:1.7,z:0,yaw},world:{walkSurfaceAt:()=>({position:{y:0}}),checkBuildingCollision:()=>({collision:false})}});
  const initial=a.observation(),d=targetDirectionObservation(initial.position,target,initial.yaw,1.11);
  const seconds=2,axis=d.relativeBearingRadians/(initial.controls.turnRadiansPerSecond*seconds);
  a.command({turn:axis,frames:seconds*60});for(let i=0;i<seconds*60;i++)a.step();
  a.command({move:1,frames:60});for(let i=0;i<60;i++)a.step();
  const after=a.observation();assert.ok(Math.hypot(target.x-after.position.x,target.z-after.position.z)<Math.hypot(target.x,target.z));
 }
 const left=targetDirectionObservation({x:0,y:0,z:0},{x:-2,y:5,z:0},0,1.11);assert.equal(left.leftMeters,2.22);assert.equal(left.forwardMeters,0);assert.equal(left.relativeBearingRadians,-Math.PI/2);
 assert.equal(targetDirectionObservation({x:0,y:0,z:0},{x:0,y:5,z:0},0,1).relativeBearingRadians,null);
});
