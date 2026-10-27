import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';
import {collectBrowserGraphicsErrors} from './browser-graphics-errors.mjs';
import {SHIP_STATIONS} from '../../app/js/expedition/ship-layout.js';
const out=path.resolve(process.env.WE3D_LUNAR_OUTPUT||'output/roadmap-20261010/lunar-field-mission');await fs.mkdir(out,{recursive:true});
const server=await startStaticServer({rootDir:process.env.WE3D_VERIFY_ROOT||process.cwd(),ports:[4399]});const base=`http://127.0.0.1:${server.port}`;
const browser=await chromium.launch({channel:'chrome',headless:false});const context=await browser.newContext({viewport:{width:1360,height:850}});const page=await context.newPage();
const cases=[],failures=[],consoleErrors=[];let result=null;
const strategy=process.env.WE3D_LUNAR_STRATEGY==='observe'?'observe':'samples';
let failAscent=process.env.WE3D_LUNAR_FAIL_ASCENT==='1';
collectBrowserGraphicsErrors(page, failures);
page.on('pageerror',e=>failures.push(e.stack||e.message));page.on('console',m=>{if((m.type()==='error'||m.type()==='warning'&&/interior|interaction|pod|surface/i.test(m.text()))&&consoleErrors.length<40)consoleErrors.push(m.text().slice(0,1500));});
page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)failures.push(`${r.status()} ${r.url()}`);});
const state=()=>page.evaluate(()=>({hint:lunarCtx.interiorHint,focused:document.activeElement?.outerHTML.slice(0,300),journey:lunarCtx.spaceJourney,canvas:lunarCtx.renderer?.domElement?.outerHTML.slice(0,300),env:lunarCtx.getEnv(),mission:lunarCtx.getDestinationMissionSnapshot(),expedition:lunarCtx.getInterstellarExpeditionSnapshot(),ship:lunarCtx.getShipInteriorSnapshot?.(),field:lunarCtx.planetaryFieldActivitySnapshot?.(),pause:lunarCtx.paused,space:{destination:lunarCtx.spaceFlight.destination,mode:lunarCtx.spaceFlight.mode,active:lunarCtx.spaceFlight.active},panel:document.getElementById('shipStationPanel')?.textContent}));
async function station(id){console.log('Station:',id);
 await page.evaluate(s=>{lunarCtx.switchSolisReachDeck(s.deckId);Object.assign(lunarCtx.Walk.state.walker,{x:s.x,z:s.z,y:1.74,angle:0,yaw:0,lookYawOffset:0,pitch:0,vy:0,onGround:true});},SHIP_STATIONS.find(s=>s.id===id));
 await page.waitForTimeout(300);await page.keyboard.press('KeyE');
}
async function land(){console.log('Deploy and land');
 await station('craft-bay-status');await page.locator('[data-pod-mission]').click();
 await page.waitForFunction(()=>lunarCtx.getInterstellarExpeditionSnapshot()?.podJourney?.phase==='local_flight',null,{timeout:30000});
 assert.equal(await page.evaluate(()=>lunarCtx.spaceFlight.destination.toLowerCase()),'moon');
 const advanced=await page.evaluate(()=>{
  lunarCtx.engageRenderedJourneyAssist();
  for(let i=0;i<2400&&lunarCtx.spaceJourney?.phase!=='approach';i++)lunarCtx.updateRenderedSpaceJourney({realDtS:.1});
  return {phase:lunarCtx.spaceJourney?.phase,assist:lunarCtx.spaceJourneyAssistState};
 });
 assert.equal(advanced.phase,'approach',JSON.stringify(advanced));
 await page.waitForFunction(()=>document.getElementById('sfLandBtn')?.disabled===false,null,{timeout:12000});await page.locator('#sfLandBtn').click();
 await page.waitForFunction(()=>lunarCtx.getEnv()==='MOON'&&lunarCtx.moonSurface?.userData.ready&&lunarCtx.getInterstellarExpeditionSnapshot()?.podJourney?.phase==='surface',null,{timeout:60000});
 await page.evaluate(()=>lunarCtx.setTravelMode('walk',{source:'lunar-verification',force:true,emitTutorial:false}));
 await page.waitForFunction(()=>lunarCtx.Walk.state.mode==='walk'&&!lunarCtx.paused);await page.waitForTimeout(400);
}
async function record(id,failFirst=false){console.log('Field:',id);
 await page.evaluate(id=>{const a=lunarCtx.planetaryFieldActivitySnapshot().activities.find(a=>a.evidenceId===id);Object.assign(lunarCtx.Walk.state.walker,{x:a.x+2,z:a.z,y:a.y+1.74,vy:0,onGround:true,angle:0,yaw:0});},id);
 await page.waitForTimeout(220);
 const clearance=await page.evaluate(()=>{const w=lunarCtx.Walk.state.walker,ray=new THREE.Raycaster(new THREE.Vector3(w.x,w.y+100,w.z),new THREE.Vector3(0,-1,0));lunarCtx.moonSurface.updateMatrixWorld();const hit=ray.intersectObject(lunarCtx.moonSurface)[0];return hit?w.y-(lunarCtx.Walk.CFG.eyeHeight||1.7)-hit.point.y:null;});
 assert.ok(clearance!==null&&Math.abs(clearance)<.15,`Visible terrain/feet disagreement: ${clearance}`);
 if(failFirst)await page.evaluate(()=>{const original=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(stores,mode,...rest){if(this.name==='world-explorer-discovery'&&mode==='readwrite'&&Array.from(stores).includes('claims')){IDBDatabase.prototype.transaction=original;throw new DOMException('Verification quota','QuotaExceededError');}return original.call(this,stores,mode,...rest);};});
 for(let i=0;i<3;i++){assert.equal(await page.evaluate(()=>lunarCtx.handlePrimaryContextInteraction()),!(failFirst&&i===2));await page.waitForTimeout(100);}
 if(failFirst){assert.equal((await state()).mission.evidence.includes(id),false);assert.equal(await page.evaluate(()=>lunarCtx.handlePrimaryContextInteraction()),true);cases.push('failed-field-save-retries-without-award');}
 await page.waitForFunction(id=>lunarCtx.getDestinationMissionSnapshot().evidence.includes(id),id);
}
async function recover(){console.log('Recover');
 await page.evaluate(async()=>{const pod=lunarCtx.scene.children.find(child=>child.userData?.bodyId==='moon'&&Number.isFinite(child.userData.surfaceGroundY));if(!pod)throw Error('Published lunar recovery pod missing');await pod.userData.curatedPodLoadPromise;Object.assign(lunarCtx.Walk.state.walker,{x:pod.position.x+2,z:pod.position.z,y:pod.userData.surfaceGroundY+1.74,vy:0,onGround:true});});
 await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>lunarCtx.handlePrimaryContextInteraction()),true);
 if(failAscent){
  const prior=(await state()).expedition.podJourney.id;
  await page.evaluate(()=>{const original=lunarCtx.startSpaceFlightFromExpeditionSurface;lunarCtx.startSpaceFlightFromExpeditionSurface=(...args)=>{lunarCtx.startSpaceFlightFromExpeditionSurface=original;throw Error('Injected pre-departure failure');};});
  await page.locator('[data-surface-launch]').click();
  await page.waitForFunction(()=>!lunarCtx.surfacePodLaunchSnapshot&&lunarCtx.getInterstellarExpeditionSnapshot()?.podJourney?.phase==='surface',null,{timeout:20000});
  assert.equal((await state()).env,'MOON');assert.equal((await state()).expedition.podJourney.id,prior);assert.equal((await state()).pause,false);
  assert.equal(await page.evaluate(()=>lunarCtx.handlePrimaryContextInteraction()),true);failAscent=false;cases.push('throwing-ascent-restores-same-pod-control-and-allows-retry');
 }
 await page.locator('[data-surface-launch]').click();
 await page.waitForFunction(()=>lunarCtx.getEnv()==='SPACE_FLIGHT'&&lunarCtx.getInterstellarExpeditionSnapshot()?.podJourney?.phase==='rendezvous',null,{timeout:35000});
 await page.waitForFunction(()=>!!lunarCtx.getExpeditionPodDockingTarget?.()?.position,null,{timeout:10000});await page.waitForTimeout(1000);
 await page.evaluate(()=>{const target=lunarCtx.getExpeditionPodDockingTarget();lunarCtx.spaceFlight.rocket.position.copy(target.position).add(new THREE.Vector3(0,0,Math.max(2,target.radius*.25)));lunarCtx.spaceFlight.velocity.set(0,0,0);lunarCtx.spaceFlight.gravityVelocity?.set(0,0,0);lunarCtx.spaceFlight.speed=0;});
 await page.waitForFunction(()=>document.getElementById('sfLandBtn')?.disabled===false);await page.locator('#sfLandBtn').click();
 await page.waitForFunction(()=>lunarCtx.getInterstellarExpeditionSnapshot()?.podJourney?.phase==='recovered'&&lunarCtx.getShipInteriorSnapshot?.()?.active,null,{timeout:30000});
}
try{
 await configureStagingAppCheck(page,base);await page.goto(`${base}/app/?launch=space`,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>document.getElementById('startBtn')?.disabled===false,null,{timeout:120000});
 if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
 await page.evaluate(()=>{document.getElementById('spaceLaunchToggle')?.click();document.getElementById('startBtn').click();});
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text?.()||'{}').modes?.space===true,null,{timeout:120000});
 if(await page.locator('#spaceFlightHUD').evaluate(e=>e.classList.contains('collapsed')))await page.locator('#sfHudToggle').click();
 await page.locator('#sfExpeditionBtn').click();await page.locator('#expeditionPlan').click();
 await page.waitForFunction(()=>document.querySelector('.expeditionSummary .is-ready')?.textContent?.includes('READY'));
 await page.locator('#expeditionEnterShip').click();
 await page.evaluate(async()=>{window.lunarCtx=(await import((globalThis.__WORLD_EXPLORER_PRODUCTION__?.sharedModulePrefix||'')+'/app/js/shared-context.js?v=55')).ctx;});
 await page.waitForFunction(()=>lunarCtx.getShipInteriorSnapshot?.()?.active===true,null,{timeout:30000});
 const original=(await state()).expedition;await station('navigation-course');await page.locator('[data-lunar-brief]').click();await page.locator('[data-mission-begin]').click();await page.locator('[data-mission-close]').click();
 assert.equal((await state()).mission.phase,'approach');cases.push('physical-navigation-station-begins-local-moon-mission');
 await station('craft-bay-status');assert.equal(await page.locator('[data-pod-mission]').count(),0);await page.locator('[data-close-station]').click();
 await station('science-survey');await page.locator(`[data-lunar-prepare="${strategy}"]`).click();
 await page.waitForFunction(strategy=>lunarCtx.getDestinationMissionSnapshot()?.preparation?.strategy===strategy,strategy);
 assert.equal((await state()).mission.preparation.expeditionId,original.id);cases.push('physical-science-station-saves-method-and-gates-unprepared-launch');
 await page.screenshot({path:path.join(out,'lunar-kit-prepared.png')});await page.locator('[data-close-station]').click();
 await land();let snapshot=await state();assert.equal(snapshot.mission.phase,'fieldwork');assert.equal(snapshot.field.activities.length,4);assert.equal(snapshot.expedition.destinationId,original.destinationId);assert.equal(snapshot.expedition.id,original.id);assert.equal(snapshot.expedition.state,'planned');cases.push('pod-launch-solar-course-native-lroc-landing-preserves-interstellar-plan');
 const pausedPower=await page.evaluate(()=>{lunarCtx.setPauseReason('lunar-verification',true);if(!lunarCtx.paused)throw Error('Pause authority did not pause');const before=lunarCtx.getLunarFieldPower().remainingS;for(let i=0;i<240;i++)lunarCtx.updateLunarFieldPower(.25);const after=lunarCtx.getLunarFieldPower().remainingS;lunarCtx.setPauseReason('lunar-verification',false);return {before,after};});assert.equal(pausedPower.after,pausedPower.before);
 await page.evaluate(()=>{const original=Storage.prototype.setItem;window.powerFault=false;Storage.prototype.setItem=function(key,value){if(key==='world-explorer:interstellar-expedition:v1'){Storage.prototype.setItem=original;window.powerFault=true;throw new DOMException('Verification battery quota','QuotaExceededError');}return original.call(this,key,value);};for(let i=0;i<100;i++)lunarCtx.updateLunarFieldPower(.25);});
 assert.equal(await page.evaluate(()=>window.powerFault&&lunarCtx.getLunarFieldPower().saveBlocked),true);
 await page.waitForFunction(()=>!document.getElementById('lunarPowerRetry')?.hidden);await page.locator('#lunarPowerRetry').click();assert.equal(await page.evaluate(()=>lunarCtx.getLunarFieldPower().saveBlocked),false);cases.push('instrument-power-pauses-and-recovers-from-real-save-failure');
 await page.screenshot({path:path.join(out,'lunar-arrival.png')});
 await record('mare-context',true);const firstPod=(await state()).expedition.podJourney.id;
 await page.evaluate(()=>{for(let i=0;i<4801;i++)lunarCtx.updateLunarFieldPower(.25);});
 assert.equal(await page.evaluate(()=>lunarCtx.getLunarFieldPower().canSurvey),false);assert.equal(await page.evaluate(()=>lunarCtx.handlePrimaryContextInteraction()),false);
 await page.waitForFunction(()=>document.getElementById('lunarFieldPower')?.textContent.includes('measurements paused'));await page.screenshot({path:path.join(out,'lunar-power-return.png')});cases.push('empty-instrument-battery-stops-measurements-and-retains-surface-return');
 await recover();assert.equal((await state()).expedition.podJourney.id,firstPod);assert.deepEqual((await state()).mission.evidence,['mare-context']);cases.push('same-pod-partial-recovery-keeps-field-record');
 await land();assert.ok(await page.evaluate(()=>lunarCtx.getLunarFieldPower().remainingS)>1150);assert.notEqual((await state()).expedition.podJourney.id,firstPod);cases.push('new-sortie-recharges-instruments-without-resetting-evidence');await record('mare-context');assert.deepEqual((await state()).mission.evidence,['mare-context']);cases.push('repeated-panorama-does-not-complete-other-site');
 await record(strategy==='observe'?'mare-observation':'mare-sample');await record('fragment-context');await record(strategy==='observe'?'fragment-observation':'fragment-sample');
 snapshot=await state();assert.equal(snapshot.mission.phase,'analysis');assert.equal(await page.evaluate(()=>(lunarCtx.playerBackpackInventory?.snapshot().items || []).filter(i=>i.catalogId.startsWith('lunar-field-book:')).length),strategy==='observe'?0:2);cases.push(strategy==='observe'?'two-sites-four-optical-records-no-collected-material':'two-separated-sites-four-records-two-sealed-backpack-specimens');
 await page.screenshot({path:path.join(out,'lunar-second-site.png')});
 await page.evaluate(()=>{lunarCtx.renderer.domElement.dataset.lunarVerification='true';window.savedRender=window.render_game_to_text;window.savedAdvance=window.advanceTime;});
 await runPrescribedGameActions(page,out,[{buttons:[],frames:3}],'canvas[data-lunar-verification]');
 await page.evaluate(()=>{window.render_game_to_text=window.savedRender;window.advanceTime=window.savedAdvance;});
 await page.setViewportSize({width:412,height:915});await page.waitForFunction(()=>!document.querySelector('#solidWorldPanel details')?.open);cases.push('phone-resize-collapses-map-without-covering-world');await page.screenshot({path:path.join(out,'lunar-phone-width.png')});await page.setViewportSize({width:1360,height:850});
 await recover();await station('analysis-review');await page.locator('[data-complete-destination-analysis="cautious-baseline"]').click();
 await page.waitForFunction(()=>lunarCtx.getDestinationMissionSnapshot()?.phase==='complete');cases.push('physical-ship-lab-publishes-complete-lunar-report');
 result=await state();await page.screenshot({path:path.join(out,'lunar-analysis-complete.png')});
 const journal=await page.evaluate(async()=>lunarCtx.discoveryProfileStore.exportData());
 await fs.writeFile(path.join(out,'journal.json'),JSON.stringify(journal,null,2));
 const lunarRecord=journal.events.find(event=>event.eventId==='event:destination-mission:moon');assert.equal(lunarRecord.metadata.strategy,strategy);assert.equal(lunarRecord.metadata.prepared,true);assert.equal(lunarRecord.metadata.fieldEvidence.length,4);cases.push('journal-keeps-method-preparation-and-recovered-pod-provenance');
 if(process.env.WE3D_LUNAR_EARTH==='1'){
  if(await page.locator('[data-close-station]').isVisible())await page.locator('[data-close-station]').click();
  await station('craft-bay-status');await page.locator('[data-pod-earth]').click();
  await page.waitForFunction(()=>lunarCtx.getInterstellarExpeditionSnapshot()?.podJourney?.phase==='local_flight'&&!lunarCtx.activeShipInterior,null,{timeout:30000});
  assert.equal(await page.evaluate(()=>lunarCtx.setSolarSystemCourse('earth').accepted),true);
  assert.equal(await page.evaluate(()=>{lunarCtx.engageRenderedJourneyAssist();for(let i=0;i<3000&&lunarCtx.spaceJourney?.phase!=='approach';i++)lunarCtx.updateRenderedSpaceJourney({realDtS:.1});return lunarCtx.spaceJourney?.phase;}),'approach');
  await page.waitForFunction(()=>document.getElementById('sfLandBtn')?.disabled===false);await page.locator('#sfLandBtn').click();
  await page.waitForFunction(()=>lunarCtx.getEnv()==='EARTH'&&!lunarCtx.worldLoading&&!lunarCtx.spaceFlight.active&&lunarCtx.buildings?.length>0,null,{timeout:180000});
  await page.waitForFunction(()=>!lunarCtx.earthResumePending&&!lunarCtx.paused&&(document.getElementById('currentJourneyCard')?.hidden||document.getElementById('currentJourneyTitle')?.textContent!=='Land Pathfinder'),null,{timeout:30000});
  await page.waitForTimeout(1000);
  assert.equal((await state()).mission.phase,'complete');assert.equal((await state()).expedition.podJourney.bodyId,'earth');
  await page.screenshot({path:path.join(out,'lunar-earth-return.png')});cases.push('physical-pod-bay-earth-course-and-real-earth-return-preserve-lunar-report');result=await state();
 }

} catch(error){failures.push(error.stack||String(error));await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});result=await state().catch(()=>null);}
finally{await context.close();await browser.close();await server.close();}
await fs.writeFile(path.join(out,'report.json'),JSON.stringify({ok:!failures.length,cases,failures,consoleErrors,result,runtimeRoot:process.env.WE3D_VERIFY_ROOT||'.',scope:'Actual selected game artifact. Controlled actor and flight approach positions; real station, launch, landing, field, save, recovery and analysis controls. Not a full walked journey or release acceptance.'},null,2));
console.log(JSON.stringify({ok:!failures.length,cases,failures:failures.map(value=>value.slice(0,1500)),consoleErrors},null,2));if(failures.length)process.exitCode=1;
