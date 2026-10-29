import test from 'node:test';import assert from 'node:assert/strict';
import {createPracticeRaceController,canOwnRoadRace} from '../app/js/racing/road-activity-controller.js';
import {advanceRoadRaceFrame} from '../app/js/physics/road-race-delegate.js';
import {buildRaceRoadGraph,createRaceCourse} from '../app/js/racing/course-rules.js';
import {createRaceVehicleProfile} from '../app/js/racing/vehicle-controller.js';
import {raceDistrictFingerprint,raceCourseReference,restoreRaceCourse} from '../app/js/racing/course-library.js';
function setup(){const roads=[{sourceId:'mapped',a:{x:0,y:3,z:0},b:{x:0,y:3,z:300},widthMeters:9,driveable:true,supported:true}];
 const graph=buildRaceRoadGraph(roads),course=createRaceCourse(graph,['mapped:forward'],{locationId:'test',locationLabel:'Test',anchor:{lat:43,lon:7},participants:1});
 const c={worldPublication:{requestId:'one'},car:{x:1,y:4.2,z:2,personalVehicleId:'bmw_e34'},Walk:{state:{mode:'drive'}},activateSurfaceActivity(mode,pose){this.car={...this.car,x:pose.x,y:pose.y+1.2,z:pose.z,angle:pose.yaw};return true;}};
 return {c,course,roads,graph,profile:createRaceVehicleProfile('bmw_e34')};}
test('the existing physics frame exclusively consumes practice controls from grid to finish',()=>{
 const h=setup();let complete;const controller=createPracticeRaceController({context:h.c,course:h.course,profile:h.profile,onComplete:s=>complete=s});
 h.c.roadRaceController=controller;controller.start();const grid=h.c.car.z;
 for(let i=0;i<180;i++)assert.equal(advanceRoadRaceFrame(h.c,1/60,{throttle:1}),true);
 assert.equal(h.c.car.z,grid,'countdown cannot launch early');
 for(let i=0;i<3000&&!complete;i++)advanceRoadRaceFrame(h.c,1/60,{throttle:1});
 assert.equal(complete.phase,'complete');assert.ok(complete.players[0].progress.finished);assert.ok(h.c.car.z>290);
 assert.ok(h.c.car.engineRpm>0);controller.dispose();
});
test('world replacement and every incompatible controller reject road ownership before a pose write',()=>{
 for(const state of [{getLiveGpsSnapshot:()=>({active:true})},{boatMode:{active:true},boatDeck:{active:true}},{boatMode:{active:true}},{planeMode:{active:true}},{spaceFlight:{active:true}},
  {oceanMode:{active:true}},{onMoon:true},{activePlanetaryBodyId:'mars'},{Walk:{state:{mode:'walk'}},activeInterior:{id:'room'}}]){
  const h=setup();Object.assign(h.c,state);assert.equal(canOwnRoadRace(h.c),false);const before={...h.c.car};
  const run=createPracticeRaceController({context:h.c,course:h.course,profile:h.profile});assert.throws(()=>run.start(),/changed/);assert.deepEqual(h.c.car,before);run.dispose();
 }
 const h=setup(),run=createPracticeRaceController({context:h.c,course:h.course,profile:h.profile});run.start();h.c.roadRaceController=run;
 const car={...h.c.car};h.c.worldPublication={requestId:'two'};assert.equal(advanceRoadRaceFrame(h.c,1/60,{throttle:1}),false);assert.deepEqual(h.c.car,car);assert.equal(run.snapshot().phase,'cancelled');
});
test('saved course references round-trip only against the same qualified road facts',async()=>{
 const h=setup(),district={roads:h.roads,locationId:'test',locationLabel:'Test',anchor:h.course.anchor,metersPerUnit:h.course.metersPerUnit};
 const fingerprint=await raceDistrictFingerprint(district),reference=raceCourseReference(h.course,fingerprint);
 assert.deepEqual(restoreRaceCourse(reference,district,h.graph,fingerprint),h.course);
 district.roads[0].b.y=8;const changed=await raceDistrictFingerprint(district);assert.notEqual(changed,fingerprint);
 assert.throws(()=>restoreRaceCourse(reference,district,h.graph,changed),/requalify/);
});
test('a rejected oversized race actor releases its preparation scope',async()=>{
 const {getLifecycleRegistrySnapshot}=await import('../app/js/runtime/lifecycle-scope.js?v=2');
 const before=getLifecycleRegistrySnapshot().activeScopeCount,h=setup();
 assert.throws(()=>createPracticeRaceController({context:h.c,course:h.course,profile:createRaceVehicleProfile('city_bus')}),/envelope/);
 assert.equal(getLifecycleRegistrySnapshot().activeScopeCount,before);
});
test('race handoff carries input smoothing and drift state, and initializes graded wheel contact before countdown',()=>{
 const h=setup();h.course.segments[0].b.y=20;h.course.points[1].y=20;h.course.gates.forEach(g=>g.y=3+17*g.distanceMeters/h.course.lengthMeters);
 h.c.car._driveDirection=-1;h.c.car.throttleSm=1;h.c.car.isDrifting=true;h.c.car.boost=true;
 const run=createPracticeRaceController({context:h.c,course:h.course,profile:h.profile});h.c.roadRaceController=run;run.start();
 const initial=run.snapshot().players[0].vehicleState;assert.ok(Math.abs(initial.terrainPitch)>.01);assert.ok(initial.engineRpm>=800);
 advanceRoadRaceFrame(h.c,1/60,{});assert.equal(h.c.car._driveDirection,1);assert.equal(h.c.car.throttleSm,0);assert.equal(h.c.car.isDrifting,false);assert.equal(h.c.car.boost,false);
 run.dispose();
});
