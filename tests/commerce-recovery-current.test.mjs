import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createEquipmentInventory } from '../app/js/urban-sandbox/equipment-model.js';
import { createLocalBackpackStore } from '../app/js/player/backpack-store.js';
import { createLocalCommerceModel, mappedCommercePlaces } from '../app/js/urban-sandbox/commerce-model.js';
const {settleCommerceTransaction,settleCommerceOutcome}=createRequire(import.meta.url)('../functions/economy-authority.js');
const now=()=>Date.parse('2026-10-13T15:00:00Z');
const store=mappedCommercePlaces([{type:'shop=convenience',sourceFeatureId:'node:20',sourceElementType:'node',sourceElementId:'20',name:'Corner store',x:0,z:0,tags:{shop:'convenience'}}])[0];
const clinic=mappedCommercePlaces([{type:'amenity=veterinary',sourceFeatureId:'node:21',sourceElementType:'node',sourceElementId:'21',name:'Veterinary clinic',x:0,z:0,tags:{amenity:'veterinary'}}])[0];
function fixture(){
 const values=new Map(),cloud=new Map();let drop=false,sequence=0,active=true,denySave=false;
 const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>{if(denySave)throw Error('quota');values.set(k,v);},removeItem:k=>values.delete(k)};
 const ref=key=>({id:key,get:async()=>({exists:cloud.has(key),data:()=>cloud.get(key)})});
 const runTransaction=async callback=>callback({get:r=>r.get(),set:(r,v)=>cloud.set(r.id,v)});
 const base={runTransaction,walletRef:ref('wallet'),timestampFromMs:ms=>ms,nowMs:now(),uid:'account-a'};
 const authority={uid:'account-a',isCurrent:()=>active,snapshot:()=>({credits:cloud.get('wallet')?.credits??1000000}),
  async transact(action,place,catalogId,fields={}){
   const requestId=fields.requestId||`request-${++sequence}`;
   const input={action,storeId:place.id,catalogId,targetId:fields.targetId||'',dayKey:fields.dayKey,requestId};
   const receipt=await settleCommerceTransaction({...base,input,receiptRef:ref(requestId),itemRef:ref(catalogId),stockRef:ref(`${fields.dayKey}:${place.id}:${catalogId}`)});
   if(drop){drop=false;throw Object.assign(Error('reply lost'),{outcomeUnknown:true});}return receipt;
  },
  settle:(receipt,outcome,reason)=>settleCommerceOutcome({...base,receiptRef:ref(receipt.requestId),input:{requestId:receipt.requestId,outcome,reason}})
 };
 let inventory,backpackStore,commerce;
 function reload(){backpackStore=createLocalBackpackStore(storage);inventory=createEquipmentInventory({persistedState:backpackStore.load()});commerce=createLocalCommerceModel({storage,inventory,backpackStore,transactionAuthority:authority,now});return commerce;}
 reload();
 return {storage,cloud,authority,reload,get inventory(){return inventory;},get commerce(){return commerce;},get backpackStore(){return backpackStore;},drop(){drop=true;},switch(){active=false;},deny(value){denySave=value;}};
}
test('lost purchase acknowledgment survives reload, recovers once and does not charge a retry',async()=>{
 const f=fixture(),item=f.commerce.snapshot(store).standard[0];f.drop();
 const lost=await f.commerce.buy(store,item.id);
 assert.equal(lost.reason,'commerce_recovery_required');
 assert.equal(f.cloud.get('wallet').credits,1000000-item.buyPrice);
 f.reload();assert.deepEqual(await f.commerce.recoverPending(),{recovered:1,remaining:0});
 assert.equal(f.inventory.snapshot().items.find(i=>i.catalogId===item.id)?.quantity,1);
 assert.equal(f.cloud.get('wallet').credits,1000000-item.buyPrice);
 assert.deepEqual(await f.commerce.recoverPending(),{recovered:0,remaining:0});
 assert.equal((await f.commerce.buy(store,item.id)).ok,true);
 assert.equal(f.cloud.get('wallet').credits,1000000-2*item.buyPrice);
});
test('durable journal failure prevents any wallet dispatch',async()=>{
 const f=fixture(),item=f.commerce.snapshot(store).standard[0];f.deny(true);
 const result=await f.commerce.buy(store,item.id);
 assert.equal(result.ok,false);assert.equal(f.cloud.size,0);
});
test('lost service acknowledgment recovers only for the original target',async()=>{
 const f=fixture();f.drop();await f.commerce.service(clinic,'companion-wellness',()=>true,{targetId:'companion-a'});
 f.reload();let seen;
 const wrong=await f.commerce.recoverPending((_service,_id,recovery)=>{seen=recovery;return null;});
 assert.equal(wrong.remaining,1);assert.equal(seen.targetId,'companion-a');assert.equal(seen.recovery,true);
 const right=await f.commerce.recoverPending(()=>true);assert.equal(right.recovered,1);
 assert.equal(f.cloud.get('wallet').credits,999820);
});
test('account change prevents old-account recovery from altering possessions',async()=>{
 const f=fixture(),item=f.commerce.snapshot(store).standard[0];f.drop();await f.commerce.buy(store,item.id);
 f.switch();const result=await f.commerce.recoverPending();
 assert.equal(result.remaining,1);assert.equal(f.inventory.snapshot().items.some(i=>i.catalogId===item.id),false);
});

