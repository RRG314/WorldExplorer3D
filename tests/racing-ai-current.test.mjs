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
