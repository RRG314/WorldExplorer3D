import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
assert.equal(process.env.WE3D_VERIFY_HOSTED_PLACE_LOOKUP,'1');
assert.ok(process.env.WE3D_STAGING_APP_CHECK_FILE,'Registered staging attestation required');
const out='output/verification/product-plan/place-lookup-staging';await mkdir(out,{recursive:true});
const report={scope:'Packaged browser search through real staged getPlaceLookup and registered staging App Check; no production or physical-device claim',cases:[],errors:[]};
const server=await startStaticServer({rootDir:process.env.WE3D_VERIFY_ROOT||'dist',ports:[4398]});const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const unauthenticated=await fetch('https://us-central1-we3d-staging-20260712.cloudfunctions.net/getPlaceLookup?q=Baltimore',{signal:AbortSignal.timeout(15000)});assert.ok([401,403].includes(unauthenticated.status));report.cases.push('hosted lookup rejects absent App Check');
 const page=await browser.newPage({viewport:{width:1280,height:850}});await configureStagingAppCheck(page,`http://127.0.0.1:${server.port}`);page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.port}/app/`,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#startBtn')?.disabled===false,null,{timeout:90000});
 const input=page.locator('#globeLocationSearch');await input.fill('Baltimore');await input.press('Enter');await page.waitForFunction(()=>document.querySelector('#globeLocationSearchStatus')?.textContent.includes('found'),null,{timeout:30000});assert.ok(await page.locator('#globeLocationSearchResults [role="option"]').count()>0);report.cases.push('real App Check accepts anonymous packaged search with public provider results');
 await page.screenshot({path:`${out}/hosted-search.png`});await input.fill('39.2904, -76.6122');await input.press('Enter');await page.waitForFunction(()=>Math.abs(Number(document.querySelector('#globeCustomLat').value)-39.2904)<.00001&&Math.abs(Number(document.querySelector('#globeCustomLon').value)+76.6122)<.00001,null,{timeout:20000});report.cases.push('coordinate search remains independent of the hosted service');assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.failure=String(error);throw error;}finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();await server.close();}
console.log(JSON.stringify(report));
