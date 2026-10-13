import assert from 'node:assert/strict';
export async function verifyThreeViews({page,out,report}){
 await page.setViewportSize({width:1440,height:900});
 await page.evaluate(()=>globalThis.__sandboxTestContext.openWorldDiscoverySection('today'));
 await page.locator('[data-photo-action="accept:photo"]').click();
 await page.waitForFunction(()=>globalThis.__sandboxTestContext.worldDiscoveryRuntime.threeViews.snapshot().phase==='choose');
 // Controlled camera/actor poses exercise actual loaded GIS meshes, rendering
 // and UI. They are explicitly not an uncoached walk between viewpoints.
 // Repeat the reviewed Baltimore subject, using its current mapped footprint
 // to place the camera. Shutter selection, visibility/depth validation and
 // saving all remain the actual packaged game. This fixture does not publish
 // private campaign modules or inject a substitute capture implementation.
 const poses=await page.evaluate(()=>{
  const ctx=globalThis.__sandboxTestContext;
  ctx.setTravelMode('walk');
  const actor=ctx.Walk.state.walker;
  const subjectId='overture:cbf3a3ad-3dfb-4b3f-9df6-59abc05771b7';
  const b=ctx.buildings.find(b=>b.sourceBuildingId===subjectId&&b.pts?.length>=3);
  if(!b)throw Error('The reviewed Baltimore photo subject is missing from the loaded world');
  const x=b.pts.reduce((n,p)=>n+p.x,0)/b.pts.length,z=b.pts.reduce((n,p)=>n+p.z,0)/b.pts.length;
  const distance=Math.max(...b.pts.map(p=>Math.hypot(p.x-x,p.z-z)))+12,ground=Number(b.baseY??b.minY??0);
  const target={x,y:ground+2.1,z};
  const selected=Object.fromEntries([['context',Math.PI*3/4],['detail',Math.PI/2],['setting',Math.PI*5/4]].map(([kind,angle])=>{
   const pose={x:x+Math.sin(angle)*distance,z:z+Math.cos(angle)*distance,y:ground+1.75,target,subjectId};
   if(ctx.checkBuildingCollision?.(pose.x,pose.z,.4)?.collision)throw Error(`Reviewed ${kind} camera pose is obstructed`);
   return [kind,pose];
  }));
  globalThis.__photoPoses=selected;globalThis.__photoPose=selected.context;
  globalThis.__photoRigDispose=ctx.registerRuntimeSystem({id:'verification.photo-pose',owner:'verification',phase:'camera',priority:10000,update(){
   const p=globalThis.__photoPose;ctx.camera.position.set(p.x,p.y,p.z);ctx.camera.lookAt(p.target.x,p.target.y,p.target.z);
   Object.assign(actor,{x:p.x,y:p.y-1.75,z:p.z});
  }});
  return selected;
 });
 report.photoPoses=poses;
 await page.waitForTimeout(300);
 await page.keyboard.press('e');
 await page.waitForFunction(()=>globalThis.__sandboxTestContext.worldDiscoveryRuntime.threeViews.snapshot().phase==='framing');
 for(const kind of ['context','detail','setting']){
  if(kind!=='context')await page.locator(`[data-photo-action="arm:${kind}"]`).click();
  await page.evaluate(kind=>{globalThis.__photoPose=globalThis.__photoPoses[kind];},kind);
  await page.waitForTimeout(350);await page.screenshot({path:`${out}/photo-${kind}-world.png`});
  await page.keyboard.press('e');
  await page.waitForFunction(()=>globalThis.__sandboxTestContext.worldDiscoveryRuntime.threeViews.snapshot().candidate,null,{timeout:20000});
  const image=page.locator('.discoveryPhotoPreview img');await image.waitFor();
  assert.equal(await image.evaluate(img=>img.complete&&img.naturalWidth>100),true);
  await page.locator('[data-photo-action="keep"]').click();
  await page.waitForFunction(kind=>globalThis.__sandboxTestContext.worldDiscoveryRuntime.threeViews.snapshot().views.includes(kind),kind);
 }
 await page.locator('[data-photo-action="finish"]').click();
 await page.waitForFunction(()=>globalThis.__sandboxTestContext.worldDiscoveryRuntime.threeViews.snapshot().phase==='complete');
 await page.locator('#discoveryThreeViews').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/photo-album-desktop.png`});
 await page.setViewportSize({width:390,height:844});await page.locator('#discoveryThreeViews').scrollIntoViewIfNeeded();
 assert.equal(await page.locator('#discoveryPanel').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
 await page.screenshot({path:`${out}/photo-album-phone.png`});
 const download=page.waitForEvent('download');await page.locator('[data-photo-action="export"]').click();const file=await download;await file.saveAs(`${out}/three-views.html`);
 const check=await page.evaluate(async()=>{
  const ctx=globalThis.__sandboxTestContext,store=ctx.discoveryProfileStore,backup=await store.exportData();
  const images=backup.albums[0].photos,record=(await store.getProfile()).threeViews;
  if(record.subject.id!==globalThis.__photoPoses.context.subjectId)throw Error('Shutter selected a different mapped subject');
  if(new Set(images.map(p=>p.dataUrl)).size!==3)throw Error('Duplicate or missing actual scene images');
  await store.importData(backup);await ctx.worldDiscoveryRuntime.threeViews.refresh();globalThis.__photoRigDispose();
  return {subject:record.subject,views:record.views,photos:images.length,bytes:images.reduce((n,p)=>n+p.dataUrl.length,0),receipts:(await store.getEventsById(['event:campaign-completed:three-views:v1'])).length};
 });
 assert.equal(check.photos,3);assert.equal(check.receipts,1);report.photoAlbum=check;report.checks.threeRealViewsSavedExportedRestored=true;
 await page.setViewportSize({width:1440,height:900});
}
