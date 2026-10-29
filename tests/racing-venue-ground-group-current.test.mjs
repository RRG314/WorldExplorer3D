import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {selectGroundArtifacts} from '../app/js/terrain/ground-provider-registry.js';
import {createAcceptedGroundRuntime} from '../app/js/terrain/accepted-ground-runtime.js';
import {loadGroundArtifact,sha256Text} from '../app/js/terrain/ground-artifact.js';
import {compileDistrictGroundModel} from '../app/js/world/compiler/district-ground-model.js';
import {RACING_VENUE_SOURCES,createRacingVenueGroundPlan,prepareVenueSourceMerge,racingVenueGroundRequirements} from '../app/js/racing/venue-source-packs.js';
import {activateAcceptedGroundForWorldLoad} from '../app/js/world/accepted-ground-activation.js';
const location={latitude:.0003,longitude:.0003};
const manifest=(id,west=0,east=.0008983152841195215)=>({schemaVersion:1,artifactId:id,providerId:'usgs-3dep-best-available',sourceRelease:'controlled-source-v1',
 contentSha256:(id==='west'?'a':'b').repeat(64),spacingMeters:100,coverage:{south:0,north:.000898315284082718,west,east},verticalDatum:'EGM2008',complete:true,missingSampleCount:0,url:'memory://'+id});
