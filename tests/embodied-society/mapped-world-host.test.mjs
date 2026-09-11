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
