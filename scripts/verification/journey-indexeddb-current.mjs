import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createFieldworkQaSession} from './fieldwork-qa-session.mjs';
const output=path.resolve(`output/verification/player-journey-20261105/indexeddb-${Date.now()}`);
const qa=await createFieldworkQaSession({output,maximumDurationMs:90000});
try{
 const {page,report}=qa;
 report.scope='Actual Chrome IndexedDB, Web Locks and localStorage owners; genuine accepted Journal imported into disposable browser. Controlled quota failure only, no cloud/world acceptance claimed.';
 await page.route('**/journey-storage-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Journey save verification</title>'}));
 await page.goto('http://127.0.0.1:4192/journey-storage-fixture');
 const backup=JSON.parse(await fs.readFile('output/verification/cinematic-app-20261105/journey-1793890040223/qa-fieldwork-backup.json','utf8'));
 report.storage=await page.evaluate(async backup=>{
  const {createIndexedDbDiscoveryProfileStore}=await import('/app/js/discovery/profile-store.js?v=5');
  const {createLocalBackpackStore}=await import('/app/js/player/backpack-store.js');
  const {captureJourneySnapshot,journeyLogicalDigest,createJourneyRestoreOwner}=await import('/app/js/player/journey-snapshot.js');
  const store=createIndexedDbDiscoveryProfileStore(),bag=createLocalBackpackStore(localStorage);await bag.ready;
  await store.importData(backup);bag.load();
  if(!bag.restoreJourneySnapshot({schemaVersion:3,items:[],housing:null,commerce:{schemaVersion:4,credits:3210}}))throw Error('Original Backpack commit failed');
  const original=await captureJourneySnapshot({store,backpackStore:bag,ownerUid:'account-a'});
  let binding={ownerUid:'account-a'},reloads=0,fail=true;
  const storage={getItem:key=>localStorage.getItem(key),removeItem:key=>localStorage.removeItem(key),setItem:(key,value)=>{if(fail&&key==='worldExplorer3D.lastLocation.v1')throw new DOMException('Controlled quota failure','QuotaExceededError');localStorage.setItem(key,value);}};
  const restore=createJourneyRestoreOwner({store,backpackStore:bag,storage,readBinding:()=>binding,writeBinding:value=>binding=value,reload:()=>reloads++});
  const target=structuredClone(original);target.deviceState.local['worldExplorer3D.lastLocation.v1']=JSON.stringify({lat:39.2904,lon:-76.6122});
  target.journal.profile.journeyPreferences.explorerName='Recovered journey';
  let rejected=false;try{await restore.restore(target,{ownerUid:'account-a'});}catch(error){rejected=error.name==='QuotaExceededError';}
  if(!rejected||(await restore.pending()).phase!=='prepared'||reloads!==0)throw Error('Partial restore lost its recovery gate');
  const marker=await restore.pending();fail=false;await restore.finish(marker);
  const recovered=await captureJourneySnapshot({store,backpackStore:bag,ownerUid:'account-a'});
  if(await journeyLogicalDigest(recovered)!==await journeyLogicalDigest(target))throw Error('Original IndexedDB restore changed player outcomes');
  let denied=false;try{await store.rollbackLastImport({ownerUid:'account-b'});}catch{denied=true;}
  if(!denied)throw Error('Cross-account Journal undo was admitted');
  await restore.rollback(marker,{ownerUid:'account-a'});
  const rolledBack=await captureJourneySnapshot({store,backpackStore:bag,ownerUid:'account-a'});
  if(await journeyLogicalDigest(rolledBack)!==await journeyLogicalDigest(original))throw Error('Recovery did not restore original owners');
  return {quotaFailureGated:true,finishedRestoreMatches:true,originalBackpackCredits:rolledBack.deviceState.backpack.commerce.credits,eventsUnchanged:rolledBack.journal.events.length===backup.events.length,crossAccountUndoDenied:denied,rollbackMatches:true,reloads};
 },backup);
 assert.equal(report.storage.rollbackMatches,true);await qa.succeed();
}catch(error){await qa.fail(error);process.exitCode=1;}finally{await qa.close();}
