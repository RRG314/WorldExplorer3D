import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium,webkit,devices} from 'playwright';
import {closeOwnedBrowser} from './owned-browser.mjs';
import {startStaticServer} from './static-server.mjs';

const out=path.resolve(process.env.WE3D_VERIFY_OUTPUT_DIR || 'output/research/app-install-2026-10-26');
const platformsOnly=process.env.WE3D_INSTALL_SCOPE==='platforms';
await fs.mkdir(out,{recursive:true});
const evidence={scope:'Actual local landing HTML, styles, manifest and install scripts in Chrome; controlled browser-event outcomes; actual scoped worker offline/retry. No OS installation, physical device, multiplayer or 3D gameplay acceptance.',checks:[],errors:[]};
const server=await startStaticServer({rootDir:process.cwd(),ports:[0],handleRequest:async(req,res,url)=>{
  if(url.pathname==='/app/probe') {
    res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});
    res.end('<!doctype html><title>Online navigation probe</title><h1>Online</h1><script src="/app/install-support.js"></script>');return true;
  }
  if(url.pathname==='/account/probe') {
    res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Account outside scope</title>Account');return true;
  }
  return false;
}});
const origin='http://127.0.0.1:'+server.port;
// A Playwright newContext is incognito: Chrome correctly refuses installation
// there. Use the default context of this disposable owned profile for eligibility.
let owned=await chromium.launchServer({headless:true,channel:'chrome',args:['--remote-debugging-port=0']});
try {
  const profile=owned.process().spawnargs.find(arg=>arg.startsWith('--user-data-dir=')).split('=').slice(1).join('=');
  const devtools=await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8');
  const port=Number(devtools.split('\n')[0]);assert.ok(port>0&&port<65536);
  const browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context=browser.contexts()[0];assert.ok(context);
  if(!platformsOnly){
  const page=await context.newPage();page.on('pageerror',error=>evidence.errors.push(error.message));
  await page.setViewportSize({width:390,height:844});
  await page.goto(origin+'/#install');
  await page.locator('#installAppBtn').waitFor({state:'visible'});
  assert.equal(await page.locator('link[rel="manifest"]').getAttribute('href'),'./app/manifest.webmanifest');
  const cdp=await context.newCDPSession(page);
  const manifest=await cdp.send('Page.getAppManifest');
  assert.deepEqual(manifest.errors,[]);assert.equal(JSON.parse(manifest.data).id,'/app/');
  const eligibility=await cdp.send('Page.getInstallabilityErrors');
  evidence.installability=eligibility;
  assert.deepEqual(eligibility.installabilityErrors,[]);
  let registration;const registrationDeadline=Date.now()+10000;
  do {
    registration=await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration('/app/');return r?.active?r.scope:null;});
    if(registration)break;
    await page.waitForTimeout(100);
  } while(Date.now()<registrationDeadline);
  assert.equal(registration,origin+'/app/');
  assert.equal(await page.evaluate(()=>navigator.serviceWorker.controller),null);
  evidence.browserPromptAvailable=await page.locator('#installAppBtn').textContent()==='Install World Explorer 3D';
  evidence.checks.push('Real landing manifest meets Chrome installability checks; game recovery registration leaves landing outside its scope');
  for(const size of [{width:1440,height:900},{width:390,height:844},{width:844,height:390}]) {
    await page.setViewportSize(size);
    await page.locator('[data-install-platform="android"] summary').click();
    await page.locator('#install').evaluate(e=>e.scrollIntoView({block:'start',behavior:'instant'}));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    const button=await page.locator('#installAppBtn').boundingBox();assert.ok(button.height>=44);
    await page.screenshot({path:path.join(out,`install-${size.width}.png`)});
    await page.locator('[data-install-platform="android"] summary').click();
  }
  evidence.checks.push('Desktop, phone portrait and landscape installation content reflows with usable targets');
  await page.evaluate(()=>{
    let calls=0;globalThis.__installTestCalls=()=>calls;
    const e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=async()=>{calls++;return{outcome:'dismissed'};};window.dispatchEvent(e);
  });
  assert.equal(await page.locator('#installAppBtn').textContent(),'Install World Explorer 3D');
  assert.equal(await page.evaluate(()=>__installTestCalls()),0);
  await page.locator('#installAppBtn').click();assert.match(await page.locator('#installStatus').textContent(),/cancelled/);
  await page.locator('#installAppBtn').click();assert.equal(await page.evaluate(()=>__installTestCalls()),1);
  assert.equal(await page.locator('#installSteps').evaluate(e=>e===document.activeElement),true);
  await page.evaluate(()=>{
    const e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=async()=>({outcome:'accepted'});window.dispatchEvent(e);
  });
  await page.locator('#installAppBtn').click();assert.match(await page.locator('#installStatus').textContent(),/requested/);
  await page.evaluate(()=>window.dispatchEvent(new Event('appinstalled')));
  assert.equal(await page.locator('#installAppBtn').isHidden(),true);
  assert.match(await page.locator('#installStatus').textContent(),/Installation complete/);
  evidence.checks.push('Controlled browser-event integration: no automatic prompt, dismiss/retry, single use, accepted versus installed, focus and completion');
  await cdp.detach();
  await page.goto(origin+'/app/probe');
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  evidence.checks.push('Installed through the real deferred registration script');
  await page.evaluate(()=>localStorage.setItem('we3d-install-probe','retained'));
  await context.setOffline(true);
  await page.reload();assert.match(await page.title(),/Connect to explore/);
  assert.equal(await page.getByRole('button',{name:'Try again'}).count(),1);
  await page.screenshot({path:path.join(out,'offline-recovery-mobile.png')});
  evidence.checks.push('Offline navigation shows the mobile recovery screen');
  await context.setOffline(false);await page.getByRole('button',{name:'Try again'}).click();
  await page.waitForFunction(()=>document.title==='Online navigation probe');
  assert.equal(await page.evaluate(()=>localStorage.getItem('we3d-install-probe')),'retained');
  assert.deepEqual(await page.evaluate(()=>caches.keys()),[]);
  evidence.checks.push('Retry restores the network response without clearing local data or creating asset caches');
  await page.goto(origin+'/account/probe');
  assert.equal(await page.evaluate(()=>navigator.serviceWorker.controller),null);
  evidence.checks.push('Account pages remain outside service-worker scope');
  }
  const noScript=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
  const fallback=await noScript.newPage();await fallback.goto(origin+'/#install');
  assert.equal(await fallback.locator('#installAppBtn').isHidden(),true);
  await fallback.locator('[data-install-platform="ios"] summary').focus();
  await fallback.keyboard.press('Enter');
  assert.equal(await fallback.locator('[data-install-platform="ios"]').evaluate(e=>e.open),true);
  assert.match(await fallback.locator('[data-install-platform="ios"]').innerText(),/Add to Home Screen/);
  await noScript.close();evidence.checks.push('Without JavaScript, device instructions and game links remain usable');
  await closeOwnedBrowser(owned);owned=null;
  owned=await webkit.launchServer({headless:true});
  const safari=await webkit.connect(owned.wsEndpoint());
  const apple=await safari.newContext({...devices['iPhone 13'],deviceScaleFactor:1});
  const phone=await apple.newPage();phone.on('pageerror',error=>evidence.errors.push(error.message));
  await phone.goto(origin+'/#install');
  await phone.locator('#installAppBtn').waitFor({state:'visible'});
  assert.equal(await phone.locator('#installAppBtn').textContent(),'Show install steps');
  await phone.locator('#installAppBtn').click();
  assert.equal(await phone.locator('[data-install-platform="ios"]').evaluate(e=>e.open),true);
  assert.equal(await phone.locator('link[rel="apple-touch-icon"]').count(),1);
  for(const size of [{width:390,height:844},{width:844,height:390}]){
    await phone.setViewportSize(size);await phone.locator('#install').evaluate(e=>e.scrollIntoView({block:'start',behavior:'instant'}));
    assert.ok(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await phone.screenshot({path:path.join(out,`webkit-install-${size.width}.png`)});
  }
  evidence.checks.push('Actual WebKit with an iPhone browser profile selects usable Apple manual steps in portrait and landscape; not physical Safari/OS install acceptance');
  assert.deepEqual(evidence.errors,[]);evidence.passed=true;
} catch(error) {evidence.passed=false;evidence.failure=error.message;throw error;}
finally {
  try {if(owned)await closeOwnedBrowser(owned);}finally {await server.close();}
  await fs.writeFile(path.join(out,'browser-install-support.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence));
}
