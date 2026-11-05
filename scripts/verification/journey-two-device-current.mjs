import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createFieldworkQaSession} from './fieldwork-qa-session.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
const output=path.resolve(`output/verification/player-journey-20261105/two-device-${Date.now()}`),base='http://127.0.0.1:4192/app/';
const qa=await createFieldworkQaSession({output,maximumDurationMs:330000});
const a=qa.page;let contextB,b,created=false;
const email=`journey-${crypto.randomUUID()}@example.test`,password=crypto.randomBytes(24).toString('base64url');
async function setup(page){await page.addInitScript(()=>{if(location.origin!=='http://127.0.0.1:4192'||self!==top)return;window.__jstate=()=>window.__jctx?.getJourneySyncStatus?.();void import('/app/js/shared-context.js?v=55').then(module=>window.__jctx=module.ctx);});await configureStagingAppCheck(page,base,{proxyGeospatial:false});await page.goto(base);await page.locator('#playerEntryScreen').waitFor({state:'visible',timeout:90000});await page.evaluate(async()=>{window.__jctx=(await import('/app/js/shared-context.js?v=55')).ctx;window.__jstate=()=>__jctx.getJourneySyncStatus?.();});await page.waitForFunction(()=>window.__jstate?.()?.status==='local',null,{timeout:30000});}
async function wait(page,status){await page.waitForFunction(status=>[status,'error','recovery'].includes(window.__jstate?.()?.status),status,{timeout:60000});const state=await page.evaluate(()=>window.__jstate?.());assert.equal(state.status,status,state.detail||state.message);console.log('Native save state: '+status);}
async function capture(page){return page.evaluate(async()=>{const {captureJourneySnapshot}=await import('/app/js/player/journey-snapshot.js');const {getCurrentUser}=await import('/js/auth-ui.js?v=56');return captureJourneySnapshot({store:__jctx.discoveryProfileStore,backpackStore:__jctx.playerBackpackStore,ownerUid:getCurrentUser().uid});});}
async function reopen(page){await page.waitForLoadState('domcontentloaded');await page.waitForFunction(()=>typeof window.__jctx!=='undefined'||document.getElementById('playerEntryScreen')!==null,null,{timeout:60000});await page.evaluate(async()=>{window.__jctx=(await import('/app/js/shared-context.js?v=55')).ctx;window.__jstate=()=>__jctx.getJourneySyncStatus?.();});}
async function checkNow(page){await page.evaluate(()=>__jctx.openJourneySync());await page.locator('[data-sync-action=retry]').click();}
async function rename(page,value){await page.evaluate(async value=>{await __jctx.discoveryProfileStore.saveProfile(profile=>({...profile,journeyPreferences:{...profile.journeyPreferences,explorerName:value}}));},value);}
try{
 qa.report.scope='Actual source native application and deployed staging save/auth services, two isolated Chrome contexts, genuine accepted Journal. No duplicate city load or physical field methods replayed.';
 await setup(a);
 const backup=JSON.parse(await fs.readFile('output/verification/cinematic-app-20261105/journey-1793890040223/qa-fieldwork-backup.json','utf8'));
 await a.evaluate(async backup=>{await __jctx.discoveryProfileStore.importData(backup);},backup);
 const uid=await a.evaluate(async()=>{const {ensureGuestSession}=await import('/js/auth-ui.js?v=56');return (await ensureGuestSession()).uid;});
 const linked=await a.evaluate(async({email,password})=>{const {signUpWithEmailPassword}=await import('/js/auth-ui.js?v=56');return (await signUpWithEmailPassword(email,password,'Journey verification')).uid;},{email,password});created=true;assert.equal(linked,uid);
 await wait(a,'choose');await a.screenshot({path:path.join(output,'associate-device-desktop.png')});
 await a.locator('[data-sync-action=device]').click();await a.waitForEvent('domcontentloaded').catch(()=>{});await reopen(a);await wait(a,'saved');
 const original=await capture(a);await fs.writeFile(path.join(output,'original-complete-envelope.json'),JSON.stringify(original)+'\n',{mode:0o600});
 contextB=await a.context().browser().newContext({viewport:{width:390,height:844}});b=await contextB.newPage();b.setDefaultTimeout(15000);b.on('pageerror',error=>qa.report.errors.push(error.message));await setup(b);
 await b.evaluate(async({email,password})=>{const {signInWithEmailPassword}=await import('/js/auth-ui.js?v=56');await signInWithEmailPassword(email,password);},{email,password});
 await b.waitForFunction(()=>['saved','choose'].includes(window.__jstate?.()?.status),null,{timeout:60000});
 if(await b.locator('[data-sync-action=cloud]').isVisible())await b.locator('[data-sync-action=cloud]').click();
 await reopen(b);await wait(b,'saved');
 const second=await capture(b),canonical=await a.evaluate(async({first,second})=>{const {journeyLogicalDigest}=await import('/app/js/player/journey-snapshot.js');return [await journeyLogicalDigest(first),await journeyLogicalDigest(second)];},{first:original,second});
 assert.equal(canonical[0],canonical[1]);assert.deepEqual(second.journal.events,original.journal.events);assert.deepEqual(second.journal.profile.characterState,original.journal.profile.characterState);
 qa.report.restorePrefix={fullEnvelopeMatches:true,eventsAndCharacterUnchanged:true};await fs.writeFile(path.join(output,'restore-prefix.json'),JSON.stringify(qa.report.restorePrefix)+'\n');
 if(!await b.locator('#playerEntryScreen').isVisible())await b.locator('#globeSelectorBackBtn').click();
 if(!await b.locator('#playerEntryScreen [data-entry=progress]').isVisible())await b.locator('#playerEntryScreen [data-entry=menu]').click();
 await b.locator('#playerEntryScreen [data-entry=progress]').click();await b.waitForFunction(()=>document.querySelector('#playerJourney')?.getAttribute('aria-busy')==='false');await b.locator('#playerJourney [data-journey=sync]').click();await b.screenshot({path:path.join(output,'restored-account-phone.png')});await b.locator('[data-sync-action=close]').first().click();
 await rename(a,'First device');await checkNow(a);await wait(a,'saved');
 await rename(b,'Second device');await checkNow(b);await wait(b,'conflict');await b.screenshot({path:path.join(output,'two-device-conflict-phone.png')});
 assert.equal((await capture(b)).journal.profile.journeyPreferences.explorerName,'Second device');
 await b.locator('[data-sync-action=cloud]').click();await reopen(b);await wait(b,'saved');assert.equal((await capture(b)).journal.profile.journeyPreferences.explorerName,'First device');
 qa.report.crossDevice={anonymousOwnerPreserved:true,fullEnvelopeMatches:true,eventsAndCharacterUnchanged:true,explicitConflict:true,cloudChoiceRestored:true,deviceContexts:2};
 // Read the synthetic save through the authenticated boundary; raw object access
 // must fail even when its otherwise unguessable object name is known.
 qa.report.privateObject=await a.evaluate(async()=>{const {postProtectedFunction}=await import('/js/function-api.js');const {getCurrentUser}=await import('/js/auth-ui.js?v=56');const uid=getCurrentUser().uid,head=await postProtectedFunction('/syncExplorerJourney',{action:'head',expectedOwnerUid:uid});const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(uid))),b=>b.toString(16).padStart(2,'0')).join('');const url='https://storage.googleapis.com/we3d-staging-20260712.firebasestorage.app/player-journeys/'+hash+'/'+head.current.snapshotId+'/0.bin';try{const r=await fetch(url,{credentials:'omit'});return {url,status:r.status,public:r.ok};}catch{return {url,corsDenied:true};}});
 const raw=await fetch(qa.report.privateObject.url,{credentials:'omit'});qa.report.privateObject={unauthenticatedStatus:raw.status};assert.ok([403,404].includes(raw.status));
 qa.report.endpointGuards=await a.evaluate(async()=>{const {getCurrentUserToken,getCurrentUser}=await import('/js/auth-ui.js?v=56');const endpoint='https://us-central1-we3d-staging-20260712.cloudfunctions.net/syncExplorerJourney',body=JSON.stringify({action:'head',expectedOwnerUid:getCurrentUser().uid});const missingAuth=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body});const missingCheck=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await getCurrentUserToken()},body});return {missingAuth:missingAuth.status,missingAppCheck:missingCheck.status};});assert.deepEqual(qa.report.endpointGuards,{missingAuth:401,missingAppCheck:401});await qa.succeed();
}catch(error){qa.report.syncState=await a.evaluate(()=>window.__jstate?.()).catch(()=>null);if(b){qa.report.secondSyncState=await b.evaluate(()=>window.__jstate?.()).catch(()=>null);await b.screenshot({path:path.join(output,'second-device-failed.png')}).catch(()=>{});}await qa.fail(error);process.exitCode=1;}
finally{
 if(created){try{await a.evaluate(async({email,password})=>{const {signInWithEmailPassword}=await import('/js/auth-ui.js?v=56');await signInWithEmailPassword(email,password);const {postProtectedFunction}=await import('/js/function-api.js');await postProtectedFunction('/deleteAccount',{confirmation:'DELETE'},{timeoutMs:120000});},{email,password});await fs.writeFile(path.join(output,'synthetic-account-cleanup.json'),JSON.stringify({deleted:true})+'\n');}catch{await fs.writeFile(path.join(output,'synthetic-account-cleanup.json'),JSON.stringify({deleted:false,reason:'Retry cleanup using the owned verification account.'})+'\n');process.exitCode=1;}}
 await contextB?.close();await qa.close();
}
