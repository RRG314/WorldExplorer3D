import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
import {prepareVehicleDriveFrame,stepVehiclePlanarDrive,integrateVehiclePlanarPosition}from'../app/js/physics/vehicle-planar-dynamics.js';
import {ROAD_CAR_CONFIG}from'../app/js/physics/vehicle-config.js';
import {mphToCarSpeed}from'../app/js/physics/vehicle-speed-units.js';
import {vehicleConditionDynamics,vehicleHandlingProfile}from'../app/js/engine/vehicle-catalog.js';
import {vehicleUpgradeDynamics}from'../app/js/transport/vehicle-upgrades.js';
const baseline=JSON.parse(fs.readFileSync(new URL('./fixtures/vehicle-planar-baseline.json',import.meta.url)));
for(const item of baseline.cases)test(`shared driving preserves the pre-extraction ${item.definition.id} trajectory`,()=>{
 const d=item.definition,car={x:0,y:1.12,z:0,angle:.2,speed:0,condition:d.condition,boostReady:true,isAirborne:!!d.airborne};
 const environment={config:ROAD_CAR_CONFIG,planetary:d.planetary,planetaryNormalMaxSpd:24,metersPerWorldUnit:1.11,
 vehicleHandling:vehicleHandlingProfile(d.variant),vehicleCondition:vehicleConditionDynamics(d.condition),
 vehicleUpgrades:vehicleUpgradeDynamics({'engine-tune':d.upgrade,'street-brakes':d.upgrade,'all-road-tires':d.upgrade,'reinforced-suspension':d.upgrade}),
 characterVehicle:{accelerationScale:1,brakingScale:1,steeringResponseScale:1,steeringAngleScale:1,recoveryScale:1},surfaceDynamics:{topSpeed:1,rolling:1,accel:1,grip:d.grip,drift:1}};
 for(let part=0;part<item.sequence.length;part++){
  const action=item.sequence[part];for(let i=0;i<action.frames;i++){
   const frame=prepareVehicleDriveFrame(car,action.actions,1/60,ROAD_CAR_CONFIG);
   const setup={...environment,maxSpd:d.planetary?24:Math.min(mphToCarSpeed(environment.vehicleHandling.topSpeedMph),car.boost?ROAD_CAR_CONFIG.boostMax:ROAD_CAR_CONFIG.maxSpd),friction:ROAD_CAR_CONFIG.friction,accel:(car.boost?ROAD_CAR_CONFIG.boostAccel:ROAD_CAR_CONFIG.accel)*environment.vehicleHandling.accelerationScale};
   const driving=stepVehiclePlanarDrive(car,1/60,frame,setup),pose=integrateVehiclePlanarPosition(car,1/60,driving,1.11,d.planetary);car.x=pose.x;car.z=pose.z;
  }
  for(const [key,expected]of Object.entries(item.checkpoints[part]))if(typeof expected==='number')assert.ok(Math.abs(car[key]-expected)<1e-8,`${key}: ${car[key]} vs ${expected}`);else assert.equal(car[key],expected,key);
 }
});
