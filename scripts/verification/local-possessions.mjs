import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const out=process.env.WE3D_POSSESSIONS_OUTPUT || 'output/verification/local-possessions';await mkdir(out,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4479]});let browser;
const report={ok:false,scope:'Real browser localStorage, Web Locks, reload and interrupted presentation; disposable profile, not a housing art acceptance',checks:[],errors:[]};
try {
 browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext();
 await context.route('**/possessions-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Possessions verification</title><link rel="icon" href="/favicon.svg">'}));
 const url=`http://127.0.0.1:${server.port}/possessions-fixture`;
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));await page.goto(url);
 report.initial=await page.evaluate(async()=>{
  const {createLocalBackpackStore,BACKPACK_STORAGE_KEY}=await import('/app/js/player/backpack-store.js?v=2');
  const {createEquipmentInventory}=await import('/app/js/urban-sandbox/equipment-model.js');
  const {createHousingModel}=await import('/app/js/real-estate/housing-model.js');
  const store=createLocalBackpackStore();if(!await store.ready)throw Error('Writer not acquired');
  const inventory=createEquipmentInventory();inventory.upsertItem({instanceId:'test-quartz',catalogId:'quartz',quantity:4,metadata:{label:'Quartz specimen'}});
  if(!store.save(inventory.exportState()))throw Error('Save failed');
  const model=createHousingModel({backpackStore:store,inventory,economy:{debit:()=>({ok:true}),credit:()=>({ok:true}),wallet:()=>({credits:100})}});
  if(!model.buy({id:'test-home',price:1}).ok)throw Error('Home did not save');
  const original=Storage.prototype.setItem, before=localStorage.getItem(BACKPACK_STORAGE_KEY);let writes=0;
  Storage.prototype.setItem=function(key,value){if(key===BACKPACK_STORAGE_KEY)throw new DOMException('Quota','QuotaExceededError');return original.call(this,key,value);};
  const failed=model.storeItem('test-home','test-quartz',2);
  Storage.prototype.setItem=original;
  if(failed.ok || before!==localStorage.getItem(BACKPACK_STORAGE_KEY) || inventory.item('test-quartz').quantity!==4)throw Error('Failed transfer changed state');
  Storage.prototype.setItem=function(key,value){if(key===BACKPACK_STORAGE_KEY)writes++;return original.call(this,key,value);};
  const success=model.storeItem('test-home','test-quartz',2);Storage.prototype.setItem=original;
  if(!success.ok || writes!==1)throw Error('Transfer was not one durable commit');
  window.store=store;return {writes,carried:inventory.item('test-quartz').quantity,stored:model.snapshot().homes[0].storage[0].quantity};
 });
 assert.deepEqual(report.initial,{writes:1,carried:2,stored:2});report.checks.push('quota-failure-is-atomic-and-retry-commits-once');
 const second=await context.newPage();second.on('pageerror',e=>report.errors.push(String(e)));await second.goto(url);
 const blocked=await second.evaluate(async()=>{const {createLocalBackpackStore}=await import('/app/js/player/backpack-store.js?v=2');const s=createLocalBackpackStore();const ready=await s.ready;return {ready,status:s.saveStatus(),saved:s.save({items:[]})};});
 assert.deepEqual(blocked,{ready:false,status:'another-tab',saved:false});report.checks.push('second-tab-cannot-overwrite-active-possessions');
 await page.close();await second.reload();
 const recovery=await second.evaluate(async()=>{
  const {createLocalBackpackStore}=await import('/app/js/player/backpack-store.js?v=2');const store=createLocalBackpackStore();if(!await store.ready)throw Error('Released lock not acquired');
  const {createEquipmentInventory}=await import('/app/js/urban-sandbox/equipment-model.js');const inventory=createEquipmentInventory({persistedState:store.load()});
  const {createHousingModel}=await import('/app/js/real-estate/housing-model.js');const model=createHousingModel({backpackStore:store,inventory});
  if(inventory.item('test-quartz').quantity!==2||model.snapshot().homes[0].storage[0].quantity!==2)throw Error('Reload changed custody');
  if(!model.withdrawItem('test-home','test-quartz',2).ok)throw Error('Withdrawal failed');
  const durable=store.load();return {carried:durable.items.find(i=>i.instanceId==='test-quartz').quantity,stored:durable.housing.homes[0].storage.length};
 });assert.deepEqual(recovery,{carried:4,stored:0});report.checks.push('closing-owner-and-reloading-recovers-and-withdraws');
 // Simulate a process ending after commit but before the in-memory inventory refresh.
 await second.evaluate(async()=>{const {createLocalBackpackStore}=await import('/app/js/player/backpack-store.js?v=2');const s=createLocalBackpackStore(),saved=s.load();const item=saved.items.find(i=>i.instanceId==='test-quartz');saved.housing.homes[0].storage=[{...item,quantity:1}];item.quantity=3;if(!s.saveHousing(saved.housing,saved))throw Error('Commit failed');});
 await second.reload();const crash=await second.evaluate(async()=>{const {createLocalBackpackStore}=await import('/app/js/player/backpack-store.js?v=2');const s=createLocalBackpackStore();await s.ready;const v=s.load();return [v.items.find(i=>i.instanceId==='test-quartz').quantity,v.housing.homes[0].storage[0].quantity];});
 assert.deepEqual(crash,[3,1]);report.checks.push('committed-transfer-survives-lost-presentation');
 assert.deepEqual(report.errors,[]);report.ok=true;
} catch(error) {report.error=String(error.stack||error);throw error;}
finally {await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser?.close();await server.close();}
console.log(JSON.stringify(report));
