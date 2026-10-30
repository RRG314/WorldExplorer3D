import {randomUUID,createHash} from 'node:crypto';
import {createRaceSession,racePhysicsVersion,raceRecordConfiguration,raceCourseKey,raceGridPose} from './generated/engine.mjs';

export const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const CODE=/^[A-Z0-9]{6}$/;
const types=new Set(['join','ready','start','control','leave']);
const allowed={join:['type','roomCode','worldSeed','courseId','vehicleId','sessionId'],ready:['type','ready'],start:['type'],
 control:['type','sequence','actions'],leave:['type']};
export function readCommand(raw) {
 if(typeof raw!=='string'||Buffer.byteLength(raw)>8192)throw Error('race_message_too_large');
 let v;try{v=JSON.parse(raw);}catch{throw Error('invalid_race_message');}
 if(!v||typeof v!=='object'||Array.isArray(v)||!types.has(v.type)||Object.keys(v).some(k=>!allowed[v.type].includes(k)))throw Error('invalid_race_message');
 if(v.type==='join'&&(!CODE.test(v.roomCode)||typeof v.worldSeed!=='string'||v.worldSeed.length>180||!/^road-race-[a-f0-9]{32}$/.test(v.courseId)||typeof v.vehicleId!=='string'||v.vehicleId.length>64))throw Error('invalid_race_join');
 if(v.sessionId!==undefined&&(typeof v.sessionId!=='string'||!/^[a-f0-9-]{36}$/.test(v.sessionId)))throw Error('invalid_race_join');
 if(v.type==='ready'&&typeof v.ready!=='boolean')throw Error('invalid_race_ready');
 return v;
}

