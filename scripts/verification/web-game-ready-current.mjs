// Use the prescribed action/screenshot client, adding this app's explicit
// readiness contract. Its generic 500ms menu delay is insufficient here.
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const client=process.env.WE3D_GAME_CLIENT || '/Users/stevenreid/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js';
let source=await readFile(client,'utf8');
const patches=[
 ['await page.waitForTimeout(500);', `await page.waitForFunction(() => window.__WE3D_RUNTIME_READY__, null, {timeout:45000});`],
 ['await page.click(args.clickSelector, { timeout: 5000 });', 'await page.click(args.clickSelector, { timeout: 15000 });'],
 ['await page.waitForTimeout(250);', `await page.waitForFunction(() => { const s=window.getWorldExplorerRuntimeDiagnostics?.(); return s?.gameStarted && !s.worldLoading && !document.getElementById('loading')?.classList.contains('show'); }, null, {timeout:90000});`]
];
for(const [before,after] of patches){
 if(!source.includes(before)) throw new Error('Prescribed client changed; review readiness adapter before running.');
 source=source.replace(before,after);
}
// A failed start is a failed test, not a successful menu screenshot.
source=source.replace('console.warn("Failed to click selector", args.clickSelector, err);','throw err;');
// WebGL's default non-preserved drawing buffer may be cleared before toDataURL.
// Capture the composited page instead, including the real player-facing HUD.
source=source.replace('await captureScreenshot(page, canvas, shotPath);', 'await page.screenshot({path:shotPath, type:"png"});\nfs.writeFileSync(path.join(args.screenshotDir,"runtime.json"),JSON.stringify(await page.evaluate(()=>window.getWorldExplorerRuntimeDiagnostics?.()),null,2));');
if(process.env.WE3D_TEST_DAY==='1') source=source.replace('await doChoreography(page, canvas, steps);', `await page.evaluate(async()=>{const {ctx}=await import('/app/js/shared-context.js?v=55');ctx.setTimeOfDay?.('day');});\nawait doChoreography(page, canvas, steps);`);
if(process.env.WE3D_TEST_MOBILE==='1') source=source.replace('const page = await browser.newPage();','const page = await browser.newPage({viewport:{width:412,height:915},isMobile:true,hasTouch:true,deviceScaleFactor:1});');
if(process.env.WE3D_REAL_GPU==='1') source=source.replace('args: ["--use-gl=angle", "--use-angle=swiftshader"],','channel:"chrome",');
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
