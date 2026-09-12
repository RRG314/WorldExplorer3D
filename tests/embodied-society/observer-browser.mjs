import {createRequire} from 'node:module';
import http from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=process.cwd(),require=createRequire(root+'/package.json');const {chromium}=require('playwright');
const html=`<!doctype html><html><head><meta charset="utf-8"></head><body style="background:#d5e5e5;font-family:system-ui"><h1>Observer component verification</h1><p>Fixture only — no model or world simulation</p><script type="module">import {createObserverPanel} from '/observer-panel.mjs';const {panel,el,updateInventory}=createObserverPanel(document);document.body.append(panel);el('status').textContent='AI resident running';el('compact-status').textContent='AI resident running';updateInventory([{catalogId:'trail-water',quantity:8},{catalogId:'route-snack',quantity:4}]);const b=document.createElement('button');b.textContent='Apply consumption fixture';b.onclick=()=>updateInventory([{catalogId:'trail-water',quantity:8},{catalogId:'route-snack',quantity:3}]);document.body.append(b);</script></body></html>`;
const server=http.createServer(async(req,res)=>{try{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(html);}else if(['/observer-panel.mjs','/observer-report.mjs'].includes(req.url)){res.setHeader('Content-Type','text/javascript');res.end(await readFile(root+'/app/js/experiments/embodied-society'+req.url));}else{res.statusCode=404;res.end();}}catch{res.statusCode=500;res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1100,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);await page.getByRole('button',{name:'Minimize',exact:true}).waitFor();
 assert.match(await page.locator('[data-inventory]').innerText(),/trail water × 8/);
 await page.getByRole('button',{name:'Minimize',exact:true}).click();assert.equal(await page.locator('[data-content]').isVisible(),false);assert.match(await page.locator('[data-compact]').innerText(),/route snack × 4/);
 await page.getByRole('button',{name:'Apply consumption fixture'}).click();assert.match(await page.locator('[data-compact]').innerText(),/route snack × 3/);
 await mkdir(root+'/output/verification/research-observer',{recursive:true});await page.screenshot({path:root+'/output/verification/research-observer/minimized.png'});
 await page.getByRole('button',{name:'Expand',exact:true}).click();assert.equal(await page.locator('[data-content]').isVisible(),true);assert.match(await page.locator('[data-inventory]').innerText(),/route snack × 3/);
 await page.setViewportSize({width:390,height:720});const box=await page.locator('section').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390);await page.screenshot({path:root+'/output/verification/research-observer/mobile-expanded.png'});assert.deepEqual(errors,[]);console.log('Observer browser fixture passed: quantity, consumption update, minimize, expand, mobile containment; no page errors.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
