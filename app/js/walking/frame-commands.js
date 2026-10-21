import {captureEnvironmentSession} from '../session-coordinator.js?v=2';

// These are controller/frame commands, never geographic teleport authority.
export function createWalkingFrameCommands({context,state,car,carMesh,eyeHeight,pointInPolygon}) {
  const poseKeys=['x','y','z','angle','yaw','pitch','lookYawOffset','vy'];
  function captureFrameState() {
    const lease=captureEnvironmentSession();
    return Object.freeze({state,lease,mode:state.mode,view:state.view,
      walker:Object.freeze(Object.fromEntries(poseKeys.map(key=>[key,state.walker[key]]))),
      car:Object.freeze(Object.fromEntries(['x','y','z','angle'].map(key=>[key,car[key]]))),
      carVisible:carMesh?.visible,characterVisible:state.characterMesh?.visible});
  }
  function enterShipFrame(interior,point) {
    if(!context.activeShipInterior||context.activeInterior!==interior||interior?.environmentKind!=='expedition-ship'||
      !point||![point.x,point.y,point.z].every(Number.isFinite)||
      point.y<Number(interior.floorBaseY||0)+eyeHeight-.15||point.y>Number(interior.ceilingY||3.6)-.18||
      !pointInPolygon(point.x,point.z,interior.usableFootprint))return false;
    const collision=context.checkBuildingCollision?.(point.x,point.z,.35,{actorBaseY:point.y-eyeHeight,actorHeight:eyeHeight});
    if(collision?.collision)return false;
    context.clearControlInputState?.('ship-frame-entry');
    context.Walk?.deactivateWater?.();
    Object.assign(state.walker,{x:point.x,y:point.y,z:point.z,angle:0,yaw:0,pitch:0,lookYawOffset:0,vy:0,vx:0,vz:0,
      onGround:true,onBuilding:false,swimming:null,waterTraversal:'dry',_resolvedGroundState:null,_walkSupportFeature:null});
    state.mode='walk';state.view='first';
    Object.assign(car,{x:point.x,y:point.y-eyeHeight+1.2,z:point.z,angle:0,vx:0,vy:0,vz:0,speed:0});
    if(carMesh)carMesh.visible=false;
    if(state.characterMesh){state.characterMesh.visible=false;state.characterMesh.position.set(point.x,point.y-eyeHeight,point.z);state.characterMesh.rotation.y=0;}
    return true;
  }
  function restoreFrameState(saved) {
    if(!saved||saved.state!==state||!saved.lease?.isCurrent()||context.activeShipInterior||
      !['walk','drive'].includes(saved.mode)||![saved.walker?.x,saved.walker?.y,saved.walker?.z,saved.car?.x,saved.car?.y,saved.car?.z].every(Number.isFinite))return false;
    context.clearControlInputState?.('ship-frame-return');
    Object.assign(state.walker,saved.walker,{vx:0,vz:0,vy:0,_resolvedGroundState:null,_walkSupportFeature:null});
    Object.assign(car,saved.car,{vx:0,vy:0,vz:0,speed:0});
    state.mode=saved.mode;state.view=saved.view;
    if(carMesh){carMesh.position.set(car.x,car.y,car.z);carMesh.rotation.y=car.angle;carMesh.visible=saved.carVisible;}
    if(state.characterMesh){state.characterMesh.position.set(state.walker.x,state.walker.y-eyeHeight,state.walker.z);state.characterMesh.rotation.y=state.walker.angle;state.characterMesh.visible=saved.characterVisible;}
    return true;
  }
  return {captureFrameState,enterShipFrame,restoreFrameState};
}
