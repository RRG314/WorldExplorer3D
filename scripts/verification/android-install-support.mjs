import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {closeOwnedBrowser} from './owned-browser.mjs';

const out=path.resolve('output/research/android-testing-2026-10-23');
await fs.mkdir(out,{recursive:true});
const evidence={scope:'Actual browser navigation recovery, without loading a world',checks:[],errors:[]};
const server=http.createServer(async(req,res)=>{
  if(req.url==='/app/offline-worker.js') {
    res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});
    res.end(await fs.readFile('app/offline-worker.js'));return;
  }
  if(req.url==='/app/probe') {
    res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});
    res.end('<!doctype html><title>Online navigation probe</title><h1>Online</h1><script src="/app/install-support.js"></script>');return;
  }
  if(req.url==='/app/install-support.js') {
    res.writeHead(200,{'Content-Type':'text/javascript'});res.end(await fs.readFile('app/install-support.js'));return;
  }
  res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Account outside scope</title>Account');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const owned=await chromium.launchServer({headless:true,channel:'chrome'});
try {
  const browser=await chromium.connect(owned.wsEndpoint());
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const page=await context.newPage();page.on('pageerror',error=>evidence.errors.push(error.message));
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
  await page.goto(origin+'/account/');
  assert.equal(await page.evaluate(()=>navigator.serviceWorker.controller),null);
  evidence.checks.push('Account pages remain outside service-worker scope');
  assert.deepEqual(evidence.errors,[]);evidence.passed=true;
} catch(error) {evidence.passed=false;evidence.failure=error.message;throw error;}
finally {
  try {await closeOwnedBrowser(owned);}finally {await new Promise(resolve=>server.close(resolve));}
  await fs.writeFile(path.join(out,'browser-install-support.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence));
}
