import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {createOvalFormatFixture} from './fixtures/oval-format.js';
import {buildRaceRoadGraph,createRaceCourse,raceGridPose,projectRacePosition} from '../app/js/racing/course-rules.js';
import {createRaceSession} from '../app/js/racing/session-rules.js';
import {createRaceVehicleProfile} from '../app/js/racing/vehicle-controller.js';
import {racePhysicsVersion,raceRecordConfiguration,raceCompetitiveRecordConfiguration,RACE_OVAL_PHYSICS_VERSION,RACE_PROFILED_PAVEMENT_PHYSICS_VERSION} from '../app/js/racing/record-rules.js';
import {createPracticeRaceController} from '../app/js/racing/road-activity-controller.js';
import {createNetworkRaceController} from '../app/js/racing/network-controller.js';
const profile=createRaceVehicleProfile('bmw_m3_e92_race');
function session(engine={createRaceSession,createRaceVehicleProfile},id='rolling'){
 const {course}=createOvalFormatFixture(),s=engine.createRaceSession({id,course,creatorUid:'driver',createdAtMs:0});
 for(const uid of ['driver','two','three','four'])s.add({uid,profile:engine.createRaceVehicleProfile('bmw_m3_e92_race')});
 for(const uid of ['driver','two','three','four'])s.setReady(uid,true);s.start('driver',0);return {s,course};
}
test('oval admission requires the reviewed whole-loop physical bank lane and keeps a distinct record class',()=>{
 const {roads,graph,course,settings}=createOvalFormatFixture();assert.equal(course.discipline,'oval');assert.equal(course.laps,2);
 assert.equal(racePhysicsVersion(course),RACE_OVAL_PHYSICS_VERSION);assert.equal(racePhysicsVersion({...course,discipline:'circuit'}),RACE_PROFILED_PAVEMENT_PHYSICS_VERSION);
 assert.equal(raceCompetitiveRecordConfiguration(profile,{course,slot:0,participants:4}).timing,'rolling-green-to-finish');
 const ordinary=buildRaceRoadGraph(roads);assert.throws(()=>createRaceCourse(ordinary,ordinary.edges.map(e=>e.id),settings),/oval_pavement_required/);
 const missing=structuredClone(roads);for(const r of missing)for(const row of r.heightSamples)delete row.racingWidthMeters;const g=buildRaceRoadGraph(missing,{venueSource:graph.venueSource});assert.throws(()=>createRaceCourse(g,g.edges.map(e=>e.id),settings),/oval_pavement_required/);
 assert.throws(()=>raceGridPose({...course,discipline:'circuit'},0,{rollingStagingMeters:40}),/rolling_grid/);
});
test('four actors roll in formation before green and pre-green human controls cannot advance timing or break their lanes',()=>{
 const a=session(),b=session(),initial=a.s.snapshot();let mid;
 for(let now=50,sequence=0;now<=4000;now+=50,sequence++){
  a.s.control('driver',sequence,{throttle:1,steer:sequence%2?1:-1},now-1);const x=a.s.advance(now),y=b.s.advance(now);assert.deepEqual(x.players.map(p=>p.pose),y.players.map(p=>p.pose));if(now===2000)mid=x;
 }
 const green=a.s.snapshot();assert.equal(mid.phase,'countdown');assert.equal(mid.raceControl.flag,'formation');assert.equal(green.phase,'running');assert.equal(green.raceControl.flag,'green');assert.equal(green.startAtMs,4000);
 for(const p of green.players){const before=initial.players.find(q=>q.uid===p.uid),travel=Math.hypot(p.pose.x-before.pose.x,p.pose.z-before.pose.z);assert.ok(travel>33&&travel<43);assert.ok(p.speed>35&&p.speed<55);assert.equal(p.progress.nextGate,0);assert.equal(p.progress.elapsedMs,null);assert.equal(p.barrierContacts,0);const projection=projectRacePosition(a.course,p.pose);assert.ok(Math.abs(projection.lateralMeters-(p.slot%2===0?-1.4:1.4))<.6);}
});
test('the formation presentation follows fixed ticks smoothly and a stalled formation cancels without dropping time',()=>{
 const {s}=session(),positions=[];for(let i=1;i<=60;i++){s.advance(i*1000/120);positions.push(s.presentationSnapshot().players.find(p=>p.uid==='driver').pose);}
 const steps=positions.slice(4).map((p,i)=>Math.hypot(p.x-positions[i+3].x,p.z-positions[i+3].z));assert.ok(Math.min(...steps)>.025&&Math.max(...steps)<.15);
 const other=session().s;assert.equal(other.advance(3000).phase,'cancelled');assert.equal(other.snapshot().reason,'race_authority_stalled');
});
test('browser, socket service and Functions replay the same formation and green transition',async()=>{
 const engines=[{createRaceSession,createRaceVehicleProfile},await import('../services/racing/generated/engine.mjs'),createRequire(import.meta.url)('../functions/generated/racing-engine.cjs')],results=[];
 for(const engine of engines){const {s}=session(engine);for(let now=50,sequence=0;now<=5000;now+=50,sequence++){s.control('driver',sequence,{throttle:1},now);s.advance(now);}results.push(s.snapshot());}
 assert.equal(results[0].phase,'running');assert.deepEqual(results[1],results[0]);assert.deepEqual(results[2],results[0]);
});
test('practice admission uses the same rolling staging pose and network presentation moves between authority snapshots',()=>{
 const {course}=createOvalFormatFixture(),writes=[],context={worldPublication:{requestId:'controlled'},car:{personalVehicleId:'bmw_m3_e92_race'},Walk:{state:{mode:'drive'}},activateSurfaceActivity(mode,p){writes.push({...p});return mode==='drive';}},
  practice=createPracticeRaceController({context,course,profile});practice.start();const start=practice.snapshot().players[0].pose;
 assert.ok(Math.hypot(start.x-writes[0].x,start.z-writes[0].z)<1e-8,'admission and session cannot put the car forty metres apart');
 let frame;for(let i=0;i<120;i++)frame=practice.step(1/60,{throttle:1});assert.ok(Math.hypot(frame.x-start.x,frame.z-start.z)>15);assert.equal(writes.length,1,'the road owner consumes returned frames');practice.dispose();
 const {s}=session(),configuration=raceRecordConfiguration(profile,{course});let state={...s.snapshot(),physicsVersion:racePhysicsVersion(course),profiles:{driver:configuration}},fresh=true,controls=0;
 const connection={snapshot:()=>state,connected:()=>true,isFresh:()=>fresh,control:()=>controls++,stop(){}},network=createNetworkRaceController({context,course,connection,uid:'driver'});network.start();const original=state.players.find(p=>p.uid==='driver').pose,views=[];
 for(let i=1;i<=120;i++){const at=i*1000/60;if(i%3===0){s.advance(at);state={...s.snapshot(),physicsVersion:racePhysicsVersion(course),profiles:{driver:configuration}};}const frozen=JSON.stringify(state);frame=network.step(1/60,{steer:1,throttle:1});views.push(network.presentationSnapshot().players.find(p=>p.uid==='two').pose);assert.equal(JSON.stringify(state),frozen,'presentation cannot edit authoritative packets');}
 const changes=views.slice(10).map((p,i)=>Math.hypot(p.x-views[i+9].x,p.z-views[i+9].z));assert.ok(Math.min(...changes)>.05&&Math.max(...changes)<.3,'rivals cannot hold and jump at each 50 ms packet');
 assert.ok(Math.hypot(frame.x-original.x,frame.z-original.z)>15);assert.ok(controls>100);fresh=false;assert.equal(network.step(1/60,{}).speed,0);network.dispose();
});
