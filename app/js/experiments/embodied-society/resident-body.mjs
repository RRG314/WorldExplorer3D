import { DEFAULT_WALKING_CONFIG } from '../../walking.js?v=98';
import { createWalkingPhysicsHelpers } from '../../walking/physics.js?v=31';
import { createFieldNavigatorMesh } from '../../walking/field-navigator-mesh.js?v=2';
import { createWalkingCharacterHelpers } from '../../walking/character.js?v=7';

const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;
const AXES=['move','strafe','turn','lookYaw','lookPitch'];

// Uses the retained walking integrator with a private context, never player
// keyboard state. World callbacks must originate from the research world host.
export function createResidentMotor({actorId,spawn,world,characterMesh=null,animateCharacterWalk=()=>{}}) {
  if(!actorId||!['x','y','z','yaw'].every(k=>Number.isFinite(spawn?.[k])))throw new Error('A validated finite spawn is required.');
  if(typeof world?.walkSurfaceAt!=='function'||typeof world?.checkBuildingCollision!=='function')throw new Error('Real world surface and collision authorities are required.');
  const CFG={...DEFAULT_WALKING_CONFIG};
  const state={mode:'walk',view:'third',characterMesh,walker:{...spawn,angle:spawn.yaw,lookYawOffset:0,pitch:0,speedMph:0,vy:0,mobileForward:0,mobileStrafe:0,mobileMoveBasisYaw:null,mobileMoveWasActive:false,onGround:true,wallJumpTimer:0,onBuilding:false}};
  let actions={},frames=0,paused=false,disposed=false;
  const context={
    METERS_PER_WORLD_UNIT:world.metersPerWorldUnit??1,
    readControlActions:()=>actions,
    SurfaceQuery:world.SurfaceQuery,
    checkBuildingCollision:world.checkBuildingCollision,
    getBuildCollisionAtWorldXZ:world.getBuildCollisionAtWorldXZ,
    getBuildTopSurfaceAtWorldXZ:world.getBuildTopSurfaceAtWorldXZ,
    activeInterior:null
  };
  const physics=createWalkingPhysicsHelpers({runtimeContext:context,CFG,state,keys:{},animateCharacterWalk,
    getBuildingsArray:world.getBuildingsArray||(()=>[]),getNearbyBuildings:world.getNearbyBuildings,
    isPointInPolygon:world.isPointInPolygon,
    getWalkGroundY:(x,z,y)=>{
      const surface=world.walkSurfaceAt(x,z,{currentY:state.walker.y-CFG.eyeHeight,sampleRenderedMesh:false,actorId});
      state.walker._walkSupportFeature=surface?.feature||null;
      const height=surface?.position?.y;
      if(!Number.isFinite(height))throw new Error('Resident has no verified walking surface.');
      return height;
    }
  });
  return Object.freeze({
    metersPerWorldUnit:world.metersPerWorldUnit??1,
    command(input) {
      if(disposed||paused)throw new Error('Resident is unavailable.');
      if(!Number.isSafeInteger(input?.frames)||input.frames<1||input.frames>300)throw new Error('Action duration must be 1–300 physics frames.');
      const next={};
      for(const axis of AXES){const value=input[axis]??0;if(!Number.isFinite(value)||Math.abs(value)>1)throw new Error('Action axis out of bounds.');next[axis]=value;}
      for(const name of Object.keys(input))if(!AXES.includes(name)&&name!=='frames')throw new Error('Unsupported resident action.');
      actions=next;frames=input.frames;
    },
    step() {
      if(disposed||paused)return;
      if(frames<=0)actions={};
      physics.updateWalkPhysics(1/60,finite);
      if(frames>0)frames--;
    },
    checkpoint(){const {_walkSupportFeature,...walker}=state.walker;return structuredClone({walker,actions,frames,paused});},
    observation(){const w=state.walker;return Object.freeze({actorId,mode:'walk',position:{x:w.x,y:w.y,z:w.z},yaw:w.yaw,pitch:w.pitch,onGround:w.onGround,remainingFrames:frames,paused});},
    pause(){paused=true;actions={};frames=0;},
    resume(){if(disposed)throw new Error('Resident disposed.');paused=false;},
    dispose(){disposed=true;actions={};frames=0;}
  });
}

export function createResidentBody({THREE,scene,...options}) {
  if(!THREE||!scene?.add)throw new Error('A research World Explorer scene is required.');
  const mesh=createFieldNavigatorMesh(THREE);
  mesh.userData.researchActorId=options.actorId;mesh.visible=true;
  const {animateCharacterWalk}=createWalkingCharacterHelpers({THREE,scene});
  let motor;
  try {motor=createResidentMotor({...options,characterMesh:mesh,animateCharacterWalk});scene.add(mesh);motor.step();}
  catch(error){scene.remove(mesh);mesh.traverse?.(part=>{part.geometry?.dispose();for(const m of Array.isArray(part.material)?part.material:[part.material])m?.dispose();});throw error;}
  return Object.freeze({...motor,mesh,dispose(){motor.dispose();scene.remove(mesh);mesh.traverse(part=>{part.geometry?.dispose();for(const m of Array.isArray(part.material)?part.material:[part.material])m?.dispose();});}});
}
