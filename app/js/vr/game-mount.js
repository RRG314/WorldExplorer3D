import {resolveControlState} from '../transport/control-state.js';
import {activeActorPose} from '../transport/actor-contract.js?v=6';
import {applyDrivingCabinCamera} from '../hud/driving-cabin-camera.js';
import {getAviationCatalogEntry} from '../transport/aviation-catalog.js?v=5';
import {aircraftForwardVector} from '../controls/traversal-control-policy.js?v=9';

// Typed camera admission, not a general actor-position command. Other domains
// require their own authored mount and renderer handoff before they opt in.
export function vrMountEligibility(ctx){
  const control=resolveControlState(ctx),pose=activeActorPose(ctx);
  if(control.frame==='space'||control.frame==='ocean'||!['walk','drive','plane'].includes(control.mode))return {eligible:false,reason:'Choose walking, a car or an aircraft before entering this view.'};
  if(![pose.x,pose.y,pose.z,pose.yaw].every(Number.isFinite))return {eligible:false,reason:'Your current travel mode is still preparing.'};
  if(control.mode==='drive'&&!ctx.carMesh)return {eligible:false,reason:'Your vehicle is still preparing.'};
  return {eligible:true,control,pose};
}
export function applyVrGameMount(THREE,ctx,camera,{horizonLock=true}={}){
  const admission=vrMountEligibility(ctx);if(!admission.eligible)throw new Error(admission.reason);
  const {control,pose}=admission;camera.up.set(0,1,0);
  if(control.mode==='drive'){applyDrivingCabinCamera(THREE,camera,ctx.carMesh);return admission;}
  if(control.mode==='walk'){
    camera.position.set(pose.x,pose.y,pose.z);camera.lookAt(pose.x+Math.sin(pose.yaw)*10,pose.y,pose.z+Math.cos(pose.yaw)*10);return admission;
  }
  const plane=ctx.planeMode,catalog=getAviationCatalogEntry(plane.transportCatalogId),forward=aircraftForwardVector(plane.yaw,plane.pitch);
  const offset=catalog.dimensions.length*(catalog.aircraftKind==='rotorcraft'?.16:.29);
  camera.position.set(plane.x+forward.x*offset,plane.y+catalog.dimensions.height*.2,plane.z+forward.z*offset);
  if(!horizonLock&&plane.mesh)camera.up.applyQuaternion(plane.mesh.quaternion);
  camera.lookAt(camera.position.x+forward.x*10,camera.position.y+forward.y*10,camera.position.z+forward.z*10);return admission;
}
