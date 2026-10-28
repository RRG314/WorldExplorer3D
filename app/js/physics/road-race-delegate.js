import {canOwnRoadRace} from '../racing/road-activity-controller.js';
const FIELDS=['x','y','z','angle','speed','vFwd','vLat','vx','vz','yawRate','steerAngle','steerSm','rearSlip','terrainPitch','terrainRoll',
 'engineRpm','engineRedlineRpm','engineLoad','driveGear','shiftTime','condition','maximumWheelPenetration','maximumWheelGap'];
// Only the normal road physics owner may apply a race actor's approved frame.
export function advanceRoadRaceFrame(context,dt,actions) {
 const controller=context.roadRaceController;
 if(!controller)return false;
 if(!canOwnRoadRace(context)||!controller.isCurrent()) {controller.stop('race_vehicle_or_world_changed');return false;}
 const state=controller.step(dt,actions);if(!state)return false;
 if(!FIELDS.every(key=>Number.isFinite(state[key]))) {controller.stop('invalid_race_vehicle_state');return false;}
 for(const key of FIELDS)context.car[key]=state[key];
 context.car.onRoad=true;context.car.isAirborne=false;context.car.vy=0;
 return true;
}