test('a lost sale reply removes the sold item once after reload',async()=>{
 const f=fixture(),item=f.commerce.snapshot(store).standard[0];await f.commerce.buy(store,item.id);
 const owned=f.inventory.snapshot().items.find(i=>i.catalogId===item.id);f.drop();
 assert.equal((await f.commerce.sell(store,owned.instanceId)).reason,'commerce_recovery_required');
 f.reload();assert.equal((await f.commerce.recoverPending()).recovered,1);
 assert.equal(f.inventory.snapshot().items.some(i=>i.catalogId===item.id),false);
 assert.equal(f.cloud.get('wallet').credits,1000000-item.buyPrice+item.sellPrice);
});
test('delivery and its marker survive journal cleanup failure without resurrecting consumed items',async()=>{
 const f=fixture(),item=f.commerce.snapshot(store).standard.find(i=>i.id==='route-snack');
 const remove=f.storage.removeItem;f.storage.removeItem=()=>{throw Error('cleanup interrupted');};
 assert.equal((await f.commerce.buy(store,item.id)).reason,'commerce_recovery_required');
 const owned=f.inventory.snapshot().items.find(i=>i.catalogId===item.id);assert.equal(owned.quantity,1);
 f.inventory.consumeItem(owned.instanceId,1);assert.equal(f.backpackStore.save(f.inventory.exportState()),true);
 f.storage.removeItem=remove;f.reload();
 assert.equal((await f.commerce.recoverPending()).recovered,1);
 assert.equal(f.inventory.snapshot().items.some(i=>i.catalogId===item.id),false);
 assert.equal(f.cloud.get('wallet').credits,1000000-item.buyPrice);
});
test('concurrent model owners cannot dispatch two account commands',async()=>{
 const f=fixture(),item=f.commerce.snapshot(store).standard[0];
 const second=createLocalCommerceModel({storage:f.storage,inventory:f.inventory,backpackStore:f.backpackStore,transactionAuthority:f.authority,now});
 const outcomes=await Promise.all([f.commerce.buy(store,item.id),second.buy(store,item.id)]);
 assert.equal(outcomes.filter(r=>r.ok).length,1);assert.equal(f.cloud.get('wallet').credits,1000000-item.buyPrice);
});
test('unknown service effect remains funded and target-bound instead of being refunded',async()=>{
 const f=fixture();
 const result=await f.commerce.service(clinic,'companion-wellness',()=>{throw Error('effect interrupted');},{targetId:'companion-a'});
 assert.equal(result.reason,'settlement_recovery_required');
 f.reload();assert.equal((await f.commerce.recoverPending(()=>null)).remaining,1);
 assert.equal(f.cloud.get('wallet').credits,999820);
 assert.equal((await f.commerce.recoverPending(()=>true)).remaining,0);
});
test('a known failed service refunds exactly once even if the settlement reply is lost',async()=>{
 const f=fixture(),settle=f.authority.settle;let first=true;
 f.authority.settle=async(...args)=>{const result=await settle(...args);if(first){first=false;throw Error('settlement reply lost');}return result;};
 assert.equal((await f.commerce.service(clinic,'companion-wellness',()=>false,{targetId:'companion-a'})).ok,false);
 f.reload();assert.equal((await f.commerce.recoverPending(()=>{throw Error('must not replay failed effect');})).remaining,0);
 assert.equal(f.cloud.get('wallet').credits,1000000);
});
test('corrupt pending bytes are retained and cannot cause a new charge',async()=>{
 const f=fixture(),item=f.commerce.snapshot(store).standard[0],key='world-explorer:commerce-pending:v1:account-a';
 f.storage.setItem(key,'{truncated');assert.equal((await f.commerce.buy(store,item.id)).ok,false);
 assert.equal(f.storage.getItem(key),'{truncated');assert.equal(f.cloud.size,0);
});
