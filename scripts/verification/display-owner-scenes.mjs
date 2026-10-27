import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const out=process.env.WE3D_DISPLAY_SCENES_OUTPUT||'output/verification/display-owner-scenes';
await mkdir(out,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4194]});
let browser;const report={ok:false,evidence:'Actual Space scene owner, bundled Earth/Moon textures and spacecraft; controlled camera, no travel or live-provider claim',errors:[]};
try{
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1100,height:740}});
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.route('**/display-scene-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Space display owner calibration</title><link rel="icon" href="/favicon.svg"><style>body{margin:0;background:black}canvas{display:block}</style><canvas></canvas><script src="/app/vendor/three/build/three.min.js"></script>'}));
 await page.goto(`http://127.0.0.1:${server.port}/display-scene-fixture`);
 await page.evaluate(async()=>{
  const {ctx}=await import((globalThis.__WORLD_EXPLORER_PRODUCTION__?.sharedModulePrefix||'')+'/app/js/shared-context.js?v=55');
  const {createSpaceFlightScene}=await import('/app/js/space/scene.js');
  ctx.spaceFlight={canvas:document.querySelector('canvas'),velocity:new THREE.Vector3()};
  createSpaceFlightScene({includeExtendedSpace:false});
  window.__flight=ctx.spaceFlight;
  window.setView=which=>{
   const f=ctx.spaceFlight,target=which==='earth'?f.earth:f.rocket;
   const bounds=new THREE.Box3().setFromObject(target),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
   const span=Math.max(size.x,size.y,size.z);
   f.camera.position.copy(center).add(new THREE.Vector3(.8,.35,1.1).multiplyScalar(span));f.camera.lookAt(center);f.camera.updateMatrixWorld(true);
  };
  setView('ship');
  const draw=()=>{ctx.spaceFlight.renderer.render(ctx.spaceFlight.scene,ctx.spaceFlight.camera);window.__frame=requestAnimationFrame(draw);};draw();
 });
 await page.waitForFunction(()=>{
  const f=window.__flight;return f?.earth.material.map.image?.complete&&f.moon.material.map.image?.complete;
 },null,{timeout:30000});
 report.renderer=await page.evaluate(()=>({revision:THREE.REVISION,encoding:__flight.renderer.outputEncoding,srgb:THREE.sRGBEncoding,toneMapping:__flight.renderer.toneMapping,exposure:__flight.renderer.toneMappingExposure,stars:__flight.celestialCatalog.starEntries.length}));
 assert.equal(report.renderer.encoding,report.renderer.srgb);assert.equal(report.renderer.toneMapping,0);assert.equal(report.renderer.exposure,1);assert.ok(report.renderer.stars>=700);
 for(const view of ['ship','earth']){
  await page.evaluate(view=>setView(view),view);await page.waitForTimeout(120);
  await page.screenshot({path:`${out}/${view}-correct.png`});
  await page.evaluate(()=>{__flight.renderer.outputEncoding=THREE.LinearEncoding;});await page.waitForTimeout(120);
  await page.screenshot({path:`${out}/${view}-previous.png`});
  await page.evaluate(async()=>{const {applyDisplayColorPolicy}=await import('/app/js/engine/display-color-policy.js');applyDisplayColorPolicy(__flight.renderer,THREE);});
 }
 assert.deepEqual(report.errors,[]);report.ok=true;
}catch(error){report.failure=String(error.stack||error);process.exitCode=1;}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser?.close();await server.close();}
console.log(JSON.stringify(report));
