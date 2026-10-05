import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
assert.equal(process.env.WE3D_VERIFY_HOSTED_PLACE_LOOKUP,'1');
assert.ok(process.env.WE3D_STAGING_APP_CHECK_FILE);
const out='output/verification/environment-data-staging';await mkdir(out,{recursive:true});
const report={scope:'Actual source or packaged browser UI with live public models through deployed staging gateway; disposable registered debug attestation, not ordinary production attestation.',cases:[],errors:[]};
const server=await startStaticServer({rootDir:process.env.WE3D_VERIFY_ROOT||process.cwd(),ports:[4398]});const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const denied=await fetch('https://us-central1-we3d-staging-20260712.cloudfunctions.net/getEnvironmentalData?kind=weather&latitude=39.29&longitude=-76.61',{signal:AbortSignal.timeout(15000)});assert.ok([401,403].includes(denied.status));report.cases.push('hosted gateway rejects requests without App Check');
 const page=await browser.newPage({viewport:{width:1280,height:850}});await configureStagingAppCheck(page,`http://127.0.0.1:${server.port}`);page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.port}/app/?loc=custom&lat=-18.5&lon=147.5&lname=Coral%20Sea`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#startBtn')?.disabled===false,null,{timeout:90000});
 await page.locator('#globeSelectorLiveEarthModeBtn').click();
 await page.locator('[data-live-earth-action="layer"][data-id="weather"]').first().click();
 const details=page.locator('#globeLiveEarthDetails');await details.getByText(/MET Norway hourly forecast/).waitFor({timeout:90000});
 const weatherText=await details.innerText();assert.doesNotMatch(weatherText,/Feels like 0°F|Open-Meteo/);await page.screenshot({path:`${out}/weather.png`});report.weatherText=weatherText;report.cases.push('visible selected weather is a real MET Norway forecast; absent apparent temperature is not shown as zero');
 // The Marine category exposes the ocean conditions layer through normal controls.
 const categories=await page.locator('[data-live-earth-action="category"]').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.id,text:n.textContent})));
 report.categories=categories;const marine=categories.find(v=>/marine|ocean/i.test(v.text));assert.ok(marine,'Marine category exists');
 await page.locator(`[data-live-earth-action="category"][data-id="${marine.id}"]`).click();
 await page.locator('[data-live-earth-action="layer"][data-id="ocean-state"]').click();
 await details.getByText(/surface [\d.]+°C/).waitFor({timeout:90000});await details.getByText(/Wave [\d.]+ m/).waitFor({timeout:90000});
 const marineText=await details.innerText();assert.match(marineText,/HYCOM \/ FNMOC ESPC/);assert.match(marineText,/PacIOOS|NOAA WAVEWATCH III/);report.marineText=marineText;await page.screenshot({path:`${out}/ocean.png`});report.cases.push('visible ocean panel has live wave/current/SST guidance with independent model sources and valid times');
 await page.setViewportSize({width:390,height:844});await details.scrollIntoViewIfNeeded();assert.ok(await details.isVisible());await page.screenshot({path:`${out}/ocean-phone-viewport.png`});
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.failure=String(error);const page=browser.contexts()[0]?.pages()[0];if(page){report.visibleText=await page.locator('body').innerText().catch(()=>'');await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});}throw error;}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();await server.close();}
console.log(JSON.stringify({passed:report.passed,cases:report.cases}));
