import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkshopState, createWorkshopService, inventoryMassGrams } from '../../app/js/experiments/embodied-society/workshop.mjs';
import { validateMaterialRules } from '../../app/js/experiments/embodied-society/material-rules.mjs';
const nodes=[{id:'fibers',materialId:'research:fiber',remaining:8},{id:'branches',materialId:'research:branch',remaining:5},{id:'stones',materialId:'research:stone',remaining:5},{id:'timber',materialId:'research:timber',remaining:20,requiredTool:'research:stone-axe'}];
function fixture(options={}) {
 const service=createWorkshopService({initialState:createWorkshopState({runId:'unit-test',actorIds:['alice','bob'],nodes}),authorize:async({command})=>({allowed:true,inReach:true,targetId:command.targetId,stationCapabilities:['woodworking'],recipientId:command.recipientId,recipientConsented:true}),persist:async()=>{},...options});
 let serial=0,tick=0;
 const run=(command,actor='alice')=>service.execute(actor,{operationId:`op-${++serial}`,expectedRevision:service.snapshot().revision,...command},tick++);
 return {service,run,setTick:value=>tick=value};
}
async function axe(f) {
 for(const targetId of ['fibers','fibers','branches','stones'])await f.run({kind:'gather',targetId,quantity:1});
 let job=await f.run({kind:'craft',recipeId:'twist-cord'});f.setTick(job.readyAt);await f.run({kind:'finish'});
 job=await f.run({kind:'craft',recipeId:'lash-stone-axe'});f.setTick(job.readyAt);await f.run({kind:'finish'});
}
test('experimental recipes account for all input mass',()=>assert.equal(validateMaterialRules(),true));
test('gather -> make cord -> make axe -> harvest timber -> split planks uses the real Backpack model',async()=>{
 const f=fixture();await axe(f);await f.run({kind:'gather',targetId:'timber',quantity:1});
 const job=await f.run({kind:'craft',recipeId:'split-timber'});f.setTick(job.readyAt);await f.run({kind:'finish'});
 const items=f.service.inspectInventory('alice').items;
 assert.equal(items.find(i=>i.catalogId==='research:plank').quantity,2);
 assert.equal(items.find(i=>i.catalogId==='research:stone-axe').condition,0.9);
 assert.equal(inventoryMassGrams(f.service.snapshot().actors.alice.backpack),2200);
 assert.equal(f.service.inspectInventory('bob').items.length,0);
});
test('work cannot finish early and consumed inputs remain in escrow across snapshot/reload',async()=>{
 const f=fixture();await f.run({kind:'gather',targetId:'fibers',quantity:1});await f.run({kind:'gather',targetId:'fibers',quantity:1});
 const job=await f.run({kind:'craft',recipeId:'twist-cord'});await assert.rejects(f.run({kind:'finish'}),e=>e.code==='work-not-complete');
 const restored=fixture({initialState:f.service.snapshot()});restored.setTick(job.readyAt);await restored.run({kind:'finish',operationId:'restored-finish'});
 assert.equal(inventoryMassGrams(restored.service.snapshot().actors.alice.backpack),200);
});
test('resource exhaustion, tool requirements, and absent station are enforced',async()=>{
 const f=fixture();await assert.rejects(f.run({kind:'gather',targetId:'timber',quantity:1}),e=>e.code==='tool-required');
 await assert.rejects(f.run({kind:'gather',targetId:'fibers',quantity:99}),e=>e.code==='resource-unavailable');
 await axe(f);
 const other=fixture({initialState:f.service.snapshot(),authorize:async()=>({allowed:true,inReach:false})});other.setTick(100);
 await assert.rejects(other.run({kind:'craft',recipeId:'assemble-storage',operationId:'station-test'}),e=>e.code==='station-required');
});
test('lost acknowledgement retry cannot harvest twice or reuse ID for another mutation',async()=>{
 const f=fixture();const cmd={operationId:'stable',expectedRevision:0,kind:'gather',targetId:'fibers',quantity:1};
 const first=await f.service.execute('alice',cmd,0),retry=await f.service.execute('alice',cmd,1);assert.deepEqual(first,retry);
 assert.equal(f.service.snapshot().nodes.fibers.remaining,7);
 await assert.rejects(f.service.execute('alice',{...cmd,targetId:'stones'},1),e=>e.code==='operation-conflict');
});
test('failed persistence publishes no partial inventory, resource or receipt changes',async()=>{
 const f=fixture({persist:async()=>{throw Error('disk unavailable');}}),before=f.service.snapshot();
 await assert.rejects(f.run({kind:'gather',targetId:'fibers',quantity:1}),/disk unavailable/);assert.deepEqual(f.service.snapshot(),before);
});
test('simultaneous stale-revision commands cannot double spend',async()=>{
 const f=fixture();const results=await Promise.allSettled(['one','two'].map(operationId=>f.service.execute('alice',{operationId,expectedRevision:0,kind:'gather',targetId:'fibers',quantity:1},0)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.service.snapshot().nodes.fibers.remaining,7);
});
test('explicit consent is required and resource transfer conserves total mass',async()=>{
 const f=fixture();await f.run({kind:'gather',targetId:'fibers',quantity:1});await f.run({kind:'transfer',recipientId:'bob',materialId:'research:fiber',quantity:1});
 const actors=f.service.snapshot().actors;assert.equal(inventoryMassGrams(actors.alice.backpack),0);assert.equal(inventoryMassGrams(actors.bob.backpack),100);
 const denied=fixture({initialState:f.service.snapshot(),authorize:async()=>({allowed:true,inReach:true,recipientId:'alice',recipientConsented:false})});denied.setTick(100);
 await assert.rejects(denied.run({kind:'transfer',recipientId:'alice',materialId:'research:fiber',quantity:1},'bob'),e=>e.code==='transfer-not-authorized');
});
test('no world authority, out-of-reach access, actor spoof or capacity bypass',async()=>{
 assert.throws(()=>createWorkshopService({}),e=>e.code==='missing-world-authority');
 const denied=fixture({authorize:async()=>({allowed:false})});await assert.rejects(denied.run({kind:'gather',targetId:'fibers',quantity:1}),e=>e.code==='world-permission-denied');
 const f=fixture({maxMassGrams:50});await assert.rejects(f.run({kind:'gather',targetId:'fibers',quantity:1}),e=>e.code==='carrying-capacity');assert.equal(f.service.snapshot().revision,0);
 await assert.rejects(f.run({kind:'gather',targetId:'fibers',quantity:1,actorId:'bob'}),e=>e.code==='actor-spoof');
});
async function craft(f,recipeId){const job=await f.run({kind:'craft',recipeId});f.setTick(job.readyAt);await f.run({kind:'finish'});}
async function planks(f,batches){for(let n=0;n<batches;n++){await f.run({kind:'gather',targetId:'timber',quantity:1});await craft(f,'split-timber');}}
test('make tools -> planks -> workbench -> storage; ownership and stored contents survive reload',async()=>{
 let f;
 f=fixture({authorize:async({command})=>({allowed:true,inReach:true,targetId:command.targetId,
   stationCapabilities:f.service.snapshot().structures && Object.values(f.service.snapshot().structures).some(s=>s.kind==='workbench')?['woodworking']:[],
   placementAllowed:true,placement:{gx:command.targetId==='bench-site'?0:1,gy:0,gz:0}})});
 await axe(f);await planks(f,4);await craft(f,'assemble-workbench');
 const built=await f.run({kind:'build',materialId:'research:workbench-kit',targetId:'bench-site'});
 assert.equal(f.service.snapshot().structures[built.structureId].block.shape,'slab');
 await planks(f,3);await craft(f,'assemble-storage');
 const chest=await f.run({kind:'build',materialId:'research:storage-kit',targetId:'chest-site'});
 await f.run({kind:'gather',targetId:'stones',quantity:1});
 await f.run({kind:'store',targetId:chest.structureId,materialId:'research:stone',quantity:1});
 assert.equal(f.service.inspectInventory('alice').items.some(i=>i.catalogId==='research:stone'),false);
 const restored=fixture({initialState:f.service.snapshot()});restored.setTick(1000);
 await assert.rejects(restored.run({kind:'retrieve',operationId:'bob-denied',targetId:chest.structureId,materialId:'research:stone',quantity:1},'bob'),e=>e.code==='storage-not-authorized');
 await restored.run({kind:'retrieve',operationId:'owner-retrieve',targetId:chest.structureId,materialId:'research:stone',quantity:1});
 assert.equal(restored.service.inspectInventory('alice').items.find(i=>i.catalogId==='research:stone').quantity,1);
});
test('worn tool transfer retains condition and unique instance identity',async()=>{
 const f=fixture();await axe(f);await f.run({kind:'gather',targetId:'timber',quantity:1});
 const before=f.service.inspectInventory('alice').items.find(i=>i.catalogId==='research:stone-axe');
 await f.run({kind:'transfer',recipientId:'bob',materialId:'research:stone-axe',quantity:1});
 const after=f.service.inspectInventory('bob').items.find(i=>i.catalogId==='research:stone-axe');
 assert.equal(after.condition,before.condition);assert.equal(after.instanceId,before.instanceId);
 assert.equal(f.service.inspectInventory('alice').items.some(i=>i.catalogId==='research:stone-axe'),false);
});

test('receiving materials cannot hide carrying weight inside an unfinished craft job',async()=>{
 const f=fixture({maxMassGrams:200});
 await f.run({kind:'gather',targetId:'fibers',quantity:1},'bob');
 await f.run({kind:'gather',targetId:'fibers',quantity:1},'bob');
 await f.run({kind:'craft',recipeId:'twist-cord'},'bob');
 await f.run({kind:'gather',targetId:'fibers',quantity:1});
 const before=f.service.snapshot();
 await assert.rejects(f.run({kind:'transfer',recipientId:'bob',materialId:'research:fiber',quantity:1}),e=>e.code==='recipient-capacity');
 assert.deepEqual(f.service.snapshot(),before);
});
