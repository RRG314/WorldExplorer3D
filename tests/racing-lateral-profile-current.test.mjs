import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRaceRoadGraph,createRaceCourse,sampleRaceSegmentY} from '../app/js/racing/course-rules.js';
import {canonicalRaceDistrict} from '../app/js/racing/district-facts.js';
import {raceDistrictFingerprint,raceCourseKey} from '../app/js/racing/course-library.js';
import {prepareRaceDistrictStorage,readRaceDistrictFacts} from '../app/js/racing/district-storage.js';
import {BANKED_ROAD_MODEL} from '../app/js/physics/road-plane-dynamics.js';
const offsets=[-4,-3.3,0,3.3,3.7,4];
const height=(y,offset)=>y+offset*.03+(offset<=3.3?0:Math.min(.06,(offset-3.3)*.15));
const sample=(t,y)=>({t,y,leftY:y-1.2*.03,rightY:y+1.2*.03,lateralSamples:offsets.map(offsetMeters=>({offsetMeters,y:height(y,offsetMeters)}))});
const road=()=>({sourceId:'controlled-kerb',sourceFeatureId:'controlled-kerb',a:{x:0,y:0,z:0,connectionLayer:'start'},b:{x:0,y:4,z:250,connectionLayer:'end'},widthMeters:8,
 structure:'surface',direction:'both',driveable:true,supported:true,surfaceModel:BANKED_ROAD_MODEL,heightSampleSpanMeters:1.2,heightSamples:[sample(0,0),sample(1,4)]});
const district=r=>({type:'RaceDistrictFacts',version:1,locationId:'controlled',locationLabel:'Controlled profile',anchor:{lat:43,lon:7},metersPerUnit:1,roads:[r]});
const course=(graph,path)=>createRaceCourse(graph,path,{locationId:'controlled',anchor:{lat:43,lon:7},discipline:'sprint'});

test('one bounded lateral road profile supports the bank and raised edge in both route directions',()=>{
 const raw=road(),graph=buildRaceRoadGraph([raw]),forward=course(graph,['controlled-kerb:forward']),reverse=course(graph,['controlled-kerb:reverse']);
 assert.ok(Math.abs(sampleRaceSegmentY(forward.segments[0],.5,3.5)-height(2,3.5))<1e-10,'the wheel reaches the rising kerb instead of extrapolating the central bank');
 assert.ok(Math.abs(sampleRaceSegmentY(reverse.segments[0],.5,-3.5)-height(2,3.5))<1e-10);
 assert.ok(Math.abs(sampleRaceSegmentY(forward.segments[0],.5,-3.5)-height(2,-3.5))<1e-10);
 assert.ok(Object.isFrozen(forward.segments[0].heightSamples[0].lateralSamples));
 assert.ok(Object.isFrozen(forward.segments[0].heightSamples[0].lateralSamples[0]));
 raw.heightSamples[0].lateralSamples[0].y=999;
 assert.ok(Math.abs(sampleRaceSegmentY(forward.segments[0],0,-4)-height(0,-4))<1e-10,'source mutation cannot change the immutable course');
});
test('canonical, stored and approved identities retain the edge profile',async()=>{
 const raw=district(road()),facts=canonicalRaceDistrict(raw);
 assert.equal(facts.roads[0].heightSamples[0].lateralSamples.length,offsets.length);
 for(const [i,p] of facts.roads[0].heightSamples[0].lateralSamples.entries())assert.ok(Math.abs(p.y-raw.roads[0].heightSamples[0].lateralSamples[i].y)<=.00051);
 const stored=await prepareRaceDistrictStorage(facts),read=await readRaceDistrictFacts(stored.fields,async i=>stored.chunks[i].record);
 assert.deepEqual(read,facts);
 const changed=structuredClone(raw);for(const s of changed.roads[0].heightSamples)s.lateralSamples.at(-1).y+=.01;
 assert.notEqual(await raceDistrictFingerprint(raw),await raceDistrictFingerprint(changed));
 const a=course(buildRaceRoadGraph(facts.roads),['controlled-kerb:forward']),b=course(buildRaceRoadGraph(canonicalRaceDistrict(changed).roads),['controlled-kerb:forward']);
 assert.notEqual(await raceCourseKey(a),await raceCourseKey(b));
});
test('missing stations, foreign model, discontinuous knots and unsafe lateral or longitudinal slopes fail closed',()=>{
 const changes=[r=>delete r.heightSamples[1].lateralSamples,r=>delete r.surfaceModel,r=>r.heightSamples[0].lateralSamples.reverse(),
  r=>r.heightSamples[0].lateralSamples.push({offsetMeters:5,y:.1}),r=>r.heightSamples[0].lateralSamples[2].y+=1,
  r=>r.heightSamples[1].lateralSamples.splice(1,1),r=>r.heightSamples[0].lateralSamples[1].offsetMeters=-4,r=>r.heightSamples[0].lateralSamples[4].y+=1,
  r=>r.heightSamples[1].lateralSamples[4].y+=100,r=>r.heightSamples[0].lateralSamples[4].y=NaN,
  r=>{const middle=sample(.001,0);middle.lateralSamples.at(-1).y+=.06;r.heightSamples.splice(1,0,middle);},
  r=>{const make=(t,y)=>({t,y,leftY:y-.036,rightY:y+.036,lateralSamples:[-4,0,3,4].map(offsetMeters=>({offsetMeters,y:y+offsetMeters*.03}))});r.heightSamples=[make(0,0),make(.001,0),make(1,4)];r.heightSamples[1].lateralSamples[2].offsetMeters=1;r.heightSamples[1].rightY=.092;}];
 for(const change of changes){const r=road();change(r);assert.throws(()=>buildRaceRoadGraph([r]),/invalid_race_road_heights/);}
});