// One bounded authority per existing room. The host is merely a lobby leader;
// physics, result custody and the clock survive that player's departure.
// The transport supplies one clock; this owner never installs a scheduler.
export function createRaceAuthority({store,now=()=>Date.now(),instanceId=randomUUID(),maximumRaces=8}) {
 const races=new Map(),connections=new Map(),joinFlights=new Map();let closed=false;
 const send=(client,payload)=>client?.send(payload);
 function broadcast(race,payload){for(const uid of race.roster.keys()){const client=connections.get(uid);if(client?.race===race)send(client,payload);}}
 function envelope(race){return {...(race.finalSnapshot||race.session.snapshot()),courseId:race.courseId,physicsVersion:racePhysicsVersion(race.course),
  profiles:Object.fromEntries([...race.roster].map(([uid,p])=>[uid,raceRecordConfiguration(p.profile,{course:race.course})])),
  purpose:race.course.publication?.purpose||'competition',settlement:race.settlement,receipt:race.receipt||null};}
 function detach(client){if(connections.get(client.uid)!==client)return;connections.delete(client.uid);const race=client.race;
  client.race=null;
  if(race&&!race.finalSnapshot&&race.roster.has(client.uid))race.session.disconnect(client.uid,now());}
 async function join(client,command) {
  if(closed||client.isOpen?.()===false)throw Error('race_service_stopping');
  if(client.race)throw Error('race_leave_first');
  let race=races.get(command.roomCode),created=false;
  if(command.sessionId&&race?.id!==command.sessionId){
   const result=await store.result?.(command.sessionId,client.uid);
   if(!result||result.courseId!==command.courseId||result.worldSeed!==command.worldSeed||result.roomCode!==command.roomCode)throw Error('race_reconnect_expired');
   send(client,{type:'joined',course:result.course,snapshot:result.snapshot});return;
  }
  if(race?.starting)throw Error('race_roster_locked');
  if(race&&(race.courseId!==command.courseId||race.worldSeed!==command.worldSeed))throw Error('race_room_course_locked');
  if(!race){
   if(races.size>=maximumRaces)throw Error('race_service_full');
   const course=await store.course(command.courseId,client.uid);if(!course||await raceCourseKey(course)!==command.courseId)throw Error('race_course_unavailable');
   race={id:randomUUID(),roomCode:command.roomCode,worldSeed:command.worldSeed,courseId:command.courseId,course,
    roster:new Map(),session:null,settlement:'pending',leaseUntil:0,lastRenew:-Infinity,lastBroadcast:0,renewing:false,settling:false};
   created=true;
  }
  const existing=race.roster.get(client.uid),snapshot=race.session?.snapshot();
  if(existing&&existing.vehicleId!==command.vehicleId)throw Error('race_vehicle_locked');
  if(existing&&!snapshot.players.some(p=>p.uid===client.uid&&!p.dnf))throw Error('race_reconnect_expired');
  if(!existing&&snapshot&&snapshot.phase!=='lobby')throw Error('race_roster_locked');
  // Atomic room lease and personal car custody are acquired before publication.
  const admitted=await store.admit({race,uid:client.uid,vehicleId:command.vehicleId,instanceId,nowMs:now(),
   slot:existing?.slot??race.roster.size,reconnect:!!existing});
  if(!existing)race.roster.set(client.uid,{...admitted,vehicleId:command.vehicleId,slot:race.roster.size});
  if(closed||client.isOpen?.()===false){await store.releaseParticipant({race,uid:client.uid,instanceId,nowMs:now()});if(!existing)race.roster.delete(client.uid);throw Error('race_service_stopping');}
  if(!race.session)race.session=createRaceSession({id:race.id,course:race.course,creatorUid:client.uid,createdAtMs:now()});
  try {
   if(existing){if(existing.vehicleId!==command.vehicleId)throw Error('race_vehicle_locked');race.session.reconnect(client.uid,now());}
   else race.session.add({uid:client.uid,label:admitted.label,profile:admitted.profile});
  } catch(error){await store.releaseParticipant({race,uid:client.uid,instanceId,nowMs:now()});if(!existing)race.roster.delete(client.uid);throw error;}
  race.leaseUntil=admitted.leaseUntil;race.lastRenew=now();if(created)races.set(race.roomCode,race);
  const old=connections.get(client.uid);if(old&&old!==client){old.race=null;old.close('race_connection_replaced');}
  client.race=race;connections.set(client.uid,client);
  send(client,{type:'joined',course:race.course,snapshot:envelope(race)});broadcast(race,{type:'snapshot',snapshot:envelope(race)});
 }
 async function command(client,input) {
  if(closed)throw Error('race_service_stopping');
  const v=readCommand(input);
  if(v.type==='join'){
   const previous=joinFlights.get(v.roomCode)||Promise.resolve();
   const next=previous.catch(()=>{}).then(()=>join(client,v));joinFlights.set(v.roomCode,next);
   try{return await next;}finally{if(joinFlights.get(v.roomCode)===next)joinFlights.delete(v.roomCode);}
  }
  const race=client.race;if(!race||connections.get(client.uid)!==client)throw Error('race_not_joined');
  if(v.type==='control')race.session.control(client.uid,v.sequence,v.actions,now());
  if(v.type==='ready'){if(race.starting)throw Error('race_roster_locked');race.session.setReady(client.uid,v.ready);}
  if(v.type==='start'){
   const state=race.session.snapshot();if(state.phase!=='lobby')throw Error('race_roster_locked');if(state.leaderUid!==client.uid)throw Error('race_leader_required');
   if(state.players.some(p=>!p.ready||p.disconnected))throw Error('race_not_ready');
   const minimum=race.course.publication?.purpose==='qualification'||race.course.discipline==='time-trial'?1:2;
   if(race.roster.size<minimum)throw Error('race_needs_two_players');
   if(race.starting)throw Error('race_roster_locked');race.starting=true;
   try{await store.renew({race,instanceId,nowMs:now(),starting:true});race.session.start(client.uid,now());}
   finally{race.starting=false;}
  }
  if(v.type==='leave'){
   const lobby=race.session.snapshot().phase==='lobby';race.session.leave(client.uid,now());
   await store.releaseParticipant({race,uid:client.uid,instanceId,nowMs:now()});
   if(lobby)race.roster.delete(client.uid);else race.roster.get(client.uid).released=true;
   client.race=null;connections.delete(client.uid);
  }
  if(v.type!=='control')broadcast(race,{type:'snapshot',snapshot:envelope(race)});
 }
 function tick() {
  const at=now();
  for(const race of races.values()){
   if(at>=race.leaseUntil){race.session.cancel('race_authority_lease_expired');}
   if(!race.renewing&&at-race.lastRenew>=5000&&race.session.snapshot().phase!=='cancelled'&&race.settlement!=='saved'){
    race.renewing=true;race.lastRenew=at;
    store.renew({race,instanceId,nowMs:at}).then(result=>{race.leaseUntil=result.leaseUntil;},()=>race.session.cancel('race_admission_ended')).finally(()=>{race.renewing=false;});
   }
   let state;try{state=race.session.advance(at);}catch{state=race.session.cancel('race_authority_failed');}
   if(state.phase==='complete'&&!race.finalSnapshot)race.finalSnapshot=structuredClone(state);
   if(state.phase==='complete'&&!race.settling&&race.settlement==='pending'&&at-(race.lastSettlementFailure??-Infinity)>=1000){
    race.settling=true;
    store.settle({race,snapshot:race.finalSnapshot,instanceId,nowMs:at}).then(receipt=>{race.receipt=receipt;race.settlement='saved';broadcast(race,{type:'snapshot',snapshot:envelope(race)});},()=>{
     // Immutable result stays owned here for a bounded retry. No result is
     // acknowledged as verified before its database transaction commits.
     race.lastSettlementFailure=at;
    }).finally(()=>{race.settling=false;});
   }
   if(at-race.lastBroadcast>=(state.phase==='lobby'?1000:50)||state.phase==='cancelled') {race.lastBroadcast=at;broadcast(race,{type:'snapshot',snapshot:envelope(race)});}
   if(state.phase==='cancelled'||state.phase==='complete'&&(race.settlement==='saved'||at-state.completedAtMs>30000)){
    if(state.phase==='complete'&&race.settlement!=='saved')broadcast(race,{type:'snapshot',snapshot:{...envelope(race),phase:'cancelled',reason:'race_result_save_failed'}});
    // Retain a completed session on its existing sockets until leave/close.
    // Its final snapshot is immutable and consumes late in-flight controls;
    // no active room lease or admission slot is retained.
    if(state.phase!=='complete'||race.settlement!=='saved')for(const uid of race.roster.keys()){const c=connections.get(uid);if(c?.race===race)c.race=null;}
    races.delete(race.roomCode);void store.release({race,instanceId,nowMs:at}).catch(()=>{});
   }
  }
 }
 async function close(){closed=true;for(const race of races.values()){race.session.cancel('race_service_stopping');broadcast(race,{type:'snapshot',snapshot:envelope(race)});await store.release({race,instanceId,nowMs:now()});}races.clear();for(const client of connections.values())client.race=null;connections.clear();}
 return Object.freeze({command,tick,detach,close,snapshot:()=>({races:races.size,connections:connections.size,instanceId})});
}
