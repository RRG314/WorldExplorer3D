import assert from 'node:assert/strict';
import {fitFishToWater} from '../../app/js/ocean/fish-water-envelope.js';
export async function verifyOceanEcology({page,dir,report}){
 const observed=await page.evaluate(async()=>{
  const {ctx}=await import('/app/js/shared-context.js?v=55'),mode=ctx.oceanMode;
  const ids=mode.fishEntities.map(f=>f.mesh.uuid),before=mode.fishEntities.map(f=>f.mesh.position.clone());
  const failures=[],envelopes=[],seen=new Set();let samples=0,maxStep=0,last=mode.lastFrameMs;
  let previous=before.map(p=>p.clone());
  for(let frame=0;frame<180;frame++){
   await new Promise(requestAnimationFrame);const now=mode.lastFrameMs,dt=(now-last)/1000;last=now;samples++;
   for(let i=0;i<mode.fishEntities.length;i++){
    const f=mode.fishEntities[i],p=f.mesh.position,school=mode.fishSchools[f.schoolIndex];
    if(f.mesh.visible){
      seen.add(f.mesh.uuid);
      const sample=mode.waterSurface.sample(p.x,p.z),volume=sample?.volume||sample;
      envelopes.push({x:p.x,y:p.y,z:p.z,radius:f.radius,water:{surfaceY:volume?.surfaceY,bottomY:volume?.bottomY,metersPerWorldUnit:volume?.metersPerWorldUnit},depthBand:school.spawnDepthMeters,nearBottom:school.waterColumnPosition==='near-bottom'});
      if(mode.habitat?.collision(p,f.radius))failures.push({id:f.speciesId,p:p.toArray(),kind:'habitat-overlap'});
    }
    const step=p.distanceTo(previous[i]);maxStep=Math.max(maxStep,step);if(step>Math.min(.1,dt)*f.moveSpeed*1.2+.01)failures.push({kind:'teleport',step,dt});previous[i].copy(p);
   }
  }
  return {count:ids.length,samples,visibleCount:seen.size,failures:failures.slice(0,10),envelopes,maxStep,moving:mode.fishEntities.filter((f,i)=>f.mesh.position.distanceTo(before[i])>.1).length,
   species:[...new Set(mode.fishEntities.map(f=>f.speciesId))],authority:mode.fishPopulationContext.authorityVersion,
   geometry:mode.renderer.info.memory.geometries,texture:mode.renderer.info.memory.textures,
   livePresenceClaim:mode.underwaterSchoolPlan.livePresenceClaim};
 });
 // The runner checks sampled water bounds outside the browser. The delivered
 // game stays untouched and does not import private source-only helpers.
 for(const sample of observed.envelopes){const fit=fitFishToWater(sample);assert.ok(fit&&Math.abs(fit.y-sample.y)<=.02,'Rendered fish remains inside its water and depth envelope');}
 observed.envelopeSamples=observed.envelopes.length;delete observed.envelopes;
 assert.equal(observed.authority,'water-fish-authority-v3');assert.deepEqual(observed.species,['giant_trevally']);assert.equal(observed.livePresenceClaim,false);
 assert.equal(observed.count,8);assert.equal(observed.visibleCount,8);assert.ok(observed.moving>=6,JSON.stringify(observed));assert.deepEqual(observed.failures,[]);
 report.ecology=observed;report.cases.push({id:'actual-reef-school-regional-depth-habitat-motion-envelope-180-frames',passed:true});
 // Controlled asset-review camera in the actual running world, after the
 // ordinary diver journey reaches this habitat. Restore it before continuing.
 const prior=await page.evaluate(async()=>{
  const {ctx}=await import('/app/js/shared-context.js?v=55'),m=ctx.oceanMode;
  ctx.setPauseReason('ecology-asset-review',true);
  const f=m.fishEntities.find(f=>f.mesh.visible),p=f.mesh.position;
  const prior={position:m.camera.position.toArray(),quaternion:m.camera.quaternion.toArray()};
  m.camera.position.set(p.x+3,p.y+1,p.z+3);m.camera.lookAt(p);m.renderer.render(m.scene,m.camera);return prior;
 });
 try{await page.screenshot({path:`${dir}/reef-fish-asset-review.png`});}
 finally{await page.evaluate(async prior=>{const {ctx}=await import('/app/js/shared-context.js?v=55'),m=ctx.oceanMode;m.camera.position.fromArray(prior.position);m.camera.quaternion.fromArray(prior.quaternion);ctx.setPauseReason('ecology-asset-review',false);},prior);}
}

