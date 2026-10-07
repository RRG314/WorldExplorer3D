// Bounded source-runtime diagnosis. No forced collection or performance claims
// from deterministic time stepping. Retain the actual held-key/RAF evidence.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {startStaticServer} from '../verification/static-server.mjs';
import {configureStagingAppCheck} from '../verification/staging-app-check.mjs';
import {closeOwnedBrowser} from '../verification/owned-browser.mjs';
const output=process.env.WE3D_VERIFY_OUTPUT_DIR||'output/architecture-evaluation/ship-baseline';
const fromEarth=process.env.WE3D_SHIP_FROM_EARTH==='1';
await mkdir(output,{recursive:true});
const report={scope:'Actual source ship, held-key walking and ordinary RAF; diagnostic only',errors:[]};
const server=await startStaticServer({rootDir:process.env.WE3D_VERIFY_ROOT||process.cwd(),ports:[4557]});
let owned;
try{
 owned=await chromium.launchServer({headless:false,channel:'chrome'});
 const browser=await chromium.connect(owned.wsEndpoint()),page=await browser.newPage({viewport:{width:1440,height:900}});
 await configureStagingAppCheck(page,`http://127.0.0.1:${server.port}`);
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.port}/app/?${fromEarth?'launch=earth&loc=baltimore&mode=walking':'launch=space'}&diagnostics=1`);
 await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__,null,{timeout:90000});
 if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
 if(fromEarth){
  await page.getByRole('button',{name:'Explore',exact:true}).click();
  await page.evaluate(async()=>{globalThis.auditCtx=(await import('/app/js/shared-context.js?v=55')).ctx;});
  await page.waitForFunction(()=>auditCtx.gameStarted&&!auditCtx.worldLoading&&auditCtx.worldLoadRuntimeState?.status==='ready'&&auditCtx.farTerrainClipmapState?.status==='ready',null,{timeout:300000});
  await page.locator('#travelBtn').click();await page.locator('#fBoardSolisReach').click();
 }else{
 await page.evaluate(()=>{document.getElementById('spaceLaunchToggle')?.click();document.getElementById('startBtn')?.click();});
 await page.waitForFunction(()=>JSON.parse(render_game_to_text()).modes?.space===true,null,{timeout:120000});
 if(await page.locator('#spaceFlightHUD').evaluate(e=>e.classList.contains('collapsed')))await page.locator('#sfHudToggle').click();
 await page.locator('#sfExpeditionBtn').click();await page.locator('#expeditionPlan').click();
 await page.waitForFunction(()=>document.querySelector('.expeditionSummary .is-ready')?.textContent?.includes('READY'));
 await page.locator('#expeditionEnterShip').click();
 }
 await page.waitForFunction(()=>JSON.parse(render_game_to_text()).expeditionShipInterior?.active);
 await page.evaluate(async()=>{globalThis.auditCtx=(await import('/app/js/shared-context.js?v=55')).ctx;});
 await page.evaluate(()=>{globalThis.shipBackground={};for(const name of ['drawMinimap','updateHUD','updateVegetationFocus','updateStreetFurnitureVisibility','updateStructureVisualVisibility','enforceEnvironmentSceneOwnership','updateActivityCreator','updateActivityDiscovery']){const fn=auditCtx[name];if(typeof fn!=='function')continue;const stat=shipBackground[name]={calls:0,ms:0,maxMs:0};auditCtx[name]=function(...args){const start=performance.now();try{return fn.apply(this,args)}finally{const ms=performance.now()-start;stat.calls++;stat.ms+=ms;stat.maxMs=Math.max(stat.maxMs,ms)}}}});
 await page.waitForTimeout(3000);
 const cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
 await cdp.send('HeapProfiler.startSampling',{samplingInterval:131072,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});
 await page.evaluate(()=>{globalThis.shipFrames=[];globalThis.shipSamples=[];let prior=performance.now(),next=prior;globalThis.shipProfiling=true;function tick(now){if(!shipProfiling)return;shipFrames.push(now-prior);prior=now;if(now>=next){const w=auditCtx.Walk.state.walker;shipSamples.push({t:now,x:w.x,y:w.y,z:w.z});next=now+500;}requestAnimationFrame(tick)}requestAnimationFrame(tick)});
 for(let i=0;i<10;i++){await page.keyboard.down(i%2?'ArrowDown':'ArrowUp');await page.waitForTimeout(2800);await page.keyboard.up(i%2?'ArrowDown':'ArrowUp');await page.waitForTimeout(200);}
 report.sample=await page.evaluate(()=>{shipProfiling=false;const sorted=[...shipFrames].sort((a,b)=>a-b);return{frames:shipFrames,positions:shipSamples,fps:shipFrames.length*1000/shipFrames.reduce((a,b)=>a+b,0),maxMs:sorted.at(-1),p99Ms:sorted[Math.floor(sorted.length*.99)],renderer:{...auditCtx.renderer.info.render},ship:auditCtx.getShipInteriorSnapshot()}});
 // End the RAF window BEFORE stopping profilers: serializing their output can
 // block the renderer and is instrumentation overhead, not a gameplay stall.
 await writeFile(`${output}/cpu.json`,JSON.stringify(await cdp.send('Profiler.stop')));
 await writeFile(`${output}/allocation.json`,JSON.stringify(await cdp.send('HeapProfiler.stopSampling')));
 await page.screenshot({path:`${output}/walking.png`});report.complete=true;
 report.background=await page.evaluate(()=>({calls:shipBackground,retainedBuildings:auditCtx.buildings.length,retainedRoads:auditCtx.roads.length}));
 if(fromEarth){
  await page.locator('#shipExitButton').click();
  await page.locator('#solarSystemToggle').click();
  await page.waitForFunction(()=>auditCtx.getEnv()==='EARTH'&&!auditCtx.earthResumePending&&!auditCtx.worldLoading&&auditCtx.worldLoadRuntimeState?.status==='ready',null,{timeout:180000});
  report.return=await page.evaluate(()=>({environment:auditCtx.getEnv(),buildings:auditCtx.buildings.length,roads:auditCtx.roads.length,earthVisible:auditCtx.earthSceneVisible,ship:auditCtx.activeShipInterior,phase:auditCtx.earthResumeDiagnostics?.phase}));
  await page.screenshot({path:`${output}/earth-return.png`});
  if(report.return.buildings!==report.background.retainedBuildings||report.return.roads!==report.background.retainedRoads||!report.return.earthVisible||report.return.ship)throw Error('Earth return lost the retained world');
 }
}catch(e){report.failure=String(e.stack||e);process.exitCode=1;}
finally{await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));if(owned)await closeOwnedBrowser(owned);await server.close();}
console.log(JSON.stringify({complete:report.complete,fps:report.sample?.fps,maxMs:report.sample?.maxMs,errors:report.errors,failure:report.failure}));
