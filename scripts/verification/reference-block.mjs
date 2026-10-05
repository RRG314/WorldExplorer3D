import {verifyReferenceBlockJourney} from './reference-block-journey.mjs';
import {sourceFingerprint} from './source-fingerprint.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {stagingCaptureAttestation} from './staging-capture-attestation.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';

const label=process.env.WE3D_REFERENCE_LABEL||'current';
assert.match(label,/^[a-z0-9-]+$/);
const out=`output/verification/reference-block/${label}`;
await fs.mkdir(out,{recursive:true});
const privateDir=await fs.mkdtemp(path.join(tmpdir(),'we3d-reference-'));
let identity,browser,server;
const report={instrumented:process.env.WE3D_REFERENCE_PROFILE==='1',scope:'Source app, real Baltimore geometry and staged inspection poses; keyboard movement; local staging-attested verification, not hosted or physical-mobile acceptance',errors:[],stops:[]};
report.sourceAtStart=sourceFingerprint();
try{
 identity=await stagingCaptureAttestation();
 const credential=path.join(privateDir,'attestation.json');
 await fs.writeFile(credential,JSON.stringify({projectId:'we3d-staging-20260712',appId:'1:524178734996:web:f59acbc9014f0e26f51981',expiresAt:new Date(Date.now()+900000).toISOString(),token:identity.token}),{mode:0o600});
 process.env.WE3D_STAGING_APP_CHECK_FILE=credential;
 server=await startStaticServer({rootDir:process.cwd(),ports:[4397]});
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 if(report.instrumented){page.referenceHeap=await page.context().newCDPSession(page);await page.referenceHeap.send('HeapProfiler.startSampling',{samplingInterval:65536,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});}
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&/THREE|shader|WebGL/.test(m.text()))report.errors.push(m.text())});
 await configureStagingAppCheck(page,`http://127.0.0.1:${server.port}`);
 await page.goto(`http://127.0.0.1:${server.port}/app/?loc=custom&lat=39.2904&lon=-76.6122&lname=Baltimore&launch=earth&gm=free&mode=walking`,{waitUntil:'load'});
 if(await page.locator('#landingPrimaryCta').isVisible())await page.locator('#landingPrimaryCta').click();
 await page.waitForFunction(()=>window.__WE3D_RUNTIME_READY__===true,null,{timeout:90000});
 if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
 await page.locator('#globeSelectorStartBtn').click();
 await page.evaluate(async()=>{window.referenceCtx=(await import('/app/js/shared-context.js?v=55')).ctx;});
 await page.waitForFunction(()=>referenceCtx.initialEarthWorldReady===true&&getComputedStyle(document.getElementById('loading')).display==='none',null,{timeout:150000});
 await page.evaluate(()=>{referenceCtx.closeWorldDiscovery?.();referenceCtx.setTimeOfDay('day');referenceCtx.setWeatherMode('clear');});
 await page.waitForTimeout(4000);
 for(const stop of [{id:'calvert-block',lat:39.28884,lon:-76.612329,yaw:Math.PI+.12},{id:'light-street',lat:39.2886,lon:-76.6137,yaw:0},{id:'harbor-front',lat:39.2857,lon:-76.6124,yaw:1.5}]){
  await page.evaluate(p=>{const c=referenceCtx,x=(p.lon-c.LOC.lon)*c.SCALE*Math.cos(c.LOC.lat*Math.PI/180),z=(c.LOC.lat-p.lat)*c.SCALE,g=c.SurfaceQuery.walkAt(x,z,{currentY:100,sampleRenderedMesh:true});Object.assign(c.Walk.state.walker,{x,z,y:g.position.y+1.7,vy:0,yaw:p.yaw,lookYawOffset:0,_resolvedGroundState:null});},stop);
  await page.waitForTimeout(7000);
  await page.screenshot({path:`${out}/${stop.id}.png`});
  if(stop.id==='calvert-block')await page.evaluate(()=>{const w=referenceCtx.Walk.state.walker;window.referencePose={x:w.x,y:w.y,z:w.z,yaw:w.yaw};});
  report.stops.push(await page.evaluate(id=>{const c=referenceCtx,w=c.Walk.state.walker;return {id,position:{x:w.x,y:w.y,z:w.z},details:c.buildingExteriorDetailPublication,lighting:{sun:c.sun?.intensity,hemi:c.hemiLight?.intensity,exposure:c.renderer.toneMappingExposure,quality:c.renderQualityLevel,shadows:c.renderer.shadowMap.enabled,shadowPolicy:c.sun?.userData?.shadowPolicy,sunPosition:c.sun?.position,sunTarget:c.sun?.target?.position,environment:!!c.scene.environment},dressing:c.streetFurnitureMeshes.find(o=>o.userData?.referenceBlock)?.userData,treeModels:c.vegetationModelStatus,trees:c.vegetationFeatures.filter(p=>p.source==='authored-reference-block').map(p=>({x:p.x,z:p.z,model:p.modelKind})),pavement:c.streetPavement?.stats,roadDetail:c.transportDetail?.stats,roads:c.roads.filter(r=>r.pts?.some(p=>Math.hypot(p.x-w.x,p.z-w.z)<65)).map(r=>({name:r.name,type:r.type,width:r.width,tags:r.transportRecord?.sourceTags,source:r.transportRecord?.sourceCompleteness,pts:r.pts.map(p=>({x:p.x,y:p.y,z:p.z}))})),render:{...c.renderer.info.render,memory:{...c.renderer.info.memory},programs:c.renderer.info.programs.length}}},stop.id));
 }
 await page.evaluate(()=>{const c=referenceCtx,p=c.streetFurnitureMeshes.find(o=>o.userData?.referenceBlock)?.userData.plan.find(p=>p.kind==='planter');window.referencePlanter=p;});
 report.source=await page.evaluate(()=>({publication:referenceCtx.worldPublication?.layers?.transport,terrainAuthority:referenceCtx.transportSurfacePublication?.authority,renderRoads:referenceCtx.roadMeshes.filter(m=>m.userData?.isRoadBatch&&!m.userData?.isRoadMarking).slice(0,3).map(m=>({name:m.name,material:{name:m.material.name,map:!!m.material.map,mapRepeat:m.material.map?.repeat,color:m.material.color.getHexString(),visible:m.visible},bounds:m.geometry.boundingSphere}))}));
 await page.evaluate(()=>{const c=referenceCtx,s=window.referencePose;Object.assign(c.Walk.state.walker,s,{vy:0,_resolvedGroundState:null});c.setTimeOfDay('night');});await page.waitForTimeout(2000);await page.screenshot({path:`${out}/night.png`});
 await page.evaluate(()=>{const c=referenceCtx,p=c.streetFurnitureMeshes.find(o=>o.userData?.referenceBlock).userData.plan.filter(p=>p.kind==='bench')[1];const x=p.x+Math.sin(p.yaw)*-2,z=p.z+Math.cos(p.yaw)*-2;Object.assign(c.Walk.state.walker,{x,z,y:c.GroundHeight.walkSurfaceY(x,z)+1.7,yaw:p.yaw+Math.PI,lookYawOffset:0,vy:0,_resolvedGroundState:null});});await page.waitForTimeout(1500);await page.screenshot({path:`${out}/seating-night.png`});
 report.night=await page.evaluate(async()=>({windows:(await import('/app/js/world/facade-lighting.js')).facadeNightUniform.value,activeLamps:referenceCtx.streetLightPool.filter(p=>p.light.intensity>0).length}));assert.equal(report.night.windows,1);assert.ok(report.night.activeLamps>=3);
 await page.evaluate(()=>referenceCtx.setTimeOfDay('day'));
 const before=await page.evaluate(()=>({x:referenceCtx.Walk.state.walker.x,z:referenceCtx.Walk.state.walker.z}));
 await page.keyboard.down('w');await page.waitForTimeout(1200);await page.keyboard.up('w');
 const after=await page.evaluate(()=>({x:referenceCtx.Walk.state.walker.x,z:referenceCtx.Walk.state.walker.z}));
 report.walk={before,after,distance:Math.hypot(after.x-before.x,after.z-before.z)};assert.ok(report.walk.distance>.2);
 await page.evaluate(()=>referenceCtx.setWeatherMode('rain'));await page.waitForTimeout(2500);await page.screenshot({path:`${out}/rain.png`});await page.evaluate(()=>referenceCtx.setWeatherMode('clear'));
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${out}/phone.png`});
 report.text=await page.evaluate(()=>{const s=JSON.parse(window.render_game_to_text());return {environment:s.environment,modes:s.modes,worldConditions:s.worldConditions,gameStarted:s.gameStarted,paused:s.paused,worldLoading:s.worldLoading,counts:s.worldCounts};});
 await verifyReferenceBlockJourney(page,report,out);
 report.sourceAtEnd=sourceFingerprint();assert.equal(report.sourceAtEnd.acceptanceFingerprint,report.sourceAtStart.acceptanceFingerprint,'Source changed during verification');
 assert.deepEqual(report.errors,[]);if(report.instrumented)report.diagnosticComplete=true;else report.ok=true;
}catch(e){report.error=String(e.stack||e);process.exitCode=1;}
finally{await fs.writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser?.close();await server?.close();await identity?.cleanup();await fs.rm(privateDir,{recursive:true,force:true});}
console.log(JSON.stringify({ok:report.ok,stops:report.stops.length,errors:report.errors,error:report.error}));
