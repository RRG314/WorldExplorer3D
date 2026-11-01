import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
import {createStagingGatewayHandler} from './staging-proxy-delivery.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';
import {portalFixture} from '../../tests/fixtures/portal-qualification.mjs';
import {portalLocationsMatch} from '../../app/js/earth-core/portal-destination-policy.js';
const out=path.resolve(process.env.WE3D_PORTAL_ENTRY_OUTPUT||'output/research/vr-portal-product-2026-10-25/portal-game-first');await fs.mkdir(out,{recursive:true});
assert.ok(process.env.WE3D_STAGING_APP_CHECK_FILE,'Use the disposable staging attestation wrapper.');
const server=await startStaticServer({rootDir:process.cwd(),ports:[4579],handleRequest:createStagingGatewayHandler()}),base=`http://127.0.0.1:${server.port}`;
const report={passed:false,scope:'Real game renderer/arrival, Portal UI and Journal IndexedDB. Browser-only qualification fixture exercises admission; it does not approve Baltimore, a device profile, native widgets or live account services.',checks:[],pageErrors:[],consoleErrors:[],resourceFailures:[]};
let owned,page;
try{
  owned=await chromium.launchServer({headless:true,channel:'chrome',args:['--js-flags=--max-old-space-size=1536']});const browser=await chromium.connect(owned.wsEndpoint());
  const context=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1,serviceWorkers:'block'});page=await context.newPage();page.setDefaultTimeout(15000);
  await configureStagingAppCheck(page,base);
  await page.addInitScript(()=>localStorage.setItem('worldExplorer3D.tutorialState.v6',JSON.stringify({version:6,enabled:false,skipped:true})));
  page.on('pageerror',error=>report.pageErrors.push(error.message));page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push(message.text().slice(0,1000));});
  page.on('response',response=>{if(response.status()>=400)report.resourceFailures.push({url:response.url(),status:response.status()});});
  await page.goto(`${base}/portal/`,{waitUntil:'networkidle'});await page.locator('[data-save]').waitFor();
  assert.equal(await page.getByRole('link',{name:'Enter World ↗',exact:true}).count(),0);report.checks.push('Unqualified released catalog never offers 3D entry.');
  // Network interception affects this owned context only. No source/catalog
  // modification or production qualification bypass is installed in the app.
  const {qualification}=portalFixture({now:Date.now()});qualification.validUntil=Date.now()+15*60000;
  await page.route('**/app/js/portal/catalog.js',async route=>{
    const response=await route.fetch(),source=await response.text();assert.ok(source.includes('qualifications:[]'));
    await route.fulfill({response,body:source.replace('qualifications:[]',`qualifications:${JSON.stringify([qualification])}`)});
  });
  await page.reload({waitUntil:'networkidle'});await page.locator('[data-save]').waitFor();
  if(await page.locator('[data-save]').getAttribute('data-save')!=='baltimore-harbor')await page.locator('[data-next]').click();
  await page.getByRole('button',{name:'Save place',exact:true}).click();await page.getByRole('button',{name:'Saved · remove',exact:true}).waitFor();
  const enter=page.getByRole('link',{name:'Enter World ↗',exact:true});assert.equal(await enter.getAttribute('href'),`${base}/app/?portal=baltimore-harbor&pr=1`);
  await page.screenshot({path:path.join(out,'qualified-fixture-portal.png'),fullPage:true});await enter.click();
  await page.waitForFunction(()=>window.__WE3D_RUNTIME_READY__===true,null,{timeout:90000});
  await page.evaluate(async()=>{window.portalQa=(await import((globalThis.__WORLD_EXPLORER_PRODUCTION__?.sharedModulePrefix||document.documentElement.dataset.runtimeModulePrefix||'')+'/app/js/shared-context.js?v=55')).ctx;portalQa.renderer.domElement.setAttribute('data-portal-main','true');});
  for(const id of ['analyticsConsentDenyBtn','testerInvitationClose'])if(await page.locator('#'+id).isVisible())await page.locator('#'+id).click();
  const before=await page.evaluate(async()=>{const {createIndexedDbDiscoveryProfileStore}=await import('/app/js/discovery/profile-store.js?v=5');return (await createIndexedDbDiscoveryProfileStore().getPortalDestination('device-guest','baltimore-harbor')).state;});
  assert.equal(before.visitedAt,0);assert.equal(before.saved,true);report.checks.push('Portal save survives game navigation; link selection alone does not award a visit.');
  if(await page.locator('#globeSelectorStartBtn').isVisible())await page.locator('#globeSelectorStartBtn').click();
  else if(await page.locator('#startBtn').isVisible())await page.locator('#startBtn').click();
  await page.waitForFunction(()=>portalQa.gameStarted&&!portalQa.worldLoading&&!portalQa.titleLaunchPending&&portalQa.worldLoadRuntimeState?.gameplayRuntimesReady,null,{timeout:180000,polling:500});
  await page.locator('#loading.show').waitFor({state:'hidden',timeout:60000});
  // This installed Playwright poller treats a Promise as truthy before resolving
  // it. Await IndexedDB explicitly in the driver, then assert the actual fact.
  const visitDeadline=Date.now()+15000;
  do{
    report.admittedTrail=await page.evaluate(async()=>{const {createIndexedDbDiscoveryProfileStore}=await import('/app/js/discovery/profile-store.js?v=5');return (await createIndexedDbDiscoveryProfileStore().getPortalDestination('device-guest','baltimore-harbor')).state;});
    if(report.admittedTrail.visitedAt>0)break;
    await page.waitForTimeout(250);
  }while(Date.now()<visitDeadline);
  assert.ok(report.admittedTrail.visitedAt>0,'A matching real visible presentation must actually persist its visit.');
  report.game=await page.evaluate(async()=>({location:portalQa.worldPublication.location,requestId:portalQa.worldPublication.requestId,
    mode:(await import('/app/js/transport/control-state.js')).resolveControlState(portalQa),pose:{x:portalQa.Walk.state.walker.x,y:portalQa.Walk.state.walker.y,z:portalQa.Walk.state.walker.z},
    portalSystem:portalQa.getRuntimeKernelSnapshot().phases.render.filter(row=>row.id==='portal.admitted-presentation')}));
  assert.equal(portalLocationsMatch(report.game.location,{lat:39.2904,lon:-76.6122}),true);assert.equal(report.game.mode.mode,'walk');assert.deepEqual(report.game.portalSystem,[]);
  await page.screenshot({path:path.join(out,'admitted-city.png')});
  await runPrescribedGameActions(page,out,[{buttons:['up'],frames:8},{buttons:[],frames:2}],'canvas[data-portal-main]');
  const after=await page.evaluate(()=>({x:portalQa.Walk.state.walker.x,z:portalQa.Walk.state.walker.z}));assert.ok(Math.hypot(after.x-report.game.pose.x,after.z-report.game.pose.z)>.001);
  report.checks.push('Existing Earth load and ground arrival owners admit the real city; its actual render saves one visit and retires the one-shot frame observer. Prescribed walking input moves the normal actor.');
  await page.goto(`${base}/portal/`,{waitUntil:'networkidle'});await page.getByText('Visited in 3D',{exact:false}).waitFor();
  await page.screenshot({path:path.join(out,'trail-after-game.png'),fullPage:true});
  report.trail=await page.evaluate(async()=>{const {createIndexedDbDiscoveryProfileStore}=await import('/app/js/discovery/profile-store.js?v=5');return (await createIndexedDbDiscoveryProfileStore().getPortalDestination('device-guest','baltimore-harbor')).state;});
  assert.ok(report.trail.visitedAt>0);assert.equal(report.trail.saved,true);assert.equal(report.trail.investigatedAt,0);assert.deepEqual(report.trail.expeditionIds,[]);
  report.checks.push('Portal return shows the durable 3D visit separately from saved/investigated/expedition facts.');
  assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.consoleErrors,[]);assert.deepEqual(report.resourceFailures,[]);report.passed=true;
}catch(error){report.failure=error.stack||String(error);if(page&&!page.isClosed())await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));if(owned)await closeOwnedBrowser(owned);await server.close();}
