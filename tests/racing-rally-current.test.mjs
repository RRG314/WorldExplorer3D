import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createRallyStageFixture} from './fixtures/rally-stage-format.js';
import {createRaceSession} from '../app/js/racing/session-rules.js';
import {createRaceVehicleProfile,createRaceVehicleState,stepRaceVehicle,snapshotRaceVehicle,raceVehicleGroundPose} from '../app/js/racing/vehicle-controller.js';
import {createRaceCourse,raceGridPose} from '../app/js/racing/course-rules.js';
import {canonicalRaceDistrict} from '../app/js/racing/district-facts.js';
import {raceCourseKey,raceDistrictFingerprint,raceCourseReference,restoreRaceCourse} from '../app/js/racing/course-library.js';
import {reconstructPublishedRace,assertRaceCourseInDistrict} from '../app/js/racing/publication-rules.js';
import {racePhysicsVersion,raceCompetitiveRecordConfiguration} from '../app/js/racing/record-rules.js';
import {normalizeRaceVenueSource} from '../app/js/racing/venue-course-policy.js';
import {rallySurfaceDynamics} from '../app/js/racing/rally-rules.js';
import {createNetworkRaceController} from '../app/js/racing/network-controller.js';
import {raceRecordConfiguration} from '../app/js/racing/record-rules.js';
import {advanceRoadRaceFrame} from '../app/js/physics/road-race-delegate.js';
import {createPracticeRaceController} from '../app/js/racing/road-activity-controller.js';
import {buildVenueRaceCourses} from '../app/js/racing/venue-courses.js';
import {vrRaceStatus} from '../app/js/vr/race-status.js';
import {readCommand,createRaceAuthority} from '../services/racing/authority.mjs';
import {VEHICLE_ROOT_TO_GROUND_METERS} from '../app/js/engine/vehicle-catalog.js?v=6';
import {vehicleWheelContactLayout} from '../app/js/engine/vehicle-catalog.js?v=6';
import {projectRacePosition} from '../app/js/racing/course-rules.js';
import * as THREE from 'three';
const profile=createRaceVehicleProfile('bmw_m3_e92_race');
function runSession(course,{engine={createRaceSession},two=false,recovery=false}={}){
 const session=engine.createRaceSession({id:'controlled-stage',course,creatorUid:'driver',createdAtMs:0});
 session.add({uid:'driver',profile});if(two)session.add({uid:'second',profile});
 session.setReady('driver',true);if(two)session.setReady('second',true);session.start('driver',0);
 let sequence=0,now=0,recovered=false,flight=0,landed=0,previousAir=false,maximumHeight=0;
 while(now<180000&&session.snapshot().phase!=='complete'){
  now+=50;
  for(const uid of two?['driver','second']:['driver']){
   const p=session.snapshot().players.find(p=>p.uid===uid);if(!p.progress.finished)session.control(uid,sequence++,{throttle:1},now);
  }
  const snapshot=session.advance(now),p=snapshot.players.find(p=>p.uid==='driver'),v=p.vehicleState;
  if(v.isAirborne)flight++;if(previousAir&&!v.isAirborne)landed++;previousAir=v.isAirborne;
  maximumHeight=Math.max(maximumHeight,(v.y-VEHICLE_ROOT_TO_GROUND_METERS-v.raceSupportY)*course.metersPerUnit);
  if(recovery&&!recovered&&p.progress.nextGate>8){session.recover('driver',sequence++,now);recovered=true;}
 }
 return {session,snapshot:session.snapshot(),now,flight,landed,maximumHeight};
}