export async function verifyOceanEcologySwitch({page,dir,report}){
 const samples=[];
 for(const site of [{lat:25.5,lon:-80.2,name:'Florida shelf'},{lat:25.5,lon:128,name:'Ryukyu shelf'},{lat:25.5,lon:-80.2,name:'Florida return'},{lat:25.5,lon:128,name:'Ryukyu return'}]){
  const before=await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');return ctx.oceanMode.fishEntities.map(f=>f.mesh.uuid)});
  assert.equal(await page.evaluate(async site=>{const {ctx}=await import('/app/js/shared-context.js?v=55');return ctx.startOceanMode({launchSite:{...site,region:'Controlled geographic fixture'},entry:{...site,source:'gebco-elevation-sample',kind:'modeled-ocean',elevationMeters:-30}})},site),true);
  await page.evaluate(async()=>{window.ecologyCtx=(await import('/app/js/shared-context.js?v=55')).ctx;});
  // Geographic outings now use streamed depth tiles; their readiness does not
  // set the retained fixed-area grid flag. Wait for the active owner and its
  // current habitat before comparing regional life and retained geometry.
  await page.waitForFunction(()=>{
   const m=ecologyCtx.oceanMode;
   return m.continuous
    ? m.stream.canNavigate(m.submarine.position.x,m.submarine.position.z)&&m.streamLifeReady&&m.habitatStreamRevision===m.stream.depth.revision
    : m.globalBathymetryReady;
  });
  await page.evaluate(()=>ecologyCtx.oceanMode.fishVisualsReady);
  await page.waitForTimeout(700);
  const sample=await page.evaluate(async()=>{
   const {ctx}=await import('/app/js/shared-context.js?v=55'),m=ctx.oceanMode;
   return {site:m.launchSite,continuous:m.continuous,species:m.underwaterSchoolPlan.schools.map(s=>s.speciesId),ids:m.fishEntities.map(f=>f.mesh.uuid),
     geometry:m.renderer.info.memory.geometries,texture:m.renderer.info.memory.textures,count:m.fishEntities.length,
     sceneFish:m.scene.children.filter(o=>o.name.startsWith('Ocean fish')).length};
  });
  assert.equal(sample.ids.some(id=>before.includes(id)),false);assert.equal(sample.sceneFish,sample.count);
  if(site.lon<0){assert.ok(sample.species.includes('atlantic_tarpon'));assert.ok(!sample.species.includes('giant_trevally'));}
  else{assert.ok(sample.species.includes('giant_trevally'));assert.ok(!sample.species.includes('atlantic_tarpon'));assert.ok(!sample.species.includes('summer_flounder'));}
  samples.push(sample);
 }
 assert.ok(samples[2].geometry<=samples[0].geometry+2);assert.ok(samples[3].geometry<=samples[1].geometry+2);
 assert.ok(samples[2].texture<=samples[0].texture+2);assert.ok(samples[3].texture<=samples[1].texture+2);
 report.ecologySwitch=samples;report.cases.push({id:'active-region-change-replaces-old-species-and-geometry-plateaus-over-four-visits',passed:true});
 await page.screenshot({path:`${dir}/geographic-ocean-return.png`});
}
