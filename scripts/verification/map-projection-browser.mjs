import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
const output=process.env.WE3D_MAP_OUTPUT||'output/verification/map-projection';await fs.mkdir(output,{recursive:true});
const server=await startStaticServer({rootDir:process.env.WE3D_VERIFY_ROOT||process.cwd(),ports:[4517]}),base=`http://127.0.0.1:${server.port}`;
const browserServer=await chromium.launchServer({channel:'chrome',headless:true}),browser=await chromium.connect(browserServer.wsEndpoint());
const report={ok:false,scope:'Actual source Earth map controls, normal input and desktop/phone viewport; no physical-phone or location-search acceptance',checks:[],errors:[],failedLocal:[],providerDegradations:[]};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});await configureStagingAppCheck(page,base);
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('response',r=>{const u=new URL(r.url());if(u.origin!==base||r.status()<400)return;const item={path:u.pathname,status:r.status()};if(r.status()===503&&['/api/geospatial/reverse','/api/geospatial/search'].includes(u.pathname))report.providerDegradations.push(item);else report.failedLocal.push(item);});
 await page.goto(`${base}/app/?loc=custom&lat=39.2904&lon=-76.6122&lname=Baltimore&launch=earth&gm=free&mode=walking`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__,null,{timeout:120000});
 if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
 await page.locator('#globeSelectorStartBtn').click();
 await page.waitForFunction(()=>{const d=getWorldExplorerRuntimeDiagnostics();return d.gameStarted&&!d.worldLoading&&d.worldDiscovery?.active&&!document.getElementById('loading')?.classList.contains('show');},null,{timeout:180000});
 await page.evaluate(async()=>{globalThis.__mapContext=(await import('/app/js/shared-context.js?v=55')).ctx;});
 const mini=await page.locator('#minimapZoomLevel').textContent();await page.locator('#minimapZoomIn').click();assert.notEqual(await page.locator('#minimapZoomLevel').textContent(),mini);await page.locator('#minimapZoomOut').click();
 for(const [id,viewport] of [['desktop',{width:1440,height:900}],['phone',{width:390,height:844}]]){
  await page.setViewportSize(viewport);await page.locator('#minimap').click();await page.locator('#largeMap.show').waitFor({state:'visible'});
  const before=await page.evaluate(()=>({x:__mapContext.Walk.state.walker.x,z:__mapContext.Walk.state.walker.z}));
  await page.keyboard.down('w');await page.waitForTimeout(300);await page.keyboard.up('w');
  assert.deepEqual(await page.evaluate(()=>({x:__mapContext.Walk.state.walker.x,z:__mapContext.Walk.state.walker.z})),before);
  const box=await page.locator('#largeMapCanvas').boundingBox(),x=box.x+box.width*.5,y=box.y+box.height*.55;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+45,y+30,{steps:8});await page.mouse.up();
  await page.waitForFunction(()=>document.getElementById('largeMap').classList.contains('browsing'));
  const zoom=await page.locator('#zoomLevel').textContent();await page.locator('#mapZoomIn').click();assert.notEqual(await page.locator('#zoomLevel').textContent(),zoom);
  await page.locator('#mapRecenter').click();await page.waitForFunction(()=>!document.getElementById('largeMap').classList.contains('browsing'));
  await page.screenshot({path:`${output}/${id}-map.png`});
  await page.locator('#mapClose').click();await page.waitForFunction(()=>!document.getElementById('largeMap').classList.contains('show'));
  report.checks.push(`${id}-open-pan-zoom-recenter-close-and-input-isolation`);
 }
 await page.setViewportSize({width:1440,height:900});await page.screenshot({path:`${output}/returned-to-world.png`});
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.failedLocal,[]);report.ok=true;
}catch(error){report.failure=error.message;throw error;}
finally{await fs.writeFile(`${output}/report.json`,JSON.stringify(report,null,2));await closeOwnedBrowser(browserServer);await server.close();}
console.log(JSON.stringify(report));
