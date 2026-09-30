import {installLightUniformExperiment} from './light-uniform-experiment.mjs';
import {exerciseTravelCameras,returnToDriving} from './travel-camera-journey.mjs';
import {smoothMovingCameraTarget} from '../../app/js/hud/moving-camera-target.js';
import {installCameraMotionEvidence} from './camera-motion-evidence.mjs';
import {installInactiveLightExperiment} from './inactive-light-experiment.mjs';
import {installTerrainWeightExperiment} from './terrain-weight-experiment.mjs';
import {installBuildingDepthExperiment} from './building-depth-experiment.mjs';
import {installTravelGpuEvidence} from './travel-gpu-evidence.mjs';
import {createFloat64ScratchAllocator} from './profile-scratch-experiment.mjs';
import {createTransportProfileUsageProbe} from './transport-profile-usage.mjs';
import {createProvisionalProfileCompiler} from './provisional-profile-experiment.mjs';
import {buildMergedGeometry} from '../../app/js/world/geometry-batching.js';
import {requirePerformanceHost, requireHardwareGraphics} from './performance-host.mjs';
import {publicProviderFixtureRequest} from './provider-fixture-key.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';
import { configureStagingAppCheck } from './staging-app-check.mjs';
import { nearbyVehicleSnapshots } from '../../app/js/living-world/nearby-vehicles.js';
import { cameraRoadSurfaceHit } from '../../app/js/world/camera-road-surface.js';
import { planRoadRoute, followRoadRoute } from './travel-road-route.mjs';
import { followFlightOrbit } from './travel-flight-orbit.mjs';
import { sampleFrameWindow } from './frame-window.mjs';

// Replays public provider bytes, never credentials or authenticated service data.
// Playwright routing disables HTTP cache: "warm" means persisted world-data cache,
// not an HTTP/CDN warm load. Hosted transfer latency is a separate acceptance test.
const hostAuthority = requirePerformanceHost();
const record = process.env.WE3D_COMPARISON_MODE === 'record';
const output = path.resolve(process.env.WE3D_COMPARISON_OUTPUT || 'output/verification/performance-comparison');
const cacheRoot = path.resolve(process.env.WE3D_COMPARISON_CACHE || path.join(output, 'public-provider-cache'));
const travel = process.env.WE3D_COMPARISON_TRAVEL === '1';
const roots = {
  live: path.resolve(process.env.WE3D_COMPARISON_BASELINE || '.local-candidates/5.2.0+db62593ba377.6342cddaba06fc68.production'),
  candidate: path.resolve(process.env.WE3D_COMPARISON_CANDIDATE || 'dist')
};
const rounds = record ? 1 : Math.max(travel ? 1 : 3, Number(process.env.WE3D_COMPARISON_ROUNDS) || 3);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir(output, { recursive: true });
await mkdir(cacheRoot, { recursive: true });
const indexFile = path.join(cacheRoot, 'index.json');
const cache = JSON.parse(await readFile(indexFile, 'utf8').catch(() => '{}'));
const publicHosts = new Set(['vector.openstreetmap.org','server.arcgisonline.com','tile.openstreetmap.org','s3.amazonaws.com',
  'overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com','planetarycomputer.microsoft.com','cdn.jsdelivr.net',
  'fonts.gstatic.com','fonts.googleapis.com','cdnjs.cloudflare.com','api.tidesandcurrents.noaa.gov',
  'lz4.overpass-api.de','overpass-api.de','overpass.private.coffee','marine-api.open-meteo.com','api.open-meteo.com',
  'nominatim.openstreetmap.org','titiler.terrascope.be','api-bdc.io','www.googletagmanager.com']);
const manifests = {};
for (const [label, root] of Object.entries(roots)) {
  const manifest = JSON.parse(await readFile(path.join(root, 'build-manifest.json')));
  const bytes = await readFile(path.join(root, 'asset-manifest.json'));
  assert.equal(digest(bytes), manifest.assetManifestSha256, `${label}: manifest hash`);
  for (const [name, hash] of Object.entries(JSON.parse(bytes).files)) {
    const file = path.resolve(root, name);
    assert.ok(file.startsWith(root + path.sep));
    assert.equal(digest(await readFile(file)), hash, `${label}: ${name}`);
  }
  assert.equal(manifest.sourceDirty, false);
  manifests[label] = { buildId: manifest.buildId, contentHash: manifest.contentHash, root };
}
const report = { hostAuthority, inactiveLights:process.env.WE3D_TRAVEL_INACTIVE_LIGHTS==='1', postprocessDiagnostic:process.env.WE3D_TRAVEL_POST_DIAGNOSTIC||null, terrainWeights:process.env.WE3D_TRAVEL_TERRAIN_WEIGHTS==='1', terrainParity:process.env.WE3D_TRAVEL_TERRAIN_PARITY==='1', opaqueOrder:process.env.WE3D_TRAVEL_OPAQUE_ORDER||'packaged', depthPrepass:process.env.WE3D_TRAVEL_DEPTH_PREPASS==='1', depthParity:process.env.WE3D_TRAVEL_DEPTH_PARITY==='1', gpuPasses:process.env.WE3D_TRAVEL_GPU_PASSES==='1', isolation:process.env.WE3D_TRAVEL_ISOLATION || null, profiler:process.env.WE3D_TRAVEL_PROFILE || null, mode: record ? 'record-public-fixtures' : 'controlled-replay', startedAt: new Date().toISOString(), manifests,
  scope: { travelInvestigation:travel, hardware: 'current physical desktop', viewport: '1440x900 at DPR 1', renderQuality: 'med', dynamicQuality: 'locked balanced',
    daylight: 'day', controls: travel ? (process.env.WE3D_TRAVEL_FLIGHT_ORBIT==='1' ? 'Normal keyboard controls on a 750-unit city flight orbit; initial placement only' : 'Normal travel controls; route and raw positions recorded per trial') : 'real W key along fixed starts/headings for 12 m walk and 75 m drive; 20 second timeout', cache: 'cold context followed by same-context persisted-data reload; HTTP cache disabled by routing',
    network: 'public providers replayed locally; Overpass mirrors/timeouts share one complete response per identical data query; authenticated staging attestation remains live',
    exclusions: ['hosted CDN latency', 'physical-phone performance', 'all possible places and routes'] }, trials: [] };
