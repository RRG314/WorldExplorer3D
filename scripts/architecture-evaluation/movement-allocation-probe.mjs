// Causal diagnostic only. Test instrumentation selects the previous query or
// the candidate against the SAME live population, preserving game simulation.
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {startStaticServer} from '../verification/static-server.mjs';
import {configureStagingAppCheck} from '../verification/staging-app-check.mjs';
import {closeOwnedBrowser} from '../verification/owned-browser.mjs';
import {requirePerformanceHost,requireHardwareGraphics} from '../verification/performance-host.mjs';
import {sampleFrameWindow} from '../verification/frame-window.mjs';
import {frameHitches} from '../verification/frame-hitches.mjs';
import {planRoadRoute,followRoadRoute} from '../verification/travel-road-route.mjs';
const out=process.env.WE3D_PROBE_OUT||'output/architecture-evaluation/movement-allocation-causal-1007';await mkdir(out,{recursive:true});
const report={scope:'Instrumented baseline/candidate/restored/candidate shoreline and opaque-order diagnostic; not performance acceptance',host:requirePerformanceHost(),samples:[],errors:[]};
const server=await startStaticServer({rootDir:process.cwd(),ports:[4557]});let owned;
try{
 owned=await chromium.launchServer({channel:'chrome',headless:false});const browser=await chromium.connect(owned.wsEndpoint());
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>report.errors.push(e.message));
 await configureStagingAppCheck(page,`http://127.0.0.1:${server.port}`);
 for(const file of ['app/js/boat-mode/water-geometry.js','app/js/engine/opaque-order.js']){
  let source=await readFile(file,'utf8');
  const before=execFileSync('git',['show',`HEAD:${file}`],{encoding:'utf8'});
  if(file.endsWith('opaque-order.js')){
   source=before.replace('export function opaqueFrontToBack','function originalOpaqueFrontToBack')+'\n'+source.replace('export function opaqueFrontToBack(a, b) {',"export function opaqueFrontToBack(a, b) { if(globalThis.__pedestrianProbe.variant==='baseline'||globalThis.__pedestrianProbe.variant==='restored')return originalOpaqueFrontToBack(a,b);");
  }else{
   const original=before.slice(before.indexOf('function nearestPointOnPolygon'),before.indexOf('function isPointInsideWaterAreaFootprint')).replaceAll('nearestPointOnPolygon','originalNearestPointOnPolygon').replaceAll('nearestPointOnPolyline','originalNearestPointOnPolyline');
   source+='\n'+original;
   for(const suffix of ['Polygon','Polyline'])source=source.replace(`function nearestPointOn${suffix}(px, pz, pts) {`,`function nearestPointOn${suffix}(px, pz, pts) { if(globalThis.__pedestrianProbe.variant==='baseline'||globalThis.__pedestrianProbe.variant==='restored')return originalNearestPointOn${suffix}(px,pz,pts);`);
  }
  await page.route(`**/${file}*`,r=>r.fulfill({status:200,contentType:'text/javascript',body:source}));
 }
 await page.addInitScript(()=>{globalThis.__pedestrianProbe={variant:'baseline'};});
 await page.goto(`http://127.0.0.1:${server.port}/app/?launch=earth&gm=free&loc=custom&lat=39.2904&lon=-76.6122&lname=Baltimore&mode=walk`);
 await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__,null,{timeout:90000});
 await page.evaluate(async()=>{globalThis.__probeCtx=(await import('/app/js/shared-context.js?v=55')).ctx;});
 if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
 await page.getByRole('button',{name:'Explore',exact:true}).click();
 await page.waitForFunction(()=>!__probeCtx.worldLoading&&__probeCtx.worldLoadRuntimeState?.status==='ready',null,{timeout:300000});
 report.initial=await page.evaluate(()=>{const c=__probeCtx;c.setTimeOfDay('day');const gl=c.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return{buildings:c.buildings.length,roads:c.roads.length,graphics:gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER)};});
 requireHardwareGraphics(report.initial.graphics);
 const route=await page.evaluate(`(${planRoadRoute.toString()})(__probeCtx.roads)`);
 const cdp=await page.context().newCDPSession(page);
 for(const variant of ['baseline','candidate','restored','candidate-repeat']){
  await page.evaluate(({variant,route})=>{
   const c=__probeCtx,a=c.Walk.state.walker,p=route.points[0],n=route.points[1];
   const yaw=Math.atan2(n.x-p.x,n.z-p.z);
   Object.assign(a,{x:p.x,z:p.z,y:c.GroundHeight.walkSurfaceY(p.x,p.z)+1.7,yaw,angle:yaw,vy:0,onGround:true});
   globalThis.__WE3D_TRAVEL_ACTOR__=a;__pedestrianProbe.variant=variant;
  },{variant,route});
  await page.waitForTimeout(1500);
  if(await page.locator('#caughtScreen.show').isVisible())throw Error('Actual custody interrupted the diagnostic');
  await cdp.send('HeapProfiler.startSampling',{samplingInterval:131072,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});
  const signal={stopped:false};const driver=followRoadRoute(page,route,signal,{mode:'walk'});
  let raw,progress;
  try{raw=await page.evaluate(sampleFrameWindow,{durationMs:60000,actorKey:'__WE3D_TRAVEL_ACTOR__',collectDiagnostics:false});}
  finally{signal.stopped=true;progress=await driver;}
  const counts=await page.evaluate(()=>({...__pedestrianProbe}));
  const allocation=await cdp.send('HeapProfiler.stopSampling');await writeFile(`${out}/${variant}-allocation.json`,JSON.stringify(allocation));
  await writeFile(`${out}/${variant}-frames.json`,JSON.stringify(raw));
  const sample={variant,counts,fps:raw.deltas.length*1000/raw.elapsedMs,hitches:frameHitches(raw.deltas),distance:raw.distanceTraveled,progress};
  report.samples.push(sample);await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
  if(!Number.isFinite(sample.distance)||sample.distance<30)throw Error(`Walking diagnostic did not travel: ${sample.distance}`);
  await page.screenshot({path:`${out}/${variant}.png`});console.log(JSON.stringify({variant,counts,fps:sample.fps,hitches:sample.hitches,distance:sample.distance}));
 }
 report.complete=true;
}catch(e){report.failure=String(e.stack||e);process.exitCode=1;}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));if(owned)await closeOwnedBrowser(owned);await server.close();}
