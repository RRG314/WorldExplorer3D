import test from'node:test';import assert from'node:assert/strict';
import {buildRaceRoadGraph,createRaceCourse,raceGridPose,createRaceProgress,advanceRaceProgress}from'../app/js/racing/course-rules.js';
import {createRaceVehicleProfile,createRaceVehicleState,stepRaceVehicle,raceVehicleGroundPose}from'../app/js/racing/vehicle-controller.js';
import {raceAiActions}from'../app/js/racing/ai-controller.js';
function course(discipline){const points=[{x:0,y:0,z:0},{x:0,y:0,z:120},{x:120,y:0,z:120},{x:120,y:0,z:0},{x:0,y:0,z:0}],roads=points.slice(1).map((b,i)=>({sourceId:String(i),a:points[i],b,widthMeters:9,driveable:true,supported:true}));const graph=buildRaceRoadGraph(roads);return createRaceCourse(graph,(discipline==='circuit'?roads:roads.slice(0,3)).map(r=>r.sourceId+':forward'),{discipline,laps:2,locationId:'test',anchor:{lat:43,lon:7},participants:1});}
for(const [vehicleId,discipline,grip]of [['bmw_e34','sprint',1],['pickup','circuit',.75]])test(`controller-driven ${vehicleId} finishes ${discipline} using shared vehicle physics`,()=>{
 const route=course(discipline),profile=createRaceVehicleProfile(vehicleId,{grip}),car=createRaceVehicleState(raceGridPose(route),profile);let progress=createRaceProgress(raceVehicleGroundPose(car),0),maximumSteer=0,brakeFrames=0;
 for(let frame=1;frame<=18000&&!progress.finished;frame++){
  const actions=raceAiActions(route,car,progress,profile);maximumSteer=Math.max(maximumSteer,Math.abs(actions.steer));if(actions.serviceBrake>.1)brakeFrames++;
  const before={x:car.x,z:car.z};stepRaceVehicle(route,car,actions,1/60,profile);
  assert.ok(Math.hypot(car.x-before.x,car.z-before.z)<1.5,'AI cannot teleport along the route');
  progress=advanceRaceProgress(route,progress,raceVehicleGroundPose(car),frame*1000/60,{startedAtMs:0});
 }
 assert.equal(progress.finished,true,JSON.stringify({car,progress}));assert.ok(maximumSteer>.2);assert.ok(brakeFrames>0);console.log(JSON.stringify({vehicleId,discipline,elapsedMs:progress.elapsedMs,barrierContacts:car.barrierContacts,maximumSteer,brakeFrames}));assert.ok(car.barrierContacts<3,"A rival must negotiate these clear corners without grinding along barriers");assert.ok(progress.elapsedMs>10000);assert.equal(progress.lapTimes.length,route.laps);
});
test('a rival follows the road between widely spaced timing gates on a changing grade',()=>{
 const points=[{x:0,y:0,z:0},{x:0,y:0,z:150},{x:100,y:6,z:200},{x:140,y:12,z:280},{x:80,y:15,z:350}];
 const roads=points.slice(1).map((b,i)=>({sourceId:'hill-'+i,a:points[i],b,widthMeters:9,driveable:true,supported:true}));
 const route=createRaceCourse(buildRaceRoadGraph(roads,{metersPerUnit:1}),roads.map(r=>r.sourceId+':forward'),{locationId:'hill',anchor:{lat:43,lon:7},participants:1});
 route.gates=route.gates.filter((gate,i)=>i<5||gate.distanceMeters>=350);
 const profile=createRaceVehicleProfile('golf_ii'),car=createRaceVehicleState(raceGridPose(route),profile);let progress=createRaceProgress(raceVehicleGroundPose(car),0);
 for(let frame=1;frame<12000&&!progress.finished;frame++){
  stepRaceVehicle(route,car,raceAiActions(route,car,progress,profile),1/60,profile);
  progress=advanceRaceProgress(route,progress,raceVehicleGroundPose(car),frame*1000/60,{startedAtMs:0});
 }
 assert.equal(progress.finished,true);assert.equal(car.barrierContacts,0);assert.ok(car.y>15);
});
