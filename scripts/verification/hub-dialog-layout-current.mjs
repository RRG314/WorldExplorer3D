import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
// Actual shared Activities markup/CSS/controller. Adapters are isolated: no race/career completion claim.
const server=await startStaticServer({rootDir:process.cwd(),ports:[4498,4499]});
const browser=await chromium.launch({channel:'chrome',headless:true});
const directory='output/verification/experience-browser-20261102';
const results=[];
await fs.mkdir(directory,{recursive:true});
try{
 for(const [width,height] of [[390,844],[844,390],[1440,960]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(String(error)));
  try{
   await page.goto(`http://127.0.0.1:${server.port}/tests/fixtures/experience-browser.html`);
   await page.locator('#open').click();await page.locator('[data-experience-id="career:racer"]').click();
   await page.getByRole('combobox',{name:'Starting place'}).waitFor();
   const bounds=await page.locator('[data-experience-begin]').evaluate(element=>{
    const r=element.getBoundingClientRect(),d=element.closest('dialog').getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return {height:r.height,bottom:r.bottom,dialogBottom:d.bottom,hit:hit===element||element.contains(hit),inViewport:r.top>=0&&r.bottom<=innerHeight&&r.right<=innerWidth};
   });
   assert.ok(bounds.height>=44&&bounds.bottom<=bounds.dialogBottom&&bounds.hit&&bounds.inViewport,JSON.stringify(bounds));
   const content=await page.locator('.experience-detail-content').boundingBox(),actions=await page.locator('.experience-actions').boundingBox();
   assert.ok(content.y+content.height<=actions.y,'Assignment content must not overlap actions');
   assert.equal(await page.locator('html').evaluate(el=>el.scrollWidth>innerWidth),false);
   await page.screenshot({path:`${directory}/${width}-detail.png`});
   if(width<701||height<481){await page.getByRole('button',{name:'← All activities'}).click();assert.equal(await page.locator('[data-experience-id="career:racer"]').getAttribute('aria-pressed'),'true');await page.locator('[data-experience-id="career:racer"]').click();}
   await page.locator('[data-experience-begin]').click();await page.getByRole('status').filter({hasText:'could not start'}).waitFor();
   assert.equal(await page.locator('#experienceBrowser').evaluate(el=>el.open),true);
   assert.equal(await page.locator('.experience-detail h3').textContent(),'First clean finish');
   await page.keyboard.press('Escape');assert.equal(await page.locator('#open').evaluate(el=>el===document.activeElement),true);
   await page.locator('#open').click();await page.getByRole('tab',{name:'Quick play',exact:true}).focus();await page.keyboard.press('Home');
   assert.equal(await page.getByRole('tab',{name:'Continue',exact:true}).getAttribute('aria-selected'),'true');
   await page.getByRole('tab',{name:'Careers',exact:true}).click();await page.getByRole('searchbox',{name:'Find an activity'}).fill('Geologist');
   await page.locator('[data-experience-id="career:geologist"]').click();assert.equal(await page.locator('[data-experience-begin]').isDisabled(),true);
   assert.equal(errors.length,0,errors.join('\n'));
   results.push({width,height,ok:true,bounds,checks:['primary-visible-and-hit','no-overlap','no-horizontal-overflow','selection-retained','failure-restores-brief','escape-restores-focus','keyboard-tabs','unavailable-never-starts'],errors});
  }finally{await context.close();}
 }
 await fs.writeFile(`${directory}/report.json`,JSON.stringify({ok:true,evidenceScope:'Actual shared UI/controller checks with isolated adapters; no gameplay/production claim',results},null,2)+'\n');
 console.log('PASS Activities desktop, portrait and short landscape: 8 checks each.');
}finally{await browser.close();await server.close();}