test('complete source-bound open stages bind conditions, ordered splits, pace notes and record identity',async()=>{
 const f=createRallyStageFixture({hill:false}),{course,graph,path}=f;
 assert.equal(course.discipline,'rally');assert.equal(course.laps,1);assert.equal(course.pitLane,undefined);
 assert.deepEqual(raceGridPose(course,0),raceGridPose(course,1),'staggered entrants use the same physical start');
 assert.deepEqual(course.rally.segmentSurfaces,['asphalt-dry','asphalt-dry','gravel-dry','gravel-dry','snow-ice']);
 assert.ok(Object.isFrozen(course.rally));assert.ok(Object.isFrozen(course.rally.splits[0]));
 assert.equal(racePhysicsVersion(course),'earth-rally-2026-10-31.2-contacts1');
 assert.equal(raceCompetitiveRecordConfiguration(profile,{course,slot:1,participants:2}).timing,'individual-stage-start-to-finish');
 assert.throws(()=>createRaceCourse(graph,path.slice(1),{...course}),/rally_path_incomplete/);
 assert.throws(()=>createRaceCourse(graph,path,{...course,discipline:'sprint'}),/rally_source_required/);
 assert.throws(()=>createRaceCourse(graph,path,{...course,laps:2}),/rally_settings/);
 const changed=createRallyStageFixture({hill:false,surfaces:['asphalt-wet','gravel-dry','snow-ice']});
 assert.notEqual(await raceCourseKey(changed.course),await raceCourseKey(course));
 for(const mutate of [h=>{h.stage.rally.legSurfaces[0]='client-grip';},h=>{h.stage.rally.splits.reverse();},h=>{h.stage.rally.paceNotes[0].segment=99;}]){
  const h=structuredClone(f.district.venueSource);mutate(h);
  assert.throws(()=>{const venue=normalizeRaceVenueSource(h);createRaceCourse({...graph,venueSource:venue},path,{...course});},/rally_/);
 }
});

test('surface changes alter actual traction without accepting arbitrary client coefficients',()=>{
 const asphalt=createRallyStageFixture({hill:false,surfaces:['asphalt-dry','asphalt-dry','asphalt-dry']}),ice=createRallyStageFixture({hill:false,surfaces:['snow-ice','snow-ice','snow-ice']});
 const cars=[asphalt,ice].map(f=>createRaceVehicleState(raceGridPose(f.course),profile));
 for(let i=0;i<180;i++)for(const [index,f]of [asphalt,ice].entries())stepRaceVehicle(f.course,cars[index],{throttle:1},1/60,profile);
 assert.ok(cars[0].speed>cars[1].speed*1.8);assert.equal(cars[0].isAirborne,false);assert.equal(cars[1].isAirborne,false);
 const distances=[asphalt,ice].map(f=>{
  const car=createRaceVehicleState(raceGridPose(f.course),profile);car.speed=car.vFwd=100;
  const start=car.x;let ticks=0;while(car.speed>.1&&ticks++<900)stepRaceVehicle(f.course,car,{serviceBrake:1},1/60,profile);
  assert.equal(car.speed,0);return (car.x-start)*f.course.metersPerUnit;
 });assert.ok(distances[1]>distances[0]*2,'equal-speed braking needs substantially more road on ice');
 assert.equal(rallySurfaceDynamics(ice.course,0,profile.surface).grip,.3);
});
test('a narrow source centreline cannot certify the longest chassis through a bend without its swept width',()=>{
 const f=createRallyStageFixture({hill:false}),district=structuredClone(f.district),z=20/district.metersPerUnit;
 district.roads[0].b.z=z;district.roads[1].a.z=z;
 assert.throws(()=>buildVenueRaceCourses(district,f.venue),/rally_chassis_clearance/);
 district.roads.forEach(road=>{road.widthMeters=4.2;});
 const course=buildVenueRaceCourses(district,f.venue).events[0];assert.equal(course.vehicleEnvelope.lengthMeters,6.5);
});

