import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const server=await startStaticServer({rootDir:process.cwd(),ports:[4396]});
const browser=await chromium.launch({channel:'chrome',headless:true});
const dir='output/verification/product-plan';const report={scope:'Real IndexedDB offline queue/reload/account switch with controlled auth and receipt responses; no live service certification',errors:[]};
try{
 const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.port}/tests/fixtures/discovery-outbox.html`);await page.waitForFunction(()=>window.ready);
 report.offline=await page.evaluate(()=>prepare());assert.equal(report.offline.pendingA,1);assert.equal(report.offline.records,1);
 await page.reload();await page.waitForFunction(()=>window.ready);
 report.reloaded=await page.evaluate(()=>refresh());assert.equal(report.reloaded.pendingA,1);
 report.otherAccount=await page.evaluate(async()=>{owner='fixture-b';return retry()});assert.equal(report.otherAccount.calls,0);assert.equal(report.otherAccount.pendingA,1);
 report.recovered=await page.evaluate(async()=>{owner='fixture-a';return retry()});assert.equal(report.recovered.pendingA,0);assert.equal(report.recovered.records,1);assert.equal(report.recovered.items[0].authority,'server-receipt');
 await page.screenshot({path:`${dir}/receipt-outbox.png`});
 const legacyContext=await browser.newContext();const legacy=await legacyContext.newPage();
 await legacy.goto(`http://127.0.0.1:${server.port}/tests/fixtures/current-objective.html`);
 report.upgrade=await legacy.evaluate(async()=>{
  const old=await new Promise((resolve,reject)=>{const req=indexedDB.open('world-explorer-discovery',3);req.onupgradeneeded=()=>{
   for(const [name,keyPath] of Object.entries({profiles:'id',items:'instanceId',claims:'claimId',fieldGuide:'catalogId',companions:'instanceId',events:'eventId',migrationBackups:'id'}))req.result.createObjectStore(name,{keyPath});
   req.transaction.objectStore('profiles').put({id:'local-explorer',schemaVersion:3,migrationSentinel:'preserve-me'});
  };req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
  const {createIndexedDbDiscoveryProfileStore}=await import('/app/js/discovery/profile-store.js');
  let blockedMessage='';try{await createIndexedDbDiscoveryProfileStore().getProfile()}catch(error){blockedMessage=error.message}finally{old.close()}
  const upgraded=await createIndexedDbDiscoveryProfileStore().getProfile();
  return {blockedMessage,schemaVersion:upgraded.schemaVersion,preserved:upgraded.migrationSentinel};
 });
 assert.match(report.upgrade.blockedMessage,/Close or reload/);assert.equal(report.upgrade.schemaVersion,4);assert.equal(report.upgrade.preserved,'preserve-me');await legacyContext.close();
assert.deepEqual(report.errors,[]);report.passed=true;
}finally{await fs.writeFile(`${dir}/receipt-outbox-browser.json`,JSON.stringify(report,null,2));await browser.close();await server.close();}
console.log(JSON.stringify(report));
