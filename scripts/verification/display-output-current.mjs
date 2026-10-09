import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {closeOwnedBrowser} from './owned-browser.mjs';
const base=process.env.WE3D_VERIFY_BASE_URL||'http://127.0.0.1:4192';
const dir='output/verification/visual-consistency-20261008';await fs.mkdir(dir,{recursive:true});
const owned=await chromium.launchServer({channel:'chrome',headless:false});const browser=await chromium.connect(owned.wsEndpoint());
const report={scope:'Controlled real-WebGL output parity and actual bundled player assets; no live world data',errors:[]};
try{
 const page=await browser.newPage({viewport:{width:1200,height:760}});page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.goto(`${base}/scripts/verification/fixtures/night-readability.html`);await page.waitForFunction(()=>window.__fixtureReady===true,null,{timeout:20000});
 report.parity=await page.evaluate(()=>checkDisplayParity());
 assert.equal(report.parity.outputPassCount,1);assert.equal(report.parity.lastPass,'World Explorer display output');
 for(const c of report.parity.cases)assert.ok(c.maxDifference<=5,`Display changed at ${JSON.stringify(c)}`);
 for(const phase of ['night','day']){await page.locator(`#${phase}`).click();await page.waitForTimeout(250);await page.screenshot({path:`${dir}/controlled-${phase}.png`});}
 await page.locator('#night').click();await page.locator('#storm').click();await page.waitForTimeout(250);await page.screenshot({path:`${dir}/controlled-storm-night.png`});
 report.assets=JSON.parse(await page.evaluate(()=>render_game_to_text()));assert.equal(report.assets.paint,'artist-white-exterior');assert.equal(report.assets.characters.length,2);
 assert.deepEqual(report.errors,[]);report.passed=true;
} catch(error){report.failure=String(error.stack||error);process.exitCode=1;}
finally{await fs.writeFile(`${dir}/display-output-report.json`,JSON.stringify(report,null,2));await closeOwnedBrowser(owned);}
console.log(JSON.stringify({passed:report.passed,comparisons:report.parity?.cases.length,worstDifference:Math.max(...report.parity?.cases.map(c=>c.maxDifference)||[]),errors:report.errors,failure:report.failure}));
