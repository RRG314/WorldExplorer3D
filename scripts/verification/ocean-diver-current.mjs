import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';
const server = await startStaticServer({ rootDir: process.env.WE3D_VERIFY_ROOT || process.cwd(), ports: [4396] });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const dir = 'output/verification/ocean-plan';
await fs.mkdir(dir, { recursive: true });
const report = { scope: 'Mutable source, actual standalone Ocean explorer/sub handoff; controlled bathymetry provider', cases: [], errors: [] };
try {
 const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
 let elevation = 50, delay = 0;
 await context.route('**/reverse?**', route => route.fulfill({ json: { display_name: 'Entry check fixture', lat: '39.2898', lon: '-76.6122', address: { city: 'Entry check fixture' } } }));
 await context.route('https://api-bdc.io/**', route => route.fulfill({ json: { locality: 'Entry check fixture' } }));
 await context.route('https://wms.gebco.net/**', async route => {
   const captured = elevation, wait = delay;
   if (wait) await new Promise(r => setTimeout(r, wait));
   await route.fulfill({ status: captured === null ? 503 : 200, contentType: 'text/plain', body: captured === null ? 'unavailable' : `value_list = '${captured}'` }).catch(() => {});
 });
 const page = await context.newPage();
 page.on('pageerror', error => report.errors.push(error.message));
 page.on('console', message => {if(message.text().includes('[BoatMode]')) (report.boatWarnings ||= []).push(message.text());});
 await page.goto(`http://127.0.0.1:${server.port}/`, { waitUntil: 'load' });
 await page.locator('#landingPrimaryCta').click();
 await page.waitForFunction(() => window.__WE3D_RUNTIME_READY__ === true, null, { timeout: 90000 });
 await page.waitForSelector('#globeSelectorScreen.show');
 if (await page.locator('#analyticsConsentDenyBtn').isVisible()) await page.locator('#analyticsConsentDenyBtn').click();
 const select = async (lat, lon) => {
   await page.locator('#globeCustomLat').fill(String(lat));
   await page.locator('#globeCustomLon').fill(String(lon));
   await page.locator('#globeCustomLon').press('Tab');
 };
 const click = () => page.locator('#globeSelectorOceanBtn').click();

 elevation=-80;await select(-18.2861,147.7);await click();
 await page.waitForFunction(()=>window.getOceanModeDebugState?.().active===true,null,{timeout:90000});
 await page.locator('#oceanDiverToggle').waitFor({state:'visible'});
 await page.locator('#oceanDiverToggle').click();
 await page.waitForFunction(()=>window.getOceanModeDebugState?.().diver?.swimming?.equipment==='scuba',null,{timeout:30000});
 const paused=await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');ctx.paused=true;return getOceanModeDebugState().diver});
 await page.waitForTimeout(500);const stillPaused=await page.evaluate(()=>getOceanModeDebugState().diver);assert.deepEqual(stillPaused.position,paused.position);assert.equal(stillPaused.swimming.airSeconds,paused.swimming.airSeconds);
 await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');ctx.paused=false});report.cases.push({id:'pause-preserves-diver-position-and-air',passed:true});
 const initial=await page.evaluate(()=>getOceanModeDebugState());
 assert.equal(initial.diver.ready,true);assert.equal(initial.diver.swimming.equipment,'scuba');
 await page.keyboard.down('w');
 try{await page.waitForFunction(position=>{const d=getOceanModeDebugState().diver;return Math.hypot(d.position.x-position.x,d.position.z-position.z)>.6},initial.diver.position,{timeout:12000})}catch(error){report.motionFailure=await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');return {state:getOceanModeDebugState(),actions:ctx.readControlActions('ocean'),focus:document.activeElement?.id}});throw error}finally{await page.keyboard.up('w')}

 const moved=await page.evaluate(()=>getOceanModeDebugState());
 assert.ok(Math.hypot(moved.diver.position.x-initial.diver.position.x,moved.diver.position.z-initial.diver.position.z)>.5);
 assert.deepEqual(moved.position,initial.position);report.cases.push({id:'diver-owns-motion-sub-stays-parked',passed:true});
 assert.doesNotMatch(await page.locator('#boatPrompt').innerText(),/Surface boat available/);
 await page.screenshot({path:`${dir}/diver-outside-sub.png`});
 assert.equal(await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');return ctx.transferSubmarineToBoat()}),false);
 assert.equal(await page.evaluate(()=>getOceanModeDebugState().diver.active),true);report.cases.push({id:'surface-transfer-cannot-abandon-diver',passed:true});
 await page.setViewportSize({width:390,height:844});
 const layout=await page.locator('#oceanDiverControls').boundingBox();assert.ok(layout.x>=0&&layout.x+layout.width<=391);
 const diveHud=await page.locator('#oceanSwimmingHud').boundingBox(),prompt=await page.locator('#boatPrompt').boundingBox(),map=await page.locator('#minimap').boundingBox();
 assert.ok(!prompt||prompt.y+prompt.height<=diveHud.y);assert.ok(layout.y>=map.y+map.height);
 await page.screenshot({path:`${dir}/diver-phone.png`});report.cases.push({id:'phone-width-boarding-controls-fit',passed:true});
 await page.setViewportSize({width:1440,height:900});
 await page.locator('#oceanDiverToggle').click();
 await page.waitForFunction(()=>getOceanModeDebugState().diver.active===false);
 assert.equal(await page.locator('#oceanSwimmingHud').count(),0);report.cases.push({id:'boarding-restores-sub-control-and-removes-dive-ui',passed:true});
 await page.locator('#oceanDiverToggle').click();await page.waitForFunction(()=>getOceanModeDebugState().diver.active===true);
 await page.locator('#oceanSwimmingHud').getByRole('button',{name:'Recover',exact:true}).click();
 await page.waitForFunction(()=>getOceanModeDebugState().diver.active===false);report.cases.push({id:'explicit-recovery-returns-aboard',passed:true});
 await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');window.diverCtx=ctx;ctx.oceanMode.submarine.position.y=-40});
 await page.waitForFunction(()=>document.querySelector('#oceanDiverToggle').disabled===true);assert.match(await page.locator('#oceanDiverControls').innerText(),/1–16/);report.cases.push({id:'deep-sub-exit-is-blocked-with-instructions',passed:true});
 await page.evaluate(()=>diverCtx.stopOceanMode());
 assert.equal(await page.locator('#oceanDiverControls').count(),0);assert.equal(await page.locator('#oceanSwimmingHud').count(),0);report.cases.push({id:'environment-exit-disposes-diver-ui',passed:true});
 assert.deepEqual(report.errors,[]);report.passed=true;
}finally{await fs.writeFile(`${dir}/diver-browser.json`,JSON.stringify(report,null,2));await browser.close();await server.close()}
console.log(JSON.stringify(report));
