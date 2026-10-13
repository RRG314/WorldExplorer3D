import {createLocalCommerceModel} from '../app/js/urban-sandbox/commerce-model.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalBackpackStore,BACKPACK_STORAGE_KEY} from '../app/js/player/backpack-store.js';
import {createEquipmentInventory} from '../app/js/urban-sandbox/equipment-model.js';
import {createHousingModel,HOUSING_STORAGE_KEY} from '../app/js/real-estate/housing-model.js';
import {projectDiscoveryItemsToBackpack} from '../app/js/discovery/backpack-projection.js';

function setup() {
 const rows=new Map(), writes=[];let deny=false;
 const storage={getItem:k=>rows.get(k)??null,setItem:(k,v)=>{if(deny)throw Error('quota');rows.set(k,v);writes.push(k);},removeItem:k=>rows.delete(k)};
 const store=createLocalBackpackStore(storage),inventory=createEquipmentInventory();
 const item={instanceId:'sample',catalogId:'quartz',quantity:3,sourceEventId:'field:quartz',provenance:'field-discovery',metadata:{label:'Quartz',discoveryJournalProjection:true}};
 inventory.upsertItem(item);store.save(inventory.exportState());
 const economy=createLocalCommerceModel({storage,backpackStore:store,inventory});
 const housing=createHousingModel({storage,backpackStore:store,inventory,economy});
 housing.buy({id:'home',price:1,locationId:'test'});writes.length=0;
 return {rows,writes,storage,store,inventory,housing,economy,item,setDeny:v=>{deny=v;}};
}
const units=(inventory,home)=> (inventory.snapshot().items.find(i=>i.instanceId==='sample')?.quantity||0)+(home.snapshot().homes[0].storage.find(i=>i.instanceId==='sample')?.quantity||0);

test('a home transfer has one durable commit and is recoverable before presentation runs',()=>{
 const f=setup();assert.equal(f.housing.storeItem('home','sample',2).ok,true);
 assert.deepEqual(f.writes,[BACKPACK_STORAGE_KEY]);assert.equal(units(f.inventory,f.housing),3);
 const recoveredStore=createLocalBackpackStore(f.storage),recoveredInventory=createEquipmentInventory({persistedState:recoveredStore.load()});
 const recoveredHome=createHousingModel({storage:f.storage,backpackStore:recoveredStore,inventory:recoveredInventory,economy:f.economy});
 assert.equal(units(recoveredInventory,recoveredHome),3);assert.equal(recoveredInventory.item('sample').quantity,1);
 assert.equal(recoveredHome.withdrawItem('home','sample',2).ok,true);assert.equal(units(recoveredInventory,recoveredHome),3);
 assert.equal(recoveredHome.snapshot().homes[0].storage.length,0);
});

test('quota failures leave both containers, hotbar and event log untouched, then retry once',()=>{
 const f=setup();f.inventory.assignHotbar(6,'sample');f.store.save(f.inventory.exportState());
 const before={home:f.housing.snapshot(),inventory:f.inventory.exportState(),bytes:f.rows.get(BACKPACK_STORAGE_KEY)};
 f.setDeny(true);assert.equal(f.housing.storeItem('home','sample',3).reason,'save_failed');
 assert.deepEqual(f.housing.snapshot(),before.home);assert.deepEqual(f.inventory.exportState(),before.inventory);assert.equal(f.rows.get(BACKPACK_STORAGE_KEY),before.bytes);
 f.setDeny(false);assert.equal(f.housing.storeItem('home','sample',3).ok,true);assert.equal(f.inventory.has('sample'),false);
 assert.equal(f.inventory.exportState().hotbar[5],null);const stored=f.rows.get(BACKPACK_STORAGE_KEY);
 f.setDeny(true);assert.equal(f.housing.withdrawItem('home','sample',2).reason,'save_failed');assert.equal(f.rows.get(BACKPACK_STORAGE_KEY),stored);assert.equal(f.inventory.has('sample'),false);
 f.setDeny(false);assert.equal(f.housing.withdrawItem('home','sample',2).ok,true);assert.equal(units(f.inventory,f.housing),3);
});

test('Journal reprojection and receipt aliases do not recreate items held at home',()=>{
 const f=setup();f.housing.storeItem('home','sample',2);
 const ctx={playerBackpackInventory:f.inventory,playerBackpackStore:f.store};
 projectDiscoveryItemsToBackpack(ctx,[f.item],{reconcile:true});assert.equal(units(f.inventory,f.housing),3);
 projectDiscoveryItemsToBackpack(ctx,[{...f.item,instanceId:'server-alias'}]);assert.equal(units(f.inventory,f.housing),3);
 f.housing.storeItem('home','sample',1);projectDiscoveryItemsToBackpack(ctx,[f.item]);assert.equal(f.inventory.has('sample'),false);assert.equal(units(f.inventory,f.housing),3);
 f.housing.withdrawItem('home','sample',1);projectDiscoveryItemsToBackpack(ctx,[f.item]);assert.equal(units(f.inventory,f.housing),3);
});

test('legacy homes are retained, migrate with possessions and survive ordinary saves',()=>{
 const f=setup();const legacy=JSON.stringify({schemaVersion:2,primaryHomeId:'old',homes:[{id:'old',storage:[{instanceId:'old-item',catalogId:'quartz',quantity:1}]}],transactions:[]});
 f.rows.delete(BACKPACK_STORAGE_KEY);f.rows.set(HOUSING_STORAGE_KEY,legacy);
 const store=createLocalBackpackStore(f.storage),saved=store.load();assert.equal(saved.housing.homes[0].id,'old');
 assert.equal(store.save({...saved,items:[]}),true);assert.equal(f.rows.get(HOUSING_STORAGE_KEY),legacy);
 assert.equal(store.save({items:[{instanceId:'new',catalogId:'new'}]}),true);
 assert.equal(createLocalBackpackStore(f.storage).load().housing.homes[0].storage[0].instanceId,'old-item');
 assert.equal(store.rollbackMigration(),false);
});

