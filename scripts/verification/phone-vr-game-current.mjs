import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
import {createStagingGatewayHandler} from './staging-proxy-delivery.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';
const out=path.resolve(process.env.WE3D_PHONE_VR_OUTPUT||'output/research/vr-portal-product-2026-10-25/phone-game-first');await fs.mkdir(out,{recursive:true});
assert.ok(process.env.WE3D_STAGING_APP_CHECK_FILE,'Use the existing disposable staging attestation wrapper.');
const server=await startStaticServer({rootDir:process.cwd(),ports:[4577],handleRequest:createStagingGatewayHandler()});const base=`http://127.0.0.1:${server.port}`;
const report={passed:false,scope:'Actual selected-city game, real WebGL/physics/presentation and calibration UI, synthetic orientation and illustrative optics on desktop Chrome touch viewport. Not physical phone/headset optics, comfort or performance acceptance.',checks:[],pageErrors:[],consoleErrors:[],resourceFailures:[]};
let owned,page;
try{
  owned=await chromium.launchServer({headless:true,channel:'chrome',args:['--js-flags=--max-old-space-size=1536']});const browser=await chromium.connect(owned.wsEndpoint());
  const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:1});page=await context.newPage();page.setDefaultTimeout(15000);
  await configureStagingAppCheck(page,base);
  // This journey verifies VR, not the already covered optional tutorial.
  await page.addInitScript(()=>localStorage.setItem('worldExplorer3D.tutorialState.v6',JSON.stringify({version:6,enabled:false,skipped:true})));
  page.on('pageerror',error=>report.pageErrors.push(error.message));page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push(message.text().slice(0,1000));});
  page.on('response',response=>{if(response.status()>=400)report.resourceFailures.push({url:response.url(),status:response.status()});});
  await page.goto(`${base}/app/?loc=baltimore&launch=earth&gm=free&mode=driving`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__WE3D_RUNTIME_READY__===true,null,{timeout:90000});
  await page.evaluate(async()=>{window.vrQa=(await import('/app/js/shared-context.js?v=55')).ctx;vrQa.renderer.domElement.setAttribute('data-vr-main','true');});
  for(const id of ['analyticsConsentDenyBtn','testerInvitationClose'])if(await page.locator('#'+id).isVisible())await page.locator('#'+id).click();
  if(await page.locator('#globeSelectorStartBtn').isVisible())await page.locator('#globeSelectorStartBtn').click();
  await page.waitForFunction(()=>vrQa.gameStarted&&!vrQa.worldLoading&&!vrQa.titleLaunchPending&&vrQa.worldLoadRuntimeState?.gameplayRuntimesReady,null,{timeout:180000,polling:500});console.log('phone-vr: world ready');
  await page.locator('#loading.show').waitFor({state:'hidden',timeout:60000});
  await page.locator('#controlsBarBtn').click();await page.locator('#vrSettingsBtn').scrollIntoViewIfNeeded();await page.locator('#vrSettingsBtn').click();
  await page.locator('#vrSetup[open]').waitFor();
  const fields={screenWidth:120,screenHeight:55.5,lensDistance:40,lensSeparation:64,lensY:27.7,eyeSeparation:64,fov0:45,fov1:45,fov2:45,fov3:45,k1:.34,k2:.55};
  await page.locator('#vrCalibration summary').click();for(const [name,value] of Object.entries(fields))await page.locator(`#vrCalibration [name="${name}"]`).fill(String(value));
  await page.locator('#vrCalibration [name="confirmed"]').check();assert.equal(await page.locator('#vrCalibration').evaluate(form=>form.checkValidity()),true,'The illustrative calibration must satisfy the real form.');
  await page.locator('#vrSetup').evaluate(dialog=>dialog.scrollTop=0);await page.screenshot({path:path.join(out,'calibration-ui.png')});
  const before=await page.evaluate(()=>({pose:{x:vrQa.car.x,y:vrQa.car.y,z:vrQa.car.z},near:vrQa.camera.near,camMode:vrQa.camMode}));
  await page.locator('#vrStartPhone').click();await page.waitForFunction(()=>vrQa.getVrSnapshot?.().active&&vrQa.vrPresentation?.active);
  async function orientTo(x=0,y=0,z=-1){await page.evaluate(({x,y,z})=>{
    const T=window.THREE,angle=Number(screen.orientation?.angle??window.orientation)||0;
    const base=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-angle*Math.PI/180);
    const desired=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,-1),new T.Vector3(x,y,z).normalize());
    const q=base.multiply(desired).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),angle*Math.PI/180)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),Math.PI/2));
    const e=new T.Euler().setFromQuaternion(q,'YXZ');window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{alpha:e.y*180/Math.PI,beta:e.x*180/Math.PI,gamma:-e.z*180/Math.PI}));
  },{x,y,z});}
  await orientTo();await page.waitForFunction(()=>vrQa.getVrSnapshot().tracking===true);
  assert.equal(await page.evaluate(()=>vrQa.hasPauseReason('vr-user')),true);
  assert.equal(await page.locator('#controlsBarBtn').isVisible(),false,'Flat controls must not cover the stereo view.');
  assert.equal(await page.evaluate(()=>document.body.dataset.gamePanelLayer),'vr');
  await page.screenshot({path:path.join(out,'city-stereo-paused.png')});
  report.checks.push('Actual calibration UI admits a paused stereo view of the loaded city with rotation-only tracking.');
  for(let i=0;i<14;i++){await orientTo(-.43,-.34,-1.5);await page.waitForTimeout(100);}
  assert.equal(await page.evaluate(()=>vrQa.hasPauseReason('vr-user')),false);
  const movement=await page.evaluate(()=>vrQa.readControlActions('drive'));assert.equal(movement.steer,0);assert.equal(movement.throttle,0);
  await orientTo();await runPrescribedGameActions(page,out,[{buttons:['up'],frames:8},{buttons:[],frames:2}],'canvas[data-vr-main]');
  const driven=await page.evaluate(()=>({x:vrQa.car.x,z:vrQa.car.z,speed:vrQa.car.speed,vr:vrQa.getVrSnapshot()}));assert.ok(Math.hypot(driven.x-before.pose.x,driven.z-before.pose.z)>.001);report.drive=driven;
  report.checks.push('Gaze dwell starts play; head rotation does not steer or accelerate; prescribed keyboard input drives the existing car physics.');
  await page.screenshot({path:path.join(out,'city-stereo-driving.png')});
  for(let i=0;i<14;i++){await orientTo(.43,-.34,-1.5);await page.waitForTimeout(100);}
  assert.equal(await page.evaluate(()=>!!vrQa.vrPresentation?.active),false);
  const after=await page.evaluate(async()=>({near:vrQa.camera.near,camMode:vrQa.camMode,vrScopes:(await import('/app/js/runtime/lifecycle-scope.js?v=2')).getLifecycleRegistrySnapshot().scopes.filter(row=>row.owner.startsWith('vr-phone-')||row.owner==='vr-gaze-controls')}));
  assert.equal(after.near,before.near);assert.equal(after.camMode,before.camMode);assert.deepEqual(after.vrScopes,[]);
  assert.equal(await page.locator('#controlsBarBtn').isVisible(),true,'Normal controls return after VR.');
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);await page.screenshot({path:path.join(out,'flat-portrait-return.png')});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  report.checks.push('Gaze exit releases phone VR resources and restores camera settings and a portrait game view.');
  assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.consoleErrors,[]);report.passed=true;
}catch(error){report.failure=error.stack;process.exitCode=1;if(page){await page.screenshot({path:path.join(out,'failed.png')}).catch(()=>{});report.state=await page.evaluate(()=>({vr:window.vrQa?.getVrSnapshot?.(),paused:window.vrQa?.getPauseReasons?.(),setup:document.getElementById('vrSetupStatus')?.textContent,loading:document.getElementById('loading')?.textContent})).catch(()=>null);}}
finally{if(owned)await closeOwnedBrowser(owned);await server.close();report.ownedBrowserClosed=true;await fs.writeFile(path.join(out,'receipt.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
