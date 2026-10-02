import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={scope:'Actual full walking physics and shared water sampling across a controlled sloping bank; no injected swim pose',errors:[]};
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}});page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto('http://127.0.0.1:4398/tests/fixtures/swimming.html?shore=1');await page.waitForFunction(()=>window.ready);
 const advance=(input,ms)=>page.evaluate(async({input,ms})=>{swimTest.setInput(input);await swimTest.step(ms)}, {input,ms});
 await advance({strafe:-1},1200);let s=await page.evaluate(()=>JSON.parse(render_game_to_text()));assert.equal(s.walker.waterTraversal,'wading');report.waded=true;
 await advance({strafe:-1},6500);s=await page.evaluate(()=>JSON.parse(render_game_to_text()));assert.ok(s.walker.swimming);assert.equal(s.walker.swimming.equipment,'none');report.enteredByWalking=true;
 await page.screenshot({path:'output/verification/product-plan/swimming-shore-entry.png'});
 await advance({strafe:1},8500);s=await page.evaluate(()=>JSON.parse(render_game_to_text()));assert.equal(s.walker.swimming,null);assert.equal(s.walker.waterTraversal,'dry');assert.ok(s.walker.x<-4);assert.ok(Math.abs(s.walker.y-1.9)<.05);report.exitedByWalking=true;
 await page.screenshot({path:'output/verification/product-plan/swimming-shore-exit.png'});assert.deepEqual(report.errors,[]);report.passed=true;
}finally{await fs.writeFile('output/verification/product-plan/swimming-shore.json',JSON.stringify(report,null,2));await browser.close()}
console.log(JSON.stringify(report));
