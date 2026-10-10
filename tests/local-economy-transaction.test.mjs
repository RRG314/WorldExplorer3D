import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalBackpackStore,BACKPACK_STORAGE_KEY} from '../app/js/player/backpack-store.js';
import {createEquipmentInventory} from '../app/js/urban-sandbox/equipment-model.js';
import {createLocalCommerceModel,COMMERCE_STORAGE_KEY} from '../app/js/urban-sandbox/commerce-model.js';
import {createHousingModel} from '../app/js/real-estate/housing-model.js';
import {createVehicleUpgradeStore} from '../app/js/transport/vehicle-upgrades.js';

const shop={id:'node:10',name:'Corner store',kind:'convenience',semantic:{capabilities:['service.vehicleRepair']}};
function setup(seed={}) {
  const rows=new Map(Object.entries(seed)),writes=[];let fail=false;
  const storage={getItem:k=>rows.get(k)??null,setItem:(k,v)=>{if(fail)throw Error('Quota');rows.set(k,v);writes.push(k);},removeItem:k=>rows.delete(k)};
  const store=createLocalBackpackStore(storage),inventory=createEquipmentInventory({persistedState:store.load()});
  const economy=createLocalCommerceModel({storage,backpackStore:store,inventory,now:()=>1000});
  const housing=createHousingModel({storage,backpackStore:store,inventory,economy,now:()=>1000});
  return {rows,writes,storage,store,inventory,economy,housing,deny:v=>{fail=v;}};
}

test('buy, sell, credit and debit leave wallet, stock and inventory intact on quota failure',()=>{
  const f=setup(),item=f.economy.snapshot(shop).standard[0];
  const before=()=>({wallet:f.economy.wallet(),inventory:f.inventory.exportState(),shop:f.economy.snapshot(shop),bytes:f.rows.get(BACKPACK_STORAGE_KEY)});
  const first=before();f.deny(true);assert.equal(f.economy.buy(shop,item.id).reason,'save_failed');assert.deepEqual(before(),first);
  f.deny(false);f.writes.length=0;assert.equal(f.economy.buy(shop,item.id).ok,true);assert.deepEqual(f.writes,[BACKPACK_STORAGE_KEY]);
  const after=before();f.deny(true);assert.equal(f.economy.sell(shop,`commerce:${item.id}`).reason,'save_failed');
  assert.equal(f.economy.debit(42).reason,'save_failed');assert.equal(f.economy.credit(42).reason,'save_failed');assert.deepEqual(before(),after);
  f.deny(false);assert.equal(f.economy.sell(shop,`commerce:${item.id}`).ok,true);
  assert.equal(f.economy.wallet().credits,1000000-item.buyPrice+item.sellPrice);
});

test('home purchase and sale each commit one complete payment, deed and history',()=>{
  const f=setup();f.deny(true);assert.equal(f.housing.buy({id:'a',price:120000}).reason,'save_failed');
  assert.equal(f.housing.snapshot().homes.length,0);assert.equal(f.economy.wallet().credits,1000000);
  f.deny(false);f.writes.length=0;assert.equal(f.housing.buy({id:'a',price:120000}).ok,true);assert.deepEqual(f.writes,[BACKPACK_STORAGE_KEY]);
  const committed=f.rows.get(BACKPACK_STORAGE_KEY),recovered=setup(Object.fromEntries(f.rows));
  assert.equal(recovered.economy.wallet().credits,880000);assert.equal(recovered.housing.snapshot().homes[0].id,'a');
  assert.equal(recovered.housing.snapshot().transactions[0].action,'bought');
  f.deny(true);assert.equal(f.housing.sell('a').reason,'save_failed');assert.equal(f.rows.get(BACKPACK_STORAGE_KEY),committed);
  assert.equal(f.housing.snapshot().primaryHomeId,'a');assert.equal(f.economy.wallet().credits,880000);
  f.deny(false);f.writes.length=0;assert.equal(f.housing.sell('a').ok,true);assert.deepEqual(f.writes,[BACKPACK_STORAGE_KEY]);
  assert.equal(f.economy.wallet().credits,982000);assert.equal(f.housing.snapshot().homes.length,0);
});

test('failed rare trade preserves every prerequisite and does not claim the reward',()=>{
  const f=setup(),rare=f.economy.snapshot(shop).rare;
  f.inventory.upsertItem({instanceId:'supply',catalogId:rare.requirementId,quantity:rare.requirementQuantity});
  f.store.save(f.inventory.exportState());const before=f.inventory.exportState();f.deny(true);
  assert.equal(f.economy.trade(shop).reason,'save_failed');assert.deepEqual(f.inventory.exportState(),before);assert.equal(f.economy.snapshot(shop).rare.claimed,false);
  f.deny(false);assert.equal(f.economy.trade(shop).ok,true);assert.equal(f.inventory.has('supply'),false);
  assert.equal(f.economy.trade(shop).reason,'already_traded_today');
});

