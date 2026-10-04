import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
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
  if(response.status()===503&&['/api/geospatial/search','/api/geospatial/reverse'].includes(url.pathname))report.providerDegradations.push(item);
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
 report.scenes.push({id,...result});
 assert.deepEqual(sceneBudgetFailures({id,...result},budgets.scenes[id]),[]);
 await page.screenshot({path:`${output}/${id}.png`});
}
try{
 await fresh('loc=custom&lat=39.2904&lon=-76.6122&lname=Baltimore&launch=earth&gm=free&mode=walking');
 await page.locator('[data-globe-destination="settings"]').click();
 await page.evaluate(async()=>{
  const {supportRecorder}=await import('/app/js/runtime/support-receipt.js');
  supportRecorder.record({operation:'journal-save',error:new DOMException('PRIVATE_ACCOUNT_1234 secret coordinates media payload','QuotaExceededError'),request:{coordinates:[123,45],secret:'PRIVATE_ACCOUNT_1234'}});
 });
 await page.locator('#copySupportReceiptBtn').click();
 await page.waitForFunction(()=>document.getElementById('supportReceiptStatus').textContent.startsWith('Report copied'));
 const copied=await page.evaluate(()=>navigator.clipboard.readText());
 assert.doesNotMatch(copied,/PRIVATE_ACCOUNT|secret|payload|coordinates/i);
 const receipt=JSON.parse(copied);assert.equal(receipt.type,'WorldExplorerSupportReceipt');assert.ok(receipt.events.some(e=>e.operation==='journal-save'&&e.category==='storage-full'));
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
 await page.waitForFunction(()=>{const d=getWorldExplorerRuntimeDiagnostics();return d.gameStarted&&!d.worldLoading&&d.worldDiscovery?.active&&!document.getElementById('loading')?.classList.contains('show');},null,{timeout:180000});
 await measure('earth','main');

 await fresh('launch=space');
 await page.waitForFunction(()=>document.getElementById('startBtn')?.disabled===false,null,{timeout:120000});
 await page.evaluate(()=>{document.getElementById('spaceLaunchToggle').click();document.getElementById('startBtn').click();});
 await page.waitForFunction(()=>JSON.parse(render_game_to_text()).modes?.space&&!document.getElementById('loading')?.classList.contains('show'),null,{timeout:180000});
 await page.waitForTimeout(2000);await measure('space','space');

 await fresh('');
 await page.route('https://wms.gebco.net/**',route=>route.fulfill({contentType:'text/plain',body:"value_list = '-80'"}));
 await page.locator('#globeCustomLat').fill('-18.2861');await page.locator('#globeCustomLon').fill('147.7');await page.locator('#globeCustomLon').press('Tab');
 await page.locator('#globeSelectorOceanBtn').click();
 await page.waitForFunction(()=>globalThis.getOceanModeDebugState?.().active===true,null,{timeout:90000});
 await page.locator('#oceanDiverToggle').waitFor({state:'visible'});await measure('ocean','ocean');
 await page.locator('#oceanDiverToggle').click();
 await page.waitForFunction(()=>getOceanModeDebugState().diver?.active===true);
 assert.equal(await page.evaluate(()=>getWorldExplorerSupportReceipt().mode),'diver');
 report.checks.push('actual-environment-and-diver-support-context');
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.failedLocal,[]);report.ok=true;
}catch(error){report.failure=error.message;throw error;}
finally{await fs.writeFile(`${output}/report.json`,JSON.stringify(report,null,2));await closeOwnedBrowser(browserServer);await server.close();}
console.log(JSON.stringify({ok:report.ok,checks:report.checks,scenes:report.scenes.map(s=>({id:s.id,resources:s.after.resources,animation:s.animation}))}));
