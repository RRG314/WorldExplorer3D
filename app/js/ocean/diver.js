import {parentHullCollision} from './parent-vessel.js';
import {getMaritimeCatalogEntry} from '../transport/maritime-catalog.js?v=1';
import {RESEARCH_DECK} from '../boat-mode/research/layout.js';
import {styleMarinePanel} from './interface.js';
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

export function parentVesselExitPose(ship,surfaceY,jump=false) {
  if(!ship || !Number.isFinite(surfaceY))return null;
  const {width,length}=getMaritimeCatalogEntry(ship.transportCatalogId).dimensions;
  const yaw=Number(ship.yaw)||0,c=Math.cos(yaw),s=Math.sin(yaw),side=width*.5+1,forward=-length*.3;
  return {x:side*c+forward*s,z:-side*s+forward*c,
    y:surfaceY+(jump?RESEARCH_DECK.y+RESEARCH_DECK.eyeHeight:.18),yaw:yaw+Math.PI/2};
}

// One diver shares the existing Ocean loop. The parked submarine retains its
// identity and transform; boarding changes control, never creates another sub.
export function createOceanDiver(ctx,mode,{sampleSeabedHeight,worldRadius=1200}) {
  const host=createPlayerCharacterHost(THREE);mode.scene.add(host);
  let active=false,pending=false,disposed=false,controller=null,ready=false,returnTarget='submarine',falling=false,fallVelocity=0,entryEpoch=0;
  const state={walker:{x:0,y:0,z:0,yaw:0,angle:0,lookYawOffset:0,pitch:0,vy:0},characterMesh:host};
  const panel=document.createElement('section');panel.id='oceanDiverControls';panel.setAttribute('aria-label','Ocean explorer');
  const button=document.createElement('button'),status=document.createElement('div');button.id='oceanDiverToggle';button.type='button';button.textContent='Explore outside submarine';status.setAttribute('role','status');panel.append(button,status);document.body.append(panel);
  const optionsDetails=document.createElement('details'),optionsSummary=document.createElement('summary');optionsSummary.textContent='Dive controls & sound';optionsDetails.id='oceanDiverOptions';optionsDetails.append(optionsSummary);panel.append(optionsDetails);
  const help=document.createElement('div');help.textContent='W/S swim · A/D turn · Space/Shift rise/dive. Recover returns you aboard.';optionsDetails.append(help);
  styleMarinePanel(panel,'diver');
  const box=new THREE.Box3(),cameraTarget=new THREE.Vector3(),lookTarget=new THREE.Vector3();
  const units=Number(ctx.METERS_PER_WORLD_UNIT)>0?ctx.METERS_PER_WORLD_UNIT:1;
  function subCollisionAt(x,z,radius,actor){return {collision:x>box.min.x-radius&&x<box.max.x+radius&&z>box.min.z-radius&&z<box.max.z+radius&&actor.actorBaseY<box.max.y&&actor.actorBaseY+actor.actorHeight>box.min.y};}
  function allHullCollisionAt(x,z,radius,actor){return {collision:mode.habitat?.collision({x,z,y:actor.actorBaseY+actor.actorHeight*.5},radius)||subCollisionAt(x,z,radius,actor).collision||parentHullCollision(ctx.oceanVoyage?.current?.ship,{x,z,y:actor.actorBaseY+actor.actorHeight*.5},radius,mode.waterSurface.sample(0,0).surfaceY)}}
  function admission(){const sub=mode.submarine;const water=mode.waterSurface.sample(sub.position.x,sub.position.z);return oceanDiveAdmission({speed:sub.speed,verticalSpeed:sub.verticalSpeed,depthMeters:(water.surfaceY-sub.position.y)*units,bottomClearance:(sub.position.y-sampleSeabedHeight(sub.position.x,sub.position.z))*units})}
  function separation(){return Math.hypot(state.walker.x-mode.submarine.position.x,state.walker.y-mode.submarine.position.y,state.walker.z-mode.submarine.position.z)}
  function boardingDistance(){
    if(returnTarget!=='vessel')return separation()*units;
    const p=parentVesselExitPose(ctx.oceanVoyage?.current?.ship,mode.waterSurface.sample(0,0).surfaceY);
    return p?Math.hypot(state.walker.x-p.x,state.walker.y-p.y,state.walker.z-p.z)*units:Infinity;
  }
  function board(rescue=false) {
    if(!active)return false;
    if(!rescue&&boardingDistance()>8){status.textContent='Swim back within 8 m of your entry point, or use Recover for assistance.';return false;}
    stop();
    mode.submarine.speed=0;mode.submarine.verticalSpeed=0;mode.submarine.turnSpeed=0;
    ctx.refreshBoatAvailability?.(true);
    status.textContent=rescue?'Recovered aboard. Air replenishes before the next dive.':'Aboard. Air replenishes before the next dive.';
    if(returnTarget==='vessel')void Promise.resolve(ctx.transferSubmarineToBoat?.({source:'research-swimmer-return',enterDeck:true})).then(ok=>{
      if(!ok&&!disposed)status.textContent='Vessel recovery did not finish. You are safely aboard the submarine; retry Recover to parent vessel.';
    }).catch(()=>{if(!disposed)status.textContent='Vessel recovery unavailable. You are safely aboard the submarine.';});
    return true;
  }
  function stop(){entryEpoch++;active=false;falling=false;controller?.dispose();controller=null;host.visible=false;}
  async function start(options={}){
    if(ctx.sharedMarine?.active){status.textContent='Stay aboard during this shared submarine survey. Leave Shared crew for personal scuba exploration.';return false;}
    if(active||pending||disposed||!mode.active)return false;
    const fromVessel=options.from==='parent-vessel';
    const vesselPose=()=>parentVesselExitPose(ctx.oceanVoyage?.current?.ship,mode.waterSurface.sample(0,0).surfaceY,options.jump===true);
    const gate=fromVessel?{allowed:!!vesselPose()}:admission();if(!gate.allowed){status.textContent=gate.reason||'The research vessel is unavailable.';return false;}
    const epoch=++entryEpoch;pending=true;button.disabled=true;status.textContent='Preparing your explorer…';
    try {
      if(!ready)ready=await attachCuratedExplorerCharacter(THREE,host,{assetId:EXPLORER_ASSET_BY_GENDER[ctx.getPlayerCharacterGender?.()||getPlayerCharacterGender()],role:'player-character',failClosed:true,isCurrent:()=>!disposed&&host.parent===mode.scene});
      if(!ready||disposed||!mode.active||epoch!==entryEpoch)return false;
      const again=fromVessel?{allowed:!!vesselPose()}:admission();if(!again.allowed){status.textContent=again.reason;return false;}
      const sub=mode.submarine;sub.mesh.updateMatrixWorld(true);box.setFromObject(sub.mesh);
      const entry=fromVessel?vesselPose():{x:box.max.x+1,z:sub.position.z,y:sub.position.y,yaw:sub.yaw};
      const {x,z}=entry,water=mode.waterSurface.sample(x,z);
      if(Math.hypot(x,z)>worldRadius||sampleSeabedHeight(x,z)>Math.min(entry.y,water.surfaceY)-1.65||mode.habitat?.collision({x,z,y:entry.y-.8},.6)){status.textContent='The exit side is obstructed. Move into clear water.';return false;}
      returnTarget=fromVessel?'vessel':'submarine';falling=fromVessel&&options.jump===true;fallVelocity=falling?2.5:0;
      Object.assign(state.walker,{...entry,angle:entry.yaw,vy:0,pitch:0,lookYawOffset:0});
      const localContext={getEnv:ctx.getEnv,METERS_PER_WORLD_UNIT:units,LOC:mode.launchSite,
        checkBuildingCollision:(px,pz,radius,actor)=>{
          const inside=allHullCollisionAt(px,pz,radius,actor).collision||mode.habitat?.collision({x:px,z:pz,y:actor.actorBaseY+actor.actorHeight*.5},radius);
          const water=mode.waterSurface.sample(px,pz);
          return {collision:inside||Math.hypot(px,pz)>worldRadius||water.surfaceY-sampleSeabedHeight(px,pz)<1.5};
        }};
      controller=createWalkingWaterRuntime({ctx:localContext,state,CFG:{eyeHeight:1.7},environment:'OCEAN',checkpointEnabled:false,onRecover:()=>board(true),
        groundAt:(px,pz)=>({effectiveGroundY:sampleSeabedHeight(px,pz)}),sample:(px,pz)=>mode.waterSurface.sample(px,pz),moveVector:resolveWalkingMoveVector,
        animate:updateCuratedCharacterAnimation,hudFactory:options=>createSwimmingHud({...options,id:'oceanSwimmingHud',host:panel})});
      sub.speed=0;sub.turnSpeed=0;sub.verticalSpeed=0;active=true;host.visible=true;ctx.refreshBoatAvailability?.(true);
      status.textContent='';
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
    if(falling){
      fallVelocity-=9.81*dt;w.y+=fallVelocity*dt;
      const surface=mode.waterSurface.sample(w.x,w.z,{time}).surfaceY;
      if(w.y<=surface+.18){w.y=surface+.18;falling=false;fallVelocity=0;}
      host.position.set(w.x,w.y-1.7,w.z);host.rotation.set(0,w.yaw,0);updateCuratedCharacterAnimation(host,false,dt,false);
    }
    if(!falling)controller.update(dt,{actions,forward:Number(actions.move)||0,strafe:0,groundState:{effectiveGroundY:sampleSeabedHeight(w.x,w.z)}});
    if(!falling&&!state.walker.swimming){board(true);return false;}
    const yaw=w.yaw+w.lookYawOffset,water=mode.waterSurface.sample(w.x,w.z,{time});
    mode.waterSample=water.volume;
    const followDistance=5*Math.max(1,Math.min(1.45,1/(mode.camera.aspect||1)));
    cameraTarget.set(w.x-Math.sin(yaw)*followDistance,w.y+1.2-Math.sin(w.pitch)*2,w.z-Math.cos(yaw)*followDistance);
    if(w.swimming?.submerged)cameraTarget.y=Math.min(cameraTarget.y,water.surfaceY-.15);
    cameraTarget.y=Math.max(cameraTarget.y,sampleSeabedHeight(cameraTarget.x,cameraTarget.z)+.35);
    lookTarget.set(w.x,w.y-.4,w.z);
    const safeTarget=resolveOceanDiverCameraPose({anchor:lookTarget,target:cameraTarget,submarinePosition:mode.submarine.position,checkBuildingCollision:allHullCollisionAt});
    cameraTarget.set(safeTarget.x,safeTarget.y,safeTarget.z);
    mode.camera.position.lerp(cameraTarget,1-Math.exp(-dt*7));
    const cameraPose=resolveOceanDiverCameraPose({anchor:lookTarget,target:mode.camera.position,submarinePosition:mode.submarine.position,checkBuildingCollision:allHullCollisionAt});
    mode.camera.position.set(cameraPose.x,cameraPose.y,cameraPose.z);mode.camera.lookAt(lookTarget);
    button.textContent=`${returnTarget==='vessel'?'Board research vessel':'Board submarine'} · ${Math.round(boardingDistance())} m`;button.disabled=falling||boardingDistance()>8;
    return true;
  }
  return {get active(){return active},start,stop,board,update,
    navigationActor:()=>({position:{x:state.walker.x,y:state.walker.y,z:state.walker.z},yaw:state.walker.yaw,vx:state.walker.vx||0,vy:state.walker.vy||0,vz:state.walker.vz||0,speed:Math.hypot(state.walker.vx||0,state.walker.vz||0)}),
    snapshot:()=>({active,pending,ready,returnTarget,falling,position:{x:state.walker.x,y:state.walker.y,z:state.walker.z},swimming:state.walker.swimming||null,distanceToSubMeters:active?separation()*units:null}),
    dispose(){if(disposed)return;disposed=true;stop();panel.remove();disposeCuratedCharacter(host);host.parent?.remove(host);}
  };
}
