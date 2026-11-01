import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {createOvalFormatFixture} from './fixtures/oval-format.js';
import {ovalDraftActor,ovalDraftReduction} from '../app/js/racing/oval-rules.js';
import {createRaceVehicleProfile,createRaceVehicleState,stepRaceVehicle,snapshotRaceVehicle,raceVehicleSpeedMetersPerSecond} from '../app/js/racing/vehicle-controller.js';
import {raceGridPose} from '../app/js/racing/course-rules.js';
import {createRaceSession} from '../app/js/racing/session-rules.js';
import {raceAiActions} from '../app/js/racing/ai-controller.js';
import {createNetworkRaceController} from '../app/js/racing/network-controller.js';
import {racePhysicsVersion,raceRecordConfiguration} from '../app/js/racing/record-rules.js';
const profile=createRaceVehicleProfile('bmw_m3_e92_race');
test('a wake requires bumper clearance, shared direction/level and bank lane; multiple leaders cannot compound it',()=>{
 const car={x:0,y:1,z:0,angle:0},me=ovalDraftActor('me',car,profile.handling,'bank',30),leader={...me,uid:'leader',z:12},r=ovalDraftReduction(me,[leader],1);assert.ok(r>.1&&r<.3);assert.equal(ovalDraftReduction(me,[leader,{...leader,uid:'third'}],1),r);
 for(const other of [{...leader,x:3},{...leader,z:2},{...leader,z:50},{...leader,z:-12},{...leader,angle:Math.PI},{...leader,y:4},{...leader,zone:'apron'},{...leader,active:false},{...leader,speedMetersPerSecond:5}])assert.equal(ovalDraftReduction(me,[other],1),0);
 assert.equal(ovalDraftReduction(me,[leader],1,{enabled:false}),0);assert.equal(ovalDraftReduction({...me,zone:'apron'},[leader],1),0);assert.equal(ovalDraftReduction(me,[leader],1.11)>0,true);assert.deepEqual(car,{x:0,y:1,z:0,angle:0});
});
test('drag slows both coasting cars and a wake reduces only that force; ordinary road physics remains exact',()=>{
 const {course}=createOvalFormatFixture(),start=createRaceVehicleState(raceGridPose(course,0),profile);stepRaceVehicle(course,start,{},1/60,profile);start.speed=start.vFwd=40/.22352;
 const exposed=structuredClone(start),drafted=structuredClone(start);for(let i=0;i<30;i++){stepRaceVehicle(course,exposed,{},1/60,profile);stepRaceVehicle(course,drafted,{},1/60,profile,{draftReduction:.25});}
 assert.equal(exposed.barrierContacts,0);assert.equal(drafted.barrierContacts,0);assert.ok(drafted.speed>exposed.speed);assert.ok(drafted.speed<start.speed&&exposed.speed<start.speed,'a wake cannot add energy to a coasting car');
 const ordinary={...course,discipline:'circuit'},a=structuredClone(start),b=structuredClone(start);stepRaceVehicle(ordinary,a,{throttle:1},1/60,profile);stepRaceVehicle(ordinary,b,{throttle:1},1/60,profile,{draftReduction:.25});assert.deepEqual(snapshotRaceVehicle(a),snapshotRaceVehicle(b));
 assert.throws(()=>stepRaceVehicle(course,structuredClone(start),{},1/60,profile,{draftReduction:1}),/invalid_vehicle_aerodynamics/);
});
function setup(engine={createRaceSession,createRaceVehicleProfile}){
 const {course}=createOvalFormatFixture(),s=engine.createRaceSession({id:'drafting',course,creatorUid:'driver',createdAtMs:0});for(const uid of ['driver','two','three','four'])s.add({uid,profile:engine.createRaceVehicleProfile('bmw_m3_e92_race')});for(const uid of ['driver','two','three','four'])s.setReady(uid,true);s.start('driver',0);return {s,course};
}
test('shared session wakes use pre-tick geometry, stop under yellow and replay through both authority bundles',async()=>{
 const engines=[{createRaceSession,createRaceVehicleProfile},await import('../services/racing/generated/engine.mjs'),createRequire(import.meta.url)('../functions/generated/racing-engine.cjs')],results=[];
 for(const engine of engines){const {s,course}=setup(engine);let state=s.snapshot(),strongest=0;
  for(let now=50,sequence=0;now<=9000;now+=50,sequence++){
   if(now>4000)for(const p of state.players)s.control(p.uid,sequence,raceAiActions(course,p.vehicleState,p.progress,profile,{laneOffsetMeters:p.slot%2===0?-1.4:1.4}),now);
   state=s.advance(now);if(now<=4000)assert.ok(state.players.every(p=>p.draftingReduction===0));strongest=Math.max(strongest,...state.players.map(p=>p.draftingReduction));
  }
  assert.ok(strongest>.1);assert.ok(state.players.every(p=>p.barrierContacts===0));s.disconnect('driver',9000);state=s.advance(9050);assert.equal(state.raceControl.flag,'yellow');assert.ok(state.players.every(p=>p.draftingReduction===0));results.push(state);
 }
 assert.deepEqual(results[1],results[0]);assert.deepEqual(results[2],results[0]);
});
test('local network prediction uses the same wake calculation and never sends aerodynamic authority as input',()=>{
 const {course}=createOvalFormatFixture(),p=createRaceVehicleState(raceGridPose(course,2),profile);stepRaceVehicle(course,p,{},1/60,profile);p.speed=p.vFwd=30/.22352;
 const f={x:Math.sin(p.angle),z:Math.cos(p.angle)},leader={...p,x:p.x+f.x*12,z:p.z+f.z*12},configuration=raceRecordConfiguration(profile,{course}),state={id:'prediction',phase:'running',physicsVersion:racePhysicsVersion(course),profiles:{driver:configuration},raceControl:{flag:'green'},players:[{uid:'driver',slot:2,vehicleId:profile.vehicleId,vehicleState:p,trackZone:'bank',progress:{finished:false}},{uid:'two',slot:0,vehicleId:profile.vehicleId,vehicleState:leader,trackZone:'bank',progress:{finished:false}}]},
  writes=[],connection={snapshot:()=>state,connected:()=>true,isFresh:()=>true,control:actions=>writes.push(actions),stop(){}},context={worldPublication:{},car:{personalVehicleId:profile.vehicleId},Walk:{state:{mode:'drive'}},activateSurfaceActivity:()=>true},network=createNetworkRaceController({context,course,connection,uid:'driver'});
 state.players[0].pose={x:p.x,y:0,z:p.z,yaw:p.angle};network.start();const input={throttle:0},snapshot=JSON.stringify(state),actual=network.step(1/60,input),me=ovalDraftActor('driver',p,profile.handling,'bank',30),other=ovalDraftActor('two',leader,profile.handling,'bank',30),expected=structuredClone(p);
 stepRaceVehicle(course,expected,input,1/60,profile,{draftReduction:ovalDraftReduction(me,[other],course.metersPerUnit)});assert.deepEqual(actual,snapshotRaceVehicle(expected));assert.deepEqual(writes,[input]);assert.equal(JSON.stringify(state),snapshot);network.dispose();
});
