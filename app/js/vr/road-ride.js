import {createLifecycleScope} from '../runtime/lifecycle-scope.js?v=2';
import {resolveControlState} from '../transport/control-state.js';
import {activeActorPose} from '../transport/actor-contract.js';
import {isEarthWorldUsable} from '../earth-core/world-readiness.js';
import {roadWidthAtSegment} from '../world/road-cross-section-profile.js?v=1';
import {carSpeedToMph,carSpeedToWorldUnitsPerSecond,mphToCarSpeed} from '../physics/vehicle-speed-units.js?v=2';
const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const angle=value=>Math.atan2(Math.sin(value),Math.cos(value));
export const roadRideMustPause=ride=>['complete','road-unavailable','path-blocked','heading-changed','world-changed','arrival-changed'].includes(ride?.snapshot().status);
export function roadRideMessage(ride,paused){
  const state=ride?.snapshot();if(!state)return '';
  const name=state.name.length>26?state.name.slice(0,25)+'…':state.name;
  if(state.status==='complete')return 'Ride complete · Start for manual driving';
  if(['manual','disposed'].includes(state.status))return 'Manual driving';
  if(roadRideMustPause(ride))return 'Road ride ended · Start for manual driving';
  return name+' · '+(paused?'Look at Start to begin the ride':Math.round(state.progress*100)+'% of road ride');
}
function worldEligible(ctx){
  const control=resolveControlState(ctx);
  return ctx.gameStarted&&isEarthWorldUsable(ctx)&&ctx.getEnv?.()==='EARTH'&&!ctx.activeInterior&&!ctx.activeShipInterior&&!ctx.showLargeMap&&!ctx.fishingGame?.open&&!ctx.blockBuildMode&&control.frame==='surface'&&
    ['drive','walk'].includes(control.mode)&&!['water','vessel-deck'].includes(control.occupancy)&&!ctx.arSessionActive&&!ctx.getLiveGpsSnapshot?.().active;
}
function sources(ctx){
  const runtime=ctx.livingWorldRuntime,publication=ctx.worldPublication,graph=runtime?.publication?.trafficGraph;
  if(!worldEligible(ctx)||runtime?.disposed||runtime?.publication?.requestId!==publication?.requestId||graph?.type!=='TrafficGraph'||graph.schemaVersion!==2)return null;
  return {runtime,publication,graph};
}
function positionAt(edge,t){return {x:edge.p1.x+(edge.p2.x-edge.p1.x)*t,z:edge.p1.z+(edge.p2.z-edge.p1.z)*t};}
function surfaceAt(ctx,feature,edge,t){
  const sourceT=edge.direction==='reverse'?edge.sourceTEnd+(edge.sourceTStart-edge.sourceTEnd)*t:edge.sourceTStart+(edge.sourceTEnd-edge.sourceTStart)*t;
  const p=positionAt(edge,t),y=ctx.sampleFeatureSurfaceY?.(feature,p.x,p.z,{segIndex:edge.sourceSegIndex,t:sourceT});
  return {...p,y,sourceT};
}
function supported(ctx,feature,edge,t,halfWidth){
  const point=surfaceAt(ctx,feature,edge,t);if(!Number.isFinite(point.y))return null;
  const width=roadWidthAtSegment(feature,edge.sourceSegIndex,point.sourceT);
  if(width/2-Math.abs(edge.centerlineOffset)<halfWidth+.2*ctx.WORLD_UNITS_PER_METER)return null;
  const dx=(edge.p2.x-edge.p1.x)/edge.length,dz=(edge.p2.z-edge.p1.z)/edge.length;
  for(const offset of [-halfWidth,0,halfWidth]){
    const x=point.x-dz*offset,z=point.z+dx*offset,y=ctx.roadContactIndex?.sampleAt(x,z,point.y);
    if(!Number.isFinite(y)||Math.abs(y-point.y)>.25*ctx.WORLD_UNITS_PER_METER)return null;
  }
  if(ctx.checkBuildingCollision?.(point.x,point.z,halfWidth,{actorBaseY:point.y,actorHeight:2*ctx.WORLD_UNITS_PER_METER})?.collision)return null;
  return point;
}
function eligibleEdge(ctx,source,edge){
  const feature=source.runtime.trafficCompilation?.runtimeFeatureByEdge?.get(edge.id),ref=feature?.transportGraphRef;
  return feature&&ctx.roads?.includes(feature)&&feature.transportRecord?.safeForDriving===true&&ref?.driveable===true&&ref.graphId===ctx.transportNetworkModel?.id&&ref.routeState==='complete'&&
    ['mapped_transport','compiled_transport'].includes(edge.provenance)&&['forward','reverse'].includes(edge.direction)&&
    (edge.sourceDirection==='both'||edge.sourceDirection===edge.direction)&&edge.structure?.terrainMode!=='subgrade'&&
    !['motorway','motorway_link','trunk','trunk_link'].includes(edge.roadClass)&&Number.isFinite(edge.length)&&edge.length>0&&
    [edge.p1?.x,edge.p1?.z,edge.p2?.x,edge.p2?.z,edge.sourceTStart,edge.sourceTEnd,edge.centerlineOffset].every(Number.isFinite)?feature:null;
}
function corridor(ctx,feature,edge,startT,endT,halfWidth){
  const units=ctx.WORLD_UNITS_PER_METER,count=Math.max(1,Math.ceil((endT-startT)*edge.length/(2*units)));let first=null,last=null;
  for(let index=0;index<=count;index++){
    const p=supported(ctx,feature,edge,startT+(endT-startT)*index/count,halfWidth);
    if(!p||(ctx.transportDetail&&ctx.transportDetail.hasReadyCoverageAt?.(p,32*units)!==true)||(last&&Math.abs(p.y-last.y)>Math.hypot(p.x-last.x,p.z-last.z)*.08))return null;
    first||=p;last=p;
  }
  return {first,last};
}