test('the existing timing split retains a crest and its raised edge without sharing mutable profile points',()=>{
 const points=[{x:0,y:0,z:0},{x:0,y:0,z:250},{x:250,y:0,z:250},{x:250,y:0,z:0}],roads=points.map((a,i)=>({...road(),sourceId:'edge-'+i,a:{...a,connectionLayer:'node:'+i},b:{...points[(i+1)%4],connectionLayer:'node:'+((i+1)%4)},direction:'forward',heightSamples:i===0?[sample(0,0),sample(.5,1),sample(1,0)]:[sample(0,0),sample(1,0)]})),graph=buildRaceRoadGraph(roads),path=roads.map(r=>r.sourceId+':forward'),
  original=createRaceCourse(graph,path,{locationId:'controlled',anchor:{lat:43,lon:7},discipline:'circuit'}),split=createRaceCourse(graph,path,{locationId:'controlled',anchor:{lat:43,lon:7},discipline:'circuit',startOffsetMeters:40});
 for(const offset of offsets)assert.ok(Math.abs(sampleRaceSegmentY(split.segments[0],0,offset)-sampleRaceSegmentY({a:roads[0].a,b:roads[0].b,heightSamples:roads[0].heightSamples,heightSampleSpanMeters:1.2},.16,offset))<1e-10);
 assert.notEqual(split.segments[0].heightSamples[0].lateralSamples,original.segments[0].heightSamples[0].lateralSamples);
});

test('the existing four-wheel controller settles onto the raised edge through its normal course query',async()=>{
 const {createRaceVehicleProfile,createRaceVehicleState,stepRaceVehicle}=await import('../app/js/racing/vehicle-controller.js'),profile=createRaceVehicleProfile('bmw_e34'),raw=road(),run=source=>{
  const c=course(buildRaceRoadGraph([source]),['controlled-kerb:forward']),pose={x:2.6,y:sampleRaceSegmentY(c.segments[0],.5,2.6),z:125,yaw:0},car=createRaceVehicleState(pose,profile);
  for(let i=0;i<60;i++)stepRaceVehicle(c,car,{throttle:0,steer:0,serviceBrake:1,handbrake:1},1/60,profile);
  return car;
 };
 const edge=run(raw),plain=structuredClone(raw);for(const station of plain.heightSamples)delete station.lateralSamples;
 const baseline=run(plain);
 assert.ok(Math.abs(edge.terrainRoll-baseline.terrainRoll)>.004,'wheel contact responds to the raised band');
 assert.ok(edge.maximumWheelPenetration<.03&&edge.maximumWheelGap<.03);
 assert.equal(edge.barrierContacts,0);
});

