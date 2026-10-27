import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
import {createStagingGatewayHandler} from './staging-proxy-delivery.mjs';
import {verifyPhoneRoadRide} from './phone-road-ride-actions.mjs';
const out=path.resolve(process.env.WE3D_ROAD_RIDE_OUTPUT||'output/research/vr-portal-product-2026-10-25/road-ride-game-first');await fs.mkdir(out,{recursive:true});
assert.ok(process.env.WE3D_STAGING_APP_CHECK_FILE,'Use the existing disposable staging attestation wrapper.');
const server=await startStaticServer({rootDir:process.cwd(),ports:[4579],handleRequest:createStagingGatewayHandler()});const base=`http://127.0.0.1:${server.port}`;
const report={passed:false,scope:process.env.WE3D_ROAD_RIDE_KIND==='phone'?'Actual selected Baltimore world, physical lane, ground arrival and car physics in phone stereo with synthetic orientation and illustrative optics. Real RAF plus prescribed short frame bursts; not physical phone/viewer performance or comfort acceptance.':'Actual selected Baltimore world, physical compiled lane, normal ground arrival and car physics. Controlled XR compositor/head poses, paced virtual timestamps; not headset/phone performance, native runtime or comfort acceptance.',checks:[],pageErrors:[],consoleErrors:[],resourceFailures:[]};let owned,page;
try{
  owned=await chromium.launchServer({headless:true,channel:'chrome',args:['--js-flags=--max-old-space-size=1536']});const browser=await chromium.connect(owned.wsEndpoint());page=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true});page.setDefaultTimeout(15000);
  await configureStagingAppCheck(page,base);await page.addInitScript(()=>localStorage.setItem('worldExplorer3D.tutorialState.v6',JSON.stringify({version:6,enabled:false,skipped:true})));
  page.on('pageerror',error=>report.pageErrors.push(error.message));page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push(message.text().slice(0,1000));});page.on('response',response=>{if(response.status()>=400)report.resourceFailures.push({url:response.url(),status:response.status()});});
  await page.goto(`${base}/app/?loc=baltimore&launch=earth&gm=free&mode=driving`,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__WE3D_RUNTIME_READY__===true,null,{timeout:90000});
  await page.evaluate(async()=>window.rideQa=(await import((globalThis.__WORLD_EXPLORER_PRODUCTION__?.sharedModulePrefix||'')+'/app/js/shared-context.js?v=55')).ctx);
  for(const id of ['analyticsConsentDenyBtn','testerInvitationClose'])if(await page.locator('#'+id).isVisible())await page.locator('#'+id).click();
  if(await page.locator('#globeSelectorStartBtn').isVisible())await page.locator('#globeSelectorStartBtn').click();
  await page.waitForFunction(()=>rideQa.gameStarted&&!rideQa.worldLoading&&!rideQa.titleLaunchPending&&rideQa.worldLoadRuntimeState?.gameplayRuntimesReady,null,{timeout:180000,polling:500});await page.locator('#loading.show').waitFor({state:'hidden',timeout:60000});console.log('road-ride: world ready');
  await page.evaluate(async()=>{const {installControlledXrRuntime}=await import('/scripts/verification/xr-runtime-fixture.js');window.rideQaXr=installControlledXrRuntime({THREE:window.THREE,renderer:rideQa.renderer,width:1280,height:720,cant:.2});});
  await page.locator('#controlsBarBtn').click();await page.locator('#vrSettingsBtn').click();await page.locator('#vrSetup[open]').waitFor();
  report.preview=await page.locator('#vrRidePreview').textContent();assert.equal(await page.locator('#vrPrepareRide').isEnabled(),true,report.preview);
  await page.locator('#vrPrepareRide').click();report.preparation=await page.locator('#vrRideStatus').textContent();assert.match(report.preparation,/Ready on/);
  await page.screenshot({path:path.join(out,'prepared-road-ride-ui.png')});
  if(process.env.WE3D_ROAD_RIDE_KIND==='phone'){
    report.phone=await verifyPhoneRoadRide(page,out);report.checks.push('Actual phone presentation consumes guidance; lost orientation pauses, fresh orientation requires deliberate restart, prescribed steering takes over manually and gaze exit restores portrait controls and releases resources.');
  }else{
  await page.locator('#vrStartTracked:not([disabled])').waitFor();await page.locator('#vrStartTracked').click();await page.waitForFunction(()=>rideQa.getVrSnapshot().started&&rideQa.screenLayout.snapshot().panelLayer==='vr');
  report.initial=await page.evaluate(async()=>{
    const T=window.THREE,fixture=rideQaXr;window.rideQaClock=performance.now();fixture.step(rideQaClock);
    const preview=document.createElement('img');preview.id='rideQaPreview';preview.className='vrMainCanvas';preview.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:100000';preview.src=fixture.capture().image;document.body.append(preview);await preview.decode();
    return {ride:rideQa.getVrSnapshot().ride,pose:{x:rideQa.car.x,y:rideQa.car.y,z:rideQa.car.z,angle:rideQa.car.angle},paused:rideQa.hasPauseReason('vr-user')};
  });assert.equal(report.initial.paused,true);assert.equal(report.initial.ride.status,'ready');await page.screenshot({path:path.join(out,'stationary-guided-ride.png')});
  await page.evaluate(()=>{const T=window.THREE,q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,-1),new T.Vector3(-.43,-.34,-1.5).normalize()).toArray();for(let time=20;time<=1220;time+=20)rideQaXr.step(rideQaClock+time,{quaternion:q});rideQaClock+=1220;});
  for(let chunk=0;chunk<180;chunk++){
    const state=await page.evaluate(()=>{for(let i=0;i<25;i++){rideQaClock+=20;rideQaXr.step(rideQaClock);if(['complete','path-blocked','road-unavailable','heading-changed','world-changed'].includes(rideQa.getVrSnapshot().ride?.status))break;}return {ride:rideQa.getVrSnapshot().ride,pose:{x:rideQa.car.x,z:rideQa.car.z,speed:rideQa.car.speed,vFwd:rideQa.car.vFwd},paused:rideQa.hasPauseReason('vr-user')};});
    report.last=state;if(chunk%10===0)console.log('road-ride: '+JSON.stringify(state));
    if(chunk===8||state.ride.status==='complete'){
      await page.evaluate(async()=>{const preview=document.getElementById('rideQaPreview');preview.src=rideQaXr.capture().image;await preview.decode();});await page.screenshot({path:path.join(out,state.ride.status==='complete'?'completed-road-ride.png':'moving-road-ride.png')});
    }
    if(['complete','path-blocked','road-unavailable','heading-changed','world-changed'].includes(state.ride.status))break;
  }
  assert.equal(report.last.ride.status,'complete');assert.equal(report.last.paused,true);assert.ok(Math.abs(report.last.pose.speed)<.6);assert.ok(Math.hypot(report.last.pose.x-report.initial.pose.x,report.last.pose.z-report.initial.pose.z)>10);
  report.checks.push('UI preparation admitted a real compiled lane through the existing ground owner, gaze Start moved the existing car, and ordinary service braking completed the ride before its junction.');
  report.return=await page.evaluate(async()=>{const T=window.THREE,q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,-1),new T.Vector3(.43,-.34,-1.5).normalize()).toArray();rideQaXr.select({quaternion:q});await Promise.resolve();await rideQaXr.dispose();document.getElementById('rideQaPreview').remove();const {getLifecycleRegistrySnapshot}=await import('/app/js/runtime/lifecycle-scope.js?v=2');return {active:rideQa.getVrSnapshot().active,owner:rideQa.getRuntimeFrameSourceSnapshot(),resources:getLifecycleRegistrySnapshot().scopes.filter(row=>row.owner==='vr-road-ride'||row.owner==='vr-gaze-controls'||row.owner==='vr-tracked-session'||row.owner==='runtime-frame:webxr-vr')};});
  assert.equal(report.return.active,false);assert.equal(report.return.owner.active,false);assert.deepEqual(report.return.resources,[]);await page.screenshot({path:path.join(out,'flat-road-return.png')});
  }
  assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.consoleErrors,[]);report.passed=true;
}catch(error){report.failure=error.stack;process.exitCode=1;if(page){await page.screenshot({path:path.join(out,'failed.png')}).catch(()=>{});report.state=await page.evaluate(()=>({vr:window.rideQa?.getVrSnapshot?.(),preview:document.getElementById('vrRidePreview')?.textContent,prepared:document.getElementById('vrRideStatus')?.textContent,roadCount:window.rideQa?.roads?.length,edgeCount:window.rideQa?.livingWorldRuntime?.publication?.trafficGraph?.edges?.length})).catch(()=>null);}}
finally{if(owned)await closeOwnedBrowser(owned);await server.close();report.ownedBrowserClosed=true;await fs.writeFile(path.join(out,'receipt.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
