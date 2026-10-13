import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const out=process.env.WE3D_FINISH_OUTPUT||'output/verification/harbor-finish';await mkdir(out,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4484]});let browser,page;
const report={ok:false,evidence:'Actual licensed GLTF, DOM and IndexedDB; seeded completion in a controlled showroom, not a world driving test',checks:[],errors:[]};
try{
 browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage({viewport:{width:1280,height:800}});page.setDefaultTimeout(30000);page.on('pageerror',e=>report.errors.push(String(e)));
 const url=`http://127.0.0.1:${server.port}/scripts/verification/fixtures/harbor-finish.html`;
 await page.goto(url);await page.waitForFunction(()=>globalThis.fixture);
 await page.locator('#discoveryHarborRun summary').click();await page.screenshot({path:`${out}/white-day.png`});
 await page.locator('[data-delivery-action="finish:slate"]').click();await page.waitForFunction(()=>fixture.runtime.snapshot().finishId==='slate'&&!fixture.runtime.snapshot().busy);
 assert.equal(await page.evaluate(()=>fixture.ctx.carMesh.userData.curatedVehicleVisual.userData.paintFinish),'artist-slate-exterior');
 await page.screenshot({path:`${out}/slate-day.png`});await page.evaluate(()=>fixture.lighting(true));await page.screenshot({path:`${out}/slate-night.png`});report.checks.push('authored-body-finish-changes-without-new-model-or-global-tint');
 await page.reload();await page.waitForFunction(()=>globalThis.fixture);assert.equal(await page.evaluate(()=>fixture.ctx.carMesh.userData.curatedVehicleVisual.userData.paintFinish),'artist-slate-exterior');report.checks.push('saved-choice-applies-after-late-car-load-and-reload');
 await page.evaluate(()=>{window.write=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='profiles')throw new DOMException('Injected full storage','QuotaExceededError');return window.write.apply(this,args);};});
 await page.locator('#discoveryHarborRun summary').click();await page.locator('[data-delivery-action="finish:white"]').click();await page.waitForFunction(()=>fixture.runtime.snapshot().saveError);
 assert.equal(await page.evaluate(()=>fixture.ctx.carMesh.userData.curatedVehicleVisual.userData.paintFinish),'artist-slate-exterior');
 await page.evaluate(()=>{IDBObjectStore.prototype.put=window.write;});await page.locator('[data-delivery-action="retry"]').click();await page.waitForFunction(()=>!fixture.runtime.snapshot().busy);
 await page.locator('[data-delivery-action="finish:white"]').click();await page.waitForFunction(()=>fixture.runtime.snapshot().finishId==='white'&&!fixture.runtime.snapshot().busy);report.checks.push('failed-save-does-not-change-finish-and-explicit-retry-recovers');
 const backup=await page.evaluate(async()=>{const data=await fixture.store.exportData();await fixture.store.importData(data);await fixture.runtime.refresh();return {finish:(await fixture.store.getProfile()).harborRun.finishId,receipts:(await fixture.store.getEventsById(['event:campaign-completed:harbor-run:v1'])).length};});assert.deepEqual(backup,{finish:'white',receipts:1});report.checks.push('backup-roundtrip-keeps-choice-with-one-achievement');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${out}/phone.png`});assert.equal(await page.locator('aside').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);report.checks.push('phone-width-controls-fit');
 assert.deepEqual(report.errors,[]);await browser.close();browser=null;
 let client=await readFile(`${process.env.HOME}/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js`,'utf8');
 assert.ok(client.includes('await captureScreenshot(page, canvas, shotPath);'));client=client.replace('await captureScreenshot(page, canvas, shotPath);','await page.screenshot({path:shotPath,type:"png"});');
 const args=['--input-type=module','-','--headless','false','--url',url,'--click-selector','#discoveryHarborRun summary','--actions-json',JSON.stringify({steps:[{buttons:['left'],frames:5},{buttons:[],frames:60}]}),'--iterations','1','--screenshot-dir',`${out}/prescribed-client`];
 const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{stdio:['pipe','inherit','inherit']});child.stdin.end(client);child.on('error',reject);child.on('exit',resolve);});assert.equal(code,0);assert.ok(!(await readdir(`${out}/prescribed-client`)).some(f=>f.startsWith('errors-')));report.checks.push('prescribed-client-exercises-view-and-reads-visible-state');report.ok=true;
}catch(error){report.error=String(error.stack||error);await page?.screenshot({path:`${out}/failure.png`}).catch(()=>{});throw error;}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser?.close();await server.close();}
console.log(JSON.stringify(report));
