import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {stageSourceFixture,stagePathFixture} from './fixtures/racing-stage-source.mjs';
import {osmVenueIntake} from '../scripts/lib/osm-venue-intake.mjs';
import {compileMappedVenueLayout} from '../app/js/racing/venue-layout.js';
import {normalizeRaceVenueSource} from '../app/js/racing/venue-course-policy.js';
import {buildRaceRoadGraph,createRaceCourse} from '../app/js/racing/course-rules.js';
import {prepareVenueRacePath,buildVenueRaceCourses} from '../app/js/racing/venue-courses.js';
import {canonicalRaceDistrict} from '../app/js/racing/district-facts.js';
import {prepareRaceDistrictStorage,readRaceDistrictFacts} from '../app/js/racing/district-storage.js';
import {raceDistrictFingerprint} from '../app/js/racing/course-library.js';
import {prepareVenueSourceMerge} from '../app/js/racing/venue-source-packs.js';
const hash=value=>createHash('sha256').update(value).digest('hex');

test('stage source retains exact trimmed endpoints, reverse road direction and original motor restrictions',()=>{
 const source=stageSourceFixture(),before=JSON.stringify(source),layout=compileMappedVenueLayout(source);
 assert.equal(JSON.stringify(source),before);
 assert.deepEqual(layout.points.map(p=>p.nodeId),[2,3,4,5,6,7]);
 assert.deepEqual(layout.stage.legs,[{sourceFeatureId:'osm:way:101',startSegment:1,endSegment:3,direction:'forward'},
  {sourceFeatureId:'osm:way:102',startSegment:0,endSegment:2,direction:'reverse'},
  {sourceFeatureId:'osm:way:103',startSegment:0,endSegment:1,direction:'forward'}]);
 assert.equal(layout.ways.get(102).tags.highway,'track');assert.equal(layout.ways.get(102).tags.motor_vehicle,'no');
 assert.ok(layout.lengthMeters>780&&layout.lengthMeters<790);assert.ok(Object.isFrozen(layout.stage.legs[0]));
});

test('missing, ambiguous, disconnected, repeated, one-way and non-motor stage geometry fails closed',()=>{
 const changes=[s=>{s.layout.legs[0].startNodeId=999;},s=>{s.layout.legs[1].startNodeId=5;},
  s=>{s.ways[0].nodes.push(2);s.ways[0].geometry.push({...s.ways[0].geometry[1]});},
  s=>{s.ways[1].tags.oneway='yes';},s=>{s.ways[0].tags.oneway='reversible';},s=>{s.ways[0].tags.highway='footway';},
  s=>{s.layout.legs.push({wayId:103,startNodeId:7,endNodeId:6});},s=>{s.layout.usableWidthMeters=2.5;},
  s=>{s.layout.legs=[{wayId:101,startNodeId:2,endNodeId:4},{wayId:101,startNodeId:4,endNodeId:2}];},
  s=>{s.layout.referenceLengthMeters=2000;},s=>{s.schemaVersion=1;}];
 for(const change of changes){const source=stageSourceFixture();change(source);assert.throws(()=>compileMappedVenueLayout(source),/venue_/);}
});

function nativeFixture(){
 const source=stageSourceFixture(),nodes=new Map();
 for(const way of source.ways)way.nodes.forEach((id,i)=>nodes.set(id,{type:'node',id,...way.geometry[i]}));
 return {version:.6,copyright:'OpenStreetMap contributors',bounds:{minlat:44.99,minlon:4.99,maxlat:45.01,maxlon:5.02},
  elements:[...nodes.values(),...source.ways.map(w=>({type:'way',...w,user:'must be omitted',uid:123})),
   {type:'way',id:999,nodes:[1,2],tags:{highway:'raceway'}}]};
}
const intakeSource={format:'osm-api-map-json-v1',endpoint:'https://api.openstreetmap.org/api/0.6/map.json?bbox=4.99,44.99,5.02,45.01',
 observedAt:'2026-10-30T12:00:00Z',coverage:{south:44.99,west:4.99,north:45.01,east:5.02}};

