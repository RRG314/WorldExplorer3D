// Instrumented causal diagnostic, never a substitute for unprofiled release gates.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {startStaticServer} from '../verification/static-server.mjs';
import {configureStagingAppCheck} from '../verification/staging-app-check.mjs';
import {closeOwnedBrowser} from '../verification/owned-browser.mjs';
import {requirePerformanceHost,requireHardwareGraphics} from '../verification/performance-host.mjs';
import {sampleFrameWindow} from '../verification/frame-window.mjs';
import {frameHitches} from '../verification/frame-hitches.mjs';
import {planRoadRoute,followRoadRoute} from '../verification/travel-road-route.mjs';
import {verifyTransportResidency} from '../verification/transport-residency-world.mjs';
const out=process.env.WE3D_PROBE_OUT||'output/architecture-evaluation/current-travel-1007';
const instrumented=process.env.WE3D_TRAVEL_DIAGNOSTIC!=='off';
await mkdir(out,{recursive:true});
const report={scope:instrumented?'Current source CPU/collected-allocation/GC diagnostic with actual keyboard travel. Instrumentation affects timings; not release acceptance.':'Bounded unprofiled source keyboard travel; separate controlled region placements when requested. Not the full release matrix.',
  source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),host:requirePerformanceHost(),samples:[],errors:[],complete:false};
const server=await startStaticServer({rootDir:process.cwd(),ports:[4557]});let owned;
try{
 owned=await chromium.launchServer({channel:'chrome',headless:false});
 const browser=await chromium.connect(owned.wsEndpoint());
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>report.errors.push(e.message));
 await configureStagingAppCheck(page,`http://127.0.0.1:${server.port}`);
 await page.goto(`http://127.0.0.1:${server.port}/app/?launch=earth&gm=free&loc=custom&lat=39.2904&lon=-76.6122&lname=Baltimore&mode=walk`);
 await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__,null,{timeout:90000});
 await page.evaluate(async()=>{globalThis.__travelCtx=(await import('/app/js/shared-context.js?v=55')).ctx;});
 if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
 await page.getByRole('button',{name:'Explore',exact:true}).click();
 await page.waitForFunction(()=>!__travelCtx.worldLoading&&__travelCtx.worldLoadRuntimeState?.status==='ready',null,{timeout:300000});
 report.initial=await page.evaluate(()=>{const c=__travelCtx;c.setTimeOfDay('day');const gl=c.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
  return{buildings:c.buildings.length,roads:c.roads.length,graphics:gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER),continuity:c.transportStructureAssembly?.junctionContinuity||getWorldExplorerRuntimeDiagnostics().transportStructures?.junctionContinuity};});
 requireHardwareGraphics(report.initial.graphics);
 const route=await page.evaluate(`(${planRoadRoute.toString()})(__travelCtx.roads)`);
 await writeFile(`${out}/route.json`,JSON.stringify(route));
 const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');await cdp.send('Profiler.enable');
 for(const mode of ['drive','walk']){
  if(await page.locator('#caughtScreen.show').isVisible())throw Error('Journey interrupted by custody before next window');
  if(mode==='drive'){await page.locator('#travelBtn').click();await page.locator('#fDriving').click();}
  else {await page.locator('#travelBtn').click();await page.locator('#fWalk').click();}
  await page.evaluate(({mode,route})=>{
   const c=__travelCtx,a=mode==='walk'?c.Walk.state.walker:c.car,p=route.points[0],n=route.points[1];
   const yaw=Math.atan2(n.x-p.x,n.z-p.z);
   Object.assign(a,{x:p.x,z:p.z,y:mode==='walk'?c.GroundHeight.walkSurfaceY(p.x,p.z)+1.7:c.GroundHeight.carCenterY(p.x,p.z),yaw,angle:yaw,vy:0,onGround:true});
   if(mode==='drive')Object.assign(a,{speed:0,vFwd:0,vLat:0,vx:0,vz:0,isAirborne:false,yawRate:0});
   globalThis.__WE3D_TRAVEL_ACTOR__=a;
  },{mode,route});
  await page.waitForTimeout(1500);
  const clock={metrics:(await cdp.send('Performance.getMetrics')).metrics,page:await page.evaluate(()=>({now:performance.now(),timeOrigin:performance.timeOrigin}))};
  if(instrumented){
   await cdp.send('Tracing.start',{categories:'v8,disabled-by-default-v8.gc',transferMode:'ReturnAsStream'});
   await cdp.send('Profiler.start');
   await cdp.send('HeapProfiler.startSampling',{samplingInterval:131072,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});
  }
  const signal={stopped:false};const driver=followRoadRoute(page,route,signal,{mode});let raw,progress;
  try{raw=await page.evaluate(sampleFrameWindow,{durationMs:90000,actorKey:'__WE3D_TRAVEL_ACTOR__',backgroundContextKey:'__travelCtx',collectDiagnostics:false});}
  finally{signal.stopped=true;progress=await driver;}
  if(instrumented){
  const allocation=await cdp.send('HeapProfiler.stopSampling'),cpu=await cdp.send('Profiler.stop');
  const done=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));await cdp.send('Tracing.end');
  const {stream}=await done;let data='';
  for(;;){const chunk=await cdp.send('IO.read',{handle:stream});data+=chunk.base64Encoded?Buffer.from(chunk.data,'base64').toString():chunk.data;if(chunk.eof)break;}
  await cdp.send('IO.close',{handle:stream});
  await writeFile(`${out}/${mode}-gc.json`,JSON.stringify({clock,...JSON.parse(data)}));
  await writeFile(`${out}/${mode}-allocation.json`,JSON.stringify(allocation));
  await writeFile(`${out}/${mode}-cpu.json`,JSON.stringify({clock,...cpu}));
  }
  await writeFile(`${out}/${mode}-frames.json`,JSON.stringify(raw));
  await writeFile(`${out}/${mode}-input.json`,JSON.stringify(progress));
  const sample={mode,fps:raw.deltas.length*1000/raw.elapsedMs,hitches:frameHitches(raw.deltas),distance:raw.distanceTraveled,movingMs:raw.movingMs,custody:await page.locator('#caughtScreen.show').isVisible()};
  report.samples.push(sample);await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
  await page.screenshot({path:`${out}/${mode}.png`});console.log(JSON.stringify(sample));
  if(!Number.isFinite(sample.distance)||sample.distance<100||sample.custody)throw Error('Measured journey was interrupted or did not travel');
 }
 if(process.env.WE3D_TRAVEL_RESIDENCY==='1')report.residency=await verifyTransportResidency(page,out);
 report.complete=true;
}catch(e){report.failure=String(e.stack||e);process.exitCode=1;}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));if(owned)await closeOwnedBrowser(owned);await server.close();}
