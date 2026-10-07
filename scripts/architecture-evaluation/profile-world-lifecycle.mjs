// Bounded causal diagnostic, not a performance acceptance gate. Uses packaged
// game bytes, ordinary input and RAF. Never collects garbage during movement.
import {chromium} from 'playwright';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {startStaticServer} from '../verification/static-server.mjs';
import {configureStagingAppCheck} from '../verification/staging-app-check.mjs';
import {closeOwnedBrowser} from '../verification/owned-browser.mjs';
import {requirePerformanceHost, requireHardwareGraphics} from '../verification/performance-host.mjs';
import {sampleFrameWindow} from '../verification/frame-window.mjs';
import {frameHitches} from '../verification/frame-hitches.mjs';
import {planRoadRoute, followRoadRoute} from '../verification/travel-road-route.mjs';

const root = process.cwd();
const artifactRoot = process.env.WE3D_VERIFY_ROOT || `${root}/dist`;
const output = process.env.WE3D_VERIFY_OUTPUT_DIR || `${root}/output/architecture-evaluation/2026-10-06-movement`;
await mkdir(output, {recursive:true});
const report = {scope:'Instrumented walking/driving diagnosis; no release acceptance claim',
  host:requirePerformanceHost(), artifact:JSON.parse(await readFile(`${artifactRoot}/build-manifest.json`)),
  viewport:{width:1440,height:900}, controls:'Keyboard only after initial route placement',
  unrelatedBrowsers:'Preserved; their activity is an uncontrolled host variable',
  samples:[], errors:[], complete:false};
