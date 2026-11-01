import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
import {prepareVehicleDriveFrame,stepVehiclePlanarDrive,integrateVehiclePlanarPosition}from'../app/js/physics/vehicle-planar-dynamics.js';
import {ROAD_CAR_CONFIG,PLANETARY_ROVER_CONFIG}from'../app/js/physics/vehicle-config.js';
import {mphToCarSpeed}from'../app/js/physics/vehicle-speed-units.js';
import {vehicleConditionDynamics,vehicleHandlingProfile}from'../app/js/engine/vehicle-catalog.js';
import {vehicleUpgradeDynamics}from'../app/js/transport/vehicle-upgrades.js';
const baseline=JSON.parse(fs.readFileSync(new URL('./fixtures/vehicle-planar-baseline.json',import.meta.url)));
function setup(d){
 const config=d.planetary?{...ROAD_CAR_CONFIG,...PLANETARY_ROVER_CONFIG}:ROAD_CAR_CONFIG;
 const car={x:0,y:1.12,z:0,angle:.2,speed:0,condition:d.condition,boostReady:true,isAirborne:!!d.airborne};
 const environment={config,planetary:d.planetary,planetaryNormalMaxSpd:24,metersPerWorldUnit:1.11,
 vehicleHandling:vehicleHandlingProfile(d.variant),vehicleCondition:vehicleConditionDynamics(d.condition),
 vehicleUpgrades:vehicleUpgradeDynamics({'engine-tune':d.upgrade,'street-brakes':d.upgrade,'all-road-tires':d.upgrade,'reinforced-suspension':d.upgrade}),
 characterVehicle:{accelerationScale:1,brakingScale:1,steeringResponseScale:1,steeringAngleScale:1,recoveryScale:1},surfaceDynamics:{topSpeed:1,rolling:1,accel:1,grip:d.grip,drift:1}};
 const step=actions=>{const frame=prepareVehicleDriveFrame(car,actions,1/60,config),setup={...environment,
 maxSpd:d.planetary?24:Math.min(mphToCarSpeed(environment.vehicleHandling.topSpeedMph),car.boost?config.boostMax:config.maxSpd),friction:config.friction,accel:(car.boost?config.boostAccel:config.accel)*environment.vehicleHandling.accelerationScale};
 const driving=stepVehiclePlanarDrive(car,1/60,frame,setup),pose=integrateVehiclePlanarPosition(car,1/60,driving,1.11,d.planetary);car.x=pose.x;car.z=pose.z;};
 return {car,step};
}
for(const item of baseline.cases)test(item.definition.planetary||item.definition.airborne?`calibration preserves the ${item.definition.id} trajectory`:`calibration removes the old acceleration surge in ${item.definition.id}`,()=>{
 const {car,step}=setup(item.definition),preserve=item.definition.planetary||item.definition.airborne;
 for(let part=0;part<item.sequence.length;part++){
  const action=item.sequence[part];for(let i=0;i<action.frames;i++)step(action.actions);
  if(preserve){for(const [key,expected]of Object.entries(item.checkpoints[part]))if(typeof expected==='number')assert.ok(Math.abs(car[key]-expected)<1e-8,`${key}: ${car[key]} vs ${expected}`);else assert.equal(car[key],expected,key);}
  else{for(const key of ['x','z','speed','angle','yawRate','vLat'])assert.ok(Number.isFinite(car[key]),key);if(part===0)assert.ok(car.speed<item.checkpoints[0].speed*.65,'Full throttle must allow time to steer and react');}
 }
});
test('ordinary low-speed parking does not initiate a drift; a deliberate road-speed handbrake can',()=>{
 for(const [mph,expected]of [[10,false],[24,true]]){const {car,step}=setup({variant:'sedan',grip:1,condition:1,upgrade:0,planetary:false});car.speed=mphToCarSpeed(mph);car.vFwd=car.speed;step({steer:1,brake:1});assert.equal(car.isDrifting,expected);}
});
test('automatic gears and RPM affect acceleration, shift without hunting, and follow reverse admission',()=>{
 const {car,step}=setup({variant:'sedan',grip:1,condition:1,upgrade:0,planetary:false});const gears=new Set();let shifts=0,lastGear=1;
 for(let i=0;i<1200;i++){step({throttle:1});gears.add(car.driveGear);if(car.driveGear!==lastGear){assert.ok(car.driveGear>lastGear);shifts++;lastGear=car.driveGear;}assert.ok(car.engineRpm>=800&&car.engineRpm<=car.engineRedlineRpm*1.05);}
 assert.ok(gears.size>=3);assert.ok(shifts<6);
 for(let i=0;i<600;i++)step({reverse:1});assert.equal(car.driveGear,-1);assert.ok(car.speed<0);assert.ok(Math.abs(car.speed)<=mphToCarSpeed(18));
});
