import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const out='output/verification/vegetation-player-current';await mkdir(out,{recursive:true});
const server=await chromium.launchServer({channel:'chrome',headless:true});
const deadline=setTimeout(()=>server.process().kill('SIGTERM'),150000);
const report={checks:{},errors:[]};
try {
 const browser=await chromium.connect(server.wsEndpoint());
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 page.on('pageerror',error=>report.errors.push(error.message));
 await page.goto('http://127.0.0.1:4195/app/?loc=custom&lat=37.74&lon=-119.59&mode=walking');
 await page.waitForFunction(()=>window.__WE3D_RUNTIME_READY__,null,{timeout:45000});
 await page.locator('#globeSelectorStartBtn').click();
 await page.waitForFunction(()=>{const s=window.getWorldExplorerRuntimeDiagnostics?.();return s?.gameStarted&&!s.worldLoading&&s.environmentEvidence?.vegetationCount>0;},null,{timeout:90000});
 report.tree=await page.evaluate(async()=>{
  const {ctx}=await import('/app/js/shared-context.js?v=55');
  const focus=ctx.activeTransportActor().position;
  const tree=[...ctx.vegetationFeatures].filter(t=>t.trunkRadius>0 && Math.abs(ctx.terrainMeshHeightAt(t.x,t.z-10)-t.baseY)<.8).sort((a,b)=>Math.hypot(a.x-focus.x,a.z-focus.z)-Math.hypot(b.x-focus.x,b.z-focus.z))[0];
  if(!tree)throw new Error('No actual tree with a safe level approach loaded');
  window.testVegetationTree={...tree};window.testVegetationContext=ctx;ctx.setTimeOfDay('day');
  ctx.setTravelMode('drive');
  Object.assign(ctx.car,{x:tree.x,z:tree.z-10,y:ctx.terrainMeshHeightAt(tree.x,tree.z-10)+1.2,angle:0,vy:0,speed:0,vFwd:0,vLat:0,vx:0,vz:0,road:null,onRoad:false,isAirborne:false,_roadContinuityTimer:0,lastWorldImpact:null});
  ctx.invalidateRoadCache?.();ctx.camMode=0;
  return tree;
 });
 async function snapshot(label){
  const state=await page.evaluate(async()=>{
   const {ctx}=await import('/app/js/shared-context.js?v=55');
   const walk=ctx.Walk.state.mode==='walk',actor=walk?ctx.Walk.state.walker:ctx.car,t=window.testVegetationTree;
   return {mode:walk?'walk':'drive',x:actor.x,z:actor.z,y:actor.y,speed:actor.speed,relativeZ:actor.z-t.z,distance:Math.hypot(actor.x-t.x,actor.z-t.z),impact:ctx.car.lastWorldImpact,health:ctx.car.health};
  });
  await page.screenshot({path:`${out}/${label}.png`});report[label]=state;return state;
 }
 await page.waitForTimeout(300);const start=await snapshot('drive-start');
 await page.keyboard.down('w');
 // Stop input at the actual collision. Holding throttle for four seconds can
 // legitimately push the car around a narrow trunk; that is not penetration.
 await page.waitForFunction(()=>!!window.testVegetationContext.car.lastWorldImpact,null,{timeout:5000});
 await page.keyboard.up('w');
 const hit=await snapshot('drive-contact');
 report.checks.vehicleMoved=hit.z-start.z>1;
 report.checks.vehicleDidNotPassThroughTrunk=hit.relativeZ<0 && hit.distance<4;
 await page.keyboard.down('s');await page.waitForTimeout(2500);await page.keyboard.up('s');
 const reverse=await snapshot('drive-reverse');report.checks.vehicleCanBackAway=reverse.z<hit.z-.3 && reverse.speed<0;
 await page.evaluate(async()=>{
  const {ctx}=await import('/app/js/shared-context.js?v=55');const t=window.testVegetationTree;
  ctx.setTravelMode('walk');Object.assign(ctx.Walk.state.walker,{x:t.x,z:t.z-4,y:t.baseY+1.7,angle:0,yaw:0,vy:0,grounded:true});
 });
 await page.waitForTimeout(300);await page.keyboard.down('w');await page.waitForTimeout(2000);await page.keyboard.up('w');
 const walk=await snapshot('walk-contact');report.checks.walkerDidNotPassThroughTrunk=walk.relativeZ<0 && walk.distance<2;
 report.checks.noRuntimeExceptions=report.errors.length===0;
 report.ok=Object.values(report.checks).every(Boolean);
} catch(error){report.failure=String(error.stack||error);report.ok=false;}
finally {
 await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
 await Promise.race([server.close(),new Promise(r=>setTimeout(r,6000))]);
 if(server.process().exitCode===null)server.process().kill('SIGTERM');clearTimeout(deadline);
 console.log(JSON.stringify(report));if(!report.ok)process.exitCode=1;
}
