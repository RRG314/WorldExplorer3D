// Real vehicle motion through both faces of a mapped tunnel. The driver sends
// keyboard input; only initial placement is teleported. No profile/collision
// owner or frame time is replaced by the harness.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
const out=process.env.WE3D_VERIFY_OUTPUT_DIR||'output/verification/transport-portal-drive';
await mkdir(out,{recursive:true});
const server=await startStaticServer({rootDir:process.env.WE3D_VERIFY_ROOT||process.cwd(),ports:[4527]});
const owned=await chromium.launchServer({channel:'chrome',headless:false});
const browser=await chromium.connect(owned.wsEndpoint());
const page=await browser.newPage({viewport:{width:1440,height:900}});
const report={scope:'Monaco mapped main-carriageway entry, bore and exit using real vehicle controls',errors:[],frames:[],checks:{}};
page.on('pageerror',e=>report.errors.push(e.message));
try{
 await configureStagingAppCheck(page,`http://127.0.0.1:${server.port}`);
 await page.route(/https:\/\/[^/]*overpass[^/]*\/.*interpreter/i,r=>r.abort());
 await page.route('**/listApprovedExteriorRepresentations',r=>r.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:'{"representations":[]}'}));
 await page.goto(`http://127.0.0.1:${server.port}/app/?loc=custom&lat=43.7384&lon=7.4246&lname=Monaco&launch=earth&gm=free&mode=driving`);
 await page.waitForFunction(()=>window.__WE3D_RUNTIME_READY__,null,{timeout:60000});
 await page.evaluate(async()=>{window.driveCtx=(await import('/app/js/shared-context.js?v=55')).ctx});
 if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
 await page.getByRole('button',{name:'Explore',exact:true}).click();
 await page.waitForFunction(()=>!driveCtx.worldLoading&&driveCtx.worldLoadRuntimeState?.status==='ready',null,{timeout:240000});
 console.log('Ready; entering mapped tunnel');
 report.route=await page.evaluate(()=>{
  const ctx=driveCtx,r=ctx.roads.find(r=>r.sourceFeatureId==='shortbread:streets:14:8529:5974:10:0');
  if(!r?.tunnelSystemModel?.portalDistances?.length)throw Error('Expected complete mapped tunnel not loaded');
  const endpointRoad = (point, exclude) => (r.transportConnections || []).map(link => link.feature)
    .filter(f => f && f !== r && f !== exclude && f.driveable !== false && f.structureSemantics?.terrainMode === 'at_grade' &&
      [f.pts[0],f.pts.at(-1)].some(p=>Math.hypot(p.x-point.x,p.z-point.z)<2.5))
    .sort((a,b)=>Number(b.name===r.name)-Number(a.name===r.name))[0];
  const before=endpointRoad(r.pts[0]), after=endpointRoad(r.pts.at(-1),before);
  if(!before||!after)throw Error('Both real connected surface approaches are required for portal acceptance');
  const path=[], owners=[];
  const append=(feature,points)=>{for(const p of points){if(path.length&&Math.hypot(p.x-path.at(-1).x,p.z-path.at(-1).z)<.001)continue;if(path.length)owners.push(feature);path.push(p)}};
  const orient=(feature,point,atEnd)=>{const first=feature.pts[0],last=feature.pts.at(-1),firstNearest=Math.hypot(first.x-point.x,first.z-point.z)<Math.hypot(last.x-point.x,last.z-point.z);return firstNearest===atEnd?[...feature.pts].reverse():feature.pts};
  append(before,orient(before,r.pts[0],true));
  const distancesFor=pts=>{const d=[0];for(let i=1;i<pts.length;i++)d.push(d.at(-1)+Math.hypot(pts[i].x-pts[i-1].x,pts[i].z-pts[i-1].z));return d};
  const prefix=distancesFor(path).at(-1);
  append(r,r.pts);append(after,orient(after,r.pts.at(-1),false));
  window.driveRoad=r;window.drivePath=path;window.driveOwners=owners;
  const distances=distancesFor(path);
  window.driveDistances=distances;
  window.pointOnRoute=d=>{let i=1;while(i<distances.length-1&&distances[i]<d)i++;const a=path[i-1],b=path[i],t=Math.max(0,Math.min(1,(d-distances[i-1])/(distances[i]-distances[i-1])));return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,angle:Math.atan2(b.x-a.x,b.z-a.z),road:owners[i-1]}};
  const p=pointOnRoute(4),y=ctx.sampleFeatureSurfaceY(p.road,p.x,p.z);
  ctx.setTimeOfDay?.('day');ctx.setTravelMode('drive');
  const resolve=ctx.resolveUrbanActorCollision;ctx.resolveUrbanActorCollision=(...args)=>{const result=resolve(...args);window.lastUrbanContact=result.collision?{...result,from:args[0],to:args[1],actorY:ctx.car.y}:null;return result;};
  Object.assign(ctx.car,{...p,y:y+1.2,vy:0,vx:0,vz:0,road:p.road,onRoad:true,isAirborne:false,_lastSurfaceY:y,_lastRawSurfaceY:y,_roadContinuityTimer:.7,speed:0,vFwd:0,vLat:0,steerSm:0,yawRate:0,rearSlip:0});
  ctx.invalidateRoadCache();ctx.carMesh.position.set(p.x,y+1.2,p.z);ctx.camMode=0;
  ctx.camera.position.set(p.x-Math.sin(p.angle)*5,y+3,p.z-Math.cos(p.angle)*5);ctx.camera.userData.lookTarget={x:p.x,y:y+.5,z:p.z};
  return {id:r.sourceFeatureId,length:distances.at(-1),approaches:[before.sourceFeatureId,after.sourceFeatureId],portals:r.tunnelSystemModel.portalDistances.map(d=>d+prefix),foundationLimits:r.tunnelObstructionLimits,continuity:ctx.transportJunctionProfile.continuity.discontinuityCount};
 });
 report.geometry=await page.evaluate(()=>({solidCompilation:driveCtx.tunnelSolidCompilation,
   masks:driveCtx.structureTerrainPortalMaskStats,routeSolid:!!driveRoad.tunnelSolidBoundary,
   routeShell:driveRoad.tunnelSystemModel.shellRanges,routeClearance:driveRoad.tunnelSystemModel.clearance}));
 const held=new Set();const keys=async wanted=>{for(const k of held)if(!wanted.has(k)){await page.keyboard.up(k);held.delete(k)}for(const k of wanted)if(!held.has(k)){await page.keyboard.down(k);held.add(k)}};
 const deadline=Date.now()+180000;let completed=false,previous=null,lastMovement=Date.now(),furthest=0;const images=new Set();
 while(Date.now()<deadline){
  const state=await page.evaluate(()=>{
   const ctx=driveCtx,r=driveRoad,c=ctx.car,path=drivePath;let nearest=Infinity,along=0,owner=r;
   for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),t=Math.max(0,Math.min(1,((c.x-a.x)*dx+(c.z-a.z)*dz)/(length*length))),distance=Math.hypot(c.x-a.x-dx*t,c.z-a.z-dz*t);if(distance<nearest){nearest=distance;along=driveDistances[i-1]+length*t;owner=driveOwners[i-1]}}
   const aim=pointOnRoute(along+9),angle=Math.atan2(aim.x-c.x,aim.z-c.z),error=Math.atan2(Math.sin(angle-c.angle),Math.cos(angle-c.angle));
   const floor=ctx.sampleFeatureSurfaceY(owner,c.x,c.z),trees=ctx.vegetationFeatures.filter(t=>Math.hypot(t.x-c.x,t.z-c.z)<3).map(t=>({x:t.x,z:t.z,baseY:t.baseY}));
   return {along,lateral:nearest,error,speed:c.speed,x:c.x,y:c.y,z:c.z,floor,ground:c.groundContact,airborne:c.isAirborne,onRoad:c.onRoad,road:c.road?.sourceFeatureId,cameraMode:ctx.camera.userData.vehicleClearanceMode,urbanContact:window.lastUrbanContact,trees};
  });
  report.frames.push(state);
  if(state.along>furthest+.1){furthest=state.along;lastMovement=Date.now();}
  previous=state;
  const phase=state.along<report.route.portals[0]?'approach':state.along<report.route.portals.at(-1)?'bore':'exit';
  if(!images.has(phase)){
    await page.screenshot({path:`${out}/${phase}.png`});
    report.visualProbes ||= {};
    report.visualProbes[phase]=await page.evaluate(()=>{
      const ctx=driveCtx, ray=new THREE.Raycaster(), samples=[];
      for(const [x,y] of [[0,0],[0,.4],[-.4,.2],[.4,.2],[0,-.3]]){
        ray.setFromCamera(new THREE.Vector2(x,y),ctx.camera);
        const hits=ray.intersectObjects(ctx.scene.children,true).filter(h=>h.object.visible&&h.face&&h.distance<80).slice(0,5);
        samples.push({x,y,hits:hits.map(h=>{const o=h.object,g=o.geometry,p=g.attributes.position,uv=g.attributes.uv;
          return {name:o.name,type:o.type,distance:h.distance,point:{x:h.point.x,y:h.point.y,z:h.point.z},
            flags:Object.fromEntries(Object.entries(o.userData||{}).filter(([k,v])=>typeof v==='string'||typeof v==='boolean')),
            material:o.material?.type, vertices:[h.face.a,h.face.b,h.face.c].map(i=>new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld).toArray()),
            uv:uv?[h.face.a,h.face.b,h.face.c].map(i=>[uv.getX(i),uv.getY(i)]):null};})});
      }
      return samples;
    });
    images.add(phase);console.log(phase,JSON.stringify({along:state.along,y:state.y,lateral:state.lateral}));
  }
  if(state.along>=report.route.length-6){completed=true;break;}
  if(Date.now()-lastMovement>8000)throw Error(`Vehicle stopped progressing at ${state.along.toFixed(2)}; retained actual collision/contact evidence.`);
  const wanted=new Set();if(state.speed<28)wanted.add('w');if(state.speed>34)wanted.add('s');
  if(state.error>.055)wanted.add('a');else if(state.error<-.055)wanted.add('d');
  await keys(wanted);await page.waitForTimeout(100);
 }
 await keys(new Set());
 await page.screenshot({path:`${out}/after-exit.png`});
 report.checks={completed,enteredAndExited:images.has('approach')&&images.has('bore')&&images.has('exit'),zeroJunctionSteps:report.route.continuity===0,
  remainedOnCarriageway:report.frames.every(f=>f.lateral<3.2),noAirborneFrames:report.frames.every(f=>!f.airborne),noRuntimeErrors:report.errors.length===0};
 assert.deepEqual(Object.entries(report.checks).filter(([,v])=>!v),[]);
}catch(e){
 try{await page.screenshot({path:`${out}/failure.png`});report.nearbyVehicles=await page.evaluate(()=>{const c=driveCtx.car;return driveCtx.urbanSandboxRuntime?.vehicles.filter(v=>Math.hypot(v.x-c.x,v.z-c.z)<12).map(v=>({id:v.id,x:v.x,y:v.y,z:v.z,width:v.variant?.width,height:v.variant?.height,length:v.variant?.length,ambient:v.ambientTraffic,attached:v.attachedToPlayer}));});report.blockers=await page.evaluate(()=>{const c=driveCtx.car;return driveCtx.getNearbyBuildings(c.x,c.z,9).filter(b=>b.maxY>c.y-2&&b.minY<c.y+3&&b.minX<c.x+4&&b.maxX>c.x-4&&b.minZ<c.z+4&&b.maxZ>c.z-4).map(b=>({id:b.sourceBuildingId,kind:b.structureColliderKind,minX:b.minX,maxX:b.maxX,minZ:b.minZ,maxZ:b.maxZ,minY:b.minY,maxY:b.maxY,pts:b.pts}));});}catch{}
 report.failure=String(e.stack||e);process.exitCode=1;}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await closeOwnedBrowser(owned);await server.close();}
console.log(JSON.stringify({checks:report.checks,failure:report.failure}));
