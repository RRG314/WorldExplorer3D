import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createFirestoreRaceStore} from '../services/racing/firestore-store.mjs';
import {createRaceSession,createRaceVehicleProfile,buildRaceRoadGraph,createRaceCourse,raceVehicleWorldPose} from '../services/racing/generated/engine.mjs';
import {VEHICLE_ROOT_TO_GROUND_METERS} from '../app/js/engine/vehicle-catalog.js';
import {createRallyStageFixture} from './fixtures/rally-stage-format.js';

// Exercise the actual transaction commands with an atomic in-memory adapter.
// Live Firestore admission/results have separate evidence; this isolates the
// world-pose handback without replaying a timed race or claiming cloud coverage.
function fixture(courseOverride,vehicleId='delorean'){
 const now=1700000000000,stamp=ms=>({toMillis:()=>ms}),rows=new Map();
 const reference=path=>({path,collection:name=>reference(path+'/'+name),doc:name=>reference(path+'/'+name)});
 const db={collection:reference,async runTransaction(operation){const writes=[];
  const value=await operation({get:async ref=>({exists:rows.has(ref.path),data:()=>rows.get(ref.path)}),
   update:(ref,data)=>writes.push([ref.path,data]),set:(ref,data)=>writes.push([ref.path,data])});
  for(const [path,data]of writes)rows.set(path,{...rows.get(path),...data});return value;
 }};
 const course=courseOverride||createRaceCourse(buildRaceRoadGraph([{sourceId:'graded-road',a:{x:0,y:10,z:0},b:{x:0,y:20,z:250},widthMeters:8,driveable:true,supported:true}]),['graded-road:forward'],{locationId:'controlled',locationLabel:'Controlled grade',anchor:{lat:43,lon:7},participants:1});
 const profile=createRaceVehicleProfile(vehicleId),session=createRaceSession({id:'race',course,creatorUid:'driver',createdAtMs:now});
 session.add({uid:'driver',profile,label:'Driver'});
 const race={id:'race',roomCode:'OWNED1',worldSeed:'seed',course,roster:new Map([['driver',{vehicleId,profile}]]),session};
 const carPath='rooms/OWNED1/urbanEntities/'+createHash('sha256').update('personal:driver:'+vehicleId).digest('hex').slice(0,40);
 const initial={x:0,y:11.12,z:3,yaw:.3,pitch:.04,roll:.01};
 rows.set('rooms/OWNED1',{world:{kind:'earth',seed:'seed',lat:43,lon:7}});
 rows.set('rooms/OWNED1/racing/current',{id:'race',instanceId:'instance',expiresAt:stamp(now+15000)});
 rows.set('rooms/OWNED1/players/driver',{uid:'driver',lastSeenAt:stamp(now),expiresAt:stamp(now+90000)});
 rows.set('users/driver/consents/community',{version:'community-2026-10-24'});
 rows.set('users/driver/gameplay/vehicleUpgrades',{raceReservation:{id:'race',instanceId:'instance'},garage:{schemaVersion:1,revision:0,selectedId:vehicleId,vehicles:{[vehicleId]:{id:vehicleId,condition:1,homeId:'',acquiredAt:0}}}});
 rows.set(carPath,{raceCustody:{id:'race',instanceId:'instance'},pose:initial});
 return {rows,carPath,race,session,initial,now,store:createFirestoreRaceStore({db,loadCourse:async()=>course})};
}
test('rally renew and release persist actual landing damage through the existing garage without healing or repeated revision writes',async()=>{
 const {course}=createRallyStageFixture(),vehicleId='bmw_m3_e92_race',f=fixture(course,vehicleId),progressPath='users/driver/gameplay/vehicleUpgrades',progress=f.rows.get(progressPath);
 f.rows.get('rooms/OWNED1').world={kind:'earth',seed:'seed',...course.anchor};
 progress.garage={schemaVersion:1,revision:7,selectedId:vehicleId,vehicles:{[vehicleId]:{id:vehicleId,condition:1,homeId:'kept-home',acquiredAt:123}}};
 f.session.setReady('driver',true);f.session.start('driver',f.now);
 let sequence=0;for(let ms=50;ms<=20000;ms+=50){f.session.control('driver',sequence++,{throttle:1},f.now+ms);f.session.advance(f.now+ms);
  if(ms%5000===0)await f.store.renew({race:f.race,instanceId:'instance',nowMs:f.now+ms});}
 const player=f.session.snapshot().players[0];assert.ok(player.condition<1);assert.ok(player.vehicleState.landingDamage>0);
 // Renew uses the trusted session frame while holding this exact reservation.
 await f.store.renew({race:f.race,instanceId:'instance',nowMs:f.now+20000});
 const garage=f.rows.get(progressPath).garage;assert.equal(garage.vehicles[vehicleId].condition,player.condition);assert.equal(garage.revision,8);assert.equal(garage.vehicles[vehicleId].homeId,'kept-home');
 assert.equal(f.rows.get(f.carPath).condition,player.condition);
 const admitted=await f.store.admit({race:f.race,uid:'driver',vehicleId,instanceId:'instance',nowMs:f.now+20000,slot:0,reconnect:true});
 assert.equal(admitted.profile,f.race.roster.get('driver').profile,'reconnect retains the original locked setup and existing damaged simulation');
 assert.equal(f.session.snapshot().players[0].condition,player.condition);
 await f.store.releaseParticipant({race:f.race,uid:'driver',instanceId:'instance',nowMs:f.now+20000});
 assert.equal(f.rows.get(progressPath).garage.revision,8);assert.equal(f.rows.get(progressPath).raceReservation,null);assert.equal(f.rows.get(f.carPath).condition,player.condition);
 await f.store.releaseParticipant({race:f.race,uid:'driver',instanceId:'instance',nowMs:f.now+20000});assert.equal(f.rows.get(progressPath).garage.revision,8);
});
test('a replaced rally garage reservation cannot be renewed or receive another authority’s condition writes',async()=>{
 const f=fixture(createRallyStageFixture().course),path='users/driver/gameplay/vehicleUpgrades',progress=f.rows.get(path);
 f.rows.get('rooms/OWNED1').world={kind:'earth',seed:'seed',...f.race.course.anchor};
 progress.raceReservation={id:'replacement',instanceId:'new-owner'};const before=structuredClone(progress),car=f.rows.get(f.carPath);
 await assert.rejects(f.store.renew({race:f.race,instanceId:'instance',nowMs:f.now}),/custody_ended/);
 assert.deepEqual(f.rows.get(path),before);assert.equal(f.rows.get(f.carPath),car);
});
test('a lobby renew/release retains its existing world pose without inventing a ground offset',async()=>{
 const f=fixture();await f.store.renew({race:f.race,instanceId:'instance',nowMs:f.now});
 assert.deepEqual(f.rows.get(f.carPath).pose,f.initial);
 await f.store.releaseParticipant({race:f.race,uid:'driver',instanceId:'instance',nowMs:f.now});
 assert.deepEqual(f.rows.get(f.carPath).pose,f.initial);
 assert.equal(f.rows.get(f.carPath).raceCustody,null);
});
test('running and released room cars use the authoritative chassis root and slope; timing stays at ground',async()=>{
 const f=fixture();f.session.setReady('driver',true);f.session.start('driver',f.now);
 const player=f.session.snapshot().players[0],expected=raceVehicleWorldPose(player),ground=player.pose;
 assert.ok(Math.abs(expected.y-ground.y-VEHICLE_ROOT_TO_GROUND_METERS)<1e-9);
 assert.ok(Math.abs(expected.pitch)>.01,'The graded-road attitude must survive publication');
 await f.store.renew({race:f.race,instanceId:'instance',nowMs:f.now});
 assert.deepEqual(f.rows.get(f.carPath).pose,expected);
 await f.store.releaseParticipant({race:f.race,uid:'driver',instanceId:'instance',nowMs:f.now});
 assert.deepEqual(f.rows.get(f.carPath).pose,expected);
 assert.deepEqual(f.session.snapshot().players[0].pose,ground,'A handback must not change timing coordinates');
 await f.store.releaseParticipant({race:f.race,uid:'driver',instanceId:'instance',nowMs:f.now});
 assert.deepEqual(f.rows.get(f.carPath).pose,expected,'Retry must not add the root offset again');
});
test('an obsolete authority cannot hand back a replacement car, and malformed frames fail closed',async()=>{
 const f=fixture();f.rows.get(f.carPath).raceCustody.instanceId='replacement';
 await f.store.releaseParticipant({race:f.race,uid:'driver',instanceId:'instance',nowMs:f.now});
 assert.equal(f.rows.get(f.carPath).raceCustody.instanceId,'replacement');
 assert.throws(()=>raceVehicleWorldPose({vehicleState:{x:0,y:NaN,z:0,angle:0,terrainPitch:0,terrainRoll:0}}),/race_vehicle_frame_missing/);
});