test('both generated runtimes preserve the same approved profile and course identity',async()=>{
 const service=await import('../services/racing/generated/engine.mjs'),{createRequire}=await import('node:module'),functions=createRequire(import.meta.url)('../functions/generated/racing-engine.cjs'),facts=canonicalRaceDistrict(district(road())),browser=course(buildRaceRoadGraph(facts.roads),['controlled-kerb:forward']),key=await raceCourseKey(browser);
 for(const engine of[service,functions]){
  const stored=engine.canonicalRaceDistrict(district(road()));assert.deepEqual(stored,facts);
  const rebuilt=engine.createRaceCourse(engine.buildRaceRoadGraph(stored.roads),['controlled-kerb:forward'],{locationId:'controlled',anchor:{lat:43,lon:7},discipline:'sprint'});
  assert.equal(await engine.raceCourseKey(rebuilt),key);
  assert.ok(Object.isFrozen(rebuilt.segments[0].heightSamples[0].lateralSamples[0]));
 }
});
test('chunked storage binds every lateral station and rejects altered edge geometry',async()=>{
 const facts=district(road());facts.roads=Array.from({length:1200},(_,i)=>{const r=road();r.sourceId='edge-'+i;r.sourceFeatureId=r.sourceId;r.a.x=r.b.x=i*10;r.a.connectionLayer='start-'+i;r.b.connectionLayer='end-'+i;return r;});
 const stored=await prepareRaceDistrictStorage(facts);assert.ok(stored.chunks.length>1);
 const recovered=await readRaceDistrictFacts(stored.fields,async i=>structuredClone(stored.chunks[i].record));
 assert.deepEqual(recovered.roads.at(-1).heightSamples[1].lateralSamples,stored.facts.roads.at(-1).heightSamples[1].lateralSamples);
 await assert.rejects(readRaceDistrictFacts(stored.fields,async i=>{const record=structuredClone(stored.chunks[i].record);if(i===0)record.roads[0].heightSamples[0].lateralSamples.at(-1).y+=.01;return record;}),/storage_unavailable/);
});

test('moving taper knots follow the same road triangles in either direction and after a timing split',async()=>{
 const at=(t,cap)=>({t,y:0,leftY:0,rightY:0,lateralSamples:[[-4,cap],[-3.3-cap/.15,cap],[-3.3,0],[0,0],[3.3,0],[3.3+cap/.15,cap],[4,cap]].map(([offsetMeters,y])=>({offsetMeters,y}))}),
  tapered={...road(),a:{x:0,y:0,z:0,connectionLayer:'start'},b:{x:0,y:0,z:250,connectionLayer:'end'},heightSamples:[at(0,0),at(1,.06)]},graph=buildRaceRoadGraph([tapered]),f=course(graph,['controlled-kerb:forward']),r=course(graph,['controlled-kerb:reverse']);
 assert.ok(Math.abs(sampleRaceSegmentY(f.segments[0],.5,3.4)-.015)<1e-10,'entry roof is the actual triangle plane, not a bilinear depression');
 assert.ok(Math.abs(sampleRaceSegmentY(r.segments[0],.5,-3.4)-.015)<1e-10);
 const corners=[{x:0,y:0,z:0},{x:0,y:0,z:250},{x:250,y:0,z:250},{x:250,y:0,z:0}],roads=corners.map((a,i)=>({...tapered,sourceId:'taper-'+i,a:{...a,connectionLayer:'n'+i},b:{...corners[(i+1)%4],connectionLayer:'n'+((i+1)%4)},direction:'forward'})),g=buildRaceRoadGraph(roads),closed=createRaceCourse(g,roads.map(p=>p.sourceId+':forward'),{locationId:'controlled',anchor:{lat:43,lon:7},discipline:'circuit',startOffsetMeters:40});
 for(const t of[0,.1,.3,.6,1])for(const offset of[-4,-3.5,-3.35,0,3.35,3.5,4])assert.ok(Math.abs(sampleRaceSegmentY(closed.segments[0],t,offset)-sampleRaceSegmentY(f.segments[0],.16+.84*t,offset))<1e-10);
 assert.ok(Object.isFrozen(closed.segments[0].heightSampleRange));
 const service=await import('../services/racing/generated/engine.mjs'),{createRequire}=await import('node:module'),functions=createRequire(import.meta.url)('../functions/generated/racing-engine.cjs');
 for(const engine of[service,functions]){
  const rebuilt=engine.createRaceCourse(engine.buildRaceRoadGraph(roads),roads.map(p=>p.sourceId+':forward'),{locationId:'controlled',anchor:{lat:43,lon:7},discipline:'circuit',startOffsetMeters:40});
  assert.deepEqual(rebuilt.segments,closed.segments);assert.equal(await engine.raceCourseKey(rebuilt),await raceCourseKey(closed));
 }
});
