import {canOwnRoadRace} from '../racing/road-activity-controller.js';
import {RACE_VEHICLE_NUMERIC_FIELDS} from '../racing/vehicle-controller.js';
// Release momentum only for this currently admitted actor. Position and world
// admission stay untouched; obsolete accounts/worlds cannot brake a replacement.
export function releaseRoadRaceMotion(context,controller){
 if(!controller||context.roadRaceController!==controller||!canOwnRoadRace(context)||!controller.isCurrent())return false;
 for(const key of ['speed','vFwd','vLat','vx','vz','yawRate','steerAngle','steerSm','rearSlip','throttleSm','engineLoad','shiftTime','driftAngle'])context.car[key]=0;
 context.car.engineRpm=850;context.car.driveGear=1;context.car.isDrifting=false;context.car.boost=false;
 return true;
}
// Only the normal road physics owner may apply a race actor's approved frame.
export function advanceRoadRaceFrame(context,dt,actions) {
 const controller=context.roadRaceController;
 if(!controller)return false;
 if(!canOwnRoadRace(context)||!controller.isCurrent()) {controller.stop('race_vehicle_or_world_changed');return false;}
 const state=controller.step(dt,actions);if(!state)return false;
 if(!RACE_VEHICLE_NUMERIC_FIELDS.every(key=>Number.isFinite(state[key]))||typeof state.isDrifting!=='boolean') {controller.stop('invalid_race_vehicle_state');return false;}
 for(const key of RACE_VEHICLE_NUMERIC_FIELDS)context.car[key]=state[key];
 context.car.isDrifting=state.isDrifting;context.car.boost=false;
 context.car.onRoad=true;context.car.isAirborne=false;context.car.vy=0;
 return true;
}
