// Current app review, not a visual pass/fail oracle. Capture both the first
// arrival and the settled publication before attributing an appearance to code.
import assert from 'node:assert/strict';
import {mkdir,writeFile,statfs} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
import {collectBrowserGraphicsErrors} from './browser-graphics-errors.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';
const out=process.env.WE3D_STREET_REVIEW_OUTPUT||'output/roadmap-20261010/street-arrival-review';
await mkdir(out,{recursive:true});let server,browser,page,resourceWatch;
const report={captured:false,scope:'Actual source app, current providers, controlled camera/actor inspection near the observed Earth-return position. Nearby publication and city overview are measured separately. No general street-quality certification.',errors:[],providerErrors:[],streetEvents:[],stages:[]};
try{
 const disk=await statfs(process.cwd());report.initialFreeBytes=disk.bavail*disk.bsize;
 assert.ok(report.initialFreeBytes>=8*1024**3,'Full-city review requires 8 GiB free disk for measured memory/swap headroom. No browser was started.');
 server=await startStaticServer({rootDir:process.cwd(),ports:[4397]});const base=`http://127.0.0.1:${server.port}`;
 browser=await chromium.launch({channel:'chrome',headless:false});page=await browser.newPage({viewport:{width:1360,height:850}});
 resourceWatch=setInterval(async()=>{
  try{const fs=await statfs(process.cwd());if(fs.bavail*fs.bsize<1.5*1024**3){
   report.resourceStop={reason:'Disk headroom below 1.5 GiB during full-city review',freeBytes:fs.bavail*fs.bsize};
   clearInterval(resourceWatch);await browser.close();
  }}catch(error){report.resourceWatchError=String(error.message);}
 },10000);
 page.on('pageerror',error=>report.errors.push(error.message));collectBrowserGraphicsErrors(page,report.errors);
 page.on('console',message=>{if(message.type()==='error'&&report.providerErrors.length<30)report.providerErrors.push(message.text().slice(0,1000));});
 page.on('console',message=>{if(message.text().startsWith('[StreetPavement]')&&report.streetEvents.length<100)report.streetEvents.push({at:new Date().toISOString(),text:message.text()});});
 await configureStagingAppCheck(page,base);
 await page.goto(`${base}/app/?loc=custom&lat=39.2904&lon=-76.6122&lname=Baltimore&launch=earth&gm=free&mode=walking&streetDiagnostics=1`,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__,null,{timeout:120000});
 if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
 if(await page.locator('#globeSelectorStartBtn').isVisible())await page.locator('#globeSelectorStartBtn').click();
 await page.waitForFunction(()=>{const d=globalThis.getWorldExplorerRuntimeDiagnostics?.();return d?.gameStarted&&!d.worldLoading&&!document.getElementById('loading')?.classList.contains('show');},null,{timeout:180000});
 await page.evaluate(async()=>{
  window.streetCtx=(await import('/app/js/shared-context.js?v=55')).ctx;const c=streetCtx;
  window.initialStreetArrival={focus:c.streetPavement?.focus,position:{x:c.Walk.state.walker.x,z:c.Walk.state.walker.z},coverageBounds:c.streetPavement?.coverageBounds,phases:c.streetPavement?.stats?.phaseDurationsMs};
  c.setTimeOfDay?.('day');c.setWeatherMode?.('clear');await c.setTravelMode('walk',{force:true,emitTutorial:false});
  const frame=(await import('/app/js/earth-core/coordinate-frame.js?v=1')).earthCoordinateFrame(c.LOC,c.SCALE);
  const p=frame.toWorld(39.2849,-76.6238);const surface=c.SurfaceQuery.walkAt(p.x,p.z,{currentY:100,sampleRenderedMesh:true});
  Object.assign(c.Walk.state.walker,{...p,y:surface.position.y+(c.Walk.CFG.eyeHeight||1.7),vy:0,angle:Math.PI,yaw:Math.PI,lookYawOffset:0,pitch:0,onGround:true,_resolvedGroundState:null});
  document.getElementById('streetSurfaceDiagnostics')?.removeAttribute('open');
 });
 report.initialArrival=await page.evaluate(()=>initialStreetArrival);
 const snapshot=()=>page.evaluate(()=>{const c=streetCtx,w=c.Walk.state.walker;return{at:new Date().toISOString(),position:{x:w.x,y:w.y,z:w.z},origin:c.LOC,
  worldLoading:c.worldLoading,loadSequence:c._worldLoadSequence,pavementUpdating:c._streetPavementUpdating===true,groundRevision:c._groundSurfaceRevision,
  pavement:{stats:c.streetPavement?.stats,focus:c.streetPavement?.focus,groundRevision:c.streetPavement?.groundRevision,coverageBounds:c.streetPavement?.coverageBounds},
  overview:c.streetOverview?.stats,roads:c.roads.length,buildings:c.buildings.length,
  render:c.renderer.info.render,memory:c.renderer.info.memory,jsHeap:performance.memory?.usedJSHeapSize};});
 await page.waitForTimeout(700);report.stages.push({stage:'arrival',...await snapshot()});await page.screenshot({path:`${out}/arrival.png`});
 const arrivalAt=Date.now(),deadline=arrivalAt+120000;let settled=false;
 while(Date.now()<deadline){
  const s=await snapshot();report.stages.push({stage:'publication',...s});
  const p=s.pavement,b=p.coverageBounds;
  if(!s.worldLoading&&!s.pavementUpdating&&p.stats&&p.groundRevision===s.groundRevision&&b&&s.position.x>b.minX&&s.position.x<b.maxX&&s.position.z>b.minZ&&s.position.z<b.maxZ
   ) {settled=true;break;}
  await page.waitForTimeout(2000);
 }
 report.localReady=settled;report.localWaitMs=Date.now()-arrivalAt;
 report.overviewComplete=report.stages.at(-1).overview?.status==='complete';
 await page.waitForTimeout(1500);report.stages.push({stage:'final',...await snapshot()});await page.screenshot({path:`${out}/settled-walk.png`});
 const captures=await page.evaluate(async()=>{
  const c=streetCtx,w=c.Walk.state.walker;
  const {streetSourceInput}=await import('/app/js/world/street-source-input.js');
  const near=item=>{const pts=item.surfaceFootprint||item.pts||item.footprint||[];if(!pts.length)return false;
   return Math.min(...pts.map(p=>p.x))<=w.x+220&&Math.max(...pts.map(p=>p.x))>=w.x-220&&Math.min(...pts.map(p=>p.z))<=w.z+220&&Math.max(...pts.map(p=>p.z))>=w.z-220;};
  const source=streetSourceInput(c,near);source.coverageBounds={minX:w.x-128,maxX:w.x+128,minZ:w.z-128,maxZ:w.z+128};
  const {captureStreetSurfaceGeometry,serializeStreetSurfaceCapture}=await import('/app/js/world/street-surface-capture.js');
  const ground=(x,z)=>c.terrainMeshHeightAt(x,z,{ignorePortalCuts:true});
  const surfaces=serializeStreetSurfaceCapture(captureStreetSurfaceGeometry(c,w,ground,24));
  return {layout:serializeStreetSurfaceCapture(source),surfaces};
 });
 await writeFile(`${out}/layout.json`,captures.layout);await writeFile(`${out}/surfaces.json`,captures.surfaces);
 const overhead=await page.evaluate(()=>{const c=streetCtx,w=c.Walk.state.walker;c.setPauseReason('street-inspection',true);
  window.savedStreetCamera={position:c.camera.position.clone(),quaternion:c.camera.quaternion.clone()};
  c.camera.position.set(w.x,w.y+190,w.z+.01);c.camera.lookAt(w.x,w.y-1.7,w.z);c.renderer.render(c.scene,c.camera);
  return c.renderer.domElement.toDataURL('image/png');
 });
 await writeFile(`${out}/settled-overhead.png`,Buffer.from(overhead.split(',')[1],'base64'));
 await page.evaluate(()=>{const c=streetCtx;c.camera.position.copy(savedStreetCamera.position);c.camera.quaternion.copy(savedStreetCamera.quaternion);c.setPauseReason('street-inspection',false);});
 await runPrescribedGameActions(page,out,[{buttons:[],frames:3}],'canvas[aria-label="Interactive 3D world view"]');
 assert.deepEqual(report.errors,[]);assert.equal(report.localReady,true,'Nearby rendered pavement must reach the arrival');report.captured=true;
}catch(error){report.failure=String(error.stack||error).split('\nBrowser logs:')[0];process.exitCode=1;await page?.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
finally{clearInterval(resourceWatch);await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser?.close();await server?.close();}
console.log(JSON.stringify({captured:report.captured,localReady:report.localReady,localWaitMs:report.localWaitMs,overviewComplete:report.overviewComplete,stages:report.stages.length,failure:report.failure,errors:report.errors}));
