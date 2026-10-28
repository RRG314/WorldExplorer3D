import {prepareVehicleDriveFrame,stepVehiclePlanarDrive,integrateVehiclePlanarPosition}from'../physics/vehicle-planar-dynamics.js';
import {ROAD_CAR_CONFIG}from'../physics/vehicle-config.js';
import {carSpeedToMph,mphToCarSpeed,carSpeedToWorldUnitsPerSecond}from'../physics/vehicle-speed-units.js';
import {VEHICLE_CATALOG,vehicleHandlingProfile,vehicleConditionDynamics,VEHICLE_ROOT_TO_GROUND_METERS}from'../engine/vehicle-catalog.js?v=6';
import {resolveVehicleRoadContactPose}from'../engine/vehicle-road-attitude.js?v=3';
import {vehicleUpgradeDynamics}from'../transport/vehicle-upgrades.js?v=1';
import {personalVehicleById}from'../transport/vehicle-garage-rules.js';
import {projectRacePosition}from'./course-rules.js';

export function createRaceVehicleProfile(vehicleId,{condition=1,levels={},grip=1}={}){
 const definition=personalVehicleById(vehicleId);if(!definition)throw Error('race_vehicle_unknown');
 if(!Number.isFinite(condition)||condition<.3||condition>1)throw Error('race_vehicle_needs_repair');
 const handling=vehicleHandlingProfile(definition.variantId);
 return Object.freeze({vehicleId,variant:VEHICLE_CATALOG.find(v=>v.id===definition.variantId),conditionValue:condition,handling,condition:vehicleConditionDynamics(condition),upgrades:vehicleUpgradeDynamics(levels),
  config:ROAD_CAR_CONFIG,character:Object.freeze({accelerationScale:1,brakingScale:1,steeringResponseScale:1,steeringAngleScale:1,recoveryScale:1}),
  surface:Object.freeze({topSpeed:1,rolling:1,accel:1,grip:Math.max(.55,Math.min(1,Number(grip)||1)),drift:1})});
}
export function createRaceVehicleState(pose,profile){
 return {x:pose.x,y:pose.y+VEHICLE_ROOT_TO_GROUND_METERS,z:pose.z,angle:pose.yaw,speed:0,vFwd:0,vLat:0,yawRate:0,
  condition:profile.conditionValue,boostReady:false,vehicleVariantId:personalVehicleById(profile.vehicleId).variantId,isAirborne:false,barrierContacts:0};
}

// Same acceleration, steering, slip and world-unit integration as free roam.
// A closed race has surveyed pavement boundaries and ghost competitors. Its
// session owner supplies dt and applies this state to its owned actor only.
export function stepRaceVehicle(course,car,actions,dt,profile){
 if(!(dt>0&&dt<=1/30))throw Error('invalid_race_physics_step');
 const frame=prepareVehicleDriveFrame(car,{...actions,boost:0},dt,profile.config);
 const driving=stepVehiclePlanarDrive(car,dt,frame,{config:profile.config,planetary:false,metersPerWorldUnit:course.metersPerUnit,
  surfaceDynamics:profile.surface,vehicleHandling:profile.handling,vehicleCondition:profile.condition,vehicleUpgrades:profile.upgrades,
  characterVehicle:profile.character,maxSpd:Math.min(profile.config.maxSpd,mphToCarSpeed(profile.handling.topSpeedMph)),
  friction:profile.config.friction,accel:profile.config.accel*profile.handling.accelerationScale});
 car.steerAngle=driving.steerAngle;
 const next=integrateVehiclePlanarPosition(car,dt,driving,course.metersPerUnit,false);
 const support=projectRacePosition(course,{...next,y:car.y-VEHICLE_ROOT_TO_GROUND_METERS});
 if(!support)throw Error('race_surface_lost');
 const margin=Math.max(.3,(support.widthMeters-profile.handling.width)*.5-.2);
 let x=next.x,z=next.z;
 if(support.error>margin){
  const distance=Math.hypot(x-support.x,z-support.z),scale=margin/Math.max(.001,distance*course.metersPerUnit);
  x=support.x+(x-support.x)*scale;z=support.z+(z-support.z)*scale;
  car.speed*=.35;car.vFwd*=.35;car.vLat*=.2;car.barrierContacts++;
 }
 const segment=course.segments[support.index];
 const contact=resolveVehicleRoadContactPose({x,z,y:support.y,yaw:car.angle,variant:profile.variant,
  pitch:car.terrainPitch||0,roll:car.terrainRoll||0,
  sampleSurface:(px,pz)=>projectRacePosition(course,{x:px,z:pz,y:support.y},{minimumMeters:Math.max(0,segment.startMeters-12),maximumMeters:Math.min(course.lengthMeters,segment.startMeters+segment.lengthMeters+12)})?.y});
 car.x=x;car.z=z;car.y=contact.y+VEHICLE_ROOT_TO_GROUND_METERS;
 car.terrainPitch=contact.pitch;car.terrainRoll=contact.roll;
 car.maximumWheelPenetration=contact.maximumWheelPenetration;car.maximumWheelGap=contact.maximumWheelGap;
 return driving;
}
export function raceVehicleSpeedMetersPerSecond(car){return carSpeedToMph(car.speed)*.44704;}
export function raceVehicleGroundPose(car){return {x:car.x,y:car.y-VEHICLE_ROOT_TO_GROUND_METERS,z:car.z,yaw:car.angle};}
export function raceVehicleWheelDistance(car,dt){return carSpeedToWorldUnitsPerSecond(car.speed,1)*dt;}