test('native and Overpass stage intake select only named roads without retaining mapper accounts or changing tags',()=>{
 const native=nativeFixture(),before=JSON.stringify(native),options={stageWayIds:[101,102,103]},result=osmVenueIntake(native,intakeSource,options);
 assert.deepEqual(result.ways.map(w=>w.id),options.stageWayIds);assert.equal(JSON.stringify(native),before);
 assert.ok(result.ways.every(w=>w.uid===undefined&&w.user===undefined));assert.equal(result.ways[1].tags.motor_vehicle,'no');
 const overpass=osmVenueIntake({osm3s:{timestamp_osm_base:intakeSource.observedAt},elements:native.elements},{format:'overpass-geom-json-v1'},options);
 assert.deepEqual(overpass.ways,result.ways);
 for(const stageWayIds of [[101,101],[101,555],[],[101,-2]])assert.throws(()=>osmVenueIntake(native,intakeSource,{stageWayIds}),/venue_stage_/);
 const missing=structuredClone(native);missing.elements=missing.elements.filter(e=>e.id!==5);assert.throws(()=>osmVenueIntake(missing,intakeSource,options),/incomplete_way/);
 const foot=structuredClone(native);foot.elements.find(e=>e.id===102).tags.highway='footway';assert.throws(()=>osmVenueIntake(foot,intakeSource,options),/stage_source_incomplete/);
 assert.deepEqual(osmVenueIntake(native,intakeSource).ways.map(w=>w.id),[999],'ordinary intake still selects raceways');
});

