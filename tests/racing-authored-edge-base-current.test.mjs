import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {buildRaceRoadGraph,createRaceCourse,sampleRaceSegmentY} from '../app/js/racing/course-rules.js';
import {canonicalRaceDistrict} from '../app/js/racing/district-facts.js';
import {prepareRaceDistrictStorage,readRaceDistrictFacts} from '../app/js/racing/district-storage.js';
import {raceDistrictFingerprint,raceCourseKey} from '../app/js/racing/course-library.js';
const model='authored-road-edge-v1',base=(t,x)=>t*53.75+x*.03,station=(t,lift)=>({t,y:base(t,0),leftY:base(t,-1.2),rightY:base(t,1.2),lateralSamples:[[-4,0],[0,0],[3.3,0],[3.3+lift/.13,lift],[4,lift]].map(([offsetMeters,raise])=>({offsetMeters,baseY:base(t,offsetMeters),y:base(t,offsetMeters)+raise}))}),road=()=>({sourceId:'controlled-edge-base',sourceFeatureId:'controlled-edge-base',a:{x:0,y:0,z:0},b:{x:0,y:53.75,z:250},widthMeters:8,structure:'surface',direction:'both',driveable:true,supported:true,surfaceModel:'banked-road-v1',edgeBandModel:model,heightSampleSpanMeters:1.2,heightSamples:[station(0,0),station(.02,.045),station(1,.045)]}),district=r=>({type:'RaceDistrictFacts',version:1,locationId:'controlled',locationLabel:'Controlled edge and base fixture',anchor:{lat:50,lon:7},metersPerUnit:1,roads:[r]});
test('a bounded authored lift is validated separately from its published pavement base',()=>{
 const r=road(),graph=buildRaceRoadGraph([r]);assert.equal(graph.edges.length,2);
 const course=createRaceCourse(graph,['controlled-edge-base:forward'],{locationId:'controlled',anchor:{lat:50,lon:7},discipline:'sprint',participants:1});
 assert.equal(course.edgeBandModel,model);assert.equal(course.segments[0].edgeBandModel,model);
 assert.ok(Math.abs(sampleRaceSegmentY(course.segments[0],.01,3.9)-(base(.01,3.9)+.0225))<1e-9);
 assert.ok(Object.isFrozen(course.segments[0].heightSamples[0].lateralSamples[0]));
 const reverse=graph.edges.find(e=>e.id.endsWith(':reverse'));assert.equal(reverse.heightSamples[0].lateralSamples[0].baseY,base(1,4));
});
test('missing base evidence, unsafe base planes and excessive lift remain rejected',()=>{
 const mutations=[r=>delete r.edgeBandModel,r=>r.edgeBandModel='unreviewed',r=>delete r.heightSamples[1].lateralSamples[1].baseY,r=>{for(const s of r.heightSamples){const p=s.lateralSamples.at(-1);p.baseY+=1;p.y+=1;}},r=>{for(const s of r.heightSamples)s.lateralSamples.at(-1).y=s.lateralSamples.at(-1).baseY+.11;},r=>r.heightSamples[1].lateralSamples[1].y+=.01];
 for(const mutate of mutations){const r=road();mutate(r);assert.throws(()=>canonicalRaceDistrict(district(r)),/race_|heights/);}
 const legacy=road();delete legacy.edgeBandModel;for(const s of legacy.heightSamples)for(const p of s.lateralSamples)delete p.baseY;
 assert.throws(()=>buildRaceRoadGraph([legacy]),/heights/,'the existing total-grade fence remains unchanged without the typed base/lift contract');
});
test('base evidence survives canonical storage, identities and both generated runtimes',async()=>{
 const facts=canonicalRaceDistrict(district(road())),stored=await prepareRaceDistrictStorage(facts),restored=await readRaceDistrictFacts(stored.fields,async i=>stored.chunks[i].record);assert.deepEqual(restored,facts);
 const key=await raceDistrictFingerprint(facts),changed=structuredClone(facts);changed.roads[0].heightSamples[1].lateralSamples.at(-1).baseY+=.001;assert.notEqual(await raceDistrictFingerprint(changed),key);
 const browser=createRaceCourse(buildRaceRoadGraph(facts.roads),['controlled-edge-base:forward'],{locationId:'controlled',anchor:{lat:50,lon:7},discipline:'sprint',participants:1}),courseKey=await raceCourseKey(browser),engines=[await import('../services/racing/generated/engine.mjs'),createRequire(import.meta.url)('../functions/generated/racing-engine.cjs')];
 for(const engine of engines){assert.deepEqual(engine.canonicalRaceDistrict(district(road())),facts);const c=engine.createRaceCourse(engine.buildRaceRoadGraph(facts.roads),['controlled-edge-base:forward'],{locationId:'controlled',anchor:{lat:50,lon:7},discipline:'sprint',participants:1});assert.equal(await engine.raceCourseKey(c),courseKey);}
});

test('the existing four-wheel controller follows the typed raised surface on a steep valid base',async()=>{
 const {createRaceVehicleProfile,createRaceVehicleState,stepRaceVehicle}=await import('../app/js/racing/vehicle-controller.js'),course=createRaceCourse(buildRaceRoadGraph([road()]),['controlled-edge-base:forward'],{locationId:'controlled',anchor:{lat:50,lon:7},discipline:'sprint',participants:1}),profile=createRaceVehicleProfile('bmw_e34'),pose={x:2.6,y:sampleRaceSegmentY(course.segments[0],.01,2.6),z:2.5,yaw:0},car=createRaceVehicleState(pose,profile);
 for(let i=0;i<60;i++)stepRaceVehicle(course,car,{throttle:0,steer:0,serviceBrake:1,handbrake:1},1/60,profile);
 assert.ok(car.maximumWheelPenetration<.03&&car.maximumWheelGap<.03);assert.equal(car.barrierContacts,0);assert.ok(Math.abs(car.terrainPitch)>.18);
});
test('chunk hashing retains the base witness and rejects a changed base under an unchanged record',async()=>{
 const raw=district(road());raw.roads=Array.from({length:900},(_,i)=>{const r=road();return {...r,sourceId:'controlled-base-'+i,a:{...r.a,x:i*10},b:{...r.b,x:i*10}};});
 const stored=await prepareRaceDistrictStorage(raw);assert.ok(stored.chunks.length>0);
 const restored=await readRaceDistrictFacts(stored.fields,async i=>stored.chunks[i].record);assert.equal(await raceDistrictFingerprint(restored),await raceDistrictFingerprint(stored.facts));
 const changed=structuredClone(stored.chunks[0].record);changed.roads[0].heightSamples[1].lateralSamples.at(-1).baseY+=.001;
 await assert.rejects(readRaceDistrictFacts(stored.fields,async i=>i===0?changed:stored.chunks[i].record),/storage_unavailable/);
});

test('a corner may rotate a small ramp while its lift vector and underlying base remain bounded',()=>{
 const r=road();r.a={...r.a,y:0,connectionLayer:'source-node:controlled-start'};r.b={...r.b,y:0,z:.5,connectionLayer:'source-node:controlled-end'};r.heightSamples=[0,1].map(t=>({t,y:0,leftY:0,rightY:0,lateralSamples:[[-4,0],[0,0],[3.3,0],[3.65,.04+t*.04],[4,.04+t*.04]].map(([offsetMeters,y])=>({offsetMeters,y,baseY:0}))}));
 assert.equal(buildRaceRoadGraph([r]).edges.length,2);
 r.b.z=.1;assert.throws(()=>buildRaceRoadGraph([r]),/heights/,'an excessive additive gradient cannot hide behind a valid flat base');
});
