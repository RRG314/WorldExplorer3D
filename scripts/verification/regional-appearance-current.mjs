import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';
const out='output/streaming-review-20261011/building-appearance';await mkdir(out,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4397]});let owned;
const report={scope:'Actual regional shader, catalog, licensed textures, merged footprint and instanced geometry. Controlled buildings; full-app travel checked separately.',errors:[],requests:[],passed:false};
try{
 owned=await chromium.launchServer({channel:'chrome',headless:true});const browser=await chromium.connect(owned.wsEndpoint());const page=await browser.newPage({viewport:{width:1280,height:800}});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});page.on('response',r=>{if(r.status()>=400)report.requests.push({url:r.url(),status:r.status()})});
 await page.goto(`http://127.0.0.1:${server.port}/tests/fixtures/regional-appearance.html`);await page.waitForFunction(()=>window.fixtureReady,{},{timeout:60000});
 await runPrescribedGameActions(page,out,[{buttons:[],frames:3}],'canvas');await page.screenshot({path:`${out}/day.png`});report.state=JSON.parse(await page.evaluate(()=>render_game_to_text()));
 assert.equal(report.state.atlas.status,'ready');assert.equal(report.state.errors,0);assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);
 await page.evaluate(()=>setView(-48,5,-22,-44,4,0));await page.screenshot({path:`${out}/close.png`});
 await page.evaluate(()=>{setView(60,35,-90);setNight(true)});await page.screenshot({path:`${out}/night.png`});
 report.retiredGeometries=await page.evaluate(()=>retire());assert.equal(report.retiredGeometries,1);report.passed=true;
}catch(e){report.failure=e.stack;process.exitCode=1;}finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await closeOwnedBrowser(owned);await server.close();}
console.log(JSON.stringify(report));
