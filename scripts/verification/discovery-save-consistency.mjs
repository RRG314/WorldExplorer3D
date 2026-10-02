import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const server=await startStaticServer({rootDir:process.cwd(),ports:[4396]});
const browser=await chromium.launch({channel:'chrome',headless:true});
const dir='output/verification/product-plan';const report={scope:'Real IndexedDB transactions in two isolated-test-profile tabs; controlled discovery records; no authenticated account service',errors:[]};
try{
 const context=await browser.newContext();const pages=[await context.newPage(),await context.newPage()];
 for(const page of pages){page.on('pageerror',e=>report.errors.push(e.message));await page.goto(`http://127.0.0.1:${server.port}/tests/fixtures/discovery-save.html`);await page.waitForFunction(()=>window.ready);}
 await pages[0].evaluate(async()=>{
   const {createStarterCompanionInstance}=await import('/app/js/discovery/companions.js');
   const pet=createStarterCompanionInstance({profileIdentity:'atomic-field-test'});
   await store.saveCompanion(pet);await store.setActiveCompanion(pet.instanceId);
 });
 // Parallel requests are the behavior under test, within one owned browser.
 await Promise.all(pages.map((page,tab)=>page.evaluate(async tab=>{
  for(let i=0;i<10;i++)await Promise.all([
   store.recordObservation(sample(`${tab}:${i}`)),
   store.recordObservation(sample(`${tab}:${i}`)),
   store.saveProfile(p=>({...p,tutorials:{...p.tutorials,[`${tab}:${i}`]:true}})),
   store.saveProfile(p=>({...p,equippedToolId:'field-camera'}))
  ]);
 },tab)));
 await pages[0].reload();await pages[0].waitForFunction(()=>window.ready);
 const saved=await pages[0].evaluate(()=>window.saved);
 assert.equal(saved.explorerProgress.totalRecords,20);assert.equal(saved.fieldGuideCount,20);assert.equal(Object.keys(saved.tutorials).length,20);assert.equal(saved.equippedToolId,'field-camera');
 report.recordsAfterReload=saved.explorerProgress.totalRecords;
 const companionXp=await pages[0].evaluate(async()=>(await store.listCompanions())[0].progression.totalXp);
 assert.equal(companionXp,400);report.companionXpAfterReload=companionXp;
 await pages[0].evaluate(async()=>{
   const stale=(await store.listCompanions())[0];
   await store.saveCompanion({...stale,progression:{...stale.progression,totalXp:0},name:'Still here'});
 });
 assert.equal(await pages[0].evaluate(async()=>(await store.listCompanions())[0].progression.totalXp),400);
 report.backupReplay=await pages[0].evaluate(async()=>{const backup=await store.exportData();await store.importData(backup);return {repeat:await store.recordObservation(sample('0:0')),profile:await store.getProfile(),events:(await store.listEvents()).length};});
 assert.equal(report.backupReplay.repeat.recorded,false);assert.equal(report.backupReplay.events,20);assert.deepEqual(report.backupReplay.profile.explorerProgress,saved.explorerProgress);assert.deepEqual(report.backupReplay.profile.characterState,saved.characterState);
 delete report.backupReplay.profile;delete report.backupReplay.repeat;
 report.migration=await pages[0].evaluate(async()=>{
  const legacy=await store.exportData();delete legacy.profile.characterState;
  await store.importData(legacy);
  const first=await store.getProfile();const backup=await store.getCharacterMigrationBackup();
  const {createIndexedDbDiscoveryProfileStore}=await import('/app/js/discovery/profile-store.js');
  const second=await createIndexedDbDiscoveryProfileStore().getProfile();
  return {backupAvailable:!!backup,first:first.characterState,second:second.characterState,records:second.explorerProgress.totalRecords};
 });
 assert.equal(report.migration.backupAvailable,true);assert.deepEqual(report.migration.first,report.migration.second);assert.equal(report.migration.records,20);
 delete report.migration.first;delete report.migration.second;
 report.largeExport=await pages[0].evaluate(async()=>{
   const original=await store.exportData();
   const events=Array.from({length:10001},(_,i)=>({eventId:`large:${i}`,eventType:'travel',occurredAt:i+1}));
   await store.importData({...original,events,items:[]});
   const count=(await store.exportData()).events.length;
   await store.rollbackLastImport();return count;
 });
 assert.equal(report.largeExport,10001);
 report.importRecovery=await pages[0].evaluate(async()=>{
   const original=await store.exportData();
   let rejected=false;try{await store.importData({...original,items:[{}]})}catch{rejected=true}
   const intact=(await store.listEvents()).length===original.events.length;
   await store.importData({...original,events:[],items:[],fieldGuide:[]});
   const empty=(await store.listEvents()).length===0;
   return {rejected,intact,empty};
 });
 await pages[0].reload();await pages[0].waitForFunction(()=>window.ready);
 report.importRecovery.undoAfterReload=await pages[0].evaluate(()=>store.rollbackLastImport());
 report.importRecovery.restored=await pages[0].evaluate(async()=>(await store.listEvents()).length);
 assert.deepEqual(report.importRecovery,{rejected:true,intact:true,empty:true,undoAfterReload:true,restored:20});
 report.backpackRecovery=await pages[0].evaluate(async()=>{
   const {createBackpackModel}=await import('/app/js/player/backpack-model.js');
   const {createLocalBackpackStore}=await import('/app/js/player/backpack-store.js');
   const {projectDiscoveryItemsToBackpack}=await import('/app/js/discovery/backpack-projection.js');
   for(let i=0;i<125;i++)await store.collect({...sample(`pack:${i}`),instanceId:`pack:${i}`});
   const bootstrap=await store.loadRuntimeBootstrap();
   const ctx={playerBackpackInventory:createBackpackModel(),playerBackpackStore:createLocalBackpackStore({getItem:()=>null,setItem:()=>{throw Error('QuotaExceededError')}})};
   projectDiscoveryItemsToBackpack(ctx,bootstrap.items);
   const failed=ctx.discoveryBackpackSaved===false;
   ctx.playerBackpackInventory=createBackpackModel();
   ctx.playerBackpackStore=createLocalBackpackStore(localStorage);
   projectDiscoveryItemsToBackpack(ctx,bootstrap.items);
   projectDiscoveryItemsToBackpack(ctx,bootstrap.items);
   return {failed, saved:ctx.discoveryBackpackSaved, count:ctx.playerBackpackStore.load().items.length};
 });
 assert.deepEqual(report.backpackRecovery,{failed:true,saved:true,count:125});
 await pages[0].evaluate(()=>refresh());await pages[0].screenshot({path:`${dir}/save-reload.png`});
 assert.deepEqual(report.errors,[]);report.passed=true;
}finally{await fs.writeFile(`${dir}/save-browser.json`,JSON.stringify(report,null,2));await browser.close();await server.close();}
console.log(JSON.stringify(report));
