import {VEHICLE_ROOT_TO_GROUND_METERS} from '../engine/vehicle-catalog.js?v=6';

export const BMW_DRIVER_CAMERA=Object.freeze({type:'DriverCameraMount',kind:'cabin',eye:Object.freeze({x:.35,y:-.03,z:-.05})});
// Reviewed cabins carry an eye in the normalized model's ground coordinates.
// Other fleet bodies use an unobstructed raised view until cabins are prepared.
// This recipe follows the already-normalized model envelope, not guessed seats.
export function vehicleDriverCamera(variant) {
 if(!variant||![variant.height,variant.length].every(n=>Number.isFinite(n)&&n>0))throw Error('invalid_vehicle_camera_envelope');
 if(variant.driverEyeGroundMeters){
  const [x,y,z]=variant.driverEyeGroundMeters;
  if(![x,y,z].every(Number.isFinite)||Math.abs(x)>variant.width/2||y<=0||y>=variant.height||Math.abs(z)>variant.length/2)throw Error('invalid_vehicle_camera_eye');
  return Object.freeze({type:'DriverCameraMount',kind:'cabin',eye:Object.freeze({x,y:y-VEHICLE_ROOT_TO_GROUND_METERS,z})});
 }
 return Object.freeze({type:'DriverCameraMount',kind:'raised',eye:Object.freeze({x:0,y:variant.height-VEHICLE_ROOT_TO_GROUND_METERS+.3,z:variant.length*.12})});
}
export function driverCameraMount(mesh){return mesh?.userData?.driverCameraMount||BMW_DRIVER_CAMERA;}
