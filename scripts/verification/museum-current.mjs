import assert from 'node:assert/strict';
import {measureRetainedHeap} from './retained-heap.mjs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
import {stepGameplayKeys} from './gameplay-simulation.mjs';
import {collectBrowserGraphicsErrors} from './browser-graphics-errors.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';
import {requirePerformanceHost,requireHardwareGraphics} from './performance-host.mjs';
import {beginMuseumEntryMeasurement,sampleMuseumWindow} from './museum-measurement.mjs';
import {floorWalls,roomRing} from '../../functions/interior-layout.mjs';
import {resolve} from 'node:path';
const measured=process.argv.includes('--performance');
const performanceHost=measured?requirePerformanceHost():null;
const performanceBudgets=JSON.parse(await readFile('config/performance-budgets.json','utf8'));
const faults=process.argv.includes('--faults')||process.env.WE3D_MUSEUM_FAULTS==='1',out=process.env.WE3D_MUSEUM_OUTPUT||(measured?'output/interior-expansion/gallery-performance':faults?'output/interior-expansion/gallery-resilience':'output/interior-expansion/finished-gallery');await mkdir(out,{recursive:true});
const servedRoot=resolve(process.env.WE3D_VERIFY_ROOT||process.cwd());
const server=await startStaticServer({rootDir:servedRoot,ports:[4496,4497]});
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1});
const page=await context.newPage(),errors=[],requests=[],report={ok:false,evidence:`Full ${servedRoot===process.cwd()?'mutable-source':'saved-package'} game; ordinary doorway and DOM keyboard fixed-step movement; licensed local assets; staging attestation. Not physical-device or production acceptance.`,checks:[]};
collectBrowserGraphicsErrors(page,errors);
page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(r.url().includes('/interiors/museum/'))requests.push(r.url());});
const check=(name,passed)=>{report.checks.push({name,passed});assert.ok(passed,name);};
const cdp=measured?await context.newCDPSession(page):null;
if(cdp)await cdp.send('Performance.enable');
report.performance=measured?{host:performanceHost,scope:'Three 10-second live-RAF turning windows inside the gallery, without fixed-step simulation or artificial heap caps. Not sustained outdoor traversal or physical-phone evidence.',entries:[]}:null;
async function enterMeasured(label){
  const profile=measured&&label==='cold'&&process.argv.includes('--profile-entry');
  if(profile){await cdp.send('Profiler.enable');await cdp.send('Profiler.start');}
  const measurement=measured?await beginMuseumEntryMeasurement(page):null;
  await interact();await page.waitForFunction(()=>globalThis.museumCtx.activeInterior?.gallery,null,{timeout:20000});
  if(measurement)await page.waitForFunction(s=>Number.isFinite(s.playableAt),measurement);
  // Measure the real key event to a live gallery frame, excluding the runner's
  // deliberate 200 ms interaction pause and browser-protocol round trips.
  const playableMs=measurement?await measurement.evaluate(s=>s.playableAt-s.receivedAt):null;
  await page.evaluate(()=>globalThis.museumCtx.activeInterior.gallery.ready);
  const readyMs=measurement?await measurement.evaluate(s=>performance.now()-s.startedAt):null;
  if(profile){const {profile:cpu}=await cdp.send('Profiler.stop');report.performance.entryCpu=cpu.nodes.filter(n=>n.hitCount>0).sort((a,b)=>b.hitCount-a.hitCount).slice(0,35).map(n=>({function:n.callFrame.functionName,file:n.callFrame.url.split('?')[0].split('/').at(-1),hits:n.hitCount}));await cdp.send('Profiler.disable');}
  if(measurement)report.performance.entries.push(await sampleMuseumWindow(page,cdp,measurement,{label,playableMs,readyMs,budgets:performanceBudgets.desktopTier.budgets,hitchBudgets:performanceBudgets.desktopTier.hitches}));
}
async function pose(){return page.evaluate(()=>{const w=globalThis.museumCtx.Walk.state.walker;return{x:w.x,y:w.y,z:w.z,yaw:w.yaw||w.angle};});}
async function mappedTarget(){return page.evaluate(()=>{
  const ctx=globalThis.museumCtx,building=ctx.buildings.find(b=>String(b.sourceBuildingId).includes('336352958')||String(b.buildingProvenance?.metadata?.sourceFeatureId).includes('336352958'));
  if(!building)return{found:false};
  // Resolve this actual mapped building through the game's published owner.
  // A nearest-eight search can omit it, and render records need not retain
  // top-level bounds. Neither is evidence that its exterior door disappeared.
  const support=ctx.resolveBuildingEntrySupport(building,{allowSynthetic:false});
  const door=support?.exteriorEntrance;
  return{found:support?.enterable===true&&!!door,key:support?.key,reason:support?.reason,source:building.sourceBuildingId,metadata:building.buildingProvenance?.metadata,part:building.buildingPartKind,footprint:building.pts,approach:door?{x:door.approachX??door.x,z:door.approachZ??door.z}:null};
});}
async function walkTo(point,tolerance=.6){
  let previous=Infinity,stalled=0;
  for(let i=0;i<160;i++){
    const p=await pose(),distance=Math.hypot(point.x-p.x,point.z-p.z);if(distance<tolerance)return;
    const target=Math.atan2(point.x-p.x,point.z-p.z),delta=Math.atan2(Math.sin(target-p.yaw),Math.cos(target-p.yaw));
    if(Math.abs(delta)>.09){await stepGameplayKeys(page,delta>0?'ArrowLeft':'ArrowRight',Math.max(16,Math.min(450,Math.abs(delta)/2.6*800)));continue;}
    await stepGameplayKeys(page,'ArrowUp',Math.max(30,Math.min(450,(distance-tolerance+.1)/2.8*800)));
    if(distance>previous-.01)stalled++;else stalled=0;previous=distance;
    assert.ok(stalled<12,`Walking blocked: ${JSON.stringify({point,p,distance})}`);
  }throw Error(`Walking timed out: ${JSON.stringify(point)}`);
}
async function interact(){await page.keyboard.press('KeyE');await page.waitForTimeout(200);}
async function closePanel(){await page.getByRole('button',{name:'Close',exact:true}).click();await page.locator('.galleryDialog').waitFor({state:'detached'});}
try{
  let failedCoral=false;
  if(faults)await page.route('**/smithsonian-coral.glb*',async route=>{if(!failedCoral){failedCoral=true;await route.fulfill({status:503,body:'Deliberate offline display check'});}else await route.continue();});
  await configureStagingAppCheck(page,server.url||`http://127.0.0.1:${server.port}`);
  await page.goto(`http://127.0.0.1:${server.port}/app/?launch=earth&gm=free&loc=custom&lat=39.29184&lon=-76.61036&lname=The%20Peale&mode=walking`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__,null,{timeout:120000});
  await page.evaluate(async()=>{globalThis.museumCtx=(await import((globalThis.__WORLD_EXPLORER_PRODUCTION__?.sharedModulePrefix||'')+'/app/js/shared-context.js?v=55')).ctx;});
  if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
  if(await page.locator('#globeSelectorStartBtn').isVisible())await page.locator('#globeSelectorStartBtn').click();
  await page.waitForFunction(()=>museumCtx.gameStarted&&!museumCtx.worldLoading&&!document.getElementById('loading')?.classList.contains('show'),null,{timeout:300000});
  if(measured){report.performance.renderer=await page.evaluate(()=>{const gl=globalThis.museumCtx.renderer.getContext(),info=gl.getExtension('WEBGL_debug_renderer_info');return gl.getParameter(info?info.UNMASKED_RENDERER_WEBGL:gl.RENDERER);});requireHardwareGraphics(report.performance.renderer);}
  check('No museum model request during unrelated Earth startup',requests.length===0);
  if(process.argv.includes('--survey-aquarium')){
    // Read-only admission survey of the already loaded world. This does not
    // invent a venue, teleport the actor or grant access to a building part.
    const geography=await page.evaluate(()=>{
      const c=globalThis.museumCtx,origin=c.geoToWorld(39.28525,-76.6074);
      return {scope:'Loaded exterior geometry and public entry-owner results; not aquarium interior acceptance',build:globalThis.getWorldExplorerRuntimeDiagnostics?.().build,
        location:c.LOC,buildings:c.buildings.filter(b=>Array.isArray(b.pts)&&b.pts.some(p=>Math.hypot(p.x-origin.x,p.z-origin.z)<170)).map(b=>{
          const s=c.resolveBuildingEntrySupport(b,{allowSynthetic:false});
          return {sourceBuildingId:b.sourceBuildingId,buildingType:b.buildingType,label:s.label,buildingPartKind:b.buildingPartKind,provenance:b.buildingProvenance,pts:b.pts,centerX:b.centerX,centerZ:b.centerZ,height:b.height,bodyHeightMeters:b.bodyHeightMeters,levels:b.levels,entry:{enterable:s.enterable,reason:s.reason,key:s.key,anchor:s.entryAnchor,exterior:s.exteriorEntrance}};
        })};
    });
    await mkdir('output/aquarium-expansion',{recursive:true});
    await writeFile(`${out}/aquarium-geography.json`,JSON.stringify(geography,null,2));
    check('Incomplete aquarium building parts retain all three mapped outline components',geography.buildings.filter(b=>b.sourceBuildingId==='overture:7bacec0b-326a-401f-ad9f-f3ebed72c8cf').length===3);
    check('Aquarium bridge and thin roof fragment do not offer building interiors',geography.buildings.filter(b=>['overture:07ca0781-716d-4114-a5b4-549b9a086fd7','overture:6251be5f-364a-3ace-90f3-a2e2966e839b'].includes(b.sourceBuildingId)).every(b=>b.entry.enterable===false));
    // An explicitly diagnostic exterior camera, not player-traversal evidence
    // or a promotional aquarium screenshot. Never mutate the player's camera.
    const pixels=await page.evaluate(()=>{
      const c=globalThis.museumCtx,eye=c.geoToWorld(39.28475,-76.60975),target=c.geoToWorld(39.2851,-76.6079),camera=c.camera.clone();
      camera.position.set(eye.x,95,eye.z);camera.lookAt(target.x,2,target.z);
      c.renderer.render(c.scene,camera);
      return c.renderer.domElement.toDataURL('image/png').split(',')[1];
    });
    await writeFile(`${out}/aquarium-exterior-diagnostic.png`,Buffer.from(pixels,'base64'));
  }
  report.target=await mappedTarget();
  check('Actual mapped museum has a supported exterior entrance',report.target.found&&!!report.target.approach);
  console.log('[museum] mapped target',JSON.stringify(report.target));
  const approach=report.target.approach;
  await walkTo(approach,2);await page.locator('#interiorPrompt.show').waitFor({timeout:10000});
  report.beforeEntry=await pose();
  report.renderPreparation=await page.evaluate(()=>globalThis.museumCtx.museumProgramPreparation||null);
  check('The mapped museum prepares its material programs before admission',report.renderPreparation?.status==='prepared');
  await enterMeasured('cold');
  check('The real entry resolver selects the reviewed museum',await page.evaluate(()=>globalThis.museumCtx.activeInterior.definition.curatedContent?.id==='baltimore-natural-forms'));
  report.savedOutside=await page.evaluate(()=>({...globalThis.museumCtx.activeInterior.outsideState}));
  check('Entrance hall, two connected galleries and three licensed displays',await page.evaluate(()=>{const a=globalThis.museumCtx.activeInterior;return a.definition.authoredLayout.floors[0].rooms.length===3&&[...a.gallery.exhibits.values()].every(r=>r.status==='ready'||r.exhibit.id==='branching-coral'&&r.status==='unavailable');}));
  report.scene=await page.evaluate(()=>{const ctx=globalThis.museumCtx,a=ctx.activeInterior,lights=[];ctx.scene.traverse(o=>{if(o.isLight)lights.push({type:o.type,intensity:o.intensity,color:o.color.getHexString(),visible:o.visible});});return{lights,fog:ctx.scene.fog?.density,exposure:ctx.renderer.toneMappingExposure,layout:a.definition.authoredLayout,placements:a.definition.exhibitPlacements,resources:ctx.renderer.info.memory};});
  await page.screenshot({path:`${out}/entrance-desktop.png`});
  // Plan test waypoints from the candidate's admitted layout. The runner may
  // read schema geometry; the browser never imports omitted private source or
  // substitutes test modules for the actual bundled game.
  const admitted=await page.evaluate(()=>{const a=globalThis.museumCtx.activeInterior;return{layout:a.definition.authoredLayout,center:a.center,interactions:a.interactions};});
  const routes=(()=>{
    const a=admitted,floor=a.layout.floors[0];
    const doors=floor.doors.filter(d=>!d.entry).map(d=>{const w=floorWalls(floor).find(w=>w.id===d.wall),length=Math.hypot(w.b.x-w.a.x,w.b.z-w.a.z);return{rooms:w.rooms,x:w.a.x+(w.b.x-w.a.x)*d.offset/length+a.center.x,z:w.a.z+(w.b.z-w.a.z)*d.offset/length+a.center.z};});
    return{doors,rooms:floor.rooms.map(r=>{const ring=roomRing(floor,r);return{x:ring.reduce((n,p)=>n+p.x,0)/ring.length+a.center.x,z:ring.reduce((n,p)=>n+p.z,0)/ring.length+a.center.z};}),exhibits:a.interactions.filter(i=>i.kind==='museum-exhibit'),exit:a.interactions.find(i=>i.kind==='exit'),map:a.interactions.find(i=>i.kind==='museum-map')};
  })();
  for(const [index,exhibit]of routes.exhibits.entries()){
    if(index===0){await walkTo(routes.rooms[2]);await walkTo(routes.doors.find(d=>d.rooms.includes('gallery-room-0')));}
    if(index===2){await walkTo(routes.exhibits[0]);await walkTo(routes.doors.find(d=>d.rooms.includes('gallery-room-0')));await walkTo(routes.rooms[2]);await walkTo(routes.doors.find(d=>d.rooms.includes('gallery-room-1')));}
    if(index===0)await walkTo(routes.rooms[0]);
    if(index===2)await walkTo(routes.rooms[1]);
    await walkTo(exhibit);await interact();await page.locator('.galleryDialog').waitFor();
    if(faults&&index===1){check('A missing exhibit has an honest retry state',await page.getByRole('button',{name:'Retry display',exact:true}).isVisible());await page.getByRole('button',{name:'Retry display',exact:true}).click();await page.waitForFunction(()=>globalThis.museumCtx.activeInterior.gallery.exhibits.get('branching-coral').status==='ready');}
    const before=await pose();
    check(`Inspect ${index+1} suppresses the game HUD`,await page.locator('#floatMenuContainer').evaluate(el=>getComputedStyle(el).visibility==='hidden'));
    if(index<2){const rotation=await page.evaluate(id=>globalThis.museumCtx.activeInterior.gallery.exhibits.get(id).instance.root.rotation.y,exhibit.exhibitId);await page.getByRole('button',{name:'Turn right ↷'}).click();check(`Exhibit ${index+1} rotates`,await page.evaluate(({id,rotation})=>globalThis.museumCtx.activeInterior.gallery.exhibits.get(id).instance.root.rotation.y!==rotation,{id:exhibit.exhibitId,rotation}));}
    await page.getByRole('button',{name:'Save to Journal',exact:true}).click();await page.getByRole('button',{name:'Saved in Journal',exact:true}).waitFor();
    await page.screenshot({path:`${out}/exhibit-${index+1}-desktop.png`});
    if(index===1){await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250);await page.screenshot({path:`${out}/exhibit-phone.png`});await page.setViewportSize({width:1280,height:800});}await closePanel();check(`Inspect ${index+1} preserves player pose`,JSON.stringify(await pose())===JSON.stringify(before));
  }
  check('Three stable Journal entries',await page.evaluate(()=>globalThis.museumCtx.activeInterior.gallery.saved.size===3));
  await walkTo(routes.rooms[1]);await walkTo(routes.doors.find(d=>d.rooms.includes('gallery-room-1')));await walkTo(routes.rooms[2]);
  await walkTo(routes.map);await interact();await page.locator('.galleryMap').waitFor();await page.screenshot({path:`${out}/map-desktop.png`});
  for(const viewport of [{width:390,height:844},{width:844,height:390}]){await page.setViewportSize(viewport);await page.waitForTimeout(200);check(`Map fits ${viewport.width} × ${viewport.height}`,await page.locator('.galleryDialog').evaluate(el=>{const r=el.getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;}));await page.screenshot({path:`${out}/map-${viewport.width}.png`});}
  await closePanel();await page.setViewportSize({width:1280,height:800});await walkTo(routes.rooms[2]);await walkTo(routes.exit);await interact();
  await page.waitForFunction(()=>!globalThis.museumCtx.activeInterior);const outside=await pose();report.exit={before:report.beforeEntry,saved:report.savedOutside,after:outside};check('Exit restores original exterior position',Math.hypot(outside.x-report.savedOutside.x,outside.y-report.savedOutside.y,outside.z-report.savedOutside.z)<.1);
  report.resourceCycles=[];
  for(let i=0;i<2;i++){
    await enterMeasured(`warm-${i+1}`);
    if(measured&&i===1)report.performance.retention=[await measureRetainedHeap(cdp,{timingComplete:report.performance.entries.length===3,label:'occupied second reentry'})];
    const geometry=await page.evaluate(()=>{const a=globalThis.museumCtx.activeInterior,g=new Set();a.group.traverse(o=>{if(o.geometry)g.add(o.geometry);});return{geometries:g.size,furnishings:a.gallery.furnishings.length,lights:[...a.group.children].filter(o=>o.isLight).length};});report.resourceCycles.push(geometry);
    check(`Reentry ${i+1} restores Journal`,await page.evaluate(()=>globalThis.museumCtx.activeInterior.gallery.saved.size===3));
    await mkdir(`${out}/prescribed-${i}`,{recursive:true});
    await runPrescribedGameActions(page,`${out}/prescribed-${i}`,[{buttons:['up'],frames:6},{buttons:[],frames:3}],'body > canvas:not(#minimap)');
    const walkStart=await pose();await stepGameplayKeys(page,['ArrowUp','ShiftLeft'],350);const ran=await pose();
    check(`Reentry ${i+1} runs in the hall`,Math.hypot(ran.x-walkStart.x,ran.z-walkStart.z)>.8);
    await stepGameplayKeys(page,'Space',250);const jumped=await pose();await page.evaluate(()=>globalThis.advanceTime(1200));const landed=await pose();
    check(`Reentry ${i+1} jumps and lands on the same floor`,jumped.y>ran.y+.1&&Math.abs(landed.y-ran.y)<.06);
    await page.screenshot({path:`${out}/reentry-${i+1}.png`});
    const exit=await page.evaluate(()=>globalThis.museumCtx.activeInterior.interactions.find(i=>i.kind==='exit'));await walkTo(exit);await interact();await page.waitForFunction(()=>!globalThis.museumCtx.activeInterior);
  }
  check('Reentry keeps the same bounded gallery resources',JSON.stringify(report.resourceCycles[0])===JSON.stringify(report.resourceCycles[1]));
  const cache=await page.evaluate(()=>globalThis.getWorldExplorerRuntimeDiagnostics().modelAssets);report.modelCache=cache;
  check('Museum leases release on final exit',cache.entries.filter(e=>e.id.includes('museum-')).every(e=>e.leases===0));
  check('Outdoor lighting restores on exit',await page.evaluate(()=>globalThis.museumCtx.sun.visible===true));
  check('Outdoor camera layer restores on exit',await page.evaluate(()=>globalThis.museumCtx.camera.layers.mask===1));
  if(process.argv.includes('--reload')){
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__,null,{timeout:120000});
    await page.evaluate(async()=>{globalThis.museumCtx=(await import((globalThis.__WORLD_EXPLORER_PRODUCTION__?.sharedModulePrefix||'')+'/app/js/shared-context.js?v=55')).ctx;});
    if(await page.locator('#globeSelectorStartBtn').isVisible())await page.locator('#globeSelectorStartBtn').click();
    await page.waitForFunction(()=>museumCtx.gameStarted&&!museumCtx.worldLoading&&!document.getElementById('loading')?.classList.contains('show'),null,{timeout:300000});
    const {approach}=await mappedTarget();
    await walkTo(approach,2);await page.locator('#interiorPrompt.show').waitFor();await interact();
    await page.waitForFunction(()=>globalThis.museumCtx.activeInterior?.gallery?.saved.size===3,null,{timeout:20000});
    check('All three Journal notes persist across a full reload',true);
    // The late-loading exit also exercises real request cancellation and
    // camera restoration while the current scene is still playable.
    const exit=await page.evaluate(()=>globalThis.museumCtx.activeInterior.interactions.find(i=>i.kind==='exit'));
    await walkTo(exit);await interact();await page.waitForFunction(()=>!globalThis.museumCtx.activeInterior);
    check('Reloaded gallery exits with the outdoor camera restored',await page.evaluate(()=>globalThis.museumCtx.camera.layers.mask===1&&globalThis.museumCtx.sun.visible===true));
  }
  check('No page errors',errors.length===0);
  if(measured)report.performance.retention.push(await measureRetainedHeap(cdp,{timingComplete:report.performance.entries.length===3,label:'exterior after visits and reload'}));
  if(measured)for(const entry of report.performance.entries)for(const [metric,passed]of Object.entries(entry.checks))check(`${entry.label}: ${metric}`,passed);
  if(measured)for(const sample of report.performance.retention)check(`${sample.label}: retained heap`,sample.retainedBytes<=performanceBudgets.desktopTier.budgets.maximumRetainedJsHeapBytes);
  if(measured)check('Repeated museum visits retain bounded memory',report.performance.retention[1].retainedBytes-report.performance.retention[0].retainedBytes<=performanceBudgets.retention.maximumHeapGrowthBytes);
  report.ok=true;
}catch(error){report.error=String(error.stack||error);await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});throw error;}
finally{report.errors=errors;report.requests=requests;await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();await server.close();}