test('the actual source recipe writes reproducible stage bytes and rejects changed input before creating an output',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'we3d-stage-source-'));
 try{
  const raw=JSON.stringify(nativeFixture()),source=stageSourceFixture(),config={schemaVersion:2,venueId:source.venueId,source:{...intakeSource,responseSha256:hash(raw)},layout:source.layout},
   configFile=path.join(dir,'config.json'),input=path.join(dir,'input.json'),output=path.join(dir,'source.json');
  fs.writeFileSync(configFile,JSON.stringify(config));fs.writeFileSync(input,raw);
  const args=['scripts/racing/build-venue-source.mjs','--config='+configFile,'--input='+input,'--output='+output];
  const result=JSON.parse(execFileSync(process.execPath,args,{encoding:'utf8'})),published=JSON.parse(fs.readFileSync(output));
  assert.equal(result.contentSha256,hash(fs.readFileSync(output)));assert.deepEqual(published.ways.map(w=>w.tags),source.ways.map(w=>w.tags));
  assert.deepEqual(compileMappedVenueLayout(published).stage,compileMappedVenueLayout(source).stage);
  const output2=path.join(dir,'source2.json');execFileSync(process.execPath,[...args.slice(0,-1),'--output='+output2]);
  assert.equal(hash(fs.readFileSync(output2)),result.contentSha256);
  fs.writeFileSync(input,raw+' ');const failed=path.join(dir,'failed.json');
  assert.throws(()=>execFileSync(process.execPath,[...args.slice(0,-1),'--output='+failed],{stdio:'pipe'}),/source_integrity/);assert.equal(fs.existsSync(failed),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('reviewed stage path is complete and directed, while ordinary narrow roads and unfinished stage sessions remain unavailable',()=>{
 const {district,venue}=stagePathFixture(),{graph,path:route}=prepareVenueRacePath(district,venue);
 assert.deepEqual(route,['osm:way:101:1:0.000000:1.000000:forward','osm:way:101:2:0.000000:1.000000:forward',
  'osm:way:102:1:0.000000:1.000000:reverse','osm:way:102:0:0.000000:1.000000:reverse','osm:way:103:0:0.000000:1.000000:forward']);
 assert.notEqual(graph.edges.find(e=>e.id===route[0]).from,graph.edges.find(e=>e.id===route.at(-1)).to);
 assert.equal(buildRaceRoadGraph(district.roads).edges.length,0);
 assert.throws(()=>buildRaceRoadGraph(district.roads,{minimumWidth:3.5}),/minimum_width/);
 assert.throws(()=>buildRaceRoadGraph(district.roads,{venueSource:district.venueSource,minimumWidth:3}),/minimum_width/);
 assert.throws(()=>createRaceCourse(graph,route,{discipline:'sprint'}),/stage_runtime_unavailable/);
 assert.throws(()=>buildVenueRaceCourses(district,venue),/stage_runtime_unavailable/);
 assert.throws(()=>prepareVenueSourceMerge({},stageSourceFixture(),{groundArtifactId:'controlled',groundContentSha256:'b'.repeat(64)},
  {status:'accepted',artifactIds:['controlled'],contentSha256s:['b'.repeat(64)]}),/stage_runtime_unavailable/);
});

test('source membership, full segment intervals, directions and stage identity cannot be bypassed by shortening a route',()=>{
 const {district,venue}=stagePathFixture(),road=district.roads[0];
 assert.throws(()=>prepareVenueRacePath({...district,roads:district.roads.slice(1)},venue),/surface_incomplete/);
 assert.throws(()=>prepareVenueRacePath({...district,roads:district.roads.map(r=>r===road?{...r,sourceId:'osm:way:101:1:0.500000:1.000000'}:r)},venue),/interval_incomplete/);
 assert.throws(()=>prepareVenueRacePath({...district,roads:[...district.roads,road]},venue),/duplicate_race_road_identity/);
 assert.throws(()=>prepareVenueRacePath({...district,roads:district.roads.map(r=>r.sourceFeatureId==='osm:way:102'?{...r,direction:'forward'}:r)},venue),/direction_unavailable/);
 assert.throws(()=>prepareVenueRacePath({...district,roads:[...district.roads,{...road,sourceId:'osm:way:101:0:0.000000:1.000000'}]},venue),/venue_extent/);
 for(const change of [{sourceSha256:'b'.repeat(64)},{mappedLengthMeters:900},{startLine:{segment:1}},{raceDiscipline:'circuit'},{venueSource:undefined}]){
  assert.throws(()=>prepareVenueRacePath(district,{...venue,...change}),/stage_identity/);
 }
 for(const change of [v=>{v.version=1;},v=>{v.stage.minimumWidthMeters=2.9;},v=>{v.stage.legs[1].endSegment=30001;},
  v=>{v.stage.legs.push({...v.stage.legs[0]});},v=>{v.pitSourceFeatureIds=['osm:way:999'];},v=>{v.stage.finishNodeId=v.stage.startNodeId;}]){
  const header=structuredClone(district.venueSource);change(header);assert.throws(()=>normalizeRaceVenueSource(header),/venue_extent/);
 }
});

test('stage identity and directed path survive canonical storage and both generated engine consumers',async()=>{
 const {district,venue}=stagePathFixture(),browser=prepareVenueRacePath(district,venue),facts=canonicalRaceDistrict(district),storage=await prepareRaceDistrictStorage(facts),
  restored=await readRaceDistrictFacts(storage.fields,async index=>storage.chunks.find(c=>c.index===index).record);
 const service=await import('../services/racing/generated/engine.mjs'),functions=createRequire(import.meta.url)('../functions/generated/racing-engine.cjs');
 const fingerprint=await raceDistrictFingerprint(facts);
 for(const engine of [service,functions]){
  assert.deepEqual(engine.prepareVenueRacePath(restored,venue).path,browser.path);
  assert.equal(await engine.raceDistrictFingerprint(restored),fingerprint);
  assert.throws(()=>engine.createRaceCourse(engine.buildRaceRoadGraph(facts.roads,{metersPerUnit:facts.metersPerUnit,venueSource:facts.venueSource}),browser.path),/stage_runtime_unavailable/);
 }
 const changed=structuredClone(facts);changed.venueSource.stage.minimumWidthMeters=3.4;
 assert.notEqual(await raceDistrictFingerprint(changed),fingerprint);
});

test('the three existing closed layout projections retain their accepted baseline bytes',()=>{
 const expected={silverstone:'447a982ba9412d056f8d80d845b68311f95ddfd88824d83db196dc6f5d4aefe7',
  nordschleife:'537ada842076d010683a90fe882fb49de4b03595be2f822e7df2a9ece0bebfcc',daytona:'f63c7a04f652d6dc0768ed26c70255e84db854f73830281192f346f055b90b6c'};
 for(const [name,digest]of Object.entries(expected)){
  const source=JSON.parse(fs.readFileSync(new URL(`../app/assets/racing/${name}/source.json`,import.meta.url))),l=compileMappedVenueLayout(source);
  assert.equal(hash(JSON.stringify({points:l.points,lengthMeters:l.lengthMeters,referenceLengthMeters:l.referenceLengthMeters,lengthDifferenceMeters:l.lengthDifferenceMeters,wayIds:l.wayIds})),digest);
 }
});
