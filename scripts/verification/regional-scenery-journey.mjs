import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
import {collectBrowserGraphicsErrors} from './browser-graphics-errors.mjs';
const root=process.cwd(), servedRoot=path.resolve(root,process.env.WE3D_VERIFY_ROOT || '.');
console.log('[regional-scenery] Serving '+servedRoot);
const out=path.join(root,'output/verification/regional-scenery-journey');await fs.mkdir(out,{recursive:true});
const server=await startStaticServer({rootDir:servedRoot,ports:[4559]});const base=`http://127.0.0.1:${server.port}`;
let browser;const report={ok:false,scope:'Controlled actor-position arrival; separate from continuous keyboard-flight timing',errors:[],captures:[]};
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:1280,height:800}});await configureStagingAppCheck(page,base);page.on('pageerror',e=>report.errors.push(e.message));collectBrowserGraphicsErrors(page,report.errors);
 await page.goto(base+'/app/?launch=earth&gm=free&loc=custom&lat=39.3098&lon=-76.6147&lname=Baltimore&mode=driving&diagnostics=1');await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__,null,{timeout:60000});// Verify the menu setting before Earth's lazy module graph loads.
 await page.evaluate(()=>{const t=document.getElementById('regionalSceneryToggle');t.checked=false;t.dispatchEvent(new Event('change',{bubbles:true}));});
 assert.equal(await page.evaluate(()=>localStorage.getItem('we3d.regionalScenery')),'off');
 await page.evaluate(()=>{const t=document.getElementById('regionalSceneryToggle');t.checked=true;t.dispatchEvent(new Event('change',{bubbles:true}));});
 await page.locator('#globeSelectorStartBtn').click();await page.waitForFunction(()=>{const s=globalThis.getWorldExplorerRuntimeDiagnostics?.();return s?.gameStarted&&!s.worldLoading&&s.farTerrainClipmap?.status==='ready';},null,{timeout:300000,polling:1000});
 assert.equal(await page.evaluate(async()=>typeof (await import('/app/js/shared-context.js?v=55')).ctx.getRegionalSceneryState),'function','The served build must include regional scenery scheduling');
 const snapshot=async(label)=>{const started=Date.now();
 const data=await page.evaluate(async()=>{const{ctx}=await import('/app/js/shared-context.js?v=55');const target=ctx.geoToWorld(39.4347,-76.6912),far=ctx.terrainGroup.children.find(m=>m.name==='FarMappedBuildingContext');let near=0,total=0,regionalBytes=0;const buffers=new Set();const v=new THREE.Vector3(),m=new THREE.Matrix4();far?.traverse(o=>{for(const a of [...Object.values(o.geometry?.attributes || {}),o.geometry?.index,o.instanceMatrix,o.instanceColor])if(a?.array?.buffer)buffers.add(a.array.buffer);if(o.isInstancedMesh){for(let i=0;i<o.count;i++){o.getMatrixAt(i,m);v.setFromMatrixPosition(m).add(o.position);total++;if(Math.hypot(v.x-target.x,v.z-target.z)<1500)near++;}}});for(const b of buffers)regionalBytes+=b.byteLength;return{regionalBytes,far:ctx.farTerrainClipmapState,target,near,total,terrainChildren:ctx.terrainGroup.children.length,memory:ctx.renderer.info.memory,calls:ctx.renderer.info.render.calls,roofBatches:far?.children.filter(m=>m.userData.regionalRoofFraction>0).length || 0,sourceBuildings:ctx.buildings.length,scenery:ctx.getRegionalSceneryState?.()};});report.captures.push({label,at:new Date(started).toISOString(),...data});await page.screenshot({path:path.join(out,label+'.png')});console.log(JSON.stringify({label,near:data.near,total:data.total,state:data.far.status,anchor:data.far.anchor,scenery:data.scenery}));return data;};
 await snapshot('origin');
 await page.evaluate(async()=>{const{ctx}=await import('/app/js/shared-context.js?v=55');globalThis.__arrivalRetired={expected:0,disposed:0};const g=ctx.terrainGroup.children.find(m=>m.name==='FarMappedBuildingContext');g.traverse(o=>{if(o.isInstancedMesh){globalThis.__arrivalRetired.expected++;o.addEventListener('dispose',()=>globalThis.__arrivalRetired.disposed++);}});});
 await page.evaluate(async()=>{const{ctx}=await import('/app/js/shared-context.js?v=55');ctx.setTimeOfDay('day');ctx.setTravelMode('plane');const p=ctx.geoToWorld(39.4347,-76.6912);Object.assign(ctx.planeMode,{x:p.x,z:p.z,y:250,yaw:Math.PI*.5,pitch:0,roll:0,speed:0,horizontalSpeed:0,throttle:0,airborne:true});ctx.paused=false;ctx.update = () => {};globalThis.__arrivalCtx=ctx;});
 // Freeze physics for a repeatable geographic comparison. The real
 // core world frame must schedule and publish the scenery without a direct call.
 await page.waitForTimeout(1500);const arrival=await snapshot('arrival');
 await page.waitForFunction(()=>{const s=globalThis.getWorldExplorerRuntimeDiagnostics?.();return s?.farTerrainClipmap?.status==='ready'&&s.farTerrainClipmap.anchor?.z < -8000;},null,{timeout:240000,polling:1000});const ready=await snapshot('region-ready');assert.ok(ready.near>arrival.near+100,'Arrival must populate buildings beyond the original edge');assert.equal(ready.sourceBuildings,report.captures[0].sourceBuildings,'Original detailed district stays intact');
  report.retired=await page.evaluate(()=>globalThis.__arrivalRetired);assert.ok(report.retired.expected>0);assert.equal(report.retired.disposed,report.retired.expected,'Every retired instance batch must release its GPU buffers');
  const put=async(x,z)=>page.evaluate(async({x,z})=>{const{ctx}=await import('/app/js/shared-context.js?v=55');Object.assign(ctx.planeMode,{x,z,y:250});},{x,z});
  await put(0,0);await page.waitForFunction(()=>{const s=globalThis.getWorldExplorerRuntimeDiagnostics?.().farTerrainClipmap;return s?.status==='ready'&&s.anchor?.x===0&&s.anchor?.z===0;},null,{timeout:240000,polling:1000});
  await page.waitForTimeout(1500);const returned=await snapshot('return-origin');
  assert.equal(returned.regionalBytes,report.captures[0].regionalBytes,'Returning restores the same regional allocation');
  assert.equal(returned.total,report.captures[0].total,'Returning restores regional building coverage');
  assert.equal(returned.terrainChildren,report.captures[0].terrainChildren,'Regional publications must replace rather than accumulate');
  const old=await page.evaluate(async()=>{const{ctx}=await import('/app/js/shared-context.js?v=55');return{key:ctx.farTerrainClipmapState.key,far:ctx.terrainGroup.children.find(m=>m.name==='FarMappedBuildingContext').uuid};});
  await page.route('https://vector.openstreetmap.org/**',route=>route.abort('failed'));
  await put(24000,0);await page.waitForFunction(()=>globalThis.__arrivalCtx.getRegionalSceneryState().error.length>0,null,{timeout:240000,polling:1000});
  const failed=await page.evaluate(async()=>{const{ctx}=await import('/app/js/shared-context.js?v=55');return{status:ctx.farTerrainClipmapState.status,far:ctx.terrainGroup.children.find(m=>m.name==='FarMappedBuildingContext').uuid,scenery:ctx.getRegionalSceneryState()};});
  report.failure=failed;assert.match(failed.scenery.error,/incomplete/);assert.equal(failed.status,'failed');assert.equal(failed.far,old.far,'A failed provider must retain the last complete region');
  await page.unroute('https://vector.openstreetmap.org/**');
  // Exercise settings event wiring and persisted preference, without changing
  // the actor. With travel disabled, the failed destination must not retry.
  await page.evaluate(()=>{const toggle=document.getElementById('regionalSceneryToggle');toggle.checked=false;toggle.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.waitForTimeout(2000);
  assert.equal(await page.evaluate(()=>localStorage.getItem('we3d.regionalScenery')),'off');
  const stopped=await page.evaluate(()=>globalThis.__arrivalCtx.getRegionalSceneryState());assert.equal(stopped.enabled,false);assert.equal(stopped.pending,false);
  await page.evaluate(()=>{const toggle=document.getElementById('regionalSceneryToggle');toggle.checked=true;toggle.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.waitForFunction(()=>{const ctx=globalThis.__arrivalCtx,s=ctx.getRegionalSceneryState();return ctx.farTerrainClipmapState.status==='ready'&&s.anchor.x===24000&&!s.pending&&!s.error;},null,{timeout:240000,polling:1000});
  const recovered=await snapshot('provider-recovered');assert.equal(recovered.scenery.anchor.x,24000);
  await page.evaluate(()=>{const toggle=document.getElementById('regionalSceneryToggle');toggle.checked=false;toggle.dispatchEvent(new Event('change',{bubbles:true}));Object.assign(globalThis.__arrivalCtx.planeMode,{x:0,z:0,y:250});});
  await page.waitForFunction(()=>{const s=globalThis.__arrivalCtx.getRegionalSceneryState();return !s.enabled&&!s.pending&&!s.error&&s.anchor.x===0&&s.anchor.z===0;},null,{timeout:240000,polling:1000});
  await page.waitForTimeout(2000);report.off=await snapshot('fixed-view-restored');assert.equal(report.off.scenery.enabled,false);

 await page.reload();await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__,null,{timeout:60000});assert.equal(await page.locator('#regionalSceneryToggle').isChecked(),false,'Saved fixed-view preference must survive reload');
 assert.deepEqual(report.errors,[]);report.ok=true;
}finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser?.close();await server.close();}
