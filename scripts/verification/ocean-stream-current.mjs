import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
import {deployResearchSubmarineFromDeck} from './marine-entry-ui.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';
import {artifactIdentity,sameArtifactIdentity} from './artifact-identity.mjs';
const root=process.env.WE3D_VERIFY_ROOT||process.cwd();
const fallback=process.argv.find(arg=>arg.startsWith('--fallback='))?.slice(11);
const identityBefore=artifactIdentity(process.cwd(),root);
let fallbackIdentity=null;
if(fallback){
 assert.ok(identityBefore,'Rollback check requires a packaged candidate');fallbackIdentity=artifactIdentity(process.cwd(),fallback);assert.ok(fallbackIdentity);
 for(const directory of [root,fallback])assert.equal(JSON.parse(await fs.readFile(`${directory}/build-manifest.json`,'utf8')).firebaseProjectId,'we3d-staging-20260712');
}
const dir=process.env.WE3D_OCEAN_STREAM_OUTPUT||'output/ocean-stream-20261011/browser';await fs.mkdir(dir,{recursive:true});
const report={artifactIdentity:identityBefore,fallbackArtifactIdentity:fallbackIdentity,scope:'Current app, real deck/sub/diver and controls; controlled GEBCO responses. Long-distance setups exercise repeated rebases, not elapsed-time world circumnavigation.',cases:[],errors:[]};
let server=await startStaticServer({rootDir:root,ports:[4396]});
const owned=await chromium.launchServer({channel:'chrome',headless:false});const browser=await chromium.connect(owned.wsEndpoint());let page;
try{
 const context=await browser.newContext({viewport:{width:1440,height:900}});let unavailable=false,requests=0;
 await context.route('https://wms.gebco.net/**',route=>{
  requests++;const bbox=new URL(route.request().url()).searchParams.get('BBOX').split(',').map(Number);
  const lat=(bbox[1]+bbox[3])/2,lon=(bbox[0]+bbox[2])/2,elevation=-180+(lat-36)*40+(lon+70)*80;
  return route.fulfill({status:unavailable?503:200,contentType:'text/plain',body:unavailable?'offline':`value_list = '${elevation}'`});
 });
 await context.route('**/reverse?**',route=>route.fulfill({json:{display_name:'Atlantic test voyage',lat:'36',lon:'-70',address:{ocean:'Atlantic Ocean'}}}));
 await context.route('https://api-bdc.io/**',route=>route.fulfill({json:{locality:'Atlantic test voyage'}}));
 page=await context.newPage();await configureStagingAppCheck(page,`http://127.0.0.1:${server.port}`);page.on('pageerror',e=>report.errors.push(e.message));page.on('console',message=>{if(message.type()==='error'&&/WebGLProgram|shader error/i.test(message.text()))report.errors.push(message.text());});
 await page.goto(`http://127.0.0.1:${server.port}/`,{waitUntil:'load'});
 const legacyRaw=JSON.stringify({version:1,id:'retained-ocean',subId:'retained-sub',stage:'underwater',revision:1,savedAt:1,site:{lat:-18.2861,lon:147.7,name:'Retained Coral Shelf',region:'Great Barrier Reef'},ship:{transportEntityId:'retained-vessel',transportCatalogId:'ocean-research-vessel',condition:1,yaw:0,anchor:{lat:-18.2861,lon:147.7}},sub:{x:0,y:-8.5,z:62,yaw:0,condition:1},waveOffset:{x:0,z:0}});
 await page.evaluate(raw=>localStorage.setItem('we3d.ocean.voyage.v1',raw),legacyRaw);
 await page.locator('#landingPrimaryCta').click();
 await page.waitForFunction(()=>window.__WE3D_RUNTIME_READY__,null,{timeout:90000});await page.waitForSelector('#globeSelectorScreen.show');
 if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
 await page.locator('#globeCustomLat').fill('36');await page.locator('#globeCustomLon').fill('-70');await page.locator('#globeCustomLon').press('Tab');
 assert.equal(await page.locator('#oceanContinuousToggle').isChecked(),true);await page.locator('#globeSelectorOceanBtn').click();await deployResearchSubmarineFromDeck(page);
 await page.evaluate(()=>__marineEntryContext.setTimeOfDay('day'));
 await page.waitForFunction(()=>getOceanModeDebugState().streaming?.ready===9,null,{timeout:30000});
 await page.waitForFunction(()=>{const m=__marineEntryContext.oceanMode;return m.habitatStreamRevision===m.stream.depth.revision&&m.habitat.plan.rocks.length>0;});
 const anchored=await page.evaluate(()=>{const m=__marineEntryContext.oceanMode;return m.habitat.plan.rocks.every(r=>Math.abs(r.y-(m.stream.sample(r.x,r.z).elevationMeters/__marineEntryContext.METERS_PER_WORLD_UNIT-.3))<.001);});assert.equal(anchored,true);
 await page.waitForFunction(()=>__marineEntryContext.oceanMode.cetaceans?.length===3&&__marineEntryContext.oceanMode.cetaceans.every(a=>a.visualState==='licensed'),null,{timeout:30000});
 report.cases.push('Licensed regional wildlife starts only after streamed water volume is ready');
 report.cases.push('Late varying depth places every outcrop on the streamed seabed, never the entry fallback');
 const first=await page.evaluate(()=>getOceanModeDebugState());assert.equal(first.depthProfile.model,'geographic-metres-v1');assert.ok(first.streaming.vertices<=5625);
 await runPrescribedGameActions(page,dir,[{buttons:['up'],frames:90},{buttons:[],frames:45}]);
 assert.ok(Math.hypot((await page.evaluate(()=>getOceanModeDebugState())).position.z-first.position.z)>1);report.cases.push('Geographic entry starts aboard, deploys same licensed sub, streams nine tiles and accepts keyboard movement');
 await page.screenshot({path:`${dir}/geographic-dive.png`});
 const identity=await page.evaluate(()=>({ship:__marineEntryContext.oceanVoyage.current.ship.transportEntityId,sub:__marineEntryContext.oceanVoyage.current.subId}));
 // Set up just before the origin threshold, then cross it using real controls.
 await page.evaluate(()=>{const m=__marineEntryContext.oceanMode;const dx=-m.submarine.position.x,dz=-985-m.submarine.position.z;m.camera.position.x+=dx;m.camera.position.z+=dz;m.cameraLookTarget.x+=dx;m.cameraLookTarget.z+=dz;m.submarine.position.set(0,-18,-985);m.submarine.yaw=Math.PI;m.stream.update(m.submarine.position);});
 await page.waitForFunction(()=>__marineEntryContext.oceanMode.stream.canNavigate(0,-985),null,{timeout:15000});
 await runPrescribedGameActions(page,dir,[{buttons:['up'],frames:180},{buttons:[],frames:45}]);
 const crossed=await page.evaluate(()=>getOceanModeDebugState());assert.ok(crossed.streaming.frameOrigin.lat>36.009);assert.ok(Math.abs(crossed.position.z)<200);assert.equal(crossed.launchSite.lat,36);
 report.cases.push('Keyboard travel crosses a tile and rebases without moving the parent anchor');
 report.plateau=[];
 for(let i=0;i<8;i++){
  await page.evaluate(()=>{const m=__marineEntryContext.oceanMode;const dz=-1020-m.submarine.position.z;m.camera.position.z+=dz;m.cameraLookTarget.z+=dz;m.submarine.position.z=-1020;m.submarine.speed=0;});
  await page.waitForFunction(()=>Math.abs(__marineEntryContext.oceanMode.submarine.position.z)<100,null,{timeout:15000});
  await page.waitForFunction(()=>getOceanModeDebugState().streaming?.ready===9,null,{timeout:15000});
  report.plateau.push(await page.evaluate(()=>({stream:getOceanModeDebugState().streaming,gpu:{...__marineEntryContext.oceanMode.renderer.info.memory}})));
 }
 assert.ok(report.plateau.every(s=>s.stream.resident<=9&&s.stream.meshes<=9&&s.stream.nodes<=64));
 assert.ok(Math.max(...report.plateau.map(s=>s.gpu.geometries))-Math.min(...report.plateau.map(s=>s.gpu.geometries))<=12);report.cases.push('Repeated 9 km traversal setups retire distant tiles and keep scene resources bounded');
 await page.waitForFunction(()=>__marineEntryContext.oceanMode.camera.position.distanceTo(__marineEntryContext.oceanMode.submarine.position)<20);
 await page.screenshot({path:`${dir}/remote-region.png`});
 // A missing region must hold horizontal movement, without inventing source depth.
 unavailable=true;
 await page.evaluate(()=>{const m=__marineEntryContext.oceanMode;const dz=-4800-m.submarine.position.z;m.camera.position.z+=dz;m.cameraLookTarget.z+=dz;m.submarine.position.z=-4800;m.submarine.yaw=Math.PI;});
 await page.waitForFunction(()=>Math.abs(__marineEntryContext.oceanMode.submarine.position.z)<100,null,{timeout:15000});
 await runPrescribedGameActions(page,dir,[{buttons:['up'],frames:60},{buttons:[],frames:10}]);
 const outage=await page.evaluate(()=>getOceanModeDebugState());assert.ok(Math.abs(outage.position.z)<1);assert.equal(outage.seabed.bathymetry.truthType,'unknown');assert.match(await page.locator('#street').innerText(),/Charting ahead/);
 report.cases.push('Provider outage holds horizontal travel with truthful unknown depth and recovery still available');
 unavailable=false;
 const saved=await page.evaluate(()=>{__marineEntryContext.oceanVoyage.checkpoint();return __marineEntryContext.oceanVoyage.current;});assert.equal(saved.version,3);assert.ok(Math.abs(saved.frameWaveOffset.z)>1000);assert.notDeepEqual(saved.frameWaveOffset,saved.waveOffset);assert.equal(saved.ship.transportEntityId,identity.ship);assert.equal(saved.subId,identity.sub);
 await page.reload({waitUntil:'load'});await page.waitForFunction(()=>window.__WE3D_RUNTIME_READY__,null,{timeout:90000});
 await page.locator('#oceanVoyageResume').waitFor({state:'visible',timeout:30000});await page.locator('#oceanVoyageResume').click();
 await page.waitForFunction(()=>window.getOceanModeDebugState?.()?.active&&window.getOceanModeDebugState?.().streaming?.ready===9,null,{timeout:90000});
 await page.evaluate(async()=>{globalThis.__marineEntryContext=(await import('/app/js/shared-context.js?v=55')).ctx;});
 const resumed=await page.evaluate(()=>({state:getOceanModeDebugState(),voyage:__marineEntryContext.oceanVoyage.current}));assert.equal(resumed.voyage.subId,identity.sub);assert.deepEqual(resumed.state.streaming.frameOrigin,saved.frameOrigin);
 report.cases.push('Reload resumes the remote geographic frame and original vessel/sub identities');
 await page.locator('#oceanDiverToggle').click();await page.waitForFunction(()=>getOceanModeDebugState().diver?.active,null,{timeout:30000});
 await runPrescribedGameActions(page,dir,[{buttons:['up'],frames:45},{buttons:[],frames:15}]);await page.screenshot({path:`${dir}/remote-diver.png`});
 await page.locator('#oceanDiverToggle').click();await page.waitForFunction(()=>!getOceanModeDebugState().diver.active);
 report.cases.push('Diver can leave, swim and reboard the same sub in a streamed remote region');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${dir}/remote-phone.png`});
 const hud=await page.locator('#oceanVoyageControls').boundingBox();assert.ok(hud.x>=0&&hud.x+hud.width<=391);
 assert.equal(await page.evaluate(()=>localStorage.getItem('we3d.ocean.voyage.v1')),legacyRaw);
 report.cases.push('New native and continuous checkpoints leave the existing released save byte-for-byte intact');
 if(fallback){
  let streamedRaw=await page.evaluate(()=>{__marineEntryContext.oceanVoyage.checkpoint();return localStorage.getItem('we3d.ocean.voyage.v3');});
  async function reopen(directory,beforeResume=async()=>{}){
   await page.goto('about:blank');await server.close();server=await startStaticServer({rootDir:directory,ports:[4396]});
   await page.goto(`http://127.0.0.1:${server.port}/app/`,{waitUntil:'load'});
   await page.waitForFunction(()=>window.__WE3D_RUNTIME_READY__,null,{timeout:90000});
   await beforeResume();
   await page.locator('#oceanVoyageResume').waitFor({state:'visible',timeout:30000});await page.locator('#oceanVoyageResume').click();
   await page.waitForFunction(()=>window.getOceanModeDebugState?.()?.active,null,{timeout:90000});
   await page.evaluate(async()=>{globalThis.__marineEntryContext=(await import('/app/js/shared-context.js?v=55')).ctx;});
  }
  await reopen(fallback,async()=>{
   const departedRaw=await page.evaluate(()=>localStorage.getItem('we3d.ocean.voyage.v3'));
   const before=JSON.parse(streamedRaw),after=JSON.parse(departedRaw);
   assert.ok(after.revision>=before.revision&&after.savedAt>=before.savedAt);
   for(const value of [before,after]){delete value.revision;delete value.savedAt;}
   assert.deepEqual(after,before);streamedRaw=departedRaw;
  });
  const old=await page.evaluate(()=>{const c=__marineEntryContext; c.oceanVoyage.checkpoint();return {id:c.oceanVoyage.current.id,version:c.oceanVoyage.current.version,stream:localStorage.getItem('we3d.ocean.voyage.v3')};});
  assert.equal(old.id,'retained-ocean');assert.equal(old.version,1);assert.equal(old.stream,streamedRaw);
  await reopen(root);assert.equal(await page.evaluate(()=>__marineEntryContext.oceanVoyage.current.id),'retained-ocean');
  assert.equal(await page.evaluate(()=>localStorage.getItem('we3d.ocean.voyage.v3')),streamedRaw);
  assert.equal(await page.evaluate(raw=>__marineEntryContext.oceanVoyage.resume(JSON.parse(raw)),streamedRaw),true);
  await page.waitForFunction(()=>getOceanModeDebugState().streaming?.ready===9,null,{timeout:30000});
  assert.equal(await page.evaluate(()=>__marineEntryContext.oceanVoyage.current.subId),identity.sub);
  await page.screenshot({path:`${dir}/fallback-return.png`});
  report.cases.push('Actual packaged fallback resumes and writes its old voyage; candidate reads that write and can restore the retained continuous voyage');
 }
 await page.locator('#oceanVoyageRecover').click();await page.waitForFunction(()=>__marineEntryContext.boatDeck?.active&&!__marineEntryContext.oceanMode.active,null,{timeout:60000});
 assert.equal(await page.evaluate(()=>__marineEntryContext.boatMode.transportEntityId),identity.ship);assert.equal(await page.evaluate(()=>__marineEntryContext.oceanMode.stream),null);
 report.cases.push('Remote recovery returns to the original research vessel and disposes streamed scene');
 await page.screenshot({path:`${dir}/parent-recovered.png`});report.requests=requests;assert.deepEqual(report.errors,[]);if(identityBefore)assert.equal(sameArtifactIdentity(identityBefore,artifactIdentity(process.cwd(),root)),true);if(fallbackIdentity)assert.equal(sameArtifactIdentity(fallbackIdentity,artifactIdentity(process.cwd(),fallback)),true);report.artifactIdentity=identityBefore;report.fallbackArtifactIdentity=fallbackIdentity;report.passed=true;
}catch(error){report.failure=String(error.stack||error);if(page){report.lastState=await page.evaluate(()=>window.getOceanModeDebugState?.()).catch(()=>null);await page.screenshot({path:`${dir}/failure.png`}).catch(()=>{});}process.exitCode=1;}
finally{await fs.writeFile(`${dir}/report.json`,JSON.stringify(report,null,2));await closeOwnedBrowser(owned);await server.close();}
console.log(JSON.stringify(report));
