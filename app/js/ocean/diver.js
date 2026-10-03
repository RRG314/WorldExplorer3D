import {parentHullCollision} from './parent-vessel.js';
import {getPlayerCharacterGender} from '../../../js/player-character-preference.js?v=1';
import {createWalkingWaterRuntime} from '../walking/water/runtime.js';
import {resolveSwimHullCamera} from '../walking/water/hull-camera.js';
export const resolveOceanDiverCameraPose=options=>resolveSwimHullCamera({...options,vesselPosition:options.submarinePosition});
import {createSwimmingHud} from '../walking/water/ui.js';
import {resolveWalkingMoveVector} from '../walking/physics.js?v=32';
import {createPlayerCharacterHost} from '../walking/player-character-host.js';
import {attachCuratedExplorerCharacter,disposeCuratedCharacter,updateCuratedCharacterAnimation,EXPLORER_ASSET_BY_GENDER} from '../walking/curated-explorer-character.js?v=8';

export function oceanDiveAdmission({speed=0,verticalSpeed=0,depthMeters,bottomClearance}) {
  if(!Number.isFinite(speed)||!Number.isFinite(verticalSpeed)||Math.abs(speed)>.5||Math.abs(verticalSpeed)>.5)return {allowed:false,reason:'Stop the submarine before leaving.'};
  if(!Number.isFinite(depthMeters)||depthMeters<1||depthMeters>16)return {allowed:false,reason:'Move the submarine to 1–16 m simulated depth.'};
  if(!Number.isFinite(bottomClearance)||bottomClearance<2)return {allowed:false,reason:'Move away from the seabed before leaving.'};
  return {allowed:true,reason:''};
}

