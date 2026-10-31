import test from 'node:test';
import assert from 'node:assert/strict';
import {applyRaceBarrierImpact,createRaceVehicleProfile,createRaceVehicleState,stepRaceVehicle} from '../app/js/racing/vehicle-controller.js';
import {buildRaceRoadGraph,createRaceCourse,raceGridPose} from '../app/js/racing/course-rules.js';
import {raceCourseKey,raceCourseReference,restoreRaceCourse,raceDistrictFingerprint} from '../app/js/racing/course-library.js';
import {racePhysicsVersion,isCurrentRacePhysicsVersion} from '../app/js/racing/record-rules.js';
const facts={locationId:'contact',locationLabel:'Contact',anchor:{lat:43,lon:7},metersPerUnit:1,roads:[{sourceId:'straight',a:{x:0,y:0,z:0},b:{x:0,y:0,z:500},widthMeters:12,structure:'surface',driveable:true,supported:true}]};
const graph=buildRaceRoadGraph(facts.roads,{metersPerUnit:1}),course=createRaceCourse(graph,['straight:forward'],{...facts,participants:1});
test('parking, glancing, hard and outgoing contact use impact energy; velocity stays coherent',()=>{
 const p=createRaceVehicleProfile('bmw_m3_e92_race');
 const impact=(x,z)=>{const car={...createRaceVehicleState(raceGridPose(course,0),p),vx:x,vz:z};applyRaceBarrierImpact(course,car,p,{x:1,z:0});return car;};
 assert.equal(impact(1,0).condition,1);assert.equal(impact(-30,0).condition,1);
 const glance=impact(4,35),hard=impact(30,0);assert.ok(glance.condition>hard.condition);assert.ok(hard.condition<.5);assert.ok(glance.vz>hard.vz);
 assert.ok(hard.vx<0);assert.ok(hard.collisionDamage>0);assert.equal(hard.collisionImpactMps,30);
 const old=structuredClone(course);delete old.eventRules;const legacy=impact(30,0);legacy.condition=1;applyRaceBarrierImpact(old,legacy,p,{x:1,z:0});assert.equal(legacy.condition,1);
});
test('ordinary contact changes live performance and disabled condition cannot accelerate',()=>{
 const profile=createRaceVehicleProfile('bmw_e34'),fresh=createRaceVehicleState(raceGridPose(course,0),profile),damaged={...fresh,condition:.3},disabled={...fresh,condition:0};
 for(let i=0;i<90;i++)for(const car of [fresh,damaged,disabled])stepRaceVehicle(course,car,{throttle:1},1/30,profile);
 assert.ok(fresh.speed>damaged.speed);assert.equal(disabled.speed,0);assert.equal(fresh.condition,1);assert.equal(fresh.barrierContacts,0);
});
test('new contact classes have distinct course/record identities; old references restore unchanged',async()=>{
 const fp=await raceDistrictFingerprint(facts),old=createRaceCourse(graph,['straight:forward'],{...facts,eventRules:null}),reference=raceCourseReference(old,fp);
 assert.equal(restoreRaceCourse(reference,facts,graph,fp).eventRules,undefined);
 assert.notEqual(await raceCourseKey(old),await raceCourseKey(course));assert.notEqual(racePhysicsVersion(old),racePhysicsVersion(course));assert.ok(isCurrentRacePhysicsVersion(racePhysicsVersion(course)));
 assert.deepEqual(restoreRaceCourse(raceCourseReference(course,fp),facts,graph,fp).eventRules,course.eventRules);
});
