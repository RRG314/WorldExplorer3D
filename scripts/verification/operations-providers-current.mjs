import assert from 'node:assert/strict';import {mkdir,writeFile,readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {chromium} from 'playwright';import {startStaticServer} from './static-server.mjs';
import {configureStagingAppCheck} from './staging-app-check.mjs';
const out='output/verification/product-plan/operations-providers';await mkdir(out,{recursive:true});const report={checkedAt:new Date().toISOString(),scope:'Source-provider integration and marine-asset hash/budget check; packaged world compilation is covered by assembled-worlds, not this source harness; authenticated staging gateway and live provider check, not ordinary production attestation or worldwide availability evidence',providers:[],assets:[]};

const manifest=JSON.parse(await readFile('app/assets/models/marine/asset-manifest.json','utf8'));
for(const asset of manifest.assets){assert.equal(asset.license,'CC0-1.0');assert.ok(asset.author&&asset.source&&manifest.rightsEvidence.length);for(const [lod,suffix] of [['near',''],['far','-lod']]){const bytes=await readFile(`app/assets/models/marine/${asset.id}${suffix}.glb`);assert.equal(createHash('sha256').update(bytes).digest('hex'),asset[lod].sha256);assert.equal(bytes.length,asset[lod].bytes);assert.ok(asset[lod].triangles<10000);report.assets.push({id:asset.id,lod,bytes:bytes.length,triangles:asset[lod].triangles,license:asset.license});}}
const server=await startStaticServer({rootDir:process.cwd(),ports:[4398]}),browser=await chromium.launch({channel:'chrome',headless:true});
try{const page=await browser.newPage();await configureStagingAppCheck(page,`http://127.0.0.1:${server.port}`);await page.goto(`http://127.0.0.1:${server.port}/app/`);
report.providers=await page.evaluate(async()=>{
 const {operationalFeedService}=await import('/app/js/geospatial/operational-feeds.js');
 const {marineService}=await import('/app/js/geospatial/marine.js');
 const {aircraftService}=await import('/app/js/geospatial/aircraft.js');
 const results=[];
 for(const [id,read] of [['weather',()=>operationalFeedService.weather([{lat:39.29,lon:-76.61}])],['marine',()=>marineService.modelAt({lat:-18.5,lon:147.5})],['aircraft',()=>aircraftService.search({lat:39.29,lon:-76.61,radiusKm:160,limit:80},{force:true})],['earthquakes',()=>operationalFeedService.earthquakes()]]){
  try{const result=await read();const usable=id==='weather'?Number.isFinite(result.items?.[0]?.current?.temperature_2m):id==='marine'?Number.isFinite(result.waveHeightM)&&Number.isFinite(result.currentVelocityKph)&&Number.isFinite(result.seaSurfaceTemperatureC):id==='aircraft'?result.items?.length>0&&result.items.every(item=>item.provenance.sourceId==='adsb-lol'&&Number.isFinite(item.lat)&&Number.isFinite(item.lon))&&!result.warnings?.length:result.items?.length>0;
   results.push({id,ok:usable,items:result.items?.length??1,sources:result.sources?.map(s=>s.sourceId)||[result.sourceId]});
  }catch(error){results.push({id,ok:false,error:error.message});}
 }
 return results;
});report.overture=await page.evaluate(async()=>{
 const {fetchOvertureThemeTile,OVERTURE_RELEASE}=await import('/app/js/world/overture-tile-source.js?v=6');const {convertTilesToElements}=await import('/app/js/world/overture-building-source.js');const results=[];
 for(const [name,lat,lon] of [['Baltimore',39.29,-76.61],['London',51.5074,-.1278]]){
  const z=14,n=2**z,x=Math.floor((lon+180)/360*n),y=Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n);
  for(const theme of ['buildings','base','transportation']){const result=await fetchOvertureThemeTile(theme,z,x,y);const converted=theme==='buildings'?convertTilesToElements([result],{minLat:lat-.003,maxLat:lat+.003,minLon:lon-.003,maxLon:lon+.003},{coverageComplete:true}):null;results.push({name,theme,convertedWays:converted?.elements.filter(v=>v.type==='way').length,release:result.release,layers:Object.fromEntries(Object.entries(result.tile.layers).map(([key,value])=>[key,value.length]))});}
 }
 return {release:OVERTURE_RELEASE,tiles:results};
});assert.equal(report.overture.release,'2026-09-23.1');assert.ok(report.overture.tiles.every(v=>Object.values(v.layers).some(n=>n>0)));assert.ok(report.overture.tiles.filter(v=>v.theme==='buildings').every(v=>v.convertedWays>0));report.assetBytes=report.assets.reduce((n,v)=>n+v.bytes,0);report.passed=report.providers.every(v=>v.ok);await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));assert.equal(report.passed,true);}finally{await browser.close();await server.close();}

await import('./environment-data-staging-current.mjs');
await import('./aircraft-panel-client.mjs');
