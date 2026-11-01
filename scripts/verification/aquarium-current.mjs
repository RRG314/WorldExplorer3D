import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
import {stepGameplayKeys} from './gameplay-simulation.mjs';
import {collectBrowserGraphicsErrors} from './browser-graphics-errors.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';
import {resolve} from 'node:path';
import {artifactIdentity} from './artifact-identity.mjs';
import {requirePerformanceHost,requireHardwareGraphics} from './performance-host.mjs';
import {sampleFrameWindow} from './frame-window.mjs';
import {frameHitches} from './frame-hitches.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
import {measureRetainedHeap} from './retained-heap.mjs';
const measured=process.argv.includes('--performance'),performanceHost=measured?requirePerformanceHost():null;
const performanceBudgets=JSON.parse(await readFile('config/performance-budgets.json','utf8'));
const servedRoot=resolve(process.env.WE3D_VERIFY_ROOT||process.cwd());
const faults=process.argv.includes('--faults');
const out=process.env.WE3D_AQUARIUM_OUTPUT||'output/aquarium-expansion/current-visit';await mkdir(out,{recursive:true});
const server=await startStaticServer({rootDir:servedRoot,ports:[4496,4497]});const ownedBrowser=await chromium.launchServer({channel:'chrome',headless:true,args:measured?[]:['--js-flags=--max-old-space-size=1536']});const browser=await chromium.connect(ownedBrowser.wsEndpoint());const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1}),page=await context.newPage(),errors=[],report={ok:false,evidence:`Full ${servedRoot===process.cwd()?'mutable-source':'saved-package'} game with ordinary entry, keyboard movement and actual local assets; not hosted release or physical-phone approval.`,artifactIdentity:artifactIdentity(process.cwd(),servedRoot),checks:[],entryTiming:{},cycles:[]};
collectBrowserGraphicsErrors(page,errors);page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='warning'&&/Interior|aquarium/i.test(m.text()))report.warnings=(report.warnings||[]).concat(m.text());});
const check=(name,value)=>{report.checks.push({name,passed:!!value});console.log('[aquarium]',name,value?'PASS':'FAIL');assert.ok(value,name);};
const cdp=measured?await context.newCDPSession(page):null;if(cdp)await cdp.send('Performance.enable');
const allocationProfile=measured&&process.argv.includes('--profile-allocations');
if(allocationProfile)await cdp.send('HeapProfiler.startSampling',{samplingInterval:131072});
report.performance=measured?{host:performanceHost,scope:'Three 10-second live RAF turning windows in Pavilion, lower reef gallery and reentry with ordinary Chrome memory settings; not sustained outdoor or physical-phone evidence.',windows:[]}:null;
async function measureVenue(label){
 if(!measured)return;
 const profile=process.argv.includes('--profile-frames');
 if(profile){await cdp.send('Profiler.enable');await cdp.send('Profiler.start');}
 const rendererName=await page.evaluate(()=>{const gl=venueCtx.renderer.getContext(),e=gl.getExtension('WEBGL_debug_renderer_info');return gl.getParameter(e?e.UNMASKED_RENDERER_WEBGL:gl.RENDERER);});requireHardwareGraphics(rendererName);
 await page.evaluate(()=>{globalThis.__aquariumMeasuredActor=venueCtx.Walk.state.walker;});
 let sample;await page.keyboard.down('ArrowLeft');try{sample=await page.evaluate(sampleFrameWindow,{durationMs:10000,actorKey:'__aquariumMeasuredActor',collectDiagnostics:false});}finally{await page.keyboard.up('ArrowLeft');}
 if(profile){const {profile:cpu}=await cdp.send('Profiler.stop');await cdp.send('Profiler.disable');await writeFile(`${out}/${label}.cpuprofile`,JSON.stringify(cpu));report.performance.profiled=true;report.performance.profiles=(report.performance.profiles||[]).concat({label,samples:cpu.samples?.length,top:cpu.nodes.filter(n=>n.hitCount>0).sort((a,b)=>b.hitCount-a.hitCount).slice(0,30).map(n=>({function:n.callFrame.functionName,file:n.callFrame.url.split('?')[0].split('/').at(-1),hits:n.hitCount}))});}
 // Full diagnostics rebuild mapped-building and structure inventories. Keep
 // that allocation out of timed journeys; read the same renderer counters.
 const resources=await page.evaluate(()=>{delete globalThis.__aquariumMeasuredActor;const i=venueCtx.renderer.info;return {calls:i.render.calls,triangles:i.render.triangles,programs:i.programs.length,geometries:i.memory.geometries,textures:i.memory.textures};});
 const metrics=await cdp.send('Performance.getMetrics'),heapBytes=metrics.metrics.find(m=>m.name==='JSHeapUsedSize')?.value||0,b=performanceBudgets.desktopTier.budgets;
 const ordered=[...sample.deltas].sort((a,b)=>a-b),p=q=>ordered[Math.min(ordered.length-1,Math.ceil(ordered.length*q)-1)]||0;
 const w={label,rendererName,heapBytes,resources,averageFps:sample.deltas.length/(sample.elapsedMs/1000),p95FrameMs:p(.95),p99FrameMs:p(.99),hitches:frameHitches(sample.deltas,performanceBudgets.desktopTier.hitches)};
 w.checks={averageFps:w.averageFps>=b.minimumAverageFps,p95:w.p95FrameMs<=b.maximumP95FrameMs,p99:w.p99FrameMs<=b.maximumP99FrameMs,hitches:w.hitches.passed,drawCalls:resources.calls<=b.maximumDrawCalls,triangles:resources.triangles<=b.maximumTriangles};
 report.performance.windows.push(w);
 if(allocationProfile){const {profile}=await cdp.send('HeapProfiler.getSamplingProfile');await writeFile(`${out}/${label}.heap-sampling.json`,JSON.stringify(profile));report.performance.allocationProfiled=true;}
}
async function pose(){return page.evaluate(()=>{const w=globalThis.venueCtx.Walk.state.walker;return{x:w.x,y:w.y,z:w.z,yaw:w.yaw||w.angle};});}
async function walkTo(point,tolerance=.55){let previous=Infinity,stalled=0;for(let i=0;i<190;i++){const p=await pose(),distance=Math.hypot(point.x-p.x,point.z-p.z);if(distance<tolerance)return;const target=Math.atan2(point.x-p.x,point.z-p.z),delta=Math.atan2(Math.sin(target-p.yaw),Math.cos(target-p.yaw));if(Math.abs(delta)>.09){await stepGameplayKeys(page,delta>0?'ArrowLeft':'ArrowRight',Math.max(16,Math.min(450,Math.abs(delta)/2.6*800)));continue;}await stepGameplayKeys(page,'ArrowUp',Math.max(30,Math.min(450,(distance-tolerance+.1)/2.8*800)));if(distance>previous-.01)stalled++;else stalled=0;previous=distance;assert.ok(stalled<12,`Walking blocked: ${JSON.stringify({point,p,distance})}`);}throw Error(`Walking timed out: ${JSON.stringify(point)}`);}
async function face(point){
 for(let i=0;i<24;i++){const p=await pose(),target=Math.atan2(point.x-p.x,point.z-p.z),delta=Math.atan2(Math.sin(target-p.yaw),Math.cos(target-p.yaw));if(Math.abs(delta)<.025)return;await stepGameplayKeys(page,delta>0?'ArrowLeft':'ArrowRight',Math.max(16,Math.min(450,Math.abs(delta)/2.6*800)));}
 throw Error('Could not face the habitat using normal turn input');
}
async function at(u,v){return page.evaluate(({u,v})=>{const a=globalThis.venueCtx.activeInterior,p=a.definition.aquariumPlan.local(u,v);return{x:p.x+a.center.x,z:p.z+a.center.z};},{u,v});}
async function interact(){await page.keyboard.press('KeyE');await page.waitForTimeout(180);}
async function lift(id,level){const point=await page.evaluate(id=>{const a=globalThis.venueCtx.activeInterior;return a.authoredLifts.find(l=>l.id===id).stops.find(s=>s.level===a.activeLevel);},id);await walkTo(point);await interact();await page.locator('#interiorElevatorFloorPicker').waitFor();await page.locator(`[data-elevator-level="${level}"]`).click();await page.waitForFunction(level=>globalThis.venueCtx.activeInterior.activeLevel===level,level);}

