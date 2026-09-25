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
 await page.waitForFunction(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');return ctx.spaceFlight?.celestialCatalog?.starEntries?.length>=700;});
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
 await page.evaluate(async()=>{
  const {ctx}=await import('/app/js/shared-context.js?v=55');ctx.returnUniverseToSolImmediate();
  const ship=await import('/app/js/expedition/ship-interior.js?v=27');
  if(!ship.enterSolisReachInterior())throw Error('Free exploration ship entry failed');
 });
 await page.waitForFunction(async()=>{
  const {ctx}=await import('/app/js/shared-context.js?v=55');let count=0;
  ctx.activeInterior?.group?.traverse(o=>{if(o.userData.curatedCharacterAssetId)count++;});return count===7;
 },null,{timeout:60000});
 const interior=await page.evaluate(async()=>{
  const {ctx}=await import('/app/js/shared-context.js?v=55');const pending=[];
  ctx.activeInterior.group.traverse(o=>{if(o.userData.furnishingReady)pending.push(o.userData.furnishingReady);});
  const loaded=await Promise.all(pending);return {furnishings:loaded.length,loaded:loaded.filter(Boolean).length,near:ctx.camera.near};
 });
 assert.equal(interior.loaded,interior.furnishings);assert.ok(interior.loaded>20);assert.equal(interior.near,.05);checks.push({name:'free-exploration-crew-furnishings',...interior});
 for(const [deck,x,z,yaw,label] of [['command',0,27,0,'bridge'],['habitat',-6,0,-Math.PI/2,'quarters'],['habitat',-5,15,-Math.PI/2,'medical'],['engineering',4,0,Math.PI/2,'cargo']]) {
  await page.evaluate(async({deck,x,z,yaw})=>{
   const {ctx}=await import('/app/js/shared-context.js?v=55');const ship=await import('/app/js/expedition/ship-interior.js?v=27');ship.switchSolisReachDeck(deck);
   Object.assign(ctx.Walk.state.walker,{x,z,y:1.74,yaw,angle:yaw,pitch:0});ctx.Walk.state.view='first';ctx.presentationPose=null;
  },{deck,x,z,yaw});
  await page.waitForTimeout(600);await page.screenshot({path:`${out}/ship-${label}.png`});
 }
 const exited=await page.evaluate(async()=>{const ship=await import('/app/js/expedition/ship-interior.js?v=27');ship.exitSolisReachInterior();const {ctx}=await import('/app/js/shared-context.js?v=55');return {near:ctx.camera.near,active:ctx.spaceFlight.active};});
 assert.equal(exited.near,.5);assert.equal(exited.active,true);checks.push({name:'interior-exit-restores-camera',...exited});
 await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');ctx.travelToUniverseDestination('orion-nebula');});
 await page.waitForFunction(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');return ctx.universeRuntime.current.id==='orion-nebula'&&!ctx.universeRuntime.transition;},null,{timeout:30000});
 for(const [label,x,z] of [['outside',0,13000],['edge',0,6500],['inside',1400,0]]) {
  const state=await page.evaluate(async({x,z})=>{
   const {ctx}=await import('/app/js/shared-context.js?v=55');cancelAnimationFrame(ctx.spaceFlight.animationId);
   const flight=ctx.spaceFlight;flight.camera.position.set(x,0,z);flight.camera.lookAt(0,0,-6000);flight.camera.updateMatrixWorld(true);
   flight.renderer.render(flight.scene,flight.camera);
   return {glError:flight.renderer.getContext().getError(),reconstruction:ctx.universeRuntime.frameGroup.userData.observationalImage,drawCalls:flight.renderer.info.render.calls};
  },{x,z});
  assert.equal(state.glError,0);checks.push({name:`nebula-${label}`,...state});await page.screenshot({path:`${out}/nebula-${label}.png`});
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(`${out}/report.json`,JSON.stringify({ok:true,complete:true,evidenceScope:'Desktop software-rendered scene fixtures; not real-device performance or full surface launch acceptance',checks,errors},null,2));
} catch(error) {
 await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});
 await fs.writeFile(`${out}/report.json`,JSON.stringify({ok:false,complete:true,checks,errors,error:String(error.stack||error)},null,2));throw error;
} finally {await browser.close();await server.close();}
