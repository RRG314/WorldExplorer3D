import test from 'node:test';import assert from 'node:assert/strict';
import {initialNeeds,advanceNeeds} from '../../app/js/experiments/embodied-society/needs.mjs';
import {createWorkshopState,createWorkshopService} from '../../app/js/experiments/embodied-society/workshop.mjs';
test('need progression is step-size consistent including onset of deprivation',()=>{
 const start={needs:initialNeeds(),condition:1};const once=advanceNeeds(start,20000);
 let stepped=start;for(let t=100;t<=20000;t+=100)stepped=advanceNeeds(stepped,t);
 for(const key of ['water','food','rest'])assert.ok(Math.abs(once.needs[key]-stepped.needs[key])<1e-9);
 assert.ok(Math.abs(once.condition-stepped.condition)<1e-9);
});
test('drinking consumes one existing game item and improves water need exactly once',async()=>{
 const initialState=createWorkshopState({runId:'needs',actorIds:['a','b'],nodes:[{id:'supplies',materialId:'trail-water',remaining:1}]});
 const service=createWorkshopService({initialState,authorize:async()=>({allowed:true,inReach:true,targetId:'supplies'}),persist:async()=>{}});
 await service.execute('a',{kind:'gather',targetId:'supplies',quantity:1,operationId:'gather',expectedRevision:0},7200);
 const before=service.snapshot();const drink={kind:'consume',materialId:'trail-water',operationId:'drink',expectedRevision:1};
 await service.execute('a',drink,7200);await service.execute('a',drink,7200);
 const after=service.snapshot();assert.equal(before.actors.a.needs.water,.5);assert.equal(after.actors.a.needs.water,.9);assert.equal(after.actors.b.needs.water,.5);
 assert.equal(service.inspectInventory('a').items.length,0);
 await assert.rejects(service.execute('a',{...drink,operationId:'empty',expectedRevision:2},7200),e=>e.code==='insufficient-material');
});
test('rest cannot be granted by an item name or an unverified shelter claim',async()=>{
 const service=createWorkshopService({initialState:createWorkshopState({runId:'rest',actorIds:['a']}),authorize:async()=>({allowed:true,inReach:true,sheltered:false}),persist:async()=>{}});
 await assert.rejects(service.execute('a',{kind:'rest',seconds:60,operationId:'rest',expectedRevision:0},0),e=>e.code==='verified-shelter-required');
});
test('idle residents lose reserves on supervisor time and clock persistence failure is atomic',async()=>{
 let fail=false;
 const service=createWorkshopService({initialState:createWorkshopState({runId:'clock',actorIds:['a','b']}),authorize:async()=>({allowed:true}),persist:async()=>{if(fail)throw Error('disk full');}});
 await service.advanceTo(7200);assert.equal(service.snapshot().actors.b.needs.water,.5);
 const before=service.snapshot();fail=true;await assert.rejects(service.advanceTo(8000),/disk full/);assert.deepEqual(service.snapshot(),before);
 await assert.rejects(service.advanceTo(1),e=>e.code==='clock-rewind');
});
test('rest recovery is bounded by reserved duration even from exhausted reserves',async()=>{
 const initialState=createWorkshopState({runId:'rest',actorIds:['a']});initialState.actors.a.needs.rest=0;
 const service=createWorkshopService({initialState,authorize:async()=>({allowed:true,inReach:true,sheltered:true,restContinuousSince:0}),persist:async()=>{}});
 await service.execute('a',{kind:'rest',seconds:3600,operationId:'rest',expectedRevision:0},0);
 await service.advanceTo(3600);
 const cmd={kind:'finish',operationId:'done',expectedRevision:2};
 await service.execute('a',cmd,7200);assert.equal(service.snapshot().actors.a.needs.rest,.375);
 await service.execute('a',cmd,7201);assert.equal(service.snapshot().actors.a.needs.rest,.375);
});
test('interrupted work can be cancelled without free output or lost escrow',async()=>{
 const service=createWorkshopService({initialState:createWorkshopState({runId:'cancel',actorIds:['a'],nodes:[{id:'fiber',materialId:'research:fiber',remaining:2}]}),authorize:async()=>({allowed:true,inReach:true,targetId:'fiber'}),persist:async()=>{}});
 for(let i=0;i<2;i++)await service.execute('a',{kind:'gather',targetId:'fiber',quantity:1,operationId:`get${i}`,expectedRevision:i},i);
 await service.execute('a',{kind:'craft',recipeId:'twist-cord',operationId:'craft',expectedRevision:2},2);
 await service.execute('a',{kind:'cancel',operationId:'cancel',expectedRevision:3},3);
 assert.equal(service.snapshot().actors.a.job,null);assert.equal(service.inspectInventory('a').items[0].quantity,2);
 await assert.rejects(service.execute('a',{kind:'finish',operationId:'finish',expectedRevision:4},10),e=>e.code==='work-not-complete');
});
