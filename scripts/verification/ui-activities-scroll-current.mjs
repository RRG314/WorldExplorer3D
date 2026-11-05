import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createFieldworkQaSession} from './fieldwork-qa-session.mjs';

const base=process.env.WE3D_VERIFY_BASE_URL||'http://127.0.0.1:4192';
const output=path.resolve(process.env.WE3D_UI_OUTPUT||`output/verification/trail-ui-20261104/activities-scroll-${Date.now()}`);
const report={scope:'Affected Activities scroll/image boundary only. Actual native browser, original career brief actions; no gameplay, account or backend procedures.',cases:[]};
let qa;
try {
  qa=await createFieldworkQaSession({rootDir:process.cwd(),output,careerId:'explorer',maximumDurationMs:4*60*1000});
  const {page}=qa;
  await page.goto(base+'/app/');await page.locator('#globeSelectorStartBtn').waitFor();await page.evaluate(()=>document.fonts.ready);
  for(const [width,height] of [[1440,960],[390,844],[844,390],[438,529]])for(const scale of ['100','200']){
    report.active={width,height,scale};
    await page.setViewportSize({width,height});
    await page.locator('[data-globe-destination="settings"]').click();
    await page.locator('#accessibilityTextScale').selectOption(scale);await page.keyboard.press('Escape');
    await page.locator('.globe-app-rail [data-globe-destination="games"]').click();
    const browser=page.locator('#experienceBrowser');await browser.waitFor({state:'visible'});
    assert.equal(await browser.locator('[data-experience-id]').count(),20);
    if(await browser.getAttribute('data-detail')==='true')await browser.locator('[data-experience-back]').click();
    const pane=browser.locator('.experience-list-pane');
    assert.equal(await pane.evaluate(e=>getComputedStyle(e).overflowY),'auto');
    await pane.hover();await page.mouse.wheel(0,500);
    await page.waitForFunction(()=>document.querySelector('#experienceBrowser .experience-list-pane').scrollTop>0);
    const first=browser.locator('[data-experience-id="career:racer"]');
    await first.scrollIntoViewIfNeeded();
    await first.locator('img').evaluate(img=>img.decode());
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const image=await first.locator('img').evaluate(img=>({src:img.currentSrc,width:img.naturalWidth,height:img.naturalHeight}));
    assert.equal(image.width,1600);assert.ok(image.src.endsWith('/assets/gallery/5.6/driving-1b41f3116f83.webp'));
    // At 200% in a short window a whole card may be taller than the pane;
    // its named action must still be reachable and hit-tested by normal input.
    await first.click();await browser.locator('.experience-detail h3').waitFor({state:'visible'});
    assert.match(await browser.locator('.experience-detail h3').innerText(),/clean finish/i);
    await browser.locator('[data-experience-back]').click();
    const last=browser.locator('[data-experience-id="career:companion-handler"]');
    await last.scrollIntoViewIfNeeded();await last.locator('img').evaluate(img=>img.decode());
    await last.click();await browser.locator('.experience-detail h3').waitFor({state:'visible'});
    assert.match(await browser.locator('.experience-detail h3').innerText(),/together/i);
    await browser.locator('[data-experience-back]').click();await first.scrollIntoViewIfNeeded();
    await first.locator('img').evaluate(img=>img.decode());
    await page.screenshot({path:path.join(output,`activities-${width}-${height}-${scale}.png`)});
    report.cases.push({width,height,scale,firstAndLastBrief:true,wheelScroll:true,image,ok:true});
    await page.keyboard.press('Escape');assert.equal(await browser.isVisible(),false);
  }
  assert.deepEqual(qa.report.errors,[]);delete report.active;report.ok=true;
}catch(error){report.ok=false;report.failure=error.stack;await qa?.fail(error);}
finally{await qa?.close();await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({ok:report.ok,output,cases:report.cases.length,failure:report.failure}));if(!report.ok)process.exitCode=1;
