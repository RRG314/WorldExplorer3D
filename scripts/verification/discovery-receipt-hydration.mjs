import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const server=await startStaticServer({rootDir:process.cwd(),ports:[4396]});
const browser=await chromium.launch({channel:'chrome',headless:true});
const dir='output/verification/product-plan';const report={scope:'Real browser IndexedDB with simulated account pages, no live backend/auth certification',errors:[]};
try{
 const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.port}/tests/fixtures/discovery-receipts.html`);
 await page.locator('#restore').click();await page.waitForFunction(()=>JSON.parse(render_game_to_text()).phase==='passed');
 report.initial=JSON.parse(await page.evaluate(()=>render_game_to_text()));assert.equal(report.initial.firstImported,501);
 await page.reload();await page.locator('#restore').click();await page.waitForFunction(()=>JSON.parse(render_game_to_text()).phase==='passed');
 report.reload=JSON.parse(await page.evaluate(()=>render_game_to_text()));assert.equal(report.reload.firstImported,0);
 await page.screenshot({path:`${dir}/receipt-reload.png`});assert.deepEqual(report.errors,[]);report.passed=true;
}finally{await fs.writeFile(`${dir}/receipt-browser.json`,JSON.stringify(report,null,2));await browser.close();await server.close();}
console.log(JSON.stringify(report));
