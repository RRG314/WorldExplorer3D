import {resolveControlState} from '../transport/control-state.js';
import {createLifecycleScope} from '../runtime/lifecycle-scope.js?v=2';
import {createRaceSession} from './session-rules.js';
import {raceGridPose} from './course-rules.js';

export function canOwnRoadRace(context) {
 const control=resolveControlState(context);
 return !context.worldLoading && !context.onMoon && !context.onMars && !context.activePlanetaryBodyId && !context.getLiveGpsSnapshot?.().active &&
  control.frame==='surface' && control.controller==='drive' && control.occupancy==='driver';
}
// A subordinate road controller: the existing physics frame supplies dt/actions.
// It never installs a timer, writes a player pose or releases another transport.
export function createPracticeRaceController({context,course,profile,rivals=[],uid='practice-player',label='You',onChange=()=>{},onComplete=()=>{},isAdmitted=()=>true}) {
 const publication=context.worldPublication,vehicleId=context.car.personalVehicleId;
 const scope=createLifecycleScope('road-race:practice');let clock=0,sequence=0,started=false,latest=null;
 const session=createRaceSession({id:`practice:${crypto.randomUUID()}`,course,creatorUid:uid,createdAtMs:0,onComplete});
 const current=()=>scope.isActive()&&isAdmitted()&&context.worldPublication===publication&&context.car.personalVehicleId===vehicleId&&canOwnRoadRace(context);
 try {
  session.add({uid,label,profile});
  for(let i=0;i<rivals.length;i++)session.add({uid:`rival:${i}`,label:rivals[i].label,profile:rivals[i].profile,ai:true,difficulty:rivals[i].difficulty});
  session.setReady(uid,true);
 } catch(error){scope.dispose('invalid_race_roster');throw error;}
 function stop(reason='practice_closed') {if(scope.isActive()){latest=session.cancel(reason);scope.dispose(reason);}return session.snapshot();}
 return Object.freeze({uid,course,profile,isCurrent:current,
  start(){
   if(started||!current())throw Error('race_vehicle_or_world_changed');
   const grid=raceGridPose(course,0);
   // Normal surface admission proves the exact grid, including deck and water.
   if(!context.activateSurfaceActivity?.('drive',grid,{maxDistance:1}))throw Error('race_grid_no_longer_clear');
   if(!current())throw Error('race_vehicle_or_world_changed');
   latest=session.start(uid,0);started=true;onChange(latest);return latest;
  },
  step(dt,actions){
   if(!started||!current()){stop('race_vehicle_or_world_changed');return null;}
   if(!(dt>0&&dt<=1/30))throw Error('invalid_race_physics_step');
   clock+=dt*1000;
   if(['countdown','running'].includes(latest.phase))session.control(uid,sequence++,{
    steer:actions.steer||0,throttle:actions.throttle||0,reverse:actions.reverse||0,brake:actions.brake||0,serviceBrake:actions.serviceBrake||0},clock);
   latest=session.advance(clock);onChange(latest);
   const player=latest.players.find(p=>p.uid===uid),state=player?.vehicleState;
   if(!state)return null;
   // Timing retains the exact finish snapshot. The existing physics owner
   // receives a stationary handoff, so results/replay cannot release a car
   // still carrying race velocity into ordinary traffic.
   return player.progress?.finished||player.dnf?{...state,speed:0,vFwd:0,vLat:0,vx:0,vz:0,yawRate:0,
    steerAngle:0,steerSm:0,rearSlip:0,throttleSm:0,engineLoad:0,engineRpm:850,driveGear:1,shiftTime:0,driftAngle:0,isDrifting:false}:state;
  },snapshot:()=>latest||session.snapshot(),stop,
  dispose:()=>stop('practice_disposed')});
}
