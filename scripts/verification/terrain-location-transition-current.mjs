import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.WE3D_VERIFY_BASE_URL || 'http://127.0.0.1:4195';
const latitude=Number(process.env.WE3D_DESTINATION_LAT || 20.5043);
const longitude=Number(process.env.WE3D_DESTINATION_LON || 8.1750);
const out=process.env.WE3D_VERIFY_OUTPUT || 'output/verification/terrain-location-transition-current';
await mkdir(out,{recursive:true});
const server=await chromium.launchServer({headless:true,channel:'chrome'});
const deadline=setTimeout(()=>server.process().kill('SIGTERM'),210000);
const report={errors:[]};let page;
try {
 const browser=await chromium.connect(server.wsEndpoint());
 page=await browser.newPage({viewport:{width:1280,height:800}});
 page.on('pageerror',error=>report.errors.push(error.message));
 await page.goto(`${base}/app/?loc=custom&lat=43.7384&lon=7.4246&mode=walking`);
 await page.waitForFunction(()=>window.__WE3D_RUNTIME_READY__,null,{timeout:45000});
 await page.locator('#globeSelectorStartBtn').click();
 const ready=()=>{const s=window.getWorldExplorerRuntimeDiagnostics?.();return s?.gameStarted&&!s.worldLoading&&!document.getElementById('loading')?.classList.contains('show');};
 await page.waitForFunction(ready,null,{timeout:90000});
 report.before=await page.evaluate(async()=>{
  const {ctx}=await import('/app/js/shared-context.js?v=55');window.transitionContext=ctx;
  const value={location:ctx.LOC,roads:ctx.roads.length,cuts:ctx.structureTerrainCuts?.length,sequence:ctx._worldLoadSequence};
  return value;
 });
 console.log('Loaded first location',report.before);
 await page.locator('#mainMenuBtn').click();
 await page.locator('#globeCustomLat').fill(String(latitude));
 await page.locator('#globeCustomLon').fill(String(longitude));
 await page.locator('#globeCustomLon').press('Enter');
 await page.locator('#globeSelectorStartBtn').click();
 await page.waitForFunction(sequence=>window.transitionContext._worldLoadSequence>sequence,report.before.sequence,{timeout:20000});
 await page.waitForFunction(ready,null,{timeout:70000});
 report.after=await page.evaluate(()=>{
  const ctx=window.transitionContext,lines=[];
  ctx.setTimeOfDay('day');
  for(let z=-400;z<=400;z+=20)for(let x=-400;x<=400;x+=20){const source=ctx.elevationWorldYAtWorldXZ(x,z),rendered=ctx.terrainMeshHeightAt(x,z);if(Number.isFinite(source)&&Number.isFinite(rendered))lines.push({x,z,source,rendered,delta:rendered-source});}
  lines.sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
  return {location:ctx.LOC,roads:ctx.roads.length,cuts:ctx.structureTerrainCuts?.length,corridor:ctx.transportTerrainCorridorPublication,sequence:ctx._worldLoadSequence,worst:lines.slice(0,12),sampleCount:lines.length};
 });
 await page.waitForTimeout(500);await page.screenshot({path:`${out}/after-transition.png`});
 // Both fixtures have no grading corridors. Namib has mapped non-driveable
 // ways: zero road records is not a valid requirement for that location.
 report.ok=report.before.roads>0&&report.before.cuts>0&&report.after.cuts===0&&Math.abs(report.after.location.lat-latitude)<1e-6&&Math.abs(report.after.location.lon-longitude)<1e-6&&report.after.sampleCount===1681&&report.after.worst.every(s=>Math.abs(s.delta)<2)&&report.errors.length===0;
 report.cancel=await page.evaluate(async()=>{
  const ctx=window.transitionContext;
  const pending=ctx.refreshStructureAwareFeatureProfilesCooperatively();
  ctx.resetEarthStreaming('verification-world-replaced');
  try {await pending;return {aborted:false};}
  catch(error){return {aborted:error.name==='AbortError',cuts:ctx.structureTerrainCuts?.length,corridor:ctx.transportTerrainCorridorPublication};}
 });
 report.ok=report.ok&&report.cancel.aborted&&report.cancel.cuts===0&&report.cancel.corridor===null;
}catch(error){report.ok=false;report.failure=String(error.stack||error);if(page){report.state=await page.evaluate(()=>window.getWorldExplorerRuntimeDiagnostics?.()).catch(()=>null);await page.screenshot({path:`${out}/failed.png`}).catch(()=>{});}}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await Promise.race([server.close(),new Promise(r=>setTimeout(r,6000))]);if(server.process().exitCode===null)server.process().kill('SIGTERM');clearTimeout(deadline);console.log(JSON.stringify(report));if(!report.ok)process.exitCode=1;}
