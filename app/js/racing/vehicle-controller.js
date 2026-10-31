import {BANKED_ROAD_MODEL,BANKED_ROAD_MAXIMUM_ROLL}from'../physics/road-plane-dynamics.js';
import {prepareVehicleDriveFrame,stepVehiclePlanarDrive,integrateVehiclePlanarPosition}from'../physics/vehicle-planar-dynamics.js';
import {ROAD_CAR_CONFIG}from'../physics/vehicle-config.js?v=1';
import {carSpeedToMph,mphToCarSpeed,carSpeedToWorldUnitsPerSecond}from'../physics/vehicle-speed-units.js';
import {VEHICLE_CATALOG,vehicleHandlingProfile,vehicleConditionDynamics,VEHICLE_ROOT_TO_GROUND_METERS}from'../engine/vehicle-catalog.js?v=6';
import {resolveVehicleRoadContactPose,measureVehicleRoadWheelClearance}from'../engine/vehicle-road-attitude.js?v=3';
import {vehicleUpgradeDynamics}from'../transport/vehicle-upgrades.js?v=1';
import {personalVehicleById,normalizeVehicleGarage,prepareVehicleGarageChange}from'../transport/vehicle-garage-rules.js';
import {projectRacePosition}from'./course-rules.js';
import {OVAL_AERODYNAMIC_DRAG_PER_METER} from './oval-rules.js';
import {updateRoadVehicleVerticalState} from '../physics/road-vehicle-airborne.js?v=1';
import {applyTransportDamage} from '../transport/damage-model.js?v=1';
import {rallySurfaceDynamics} from './rally-rules.js';

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
  condition:profile.conditionValue,boostReady:false,vehicleVariantId:personalVehicleById(profile.vehicleId).variantId,isAirborne:false,vy:0,_terrainAirTimer:0,
  raceSupportY:pose.y,raceSupportPitch:0,raceSupportDistanceMeters:0,landingImpactMps:0,landingDamage:0,barrierContacts:0};
}