test('migration retains old wallet bytes and later old-client changes cannot overwrite the new wallet',()=>{
  const legacy=JSON.stringify({schemaVersion:1,credits:73,purchases:{},transactions:[]});
  const f=setup({[COMMERCE_STORAGE_KEY]:legacy});assert.equal(f.economy.wallet().credits,146000);
  f.economy.debit(1);assert.equal(f.rows.get(COMMERCE_STORAGE_KEY),legacy);
  f.rows.set(COMMERCE_STORAGE_KEY,JSON.stringify({schemaVersion:4,credits:0}));
  assert.equal(setup(Object.fromEntries(f.rows)).economy.wallet().credits,145999);
  assert.equal(f.store.rollbackMigration(),false);
});

for (const raw of ['{broken','null',JSON.stringify({schemaVersion:99,credits:5}),JSON.stringify({schemaVersion:4,credits:-1})]) {
  test('unreadable wallet does not reset or grant a fresh balance: '+raw,()=>{
    const f=setup({[COMMERCE_STORAGE_KEY]:raw});
    assert.equal(f.economy.credit(1).ok,false);assert.equal(f.economy.wallet().writable,false);assert.equal(f.rows.get(COMMERCE_STORAGE_KEY),raw);
  });
}

test('stale wallet handles cannot overwrite another commit even in the same page',()=>{
  const f=setup();const old=createLocalCommerceModel({storage:f.storage,backpackStore:f.store,inventory:f.inventory});
  assert.equal(f.economy.debit(40).ok,true);const bytes=f.rows.get(BACKPACK_STORAGE_KEY);
  assert.equal(old.debit(10).ok,false);assert.equal(f.rows.get(BACKPACK_STORAGE_KEY),bytes);
});

test('services reserve once before the effect, block concurrent spending and settle against the latest balance',async()=>{
  const f=setup();let release,calls=0;
  const result=f.economy.service(shop,'vehicle-full-repair',async()=>{calls++;await new Promise(r=>{release=r;});return true;},{targetId:'car-a'});
  assert.equal(f.economy.wallet().credits,996200);
  assert.equal((await f.economy.service(shop,'vehicle-full-repair',async()=>true)).reason,'settlement_recovery_required');
  assert.equal(f.economy.debit(100).ok,true);release();assert.equal((await result).ok,true);
  assert.equal(calls,1);assert.equal(f.economy.wallet().credits,996100);
  assert.deepEqual(f.store.loadCommerce().pendingSettlements,{});
});

test('services cannot apply when the reservation fails and incomplete receipts recover on the same target',async()=>{
  const f=setup();let calls=0;f.deny(true);
  assert.equal((await f.economy.service(shop,'vehicle-full-repair',()=>{calls++;return true;})).reason,'save_failed');assert.equal(calls,0);
  f.deny(false);
  const result=await f.economy.service(shop,'vehicle-full-repair',()=>{f.deny(true);return true;},{targetId:'car-a'});
  assert.equal(result.reason,'settlement_recovery_required');assert.equal(f.economy.wallet().credits,996200);
  const recovered=setup(Object.fromEntries(f.rows));
  assert.deepEqual(await recovered.economy.recoverPending(()=>null),{recovered:0,remaining:1});
  let id;
  assert.deepEqual(await recovered.economy.recoverPending((service,requestId,context)=>{assert.equal(context.targetId,'car-a');assert.equal(context.recovery,true);id=requestId;return true;}),{recovered:1,remaining:0});
  assert.ok(id.startsWith('local-service:'));assert.equal(recovered.economy.wallet().credits,996200);
});

test('failed services refund once and a failed upgrade write cannot install an unpaid upgrade',async()=>{
  const f=setup(),upgrades=createVehicleUpgradeStore({storage:f.storage});
  f.deny(true);assert.equal(upgrades.apply({id:'a'},'vehicle-upgrade:engine-tune:1').reason,'save_failed');assert.equal(upgrades.levels({id:'a'})['engine-tune'],0);
  f.deny(false);const result=await f.economy.service(shop,'vehicle-full-repair',()=>false,{targetId:'a'});
  assert.equal(result.reason,'service_effect_failed_refunded');assert.equal(f.economy.wallet().credits,1000000);
  assert.deepEqual(await f.economy.recoverPending(()=>true),{recovered:0,remaining:0});
});
