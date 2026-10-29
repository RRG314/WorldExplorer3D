import {canOwnRoadRace} from './road-activity-controller.js';
import {createRaceVehicleProfile,stepRaceVehicle,snapshotRaceVehicle} from './vehicle-controller.js';
import {RACE_PHYSICS_VERSION} from './record-rules.js';
const stopped=state=>({...state,speed:0,vFwd:0,vLat:0,vx:0,vz:0,yawRate:0,steerAngle:0,steerSm:0,rearSlip:0,throttleSm:0,engineLoad:0,engineRpm:850,driveGear:1,shiftTime:0,driftAngle:0,isDrifting:false});
export function raceNetworkProfile(configuration){
 if(configuration?.physicsVersion!==RACE_PHYSICS_VERSION)throw Error('race_physics_version_changed');
 const base=createRaceVehicleProfile(configuration.vehicleId,{condition:configuration.condition,grip:configuration.grip});
 if(!configuration.upgrades||Object.keys(configuration.upgrades).sort().join()!==Object.keys(base.upgrades).sort().join()||
  Object.values(configuration.upgrades).some(n=>!Number.isFinite(n)||n<0||n>10))throw Error('invalid_race_vehicle_setup');
 return Object.freeze({...base,upgrades:Object.freeze({...configuration.upgrades})});
}

// Prediction is presentation of the local actor through the existing road
// physics delegate. Every server snapshot corrects it; only server timing wins.
export function createNetworkRaceController({context,course,connection,uid,isAdmitted=()=>true,onComplete=()=>{}}){
 const publication=context.worldPublication,vehicleId=context.car.personalVehicleId;
 const initial=connection.snapshot(),profile=raceNetworkProfile(initial.profiles[uid]);
 let active=true,started=false,latest=initial,observed=null,frame=null,completed=false;
 const current=()=>active&&isAdmitted()&&context.worldPublication===publication&&context.car.personalVehicleId===vehicleId&&canOwnRoadRace(context);
 return Object.freeze({uid,course,profile,isNetworkRace:true,isCurrent:current,isConnectionFresh:()=>connection.connected()&&connection.isFresh?.()!==false,
  start(){if(!current()||started)throw Error('race_vehicle_or_world_changed');const player=initial.players.find(p=>p.uid===uid);
   if(!player?.pose||!context.activateSurfaceActivity?.('drive',player.pose,{maxDistance:1}))throw Error('race_grid_no_longer_clear');started=true;},
  step(dt,actions){
   if(!started||!current())return null;
   const next=connection.snapshot();if(next.id!==initial.id||next.physicsVersion!==RACE_PHYSICS_VERSION)return null;latest=next;
   const player=latest.players.find(p=>p.uid===uid);if(!player?.vehicleState)return null;
   if(observed!==latest){observed=latest;frame={...player.vehicleState};}
   if(latest.phase==='complete'&&latest.settlement==='saved'&&!completed){completed=true;onComplete(latest);}
   if(player.progress?.finished||player.dnf||!connection.connected()||connection.isFresh?.()===false||!['running','countdown'].includes(latest.phase))return stopped(frame);
   connection.control(actions);
   if(latest.phase==='running')stepRaceVehicle(course,frame,actions,dt,profile);
   return snapshotRaceVehicle(frame);
  },snapshot:()=>connection.snapshot(),stop(){active=false;connection.stop();},dispose(){active=false;connection.stop();}
 });
}