// One diver shares the existing Ocean loop. The parked submarine retains its
// identity and transform; boarding changes control, never creates another sub.
export function createOceanDiver(ctx,mode,{sampleSeabedHeight,worldRadius=1200}) {
  const host=createPlayerCharacterHost(THREE);mode.scene.add(host);
  let active=false,pending=false,disposed=false,controller=null,ready=false;
  const state={walker:{x:0,y:0,z:0,yaw:0,angle:0,lookYawOffset:0,pitch:0,vy:0},characterMesh:host};
  const panel=document.createElement('section');panel.id='oceanDiverControls';panel.setAttribute('aria-label','Ocean explorer');
  panel.style.cssText='position:fixed;right:12px;top:80px;z-index:120;width:220px;max-width:calc(100vw - 24px);background:#092a3beF;border:1px solid #50879c;border-radius:10px;padding:10px;color:#eefaff;font:13px/1.4 system-ui';
  const button=document.createElement('button'),status=document.createElement('div');button.id='oceanDiverToggle';button.type='button';button.textContent='Explore outside submarine';button.style.cssText='width:100%;min-height:44px;background:#175069;color:white;border:1px solid #91c2d0;border-radius:7px;font:inherit';status.style.marginTop='6px';panel.append(button,status);document.body.append(panel);
  const layoutStyle=document.createElement('style');layoutStyle.textContent='@media(max-width:600px){#oceanDiverControls{top:276px!important;box-sizing:border-box}}';document.head.append(layoutStyle);
  const box=new THREE.Box3(),cameraTarget=new THREE.Vector3(),lookTarget=new THREE.Vector3();
  const units=Number(ctx.METERS_PER_WORLD_UNIT)>0?ctx.METERS_PER_WORLD_UNIT:1;
  function subCollisionAt(x,z,radius,actor){return {collision:x>box.min.x-radius&&x<box.max.x+radius&&z>box.min.z-radius&&z<box.max.z+radius&&actor.actorBaseY<box.max.y&&actor.actorBaseY+actor.actorHeight>box.min.y};}
  function allHullCollisionAt(x,z,radius,actor){return {collision:mode.habitat?.collision({x,z,y:actor.actorBaseY+actor.actorHeight*.5},radius)||subCollisionAt(x,z,radius,actor).collision||parentHullCollision(ctx.oceanVoyage?.current?.ship,{x,z,y:actor.actorBaseY+actor.actorHeight*.5},radius,mode.waterSurface.sample(0,0).surfaceY)}}
  function admission(){const sub=mode.submarine;const water=mode.waterSurface.sample(sub.position.x,sub.position.z);return oceanDiveAdmission({speed:sub.speed,verticalSpeed:sub.verticalSpeed,depthMeters:(water.surfaceY-sub.position.y)*units,bottomClearance:(sub.position.y-sampleSeabedHeight(sub.position.x,sub.position.z))*units})}
  function separation(){return Math.hypot(state.walker.x-mode.submarine.position.x,state.walker.y-mode.submarine.position.y,state.walker.z-mode.submarine.position.z)}
  function board(rescue=false) {
    if(!active)return false;
    if(!rescue&&separation()*units>8){status.textContent='Swim back within 8 m, or use Recover for assistance.';return false;}
    active=false;controller?.dispose();controller=null;host.visible=false;
    mode.submarine.speed=0;mode.submarine.verticalSpeed=0;mode.submarine.turnSpeed=0;
    ctx.refreshBoatAvailability?.(true);
    status.textContent=rescue?'Recovered aboard. Air replenishes before the next dive.':'Aboard. Air replenishes before the next dive.';
    return true;
  }
  async function start(){
    if(ctx.sharedMarine?.active){status.textContent='Stay aboard during this shared submarine survey. Leave Shared crew for personal scuba exploration.';return false;}
    if(active||pending||disposed||!mode.active)return false;
    const gate=admission();if(!gate.allowed){status.textContent=gate.reason;return false;}
    pending=true;button.disabled=true;status.textContent='Preparing your explorer…';
    try {
      if(!ready)ready=await attachCuratedExplorerCharacter(THREE,host,{assetId:EXPLORER_ASSET_BY_GENDER[ctx.getPlayerCharacterGender?.()||getPlayerCharacterGender()],role:'player-character',failClosed:true,isCurrent:()=>!disposed&&host.parent===mode.scene});
      if(!ready||disposed||!mode.active)return false;
      const again=admission();if(!again.allowed){status.textContent=again.reason;return false;}
      const sub=mode.submarine;sub.mesh.updateMatrixWorld(true);box.setFromObject(sub.mesh);
      const x=box.max.x+1,z=sub.position.z;
      if(Math.hypot(x,z)>worldRadius||sampleSeabedHeight(x,z)>sub.position.y-1.65||mode.habitat?.collision({x,z,y:sub.position.y-.8},.6)){status.textContent='The exit side is obstructed. Move into clear water.';return false;}
      Object.assign(state.walker,{x,z,y:sub.position.y,yaw:sub.yaw,angle:sub.yaw,vy:0,pitch:0,lookYawOffset:0});
      const localContext={getEnv:ctx.getEnv,METERS_PER_WORLD_UNIT:units,LOC:mode.launchSite,
        checkBuildingCollision:(px,pz,radius,actor)=>{
          const inside=allHullCollisionAt(px,pz,radius,actor).collision||mode.habitat?.collision({x:px,z:pz,y:actor.actorBaseY+actor.actorHeight*.5},radius);
          const water=mode.waterSurface.sample(px,pz);
          return {collision:inside||Math.hypot(px,pz)>worldRadius||water.surfaceY-sampleSeabedHeight(px,pz)<1.5};
        }};
      controller=createWalkingWaterRuntime({ctx:localContext,state,CFG:{eyeHeight:1.7},environment:'OCEAN',checkpointEnabled:false,onRecover:()=>board(true),
        groundAt:(px,pz)=>({effectiveGroundY:sampleSeabedHeight(px,pz)}),sample:(px,pz)=>mode.waterSurface.sample(px,pz),moveVector:resolveWalkingMoveVector,
        animate:updateCuratedCharacterAnimation,hudFactory:options=>createSwimmingHud({...options,id:'oceanSwimmingHud'})});
      sub.speed=0;sub.turnSpeed=0;sub.verticalSpeed=0;active=true;host.visible=true;ctx.refreshBoatAvailability?.(true);
      status.textContent='W/S swim · A/D turn · Space/Shift rise/dive. Recover returns you aboard.';
      return true;
    }finally{pending=false;if(!disposed)button.disabled=false;if(!ready&&!disposed)status.textContent='Explorer could not load. Try again.';}
  }
  button.onclick=()=>{button.blur();if(active)board();else void start().catch(()=>{if(!disposed)status.textContent='Explorer could not start. Try again.'})};
  function update(dt,time){
    if(disposed)return false;
    panel.hidden=!mode.active;
    if(!active){button.textContent='Explore outside submarine';if(!pending){const gate=admission();button.disabled=!gate.allowed;if(!gate.allowed)status.textContent=gate.reason;}return false;}
    const w=state.walker,actions=ctx.readControlActions?.('ocean')||{};
    w.yaw+=(Number(actions.turn)||0)*2*dt;w.angle=w.yaw;
    w.lookYawOffset+=(Number(actions.lookYaw)||0)*2*dt;
    w.pitch=Math.max(-.8,Math.min(.8,w.pitch+(Number(actions.lookPitch)||0)*dt));
    controller.update(dt,{actions,forward:Number(actions.move)||0,strafe:0,groundState:{effectiveGroundY:sampleSeabedHeight(w.x,w.z)}});
    if(!state.walker.swimming){board(true);return false;}
    const yaw=w.yaw+w.lookYawOffset,water=mode.waterSurface.sample(w.x,w.z,{time});
    mode.waterSample=water.volume;
    cameraTarget.set(w.x-Math.sin(yaw)*5,w.y+1.2-Math.sin(w.pitch)*2,w.z-Math.cos(yaw)*5);
    cameraTarget.y=Math.min(cameraTarget.y,water.surfaceY-.15);
    cameraTarget.y=Math.max(cameraTarget.y,sampleSeabedHeight(cameraTarget.x,cameraTarget.z)+.35);
    lookTarget.set(w.x,w.y-.4,w.z);
    const safeTarget=resolveOceanDiverCameraPose({anchor:lookTarget,target:cameraTarget,submarinePosition:mode.submarine.position,checkBuildingCollision:allHullCollisionAt});
    cameraTarget.set(safeTarget.x,safeTarget.y,safeTarget.z);
    mode.camera.position.lerp(cameraTarget,1-Math.exp(-dt*7));
    const cameraPose=resolveOceanDiverCameraPose({anchor:lookTarget,target:mode.camera.position,submarinePosition:mode.submarine.position,checkBuildingCollision:allHullCollisionAt});
    mode.camera.position.set(cameraPose.x,cameraPose.y,cameraPose.z);mode.camera.lookAt(lookTarget);
    button.textContent=`Board submarine · ${Math.round(separation()*units)} m`;button.disabled=separation()*units>8;
    return true;
  }
  return {get active(){return active},start,board,update,
    navigationActor:()=>({position:{x:state.walker.x,y:state.walker.y,z:state.walker.z},yaw:state.walker.yaw,vx:state.walker.vx||0,vy:state.walker.vy||0,vz:state.walker.vz||0,speed:Math.hypot(state.walker.vx||0,state.walker.vz||0)}),
    snapshot:()=>({active,pending,ready,position:{x:state.walker.x,y:state.walker.y,z:state.walker.z},swimming:state.walker.swimming||null,distanceToSubMeters:active?separation()*units:null}),
    dispose(){if(disposed)return;disposed=true;active=false;controller?.dispose();controller=null;panel.remove();layoutStyle.remove();disposeCuratedCharacter(host);host.parent?.remove(host);}
  };
}
