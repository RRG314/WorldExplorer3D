import assert from 'node:assert/strict';
export async function verifyThreeViews({page,out,report}){
 await page.setViewportSize({width:1440,height:900});
 await page.evaluate(()=>globalThis.__sandboxTestContext.openWorldDiscoverySection('today'));
 await page.locator('[data-photo-action="accept:photo"]').click();
 await page.waitForFunction(()=>globalThis.__sandboxTestContext.worldDiscoveryRuntime.threeViews.snapshot().phase==='choose');
 // Controlled camera/actor poses exercise actual loaded GIS meshes, rendering
 // and UI. They are explicitly not an uncoached walk between viewpoints.
 const poses=await page.evaluate(async()=>{
  const ctx=globalThis.__sandboxTestContext,T=THREE;
  const {inspectPhotoSubject}=await import('/app/js/campaign/three-views-capture.js');
  const {validateView}=await import('/app/js/campaign/three-views.js');
  ctx.setTravelMode('walk');
  const actor=ctx.Walk.state.walker,origin={x:actor.x,z:actor.z};
  const identity={regionId:ctx.worldDiscoveryRuntime.worldIdentityId,regionLabel:ctx.worldDiscoveryRuntime.regionLabel};
  const nearest=ctx.buildings.filter(b=>b.pts?.length>=3&&b.sourceBuildingId).map(b=>({b,x:b.pts.reduce((n,p)=>n+p.x,0)/b.pts.length,z:b.pts.reduce((n,p)=>n+p.z,0)/b.pts.length})).sort((a,b)=>Math.hypot(a.x-origin.x,a.z-origin.z)-Math.hypot(b.x-origin.x,b.z-origin.z)).slice(0,18);
  let selected=null;
  for(const {b,x,z} of nearest){
   const radius=Math.max(...b.pts.map(p=>Math.hypot(p.x-x,p.z-z))),ground=Number(b.baseY??b.minY??0);
   const target={x,y:ground+2.1,z},options=[];
   for(const distance of [radius+12,radius+30,radius+55])for(let angle=0;angle<Math.PI*2;angle+=Math.PI/4){
    const pose={x:x+Math.sin(angle)*distance,z:z+Math.cos(angle)*distance,y:ground+1.75,target};
    if(ctx.checkBuildingCollision?.(pose.x,pose.z,0.4)?.collision)continue;
    ctx.camera.position.set(pose.x,pose.y,pose.z);ctx.camera.lookAt(target.x,target.y,target.z);ctx.camera.updateMatrixWorld(true);
    try{const hit=inspectPhotoSubject(ctx,identity,String(b.sourceBuildingId));options.push({...pose,view:hit.view,subject:hit.subject});}catch{}
   }
   for(const context of options.filter(p=>p.view.range>=20)){
    const state={mode:'observation',subject:context.subject,regionId:identity.regionId,views:[{...context.view,kind:'context'}]};
    const detail=options.find(p=>{try{validateView(state,{...p.view,kind:'detail'});return true;}catch{return false;}});if(!detail)continue;
    state.views.push({...detail.view,kind:'detail'});
    const setting=options.find(p=>{try{validateView(state,{...p.view,kind:'setting'});return true;}catch{return false;}});
    if(setting){selected={context,detail,setting};break;}
   }
   if(selected)break;
   await new Promise(r=>setTimeout(r,0));
  }
  if(!selected)throw Error(`No clear three-view subject found in ${nearest.length} loaded building candidates`);
  globalThis.__photoPoses=selected;globalThis.__photoPose=selected.context;
  globalThis.__photoRigDispose=ctx.registerRuntimeSystem({id:'verification.photo-pose',owner:'verification',phase:'camera',priority:10000,update(){
   const p=globalThis.__photoPose;ctx.camera.position.set(p.x,p.y,p.z);ctx.camera.lookAt(p.target.x,p.target.y,p.target.z);
   Object.assign(actor,{x:p.x,y:p.y-1.75,z:p.z});
  }});
  return Object.fromEntries(Object.entries(selected).map(([k,p])=>[k,{x:p.x,y:p.y,z:p.z,subject:p.subject,view:p.view}]));
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
  const images=backup.albums[0].photos;
  if(new Set(images.map(p=>p.dataUrl)).size!==3)throw Error('Duplicate or missing actual scene images');
  await store.importData(backup);await ctx.worldDiscoveryRuntime.threeViews.refresh();globalThis.__photoRigDispose();
  return {photos:images.length,bytes:images.reduce((n,p)=>n+p.dataUrl.length,0),receipts:(await store.getEventsById(['event:campaign-completed:three-views:v1'])).length};
 });
 assert.equal(check.photos,3);assert.equal(check.receipts,1);report.photoAlbum=check;report.checks.threeRealViewsSavedExportedRestored=true;
 await page.setViewportSize({width:1440,height:900});
}
