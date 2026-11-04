import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createFieldworkQaSession} from './fieldwork-qa-session.mjs';
import {deployResearchSubmarineFromDeck} from './marine-entry-ui.mjs';
const base=process.env.WE3D_VERIFY_BASE_URL||'http://127.0.0.1:4192';
const output=path.resolve(process.env.WE3D_UI_OUTPUT||`output/verification/trail-ui-20261104/contexts-${Date.now()}`);
const selected=new Set((process.env.WE3D_UI_CONTEXTS||'space,moon,mars,ocean').split(','));
const report={scope:'Actual source contexts entered with original globe/travel controls. UI boundaries only: no repeated accepted missions, full laps or scientific procedures; no pose/time writes or production changes.',checks:[],screens:[]};let qa;
try{
 qa=await createFieldworkQaSession({rootDir:process.cwd(),output,careerId:'explorer',maximumDurationMs:12*60*1000});const {page}=qa;await page.setViewportSize({width:1440,height:960});
 const check=(name,value)=>{report.checks.push({name,ok:!!value});assert.ok(value,name);};
 const shot=async name=>{await page.screenshot({path:path.join(output,name+'.png')});report.screens.push(name);await fs.writeFile(path.join(output,'progress.json'),JSON.stringify(report,null,2)+'\n');console.log(name);};
 const nav=id=>page.locator(`.explorer-global-navigation [data-explorer-target="${id}"],.explorer-context-actions [data-explorer-target="${id}"]`);
 const boot=async()=>{await page.goto(base+'/app/?diagnostics=1');await page.locator('#globeSelectorStartBtn').waitFor();await page.evaluate(async()=>{window.uiCtx=(await import('/app/js/shared-context.js?v=55')).ctx;});};
 const primary=async prefix=>{
  await nav('fActivities').click();await page.locator('#experienceBrowser').waitFor({state:'visible'});check(prefix+' Activities retains 20 careers',await page.locator('[data-experience-id]').count()===20);await shot(prefix+'-activities');
  await page.locator('#experienceBrowser [data-explorer-section="journal"]').click();await page.locator('#discoveryPanel').waitFor({state:'visible'});await shot(prefix+'-journal');await page.locator('#discoveryCloseBtn').click();
 };
 if(selected.has('ar')){
  report.scope+=' AR uses the original native UI and actual Three.js viewer with controlled walking context and no available camera/XR device; no physical-device claim.';
  await boot();await page.waitForFunction(()=>!!globalThis.THREE);await page.evaluate(async()=>{const{createArPlatform}=await import('/app/js/ar/session-service.js?v=10');const context={Walk:{state:{mode:'walk',walker:{x:0,z:0}}},getEnv:()=> 'EARTH'};window.arUiProbe=createArPlatform(context,{navigatorObject:{}});await arUiProbe.open({type:'specimen',record:{catalogId:'quartz-vein-sample',name:'Quartz sample'}});});
  await page.locator('#arContinueBtn').click();await page.waitForFunction(()=>arUiProbe.snapshot().phase==='active');
  for(const[width,height]of [[1440,960],[390,844],[844,390]]){await page.setViewportSize({width,height});await shot('ar-viewer-'+width);}
  check('AR fallback uploads no camera frames',await page.evaluate(()=>arUiProbe.snapshot().cameraFramesUploaded===false));await page.locator('#arLargerBtn').click();await page.locator('#arCloseBtn').click();check('AR original close releases its viewer',await page.evaluate(()=>arUiProbe.snapshot().phase==='idle'));await page.evaluate(()=>arUiProbe.dispose());
 }
 if(selected.has('planner')){
  await boot();await page.locator('#globeSelectorSpaceBtn').click();await page.waitForFunction(()=>uiCtx.spaceFlight?.active&&!uiCtx.titleLaunchPending&&!uiCtx.paused&&uiCtx.spaceFlight.renderer.info.render.frame>0,null,{timeout:120000});
  await page.locator('#sfExpeditionBtn').click();await page.locator('#expeditionOverlay').waitFor({state:'visible'});check('Expedition uses the native modal focus boundary',await page.locator('#expeditionOverlay').evaluate(e=>e.open&&e.matches(':modal')));
  for(let i=0;i<12;i++)await page.keyboard.press('Tab');check('Expedition keyboard focus stays in the planner',await page.locator('#expeditionOverlay').evaluate(e=>e.contains(document.activeElement)));
  for(const[width,height,scale]of [[1440,960,'100'],[390,844,'100'],[844,390,'100'],[390,844,'200']]){
   await page.setViewportSize({width,height});await page.evaluate(scale=>document.documentElement.dataset.we3dTextScale=scale,scale);await page.locator('#expeditionClose').scrollIntoViewIfNeeded();await shot('expedition-'+width+'-'+scale);
   check('Expedition close target fits '+width+'/'+scale,await page.locator('#expeditionClose').evaluate(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}));
  }
  await page.keyboard.press('Escape');check('Escape closes Expedition through original owner',!(await page.locator('#expeditionOverlay').isVisible()));
  await page.setViewportSize({width:1440,height:960});await page.evaluate(()=>document.documentElement.dataset.we3dTextScale='100');await page.locator('#sfControlsBtn').click();await page.locator('#vrSettingsBtn').click();await page.locator('#vrSetup').waitFor({state:'visible'});
  for(const[width,height]of [[1440,960],[390,844],[844,390]]){await page.setViewportSize({width,height});await shot('vr-setup-'+width);}
  await page.keyboard.press('Escape');check('VR setup closes without starting an immersive session',!(await page.locator('#vrSetup').isVisible())&&await page.evaluate(()=>uiCtx.vrPresentation?.active!==true));await page.setViewportSize({width:1440,height:960});
 }
 if(selected.has('space')){
  const phoneOnly=process.env.WE3D_UI_RESUME==='phone';if(phoneOnly)await page.setViewportSize({width:390,height:844});
  await boot();await page.locator('#globeSelectorSpaceBtn').click();await page.waitForFunction(()=>uiCtx.spaceFlight?.active&&!uiCtx.titleLaunchPending&&!document.querySelector('#loading.show'),null,{timeout:120000});
  await page.waitForFunction(()=>!uiCtx.paused&&uiCtx.spaceFlight?.renderer?.info.render.frame>0,null,{timeout:45000});await page.locator('#explorerGameHeader').waitFor({state:'visible'});await shot('space-flight');
  if(!phoneOnly){
  await nav('exploreBtn').click();await page.locator('#universeNavigator').waitFor({state:'visible'});check('Space Explore opens actual Wayfinder',true);await shot('space-wayfinder');await page.locator('#universeCloseBtn').click();
  if(!process.env.WE3D_UI_RESUME)await page.locator('#spaceDestinationSelect').selectOption('mars');if(!process.env.WE3D_UI_RESUME){await page.waitForFunction(()=>uiCtx.spaceJourney?.destinationBodyId==='mars');check('Space destination control sets the original course',true);}
  await page.locator('#sfControlsBtn').click();await page.locator('#controlsTab').waitFor({state:'visible'});await shot('space-controls');await page.locator('#ctrlHeader').click();
  await primary('space');}
  await page.setViewportSize({width:390,height:844});if(await page.locator('#sfHudToggle').getAttribute('aria-expanded')==='true')await page.locator('#sfHudToggle').click();await shot('space-phone');await nav('exploreBtn').click();await page.locator('#universeNavigator').waitFor({state:'visible'});check('Wayfinder heading is clear of Main menu',!(await page.locator('#mainMenuBtn').isVisible()));await shot('space-phone-wayfinder');await page.locator('#universeCloseBtn').click();
  await page.setViewportSize({width:1440,height:960});
 }
 for(const body of ['moon','mars'])if(selected.has(body)){
  await boot();await page.locator(body==='moon'?'#globeSelectorMoonBtn':'#globeSelectorMarsBtn').click();await page.waitForFunction(body=>uiCtx.gameStarted&&!uiCtx.worldLoading&&!uiCtx.titleLaunchPending&&(body==='moon'?uiCtx.onMoon:uiCtx.onMars),body,{timeout:120000});
  await page.locator('#explorerGameHeader').waitFor({state:'visible'});await shot(body+'-surface');if(process.env.WE3D_UI_RESUME!=='travel')await primary(body);
  await nav('travelBtn').click();check(body+' hides Earth vehicle choice',!(await page.locator('#travelVehicleSelect').isVisible()));check(body+' hides unsupported aircraft choice',!(await page.locator('#travelAircraftSelect').isVisible()));await shot(body+'-travel');await page.locator('#fWalk').click();await page.waitForFunction(()=>uiCtx.Walk?.state?.mode==='walk'&&!uiCtx.droneMode);
  await nav('travelBtn').click();await page.locator('#fDriving').click();await page.waitForFunction(()=>uiCtx.Walk?.state?.mode!=='walk'&&!uiCtx.droneMode);check(body+' Walk to Drive uses original rover controller',true);
  await nav('travelBtn').click();await page.locator('#fDrone').click();await page.waitForFunction(()=>uiCtx.droneMode);await nav('travelBtn').click();await page.locator('#fDriving').click();await page.waitForFunction(()=>!uiCtx.droneMode&&uiCtx.Walk?.state?.mode!=='walk');check(body+' Drone to Drive uses original rover controller',true);
  await nav('travelBtn').click();await page.locator('#fWalk').click();await page.waitForFunction(()=>uiCtx.Walk?.state?.mode==='walk');
  await page.setViewportSize({width:390,height:844});await shot(body+'-phone');await page.setViewportSize({width:1440,height:960});
 }
 if(selected.has('deck-controls')){
  await boot();await page.locator('#coralResearchStart').click();await page.waitForFunction(()=>uiCtx.boatDeck?.active&&!uiCtx.titleLaunchPending,null,{timeout:120000});
  await nav('travelBtn').click();for(const id of ['fDriving','fWalk','fDrone','fPlane','travelVehicleSelect'])check('Vessel owns travel instead of advertising '+id,!(await page.locator('#'+id).isVisible()));await shot('deck-context-travel');await page.keyboard.press('Escape');check('Travel inspection preserves the original vessel/deck controller',await page.evaluate(()=>uiCtx.boatMode?.active&&uiCtx.boatDeck?.active));
 }
 if(selected.has('ocean')){
  await boot();await page.locator('#coralResearchStart').click();
  await page.waitForFunction(()=>uiCtx.boatDeck?.active&&!uiCtx.titleLaunchPending,null,{timeout:120000});await shot('ocean-deck');if(process.env.WE3D_UI_RESUME!=='submarine')await primary('ocean-deck');
  await page.locator('#returnToWorldBtn').focus();await page.locator('#returnToWorldBtn').click();await deployResearchSubmarineFromDeck(page);await shot('ocean-submarine');await nav('travelBtn').click();check('Submarine hides incompatible surface controls',!(await page.locator('#fDriving').isVisible())&&!(await page.locator('#fPlane').isVisible())&&!(await page.locator('#fDrone').isVisible()));await shot('ocean-travel');await page.keyboard.press('Escape');await primary('ocean-submarine');
  await page.setViewportSize({width:390,height:844});await shot('ocean-phone');
 }
 check('no page exceptions',qa.report.errors.length===0);report.providerErrors=qa.report.providerErrors;report.ok=true;
}catch(error){report.ok=false;report.failure=error.stack;await qa?.fail(error);}
finally{await qa?.close();await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({ok:report.ok,output,checks:report.checks,failure:report.failure}));if(!report.ok)process.exitCode=1;
