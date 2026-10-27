import {resolveControlState} from '../transport/control-state.js';
import {activeActorPose} from '../transport/actor-contract.js?v=6';
import {applyDrivingCabinCamera} from '../hud/driving-cabin-camera.js';
import {getAviationCatalogEntry} from '../transport/aviation-catalog.js?v=5';
import {aircraftForwardVector} from '../controls/traversal-control-policy.js?v=9';
import {SPACE_CRAFT_IDENTITY} from '../space/craft-identity.js?v=1';

// Typed camera admission, not a general actor-position command. Other domains
// require their own authored mount and renderer handoff before they opt in.
export function vrMountEligibility(ctx){
  const control=resolveControlState(ctx),pose=activeActorPose(ctx);
  let body,hiddenBody=null,units=ctx.WORLD_UNITS_PER_METER;
  if(control.frame==='space'){
    const flight=ctx.spaceFlight;body=flight.rocket;hiddenBody=body;
    if(flight.mode!=='flying'||flight.overviewMode)return {eligible:false,reason:'Finish launch or landing and return to the flight view before entering VR.'};
    if(![SPACE_CRAFT_IDENTITY.pod.id,SPACE_CRAFT_IDENTITY.starship.id].includes(body?.userData?.spaceCraftId))return {eligible:false,reason:'This spacecraft has no prepared VR observation view.'};
    // The orbital scene is a compressed model, not Earth metres. Seat/head
    // scale follows the authored craft's uniform visual scale. Neither body
    // positions nor astronomical navigation distances are rescaled here.
    const scale=body.scale;
    if(!scale||![scale.x,scale.y,scale.z].every(Number.isFinite)||scale.x<=0||Math.abs(scale.x-scale.y)>1e-6||Math.abs(scale.x-scale.z)>1e-6)return {eligible:false,reason:'The spacecraft view has no supported physical scale.'};
    units=scale.x;
    if(![body.quaternion?.x,body.quaternion?.y,body.quaternion?.z,body.quaternion?.w].every(Number.isFinite))return {eligible:false,reason:'Your spacecraft is still preparing.'};
  }else if(control.frame==='ocean'){
    body=control.locomotion==='swim'?ctx.oceanMode.diver:ctx.oceanMode.submarine;
    hiddenBody=control.locomotion==='swim'?ctx.oceanMode.diver?.presentationBody:body?.mesh;
    if(!body||!hiddenBody)return {eligible:false,reason:'Your Ocean view is still preparing.'};
  }else if(control.mode==='drive'){body=ctx.carMesh;}
  else if(control.mode==='walk'){body=ctx.Walk?.state?.walker;}
  else if(control.mode==='plane'){body=ctx.planeMode;hiddenBody=body?.mesh;}
  else return {eligible:false,reason:'Choose walking, a car, an aircraft, Ocean exploration or spacecraft flight before entering this view.'};
  if(![pose.x,pose.y,pose.z,pose.yaw].every(Number.isFinite))return {eligible:false,reason:'Your current travel mode is still preparing.'};
  if(control.mode==='drive'&&!ctx.carMesh)return {eligible:false,reason:'Your vehicle is still preparing.'};
  if(!Number.isFinite(units)||units<=0)return {eligible:false,reason:'The current world has no physical VR scale.'};
  return {eligible:true,control,pose,body,hiddenBody,worldUnitsPerMeter:units};
}
export function applyVrGameMount(THREE,ctx,camera,{horizonLock=true}={}){
  const admission=vrMountEligibility(ctx);if(!admission.eligible)throw new Error(admission.reason);
  const {control,pose}=admission;camera.up.set(0,1,0);
  if(control.frame==='space'){
    const rocket=admission.body,pod=rocket.userData.spaceCraftId===SPACE_CRAFT_IDENTITY.pod.id;
    rocket.updateWorldMatrix(true,false);
    camera.position.set(0,pod?2.15:5.1,pod?-.8:-.58).applyMatrix4(rocket.matrixWorld);
    camera.up.set(0,0,-1).applyQuaternion(rocket.quaternion);
    // Local +Y is forward in the existing spacecraft authority.
    const q=rocket.quaternion,x=-2*(q.w*q.z-q.x*q.y),y=1-2*(q.x*q.x+q.z*q.z),z=2*(q.w*q.x+q.y*q.z);
    camera.lookAt(camera.position.x+x*10,camera.position.y+y*10,camera.position.z+z*10);return admission;
  }
  if(control.frame==='ocean'){
    const submarine=control.locomotion==='submarine',offset=submarine?3.3*.86:0;
    camera.position.set(pose.x+Math.sin(pose.yaw)*offset,pose.y+(submarine ? .35*.86 : 0),pose.z+Math.cos(pose.yaw)*offset);
    camera.lookAt(camera.position.x+Math.sin(pose.yaw)*10,camera.position.y,camera.position.z+Math.cos(pose.yaw)*10);return admission;
  }
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
