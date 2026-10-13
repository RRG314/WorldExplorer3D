import assert from 'node:assert/strict';
export async function verifyHarborRun({page,out,report}) {
 await page.setViewportSize({width:1440,height:900});
 await page.locator('[data-discovery-tab="today"]').click();
 await page.locator('[data-delivery-action="find"]').click();
 await page.waitForFunction(()=>document.getElementById('discoveryHarborRun')?.getAttribute('aria-busy')==='false');
 const count=await page.locator('[data-delivery-action^="accept:"]').count();
 const diagnostics=await page.evaluate(()=>({state:globalThis.__sandboxTestContext.worldDiscoveryRuntime.harborRun.snapshot(),text:document.getElementById('discoveryHarborRun').textContent,roads:globalThis.__sandboxTestContext.roads.length,pois:globalThis.__sandboxTestContext.pois.length}));
 report.harborAdmission=diagnostics;
 assert.ok(count>0,JSON.stringify(diagnostics));
 await page.screenshot({path:`${out}/harbor-offers-desktop.png`});
 await page.setViewportSize({width:390,height:844});
 const accept=page.locator('[data-delivery-action="accept:0"]');await accept.scrollIntoViewIfNeeded();
 const box=await accept.boundingBox();assert.ok(box.height>=44&&box.x>=0&&box.x+box.width<=390);
 await page.screenshot({path:`${out}/harbor-offers-phone.png`});
 await accept.click();
 await page.waitForFunction(()=>globalThis.__sandboxTestContext.worldDiscoveryRuntime.harborRun.snapshot().phase==='pickup');
 await page.setViewportSize({width:1440,height:900});
 // Actor placement at the loading zone is explicit setup. Movement below uses
 // actual key input and ordinary vehicle physics before bounded route traversal.
 const route=await page.evaluate(async()=>{
  const ctx=globalThis.__sandboxTestContext;ctx.setTravelMode('drive');
  const route=(await ctx.discoveryProfileStore.getProfile()).harborRun.route;
  const p=ctx.geoToWorld(route.pickup.lat,route.pickup.lon),next=ctx.geoToWorld(route.points[1].lat,route.points[1].lon);
  Object.assign(ctx.car,{x:p.x,z:p.z,y:route.pickup.y+1.1,speed:0,vx:0,vz:0,angle:Math.atan2(next.x-p.x,next.z-p.z)});
  const box=route.pickupCase,worldCase=ctx.geoToWorld(box.lat,box.lon);
  const closest=Math.min(...ctx.streetFurnitureMeshes.map(o=>{const q=o.userData.furniturePos||o.position;return Math.hypot(q.x-worldCase.x,q.z-worldCase.z);}));
  if(closest<3)throw Error('Case overlaps a street fixture');
  return route;
 });
 await page.waitForTimeout(1700);
 await page.screenshot({path:`${out}/harbor-pickup-desktop.png`});
 await page.evaluate(()=>globalThis.__sandboxTestContext.openWorldDiscoverySection('today'));
 await page.locator('[data-delivery-action="load"]').click();
 await page.waitForFunction(()=>globalThis.__sandboxTestContext.worldDiscoveryRuntime.harborRun.snapshot().phase==='driving');
 const cargoColliders=await page.evaluate(()=>globalThis.__sandboxTestContext.dynamicBuildingColliders.filter(c=>c.sourceBuildingId==='harbor-run-field-case').length);
 assert.equal(cargoColliders,0,'Loaded case releases its sidewalk collider');
 report.checks.harborLoadPhysicalCase=true;
 await page.waitForTimeout(700);
 await page.keyboard.down('w');await page.waitForTimeout(1600);await page.keyboard.up('w');await page.keyboard.down(' ');await page.waitForTimeout(800);await page.keyboard.up(' ');
 await page.screenshot({path:`${out}/harbor-driving-desktop.png`});
 report.harborKeyboard=await page.evaluate(()=>({car:{x:globalThis.__sandboxTestContext.car.x,z:globalThis.__sandboxTestContext.car.z,speed:globalThis.__sandboxTestContext.car.speed},job:globalThis.__sandboxTestContext.worldDiscoveryRuntime.harborRun.snapshot()}));
 assert.ok(report.harborKeyboard.job.nextPoint>0,'Actual driving advances the route');
 // Finite traversal probe advances the actor through each sampled road point
 // in sub-metre increments. It exercises the runtime's real physical support,
 // arrival and save rules, but is not claimed as a full keyboard-driven route.
 report.harborTraversal=await page.evaluate(async()=>{
  const ctx=globalThis.__sandboxTestContext;
  const route=(await ctx.discoveryProfileStore.getProfile()).harborRun.route;
  const runtime=ctx.worldDiscoveryRuntime.harborRun;
  const until=performance.now()+120000;let steps=0;
  while(runtime.snapshot().phase==='driving'&&performance.now()<until){
    const snap=runtime.snapshot(),index=snap.resumeNeeded?Math.max(0,snap.nextPoint-1):snap.nextPoint,target=route.points[index],p=ctx.geoToWorld(target.lat,target.lon);
    const dx=p.x-ctx.car.x,dz=p.z-ctx.car.z,d=Math.hypot(dx,dz),fraction=Math.min(1,1.5/Math.max(d,.001));
    const x=ctx.car.x+dx*fraction,z=ctx.car.z+dz*fraction,ground=ctx.SurfaceQuery.driveAt(x,z,{currentY:ctx.car.y,preferRoad:true});
    Object.assign(ctx.car,{x,z,y:ground.position.y+1.1,speed:0,vx:0,vz:0,angle:Math.atan2(dx,dz)});steps++;
    await new Promise(r=>setTimeout(r,50));
  }
  return {steps,state:runtime.snapshot()};
 });
 assert.equal(report.harborTraversal.state.phase,'unload');
 await page.evaluate(async()=>{
  const ctx=globalThis.__sandboxTestContext;
  const route=(await ctx.discoveryProfileStore.getProfile()).harborRun.route,p=ctx.geoToWorld(route.dropoff.lat,route.dropoff.lon);
  Object.assign(ctx.car,{x:p.x,z:p.z,y:route.dropoff.y+1.1,speed:8});ctx.openWorldDiscoverySection('today');
 });
 await page.locator('[data-delivery-action="unload"]').click();
 assert.equal(await page.evaluate(()=>globalThis.__sandboxTestContext.worldDiscoveryRuntime.harborRun.snapshot().phase),'unload','Moving arrival cannot complete delivery');
 await page.evaluate(()=>{const c=globalThis.__sandboxTestContext.car;Object.assign(c,{speed:0,vx:0,vz:0});});
 await page.waitForTimeout(1800);await page.locator('[data-delivery-action="unload"]').click();
 await page.locator('#discoveryHarborRun[data-delivery-phase="complete"]').waitFor();
 await page.screenshot({path:`${out}/harbor-complete-desktop.png`});
 await page.locator('#discoveryHarborRun summary').click();
 await page.locator('[data-delivery-action="finish:slate"]').click();
 await page.waitForFunction(()=>globalThis.__sandboxTestContext.worldDiscoveryRuntime.harborRun.snapshot().finishId==='slate'&&!globalThis.__sandboxTestContext.worldDiscoveryRuntime.harborRun.snapshot().busy);
 assert.equal(await page.evaluate(()=>globalThis.__sandboxTestContext.carMesh.userData.curatedVehicleVisual.userData.paintFinish),'artist-slate-exterior');
 assert.equal(await page.evaluate(()=>globalThis.__sandboxTestContext.worldDiscoveryRuntime.harborRun.snapshot().distinction),null,'Actor-stepped test traversal must not earn a smooth-driving distinction');
 report.checks.harborFinishAppliesAndProbeCannotEarnDistinction=true;
 await page.evaluate(()=>globalThis.__sandboxTestContext.worldDiscoveryRuntime.ui?.setOpen?.(false));
 await page.screenshot({path:`${out}/harbor-slate-world.png`});
 await page.evaluate(()=>globalThis.__sandboxTestContext.openWorldDiscoverySection('today'));
 await page.setViewportSize({width:390,height:844});await page.locator('#discoveryHarborRun').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/harbor-complete-phone.png`});
 await page.locator('[data-delivery-action="badge"]').click();
 await page.locator('[data-explorer-badge="harbor-driver"]').waitFor({state:'visible'});
 await page.screenshot({path:`${out}/harbor-badge-phone.png`});
 report.checks.harborRouteUnloadAndSave=true;
 await page.evaluate(()=>globalThis.__sandboxTestContext.setTravelMode('walk'));
}
