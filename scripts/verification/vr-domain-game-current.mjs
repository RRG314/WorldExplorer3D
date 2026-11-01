import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
import {createStagingGatewayHandler} from './staging-proxy-delivery.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';
import {deployResearchSubmarineFromDeck} from './marine-entry-ui.mjs';

// One real dedicated world per run. Sensors/compositor are explicit controlled
// boundaries; normal UI, assets, actor physics, input and frame owners run.
const domain=process.env.WE3D_VR_DOMAIN||'space',phase=process.env.WE3D_VR_PHASE||'all';
assert.ok(['space','ocean'].includes(domain));assert.ok(['all','phone','tracked'].includes(phase));
const out=path.resolve(process.env.WE3D_VERIFY_OUTPUT_DIR||`output/research/vr-domains/${domain}-${phase}`),root=path.resolve(process.env.WE3D_VERIFY_ROOT||'.');
await fs.mkdir(out,{recursive:true});
assert.ok(process.env.WE3D_STAGING_APP_CHECK_FILE,'Use the existing disposable staging-attestation wrapper.');
const report={passed:false,domain,phase,root,scope:'Actual dedicated game renderer, assets, controls and physics on a desktop touch viewport. Synthetic phone orientation and controlled XR compositor, not physical optics/headset/phone comfort or performance acceptance. Ocean entry bathymetry is a controlled provider.',checks:[],pageErrors:[],consoleErrors:[],httpErrors:[]};
const redact=value=>String(value).replace(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,'[debug identity]');
let owned,server,page,stage='startup';
const mark=value=>{stage=value;console.log(JSON.stringify({stage,domain}));};
try{
  const gateway=createStagingGatewayHandler();
  server=await startStaticServer({rootDir:root,ports:[0],handleRequest:async(request,response,url)=>{
    if(url.pathname==='/scripts/verification/xr-runtime-fixture.js'){response.setHeader('Content-Type','text/javascript');response.end(await fs.readFile(new URL('./xr-runtime-fixture.js',import.meta.url)));return true;}
    return gateway(request,response,url);
  }});const base=`http://127.0.0.1:${server.port}`;
  owned=await chromium.launchServer({channel:'chrome',headless:true,args:['--js-flags=--max-old-space-size=1280']});const browser=await chromium.connect(owned.wsEndpoint());
  const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1});page=await context.newPage();page.setDefaultTimeout(20000);
  await configureStagingAppCheck(page,base);await page.addInitScript(()=>localStorage.setItem('worldExplorer3D.tutorialState.v6',JSON.stringify({version:6,enabled:false,skipped:true})));
  if(domain==='ocean')await context.route('https://wms.gebco.net/**',route=>route.fulfill({contentType:'text/plain',body:"value_list = '-80'"}));
  page.on('pageerror',error=>report.pageErrors.push({stage,message:redact(error.message)}));page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push({stage,message:redact(message.text()).slice(0,1000)});});
  page.on('response',response=>{if(response.status()>=400){const url=new URL(response.url());report.httpErrors.push({stage,host:url.hostname,path:url.pathname,status:response.status()});}});
  const query=domain==='space'?'launch=space':'loc=custom&lat=-18.2861&lon=147.7&lname=Reef&launch=earth&gm=free';
  await page.goto(`${base}/app/?${query}`,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__===true,null,{timeout:90000});
  await page.evaluate(async()=>{globalThis.domainVrContext=(await import((globalThis.__WORLD_EXPLORER_PRODUCTION__?.sharedModulePrefix||document.documentElement.dataset.runtimeModulePrefix||'')+'/app/js/shared-context.js?v=55')).ctx;});
  for(const id of ['analyticsConsentDenyBtn','testerInvitationClose'])if(await page.locator('#'+id).isVisible())await page.locator('#'+id).click();
  mark('world-entry');await page.locator(domain==='space'?'#globeSelectorSpaceBtn':'#globeSelectorOceanBtn').click();
  if(domain==='ocean')await deployResearchSubmarineFromDeck(page);
  await page.waitForFunction(domain=>{const c=domainVrContext,m=domain==='space'?c.spaceFlight:c.oceanMode;return c.gameStarted&&!c.worldLoading&&!c.titleLaunchPending&&m?.active&&m.renderer&&m.camera&&(domain!=='space'||m.mode==='flying')&&!document.getElementById('loading')?.classList.contains('show');},domain,{timeout:120000});
  await page.evaluate(()=>{window.advanceTime=async ms=>{const start=performance.now();do{await new Promise(requestAnimationFrame);}while(performance.now()-start<ms);};});
  const canvas=domain==='space'?'#spaceFlightCanvas':'#oceanModeCanvas';
  const pose=()=>page.evaluate(()=>{const p=domainVrContext.activeTransportActor().position;return {x:p.x,y:p.y,z:p.z};});
  const flatCamera=async()=>{
    const result=await page.evaluate(domain=>{
      const c=domainVrContext,m=domain==='space'?c.spaceFlight:c.oceanMode,body=domain==='space'?m.rocket:m.submarine;
      if(m.diver?.active){const p=m.diver.navigationActor().position;return {diver:true,distance:Math.hypot(m.camera.position.x-p.x,m.camera.position.y-p.y,m.camera.position.z-p.z)};}
      const forward=domain==='space'?new THREE.Vector3(0,1,0).applyQuaternion(body.quaternion):new THREE.Vector3(Math.sin(body.yaw),0,Math.cos(body.yaw));
      return {diver:false,behind:m.camera.position.clone().sub(body.position).dot(forward)};
    },domain);
    if(result.diver)assert.ok(result.distance>2);else assert.ok(result.behind<-5,'Flat camera must immediately return behind the current vehicle');return result;
  };
  const openSetup=async()=>{
    if(domain==='space'){
      if(await page.locator('#spaceFlightHUD').evaluate(element=>element.classList.contains('collapsed')))await page.locator('#sfHudToggle').click();
      await page.locator('#sfControlsBtn').click();
    }else await page.locator('#controlsBarBtn').click();
    await page.locator('#vrSettingsBtn').scrollIntoViewIfNeeded();await page.locator('#vrSettingsBtn').click();await page.locator('#vrSetup[open]').waitFor();
  };
  if(process.env.WE3D_VR_LAYOUTS==='1'){
    mark('setup-layouts');await openSetup();report.layouts=[];
    for(const [name,width,height] of [['desktop',1440,900],['portrait',390,844],['landscape',844,390]])for(const scale of ['100','200']){
      await page.setViewportSize({width,height});await page.evaluate(scale=>{document.documentElement.dataset.we3dTextScale=scale;document.documentElement.dataset.we3dContrast='more';document.getElementById('vrSetup').scrollTop=0;},scale);
      const metrics=await page.locator('#vrSetup').evaluate(dialog=>{const b=dialog.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,scroll:dialog.scrollWidth,client:dialog.clientWidth,bodyFont:getComputedStyle(dialog).fontSize,closeHeight:dialog.querySelector('.vrClose').getBoundingClientRect().height};});
      assert.ok(metrics.x>=0&&metrics.y>=0&&metrics.x+metrics.width<=width&&metrics.y+metrics.height<=height);assert.ok(metrics.scroll<=metrics.client+1);assert.ok(metrics.closeHeight>=44);
      await page.locator('#vrSetup .vrClose').focus();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement?.closest('#vrSetup')),true);
      await page.screenshot({path:path.join(out,`setup-${name}-${scale}.png`)});report.layouts.push({name,scale,...metrics});
    }
    await page.evaluate(()=>{document.documentElement.dataset.we3dTextScale='100';document.documentElement.dataset.we3dContrast='standard';document.getElementById('vrSetup').close();});await page.setViewportSize({width:844,height:390});report.checks.push('six-setup-layouts-and-native-keyboard-focus-at-100-200-percent');
  }
  async function orientTo(x=0,y=0,z=-1){await page.evaluate(({x,y,z})=>{
    const T=window.THREE,angle=Number(screen.orientation?.angle??window.orientation)||0,axis=new T.Vector3(0,0,1);
    const desired=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,-1),new T.Vector3(x,y,z).normalize());
    const q=new T.Quaternion().setFromAxisAngle(axis,-angle*Math.PI/180).multiply(desired).multiply(new T.Quaternion().setFromAxisAngle(axis,angle*Math.PI/180)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),Math.PI/2));
    const e=new T.Euler().setFromQuaternion(q,'YXZ');window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{alpha:e.y*180/Math.PI,beta:e.x*180/Math.PI,gamma:-e.z*180/Math.PI}));
  },{x,y,z});}
  async function phoneJourney(label='phone'){
    mark(label+'-setup');await openSetup();
    const fields={screenWidth:120,screenHeight:55.5,lensDistance:40,lensSeparation:64,lensY:27.7,eyeSeparation:64,fov0:45,fov1:45,fov2:45,fov3:45,k1:.34,k2:.55};
    if(!(await page.locator('#vrCalibration details').evaluate(element=>element.open)))await page.locator('#vrCalibration summary').click();for(const [name,value] of Object.entries(fields))await page.locator(`#vrCalibration [name="${name}"]`).fill(String(value));await page.locator('#vrCalibration [name="confirmed"]').check();
    await page.locator('#vrSetup').evaluate(dialog=>dialog.scrollTop=0);await page.screenshot({path:path.join(out,label+'-setup.png')});
    await page.locator('#vrStartPhone').click();await page.waitForFunction(()=>domainVrContext.getVrSnapshot?.().started);await orientTo();await page.waitForFunction(()=>domainVrContext.getVrSnapshot().tracking);
    const stopped=await pose();assert.equal(await page.evaluate(()=>domainVrContext.hasPauseReason('vr-user')),true);
    for(let i=0;i<4;i++){await orientTo();await page.waitForTimeout(100);}assert.deepEqual(await pose(),stopped);
    await page.screenshot({path:path.join(out,label+'-paused.png')});report[label]=await page.evaluate(()=>domainVrContext.getVrSnapshot());report.checks.push(label+'-paused-head-and-exit-presentation');
    for(let i=0;i<14;i++){await orientTo(-.43,-.34,-1.5);await page.waitForTimeout(100);}assert.equal(await page.evaluate(()=>domainVrContext.hasPauseReason('vr-user')),false);await orientTo();
    const before=await pose();await runPrescribedGameActions(page,out,[{buttons:domain==='space'?['space']:['up'],frames:12},{buttons:[],frames:2}],canvas);const after=await pose();assert.ok(Math.hypot(after.x-before.x,after.y-before.y,after.z-before.z)>.001);report[label+'Motion']={before,after};report.checks.push(label+'-start-and-existing-actor-keyboard-motion');
    await page.screenshot({path:path.join(out,label+'-moving.png')});
    for(let i=0;i<14;i++){await orientTo(.43,-.34,-1.5);await page.waitForTimeout(100);}assert.equal(await page.evaluate(()=>!!domainVrContext.vrPresentation?.active),false);report[label+'ReturnCamera']=await flatCamera();report.checks.push(label+'-gaze-exit-restores-normal-view');
  }
  if(phase!=='tracked')await phoneJourney();
  if(phase!=='phone'){
    mark('tracked-setup');await page.evaluate(async domain=>{const {installControlledXrRuntime}=await import('/scripts/verification/xr-runtime-fixture.js');const c=domainVrContext,m=domain==='space'?c.spaceFlight:c.oceanMode;globalThis.domainXr=installControlledXrRuntime({THREE:window.THREE,renderer:m.renderer,width:1280,height:720,cant:.15});},domain);
    await openSetup();await page.locator('#vrStartTracked:not([disabled])').waitFor();await page.locator('#vrStartTracked').click();await page.waitForFunction(()=>domainVrContext.getVrSnapshot().kind==='tracked'&&domainVrContext.getVrSnapshot().started);
    report.tracked=await page.evaluate(async domain=>{
      const c=domainVrContext,m=domain==='space'?c.spaceFlight:c.oceanMode;globalThis.domainXrClock=performance.now();domainXr.step(domainXrClock);
      const capture=domainXr.capture(),image=document.createElement('img');image.id='domainXrPreview';image.className='vrMainCanvas';image.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:100000';image.src=capture.image;document.body.append(image);await image.decode();
      return {snapshot:c.getVrSnapshot(),owner:c.getRuntimeFrameSourceSnapshot(),dedicatedFlatRunning:m.captureFrameDriver().snapshot().running,glError:capture.glError};
    },domain);assert.equal(report.tracked.dedicatedFlatRunning,false);assert.equal(report.tracked.owner.owner,'webxr-vr');assert.equal(report.tracked.glError,0);await page.screenshot({path:path.join(out,'tracked-paused.png')});report.checks.push('tracked-compositor-exclusively-owns-dedicated-world');
    report.trackedMotion=await page.evaluate(async domain=>{
      const c=domainVrContext,T=window.THREE,m=domain==='space'?c.spaceFlight:c.oceanMode,body=domain==='space'?m.rocket:m.submarine;
      const look=x=>new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,-1),new T.Vector3(x,-.34,-1.5).normalize()).toArray();
      for(let time=20;time<=1220;time+=20)domainXr.step(domainXrClock+time,{quaternion:look(-.43)});const started=!c.hasPauseReason('vr-user');
      const source=handedness=>({handedness,targetRayMode:'tracked-pointer',gamepad:{mapping:'xr-standard',connected:true,axes:[0,0,0,0],buttons:[{value:0}]}});
      domainXr.session.inputSources=[source('left'),source('right')];domainXr.step(domainXrClock+1240);const before=body.position.clone();
      if(domain==='space')domainXr.session.inputSources[1].gamepad.buttons[0].value=.8;else domainXr.session.inputSources[0].gamepad.axes[3]=-1;
      for(let time=1260;time<=1460;time+=20)domainXr.step(domainXrClock+time);const actions=c.readControlActions(domain==='space'?'rocket':'ocean'),distance=body.position.distanceTo(before),snapshot=c.getVrSnapshot();
      const image=document.getElementById('domainXrPreview');image.src=domainXr.capture().image;await image.decode();return {started,actions,distance,snapshot};
    },domain);assert.equal(report.trackedMotion.started,true);assert.ok(report.trackedMotion.distance>.001);assert.equal(domain==='space'?report.trackedMotion.actions.jump:report.trackedMotion.actions.move,domain==='space'?.8:1);await page.screenshot({path:path.join(out,'tracked-moving.png')});report.checks.push('gaze-start-and-XR-input-drive-existing-physics');
    report.restored=await page.evaluate(async domain=>{
      const T=window.THREE,c=domainVrContext,q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,-1),new T.Vector3(.43,-.34,-1.5).normalize()).toArray();domainXr.select({quaternion:q});await c.vrPresentation?.stop('verification-exit');await domainXr.dispose();document.getElementById('domainXrPreview').remove();
      const m=domain==='space'?c.spaceFlight:c.oceanMode;return {active:!!c.vrPresentation?.active,owner:c.getRuntimeFrameSourceSnapshot(),dedicatedFlatRunning:m.captureFrameDriver().snapshot().running};
    },domain);assert.equal(report.restored.active,false);assert.equal(report.restored.owner.active,false);assert.equal(report.restored.dedicatedFlatRunning,true);report.checks.push('tracked-exit-restores-the-same-dedicated-frame-owner');
    report.trackedReturnCamera=await flatCamera();
  }
  if(domain==='ocean'&&process.env.WE3D_VR_DIVER==='1'){
    mark('diver-entry');await page.locator('#oceanDiverToggle:not([disabled])').waitFor({timeout:15000});await page.locator('#oceanDiverToggle').click();await page.waitForFunction(()=>domainVrContext.oceanMode.diver.active,null,{timeout:30000});await phoneJourney('diver');
  }
  report.vrScopes=await page.evaluate(()=>domainVrContext.getLifecycleRegistrySnapshot().scopes.filter(row=>row.owner.startsWith('vr-phone-')||row.owner==='vr-gaze-controls'||row.owner==='vr-tracked-session'||row.owner==='runtime-frame:webxr-vr'));assert.deepEqual(report.vrScopes,[]);
  await page.screenshot({path:path.join(out,'flat-return.png')});assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.consoleErrors,[]);report.passed=true;
}catch(error){report.failure={stage,message:redact(error.stack)};process.exitCode=1;await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});report.state=await page?.evaluate(()=>({vr:globalThis.domainVrContext?.getVrSnapshot?.(),paused:globalThis.domainVrContext?.getPauseReasons?.(),setup:document.getElementById('vrSetupStatus')?.textContent,loading:document.getElementById('loading')?.textContent})).catch(()=>null);}
finally{if(owned)await closeOwnedBrowser(owned);await server?.close();report.ownedBrowserClosed=true;await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));
