import {walkResearchStation} from './research-station-walk.mjs';
import {installControlledMarineWeather} from './controlled-marine-weather.mjs';
import {verifyCoastalInvestigation} from './coastal-investigation-journey.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';
import { configureStagingAppCheck } from './staging-app-check.mjs';
const server = await startStaticServer({ rootDir: process.env.WE3D_VERIFY_ROOT || process.cwd(), ports: [4396] });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const dir = process.env.WE3D_RESEARCH_OUTPUT || 'output/verification/product-plan/research-outing';
await fs.mkdir(dir, { recursive: true });
const report = { scope: 'Actual app research outing, real Journal IndexedDB, actual traversal controls, controlled entry depth, weather and marine model providers', cases: [], errors: [] };
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
 report.environmentalFixture=await installControlledMarineWeather(page);
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
 const goDeck=id=>walkResearchStation(page,id);
 const labPhoto=async name=>{await page.waitForTimeout(200);await page.screenshot({path:`${dir}/${name}.png`});};
 const coastal=process.env.WE3D_COASTAL_DEPARTURE==='1';
 const chapterClick=async(phase,prefix='coastalDeck')=>{await page.waitForFunction(()=>marineCtx.marineResearch.coastal.snapshot().ready);await page.locator(`#${prefix}Chapter`).evaluate(n=>n.open=true);await page.locator(`#${prefix}Action`).click();await page.waitForFunction(phase=>marineCtx.marineResearch.coastal.snapshot().phase===phase,phase);};
 if(coastal){
  await goDeck('chart');await page.getByLabel('Deck destination').selectOption('chart');await page.locator('#coastalDeckChapter').evaluate(n=>n.open=true);
  await page.route('**/data/ocean-bathymetry-great-barrier-reef.json',route=>route.fulfill({json:{}}));elevation=null;await page.locator('#coastalDeckAction').click();await page.waitForFunction(()=>marineCtx.marineResearch.coastal.snapshot().choices?.length===2&&!marineCtx.marineResearch.coastal.snapshot().busy);assert.equal(await page.evaluate(()=>marineCtx.marineResearch.coastal.snapshot().choices.some(c=>c.allowed)),false);
  await page.unroute('**/data/ocean-bathymetry-great-barrier-reef.json');await page.locator('#coastalDeckAction').click();await page.waitForFunction(()=>marineCtx.marineResearch.coastal.snapshot().choices?.some(c=>c.allowed)&&!marineCtx.marineResearch.coastal.snapshot().busy);assert.equal(await page.evaluate(()=>marineCtx.marineResearch.coastal.snapshot().choices.every(c=>c.depth.bundled)),true);elevation=-30;await page.locator('#coastalDeckSite').selectOption(process.env.WE3D_COASTAL_SITE||'shelf');await chapterClick('station');await page.screenshot({path:`${dir}/coastal-plan.png`});
  report.cases.push({id:'coastal-chart-failed-provider-and-chart-retry-bundled-fallback-alternate-and-plan',passed:true});
 }
 const lab=async()=>{await goDeck('lab');await page.getByLabel('Deck destination').selectOption('lab');await page.locator('#marineResearchLab').click();};
 assert.equal(await page.locator('#marineResearchLab').isEnabled(),false);
 await lab();await page.waitForFunction(()=>marineCtx.marineResearch.snapshot().started);
 await labPhoto('briefing');report.cases.push({id:'walk-to-wet-lab-and-take-briefing',passed:true});
 if(coastal){
  if(process.env.WE3D_COASTAL_SITE==='north'){
   await goDeck('helm');await page.getByLabel('Deck destination').selectOption('helm');await page.locator('#researchDeckAction').click();await page.locator('#researchDeckMoor').click();
   const sailing=await page.evaluate(async()=>{
    const ctx=marineCtx,original=ctx.readControlActions,site=ctx.marineResearch.coastal.snapshot().site;
    const x=(site.lon-ctx.LOC.lon)*ctx.SCALE*Math.cos(ctx.LOC.lat*Math.PI/180),z=(ctx.LOC.lat-site.lat)*ctx.SCALE;let actions={};ctx.readControlActions=()=>actions;let traveled=0,previous={x:ctx.boat.x,z:ctx.boat.z};
    try{for(let i=0;i<7000;i++){
     const dx=x-ctx.boat.x,dz=z-ctx.boat.z,d=Math.hypot(dx,dz),yaw=Math.atan2(dx,dz),error=Math.atan2(Math.sin(yaw-ctx.boat.angle),Math.cos(yaw-ctx.boat.angle));
     if(d<45&&Math.hypot(ctx.boat.vx,ctx.boat.vz,ctx.boat.speed)<.3)return {reached:true,traveled,iterations:i,boat:{x:ctx.boat.x,z:ctx.boat.z},distance:ctx.marineResearch.coastal.snapshot().distance};
     actions=d<45?{brake:1}:{steer:Math.max(-1,Math.min(1,error*2)),throttle:Math.abs(error)>.4?.45:1};ctx.updateBoatMode(.05);traveled+=Math.hypot(ctx.boat.x-previous.x,ctx.boat.z-previous.z);previous={x:ctx.boat.x,z:ctx.boat.z};if(i%40===0)await new Promise(requestAnimationFrame);
    }return {reached:false,traveled,boat:{...ctx.boat},distance:ctx.marineResearch.coastal.snapshot().distance};}finally{ctx.readControlActions=original;}
   });report.alternateSailing=sailing;assert.equal(sailing.reached,true,JSON.stringify(sailing));assert.ok(sailing.traveled>80);await page.locator('#researchDeckMoor').click();await page.locator('#researchDeckEnter').click();await page.screenshot({path:`${dir}/northern-mooring.png`});report.cases.push({id:'alternate-station-actual-controller-stepped-sailing-braking-and-mooring',passed:true});
  }
  await goDeck('chart');await page.getByLabel('Deck destination').selectOption('chart');await chapterClick('ladder');
  await goDeck('dive');await page.getByLabel('Deck destination').selectOption('dive');await chapterClick('cradle');
  await goDeck('sub');await page.getByLabel('Deck destination').selectOption('sub');await chapterClick('launch');await page.screenshot({path:`${dir}/coastal-prepared.png`});
  for(const viewport of [{width:390,height:844},{width:1440,height:900}]){await page.setViewportSize(viewport);await page.waitForTimeout(150);const panel=await page.locator('#researchDeckControls').boundingBox();assert.ok(panel.y+panel.height<viewport.height-100);if(viewport.width===390)assert.ok(panel.height<330,'Active deployment guidance should leave most of the scene visible');await page.screenshot({path:`${dir}/coastal-deck-${viewport.width}.png`});}
  report.cases.push({id:'coastal-briefing-moored-chart-ladder-and-actual-cradle',passed:true});
 }
 const deploy=async()=>{await goDeck('sub');await page.getByLabel('Deck destination').selectOption('sub');await page.locator('#researchDeckAction').click();await page.waitForFunction(()=>marineCtx.oceanMode.active,null,{timeout:30000});await page.waitForFunction(()=>marineCtx.oceanMode.habitat?.group.userData.habitat.assetState==='ready');};
 await deploy();
 if(coastal){await chapterClick('complete','coastalOcean');const saved=await page.evaluate(async()=>marineCtx.discoveryProfileStore.exportData());const events=saved.events.filter(e=>e.sourceSystem==='coastal-departure');assert.equal(events.length,5);assert.equal(events.filter(e=>e.eventType==='campaign-completed').length,1);await page.evaluate(async data=>marineCtx.discoveryProfileStore.importData(data),saved);await page.evaluate(()=>marineCtx.marineResearch.coastal.refresh());assert.equal(await page.evaluate(()=>marineCtx.marineResearch.coastal.snapshot().completed),true);report.cases.push({id:'coastal-deployed-same-sub-completion-and-backup-roundtrip',passed:true});}
 if(process.env.WE3D_COASTAL_INVESTIGATION==='1'){await verifyCoastalInvestigation({page,dir,report,goDeck,deploy});}
 else if(process.env.WE3D_COASTAL_ONLY==='1'){await page.locator('#oceanVoyageRecover').click();await page.waitForFunction(()=>marineCtx.boatDeck.active&&!marineCtx.oceanMode.active);const same=await page.evaluate(()=>{const s=marineCtx.marineResearch.coastal.snapshot(),v=marineCtx.oceanVoyage.current;return s.completed&&s.plan.metadata.shipId===v.ship.transportEntityId&&s.plan.metadata.subId===v.subId;});assert.equal(same,true);report.cases.push({id:'alternate-completed-voyage-recovers-same-vessel-and-sub',passed:true});}
 else {
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
 assert.equal(await page.evaluate(()=>marineCtx.marineResearch.snapshot().scans.length),1);if(coastal){await page.waitForFunction(()=>marineCtx.marineResearch.coastal.snapshot().ready);assert.equal(await page.evaluate(()=>marineCtx.marineResearch.coastal.snapshot().completed),true);report.cases.push({id:'coastal-journal-completion-survives-real-reload',passed:true});}report.cases.push({id:'first-scan-survives-real-reload-and-voyage-resume',passed:true});
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
 }
 // Exercise room actions in the complete app, not only the vessel fixture.
 if(await page.evaluate(()=>marineCtx.oceanMode?.active)){
  await page.locator('#oceanVoyageRecover').click();
  await page.waitForFunction(()=>marineCtx.boatDeck.active&&!marineCtx.oceanMode.active);
 }
 await page.setViewportSize({width:1440,height:900});
 for(const [station,title] of [['mess','Journal'],['drylab','Journal'],['briefing','Field Guide']]){
  await goDeck(station);await page.locator('#researchDeckAction').click();
  await page.waitForSelector('#discoveryPanel.show');
  assert.equal(await page.locator('#discoveryPanelTitle').textContent(),title);
  const locked=await page.evaluate(()=>{
   const ctx=marineCtx,before=ctx.boatDeck.snapshot().pose,original=ctx.readControlActions;
   try{ctx.readControlActions=()=>({move:1});ctx.boatDeck.update(.05);return {paused:ctx.paused,before,after:ctx.boatDeck.snapshot().pose};}
   finally{ctx.readControlActions=original;}
  });assert.equal(locked.paused,true);assert.deepEqual(locked.after,locked.before);
  await page.locator('#discoveryCloseBtn').click();await page.waitForFunction(()=>!marineCtx.paused);
  report.cases.push({id:`interior-${station}-opens-existing-${title.toLowerCase().replace(' ','-')}-and-pauses-walking`,passed:true});
 }
 await goDeck('quarters');const voyage=await page.evaluate(()=>({id:marineCtx.oceanVoyage.current.id,shipId:marineCtx.oceanVoyage.current.ship.transportEntityId,revision:marineCtx.oceanVoyage.saved.revision}));
 await page.locator('#researchDeckAction').click();
 await page.waitForFunction(()=>document.getElementById('researchDeckControls').textContent.includes('Voyage checkpoint saved'));
 const saved=await page.evaluate(()=>marineCtx.oceanVoyage.saved);assert.equal(saved.id,voyage.id);assert.equal(saved.stage,'aboard');assert.equal(saved.ship.transportEntityId,voyage.shipId);assert.ok(saved.revision>voyage.revision);
 report.cases.push({id:'quarters-saves-existing-surface-voyage-with-same-vessel',passed:true});
 await goDeck('chart');await page.locator('#researchDeckAction').click();await page.waitForFunction(()=>marineCtx.showLargeMap);
 await page.locator('#mapClose').click();await page.waitForFunction(()=>!marineCtx.showLargeMap);
 report.cases.push({id:'interior-bridge-chart-opens-and-closes-real-world-map',passed:true});
 for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
  await page.setViewportSize(viewport);await page.locator('#researchShipMapButton').click();await page.waitForSelector('#researchShipMap[open]');
  for(const tab of await page.locator('#researchShipMap nav button').all()){await tab.click();assert.equal(await tab.getAttribute('aria-pressed'),'true');}
  const bounds=await page.locator('#researchShipMap').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=viewport.width&&bounds.y>=0&&bounds.y+bounds.height<=viewport.height);
  await page.getByRole('button',{name:'Main deck',exact:true}).click();await page.screenshot({path:`${dir}/ship-map-${viewport.width}.png`});
  await page.locator('#researchShipMap [data-station="galley"]').click();await page.waitForFunction(()=>!marineCtx.boatDeck.snapshot().mapOpen);assert.equal(await page.evaluate(()=>marineCtx.boatDeck.snapshot().targetId),'galley');
 }
 report.cases.push({id:'actual-app-ship-map-desktop-phone-decks-and-destination',passed:true});
 await page.setViewportSize({width:1440,height:900});await goDeck('galley');await page.locator('#researchDeckAction').click();await page.getByLabel('Carried galley provisions').waitFor();await labPhoto('galley-room');
 report.cases.push({id:'actual-galley-opens-carried-provisions',passed:true});
 await page.reload();if(await page.locator('#landingPrimaryCta').isVisible())await page.locator('#landingPrimaryCta').click();await page.waitForFunction(()=>window.__WE3D_RUNTIME_READY__===true,null,{timeout:90000});
 await page.evaluate(async()=>{window.marineCtx=(await import('/app/js/shared-context.js?v=55')).ctx;});await page.locator('#oceanVoyageResume').click();await page.waitForFunction(()=>marineCtx.boatDeck?.active,null,{timeout:90000});
 assert.equal(await page.evaluate(()=>marineCtx.oceanVoyage.current.ship.transportEntityId),voyage.shipId);
 await goDeck('helm');await page.locator('#researchDeckAction').click();await page.waitForFunction(()=>!marineCtx.boatDeck.active&&marineCtx.boatMode.active);
 report.cases.push({id:'surface-checkpoint-reload-restores-vessel-and-walked-bridge-releases-to-helm',passed:true});
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.localFailures,[]);report.passed=true;
}catch(error){report.failure=error.message;report.ui=await page?.locator('body').innerText();report.snapshot=await page?.evaluate(()=>window.marineCtx?.marineResearch?.snapshot());await page?.screenshot({path:`${dir}/failure.png`});throw error;}finally{await fs.writeFile(`${dir}/browser.json`,JSON.stringify(report,null,2));await browser.close();await server.close();}
console.log(JSON.stringify(report));
