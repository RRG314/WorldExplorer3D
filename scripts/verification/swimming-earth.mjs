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
const server=await startStaticServer({rootDir:process.cwd(),ports:[4396]});
const browser=await chromium.launch({channel:'chrome',headless:true});
const dir='output/verification/product-plan';
await fs.mkdir(dir,{recursive:true});
const report={scope:'Actual Earth mapped-water terrain, swimming, equipment, camera and travel-mode cleanup; controlled pose/input at a loaded Baltimore water body, not a complete shore walk or real bathymetry certificate',errors:[]};
try {
 identity=await stagingCaptureAttestation();
 const credential=path.join(privateDir,'attestation.json');
 await fs.writeFile(credential,JSON.stringify({projectId:'we3d-staging-20260712',appId:'1:524178734996:web:f59acbc9014f0e26f51981',expiresAt:new Date(Date.now()+600000).toISOString(),token:identity.token}),{mode:0o600});
 process.env.WE3D_STAGING_APP_CHECK_FILE=credential;
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await configureStagingAppCheck(page,`http://127.0.0.1:${server.port}`);
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('console',async msg=>{if(msg.text().startsWith('[WorldLoad] Essential Earth gameplay')){report.startupStack=await msg.args()[1]?.evaluate(e=>e?.stack);}});
 async function openEarth(){
  if(await page.locator('#landingPrimaryCta').isVisible())await page.locator('#landingPrimaryCta').click();
  await page.waitForFunction(()=>window.__WE3D_RUNTIME_READY__===true,null,{timeout:90000});
  if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
  await page.locator('#globeSelectorStartBtn').click();
  await page.evaluate(async()=>{window.swimCtx=(await import('/app/js/shared-context.js?v=55')).ctx;});
  try {await page.waitForFunction(()=>!!swimCtx.Walk?.state?.characterMesh && swimCtx.initialEarthWorldReady===true || swimCtx.worldLoadRuntimeState?.status==='failed',null,{timeout:45000});}
  catch(error){
   report.startup=await page.evaluate(()=>({gameStarted:swimCtx.gameStarted,worldLoading:swimCtx.worldLoading,ready:swimCtx.initialEarthWorldReady,environment:swimCtx.getEnv?.(),publication:!!swimCtx.worldPublication,loadingText:document.getElementById('loading')?.innerText}));
   await page.screenshot({path:`${dir}/swimming-startup-failure.png`});throw error;
  }
  const startupFailure=await page.evaluate(()=>swimCtx.worldLoadRuntimeState?.gameplayRuntimeError || swimCtx.worldLoadRuntimeState?.firstRenderError || null);
  if(startupFailure)throw Error(`Earth startup failed: ${startupFailure}`);

 }
 await page.goto(`http://127.0.0.1:${server.port}/app/?loc=custom&lat=39.2904&lon=-76.6122&lname=Baltimore&launch=earth&gm=free&mode=walking`,{waitUntil:'load'});
 await openEarth();

 await page.evaluate(()=>swimCtx.closeWorldDiscovery?.());
 report.mappedDepthSamples=await page.evaluate(async()=>{
   const c=swimCtx,{sampleDynamicWaterAt}=await import('/app/js/boat-mode/water-query.js?v=21');
   return (c.waterAreas||[]).slice(0,30).map(area=>{
     const x=area.centerX??(area.bounds?.minX+area.bounds?.maxX)/2,z=area.centerZ??(area.bounds?.minZ+area.bounds?.maxZ)/2;
     if(!Number.isFinite(x)||!Number.isFinite(z))return null;
     const ground=c.SurfaceQuery.walkAt(x,z,{currentY:-1000,sampleRenderedMesh:false}).position.y;
     const sample=sampleDynamicWaterAt(x,z,null,{bottomY:ground});
     return {kind:area.waterKind,x,z,depth:sample.volume.gameplayDepthMeters,coverage:sample.coverage};
   }).filter(Boolean);
 });

 const deep=report.mappedDepthSamples.filter(p=>p.depth>2.5&&Math.hypot(p.x,p.z)<1600).sort((a,b)=>b.depth-a.depth)[0];
 assert.ok(deep,'Expected a loaded mapped water bed deep enough for the geographic swim check');
 await page.evaluate(async point=>{
   const c=swimCtx;c.setTravelMode('walk',{source:'mapped-swim-check',force:true});
   const {sampleDynamicWaterAt}=await import('/app/js/boat-mode/water-query.js?v=21');
   const sample=sampleDynamicWaterAt(point.x,point.z);
   Object.assign(c.Walk.state.walker,{x:point.x,z:point.z,y:sample.surfaceY+.18,vy:0,_resolvedGroundState:null});
   window.originalSwimActions=c.readControlActions;c.readControlActions=()=>({move:0,strafe:0,vertical:0});
 },deep);
 await page.waitForFunction(()=>swimCtx.Walk.state.walker.swimming?.equipment==='none');
 report.surfaceEntry=true;
 await page.evaluate(()=>{swimCtx.readControlActions=()=>({move:0,strafe:0,vertical:-1})});
 await page.waitForFunction(()=>swimCtx.Walk.state.walker.swimming?.submerged===true,null,{timeout:10000});
 await page.evaluate(()=>{swimCtx.readControlActions=()=>({move:0,strafe:0,vertical:0})});
 await page.screenshot({path:`${dir}/swimming-mapped-water.png`});
 report.mappedSwim=await page.evaluate(()=>({...swimCtx.Walk.state.walker.swimming,position:{x:swimCtx.Walk.state.walker.x,y:swimCtx.Walk.state.walker.y,z:swimCtx.Walk.state.walker.z}}));
 assert.equal(report.mappedSwim.equipment,'scuba');
 await page.evaluate(()=>{swimCtx.setTravelMode('drive',{source:'mapped-swim-cleanup',force:true});swimCtx.readControlActions=originalSwimActions});
 await page.evaluate(()=>swimCtx.setTravelMode('drive',{source:'swimming-exit-check',force:true}));
 await page.waitForFunction(()=>!swimCtx.Walk.state.walker.swimming);
 assert.equal(await page.locator('#swimmingHud').isVisible(),false);report.modeCleanup=true;
 assert.deepEqual(report.errors,[]);report.passed=true;
}finally{await fs.writeFile(`${dir}/swimming-earth.json`,JSON.stringify(report,null,2));await browser.close();await server.close();await identity?.cleanup();await fs.rm(privateDir,{recursive:true,force:true});}
console.log(JSON.stringify(report));
