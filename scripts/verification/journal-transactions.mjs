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

    async function atomicFailure(label,action,failStore='journalOrder'){
      const before=JSON.stringify(await raw());const put=IDBObjectStore.prototype.put,clear=IDBObjectStore.prototype.clear;let failed=false;
      IDBObjectStore.prototype.put=function(...args){if(this.name===failStore)throw new DOMException('Injected index quota failure','QuotaExceededError');return put.apply(this,args);};
      IDBObjectStore.prototype.clear=function(...args){if(this.name===failStore)throw new DOMException('Injected index quota failure','QuotaExceededError');return clear.apply(this,args);};
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
    await store.startOpeningChapter({regionId:'test',regionLabel:'Test region',environment:'EARTH'},9000);
    await atomicFailure('failed-chapter-field-record-is-atomic',()=>store.recordObservation({...record('chapter-fail'),environment:'EARTH',collectedAt:10000}));
    const chapterRecord=await store.recordObservation({...record('chapter'),environment:'EARTH',collectedAt:10000});
    check((await store.getProfile()).openingChapter.eventId===chapterRecord.event.eventId,'Chapter did not retain its committed field evidence');
    await atomicFailure('failed-chapter-completion-is-atomic',()=>store.completeOpeningChapter(chapterRecord.event.eventId,11000));
    const outcomes=await Promise.all([store.completeOpeningChapter(chapterRecord.event.eventId,11000),createIndexedDbDiscoveryProfileStore().completeOpeningChapter(chapterRecord.event.eventId,11000)]);
    check(outcomes.filter(row=>row.recorded).length===1,'Concurrent chapter completion granted twice');
    const completed=await store.exportData();
    check(completed.events.filter(event=>event.eventId==='event:campaign-completed:first-bearings:v1').length===1,'Chapter receipt duplicated');
    await store.importData(completed);
    check((await store.getProfile()).openingChapter.phase==='complete','Chapter did not survive backup restore');
    cases.push('chapter-concurrent-completion-and-backup-restore');
    const point=lat=>({lat,lon:-76,y:10});
    const deliveryRoute={id:'transaction-route',regionId:'test',regionLabel:'Test region',environment:'EARTH',distance:222,turns:1,pickup:point(39),dropoff:point(39.002),pickupCase:point(39),dropoffCase:point(39.002),points:[point(39),point(39.001),point(39.002)],destinationLabel:'Test stop'};
    const driveEvidence=p=>({...p,mode:'drive',speed:0,road:true,continuous:true,environment:'EARTH',regionId:'test'});
    await atomicFailure('failed-delivery-acceptance-is-atomic',()=>store.updateHarborRun({type:'accept',revision:0,route:deliveryRoute}),'profiles');
    let delivery=await store.updateHarborRun({type:'accept',revision:0,route:deliveryRoute});
    await atomicFailure('failed-cargo-load-is-atomic',()=>store.updateHarborRun({type:'load',revision:delivery.revision,evidence:driveEvidence(deliveryRoute.pickup)}),'profiles');
    delivery=await store.updateHarborRun({type:'load',revision:delivery.revision,evidence:driveEvidence(deliveryRoute.pickup)});
    const inTransit=await store.exportData();await store.importData(inTransit);
    check((await store.getProfile()).harborRun.cargo==='in-vehicle','Cargo custody was lost in backup restore');
    for(let i=0;i<deliveryRoute.points.length;i++)delivery=await store.updateHarborRun({type:'reach',revision:delivery.revision,pointIndex:i,evidence:driveEvidence(deliveryRoute.points[i])});
    const unload={type:'unload',revision:delivery.revision,evidence:driveEvidence(deliveryRoute.dropoff)};
    await atomicFailure('failed-delivery-reward-is-atomic',()=>store.updateHarborRun(unload));
    const finishes=await Promise.allSettled([store.updateHarborRun(unload),createIndexedDbDiscoveryProfileStore().updateHarborRun(unload)]);
    check(finishes.filter(r=>r.status==='fulfilled').length===1,'Stale delivery writer was not rejected');
    const deliveryBackup=await store.exportData();await store.importData(deliveryBackup);
    check((await store.getEventsById(['event:campaign-completed:harbor-run:v1'])).length===1,'Delivery receipt duplicated');
    check((await store.getProfile()).harborRun.phase==='complete','Completed delivery did not restore');
    cases.push('delivery-concurrent-unload-cargo-and-backup-restore');
    const {THREE_VIEWS}=await import('/app/js/campaign/three-views.js');
    const canvas=document.createElement('canvas');canvas.width=160;canvas.height=100;const painter=canvas.getContext('2d');
    painter.fillStyle='#337799';painter.fillRect(0,0,160,100);painter.fillStyle='#aa7733';painter.fillRect(20,20,30,40);
    const jpeg=canvas.toDataURL('image/jpeg',.8);
    let photos=(await store.updateThreeViews({type:'accept',revision:0,mode:'photo',regionId:'test',regionLabel:'Test region'})).state;
    photos=(await store.updateThreeViews({type:'choose',revision:photos.revision,subject:{id:'mapped',name:'Mapped subject',regionId:'test',regionLabel:'Test region',position:point(39)}})).state;
    for(const [i,kind] of THREE_VIEWS.kinds.entries()){
      const command={type:'keep',revision:photos.revision,photo:{id:`three-views:${kind}`,kind,width:160,height:100,dataUrl:jpeg},
        view:{kind,subjectId:'mapped',regionId:'test',environment:'EARTH',travelMode:'walk',visible:true,liveGps:false,position:point(39+i*.0002),bearing:i*.4,range:[40,15,50][i],coverage:.4,fingerprint:String(i).repeat(64)}};
      if(i===0)await atomicFailure('failed-photo-document-does-not-advance-job',()=>store.updateThreeViews(command),'profiles');
      photos=(await store.updateThreeViews(command)).state;
    }
    await atomicFailure('failed-photo-receipt-keeps-review-and-all-images',()=>store.updateThreeViews({type:'finish',revision:photos.revision}));
    const photoFinishes=await Promise.allSettled([store.updateThreeViews({type:'finish',revision:photos.revision}),createIndexedDbDiscoveryProfileStore().updateThreeViews({type:'finish',revision:photos.revision})]);
    check(photoFinishes.filter(r=>r.status==='fulfilled').length===1,'Stale album writer accepted');
    const photoBackup=await store.exportData();check(photoBackup.albums[0].photos.length===3,'Export omitted photographs');
    await store.saveProfile(p=>({...p,displayName:'Photographer'}));check((await store.getThreeViewsAlbum()).photos.length===3,'Ordinary profile write erased album');
    const oldClient=await request(indexedDB.open('world-explorer-discovery',5));check(oldClient.version===5,'Album blocked released database client');oldClient.close();
    const missing=structuredClone(photoBackup);missing.albums=[];let rejected=false;try{await store.importData(missing);}catch{rejected=true;}
    check(rejected&&(await store.getThreeViewsAlbum()).photos.length===3,'Missing-media backup overwrote original photos');
    await store.importData(photoBackup);await store.updateThreeViews({type:'delete-photos',revision:(await store.getProfile()).threeViews.revision});
    check((await store.getThreeViewsAlbum()).photos.length===0,'Delete retained images');check((await store.getEventsById([THREE_VIEWS.receiptId])).length===1,'Delete lost or duplicated completion receipt');
    await store.importData(photoBackup);check((await store.getThreeViewsAlbum()).photos.length===3,'Import did not recover pictures');
    await store.rollbackLastImport();check((await store.getThreeViewsAlbum()).photos.length===0,'Rollback did not restore deletion tombstone');
    await store.importData(photoBackup);cases.push('photo-concurrency-ordinary-writes-v5-client-export-delete-import-rollback');
    const workspaceHome={id:'local-home:transactions',locationId:'test',locationLabel:'Test region',workspace:{schemaVersion:1,pose:{x:0,z:0,turn:0},purpose:'journal',rotated:true,undone:true,usedAt:20000},journey:{entered:19000,displayed:20000,departed:21000,returned:22000}};
    await atomicFailure('failed-maker-achievement-is-atomic',()=>store.recordHomeAchievement('maker',workspaceHome));
    await Promise.all([store.recordHomeAchievement('maker',workspaceHome),createIndexedDbDiscoveryProfileStore().recordHomeAchievement('maker',workspaceHome)]);
    check((await store.getEventsById(['event:campaign:useful-place:v1'])).length===1,'Concurrent Maker writers duplicated the receipt');
    await atomicFailure('failed-home-achievement-is-atomic',()=>store.recordHomeAchievement('home',workspaceHome));
    await Promise.all([store.recordHomeAchievement('home',workspaceHome),createIndexedDbDiscoveryProfileStore().recordHomeAchievement('home',workspaceHome)]);
    const homeBackup=await store.exportData();
    check(homeBackup.events.filter(event=>event.eventId==='event:campaign:place-to-return:v1').length===1,'Concurrent home writers duplicated the receipt');
    const invalidHomeBackup=structuredClone(homeBackup);invalidHomeBackup.events=invalidHomeBackup.events.filter(event=>event.eventId!=='event:campaign:useful-place:v1');
    let homeRejected=false;try{await store.importData(invalidHomeBackup);}catch{homeRejected=true;}
    check(homeRejected,'Home backup without its achievement evidence was accepted');
    check((await store.getProfile()).homeAchievements.maker.metadata.homeId===workspaceHome.id,'Rejected backup lost the saved Maker badge');
    await store.importData(homeBackup);
    check((await store.getProfile()).homeAchievements.home.metadata.homeId===workspaceHome.id,'Home achievement did not survive backup restore');
    cases.push('home-and-maker-concurrency-evidence-backup-restore');
    const migrationDb=await request(indexedDB.open('world-explorer-discovery'));const migrationTx=migrationDb.transaction(['migrationBackups'],'readwrite'),migrationDone=done(migrationTx);
    migrationTx.objectStore('migrationBackups').put({id:'character-v1:local-explorer',profile:{id:'local-explorer',displayName:'Historical character'}});await migrationDone;migrationDb.close();
    await atomicFailure('failed-character-rollback-preserves-newer-campaign',()=>store.rollbackCharacterMigration(),'migrationBackups');
    await store.rollbackCharacterMigration();const afterCharacterRollback=await store.exportData();
    check(afterCharacterRollback.profile.threeViews.phase==='complete'&&afterCharacterRollback.albums[0].photos.length===3,'Character rollback discarded new album progress');
    check(afterCharacterRollback.profile.harborRun.phase==='complete'&&afterCharacterRollback.profile.openingChapter.phase==='complete','Character rollback discarded other completed careers');
    check(afterCharacterRollback.profile.homeAchievements.maker.metadata.homeId===workspaceHome.id&&afterCharacterRollback.profile.homeAchievements.home.metadata.homeId===workspaceHome.id,'Character rollback discarded the newer home achievements');
    await store.importData(afterCharacterRollback);cases.push('character-only-rollback-keeps-campaign-photos-and-valid-backup');
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