async function saveObservation(id){
 await interact();await page.locator('.galleryDialog').waitFor();check(`Correct observation opens: ${id}`,await page.evaluate(id=>globalThis.venueCtx.activeInterior.aquarium.panel.observationId===id,id));
 const before=await pose(),clock=await page.evaluate(()=>globalThis.venueCtx.activeInterior.aquarium.clock);await page.evaluate(()=>advanceTime(800));check(`Inspection pauses simulation: ${id}`,await page.evaluate(clock=>globalThis.venueCtx.activeInterior.aquarium.clock===clock,clock));
 await page.getByRole('button',{name:'Save observation',exact:true}).click();await page.getByRole('button',{name:'Saved in Journal',exact:true}).waitFor();
 await page.screenshot({path:`${out}/${id}.png`});
 if(id==='reef-community'){
  await page.getByRole('button',{name:'Visitor map',exact:true}).click();for(const viewport of [{width:390,height:844},{width:844,height:390}]){await page.setViewportSize(viewport);await page.waitForTimeout(200);check(`Map fits ${viewport.width} x ${viewport.height}`,await page.locator('.galleryDialog').evaluate(el=>{const r=el.getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;}));await page.screenshot({path:`${out}/map-${viewport.width}.png`});}await page.setViewportSize({width:1280,height:800});
  for(const level of [0,1,2]){const b=page.locator(`[data-venue-action="floor:${level}"]`);if(await b.isEnabled())await b.click();check(`Map shows requested floor ${level}`,await page.evaluate(level=>globalThis.venueCtx.activeInterior.aquarium.panel.level===level,level));}
 }
 await page.getByRole('button',{name:'Close',exact:true}).click();await page.locator('.galleryDialog').waitFor({state:'detached'});check(`Inspection preserves pose: ${id}`,JSON.stringify(before)===JSON.stringify(await pose()));
}