const save = () => writeFile(path.join(output, record ? 'record-report.json' : 'report.json'), JSON.stringify(report, null, 2));
const percentile = (values, p) => [...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1];
async function measure(page, mode) {
  await page.locator('#travelBtn').click();
  await page.locator(mode === 'walk' ? '#fWalk' : '#fDriving').click();
  await page.waitForFunction(mode => globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor?.mode === mode, mode);
  await page.mouse.click(720,400);
  await page.evaluate(async mode=>{
    const {ctx}=await import('/app/js/shared-context.js?v=55');
    const actor=mode==='walk'?ctx.Walk.state.walker:ctx.car;
    const x=mode==='walk'?-10:-3, z=mode==='walk'?-4:-2;
    Object.assign(actor,{x,z,angle:Math.atan2(1,.25),yaw:Math.atan2(1,.25),speed:0,vFwd:0,vLat:0,vx:0,vy:0,vz:0,yawRate:0,lookYawOffset:0,pitch:0});
    actor.y=mode==='walk'?ctx.GroundHeight.walkSurfaceY(x,z)+1.7:ctx.GroundHeight.carCenterY(x,z);
    actor.onGround=true;actor.isAirborne=false;
    globalThis.__WE3D_COMPARISON_ACTOR__=actor;
  },mode);
  await page.waitForTimeout(1500);
  await page.keyboard.down('w');
  let raw;
  try { raw = await page.evaluate(sampleFrameWindow, {durationMs:20000,targetDistance:mode==='walk'?12:75,actorKey:'__WE3D_COMPARISON_ACTOR__'}); } // gitleaks:allow -- browser fixture property, not a credential
  finally { await page.keyboard.up('w'); }
  const distance = Math.hypot(raw.endPosition.x-raw.startPosition.x, raw.endPosition.z-raw.startPosition.z);
  assert.equal(raw.routeComplete,true, `${mode}: input did not complete the fixed route`);
  assert.ok(Math.abs(raw.deltas.reduce((a,b)=>a+b,0)-raw.elapsedMs)<.001);
  return { mode, elapsedMs: raw.elapsedMs, startPosition: raw.startPosition, endPosition: raw.endPosition, distance,
    fps: raw.deltas.length/raw.elapsedMs*1000, p95FrameMs: percentile(raw.deltas,.95), p99FrameMs: percentile(raw.deltas,.99),
    renderer: raw.diagnostics.renderer, worldCounts: raw.diagnostics.worldCounts };
}
async function measureTravel(page, label, round, state) {
  const results=[];
  const profileMode=process.env.WE3D_TRAVEL_PROFILE || '';
  const cdp=profileMode && profileMode!=='gpu' ? await page.context().newCDPSession(page) : null;
  if(cdp)await cdp.send('Performance.enable');
  const ctxKey='__WE3D_TRAVEL_CONTEXT__',actorKey='__WE3D_TRAVEL_ACTOR__';
  await page.evaluate(async key=>{globalThis[key]=(await import('/app/js/shared-context.js?v=55')).ctx;},ctxKey);
  if(process.env.WE3D_TRAVEL_LIGHT_UNIFORMS==='1')await page.evaluate('globalThis.__lightUniformExperiment=('+installLightUniformExperiment.toString()+')(globalThis.'+ctxKey+')');
  if(process.env.WE3D_TRAVEL_INACTIVE_LIGHTS==='1')await page.evaluate('globalThis.__inactiveLightExperiment=('+installInactiveLightExperiment.toString()+')(globalThis.'+ctxKey+');globalThis.__inactiveLightExperiment.setEnabled(true)');
  if(process.env.WE3D_TRAVEL_TERRAIN_WEIGHTS==='1')await page.evaluate('globalThis.__terrainWeightExperiment=('+installTerrainWeightExperiment.toString()+')(globalThis.'+ctxKey+');globalThis.__terrainWeightExperiment.setEnabled(true)');
  if(process.env.WE3D_TRAVEL_DEPTH_PREPASS==='1')await page.evaluate('globalThis.__buildingDepthExperiment=('+installBuildingDepthExperiment.toString()+')(globalThis.'+ctxKey+')');
  if(process.env.WE3D_TRAVEL_POST_DIAGNOSTIC)await page.evaluate(({key,variant})=>{const c=globalThis[key];if(!['no-smaa','no-bloom','scene-only'].includes(variant))throw Error('Unknown postprocess isolation');if(variant!=='no-bloom'&&c.smaaPass)c.smaaPass.enabled=false;if(variant!=='no-smaa'&&c.bloomPass)c.bloomPass.enabled=false;},{key:ctxKey,variant:process.env.WE3D_TRAVEL_POST_DIAGNOSTIC});
  if(process.env.WE3D_TRAVEL_ISOLATION==='material-sort'||process.env.WE3D_TRAVEL_OPAQUE_ORDER==='material')await page.evaluate(key=>globalThis[key].renderer.setOpaqueSort(null),ctxKey);
  if(process.env.WE3D_TRAVEL_ISOLATION==='overview-idle')await page.evaluate(async key=>{const overview=globalThis[key].streetOverview;if(!overview)throw Error('Missing overview for isolation');overview.step=()=>{};await overview.pause();},ctxKey);
  for(const mode of (process.env.WE3D_TRAVEL_MODES?.split(',') || ['drive','plane'])) {
    await page.locator('#travelBtn').click();
    await page.locator(mode==='drive'?'#fDriving':'#fPlane').click();
    await page.locator('#travelBtn').blur();
    await page.waitForFunction(({ctxKey,mode})=>globalThis[ctxKey].activeTransportActor?.()?.mode===mode,{ctxKey,mode},{polling:100});
    const route=mode==='drive'&&process.env.WE3D_TRAVEL_ROAD_ROUTE==='1' ? await page.evaluate('(' + planRoadRoute.toString() + ')(globalThis.' + ctxKey + '.roads)') : null;
    if(route)await writeFile(path.join(output,`${label}-${round}-road-route.json`),JSON.stringify(route));
    const orbit=mode==='plane'&&process.env.WE3D_TRAVEL_FLIGHT_ORBIT==='1';
    await page.evaluate(({ctxKey,actorKey,mode,route,orbit})=>{
      const ctx=globalThis[ctxKey],actor=mode==='drive'?ctx.car:ctx.planeMode;
      const x=route?route.points[0].x:orbit?750:-3,z=route?route.points[0].z:orbit?0:-2,yaw=route?Math.atan2(route.points[1].x-x,route.points[1].z-z):orbit?0:Math.atan2(1,.25);
      Object.assign(actor,{x,z,angle:yaw,yaw,pitch:0,roll:0,pitchRate:0,rollRate:0,yawRate:0,lookYawOffset:0,cameraYaw:0,cameraPitch:0,cameraLookTimer:0,barrelRollActive:false,flightPathAngle:0,climbRate:0,turnRate:0,angleOfAttack:0});
      if(mode==='drive')Object.assign(actor,{y:ctx.GroundHeight.carCenterY(x,z),speed:0,vFwd:0,vLat:0,vx:0,vy:0,vz:0,onGround:true,isAirborne:false});
      else Object.assign(actor,{y:orbit?220:300,speed:80,horizontalSpeed:80,vx:Math.sin(yaw)*80,vy:0,vz:Math.cos(yaw)*80,throttle:1,airborne:true,stalled:false});
      globalThis[actorKey]=actor;
    },{ctxKey,actorKey,mode,route,orbit});
    if(process.env.WE3D_TRAVEL_DEPTH_PARITY==='1'||process.env.WE3D_TRAVEL_TERRAIN_PARITY==='1'||process.env.WE3D_TRAVEL_LIGHT_PARITY==='1'||process.env.WE3D_TRAVEL_UNIFORM_PARITY==='1'){
      const parityKind=process.env.WE3D_TRAVEL_UNIFORM_PARITY==='1'?'light-uniform':process.env.WE3D_TRAVEL_LIGHT_PARITY==='1'?'inactive-light':process.env.WE3D_TRAVEL_TERRAIN_PARITY==='1'?'terrain-weight':'depth';
      const parity=await page.evaluate(key=>{
        const c=globalThis[key],experiment=globalThis.__lightUniformExperiment||globalThis.__inactiveLightExperiment||globalThis.__terrainWeightExperiment||globalThis.__buildingDepthExperiment;
        if(!experiment)throw Error('Depth experiment required');
        c.updateCamera(0);
        const capture=()=>{if(c.composer)c.composer.render();else c.renderer.render(c.scene,c.camera);const gl=c.renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;};
        experiment.setEnabled(false);capture();const before=capture();
        experiment.setEnabled(true);capture();const after=capture();
        const distinctColors=new Set();for(let i=0;i<before.length;i+=4)distinctColors.add((before[i]<<16)|(before[i+1]<<8)|before[i+2]);
        if(distinctColors.size<100)throw Error("Parity framebuffer is blank or uniform");
        let changedPixels=0,maxChannelDelta=0,totalChannelDelta=0;
        for(let i=0;i<before.length;i+=4){let changed=false;for(let j=0;j<3;j++){const delta=Math.abs(before[i+j]-after[i+j]);if(delta)changed=true;maxChannelDelta=Math.max(maxChannelDelta,delta);totalChannelDelta+=delta;}if(changed)changedPixels++;}
        return {batches:experiment.count,pixels:before.length/4,distinctColors:distinctColors.size,changedPixels,maxChannelDelta,totalChannelDelta};
      },ctxKey);
      await writeFile(path.join(output,`${label}-${round}-${mode}-${parityKind}-parity.json`),JSON.stringify(parity));
      console.log(JSON.stringify({parityKind,parity}));
      await page.screenshot({path:path.join(output,`${label}-${round}-${mode}-${parityKind}-parity.png`)});
      continue;
    }
    if(process.env.WE3D_TRAVEL_CAMERA_EVIDENCE==='1')await page.evaluate('globalThis.__cameraMotionEvidence=('+installCameraMotionEvidence.toString()+')(globalThis.'+ctxKey+','+JSON.stringify({mode})+')');
    const key=mode==='drive'?'w':'Space';
    const signal={stopped:false};
    const driving=route?followRoadRoute(page,route,signal):null;
    const flying=orbit?followFlightOrbit(page,signal,{altitude:Number(process.env.WE3D_TRAVEL_ORBIT_ALTITUDE)||220}):null;
    // Attach rejection handling immediately; surface it after releasing controls.
    if(flying)flying.catch(()=>{});
    if(!route&&!orbit)await page.keyboard.down(key);
    try {
      for(const phase of ['entered','settled']) {
        let clock=null;
        if(cdp){
          clock={metrics:(await cdp.send('Performance.getMetrics')).metrics,page:await page.evaluate(()=>({now:performance.now(),timeOrigin:performance.timeOrigin}))};
          if(profileMode==='cpu'){await cdp.send('Profiler.enable');await cdp.send('Profiler.start');}
          else if(profileMode==='allocation')await cdp.send('HeapProfiler.startSampling',{samplingInterval:65536,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});
          else if(profileMode==='gc')await cdp.send('Tracing.start',{categories:'v8,disabled-by-default-v8.gc',transferMode:'ReturnAsStream'});
          else throw Error('Unsupported travel profiler');
        }
        if(profileMode==='gpu')await page.evaluate('globalThis.__travelGpuEvidence=('+installTravelGpuEvidence.toString()+')(globalThis.'+ctxKey+','+JSON.stringify({passes:process.env.WE3D_TRAVEL_GPU_PASSES==='1'})+')');
        const raw=await page.evaluate(sampleFrameWindow,{durationMs:phase==='entered'?5000:Number(process.env.WE3D_TRAVEL_SETTLED_MS)||60000,actorKey,collectDiagnostics:false});
        const filename=`${label}-${round}-${state}-${mode}-${phase}`;
        if(process.env.WE3D_TRAVEL_CAMERA_EVIDENCE==='1')await writeFile(path.join(output,filename+'-camera.json'),JSON.stringify(await page.evaluate(()=>globalThis.__cameraMotionEvidence.take())));
        await writeFile(path.join(output,filename+'-frames.json'),JSON.stringify(raw));
        if(profileMode==='gpu')await writeFile(path.join(output,filename+'-gpu.json'),JSON.stringify(await page.evaluate(()=>{const result=globalThis.__travelGpuEvidence.finish();delete globalThis.__travelGpuEvidence;return result;})));
        if(cdp){
          let profile;
          if(profileMode==='gc'){
            const completed=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));
            await cdp.send('Tracing.end');
            const {stream}=await completed;let data='';
            for(;;){const chunk=await cdp.send('IO.read',{handle:stream});data+=chunk.base64Encoded?Buffer.from(chunk.data,'base64').toString():chunk.data;if(chunk.eof)break;}
            await cdp.send('IO.close',{handle:stream});profile=JSON.parse(data);
          }else profile=await cdp.send(profileMode==='cpu'?'Profiler.stop':'HeapProfiler.stopSampling');
          await writeFile(path.join(output,filename+'-'+profileMode+'.json'),JSON.stringify({clock,...profile,scope:'Instrumented diagnostic only; not performance acceptance'}));
        }
        const hitches=[50,100,200].map(threshold=>({thresholdMs:threshold,count:raw.deltas.filter(d=>d>threshold).length,totalMs:raw.deltas.filter(d=>d>threshold).reduce((a,b)=>a+b,0)}));
        const renderer=await page.evaluate(key=>{const c=globalThis[key],i=c.renderer.info;return {...i.render,programs:i.programs.length,...i.memory,usedJSHeapBytes:performance.memory?.usedJSHeapSize ?? null,transportStatus:c.transportDetail?.stats?.status,pavementStatus:c.streetOverview?.stats?.status,pavementCompletedCells:c.streetOverview?.stats?.completedCells,pavementTotalCells:c.streetOverview?.stats?.totalCells};},ctxKey);
        const row={mode,phase,renderer,elapsedMs:raw.elapsedMs,startPosition:raw.startPosition,endPosition:raw.endPosition,distance:raw.distanceTraveled,movingFraction:raw.movingMs/raw.elapsedMs,fps:raw.deltas.length/raw.elapsedMs*1000,p95FrameMs:percentile(raw.deltas,.95),p99FrameMs:percentile(raw.deltas,.99),maxMs:Math.max(...raw.deltas),hitches};
        results.push(row);console.log(JSON.stringify({label,round,state,...row}));
      }
      if(process.env.WE3D_TRAVEL_CAMERA_JOURNEY==='1')await exerciseTravelCameras(page,ctxKey,output,`${label}-${round}-${mode}`);
    } finally {signal.stopped=true;if(driving)await writeFile(path.join(output,`${label}-${round}-road-progress.json`),JSON.stringify(await driving));else if(flying)await writeFile(path.join(output,`${label}-${round}-flight-orbit.json`),JSON.stringify(await flying));else await page.keyboard.up(key).catch(()=>{});}
    if(profileMode==='gpu')await writeFile(path.join(output,`${label}-${round}-${state}-${mode}-scene.json`),JSON.stringify(await page.evaluate(key=>{
      const ctx=globalThis[key], summarize=root=>{const counts={objects:0,visible:0,automaticMatrices:0,meshes:0,skinned:0,instanced:0};root.traverse(o=>{counts.objects++;if(o.visible)counts.visible++;if(o.matrixAutoUpdate)counts.automaticMatrices++;if(o.isMesh)counts.meshes++;if(o.isSkinnedMesh)counts.skinned++;if(o.isInstancedMesh)counts.instanced++;});return {name:root.name,type:root.type,flags:Object.keys(root.userData||{}),...counts};};
      return {total:summarize(ctx.scene),roots:ctx.scene.children.map(summarize),earthChildren:ctx.earthSceneRoot?.children.map(summarize)};
    },ctxKey)));
    await page.screenshot({path:path.join(output,`${label}-${round}-${state}-${mode}.png`)});
  }
  if(process.env.WE3D_TRAVEL_LIGHT_UNIFORMS==='1')await writeFile(path.join(output,`${label}-${round}-light-uniforms.json`),JSON.stringify(await page.evaluate(()=>globalThis.__lightUniformExperiment.snapshot())));
  if(process.env.WE3D_TRAVEL_RETURN_GROUND==='1')await returnToDriving(page,ctxKey,output,`${label}-${round}`);
  return results;
}
async function trial(label, round) {
  const server = await startStaticServer({ rootDir: roots[label], ports: [4488] });
  const baseUrl = `http://127.0.0.1:${server.port}`;
  const browser = await chromium.launch({ headless:true, channel:'chrome', args:[] });
  report.browserVersion=browser.version();
  const context = await browser.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:1 });
  const misses = [], providerErrors = [], browserErrors = [], pending = new Set();
  await context.route('https://**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    const isPublic = publicHosts.has(url.hostname) || (url.hostname==='www.gstatic.com' && url.pathname.startsWith('/firebasejs/'));
    if (!isPublic) {
      const service=url.hostname==='csp.withgoogle.com' || /^(firebase|content-firebaseappcheck|firebaseappcheck|firebaseinstallations|identitytoolkit|securetoken|firestore|firebasestorage)\.googleapis\.com$/.test(url.hostname) ||
        ['us-central1-we3d-staging-20260712.cloudfunctions.net','us-central1-worldexplorer3d-d9b83.cloudfunctions.net'].includes(url.hostname) ||
        (['www.google.com','www.gstatic.com','recaptcha.google.com'].includes(url.hostname)&&url.pathname.includes('recaptcha'));
      if(service)return route.continue();
      misses.push({url:url.origin+url.pathname,reason:'Uncontrolled external origin'});
      return route.abort('failed');
    }
    const requestShape={method:request.method(),url:url.href,range:request.headers().range||'',body:request.postData()||''};
    const fixture=publicProviderFixtureRequest(requestShape);
    const key=digest(JSON.stringify(fixture.key));
    const legacyKey=digest(JSON.stringify([requestShape.method,requestShape.url,requestShape.range,requestShape.body]));
    const work = (async () => {
      const legacy=record&&fixture.semanticOverpass&&cache[legacyKey]?.status===200?cache[legacyKey]:null;
      let entry=cache[key]||legacy;
      // The manual Baltimore scenario fixes locality metadata as well as sky and weather.
      // Geocoding floats otherwise depend on the exact frame at a timed refresh.
      // Replay an actual recorded city response; geometry/elevation/map requests stay exact.
      if(travel && ['nominatim.openstreetmap.org','api-bdc.io','api.open-meteo.com'].includes(url.hostname)){
        const latitude=Number(url.searchParams.get('lat')||url.searchParams.get('latitude'));
        const longitude=Number(url.searchParams.get('lon')||url.searchParams.get('longitude'));
        assert.ok(Math.abs(latitude-39.2904)<.25&&Math.abs(longitude+76.6122)<.3,'Manual context is restricted to Baltimore');
        const choices=Object.values(cache).filter(e=>{if(e.status!==200||!e.sha256)return false;const u=new URL(e.url);return u.hostname===url.hostname&&(/reverse/.test(u.pathname)||u.pathname==='/v1/forecast');});
        const coordinateDistance=e=>{const u=new URL(e.url);return Math.hypot(Number(u.searchParams.get('lat')||u.searchParams.get('latitude'))-39.2904,Number(u.searchParams.get('lon')||u.searchParams.get('longitude'))+76.6122);};
        choices.sort((a,b)=>coordinateDistance(a)-coordinateDistance(b));
        if(choices[0]){entry=choices[0];report.manualLocalityFixtures ||= {};report.manualLocalityFixtures[url.hostname]={url:entry.url,sha256:entry.sha256};}
      }
      if (entry) {
        if (entry.aborted) return route.abort('failed');
        const body = await readFile(path.join(cacheRoot, entry.sha256));
        assert.equal(digest(body), entry.sha256, 'Provider fixture changed');
        if(fixture.semanticOverpass)assert.ok(!JSON.parse(body).remark,'Incomplete Overpass fixture');
        if(legacy)cache[key]={...entry,query:fixture.key[1],semanticOverpass:true};
        return route.fulfill({ status:entry.status, headers:entry.headers, body });
      }
      if (!record) { misses.push({url:url.href,range:request.headers().range || ''}); return route.abort('failed'); }
      try {
        const response = await route.fetch({ timeout:30000, maxRetries:0 });
        const body = await response.body(), sha256 = digest(body);
        const headers = Object.fromEntries(Object.entries(response.headers()).filter(([key])=>
          ['content-type','content-range','accept-ranges','access-control-allow-origin','cache-control','etag','last-modified'].includes(key)));
        await writeFile(path.join(cacheRoot,sha256),body,{mode:0o600});
        const complete=!fixture.semanticOverpass||(response.status()===200&&!JSON.parse(body).remark);
        if(complete)cache[key] = { url:url.href, range:request.headers().range || '', status:response.status(), headers, sha256, bytes:body.length,...(fixture.semanticOverpass?{query:fixture.key[1],semanticOverpass:true}:{}) };
        else providerErrors.push({url:url.href,status:response.status(),error:'Incomplete Overpass response excluded from normal replay fixtures'});
        await route.fulfill({status:response.status(),headers,body}).catch(()=>{});
      } catch (error) {
        // Preserve unavailable upstream data as unavailable in both builds.
        if(!fixture.semanticOverpass)cache[key] = {url:url.href,aborted:true};
        providerErrors.push({url:url.href,error:String(error).split('\n')[0]});
        await route.abort('failed').catch(()=>{});
      }
    })();
    pending.add(work);
    try { await work; } finally { pending.delete(work); }
  });
  const page = await context.newPage();
  page.on('pageerror',error=>browserErrors.push(String(error)));
  page.on('console',message=>{if(message.type()==='error'&&/THREE|WebGL|shader/i.test(message.text()))browserErrors.push(message.text());});
  await configureStagingAppCheck(page,baseUrl);
  const patchedBundles=new Map();
  const readPatchedBundle=async bundle=>patchedBundles.get(bundle) ?? await readFile(path.join(roots[label],bundle),'utf8');
  if(['building-buffer-ownership','movement-repairs-2'].includes(process.env.WE3D_TRAVEL_ISOLATION)){
    assert.ok(manifests[label].buildId.includes('8940b944b163'));
    const bundle='/app/js/bundles/chunk-GDAHIAXI.js',original=await readPatchedBundle(bundle);
    let patched=original;
    for(const [before,after] of [
      ['constructor(t){this.values=new Float64Array(t),this.length=0}', 'constructor(t,ArrayType=Float64Array){this.values=new ArrayType(t),this.length=0}'],
      ['p=F=>new Hn(f*F),b={positions:p(3),normals:p(3),', 'p=(F,ArrayType=Float32Array)=>new Hn(f*F,ArrayType),b={positions:p(3),normals:p(3,Float64Array),'],
      ['let S=gn(b);if(!S){n.push(...g);continue}', 'let S=gn(b,{reuseStorage:true});if(!S){n.push(...g);continue}']
    ]){assert.equal(patched.split(before).length,2);patched=patched.replace(before,after);}
    const start=patched.indexOf('function gn(e){let t=a=>Array.isArray(a)||ArrayBuffer.isView(a);'),end=patched.indexOf('function Wi(',start);
    assert.ok(start>0&&end>start);
    patched=patched.slice(0,start)+buildMergedGeometry.toString().replace('function buildMergedGeometry','function gn').replaceAll('batchStorageView','Di')+patched.slice(end);
    (report.isolationPatches ||= []).push({bundle,originalSha256:digest(original),patchedSha256:digest(patched),scope:'Browser-only final building attribute storage and explicit buffer ownership; normals remain Float64 until masks are computed'});
    patchedBundles.set(bundle,patched);
  }
  if(process.env.WE3D_TRAVEL_ISOLATION==='provisional-road-profiles'){
    assert.ok(manifests[label].buildId.includes('8940b944b163'));
    const bundle='/app/js/bundles/chunk-GDAHIAXI.js',original=await readPatchedBundle(bundle);
    const before='ks.roads.push(K),ir(K,g,{surfaceBias:Lb}),';
    assert.equal(original.split(before).length,2);
    const patched=`const __provisionalProfile=(${createProvisionalProfileCompiler.toString()})(ir);\n`+original.replace(before,'ks.roads.push(K),__provisionalProfile(K,g,{surfaceBias:Lb}),');
    (report.isolationPatches ||= []).push({bundle,originalSha256:digest(original),patchedSha256:digest(patched),scope:'Browser-only demand compilation of initial road profiles; final publication unchanged'});
    patchedBundles.set(bundle,patched);
  }
  if(['camera-query','camera-and-nearby','movement-repairs','movement-repairs-2'].includes(process.env.WE3D_TRAVEL_ISOLATION)){
    assert.ok(manifests[label].buildId.includes('8940b944b163'),'Camera isolation patch targets the frozen 8940 package only');
    const bundle='/app/js/bundles/chunk-GDAHIAXI.js';
    const original=await readPatchedBundle(bundle);
    const start=original.indexOf('function ab(e,t,r,n=.38){'),end=original.indexOf('function zs(',start);
    assert.ok(start>0&&end>start&&end-start<700,'Unexpected frozen camera query');
    const replacement='function ab(e,t,r,n=.38){if(![e,t,r,n].every(Number.isFinite))return false;ed();return ('+cameraRoadSurfaceHit.toString()+')(Ky(e,r,32+n),e,t,r,n,er.sampleFeatureSurfaceY,ua,er.isSuppressedBaseRoad)}';
    const patched=original.slice(0,start)+replacement+original.slice(end);
    (report.isolationPatches ||= []).push({bundle,originalSha256:digest(original),patchedSha256:digest(patched),scope:'Browser-only camera query substitution; packaged files untouched'});
    patchedBundles.set(bundle,patched);
  }
  if(['nearby-vehicles','camera-and-nearby','movement-repairs','movement-repairs-2'].includes(process.env.WE3D_TRAVEL_ISOLATION)){
    assert.ok(manifests[label].buildId.includes('8940b944b163'));
    const bundle='/app/js/bundles/chunk-5GRUCEIS.js',original=await readPatchedBundle(bundle);
    const start=original.indexOf('nearbyVehicles(h,u=8){'),end=original.indexOf('nearbyPedestrians(',start);
    assert.ok(start>0&&end>start&&end-start<600,'Unexpected frozen nearby vehicle query');
    const replacement='nearbyVehicles(h,u=8){return ('+nearbyVehicleSnapshots.toString()+')(s,a,h||M(),u,T)},';
    const patched=original.slice(0,start)+replacement+original.slice(end);
    (report.isolationPatches ||= []).push({bundle,originalSha256:digest(original),patchedSha256:digest(patched),scope:'Browser-only nearby query substitution; packaged files untouched'});
    patchedBundles.set(bundle,patched);
  }
  if (process.env.WE3D_TRAVEL_ISOLATION === 'population-distance' || process.env.WE3D_TRAVEL_POPULATION_DISTANCE === '1') {
    assert.ok(manifests[label].buildId.includes('8940b944b163'));
    const bundle = '/app/js/bundles/chunk-5GRUCEIS.js';
    const original = await readPatchedBundle(bundle);
    let patched = original;
    for (const [before, after] of [
      ['W(r,t,l.sampleVehicleSurface)', 'W(r,t)'],
      ['W(r,t,a==="vehicle"?l.sampleVehicleSurface:null)', 'W(r,t)'],
      ['s.map(w=>W(w,a,c)).filter(Boolean)', 's.map(w=>W(w,a)).filter(Boolean)']
    ]) {
      assert.equal(patched.split(before).length, 2, 'Frozen distance-only call must match exactly once');
      patched = patched.replace(before, after);
    }
    (report.isolationPatches ||= []).push({bundle, originalSha256:digest(original), patchedSha256:digest(patched), scope:'Browser-only removal of wheel height queries from X/Z-only simulation decisions'});
    patchedBundles.set(bundle,patched);
  }
  if(['building-visibility-graph','movement-repairs','movement-repairs-2'].includes(process.env.WE3D_TRAVEL_ISOLATION)){
    assert.ok(manifests[label].buildId.includes('8940b944b163'));
    const bundle='/app/js/bundles/chunk-VPLOJOPM.js',original=await readPatchedBundle(bundle);
    const before='e.invalidateTraversalNetworks?.("editable_building_visibility");';
    assert.equal(original.split(before).length,2);
    const patched=original.replace(before,'');
    (report.isolationPatches ||= []).push({bundle,originalSha256:digest(original),patchedSha256:digest(patched),scope:'Browser-only removal of navigation invalidation from building visibility refresh'});
    patchedBundles.set(bundle,patched);
  }
  if(['profile-smoothing','profile-buffers','profile-storage','profile-scratch','movement-repairs','movement-repairs-2'].includes(process.env.WE3D_TRAVEL_ISOLATION)){
    assert.ok(manifests[label].buildId.includes('8940b944b163'));
    const bundle='/app/js/bundles/chunk-RKSDERS4.js',original=await readPatchedBundle(bundle);
    const before='let l=new Float64Array(i);for(let c=1;c<i.length-1;c+=1)l[c]=Z(i[c]*.45+(i[c-1]+i[c+1])*.275,e[c],n[c]);i.set(l)';
    const after='let previous=i[0];for(let c=1;c<i.length-1;c+=1){let current=i[c];i[c]=Z(current*.45+(previous+i[c+1])*.275,e[c],n[c]);previous=current}';
    assert.equal(original.split(before).length,2,'Frozen smoothing pass must match exactly once');
    let patched=process.env.WE3D_TRAVEL_ISOLATION==='profile-storage'?original:original.replace(before,after);
    if(process.env.WE3D_TRAVEL_ISOLATION!=='profile-smoothing'){
      for(const [from,to] of [
        ['h=new Float32Array(s.length),b=new Float32Array(s.length),S=new Float64Array(s.length),r=new Float64Array(s.length),x=new Float64Array(s.length),u=new Float32Array(s.length),d=new Float32Array(s.length),N=new Float32Array(s.length)',
         '__ground=new Float32Array(s.length*4),__scratch=new ArrayBuffer(s.length*28),h=__ground.subarray(0,s.length),b=__ground.subarray(s.length,s.length*2),S=new Float64Array(__scratch,0,s.length),r=new Float64Array(__scratch,s.length*8,s.length),x=new Float64Array(__scratch,s.length*16,s.length),u=new Float32Array(__scratch,s.length*24,s.length),d=__ground.subarray(s.length*2,s.length*3),N=__ground.subarray(s.length*3)'],
        ['let Y=new Float32Array(O),L=new Float32Array(O),G=', 'let __edges=new Float32Array(O.length*2),Y=__edges.subarray(0,O.length),L=__edges.subarray(O.length);Y.set(O);L.set(O);let G=']
      ]){assert.equal(patched.split(from).length,2,'Frozen profile storage must match exactly once');patched=patched.replace(from,to);}
    }
    if(process.env.WE3D_TRAVEL_ISOLATION==='profile-scratch'){
      const begin=patched.indexOf('function ue('),end=patched.indexOf('function fe(');
      assert.ok(begin>0&&end>begin);
      const temporary=patched.slice(begin,end);
      assert.equal(temporary.split('new Float64Array(').length-1,8);
      patched=patched.slice(0,begin)+temporary.replaceAll('new Float64Array(', '__profileScratch(')+patched.slice(end);
      for(const from of ['Float64Array.from(t,i=>-i)','Float64Array.from(e,i=>-i)','Float64Array.from(n,y=>-y)']){
        assert.equal(patched.split(from).length,2);
        patched=patched.replace(from,from.replace('Float64Array.from','__profileScratch'));
      }
      patched=patched.replace('__scratch=new ArrayBuffer(s.length*28)','__scratchView=__profileScratch(Math.ceil(s.length*28/8)),__scratch=__scratchView.buffer');
      for(const offset of ['0','s.length*8','s.length*16','s.length*24']){
        patched=patched.replace(`(__scratch,${offset},s.length)`,`(__scratch,__scratchView.byteOffset+${offset},s.length)`);
      }
      patched=`const __profileScratch=(${createFloat64ScratchAllocator.toString()})();\n`+patched;
    }
    (report.isolationPatches ||= []).push({bundle,originalSha256:digest(original),patchedSha256:digest(patched),scope:'Browser-only profile buffer repair: '+process.env.WE3D_TRAVEL_ISOLATION});
    patchedBundles.set(bundle,patched);
  }
  if(process.env.WE3D_PROFILE_SURFACE_USAGE==='1'){
    assert.equal(process.env.WE3D_TRAVEL_ISOLATION,undefined,'Usage probe is a standalone diagnostic');
    const bundle='/app/js/bundles/chunk-RKSDERS4.js',original=await readPatchedBundle(bundle);
    const before='return m.surfaceTerrainSampler=null,m}function Ot(';
    assert.equal(original.split(before).length,2);
    const patched=`const __surfaceUsage=(${createTransportProfileUsageProbe.toString()})();globalThis.__WE3D_SURFACE_USAGE__=__surfaceUsage.snapshot;\n`+original.replace(before,'return m.surfaceTerrainSampler=null,__surfaceUsage(m)}function Ot(');
    (report.isolationPatches ||= []).push({bundle,originalSha256:digest(original),patchedSha256:digest(patched),scope:'Sampled reads before replacement of compiled profiles'});
    patchedBundles.set(bundle,patched);
  }
  if(process.env.WE3D_PROFILE_BUFFERS==='1')await page.addInitScript(()=>{
    const NativeBuffer=ArrayBuffer,counts={},stacks=new Map();let active=true;
    for(const name of ['ArrayBuffer','Float32Array','Float64Array','Uint32Array','Uint16Array','Uint8Array','Int32Array','Int16Array','Int8Array','Uint8ClampedArray']){
      const Native=globalThis[name];counts[name]={count:0,bytes:0};
      globalThis[name]=new Proxy(Native,{construct(target,args,newTarget){
        const value=Reflect.construct(target,args,newTarget);
        if(active&&!(args[0] instanceof NativeBuffer)){
          const row=counts[name];row.count++;row.bytes+=value.byteLength;
          if(row.count%128===0){const stack=new Error().stack.split('\n').slice(2,7).join('\n'),key=name+':'+stack;const entry=stacks.get(key)||{type:name,stack,samples:0,sampledBytes:0};entry.samples++;entry.sampledBytes+=value.byteLength;stacks.set(key,entry);}
        }
        return value;
      }});
    }
    globalThis.__WE3D_BUFFER_PROFILE__=()=>{active=false;return {counts,stacks:[...stacks.values()].sort((a,b)=>b.samples-a.samples),scope:'Instrumented constructor counts; sampled stacks every 128 allocations; native/internal allocations excluded'};};
  });
  if(process.env.WE3D_TRAVEL_CAMERA_PATH==='1'){
    assert.ok(manifests[label].buildId.includes('8940b944b163'));
    const bundle='/app/js/bundles/app-entry-6HGHSO24.js',original=await readPatchedBundle(bundle);
    let patched=original;
    const changes=[
      ['function eL(e=1/60){','function eL(e=1/60){__cameraFrame++;'],
      ['ve.camera.position.x+=(p-ve.camera.position.x)*g,ve.camera.position.y+=(h-ve.camera.position.y)*g,ve.camera.position.z+=(b-ve.camera.position.z)*g', '__cameraFollow("plane-position",ve.camera.position,p,h,b,12,e)'],
      ['v.x+=(y-v.x)*x,v.y+=(w-v.y)*x,v.z+=(S-v.z)*x', '__cameraFollow("plane-look",v,y,w,S,14,e)'],
      ['A.camera.position.x+=(G-A.camera.position.x)*te,A.camera.position.y+=(B-A.camera.position.y)*te,A.camera.position.z+=(Y-A.camera.position.z)*te','__cameraFollow("drive-position",A.camera.position,G,B,Y,O.collided?42:UP,e,!O.collided&&!v)'],
      ['A.camera.userData.lookTarget.x+=(q-A.camera.userData.lookTarget.x)*te,A.camera.userData.lookTarget.y+=(V-A.camera.userData.lookTarget.y)*te,A.camera.userData.lookTarget.z+=(ee-A.camera.userData.lookTarget.z)*te','__cameraFollow("drive-look",A.camera.userData.lookTarget,q,V,ee,O.collided?42:UP,e,!O.collided&&!v)']
    ];
    for(const [before,after] of changes){assert.equal(patched.split(before).length,2,before);patched=patched.replace(before,after);}
    patched=`const __cameraTargets={};let __cameraFrame=0;const __smoothCamera=${smoothMovingCameraTarget.toString()};function __cameraFollow(name,position,x,y,z,rate,dt,continuous=true){const h=__cameraTargets[name]||(__cameraTargets[name]={});if(h.frame!==__cameraFrame-1)h.valid=false;__smoothCamera(position,h,x,y,z,rate,dt,continuous);h.frame=__cameraFrame;}\n`+patched;
    (report.isolationPatches ||= []).push({bundle,originalSha256:digest(original),patchedSha256:digest(patched),scope:'Browser-only moving-target camera integration; physical actor and collision constraints unchanged'});
    patchedBundles.set(bundle,patched);
  }
  for(const [bundle,body] of patchedBundles)await page.route(baseUrl+bundle,route=>route.fulfill({contentType:'text/javascript',body}));
  await page.addInitScript(() => {
    localStorage.setItem('worldExplorerPerfAutoQuality','0');
    localStorage.setItem('worldExplorerRenderQualityLevel','med');
    let seed=314159265;
    Math.random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
  });
  try {
    for (const state of (travel ? ['cold'] : ['cold','warm-data'])) {
      const started = Date.now();
      console.log(JSON.stringify({label,round,state,stage:'loading'}));
      const errorsBefore = browserErrors.length, missesBefore = misses.length;
      await page.goto(`${baseUrl}/app/?loc=custom&lat=39.2904&lon=-76.6122&lname=Baltimore&launch=earth&gm=free&mode=walk`,{waitUntil:'domcontentloaded',timeout:120000});
      const graphics = await page.evaluate(() => {
        const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl2');
        if(!gl)return 'unavailable';
        const ext=gl.getExtension('WEBGL_debug_renderer_info');
        const renderer=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
        gl.getExtension('WEBGL_lose_context')?.loseContext();return renderer;
      });
      requireHardwareGraphics(graphics);
      await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__===true,null,{timeout:120000,polling:500});
      await page.evaluate(async()=>{globalThis.__WE3D_READY_CONTEXT__=(await import('/app/js/shared-context.js?v=55')).ctx;});
      if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
      const loadCdp=process.env.WE3D_PROFILE_LOAD?await context.newCDPSession(page):null;
      if(loadCdp)await loadCdp.send('HeapProfiler.startSampling',{samplingInterval:131072,includeObjectsCollectedByMajorGC:process.env.WE3D_PROFILE_LOAD!=='surviving',includeObjectsCollectedByMinorGC:process.env.WE3D_PROFILE_LOAD!=='surviving'});
      await page.locator('#globeSelectorStartBtn').click();
      await page.waitForFunction(()=>{const d=globalThis.__WE3D_READY_CONTEXT__;return d?.gameStarted&&d.worldLoading===false&&d.buildings?.length>0&&!document.getElementById('loading')?.classList.contains('show');},null,{timeout:300000,polling:500});
      const playableMs = Date.now()-started;
      if(process.env.WE3D_CAPTURE_PROFILE_HASH==='1'){
        assert.equal(process.env.WE3D_COMPARISON_LOAD_ONLY,'1','Profile fingerprinting is excluded from timing runs');
        const profiles=await page.evaluate(async()=>{
          const {ctx}=await import('/app/js/shared-context.js?v=55');
          const features=[...ctx.roads,...ctx.linearFeatures].sort((a,b)=>String(a.sourceFeatureId||'').localeCompare(String(b.sourceFeatureId||'')));
          const blocks=[];
          for(let i=0;i<features.length;i+=128){
            const data=features.slice(i,i+128).map(f=>({id:f.sourceFeatureId,model:f.transportSurfaceModel}));
            const bytes=new TextEncoder().encode(JSON.stringify(data));
            const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
            blocks.push({start:i,count:data.length,hash});
          }
          return {count:features.length,blocks,scope:'All published road and linear profile fields, JSON value fingerprint; load-only functional comparison'};
        });
        await writeFile(path.join(output,`${label}-${round}-profile-hashes.json`),JSON.stringify(profiles,null,2));
      }
      if(process.env.WE3D_PROFILE_SURFACE_USAGE==='1')await writeFile(path.join(output,`${label}-${round}-profile-usage.json`),JSON.stringify(await page.evaluate(()=>globalThis.__WE3D_SURFACE_USAGE__()),null,2));
      if(process.env.WE3D_PROFILE_BUFFERS==='1')await writeFile(path.join(output,`${label}-${round}-buffer-constructors.json`),JSON.stringify(await page.evaluate(()=>globalThis.__WE3D_BUFFER_PROFILE__()),null,2));
      if(loadCdp){await writeFile(path.join(output,`${label}-${round}-load-allocation.json`),JSON.stringify(await loadCdp.send('HeapProfiler.stopSampling')));await loadCdp.detach();}
      console.log(JSON.stringify({label,round,state,stage:'playable',playableMs,misses:misses.length}));
      const scene = await page.evaluate(async()=>{
        const {ctx}=await import('/app/js/shared-context.js?v=55');
        ctx.setTimeOfDay?.('day');
        ctx.setWeatherMode?.('clear');
        const worldCounts={buildings:ctx.buildings.length,buildingMeshes:ctx.buildingMeshes.length,landuseMeshes:ctx.landuseMeshes.length,roadMeshes:ctx.roadMeshes.length,roads:ctx.roads.length,terrainTiles:ctx.terrainTileCache.size};
        const ids=(ctx.buildings||[]).map(b=>b.sourceBuildingId||b.id||'').sort();
        const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(ids))))].map(n=>n.toString(16).padStart(2,'0')).join('');
        return {quality:ctx.getDynamicBudgetState?.(),renderQuality:ctx.renderQualityLevel,pixelRatio:ctx.renderer.getPixelRatio(),buildingIdentitiesSha256:hash,buildingCount:ids.length,buildingIds:ids,worldCounts};
      });
      await writeFile(path.join(output,`${label}-${round}-${state}-building-ids.json`),JSON.stringify(scene.buildingIds));
      delete scene.buildingIds;
      assert.equal(scene.quality.auto,false);assert.equal(scene.quality.tier,'balanced');assert.equal(scene.renderQuality,'med');assert.equal(scene.pixelRatio,1);
      if(!record)assert.equal(misses.length,missesBefore,'Unrecorded provider request before timing; capture fixtures first.');
      if(!travel)await page.waitForTimeout(5000);
      const modes = process.env.WE3D_COMPARISON_LOAD_ONLY==='1'?[]:travel ? await measureTravel(page,label,round,state) : [await measure(page,'walk'),await measure(page,'drive')];
      await page.screenshot({path:path.join(output,`${label}-${round}-${state}.png`)});
      report.trials.push({label,round,state,playableMs,scene,modes,providerMisses:misses.slice(missesBefore),browserErrors:browserErrors.slice(errorsBefore)});
      await save();
      if(!record)assert.equal(misses.length,missesBefore,'Unrecorded public provider request; stop rather than measure fallback data.');
      assert.equal(browserErrors.length,errorsBefore,'Runtime error invalidates the comparison.');
      console.log(JSON.stringify({label,round,state,playableMs,modes:modes.map(m=>({mode:m.mode,fps:m.fps,distance:m.distance})),misses:misses.length}));
    }
  } catch(error) {
    await page.screenshot({path:path.join(output,`${label}-${round}-failure.png`)}).catch(()=>{});
    report.lastFailure={label,round,message:String(error),misses,browserErrors,ui:await page.evaluate(()=>document.body.innerText.slice(-3000)).catch(()=>null)};
    throw error;
  } finally {
    await context.close();
    await Promise.allSettled([...pending]);
    if(record)await writeFile(indexFile,JSON.stringify(cache,null,2),{mode:0o600});
    await browser.close();await server.close();
    report.providerErrors ||= [];report.providerErrors.push(...providerErrors);await save();
  }
}
try {
  for(let round=0;round<rounds;round++)for(const label of (process.env.WE3D_COMPARISON_LABELS?.split(',') || (round%2?['candidate','live']:['live','candidate'])))await trial(label,round);
  report.completed=true;
  report.providerFixtureIndexSha256=digest(await readFile(indexFile));
  report.validReplay=!record&&report.trials.every(t=>!t.providerMisses.length&&!t.browserErrors.length);
  report.pairs=[];
  if(!record&&!travel)for(let round=0;round<rounds;round++)for(const state of ['cold','warm-data']){
    const live=report.trials.find(t=>t.label==='live'&&t.round===round&&t.state===state);
    const candidate=report.trials.find(t=>t.label==='candidate'&&t.round===round&&t.state===state);
    report.pairs.push({round,state,matchingBuildingIdentities:live.scene.buildingIdentitiesSha256===candidate.scene.buildingIdentitiesSha256,
      loadRatio:candidate.playableMs/live.playableMs,modes:candidate.modes.map((m,i)=>({mode:m.mode,fpsRatio:m.fps/live.modes[i].fps,p95Ratio:m.p95FrameMs/live.modes[i].p95FrameMs,distanceRatio:m.distance/live.modes[i].distance,startDelta:Math.hypot(m.startPosition.x-live.modes[i].startPosition.x,m.startPosition.z-live.modes[i].startPosition.z),endDelta:Math.hypot(m.endPosition.x-live.modes[i].endPosition.x,m.endPosition.z-live.modes[i].endPosition.z)}))});
  }
  report.improvementEstablished=!travel&&report.validReplay&&report.pairs.every(p=>p.matchingBuildingIdentities&&p.loadRatio<.95&&p.modes.every(m=>m.fpsRatio>1.05&&m.p95Ratio<=1.03&&m.distanceRatio>.95&&m.distanceRatio<1.05&&m.startDelta<.5&&m.endDelta<3));
  await save();
  if(!record)assert.equal(report.validReplay,true,'Replay had new/missing provider data or browser errors; comparison invalid.');
} catch(error){report.failure=String(error.stack||error);await save();throw error;}
