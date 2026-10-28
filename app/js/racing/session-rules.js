import {createRaceProgress,advanceRaceProgress,raceGridPose}from'./course-rules.js';
import {createRaceVehicleState,stepRaceVehicle,raceVehicleGroundPose,snapshotRaceVehicle}from'./vehicle-controller.js';
import {raceAiActions}from'./ai-controller.js';
const STEP_MS=1000/60,NEUTRAL=Object.freeze({steer:0,throttle:0,reverse:0,brake:0,serviceBrake:1});
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
export function createRaceSession({id,course,creatorUid,createdAtMs,maximumDurationMs=600000,onComplete=()=>{}}){
 if(!id||!course||!creatorUid||!Number.isFinite(createdAtMs))throw Error('invalid_race_session');
 course=structuredClone(course);
 const players=new Map();let phase='lobby',leaderUid=creatorUid,startAtMs=null,tick=0,lastNow=createdAtMs,completedAtMs=null,reason='',outcomeEmitted=false;
 const activeHumans=()=>[...players.values()].filter(p=>!p.ai&&!p.left);
 function participant(uid){const p=players.get(uid);if(!p)throw Error('race_not_joined');return p;}
 function lobby(){if(phase!=='lobby')throw Error('race_roster_locked');}
 function add({uid,label,profile,ai=false,difficulty=.65}){
  lobby();if(!uid||players.has(uid)||players.size>=course.participants||(!ai&&String(uid).startsWith('rival:')))throw Error('race_roster_unavailable');
  const envelope=course.vehicleEnvelope||{widthMeters:2.35,lengthMeters:6.5,heightMeters:2.4},handling=profile?.handling;
  if(!handling||handling.width>envelope.widthMeters||handling.length>envelope.lengthMeters||handling.height>envelope.heightMeters)throw Error('race_vehicle_exceeds_course_envelope');
  const p={uid,label:String(label||'Explorer').slice(0,40),profile,ai:ai===true,difficulty:Math.max(0,Math.min(1,Number(difficulty)||.65)),ready:ai===true,
   slot:players.size,car:null,progress:null,lastSequence:-1,queue:[],actions:NEUTRAL,lastControlAt:-Infinity,disconnectedAt:null,left:false,dnf:false};
  players.set(uid,p);return snapshot();
 }
 function setReady(uid,ready){lobby();const p=participant(uid);if(p.ai)throw Error('race_rival_control_forbidden');p.ready=ready===true;return snapshot();}
 function start(uid,nowMs){
  lobby();if(uid!==leaderUid)throw Error('race_leader_required');
  if(players.size<1||!activeHumans().length||[...players.values()].some(p=>!p.ready))throw Error('race_not_ready');
  if(!Number.isFinite(nowMs)||nowMs<lastNow)throw Error('invalid_race_clock');
  startAtMs=nowMs+4000;lastNow=nowMs;phase='countdown';
  for(const p of players.values()){p.car=createRaceVehicleState(raceGridPose(course,p.slot),p.profile);stepRaceVehicle(course,p.car,NEUTRAL,1/60,p.profile);p.progress=createRaceProgress(raceVehicleGroundPose(p.car),startAtMs);}
  return snapshot();
 }
 function control(uid,sequence,actions,receivedAtMs){
  if(!['countdown','running'].includes(phase))throw Error('race_not_running');const p=participant(uid);
  if(p.ai||p.left||p.dnf||p.progress?.finished)throw Error('race_controls_unavailable');
  if(!Number.isSafeInteger(sequence)||sequence<=p.lastSequence||!Number.isFinite(receivedAtMs)||receivedAtMs<lastNow-1000)throw Error('obsolete_race_controls');
  const normalized=normalizeRaceActions(actions);
  if(phase==='countdown'&&receivedAtMs<startAtMs)p.queue=[];
  if(p.queue.length>=32)throw Error('race_controls_rate_limited');
  p.lastSequence=sequence;p.queue.push({actions:normalized,at:receivedAtMs});return true;
 }
 function disconnect(uid,nowMs){const p=participant(uid);if(p.ai)return;p.disconnectedAt=nowMs;p.queue=[];p.actions=NEUTRAL;}
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
  if(!['countdown','running'].includes(phase)||nowMs<startAtMs)return snapshot();
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
    stepRaceVehicle(course,p.car,actions,1/60,p.profile);
    p.progress=advanceRaceProgress(course,p.progress,raceVehicleGroundPose(p.car),frameAt,{startedAtMs:startAtMs});
   }
   finishIfComplete(frameAt);if(phase==='complete')break;
  }
  return snapshot();
 }
 function snapshot(){
  const ordered=[...players.values()].sort((a,b)=>a.dnf-b.dnf||(a.progress?.finished&&b.progress?.finished?a.progress.elapsedMs-b.progress.elapsedMs:a.progress?.finished?-1:b.progress?.finished?1:
   (b.progress?.lap||1)-(a.progress?.lap||1)||(b.progress?.nextGate||0)-(a.progress?.nextGate||0)));
  return {id,phase,reason,courseName:course.name,discipline:course.discipline,laps:course.laps,creatorUid,leaderUid,createdAtMs,startAtMs,
   serverAtMs:lastNow,simulationAtMs:startAtMs===null?null:startAtMs+tick*STEP_MS,completedAtMs,
   players:ordered.map((p,index)=>({uid:p.uid,label:p.label,ai:p.ai,vehicleId:p.profile.vehicleId,slot:p.slot,ready:p.ready,
    disconnected:p.disconnectedAt!==null,dnf:p.dnf,position:index+1,lastInputSequence:p.lastSequence,pose:p.car?raceVehicleGroundPose(p.car):null,
    speed:p.car?.speed||0,condition:p.car?.condition??p.profile.conditionValue,barrierContacts:p.car?.barrierContacts??0,
    vehicleState:snapshotRaceVehicle(p.car),
    progress:p.progress?{nextGate:p.progress.nextGate,lap:p.progress.lap,finished:p.progress.finished,elapsedMs:p.progress.elapsedMs??null,
     bestLapMs:p.progress.bestLapMs,lapTimes:[...p.progress.lapTimes],penaltyMs:p.progress.penaltyMs}:null}))};
 }
 return Object.freeze({add,setReady,start,control,advance,disconnect,reconnect,leave,snapshot,
  cancel(cancelReason='race_cancelled'){if(phase==='complete')return snapshot();phase='cancelled';reason=cancelReason;return snapshot();}});
}
