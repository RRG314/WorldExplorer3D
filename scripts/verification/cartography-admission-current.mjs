import fs from 'node:fs/promises';
import {createFieldworkQaSession} from './fieldwork-qa-session.mjs';
const output=`output/verification/cartography-career-20261103/admission-${Date.now()}`;
const qa=await createFieldworkQaSession({output,careerId:'cartography',maximumDurationMs:240000});
const {page}=qa;
try {
  await page.goto('http://127.0.0.1:4192/app/?diagnostics=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.getElementById('startBtn')?.disabled===false,null,{timeout:120000});
  if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
  await page.locator('#globeLocationSearch').fill('39.29095, -76.61085');
  await page.locator('#globeLocationSearchBtn').click();
  const result=page.locator('#globeLocationSearchResults [role=option]').first();
  await result.waitFor({timeout:30000});await result.click();
  await page.locator('#globeSelectorStartBtn').click();
  await page.waitForFunction(()=>{const s=JSON.parse(globalThis.render_game_to_text?.()||'{}');return s.gameStarted&&!s.worldLoading&&s.environment==='EARTH';},null,{timeout:120000});
  await page.locator('#loading.show').waitFor({state:'hidden',timeout:120000});
  await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');window.__cartographyLoaded=()=>ctx.initialEarthWorldReady===true&&!!ctx.worldPublication?.requestId&&!ctx.worldLoading;});
  await page.waitForFunction(()=>window.__cartographyLoaded(),null,{timeout:120000});
  const inventory=await page.evaluate(async()=>{
    const {ctx}=await import('/app/js/shared-context.js?v=55');
    const {traversableFeaturesForMode,findTraversalRoute}=await import('/app/js/world/traversal.js?v=4');
    ctx.setTravelMode('walk',{source:'cartography-admission-probe'});
    const w=ctx.Walk.state.walker,u=ctx.METERS_PER_WORLD_UNIT||1.11,near=(p)=>Math.hypot(p.x-w.x,p.z-w.z)*u<180;
    const features=traversableFeaturesForMode('walk').filter(f=>f.pts?.some(near)).slice(0,60);
    const surface=p=>{const s=ctx.SurfaceQuery.walkAt(p.x,p.z,{currentY:w.y,sampleRenderedMesh:true});return {kind:s?.kind,y:s?.position?.y,normal:s?.normal,provenance:s?.provenance};};
    return {loc:ctx.LOC,unit:u,walker:{x:w.x,y:w.y,z:w.z},publication:!!ctx.worldPublication,
      features:features.map(f=>({id:f.id,sourceFeatureId:f.sourceFeatureId,kind:f.kind,name:f.name,width:f.width,access:f.transportRecord?.access,tags:f.sourceTags,points:f.pts.filter(near).slice(0,14).map(p=>({x:p.x,z:p.z,y:p.y,surface:surface(p)})),source:f.sourceTopologyNodes?.slice(0,10)})),
      entrances:(ctx.buildingEntranceCatalog?.entrances||[]).filter(near).slice(0,15).map(e=>({id:e.id,x:e.x,y:e.y,z:e.z,approachX:e.approachX,approachZ:e.approachZ,provenance:e.provenance,buildingSourceId:e.buildingSourceId})),
      sampleRoutes:features.slice(0,5).map(f=>{const p=f.pts.find(near),r=findTraversalRoute(w.x,w.z,p.x,p.z,{mode:'walk',maxAnchorDistance:20});return r?{distance:r.distance,points:r.points.map(p=>({x:p.x,z:p.z}))}:null;})};
  });
  await fs.writeFile(output+'/inventory.json',JSON.stringify(inventory,null,2)+'\n');
  const admission=await page.evaluate(async()=>{
    const {ctx}=await import('/app/js/shared-context.js?v=55'),{qualifyCartographySite}=await import('/app/js/campaign/cartography-site.js');
    const results={};
    for(const variantId of ['campaign','reciprocal','dogleg'])try{const q=qualifyCartographySite(ctx,{id:'cartography-admission:'+variantId,name:'Baltimore virtual survey',location:{lat:ctx.LOC.lat,lon:ctx.LOC.lon,name:'Baltimore'},variantId});results[variantId]={site:q.site,points:q.points,unit:q.metersPerUnit};}catch(e){results[variantId]={error:e.message};}
    return results;
  });
  await fs.writeFile(output+'/admission.json',JSON.stringify(admission,null,2)+'\n');
  await page.screenshot({path:output+'/world.png'});
  console.log(output);console.log(JSON.stringify({features:inventory.features.length,entrances:inventory.entrances.length,walker:inventory.walker}));
}catch(e){await qa.fail(e);throw e;}finally{await qa.close();}
