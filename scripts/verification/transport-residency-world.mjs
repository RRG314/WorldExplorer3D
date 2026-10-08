import assert from 'node:assert/strict';

// Stress actual publication/retirement against the assembled city's mapped
// roads. Explicit placements isolate ownership; this is not a continuous
// controls-only driving or geographic-streaming acceptance journey.
export async function verifyTransportResidency(page,out){
 await page.locator('#travelBtn').click();await page.locator('#fDriving').click();
 await page.waitForFunction(()=>globalThis.getWorldExplorerRuntimeDiagnostics?.().activeActor?.mode==='drive');
 const setup=await page.evaluate(async()=>{
  const {ctx}=await import('/app/js/shared-context.js?v=55');
  const targets=[[3500,0],[7000,0],[-3500,0],[-7000,0],[3500,0]];
  const samples=targets.map(([x,z])=>{
   let best=null,score=Infinity;
   for(const road of ctx.roads){
    if(road.structureSemantics?.terrainMode!=='at_grade')continue;
    const a=road.pts?.[0],b=road.pts?.[1];if(!a||!b)continue;
    const px=(a.x+b.x)/2,pz=(a.z+b.z)/2,d=(px-x)**2+(pz-z)**2;
    if(d<score){score=d;best={x:px,z:pz,sourceId:String(road.sourceFeatureId||road.id||''),targetDistance:Math.sqrt(d)};}
   }
   return best;
  });
  return {samples,worldLoadSequence:ctx._worldLoadSequence,buildings:ctx.buildings.length,roads:ctx.roads.length};
 });
 assert.ok(setup.samples.every(p=>p&&p.targetDistance<1500),'Mapped road source must cover the stress positions');
 const visits=[];
 for(const [i,point] of setup.samples.entries()){
  await page.evaluate(async point=>{
   const {ctx}=await import('/app/js/shared-context.js?v=55');
   const road=ctx.roads.find(road=>String(road.sourceFeatureId||road.id||'')===point.sourceId);
   ctx.applyResolvedWorldSpawn({...point,valid:true,mode:'drive',carY:ctx.GroundHeight.carCenterY(point.x,point.z),
    angle:0,onRoad:true,road},{syncWalker:false});
   ctx.transportDetail.step({x:point.x,z:point.z,source:'drive'},NaN);
  },point);
  await page.waitForFunction(()=>{
   const d=globalThis.getWorldExplorerRuntimeDiagnostics?.().transportDetail;
   if(d?.error)throw Error(d.error);
   return ['window-ready','complete'].includes(d?.status)&&d.activeJobs===0;
  },null,{timeout:90000,polling:100});
  // Let normal physics and presentation settle after each explicit placement;
  // a render/contact commit alone is not a rendered car-on-road assertion.
  await page.waitForTimeout(2000);
  const sample=await page.evaluate(async point=>{
   const {ctx}=await import('/app/js/shared-context.js?v=55');
   return {point,stats:{...ctx.transportDetail.stats},contact:ctx.roadContactIndex.sampleAt(point.x,point.z,NaN,'at_grade'),
    worldLoadSequence:ctx._worldLoadSequence,buildings:ctx.buildings.length,roads:ctx.roads.length,
    roadMeshes:ctx.roadMeshes.length,contactIndex:ctx.roadContactIndex.stats(),gpu:{...ctx.renderer.info.memory},
    actor:{x:ctx.car.x,y:ctx.car.y,z:ctx.car.z,onGround:ctx.car.onGround,isAirborne:ctx.car.isAirborne,
     groundCenter:ctx.GroundHeight.carCenterY(ctx.car.x,ctx.car.z),mesh:ctx.carMesh.position.toArray()}};
  },point);
  visits.push(sample);
  assert.equal(sample.worldLoadSequence,setup.worldLoadSequence,'Travel must not reset the world');
  assert.equal(sample.buildings,setup.buildings);assert.equal(sample.roads,setup.roads);
  assert.ok(Number.isFinite(sample.contact),'Published mapped road has no physical contact');
  assert.ok(sample.stats.residentMovingRegions<=sample.stats.maxMovingRegions);
  assert.equal(sample.actor.isAirborne,false,'The settled actor must have road contact');
  assert.ok(Math.abs(sample.actor.y-sample.actor.groundCenter)<.5,'The settled chassis must follow the published ground');
  if(i===0||i===setup.samples.length-1)await page.screenshot({path:`${out}/road-return-${i}.png`});
 }
 assert.ok(visits.at(-1).stats.evictedRegions>0,'Stress trip must retire detailed road regions');
 assert.ok(Math.abs(visits[0].contact-visits.at(-1).contact)<1e-5,'Returning restores identical road height');
 return {scope:'Controlled placements in the real city; render/contact ownership, not controls-only continuous travel',visits};
}
