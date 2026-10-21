import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
const out='output/research/browser-completion-2026-10-20/tester-flow';
await fs.mkdir(out,{recursive:true});
const html=await fs.readFile('app/index.html','utf8'), invitation=html.slice(html.indexOf('<aside id="testerInvitation"'),html.indexOf('</aside>',html.indexOf('<aside id="testerInvitation"'))+8);
const report={passed:false,scope:'Actual invitation markup/component and confirmation page; controlled HTTP outcomes, no email sent or production contact created',errors:[]};
const server=await startStaticServer({rootDir:process.cwd(),ports:[4397]});let owned;
try {
  owned=await chromium.launchServer({channel:'chrome',headless:true});const browser=await chromium.connect(owned.wsEndpoint());const page=await browser.newPage({viewport:{width:390,height:844}});
  page.on('pageerror',e=>report.errors.push(e.message));let attempts=0;
  await page.route('**/tester-fixture',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/app/styles/start-hub.css"><style>:root{--hub-bg:#081425;--hub-panel:#102033;--hub-text:#eef6ff;--hub-muted:#afc4d8;--hub-line-strong:#6c8099}</style></head><body><div id="globeSelectorScreen">${invitation}</div><button id="globeSelectorStartBtn">Explore</button><script type="module">import {mountTesterInvitation} from '/app/js/ui/tester-invitation.js';window.invitationScope=mountTesterInvitation({submitInterest:async(body,signal)=>{const r=await fetch('/registerAppTester',{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'},signal});if(!r.ok)throw Error('Unavailable');return r.json();}});</script></body></html>`}));
  await page.route('**/registerAppTester',async route=>{
    const body=route.request().postDataJSON();
    if(body.action==='confirm'){assert.equal(body.token,'a'.repeat(64));return route.fulfill({json:{confirmed:true}});}
    assert.equal(body.email,'tester@example.com');assert.equal(body.consent,true);assert.equal(body.consentVersion,'app-testing-v1');attempts++;
    await route.fulfill({status:attempts===1?503:200,json:attempts===1?{error:'Unavailable'}:{pending:true}});
  });
  await page.goto(`http://127.0.0.1:${server.port}/tester-fixture`);await page.locator('#testerInvitationOpen').click();
  await page.locator('#testerInvitationAddress').fill('tester@example.com');
  await page.locator('#testerInvitationSubmit').click();assert.equal(attempts,0,'Unchecked consent must not dispatch');
  await page.locator('#testerInvitationConsent').check();await page.locator('#testerInvitationSubmit').click();
  await page.getByText('We couldn’t confirm your request.',{exact:false}).waitFor();assert.equal(await page.locator('#testerInvitationForm').isVisible(),true);
  await page.locator('#testerInvitationSubmit').click();await page.getByText('Check your inbox.',{exact:false}).waitFor();assert.equal(attempts,2);
  assert.equal(await page.evaluate(()=>localStorage.getItem('we3d.tester-invitation.v1')),null,'Sending is not confirmed interest');
  await page.screenshot({path:`${out}/pending-mobile.png`});
  await page.goto(`http://127.0.0.1:${server.port}/account/tester.html#${'a'.repeat(64)}`);
  assert.equal(new URL(page.url()).hash,'');assert.equal(await page.locator('#confirmTester').isEnabled(),true);
  await page.locator('#confirmTester').click();await page.getByText('You’re on the tester interest list.',{exact:false}).waitFor();
  assert.equal(await page.evaluate(()=>localStorage.getItem('we3d.tester-invitation.v1')),'interested');
  await page.screenshot({path:`${out}/confirmed-mobile.png`});
  await page.goto(`http://127.0.0.1:${server.port}/tester-fixture`);assert.equal(await page.locator('#testerInvitation').isVisible(),false);
  assert.deepEqual(report.errors,[]);report.passed=true;report.cases=['explicit consent before dispatch','failed request remains retryable','pending is not confirmed consent','token removed from URL before user confirmation','confirmation persists dismissal across views'];
}catch(error){report.failure=String(error);process.exitCode=1;}finally{await closeOwnedBrowser(owned);await server.close();await fs.writeFile(`${out}/receipt.json`,JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));
