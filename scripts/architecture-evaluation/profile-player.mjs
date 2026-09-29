import {chromium} from 'playwright';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {startStaticServer} from '../verification/static-server.mjs';
import {configureStagingAppCheck} from '../verification/staging-app-check.mjs';
import {requirePerformanceHost,requireHardwareGraphics} from '../verification/performance-host.mjs';
import {sampleFrameWindow} from '../verification/frame-window.mjs';
const root=process.env.WE3D_PROFILE_ROOT||process.cwd();
const label=process.env.WE3D_PROFILE_LABEL||'baseline-pilot';
const location={lat:Number(process.env.WE3D_PROFILE_LAT??39.2904),lon:Number(process.env.WE3D_PROFILE_LON??-76.6122),name:process.env.WE3D_PROFILE_LOCATION||'Baltimore'};
if(!Number.isFinite(location.lat)||!Number.isFinite(location.lon)||Math.abs(location.lat)>90||Math.abs(location.lon)>180)throw Error('Invalid profile location');
const retentionCycles=Math.min(3,Math.max(0,Number(process.env.WE3D_RETENTION_CYCLES)||0));
const out=`output/architecture-evaluation/${label}`;await mkdir(out,{recursive:true});
const report={label,source:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),host:requirePerformanceHost(),quality:'med fixed; auto-quality disabled',viewport:{width:1280,height:800},clock:'normal RAF; no advanceTime',location,samples:[],errors:[],complete:false};
report.runtimeDiffSha256=createHash('sha256').update(execFileSync('git',['diff','HEAD','--','app'],{cwd:root})).digest('hex');
try {report.artifact=JSON.parse(await readFile(`${root}/build-manifest.json`,'utf8'));} catch {}
const save=()=>writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');
const server=await startStaticServer({rootDir:root,ports:[4491,4492]});let browser;
let deadline;try{
 browser=await chromium.launch({headless:false,channel:'chrome'});
 deadline=setTimeout(()=>browser.close().catch(()=>{}),retentionCycles?1200000:process.env.WE3D_PROFILE_ENVIRONMENTS==='1'?720000:420000);
 const context=await browser.newContext({viewport:report.viewport,deviceScaleFactor:1});const page=await context.newPage();
 await configureStagingAppCheck(page,`http://127.0.0.1:${server.port}`);
 await page.addInitScript(()=>{globalThis.__architectureLongTasks=[];globalThis.__architectureLongTasksDropped=0;try{new PerformanceObserver(list=>{for(const e of list.getEntries()){if(globalThis.__architectureLongTasks.length<10000)globalThis.__architectureLongTasks.push({startTime:e.startTime,duration:e.duration});else globalThis.__architectureLongTasksDropped++;}}).observe({type:'longtask',buffered:true});}catch{}localStorage.setItem('worldExplorerRenderQualityLevel','med');localStorage.setItem('worldExplorerPerfAutoQuality','0');});
 page.on('pageerror',e=>report.errors.push(String(e.message).replace(/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/gi,'[id]')));
 const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
 const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x=>[x.name,x.value]));
 const start=Date.now();console.log('profile: title');
 await page.goto(`http://127.0.0.1:${server.port}/app/?loc=custom&lat=${location.lat}&lon=${location.lon}&lname=${encodeURIComponent(location.name)}&launch=earth&gm=free&mode=walk`,{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__===true,null,{timeout:120000});
 report.titleReadyMs=Date.now()-start;report.titleMetrics=await metrics();
 report.graphics=await page.evaluate(()=>{const c=document.createElement('canvas'),gl=c.getContext('webgl2')||c.getContext('webgl');const e=gl.getExtension('WEBGL_debug_renderer_info');const renderer=e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);gl.getExtension('WEBGL_lose_context')?.loseContext();return renderer;});requireHardwareGraphics(report.graphics);await save();
 if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
 await page.waitForSelector('#globeSelectorStartBtn',{state:'visible',timeout:30000});
 if(process.env.WE3D_PROFILE_COMPILER==='1'){await cdp.send('Profiler.enable');await cdp.send('Profiler.start');}
 if(process.env.WE3D_PROFILE_COMPILE_ALLOCATIONS==='1')await cdp.send('HeapProfiler.startSampling',{samplingInterval:131072,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});
 console.log('profile: Earth loading');const loadStart=Date.now();await page.locator('#globeSelectorStartBtn').click();
 await page.waitForSelector('#loading.show',{timeout:30000});
 await page.waitForFunction(()=>!document.querySelector('#loading.show'),null,{timeout:240000});
 await page.waitForFunction(()=>globalThis.getWorldExplorerRuntimeDiagnostics?.().gameStarted===true,null,{timeout:30000,polling:1000});
 report.firstPlayableMs=Date.now()-loadStart;
 if(process.env.WE3D_PROFILE_COMPILE_ALLOCATIONS==='1'){const allocation=await cdp.send('HeapProfiler.stopSampling');await writeFile(`${out}/compilation-allocations.json`,JSON.stringify(allocation));report.firstPlayableTimingScope='sampled allocation profiler includes collected objects; do not compare with uninstrumented latency';}
 if(process.env.WE3D_PROFILE_DAY==='1'){for(let i=0;i<6&&await page.locator('#quickTimeOfDay').getAttribute('data-mode')!=='day';i++)await page.locator('#quickTimeOfDay').click();report.manualSkyMode=await page.locator('#quickTimeOfDay').getAttribute('data-mode');if(report.manualSkyMode!=='day')throw Error('Day preset did not activate');}
 if(process.env.WE3D_PROFILE_COMPILER==='1'){const {profile}=await cdp.send('Profiler.stop');await writeFile(`${out}/compilation.cpuprofile`,JSON.stringify(profile));report.firstPlayableTimingScope='sampled profiler enabled; do not compare as uninstrumented load latency';}
 await page.waitForTimeout(2500);
 report.initial=await page.evaluate(()=>{const d=getWorldExplorerRuntimeDiagnostics();return {worldCounts:d.worldCounts,worldLoad:d.worldLoad,renderer:d.renderer,rendererOwners:d.rendererOwners,runtimeKernel:d.runtimeKernel,transportCompilation:d.transportCompilation};});await save();
 if(process.env.WE3D_PROFILE_SCENE_GRAPH==='1'){
  report.sceneGraph=await page.evaluate(async()=>{
   const {ctx}=await import('/app/js/shared-context.js?v=55');
   return ctx.scene.children.map(root=>{
    let nodes=0,automaticMatrices=0,meshes=0,bones=0;
    root.traverse(o=>{nodes++;automaticMatrices+=o.matrixAutoUpdate?1:0;meshes+=o.isMesh?1:0;bones+=o.isBone?1:0;});
    return {name:root.name,type:root.type,visible:root.visible,nodes,automaticMatrices,meshes,bones};
   }).sort((a,b)=>b.nodes-a.nodes).slice(0,30);
  });await save();
 }

 if(process.env.WE3D_CAPTURE_WORLD==='1'){
  const projection=await page.evaluate(async()=>{
   const {ctx}=await import('/app/js/shared-context.js?v=55');
   const {projectPublishedLocation}=await import('/scripts/architecture-evaluation/export-world-projection.js');
   return projectPublishedLocation(ctx);
  });
  await writeFile(`${out}/world-projection.json`,JSON.stringify(projection));
  report.portableProjection={buildings:projection.buildings.length,roads:projection.roads.length,entrances:projection.entrances.length,pois:projection.pois.length,water:projection.water.length};await save();
 }
 // Snapshot existing compiler records once, outside timed windows. No new world authority.
 if(process.env.WE3D_CAPTURE_PROFILES==='1'){
  const profiles=await page.evaluate(async()=>{
   const {ctx}=await import('/app/js/shared-context.js?v=55');
   const seen=new Set(),records=[];
   for(const feature of ctx.roads||[]){
    const m=feature?.transportSurfaceModel;if(!m||seen.has(m))continue;seen.add(m);
    records.push({id:String(feature.sourceId||feature.id||records.length),width:m.width,distances:Array.from(m.distances||[]),centerHeights:Array.from(m.centerHeights||[]),leftHeights:Array.from(m.leftHeights||[]),rightHeights:Array.from(m.rightHeights||[])});
   }
   return {authority:'road.transportSurfaceModel compiled by existing transport compiler',records};
  });
  await writeFile(`${out}/transport-profiles.json`,JSON.stringify(profiles));
  report.capturedTransportModels=profiles.records.length;await save();
 }
 if(process.env.WE3D_CAPTURE_RDT==='1'){
  const records=await page.evaluate(async()=>{
   const {ctx}=await import('/app/js/shared-context.js?v=55');
   return(ctx.buildings||[]).map(b=>({sourceBuildingId:b.sourceBuildingId,centerX:b.centerX,centerZ:b.centerZ,minX:b.minX,maxX:b.maxX,minZ:b.minZ,maxZ:b.maxZ,pts:b.pts?.map(p=>({x:p.x,z:p.z}))}));
  });await writeFile(`${out}/capture-building-inputs.json`,JSON.stringify(records));report.capturedBuildingRecords=records.length;
 }
 if(process.env.WE3D_PROFILE_ALLOCATIONS==='1'){
  console.log('profile: sampled allocations (separate window)');
  await cdp.send('HeapProfiler.startSampling',{samplingInterval:32768});await page.waitForTimeout(10000);
  const allocation=await cdp.send('HeapProfiler.stopSampling');await writeFile(`${out}/walking-allocations.json`,JSON.stringify(allocation));
 }
 async function sample(id,key=null,duration=15000){console.log(`profile: ${id}`);const before=await metrics();if(key){await page.mouse.click(640,400);await page.keyboard.down(key);}let raw;try{raw=await page.evaluate(sampleFrameWindow,duration);}finally{if(key)await page.keyboard.up(key);}const after=await metrics(),s=[...raw.deltas].sort((a,b)=>a-b);report.samples.push({id,elapsedMs:raw.elapsedMs,frames:s.length,meanMs:raw.elapsedMs/s.length,p95Ms:s[Math.ceil(s.length*.95)-1],p99Ms:s[Math.ceil(s.length*.99)-1],start:raw.startPosition,end:raw.endPosition,distance:raw.startPosition&&raw.endPosition?Math.hypot(raw.endPosition.x-raw.startPosition.x,raw.endPosition.z-raw.startPosition.z):null,maxMs:s.at(-1),fps:s.length*1000/raw.elapsedMs,drawCallBreakdown:raw.diagnostics.drawCallBreakdown,renderer:raw.diagnostics.renderer,rendererOwners:await page.evaluate(()=>getWorldExplorerRuntimeDiagnostics().rendererOwners),worldCounts:raw.diagnostics.worldCounts,jsHeapUsedBytes:after.JSHeapUsedSize,scriptSeconds:after.ScriptDuration-before.ScriptDuration,taskSeconds:after.TaskDuration-before.TaskDuration,dom:await cdp.send('Memory.getDOMCounters')});await save();}
 async function travelCpu(id,key){
  console.log(`profile: ${id} CPU (separate window)`);
  await cdp.send('Profiler.enable');await cdp.send('Profiler.start');await page.keyboard.down(key);
  try{await page.waitForTimeout(10000);}finally{await page.keyboard.up(key);const {profile}=await cdp.send('Profiler.stop');await writeFile(`${out}/${id}.cpuprofile`,JSON.stringify(profile));}
 }
 if(process.env.WE3D_PROFILE_CONTROLLED_TRAVEL==='1'){
  report.routeScope='Repeatable scenario setup; normal physics and keyboard input thereafter. Driving 100 m, flight 1500 m above the same city; no climb-key loops.';
  async function populationPresentation(){return page.evaluate(async()=>{
   const {ctx}=await import('/app/js/shared-context.js?v=55');let nodes=0,bones=0;
   ctx.earthSceneRoot?.traverse(o=>{nodes++;bones+=o.isBone?1:0;});
   return {nodes,bones,detailedNpcs:ctx.urbanSandboxRuntime?.npcs?.length,actor:ctx.activeEarthActorPosition?.()};
  });}
  report.populationPresentation={before:await populationPresentation()};
  for(const mode of ['drive','plane']){
   await page.locator('#travelBtn').click();await page.locator(mode==='drive'?'#fDriving':'#fPlane').click();
   await page.mouse.click(640,400);await page.waitForTimeout(1500);
   for(let repeat=0;repeat<2;repeat++){
    await page.evaluate(async mode=>{
     const {ctx}=await import('/app/js/shared-context.js?v=55');
     const actor=mode==='drive'?ctx.car:ctx.planeMode;
     const x=4.854101966249685,z=3.526711513754839;
     Object.assign(actor,{x,z,angle:0,yaw:0,pitch:0,roll:0,pitchRate:0,rollRate:0,yawRate:0,lookYawOffset:0,cameraYaw:0,cameraPitch:0,cameraLookTimer:0,barrelRollActive:false,flightPathAngle:0,climbRate:0,turnRate:0,angleOfAttack:0});
     if(mode==='drive')Object.assign(actor,{y:ctx.GroundHeight.carCenterY(x,z),speed:0,vFwd:0,vLat:0,vx:0,vy:0,vz:0,onGround:true,isAirborne:false});
     else Object.assign(actor,{y:300,speed:80,horizontalSpeed:80,vx:0,vy:0,vz:80,throttle:1,airborne:true,stalled:false});
     globalThis.__TRAVEL_PROFILE_ACTOR__=actor;
    },mode);
    const key=mode==='drive'?'w':'Space';await page.keyboard.down(key);let raw;
    try{raw=await page.evaluate(sampleFrameWindow,{durationMs:30000,targetDistance:mode==='drive'?100:1500,actorKey:'__TRAVEL_PROFILE_ACTOR__'});}finally{await page.keyboard.up(key);}
    const sorted=[...raw.deltas].sort((a,b)=>a-b);
    report.samples.push({id:`controlled-${mode}-${repeat}`,routeComplete:raw.routeComplete,elapsedMs:raw.elapsedMs,fps:sorted.length*1000/raw.elapsedMs,p95Ms:sorted[Math.ceil(sorted.length*.95)-1],p99Ms:sorted[Math.ceil(sorted.length*.99)-1],maxMs:sorted.at(-1),start:raw.startPosition,end:raw.endPosition,renderer:raw.diagnostics.renderer,worldCounts:raw.diagnostics.worldCounts});await save();
    await page.screenshot({path:`${out}/controlled-${mode}-${repeat}.png`});
    if(!raw.routeComplete)throw Error(`${mode} failed to complete controlled route`);
   }
   report.populationPresentation[mode]=await populationPresentation();await save();
  }
  if(process.env.WE3D_PROFILE_RETURN_GROUND==='1'){
   await page.locator('#travelBtn').click();await page.locator('#fDriving').click();
   // Return to the original scenario origin to test detail restoration, rather
   // than assuming the end of an aerial route contains pedestrian activity.
   await page.evaluate(async()=>{
    const {ctx}=await import('/app/js/shared-context.js?v=55');const x=4.854101966249685,z=3.526711513754839;
    Object.assign(ctx.car,{x,z,y:ctx.GroundHeight.carCenterY(x,z),speed:0,vFwd:0,vLat:0,vx:0,vy:0,vz:0});
   });
   await page.waitForFunction(async()=> (await import('/app/js/shared-context.js?v=55')).ctx.urbanSandboxRuntime?.npcs?.length>0,null,{timeout:15000,polling:500});
   await page.waitForTimeout(1500);
   report.populationPresentation.returnGround=await populationPresentation();
   await page.screenshot({path:`${out}/return-ground.png`});await save();
  }
 }
 if(process.env.WE3D_PROFILE_SKIP_EARTH_WINDOWS!=='1' && process.env.WE3D_PROFILE_CONTROLLED_TRAVEL!=='1'){
 await sample('walking-stationary');await sample('walking-moving','w');
 console.log('profile: sampled CPU (separate from frame measurements)');await cdp.send('Profiler.enable');await cdp.send('Profiler.start');await page.waitForTimeout(10000);const {profile}=await cdp.send('Profiler.stop');await writeFile(`${out}/walking.cpuprofile`,JSON.stringify(profile));
 await page.screenshot({path:`${out}/walking.png`});
 await page.locator('#travelBtn').click();await page.locator('#fDriving').click();await page.waitForTimeout(1500);await sample('driving-moving','w');await page.screenshot({path:`${out}/driving.png`});
 if(process.env.WE3D_PROFILE_TRAVEL_CPU==='1')await travelCpu('driving','w');
 }
 if(process.env.WE3D_PROFILE_FLIGHT==='1'){
  await page.locator('#travelBtn').click();await page.locator('#fPlane').click();await page.mouse.click(640,400);
  const pose=()=>page.evaluate(async()=>(await import('/app/js/shared-context.js?v=55')).ctx.getPlaneSnapshot());
  const before=await pose();await page.keyboard.down('Space');await page.keyboard.down('s');
  try{await page.waitForFunction(async()=> (await import('/app/js/shared-context.js?v=55')).ctx.getPlaneSnapshot().pitch>=.12,null,{timeout:5000,polling:'raf'});}finally{await page.keyboard.up('s');await page.keyboard.up('Space');}
  const after=await pose();report.flightPreparation={before,after};
  if(!(after.pitch>.05&&after.y>before.y&&after.throttle>before.throttle))throw Error('Normal flight input did not establish climb');
  await sample('plane-sustained','Space',90000);await page.screenshot({path:`${out}/plane.png`});
  if(process.env.WE3D_PROFILE_TRAVEL_CPU==='1')await travelCpu('plane','Space');
 }
 if(process.env.WE3D_VERIFY_NOTICE_SPACE==='1'){
  await page.mouse.click(640,400);
  await page.waitForSelector('#worldSelectionNotice:not([hidden])',{timeout:10000});
  await page.locator('#travelBtn').click();
  report.noticeSuppressedWhileMenuOpen=await page.locator('#worldSelectionNotice').evaluate(el=>getComputedStyle(el).display==='none');
  if(!report.noticeSuppressedWhileMenuOpen)throw Error('Selected-place card still obstructs Travel');
  await page.screenshot({path:`${out}/travel-menu.png`});await page.locator('#fSpaceRocket').click();
  await page.waitForFunction(()=>JSON.parse(globalThis.render_game_to_text?.()||'{}').modes?.space===true,null,{timeout:120000});
  report.noticeSpaceTransitionPassed=true;await page.waitForTimeout(3000);await page.screenshot({path:`${out}/space-after-menu.png`});await save();
 }
 if(process.env.WE3D_PROFILE_ENVIRONMENTS==='1'){
  for(const [id,action,ready] of [
   ['ocean','fOceanMode',()=>JSON.parse(globalThis.render_game_to_text?.()||'{}').modes?.ocean===true],
   ['earth-return','fEarthMode',()=>{const s=JSON.parse(globalThis.render_game_to_text?.()||'{}');return s.environment==='EARTH'&&!s.worldLoading&&!s.modes?.ocean;}],
   ['space','fSpaceRocket',()=>JSON.parse(globalThis.render_game_to_text?.()||'{}').modes?.space===true]
  ]){
   console.log(`profile: enter ${id}`);await page.locator('#travelBtn').click();await page.locator(`#${action}`).click();
   await page.waitForFunction(ready,null,{timeout:120000});await page.waitForTimeout(3000);
   const expectedOwner=id==='earth-return'?'main':id;
   const actualOwner=await page.evaluate(()=>getWorldExplorerRuntimeDiagnostics().rendererOwners);
   if(actualOwner.activeOwner!==expectedOwner||!actualOwner.active)throw Error(`Wrong renderer owner for ${id}`);
   if(id!=='earth-return'){
    const stale=await page.evaluate(()=>({selection:!!document.querySelector('#worldSelectionNotice:not([hidden])'),civic:!!document.querySelector('#urbanCivicStatus.show')}));
    if(stale.selection||stale.civic)throw Error(`Earth UI remained active in ${id}`);
   }
   await sample(`${id}-stationary`);await page.screenshot({path:`${out}/${id}.png`});
  }
 }
 await page.locator('#mainMenuBtn').click();await page.waitForTimeout(5000);report.menuMetrics=await metrics();report.menuDiagnostics=await page.evaluate(()=>{const d=getWorldExplorerRuntimeDiagnostics();return {gameStarted:d.gameStarted,worldCounts:d.worldCounts,renderer:d.renderer,rendererOwners:d.rendererOwners,lastEarthWorldRelease:d.lastEarthWorldRelease};});
 if(retentionCycles){
  report.retention=[];
  for(let cycle=0;cycle<retentionCycles;cycle++){
   console.log(`profile: retention ${cycle+1}`);
   if(cycle){
    await page.locator('#globeSelectorStartBtn').click();await page.waitForSelector('#loading.show',{timeout:30000});
    await page.waitForFunction(()=>!document.querySelector('#loading.show')&&getWorldExplorerRuntimeDiagnostics().gameStarted,null,{timeout:240000});
    await page.waitForTimeout(3000);await page.locator('#mainMenuBtn').click();
   }
   const phases=[];
   for(const delay of [0,5000,25000]){
    if(delay)await page.waitForTimeout(delay);
    phases.push({idleSinceFirstSnapshotMs:phases.length?phases.length===1?5000:30000:0,metrics:await metrics(),dom:await cdp.send('Memory.getDOMCounters'),diagnostics:await page.evaluate(()=>{const d=getWorldExplorerRuntimeDiagnostics();return{gameStarted:d.gameStarted,worldCounts:d.worldCounts,renderer:d.renderer,rendererOwners:d.rendererOwners,lastEarthWorldRelease:d.lastEarthWorldRelease};})});
   }
   await cdp.send('HeapProfiler.collectGarbage');
   report.retention.push({cycle:cycle+1,phases,postGc:await metrics(),note:cycle===0?'Initial first snapshot follows existing five-second menu settle':'Subsequent first snapshot immediately after Main Menu click; timing records actual observation, not release completion'});await save();
  }
 }
 report.longTasks=await page.evaluate(()=>({entries:globalThis.__architectureLongTasks||[],dropped:globalThis.__architectureLongTasksDropped||0,scope:'Observer long tasks above 50 ms; renderer/GPU and asynchronous waits are not measured as blocking.'}));
 report.complete=true;console.log('profile: complete');
}catch(e){report.failure=String(e.message);console.log('profile: failed',report.failure);}finally{clearTimeout(deadline);await save();await browser?.close().catch(()=>{});await server.close();}
if(!report.complete)process.exitCode=1;
