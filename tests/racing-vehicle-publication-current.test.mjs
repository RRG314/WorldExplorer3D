import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createFirestoreRaceStore} from '../services/racing/firestore-store.mjs';
import {createRaceSession,createRaceVehicleProfile,buildRaceRoadGraph,createRaceCourse,raceVehicleWorldPose} from '../services/racing/generated/engine.mjs';
import {VEHICLE_ROOT_TO_GROUND_METERS} from '../app/js/engine/vehicle-catalog.js';

// Exercise the actual transaction commands with an atomic in-memory adapter.
// Live Firestore admission/results have separate evidence; this isolates the
// world-pose handback without replaying a timed race or claiming cloud coverage.
function fixture(){
 const now=1700000000000,stamp=ms=>({toMillis:()=>ms}),rows=new Map();
 const reference=path=>({path,collection:name=>reference(path+'/'+name),doc:name=>reference(path+'/'+name)});
 const db={collection:reference,async runTransaction(operation){const writes=[];
  const value=await operation({get:async ref=>({exists:rows.has(ref.path),data:()=>rows.get(ref.path)}),
   update:(ref,data)=>writes.push([ref.path,data]),set:(ref,data)=>writes.push([ref.path,data])});
  for(const [path,data]of writes)rows.set(path,{...rows.get(path),...data});return value;
 }};
 const course=createRaceCourse(buildRaceRoadGraph([{sourceId:'graded-road',a:{x:0,y:10,z:0},b:{x:0,y:20,z:250},widthMeters:8,driveable:true,supported:true}]),['graded-road:forward'],{locationId:'controlled',locationLabel:'Controlled grade',anchor:{lat:43,lon:7},participants:1});
 const profile=createRaceVehicleProfile('delorean'),session=createRaceSession({id:'race',course,creatorUid:'driver',createdAtMs:now});
 session.add({uid:'driver',profile,label:'Driver'});
 const race={id:'race',roomCode:'OWNED1',worldSeed:'seed',course,roster:new Map([['driver',{vehicleId:'delorean',profile}]]),session};
 const carPath='rooms/OWNED1/urbanEntities/'+createHash('sha256').update('personal:driver:delorean').digest('hex').slice(0,40);
 const initial={x:0,y:11.12,z:3,yaw:.3,pitch:.04,roll:.01};
 rows.set('rooms/OWNED1',{world:{kind:'earth',seed:'seed',lat:43,lon:7}});
 rows.set('rooms/OWNED1/racing/current',{id:'race',instanceId:'instance',expiresAt:stamp(now+15000)});
 rows.set('rooms/OWNED1/players/driver',{uid:'driver',lastSeenAt:stamp(now),expiresAt:stamp(now+90000)});
 rows.set('users/driver/consents/community',{version:'community-2026-10-24'});
 rows.set('users/driver/gameplay/vehicleUpgrades',{raceReservation:{id:'race',instanceId:'instance'}});
 rows.set(carPath,{raceCustody:{id:'race',instanceId:'instance'},pose:initial});
 return {rows,carPath,race,session,initial,now,store:createFirestoreRaceStore({db,loadCourse:async()=>course})};
}
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
