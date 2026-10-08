import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {startStaticServer} from './static-server.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
import {collectBrowserGraphicsErrors} from './browser-graphics-errors.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
const locations=[
 ['giza',29.9792,31.1342],['great-wall',40.4319,116.5704],['big-ben',51.5007,-.1255],['san-francisco-hill',37.802,-122.419],
 ['canyon',36.099,-112.0963],['antarctica',-77.846,166.668],
 ['boreal',64.146,28.289],['amazon',-3.465,-62.215],
 ['sahara',23.416,25.662],['alpine',46.577,8.006],
 ['tokyo',35.6762,139.6503],['london',51.5074,-.1278],
 ['cape-town',-33.925,18.424],['sydney',-33.856,151.215],
 ['iowa',42.08,-93.87],['iceland',64.255,-21.12]
];
const selected=(process.env.WE3D_VISUAL_LOCATIONS||'').split(',').filter(Boolean);
const out=`output/visual-quality/${process.env.WE3D_VISUAL_OUTPUT||'geography'}`;await fs.mkdir(out,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4462]});
const base=`http://127.0.0.1:${server.port}`,results=[];
try{for(const [id,lat,lon] of locations.filter(l=>!selected.length||selected.includes(l[0]))){
 let owned,browser;const errors=[],localFailures=[];const result={id,lat,lon,errors,localFailures,ok:false};
 console.log(`START ${id}`);
 try{
 owned=await chromium.launchServer({channel:'chrome',headless:true,args:['--js-flags=--max-old-space-size=1280']});
 browser=await chromium.connect(owned.wsEndpoint());const page=await browser.newPage({viewport:{width:1280,height:800}});
 await configureStagingAppCheck(page,base);collectBrowserGraphicsErrors(page,errors);
 page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)localFailures.push({url:r.url(),status:r.status()});});
 const params=new URLSearchParams({loc:'custom',lat,lon,lname:id,launch:'earth',gm:'free',mode:'walking'});
 const start=performance.now();await page.goto(`${base}/app/?${params}`,{waitUntil:'load',timeout:120000});
 await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__,null,{timeout:120000});
 const consent=page.locator('#analyticsConsentDenyBtn');if(await consent.isVisible())await consent.click();
 await page.getByRole('button',{name:'Explore',exact:true}).click();
 await page.waitForFunction(()=>{const s=JSON.parse(globalThis.render_game_to_text?.()||'{}'),d=globalThis.getWorldExplorerRuntimeDiagnostics?.();return s.gameStarted&&!s.worldLoading&&!document.querySelector('#loading.show')&&Number.isFinite(d?.surfaceChain?.surfaces?.terrain?.y);},null,{timeout:360000});
 result.firstPlayableMs=performance.now()-start;
 await page.evaluate(async()=>{const{ctx}=await import('/app/js/shared-context.js?v=55');ctx.setTimeOfDay?.('day');ctx.setWeatherMode?.('clear');});
 await page.waitForTimeout(3500);
 if(['giza','great-wall','big-ben'].includes(id)) {
  await page.evaluate(async()=>{globalThis.__WE3D_GEOGRAPHY_CONTEXT__=(await import('/app/js/shared-context.js?v=55')).ctx;});
  await page.waitForFunction(()=>!!globalThis.__WE3D_GEOGRAPHY_CONTEXT__.mappedLandmarkMetrics,null,{timeout:60000});
 }

 result.snapshot=await page.evaluate(async()=>{const{ctx}=await import('/app/js/shared-context.js?v=55');const d=globalThis.getWorldExplorerRuntimeDiagnostics?.()||{};return{state:JSON.parse(globalThis.render_game_to_text()),landmarks:ctx.mappedLandmarkMetrics,historicVisuals:(ctx.historicMarkers||[]).map(m=>({name:m.name,kind:m.userData?.landmarkKind,id:m.userData?.curatedLandmarkId,visible:m.visible,attached:!!m.parent})),profile:ctx.worldSurfaceProfile,counts:d.worldCounts,surface:d.surfaceChain,providers:d.worldLoad?.session?.providers,vegetation:ctx.vegetationModelStatus,lighting:{skyMode:ctx.skyMode,skyState:ctx.skyState,exposure:ctx.renderer?.toneMappingExposure,lights:[ctx.sun,ctx.hemiLight,ctx.fillLight,ctx.ambientLight].map(l=>l?{type:l.type,intensity:l.intensity,color:l.color?.getHexString(),position:l.position?.toArray()}:null)},terrainMaterials:(ctx.terrainTiles instanceof Map?[...ctx.terrainTiles.values()]:[]).slice(0,2).map(t=>({keys:Object.keys(t),material:t.mesh?.material?.toJSON?.()})),renderer:{memory:{...ctx.renderer?.info.memory},render:{...ctx.renderer?.info.render},programs:ctx.renderer?.info.programs?.length},heap:performance.memory?.usedJSHeapSize};});

 if(process.env.WE3D_LANDMARK_DIAG==='1')result.buildingDiagnostic=await page.evaluate(async()=>{const{ctx}=await import('/app/js/shared-context.js?v=55');return {walker:{...ctx.Walk?.state?.walker},car:{x:ctx.car?.x,z:ctx.car?.z,angle:ctx.car?.angle},camera:{position:ctx.camera.position.toArray(),direction:ctx.camera.getWorldDirection(new THREE.Vector3()).toArray()},records:ctx.buildingProvenanceRecords,meshes:(ctx.buildingMeshes||[]).slice(0,20).map(m=>({name:m.name,data:m.userData})),historic:(ctx.historicMarkers||[]).map(m=>({name:m.name,data:m.userData,bounds:new THREE.Box3().setFromObject(m).toArray?.()}))};});
 await page.screenshot({path:`${out}/${id}.png`});
 await page.keyboard.down('w');await page.waitForTimeout(800);await page.keyboard.up('w');
 await page.screenshot({path:`${out}/${id}-walk.png`});
 if(process.env.WE3D_VISUAL_DIAG==='1'){
 result.landmarkNeighbors=await page.evaluate(async()=>{const{ctx}=await import('/app/js/shared-context.js?v=55');const p=Math.abs(ctx.LOC.lat-40.4319)<.01?ctx.geoToWorld(40.4338583,116.5743061):ctx.geoToWorld(51.5007292,-.1246254);return (ctx.buildingMeshes||[]).filter(m=>{const f=m.userData?.buildingFootprint;if(!f?.length)return false;const c=f.reduce((a,b)=>({x:a.x+b.x/f.length,z:a.z+b.z/f.length}),{x:0,z:0});return Math.hypot(c.x-p.x,c.z-p.z)<180;}).map(m=>({name:m.name,visible:m.visible,hasGeometry:!!m.geometry?.attributes?.position,data:Object.fromEntries(['sourceBuildingId','buildingMetadataSourceId','buildingProvenance','buildingFootprint','heightMeters','buildingName'].map(k=>[k,m.userData[k]]))}));});
 result.ray=await page.evaluate(async()=>{const{ctx}=await import('/app/js/shared-context.js?v=55');const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(0,.2),ctx.camera);const targets=[];ctx.scene.traverse(o=>{if(o.isMesh&&o.geometry?.attributes?.position)targets.push(o);});const hit=ray.intersectObjects(targets,false).find(h=>{if(!h.object.isMesh)return false;for(let o=h.object;o;o=o.parent)if(!o.visible)return false;return true;});if(!hit)return null;const m=hit.object.material;globalThis.__visualHit=hit.object;return{name:hit.object.name,ancestors:(()=>{const a=[];for(let o=hit.object;o;o=o.parent)a.push({name:o.name,type:o.type,curated:o.userData.curatedLandmarkId});return a;})(),userDataKeys:Object.keys(hit.object.userData),userData:Object.fromEntries(['landmarkKind','sourceFeatureId','sourceBuildingId','buildingMetadataSourceId','buildingProvenance','terrainVisualProfile','worldCoverSummary','regionalImagery'].map(k=>[k,hit.object.userData[k]])),normal:hit.face?.normal?.toArray(),samples:{mixA:hit.object.geometry.attributes.terrainSurfaceMixA?Array.from(hit.object.geometry.attributes.terrainSurfaceMixA.array.slice(hit.face.a*4,hit.face.a*4+4)):null,mixB:hit.object.geometry.attributes.terrainSurfaceMixB?Array.from(hit.object.geometry.attributes.terrainSurfaceMixB.array.slice(hit.face.a*2,hit.face.a*2+2)):null,textureSources:Object.fromEntries(Object.entries(m.userData.terrainSurfaceMaterialBlend?.uniforms||{}).filter(([k,v])=>v.value?.isTexture).map(([k,v])=>[k,{src:v.value.image?.src,encoding:v.value.encoding}]))},material:{type:m.type,color:m.color?.getHexString(),roughness:m.roughness,metalness:m.metalness,normal:m.normalScale?.toArray(),defines:m.defines,map:m.map?.image?.src},point:hit.point.toArray()};});
 result.materialDiagnostic=await page.evaluate(async()=>{const{ctx}=await import('/app/js/shared-context.js?v=55');const o=globalThis.__visualHit;const u=o?.material?.userData?.terrainSurfaceMaterialBlend?.uniforms;const summary={imagery:o?.userData.regionalImagery,uniforms:u?Object.fromEntries(Object.entries(u).map(([k,v])=>[k,typeof v.value==='number'?v.value:v.value?.name])):null};ctx.scene.traverse(m=>{if(m.isMesh&&m.userData.isTerrainMesh){const a=m.material?.userData?.terrainSurfaceMaterialBlend?.uniforms;if(a){a.terrainRegionalReady.value=0;a.terrainLocalReady.value=0;}}});return summary;});
 await page.waitForTimeout(300);await page.screenshot({path:`${out}/${id}-no-imagery-diagnostic.png`});
 await page.evaluate(async()=>{const{ctx}=await import('/app/js/shared-context.js?v=55');ctx.scene.traverse(m=>{if(m.isMesh&&m.userData.isTerrainMesh){m.material.vertexColors=false;m.material.normalMap=null;m.material.needsUpdate=true;}});});
 await page.waitForTimeout(300);await page.screenshot({path:`${out}/${id}-no-tints-normal-diagnostic.png`});
 const imagery=await page.evaluate(()=>globalThis.__visualHit?.material?.userData?.terrainSurfaceMaterialBlend?.uniforms?.terrainLocalMap?.value?.image?.toDataURL?.());if(imagery)await fs.writeFile(`${out}/${id}-source-imagery.png`,Buffer.from(imagery.split(',')[1],'base64'));
 await page.evaluate(()=>{const o=globalThis.__visualHit;if(o)o.material=new THREE.MeshStandardMaterial({color:0xaaaaaa,roughness:1});});
 await page.waitForTimeout(300);await page.screenshot({path:`${out}/${id}-neutral-diagnostic.png`});
 }

 if(['giza','big-ben'].includes(id))assert.ok(result.snapshot.landmarks?.curatedModels?.loaded?.length>0,'Dedicated landmark was not published');
 if(id==='great-wall')assert.ok(result.snapshot.landmarks?.walls>0,'Mapped wall was not published');
 assert.deepEqual(errors,[]);assert.deepEqual(localFailures,[]);result.ok=true;
 }catch(e){result.failure=String(e.stack||e);console.error(result.failure);}
 finally{await browser?.close().catch(()=>{});if(owned)await closeOwnedBrowser(owned);}
 results.push(result);await fs.writeFile(`${out}/report.json`,JSON.stringify({ok:results.every(r=>r.ok),results},null,2));console.log(`END ${id}: ${result.ok}`);
}}
finally{await server.close();}
if(!results.every(r=>r.ok))process.exitCode=1;
