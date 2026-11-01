import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {roadPlaneForces,roadPlaneHorizontalVelocity,BANKED_ROAD_MAXIMUM_ROLL,BANKED_ROAD_MODEL}from'../app/js/physics/road-plane-dynamics.js';
import {prepareVehicleDriveFrame,stepVehiclePlanarDrive,integrateVehiclePlanarPosition}from'../app/js/physics/vehicle-planar-dynamics.js';
import {ROAD_CAR_CONFIG,PLANETARY_ROVER_CONFIG}from'../app/js/physics/vehicle-config.js';
import {vehicleConditionDynamics,vehicleHandlingProfile}from'../app/js/engine/vehicle-catalog.js';
import {vehicleUpgradeDynamics}from'../app/js/transport/vehicle-upgrades.js';
import {resolveVehicleRoadContactPose}from'../app/js/engine/vehicle-road-attitude.js';
import {buildRaceRoadGraph,createRaceCourse}from'../app/js/racing/course-rules.js';
import {createRaceVehicleProfile,createRaceVehicleState,stepRaceVehicle}from'../app/js/racing/vehicle-controller.js';
const close=(actual,expected,tolerance=1e-9)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} vs ${expected}`);
function setup(d={}){
 const config=d.planetary?{...ROAD_CAR_CONFIG,...PLANETARY_ROVER_CONFIG}:ROAD_CAR_CONFIG,handling=vehicleHandlingProfile(d.variant||'sedan');
 const car={x:0,y:1.12,z:0,angle:.2,speed:0,condition:d.condition??1,boostReady:false,isAirborne:false,terrainPitch:.3,terrainRoll:.4};
 const env={config,planetary:!!d.planetary,metersPerWorldUnit:1.11,vehicleHandling:handling,vehicleCondition:vehicleConditionDynamics(d.condition??1),vehicleUpgrades:vehicleUpgradeDynamics({}),characterVehicle:{accelerationScale:1,brakingScale:1,steeringResponseScale:1,steeringAngleScale:1,recoveryScale:1},surfaceDynamics:{topSpeed:1,rolling:1,accel:1,grip:d.grip??1,drift:1},maxSpd:d.planetary?24:Math.min(config.maxSpd,handling.topSpeedMph*2),friction:config.friction,accel:config.accel*handling.accelerationScale,...(d.roadPlane?{roadPlane:d.roadPlane}:{})};
 const step=actions=>{const frame=prepareVehicleDriveFrame(car,actions,1/60,config),driving=stepVehiclePlanarDrive(car,1/60,frame,env),pose=integrateVehiclePlanarPosition(car,1/60,driving,1.11,!!d.planetary);car.x=pose.x;car.z=pose.z;return driving;};return{car,step};
}
test('ordinary road, wet damaged M3 and planetary driving retain the calibrated numeric trajectories without explicit banking admission',()=>{
 const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/road-plane-legacy-trajectories.json',import.meta.url)));
 // Mac and Linux transcendental functions can differ in the last few bits.
 // Keep the frozen trajectory with a 64-epsilon relative bound.
 for(const row of fixture.cases){const {car,step}=setup(row.config);for(const [index,stage]of row.sequence.entries()){for(let i=0;i<stage.frames;i++)step(stage.actions);for(const [key,value]of Object.entries(row.checkpoints[index])){
  if(typeof value==='number')assert.ok(Number.isFinite(car[key])&&Math.abs(car[key]-value)<=64*Number.EPSILON*Math.max(1,Math.abs(value)),`${row.config.id}:${key}: ${car[key]} vs ${value}`);
  else assert.equal(car[key],value,row.config.id+':'+key);
 }}}
});
test('banked normal force and friction reserve match the frictionless design speed in both directions',()=>{
 for(const roll of [-.58,.58])for(const sign of [-1,1]){
  const speed=30*sign,yaw=-9.81*Math.tan(roll)/speed,f=roadPlaneForces({pitch:0,roll,forwardSpeedMetersPerSecond:speed,yawRate:yaw,tyreGrip:.9});
  close(f.normalAcceleration,9.81/Math.cos(roll));close(f.lateralDemand,0);close(f.lateralResidualAcceleration,0);close(f.longitudinalTractionAcceleration,.9*9.81/Math.cos(roll));
  assert.ok(yaw>=f.minimumYawRate&&yaw<=f.maximumYawRate);
 }
});
test('banking gives signed cornering capacity, reserves traction for grade braking and slides when static tyre grip is insufficient',()=>{
 const base={pitch:0,roll:.58,forwardSpeedMetersPerSecond:30,yawRate:0,tyreGrip:.9},f=roadPlaneForces(base);
 assert.ok(Math.abs(f.minimumYawRate)>f.maximumYawRate);assert.ok(f.longitudinalTractionAcceleration<f.tractionAcceleration);close(f.lateralResidualAcceleration,0);
 const wet=roadPlaneForces({...base,forwardSpeedMetersPerSecond:0,roll:BANKED_ROAD_MAXIMUM_ROLL,tyreGrip:.55});assert.ok(wet.lateralResidualAcceleration< -1);assert.equal(wet.lateralGripReserve,0);
 for(const pitch of [-.12,.12]){const {car,step}=setup({roadPlane:{pitch,roll:.3}});for(let i=0;i<120;i++)step({serviceBrake:1});assert.equal(car.speed,0);close(car.vLat,0);}
 const stopped=setup({grip:.55,roadPlane:{pitch:0,roll:BANKED_ROAD_MAXIMUM_ROLL}});for(let i=0;i<60;i++)stopped.step({serviceBrake:1});assert.ok(stopped.car.vLat< -2,'A stopped wet car must slide downhill rather than receive free lateral holding force');
});
test('banked integration follows the pitched and rolled contact plane in SI coordinates',()=>{
 const p=.13,r=-.58,v=roadPlaneHorizontalVelocity(20,3,{pitch:p,roll:r});close(v.right,3*Math.cos(r));close(v.forward,20*Math.cos(p)+3*Math.sin(p)*Math.sin(r));
 const grade=-Math.tan(p),crossfall=Math.tan(r)/Math.cos(p);close(grade*v.forward+crossfall*v.right,-20*Math.sin(p)+3*Math.cos(p)*Math.sin(r));
});
test('four-wheel support reaches the admitted high-bank envelope at arbitrary headings without clamping honest contact residuals',()=>{
 for(const yaw of [0,.8,Math.PI])for(const bank of [-.7,.7]){
  const x=12,z=-5,normal={x:Math.cos(yaw),z:-Math.sin(yaw)},forward={x:Math.sin(yaw),z:Math.cos(yaw)},surface=(px,pz)=>10+bank*((px-x)*normal.x+(pz-z)*normal.z)+.12*((px-x)*forward.x+(pz-z)*forward.z);
  const pose=resolveVehicleRoadContactPose({x,z,y:10,yaw,maximumRoll:BANKED_ROAD_MAXIMUM_ROLL,sampleSurface:surface});assert.equal(pose.sampledWheelContacts,4);assert.ok(pose.maximumWheelGap<1e-6);assert.ok(pose.maximumWheelPenetration<1e-6);assert.ok(Math.abs(pose.roll)>.55);
 }
 const legacy=resolveVehicleRoadContactPose({maximumRoll:undefined,sampleSurface:x=>.7*x});assert.ok(legacy.maximumWheelGap>.01,'The optional banking envelope must not silently change every ordinary vehicle');
});
test('the existing race controller uses banking only for an explicitly admitted course and keeps native four-wheel support while driving',()=>{
 const profile=createRaceVehicleProfile('bmw_m3_e46'),graph=buildRaceRoadGraph([{sourceId:'controlled-bank',a:{x:0,y:10,z:0},b:{x:0,y:10,z:1000},widthMeters:12,driveable:true,supported:true}]);
 const course=structuredClone(createRaceCourse(graph,[graph.edges[0].id],{participants:1,locationId:'controlled',locationLabel:'Controlled bank',anchor:{lat:50,lon:7}})),bank=Math.tan(33*Math.PI/180);course.surfaceModel=BANKED_ROAD_MODEL;
 // Controlled component geometry, not world qualification or published content.
 course.segments[0].heightSamples=[{t:0,y:10,leftY:10-bank*1.2,rightY:10+bank*1.2},{t:1,y:10,leftY:10-bank*1.2,rightY:10+bank*1.2}];course.segments[0].heightSampleSpanMeters=1.2;
 const car=createRaceVehicleState({x:0,y:10,z:10,yaw:0},profile);for(let i=0;i<240;i++)stepRaceVehicle(course,car,{throttle:1},1/60,profile);
 assert.ok(car.speed>60);assert.ok(car.terrainRoll>.55);assert.ok(car.maximumWheelGap<1e-5);assert.equal(car.barrierContacts,0);assert.ok(Number.isFinite(car.x)&&Number.isFinite(car.z));
});

test('unsupported banking inputs and unqualified steep road facts still fail closed',()=>{
 const input={pitch:0,roll:0,forwardSpeedMetersPerSecond:20,yawRate:0,tyreGrip:.9};
 for(const changed of [{roll:.7},{pitch:.6},{forwardSpeedMetersPerSecond:NaN},{tyreGrip:1.5}])assert.throws(()=>roadPlaneForces({...input,...changed}),/invalid_road_plane/);
 assert.throws(()=>buildRaceRoadGraph([{sourceId:'not-qualified',a:{x:0,y:0,z:0},b:{x:0,y:0,z:300},widthMeters:12,driveable:true,supported:true,heightSampleSpanMeters:1.2,heightSamples:[{t:0,y:0,leftY:-.3,rightY:.3},{t:1,y:0,leftY:-.3,rightY:.3}]}]),/invalid_race_road_heights/);
});
