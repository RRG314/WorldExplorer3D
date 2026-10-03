import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {stagingCaptureAttestation} from './staging-capture-attestation.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const privateDir=await fs.mkdtemp(path.join(tmpdir(),'we3d-swimming-ui-'));
let identity;
const server=await startStaticServer({rootDir:process.cwd(),ports:[4397]});
const browser=await chromium.launch({channel:'chrome',headless:true});
const dir=process.env.WE3D_DISTRICT_OUT || 'output/verification/product-plan/earth-district';
await fs.mkdir(dir,{recursive:true});
const report={scope:'Actual loaded Baltimore district; staged inspection/start poses, then keyboard movement through the authored promenade route; local completion and phone layout, not physical-device or production acceptance',errors:[]};
try {
 identity=await stagingCaptureAttestation();
 const credential=path.join(privateDir,'attestation.json');
 await fs.writeFile(credential,JSON.stringify({projectId:'we3d-staging-20260712',appId:'1:524178734996:web:f59acbc9014f0e26f51981',expiresAt:new Date(Date.now()+600000).toISOString(),token:identity.token}),{mode:0o600});
 process.env.WE3D_STAGING_APP_CHECK_FILE=credential;
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await configureStagingAppCheck(page,`http://127.0.0.1:${server.port}`);
 page.on('requestfailed',request=>{const u=new URL(request.url());(report.failedRequests ||= []).push({host:u.hostname,path:u.pathname,error:request.failure()?.errorText})});
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('console',async msg=>{if(msg.text().startsWith('[WorldLoad] Essential Earth gameplay')){report.startupStack=await msg.args()[1]?.evaluate(e=>e?.stack);}});
 async function openEarth(){
  if(await page.locator('#landingPrimaryCta').isVisible())await page.locator('#landingPrimaryCta').click();
  await page.waitForFunction(()=>window.__WE3D_RUNTIME_READY__===true,null,{timeout:90000});
  if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
  await page.locator('#globeSelectorStartBtn').click();
  await page.evaluate(async()=>{window.swimCtx=(await import('/app/js/shared-context.js?v=55')).ctx;});
  try {await page.waitForFunction(()=>!!swimCtx.Walk?.state?.characterMesh && swimCtx.initialEarthWorldReady===true || swimCtx.worldLoadRuntimeState?.status==='failed',null,{timeout:90000});}
  catch(error){
   report.startup=await page.evaluate(()=>({gameStarted:swimCtx.gameStarted,worldLoading:swimCtx.worldLoading,ready:swimCtx.initialEarthWorldReady,environment:swimCtx.getEnv?.(),publication:!!swimCtx.worldPublication,loadingText:document.getElementById('loading')?.innerText}));
   await page.screenshot({path:`${dir}/swimming-startup-failure.png`});throw error;
  }
  const startupFailure=await page.evaluate(()=>swimCtx.worldLoadRuntimeState?.gameplayRuntimeError || swimCtx.worldLoadRuntimeState?.firstRenderError || null);
  if(startupFailure)throw Error(`Earth startup failed: ${startupFailure}`);

 }
 await page.goto(`http://127.0.0.1:${server.port}/app/?loc=custom&lat=39.2904&lon=-76.6122&lname=Baltimore&launch=earth&gm=free&mode=walking`,{waitUntil:'load'});
 await openEarth();

 await page.waitForFunction(()=>getComputedStyle(document.getElementById('loading')).display==='none',null,{timeout:60000});
 await page.evaluate(()=>{swimCtx.closeWorldDiscovery?.();swimCtx.setTimeOfDay('day');});

 report.world=await page.evaluate(()=>{const c=swimCtx;return {location:c.LOC,ready:c.initialEarthWorldReady,water:c.waterAreas?.length,buildings:c.buildings?.length,pois:(c.poiMeshes||[]).slice(0,20).map(x=>({name:x.userData?.name})),fleet:c.maritimeRuntime?.snapshot?.(),landmarks:c.curatedLandmarkMetrics,lighting:{hemi:c.hemiLight?.intensity,sun:c.sun?.intensity,ambient:c.ambientLight?.intensity},facilities:c.transportFacilityGraph?.byDomain?.maritime?.map(r=>({type:r.type,name:r.name,point:r.geometry?.points?.[0]}))}});
 if(process.env.WE3D_ACTIVITY_ACCEPTANCE==='1'){report.activities=await (await import(process.env.WE3D_ACTIVITY_GAMES==='1'?'./game-modes-browser.mjs':'./activity-lifecycle-browser.mjs')).verifyActivities(page,dir);}else{
 await page.screenshot({path:`${dir}/arrival.png`});
 for(const point of [{id:'harbor',lat:39.2857,lon:-76.6124,yaw:1.5},{id:'light-street',lat:39.2886,lon:-76.6137,yaw:0},{id:'promenade',lat:39.2848,lon:-76.6126,yaw:1.5}]){
 report[point.id]=await page.evaluate(p=>{const c=swimCtx,x=(p.lon-c.LOC.lon)*c.SCALE*Math.cos(c.LOC.lat*Math.PI/180),z=(c.LOC.lat-p.lat)*c.SCALE,ground=c.SurfaceQuery.walkAt(x,z,{currentY:100,sampleRenderedMesh:true});Object.assign(c.Walk.state.walker,{x,z,y:ground.position.y+1.7,vy:0,yaw:p.yaw,_resolvedGroundState:null});return {x,z,ground:ground.position.y,walkKeys:Object.keys(c.Walk.state)}} ,point);
 await page.waitForTimeout(1500);await page.screenshot({path:`${dir}/${point.id}.png`});
 }
 await page.evaluate(()=>{swimCtx.setTimeOfDay('night')});await page.waitForTimeout(2000);await page.screenshot({path:`${dir}/night-promenade.png`});
 report.dressing=await page.evaluate(()=>({presentation:swimCtx.harborDistrictPresentation,facades:swimCtx.buildingExteriorDetailPublication?.diagnostics,entrances:swimCtx.buildingFacadeEntrances?.diagnostics,trees:swimCtx.vegetationFeatures?.filter(p=>p.source==='authored-harbor-district').length,lights:swimCtx.streetLightPool?.filter(e=>e.light.intensity>0).length}));
 await page.evaluate(()=>swimCtx.setTimeOfDay('day'));
 if(process.env.WE3D_DISTRICT_INTERIOR_ONLY!=='1'){
 report.walk=await page.evaluate(async()=>{const m=await import('/app/js/activity-discovery/harbor-walk.js');return m.buildHarborWalk(swimCtx)});
 if(!report.walk){report.routeFailure=await page.evaluate(async()=>{const m=await import('/app/js/activity-discovery/harbor-walk.js'),c=swimCtx;return m.HARBOR_WALK.stops.map(p=>{const x=(p.lon-c.LOC.lon)*c.SCALE*Math.cos(c.LOC.lat*Math.PI/180),z=(c.LOC.lat-p.lat)*c.SCALE;return {id:p.id,x,z,water:c.isPointInsideWaterFootprint(x,z),ground:c.SurfaceQuery.walkAt(x,z,{currentY:0,sampleRenderedMesh:true}).position.y,blocked:c.checkBuildingCollision(x,z,.8)?.collision}})});throw Error('Harbor walk unavailable');}
 await page.evaluate(async walk=>{const c=swimCtx,p=walk.anchors[0];Object.assign(c.Walk.state.walker,{x:p.x,z:p.z,y:p.y+1.7,yaw:p.yaw,vy:0,_resolvedGroundState:null});await c.openActivityBrowser({activityId:walk.id});},report.walk);
 await page.waitForSelector('#activityDiscoveryPrimaryAction');
 await page.screenshot({path:`${dir}/walk-brief.png`});
 await page.locator('#activityDiscoveryPrimaryAction').click();
 for(const target of report.walk.anchors.slice(1)){
  await page.evaluate(p=>{const w=swimCtx.Walk.state.walker;w.yaw=Math.atan2(p.x-w.x,p.z-w.z);w.lookYawOffset=0;},target);
  await page.keyboard.down('w');
  try{await page.waitForFunction(p=>Math.hypot(swimCtx.Walk.state.walker.x-p.x,swimCtx.Walk.state.walker.z-p.z)<9,target,{timeout:35000});}
  finally{await page.keyboard.up('w');}
  await page.screenshot({path:`${dir}/walk-${target.id.replace(':','-')}.png`});
 }
 await page.waitForTimeout(1000);
 report.completion=await page.evaluate(async id=>(await import('/app/js/activity-discovery/runtime.js?v=9')).getCompletionState(id),report.walk.id);
 assert.equal(report.completion?.count,1);
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>swimCtx.openActivityBrowser({activityId:'baltimore-inner-harbor-walk-v1'}));await page.locator('.activityDiscoveryCompletionText').scrollIntoViewIfNeeded();await page.screenshot({path:`${dir}/phone-result.png`});
 }
 await page.setViewportSize({width:1440,height:900});
 await page.evaluate(()=>swimCtx.closeActivityBrowser?.());
 report.interiorCandidates=await page.evaluate(()=>{const w=swimCtx.Walk.state.walker;return swimCtx.listSupportedInteriorsNear(w.x,w.z,350,12)});
 const candidate=report.interiorCandidates.find(p=>!p.synthetic&&p.mappedEntrance&&p.approachTarget);
 assert.ok(candidate,'Mapped district interior available');
 report.interiorBefore=await page.evaluate(p=>{const c=swimCtx,w=c.Walk.state.walker,t=p.approachTarget,g=c.SurfaceQuery.walkAt(t.x,t.z,{currentY:w.y,sampleRenderedMesh:true});Object.assign(w,{x:t.x,z:t.z,y:g.position.y+1.7,vy:0,yaw:Math.atan2(p.x-t.x,p.z-t.z),_resolvedGroundState:null});return {colliders:c.dynamicBuildingColliders.length,benches:c.dynamicBuildingColliders.filter(o=>o.sourceBuildingId==='authored-harbor-bench').length,position:{x:w.x,z:w.z}}},candidate);
 await page.waitForTimeout(1800);
 await page.screenshot({path:`${dir}/interior-approach.png`});
 await page.keyboard.press('e');
 await page.waitForFunction(()=>!!swimCtx.activeInterior,null,{timeout:30000});
 report.interior=await page.evaluate(()=>{const a=swimCtx.activeInterior;return {key:a.key,label:a.label,mode:a.mode,interactions:a.interactions,colliders:swimCtx.dynamicBuildingColliders.length,exteriorSaved:a.outsideColliders.length,panels:(()=>{let n=0;a.group.traverse(o=>{if(o.name==='Harbor game orientation panel')n++});return n})()}});
 await page.screenshot({path:`${dir}/interior-inside.png`});
 await page.evaluate(()=>{const w=swimCtx.Walk.state.walker,panels=[];swimCtx.activeInterior.group.traverse(o=>{if(o.name==='Harbor game orientation panel'&&Math.abs(o.position.y-w.y)<2)panels.push(o.position)});panels.sort((a,b)=>Math.hypot(a.x-w.x,a.z-w.z)-Math.hypot(b.x-w.x,b.z-w.z));if(panels[0])w.yaw=Math.atan2(panels[0].x-w.x,panels[0].z-w.z)});await page.waitForTimeout(500);await page.screenshot({path:`${dir}/interior-orientation.png`});
 const exit=report.interior.interactions.find(p=>p.kind==='exit');assert.ok(exit);
 // Entry is already adjacent to the supported exit; use actual movement only.
 await page.evaluate(p=>{const w=swimCtx.Walk.state.walker;w.yaw=Math.atan2(p.x-w.x,p.z-w.z)},exit);
 const exitDistance=await page.evaluate(p=>Math.hypot(swimCtx.Walk.state.walker.x-p.x,swimCtx.Walk.state.walker.z-p.z),exit);
 if(exitDistance>1.1){await page.keyboard.down('w');try{await page.waitForFunction(p=>Math.hypot(swimCtx.Walk.state.walker.x-p.x,swimCtx.Walk.state.walker.z-p.z)<1.1,exit,{timeout:12000})}finally{await page.keyboard.up('w')}}
 await page.keyboard.press('e');await page.waitForFunction(()=>!swimCtx.activeInterior,null,{timeout:10000});
 report.interiorAfter=await page.evaluate(()=>({colliders:swimCtx.dynamicBuildingColliders.length,benches:swimCtx.dynamicBuildingColliders.filter(o=>o.sourceBuildingId==='authored-harbor-bench').length,position:{x:swimCtx.Walk.state.walker.x,z:swimCtx.Walk.state.walker.z}}));
 assert.equal(report.interiorAfter.benches,6);assert.equal(report.interiorAfter.colliders,report.interiorBefore.colliders);
 assert.ok(Math.hypot(report.interiorBefore.position.x-report.interiorAfter.position.x,report.interiorBefore.position.z-report.interiorAfter.position.z)<1);
 report.transport=await page.evaluate(async()=>{const c=swimCtx,w=c.Walk.state.walker,before={x:w.x,z:w.z};await c.setTravelMode('drive',{source:'district_acceptance'});const drive={mode:c.Walk.state.mode,x:c.car.x,z:c.car.z};await c.setTravelMode('walk',{source:'district_acceptance'});return {before,drive,after:{mode:c.Walk.state.mode,x:w.x,z:w.z},interior:!!c.activeInterior,benches:c.dynamicBuildingColliders.filter(o=>o.sourceBuildingId==='authored-harbor-bench').length}});
 assert.equal(report.transport.drive.mode,'drive');assert.equal(report.transport.after.mode,'walk');assert.equal(report.transport.benches,6);assert.equal(report.transport.interior,false);
 assert.ok(Math.hypot(report.transport.before.x-report.transport.after.x,report.transport.before.z-report.transport.after.z)<35);
 await page.screenshot({path:`${dir}/district-return.png`});
 report.text=await page.evaluate(()=>window.render_game_to_text?.());
 }
 assert.deepEqual(report.errors,[]);

}finally{await fs.writeFile(`${dir}/report.json`,JSON.stringify(report,null,2));await browser.close();await server.close();await identity?.cleanup();await fs.rm(privateDir,{recursive:true,force:true});}
console.log(JSON.stringify({ready:report.world?.ready,fleet:report.world?.fleet?.fleetCount,completion:report.completion,errors:report.errors}));