const west=manifest('west'),east=manifest('east',west.coverage.east,west.coverage.east*2),required=rows=>rows.map(({artifactId,contentSha256})=>({artifactId,contentSha256}));
function tile(manifest){
 const start=manifest.artifactId==='east'?1:0,samples=[];
 for(let row=0;row<2;row++)for(let column=start;column<=start+1;column++)samples.push({row,column,available:true,rawElevationMeters:20+column+row,groundElevationMeters:20+column+row,confidence:1,provenance:'controlled-tile'});
 const model=compileDistrictGroundModel({districtId:manifest.artifactId,sourceClassification:'accepted-ground',verticalDatum:'EGM2008',grid:{spacingMeters:100,minColumn:start,maxColumn:start+1,minRow:0,maxRow:1},samples});
 assert.equal(model.status,'accepted');return {...manifest,status:'accepted',model};
}
test('a pinned finite group loads adjoining tiles outside the anchor; ordinary location selection remains local',async()=>{
 const manifests=[east,west],defaultSelection=selectGroundArtifacts({...location,manifests});
 assert.deepEqual(defaultSelection.manifests.map(m=>m.artifactId),['west']);
 const reads=[],runtime=createAcceptedGroundRuntime({loadArtifact:async({manifest})=>{reads.push(manifest.artifactId);return tile(manifest);}});
 const state=await runtime.prepare({...location,manifests,requiredArtifacts:required(manifests),coverageProbes:[location,{latitude:.0003,longitude:.0013}]});
 assert.equal(state.status,'accepted');assert.deepEqual(reads,['east','west']);assert.equal(runtime.sampleAtLatLon(.0003,.0013).artifactId,'east');
 const left=runtime.elevationAtLatLon(.0003,west.coverage.east-1e-9),right=runtime.elevationAtLatLon(.0003,west.coverage.east+1e-9);
 assert.ok(Math.abs(left-right)<.00001,'both tiles share the same geographic grid and seam heights');
 assert.ok(Number.isNaN(runtime.elevationAtLatLon(.0003,.01)),'a group must not expand or fill uncovered geography');
});
test('missing, changed, ambiguous, oversized and mixed-authority groups reject before an artifact fetch',async()=>{
 const cases=[
  {manifests:[west],requiredArtifacts:required([west,east])},
  {manifests:[west,{...east,contentSha256:'c'.repeat(64)}],requiredArtifacts:required([west,east])},
  {manifests:[west,east,east],requiredArtifacts:required([west,east])},
  {manifests:[west,east],requiredArtifacts:Array.from({length:33},(_,i)=>({artifactId:String(i),contentSha256:'a'.repeat(64)}))},
  {manifests:[west,east],requiredArtifacts:required([west,west])},
  {manifests:[west,{...east,providerId:'ea-lidar-composite-dtm-2022'}],requiredArtifacts:required([west,east])},
  {manifests:[west,{...east,sourceRelease:'other-release'}],requiredArtifacts:required([west,east])},
  {manifests:[east],requiredArtifacts:required([east])}
 ];
 for(const item of cases){let fetched=0;const runtime=createAcceptedGroundRuntime({loadArtifact:async()=>{fetched++;throw Error('unexpected fetch');}});
  assert.equal((await runtime.prepare({...location,...item})).status,'blocked');assert.equal(fetched,0);
 }
});
test('a gap in any required route probe or a failed tile rejects the entire prepared stack',async()=>{
 const options={...location,manifests:[west,east],requiredArtifacts:required([west,east])};
 const runtime=createAcceptedGroundRuntime({loadArtifact:async({manifest})=>tile(manifest)});
 assert.equal((await runtime.prepare({...options,coverageProbes:[location,{latitude:.0003,longitude:.01}]})).reason,'incomplete-runtime-coverage');
 assert.equal(runtime.sampleAtLatLon(location.latitude,location.longitude).status,'unavailable');
 const failure=createAcceptedGroundRuntime({loadArtifact:async({manifest})=>manifest.artifactId==='west'?{status:'rejected',reason:'damaged-tile'}:tile(manifest)});
 assert.equal((await failure.prepare(options)).reason,'damaged-tile');assert.ok(Number.isNaN(failure.elevationAtLatLon(.0003,.0013)));
});
test('late successful, rejected or throwing ground work cannot clear a replacement accepted stack',async()=>{
 for(const result of ['success','rejected','throws']){
  let settle;
  const runtime=createAcceptedGroundRuntime({loadArtifact:({manifest})=>manifest.artifactId==='west'?new Promise((resolve,reject)=>settle=()=>result==='throws'?reject(Error('late failure')):resolve(result==='success'?tile(west):{status:'rejected',reason:'late missing tile'})):Promise.resolve(tile(east))});
  const old=runtime.prepare({...location,manifests:[west]});
  const replacement=await runtime.prepare({latitude:.0003,longitude:.0013,manifests:[east]});
  settle();assert.equal((await old).status,'superseded');assert.deepEqual(runtime.snapshot(),replacement);
  assert.equal(runtime.sampleAtLatLon(.0003,.0013).artifactId,'east');
 }
});
test('cancellation retires the current preparation and an already-aborted request leaves a valid world untouched',async()=>{
 let finish;
 const runtime=createAcceptedGroundRuntime({loadArtifact:({manifest})=>manifest.artifactId==='west'?new Promise(resolve=>finish=()=>resolve(tile(west))):Promise.resolve(tile(east))});
 const controller=new AbortController(),pending=runtime.prepare({...location,manifests:[west],signal:controller.signal});controller.abort();finish();
 await assert.rejects(pending,{name:'AbortError'});assert.equal(runtime.snapshot().reason,'ground-request-aborted');
 const accepted=await runtime.prepare({latitude:.0003,longitude:.0013,manifests:[east]});
 await assert.rejects(runtime.prepare({...location,manifests:[west],signal:controller.signal}),{name:'AbortError'});assert.deepEqual(runtime.snapshot(),accepted);
});
test('actual Silverstone source plans full-route ground probes and activates the hash-verified EA artifact through the world owner',async()=>{
 const descriptor=RACING_VENUE_SOURCES[0],source=JSON.parse(fs.readFileSync(new URL('../app/assets/racing/silverstone/source.json',import.meta.url)));
 const plan=createRacingVenueGroundPlan(descriptor,source),catalog=JSON.parse(fs.readFileSync(new URL('../app/assets/ground/manifest-catalog.json',import.meta.url))),manifest=catalog.manifests.find(m=>m.artifactId===descriptor.groundArtifactId);
 assert.ok(plan.coverageProbes.length>9000);assert.deepEqual(plan.requiredArtifacts,required([manifest]));
 assert.throws(()=>racingVenueGroundRequirements({...descriptor,groundArtifacts:required([east])}),/group_invalid/);
 const bytes=fs.readFileSync(new URL('../app/assets/ground/silverstone/ground-artifact.json',import.meta.url),'utf8');assert.equal(await sha256Text(bytes),manifest.contentSha256);
 let read=0,prepared,terrainPublished=0;
 const runtime=createAcceptedGroundRuntime({loadArtifact:options=>{read++;return loadGroundArtifact({...options,fetchImpl:async()=>new Response(bytes)});}});
 const runtimeState={},appCtx={terrainEnabled:true,LOC:descriptor.anchor,selLoc:'silverstone',showLoad(){},publishLocationTerrain(){terrainPublished++;},
  prepareAcceptedGroundFromCatalog:options=>{prepared=options;return runtime.prepare({...options,manifests:catalog.manifests});}};
 assert.equal(await activateAcceptedGroundForWorldLoad({appCtx,runtimeState,venueGroundPlan:plan}),true);
 assert.equal(read,1);assert.equal(terrainPublished,1);assert.equal(runtimeState.groundMode,'accepted-ground');assert.equal(prepared.coverageProbes,plan.coverageProbes);
 assert.equal(runtime.verifyCoverage(plan.coverageProbes).status,'accepted');
 assert.equal(prepareVenueSourceMerge({},source,descriptor,runtime.snapshot()).metadata.status,'source-prepared');
});
test('a reviewed venue fails before publishing fallback terrain if its required route coverage is unavailable',async()=>{
 let published=0;
 const appCtx={terrainEnabled:true,LOC:RACING_VENUE_SOURCES[0].anchor,showLoad(){},publishLocationTerrain(){published++;},prepareAcceptedGroundFromCatalog:async()=>({status:'rejected',reason:'missing-corridor-tile'})};
 await assert.rejects(activateAcceptedGroundForWorldLoad({appCtx,venueGroundPlan:{requiredArtifacts:required([west]),coverageProbes:[location]}}),/reviewed_venue_ground_unavailable/);
 assert.equal(published,0);
});
