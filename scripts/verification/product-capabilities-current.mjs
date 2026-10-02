import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';
const server = await startStaticServer({ rootDir: process.cwd(), ports: [4396] });
const browser = await chromium.launch({channel:'chrome',headless:true});
const dir='output/verification/product-plan'; await fs.mkdir(dir,{recursive:true});
const report={scope:'Actual mutable-source Quick Start UI; no authenticated persistence or production certification',cases:[],errors:[]};
try {
 for(const mobile of [false,true]) {
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},hasTouch:mobile,isMobile:mobile});
  const page=await context.newPage(); page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.port}/`,{waitUntil:'load'});
  await page.locator('#landingPrimaryCta').click();
  await page.waitForFunction(()=>window.__WE3D_RUNTIME_READY__===true,null,{timeout:90000});
  if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
  await page.locator('[data-globe-destination="controls"]').first().click();
  await page.locator('#capabilityGuide summary').click();
  await page.getByRole('searchbox',{name:'Search game capabilities'}).fill('swimming');
  const swim=page.locator('[data-capability="swimming"]');
  await swim.scrollIntoViewIfNeeded(); assert.match(await swim.innerText(),/Planned/);
  assert.match(await swim.innerText(),/not available yet/);
  await page.screenshot({path:`${dir}/capabilities-${mobile?'phone':'desktop'}.png`});
  await page.getByRole('searchbox',{name:'Search game capabilities'}).fill('Public live');
  assert.match(await page.locator('[data-capability="public-cameras"]').innerText(),/Planned/);
  await page.screenshot({path:`${dir}/camera-plan-${mobile?'phone':'desktop'}.png`});
  await page.getByRole('searchbox',{name:'Search game capabilities'}).fill('zz-no-result');
  assert.equal(await page.locator('.capabilityList li').count(),0);
  await page.getByRole('searchbox',{name:'Search game capabilities'}).fill('');
  await page.getByLabel('Feature category',{exact:true}).selectOption('data');
  assert.match(await page.locator('[data-capability="layer:ships"]').innerText(),/not live AIS/);
  assert.equal(await page.locator('#capabilityGuide').evaluate(el=>el.scrollWidth>el.clientWidth+2),false);
  assert.doesNotMatch(await page.locator('#capabilityGuide').innerText(),/app\/js\//);
  report.cases.push({viewport:mobile?'phone':'desktop',passed:true});
  await context.close();
 }
 assert.deepEqual(report.errors,[]); report.passed=true;
} finally {await fs.writeFile(`${dir}/capabilities-browser.json`,JSON.stringify(report,null,2));await browser.close();await server.close();}
console.log(JSON.stringify(report));
