import {verifyKennedyTour,verifyLaunchPad} from './kennedy-journey.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
import {configureIsolatedWorldBackend} from './isolated-world-backend.mjs';
import {prepareBackendEmulatorParameters} from './backend-emulator-parameters.mjs';
import {runLoggedStep} from './run-logged-step.mjs';
import {stepGameplayKeys} from './gameplay-simulation.mjs';
import {runPrescribedGameActions} from './prescribed-game-actions.mjs';
import {verifyHarborQuayJourney} from './harbor-quay-journey.mjs';

const venue=['museum','kennedy','launchpad'].includes(process.env.WE3D_VENUE)?process.env.WE3D_VENUE:'aquarium';
const out=process.env.WE3D_VENUE_OUTPUT||`output/venue-harbor-repair/${venue}-baseline`;
await mkdir(out,{recursive:true});
if(!process.env.FIREBASE_AUTH_EMULATOR_HOST){
  const cleanup=prepareBackendEmulatorParameters();
  try{
    const result=await runLoggedStep(['firebase','emulators:exec','--non-interactive','--only','auth,firestore,functions','--project','we3d-staging-20260712','node scripts/verification/venue-arrival-current.mjs'],{cwd:process.cwd(),env:process.env,logPath:out+'/emulator.log',timeoutMs:540000});
    console.log(JSON.stringify(result));if(!result.ok)process.exitCode=1;
  }finally{cleanup();}
}else{
  let server,owned,page;
  const report={ok:false,venue,packageRoot:process.env.WE3D_VERIFY_ROOT||null,scope:(process.env.WE3D_VERIFY_ROOT?'Immutable local package':'Mutable source')+', native Chrome GPU, isolated emulator backend. Ordinary exterior approach and E entry; not production or performance certification.',errors:[],checks:[]};
  try{
    server=await startStaticServer({rootDir:process.env.WE3D_VERIFY_ROOT||process.cwd(),ports:[4593,4594]});
    owned=await chromium.launchServer({channel:'chrome',headless:false,args:['--js-flags=--max-old-space-size=1536']});
    const browser=await chromium.connect(owned.wsEndpoint());page=await browser.newPage({viewport:{width:1280,height:800}});
    page.on('pageerror',e=>report.errors.push(String(e)));report.warnings=[];page.on('console',m=>{if(['warning','error'].includes(m.type())&&report.warnings.length<50)report.warnings.push(m.text().slice(0,600));});
    const base=`http://127.0.0.1:${server.port}`;report.failedLocalAssets=[];page.on('response',response=>{const url=new URL(response.url());if(url.origin===base&&response.status()>=400&&/\.(js|css|glb|jpg|png|webp)$/.test(url.pathname))report.failedLocalAssets.push({path:url.pathname,status:response.status()});});await configureIsolatedWorldBackend(page,base);
    const requestTimes=new WeakMap();report.loadingRequests=[];
    page.on('request',request=>requestTimes.set(request,performance.now()));
    const recordRequest=(request,failed)=>{
      const url=new URL(request.url()),elapsedMs=Math.round(performance.now()-(requestTimes.get(request)||performance.now()));
      if(report.loadingRequests.length<180&&(url.pathname.includes('/terrarium/')||url.pathname.includes('/textures/')||url.pathname.endsWith('/CopyShader.js')))
        report.loadingRequests.push({path:url.origin+url.pathname,elapsedMs,failed:failed?request.failure()?.errorText:null});
    };
    page.on('requestfinished',request=>recordRequest(request,false));page.on('requestfailed',request=>recordRequest(request,true));
    if(process.env.WE3D_TERRAIN_FAULT==='once'){
      report.controlledTerrainFailure={path:'/terrarium/15/9045/13669.png',aborted:0};
      await page.route('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/15/9045/13669.png',async route=>{
        if(!report.controlledTerrainFailure.aborted){report.controlledTerrainFailure.aborted++;await route.abort('failed');}
        else await route.continue();
      });
    }
    const start=venue==='launchpad'?'lat=28.62374&lon=-80.62055&lname=Launch%20Pad%2039B':venue==='kennedy'?'lat=28.58684&lon=-80.65121&lname=Kennedy%20Space%20Center':process.env.WE3D_VENUE_START==='district'?'lat=39.3098&lon=-76.6147&lname=Baltimore':venue==='museum'?'lat=39.29184&lon=-76.61036&lname=The%20Peale':'lat=39.28551&lon=-76.60860&lname=National%20Aquarium';
    await page.goto(`${base}/app/?launch=earth&gm=free&loc=custom&${start}&mode=walking&diagnostics=1`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__,null,{timeout:120000});
    if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
    if(await page.locator('#globeSelectorStartBtn').isVisible())await page.locator('#globeSelectorStartBtn').click();
    await page.waitForFunction(()=>{const d=getWorldExplorerRuntimeDiagnostics();return d.gameStarted&&!d.worldLoading&&!document.getElementById('loading')?.classList.contains('show');},null,{timeout:300000});
    const skip=page.getByRole('button',{name:'Skip guide',exact:true});if(await skip.isVisible())await skip.click();
    await page.evaluate(async()=>{globalThis.venueCtx=(await import('/app/js/shared-context.js?v=55')).ctx;});
    console.log('[venue] World ready; inspecting published doors');
    await page.evaluate(()=>venueCtx.setTimeOfDay?.('day'));
    if(venue==='launchpad'){report.pad=await verifyLaunchPad(page,out);report.checks.push('Mapped launch pad publishes, south approach is continuously walkable');await runPrescribedGameActions(page,out,[{buttons:['up'],frames:12},{buttons:[],frames:4}], 'body > canvas:not(#minimap)');assert.deepEqual(report.errors,[]);assert.deepEqual(report.failedLocalAssets,[]);report.ok=true;}else{
    report.targets=await page.evaluate(venue=>{
      const c=venueCtx;
      return c.buildings.filter(b=>venue==='kennedy'?b.sourceBuildingId==='way/26929904':venue==='museum'?String(b.sourceBuildingId).includes('336352958')||String(b.buildingProvenance?.metadata?.sourceFeatureId).includes('336352958'):b.sourceBuildingId==='overture:7bacec0b-326a-401f-ad9f-f3ebed72c8cf').map(b=>{
        const s=c.resolveBuildingEntrySupport(b,{allowSynthetic:false});return {key:s.key,enterable:s.enterable,reason:s.reason,door:s.exteriorEntrance,pts:b.pts,baseY:b.baseY,minY:b.minY,height:b.height};
      });
    },venue);
    report.load=await page.evaluate(()=>({runtime:venueCtx.worldLoadRuntimeState,metrics:venueCtx.lastWorldLoadMetrics||venueCtx.worldLoadMetrics,buildings:venueCtx.buildings.length,nearbyRoads:venueCtx.roads.filter(r=>r.pts?.some(p=>Math.hypot(p.x,p.z)<300)).map(r=>({id:r.id,name:r.name,type:r.type,tags:r.tags,pts:r.pts,sourceId:r.sourceFeatureId}))}));
    report.exteriors=await page.evaluate(()=>venueCtx.buildingMeshes.filter(m=>m.userData.reviewedVenueExterior).map(m=>m.name));
    assert.ok(report.exteriors.some(name=>name.includes(venue==='kennedy'?'Vehicle Assembly':venue==='museum'?'Peale':'Aquarium')),'Reviewed exterior must publish successfully');
    report.catalog=await page.evaluate(()=>venueCtx.buildingEntranceCatalog?.diagnostics);
    await page.screenshot({path:out+'/arrival.png'});
    const target=report.targets.find(t=>t.door);assert.ok(target,'Reviewed venue must have a visible, published door');
    const point={x:target.door.approachX??target.door.x,z:target.door.approachZ??target.door.z};
    if(process.env.WE3D_VENUE_START==='district'){
      report.placement='Diagnostic placement outside the venue in the already-loaded distant district, followed by normal walking and E. Not a continuous-travel test.';
      await page.evaluate(door=>{
        const w=venueCtx.Walk.state.walker;w.x=door.approachX+door.normalX*7;w.z=door.approachZ+door.normalZ*7;
        w.y=venueCtx.GroundHeight.walkSurfaceY(w.x,w.z)+1.7;w.yaw=Math.atan2(-door.normalX,-door.normalZ);w.lookYawOffset=0;
      },target.door);
    }
    await page.evaluate(()=>venueCtx.setTimeOfDay?.('day'));
    const pose=()=>page.evaluate(()=>{const w=venueCtx.Walk.state.walker;return {x:w.x,y:w.y,z:w.z,yaw:w.yaw||w.angle};});
    report.start=await pose();
    const capture=await page.evaluate(door=>{const c=venueCtx.camera,saved={p:c.position.clone(),q:c.quaternion.clone()},at=venueCtx.geoToWorld(39.28528,-76.60838);if(door.buildingSourceId==='way/26929904'){c.position.set(door.x-250,door.y+220,door.z-240);c.lookAt(door.x,door.y+60,door.z+65);}else if(door.buildingSourceId==='overture:7bacec0b-326a-401f-ad9f-f3ebed72c8cf'){c.position.set(at.x-95,66,at.z-80);c.lookAt(at.x,13,at.z+22);}else{c.position.set(door.x+door.normalX*32+door.normalZ*12,door.y+15,door.z+door.normalZ*32-door.normalX*12);c.lookAt(door.x,door.y+5.5,door.z);}venueCtx.renderer.render(venueCtx.scene,c);globalThis.venueViewHits=[[390,520],[742,512],[610,465]].map(([x,y])=>{const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(x/1280*2-1,1-y/800*2),c);return ray.intersectObjects(venueCtx.scene.children,true).slice(0,3).map(h=>({point:h.point.toArray(),name:h.object.name,parent:h.object.parent.name,id:h.object.userData.sourceBuildingId||h.object.userData.editableBuildingIndexRanges?.find(r=>h.faceIndex*3>=r.start&&h.faceIndex*3<r.start+r.count)?.sourceBuildingId,data:{reviewedVenueExterior:h.object.userData.reviewedVenueExterior,furnitureKind:h.object.userData.furnitureKind,isWaterwayLine:h.object.userData.isWaterwayLine,landuseType:h.object.userData.landuseType}}));});const image=venueCtx.renderer.domElement.toDataURL('image/png');c.position.copy(saved.p);c.quaternion.copy(saved.q);return image.split(',')[1];},target.door);
    await writeFile(out+'/architectural-view.png',Buffer.from(capture,'base64'));
    report.viewHits=await page.evaluate(()=>globalThis.venueViewHits);
    report.architecturalCapture='Diagnostic camera view of the loaded game geometry; player movement checked separately.';
    let previous=Infinity,stalled=0;
    for(let i=0;i<190;i++){
      const p=await pose(),distance=Math.hypot(point.x-p.x,point.z-p.z);if(distance<1.2)break;
      const heading=Math.atan2(point.x-p.x,point.z-p.z),delta=Math.atan2(Math.sin(heading-p.yaw),Math.cos(heading-p.yaw));
      if(Math.abs(delta)>.09){await stepGameplayKeys(page,delta>0?'ArrowLeft':'ArrowRight',Math.max(16,Math.min(450,Math.abs(delta)/2.6*800)));continue;}
      await stepGameplayKeys(page,'ArrowUp',Math.max(30,Math.min(450,(distance-1)/2.8*800)));
      if(distance>previous-.01)stalled++;else stalled=0;previous=distance;
      assert.ok(stalled<12,`Exterior approach blocked at ${JSON.stringify(p)}; target ${JSON.stringify(point)}`);
    }
    report.atDoor=await pose();report.prompt=await page.locator('#interiorPrompt').innerText();
    report.doorRender=await page.evaluate(door=>{
      const target=new THREE.Vector3(door.x,door.y+1.2,door.z),origin=target.clone().add(new THREE.Vector3(door.normalX*8,0,door.normalZ*8));
      venueCtx.scene.updateMatrixWorld(true);
      const ray=new THREE.Raycaster(origin,target.clone().sub(origin).normalize(),0,12);
      return ray.intersectObjects(venueCtx.buildingMeshes,true).slice(0,6).map(h=>({distance:h.distance,point:h.point.toArray(),name:h.object.name,lod:h.object.userData.lodTier,id:h.object.userData.sourceBuildingId||h.object.userData.editableBuildingIndexRanges?.find(r=>h.faceIndex*3>=r.start&&h.faceIndex*3<r.start+r.count)?.sourceBuildingId,provenance:h.object.userData.buildingProvenanceRecords?.filter(r=>r.identity?.featureId===h.object.userData.editableBuildingIndexRanges?.find(r=>h.faceIndex*3>=r.start&&h.faceIndex*3<r.start+r.count)?.sourceBuildingId),isBatch:h.object.userData.isBuildingBatch,entranceVertices:h.object.geometry?.attributes.facadeEntrance?.count,material:h.object.material.name,profile:h.object.userData.exteriorProfile}));
    },target.door);
    report.structureInspection=await page.evaluate(door=>{
      const hitInfo=h=>({point:h.point.toArray(),distance:h.distance,id:h.object.userData.sourceBuildingId||h.object.userData.editableBuildingIndexRanges?.find(r=>h.faceIndex*3>=r.start&&h.faceIndex*3<r.start+r.count)?.sourceBuildingId,name:h.object.name,parent:h.object.parent.name});
      const target=new THREE.Vector3(door.x,door.y+1.4,door.z),camera=venueCtx.camera.position.clone();
      return {camera:camera.toArray(),blockedView:new THREE.Raycaster(camera,target.clone().sub(camera).normalize(),0,30).intersectObjects(venueCtx.buildingMeshes,true).slice(0,8).map(hitInfo),nearby:venueCtx.buildings.filter(b=>Math.hypot(b.centerX-door.x,b.centerZ-door.z)<120).map(b=>({id:b.sourceBuildingId,type:b.buildingType,height:b.height,body:b.bodyHeightMeters,base:b.baseY,pts:b.pts,semantics:b.buildingSemantics})),quays:venueCtx.streetFurnitureMeshes.filter(m=>m.userData.furnitureKind==='waterfront').map(m=>({name:m.name,children:m.children.length}))};
    },target.door);
    await page.screenshot({path:out+'/door.png'});
    await page.keyboard.press('KeyE');
    await page.waitForFunction(venue=>venue==='kennedy'?!!venueCtx.activeInterior?.facility:venue==='museum'?!!venueCtx.activeInterior?.gallery:!!venueCtx.activeInterior?.aquarium,venue,{timeout:25000});
    await page.evaluate(()=>venueCtx.activeInterior.gallery?.ready||venueCtx.activeInterior.aquarium?.ready||venueCtx.activeInterior.facility?.ready);
    if(venue==='kennedy')assert.equal(await page.evaluate(()=>venueCtx.activeInterior.facility.modelReady),true,'NASA crawler must load');
    report.checks.push('Walk from exterior spawn to published door and enter using E');
    await runPrescribedGameActions(page,out,[{buttons:['up'],frames:12},{buttons:[],frames:4}], 'body > canvas:not(#minimap)');
    await page.screenshot({path:out+'/inside.png'});report.state=await page.evaluate(()=>{const s=JSON.parse(render_game_to_text());return {environment:s.environment,modes:s.modes,interior:s.interior,aquarium:s.aquarium};});
    if(venue==='kennedy'){report.tour=await verifyKennedyTour(page,out);report.checks.push('Walk to all four NASA stations and complete the ground-system sequence');}else await stepGameplayKeys(page,'ArrowDown',300);
    await page.keyboard.press('KeyE');
    await page.waitForFunction(()=>!venueCtx.activeInterior,null,{timeout:10000});
    report.checks.push('Leave through the interior exit using normal controls');
    if(process.env.WE3D_CHECK_HARBOR==='1'){report.harbor=await verifyHarborQuayJourney(page,out);report.checks.push('Harbor passenger launch moves, stops outside the quay and reverses away');}
    assert.deepEqual(report.errors,[]);assert.deepEqual(report.failedLocalAssets,[]);if(report.controlledTerrainFailure)assert.equal(report.controlledTerrainFailure.aborted,1);report.ok=true;}
  }catch(error){report.error=String(error.stack||error);if(page){report.failure=await page.evaluate(()=>{const d=globalThis.getWorldExplorerRuntimeDiagnostics?.();return {actor:d?.activeActor,gameStarted:d?.gameStarted,loading:d?.worldLoading,hint:document.getElementById('interiorPrompt')?.innerText};}).catch(()=>null);await page.screenshot({path:out+'/failure.png'}).catch(()=>{});}process.exitCode=1;}
  finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({ok:report.ok,checks:report.checks,error:report.error}));if(page)await page.unrouteAll({behavior:'ignoreErrors'});if(owned)await closeOwnedBrowser(owned);await server?.close();}
}
