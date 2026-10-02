import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryDiscoveryProfileStore} from '../app/js/discovery/profile-store.js';
import {createDiscoveryReceiptSync} from '../app/js/discovery/receipt-outbox.js';
const record={instanceId:'item:1',claimId:'claim:1',catalogId:'rock',worldIdentity:'test',activityId:'inspect',evidenceClass:'virtual-field-record'};
const receipt={...record,itemId:'server:1',ownerUid:'a',authority:'server-receipt',tradeable:false};
test('signed-in collection retains a retry and an ambiguous success retries without local rewards',async()=>{
 let owner='a',now=1000,calls=0;
 const store=createMemoryDiscoveryProfileStore({getReceiptOwnerUid:()=>owner});
 await store.collect(record);const before=await store.getProfile();
 const sync=createDiscoveryReceiptSync({store,getOwnerUid:()=>owner,now:()=>now,send:async()=>{calls++;if(calls===1)throw new Error('response lost after server commit');return receipt}});
 assert.equal((await store.listPendingReceipts('a',now)).length,1);
 assert.equal(await sync.flush(),0);assert.equal(await sync.flush(),0);assert.equal(calls,1);
 now+=30000;assert.equal(await sync.flush(),1);assert.equal((await store.listPendingReceipts('a',now)).length,0);
 assert.equal((await store.getProfile()).explorerProgress.points,before.explorerProgress.points);
 assert.equal((await store.listItems())[0].serverItemId,'server:1');
});
test('guest collections do not become pending uploads on later sign-in',async()=>{
 let owner=null;const store=createMemoryDiscoveryProfileStore({getReceiptOwnerUid:()=>owner});await store.collect(record);owner='a';
 assert.equal((await store.listPendingReceipts(owner)).length,0);
 await store.collect({...record,instanceId:'item:2',claimId:'claim:2',receiptRestore:true});assert.equal((await store.listPendingReceipts(owner)).length,0);
});
test('account changes keep the original queue entry and do not apply a late receipt',async()=>{
 let owner='a';const store=createMemoryDiscoveryProfileStore({getReceiptOwnerUid:()=>owner});await store.collect(record);
 const sync=createDiscoveryReceiptSync({store,getOwnerUid:()=>owner,send:async()=>{owner='b';return receipt}});
 assert.equal(await sync.flush(),0);assert.equal((await store.listPendingReceipts('a')).length,1);assert.equal((await store.listPendingReceipts('b')).length,0);
 assert.equal((await store.listItems())[0].authority,'anonymous-local');
});
test('concurrent flushes coalesce and disposed owners cannot publish',async()=>{
 const store=createMemoryDiscoveryProfileStore({getReceiptOwnerUid:()=> 'a'});await store.collect(record);let release,calls=0;
 const sync=createDiscoveryReceiptSync({store,getOwnerUid:()=> 'a',send:()=>{calls++;return new Promise(r=>release=r)}});
 const first=sync.flush();const second=sync.flush();assert.equal(first,second);await new Promise(r=>setImmediate(r));sync.dispose();release(receipt);
 assert.equal(await first,0);assert.equal(calls,1);assert.equal((await store.listPendingReceipts('a')).length,1);
});
test('mismatched responses remain blocked without elevating local authority',async()=>{
 const store=createMemoryDiscoveryProfileStore({getReceiptOwnerUid:()=> 'a'});await store.collect(record);
 const sync=createDiscoveryReceiptSync({store,getOwnerUid:()=> 'a',send:async()=>({...receipt,catalogId:'other'})});await sync.flush();
 assert.equal((await store.listPendingReceipts('a',Infinity)).length,0);assert.equal((await store.listItems())[0].authority,'anonymous-local');
});
