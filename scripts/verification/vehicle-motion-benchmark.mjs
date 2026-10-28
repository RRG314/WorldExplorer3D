import fs from'node:fs/promises';import path from'node:path';import {pathToFileURL}from'node:url';
import {ROAD_CAR_CONFIG}from'../../app/js/physics/vehicle-config.js';
import {prepareVehicleDriveFrame,stepVehiclePlanarDrive,integrateVehiclePlanarPosition}from'../../app/js/physics/vehicle-planar-dynamics.js';
import {createRaceVehicleProfile}from'../../app/js/racing/vehicle-controller.js';
import {carSpeedToMph,mphToCarSpeed}from'../../app/js/physics/vehicle-speed-units.js';
const dt=1/120;
export function measureVehicleMotion(vehicleId,{grip=1,levels={}}={}){
 const profile=createRaceVehicleProfile(vehicleId,{grip,levels}),car={x:0,y:1.12,z:0,angle:0,speed:0,condition:1,boostReady:true,isAirborne:false};
 function step(actions){const frame=prepareVehicleDriveFrame(car,actions,dt,ROAD_CAR_CONFIG),driving=stepVehiclePlanarDrive(car,dt,frame,{config:ROAD_CAR_CONFIG,planetary:false,metersPerWorldUnit:1,
  surfaceDynamics:profile.surface,vehicleHandling:profile.handling,vehicleCondition:profile.condition,vehicleUpgrades:profile.upgrades,characterVehicle:profile.character,
  maxSpd:Math.min(ROAD_CAR_CONFIG.maxSpd,mphToCarSpeed(profile.handling.topSpeedMph)),friction:ROAD_CAR_CONFIG.friction,accel:ROAD_CAR_CONFIG.accel*profile.handling.accelerationScale});const p=integrateVehiclePlanarPosition(car,dt,driving,1,false);car.x=p.x;car.z=p.z;}
 let time=0,peakAcceleration=0,oneSecondMph=null;
 for(let i=0;i<120*60&&carSpeedToMph(car.speed)<60;i++){const before=car.speed;step({throttle:1});time+=dt;peakAcceleration=Math.max(peakAcceleration,(car.speed-before)*.22352/dt);if(i===119)oneSecondMph=carSpeedToMph(car.speed);}
 const acceleration={zeroTo60Seconds:carSpeedToMph(car.speed)>=60?time:null,oneSecondMph,peakAccelerationMetersPerSecondSquared:peakAcceleration};
 car.speed=mphToCarSpeed(60);car.vFwd=car.speed;car.vLat=0;car.yawRate=0;car.angle=0;const startZ=car.z;time=0;
 while(car.speed>.5&&time<20){step({serviceBrake:1});time+=dt;}
 return {vehicleId,grip,...acceleration,stop60To0Seconds:time,stoppingDistanceMeters:car.z-startZ,finalMph:carSpeedToMph(car.speed)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
const rows=['bmw_e34','delorean','cadillac_fleetwood','pickup','van','city_bus'].flatMap(id=>[measureVehicleMotion(id,{grip:1}),measureVehicleMotion(id,{grip:.7})]);
const out=process.argv[2];if(out){await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify({scope:'Shared controller source simulation; game calibration, no manufacturer or browser performance claim',config:ROAD_CAR_CONFIG,rows},null,2)+'\n');}
console.log(JSON.stringify(rows));
}
