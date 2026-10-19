import {afterWorldLoad} from './complete-world-readiness.mjs';
import {browserEmulatorSettings} from './backend-environment.mjs';
// Bounded preservation check on an immutable candidate and isolated emulators.
// Real menus, companion care, reload and movement; no hosted/device acceptance.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';
import {prepareBackendEmulatorParameters} from './backend-emulator-parameters.mjs';
import {runLoggedStep} from './run-logged-step.mjs';
const out='output/architecture-consolidation/2026-10-13/final-gameplay';
await mkdir(out,{recursive:true});
if(!process.env.FIREBASE_AUTH_EMULATOR_HOST){
 const cleanup=prepareBackendEmulatorParameters();
 try {
  const result=await runLoggedStep(['firebase','emulators:exec','--non-interactive','--only','auth,firestore,functions','--project','we3d-staging-20260712','node scripts/verification/consolidation-gameplay-current.mjs'],{cwd:process.cwd(),env:process.env,logPath:out+'/emulator.log',timeoutMs:600000});
  console.log(JSON.stringify(result));if(!result.ok)process.exitCode=1;
 }finally{cleanup();}
}else{
 assert.match(process.env.FIREBASE_AUTH_EMULATOR_HOST,/^(?:127\.0\.0\.1|localhost):\d+$/);
 assert.match(process.env.FIRESTORE_EMULATOR_HOST||'',/^(?:127\.0\.0\.1|localhost):\d+$/);
 assert.equal(process.env.GCLOUD_PROJECT,'we3d-staging-20260712');
 const root=path.resolve(process.env.WE3D_VERIFY_ROOT||'');
 assert.ok(process.env.WE3D_VERIFY_ROOT,'Explicit immutable test artifact required');
 const manifest=JSON.parse(await readFile(path.join(root,'build-manifest.json')));
 const config=JSON.parse(await readFile('config/firebase.staging.json'));
 assert.ok(String(manifest.buildId).endsWith('.staging'));
 const report={ok:false,buildId:manifest.buildId,scope:'Immutable full Earth world; native Chrome GPU; emulator backend; desktop and touch layout; not hosted App Check, named phone or performance certification',checks:[],errors:[],localFailures:[],providerResponses:[]};
 let owned,server,page;
 try{
  server=await startStaticServer({rootDir:root,ports:[4593,4594]});
  owned=await chromium.launchServer({channel:'chrome',headless:false,args:['--js-flags=--max-old-space-size=1536']});
  const browser=await chromium.connect(owned.wsEndpoint()),context=await browser.newContext({viewport:{width:1280,height:800},hasTouch:true});
  await context.addInitScript(({config,emulators})=>{
   globalThis.WORLD_EXPLORER_FIREBASE=config;globalThis.WORLD_EXPLORER_FIREBASE_ENV='staging';
   globalThis.WORLD_EXPLORER_FIREBASE_EMULATORS=emulators;
   globalThis.WORLD_EXPLORER_FUNCTIONS_ORIGIN=`http://127.0.0.1:5001/${config.projectId}/us-central1`;
  },{config,emulators:browserEmulatorSettings()});
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
  const base=`http://127.0.0.1:${server.port}`;
  const rewrites={'/api/geospatial/search':'getPlaceLookup','/api/geospatial/reverse':'getPlaceLookup','/api/geospatial/weather':'getEnvironmentalData','/api/geospatial/marine':'getEnvironmentalData','/api/geospatial/aircraft':'getAircraftStates'};
  await page.route(url=>url.origin===base&&!!rewrites[url.pathname],async route=>{
   const url=new URL(route.request().url()),target=`http://127.0.0.1:5001/${config.projectId}/us-central1/${rewrites[url.pathname]}${url.search}`;
   const response=await route.fetch({url:target});await route.fulfill({response});
  });
  page.on('response',r=>{if(r.url().startsWith(base)){const url=new URL(r.url()).pathname;if(rewrites[url])report.providerResponses.push({status:r.status(),url});else if(r.status()>=400)report.localFailures.push({status:r.status(),url});}});
  await page.goto(base+'/app/?launch=earth&gm=free&loc=custom&lat=41.735329&lon=-111.834912&lname=Logan&mode=walk&diagnostics=1');
  const ready=async()=>{
   await page.waitForFunction(()=>window.__WE3D_RUNTIME_READY__,null,{timeout:120000});
   if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
   await page.getByRole('button',{name:'Explore',exact:true}).click();
   await page.waitForFunction(afterWorldLoad(()=>{const s=window.getWorldExplorerRuntimeDiagnostics?.();return s?.gameStarted&&!s.worldLoading&&!!window.__WE3D_COMPANION_SUPPORT__;}),null,{timeout:240000});
   const skip=page.getByRole('button',{name:'Skip guide',exact:true});if(await skip.isVisible())await skip.click();
  };
  await ready();
  console.log('[consolidation-gameplay] World ready; checking companion controls');
  const snapshot=()=>page.evaluate(()=>__WE3D_COMPANION_SUPPORT__.snapshot());
  const starter=(await snapshot()).companions.find(c=>c.isStarterCompanion);assert.ok(starter?.active);
  report.checks.push('Fresh immutable world loads with an active starter companion');
  const openProfile=async()=>{await page.locator('#backpackBtn').click();await page.locator('#fExplorerProfile').click();await page.locator('#discoveryCompanionList').waitFor({state:'visible'});};
  await openProfile();
  const card=page.locator('#discoveryCompanionList .discoveryItem').filter({has:page.locator(`[data-companion-action="rename"][data-companion-id="${starter.instanceId}"]`)});
  await card.locator('[data-companion-name]').fill('Copper');await card.locator('[data-companion-action="rename"]').click();
  await page.waitForFunction(()=>__WE3D_COMPANION_SUPPORT__.snapshot().activeName==='Copper');
  // Seed one existing progression event via the documented diagnostic owner so
  // the care reward is eligible; neither IndexedDB nor private modules are patched.
  await page.evaluate(()=>__WE3D_COMPANION_SUPPORT__.awardXp('consolidation:outing','care-after-outing'));
  const before=(await snapshot()).companions.find(c=>c.active).progression.totalXp;
  // Locator click reacquires the button after the XP event refreshes the panel
  // and scrolls it into view. The skill choreography below checks actual walking.
  await card.locator('[data-companion-action="care"]').click();
  await page.waitForFunction(before=>__WE3D_COMPANION_SUPPORT__.snapshot().companions.find(c=>c.active).progression.totalXp>before,before);
  const after=(await snapshot()).companions.find(c=>c.active).progression.totalXp;
  assert.equal(after,before+5);
  await card.locator('[data-companion-action="care"]').click();
  await page.waitForTimeout(500);assert.equal((await snapshot()).companions.find(c=>c.active).progression.totalXp,after);
  await page.screenshot({path:out+'/companion-profile.png'});
  report.checks.push('Current Backpack/Profile controls name and care for the companion; daily care XP is once-only');
  console.log('[consolidation-gameplay] Care persisted; checking walking and reload');
  await page.locator('#discoveryCloseBtn').click();
  const pose=()=>page.evaluate(()=>getWorldExplorerRuntimeDiagnostics().activeActor.position);
  const beforeWalk=await pose();
  await runPrescribedGameActions(page,out,[{buttons:['up'],frames:45},{buttons:[],frames:8}], 'body > canvas:not(#minimap)');
  const afterWalk=await pose();assert.ok(Math.hypot(afterWalk.x-beforeWalk.x,afterWalk.z-beforeWalk.z)>.4);
  report.checks.push('Closing the profile restores walking input');
  await page.screenshot({path:out+'/walking-world.png'});
  await page.reload();await ready();
  console.log('[consolidation-gameplay] Reload ready; checking saved state and narrow layout');
  assert.equal((await snapshot()).activeName,'Copper');assert.equal((await snapshot()).companions.find(c=>c.active).progression.totalXp,after);
  report.checks.push('Returning player retains name, active selection and exact XP after a full world reload');
  await page.setViewportSize({width:390,height:844});await openProfile();
  assert.ok((await page.locator('#discoveryCompanionList').innerText()).includes('Copper'));
  assert.equal(await page.locator('#discoveryPanel').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
  await page.screenshot({path:out+'/companion-touch.png'});report.checks.push('Narrow touch layout exposes the same profile without horizontal overflow');
  report.state=await page.evaluate(()=>JSON.parse(render_game_to_text()));
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.localFailures,[]);report.ok=true;
 }catch(error){report.error=String(error.stack||error);if(page){report.failureState=await page.evaluate(()=>{const s=window.getWorldExplorerRuntimeDiagnostics?.()||{};return{runtime:{gameStarted:s.gameStarted,worldLoading:s.worldLoading,environment:s.environment,activeActor:s.activeActor},companion:window.__WE3D_COMPANION_SUPPORT__?.snapshot()};}).catch(()=>null);await page.screenshot({path:out+'/failure.png'}).catch(()=>{});}process.exitCode=1;}
 finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({ok:report.ok,buildId:report.buildId,checks:report.checks,error:report.error}));if(owned)await closeOwnedBrowser(owned);await server?.close();}
}
