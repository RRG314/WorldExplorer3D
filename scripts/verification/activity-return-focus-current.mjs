import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const output='output/verification/experience-browser-20261102/entry-focus';
await fs.mkdir(output,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4498,4499]});
const browser=await chromium.launch({channel:'chrome',headless:true});
const checks=[],errors=[];
try{
 for(const [width,height] of [[390,844],[844,390],[1440,960]]){
  const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage();
  try{
   page.on('pageerror',error=>errors.push(error.message));
   await page.goto(`http://127.0.0.1:${server.port}/tests/fixtures/experience-browser.html?ready=1`);
   await page.evaluate(()=>{window.globalEscapes=0;addEventListener('keydown',event=>{if(event.key==='Escape')window.globalEscapes++;});});
   await page.locator('[data-experience-begin]').click();
   await page.waitForFunction(()=>window.experienceCheck.entered===1);
   assert.equal(await page.locator('#experienceBrowser').evaluate(el=>el.open),false);
   assert.equal(await page.locator('#world').evaluate(el=>document.activeElement===el),true);
   await page.keyboard.press('w');assert.equal(await page.evaluate(()=>window.experienceCheck.walkKeys),1);
   await page.locator('#open').click();await page.keyboard.press('Escape');
   assert.equal(await page.locator('#open').evaluate(el=>document.activeElement===el),true);
   assert.equal(await page.evaluate(()=>window.globalEscapes),0);
   await page.goto(`http://127.0.0.1:${server.port}/tests/fixtures/geology-station.html`);await page.locator('#open').click();
   await page.evaluate(()=>{window.globalEscapes=0;addEventListener('keydown',event=>{if(event.key==='Escape')window.globalEscapes++;});document.querySelector('.research-station h2').focus();});
   await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').evaluate(el=>el.open),false);assert.equal(await page.evaluate(()=>window.globalEscapes),0);
   checks.push({width,height,checks:['successful entry closes brief','successful entry focuses world','movement key reaches world','cancel restores origin','Activities Escape stays with dialog','field station Escape stays with dialog']});
  }finally{await context.close();}
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(`${output}/receipt.json`,JSON.stringify({ok:true,scope:'Actual shared Activities controller and keyboard focus with isolated gameplay adapter',checks,errors},null,2)+'\n');
 console.log('PASS activity entry/cancel focus and world key routing at all three sizes.');
}finally{await browser.close();await server.close();}
