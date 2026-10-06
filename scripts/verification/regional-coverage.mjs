// Actual installed-Chrome Earth coverage. Fixed diagnostic cameras/time presets
// are explicit visual test setup; gameplay controls run separately below.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
import {followFlightOrbit} from './travel-flight-orbit.mjs';
import {sampleFrameWindow} from './frame-window.mjs';
import {frameHitches} from './frame-hitches.mjs';
const root=path.resolve(process.env.WE3D_VERIFY_ROOT||'.');
const external=process.env.WE3D_VERIFY_BASE_URL;
const server=external?null:await startStaticServer({rootDir:root,ports:[4552]});
const base=external||`http://127.0.0.1:${server.port}`;
const tag=process.env.WE3D_COVERAGE_TAG||'corrected';
const out=`output/verification/continuous-world/${tag}`;
await fs.mkdir(out,{recursive:true});
const flightSeconds=Math.max(0,Math.min(120,Number(process.env.WE3D_COVERAGE_FLIGHT_SECONDS)||0));
const owned=await chromium.launchServer({headless:true,channel:'chrome',args:flightSeconds?[]:['--js-flags=--max-old-space-size=1536']});
const browser=await chromium.connect(owned.wsEndpoint());
const report={ok:false,scope:'Baltimore regional coverage and controlled day/night cameras; not worldwide streaming acceptance',pageErrors:[],shaderErrors:[]};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await configureStagingAppCheck(page,base);
 page.on('pageerror',e=>report.pageErrors.push(String(e)));
 page.on('console',message=>{if(message.type()==='error'&&/WebGL|shader|GL_INVALID/i.test(message.text())&&report.shaderErrors.length<20)report.shaderErrors.push(message.text().slice(0,10000));});
 report.build=await fetch(base+'/build-manifest.json').then(r=>r.json()).then(m=>({buildId:m.buildId,commit:m.commit,sourceDirty:m.sourceDirty}));
 const start=Date.now();
 await page.goto(`${base}/app/?launch=earth&gm=free&loc=custom&lat=39.3098&lon=-76.6147&lname=Baltimore&mode=driving&diagnostics=1`,{waitUntil:'load',timeout:90000});
 await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__,null,{timeout:90000});
 if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
 await page.getByRole('button',{name:'Explore',exact:true}).click();
 await page.waitForFunction(()=>{const s=globalThis.getWorldExplorerRuntimeDiagnostics?.();return s?.gameStarted&&!s.worldLoading&&s.farTerrainClipmap?.status==='ready'&&!document.getElementById('loading')?.classList.contains('show');},null,{timeout:360000,polling:500});
 report.loadMs=Date.now()-start;
 report.programFailures=await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');return (ctx.renderer.info.programs||[]).filter(p=>p.diagnostics?.runnable===false).map(p=>({name:p.name,diagnostics:p.diagnostics}));});
 if(report.shaderErrors.length||report.programFailures.length)throw new Error('Terrain/WebGL shader compilation failed; see shaderErrors/programFailures');
 report.before=await page.evaluate(()=>{const s=globalThis.getWorldExplorerRuntimeDiagnostics();return {counts:s.worldCounts,far:s.farTerrainClipmap,roads:s.worldLoad?.regionalTransportSelection,buildings:s.worldLoad?.buildingPublicationDomain,landmarks:s.mappedTallBuildingVisuals,resources:s.resources};});
 console.log(JSON.stringify({stage:'loaded',loadMs:report.loadMs,counts:report.before.counts,far:{available:report.before.far.farBuildingsAvailable,rendered:report.before.far.farBuildings,coverage:report.before.far.farBuildingPublishedCoverage},roads:report.before.roads}));
 for(const time of ['day','night']){
  const captures=await page.evaluate(async time=>{
   const {ctx}=await import('/app/js/shared-context.js?v=55');
   ctx.setTimeOfDay(time);
   const make=(x,y,z,tx,tz)=>{const camera=ctx.camera.clone();camera.position.set(x,y,z);camera.lookAt(tx,0,tz);camera.updateMatrixWorld(true);ctx.renderer.render(ctx.scene,camera);return ctx.renderer.domElement.toDataURL('image/png');};
   const images={regional:make(4200,1700,4200,1000,0),near:make(500,380,500,0,0)};
   ctx.renderer.render(ctx.scene,ctx.camera);return images;
  },time);
  for(const [view,data]of Object.entries(captures))await fs.writeFile(`${out}/${time}-${view}.png`,Buffer.from(data.split(',')[1],'base64'));
 }
 await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');ctx.setTimeOfDay('day');});
 await page.keyboard.down('ArrowUp');await page.waitForTimeout(2000);await page.keyboard.up('ArrowUp');
 await page.screenshot({path:`${out}/drive.png`});
 await page.locator('#travelBtn').click();await page.locator('#fPlane').click();
 await page.waitForFunction(()=>globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor?.mode==='plane');
 await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');Object.assign(ctx.planeMode,{x:3000,z:3000,y:700,yaw:0,pitch:0,roll:0,pitchRate:0,rollRate:0,yawRate:0,lookYawOffset:0,cameraYaw:0,cameraPitch:0,speed:100,horizontalSpeed:100,vx:0,vy:0,vz:100,throttle:1,airborne:true,stalled:false,flightPathAngle:0,climbRate:0,turnRate:0,angleOfAttack:0,barrelRollActive:false});});
 await page.keyboard.down('Space');await page.waitForTimeout(2500);await page.keyboard.up('Space');await page.waitForTimeout(1000);
 await page.screenshot({path:`${out}/flight.png`});
 if(flightSeconds){
  await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');globalThis.__WE3D_TRAVEL_ACTOR__=ctx.planeMode;const a=ctx.planeMode;Object.assign(a,{x:3500,z:0,y:700,yaw:0,pitch:0,roll:0,pitchRate:0,rollRate:0,turnRate:0,climbRate:0,speed:95,airborne:true});});
  const signal={stopped:false};let flightError=null;
  const driver=followFlightOrbit(page,signal,{radius:3500,altitude:700,speed:95}).catch(e=>{flightError=e;});
  try{
   const sample=await page.evaluate(sampleFrameWindow,{durationMs:flightSeconds*1000,actorKey:'__WE3D_TRAVEL_ACTOR__',collectDiagnostics:false});
   const sorted=sample.deltas.slice().sort((a,b)=>a-b);
   report.flight={seconds:sample.elapsedMs/1000,fps:1000*sample.deltas.length/sample.elapsedMs,p95Ms:sorted[Math.floor(sorted.length*.95)],p99Ms:sorted[Math.floor(sorted.length*.99)],maximumFrameMs:sorted.at(-1),distanceWorldUnits:sample.distanceTraveled,hitches:frameHitches(sample.deltas)};
   await fs.writeFile(`${out}/flight-frames.json`,JSON.stringify(sample));
   console.log(JSON.stringify({stage:'sustained-flight',...report.flight}));
  }finally{signal.stopped=true;await driver;}
  if(flightError)throw flightError;
  assert.ok(report.flight.distanceWorldUnits>1000,'Flight must traverse the scene');
  await page.screenshot({path:`${out}/sustained-flight.png`});
 }

 report.after=await page.evaluate(()=>{const s=globalThis.getWorldExplorerRuntimeDiagnostics();return {actor:s.activeActor,counts:s.worldCounts,far:s.farTerrainClipmap,runtimeErrors:s.runtimeErrors};});
 if(tag!=='baseline'){
  assert.ok(report.before.far.farBuildingPublishedCoverage>=.9,'At least90% eligible regional buildings render');
  assert.equal(report.before.far.farMajorBuildingsAvailable,report.before.far.farMajorBuildingsSelected,'Every identified major building selected');
  assert.equal(report.before.far.farMajorBuildingsAvailable,report.before.far.farMajorBuildingsRendered,'Every identified major building rendered');
  assert.equal(report.before.far.farBuildingSourceCoverageComplete,true,'All requested regional source tiles loaded');
  assert.equal(report.before.far.farBuildingBudgetExceeded,false,'Coverage does not exhaust the safety ceiling');
  assert.equal(report.before.far.regionalRoadCoverage?.status,'ready','Regional surface-road coverage compiled');
  assert.equal(report.before.far.regionalRoadCoverage?.budgetExceeded,false,'Surface-road coverage is not truncated');
 }
 assert.equal(report.pageErrors.length,0);
 assert.equal(report.shaderErrors.length,0);
 await page.evaluate(()=>{delete globalThis.__WE3D_TRAVEL_ACTOR__;});
 await page.locator('#mainMenuBtn').click();
 await page.waitForFunction(()=>{const s=globalThis.getWorldExplorerRuntimeDiagnostics?.();return s?.gameStarted===false&&s.lastEarthWorldRelease?.released===true;},null,{timeout:30000});
 await page.waitForTimeout(2000);
 const cdp=await page.context().newCDPSession(page);await cdp.send('HeapProfiler.collectGarbage');
 report.releasedHeapBytes=(await cdp.send('Runtime.getHeapUsage')).usedSize;
 report.release=await page.evaluate(()=>{const s=globalThis.getWorldExplorerRuntimeDiagnostics();return {counts:s.worldCounts,streaming:s.lastEarthStreamingRelease};});
 assert.equal(report.release.counts.buildings,0);assert.equal(report.release.counts.roads,0);assert.equal(report.release.counts.terrainTiles,0);
 report.coverageAndCleanupPassed=true;
 report.flightStallCheckPassed=report.flight?report.flight.hitches.passed:null;
 // Retain cleanup evidence even when a requested flight check fails. A failed
 // optional journey must not be hidden behind a successful coverage headline.
 assert.notEqual(report.flightStallCheckPassed,false,'Sustained flight has clustered stalls');
 report.ok=true;
} catch(error){report.error=String(error.stack||error);throw error;}
finally{await fs.writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close().catch(()=>{});await closeOwnedBrowser(owned);await server?.close();console.log(JSON.stringify({tag,ok:report.ok,report:`${out}/report.json`}));}