// A short existing directed lane, ending before its junction. Reuse the living
// world's compiled access, driving side, lane offset and physical source edge.
// No A* duplicate, guessed connection, navigation display fallback or new data.
export function inspectLocalRoadRide(ctx){
  const source=sources(ctx),origin=activeActorPose(ctx),units=ctx.WORLD_UNITS_PER_METER;
  if(!source||!Number.isFinite(units)||units<=0||!Number.isFinite(ctx.METERS_PER_WORLD_UNIT)||Math.abs(units*ctx.METERS_PER_WORLD_UNIT-1)>1e-6||![origin.x,origin.z].every(Number.isFinite))return null;
  const buffer=8*units,minLength=16*units,maxLength=80*units,halfWidth=1.1*units;
  const candidates=[];
  for(const edge of source.graph.edges){
    const feature=eligibleEdge(ctx,source,edge);if(!feature||edge.length<minLength+buffer*2)continue;
    const startT=buffer/edge.length,endT=Math.min(1-buffer/edge.length,startT+maxLength/edge.length),start=positionAt(edge,startT),distance=Math.hypot(start.x-origin.x,start.z-origin.z);
    if(distance>150*units)continue;
    candidates.push({edge,feature,startT,endT,distance,length:(endT-startT)*edge.length});
  }
  candidates.sort((a,b)=>a.distance-b.distance||b.length-a.length||a.edge.id.localeCompare(b.edge.id));
  for(const candidate of candidates.slice(0,64)){
    const {edge,feature,startT,endT,length}=candidate,checked=corridor(ctx,feature,edge,startT,endT,halfWidth);if(!checked)continue;
    const {first,last}=checked;
    const yaw=Math.atan2(edge.p2.x-edge.p1.x,edge.p2.z-edge.p1.z);
    return Object.freeze({type:'VrRoadRide',schemaVersion:1,requestId:source.publication.requestId,sequence:source.publication.sequence,graphId:ctx.transportNetworkModel.id,
      edgeId:edge.id,sourceFeatureId:edge.sourceFeatureId,name:String(feature.name||'Local road'),startT,endT,length,halfWidth,
      start:Object.freeze({x:first.x,y:first.y,z:first.z,yaw}),end:Object.freeze({x:last.x,y:last.y,z:last.z}),metersPerWorldUnit:ctx.METERS_PER_WORLD_UNIT});
  }
  return null;
}