test('steady controls launch and land over a supported crest; missing support still rejects instead of inventing flight',()=>{
 const {course}=createRallyStageFixture(),result=runSession(course),p=result.snapshot.players[0];
 assert.equal(result.snapshot.phase,'complete');assert.equal(p.progress.finished,true);assert.equal(p.dnf,false);
 assert.ok(result.flight>0,'continuous throttle must produce real shared vertical flight');assert.ok(result.landed>0);assert.ok(result.maximumHeight>.1);
 assert.equal(p.vehicleState.isAirborne,false);assert.equal(p.vehicleState.vy,0);assert.ok(p.condition<1,'hard landing uses existing damage policy');
 assert.equal(p.rally.splits.length,2);assert.ok(p.rally.splits[0].elapsedMs<p.rally.splits[1].elapsedMs);
 const car=createRaceVehicleState(raceGridPose(course),profile);car.y+=100;
 assert.throws(()=>stepRaceVehicle(course,car,{throttle:1},1/60,profile),/surface_lost/);
});
test('actual render-matrix wheel positions clear takeoff and landing, and flight metrics report the real gap',()=>{
 const {course}=createRallyStageFixture(),car=createRaceVehicleState(raceGridPose(course),profile),layout=vehicleWheelContactLayout(profile.variant),rotation=new THREE.Matrix4();
 let airborneFrames=0,maximumGap=0;
 for(let tick=0;tick<1800;tick++){
  stepRaceVehicle(course,car,{throttle:1},1/60,profile);
  rotation.makeRotationFromEuler(new THREE.Euler(car.terrainPitch,car.angle,car.terrainRoll,'YXZ'));const gaps=[];
  for(const front of [-1,1])for(const side of [-1,1]){
   const p=new THREE.Vector3(side*layout.halfTrack,0,front*layout.halfWheelbase).applyMatrix4(rotation).add(new THREE.Vector3(car.x,car.y-VEHICLE_ROOT_TO_GROUND_METERS,car.z)),
    support=projectRacePosition(course,{x:p.x,y:car.raceSupportY,z:p.z},{minimumMeters:Math.max(0,car.raceSupportDistanceMeters-12),maximumMeters:car.raceSupportDistanceMeters+12});
   assert.ok(support);gaps.push(p.y-support.y);
  }
  assert.ok(Math.min(...gaps)>-1e-7,'actual tilted wheels must never penetrate known pavement');
  assert.ok(Math.abs(car.maximumWheelGap-Math.max(0,...gaps))<1e-7,'telemetry must use the actual pose, not a fitted ground pose');
  if(car.isAirborne){airborneFrames++;maximumGap=Math.max(maximumGap,...gaps);}
 }
 assert.ok(airborneFrames>30);assert.ok(maximumGap*course.metersPerUnit>1);assert.equal(car.isAirborne,false);assert.ok(car.condition<1);
});

test('a second entrant waits at the same start and uses its own clock, including split and finish times',()=>{
 const {course}=createRallyStageFixture({hill:false}),{snapshot}=runSession(course,{two:true}),[first,second]=snapshot.players.sort((a,b)=>a.slot-b.slot);
 assert.equal(snapshot.phase,'complete');assert.equal(second.rally.startAtMs-first.rally.startAtMs,30000);
 assert.ok(Math.abs(first.progress.elapsedMs-second.progress.elapsedMs)<.01);
 assert.deepEqual(first.rally.splits.map(p=>Math.round(p.elapsedMs)),second.rally.splits.map(p=>Math.round(p.elapsedMs)));
 assert.equal(first.barrierContacts,0);assert.equal(second.barrierContacts,0);
});

test('recovery cannot skip a gate, change time or heal damage and is bounded against stale, queued and repeated commands',()=>{
 const {course}=createRallyStageFixture(),session=createRaceSession({id:'recovery',course,creatorUid:'driver',createdAtMs:0});
 session.add({uid:'driver',profile});session.setReady('driver',true);session.start('driver',0);
 assert.throws(()=>session.recover('driver',0,0),/recovery_unavailable/);
 let now=0,sequence=0;
 while(session.snapshot().players[0].progress.nextGate<9){now+=50;session.control('driver',sequence++,{throttle:1},now);session.advance(now);}
 const before=session.snapshot().players[0];session.recover('driver',sequence++,now);
 assert.ok(before.condition<1,'the recovered actor already has real landing damage');
 assert.throws(()=>session.recover('driver',sequence++,now),/rate_limited/);
 now+=50;session.advance(now);const after=session.snapshot().players[0];
 assert.equal(after.progress.nextGate,before.progress.nextGate);assert.equal(after.progress.penaltyMs,15000);assert.equal(after.rally.recoveries,1);
 assert.equal(after.condition,before.condition);assert.equal(after.barrierContacts,before.barrierContacts);assert.equal(after.vehicleState.speed,0);assert.equal(after.vehicleState.isAirborne,false);
 assert.ok(after.vehicleState.raceSupportDistanceMeters<before.vehicleState.raceSupportDistanceMeters);
 assert.throws(()=>session.recover('driver',sequence++,now),/rate_limited/);
 assert.throws(()=>session.recover('driver',0,now+12000),/obsolete/);
 for(let count=2;count<=3;count++){
  const target=now+10100;while(now<target){now+=50;session.advance(now);}
  session.recover('driver',sequence++,now);now+=50;session.advance(now);
  assert.equal(session.snapshot().players[0].rally.recoveries,count);
 }
 const target=now+10100;while(now<target){now+=50;session.advance(now);}
 assert.throws(()=>session.recover('driver',sequence++,now),/rate_limited/);
 const final=runSession(course,{recovery:true}).snapshot.players[0];assert.equal(final.progress.finished,true);assert.equal(final.progress.penaltyMs,15000);assert.equal(final.rally.recoveries,1);
});

