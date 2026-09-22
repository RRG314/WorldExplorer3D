// Use the prescribed action/screenshot client, adding this app's explicit
// readiness contract. Its generic 500ms menu delay is insufficient here.
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const client=process.env.WE3D_GAME_CLIENT || '/Users/stevenreid/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js';
let source=await readFile(client,'utf8');
if (process.env.WE3D_STAGING_APP_CHECK_FILE) {
 const {token} = JSON.parse(await readFile(process.env.WE3D_STAGING_APP_CHECK_FILE, 'utf8'));
 source = source.replace('await page.goto(args.url, { waitUntil: "domcontentloaded" });', `await page.addInitScript(token => { globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = token; }, ${JSON.stringify(token)});\nawait page.goto(args.url, { waitUntil: "domcontentloaded" });`);
}
source = source.replace('await page.click(args.clickSelector, { timeout: 5000 });', 'if (await page.locator("#analyticsConsentDenyBtn").isVisible()) await page.locator("#analyticsConsentDenyBtn").click(); await page.click(args.clickSelector, { timeout: 5000 });');
const patches=[
 ['await page.waitForTimeout(500);', `await page.waitForFunction(() => window.__WE3D_RUNTIME_READY__, null, {timeout:45000});`],
 ['await page.click(args.clickSelector, { timeout: 5000 });', 'await page.click(args.clickSelector, { timeout: 15000 });'],
 ['await page.waitForTimeout(250);', `try { await page.waitForFunction(() => { const s=window.getWorldExplorerRuntimeDiagnostics?.(); return s?.gameStarted && !s.worldLoading && !document.getElementById('loading')?.classList.contains('show'); }, null, {timeout:90000}); }
 catch(error) { fs.mkdirSync(args.screenshotDir,{recursive:true});
 await page.screenshot({path:path.join(args.screenshotDir,'load-failure.png')});
 fs.writeFileSync(path.join(args.screenshotDir,'load-failure.json'),JSON.stringify(await page.evaluate(()=>({diagnostics:window.getWorldExplorerRuntimeDiagnostics?.(),loading:document.getElementById('loading')?.textContent})),null,2));
 throw error; }`]
];
for(const [before,after] of patches){
 if(!source.includes(before)) throw new Error('Prescribed client changed; review readiness adapter before running.');
 source=source.replace(before,after);
}
// A failed start is a failed test, not a successful menu screenshot.
source=source.replace('console.warn("Failed to click selector", args.clickSelector, err);','throw err;');
// The generic client captures console errors but exits successfully. A release
// check must retain that evidence and fail after closing its owned browser.
source=source.replace('if (freshErrors.length) {', 'if (freshErrors.length) { process.exitCode = 1;');
// WebGL's default non-preserved drawing buffer may be cleared before toDataURL.
// Capture the composited page instead, including the real player-facing HUD.
source=source.replace('await captureScreenshot(page, canvas, shotPath);', 'await page.screenshot({path:shotPath, type:"png"});\nfs.writeFileSync(path.join(args.screenshotDir,"runtime.json"),JSON.stringify(await page.evaluate(()=>window.getWorldExplorerRuntimeDiagnostics?.()),null,2));');
if(process.env.WE3D_TEST_DAY==='1') source=source.replace('await doChoreography(page, canvas, steps);', `await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');ctx.setTimeOfDay?.('day');ctx.setWeatherMode?.('clear');});\nawait doChoreography(page, canvas, steps);`);
if(process.env.WE3D_TEST_MOBILE==='1') source=source.replace('const page = await browser.newPage();','const page = await browser.newPage({viewport:{width:412,height:915},isMobile:true,hasTouch:true,deviceScaleFactor:1,userAgent:"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36"});');
if(process.env.WE3D_REAL_GPU==='1') source=source.replace('args: ["--use-gl=angle", "--use-angle=swiftshader"],','channel:"chrome",');
if(process.env.WE3D_TEST_BOAT==='1') source=source.replace('await doChoreography(page, canvas, steps);', `if (!await page.evaluate(()=>window.getWorldExplorerRuntimeDiagnostics?.().modes?.boat)) {
 await page.locator('#travelBtn').click(); await page.locator('#fBoat').click();
 await page.waitForFunction(()=>window.getWorldExplorerRuntimeDiagnostics?.().modes?.boat===true,null,{timeout:15000});
}
await doChoreography(page, canvas, steps);`);
if(process.env.WE3D_TEST_BOAT==='1') source=source.replace('await page.screenshot({path:shotPath, type:"png"});', `await page.screenshot({path:shotPath, type:"png"});
const water = await page.evaluate(async()=>{
 const {ctx}=await import('/app/js/shared-context.js?v=55');
 const {waterSurfaceBaseYAt}=await import('/app/js/boat-mode/water-query.js?v=21');
 const meshes=[]; ctx.scene.updateMatrixWorld(true);
 ctx.scene.traverse(mesh=>{if(mesh.isMesh && mesh.visible && mesh.material?.userData?.weWaterWaveConfig)meshes.push(mesh);});
 const base=waterSurfaceBaseYAt(ctx.boat.x,ctx.boat.z,ctx.boatMode.currentWater);
 const rays=[[0,0],[5,0],[-5,0],[0,5],[0,-5]].map(([dx,dz])=>{
  const ray=new THREE.Raycaster(new THREE.Vector3(ctx.boat.x+dx,base+10000,ctx.boat.z+dz),new THREE.Vector3(0,-1,0));
  return {dx,dz,hits:ray.intersectObjects(meshes,false).map(h=>({name:h.object.name,y:h.point.y,far:h.object.userData.isFarMappedWaterContext===true}))};
 });
 return {base,boat:{x:ctx.boat.x,y:ctx.boat.y,z:ctx.boat.z},rays,glError:ctx.renderer.getContext().getError()};
});
fs.writeFileSync(path.join(args.screenshotDir,'water-'+i+'.json'),JSON.stringify(water,null,2));
if(water.glError!==0 || !water.rays[0].hits.length || water.rays.some(ray=>ray.hits.some(hit=>hit.far || hit.y>water.base+1)))throw Error('Duplicate elevated water surface or rendering failure');`);
if(process.env.WE3D_GROUND_EVIDENCE==='1') source=source.replace('await page.screenshot({path:shotPath, type:"png"});', `await page.screenshot({path:shotPath, type:"png"});
fs.writeFileSync(path.join(args.screenshotDir,'ground.json'),JSON.stringify(await page.evaluate(async()=>{
 const {ctx}=await import('/app/js/shared-context.js?v=55');
 const counts={}; for(const f of ctx.landuses||[])counts[f.type]=(counts[f.type]||0)+1;
 return {location:ctx.LOC,counts,localSamples:(ctx.landuses||[]).slice(0,8).map(f=>({type:f.type,tags:f.tags,source:f.geometrySource})),
 meshes:(ctx.terrainGroup?.children||[]).filter(m=>m.userData?.isTerrainMesh).slice(0,8).map(m=>({
  profile:m.userData.terrainVisualProfile,tinted:m.userData.mappedSemanticTintVertices,
  repeats:m.userData.terrainTextureRepeats,color:m.material?.color?.getHexString(),
  map:m.material?.map?.image?.src,imagery:m.userData.regionalImagery,worldCover:m.userData.worldCoverResult?.stats}))};
}),null,2));`);
if(process.env.WE3D_BUILDING_PARITY==='1') source=source.replace('await page.screenshot({path:shotPath, type:"png"});', `await page.screenshot({path:shotPath, type:"png"});
fs.writeFileSync(path.join(args.screenshotDir,'buildings.json'),JSON.stringify(await page.evaluate(async()=>{
 const {ctx}=await import('/app/js/shared-context.js?v=55');
 return {location:ctx.LOC,device:ctx.isLikelyMobileDevice?.(),detail:ctx.worldDetailState?.buildings,
  buildings:(ctx.buildings||[]).filter(b=>Math.hypot(b.centerX,b.centerZ)<250).map(b=>({id:b.sourceBuildingId,x:b.centerX,z:b.centerZ,pts:b.pts,height:b.bodyHeightMeters,baseY:b.baseY,levels:b.levels})),
  provenance:ctx.buildingProvenanceRecords?.filter(r=>r.identity?.featureId==='overture:ba77061a-6e09-416a-aaf8-3057532ee880')};
}),null,2));`);
if(process.env.WE3D_TERRAIN_SAMPLES==='1') source=source.replace('await page.screenshot({path:shotPath, type:"png"});', `await page.screenshot({path:shotPath, type:"png"});
fs.writeFileSync(path.join(args.screenshotDir,'terrain-samples.json'),JSON.stringify(await page.evaluate(async()=>{
 const {ctx}=await import('/app/js/shared-context.js?v=55');
 const actor=ctx.activeTransportActor().position;
 const meshes=ctx.terrainGroup.children.filter(m=>m.userData?.isTerrainMesh&&!m.userData?.isFarTerrainClipmap).sort((a,b)=>Math.hypot(a.position.x-actor.x,a.position.z-actor.z)-Math.hypot(b.position.x-actor.x,b.position.z-actor.z)).slice(0,4);
 const lines=[];
 for(let x=-250;x<=250;x+=2)lines.push({x:actor.x+x,z:actor.z,source:ctx.elevationWorldYAtWorldXZ(actor.x+x,actor.z),rendered:ctx.terrainMeshHeightAt(actor.x+x,actor.z),accepted:ctx.sampleAcceptedGroundAtWorldXZ?.(actor.x+x,actor.z)});
 return {actor,location:ctx.LOC,ground:ctx.worldLoadRuntimeState,lines,meshes:meshes.map(m=>({position:m.position,tile:m.userData.terrainTile,provenance:m.userData.renderProvenance,vertices:Array.from(m.geometry.attributes.position.array),base:Array.from(m.userData.baseTerrainWorldY||[])}))};
}),null,2));`);
if(process.env.WE3D_TERRAIN_SEAMS==='1') source=source.replace('await page.screenshot({path:shotPath, type:"png"});', `await page.screenshot({path:shotPath, type:"png"});
fs.writeFileSync(path.join(args.screenshotDir,'seams.json'),JSON.stringify(await page.evaluate(async()=>{
 const {ctx}=await import('/app/js/shared-context.js?v=55');const samples=[];
 for(const mesh of ctx.terrainGroup.children) {
  if(mesh.userData?.isTerrainMesh!==true || mesh.userData?.isFarTerrainClipmap || !mesh.userData?.terrainTile || mesh.userData?.pendingTerrainTile)continue;
  const p=mesh.geometry?.attributes?.position,n=Math.round(Math.sqrt(p?.count||0));
  if(!p || n*n!==p.count)continue;
  for(let i=0;i<n;i++)for(const [index,dx,dz] of [[i,-0,-.02],[(n-1)*n+i,0,.02],[i*n,-.02,0],[i*n+n-1,.02,0]]) {
   const x=p.getX(index)+mesh.position.x,z=p.getZ(index)+mesh.position.z,y=p.getY(index)+mesh.position.y;
   const far=ctx.sampleFarTerrainWorldYAt(x+dx,z+dz,{ignorePortalCuts:true});
   if(Number.isFinite(far))samples.push({x,z,y,far,delta:far-y,tile:mesh.userData.terrainTile});
  }
 }
 samples.sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
 const {pointInWaterBody}=await import('/app/js/world/water-surface-registry.js?v=3');
 return {count:samples.length,worst:samples.slice(0,12).map(sample=>({...sample,
  sourceHeight:ctx.elevationWorldYAtWorldXZ(sample.x,sample.z),
  water:(ctx.waterAreas||[]).filter(area=>pointInWaterBody(area,sample.x,sample.z)).map(area=>({surfaceY:area.surfaceY,kind:area.kind,provenance:area.provenance}))
 }))};
}),null,2));`);
if(process.env.WE3D_TREE_CLOSEUP==='1') source=source.replace('await page.screenshot({path:shotPath, type:"png"});', `await page.screenshot({path:shotPath, type:"png"});
const treeImage=await page.evaluate(async()=>{
 const {ctx}=await import('/app/js/shared-context.js?v=55');
 const tree=[...(ctx.vegetationFeatures||[])].filter(p=>p.trunkRadius>0).sort((a,b)=>Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z))[0];
 if(!tree)return null;
 const camera=ctx.camera.clone();camera.position.set(tree.x+10,tree.baseY+5,tree.z+12);camera.lookAt(tree.x,tree.baseY+4,tree.z);camera.updateMatrixWorld(true);
 ctx.renderer.render(ctx.scene,camera);const image=ctx.renderer.domElement.toDataURL('image/png');ctx.renderer.render(ctx.scene,ctx.camera);return image;
});
if(treeImage)fs.writeFileSync(path.join(args.screenshotDir,'tree-closeup.png'),Buffer.from(treeImage.split(',')[1],'base64'));
`);
source=source.replace('null, {timeout:90000});', `null, {timeout:90000}).catch(async error=>{
 fs.writeFileSync(path.join(args.screenshotDir,'failed-start.json'),JSON.stringify(await page.evaluate(()=>({state:window.getWorldExplorerRuntimeDiagnostics?.(),loading:document.getElementById('loading')?.innerText})),null,2));
 await page.screenshot({path:path.join(args.screenshotDir,'failed-start.png')});throw error;
});`);
const child=spawn(process.execPath,['--input-type=module','-',...process.argv.slice(2)],{stdio:['pipe','inherit','inherit']});
const deadline=setTimeout(()=>child.kill('SIGTERM'),150000);
child.stdin.end(source);
child.on('exit',code=>{clearTimeout(deadline);process.exitCode=code ?? 1;});
