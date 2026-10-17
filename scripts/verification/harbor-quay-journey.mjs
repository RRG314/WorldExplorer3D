import assert from 'node:assert/strict';
import {stepGameplayKeys} from './gameplay-simulation.mjs';

export async function verifyHarborQuayJourney(page,out){
 const start=await page.evaluate(async()=>{
  const c=venueCtx;
  const segmentsFromColliders=c.dynamicBuildingColliders.filter(b=>String(b.sourceBuildingId).startsWith('waterfront-quay:')).map(b=>{const [a,d,e,f]=b.pts,nx=f.x-a.x,nz=f.z-a.z,length=Math.hypot(nx,nz);return {a:{x:(a.x+f.x)/2,z:(a.z+f.z)/2},b:{x:(d.x+e.x)/2,z:(d.z+e.z)/2},nx:nx/length,nz:nz/length};});
  const focus=c.geoToWorld(39.2854,-76.6117),segments=segmentsFromColliders.sort((a,b)=>Math.hypot(a.a.x-focus.x,a.a.z-focus.z)-Math.hypot(b.a.x-focus.x,b.a.z-focus.z));
  for(const s of segments){
   const x=(s.a.x+s.b.x)/2-s.nx*40,z=(s.a.z+s.b.z)/2-s.nz*40;
   if(Math.hypot(x-focus.x,z-focus.z)>350)continue;
   const candidate=c.inspectBoatCandidate(x,z,5);if(!candidate?.inside)continue;
   if(c.startBoatMode({spawnX:x,spawnZ:z,candidate,yaw:Math.atan2(s.nx,s.nz),transportCatalogId:'harbor-passenger-launch',source:'verification-water-placement'}))return {x:c.boat.x,z:c.boat.z,edge:{x:(s.a.x+s.b.x)/2,z:(s.a.z+s.b.z)/2,nx:s.nx,nz:s.nz},fleet:c.maritimeRuntime?.snapshot?.()};
  }
  return null;
 });
 assert.ok(start,'A small passenger vessel must be admitted in the mapped harbor water');
 await page.screenshot({path:out+'/harbor-launch.png'});
 for(let i=0;i<5;i++)await stepGameplayKeys(page,'ArrowUp',6000);
 const finish=await page.evaluate(()=>({x:venueCtx.boat.x,z:venueCtx.boat.z,speed:venueCtx.boat.speed,label:venueCtx.boatMode.vesselLabel,
  localWaterPatchVisible:venueCtx.boatMode.waterPatch?.visible===true,
  mappedWaveSurfaces:venueCtx.waterWaveVisuals.filter(m=>m.userData?.weWaterWaveConfig?.waterBody&&m.userData?.weWaterWaveShader).length}));
 const distanceFromWall=-(finish.x-start.edge.x)*start.edge.nx-(finish.z-start.edge.z)*start.edge.nz;
 assert.ok(Math.hypot(finish.x-start.x,finish.z-start.z)>5,'Throttle must move the launch');
 assert.ok(distanceFromWall>=8,`The bow must stay outside the quay, got ${distanceFromWall}`);
 assert.equal(finish.localWaterPatchVisible,false,'Mapped harbor waves must use the clipped water footprint, not a circle over dry land');
 assert.ok(finish.mappedWaveSurfaces>0,'Mapped harbor surfaces must keep their animated water shaders');
 await page.screenshot({path:out+'/quay-stop.png'});
 await stepGameplayKeys(page,'ArrowDown',6000);
 const reversed=await page.evaluate(()=>({x:venueCtx.boat.x,z:venueCtx.boat.z}));
 const reverseDistance=-(reversed.x-start.edge.x)*start.edge.nx-(reversed.z-start.edge.z)*start.edge.nz;
 assert.ok(reverseDistance>distanceFromWall+1,'The vessel must be able to reverse away after contact');
 return {scope:'Diagnostic launch placement in real mapped water; normal DOM throttle/reverse and runtime fixed-step movement, not a performance measurement',start,finish,reversed,distanceFromWall,reverseDistance};
}
