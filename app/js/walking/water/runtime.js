import { createSwimResumeStore } from './resume.js';
import { setSwimmingEquipment, disposeSwimmingEquipment } from './equipment.js';
import { resolveWaterSampleCandidate, sampleDynamicWaterAt } from '../../boat-mode/water-query.js?v=21';
import { classifyWaterTraversal, createSwimState, stepSwimming } from './model.js';
import { createSwimmingHud } from './ui.js';

// Walking remains the sole owner of the explorer transform. This controller
// replaces gravity only while an accepted water volume actually immerses it.
function sampleCharacterWater(x,z,candidate,options) {
  const body=candidate || resolveWaterSampleCandidate(x,z);
  return body ? sampleDynamicWaterAt(x,z,body,options) : {coverage:'unresolved',surfaceY:null,volume:null};
}

export function createWalkingWaterRuntime({ctx,state,CFG,groundAt,moveVector,animate,sample=sampleCharacterWater,hudFactory=createSwimmingHud,resumeStore=createSwimResumeStore()}) {
  let active=false, resources=createSwimState(), lastDry=null, hud=null;
  let lastBody=null, bodyPitch=0, resumeChecked=false, saveElapsed=0, checkpointSaved=false, checkpointAttempted=false, regionKey=null;
  const checkpoint=()=>{if(active){checkpointAttempted=true;checkpointSaved=resumeStore.write(ctx.LOC,state.walker,resources);}};
  globalThis.addEventListener?.('pagehide',checkpoint);
  function deactivate() {
    if(active)resumeStore.clear();
    active=false;
    state.walker.swimming=null;
    state.walker.waterTraversal='dry';
    if(state.characterMesh) {
      state.characterMesh.userData.swimming=false;
      state.characterMesh.rotation.x=0;
      setSwimmingEquipment(globalThis.THREE,state.characterMesh,false);
    }
    hud?.hide();
  }
  function recover() {
    if(!active) return;
    const walker=state.walker;
    // Revalidate the remembered bank; loading a different region must never
    // teleport an explorer onto an old, now unsupported coordinate.
    const ground=lastDry && groundAt(lastDry.x,lastDry.z,lastDry.y);
    const water=lastDry && sample(lastDry.x,lastDry.z,null,{bottomY:ground?.effectiveGroundY});
    if(lastDry && ground && Math.abs(ground.effectiveGroundY+CFG.eyeHeight-lastDry.y)<.5
      && (water.coverage!=='known-water-body'||ground.effectiveGroundY>=water.surfaceY-.25)
      && Math.hypot(walker.x-lastDry.x,walker.z-lastDry.z)<500) {
      Object.assign(walker,lastDry,{vy:0,vx:0,vz:0});resources=createSwimState();deactivate();
    } else if(walker.swimming) {
      walker.y=walker.swimming.surfaceY+.18;resources.verticalVelocity=0;
    }
  }
  function update(dt,{actions,forward,strafe,groundState}) {
    const w=state.walker;
    const nextRegion=Number.isFinite(ctx.LOC?.lat)&&Number.isFinite(ctx.LOC?.lon)?`${ctx.LOC.lat}:${ctx.LOC.lon}`:null;
    if(regionKey!==nextRegion){deactivate();lastDry=null;resources=createSwimState();resumeChecked=false;regionKey=nextRegion;}
    if((ctx.getEnv && ctx.getEnv()!=='EARTH')||ctx.activeInterior||ctx.activePlanetaryBodyId||ctx.onMoon||ctx.onMars||ctx.boatMode?.active
      ||ctx.liveGpsTranslationOwned?.()===true||ctx.urbanSandboxRuntime?.parachute?.skydiving===true) {
      deactivate();lastDry=null;return false;
    }
    if(!resumeChecked && ctx.initialEarthWorldReady && Number.isFinite(ctx.LOC?.lat) && Number.isFinite(ctx.LOC?.lon)) {
      resumeChecked=true;
      const saved=resumeStore.read(ctx.LOC);
      if(saved) {
        const support=groundAt(saved.pose.x,saved.pose.z,w.y);
        const surface=sample(saved.pose.x,saved.pose.z,null,{bottomY:support.effectiveGroundY});
        const obstruction=ctx.checkBuildingCollision?.(saved.pose.x,saved.pose.z,.35,{actorBaseY:surface.surfaceY-.65,actorHeight:.9});
        if(surface.coverage==='known-water-body' && Number.isFinite(support.effectiveGroundY)
          && surface.surfaceY-support.effectiveGroundY>1.45 && !obstruction?.collision) {
          Object.assign(w,saved.pose,{y:surface.surfaceY+.18,angle:saved.pose.yaw,vy:0});
          resources=createSwimState(saved);groundState=support;
        }
      }
    }
    const water=sample(w.x,w.z,null,{bottomY:groundState.effectiveGroundY});
    const kind=water.coverage==='known-water-body'?classifyWaterTraversal({surfaceY:water.surfaceY,baseY:water.baseY,bottomY:groundState.effectiveGroundY,eyeY:w.y,eyeHeight:CFG.eyeHeight,wasSwimming:active}):'dry';
    state.walker.waterTraversal=kind;
    if(kind!=='swimming') {
      if(active) { w.vy=0; deactivate(); w.waterTraversal=kind; }
      if(kind==='dry'&&Math.abs(w.y-groundState.effectiveGroundY-CFG.eyeHeight)<.35) {
        lastDry={x:w.x,y:w.y,z:w.z};resources=createSwimState();lastBody=null;
      }
      return false;
    }
    active=true;lastBody=water.volume?.volumeId || lastBody;
    hud ||= hudFactory({recover});
    const step=Math.max(0,Math.min(.1,Number(dt)||0));
    const moving=Math.hypot(forward,strafe)>.04;
    const vertical=hud.vertical() || Number(actions.vertical)||0;
    const result=stepSwimming(resources,{eyeY:w.y,surfaceY:water.surfaceY,bottomY:groundState.effectiveGroundY,dt:step,vertical,moving,boost:false,metersPerUnit:ctx.METERS_PER_WORLD_UNIT});
    resources=result.state;
    const yaw=Number.isFinite(w.mobileMoveBasisYaw)?w.mobileMoveBasisYaw:w.yaw;
    const movement=moveVector({forward,strafe,yaw,speed:result.speed,dt:step});
    const current=water.volume?.current?.vectorMetersPerSecond;
    const units=Number(ctx.METERS_PER_WORLD_UNIT)>0?ctx.METERS_PER_WORLD_UNIT:1;
    movement.x+=(current?.x||0)*step/units;movement.z+=(current?.z||0)*step/units;
    const x=w.x+movement.x,z=w.z+movement.z;
    const nextGround=groundAt(x,z,result.y);
    const nextWater=sample(x,z,null,{bottomY:nextGround.effectiveGroundY});
    const wall=ctx.checkBuildingCollision?.(x,z,.35,{actorBaseY:result.y-.65,actorHeight:.9});
    const block=ctx.getBuildCollisionAtWorldXZ?.(x,z,result.y-.65,0,.9);
    // Never cross an unknown edge or step through an embankment. Walking takes
    // over on the next frame once accepted shallows support the explorer.
    const supported=nextGround.effectiveGroundY<=result.y+.35;
    const covered=nextWater.coverage==='known-water-body';
    const canExit=!covered&&nextGround.effectiveGroundY>=water.surfaceY-.9;
    if(!wall?.collision&&!block?.blocked&&supported&&(covered||canExit)) {
      w.x=x;w.z=z;
      if(moving) w.angle=Math.atan2(movement.x,movement.z);
    }
    w.vx=step?(w.x-(x-movement.x))/step:0;w.vz=step?(w.z-(z-movement.z))/step:0;
    const acceptedBottom=(w.x===x&&w.z===z)?nextGround.effectiveGroundY:groundState.effectiveGroundY;
    w.y=Math.max(result.y,acceptedBottom+.65);
    w.vy=resources.verticalVelocity;w.onGround=false;w.onBuilding=false;
    w.speedMph=Math.hypot(w.vx,w.vz)*units*2.236936;
    w._resolvedGroundState=null;
    w.swimming={equipment:resources.equipment,airSeconds:resources.airSeconds,submerged:result.submerged,recovering:result.recovering,surfaceY:water.surfaceY,depthMeters:Math.max(0,(water.surfaceY-w.y)*units),volumeId:lastBody};
    const mesh=state.characterMesh;
    if(mesh) {
      mesh.userData.swimming=true;
      setSwimmingEquipment(globalThis.THREE,mesh,resources.equipment==='scuba');
      bodyPitch+=((moving?1.12:.15)-bodyPitch)*(1-Math.exp(-step*8));
      const pitch=bodyPitch;
      mesh.rotation.order='YXZ';mesh.rotation.set(pitch,w.angle,0,'YXZ');
      const bodyLength=CFG.eyeHeight-.12;
      mesh.position.set(w.x-Math.sin(w.angle)*Math.sin(pitch)*bodyLength,w.y-Math.cos(pitch)*bodyLength,w.z-Math.cos(w.angle)*Math.sin(pitch)*bodyLength);
      animate(mesh,moving,step,false);
    }
    saveElapsed+=step;
    if(saveElapsed>=2){checkpoint();saveElapsed=0;}
    w.swimming.checkpointSaved=checkpointSaved;
    w.swimming.checkpointStatus=checkpointAttempted?(checkpointSaved?'saved':'session-only'):'pending';
    hud.show(w.swimming);
    return true;
  }
  return {update,deactivate,recover,dispose:()=>{deactivate();hud?.dispose?.();hud=null;disposeSwimmingEquipment(state.characterMesh);globalThis.removeEventListener?.('pagehide',checkpoint);},snapshot:()=>({active,resources:{...resources},lastDry})};
}