try{
 let injected=false;if(faults)await page.route('**/blacktip-reef-shark.glb*',async route=>{if(!injected){injected=true;await route.fulfill({status:503,body:'Deliberate reef asset failure'});}else await route.continue();});
 if(process.env.FIREBASE_AUTH_EMULATOR_HOST){const {configureIsolatedWorldBackend}=await import('./isolated-world-backend.mjs');await configureIsolatedWorldBackend(page,`http://127.0.0.1:${server.port}`);report.backend='isolated local staging emulators; no production service acceptance';}
 else await configureStagingAppCheck(page,server.url||`http://127.0.0.1:${server.port}`);
 await page.goto(`http://127.0.0.1:${server.port}/app/?launch=earth&gm=free&loc=custom&lat=39.28551&lon=-76.60860&lname=National%20Aquarium&mode=walking`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__,null,{timeout:120000});
 await page.evaluate(async()=>{globalThis.venueCtx=(await import((globalThis.__WORLD_EXPLORER_PRODUCTION__?.sharedModulePrefix||document.documentElement.dataset.runtimeModulePrefix||'')+'/app/js/shared-context.js?v=55')).ctx;});
 if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();if(await page.locator('#globeSelectorStartBtn').isVisible())await page.locator('#globeSelectorStartBtn').click();
 await page.waitForFunction(()=>venueCtx.gameStarted&&!venueCtx.worldLoading&&!document.getElementById('loading')?.classList.contains('show'),null,{timeout:300000});
 const targets=await page.evaluate(()=>{const c=globalThis.venueCtx;return c.buildings.filter(b=>b.sourceBuildingId==='overture:7bacec0b-326a-401f-ad9f-f3ebed72c8cf').map(b=>{const s=c.resolveBuildingEntrySupport(b,{allowSynthetic:false});return {key:s.key,baseY:b.baseY,minY:b.minY,bodyHeight:b.bodyHeightMeters,ground:c.GroundHeight?.walkSurfaceY?.(b.centerX,b.centerZ),pts:b.pts,center:{x:b.centerX,z:b.centerZ},door:s.exteriorEntrance,enterable:s.enterable};});});report.targets=targets;
 report.entranceDiagnostic=await page.evaluate(()=>globalThis.venueCtx.buildingEntranceCatalog?.diagnostics);
 const target=targets.find(t=>t.door);check('Aquarium has one actual published public entrance',targets.filter(t=>t.door).length===1);
 await walkTo({x:target.door.approachX,z:target.door.approachZ},1);await page.screenshot({path:`${out}/exterior-entry.png`});const entryStart=performance.now();await interact();
 await page.waitForFunction(()=>globalThis.venueCtx.activeInterior?.aquarium,null,{timeout:20000});check('Geographic entrance admits aquarium-specific layout',true);
 report.entryTiming.playableMs=performance.now()-entryStart;await page.evaluate(()=>globalThis.venueCtx.activeInterior.aquarium.ready);report.entryTiming.initialAttemptSettledMs=performance.now()-entryStart;report.initial=JSON.parse(await page.evaluate(()=>globalThis.render_game_to_text()));
 report.presentation=await page.evaluate(()=>{const c=globalThis.venueCtx;return {near:c.camera.near,far:c.camera.far,fog:c.scene.fog?{density:c.scene.fog.density,color:c.scene.fog.color.getHexString()}:null,precision:c.renderer.capabilities.precision,physicalLights:c.renderer.physicallyCorrectLights,composerTargets:c.composer?[c.composer.renderTarget1,c.composer.renderTarget2].map(t=>({stencil:t.stencilBuffer,colorType:t.texture.type,width:t.width,height:t.height})):[],shadows:{enabled:c.renderer.shadowMap.enabled,autoUpdate:c.renderer.shadowMap.autoUpdate,type:c.renderer.shadowMap.type},exposure:c.renderer.toneMappingExposure};});
 report.savedOutside=await page.evaluate(()=>({...globalThis.venueCtx.activeInterior.outsideState}));
 if(faults){await walkTo(await at(0,10));await interact();await page.getByRole('button',{name:'Retry reef models',exact:true}).waitFor();check('Missing animal leaves map, exit and a visible retry',true);await page.getByRole('button',{name:'Retry reef models',exact:true}).click();await page.waitForFunction(()=>globalThis.venueCtx.activeInterior.aquarium.animals.length===4&&!globalThis.venueCtx.activeInterior.aquarium.loading,null,{timeout:45000});await page.getByRole('button',{name:'Close',exact:true}).click();}
 check('All four animal rigs and coral models load',await page.evaluate(()=>{const s=globalThis.venueCtx.activeInterior.aquarium;return s.animals.length===4&&s.furnishings.length===18&&!s.error;}));
 report.entryTiming.assetsReadyMs=performance.now()-entryStart;report.entryTiming.scope=faults?'Includes failed initial attempt, visitor-map navigation and manual model retry':'Cold admitted visit; excludes world loading and exterior approach';
 await runPrescribedGameActions(page,out,[{buttons:[],frames:5}],'body > canvas:not(#minimap)');
 await page.screenshot({path:`${out}/pavilion-arrival.png`});await measureVenue('pavilion');
 await lift('pavilion-lift',2);check('Pavilion lift reaches authored level 1',true);await page.screenshot({path:`${out}/pavilion-overlook.png`});
 await walkTo(await at(0,14));await walkTo(await at(-1,22));await walkTo(await at(-17,41));await walkTo(await at(-17,50));await walkTo(await at(-18,55));
 await face(await at(-36,64));await page.screenshot({path:`${out}/reef-overlook.png`});
 await saveObservation('reef-community');
 // Continue around the curved visitor edge, then use the actual lift control.
 for(const p of [[-18.5,58],[-19,64],[-18.5,70],[-18.5,73],[-19,75.4],[-24,76.5],[-32,76.5]])await walkTo(await at(...p));
 await lift('reef-lift-a',1);check('Elevator A reaches level M without rebuilding',true);
 for(const p of [[-25,76],[-19,75.4],[-18.5,73],[-18.5,70],[-19.3,63.5]])await walkTo(await at(...p));
 await face(await at(-36,63.5));await page.screenshot({path:`${out}/underwater-window.png`});await measureVenue('lower-reef');await face(await at(-36,63.5));
 // Use the game's ordinary right-button look control from the dry lower
 // gallery. No camera or actor state assignment is used to stage this view.
 await page.mouse.move(640,360);await page.mouse.down({button:'right'});await page.mouse.move(640,470,{steps:8});await page.mouse.up({button:'right'});await page.evaluate(()=>advanceTime(100));
 check('Normal mouse look shows the water underside from the dry gallery',await page.evaluate(()=>{const a=globalThis.venueCtx.activeInterior,w=a.aquarium.water;return a.activeLevel===1&&w.mesh.material.uniforms.waterSide.value===-1&&w.snapshot().lastPassTime>=0;}));
 await page.screenshot({path:`${out}/underwater-surface.png`});
 await page.mouse.down({button:'right'});await page.mouse.move(640,360,{steps:8});await page.mouse.up({button:'right'});await page.evaluate(()=>advanceTime(100));

 for(const [id,u,v] of [['turtle-observation',-18.5,69.3],['blacktip-motion',-18.5,57.4]]){await walkTo(await at(u,v));await saveObservation(id);}
 check('All three observations reach the existing Journal',await page.evaluate(()=>globalThis.venueCtx.activeInterior.aquarium.saved.size===3));
 for(const p of [[-18.5,64],[-18.5,73],[-19,75.4],[-25,76],[-32,76.5]])await walkTo(await at(...p));
 await lift('reef-lift-a',2);check('Return from M to the same upper route',true);
 for(const p of [[-25,76],[-19,75.4],[-18.5,73],[-18.5,64],[-18,55],[-17,50],[-17,41],[-1,22],[0,14]])await walkTo(await at(...p));
 await lift('pavilion-lift',0);check('Return lift reaches harbor exit level',true);
 const moveStart=await pose();await stepGameplayKeys(page,['ArrowUp','ShiftLeft'],250);const ran=await pose();check('Run moves on Pavilion floor',Math.hypot(ran.x-moveStart.x,ran.z-moveStart.z)>.6);
 await stepGameplayKeys(page,'Space',250);const jumped=await pose();await page.evaluate(()=>advanceTime(1200));check('Jump lands on the same floor',jumped.y>ran.y+.1&&Math.abs((await pose()).y-ran.y)<.07);
 await page.evaluate(()=>{const a=globalThis.venueCtx.activeInterior;globalThis.oldAquariumWater=a.aquarium.water;});
 const exit=await page.evaluate(()=>globalThis.venueCtx.activeInterior.interactions.find(i=>i.kind==='exit'));await walkTo(exit);await interact();await page.waitForFunction(()=>!globalThis.venueCtx.activeInterior);
 check('Outdoor camera clipping restores exactly',await page.evaluate(saved=>globalThis.venueCtx.camera.near===saved.cameraNear&&globalThis.venueCtx.camera.far===saved.cameraFar,report.savedOutside));
 const outside=await pose();check('Harbor position restores exactly',Math.hypot(outside.x-report.savedOutside.x,outside.y-report.savedOutside.y,outside.z-report.savedOutside.z)<.12);
 check('Water targets and outdoor camera restore on exit',await page.evaluate(()=>globalThis.oldAquariumWater.snapshot().renderTargets===0&&globalThis.venueCtx.camera.layers.mask===1));
 await interact();await page.waitForFunction(()=>globalThis.venueCtx.activeInterior?.aquarium?.saved.size===3);await page.evaluate(()=>globalThis.venueCtx.activeInterior.aquarium.ready);check('Reentry restores all Journal notes',true);await measureVenue('reentry');
 if(measured)report.performance.retention=[await measureRetainedHeap(cdp,{timingComplete:report.performance.windows.length===3,label:'occupied reentry'})];
 check('Reentry creates only two water targets',await page.evaluate(()=>globalThis.venueCtx.activeInterior.aquarium.water.snapshot().renderTargets===2));
 await walkTo(await page.evaluate(()=>globalThis.venueCtx.activeInterior.interactions.find(i=>i.kind==='exit')));await interact();await page.waitForFunction(()=>!globalThis.venueCtx.activeInterior);
 // Five admissions exercise the same entry/lifecycle authority. All timing is
 // finished; collect only for the separately identified retention measurements.
 for(let cycle=3;cycle<=5;cycle++){
  await interact();await page.waitForFunction(()=>globalThis.venueCtx.activeInterior?.aquarium?.saved.size===3);await page.evaluate(()=>globalThis.venueCtx.activeInterior.aquarium.ready);
  const resident=await page.evaluate(()=>{const s=venueCtx.activeInterior.aquarium;return {animals:s.animals.length,corals:s.furnishings.length,waterTargets:s.water.snapshot().renderTargets};});
  check(`Cycle ${cycle} restores notes and one bounded habitat`,resident.animals===4&&resident.waterTargets===2);
  if(measured&&cycle===5)report.performance.retention.push(await measureRetainedHeap(cdp,{timingComplete:report.performance.windows.length===3,label:'occupied fifth admission'}));
  await walkTo(await page.evaluate(()=>venueCtx.activeInterior.interactions.find(i=>i.kind==='exit')));await interact();await page.waitForFunction(()=>!venueCtx.activeInterior);
  report.cycles.push({cycle,resident,renderer:await page.evaluate(()=>getWorldExplorerRuntimeDiagnostics().renderer)});
 }
 report.assets=await page.evaluate(()=>getWorldExplorerRuntimeDiagnostics().modelAssets);check('Aquarium model leases are released',report.assets.entries.filter(e=>/aquarium-|marine-.*coral/.test(e.id)).every(e=>e.leases===0));
 report.transfer=await page.evaluate(()=>{const rows=performance.getEntriesByType('resource').filter(r=>new URL(r.name).origin===location.origin);return {scope:'same-origin browser ResourceTiming; cache hits may report zero transfer bytes',requests:rows.length,transferBytes:rows.reduce((n,r)=>n+r.transferSize,0),encodedBytes:rows.reduce((n,r)=>n+r.encodedBodySize,0)};});
 check('No page or GPU errors',errors.length===0);
 if(measured)for(const w of report.performance.windows)for(const [id,passed]of Object.entries(w.checks))check(`${w.label} performance: ${id}`,passed);
 if(measured){for(const sample of report.performance.retention)check(`${sample.label}: retained heap`,sample.retainedBytes<=performanceBudgets.desktopTier.budgets.maximumRetainedJsHeapBytes);check('Repeated occupied visits retain bounded memory',report.performance.retention[1].retainedBytes-report.performance.retention[0].retainedBytes<=performanceBudgets.retention.maximumHeapGrowthBytes);}
 report.ok=true;
}catch(error){report.failure=String(error.stack||error);await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});throw error;}
finally{report.errors=errors;await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));try{await closeOwnedBrowser(ownedBrowser);}finally{await server.close();}}
