// Rendering integration only: uses the byte-verified approved public derivative.
// Does not simulate App Check success or claim to verify hosted asset delivery.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const mobile=process.env.WE3D_TEST_MOBILE==='1';
const out=`output/verification/approved-house-${mobile?'android':'desktop'}`;
await mkdir(out,{recursive:true});
const server=await chromium.launchServer({channel:'chrome',headless:true});
const deadline=setTimeout(()=>server.process().kill('SIGTERM'),150000);
try {
 const browser=await chromium.connect(server.wsEndpoint());
 const page=await browser.newPage(mobile?{viewport:{width:412,height:915},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36'}:{viewport:{width:1280,height:720}});
 // Expose the existing private renderer only in this disposable test browser.
 await page.route('**/app/js/reality-capture/runtime.js*',async route=>{
  const response=await route.fetch();
  await route.fulfill({response,body:(await response.text())+'\nexport function testAttach(ctx,rep){return attachRepresentation(ctx,rep,worldModificationIdentityForLocation(ctx.LOC),Number(ctx._worldLoadSequence||0),refreshSerial);}'});
 });
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4195/app/?loc=custom&lat=39.6572&lon=-76.8875&mode=walking');
 await page.waitForFunction(()=>window.__WE3D_RUNTIME_READY__,null,{timeout:45000});
 await page.locator('#globeSelectorStartBtn').click();
 await page.waitForFunction(()=>{const s=window.getWorldExplorerRuntimeDiagnostics?.();return s?.gameStarted&&!s.worldLoading&&!document.querySelector('#loading')?.classList.contains('show');},null,{timeout:100000});
 const result=await page.evaluate(async()=>{
  const {ctx}=await import('/app/js/shared-context.js?v=55');
  ctx.setTimeOfDay('day');
  const id='overture:ba77061a-6e09-416a-aaf8-3057532ee880';
  const runtime=await import('/app/js/reality-capture/runtime.js?v=1');
  const attached=await runtime.testAttach(ctx,{
   representationId:'patch-representation_c0f9b45acf15a734ee4433ba70d3746e',representationKind:'facade-patches',sourceBuildingId:id,
   model:{url:'/output/verification/saved-house-walls/walls.glb'},patchHeightMeters:13.694832550361753,
   footprint:[{x:16.519767819287175,z:1.8584620704586996},{x:10.737849082536666,z:12.596286578059335},{x:-16.519767819287175,z:-1.8584732970339246},{x:-10.737849082536663,z:-12.59627535148411}],
   alignment:{scale:1,rotationYDegrees:0,positionOffset:{x:0,y:0,z:0}}
  });
  const b=ctx.buildings.find(b=>b.sourceBuildingId===id);
  if(!attached||!b)throw Error('Approved house did not attach');
  const camera=ctx.camera.clone();camera.aspect=1280/720;camera.updateProjectionMatrix();
  camera.position.set(b.centerX+20,b.baseY+12,b.centerZ-38);camera.lookAt(b.centerX,b.baseY+4,b.centerZ);camera.updateMatrixWorld(true);
  ctx.renderer.setSize(1280,720,false);ctx.renderer.render(ctx.scene,camera);
  const image=ctx.renderer.domElement.toDataURL('image/png');
  return {image,attached,device:ctx.isLikelyMobileDevice(),house:{id,x:b.centerX,z:b.centerZ,height:b.bodyHeightMeters,baseY:b.baseY,pts:b.pts},
   buildings:ctx.buildings.filter(b=>Math.hypot(b.centerX,b.centerZ)<250).map(b=>({id:b.sourceBuildingId,x:b.centerX,z:b.centerZ,height:b.bodyHeightMeters,baseY:b.baseY,pts:b.pts}))};
 });
 await writeFile(`${out}/house.png`,Buffer.from(result.image.split(',')[1],'base64'));delete result.image;
 await writeFile(`${out}/report.json`,JSON.stringify({...result,errors},null,2));
 if(errors.length)throw Error(errors.join('\n'));
 console.log(JSON.stringify({out,attached:result.attached,device:result.device,nearby:result.buildings.length}));
} finally {clearTimeout(deadline);await server.close();}
