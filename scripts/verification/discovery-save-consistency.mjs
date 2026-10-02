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
 await pages[0].evaluate(()=>refresh());await pages[0].screenshot({path:`${dir}/save-reload.png`});
 assert.deepEqual(report.errors,[]);report.passed=true;
}finally{await fs.writeFile(`${dir}/save-browser.json`,JSON.stringify(report,null,2));await browser.close();await server.close();}
console.log(JSON.stringify(report));
