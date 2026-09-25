import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';
import { collectBrowserGraphicsErrors } from './browser-graphics-errors.mjs';
import { configureStagingAppCheck } from './staging-app-check.mjs';
const out='output/verification/space-quality';
await fs.rm(out,{recursive:true,force:true}); await fs.mkdir(out,{recursive:true});
await fs.writeFile(`${out}/report.json`,JSON.stringify({ok:false,complete:false}));
const server=await startStaticServer({rootDir:process.env.WE3D_VERIFY_ROOT||'dist',ports:[4495,4496]});
const base=`http://127.0.0.1:${server.port}`;
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1100,height:740}});
const errors=[];collectBrowserGraphicsErrors(page,errors);page.on('pageerror',e=>errors.push(String(e)));
const checks=[];
try {
 await configureStagingAppCheck(page,base);
 await page.goto(`${base}/app/?launch=space`,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>document.getElementById('startBtn')?.disabled===false,null,{timeout:120000});
 await page.evaluate(()=>{document.getElementById('spaceLaunchToggle')?.click();document.getElementById('startBtn')?.click();});
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text?.()||'{}').modes?.space===true,null,{timeout:180000});
 await page.evaluate(async()=>{window.__spaceQualityContext=(await import('/app/js/shared-context.js?v=55')).ctx;});
 await page.waitForFunction(()=>window.__spaceQualityContext.spaceFlight?.celestialCatalog?.starEntries?.length>=700);
 await page.locator('#spaceConstellationToggle').click();
 assert.equal(await page.evaluate(()=>window.__spaceQualityContext.spaceFlight.celestialCatalog.constellationEntries.filter(e=>e.line.visible).length),88);
 await page.locator('#spaceConstellationToggle').click();
 assert.equal(await page.evaluate(()=>window.__spaceQualityContext.spaceFlight.celestialCatalog.constellationEntries.filter(e=>e.line.visible).length),0);
 checks.push({name:'constellation-overlay-toggle',figures:88});
 // Explicit scene fixtures isolate selection and geometry; they are not a full travel journey.
 const selected=await page.evaluate(async()=>{
  const {ctx}=await import('/app/js/shared-context.js?v=55');
  ctx.restoreUniverseLocalFrame('proxima-centauri');
  cancelAnimationFrame(ctx.spaceFlight.animationId);
  const meshes=ctx.universeRuntime.frameGroup.userData.destinationMeshes;
  const pair=[...meshes].find(([id])=>id!=='proxima-centauri');
  const point=new THREE.Vector3();pair[1].getWorldPosition(point);
  ctx.spaceFlight.camera.position.copy(point).add(new THREE.Vector3(0,5,55));ctx.spaceFlight.camera.lookAt(point);ctx.spaceFlight.camera.updateMatrixWorld(true);
  ctx.spaceFlight.renderer.render(ctx.spaceFlight.scene,ctx.spaceFlight.camera);
  const ndc=point.project(ctx.spaceFlight.camera);
  return {id:pair[0],x:(ndc.x+1)*innerWidth/2,y:(1-ndc.y)*innerHeight/2};
 });
 await page.mouse.click(selected.x,selected.y);
 await page.waitForFunction(id=>document.getElementById('ssInfoTitle')?.textContent?.toLowerCase().includes('proxima'),selected.id);
 checks.push({name:'extrasolar-planet-click',selected,title:await page.locator('#ssInfoTitle').textContent()});
 await page.screenshot({path:`${out}/01-exoplanet-selection.png`});
 await page.locator('#ssInfoClose').click();
 const sky=await page.evaluate(async()=>{
  const {ctx}=await import('/app/js/shared-context.js?v=55');
  const catalog=ctx.spaceFlight.celestialCatalog;
  ctx.updateSpaceCatalogObserver({x:0,y:0,z:0},ctx.spaceFlight.camera.position);
  const before=catalog.points.geometry.attributes.position.array.slice();
  ctx.updateSpaceCatalogObserver({x:4,y:2,z:-1},ctx.spaceFlight.camera.position);
  const after=catalog.points.geometry.attributes.position.array;
  return {stars:catalog.starEntries.length,segments:catalog.constellationEntries.length,changed:after.some((v,i)=>Math.abs(v-before[i])>1),finite:[...after].every(Number.isFinite)};
 });
 assert.equal(sky.changed,true);assert.equal(sky.finite,true);checks.push({name:'observer-parallax',...sky});
 const starTarget=await page.evaluate(()=>{
  const ctx=window.__spaceQualityContext,flight=ctx.spaceFlight,catalog=flight.celestialCatalog;
  flight.camera.position.set(0,0,5000);
  ctx.updateSpaceCatalogObserver({x:0,y:0,z:0},flight.camera.position);
  const index=catalog.starEntries.findIndex(entry=>entry.star.hip===8102);
  if(index<0)throw Error('Tau Ceti catalog identity missing');
  const target=new THREE.Vector3().fromBufferAttribute(catalog.points.geometry.attributes.position,index).add(catalog.group.position);
  flight.camera.lookAt(target);flight.camera.updateMatrixWorld(true);flight.renderer.render(flight.scene,flight.camera);
  return {x:innerWidth/2,y:innerHeight/2};
 });
 await page.mouse.click(starTarget.x,starTarget.y);
 await page.waitForFunction(()=>document.getElementById('ssInfoSetCourse')?.textContent==='TRAVEL TO TAU CETI');
 assert.equal(await page.locator('#ssInfoSetCourse').isVisible(),true);
 checks.push({name:'catalog-star-click-and-travel-action',destination:'tau-ceti',title:await page.locator('#ssInfoTitle').textContent()});
 await page.screenshot({path:`${out}/02-star-selection.png`});
 await page.evaluate(()=>window.__spaceQualityContext.animateSpaceFlight());
 await page.locator('#ssInfoSetCourse').click();
 await page.waitForFunction(()=>window.__spaceQualityContext.universeRuntime.current.id==='tau-ceti'&&!window.__spaceQualityContext.universeRuntime.transition,null,{timeout:30000});
 checks.push({name:'selected-star-travel-completed',destination:'tau-ceti'});

 await page.evaluate(async()=>{
  const {ctx}=await import('/app/js/shared-context.js?v=55');ctx.returnUniverseToSolImmediate();
  const action=document.getElementById('fBoardSolisReach');
  if(!action)throw Error('Missing ship boarding action');
  action.click();
 });
 await page.waitForFunction(()=>{
  const crew=window.__spaceQualityContext.getShipInteriorSnapshot?.()?.crewPresentation;
  return crew?.length===7 && crew.every(member=>member.curatedAssetId && member.visibleFallbackMeshCount===0);
 },null,{timeout:60000});
 const interior=await page.evaluate(async()=>{
  const {ctx}=await import('/app/js/shared-context.js?v=55');const pending=[];
  ctx.activeInterior.group.traverse(o=>{if(o.userData.furnishingReady)pending.push(o.userData.furnishingReady);});
  const loaded=await Promise.all(pending);const crew=ctx.getShipInteriorSnapshot().crewPresentation.length;return {crew,furnishings:loaded.length,loaded:loaded.filter(Boolean).length,near:ctx.camera.near};
 });
 assert.equal(interior.crew,7);assert.equal(interior.loaded,interior.furnishings);assert.ok(interior.loaded>20);assert.equal(interior.near,.05);checks.push({name:'free-exploration-crew-furnishings',...interior});
 for(const [deck,x,z,yaw,label] of [['command',0,27,0,'bridge'],['habitat',-8.5,0,Math.PI,'quarters'],['habitat',-5,15,-Math.PI/2,'medical'],['engineering',4,0,Math.PI/2,'cargo']]) {
  await page.evaluate(async({deck,x,z,yaw})=>{
   const {ctx}=await import('/app/js/shared-context.js?v=55');ctx.switchSolisReachDeck(deck);
   Object.assign(ctx.Walk.state.walker,{x,z,y:1.74,yaw,angle:yaw,pitch:0});ctx.Walk.state.view='first';ctx.presentationPose=null;
  },{deck,x,z,yaw});
  await page.waitForTimeout(600);await page.screenshot({path:`${out}/ship-${label}.png`});
 }
 const exited=await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');ctx.exitExpeditionShipInterior();return {near:ctx.camera.near,active:ctx.spaceFlight.active};});
 assert.equal(exited.near,.5);assert.equal(exited.active,true);checks.push({name:'interior-exit-restores-camera',...exited});
 for (const nebulaId of ['orion-nebula','carina-nebula','crab-nebula']) {
  await page.evaluate(async id=>{const ctx=window.__spaceQualityContext;ctx.animateSpaceFlight();ctx.travelToUniverseDestination(id);},nebulaId);
  await page.waitForFunction(id=>{const ctx=window.__spaceQualityContext;return ctx.universeRuntime.current.id===id&&!ctx.universeRuntime.transition;},nebulaId,{timeout:30000});
  for(const [label,x,z] of [['outside',0,13000],['edge',0,6500],['inside',1400,0]]) {
   const state=await page.evaluate(({x,z})=>{
    const ctx=window.__spaceQualityContext;cancelAnimationFrame(ctx.spaceFlight.animationId);
    const flight=ctx.spaceFlight;flight.camera.position.set(x,0,z);flight.camera.lookAt(0,0,-6000);flight.camera.updateMatrixWorld(true);
    flight.renderer.render(flight.scene,flight.camera);
    return {glError:flight.renderer.getContext().getError(),reconstruction:ctx.universeRuntime.frameGroup.userData.observationalImage,drawCalls:flight.renderer.info.render.calls};
   },{x,z});
   assert.equal(state.glError,0);checks.push({name:`${nebulaId}-${label}`,...state});await page.screenshot({path:`${out}/${nebulaId}-${label}.png`});
  }
 }
 await page.evaluate(async()=>{
  const ctx=window.__spaceQualityContext;ctx.returnUniverseToSolImmediate();cancelAnimationFrame(ctx.spaceFlight.animationId);
  window.__atmosphereFixture=await import('/app/js/space/atmospheric-flight-presentation.js');
 });
 for(const bodyId of ['jupiter','saturn','uranus','neptune']) {
  for(const altitudeM of [200000,20000,-5000]) {
   await page.evaluate(({bodyId,altitudeM})=>{
    const ctx=window.__spaceQualityContext, flight=ctx.spaceFlight;
    const radial={x:0.94,y:0.342,z:0};
    window.__atmosphereFixture.updateAtmosphericFlightPresentation(bodyId,{radial,altitudeM});
    flight.camera.position.copy(flight.rocket.position).add(new THREE.Vector3(0,2,0));
    flight.camera.up.set(0,1,0);flight.camera.lookAt(flight.rocket.position.clone().add(new THREE.Vector3(-180,-65,-300)));flight.camera.updateMatrixWorld(true);
   },{bodyId,altitudeM});
   await page.waitForFunction(()=>window.__spaceQualityContext.spaceFlight.atmosphericPresentation.cloudTexture.image?.width>0);
   const state=await page.evaluate(()=>{const f=window.__spaceQualityContext.spaceFlight;f.renderer.render(f.scene,f.camera);return {glError:f.renderer.getContext().getError(),imagery:f.atmosphericPresentation.dome.userData.imagery};});
   assert.equal(state.glError,0);checks.push({name:'atmospheric-render-fixture',bodyId,altitudeM,...state});
   await page.screenshot({path:`${out}/${bodyId}-${altitudeM}.png`});
  }
  await page.evaluate(()=>window.__atmosphereFixture.releaseAtmosphericFlightPresentation());
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(`${out}/report.json`,JSON.stringify({ok:true,complete:true,evidenceScope:'Desktop software-rendered scene fixtures; not real-device performance or full surface launch acceptance',checks,errors},null,2));
} catch(error) {
 checks.push({name:'failure-state',state:await page.evaluate(()=>({ship:window.__spaceQualityContext?.getShipInteriorSnapshot?.(),interior:!!window.__spaceQualityContext?.activeInterior})).catch(()=>null)});
 await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});
 await fs.writeFile(`${out}/report.json`,JSON.stringify({ok:false,complete:true,checks,errors,error:String(error.stack||error)},null,2));throw error;
} finally {await browser.close();await server.close();}
