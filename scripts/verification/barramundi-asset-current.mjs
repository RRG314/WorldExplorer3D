import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
const dir=process.env.WE3D_FISH_ASSET_OUTPUT||'output/roadmap-20261010/barramundi-intake';await fs.mkdir(dir,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4396]});const owned=await chromium.launchServer({channel:'chrome',headless:false}),browser=await chromium.connect(owned.wsEndpoint());
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1100,height:750}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.port}/scripts/verification/fixtures/marine-asset-review.html?asset=/app/assets/models/marine/barramundi/barramundi.glb`);
 await page.waitForFunction(()=>window.__fixtureReady===true);
 await page.screenshot({path:`${dir}/front.png`});await page.locator('#side').click();await page.screenshot({path:`${dir}/side.png`});
 const rendered=await page.evaluate(()=>JSON.parse(render_game_to_text()));assert.ok(rendered.triangles<4000);assert.deepEqual(errors,[]);
 await fs.writeFile(`${dir}/report.json`,JSON.stringify({passed:true,scope:'Real WebGL model/component, not gameplay',rendered,errors},null,2));
}finally{await closeOwnedBrowser(owned);await server.close();}
