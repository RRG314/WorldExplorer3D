import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const output=process.env.WE3D_PROVIDER_OUTPUT || 'output/verification/provider-outages';
await fs.mkdir(output,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4507]});
const browser=await chromium.launch({channel:'chrome',headless:true});
const requests=[],errors=[],aborted=[];let limited=true;const delayed=[];
try{
 const page=await browser.newPage({viewport:{width:980,height:650}});
 page.on('pageerror',error=>errors.push(error.message));
 page.on('requestfailed',request=>{if(request.url().includes('/controlled-provider/'))aborted.push(new URL(request.url()).pathname);});
 await page.route('**/controlled-provider/**',async route=>{
  const path=new URL(route.request().url()).pathname;requests.push(path);
  if(path.includes('/delayed-')){delayed.push(route);return;}
  if(path.endsWith('/weather'))return route.fulfill(limited?{status:429,headers:{'retry-after':'120'},body:'<html>Rate limited</html>'}:{contentType:'application/json',body:'{"latitude":1,"longitude":2,"current":{"temperature_2m":18}}'});
  if(path.endsWith('/geology-primary'))return route.fulfill({status:429,headers:{'retry-after':'120'},body:'<html>Paused</html>'});
  if(path.endsWith('/geology-fallback'))return route.fulfill({contentType:'application/json',body:JSON.stringify({success:{data:[{source_id:1,map_id:1,name:'Regional mapped unit',lith:'Sandstone'}]}})});
  if(path.endsWith('/oversized'))return route.fulfill({contentType:'application/json',body:' '.repeat(5000010)});
  return route.fulfill({status:503,body:'<html>Unavailable</html>'});
 });
 await page.goto(`http://127.0.0.1:${server.port}/404.html`);
 const rate=await page.evaluate(async()=>{
  const{createOperationalFeedService}=await import('/app/js/geospatial/operational-feeds.js');
  window.feedClock=100000;window.feeds=createOperationalFeedService({now:()=>window.feedClock,fetchImpl:(_url,options)=>fetch('/controlled-provider/weather',options)});
  let status,cooldowns=0;
  try{await feeds.weather([{lat:1,lon:2}]);}catch(error){status=error.status;}
  for(let lat=2;lat<12;lat++)try{await feeds.weather([{lat,lon:2}],{force:true});}catch(error){if(error.code==='PROVIDER_COOLDOWN')cooldowns++;}
  return {status,cooldowns,health:feeds.diagnostics().providers.find(row=>row.id==='open-meteo-current')};
 });
 assert.equal(rate.status,429);assert.equal(rate.cooldowns,10);assert.equal(requests.filter(p=>p.endsWith('/weather')).length,1);
 limited=false;
 const recovery=await page.evaluate(async()=>{feedClock+=120001;const value=await feeds.weather([{lat:1,lon:2}]);return {items:value.items.length,active:feeds.diagnostics().activeQueries};});
 assert.equal(recovery.items,1);assert.equal(recovery.active,0);
 await page.evaluate(async()=>{
  const{createMarineService}=await import('/app/js/geospatial/marine.js');
  window.marine=createMarineService({fetchImpl:(url,options)=>fetch(`/controlled-provider/delayed-${url.includes('/marine')?'model':'stations'}`,options)});
  window.marineAbort=new AbortController();window.marineDone=marine.selected({lat:1,lon:2},{signal:marineAbort.signal}).then(()=>({ok:false}),error=>({ok:error.name==='AbortError'}));
 });
 await page.waitForFunction(()=>marine.diagnostics().activeQueries===2);
 await page.waitForTimeout(50);
 assert.equal((await page.evaluate(async()=>{marineAbort.abort();return marineDone;})).ok,true);
 for(const route of delayed)await route.fulfill({contentType:'application/json',body:'{"stations":[]}'}).catch(()=>{});
 await page.waitForTimeout(50);
 assert.equal(await page.evaluate(()=>marine.diagnostics().activeQueries),0);
 assert.equal(await page.evaluate(()=>marine.diagnostics().cachedQueries),0);
 assert.equal(aborted.filter(path=>path.includes('/delayed-')).length,2);
 const fallback=await page.evaluate(async()=>{
  const{createGeologyService}=await import('/app/js/geospatial/geology.js');
  const service=createGeologyService({fetchImpl:(url,options)=>fetch(`/controlled-provider/geology-${url.includes('usgs.gov')?'primary':'fallback'}`,options)});
  const first=await service.lookup({lat:1,lon:2}),second=await service.lookup({lat:2,lon:2});
  return {provider:second.items[0].provider,dated:!!first.fetchedAt,warnings:second.warnings.length};
 });
 assert.equal(fallback.provider,'macrostrat');assert.ok(fallback.dated);assert.equal(fallback.warnings,1);assert.equal(requests.filter(p=>p.endsWith('/geology-primary')).length,1);
 const oversized=await page.evaluate(async()=>{
  const{createAircraftService}=await import('/app/js/geospatial/aircraft.js');
  const service=createAircraftService({fetchImpl:(_url,options)=>fetch('/controlled-provider/oversized',options)});
  try{await service.search({lat:1,lon:2});return false;}catch(error){return /size limit/.test(error.message)&&service.inspect().activeQueries===0;}
 });
 assert.ok(oversized);assert.deepEqual(errors,[]);
 const report={ok:true,evidenceScope:'Actual browser fetch, abort and provider modules with controlled HTTP responses; no live-provider availability or entitlement claim.',cases:{rateLimit:rate.status===429,recovery:recovery.items===1,cancellation:aborted.filter(path=>path.includes('/delayed-')).length===2,fallback:fallback.provider==='macrostrat',boundedBody:oversized},counts:{requests:requests.length,aborted:aborted.length},errors};
 await page.setContent('<meta charset="utf-8"><title>Provider boundary verification</title><body style="background:#112532;color:#e8fbf9;font:20px system-ui;padding:48px"><h1>Provider boundary checks</h1>'+Object.entries(report.cases).map(([name,ok])=>`<p>${ok?'✓':'×'} ${name}</p>`).join('')+'<p style="font-size:14px">Controlled HTTP responses · actual browser fetch and cancellation</p></body>');
 await page.screenshot({path:`${output}/results.png`});await fs.writeFile(`${output}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){await fs.writeFile(`${output}/failure.json`,JSON.stringify({ok:false,error:error.message,requestCount:requests.length,aborted,errors},null,2));throw error;}
finally{for(const route of delayed)await route.abort().catch(()=>{});await browser.close();await server.close();}
