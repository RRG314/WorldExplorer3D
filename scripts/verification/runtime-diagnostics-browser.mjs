import {afterWorldLoad} from './complete-world-readiness.mjs';
import {deployResearchSubmarineFromDeck} from './marine-entry-ui.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';
import {sceneBudgetFailures} from './scene-budget-check.mjs';

const output=process.env.WE3D_DIAGNOSTICS_OUTPUT||'output/verification/runtime-diagnostics';
const budgets=JSON.parse(await fs.readFile(new URL('../../config/scene-resource-budgets.json',import.meta.url),'utf8'));
await fs.mkdir(output,{recursive:true});
const server=await startStaticServer({rootDir:process.env.WE3D_VERIFY_ROOT||process.cwd(),ports:[4514]});
const base=`http://127.0.0.1:${server.port}`;
const browserServer=await chromium.launchServer({channel:'chrome',headless:true});
const browser=await chromium.connect(browserServer.wsEndpoint());
const report={ok:false,scope:'Actual assembled local app; explicitly instrumented resource baselines, not normal performance acceptance. Ocean bathymetry controlled. Clipboard denial injected. No ordinary hosted or physical-phone claim.',checks:[],scenes:[],errors:[],failedLocal:[],providerDegradations:[]};
let context,page;
async function fresh(url){
 if(context)await context.close();
 context=await browser.newContext({viewport:{width:1440,height:900},permissions:['clipboard-read','clipboard-write']});
 page=await context.newPage();
 page.on('pageerror',error=>report.errors.push(error.message));
 page.on('response',response=>{
  const url=new URL(response.url());
  if(url.origin!==base||response.status()<400)return;
  const item={path:url.pathname,status:response.status()};
  // Automatic location labels are optional here; provider availability has
  // separate gates. Search, auth rejection and packaged assets still fail.
  if(url.pathname==='/api/geospatial/reverse'&&[429,502,503,504].includes(response.status()))report.providerDegradations.push(item);
  else report.failedLocal.push(item);
 });
 await configureStagingAppCheck(page,base);
 await page.goto(`${base}/app/?diagnostics=1&${url}`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__,null,{timeout:120000});
 if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
}
async function measure(id,owner){
 const result=await page.evaluate(async()=>{
  const before=getWorldExplorerSceneResources();
  const animation=await measureWorldExplorerSceneAnimation(2000);
  const after=getWorldExplorerSceneResources();
  return {before,after,animation,support:getWorldExplorerSupportReceipt()};
 });
 assert.equal(result.before.owner,owner);assert.equal(result.after.owner,owner);
 assert.ok(result.after.resources.geometries>0);assert.ok(result.after.resources.materials>0);
 assert.ok(result.after.resources.geometrySourceBytes>0);assert.ok(result.after.resources.textureSourceBytes>0);
 assert.ok(result.animation.elapsedMs>=1900);
 // Inspect every environment in one bounded run before reporting budget errors.
 // Functional/ownership errors still abort; compare the audited asset baseline.
 report.scenes.push({id,...result,budgetFailures:sceneBudgetFailures({id,...result},budgets.scenes[id])});
 await page.screenshot({path:`${output}/${id}.png`});
}
try{
 if(!process.argv.includes('--ocean-only')){
 await fresh('loc=custom&lat=39.2904&lon=-76.6122&lname=Baltimore&launch=earth&gm=free&mode=walking');
 await page.locator('[data-globe-destination="settings"]').click();
 // Exercise the registered runtime listener in source and bundled builds.
 await page.evaluate(()=>{
  globalThis.dispatchEvent(new ErrorEvent('error',{
   error:new DOMException('PRIVATE_ACCOUNT_1234 secret coordinates media payload','QuotaExceededError')
  }));
 });
 await page.locator('#copySupportReceiptBtn').click();
 await page.waitForFunction(()=>document.getElementById('supportReceiptStatus').textContent.startsWith('Report copied'));
 const copied=await page.evaluate(()=>navigator.clipboard.readText());
 assert.doesNotMatch(copied,/PRIVATE_ACCOUNT|secret|payload|coordinates/i);
 const receipt=JSON.parse(copied);assert.equal(receipt.type,'WorldExplorerSupportReceipt');assert.ok(receipt.events.some(e=>e.operation==='runtime'&&e.category==='storage-full'));
 assert.equal(await page.locator('#supportReceiptPreview').inputValue(),copied);
 await page.screenshot({path:`${output}/support-desktop.png`});
 report.checks.push('actual-settings-copy-and-private-field-exclusion');
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:()=>Promise.reject(new DOMException('Denied','NotAllowedError'))});});
 await page.locator('#copySupportReceiptBtn').click();
 await page.waitForFunction(()=>document.getElementById('supportReceiptStatus').textContent==='Select and copy the report below.');
 assert.equal(await page.locator('#supportReceiptPreview').evaluate(e=>document.activeElement===e&&e.selectionEnd===e.value.length),true);
 const bounds=await page.locator('#copySupportReceiptBtn').boundingBox();assert.ok(bounds.height>=44&&bounds.x>=0&&bounds.x+bounds.width<=391);
 assert.equal(await page.locator('#tab-settings').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
 await page.screenshot({path:`${output}/support-phone.png`});
 report.checks.push('phone-copy-denial-selection-and-layout');
 await page.locator('#globeHubOverlayCloseBtn').click();await page.setViewportSize({width:1440,height:900});
 await page.locator('[data-globe-destination="games"]').click();
 await page.locator('.flowerChallengeToggleBtn').click();
 for(const id of ['Flower','PaintTown','Fishing','DeFlock']){
  await page.locator(`#leaderboardTab${id}`).click();
  await page.waitForFunction(()=>document.getElementById('gameLeaderboardScope').textContent.includes('Casual')&&document.getElementById('gameLeaderboardHint').textContent.includes('Player-reported results.'));
 }
 await page.waitForFunction(()=>!document.getElementById('titleFlowerRefreshBtn').disabled);
 await page.screenshot({path:`${output}/casual-rankings.png`});
 report.checks.push('casual-leaderboard-disclosure');
 await page.locator('.flowerChallengeToggleBtn').click();
 await page.locator('#globeHubOverlayCloseBtn').click();
 await page.locator('#globeSelectorStartBtn').click();
 await page.waitForFunction(afterWorldLoad(()=>{const d=getWorldExplorerRuntimeDiagnostics();return d.gameStarted&&!d.worldLoading&&d.worldDiscovery?.active&&!document.getElementById('loading')?.classList.contains('show');}),null,{timeout:180000});
 await measure('earth','main');
 if(process.argv.includes('--lifecycle')){
  const inspectEarth=()=>page.evaluate(async()=>{
   const {ctx:c}=await import((globalThis.__WORLD_EXPLORER_PRODUCTION__?.sharedModulePrefix||'')+'/app/js/shared-context.js?v=55');globalThis.__residencyContext=c;
   return {buildings:c.buildings.length,roads:c.roads.length,terrainTiles:c.terrainTileCache?.size||0,location:{lat:c.LOC.lat,lon:c.LOC.lon},pose:c.earthSessionState?.pose,release:c.lastEarthWorldRelease,submerged:!!c.oceanMode.active};
  });
  const before=await inspectEarth();
  await page.locator('#travelBtn').click();await page.locator('#fOceanMode').click();
  await page.waitForFunction(()=>globalThis.getOceanModeDebugState?.().active&&!document.getElementById('loading')?.classList.contains('show'),null,{timeout:120000});
  const underwater=await inspectEarth();
  assert.equal(underwater.buildings,0);assert.equal(underwater.roads,0);assert.equal(underwater.terrainTiles,0);
  assert.equal(underwater.release.reason,'ocean_entry_release');
  assert.ok(underwater.pose,'Departed land pose must remain saved');
  await page.screenshot({path:`${output}/earth-to-ocean.png`});
  await page.locator('#travelBtn').click();await page.locator('#fEarthMode').click();
  await page.waitForFunction(()=>{const c=__residencyContext;return !c.oceanMode.active&&!c.earthResumePending&&!c.worldLoading&&c.initialEarthWorldReady&&!document.getElementById('loading')?.classList.contains('show');},null,{timeout:300000});
  const returned=await inspectEarth();
  assert.deepEqual(returned.location,before.location);assert.equal(returned.submerged,false);
  assert.ok(returned.buildings>=before.buildings*.9,'Return must restore building coverage');
  assert.ok(returned.roads>=before.roads*.9,'Return must restore road coverage');
  assert.equal(returned.pose.mode,underwater.pose.mode);
  assert.ok(Math.hypot(returned.pose.x-underwater.pose.x,returned.pose.z-underwater.pose.z)<5,'Return must preserve the departed land position');
  report.earthOceanResidency={before,underwater,returned};
  await runPrescribedGameActions(page,output,[{buttons:['up'],frames:15},{buttons:[],frames:5}],'body > canvas:not([id])');
  await page.screenshot({path:`${output}/earth-returned.png`});
  report.checks.push('real-land-ocean-land-trip-releases-city-and-restores-selection-pose-and-coverage');
 }

 await fresh('launch=space');
 await page.waitForFunction(()=>document.getElementById('startBtn')?.disabled===false,null,{timeout:120000});
 await page.evaluate(()=>{document.getElementById('spaceLaunchToggle').click();document.getElementById('startBtn').click();});
 await page.waitForFunction(()=>JSON.parse(render_game_to_text()).modes?.space&&!document.getElementById('loading')?.classList.contains('show'),null,{timeout:180000});
 await page.waitForTimeout(2000);await measure('space','space');

 }
 await fresh('');
 await page.route('https://wms.gebco.net/**',route=>route.fulfill({contentType:'text/plain',body:"value_list = '-80'"}));
 await page.locator('#globeCustomLat').fill('-18.2861');await page.locator('#globeCustomLon').fill('147.7');await page.locator('#globeCustomLon').press('Tab');
 await page.locator('#globeSelectorOceanBtn').click();
  await deployResearchSubmarineFromDeck(page);
 await page.waitForFunction(()=>globalThis.getOceanModeDebugState?.().active===true,null,{timeout:90000});
 await page.locator('#oceanDiverToggle').waitFor({state:'visible'});
 await page.evaluate(async()=>{const {ctx}=await import((globalThis.__WORLD_EXPLORER_PRODUCTION__?.sharedModulePrefix||'')+'/app/js/shared-context.js?v=55');await ctx.oceanMode.fishVisualsReady;});
 await measure('ocean','ocean');
 report.oceanInventory=await page.evaluate(async()=>{
  const {ctx}=await import((globalThis.__WORLD_EXPLORER_PRODUCTION__?.sharedModulePrefix||'')+'/app/js/shared-context.js?v=55');
  const o=ctx.oceanMode,geometries=new Map(),textures=new Map();
  o.scene.traverse(mesh=>{
   const ancestry=[];for(let p=mesh;p&&p!==o.scene;p=p.parent)if(p.name)ancestry.push(p.name);const owner=ancestry.reverse().join(' / ');
   if(mesh.geometry&&!geometries.has(mesh.geometry)){const g=mesh.geometry,buffers=new Set();for(const a of [...Object.values(g.attributes),...Object.values(g.morphAttributes||{}).flat(),g.index].filter(Boolean))buffers.add((a.isInterleavedBufferAttribute?a.data.array:a.array).buffer);geometries.set(g,{owner,bytes:[...buffers].reduce((n,b)=>n+b.byteLength,0)});}
   for(const m of [].concat(mesh.material||[]))for(const [slot,t]of Object.entries(m))if(t?.isTexture){if(!textures.has(t))textures.set(t,{name:t.name,width:t.image?.width,height:t.image?.height,owners:[],slots:[]});const row=textures.get(t);if(!row.owners.includes(owner))row.owners.push(owner);if(!row.slots.includes(slot))row.slots.push(slot);}
  });
  return {geometries:[...geometries.values()].sort((a,b)=>b.bytes-a.bytes),textures:[...textures.values()],retainedEarth:{buildings:ctx.buildings.length,roads:ctx.roads.length,sceneChildren:ctx.scene?.children.length,boatActive:ctx.boatMode?.active,boatMesh:!!ctx.boatMode?.mesh},modelCache:getWorldExplorerRuntimeDiagnostics().modelAssets};
 });
 await page.locator('#oceanDiverToggle').click();
 await page.waitForFunction(()=>getOceanModeDebugState().diver?.active===true);
 assert.equal(await page.evaluate(()=>getWorldExplorerSupportReceipt().mode),'diver');
 report.checks.push('actual-environment-and-diver-support-context');
 if(process.argv.includes('--lifecycle')){
  assert.equal(report.oceanInventory.retainedEarth.boatMesh,false,'Hidden furnished vessel must retire after successful sub admission');
  const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');report.oceanLifecycle=[];
  const identity=await page.evaluate(()=>({ship:__marineEntryContext.oceanVoyage.current.ship.transportEntityId,sub:__marineEntryContext.oceanVoyage.current.subId}));
  await page.locator('#oceanDiverToggle').click();
  for(let cycle=0;cycle<3;cycle++){
   if(cycle){await deployResearchSubmarineFromDeck(page);await page.evaluate(()=>__marineEntryContext.oceanMode.fishVisualsReady);}
   await runPrescribedGameActions(page,output,[{buttons:['up'],frames:30},{buttons:[],frames:5}],'#oceanModeCanvas');
   const submerged=await page.evaluate(()=>({resources:getWorldExplorerSceneResources(),cache:getWorldExplorerRuntimeDiagnostics().modelAssets,boatMesh:!!__marineEntryContext.boatMode.mesh}));
   assert.equal(submerged.boatMesh,false);assert.ok(submerged.cache.entries.filter(e=>e.id==='marine-research-vessel-rcrv'||['solis-command-console','workspace-table','workspace-chair','solis-laboratory-desk'].includes(e.id)).every(e=>e.leases===0));
   assert.equal(submerged.cache.entries.find(e=>e.id==='marine-atlantic-explorer-submarine').leases,1);
   await page.locator('#oceanVoyageRecover').click();
   await page.waitForFunction(()=>__marineEntryContext.boatDeck?.active&&!__marineEntryContext.oceanMode.active,null,{timeout:90000});
   const surfaced=await page.evaluate(()=>{const c=__marineEntryContext;return{oceanScene:!!c.oceanMode.scene,oceanRenderer:!!c.oceanMode.renderer,cache:getWorldExplorerRuntimeDiagnostics().modelAssets,ship:c.oceanVoyage.current.ship.transportEntityId,sub:c.oceanVoyage.current.subId,groundPlaceholderVisible:!!(c.groundFallbackMesh?.parent&&c.groundFallbackMesh.visible)};});
   assert.equal(surfaced.groundPlaceholderVisible,false,'Loading ground must not cover an admitted open-water scene');assert.equal(surfaced.oceanScene,false);assert.equal(surfaced.oceanRenderer,false);assert.equal(surfaced.ship,identity.ship);assert.equal(surfaced.sub,identity.sub);
   assert.ok(surfaced.cache.entries.filter(e=>/marine-.*coral|marine-research-vessel-rcrv-lod/.test(e.id)).every(e=>e.leases===0));
   await cdp.send('HeapProfiler.collectGarbage');const metrics=await cdp.send('Performance.getMetrics');
   report.oceanLifecycle.push({cycle,submerged,surfaced,retainedHeapBytes:metrics.metrics.find(m=>m.name==='JSHeapUsedSize')?.value});
  }
  await page.screenshot({path:`${output}/vessel-recovered.png`});
  await page.locator('#mainMenuBtn').click();await page.waitForSelector('#globeSelectorScreen.show');
  report.oceanRetired=await page.evaluate(()=>({boatMesh:!!__marineEntryContext.boatMode.mesh,cache:getWorldExplorerRuntimeDiagnostics().modelAssets}));
  assert.equal(report.oceanRetired.boatMesh,false);assert.ok(report.oceanRetired.cache.entries.filter(e=>e.id.startsWith('marine-')||e.id.startsWith('solis-')||e.id.startsWith('workspace-')).every(e=>e.leases===0));
  const idleBytes=report.oceanRetired.cache.entries.filter(e=>e.leases===0).reduce((n,e)=>n+e.estimatedResourceBytes,0);assert.ok(idleBytes<=report.oceanRetired.cache.idleByteLimit);
  const heaps=report.oceanLifecycle.map(c=>c.retainedHeapBytes);assert.ok(Math.max(...heaps)-Math.min(...heaps)<32*1024*1024,'Three recovery cycles must plateau within 32 MiB retained heap');
  report.checks.push('three-real-sub-deck-roundtrips-release-inactive-presentations-and-preserve-voyage');
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.failedLocal,[]);
 assert.deepEqual(report.scenes.flatMap(scene=>scene.budgetFailures),[]);report.ok=true;
}catch(error){report.failure=error.message;throw error;}
finally{await fs.writeFile(`${output}/report.json`,JSON.stringify(report,null,2));await closeOwnedBrowser(browserServer);await server.close();}
console.log(JSON.stringify({ok:report.ok,checks:report.checks,scenes:report.scenes.map(s=>({id:s.id,resources:s.after.resources,animation:s.animation}))}));
