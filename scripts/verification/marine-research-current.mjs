import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';
import { configureStagingAppCheck } from './staging-app-check.mjs';
const server = await startStaticServer({ rootDir: process.env.WE3D_VERIFY_ROOT || process.cwd(), ports: [4396] });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const dir = 'output/verification/product-plan/research-outing';
await fs.mkdir(dir, { recursive: true });
const report = { scope: 'Actual app research outing, real Journal IndexedDB, actual traversal controls, controlled entry-depth provider', cases: [], errors: [] };
let page;
try {
 const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
 let elevation = -30, delay = 0;
 await context.route('**/reverse?**', route => route.fulfill({ json: { display_name: 'Entry check fixture', lat: '39.2898', lon: '-76.6122', address: { city: 'Entry check fixture' } } }));
 await context.route('https://api-bdc.io/**', route => route.fulfill({ json: { locality: 'Entry check fixture' } }));
 await context.route('https://wms.gebco.net/**', async route => {
   const captured = elevation, wait = delay;
   if (wait) await new Promise(r => setTimeout(r, wait));
   await route.fulfill({ status: captured === null ? 503 : 200, contentType: 'text/plain', body: captured === null ? 'unavailable' : `value_list = '${captured}'` }).catch(() => {});
 });
 page = await context.newPage();
 const base = `http://127.0.0.1:${server.port}`;
 report.attestation = await configureStagingAppCheck(page, base);
 // Preserve the declared controlled place fixture after the gateway migration.
 await page.route(`${base}/api/geospatial/reverse?**`, route => route.fulfill({json: {display_name: 'Entry check fixture', lat: '39.2898', lon: '-76.6122', address: {city: 'Entry check fixture'}}}));
 report.localFailures = [];
 page.on('response', response => { if (response.url().startsWith(base + '/') && response.status() >= 400) report.localFailures.push({url: response.url(), status: response.status()}); });
 page.on('pageerror', error => report.errors.push(error.message));
 page.on('console', message => {if(['warning','error'].includes(message.type())) (report.consoleWarnings ||= []).push(message.text());});
 await page.goto(`http://127.0.0.1:${server.port}/`, { waitUntil: 'load' });
 await page.locator('#landingPrimaryCta').click();
 await page.waitForFunction(() => window.__WE3D_RUNTIME_READY__ === true, null, { timeout: 90000 });
 await page.waitForSelector('#globeSelectorScreen.show');
 if (await page.locator('#analyticsConsentDenyBtn').isVisible()) await page.locator('#analyticsConsentDenyBtn').click();
 await page.evaluate(async()=>{window.marineCtx=(await import('/app/js/shared-context.js?v=55')).ctx;});
 await page.locator('#coralResearchStart').click();
 await page.waitForFunction(()=>marineCtx.boatDeck?.active,null,{timeout:90000});
 report.cases.push({id:'new-player-research-shortcut-arrives-on-deck',passed:true});
 const goDeck=async(x,z)=>{const ok=await page.evaluate(({x,z})=>{const ctx=marineCtx,original=ctx.readControlActions;try{for(const target of [{x:0,z:ctx.boatDeck.snapshot().pose.z},{x:0,z},{x,z}]){let reached=false;for(let i=0;i<1200;i++){const p=ctx.boatDeck.snapshot().pose,dx=target.x-p.x,dz=target.z-p.z;if(Math.hypot(dx,dz)<.28){reached=true;break;}ctx.readControlActions=()=>Math.abs(dx)>.17?{strafe:-Math.sign(dx)}:{move:Math.sign(dz)};ctx.boatDeck.update(.05);}if(!reached)return false;}return true;}finally{ctx.readControlActions=original;}},{x,z});assert.equal(ok,true);await page.waitForTimeout(100);};
 const labPhoto=async name=>{await page.evaluate(()=>{const ctx=marineCtx,read=ctx.readControlActions;try{ctx.readControlActions=()=>({turn:1});for(let i=0;i<40;i++)ctx.boatDeck.update(Math.PI/80);}finally{ctx.readControlActions=read;}});await page.waitForTimeout(200);await page.screenshot({path:`${dir}/${name}.png`});await page.evaluate(()=>{const ctx=marineCtx,read=ctx.readControlActions;try{ctx.readControlActions=()=>({turn:-1});for(let i=0;i<40;i++)ctx.boatDeck.update(Math.PI/80);}finally{ctx.readControlActions=read;}});};
 const lab=async()=>{await goDeck(-3.5,-10);await page.getByLabel('Deck destination').selectOption('lab');await page.locator('#marineResearchLab').click();};
 assert.equal(await page.locator('#marineResearchLab').isEnabled(),false);
 await lab();await page.waitForFunction(()=>marineCtx.marineResearch.snapshot().started);
 await labPhoto('briefing');report.cases.push({id:'walk-to-wet-lab-and-take-briefing',passed:true});
 const deploy=async()=>{await goDeck(0,-26);await page.getByLabel('Deck destination').selectOption('sub');await page.locator('#researchDeckAction').click();await page.waitForFunction(()=>marineCtx.oceanMode.active,null,{timeout:30000});await page.waitForFunction(()=>marineCtx.oceanMode.habitat?.group.userData.habitat.assetState==='ready');};
 await deploy();
 const approach=async(extraHeight=8)=>{const result=await page.evaluate(async extraHeight=>{
  const ctx=marineCtx,original=ctx.readControlActions,t=ctx.marineResearch.snapshot().target;let controls={};ctx.readControlActions=()=>controls;
  const target={x:t.x,y:t.y+extraHeight,z:t.z-7};let cleared=false;
  try{for(let i=0;i<2400;i++){
   const sub=ctx.oceanMode.submarine,dx=target.x-sub.position.x,dz=target.z-sub.position.z,distance=Math.hypot(dx,dz);if(sub.position.y>=-12.5)cleared=true;const transit=!cleared||distance>25;const dy=(transit?-12:target.y)-sub.position.y;
   const yaw=Math.atan2(dx,dz),error=Math.atan2(Math.sin(yaw-sub.yaw),Math.cos(yaw-sub.yaw));
   if(!transit&&distance<1.3&&Math.abs(dy)<.7&&Math.abs(sub.speed)<.45&&Math.abs(sub.verticalSpeed)<.45)return {reached:true,position:{...sub.position},survey:ctx.marineResearch.snapshot()};
   controls={turn:distance>1?Math.max(-1,Math.min(1,error*2)):0,move:cleared&&distance>1&&Math.abs(error)<.22?Math.min(1,distance/28):0,vertical:Math.abs(dy)>.25?Math.max(-1,Math.min(1,dy*.5)):0};
   await new Promise(requestAnimationFrame);
  }return {reached:false,position:{...ctx.oceanMode.submarine.position},target,survey:ctx.marineResearch.snapshot()};
  }finally{controls={};ctx.readControlActions=original;}
 },extraHeight);assert.equal(result.reached,true,JSON.stringify(result));assert.equal(result.survey.canScan,true,JSON.stringify(result));return result;};
 const scan=async()=>{await page.locator('#marineResearchScan').click();await page.waitForFunction(()=>!marineCtx.marineResearch.snapshot().busy);};
 await approach();await scan();assert.equal(await page.evaluate(()=>marineCtx.marineResearch.snapshot().scans.length),1);await page.screenshot({path:`${dir}/first-scan.png`});
 await page.evaluate(()=>marineCtx.oceanVoyage.checkpoint());await page.reload();if(await page.locator('#landingPrimaryCta').isVisible())await page.locator('#landingPrimaryCta').click();await page.waitForFunction(()=>window.__WE3D_RUNTIME_READY__===true,null,{timeout:90000});
 await page.evaluate(async()=>{window.marineCtx=(await import('/app/js/shared-context.js?v=55')).ctx;});await page.locator('#oceanVoyageResume').click();await page.waitForFunction(()=>marineCtx.oceanMode.active&&marineCtx.marineResearch?.snapshot().ready,null,{timeout:90000});
 assert.equal(await page.evaluate(()=>marineCtx.marineResearch.snapshot().scans.length),1);report.cases.push({id:'first-scan-survives-real-reload-and-voyage-resume',passed:true});
 await page.locator('#oceanVoyageRecover').click();await page.waitForFunction(()=>marineCtx.boatMode.active&&!marineCtx.oceanMode.active&&marineCtx.boatDeck.active,null,{timeout:30000});await lab();assert.equal(await page.evaluate(()=>marineCtx.marineResearch.snapshot().stage),'survey');
 await deploy();report.cases.push({id:'partial-outing-recovery-review-and-redeployment-retain-findings',passed:true});
 await approach();await scan();assert.equal(await page.evaluate(()=>marineCtx.marineResearch.snapshot().scans.length),2);
 await approach();await scan();assert.equal(await page.evaluate(()=>marineCtx.marineResearch.snapshot().stage),'report');await page.screenshot({path:`${dir}/survey-ready.png`});
 await page.locator('#oceanVoyageRecover').click();await page.waitForFunction(()=>marineCtx.boatMode.active&&!marineCtx.oceanMode.active&&marineCtx.boatDeck.active,null,{timeout:30000});await lab();await page.waitForFunction(()=>marineCtx.marineResearch.snapshot().completed);
 await page.getByText('Vessel options',{exact:true}).click();
 await page.locator('#marineResearchReport summary').click();await page.waitForFunction(()=>document.getElementById('marineResearchReport').textContent.includes('Survey: Seagrass Edge'));assert.match(await page.locator('#marineResearchReport').textContent(),/35 m/);await labPhoto('scanner-upgrade');await page.locator('#marineResearchReport summary').click();await page.getByText('Vessel options',{exact:true}).click();report.cases.push({id:'saved-report-can-be-reviewed-on-the-research-vessel',passed:true});assert.equal(await page.evaluate(()=>marineCtx.marineResearch.snapshot().rangeMeters),35);report.cases.push({id:'all-three-scans-submit-in-lab-and-install-scanner-ii',passed:true});
 await deploy();const upgraded=await approach(25);assert.ok(upgraded.survey.target);assert.ok(Math.hypot(upgraded.position.x-upgraded.survey.target.x,upgraded.position.y-upgraded.survey.target.y,upgraded.position.z-upgraded.survey.target.z)*(await page.evaluate(()=>marineCtx.METERS_PER_WORLD_UNIT))>18);
 await scan();report.events=await page.evaluate(async()=>{const events=await marineCtx.discoveryProfileStore.listEvents(100);return events.filter(e=>e.sourceSystem==='marine-research')});assert.equal(report.events.length,6);assert.ok(report.events.every(e=>Number.isFinite(e.localPosition?.x)&&Number.isFinite(e.localPosition?.z)));assert.equal(report.events.filter(e=>e.metadata?.upgradeId==='marine-scanner-ii').length,1);assert.ok(report.events.some(e=>e.metadata.distanceMeters>18&&e.metadata.scannerRangeMeters===35));
 report.cases.push({id:'next-dive-uses-earned-range-for-a-saved-follow-up',passed:true});await page.screenshot({path:`${dir}/follow-up.png`});
 for(const viewport of [{width:1440,height:900},{width:390,height:844}]){await page.setViewportSize(viewport);await page.waitForTimeout(200);const boxes=await page.evaluate(()=>{const a=document.getElementById('oceanVoyageControls').getBoundingClientRect(),b=document.getElementById('oceanDiverControls').getBoundingClientRect();return {inside:a.left>=0&&a.right<=innerWidth&&a.bottom<=innerHeight,overlap:a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top}});assert.equal(boxes.inside,true);assert.equal(boxes.overlap,false);const recover=await page.locator('#oceanVoyageRecover').boundingBox(),panel=await page.locator('#oceanVoyageControls').boundingBox();assert.ok(recover.y+recover.height<=panel.y+panel.height+1,'recovery button remains visible without scrolling');await page.screenshot({path:`${dir}/controls-${viewport.width}.png`});}
 report.cases.push({id:'desktop-and-phone-outing-controls-do-not-overlap',passed:true});
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.localFailures,[]);report.passed=true;
}catch(error){report.failure=error.message;report.ui=await page?.locator('body').innerText();report.snapshot=await page?.evaluate(()=>window.marineCtx?.marineResearch?.snapshot());await page?.screenshot({path:`${dir}/failure.png`});throw error;}finally{await fs.writeFile(`${dir}/browser.json`,JSON.stringify(report,null,2));await browser.close();await server.close();}
console.log(JSON.stringify(report));
