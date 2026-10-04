import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const directory=process.env.WE3D_JOURNAL_OUTPUT || 'output/verification/architecture-polish/journal-transactions';
await mkdir(directory,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4397,4398]});
let browser;const report={scope:'Actual disposable IndexedDB, injected storage failures, account receipts and concurrent profile writers',errors:[]};
try {
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();
  page.on('pageerror',error=>report.errors.push(error.message));
  await page.route('**/journal-transactions-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Journal transaction verification</title><h1>Disposable Journal transactions</h1><pre id="result"></pre>'}));
  await page.goto(`http://127.0.0.1:${server.port}/journal-transactions-fixture`);
  report.result=await page.evaluate(async()=>{
    const {createIndexedDbDiscoveryProfileStore}=await import('/app/js/discovery/profile-store.js');
    const {summarizeReceiptState}=await import('/app/js/discovery/save-status.js');
    const {rebuildJournalOrder}=await import('/app/js/discovery/journal-index.js');
    const check=(value,message)=>{if(!value)throw Error(message);};
    const request=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
    const done=tx=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||Error('Transaction failed'));});
    let owner='a';const store=createIndexedDbDiscoveryProfileStore({getReceiptOwnerUid:()=>owner});await store.getProfile();
    const names=['profiles','items','claims','fieldGuide','companions','events','migrationBackups','receiptOutbox','journalOrder'];
    async function raw(){const db=await request(indexedDB.open('world-explorer-discovery'));try{const tx=db.transaction(names,'readonly'),complete=done(tx);const rows=await Promise.all(names.map(name=>request(tx.objectStore(name).getAll())));await complete;return Object.fromEntries(names.map((name,i)=>[name,rows[i]]));}finally{db.close();}}
    const record=id=>({claimId:`claim:${id}`,instanceId:`item:${id}`,catalogId:`catalog:${id}`,activityId:'geology-inspect',family:'rock',regionId:'test',name:'Test specimen',collectedAt:1000});
    const receipt=(id,uid)=>({ownerUid:uid,itemId:`server:${id}`,claimId:`claim:${id}`,catalogId:`catalog:${id}`,authority:'server-receipt'});
    const cases=[];
    await store.collect(record('one'));owner=null;await store.collect(record('guest'));owner='b';await store.collect(record('two'));
    const aRow=(await store.listPendingReceipts('a'))[0];
    await store.deferPendingReceipt(aRow.id,{id:'other',instanceId:'other',ownerUid:'b',attempts:1});
    check((await store.listPendingReceipts('a'))[0].id===aRow.id,'Retry patch changed receipt identity');
    await store.completePendingReceipt(aRow.id,receipt('one','a'));
    cases.push('collect-defer-acknowledge-keeps-owner-and-indexes');

    // Include duplicate, orphan, blocked, future, malformed and acknowledged
    // entries. Derived metadata must reproduce status from original records.
    const base=await raw();const extras=Array.from({length:70},(_,i)=>({id:`extra:${String(i).padStart(3,'0')}`,ownerUid:i%3?'a':'b',instanceId:i%2?'item:guest':'orphan',status:i%7?'pending':'blocked',nextAttemptAt:i%11===0?'invalid':i%13===0?Infinity:i%17===0?-Infinity:i%19===0?null:70-i,payload:{claimId:'claim:guest',catalogId:'catalog:guest'}}));
    extras.push({id:'acknowledged-pending',ownerUid:'a',instanceId:'item:one',status:'pending',nextAttemptAt:0,payload:{claimId:'claim:one',catalogId:'catalog:one'}});
    const db=await request(indexedDB.open('world-explorer-discovery'));
    const tx=db.transaction(['receiptOutbox','journalOrder'],'readwrite'),complete=done(tx);
    for(const row of extras)tx.objectStore('receiptOutbox').put(row);
    rebuildJournalOrder(tx,{...base,receiptOutbox:[...base.receiptOutbox,...extras]});await complete;db.close();
    const expected=await raw();const visited=[];
    const get=IDBObjectStore.prototype.get,getAll=IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.get=function(...args){visited.push(['get',this.name]);return get.apply(this,args);};
    IDBObjectStore.prototype.getAll=function(...args){visited.push(['getAll',this.name]);return getAll.apply(this,args);};
    try {
      for(const uid of [null,'a','b','unknown'])check(JSON.stringify(await store.getReceiptSyncStatus(uid))===JSON.stringify(summarizeReceiptState(expected.items,expected.receiptOutbox,uid)),`Receipt counts differ for ${uid}`);
      const ready=await store.listPendingReceipts('a',100);
      const reference=expected.receiptOutbox.filter(row=>row.ownerUid==='a'&&row.status==='pending'&&row.nextAttemptAt<=100)
        .sort((a,b)=>Number(a.nextAttemptAt)-Number(b.nextAttemptAt)||(a.id<b.id?-1:a.id>b.id?1:0)).slice(0,25);
      check(JSON.stringify(ready)===JSON.stringify(reference),'Ready receipt selection changed numeric eligibility or deterministic order');
      check(!visited.some(([method])=>method==='getAll'),'Receipt status/dispatch copied a whole store');
      check(visited.filter(([method,name])=>method==='get'&&name==='receiptOutbox').length<=25,'Receipt dispatch loaded more than 25 rows');
    }finally{IDBObjectStore.prototype.get=get;IDBObjectStore.prototype.getAll=getAll;}
    cases.push('receipt-counts-match-originals-with-bounded-ready-reads');

    async function atomicFailure(label,action){
      const before=JSON.stringify(await raw());const put=IDBObjectStore.prototype.put,clear=IDBObjectStore.prototype.clear;let failed=false;
      IDBObjectStore.prototype.put=function(...args){if(this.name==='journalOrder')throw new DOMException('Injected index quota failure','QuotaExceededError');return put.apply(this,args);};
      IDBObjectStore.prototype.clear=function(...args){if(this.name==='journalOrder')throw new DOMException('Injected index quota failure','QuotaExceededError');return clear.apply(this,args);};
      try{await action();}catch{failed=true;}finally{IDBObjectStore.prototype.put=put;IDBObjectStore.prototype.clear=clear;}
      check(failed,`${label}: failure injection did not execute`);check(JSON.stringify(await raw())===before,`${label}: failed transaction changed saved records or indexes`);cases.push(label);
    }
    owner='a';await atomicFailure('failed-collection-is-atomic',()=>store.collect(record('failed')));
    await atomicFailure('failed-observation-is-atomic',()=>store.recordObservation(record('failed-observation')));
    await atomicFailure('failed-story-is-atomic',()=>store.recordExplorerEvent({eventId:'story:fail',eventType:'visited',sourceId:'test'}));
    await atomicFailure('failed-trusted-receipt-is-atomic',()=>store.applyTrustedReceipt('item:guest',receipt('guest','a')));
    await atomicFailure('failed-receipt-acknowledgment-is-atomic',()=>store.completePendingReceipt('acknowledged-pending',receipt('one','a')));
    await atomicFailure('failed-retry-update-is-atomic',()=>store.deferPendingReceipt('acknowledged-pending',{status:'blocked'}));
    const backup=await store.exportData();
    await atomicFailure('failed-import-is-atomic',()=>store.importData({...backup,items:[],events:[],fieldGuide:[]}));
    await store.importData({...backup,items:[],events:[],fieldGuide:[]});
    await atomicFailure('failed-rollback-is-atomic',()=>store.rollbackLastImport());
    check(await store.rollbackLastImport(),'Rollback unavailable after failed attempt');
    check(JSON.stringify((await store.exportData()).items)===JSON.stringify(backup.items),'Successful rollback lost original items');
    cases.push('rollback-recovers-originals-after-failed-attempt');
    const rewards=(await store.getProfile()).explorerProgress;
    await Promise.all([store.saveProfile(p=>({...p,tutorials:{...p.tutorials,first:true}})),createIndexedDbDiscoveryProfileStore().saveProfile(p=>({...p,tutorials:{...p.tutorials,second:true}}))]);
    const profile=await store.getProfile();check(profile.tutorials.first&&profile.tutorials.second,'Concurrent profile writes lost independent edits');
    check(JSON.stringify(profile.explorerProgress)===JSON.stringify(rewards),'Preference writes overwrote earned progress');cases.push('simultaneous-profile-writers-preserve-rewards');
    document.querySelector('#result').textContent=JSON.stringify({cases,passed:true},null,2);return {cases,passed:true};
  });
  assert.deepEqual(report.errors,[]);report.passed=true;await page.screenshot({path:`${directory}/transactions.png`});
}catch(error){report.error=error.stack;throw error;}
finally{await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2));await browser?.close();await server.close();}
console.log(JSON.stringify(report));
