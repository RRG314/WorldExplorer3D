import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';

export async function completeBrowserChecks({page,out,report,read,mark,remainingOnly=false,framesOnly=false}){
 await page.evaluate(()=>completionContext.renderer.domElement.dataset.completionCanvas='main');
 const travel=async id=>{await page.locator('#travelBtn').click();await page.locator(id).click();};
 const ready=()=>page.waitForFunction(()=>{const c=completionContext;return c.getEnv?.()==='EARTH'&&!c.spaceFlight?.active&&!c.activeShipInterior&&!c.onMoon&&!c.onMars&&c.activeTransportActor?.().frame==='surface'&&c.gameStarted&&!c.worldLoading&&!c.earthResumePending&&!c.titleLaunchPending&&c.worldLoadRuntimeState?.status==='ready';},null,{timeout:180000,polling:500});
 const capture=async name=>{await page.waitForTimeout(350);await page.screenshot({path:`${out}/${name}.png`});};
 const overlay=()=>page.evaluate(()=>completionContext.exportLocalEditableWorld());
 if(!remainingOnly){
 mark('portable-accepted-cells');
 report.cells=await page.evaluate(()=>{
  const c=completionContext,result=[];
  for(const p of [{x:0,z:0},c.car]){
   const key=`${Math.floor(p.x/1024)}:${Math.floor(p.z/1024)}`,facts=c.worldSnapshotStore.readCell(key);
   const encoded=c.worldSnapshotStore.exportCell(key),json=JSON.parse(encoded);
   if(facts.requestId!==c.worldPublication.requestId||json.schemaVersion!==1)throw Error('Unowned cell export');
   result.push({key,bytes:encoded.length,terrainMeshes:facts.layers.terrain.meshes.length,
    buildings:facts.layers.buildings.length,regionalBatches:facts.layers.regionalBuildings.length,
    sourceBuildingIds:facts.layers.regionalBuildings.flatMap(b=>b.sourceIds||[b.id]).filter(Boolean).length,
    roads:facts.layers.transport.length,geometryPackets:facts.layers.transportGeometry.length,
    entrances:facts.layers.entrances.length,places:facts.layers.places.length,frame:facts.frame,coverage:facts.coverage});
  }
  return result;
 });
 assert.ok(report.cells.every(c=>c.terrainMeshes>0&&c.roads>0));assert.ok(report.cells.some(c=>c.sourceBuildingIds>0));
 report.cases.push('actual selected cells export original terrain, source identities and accepted transport geometry');
 mark('persistent-local-overlay');
 assert.equal(await page.evaluate(()=>completionContext.placeDiscoveryWorldObject({id:'completion-local-sign',type:'sign',position:{x:45,y:15,z:45}}).committed),true);
 report.overlayBefore=await overlay();
 mark('surface-input-handoffs');await travel('#fWalk');const beforeWalk=await read();
 await runPrescribedGameActions(page,out,[{buttons:['up'],frames:24},{buttons:[],frames:3}],'canvas[data-completion-canvas="main"]');
 const walked=await read();assert.equal(walked.mode,'walk');assert.ok(Math.hypot(walked.actor.position.x-beforeWalk.actor.position.x,walked.actor.position.z-beforeWalk.actor.position.z)>.05);
 await travel('#fDrone');assert.equal((await read()).mode,'drone');await travel('#fPlane');assert.equal((await read()).mode,'plane');
 await travel('#fDriving');assert.equal((await read()).mode,'drive');report.cases.push('drive, walking input, drone, aircraft and drive handoffs');
 mark('regional-option-publication');
 const previous=await page.evaluate(()=>{const c=completionContext;const old=c.worldSnapshotStore.residency();c.setRegionalSceneryEnabled(true);return old;});
 assert.equal(await page.evaluate(p=>completionContext.travelToWorldPoint(p.x,p.z,{source:'large_map_context'}).valid,report.route[2]),true);
 await page.waitForFunction(()=>{const c=completionContext,s=c.getRegionalSceneryState();if(s.error)throw Error(s.error);return !s.pending&&Math.abs(s.anchor.x)>4000&&c.farTerrainClipmapState?.status==='ready';},null,{timeout:180000,polling:500});
 report.regional=await read();report.regional.residency=await page.evaluate(()=>completionContext.worldSnapshotStore.residency());
 assert.equal(report.regional.buildings,report.initial.buildings);assert.equal(report.regional.roads,report.initial.roads);
 assert.equal(report.regional.residency.regions.filter(r=>r.key==='regional-window').length,1);
 assert.equal(report.regional.residency.resourceCount,report.regional.residency.regions.length);
 report.regional.previous=previous;
 assert.deepEqual(await overlay(),report.overlayBefore);
 await page.evaluate(()=>completionContext.setRegionalSceneryEnabled(false));
 await page.waitForFunction(()=>{const c=completionContext,s=c.getRegionalSceneryState();if(s.error)throw Error(s.error);return !s.pending&&s.anchor.x===0&&s.anchor.z===0&&c.farTerrainClipmapState?.status==='ready';},null,{timeout:180000,polling:500});
 assert.deepEqual(await overlay(),report.overlayBefore);report.cases.push('regional option replaces one complete scoped window, preserves pinned district and local edits, returns to fixed-location play');
 }else{
  assert.equal(await page.evaluate(()=>completionContext.placeDiscoveryWorldObject({id:'completion-local-sign',type:'sign',position:{x:45,y:15,z:45}}).committed),true);
  report.overlayBefore=await overlay();
 }
 if(!framesOnly){
 mark('harbor-city-presentation');await travel('#fWalk');
 report.harbor=await page.evaluate(()=>{
  const c=completionContext,p=c.geoToWorld(39.285,-76.6098);let nearest=null,best=Infinity;
  for(const road of c.roads){
   if(road.walkable===false||road.structureSemantics?.terrainMode!=='at_grade')continue;
   for(let i=1;i<(road.pts?.length||0);i++){
    const a=road.pts[i-1],b=road.pts[i],x=(a.x+b.x)/2,z=(a.z+b.z)/2,d=Math.hypot(x-p.x,z-p.z);
    if(d<best){best=d;nearest={x,z,id:road.sourceFeatureId};}
   }
  }
  if(!nearest||best>500)throw Error('No accepted mapped harbor approach');
  const arrival=c.travelToWorldPoint(nearest.x,nearest.z,{source:'large_map_context'});
  return {source:nearest,distance:best,arrival:{valid:arrival?.valid===true}};
 });assert.equal(report.harbor.arrival?.valid,true);
 await page.evaluate(()=>completionContext.setTimeOfDay('day'));await capture('harbor-day');
 await page.evaluate(()=>completionContext.setTimeOfDay('night'));await capture('harbor-night');
 await travel('#fDrone');await capture('harbor-regional-night');await travel('#fWalk');
 report.presentation=await page.evaluate(()=>{const c=completionContext,versions=new Set();c.scene.traverse(object=>{for(const material of Array.isArray(object.material)?object.material:[object.material])if(material?.userData?.facadePresentationVersion)versions.add(material.userData.facadePresentationVersion);});return {versions:[...versions],gpu:{...c.renderer.info.memory},programErrors:c.renderer.info.programs.filter(p=>p.diagnostics?.runnable===false).length};});
 assert.deepEqual(report.presentation.versions,['facade-presentation-v1']);assert.equal(report.presentation.programErrors,0);
 mark('mobile-input-same-world');const cdp=await page.context().newCDPSession(page);
 await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});await page.setViewportSize({width:390,height:844});
 await page.locator('#mobileTouchControls.show.mode-walking').waitFor({timeout:10000});
 const pad=await page.locator('#mobileMovePad').boundingBox();assert.ok(pad);const mobileBefore=await read();
 const touch=(x,y)=>({x,y,id:0,radiusX:5,radiusY:5,force:1});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(pad.x+pad.width/2,pad.y+pad.height/2)]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touch(pad.x+pad.width/2,pad.y+pad.height/2-35)]});
 try{await page.waitForTimeout(900);}finally{await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
 const mobileAfter=await read();report.mobile={distance:Math.hypot(mobileAfter.actor.position.x-mobileBefore.actor.position.x,mobileAfter.actor.position.z-mobileBefore.actor.position.z),scope:'Chrome touch emulation, same accepted world; not physical-device performance'};
 assert.ok(report.mobile.distance>.1);await capture('mobile-walking');await page.setViewportSize({width:1280,height:800});await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});await cdp.detach();
 report.cases.push('harbor day/night, regional facades, character and mobile walking input');
 }
 mark('ship-frame-entry-return');await travel('#fBoardSolisReach');await page.waitForFunction(()=>completionContext.activeShipInterior===true,null,{timeout:90000});
 const ship=await read();assert.equal(ship.actor.frame,'ship-interior');
 await runPrescribedGameActions(page,out,[{buttons:['down'],frames:24},{buttons:[],frames:3}],'canvas[data-completion-canvas="main"]');
 const shipMoved=await read();assert.ok(Math.hypot(shipMoved.actor.position.x-ship.actor.position.x,shipMoved.actor.position.z-ship.actor.position.z)>.05);
 await page.evaluate(()=>completionContext.setTimeOfDay('day'));await capture('interior-day');
 await page.evaluate(()=>completionContext.setTimeOfDay('night'));await capture('interior-night');
 await page.locator('#shipExitButton').click();await page.waitForFunction(()=>completionContext.spaceFlight?.active&&!completionContext.activeShipInterior);
 await page.locator('#universeToggle').click();await page.locator('#universeReturnEarthBtn').click();await ready();
 report.frameReturn=await read();assert.equal(report.frameReturn.actor.frame,'surface');assert.equal(report.frameReturn.world,report.initial.world);
 assert.deepEqual(await overlay(),report.overlayBefore);report.cases.push('authored ship walking frame exits to flight and returns to the same Earth publication with local edits');
 mark('planetary-command-integration');await page.evaluate(()=>completionContext.arriveAtMoon());
 await page.waitForFunction(()=>{const c=completionContext;return c.onMoon&&c.moonSurface&&!c.paused&&c.getCurrentTravelMode()==='drive';},null,{timeout:120000});
 report.moon=await read();assert.ok(Number.isFinite(report.moon.actor.position.y));await capture('moon-arrival');
 assert.equal(await page.evaluate(async()=>await completionContext.returnToEarthFromMenu()===true),true);await ready();assert.equal((await read()).world,report.initial.world);
 assert.deepEqual(await overlay(),report.overlayBefore);report.cases.push('actual Moon surface admission and return reuse the accepted Earth world');
 mark('owned-world-release');report.preRelease=await read();
 report.release=await page.evaluate(()=>{const c=completionContext;const result=c.releaseEarthWorldForTitle({reason:'completion-owned-browser-check'});return {result,residency:c.worldSnapshotStore.residency(),roads:c.roadMeshes.length,buildings:c.buildingMeshes.length,gpu:{...c.renderer.info.memory},overlay:c.exportLocalEditableWorld()};});
 assert.equal(report.release.residency.resourceCount,0);assert.equal(report.release.residency.regions.length,0);assert.equal(report.release.roads,0);assert.equal(report.release.buildings,0);
 assert.deepEqual(report.release.overlay,report.overlayBefore);report.cases.push('release retires all geographic leases and scene meshes without deleting local progress');
 await fs.writeFile(`${out}/completed-extra-checks.json`,JSON.stringify({passed:true,cases:report.cases},null,2));
}
