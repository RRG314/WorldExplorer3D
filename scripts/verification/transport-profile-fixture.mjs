// Capture public mapped transport and accepted terrain samples for deterministic
// compiler R&D. This is diagnostic evidence, never a visual or release pass.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
import {closeOwnedBrowser} from './owned-browser.mjs';
const city=process.argv[2]||'baltimore';
const sites={baltimore:{lat:39.3091,lon:-76.6205},monaco:{lat:43.7384,lon:7.4246}};
assert.ok(sites[city]);
const out=process.env.WE3D_VERIFY_OUTPUT_DIR||`output/verification/transport-profile-${city}-1007`;
await mkdir(out,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4525]});
let owned;
const report={city,errors:[],scope:'Public geographic/compiler fixture; not gameplay acceptance'};
try{
 owned=await chromium.launchServer({channel:'chrome',headless:false});
 const browser=await chromium.connect(owned.wsEndpoint());
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 await configureStagingAppCheck(page,`http://127.0.0.1:${server.port}`);
 await page.route(/https:\/\/[^/]*overpass[^/]*\/.*interpreter/i,r=>r.abort());
 await page.route('**/listApprovedExteriorRepresentations',r=>r.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:'{"representations":[]}'}));
 page.on('pageerror',e=>report.errors.push(e.message));
 const params=new URLSearchParams({...sites[city],loc:'custom',lname:city,launch:'earth',gm:'free',mode:'walking'});
 await page.goto(`http://127.0.0.1:${server.port}/app/?${params}`);
 await page.waitForFunction(()=>window.__WE3D_RUNTIME_READY__,null,{timeout:60000});
 await page.evaluate(async()=>{window.fixtureCtx=(await import('/app/js/shared-context.js?v=55')).ctx});
 if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
 await page.getByRole('button',{name:'Explore',exact:true}).click();
 await page.waitForFunction(()=>!fixtureCtx.worldLoading&&fixtureCtx.worldLoadRuntimeState?.status==='ready'&&fixtureCtx.roads.length>0,null,{timeout:240000});
 console.log('World ready; capturing structural corridors');
 const data=await page.evaluate(async()=>{
  const ctx=window.fixtureCtx;
  ctx.setPauseReason?.('manual_pause',true);
  const {compileTransportSurfaceModel}=await import('/app/js/world/compiler/transport-surface-model.js?v=25');
  const {worldBaseTerrainY}=await import('/app/js/world/structure-aware.js');
  const transport=[...ctx.roads,...ctx.linearFeatures.filter(r=>r.transportGraphRef)];
  const byId=new Map(transport.map(r=>[r.transportGraphRef?.featureId,r]));
  const selected=new Set(transport.filter(r=>r.structureSemantics?.terrainMode!=='at_grade').map(r=>r.transportGraphRef?.featureId));
  for(let hop=0;hop<2;hop++){
   const next=new Set(selected);
   for(const c of ctx.transportNetworkModel.connections)if(selected.has(c.left.featureId)||selected.has(c.right.featureId)){next.add(c.left.featureId);next.add(c.right.featureId)}
   for(const id of next)selected.add(id);
  }
  const fields=['id','sourceFeatureId','name','pts','width','type','surfaceBias','structureSemantics','structureStations','structureTransitionAnchors','structureStackOffset','minimumStructureSurfaceY','ordinaryStreetAnchors','transportRecord','subdivideMaxDist','fixedRegionalContext','transportGraphRef','tunnelObstructionLimits'];
  const features=[];
  for(const id of selected){
   const r=byId.get(id);if(!r?.transportSurfaceModel)continue;
   const input=Object.fromEntries(fields.map(k=>[k,r[k]]));
   const step=r.fixedRegionalContext?(r.transportRecord?.completeness==='lossless'?Math.min(4,Math.max(2,r.subdivideMaxDist||4)):Math.min(8,Math.max(4,r.subdivideMaxDist||5))):Math.min(2,Math.max(.5,r.subdivideMaxDist||2));
   const samples=new Map();
   const replay=compileTransportSurfaceModel(input,(x,z)=>{const y=worldBaseTerrainY(x,z);samples.set(`${x}:${z}`,{x,z,y});return y},{sampleStep:step});
   features.push({input,model:r.transportSurfaceModel,samples:[...samples.values()],sampleStep:step,replayed:replay.centerHeights});
  }
  const connections=ctx.transportNetworkModel.connections.filter(c=>selected.has(c.left.featureId)&&selected.has(c.right.featureId));
  const junctionTerrain=new Map();
  for(const connection of connections)for(const side of [connection.left,connection.right]){
   const {x,z}=side.point;const key=`${x}:${z}`;
   if(!junctionTerrain.has(key))junctionTerrain.set(key,{x,z,y:worldBaseTerrainY(x,z)});
  }
  return JSON.stringify({origin:{lat:ctx.LOC.lat,lon:ctx.LOC.lon},features,junctionTerrain:[...junctionTerrain.values()],network:{connections},continuity:ctx.transportJunctionProfile.continuity},(_key,v)=>ArrayBuffer.isView(v)?[...v]:v);
 });
 const value=JSON.parse(data);
 await writeFile(`${out}/fixture.json.gz`,gzipSync(data));
 report.featureCount=value.features.length;report.connectionCount=value.network.connections.length;
 report.discontinuityCount=value.continuity.discontinuityCount;report.captured=true;
 assert.deepEqual(report.errors,[]);
}catch(e){report.failure=String(e.stack||e);process.exitCode=1;}
finally{if(owned)await closeOwnedBrowser(owned);await server.close();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));
