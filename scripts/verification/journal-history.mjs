import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';

// Real IndexedDB in an owned, disposable browser profile. No existing player
// database, account, provider, or production artifact is opened by this check.
const directory=process.env.WE3D_JOURNAL_OUTPUT || 'output/verification/architecture-polish/journal-history';
await mkdir(directory,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4397,4398]});
let browser;
const report={scope:'Actual source IndexedDB v4 upgrade, bounded Journal reads and real Backpack projection; disposable profile',histories:[],errors:[]};
try {
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage();
  page.on('pageerror',error=>report.errors.push(error.message));
  await page.route('**/journal-history-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Journal history verification</title><h1>Disposable Journal history</h1><pre id="result"></pre>'}));
  await page.goto(`http://127.0.0.1:${server.port}/journal-history-fixture`);
  for(const count of [0,1000,10000,50000]) {
    const result=await page.evaluate(async count=>{
      const {createIndexedDbDiscoveryProfileStore,createMemoryDiscoveryProfileStore}=await import('/app/js/discovery/profile-store.js');
      const {createBackpackModel}=await import('/app/js/player/backpack-model.js');
      const {projectDiscoveryItemsToBackpack}=await import('/app/js/discovery/backpack-projection.js');
      const check=(value,message)=>{if(!value)throw Error(message);};
      const request=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
      const done=tx=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||Error('Transaction failed'));});
      const timestamp=i=>i%97===0?undefined:i%89===0?'invalid':i%91===0?String(Math.floor(i/3)):Math.floor(i/3);
      const numeric=value=>Number.isFinite(Number(value))?Number(value):0;
      const id=i=>String(i).padStart(6,'0');
      const items=Array.from({length:count},(_,i)=>({instanceId:`item:${id(i)}`,catalogId:`catalog:${id(i%2000)}`,claimId:`claim:${id(i)}`,name:'Test specimen',collectedAt:timestamp(i),unknown:{preserved:true,index:i},__journalOrder:{foreign:true}}));
      const events=items.map((item,i)=>({eventId:`event:${id(i)}`,claimId:item.claimId,catalogId:item.catalogId,occurredAt:timestamp(i),unknown:item.unknown,payload:{detail:'Evidence retained in the Journal. '.repeat(16)}}));
      const guide=items.slice(0,2000).map((item,i)=>({catalogId:item.catalogId,lastObservedAt:timestamp(i),unknown:item.unknown}));
      const profile=await createMemoryDiscoveryProfileStore().getProfile();
      // Construct the actual previous schema, including its existing indexes.
      await request(indexedDB.deleteDatabase('world-explorer-discovery'));
      const opening=indexedDB.open('world-explorer-discovery',4);
      opening.onupgradeneeded=()=>{
        const db=opening.result;
        for(const [name,key] of [['profiles','id'],['items','instanceId'],['claims','claimId'],['fieldGuide','catalogId'],['companions','instanceId'],['events','eventId'],['migrationBackups','id'],['receiptOutbox','id']])db.createObjectStore(name,{keyPath:key});
        for(const [store,index] of [['items','catalogId'],['items','collectedAt'],['events','occurredAt'],['events','regionId'],['events','eventType'],['receiptOutbox','ownerUid']])opening.transaction.objectStore(store).createIndex(index,index);
      };
      const old=await request(opening),tx=old.transaction(['profiles','items','claims','fieldGuide','events'],'readwrite'),saved=done(tx);
      tx.objectStore('profiles').put({...profile,schemaVersion:4});
      for(const item of items){tx.objectStore('items').put(item);tx.objectStore('claims').put({claimId:item.claimId,item});}
      for(const event of events)tx.objectStore('events').put(event);
      for(const entry of guide)tx.objectStore('fieldGuide').put(entry);
      await saved;old.close();
      const store=createIndexedDbDiscoveryProfileStore();
      const upgradeStarted=performance.now();await store.getProfile();const upgradeMs=performance.now()-upgradeStarted;
      const inspection=await request(indexedDB.open('world-explorer-discovery'));
      check(inspection.version===5,'Journal index migration must publish version 5');inspection.close();
      const calls=[];const getAll=IDBObjectStore.prototype.getAll,get=IDBObjectStore.prototype.get;
      IDBObjectStore.prototype.getAll=function(...args){calls.push({method:'getAll',store:this.name});return getAll.apply(this,args);};
      IDBObjectStore.prototype.get=function(...args){calls.push({method:'get',store:this.name});return get.apply(this,args);};
      let listsMs,bootstrapMs,bootstrap,boundedReads;
      try {
        const started=performance.now();
        for(const [method,rows,key,time] of [['listItems',items,'instanceId','collectedAt'],['listEvents',events,'eventId','occurredAt'],['listFieldGuide',guide,'catalogId','lastObservedAt']]){
          const actual=await store[method](7);
          const expected=[...rows].sort((a,b)=>numeric(b[time])-numeric(a[time])||(a[key]<b[key]?-1:a[key]>b[key]?1:0)).slice(0,7);
          check(JSON.stringify(actual)===JSON.stringify(expected),`${method} changed ordering, content or unknown fields`);
        }
        listsMs=performance.now()-started;
        check(!calls.some(call=>call.method==='getAll'), 'Bounded list copied an entire store');
        boundedReads=calls.filter(call=>call.method==='get'&&['items','events','fieldGuide'].includes(call.store)).length;
        check(boundedReads<=21,'Bounded list loaded more original records than requested');calls.length=0;
        const bootStarted=performance.now();bootstrap=await createIndexedDbDiscoveryProfileStore().loadRuntimeBootstrap();bootstrapMs=performance.now()-bootStarted;
        check(!calls.some(call=>call.method==='getAll'&&['events','fieldGuide','companions'].includes(call.store)),'Already migrated bootstrap loaded full event/guide/companion payloads');
        check(bootstrap.items.length===count,'Bootstrap lost collected items');
        check(new Set(bootstrap.claimedIds).size===count,'Bootstrap lost claim identities');
        check(new Set(bootstrap.observedCatalogIds).size===guide.length,'Bootstrap lost observed catalog identities');
      } finally {IDBObjectStore.prototype.getAll=getAll;IDBObjectStore.prototype.get=get;}
      const ctx={playerBackpackInventory:createBackpackModel(),playerBackpackStore:{save:()=>false}};
      const projectionStarted=performance.now();
      projectDiscoveryItemsToBackpack(ctx,bootstrap.items);projectDiscoveryItemsToBackpack(ctx,bootstrap.items);
      const projectionMs=performance.now()-projectionStarted;
      check(ctx.playerBackpackInventory.exportState().items.length===count,'Projection lost or duplicated established items');
      check(ctx.discoveryBackpackSaved===false,'Quota failure must remain visible');
      check(projectionMs<10000,'Established Backpack projection exceeded ten seconds');
      const backup=await store.exportData();
      check(JSON.stringify(backup.items)===JSON.stringify(items),'Upgrade/projection changed saved items or unknown fields');
      check(JSON.stringify(backup.events)===JSON.stringify(events),'Upgrade changed saved evidence');
      check(JSON.stringify(backup.fieldGuide)===JSON.stringify(guide),'Upgrade changed field guide');
      await store.importData({...backup,items:[],events:[],fieldGuide:[]});
      check((await store.listItems()).length===0,'Import did not clear items');
      check(await store.rollbackLastImport(),'Import rollback unavailable');
      const rolledBack=await store.exportData();
      check(JSON.stringify(rolledBack.items)===JSON.stringify(items)&&JSON.stringify(rolledBack.events)===JSON.stringify(events),'Rollback changed original records');
      check((await store.listItems(7)).length===Math.min(7,count),'Rollback did not restore derived ordering');
      let futureRejected=false;try{await store.importData({...backup,schemaVersion:6});}catch{futureRejected=true;}
      check(futureRejected,'Unsupported future backup accepted');
      check((await store.exportData()).items.length===count,'Rejected backup changed records');
      const result={count,upgradeMs,listsMs,boundedReads,bootstrapMs,projectionMs,recordsRetained:true,rollback:true,quotaFailureVisible:true,futureVersionRejected:true};
      document.querySelector('#result').textContent=JSON.stringify(result,null,2);
      return result;
    },count);
    report.histories.push(result);console.log('[journal-history]',JSON.stringify(result));
  }
  assert.deepEqual(report.errors,[]);report.passed=true;
  await page.screenshot({path:`${directory}/history.png`});
} catch(error) {report.error=error.stack;throw error;}
finally {
  await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2));
  await browser?.close();await server.close();
}