test('canonical storage, reconstruction and all three engine consumers replay identical staggered/flight/recovery frames',async()=>{
 const {district,course}=createRallyStageFixture(),facts=canonicalRaceDistrict(district),fingerprint=await raceDistrictFingerprint(facts),
  reference=raceCourseReference(course,fingerprint),approved=await reconstructPublishedRace(reference,facts);
 assert.equal(assertRaceCourseInDistrict(approved,district),true);
 const service=await import('../services/racing/generated/engine.mjs'),functions=createRequire(import.meta.url)('../functions/generated/racing-engine.cjs'),expected=runSession(approved,{two:true,recovery:true});
 assert.equal(expected.snapshot.phase,'complete');assert.equal(expected.snapshot.players.every(p=>p.progress.finished),true);
 for(const engine of [service,functions]){
  const restored=engine.restoreRaceCourse(reference,facts,engine.buildRaceRoadGraph(facts.roads,{metersPerUnit:facts.metersPerUnit,venueSource:facts.venueSource}),fingerprint);
  assert.equal(await engine.raceCourseKey(restored),await raceCourseKey(approved));assert.equal(engine.racePhysicsVersion(restored),racePhysicsVersion(approved));
  assert.deepEqual(runSession(restored,{engine,two:true,recovery:true}).snapshot,expected.snapshot);
 }
 assert.ok(Object.values(snapshotRaceVehicle(createRaceVehicleState(raceGridPose(course),profile))).every(v=>Number.isFinite(v)||typeof v==='boolean'));
 assert.ok(Number.isFinite(raceVehicleGroundPose(expected.snapshot.players[0].vehicleState).y));
});

test('prediction and the existing actor delegate preserve flight, and never predict a later entrant before its own start',()=>{
 const {course}=createRallyStageFixture(),session=createRaceSession({id:'prediction',course,creatorUid:'driver',createdAtMs:0});
 for(const uid of ['driver','second'])session.add({uid,profile});for(const uid of ['driver','second'])session.setReady(uid,true);session.start('driver',0);
 let now=0,sequence=0,p;
 while(!p?.vehicleState.isAirborne){now+=50;session.control('driver',sequence++,{throttle:1},now);session.advance(now);p=session.snapshot().players.find(p=>p.uid==='driver');assert.ok(now<20000);}
 const state={...session.snapshot(),physicsVersion:racePhysicsVersion(course),profiles:{driver:raceRecordConfiguration(profile,{course}),second:raceRecordConfiguration(profile,{course})}},writes=[],
  connection={snapshot:()=>state,connected:()=>true,isFresh:()=>true,control:a=>writes.push(a),recover:()=>true,stop(){}},
  context={worldPublication:{},car:{personalVehicleId:profile.vehicleId},Walk:{state:{mode:'drive'}},activateSurfaceActivity:()=>true},
  controller=createNetworkRaceController({context,course,connection,uid:'driver'});
 context.roadRaceController=controller;controller.start();const before=JSON.stringify(state),expected=structuredClone(p.vehicleState);
 stepRaceVehicle(course,expected,{throttle:1},1/60,profile);
 assert.equal(advanceRoadRaceFrame(context,1/60,{throttle:1}),true);
 assert.equal(context.car.isAirborne,true);assert.equal(context.car.vy,expected.vy);assert.equal(context.car.y,expected.y);assert.equal(context.car.onRoad,false);
 assert.equal(JSON.stringify(state),before);controller.dispose();
 const waiting=createNetworkRaceController({context,course,connection,uid:'second'});waiting.start();const result=waiting.step(1/60,{throttle:1});
 assert.deepEqual(result,state.players.find(p=>p.uid==='second').vehicleState);waiting.dispose();
});

