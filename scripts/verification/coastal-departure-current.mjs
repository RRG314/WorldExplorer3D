import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const out=process.env.WE3D_COASTAL_OUTPUT||'output/verification/coastal-departure';await mkdir(out,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4396]});let browser,page;
const report={passed:false,scope:'Actual deck/GLTF/Journal storage, controlled wave/site/depth fixture; full voyage acceptance is separate',cases:[],errors:[]};
try{
 browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage({viewport:{width:1280,height:800}});page.on('pageerror',e=>report.errors.push(String(e)));
 await page.route('https://wms.gebco.net/**',route=>route.fulfill({contentType:'text/plain',body:"value_list = '-30'"}));
 const url=`http://127.0.0.1:${server.port}/tests/fixtures/research-deck.html?survey&guide`;
 await page.goto(url);await page.waitForFunction(()=>window.ready);await page.locator('#researchDeckEnter').click();await page.waitForFunction(()=>researchTest.ctx.marineResearch.coastal.snapshot().ready);
 await page.getByLabel('Deck destination').selectOption('chart');await page.locator('#coastalDeckAction').click();await page.waitForFunction(()=>researchTest.ctx.marineResearch.coastal.snapshot().choices?.some(c=>c.allowed));
 await page.evaluate(()=>{window.write=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='events')throw new DOMException('Injected full storage','QuotaExceededError');return window.write.apply(this,args);};});
 await page.locator('#coastalDeckAction').click();await page.waitForFunction(()=>researchTest.ctx.marineResearch.coastal.snapshot().failure);assert.match(await page.locator('#coastalDeckChapter [role=status]').innerText(),/could not be confirmed/);assert.equal(await page.locator('#coastalDeckChapter [role=status]').isVisible(),true);assert.equal(await page.evaluate(()=>researchTest.ctx.marineResearch.coastal.snapshot().phase),'available');
 await page.screenshot({path:`${out}/failed-write.png`});
 await page.evaluate(()=>{IDBObjectStore.prototype.put=window.write;});await page.locator('#coastalDeckAction').click();await page.waitForFunction(()=>researchTest.ctx.marineResearch.coastal.snapshot().phase==='station');
 const events=await page.evaluate(()=>researchTest.ctx.discoveryProfileStore.getEventsById(['coastal-departure-v1:plan']));assert.equal(events.length,1);report.cases.push({id:'real-indexeddb-failure-visible-retry-commits-one-plan',passed:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${out}/phone-plan.png`});const bounds=await page.locator('#researchDeckControls').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<391&&bounds.y+bounds.height<745);report.cases.push({id:'phone-guidance-and-retry-controls-fit',passed:true});
 await page.evaluate(()=>{const api=researchTest.ctx.marineResearch.coastal;window.snapshot=api.snapshot;api.snapshot=()=>({...window.snapshot(),storage:'session'});});await page.waitForFunction(()=>document.querySelector('#coastalDeckChapter [role=status]').textContent.includes('Session only'));assert.equal(await page.locator('#coastalDeckChapter [role=status]').isVisible(),true);await page.screenshot({path:`${out}/session-storage-notice.png`});await page.evaluate(()=>researchTest.ctx.marineResearch.coastal.snapshot=window.snapshot);report.cases.push({id:'session-only-storage-disclosure-remains-visible',passed:true});
 await page.reload();await page.waitForFunction(()=>window.ready);await page.locator('#researchDeckEnter').click();await page.waitForFunction(()=>researchTest.ctx.marineResearch.coastal.snapshot().ready);assert.equal(await page.evaluate(()=>researchTest.ctx.marineResearch.coastal.snapshot().action),'resume');assert.equal(await page.evaluate(()=>researchTest.ctx.marineResearch.coastal.snapshot().phase),'station');report.cases.push({id:'new-vessel-does-not-erase-saved-chapter-and-offers-original-voyage',passed:true});
 assert.deepEqual(report.errors,[]);await browser.close();browser=null;
 let client=await readFile(`${process.env.HOME}/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js`,'utf8');
 client=client.replace('await captureScreenshot(page, canvas, shotPath);','await page.screenshot({path:shotPath,type:"png"});');
 const args=['--input-type=module','-','--headless','false','--url',url,'--click-selector','#researchDeckEnter','--actions-json',JSON.stringify({steps:[{buttons:['left'],frames:4},{buttons:[],frames:24}]}),'--iterations','1','--screenshot-dir',`${out}/prescribed-client`];
 const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{stdio:['pipe','inherit','inherit']});child.stdin.end(client);child.on('error',reject);child.on('exit',resolve);});assert.equal(code,0);assert.ok(!(await readdir(`${out}/prescribed-client`)).some(f=>f.startsWith('errors-')));report.cases.push({id:'prescribed-client-walk-view-and-coastal-guidance',passed:true});report.passed=true;
}catch(error){report.failure=String(error.stack||error);await page?.screenshot({path:`${out}/failure.png`}).catch(()=>{});throw error;}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser?.close();await server.close();}
console.log(JSON.stringify(report));
