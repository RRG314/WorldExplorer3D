import {canOwnRoadRace} from './road-activity-controller.js';
import {createRaceVehicleProfile,stepRaceVehicle,snapshotRaceVehicle,raceVehicleGroundPose} from './vehicle-controller.js';
import {racePhysicsVersion} from './record-rules.js';
import {raceFormationActions} from './ai-controller.js';
const stopped=state=>({...state,speed:0,vFwd:0,vLat:0,vx:0,vz:0,yawRate:0,steerAngle:0,steerSm:0,rearSlip:0,throttleSm:0,engineLoad:0,engineRpm:850,driveGear:1,shiftTime:0,driftAngle:0,isDrifting:false});
export function raceNetworkProfile(configuration,course){
 if(configuration?.physicsVersion!==racePhysicsVersion(course))throw Error('race_physics_version_changed');
 const base=createRaceVehicleProfile(configuration.vehicleId,{condition:configuration.condition,grip:configuration.grip});
 if(!configuration.upgrades||Object.keys(configuration.upgrades).sort().join()!==Object.keys(base.upgrades).sort().join()||
  Object.values(configuration.upgrades).some(n=>!Number.isFinite(n)||n<0||n>10))throw Error('invalid_race_vehicle_setup');
 return Object.freeze({...base,upgrades:Object.freeze({...configuration.upgrades})});
}

// Prediction is presentation of the local actor through the existing road
// physics delegate. Every server snapshot corrects it; only server timing wins.
export function createNetworkRaceController({context,course,connection,uid,isAdmitted=()=>true,onComplete=()=>{}}){
 const publication=context.worldPublication,vehicleId=context.car.personalVehicleId;
 const initial=connection.snapshot(),profile=raceNetworkProfile(initial.profiles[uid],course),physicsVersion=racePhysicsVersion(course);
 if(initial.physicsVersion!==physicsVersion)throw Error('race_physics_version_changed');
 let active=true,started=false,latest=initial,observed=null,previous=null,viewElapsedMs=0,frame=null,completed=false;
 const current=()=>active&&isAdmitted()&&context.worldPublication===publication&&context.car.personalVehicleId===vehicleId&&canOwnRoadRace(context);
 return Object.freeze({uid,course,profile,isNetworkRace:true,isCurrent:current,isConnectionFresh:()=>connection.connected()&&connection.isFresh?.()!==false,
  start(){if(!current()||started)throw Error('race_vehicle_or_world_changed');const player=initial.players.find(p=>p.uid===uid);
   if(!player?.pose||!context.activateSurfaceActivity?.('drive',player.pose,{maxDistance:1}))throw Error('race_grid_no_longer_clear');started=true;},
  step(dt,actions){
   if(!started||!current())return null;
   const next=connection.snapshot();if(next.id!==initial.id||next.physicsVersion!==physicsVersion)return null;latest=next;
   const player=latest.players.find(p=>p.uid===uid);if(!player?.vehicleState)return null;
   if(observed!==latest){previous=observed;observed=latest;viewElapsedMs=0;frame={...player.vehicleState};}
   viewElapsedMs+=dt*1000;
   if(latest.phase==='complete'&&latest.settlement==='saved'&&!completed){completed=true;onComplete(latest);}
   if(player.progress?.finished||player.dnf||!connection.connected()||connection.isFresh?.()===false||!['running','countdown'].includes(latest.phase))return stopped(frame);
   connection.control(actions);
   if(latest.phase==='running')stepRaceVehicle(course,frame,actions,dt,profile);
   else if(course.discipline==='oval')stepRaceVehicle(course,frame,raceFormationActions(course,frame,player.progress,profile,player.slot),dt,profile);
   return snapshotRaceVehicle(frame);
  },snapshot:()=>connection.snapshot(),presentationSnapshot(){
   // Reuse this controller's two observed authority packets. Rival display
   // follows one packet behind; no renderer timer or second actor owner.
   if(!previous||previous.id!==latest.id||latest.phase==='complete')return latest;
   const alpha=Math.max(0,Math.min(1,viewElapsedMs/Math.max(1,latest.serverAtMs-previous.serverAtMs)));
   return {...latest,players:latest.players.map(p=>{
    if(p.uid===uid&&frame)return {...p,vehicleState:frame,pose:raceVehicleGroundPose(frame)};
    const before=previous.players.find(q=>q.uid===p.uid)?.vehicleState;
    if(!before||!p.vehicleState||p.dnf||p.progress?.finished)return p;
    const state={...p.vehicleState};for(const key of ['x','y','z','terrainPitch','terrainRoll'])state[key]=before[key]+(state[key]-before[key])*alpha;
    const turn=state.angle-before.angle;state.angle=before.angle+Math.atan2(Math.sin(turn),Math.cos(turn))*alpha;
    return {...p,vehicleState:state,pose:raceVehicleGroundPose(state)};
   })};
  },stop(){active=false;previous=observed=null;connection.stop();},dispose(){active=false;previous=observed=null;connection.stop();}
 });
}