// Same acceleration, steering, slip and world-unit integration as free roam.
// A closed race has surveyed pavement boundaries and ghost competitors. Its
// session owner supplies dt and applies this state to its owned actor only.
export function stepRaceVehicle(course,car,actions,dt,profile,{draftReduction=0}={}){
 if(!(dt>0&&dt<=1/30))throw Error('invalid_race_physics_step');
 const rally=course.discipline==='rally',supportOptions=rally?{minimumMeters:Math.max(0,car.raceSupportDistanceMeters-12),
  maximumMeters:Math.min(course.lengthMeters,car.raceSupportDistanceMeters+12),flight:car.isAirborne===true}:{};
 const previousSupport=rally?projectRacePosition(course,raceVehicleGroundPose(car),supportOptions):null;
 if(rally&&!previousSupport)throw Error('race_surface_lost');
 const surface=rally?rallySurfaceDynamics(course,previousSupport.index,profile.surface):profile.surface;
 const frame=prepareVehicleDriveFrame(car,{...actions,boost:0},dt,profile.config);
 const driving=stepVehiclePlanarDrive(car,dt,frame,{config:profile.config,planetary:false,metersPerWorldUnit:course.metersPerUnit,
  ...(course.surfaceModel===BANKED_ROAD_MODEL||rally?{roadPlane:{pitch:car.terrainPitch||0,roll:car.terrainRoll||0}}:{}),
  ...(course.discipline==='oval'||course.ovalAerodynamics===true?{aerodynamicDrag:{coefficientPerMeter:OVAL_AERODYNAMIC_DRAG_PER_METER*Math.max(.5,Math.min(1.8,profile.handling.width*profile.handling.height/2.7)),reduction:draftReduction}}:{}),
  surfaceDynamics:surface,vehicleHandling:profile.handling,vehicleCondition:rally?vehicleConditionDynamics(car.condition):profile.condition,vehicleUpgrades:profile.upgrades,
  characterVehicle:profile.character,maxSpd:Math.min(profile.config.maxSpd,mphToCarSpeed(profile.handling.topSpeedMph)),
  friction:profile.config.friction,accel:profile.config.accel*profile.handling.accelerationScale});
 car.steerAngle=driving.steerAngle;
 const next=integrateVehiclePlanarPosition(car,dt,driving,course.metersPerUnit,false);
 const supportPose={...next,y:car.y-VEHICLE_ROOT_TO_GROUND_METERS},support=course.fullRoadContactProjection?
  projectRacePosition(course,supportPose,{...supportOptions,pavementPaddingMeters:profile.handling.width*.5+.2})||projectRacePosition(course,supportPose,supportOptions):projectRacePosition(course,supportPose,supportOptions);
 if(!support)throw Error('race_surface_lost');
 const margin=Math.max(.3,(support.widthMeters-profile.handling.width)*.5-.2);
 let x=next.x,z=next.z;
 if(support.pavement){
  const padding=profile.handling.width*.5+.2,minimum=support.pavement.minimumMeters+padding,maximum=support.pavement.maximumMeters-padding;
  if(minimum>maximum)throw Error('race_vehicle_pavement_too_narrow');
  const lateral=Math.max(minimum,Math.min(maximum,support.lateralMeters));
  if(lateral!==support.lateralMeters){const f=course.segments[support.index].forward,correction=(lateral-support.lateralMeters)/course.metersPerUnit;x+=f.z*correction;z-=f.x*correction;car.speed*=.35;car.vFwd*=.35;car.vLat*=.2;car.barrierContacts++;}
 }else if(support.error>margin){
  const distance=Math.hypot(x-support.x,z-support.z),scale=margin/Math.max(.001,distance*course.metersPerUnit);
  x=support.x+(x-support.x)*scale;z=support.z+(z-support.z)*scale;
  car.speed*=.35;car.vFwd*=.35;car.vLat*=.2;car.barrierContacts++;
 }
 const segment=course.segments[support.index];
 const sampleSurface=(px,pz)=>projectRacePosition(course,{x:px,z:pz,y:support.y},course.fullRoadContactProjection?{pavementPaddingMeters:0}:{minimumMeters:Math.max(0,segment.startMeters-12),maximumMeters:Math.min(course.lengthMeters,segment.startMeters+segment.lengthMeters+12)})?.y;
 const contact=resolveVehicleRoadContactPose({...(course.surfaceModel===BANKED_ROAD_MODEL?{maximumRoll:BANKED_ROAD_MAXIMUM_ROLL}:{}),x,z,y:support.y,yaw:car.angle,variant:profile.variant,
  pitch:car.terrainPitch||0,roll:car.terrainRoll||0,sampleSurface});
 car.x=x;car.z=z;
 if(rally){
  if(contact.sampledWheelContacts!==4)throw Error('race_surface_lost');
  const verticalInput={bodyY:car.y,groundedBodyY:contact.y+VEHICLE_ROOT_TO_GROUND_METERS,bodyOffset:VEHICLE_ROOT_TO_GROUND_METERS,
   supportY:contact.y,previousSupportY:car.raceSupportY,previousPitch:car.raceSupportPitch,surfacePitch:contact.pitch,
   verticalVelocity:car.vy,isAirborne:car.isAirborne,airborneTime:car._terrainAirTimer,
   horizontalSpeedMps:Math.hypot(car.vx,car.vz)*course.metersPerUnit,metersPerWorldUnit:course.metersPerUnit,suspensionResistance:profile.upgrades.suspensionResistance,dt};
  let vertical=updateRoadVehicleVerticalState(verticalInput);
  const clearanceAt=state=>measureVehicleRoadWheelClearance({x,z,y:state.y-VEHICLE_ROOT_TO_GROUND_METERS,yaw:car.angle,pitch:state.pitch,
   roll:state.isAirborne?car.terrainRoll||0:contact.roll,variant:profile.variant,sampleSurface});
  let clearance=clearanceAt(vertical);if(clearance.sampledWheelContacts!==4)throw Error('race_surface_lost');
  if(vertical.isAirborne&&clearance.maximumWheelPenetration>1e-7&&vertical.airborneTime<.1){
   // During the existing short takeoff window a rear wheel can still meet
   // the crest. Enforce that known contact while preserving launch velocity;
   // the ground plane's fitted attitude cannot describe the tilted body.
   vertical={...vertical,y:vertical.y+clearance.maximumWheelPenetration};clearance=clearanceAt(vertical);
  }else if(vertical.isAirborne&&clearance.maximumWheelPenetration>1e-7){
   // First wheel contact owns landing, even when the tilted airborne centre is
   // still above the fitted road plane. Evaluate the SAME pure vertical step
   // against that contact; never integrate time/gravity or write a pose twice.
   vertical=updateRoadVehicleVerticalState({...verticalInput,supportY:vertical.y-VEHICLE_ROOT_TO_GROUND_METERS+clearance.maximumWheelPenetration});
   if(!vertical.landed)throw Error('race_landing_contact_unresolved');
   vertical={...vertical,y:contact.y+VEHICLE_ROOT_TO_GROUND_METERS};clearance=clearanceAt(vertical);
  }
  car.y=vertical.y;car.vy=vertical.verticalVelocity;car.isAirborne=vertical.isAirborne;car._terrainAirTimer=vertical.airborneTime;
  car.raceSupportY=contact.y;car.raceSupportPitch=contact.pitch;car.raceSupportDistanceMeters=support.distanceMeters;
  car.terrainPitch=vertical.pitch;car.terrainRoll=vertical.isAirborne?car.terrainRoll:contact.roll;
  car.maximumWheelPenetration=clearance.maximumWheelPenetration;car.maximumWheelGap=clearance.maximumWheelGap;
  if(vertical.landed){car.landingImpactMps=vertical.landingImpactMps;car.landingDamage+=applyTransportDamage(car,vertical.landingDamageForce).delta;}
 }else{car.y=contact.y+VEHICLE_ROOT_TO_GROUND_METERS;car.terrainPitch=contact.pitch;car.terrainRoll=contact.roll;
  car.maximumWheelPenetration=contact.maximumWheelPenetration;car.maximumWheelGap=contact.maximumWheelGap;}
 return driving;
}
export function raceVehicleSpeedMetersPerSecond(car){return carSpeedToMph(car.speed)*.44704;}
export function raceVehicleGroundPose(car){return {x:car.x,y:car.y-VEHICLE_ROOT_TO_GROUND_METERS,z:car.z,yaw:car.angle};}
// Timing gates use ground contact; ordinary room vehicles publish the chassis
// root. Reuse the authoritative numeric frame, including its surveyed attitude.
export function raceVehicleWorldPose(player){
 const frame=player?.vehicleState;if(!frame)return null;
 if(!['x','y','z','angle','terrainPitch','terrainRoll'].every(key=>Number.isFinite(frame[key])))throw Error('race_vehicle_frame_missing');
 return {x:frame.x,y:frame.y,z:frame.z,yaw:frame.angle,pitch:frame.terrainPitch,roll:frame.terrainRoll};
}
export function raceVehicleWheelDistance(car,dt){return carSpeedToWorldUnitsPerSecond(car.speed,1)*dt;}
// The existing garage park transaction is the condition owner. The authority
// calls this only while holding the same personal-car reservation/custody.
export function prepareRaceConditionHandback(raw,player){
 if(!player?.vehicleState)return null;
 const condition=player.condition;
 if(!Number.isFinite(condition)||condition<0||condition>1||condition!==player.vehicleState.condition)throw Error('race_invalid_vehicle_condition');
 const garage=normalizeVehicleGarage(raw),owned=garage.vehicles[player.vehicleId];
 if(!owned)throw Error('race_owned_vehicle_required');
 if(condition>=owned.condition)return null;
 return prepareVehicleGarageChange(garage,{action:'park',vehicleId:player.vehicleId,condition,expectedRevision:garage.revision}).garage;
}

// One explicit frame contract for session snapshots and the existing physics
// delegate. Input smoothing and drift state must travel with the owned actor.
export const RACE_VEHICLE_NUMERIC_FIELDS=Object.freeze(['x','y','z','angle','speed','vFwd','vLat','vx','vz','yawRate',
 'steerAngle','steerSm','rearSlip','throttleSm','terrainPitch','terrainRoll','engineRpm','engineRedlineRpm','engineLoad',
 'driveGear','shiftTime','condition','maximumWheelPenetration','maximumWheelGap','_driveDirection','_driftHoldTimer','driftAngle',
 'vy','_terrainAirTimer','raceSupportY','raceSupportPitch','raceSupportDistanceMeters','landingImpactMps','landingDamage']);
export function snapshotRaceVehicle(car) {
 if(!car)return null;const frame={};
 for(const key of RACE_VEHICLE_NUMERIC_FIELDS)frame[key]=Number(car[key]??(key==='_driveDirection'?1:0));
 frame.isDrifting=car.isDrifting===true;frame.isAirborne=car.isAirborne===true;return frame;
}
