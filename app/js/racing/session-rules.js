import {createRaceProgress,advanceRaceProgress,raceGridPose,prepareRaceCourseGeometry}from'./course-rules.js';
import {createRaceVehicleState,stepRaceVehicle,raceVehicleGroundPose,snapshotRaceVehicle}from'./vehicle-controller.js';
import {raceAiActions,raceFormationActions}from'./ai-controller.js';
import {OVAL_FORMATION_DURATION_MS,OVAL_PACE_METERS_PER_SECOND} from './oval-rules.js';
import {mphToCarSpeed,METERS_PER_SECOND_PER_MPH} from '../physics/vehicle-speed-units.js';
import {raceMaximumDurationMs} from './session-limits.js';
export {RACE_MAXIMUM_DURATION_MS} from './session-limits.js';
const STEP_MS=1000/60,NEUTRAL=Object.freeze({steer:0,throttle:0,reverse:0,brake:0,serviceBrake:1});
const FORMATION_MS=OVAL_FORMATION_DURATION_MS,FORMATION_TICKS=Math.round(FORMATION_MS/STEP_MS);
const ACTIONS=new Set(['steer','throttle','reverse','brake','serviceBrake']);
export function normalizeRaceActions(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!ACTIONS.has(key)))throw Error('invalid_race_controls');
 const result={};for(const key of ACTIONS){const n=value[key]??0;if(typeof n!=='number'||!Number.isFinite(n)||n<(key==='steer'?-1:0)||n>1)throw Error('invalid_race_controls');result[key]=n;}
 return result;
}

