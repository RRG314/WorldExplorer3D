import {createRaceProgress,advanceRaceProgress,raceGridPose,prepareRaceCourseGeometry,projectRacePosition,raceProjectionOutsidePavement}from'./course-rules.js';
import {createRaceVehicleState,stepRaceVehicle,raceVehicleGroundPose,snapshotRaceVehicle,raceVehicleSpeedMetersPerSecond}from'./vehicle-controller.js';
import {raceAiActions,raceFormationActions}from'./ai-controller.js';
import {OVAL_FORMATION_DURATION_MS,OVAL_PACE_METERS_PER_SECOND,OVAL_CAUTION_DURATION_MS,OVAL_ORDER_PENALTY_MS,OVAL_MERGE_CLEARANCE_METERS,ovalTrackZone,ovalPaceActions,ovalDistanceGap,ovalDraftActor,ovalDraftReduction} from './oval-rules.js';
import {mphToCarSpeed,METERS_PER_SECOND_PER_MPH} from '../physics/vehicle-speed-units.js?v=2';
import {raceMaximumDurationMs} from './session-limits.js';
import {createRacePitGeometry,racePitEntryNearby,racePitGateCrossing,racePitMappedDistance,racePitPavementAt,circuitPitPaceActions,CIRCUIT_PIT_SPEED_METERS_PER_SECOND,CIRCUIT_PIT_PENALTY_MS,CIRCUIT_PIT_MERGE_CLEARANCE_METERS} from './pit-lane-rules.js';
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
 if(course.pitLane&&!['oval','circuit'].includes(course.discipline))throw Error('race_pit_discipline_unavailable');
 const allowedDurationMs=raceMaximumDurationMs(course);
 maximumDurationMs??=allowedDurationMs;
 if(!Number.isFinite(maximumDurationMs)||maximumDurationMs<=0||maximumDurationMs>allowedDurationMs)throw Error('invalid_race_duration');
 course=prepareRaceCourseGeometry(structuredClone(course));
 const rolling=course.discipline==='oval',pitGeometry=createRacePitGeometry(course),players=new Map();let phase='lobby',leaderUid=creatorUid,startAtMs=null,tick=0,formationTick=0,formationComplete=false,lastNow=createdAtMs,completedAtMs=null,reason='',outcomeEmitted=false,cautionUntilMs=0;
 const activeHumans=()=>[...players.values()].filter(p=>!p.ai&&!p.left);
 function participant(uid){const p=players.get(uid);if(!p)throw Error('race_not_joined');return p;}
 function lobby(){if(phase!=='lobby')throw Error('race_roster_locked');}
 function add({uid,label,profile,ai=false,difficulty=.65}){
  lobby();if(!uid||players.has(uid)||players.size>=course.participants||(!ai&&String(uid).startsWith('rival:')))throw Error('race_roster_unavailable');
  const envelope=course.vehicleEnvelope||{widthMeters:2.35,lengthMeters:6.5,heightMeters:2.4},handling=profile?.handling;
  if(!handling||handling.width>envelope.widthMeters||handling.length>envelope.lengthMeters||handling.height>envelope.heightMeters)throw Error('race_vehicle_exceeds_course_envelope');
  const p={uid,label:String(label||'Explorer').slice(0,40),profile,ai:ai===true,difficulty:Math.max(0,Math.min(1,Number(difficulty)||.65)),ready:ai===true,
   slot:players.size,car:null,previousFrame:null,progress:null,lastSequence:-1,queue:[],actions:NEUTRAL,lastControlAt:-Infinity,disconnectedAt:null,left:false,dnf:false,
   ovalZone:null,ovalRestricted:false,ovalPassed:new Set(),ovalPenaltyReason:null,ovalDraft:0,pitProgress:null,pitTimingProgress:null,pitCommitted:false,pitEnteredAt:null,pitEntrySpeed:0,pitVisits:0,pitSpeedPenalized:false,pitPenaltyReason:null};
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
 function caution(nowMs){if(rolling&&phase==='running')cautionUntilMs=Math.max(cautionUntilMs,nowMs+OVAL_CAUTION_DURATION_MS);}
 function disconnect(uid,nowMs){const p=participant(uid);if(p.ai)return;p.disconnectedAt=nowMs;if(phase==='lobby')p.ready=false;else if(!p.dnf&&!p.progress?.finished)caution(Math.max(lastNow,nowMs));p.queue=[];p.actions=NEUTRAL;}
 function reconnect(uid,nowMs){const p=participant(uid);if(p.progress?.finished)return snapshot();if(p.left||p.dnf||p.disconnectedAt!==null&&nowMs-p.disconnectedAt>10000)throw Error('race_reconnect_expired');p.disconnectedAt=null;p.queue=[];p.actions=NEUTRAL;return snapshot();}
 function leave(uid,nowMs){
  const p=participant(uid);if(phase==='lobby'){players.delete(uid);for(const [index,row]of [...players.values()].entries())row.slot=index;if(uid===leaderUid)leaderUid=activeHumans()[0]?.uid||'';if(!activeHumans().length){phase='cancelled';reason='race_empty';}}
  else{p.left=true;p.dnf=!p.progress?.finished;if(p.dnf)caution(Math.max(lastNow,nowMs));p.queue=[];p.actions=NEUTRAL;p.disconnectedAt=nowMs;}
  return snapshot();
 }
 function finishIfComplete(nowMs){
  if([...players.values()].every(p=>p.dnf||p.progress?.finished)||nowMs-startAtMs>=maximumDurationMs){
   for(const p of players.values())if(!p.progress?.finished)p.dnf=true;
   phase='complete';completedAtMs=nowMs;
   if(!outcomeEmitted){outcomeEmitted=true;onComplete(snapshot());}
  }
 }
 function trackPositions(){
  return new Map([...players.values()].filter(p=>!p.dnf&&!p.progress.finished).map(p=>{
   const pose=raceVehicleGroundPose(p.car),mainProjection=projectRacePosition(course,pose),pitProjection=p.pitProgress?projectRacePosition(pitGeometry.pitPavement,pose):null,
    projection=p.pitCommitted&&pitProjection?{...pitProjection,distanceMeters:racePitMappedDistance(course,pitGeometry,pitProjection.distanceMeters)}:mainProjection,
    zone=p.pitCommitted?'pit':rolling?ovalTrackZone(projection):raceProjectionOutsidePavement(projection)?'outside':'track',speed=raceVehicleSpeedMetersPerSecond(p.car);
   return [p.uid,{projection,mainProjection,pitProjection,zone,speed:Math.abs(speed),contacts:p.car.barrierContacts,draftActor:ovalDraftActor(p.uid,p.car,p.profile.handling,zone,speed,p.disconnectedAt===null)}];
  }));
 }
 function addPenalty(p,amount){
  p.progress={...p.progress,penaltyMs:p.progress.penaltyMs+amount,...(p.progress.finished?{elapsedMs:p.progress.elapsedMs+amount}:{})};
  if(p.pitTimingProgress)p.pitTimingProgress={...p.pitTimingProgress,penaltyMs:p.pitTimingProgress.penaltyMs+amount,...(p.pitTimingProgress.finished?{elapsedMs:p.pitTimingProgress.elapsedMs+amount}:{})};
 }
 function ovalPenalty(p,why){p.ovalPenaltyReason=why;addPenalty(p,OVAL_ORDER_PENALTY_MS);}
 function circuitPitPenalty(p,why){p.pitPenaltyReason=why;addPenalty(p,CIRCUIT_PIT_PENALTY_MS);}
 function enforceCircuitPit(before,after){
  for(const [uid,a]of after){const p=players.get(uid),b=before.get(uid);
   if((a.zone==='pit'||b.zone==='pit')&&a.speed>CIRCUIT_PIT_SPEED_METERS_PER_SECOND+1&&!p.pitSpeedPenalized){p.pitSpeedPenalized=true;circuitPitPenalty(p,'pit-speed');}
   if(b.zone==='pit'&&a.zone!=='pit'&&[...after].some(([otherUid,other])=>otherUid!==uid&&other.zone==='track'&&a.projection&&other.projection&&
    Math.abs(ovalDistanceGap(a.projection.distanceMeters,other.projection.distanceMeters,course.lengthMeters))<CIRCUIT_PIT_MERGE_CLEARANCE_METERS))circuitPitPenalty(p,'unsafe-pit-merge');
  }
 }
 function enforceOvalOrder(before,after,yellow){
  for(const [uid,a]of after){
   const p=players.get(uid),b=before.get(uid);p.ovalZone=a.zone;
   const restricted=yellow||b.zone==='apron'||a.zone==='apron'||b.zone==='pit'||a.zone==='pit';
   if(!restricted){p.ovalRestricted=false;p.ovalPassed.clear();continue;}
   if(!p.ovalRestricted)p.ovalPassed.clear();p.ovalRestricted=true;
   for(const [otherUid,other]of after){
    if(uid===otherUid||!a.projection||!other.projection||!b.projection)continue;
    if(!yellow&&(b.zone==='pit'||a.zone==='pit')&&other.zone!=='pit')continue;
    const previous=before.get(otherUid)?.projection;if(!previous)continue;
    const gap=ovalDistanceGap(a.projection.distanceMeters,other.projection.distanceMeters,course.lengthMeters),
     oldGap=ovalDistanceGap(b.projection.distanceMeters,previous.distanceMeters,course.lengthMeters);
    if(oldGap>=0&&oldGap<40&&gap<0&&!p.ovalPassed.has(otherUid)){
     p.ovalPassed.add(otherUid);ovalPenalty(p,yellow?'passing-under-yellow':a.zone==='pit'||b.zone==='pit'?'passing-in-pits':'passing-on-apron');
    }
   }
   if(b.zone==='apron'&&a.zone==='bank'&&[...after].some(([otherUid,other])=>otherUid!==uid&&other.zone==='bank'&&a.projection&&other.projection&&Math.abs(ovalDistanceGap(a.projection.distanceMeters,other.projection.distanceMeters,course.lengthMeters))<OVAL_MERGE_CLEARANCE_METERS))ovalPenalty(p,'unsafe-apron-merge');
   if(b.zone==='pit'&&!p.pitCommitted&&[...after].some(([otherUid,other])=>otherUid!==uid&&other.zone==='bank'&&a.projection&&other.projection&&Math.abs(ovalDistanceGap(a.projection.distanceMeters,other.projection.distanceMeters,course.lengthMeters))<OVAL_MERGE_CLEARANCE_METERS))ovalPenalty(p,'unsafe-pit-merge');
  }
 }
 function pitPhysicalCourse(p,row){
  return racePitPavementAt(course,pitGeometry,raceVehicleGroundPose(p.car),{active:p.pitCommitted,approach:Boolean(p.pitTimingProgress),pitProjection:row.pitProjection,mainProjection:row.mainProjection});
 }
 function advancePlayerProgress(p,pose,frameAt,row){
  const previous=p.progress;
  if(pitGeometry&&!p.pitProgress&&previous.nextGate===pitGeometry.covered[0].index&&racePitEntryNearby(course,pitGeometry,row.mainProjection)&&
   Math.sin(p.car.angle)*pitGeometry.entry.forward.x+Math.cos(p.car.angle)*pitGeometry.entry.forward.z>.94&&racePitGateCrossing(pitGeometry.entry,previous.lastPose,pose,course.metersPerUnit)){
   p.pitProgress=createRaceProgress(previous.lastPose,previous.lastAtMs);p.pitTimingProgress=previous;p.pitEnteredAt=frameAt;p.pitEntrySpeed=row.speed;p.pitSpeedPenalized=false;
  }
  if(!p.pitProgress){p.progress=advanceRaceProgress(course,p.progress,pose,frameAt,{startedAtMs:startAtMs});return;}
  const pitProjection=projectRacePosition(pitGeometry.pitPavement,pose);
  if(!p.pitCommitted&&raceProjectionOutsidePavement(pitProjection)){
   p.pitProgress=p.pitTimingProgress=null;p.pitEnteredAt=null;p.progress=advanceRaceProgress(course,p.progress,pose,frameAt,{startedAtMs:startAtMs});return;
  }
  p.pitProgress=advanceRaceProgress(pitGeometry.pitPavement,p.pitProgress,pose,frameAt,{startedAtMs:p.pitEnteredAt});
  const before=p.pitTimingProgress||p.progress,next=advanceRaceProgress(pitGeometry.timing,before,pose,frameAt,{startedAtMs:startAtMs}),n=course.gates.length,
   ordinal=p=>p.finished?course.laps*n:(p.lap-1)*n+p.nextGate;
  for(let at=ordinal(before);at<ordinal(next);at++)if(p.pitProgress.nextGate<(pitGeometry.requirements.get(at%n)??Infinity)){
   if(p.pitCommitted)p.dnf=true;else{p.pitProgress=p.pitTimingProgress=null;p.progress=advanceRaceProgress(course,p.progress,pose,frameAt,{startedAtMs:startAtMs});}return;
  }
  if(!p.pitCommitted){
   p.pitTimingProgress=next;
   const main=projectRacePosition(course,pose),takesBranch=(!rolling||ovalTrackZone(main)==='apron')&&pitProjection.error+.5<(main?.error??Infinity)||raceProjectionOutsidePavement(main);
   if(takesBranch){
    p.pitCommitted=true;p.pitVisits++;p.progress=next;p.pitTimingProgress=null;
    if(rolling){if(p.pitEntrySpeed>11)ovalPenalty(p,'pit-entry-speed');}
    else if(p.pitEntrySpeed>CIRCUIT_PIT_SPEED_METERS_PER_SECOND+1){p.pitSpeedPenalized=true;circuitPitPenalty(p,'pit-entry-speed');}
    return;
   }
   // A main-track car can pass the shared entry node. Until the branch is
   // physically distinguishable, both bounded gate cursors follow the same
   // simulated body; only the chosen path can become the timing authority.
   if(pitProjection.distanceMeters>60||p.pitProgress.finished){p.pitProgress=p.pitTimingProgress=null;p.pitEnteredAt=null;}
   p.progress=advanceRaceProgress(course,p.progress,pose,frameAt,{startedAtMs:startAtMs});return;
  }
  p.progress=next;
  if(p.pitProgress.finished){
   if(!next.finished&&next.nextGate!==(pitGeometry.covered.at(-1).index+1)%n){p.dnf=true;return;}
   // Resume the main timing planes over this same physical exit step. The
   // car remains at its simulated pose and can cross a nearby main gate once.
   if(!next.finished)p.progress=advanceRaceProgress(course,{...next,lastPose:before.lastPose,lastAtMs:before.lastAtMs},pose,frameAt,{startedAtMs:startAtMs});
   p.pitProgress=null;p.pitCommitted=false;
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
   tick++;const frameAt=startAtMs+tick*STEP_MS,yellow=rolling&&frameAt<cautionUntilMs,before=rolling||pitGeometry?trackPositions():null,draftActors=rolling?[...before.values()].map(row=>row.draftActor):null;
   for(const p of players.values()){
    if(p.dnf||p.progress.finished)continue;
    if(p.disconnectedAt!==null&&frameAt-p.disconnectedAt>10000){p.dnf=true;continue;}
    while(p.queue.length&&p.queue[0].at<=frameAt){const command=p.queue.shift();p.actions=command.actions;p.lastControlAt=command.at;}
    const row=before?.get(p.uid);
    let actions=p.ai?raceAiActions(p.pitCommitted?pitGeometry.pitPavement:course,p.car,p.pitCommitted?p.pitProgress:p.progress,p.profile,{difficulty:p.difficulty,
     ...(!rolling&&p.pitCommitted?{formation:true,paceMetersPerSecond:CIRCUIT_PIT_SPEED_METERS_PER_SECOND}:{}),
     ...(rolling?{laneOffsetMeters:p.pitCommitted?0:course.participants===1?0:p.slot%2===0?-1.4:1.4,...(yellow||p.pitCommitted?{formation:true,paceMetersPerSecond:OVAL_PACE_METERS_PER_SECOND}:{})}:{})}):p.disconnectedAt!==null||frameAt-p.lastControlAt>400?NEUTRAL:p.actions;
    if(rolling)actions=ovalPaceActions(actions,row.speed,yellow||row.zone==='apron'||row.zone==='pit');
    else if(pitGeometry)actions=circuitPitPaceActions(actions,row.speed,p.pitCommitted);
    p.previousFrame=snapshotRaceVehicle(p.car);
    if(rolling)p.ovalDraft=ovalDraftReduction(before.get(p.uid).draftActor,draftActors,course.metersPerUnit,{enabled:!yellow});
    stepRaceVehicle(pitGeometry?pitPhysicalCourse(p,row):course,p.car,actions,1/60,p.profile,{draftReduction:p.ovalDraft});
    advancePlayerProgress(p,raceVehicleGroundPose(p.car),frameAt,row);
   }
   if(rolling){
    // Use the same pre-tick flag for every actor. An incident starts a caution
    // on the next tick, independent of roster iteration order.
    const after=trackPositions();
    // Include a car that crossed the finish this tick so its last-frame order
    // violation is applied before the existing completion receipt is emitted.
    for(const [uid]of before)if(!after.has(uid)&&players.get(uid).progress.finished){const p=players.get(uid),projection=projectRacePosition(course,raceVehicleGroundPose(p.car));after.set(uid,{projection,zone:ovalTrackZone(projection),speed:Math.abs(raceVehicleSpeedMetersPerSecond(p.car)),contacts:p.car.barrierContacts});}
    enforceOvalOrder(before,after,yellow);
    if([...after].some(([uid,a])=>a.contacts>before.get(uid).contacts&&before.get(uid).speed>5))caution(frameAt);
   }
   else if(pitGeometry){
    const after=trackPositions();
    for(const [uid]of before)if(!after.has(uid)&&players.get(uid).progress.finished){const p=players.get(uid),projection=projectRacePosition(course,raceVehicleGroundPose(p.car));after.set(uid,{projection,zone:p.pitCommitted?'pit':'track',speed:Math.abs(raceVehicleSpeedMetersPerSecond(p.car))});}
    enforceCircuitPit(before,after);
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
   ...(rolling?{raceControl:{start:'rolling',flag:phase==='countdown'?'formation':phase==='complete'?'chequered':phase==='cancelled'?'red':startAtMs!==null&&startAtMs+tick*STEP_MS<cautionUntilMs?'yellow':[...players.values()].some(p=>p.progress?.lap>=course.laps)?'white':'green',
    paceMetersPerSecond:phase==='countdown'||startAtMs!==null&&startAtMs+tick*STEP_MS<cautionUntilMs?OVAL_PACE_METERS_PER_SECOND:null}}:{}),
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
    vehicleState:frame,...(rolling?{trackZone:p.ovalZone,ovalPenaltyReason:p.ovalPenaltyReason,draftingReduction:phase==='running'&&!p.progress?.finished?p.ovalDraft:0}:{}),
    ...(pitGeometry?{pit:{active:p.pitCommitted,approach:Boolean(p.pitTimingProgress),visits:p.pitVisits,nextGate:p.pitProgress?.nextGate??null,gates:pitGeometry.pitPavement.gates.length,
     ...(!rolling?{speedLimitMetersPerSecond:CIRCUIT_PIT_SPEED_METERS_PER_SECOND,penaltyReason:p.pitPenaltyReason}:{})}}:{}),
    progress:p.progress?{nextGate:p.progress.nextGate,lap:p.progress.lap,finished:p.progress.finished,elapsedMs:p.progress.elapsedMs??null,
     bestLapMs:p.progress.bestLapMs,lapTimes:[...p.progress.lapTimes],penaltyMs:p.progress.penaltyMs}:null};})};
 }
 return Object.freeze({add,setReady,start,control,advance,disconnect,reconnect,leave,snapshot:()=>snapshot(),presentationSnapshot:()=>snapshot(true),
  cancel(cancelReason='race_cancelled'){if(phase==='complete')return snapshot();phase='cancelled';reason=cancelReason;return snapshot();}});
}
