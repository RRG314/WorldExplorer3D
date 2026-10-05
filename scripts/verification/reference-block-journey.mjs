import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { sampleFrameWindow } from './frame-window.mjs';
import { frameHitches } from './frame-hitches.mjs';
import { followRoadRoute } from './travel-road-route.mjs';

// Explicit inspection poses are setup only. All traversal during a measured
// window uses ordinary keyboard input, with no physics or camera overrides.
export async function verifyReferenceBlockJourney(page, report, output) {
  await page.setViewportSize({width:1440,height:900});
  await page.evaluate(()=>{
    const c=referenceCtx;
    c.setWeatherMode('clear');c.setTimeOfDay('day');
    document.activeElement?.blur();
  });
  const inventory=()=>page.evaluate(()=>{
    const c=referenceCtx,root=c.streetFurnitureMeshes.find(o=>o.userData?.referenceBlock);
    return {roots:c.streetFurnitureMeshes.filter(o=>o.userData?.referenceBlock).length,
      fixtures:root?.userData.plan.length,lamps:root?.userData.lamps,
      colliders:c.dynamicBuildingColliders.filter(o=>o.sourceBuildingId?.startsWith('authored-calvert')).length,
      trees:c.vegetationFeatures.filter(p=>p.source==='authored-reference-block').length,
      batches:root?.children.length};
  });
  report.inventory=await inventory();
  assert.deepEqual(report.inventory,{roots:1,fixtures:10,lamps:3,colliders:13,trees:5,batches:4});

  report.collision=await page.evaluate(()=>{
    const c=referenceCtx,p=c.streetFurnitureMeshes.find(o=>o.userData?.referenceBlock).userData.plan.find(p=>p.kind==='bench');
    const normal={x:Math.sin(p.yaw),z:Math.cos(p.yaw)};
    const x=p.x-normal.x*1.8,z=p.z-normal.z*1.8;
    return {fixture:p,
      centerBlocked:c.checkBuildingCollision(p.x,p.z,.3,{actorBaseY:p.y,actorHeight:1.65}).collision,
      laneClear:!c.checkBuildingCollision(x,z,.3,{actorBaseY:p.y,actorHeight:1.65}).collision,
      laneSupported:Number.isFinite(c.streetPavement.sampleAt(x,z))};
  });
  assert.equal(report.collision.centerBlocked,true);
  assert.equal(report.collision.laneClear,true);
  assert.equal(report.collision.laneSupported,true);

  const target=await page.evaluate(()=>referenceCtx.listSupportedInteriorsNear(-10,110,85,12).find(s=>!s.synthetic&&s.mappedEntrance));
  assert.ok(target?.approachTarget,'Reference block has no usable entrance');
  await page.evaluate(target=>{
    const c=referenceCtx,p=target.approachTarget,w=c.Walk.state.walker;
    const dx=p.x-target.entryAnchor.x,dz=p.z-target.entryAnchor.z,length=Math.hypot(dx,dz)||1;
    const x=p.x+dx/length,z=p.z+dz/length;
    Object.assign(w,{x,z,y:c.SurfaceQuery.walkAt(x,z,{currentY:100,sampleRenderedMesh:true}).position.y+1.7,
      yaw:Math.atan2(-dx,-dz),vy:0,lookYawOffset:0,_resolvedGroundState:null});
  },target);
  await page.waitForTimeout(1000);
  await page.keyboard.down('w');await page.waitForTimeout(450);await page.keyboard.up('w');
  await page.waitForSelector('#interiorPrompt.show',{timeout:10000});
  report.entrance={target,prompt:await page.locator('#interiorPrompt').innerText()};
  await page.screenshot({path:`${output}/entrance.png`});
  await page.keyboard.press('KeyE');
  await page.waitForFunction(()=>!!referenceCtx.activeInterior,null,{timeout:20000});
  report.entrance.entered=await page.evaluate(()=>({id:referenceCtx.activeInterior.support?.key,mode:referenceCtx.activeInterior.mode}));
  await page.keyboard.down('w');await page.waitForTimeout(900);await page.keyboard.up('w');
  await page.waitForTimeout(500);await page.screenshot({path:`${output}/interior.png`});
  await page.evaluate(()=>{
    const c=referenceCtx,active=c.activeInterior,p=active.interactions.find(i=>i.kind==='exit');
    if(!p)throw Error('No exit interaction');
    Object.assign(c.Walk.state.walker,{x:p.x,z:p.z,y:active.floorBaseY+1.7,vy:0,_resolvedGroundState:null});
  });
  await page.waitForFunction(()=>document.querySelector('#interiorPrompt.show')?.textContent?.match(/exit/i),null,{timeout:10000});
  await page.keyboard.press('KeyE');
  await page.waitForFunction(()=>!referenceCtx.activeInterior,null,{timeout:10000});
  report.afterExit=await inventory();assert.deepEqual(report.afterExit,report.inventory);
  report.entrance.exited=true;
  console.log('Reference block: furniture clearance and real entrance/exit passed.');

  const budgets=JSON.parse(await readFile('config/performance-budgets.json','utf8')).desktopTier;
  report.performance=[];
  for(const mode of ['walk','drive']){
    await page.locator('#travelBtn').click();
    await page.locator(mode==='walk'?'#fWalk':'#fDriving').click();
    await page.waitForFunction(mode=>referenceCtx.getCurrentTravelMode()===mode,mode,{timeout:10000});
    await page.locator('#travelBtn').blur();
    const route=await page.evaluate(mode=>{
      const c=referenceCtx,actor=mode==='walk'?c.Walk.state.walker:c.car;
      let points=[{x:-8.5,z:130},{x:-17,z:20}];
      if(mode==='drive'){
        const road=c.roads.find(r=>r.name==='South Calvert Street'&&r.pts.some(p=>p.z>215)&&r.pts.some(p=>p.z<35));
        if(!road)throw Error('Reference block carriageway unavailable');
        const spine=road.pts[0].z>road.pts.at(-1).z?road.pts:[...road.pts].reverse();
        const atZ=z=>{
          for(let i=1;i<spine.length;i++){
            const a=spine[i-1],b=spine[i];
            if(a.z>=z&&b.z<=z)return {x:a.x+(b.x-a.x)*(z-a.z)/(b.z-a.z),z};
          }
          throw Error('Reference route extends beyond the mapped carriageway');
        };
        // Remain on this block; the former extrapolated route cut across the
        // landscaped island beyond the mapped segment's north endpoint.
        points=[atZ(215),...spine.filter(p=>p.z<215&&p.z>35).map(p=>({x:p.x,z:p.z})),atZ(35)];
      }
      const p=points[0],next=points[1],yaw=Math.atan2(next.x-p.x,next.z-p.z);
      Object.assign(actor,{x:p.x,z:p.z,y:mode==='walk'?c.GroundHeight.walkSurfaceY(p.x,p.z)+1.7:c.GroundHeight.carCenterY(p.x,p.z),
        yaw,angle:yaw,speed:0,vFwd:0,vLat:0,vx:0,vy:0,vz:0,lookYawOffset:0,onGround:true,isAirborne:false,_resolvedGroundState:null});
      window.__WE3D_TRAVEL_ACTOR__=actor;window.referenceActor=actor;
      return {points,length:points.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-points[i].x,p.z-points[i].z),0)};
    },mode);
    await page.waitForTimeout(4000);
    const profile=process.env.WE3D_REFERENCE_PROFILE==='1' && mode==='drive';
    let cdp;
    if(profile){cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.start');}
    const signal={stopped:false};
    const driver=followRoadRoute(page,route,signal,{mode});
    let raw,journey;
    try{raw=await page.evaluate(sampleFrameWindow,{durationMs:30000,actorKey:'referenceActor',backgroundContextKey:'referenceCtx',collectDiagnostics:false});}
    finally{signal.stopped=true;journey=await driver;}
    if(profile){await writeFile(`${output}/drive-cpu.json`,JSON.stringify(await cdp.send('Profiler.stop')));await cdp.detach();await writeFile(`${output}/allocations.json`,JSON.stringify(await page.referenceHeap.send('HeapProfiler.stopSampling')));await page.referenceHeap.detach();}
    const sorted=[...raw.deltas].sort((a,b)=>a-b),pct=p=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))];
    const sample={mode,averageFps:raw.deltas.length/raw.elapsedMs*1000,p95:pct(.95),p99:pct(.99),
      distance:raw.distanceTraveled,movingMs:raw.movingMs,hitches:frameHitches(raw.deltas,budgets.hitches)};
    report.performance.push(sample);
    if(mode==='drive'){
      sample.roadContact=await page.evaluate(poses=>({samples:poses.length,
        supported:poses.filter(p=>Number.isFinite(referenceCtx.roadContactIndex.sampleAt(p.x,p.z))).length}),journey.samples);
      assert.ok(sample.roadContact.samples>100,'Driving route was not sampled');
      assert.equal(sample.roadContact.supported,sample.roadContact.samples,'Driving route left the mapped carriageway');
    }
    sample.backgroundOwners=await page.evaluate(()=>({details:referenceCtx.buildingExteriorDetailTiming,pavement:referenceCtx.streetPavement?.stats?.durationMs,vegetation:referenceCtx.vegetationRefreshTiming}));
    await writeFile(`${output}/${mode}-frames.json`,JSON.stringify({raw,journey}));
    await page.screenshot({path:`${output}/${mode}-after.png`});
    assert.ok(sample.distance>(mode==='walk'?45:100),`${mode} did not traverse the block`);
    assert.ok(sample.averageFps>=budgets.budgets.minimumAverageFps,`${mode} FPS ${sample.averageFps}`);
    assert.ok(sample.p99<=budgets.budgets.maximumP99FrameMs,`${mode} p99 ${sample.p99}`);
    if(!profile)assert.ok(sample.hitches.passed,`${mode} stalls: ${JSON.stringify(sample.hitches)}`);
    console.log(`Reference block: ${mode} ${sample.averageFps.toFixed(1)} FPS, p99 ${sample.p99.toFixed(1)} ms, ${sample.distance.toFixed(1)} units traveled.`);
  }
}
