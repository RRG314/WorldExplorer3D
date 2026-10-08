// Capture actual provider-loaded street sources and rendered ownership. This
// is diagnostic evidence; camera placement is not proof of player traversal.
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
import {build} from 'esbuild';
const inspection=await build({absWorkingDir:process.cwd(),bundle:true,write:false,format:'esm',stdin:{resolveDir:process.cwd(),contents:"export {streetSourceInput} from './app/js/world/street-source-input.js';"}});
const out=path.resolve(process.env.WE3D_VERIFY_OUTPUT_DIR || 'output/verification/sidewalk-layout-before');
await fs.mkdir(out,{recursive:true});
const server=await startStaticServer({rootDir:path.resolve(process.env.WE3D_VERIFY_ROOT||'.'),ports:[4563]});
const owned=await chromium.launchServer({channel:'chrome',headless:true});
const browser=await chromium.connect(owned.wsEndpoint());
const page=await browser.newPage({viewport:{width:1280,height:800}});
page.setDefaultTimeout(20000);
const report={scope:'Loaded source and controlled camera inspection; not continuous driving',errors:[],captures:[]};
page.on('pageerror',e=>report.errors.push(e.message));
try {
 await configureStagingAppCheck(page,`http://127.0.0.1:${server.port}`);
 await page.route('**/__verification/sidewalk-source-inspection.mjs',route=>route.fulfill({status:200,contentType:'text/javascript',body:inspection.outputFiles[0].text}));
 if(process.env.WE3D_FORCE_TRANSPORT_FALLBACK==='1')await page.route(/https:\/\/[^/]*overpass[^/]*\/.*interpreter/i,r=>r.abort());
 await page.goto(`http://127.0.0.1:${server.port}/app/?launch=earth&gm=free&loc=custom&lat=39.2867&lon=-76.6121&lname=Baltimore&mode=driving&streetDiagnostics=1`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__,null,{timeout:60000});
 await page.evaluate(async()=>{globalThis.__sidewalkCtx=(await import('/app/js/shared-context.js?v=55')).ctx;});
 await page.locator('#globeSelectorStartBtn').click();
 await page.waitForFunction(()=>{const ctx=globalThis.__sidewalkCtx;return ctx.gameStarted&&!ctx.worldLoading&&ctx.roads?.length>0&&ctx.streetPavement?.stats?.tiles>0;},null,{timeout:300000,polling:1000});
 console.log('Actual Light Street world loaded');
 const capture=await page.evaluate(async()=>{
  const {ctx}=await import('/app/js/shared-context.js?v=55');
  const {streetSourceInput}=await import('/__verification/sidewalk-source-inspection.mjs');
  ctx.setTimeOfDay('day');
  const center=ctx.geoToWorld(39.2867,-76.6121),radius=220;
  const near=item=>{const pts=item.surfaceFootprint||item.pts||item.footprint||[];return pts.some(p=>Math.abs(p.x-center.x)<radius+80&&Math.abs(p.z-center.z)<radius+80);};
  const input={...streetSourceInput(ctx,near),coverageBounds:{minX:Math.floor((center.x-256)/64)*64,maxX:Math.ceil((center.x+256)/64)*64,minZ:Math.floor((center.z-256)/64)*64,maxZ:Math.ceil((center.z+256)/64)*64}};
  const compact=f=>({id:f.id,sourceFeatureId:f.sourceFeatureId,name:f.name,kind:f.kind,type:f.type,subtype:f.subtype,width:f.width,pts:f.pts,tags:f.tags,sourceTags:f.sourceTags,record:f.transportRecord,semantics:f.structureSemantics});
  globalThis.__sidewalkCtx=ctx;
  const y=ctx.car.y-1.2;
  Object.assign(ctx.car,{x:center.x,z:center.z,y:y+1.2,angle:(180-249)*Math.PI/180,speed:0,vFwd:0,vLat:0,vy:0});
  ctx.invalidateRoadCache?.();ctx.camMode=0;
  document.querySelector('#streetSurfaceDiagnostics')?.remove();
  return JSON.parse(JSON.stringify({input,center,roads:ctx.roads.filter(near).map(compact),linearFeatures:ctx.linearFeatures.filter(near).map(compact),landuses:ctx.landuses.filter(near).map(compact),publication:ctx.streetPavement?.stats,provider:ctx.worldLoadRuntimeState?.transportProviderDecision},(_key,value)=>ArrayBuffer.isView(value)?Array.from(value):value));
 });
 await fs.writeFile(path.join(out,'source.json'),JSON.stringify(capture));
 if(!capture.input.roads.length||!capture.input.buildings.length||!capture.publication)throw Error('No completed street publication captured');
 await page.waitForTimeout(6500);
 await page.screenshot({path:path.join(out,'street.png')});
 for(const layer of ['all','pavement','roads','paths','landuse']) {
  const image=await page.evaluate(layer=>{
   const ctx=globalThis.__sidewalkCtx,hidden=[];
   const hide=objects=>{for(const m of objects||[]){if(m.visible){hidden.push(m);m.visible=false;}}};
   if(layer!=='all'){
    hide(ctx.buildingMeshes);hide(ctx.vegetationMeshes);
    if(layer!=='roads')hide(ctx.roadMeshes);
    if(layer!=='paths')hide(ctx.linearFeatureMeshes);
    if(layer!=='landuse')hide(ctx.landuseMeshes);
    if(layer!=='pavement'){hide(ctx.streetPavement?.meshes);ctx.scene.traverse(o=>{if(/pavement|streetoverview/i.test(o.name)&&o.visible){hidden.push(o);o.visible=false;}});}
   }
   const camera=new THREE.PerspectiveCamera(52,1280/800,.1,3000);
   const center=ctx.geoToWorld(39.2867,-76.6121);
   camera.position.set(center.x,480,center.z+210);camera.lookAt(center.x,0,center.z);
   ctx.renderer.render(ctx.scene,camera);
   const result=ctx.renderer.domElement.toDataURL('image/png');
   for(const m of hidden)m.visible=true;
   return result;
  },layer);
  await fs.writeFile(path.join(out,`${layer}.png`),Buffer.from(image.split(',')[1],'base64'));
  report.captures.push(`${layer}.png`);
 }
 report.publication=capture.publication;report.provider=capture.provider;
 report.counts=Object.fromEntries(['roads','buildings','landuses','linearFeatures'].map(k=>[k,capture.input[k].length]));
 report.complete=true;
} catch(error) {report.failure=String(error.stack||error);process.exitCode=1;}
finally {await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await closeOwnedBrowser(owned);await server.close();}
console.log(JSON.stringify(report));
