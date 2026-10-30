import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {createOvalPitFixture} from './fixtures/oval-pit-format.js';
import {ovalPitDriverActions} from './fixtures/oval-pit-driver.js';
import {createRaceSession} from '../app/js/racing/session-rules.js';
import {createRaceCourse,projectRacePosition} from '../app/js/racing/course-rules.js';
import {createRacePitGeometry,racePitPavementAt} from '../app/js/racing/pit-lane-rules.js';
import {createRaceVehicleProfile,raceVehicleSpeedMetersPerSecond,stepRaceVehicle,snapshotRaceVehicle,raceVehicleGroundPose} from '../app/js/racing/vehicle-controller.js';
import {raceAiActions} from '../app/js/racing/ai-controller.js';
import {racePhysicsVersion,RACE_OVAL_PIT_PHYSICS_VERSION,raceRecordConfiguration} from '../app/js/racing/record-rules.js';
import {createNetworkRaceController} from '../app/js/racing/network-controller.js';
import {ovalPaceActions} from '../app/js/racing/oval-rules.js';
const profile=createRaceVehicleProfile('bmw_m3_e92_race');
function run(engine={createRaceSession,createRaceVehicleProfile},{takePit=true,finishInPit=false,paceMetersPerSecond=10}={}){
 const f=createOvalPitFixture(),path=finishInPit?[...f.path.slice(13),...f.path.slice(0,13)]:f.path,
  course=finishInPit?createRaceCourse(f.graph,path,{...f.settings,pitPath:f.pitPath,laps:1}):f.course,geometry=createRacePitGeometry(course),s=engine.createRaceSession({id:'controlled-pit',course,creatorUid:'driver',createdAtMs:0});
 s.add({uid:'driver',profile:engine.createRaceVehicleProfile('bmw_m3_e92_race')});s.setReady('driver',true);s.start('driver',0);let state=s.snapshot(),sequence=0,sawPit=false,sawExit=false,maximumPitSpeed=0,maximumPitCheckpoint=0,midPitState=null;
 for(let now=50;now<=240000;now+=50){
  const p=state.players[0];s.control('driver',sequence++,takePit?ovalPitDriverActions(course,geometry,p,profile,{paceMetersPerSecond}):raceAiActions(course,p.vehicleState,p.progress,profile,{laneOffsetMeters:-1.4}),now);
  state=s.advance(now);const me=state.players[0];if(me.pit.active){sawPit=true;maximumPitSpeed=Math.max(maximumPitSpeed,Math.abs(raceVehicleSpeedMetersPerSecond(me.vehicleState)));maximumPitCheckpoint=Math.max(maximumPitCheckpoint,me.pit.nextGate);assert.equal(me.draftingReduction,0);}
  if(me.pit.active&&me.pit.nextGate>=4&&!midPitState)midPitState=structuredClone(state);if(sawPit&&!me.pit.active)sawExit=true;if(state.phase==='complete'||me.dnf)break;
 }
 return {state,course,sawPit,sawExit,maximumPitSpeed,maximumPitCheckpoint,midPitState};
}
test('a controls-only driver enters the reviewed branch, passes its actual checkpoints, exits and finishes with no boundary contacts',()=>{
 const r=run(),p=r.state.players[0];assert.equal(r.state.phase,'complete');assert.ok(p.progress.finished&&!p.dnf);assert.equal(p.pit.visits,1);assert.ok(r.sawPit&&r.sawExit);assert.ok(r.maximumPitCheckpoint>=17);assert.ok(r.maximumPitSpeed<10.6);assert.equal(p.progress.penaltyMs,0);assert.equal(p.barrierContacts,0);assert.equal(racePhysicsVersion(r.course),RACE_OVAL_PIT_PHYSICS_VERSION);
});
test('a main-track driver passes the shared pit-entry node without being admitted or changing lanes',()=>{
 const r=run(undefined,{takePit:false}),p=r.state.players[0];assert.equal(r.state.phase,'complete');assert.ok(p.progress.finished&&!p.dnf);assert.equal(p.pit.visits,0);assert.equal(p.barrierContacts,0);assert.equal(r.sawPit,false);
});
test('the final timing line can be crossed on the actual pit path without granting an early exit or synthetic lap',()=>{
 const r=run(undefined,{finishInPit:true}),p=r.state.players[0];assert.equal(r.state.phase,'complete');assert.ok(p.progress.finished&&!p.dnf);assert.ok(r.sawPit&&!r.sawExit);assert.equal(p.pit.active,true);assert.equal(p.pit.visits,1);assert.equal(p.barrierContacts,0);assert.equal(p.progress.lapTimes.length,1);assert.ok(p.pit.nextGate>0&&p.pit.nextGate<p.pit.gates);
});
test('browser, socket service and Functions produce the identical complete pit route result',async()=>{
 const a=run(),b=run(await import('../services/racing/generated/engine.mjs')),c=run(createRequire(import.meta.url)('../functions/generated/racing-engine.cjs'));assert.deepEqual(b.state,a.state);assert.deepEqual(c.state,a.state);
});
test('entry speed is measured by the session and receives one penalty while normal braking still lets the driver finish',()=>{
 const r=run(undefined,{paceMetersPerSecond:14}),p=r.state.players[0];assert.equal(r.state.phase,'complete');assert.ok(p.progress.finished&&!p.dnf);assert.equal(p.pit.visits,1);assert.equal(p.progress.penaltyMs,5000);assert.equal(p.ovalPenaltyReason,'pit-entry-speed');assert.equal(p.barrierContacts,0);
});
test('network prediction selects the same pit pavement and braking calculation without accepting client timing authority',()=>{
 const r=run(),state={...r.midPitState,physicsVersion:racePhysicsVersion(r.course),profiles:{driver:raceRecordConfiguration(profile,{course:r.course})}},p=state.players[0],writes=[],connection={snapshot:()=>state,connected:()=>true,isFresh:()=>true,control:a=>writes.push(a),stop(){}},context={worldPublication:{},car:{personalVehicleId:profile.vehicleId},Walk:{state:{mode:'drive'}},activateSurfaceActivity:()=>true},controller=createNetworkRaceController({context,course:r.course,connection,uid:'driver'});
 assert.ok(p.pit.active);controller.start();const frozen=JSON.stringify(state),input={throttle:1},expected=structuredClone(p.vehicleState),controls=ovalPaceActions(input,raceVehicleSpeedMetersPerSecond(expected),true),geometry=createRacePitGeometry(r.course);
 stepRaceVehicle(racePitPavementAt(r.course,geometry,raceVehicleGroundPose(expected),p.pit),expected,controls,1/60,profile,{draftReduction:0});assert.deepEqual(controller.step(1/60,input),snapshotRaceVehicle(expected));assert.deepEqual(writes,[input]);assert.equal(JSON.stringify(state),frozen);controller.dispose();
});
test('an occupied bank at the physical pit exit adds a single unsafe merge penalty',()=>{
 const {course}=createOvalPitFixture(),geometry=createRacePitGeometry(course),s=createRaceSession({id:'pit-merge',course,creatorUid:'driver',createdAtMs:0});for(const uid of ['driver','bank'])s.add({uid,profile});for(const uid of ['driver','bank'])s.setReady(uid,true);s.start('driver',0);let state=s.snapshot(),sequence=0,parked=false,merged=null,mergeGap=null;
 for(let now=50;now<=100000;now+=50){
  const driver=state.players.find(p=>p.uid==='driver'),bank=state.players.find(p=>p.uid==='bank'),projection=projectRacePosition(course,bank.pose);if((!driver.pit.visits||driver.pit.active)&&projection.distanceMeters>geometry.exitDistanceMeters-70&&projection.distanceMeters<geometry.exitDistanceMeters+20)parked=true;
  const actions=parked&&(!driver.pit.visits||driver.pit.active)?{...raceAiActions(course,bank.vehicleState,bank.progress,profile,{laneOffsetMeters:1.4}),throttle:0,serviceBrake:1}:raceAiActions(course,bank.vehicleState,bank.progress,profile,{laneOffsetMeters:1.4});s.control('driver',sequence,ovalPitDriverActions(course,geometry,driver,profile),now);s.control('bank',sequence++,actions,now);state=s.advance(now);
  const me=state.players.find(p=>p.uid==='driver');if(me.pit.visits&&!me.pit.active){merged=me;mergeGap=Math.abs(projectRacePosition(course,me.pose).distanceMeters-projectRacePosition(course,state.players.find(p=>p.uid==='bank').pose).distanceMeters);break;}
 }
 assert.ok(parked&&merged);assert.ok(mergeGap<10,'the other car must actually occupy the exit clearance');assert.equal(merged.ovalPenaltyReason,'unsafe-pit-merge');assert.equal(merged.progress.penaltyMs,5000);
});
test('passing a stopped pit participant is penalized once while a main-track participant stays outside that comparison',()=>{
 const {course}=createOvalPitFixture(),geometry=createRacePitGeometry(course),s=createRaceSession({id:'pit-passing',course,creatorUid:'driver',createdAtMs:0});for(const uid of ['driver','bank','chaser'])s.add({uid,profile});for(const uid of ['driver','bank','chaser'])s.setReady(uid,true);s.start('driver',0);let state=s.snapshot(),sequence=0,holding=false,penaltyAt=null;
 for(let now=50;now<=100000;now+=50){
  for(const p of state.players){let actions=p.uid==='bank'?raceAiActions(course,p.vehicleState,p.progress,profile,{laneOffsetMeters:1.4}):ovalPitDriverActions(course,geometry,p,profile);if(p.uid==='driver'&&p.pit.active&&p.pit.nextGate>=5)holding=true;if(p.uid==='driver'&&holding)actions={...actions,throttle:0,serviceBrake:1};s.control(p.uid,sequence,actions,now);}
  sequence++;state=s.advance(now);const chaser=state.players.find(p=>p.uid==='chaser');if(chaser.ovalPenaltyReason==='passing-in-pits'&&penaltyAt===null)penaltyAt=now;if(penaltyAt!==null&&now-penaltyAt>=1000)break;
 }
 const chaser=state.players.find(p=>p.uid==='chaser');assert.ok(holding&&penaltyAt!==null);assert.ok(chaser.pit.active);assert.equal(chaser.progress.penaltyMs,5000);assert.ok(state.players.every(p=>p.barrierContacts===0));
});