const save = () => writeFile(`${output}/report.json`, JSON.stringify(report,null,2));
const server = await startStaticServer({rootDir:artifactRoot,ports:[4555,4556]});
let ownedBrowser, deadline;
try {
  ownedBrowser = await chromium.launchServer({headless:false,channel:'chrome'});
  deadline = setTimeout(() => closeOwnedBrowser(ownedBrowser).catch(()=>{}), 8*60000);
  const browser = await chromium.connect(ownedBrowser.wsEndpoint());
  const page = await browser.newPage({viewport:report.viewport});
  await configureStagingAppCheck(page, `http://127.0.0.1:${server.port}`);
  page.on('pageerror', error => report.errors.push(String(error.message).slice(0,500)));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  console.log('movement audit: loading packaged Baltimore');
  await page.goto(`http://127.0.0.1:${server.port}/app/?launch=earth&gm=free&loc=custom&lat=39.2904&lon=-76.6122&lname=Baltimore&mode=walk`, {waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__,null,{timeout:90000});
  await page.evaluate(async()=>{globalThis.__WE3D_AUDIT_CONTEXT__=(await import('/app/js/shared-context.js?v=55')).ctx;});
  if (await page.locator('#analyticsConsentDenyBtn').isVisible()) await page.locator('#analyticsConsentDenyBtn').click();
  await page.locator('#globeSelectorStartBtn').click();
  await page.waitForFunction(()=>{const c=globalThis.__WE3D_AUDIT_CONTEXT__;return c.gameStarted&&!c.worldLoading&&c.worldLoadRuntimeState?.status==='ready'&&c.farTerrainClipmapState?.status==='ready';},null,{timeout:300000,polling:1000});
  report.initial = await page.evaluate(async()=>{
    const {ctx}=await import('/app/js/shared-context.js?v=55');
    globalThis.__WE3D_AUDIT_CONTEXT__=ctx;
    ctx.setTimeOfDay('day');
    const gl=ctx.renderer.getContext(), ext=gl.getExtension('WEBGL_debug_renderer_info');
    return {graphics:gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER),
      buildings:ctx.buildings.length,roads:ctx.roads.length,publication:ctx.worldPublication.requestId};
  });
  requireHardwareGraphics(report.initial.graphics);
  report.timeOfDay='day';
  const route=await page.evaluate(`(${planRoadRoute.toString()})(globalThis.__WE3D_AUDIT_CONTEXT__.roads)`);
  await writeFile(`${output}/route.json`,JSON.stringify(route));
  for (const mode of ['walk','drive']) {
    if(mode==='drive') {await page.locator('#travelBtn').click();await page.locator('#fDriving').click();}
    await page.locator('#travelBtn').blur();
    await page.evaluate(({mode,route})=>{
      const c=globalThis.__WE3D_AUDIT_CONTEXT__,a=mode==='walk'?c.Walk.state.walker:c.car;
      const p=route.points[0],n=route.points[1],yaw=Math.atan2(n.x-p.x,n.z-p.z);
      Object.assign(a,{x:p.x,z:p.z,yaw,angle:yaw,pitch:0,roll:0,pitchRate:0,rollRate:0,yawRate:0,
        lookYawOffset:0,cameraYaw:0,cameraPitch:0,cameraLookTimer:0,
        y:mode==='walk'?c.GroundHeight.walkSurfaceY(p.x,p.z)+1.7:c.GroundHeight.carCenterY(p.x,p.z),
        speed:0,vFwd:0,vLat:0,vx:0,vy:0,vz:0,onGround:true,isAirborne:false});
      globalThis.__WE3D_TRAVEL_ACTOR__=a;
    },{mode,route});
    await page.waitForTimeout(1500);
    const transportBefore=await page.evaluate(()=>({...globalThis.__WE3D_AUDIT_CONTEXT__.transportDetail?.stats}));
    // Trace only GC events with numeric metadata; no network, DOM, or credentials.
    const gc=[];
    const capture=({value})=>{for(const e of value) if (/GC|Garbage|Scavenge|MarkCompact/i.test(e.name||'')) {
      const data={};for(const [key,val] of Object.entries(e.args||{})) if(typeof val==='number')data[key]=val;
      gc.push({name:e.name,ph:e.ph,ts:e.ts,dur:e.dur,pid:e.pid,tid:e.tid,args:data});
    }};
    cdp.on('Tracing.dataCollected',capture);
    await cdp.send('Tracing.start',{categories:'v8,disabled-by-default-v8.gc',transferMode:'ReportEvents'});
    await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
    await cdp.send('HeapProfiler.startSampling',{samplingInterval:131072,
      includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});
    const clock={metrics:(await cdp.send('Performance.getMetrics')).metrics,
      page:await page.evaluate(()=>({now:performance.now(),timeOrigin:performance.timeOrigin}))};
    const signal={stopped:false};let driverError;
    console.log(`movement audit: ${mode}, 90 seconds with CPU/allocation/GC sampling`);
    const driver=followRoadRoute(page,route,signal,{mode}).catch(error=>{driverError=error;return {failure:error.message};});
    let raw,progress,profile;
    try {raw=await page.evaluate(sampleFrameWindow,{durationMs:90000,actorKey:'__WE3D_TRAVEL_ACTOR__',backgroundContextKey:'__WE3D_AUDIT_CONTEXT__',collectDiagnostics:false});}
    finally {
      signal.stopped=true;progress=await driver;
      ({profile}=await cdp.send('Profiler.stop'));
      const allocation=await cdp.send('HeapProfiler.stopSampling');
      const finished=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));
      await cdp.send('Tracing.end');await finished;cdp.off('Tracing.dataCollected',capture);
      await writeFile(`${output}/${mode}-cpu.json`,JSON.stringify({profile,clock}));
      await writeFile(`${output}/${mode}-allocation.json`,JSON.stringify(allocation));
      await writeFile(`${output}/${mode}-gc.json`,JSON.stringify(gc));
      await writeFile(`${output}/${mode}-input.json`,JSON.stringify(progress));
    }
    if(driverError)throw driverError;
    await writeFile(`${output}/${mode}-frames.json`,JSON.stringify(raw));
    const sorted=[...raw.deltas].sort((a,b)=>a-b);
    const sample={mode,elapsedMs:raw.elapsedMs,fps:raw.deltas.length*1000/raw.elapsedMs,
      p99Ms:sorted[Math.ceil(sorted.length*.99)-1],hitches:frameHitches(raw.deltas),
      distanceTraveled:raw.distanceTraveled,movingMs:raw.movingMs,routeProgress:progress.progress,
      gcEvents:gc.length,background:raw.background};
    sample.transport={before:transportBefore,after:await page.evaluate(()=>({...globalThis.__WE3D_AUDIT_CONTEXT__.transportDetail?.stats}))};
    report.samples.push(sample);await save();
    console.log(JSON.stringify({mode,fps:sample.fps,maxMs:sample.hitches.worstFrameMs,distance:sample.distanceTraveled,gcEvents:gc.length}));
    await page.screenshot({path:`${output}/${mode}.png`});
  }
  report.final=await page.evaluate(()=>{const c=globalThis.__WE3D_AUDIT_CONTEXT__;return {buildings:c.buildings.length,roads:c.roads.length,
    ready:c.worldLoadRuntimeState.status,providers:c.worldLoadRuntimeState.session.outstandingProviderWork};});
  report.complete=true;
} catch(error) {report.failure=String(error.stack||error);process.exitCode=1;}
finally {clearTimeout(deadline);await save();if(ownedBrowser)await closeOwnedBrowser(ownedBrowser);await server.close();}
