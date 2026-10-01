// Actual source world + field recording and Journal UI. Position placement is
// bounded test setup, not a claim of an uncoached navigation/usability test.
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {stagingCaptureAttestation} from './staging-capture-attestation.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
const out=process.env.WE3D_SANDBOX_FLOWER_ONLY === '1' ? 'output/verification/sandbox-flower-result' : 'output/verification/sandbox-first-session';
await mkdir(out,{recursive:true});
const privateDir=await mkdtemp(path.join(tmpdir(),'we3d-sandbox-'));
let identity,server,browser,page;
const errors=[];const failedLocal=[];
const report={ok:false,evidence:'Earth runtime; real field procedure and DOM actions; target placement is test setup',runtimeRoot:process.env.WE3D_VERIFY_ROOT||'.',checks:{}};
try {
 identity=await stagingCaptureAttestation();
 const credential=path.join(privateDir,'credential.json');
 await writeFile(credential,JSON.stringify({projectId:'we3d-staging-20260712',appId:'1:524178734996:web:f59acbc9014f0e26f51981',expiresAt:new Date(Date.now()+600000).toISOString(),token:identity.token}),{mode:0o600});
 process.env.WE3D_STAGING_APP_CHECK_FILE=credential;
 server=await startStaticServer({rootDir:process.env.WE3D_VERIFY_ROOT||process.cwd(),ports:[4476]});
 const base=`http://127.0.0.1:${server.port}`;
 browser=await chromium.launch({headless:true,channel:'chrome'});
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 page=await context.newPage();
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)failedLocal.push({url:r.url(),status:r.status()});});
 await configureStagingAppCheck(page,base);
 const url=`${base}/app/?loc=custom&lat=39.2904&lon=-76.6122&lname=Baltimore&launch=earth&gm=free&mode=walking`;
 const ready=async()=>{
  await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__,null,{timeout:120000});
  if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
  if(await page.locator('#globeSelectorStartBtn').isVisible())await page.locator('#globeSelectorStartBtn').click();
  await page.waitForFunction(()=>{const d=globalThis.getWorldExplorerRuntimeDiagnostics?.();return d?.gameStarted&&!d.worldLoading&&d.worldDiscovery?.active&&!document.getElementById('loading')?.classList.contains('show');},null,{timeout:180000});
  await page.evaluate(async()=>{globalThis.__sandboxTestContext=(await import('/app/js/shared-context.js?v=55')).ctx;});
 };
 await page.goto(url,{waitUntil:'domcontentloaded'});await ready();
 await page.evaluate(async()=>{const{ctx}=await import('/app/js/shared-context.js?v=55');ctx.setTimeOfDay?.('day');ctx.setWeatherMode?.('clear');});
 if(process.env.WE3D_SANDBOX_FLOWER_ONLY !== '1') {
 await page.locator('#exploreBtn').click();await page.locator('#fWorldDiscovery').click();
 await page.locator('[data-sandbox-path="explore"]').click();
 assert.match(await page.locator('#sandboxPathSteps').innerText(), /record the finding/);
 await page.screenshot({path:`${out}/desktop-walkthrough.png`});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:`${out}/mobile-walkthrough.png`});
 assert.equal(await page.locator('#discoveryPanel').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
 await page.setViewportSize({width:1440,height:900});
 await page.locator('#discoveryFirstJourneyBtn').click();
 assert.equal(await page.evaluate(()=>globalThis.__sandboxTestContext.getTutorialSnapshot().completed),false);
 // Route selection uses the real field plan and entitlement checks.
 await page.evaluate(async()=>{const{ctx}=await import('/app/js/shared-context.js?v=55');ctx.openWorldDiscoverySection('today');});
 await page.locator('.discoveryTodayRoute summary').click();
 const objective=await page.locator('[data-field-objective]:not([disabled])').first().getAttribute('data-field-objective');
 assert.ok(objective,'World must supply a valid field opportunity');
 await page.locator(`[data-field-objective="${objective}"]`).click();
 const setup=await page.evaluate(async id=>{
  const{ctx}=await import('/app/js/shared-context.js?v=55');const state=ctx.worldDiscoveryRuntime;
  const slot=state.publication.fieldActivities.slots.find(s=>s.id===id);
  if(ctx.Walk?.state?.mode!=='walk')ctx.toggleWalkDriveMode?.();
  const actor=ctx.Walk?.state?.walker; if(!actor)throw Error('Walking actor unavailable');
  Object.assign(actor,{x:slot.position.x,z:slot.position.z});
  return {slotId:id,activityId:slot.activityId,phase:state.fieldSession.snapshot(actor).phase};
 },objective);
 report.setup=setup;
 await page.waitForFunction(()=>globalThis.getWorldExplorerRuntimeDiagnostics?.().worldDiscovery?.interaction?.phase==='revealed',null,{timeout:45000});
 await page.evaluate(async()=>{const{ctx}=await import('/app/js/shared-context.js?v=55');ctx.openWorldDiscoverySection('today');});
 await page.locator('#discoveryPrimaryBtn').click();
 await page.waitForFunction(()=>globalThis.__sandboxTestContext.getTutorialSnapshot()?.stage==='review',null,{timeout:20000});
 const result=await page.evaluate(async()=>{const{ctx}=await import('/app/js/shared-context.js?v=55');return ctx.getTutorialSnapshot().result;});
 report.tutorial=await page.evaluate(async()=>{const{ctx}=await import('/app/js/shared-context.js?v=55');return {snapshot:ctx.getTutorialSnapshot(),saved:JSON.parse(localStorage.getItem('worldExplorer3D.tutorialState.v6')||'null'),resultText:document.getElementById('discoveryResultCard')?.textContent};});
 assert.ok(result?.eventId,JSON.stringify(report.tutorial));report.result=result;
 assert.match(await page.locator('#discoveryResultCard').innerText(),/Journal saved in this browser on this device/);
 await page.screenshot({path:`${out}/desktop-result.png`});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:`${out}/mobile-result.png`});
 const resultButton=await page.locator('[data-result-tab="journal"]').boundingBox();assert.ok(resultButton.height>=44,'Result action must be touch-sized');
 const overflow=await page.locator('#discoveryPanel').evaluate(e=>e.scrollWidth>e.clientWidth+1);assert.equal(overflow,false);
 await page.locator('[data-result-tab="journal"]').click();
 await page.waitForFunction(()=>globalThis.__sandboxTestContext.getTutorialSnapshot().completed);
 assert.ok((await page.locator('#discoveryJournalList').innerText()).includes(result.name));
 await page.screenshot({path:`${out}/mobile-journal.png`});
 report.checks.touchSizedResultAction=true;report.checks.actualFieldResultReviewed=true;report.checks.mobileNoPanelOverflow=true;
 await page.locator('#discoveryCloseBtn').click();await page.locator('#realEstateFloatBtn').click();
 assert.equal(await page.locator('#fQuickBuild').isVisible(),true);
 await page.screenshot({path:`${out}/mobile-build-menu.png`});
 report.checks.buildDiscoverable=true;
 await page.locator('#realEstateFloatBtn').click();
 await page.setViewportSize({width:1440,height:900});
 await page.evaluate(()=>{globalThis.__sandboxTestContext.restartTutorial();globalThis.__sandboxTestContext.openWorldDiscoverySection('today');});
 await page.locator('[data-sandbox-path="build"]').click();
 await page.locator('#sandboxPathStart').click();
 await page.locator('#blockBuilderUndo').waitFor({state:'visible'});
 const placeAt=await page.evaluate(()=>{
  const canvas=globalThis.__sandboxTestContext.renderer.domElement;
  const rect=canvas.getBoundingClientRect();
  for(const yr of [.58,.66,.50,.74])for(const xr of [.44,.52,.36,.60]){
   const x=rect.left+rect.width*xr,y=rect.top+rect.height*yr;
   if(document.elementFromPoint(x,y)===canvas)return{x,y};
  }
  return null;
 });
 assert.ok(placeAt,'Building must leave canvas available');
 await page.mouse.click(placeAt.x,placeAt.y);
 await page.waitForFunction(()=>globalThis.__sandboxTestContext.getBlockBuilderSnapshot().count===1,null,{timeout:15000});
 await page.waitForFunction(()=>globalThis.__sandboxTestContext.getTutorialSnapshot().stage==='review');
 const buildResult=await page.evaluate(()=>globalThis.__sandboxTestContext.getTutorialSnapshot().result);
 assert.match(buildResult.name,/block/i);
 await page.screenshot({path:`${out}/desktop-build-result.png`});
 await page.locator('#blockBuilderUndo').click();
 await page.waitForFunction(()=>globalThis.__sandboxTestContext.getBlockBuilderSnapshot().count===0);
 await page.mouse.click(placeAt.x,placeAt.y);
 await page.waitForFunction(()=>globalThis.__sandboxTestContext.getBlockBuilderSnapshot().count===1);
 await page.locator('#blockBuilderClose').click();
 await page.evaluate(()=>globalThis.__sandboxTestContext.openWorldDiscoverySection('today'));
 assert.match(await page.locator('#discoveryResultCard').innerText(),/Journal updated/);
 assert.equal(await page.locator('[data-result-tab="guide"]').count(),0,'Building must not claim a Field Guide update');
 await page.locator('[data-result-tab="journal"]').click();
 await page.waitForFunction(()=>globalThis.__sandboxTestContext.getTutorialSnapshot().completed);
 report.checks.buildPlaceUndoAndJournal=true;
 await page.evaluate(()=>globalThis.__sandboxTestContext.openWorldDiscoverySection('today'));
 await page.locator('[data-sandbox-path="together"]').click();
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:`${out}/mobile-together-walkthrough.png`});
 assert.match(await page.locator('#sandboxPathSteps').innerText(),/Joining a room alone does not finish/);
 await page.locator('#sandboxPathStart').click();
 await page.locator('#roomPanelModal').waitFor({state:'visible',timeout:20000});
 report.checks.roomEntryOpens=true;
 await page.locator('#roomPanelCloseBtn').click();
 await page.evaluate(()=>globalThis.__sandboxTestContext.openWorldDiscoverySection('today'));
 await page.locator('#sandboxHomes').click();
 await page.locator('#propertyPanel.show').waitFor({state:'visible'});
 await page.screenshot({path:`${out}/mobile-property-entry.png`});
 await page.locator('#closePropertyPanelBtn').click();
 await page.evaluate(()=>globalThis.__sandboxTestContext.openWorldDiscoverySection('today'));
 await page.locator('#sandboxNearbyActivities').click();
 await page.locator('#activityDiscoveryCloseBtn').waitFor({state:'visible'});
 await page.locator('#activityDiscoveryCloseBtn').click();
 report.checks.propertyAndNearbyEntry=true;


 await page.reload({waitUntil:'domcontentloaded'});await ready();
 const restored=await page.evaluate(async id=>{const{ctx}=await import('/app/js/shared-context.js?v=55');return {completed:ctx.getTutorialSnapshot().completed,hasRecord:(await ctx.discoveryProfileStore.listEvents()).some(e=>e.eventId===id)};},result.eventId);
 assert.equal(await page.evaluate(()=>globalThis.__sandboxTestContext.getTutorialSnapshot().selectedPath),'together');
 await page.evaluate(async()=>{await globalThis.__sandboxTestContext.ensureBlockBuilderReady();});
 assert.equal(await page.evaluate(()=>globalThis.__sandboxTestContext.getBlockBuilderSnapshot().count),1,'Solo block survives reload');
 assert.deepEqual(restored,{completed:true,hasRecord:true});report.checks.savedAndReloaded=true;

 }
 report.flowerSetup=await page.evaluate(async()=>{
  const ctx=globalThis.__sandboxTestContext;
  globalThis.__sandboxSavedResults=[];
  globalThis.addEventListener('we3d:explorer-result-saved',event=>globalThis.__sandboxSavedResults.push({...event.detail,hudAtReceipt:document.getElementById('flowerChallengeHudStatus')?.textContent}));
  if(!await ctx.startFlowerChallenge('verification'))throw Error('Flower Sprint could not start');
  const marker=ctx.scene.getObjectByName('redFlowerChallenge');
  if(!marker)throw Error('Flower marker missing');
  // Explicit target placement tests the live completion/receipt path, not route comprehension.
  Object.assign(ctx.Walk.state.walker,{x:marker.position.x,y:marker.position.y,z:marker.position.z});
  return {mode:ctx.Walk.state.mode,droneMode:ctx.droneMode,walker:{x:ctx.Walk.state.walker.x,y:ctx.Walk.state.walker.y,z:ctx.Walk.state.walker.z},marker:{x:marker.position.x,y:marker.position.y,z:marker.position.z}};
 });
 await page.waitForFunction(()=>globalThis.__sandboxSavedResults.some(result=>result.name==='Flower Sprint completed'),null,{timeout:20000});
 await page.evaluate(()=>globalThis.__sandboxTestContext.openWorldDiscoverySection('today'));
 assert.match(await page.locator('#discoveryResultCard').innerText(),/Flower Sprint completed/i);
 await page.screenshot({path:`${out}/flower-result.png`});
 assert.equal(await page.evaluate(()=>globalThis.__sandboxSavedResults.filter(result=>result.name==='Flower Sprint completed').length),1,'One completion publishes one receipt');
 assert.match(await page.evaluate(()=>globalThis.__sandboxSavedResults.find(result=>result.name==='Flower Sprint completed').hudAtReceipt),/Flower found/,'The HUD must acknowledge completion before the Journal receipt');
 report.checks.flowerSprintReceipt=true;
 report.errors=errors;report.failedLocal=failedLocal;assert.deepEqual(errors,[]);assert.deepEqual(failedLocal,[]);
 report.ok=true;
} catch(error){report.errors=errors;report.failedLocal=failedLocal;report.error=String(error.stack||error);if(page){await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});report.state=await page.evaluate(()=>{const d=globalThis.getWorldExplorerRuntimeDiagnostics?.();return {worldLoading:d?.worldLoading,environment:d?.environment,interaction:d?.worldDiscovery?.interaction,loading:document.getElementById('loading')?.textContent,flower:{mode:globalThis.__sandboxTestContext?.Walk?.state?.mode,walker:{x:globalThis.__sandboxTestContext?.Walk?.state?.walker?.x,y:globalThis.__sandboxTestContext?.Walk?.state?.walker?.y,z:globalThis.__sandboxTestContext?.Walk?.state?.walker?.z},marker:globalThis.__sandboxTestContext?.scene?.getObjectByName('redFlowerChallenge')?.position,backend:globalThis.__sandboxTestContext?.getFlowerChallengeBackendStatus?.(),receipts:globalThis.__sandboxSavedResults}};}).catch(()=>null);}throw error;}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser?.close();await server?.close();try{await identity?.cleanup();}finally{await rm(privateDir,{recursive:true,force:true});}}
console.log(JSON.stringify(report,null,2));
