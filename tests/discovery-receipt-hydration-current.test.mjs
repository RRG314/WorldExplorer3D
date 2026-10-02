import test from 'node:test';
import assert from 'node:assert/strict';
import {hydrateDiscoveryReceipts} from '../app/js/discovery/receipt-hydration.js';
import {createMemoryDiscoveryProfileStore} from '../app/js/discovery/profile-store.js';
const item=i=>({claimId:`claim:${i}`,catalogId:`rock:${i}`,itemId:`item-${i}`,ownerUid:'a',authority:'server-receipt',recordKind:'collection',worldIdentity:'test'});
test('501 account receipts restore across pages and retries do not reward twice',async()=>{
 const store=createMemoryDiscoveryProfileStore();let calls=0;
 const listPage=async({cursor,expectedOwnerUid})=>{calls++;assert.equal(expectedOwnerUid,'a');const start=Number(cursor)||0;return {ownerUid:'a',items:Array.from({length:Math.min(250,501-start)},(_,i)=>item(start+i)),nextCursor:start+250<501?String(start+250):null}};
 const options={ownerUid:'a',isCurrentOwner:()=>true,listPage,profileStore:store};
 assert.deepEqual(await hydrateDiscoveryReceipts(options),{imported:501,complete:true});
 const before=await store.getProfile();assert.deepEqual(await hydrateDiscoveryReceipts(options),{imported:0,complete:true});
 assert.equal(calls,6);assert.equal((await store.getProfile()).explorerProgress.points,before.explorerProgress.points);
 assert.equal((await store.listItems(1000)).length,501);
});
test('account change while waiting for a page prevents its import',async()=>{
 const store=createMemoryDiscoveryProfileStore();let current=true;
 const result=await hydrateDiscoveryReceipts({ownerUid:'a',isCurrentOwner:()=>current,profileStore:store,listPage:async()=>{current=false;return {ownerUid:'a',items:[item(1)]}}});
 assert.equal(result.reason,'account-changed');assert.equal((await store.listItems()).length,0);
});
test('wrong account response and repeated cursor fail without an infinite retry',async()=>{
 const store=createMemoryDiscoveryProfileStore();const options={ownerUid:'a',isCurrentOwner:()=>true,profileStore:store};
 await assert.rejects(hydrateDiscoveryReceipts({...options,listPage:async()=>({ownerUid:'b',items:[item(1)]})}),/account/);
 let calls=0;await assert.rejects(hydrateDiscoveryReceipts({...options,listPage:async()=>{calls++;return {ownerUid:'a',items:[],nextCursor:'same'}}}),/advance/);assert.equal(calls,2);
});
test('receipts cannot elevate a different local claim or catalog',async()=>{
 const store=createMemoryDiscoveryProfileStore();await store.collect({...item(1),instanceId:'local'});
 await assert.rejects(store.applyTrustedReceipt('local',{...item(2),authority:'trusted-server',tradeable:true}),/does not match/);
 assert.equal((await store.listItems())[0].authority,'anonymous-local');
});
test('legacy receipts restore as observations instead of inventing physical collection items',async()=>{
 const store=createMemoryDiscoveryProfileStore();await hydrateDiscoveryReceipts({ownerUid:'a',isCurrentOwner:()=>true,profileStore:store,listPage:async()=>({ownerUid:'a',items:[{...item(1),recordKind:'unknown'}]})});
 assert.equal((await store.listItems()).length,0);assert.equal((await store.listEvents()).length,1);
});
