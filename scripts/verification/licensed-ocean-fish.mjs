import assert from 'node:assert/strict';
export async function verifyLicensedOceanFish({page,dir,report}){
 const visits=[];
 for(const [index,longitude] of [130.9,-80.3,130.9,-80.3].entries()){
  const latitude=longitude>0?-12.5:25.5;
  const started=await page.evaluate(async({latitude,longitude})=>{
   const ctx=waterCheckContext,site={lat:latitude,lon:longitude,name:longitude>0?'Northern Australian coastal review':'Florida coastal review',region:'Controlled marine acceptance'};
   const waterContext={version:1,waterKind:'coastal',sourceDataset:'controlled-mapped-coast',sourceTruth:'published-water-surface',waterbodyId:`review-coast:${latitude}:${longitude}`};
   if(!await ctx.startOceanMode({launchSite:site,entry:{...site,source:'gebco-elevation-sample',kind:'modeled-ocean',elevationMeters:-30,waterContext}}))return false;
   await ctx.oceanMode.bathymetryPromise;await ctx.oceanMode.fishVisualsReady;return true;
  },{latitude,longitude});assert.equal(started,true);
  await page.waitForTimeout(400);
  const state=await page.evaluate(async()=>{
   const m=waterCheckContext.oceanMode,{modelAssetCacheSnapshot}=await import('/app/js/assets/model-asset-runtime.js?v=16');
   return {ids:m.fishEntities.map(f=>f.speciesId),licensed:m.fishEntities.filter(f=>f.speciesId==='barramundi').map(f=>({state:f.visualState,visible:f.mesh.visible,children:f.mesh.children.length})),
    memory:{...m.renderer.info.memory},asset:modelAssetCacheSnapshot().entries.find(e=>e.id==='marine-barramundi'),badPrograms:m.renderer.info.programs.filter(p=>p.diagnostics?.runnable===false).length};
  });
  assert.equal(state.badPrograms,0);
  if(longitude>0){assert.equal(state.licensed.length,3);assert.ok(state.licensed.every(f=>f.state==='licensed'&&f.visible&&f.children===1));assert.equal(state.asset.leases,3);}
  else{assert.equal(state.licensed.length,0);assert.equal(state.asset.leases,0);}
  visits.push(state);
  if(index===0){
   const motion=await page.evaluate(async()=>{
    const ctx=waterCheckContext,m=ctx.oceanMode,fish=m.fishEntities.find(f=>f.speciesId==='barramundi');
    const before=fish.mesh.position.clone();await new Promise(resolve=>setTimeout(resolve,900));
    const moved=before.distanceTo(fish.mesh.position);ctx.setPauseReason('licensed-fish-review',true);
    const original={position:m.camera.position.toArray(),quaternion:m.camera.quaternion.toArray(),lookTarget:m.cameraLookTarget.toArray()},p=fish.mesh.position;
    // Deliberate close model-review camera; this is not the ordinary diver camera.
    const side=new THREE.Vector3(1,0,.25).applyQuaternion(fish.mesh.quaternion);m.camera.position.copy(p).addScaledVector(side,2.1);m.camera.position.y+=.22;m.cameraLookTarget.copy(p);m.camera.lookAt(p);m.renderer.render(m.scene,m.camera);
    return {moved,original};
   });assert.ok(motion.moved>.1);
   await page.screenshot({path:`${dir}/barramundi-in-ocean-review.png`});
   await page.evaluate(({original})=>{const ctx=waterCheckContext,m=ctx.oceanMode;m.camera.position.fromArray(original.position);m.camera.quaternion.fromArray(original.quaternion);m.cameraLookTarget.fromArray(original.lookTarget);ctx.setPauseReason('licensed-fish-review',false);},motion);
   report.cases.push({id:'licensed-textured-barramundi-loads-animates-and-moves-in-actual-ocean',passed:true});
  }
 }
 assert.ok(visits[2].memory.geometries<=visits[0].memory.geometries+2);assert.ok(visits[2].memory.textures<=visits[0].memory.textures+2);
 assert.ok(visits[3].memory.geometries<=visits[1].memory.geometries+2);assert.ok(visits[3].memory.textures<=visits[1].memory.textures+2);
 report.licensedFishVisits=visits;report.cases.push({id:'licensed-fish-respect-region-and-release-all-instance-leases-across-four-visits',passed:true});
}
