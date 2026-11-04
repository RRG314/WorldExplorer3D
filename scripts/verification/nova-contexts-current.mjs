import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createFieldworkQaSession} from './fieldwork-qa-session.mjs';
import {deployResearchSubmarineFromDeck} from './marine-entry-ui.mjs';
const base=process.env.WE3D_VERIFY_BASE_URL||'http://127.0.0.1:4192';
const output=path.resolve(process.env.WE3D_NOVA_OUTPUT||`output/verification/nova-ui-20261104/contexts-${Date.now()}`);
const selected=new Set((process.env.WE3D_NOVA_CONTEXTS||'space,moon,mars,ocean').split(','));
const report={scope:'Actual source contexts entered with original globe/travel controls. UI boundaries only: no repeated accepted missions, full laps or scientific procedures; no pose/time writes or production changes.',checks:[],screens:[]};let qa;
try{
 qa=await createFieldworkQaSession({rootDir:process.cwd(),output,careerId:'explorer',maximumDurationMs:12*60*1000});const {page}=qa;await page.setViewportSize({width:1440,height:960});
 const check=(name,value)=>{report.checks.push({name,ok:!!value});assert.ok(value,name);};
 const shot=async name=>{await page.screenshot({path:path.join(output,name+'.png')});report.screens.push(name);await fs.writeFile(path.join(output,'progress.json'),JSON.stringify(report,null,2)+'\n');console.log(name);};
 const nav=id=>page.locator(`.nova-global-navigation [data-nova-target="${id}"],.nova-context-actions [data-nova-target="${id}"]`);
 const boot=async()=>{await page.goto(base+'/app/?diagnostics=1');await page.locator('#globeSelectorStartBtn').waitFor();await page.evaluate(async()=>{window.novaCtx=(await import('/app/js/shared-context.js?v=55')).ctx;});};
 const primary=async prefix=>{
  await nav('fActivities').click();await page.locator('#experienceBrowser').waitFor({state:'visible'});check(prefix+' Activities retains 20 careers',await page.locator('[data-experience-id]').count()===20);await shot(prefix+'-activities');
  await page.locator('#experienceBrowser [data-nova-section="journal"]').click();await page.locator('#discoveryPanel').waitFor({state:'visible'});await shot(prefix+'-journal');await page.locator('#discoveryCloseBtn').click();
 };
 if(selected.has('space')){
  const phoneOnly=process.env.WE3D_NOVA_RESUME==='phone';if(phoneOnly)await page.setViewportSize({width:390,height:844});
  await boot();await page.locator('#globeSelectorSpaceBtn').click();await page.waitForFunction(()=>novaCtx.spaceFlight?.active&&!novaCtx.titleLaunchPending&&!document.querySelector('#loading.show'),null,{timeout:120000});
  await page.waitForFunction(()=>!novaCtx.paused&&novaCtx.spaceFlight?.renderer?.info.render.frame>0,null,{timeout:45000});await page.locator('#novaGameHeader').waitFor({state:'visible'});await shot('space-flight');
  if(!phoneOnly){
  await nav('exploreBtn').click();await page.locator('#universeNavigator').waitFor({state:'visible'});check('Space Explore opens actual Wayfinder',true);await shot('space-wayfinder');await page.locator('#universeCloseBtn').click();
  if(!process.env.WE3D_NOVA_RESUME)await page.locator('#spaceDestinationSelect').selectOption('mars');if(!process.env.WE3D_NOVA_RESUME){await page.waitForFunction(()=>novaCtx.spaceJourney?.destinationBodyId==='mars');check('Space destination control sets the original course',true);}
  await page.locator('#sfControlsBtn').click();await page.locator('#controlsTab').waitFor({state:'visible'});await shot('space-controls');await page.locator('#ctrlHeader').click();
  await primary('space');}
  await page.setViewportSize({width:390,height:844});if(await page.locator('#sfHudToggle').getAttribute('aria-expanded')==='true')await page.locator('#sfHudToggle').click();await shot('space-phone');await nav('exploreBtn').click();await page.locator('#universeNavigator').waitFor({state:'visible'});check('Wayfinder heading is clear of Main menu',!(await page.locator('#mainMenuBtn').isVisible()));await shot('space-phone-wayfinder');await page.locator('#universeCloseBtn').click();
  await page.setViewportSize({width:1440,height:960});
 }
 for(const body of ['moon','mars'])if(selected.has(body)){
  await boot();await page.locator(body==='moon'?'#globeSelectorMoonBtn':'#globeSelectorMarsBtn').click();await page.waitForFunction(body=>novaCtx.gameStarted&&!novaCtx.worldLoading&&!novaCtx.titleLaunchPending&&(body==='moon'?novaCtx.onMoon:novaCtx.onMars),body,{timeout:120000});
  await page.locator('#novaGameHeader').waitFor({state:'visible'});await shot(body+'-surface');if(process.env.WE3D_NOVA_RESUME!=='travel')await primary(body);
  await nav('travelBtn').click();check(body+' hides Earth vehicle choice',!(await page.locator('#travelVehicleSelect').isVisible()));check(body+' hides unsupported aircraft choice',!(await page.locator('#travelAircraftSelect').isVisible()));await shot(body+'-travel');await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});await shot(body+'-phone');await page.setViewportSize({width:1440,height:960});
 }
 if(selected.has('ocean')){
  await boot();await page.locator('#coralResearchStart').click();
  await page.waitForFunction(()=>novaCtx.boatDeck?.active&&!novaCtx.titleLaunchPending,null,{timeout:120000});await shot('ocean-deck');if(process.env.WE3D_NOVA_RESUME!=='submarine')await primary('ocean-deck');
  await page.locator('#returnToWorldBtn').focus();await page.locator('#returnToWorldBtn').click();await deployResearchSubmarineFromDeck(page);await shot('ocean-submarine');await primary('ocean-submarine');
  await page.setViewportSize({width:390,height:844});await shot('ocean-phone');
 }
 check('no page exceptions',qa.report.errors.length===0);report.providerErrors=qa.report.providerErrors;report.ok=true;
}catch(error){report.ok=false;report.failure=error.stack;await qa?.fail(error);}
finally{await qa?.close();await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({ok:report.ok,output,checks:report.checks,failure:report.failure}));if(!report.ok)process.exitCode=1;
