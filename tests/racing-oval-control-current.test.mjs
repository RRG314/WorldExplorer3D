import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {createOvalFormatFixture} from './fixtures/oval-format.js';
import {createRaceSession} from '../app/js/racing/session-rules.js';
import {createRaceVehicleProfile,raceVehicleSpeedMetersPerSecond} from '../app/js/racing/vehicle-controller.js';
import {raceAiActions} from '../app/js/racing/ai-controller.js';
import {ovalTrackZone,ovalPaceActions} from '../app/js/racing/oval-rules.js';
const profile=createRaceVehicleProfile('bmw_m3_e92_race');
function setup(engine={createRaceSession,createRaceVehicleProfile},count=1){
 const {course}=createOvalFormatFixture(),s=engine.createRaceSession({id:'oval-control',course,creatorUid:'driver',createdAtMs:0});
 for(const uid of ['driver','two','three','four'].slice(0,count)){s.add({uid,profile:engine.createRaceVehicleProfile('bmw_m3_e92_race')});s.setReady(uid,true);}
 // Adding a participant clears the human roster's ready state.
 for(const uid of ['driver','two','three','four'].slice(0,count))s.setReady(uid,true);
 s.start('driver',0);for(let now=50;now<=4000;now+=50)s.advance(now);return {s,course};
}
function drive(s,course,now,sequence,uid='driver',lane=0,pace=false){
 const p=s.snapshot().players.find(p=>p.uid===uid);s.control(uid,sequence,raceAiActions(course,p.vehicleState,p.progress,profile,{laneOffsetMeters:lane,...(pace?{formation:true,paceMetersPerSecond:typeof pace==='number'?pace:10}:{})}),now);
}
test('apron classification follows the retained inner extension in either source direction and pace uses controls only',()=>{
 const p={minimumMeters:-5,maximumMeters:15,racingOffsetMeters:0,racingWidthMeters:9.8};
 for(const sign of [1,-1]){
  const pavement=sign===1?p:{minimumMeters:-15,maximumMeters:5,racingOffsetMeters:0,racingWidthMeters:9.8};
  assert.equal(ovalTrackZone({pavement,lateralMeters:7*sign}),'apron');assert.equal(ovalTrackZone({pavement,lateralMeters:-4.95*sign}),'outside');assert.equal(ovalTrackZone({pavement,lateralMeters:4.8*sign}),'bank');assert.equal(ovalTrackZone({pavement,lateralMeters:16*sign}),'outside');
 }
 const actions={steer:.7,throttle:1,reverse:0,brake:0,serviceBrake:.1},before=structuredClone(actions);
 assert.equal(ovalPaceActions(actions,25,false),actions);assert.equal(ovalPaceActions(actions,9,true),actions);
 assert.deepEqual(ovalPaceActions(actions,25,true),{...actions,throttle:0,serviceBrake:1});assert.deepEqual(actions,before);
});
test('a physical impact raises yellow and the existing brakes reduce speed before the session returns to green',()=>{
 const {s,course}=setup();let sequence=0,impactAt=null,impactSpeed=0,slowest=Infinity,state;
 for(let now=4050;now<=18000;now+=50){
  const p=s.snapshot().players[0];
  s.control('driver',sequence++,impactAt?{throttle:1}:now<6500?raceAiActions(course,p.vehicleState,p.progress,profile):{throttle:1,steer:-1},now);
  state=s.advance(now);const me=state.players[0];
  if(impactAt===null&&me.barrierContacts){impactAt=now;impactSpeed=raceVehicleSpeedMetersPerSecond(me.vehicleState);assert.equal(state.raceControl.flag,'yellow');}
  else if(impactAt!==null&&now<impactAt+4500){assert.equal(state.raceControl.flag,'yellow');slowest=Math.min(slowest,Math.abs(raceVehicleSpeedMetersPerSecond(me.vehicleState)));}
  if(impactAt!==null&&now>=impactAt+5100)break;
 }
 assert.ok(impactAt!==null,'normal acceleration then a deliberate outer-wall turn must cause a real collision');assert.ok(slowest<10.5&&slowest<impactSpeed+1);assert.equal(state.raceControl.flag,'green');
});
test('disconnect caution and no-passing penalties replay identically through browser and both authority bundles',async()=>{
 const engines=[{createRaceSession,createRaceVehicleProfile},await import('../services/racing/generated/engine.mjs'),createRequire(import.meta.url)('../functions/generated/racing-engine.cjs')],results=[];
 for(const engine of engines){
  const {s,course}=setup(engine,3);s.disconnect('driver',4000);assert.equal(s.snapshot().raceControl.flag,'yellow');let sequence=0,once;
  for(let now=4050;now<=10000;now+=50){drive(s,course,now,sequence++,'three',-1.4);const state=s.advance(now);if(now===8500)once=state.players.find(p=>p.uid==='three').progress.penaltyMs;}
  const state=s.snapshot(),p=state.players.find(p=>p.uid==='three');assert.ok(p.progress.penaltyMs>=5000);assert.equal(p.progress.penaltyMs,once,'one passed rival cannot add a penalty on every subsequent tick');assert.equal(p.ovalPenaltyReason,'passing-under-yellow');assert.equal(state.raceControl.flag,'green');results.push(state);
 }
 assert.deepEqual(results[1],results[0]);assert.deepEqual(results[2],results[0]);
});
test('the apron stays physically driveable at pace; clear and occupied bank merges have different outcomes',()=>{
 for(const otherPace of [10,8]){
  const {s,course}=setup(undefined,2);let sequence=0,sawApron=false,maximumApronSpeed=0,returned=false,mergeAt=null;
  for(let now=4050;now<=10000;now+=50){
   const lane=now<7200?7:1.4;
   drive(s,course,now,sequence,'driver',lane,true);drive(s,course,now,sequence++,'two',1.4,otherPace);
   const state=s.advance(now),me=state.players.find(p=>p.uid==='driver');
   if(me.trackZone==='apron'){sawApron=true;maximumApronSpeed=Math.max(maximumApronSpeed,Math.abs(raceVehicleSpeedMetersPerSecond(me.vehicleState)));}
   if(sawApron&&me.trackZone==='bank')returned=true;
   if(me.ovalPenaltyReason==='unsafe-apron-merge')mergeAt=now;
   assert.equal(me.barrierContacts,0,'the inner apron cannot be replaced with an invisible wall');
  }
  assert.ok(sawApron&&returned);assert.ok(maximumApronSpeed<10.5);
  if(otherPace===8){assert.ok(mergeAt!==null);assert.ok(s.snapshot().players.find(p=>p.uid==='driver').progress.penaltyMs>=5000);}
  else{assert.equal(mergeAt,null);assert.equal(s.snapshot().players.find(p=>p.uid==='driver').progress.penaltyMs,0);}
 }
});