// A session owns only its race actors, order and clock. Identity, room admission,
// canonical courses and durable reward transactions are supplied by the existing
// application/backend. Browser practice uses the same rules without verified
// rewards. No timer, database, renderer, global room registry or wallet here.
export function createRaceSession({id,course,creatorUid,createdAtMs,maximumDurationMs,onComplete=()=>{}}){
 if(!id||!course||!creatorUid||!Number.isFinite(createdAtMs))throw Error('invalid_race_session');
 const allowedDurationMs=raceMaximumDurationMs(course);
 maximumDurationMs??=allowedDurationMs;
 if(!Number.isFinite(maximumDurationMs)||maximumDurationMs<=0||maximumDurationMs>allowedDurationMs)throw Error('invalid_race_duration');
 course=prepareRaceCourseGeometry(structuredClone(course));
 const rolling=course.discipline==='oval',players=new Map();let phase='lobby',leaderUid=creatorUid,startAtMs=null,tick=0,formationTick=0,formationComplete=false,lastNow=createdAtMs,completedAtMs=null,reason='',outcomeEmitted=false;
 const activeHumans=()=>[...players.values()].filter(p=>!p.ai&&!p.left);
 function participant(uid){const p=players.get(uid);if(!p)throw Error('race_not_joined');return p;}
 function lobby(){if(phase!=='lobby')throw Error('race_roster_locked');}
 function add({uid,label,profile,ai=false,difficulty=.65}){
  lobby();if(!uid||players.has(uid)||players.size>=course.participants||(!ai&&String(uid).startsWith('rival:')))throw Error('race_roster_unavailable');
  const envelope=course.vehicleEnvelope||{widthMeters:2.35,lengthMeters:6.5,heightMeters:2.4},handling=profile?.handling;
  if(!handling||handling.width>envelope.widthMeters||handling.length>envelope.lengthMeters||handling.height>envelope.heightMeters)throw Error('race_vehicle_exceeds_course_envelope');
  const p={uid,label:String(label||'Explorer').slice(0,40),profile,ai:ai===true,difficulty:Math.max(0,Math.min(1,Number(difficulty)||.65)),ready:ai===true,
   slot:players.size,car:null,previousFrame:null,progress:null,lastSequence:-1,queue:[],actions:NEUTRAL,lastControlAt:-Infinity,disconnectedAt:null,left:false,dnf:false};
  players.set(uid,p);for(const other of players.values())if(!other.ai)other.ready=false;return snapshot();
 }
 function setReady(uid,ready){lobby();const p=participant(uid);if(p.ai)throw Error('race_rival_control_forbidden');p.ready=ready===true;return snapshot();}
 function start(uid,nowMs){
  lobby();if(uid!==leaderUid)throw Error('race_leader_required');
  if(players.size<1||!activeHumans().length||[...players.values()].some(p=>!p.ready||p.disconnectedAt!==null))throw Error('race_not_ready');
  if(!Number.isFinite(nowMs)||nowMs<lastNow)throw Error('invalid_race_clock');
  startAtMs=nowMs+FORMATION_MS;lastNow=nowMs;phase='countdown';
  for(const p of players.values()){
   p.car=createRaceVehicleState(raceGridPose(course,p.slot),p.profile);
   stepRaceVehicle(course,p.car,NEUTRAL,1/60,p.profile);
   // Resolve support while stationary, then seed rolling velocity. Integrating
   // pace during initialization would move outside the owned session clock.
   if(rolling)p.car.speed=p.car.vFwd=mphToCarSpeed(OVAL_PACE_METERS_PER_SECOND/METERS_PER_SECOND_PER_MPH);
   p.previousFrame=snapshotRaceVehicle(p.car);p.progress=createRaceProgress(raceVehicleGroundPose(p.car),startAtMs);
  }
  return snapshot();
 }
 function control(uid,sequence,actions,receivedAtMs){
  const p=participant(uid);
  // A valid packet sent before the crossing can arrive after it. The terminal
  // actor/result is immutable; acknowledge that input by doing no work.
  if(!p.ai&&!p.left&&(phase==='complete'||p.progress?.finished)){
   if(!Number.isSafeInteger(sequence)||sequence<0||!Number.isFinite(receivedAtMs))throw Error('obsolete_race_controls');
   normalizeRaceActions(actions);return false;
  }
  if(!['countdown','running'].includes(phase))throw Error('race_not_running');
  if(p.ai||p.left||p.dnf||p.progress?.finished)throw Error('race_controls_unavailable');
  if(!Number.isSafeInteger(sequence)||sequence<=p.lastSequence||!Number.isFinite(receivedAtMs)||receivedAtMs<lastNow-1000)throw Error('obsolete_race_controls');
  const normalized=normalizeRaceActions(actions);
  if(phase==='countdown'&&receivedAtMs<startAtMs)p.queue=[];
  if(p.queue.length>=32)throw Error('race_controls_rate_limited');
  p.lastSequence=sequence;p.queue.push({actions:normalized,at:receivedAtMs});return true;
 }
 function disconnect(uid,nowMs){const p=participant(uid);if(p.ai)return;p.disconnectedAt=nowMs;if(phase==='lobby')p.ready=false;p.queue=[];p.actions=NEUTRAL;}
 function reconnect(uid,nowMs){const p=participant(uid);if(p.progress?.finished)return snapshot();if(p.left||p.dnf||p.disconnectedAt!==null&&nowMs-p.disconnectedAt>10000)throw Error('race_reconnect_expired');p.disconnectedAt=null;p.queue=[];p.actions=NEUTRAL;return snapshot();}
 function leave(uid,nowMs){
  const p=participant(uid);if(phase==='lobby'){players.delete(uid);for(const [index,row]of [...players.values()].entries())row.slot=index;if(uid===leaderUid)leaderUid=activeHumans()[0]?.uid||'';if(!activeHumans().length){phase='cancelled';reason='race_empty';}}
  else{p.left=true;p.dnf=!p.progress?.finished;p.queue=[];p.actions=NEUTRAL;p.disconnectedAt=nowMs;}
  return snapshot();
 }
 function finishIfComplete(nowMs){
  if([...players.values()].every(p=>p.dnf||p.progress?.finished)||nowMs-startAtMs>=maximumDurationMs){
   for(const p of players.values())if(!p.progress?.finished)p.dnf=true;
   phase='complete';completedAtMs=nowMs;
   if(!outcomeEmitted){outcomeEmitted=true;onComplete(snapshot());}
  }
 }
 function advance(nowMs){
  if(!Number.isFinite(nowMs)||nowMs<lastNow)throw Error('invalid_race_clock');lastNow=nowMs;
  if(phase==='lobby'){if(nowMs-createdAtMs>300000){phase='cancelled';reason='race_lobby_expired';}return snapshot();}
  if(!['countdown','running'].includes(phase))return snapshot();
  if(rolling&&!formationComplete){
   const target=Math.min(FORMATION_TICKS,Math.floor((Math.min(nowMs,startAtMs)-(startAtMs-FORMATION_MS))/STEP_MS+1e-9));
   if(target-formationTick>30){phase='cancelled';reason='race_authority_stalled';return snapshot();}
   while(formationTick<target){
    formationTick++;
    for(const p of players.values()){
     if(p.dnf||p.left)continue;
     p.previousFrame=snapshotRaceVehicle(p.car);
     const actions=p.disconnectedAt!==null?NEUTRAL:raceFormationActions(course,p.car,p.progress,p.profile,p.slot);
     stepRaceVehicle(course,p.car,actions,1/60,p.profile);
    }
   }
   if(nowMs>=startAtMs){
    formationComplete=true;
    for(const p of players.values()){p.progress=createRaceProgress(raceVehicleGroundPose(p.car),startAtMs);p.queue=[];p.actions=NEUTRAL;p.lastControlAt=-Infinity;}
   }
  }
  if(nowMs<startAtMs)return snapshot();
  phase='running';const targetTick=Math.floor((nowMs-startAtMs)/STEP_MS);
  // Caller supplies one bounded session clock. A stalled authority cancels
  // rather than dropping physics steps while awarding an implausible time.
  if(targetTick-tick>30){phase='cancelled';reason='race_authority_stalled';return snapshot();}
  while(tick<targetTick){
   tick++;const frameAt=startAtMs+tick*STEP_MS;
   for(const p of players.values()){
    if(p.dnf||p.progress.finished)continue;
    if(p.disconnectedAt!==null&&frameAt-p.disconnectedAt>10000){p.dnf=true;continue;}
    while(p.queue.length&&p.queue[0].at<=frameAt){const command=p.queue.shift();p.actions=command.actions;p.lastControlAt=command.at;}
    const actions=p.ai?raceAiActions(course,p.car,p.progress,p.profile,{difficulty:p.difficulty}):p.disconnectedAt!==null||frameAt-p.lastControlAt>400?NEUTRAL:p.actions;
    p.previousFrame=snapshotRaceVehicle(p.car);
    stepRaceVehicle(course,p.car,actions,1/60,p.profile);
    p.progress=advanceRaceProgress(course,p.progress,raceVehicleGroundPose(p.car),frameAt,{startedAtMs:startAtMs});
   }
   finishIfComplete(frameAt);if(phase==='complete')break;
  }
  return snapshot();
 }
 function snapshot(presentation=false){
  const ordered=[...players.values()].sort((a,b)=>a.dnf-b.dnf||(a.progress?.finished&&b.progress?.finished?a.progress.elapsedMs-b.progress.elapsedMs:a.progress?.finished?-1:b.progress?.finished?1:
   (b.progress?.lap||1)-(a.progress?.lap||1)||(b.progress?.nextGate||0)-(a.progress?.nextGate||0)));
  let previousPosition=0;
  return {id,phase,reason,courseName:course.name,discipline:course.discipline,laps:course.laps,creatorUid,leaderUid,createdAtMs,startAtMs,maximumDurationMs,
   serverAtMs:lastNow,simulationAtMs:startAtMs===null?null:rolling&&!formationComplete?startAtMs-FORMATION_MS+formationTick*STEP_MS:startAtMs+tick*STEP_MS,completedAtMs,
   ...(rolling?{raceControl:{start:'rolling',flag:phase==='countdown'?'formation':phase==='complete'?'chequered':'green',paceMetersPerSecond:OVAL_PACE_METERS_PER_SECOND}}:{}),
   players:ordered.map((p,index)=>{const previous=ordered[index-1],tied=!p.dnf&&p.progress?.finished&&previous?.progress?.finished&&p.progress.elapsedMs===previous.progress.elapsedMs;
    const position=tied?previousPosition:index+1;previousPosition=position;
    const frame=snapshotRaceVehicle(p.car);
    // The render clock can fall between fixed ticks, including frames with no
    // tick or two ticks. Sample the last two accepted frames with one tick of
    // latency; damping the camera cannot repair a body that repeats then jumps.
    // This is only a view. Gates, results, controls and the authoritative car
    // retain their exact fixed-step state. Terminal handoff is exact as well.
    if(presentation&&(phase==='running'||rolling&&phase==='countdown')&&!p.dnf&&!p.progress?.finished&&p.previousFrame&&frame){
     const clockBase=rolling&&!formationComplete?startAtMs-FORMATION_MS:startAtMs,clockTick=rolling&&!formationComplete?formationTick:tick,
      alpha=Math.max(0,Math.min(1,(lastNow-clockBase-clockTick*STEP_MS)/STEP_MS));
     for(const key of ['x','y','z','terrainPitch','terrainRoll'])frame[key]=p.previousFrame[key]+(frame[key]-p.previousFrame[key])*alpha;
     const turn=frame.angle-p.previousFrame.angle;
     frame.angle=p.previousFrame.angle+Math.atan2(Math.sin(turn),Math.cos(turn))*alpha;
    }
    return {uid:p.uid,label:p.label,ai:p.ai,vehicleId:p.profile.vehicleId,slot:p.slot,ready:p.ready,
    disconnected:p.disconnectedAt!==null,dnf:p.dnf,position,lastInputSequence:p.lastSequence,pose:frame?raceVehicleGroundPose(frame):null,
    speed:p.car?.speed||0,condition:p.car?.condition??p.profile.conditionValue,barrierContacts:p.car?.barrierContacts??0,
    vehicleState:frame,
    progress:p.progress?{nextGate:p.progress.nextGate,lap:p.progress.lap,finished:p.progress.finished,elapsedMs:p.progress.elapsedMs??null,
     bestLapMs:p.progress.bestLapMs,lapTimes:[...p.progress.lapTimes],penaltyMs:p.progress.penaltyMs}:null};})};
 }
 return Object.freeze({add,setReady,start,control,advance,disconnect,reconnect,leave,snapshot:()=>snapshot(),presentationSnapshot:()=>snapshot(true),
  cancel(cancelReason='race_cancelled'){if(phase==='complete')return snapshot();phase='cancelled';reason=cancelReason;return snapshot();}});
}
