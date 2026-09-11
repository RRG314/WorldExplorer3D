import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.env.WE3D_VERIFY_OUTPUT||'output/verification/driving-camera-current';
await mkdir(out,{recursive:true});
const server=await chromium.launchServer({channel:'chrome',headless:true});
// Cold dense-city provider + geometry loading exceeded 70 s in captured evidence.
// Keep a hard overall deadline; do not turn a startup timeout into a camera pass.
const deadline=setTimeout(()=>server.process().kill('SIGTERM'),180000);
const report={errors:[],views:[]};
let page;
try {
 const browser=await chromium.connect(server.wsEndpoint());
 page=await browser.newPage({viewport:{width:1280,height:Number(process.env.WE3D_VIEWPORT_HEIGHT)||800}});
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto((process.env.WE3D_VERIFY_BASE_URL||'http://127.0.0.1:4195')+`/app/?loc=custom&lat=${process.env.WE3D_LAT||20.5043}&lon=${process.env.WE3D_LON||8.175}&mode=driving`);
 await page.waitForFunction(()=>window.__WE3D_RUNTIME_READY__,null,{timeout:45000});
 await page.locator('#globeSelectorStartBtn').click();
 await page.waitForFunction(()=>{const s=window.getWorldExplorerRuntimeDiagnostics?.();return s?.gameStarted&&!s.worldLoading&&!document.querySelector('#loading')?.classList.contains('show');},null,{timeout:120000});
 await page.evaluate(async()=>{window.cameraCtx=(await import('/app/js/shared-context.js?v=55')).ctx;if(cameraCtx.Walk.state.mode!=='drive')throw Error('Not driving: invalid test setup');await cameraCtx.ensureCuratedPlayerCar();cameraCtx.setTimeOfDay('day');cameraCtx.setCameraMode(0);});
 for(const name of ['chase','cabin','overhead','return-chase']) {
  await page.waitForTimeout(700);
  report.views.push(await page.evaluate(name=>{const c=cameraCtx;return {name,mode:c.camMode,clearance:c.camera.userData.vehicleClearanceMode,visible:c.carMesh.visible,position:c.camera.position,car:c.carMesh.position,look:c.camera.userData.carLook,near:c.camera.near};},name));
  await page.screenshot({path:`${out}/${name}.png`});
  if(name==='return-chase'){
   const legacy=await page.evaluate(()=>{
    const c=cameraCtx,reference=c.camera.clone(),angle=c.car.angle;
    reference.position.set(c.carMesh.position.x-Math.sin(angle)*10,c.carMesh.position.y-1.2+5,c.carMesh.position.z-Math.cos(angle)*10);
    reference.lookAt(c.carMesh.position.x,c.carMesh.position.y-1.2+.5,c.carMesh.position.z);
    const delta=reference.position.distanceTo(c.camera.position);
    c.renderer.render(c.scene,reference);const image=c.renderer.domElement.toDataURL('image/png');c.renderer.render(c.scene,c.camera);
    return {image,delta};
   });
   report.legacyPoseDelta=legacy.delta;
   await writeFile(`${out}/legacy-framing.png`,Buffer.from(legacy.image.split(',')[1],'base64'));
  }
  if(name==='cabin') report.cabinHits=await page.evaluate(()=>{
   const c=cameraCtx;const ray=new THREE.Raycaster(c.camera.position,c.camera.getWorldDirection(new THREE.Vector3()),.05,5);
   return ray.intersectObject(c.carMesh,true).slice(0,8).map(h=>({distance:h.distance,object:h.object.name,material:h.object.material.name,face:h.faceIndex,uv:h.uv,point:c.carMesh.worldToLocal(h.point.clone())}));
  });
  await page.keyboard.press('c');
 }
 await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
 if(report.errors.length || report.views.some((v,i)=>v.mode!==[0,1,2,0][i]||!v.visible) || report.views[1].near>=.1 || report.views[3].near!==.5)throw Error('Driving camera cycle failed');
 const rear=report.views[3];
 if(Math.hypot(rear.position.x-rear.car.x,rear.position.z-rear.car.z)<4)throw Error('Chase view collapsed onto vehicle');
 console.log(JSON.stringify(report));
} catch(error) {
 report.failure=String(error.message);
 if(page&&!page.isClosed()) {
  await page.screenshot({path:`${out}/failed.png`}).catch(()=>{});
  report.failedState=await page.evaluate(()=>window.getWorldExplorerRuntimeDiagnostics?.()).catch(()=>null);
 }
 await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
 throw error;
} finally {clearTimeout(deadline);await Promise.race([server.close(),new Promise(resolve=>setTimeout(()=>{server.process()?.kill('SIGTERM');resolve();},5000))]);}