test('practice recovery uses the owned controller, VR reads individual timing/notes, and wire commands cannot supply recovery poses',()=>{
 const f=createRallyStageFixture(),context={worldPublication:{},car:{personalVehicleId:profile.vehicleId},Walk:{state:{mode:'drive'}},activateSurfaceActivity:()=>true},
  run=createPracticeRaceController({context,course:f.course,profile});context.roadRaceController=run;run.start();
 for(let i=0;i<360;i++)advanceRoadRaceFrame(context,1/60,{throttle:1});
 const status=vrRaceStatus(context);assert.match(status.message,/Stage/);assert.match(status.message,/crest/);assert.equal(status.canRecover,true);
 run.recover();advanceRoadRaceFrame(context,1/60,{});assert.equal(run.snapshot().players[0].rally.recoveries,1);assert.match(vrRaceStatus(context).message,/\+15s/);run.dispose();
 const events=buildVenueRaceCourses(f.district,f.venue).events;assert.equal(events.length,1);assert.equal(events[0].discipline,'rally');
 assert.deepEqual(readCommand(JSON.stringify({type:'recover',sequence:1})),{type:'recover',sequence:1});
 assert.throws(()=>readCommand(JSON.stringify({type:'recover',sequence:2,pose:{x:20,y:0,z:0}})),/invalid_race_message/);
 assert.throws(()=>readCommand(JSON.stringify({type:'recover',sequence:2,elapsedMs:1})),/invalid_race_message/);
});

test('the room authority accepts only input and bounded recovery; its saved result retains the penalty and personal start clock',async()=>{
 const {course}=createRallyStageFixture(),courseId=await raceCourseKey(course);let clock=0,settlements=0,terminal;
 const store={course:async()=>course,admit:async()=>({profile,label:'Driver',leaseUntil:clock+15000}),renew:async()=>({leaseUntil:clock+15000}),
  releaseParticipant:async()=>{},release:async()=>{},settle:async({snapshot})=>{settlements++;terminal=structuredClone(snapshot);return {id:snapshot.id};}},
  authority=createRaceAuthority({store,now:()=>clock}),out=new Map(),clients=['driver','second'].map(uid=>{const messages=[];out.set(uid,messages);return {uid,send:p=>messages.push(p),close(){},isOpen:()=>true};}),
  command=(client,value)=>authority.command(client,JSON.stringify(value));
 try{
  for(const c of clients)await command(c,{type:'join',roomCode:'STAGE1',worldSeed:'controlled-stage',courseId,vehicleId:profile.vehicleId});
  for(const c of clients)await command(c,{type:'ready',ready:true});await command(clients[0],{type:'start'});
  let sequence=0,recovered=false;
  for(clock=50;clock<180000;clock+=50){
   const state=out.get('driver').at(-1).snapshot;
   for(const c of clients)if(!state.players.find(p=>p.uid===c.uid).progress.finished)await command(c,{type:'control',sequence:sequence++,actions:{throttle:1}});
   const player=state.players.find(p=>p.uid==='driver');
   if(!recovered&&player.progress.nextGate>=9){await command(clients[0],{type:'recover',sequence:sequence++});recovered=true;}
   authority.tick();await new Promise(resolve=>setImmediate(resolve));
   if(out.get('driver').at(-1).snapshot.settlement==='saved')break;
  }
  const result=out.get('driver').at(-1).snapshot,driver=result.players.find(p=>p.uid==='driver');
  assert.equal(result.settlement,'saved');assert.equal(settlements,1);assert.ok(result.players.every(p=>p.progress.finished));assert.equal(driver.progress.penaltyMs,15000);
  assert.equal(driver.rally.recoveries,1);assert.equal(driver.rally.startAtMs,4000);assert.deepEqual(terminal.players,result.players);
  await assert.rejects(command(clients[0],{type:'recover',sequence:sequence++}),/recovery_unavailable/);
  assert.equal(settlements,1);
 }finally{await authority.close();}
});
