import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryDiscoveryProfileStore} from '../app/js/discovery/profile-store.js';
import {createStarterCompanionInstance, awardCompanionXp} from '../app/js/discovery/companions.js';
import {discoverySaveMessage, persistBackpackProjection} from '../app/js/discovery/save-status.js';
const record = id => ({claimId:`claim:${id}`, catalogId:`rock:${id}`, instanceId:`item:${id}`, activityId:'inspect'});
async function setup() { const store=createMemoryDiscoveryProfileStore(); const pet=createStarterCompanionInstance({profileIdentity:'test'}); await store.saveCompanion(pet);await store.setActiveCompanion(pet.instanceId);return {store,pet}; }
test('field record and companion credit commit together; replay and restore do not reward again',async()=>{
 const {store}=await setup();await store.collect(record(1));const first=(await store.listCompanions())[0];assert.equal(first.progression.totalXp,20);
 await store.collect(record(1));assert.equal((await store.listCompanions())[0].progression.totalXp,20);
 await store.collect({...record(2),receiptRestore:true});assert.equal((await store.listCompanions())[0].progression.totalXp,20);
 await store.recordObservation({...record(3),catalogId:'rock:1'});assert.equal((await store.listCompanions())[0].progression.totalXp,32);
});
test('stale companion presentation save cannot erase field credit; XP updaters read latest state',async()=>{
 const {store,pet}=await setup();await store.collect(record(1));await store.saveCompanion({...pet,name:'Renamed'});
 const current=await store.saveCompanion(pet,latest=>awardCompanionXp(latest,{receiptId:'travel:1',reasonId:'qualified-travel'}).companion);
 assert.equal(current.progression.totalXp,30);assert.equal(current.name,'Renamed');
 await assert.rejects(store.saveCompanion(pet,()=>({...pet,instanceId:'other'})),/identity/);
});
test('receipt status distinguishes due and delayed pending, blocked, acknowledged and guest items',async()=>{
 const store=createMemoryDiscoveryProfileStore({getReceiptOwnerUid:()=> 'a'});await store.collect(record(1));await store.collect(record(2));
 const [one,two]=await store.listPendingReceipts('a');await store.deferPendingReceipt(one.id,{status:'blocked'});await store.deferPendingReceipt(two.id,{nextAttemptAt:Date.now()+600000});
 assert.deepEqual(await store.getReceiptSyncStatus('a'),{pending:1,blocked:1,acknowledged:0,deviceOnly:0});
 assert.deepEqual(await store.getReceiptSyncStatus('b'),{pending:0,blocked:0,acknowledged:0,deviceOnly:0});
 await store.completePendingReceipt(two.id,{ownerUid:'a',claimId:'claim:2',catalogId:'rock:2',itemId:'server-2',authority:'server-receipt'});
 assert.equal((await store.getReceiptSyncStatus('a')).acknowledged,1);
 const guest=createMemoryDiscoveryProfileStore();await guest.collect(record(3));assert.equal((await guest.getReceiptSyncStatus()).deviceOnly,1);
});
test('save wording does not promise full cloud backup or durable memory persistence',()=>{
 assert.match(discoverySaveMessage({durable:false}),/Session only/);
 const text=discoverySaveMessage({durable:true,signedIn:true,receipts:{pending:2,blocked:1,acknowledged:3},online:false,backpackSaved:false});
 for(const part of ['2 waiting','reconnect','1 could not','3 collected-item','Backpack copy could not','not backed up'])assert.ok(text.includes(part));
});
test('failed Backpack writes retain explicit pending state and a later retry clears it',()=>{
 const ctx={playerBackpackInventory:{exportState:()=>({items:[record(1)]})},playerBackpackStore:{save:()=>false}};
 assert.equal(persistBackpackProjection(ctx),false);assert.equal(ctx.discoveryBackpackSaved,false);
 ctx.playerBackpackStore.save=()=>{throw Error('QuotaExceededError')};assert.equal(persistBackpackProjection(ctx),false);
 ctx.playerBackpackStore.save=()=>true;assert.equal(persistBackpackProjection(ctx),true);assert.equal(ctx.discoveryBackpackSaved,true);
});

test('damaged, duplicate and future backups leave existing records unchanged',async()=>{
 const {store}=await setup();await store.collect(record(1));const original=await store.exportData();
 for(const bad of [{...original,schemaVersion:99},{...original,items:[{}]},{...original,events:[...original.events,...original.events]},{...original,companions:'corrupt'}]) {
   await assert.rejects(store.importData(bad),/damaged/);assert.deepEqual(await store.exportData(),original);
 }
});
test('restore retains one undo snapshot and restores pending receipt ownership with original records',async()=>{
 const store=createMemoryDiscoveryProfileStore({getReceiptOwnerUid:()=> 'a'});await store.collect(record(1));const original=await store.exportData();
 const other=createMemoryDiscoveryProfileStore();await other.collect(record(2));await store.importData(await other.exportData());
 assert.equal((await store.listPendingReceipts('a')).length,0);
 assert.equal(await store.rollbackLastImport(),true);assert.deepEqual(await store.exportData(),original);assert.equal((await store.listPendingReceipts('a')).length,1);assert.equal(await store.rollbackLastImport(),false);
});
test('full Backpack reconciliation removes replaced Journal items while keeping unrelated equipment',async()=>{
 const {createBackpackModel}=await import('../app/js/player/backpack-model.js');
 const {projectDiscoveryItemsToBackpack}=await import('../app/js/discovery/backpack-projection.js');
 const ctx={playerBackpackInventory:createBackpackModel({items:[{instanceId:'tool',catalogId:'camera',quantity:1}]}),playerBackpackStore:{save:()=>true}};
 projectDiscoveryItemsToBackpack(ctx,[record(1)]);projectDiscoveryItemsToBackpack(ctx,[record(2)]);
 assert.equal(ctx.playerBackpackInventory.snapshot().items.length,3);
 projectDiscoveryItemsToBackpack(ctx,[record(2)],{reconcile:true});assert.equal(ctx.playerBackpackInventory.snapshot().items.length,2);assert.equal(ctx.playerBackpackInventory.has('tool'),true);assert.equal(ctx.playerBackpackInventory.has('item:1'),false);
});
