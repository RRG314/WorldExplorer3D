import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const dir='output/verification/architecture-polish/session-cycles';await mkdir(dir,{recursive:true});
const server=await startStaticServer({rootDir:process.env.WE3D_VERIFY_ROOT||process.cwd(),ports:[4396]});
let browser;const report={scope:'Actual source/selected artifact, 10 sequential ship/submarine round trips through actual controller APIs; controlled GEBCO entry depth and failed optional place naming. Not physical-device or hosted acceptance.',cycles:[],errors:[]};
try {
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1280,height:800}});
 page.on('pageerror',error=>report.errors.push(error.message));
 await page.route('**/api/geospatial/reverse?**',route=>route.fulfill({status:503,json:{error:'Controlled naming outage'}}));
 await page.route('https://wms.gebco.net/**',route=>route.fulfill({status:200,contentType:'text/plain',body:"value_list = '-30'"}));
 await page.goto(`http://127.0.0.1:${server.port}/app/`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__WE3D_RUNTIME_READY__,null,{timeout:90000});
 if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
 await page.locator('#coralResearchStart').click();
 await page.waitForFunction(()=>window.getWorldExplorerRuntimeDiagnostics?.().modes?.boat,null,{timeout:60000});
 if(await page.locator('#researchDeckHelm').isVisible())await page.locator('#researchDeckHelm').click();
 await page.evaluate(async()=>{window.cycleContext=(await import('/app/js/shared-context.js?v=55')).ctx;});
 for(let i=0;i<10;i++){
  const result=await page.evaluate(async()=>{
   const c=cycleContext,id=c.boatMode.transportEntityId;
   const dived=await c.transferBoatToSubmarine({source:'lifecycle-cycle'});
   const oceanOwner=c.getEnv(),oceanId=c.oceanMode.submarine.transportEntityId;
   const recovered=await c.transferSubmarineToBoat({source:'lifecycle-cycle'});
   const lifecycle=c.getLifecycleRegistrySnapshot();
   return {dived,recovered,oceanOwner,oceanId,shipRetained:id===c.boatMode.transportEntityId,environment:c.getEnv(),scopes:lifecycle.activeScopeCount,resources:lifecycle.resourceCount,owners:lifecycle.owners,canvases:document.querySelectorAll('canvas').length,oceanActive:c.oceanMode.active};
  });
  assert.equal(result.dived,true);assert.equal(result.recovered,true);assert.equal(result.shipRetained,true);assert.equal(result.oceanOwner,'OCEAN');assert.equal(result.environment,'EARTH');assert.equal(result.oceanActive,false);
  report.cycles.push(result);
 }
 const settled=report.cycles.slice(2),baseline=settled[0];
 for(const cycle of settled){assert.equal(cycle.scopes,baseline.scopes);assert.equal(cycle.resources,baseline.resources);assert.equal(cycle.canvases,baseline.canvases);assert.deepEqual(cycle.owners,baseline.owners);}
 await page.screenshot({path:`${dir}/restored-ship.png`});assert.deepEqual(report.errors,[]);report.passed=true;
}finally{await writeFile(`${dir}/report.json`,JSON.stringify(report,null,2));await browser?.close();await server.close();}
console.log(JSON.stringify({passed:report.passed,cycles:report.cycles.length,errors:report.errors}));
