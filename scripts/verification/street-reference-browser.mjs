import assert from 'node:assert/strict';
export async function verifyStreet(page,dir){
 await page.evaluate(()=>{globalThis.__streetSignOwner=null;});
 const result={scope:'Actual Baltimore source app; staged street inspection poses and keyboard movement, not measured storefront reconstruction',stops:[]};
 for(const p of [{id:'origin-street',lat:39.2904,lon:-76.6122,yaw:0},{id:'light-street',lat:39.2886,lon:-76.6137,yaw:0},{id:'harbor-front',lat:39.2857,lon:-76.6124,yaw:1.5}]){
  await page.evaluate(p=>{const c=swimCtx,x=(p.lon-c.LOC.lon)*c.SCALE*Math.cos(c.LOC.lat*Math.PI/180),z=(c.LOC.lat-p.lat)*c.SCALE,g=c.SurfaceQuery.walkAt(x,z,{currentY:100,sampleRenderedMesh:true});Object.assign(c.Walk.state.walker,{x,z,y:g.position.y+1.7,vy:0,yaw:p.yaw,_resolvedGroundState:null});},p);
  await page.waitForTimeout(9000);
  const state=await page.evaluate(()=>{const c=swimCtx,w=c.Walk.state.walker,d=c.buildingExteriorDetailPublication;return {position:{x:w.x,y:w.y,z:w.z},details:d,timing:c.buildingExteriorDetailTiming,meshes:c.buildingExteriorDetailMeshes.length,actors:c.livingWorldRuntimeSnapshot?.()||null,pedestrians:(c.livingWorldRuntime?.population?.pedestrianSnapshots?.()||[]).map(p=>({id:p.id,x:p.x,z:p.z,visible:p.visible,activity:p.activity})),furniture:(c.streetFurnitureMeshes||[]).filter(o=>Math.hypot(o.position.x-w.x,o.position.z-w.z)<120).map(o=>({kind:o.userData.furnitureKind,visible:o.visible,x:o.position.x,z:o.position.z})),markingMeshes:(c.roadMeshes||[]).filter(m=>m.userData.isRoadMarking).length}});
  const signOwner=await page.evaluate(()=>{
    const material=swimCtx.buildingExteriorDetailMeshes.find(mesh=>mesh.material.userData?.ownsFrontageAtlas)?.material;
    if(!material)return {present:false};
    const previous=globalThis.__streetSignOwner;
    globalThis.__streetSignOwner={material,version:material.version};
    return {present:true,compared:!!previous,sameMaterial:!previous||previous.material===material,sameVersion:!previous||previous.version===material.version};
  });
  assert.ok(!signOwner.present||(signOwner.sameMaterial&&signOwner.sameVersion),'Moving through mapped storefronts retains the compiled sign material');state.signOwner=signOwner;
  assert.ok(state.details);assert.ok(state.meshes<=7);assert.ok(Math.hypot(state.position.x-state.details.focus.x,state.position.z-state.details.focus.z)<70);
  await page.screenshot({path:`${dir}/${p.id}.png`});result.stops.push({id:p.id,...state});
  if(p.id==='light-street'){
    result.namedFrontage=await page.evaluate(()=>{const c=swimCtx,w=c.Walk.state.walker;for(const f of c.buildingExteriorDetailPublication.mappedSigns){const x=f.x+f.normalX*12,z=f.z+f.normalZ*12,g=c.SurfaceQuery.walkAt(x,z,{currentY:f.y,sampleRenderedMesh:true});if(c.checkBuildingCollision(x,z,.8)?.collision||c.isPointInsideWaterFootprint(x,z))continue;Object.assign(w,{x,z,y:g.position.y+1.7,vy:0,yaw:Math.atan2(f.x-x,f.z-z),_resolvedGroundState:null});return f;}return null;});
    assert.ok(result.namedFrontage);await page.waitForTimeout(1800);await page.screenshot({path:`${dir}/mapped-name.png`});
  }
 }
 assert.ok(result.stops.some(stop=>stop.signOwner.compared),'At least two actual mapped-sign publications were compared');
 await page.evaluate(()=>swimCtx.setTimeOfDay('night'));await page.waitForTimeout(2000);await page.screenshot({path:`${dir}/night-harbor.png`});await page.evaluate(()=>swimCtx.setTimeOfDay('day'));
 // Inspect an actual generated retail frontage, not only distant office towers.
 await page.evaluate(()=>{const c=swimCtx,w=c.Walk.state.walker;Object.assign(w,{x:0,z:0,y:50,vy:0,_resolvedGroundState:null});});await page.waitForTimeout(5000);
 result.frontage=await page.evaluate(()=>{const c=swimCtx,w=c.Walk.state.walker;
   for(const f of c.buildingExteriorDetailPublication.frontageExamples||[]){const x=f.x+f.normalX*12,z=f.z+f.normalZ*12,g=c.SurfaceQuery.walkAt(x,z,{currentY:f.baseY+2,sampleRenderedMesh:true});if(!Number.isFinite(g?.position?.y)||c.checkBuildingCollision(x,z,.8)?.collision||c.isPointInsideWaterFootprint(x,z))continue;
     Object.assign(w,{x,z,y:g.position.y+1.7,vy:0,yaw:Math.atan2(f.x-x,f.z-z),_resolvedGroundState:null});return f;
   }return null;
 });assert.ok(result.frontage,'A close retail frontage is inspectable');await page.waitForTimeout(2000);await page.screenshot({path:`${dir}/storefront-close.png`});
 // A short actual movement burst verifies the refreshed decoration does not own movement.
 const before=await page.evaluate(()=>({x:swimCtx.Walk.state.walker.x,z:swimCtx.Walk.state.walker.z}));await page.keyboard.down('w');await page.waitForTimeout(700);await page.keyboard.up('w');
 const after=await page.evaluate(()=>({x:swimCtx.Walk.state.walker.x,z:swimCtx.Walk.state.walker.z}));result.movement={before,after,distance:Math.hypot(after.x-before.x,after.z-before.z)};assert.ok(result.movement.distance>.1);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${dir}/phone-street.png`});await page.setViewportSize({width:1440,height:900});
 return result;
}