test('an obsolete save instance cannot overwrite a newer transfer',()=>{
 const f=setup(),old=createLocalBackpackStore(f.storage);const stale=old.load();
 f.housing.storeItem('home','sample',2);const durable=f.rows.get(BACKPACK_STORAGE_KEY);
 assert.equal(old.save(stale),false);assert.equal(f.rows.get(BACKPACK_STORAGE_KEY),durable);
});

for(const value of ['{broken',JSON.stringify({schemaVersion:99,items:[],future:'keep'}),'null'])test('unreadable/future saves remain untouched: '+value.slice(0,15),()=>{
 const f=setup();f.rows.set(BACKPACK_STORAGE_KEY,value);const store=createLocalBackpackStore(f.storage);
 assert.equal(store.load(),null);assert.equal(store.save({items:[]}),false);assert.equal(f.rows.get(BACKPACK_STORAGE_KEY),value);
});


test('v3 migration preserves released v2 possessions and independent old-client writes',()=>{
 const f=setup();f.rows.delete(BACKPACK_STORAGE_KEY);
 const legacy=JSON.stringify({schemaVersion:2,items:[{instanceId:'keepsake',catalogId:'keepsake',quantity:2}],ammo:{tool:{magazine:4}}});
 f.rows.set('world-explorer:character-backpack:v2',legacy);
 const store=createLocalBackpackStore(f.storage),loaded=store.load();
 assert.equal(loaded.schemaVersion,3);assert.equal(loaded.items[0].quantity,2);
 assert.equal(f.rows.get('world-explorer:character-backpack:v2'),legacy);
 f.rows.set('world-explorer:character-backpack:v2',JSON.stringify({schemaVersion:2,items:[]}));
 assert.equal(createLocalBackpackStore(f.storage).load().items[0].quantity,2);
});

test('an empty carried save does not regenerate legacy equipment held at home',()=>{
 const inventory=createEquipmentInventory({persistedState:{items:[],hotbar:[],housing:{homes:[{id:'old',storage:[{instanceId:'old-lamp',catalogId:'flashlight',quantity:1}]}]}}});
 assert.equal(inventory.has('flashlight'),false);
 assert.equal(inventory.homeStoredQuantity({instanceId:'old-lamp',catalogId:'flashlight'}),1);
 assert.equal(inventory.has('hands'),true,'Hands remain available');
});

test('rollback refuses unreadable current saves even when a legacy backup exists',()=>{
 const rows=new Map([['world-explorer:character-backpack:v2',JSON.stringify({schemaVersion:2,items:[]})]]);
 const storage={getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,v),removeItem:k=>rows.delete(k)};
 const initial=createLocalBackpackStore(storage);initial.load();assert.ok(rows.get(initial.backupKey));
 rows.set(BACKPACK_STORAGE_KEY,'{unreadable');
 assert.equal(createLocalBackpackStore(storage).rollbackMigration(),false);
 assert.equal(rows.get(BACKPACK_STORAGE_KEY),'{unreadable');
});


for(const version of [1,2])test(`delayed writer acquisition keeps v${version} migration history through the real equipment projection`,async()=>{
 const rows=new Map(),legacyKey=`world-explorer:character-backpack:v${version}`;
 const legacy=JSON.stringify({schemaVersion:version,items:[
  {instanceId:'original-lamp',catalogId:'flashlight',sourceEventId:'same-reward'},
  {instanceId:'duplicate-lamp',catalogId:'flashlight',sourceEventId:'same-reward'}
 ],hotbar:['duplicate-lamp'],equippedInstanceId:'duplicate-lamp',migration:{saveGeneration:'old-key-generation'}});
 rows.set(legacyKey,legacy);
 const storage={getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,v)};
 const priorWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),priorNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 let acquire;
 Object.defineProperty(globalThis,'window',{configurable:true,value:{localStorage:storage}});
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request(_name,_options,callback){acquire=()=>{void callback({});};return Promise.resolve();}}}});
 try {
  const store=createLocalBackpackStore(storage),inventory=createEquipmentInventory({persistedState:store.load()});
  assert.equal(store.saveStatus(),'starting');assert.equal(rows.has(BACKPACK_STORAGE_KEY),false);
  assert.equal(inventory.exportState().migration,undefined,'The live equipment projection does not carry migration metadata');
  acquire();assert.equal(await store.ready,true);assert.equal(store.save(inventory.exportState()),true);
  const saved=store.load();assert.equal(saved.migration.sourceVersion,version);assert.equal(saved.migration.duplicateEventRewardsRemoved,1);
  assert.equal(saved.items.filter(i=>i.sourceEventId==='same-reward').length,1);
  assert.equal(saved.hotbar[0],'original-lamp');assert.equal(saved.equippedInstanceId,'original-lamp');
  assert.equal(rows.get(legacyKey),legacy);assert.equal(JSON.parse(rows.get(store.backupKey)).state.items.length,2);
  assert.notEqual(saved.migration.saveGeneration,'old-key-generation');assert.ok(saved.migration.saveGeneration);
  assert.equal(store.save(inventory.exportState()),true);assert.equal(store.load().migration.duplicateEventRewardsRemoved,1);
 }finally{
  if(priorWindow)Object.defineProperty(globalThis,'window',priorWindow);else delete globalThis.window;
  if(priorNavigator)Object.defineProperty(globalThis,'navigator',priorNavigator);else delete globalThis.navigator;
 }
});