// Own only a route intent and action sample. The existing ground-arrival owner
// admits preparation; the existing car controller remains its sole pose writer.
export function createLocalRoadRide(ctx,plan,{captureSession}){
  let source=sources(ctx),edge=source?.graph.edges.find(row=>row.id===plan?.edgeId),feature=edge&&eligibleEdge(ctx,source,edge);
  if(plan?.type!=='VrRoadRide'||plan.schemaVersion!==1||!source||!feature||plan.requestId!==source.publication.requestId||plan.sequence!==source.publication.sequence||plan.graphId!==ctx.transportNetworkModel.id||
    ![plan.startT,plan.endT,plan.length,plan.halfWidth].every(Number.isFinite)||plan.startT<0||plan.endT>1||plan.startT>=plan.endT||plan.length>80*ctx.WORLD_UNITS_PER_METER+.01||
    Math.abs(plan.length-(plan.endT-plan.startT)*edge.length)>.01||Math.abs(plan.halfWidth-1.1*ctx.WORLD_UNITS_PER_METER)>1e-6||plan.metersPerWorldUnit!==ctx.METERS_PER_WORLD_UNIT||plan.sourceFeatureId!==edge.sourceFeatureId||
    plan.startT*edge.length<8*ctx.WORLD_UNITS_PER_METER-.01||(1-plan.endT)*edge.length<8*ctx.WORLD_UNITS_PER_METER-.01||!corridor(ctx,feature,edge,plan.startT,plan.endT,plan.halfWidth))throw new Error('This road ride is no longer available.');
  const world=captureSession(),scope=createLifecycleScope('vr-road-ride');
  let car=ctx.car,mesh=ctx.carMesh,status='prepared',reason='',progress=0,canMove=false,actions=null,lastObstacleAt=-Infinity,blocked=false;
  const current=()=>source&&world.isCurrent()&&sources(ctx)?.runtime===source.runtime&&ctx.worldPublication===source.publication&&ctx.car===car&&ctx.carMesh===mesh&&source.runtime.trafficCompilation?.runtimeFeatureByEdge?.get(edge.id)===feature;
  function stop(next='cancelled'){
    if(!source)return;status=next;reason=next;canMove=false;actions=null;scope.dispose(next);source=null;edge=null;feature=null;car=null;mesh=null;
  }
  function obstacleAhead(distance){
    const units=ctx.WORLD_UNITS_PER_METER,dx=Math.sin(car.angle),dz=Math.cos(car.angle),population=source.runtime.population,urban=ctx.urbanSandboxRuntime;
    const nearby=[...(population?.nearbyVehicles?.(car,distance+6*units)||[]),...(population?.nearbyPedestrians?.(car,distance+6*units)||[]),
      ...(urban?.vehicles||[]).filter(vehicle=>!vehicle.attachedToPlayer).map(vehicle=>vehicle.mesh?.position||vehicle)];
    return nearby.some(actor=>{
      const x=actor.x-car.x,z=actor.z-car.z,along=x*dx+z*dz,lateral=Math.abs(x*dz-z*dx);
      return along>0&&along<distance+4*units&&lateral<2.1*units&&(!Number.isFinite(actor.y)||Math.abs(actor.y-(car.y-1.2))<3*units);
    });
  }
  scope.listen(world.signal,'abort',()=>stop('world-changed'));
  return Object.freeze({
    admit(){
      if(status!=='prepared'||!current()||!worldEligible(ctx))return false;
      const start=surfaceAt(ctx,feature,edge,plan.startT),end=surfaceAt(ctx,feature,edge,plan.endT),yaw=Math.atan2(end.x-start.x,end.z-start.z);
      if(!supported(ctx,feature,edge,plan.startT,plan.halfWidth)||ctx.activateSurfaceActivity?.('drive',{...start,yaw},{maxDistance:.25*ctx.WORLD_UNITS_PER_METER})!==true)return false;
      if(!current()||resolveControlState(ctx).mode!=='drive'||Math.hypot(car.x-start.x,car.z-start.z)>.3*ctx.WORLD_UNITS_PER_METER||Math.abs(angle(car.angle-yaw))>.2){stop('arrival-changed');return false;}
      status='ready';return true;
    },
    step(frame,enabled){
      canMove=false;actions=null;if(!['ready','running','braking'].includes(status))return;
      if(!current()||resolveControlState(ctx).mode!=='drive'){stop('world-changed');return;}
      if(!enabled)return;
      const dx=edge.p2.x-edge.p1.x,dz=edge.p2.z-edge.p1.z,t=((car.x-edge.p1.x)*dx+(car.z-edge.p1.z)*dz)/(edge.length*edge.length),point=positionAt(edge,t),units=ctx.WORLD_UNITS_PER_METER;
      const lateral=Math.hypot(car.x-point.x,car.z-point.z),remaining=(plan.endT-t)*edge.length;
      if(car.isAirborne===true||![car.x,car.y,car.z,car.angle,car.speed,t].every(Number.isFinite)||lateral>plan.halfWidth||remaining<-.5*units||!supported(ctx,feature,edge,clamp(t,plan.startT,plan.endT),plan.halfWidth)||(ctx.transportDetail&&ctx.transportDetail.hasReadyCoverageAt?.(car,32*units)!==true)){stop('road-unavailable');return;}
      progress=Math.max(progress,clamp((t-plan.startT)/(plan.endT-plan.startT)));
      const speed=Math.abs(carSpeedToWorldUnitsPerSecond(car.speed,plan.metersPerWorldUnit));
      if(frame.timestamp-lastObstacleAt>=100){lastObstacleAt=frame.timestamp;blocked=obstacleAhead(Math.max(4*units,speed*speed/(.8*units)+3*units));}
      if(blocked){stop('path-blocked');return;}
      if(remaining<2*units&&Math.abs(carSpeedToMph(car.speed))<.3&&Math.abs(carSpeedToMph(car.vFwd||0))<.3){progress=1;stop('complete');return;}
      const look=clamp(t+Math.max(5*units,speed*1.6)/edge.length,plan.startT,plan.endT),target=positionAt(edge,look),error=angle(Math.atan2(target.x-car.x,target.z-car.z)-car.angle);
      if(Math.abs(error)>.6){stop('heading-changed');return;}
      const targetMph=Math.min(4,Math.sqrt(Math.max(0,2*.3*(remaining/units-2)))/.44704),targetSpeed=mphToCarSpeed(targetMph),delta=targetSpeed-car.speed;
      status=delta<-.4?'braking':'running';canMove=true;
      actions={turn:clamp(error*2-(car.yawRate||0)*.5,-.6,.6),steer:clamp(error*2-(car.yawRate||0)*.5,-.6,.6),
        throttle:delta>.3?clamp(delta*.025,.06,.12):0,reverse:0,serviceBrake:delta<-.3?clamp(-delta*.08,.12,.35):0};
    },
    readActions(mode,manual={}){
      if(mode!=='drive'||!canMove||!actions)return null;
      if(['move','turn','steer','throttle','reverse','brake','serviceBrake','boost'].some(key=>Math.abs(Number(manual[key])||0)>.025)){stop('manual');return null;}
      return actions;
    },
    takeManual(){if(source)stop('manual');else{status=reason='manual';canMove=false;actions=null;}},
    snapshot:()=>({status,reason,progress,name:plan.name,lengthMeters:Math.round(plan.length*plan.metersPerWorldUnit)}),
    dispose:()=>stop('disposed')
  });
}
