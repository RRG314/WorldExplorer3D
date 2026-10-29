import {VEHICLE_ROOT_TO_GROUND_METERS} from '../engine/vehicle-catalog.js?v=6';

export const BMW_DRIVER_CAMERA=Object.freeze({type:'DriverCameraMount',kind:'cabin',eye:Object.freeze({x:.35,y:-.03,z:-.05})});
// Only the E34 cabin has an authored eye position. Other fleet bodies use a
// deliberate unobstructed raised view until their own cabins are prepared.
// This recipe follows the already-normalized model envelope, not guessed seats.
export function vehicleDriverCamera(variant) {
 if(!variant||![variant.height,variant.length].every(n=>Number.isFinite(n)&&n>0))throw Error('invalid_vehicle_camera_envelope');
 return Object.freeze({type:'DriverCameraMount',kind:'raised',eye:Object.freeze({x:0,y:variant.height-VEHICLE_ROOT_TO_GROUND_METERS+.3,z:variant.length*.12})});
}
export function driverCameraMount(mesh){return mesh?.userData?.driverCameraMount||BMW_DRIVER_CAMERA;}
