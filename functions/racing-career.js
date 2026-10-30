'use strict';
const {createHash}=require('node:crypto');
const {RACING_CAREER_LIMITS:L,verifiedCareerFinish,careerFinishEligible,racingSeriesStandings,racingRivalOutcome,RACE_PHYSICS_VERSION,isCurrentRacePhysicsVersion}=require('./generated/racing-engine.cjs');
const fail=(message,status=422)=>{throw Object.assign(Error(message),{status});};
const value=s=>s.exists?s.data():null;
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const id32=id=>{if(!/^[a-f0-9]{32}$/.test(id||''))fail('racing_invalid_id');return id;};
const boardId=id=>{if(!/^[a-f0-9]{64}$/.test(id||''))fail('racing_invalid_class');return id;};
const title=v=>String(v||'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,64);
const careerPath=uid=>`users/${uid}/racing/career`;
const inboxPath=(uid,id)=>`users/${uid}/racingInvites/${id}`;
const add=(list,id,max)=>{const next=[...new Set([...(list||[]),id])];if(next.length>max)fail('racing_active_limit',409);return next;};
const remove=(list,id)=>(list||[]).filter(v=>v!==id);
const signature=(uid,input)=>{if(!/^[a-f0-9-]{36}$/.test(input.requestId||''))fail('racing_request_id_required');return hash([uid,input.requestId]).slice(0,32);};

// Queue mutations until every read is complete, including reads performed by
// the small command helpers. The existing Firestore transaction owns atomicity.
async function transaction(db,operation){return db.runTransaction(async tx=>{
 const writes=[],cache=new Map(),io={
  async read(path){if(!cache.has(path))cache.set(path,tx.get(db.doc(path)).then(value));return cache.get(path);},
  set(path,data){writes.push(()=>tx.set(db.doc(path),data));cache.set(path,Promise.resolve(data));},
  merge(path,data){writes.push(()=>tx.set(db.doc(path),data,{merge:true}));},
  remove(path){writes.push(()=>tx.delete(db.doc(path)));cache.set(path,Promise.resolve(null));}
 };const result=await operation(io);for(const write of writes)write();return result;
});}
async function loadCareer(io,uid,nowMs){
 const current=await io.read(careerPath(uid))||{},next={...current};
 for(const [key,collection]of [['openRivalIds','racingRivals'],['openSeriesIds','racingSeries']]){
  const keep=[];for(const id of current[key]||[]){const r=await io.read(`${collection}/${id}`);if(r&&['invited','active','open'].includes(r.status)&&r.expiresAtMs+(key==='openSeriesIds'?L.finalizationGraceMs:0)>nowMs)keep.push(id);}next[key]=keep;
 }
 const inbox=[];for(const id of current.openRacingInviteIds||[]){const r=await io.read(inboxPath(uid,id));if(r?.status==='pending'&&r.expiresAtMs>nowMs)inbox.push(id);else if(r?.status==='pending')io.merge(inboxPath(uid,id),{status:'expired'});}next.openRacingInviteIds=inbox;
 const outgoing=[];for(const item of current.outgoingRacingInvites||[]){const r=await io.read(inboxPath(item.uid,item.id));if(r?.status==='pending'&&r.expiresAtMs>nowMs)outgoing.push(item);}next.outgoingRacingInvites=outgoing;
 return next;
}
async function knownPeer(io,uid,targetUid,roomCode,nowMs){
 if(typeof targetUid!=='string'||!targetUid||targetUid.length>128||targetUid.includes('/')||targetUid===uid)fail('racing_choose_player');
 await unblocked(io,uid,targetUid);
 const [a,b,consent,friend]=await Promise.all([io.read(`users/${uid}/blockedPlayers/${targetUid}`),io.read(`users/${targetUid}/blockedPlayers/${uid}`),io.read(`users/${targetUid}/consents/community`),io.read(`users/${uid}/friends/${targetUid}`)]);
 if(a||b)fail('racing_player_unavailable',403);if(consent?.version!=='community-2026-10-24')fail('racing_player_community_required',409);
 if(friend)return;
 if(!/^[A-Z0-9]{6}$/.test(roomCode||''))fail('racing_friend_or_room_required',403);
 const [one,two]=await Promise.all([io.read(`rooms/${roomCode}/players/${uid}`),io.read(`rooms/${roomCode}/players/${targetUid}`)]);
 if(one?.uid!==uid||two?.uid!==targetUid||one.expiresAt?.toMillis?.()<=nowMs||two.expiresAt?.toMillis?.()<=nowMs||!one.expiresAt||!two.expiresAt)fail('racing_friend_or_room_required',403);
}
async function unblocked(io,a,b){if(a===b)return;const [one,two,closingA,closingB]=await Promise.all([io.read(`users/${a}/blockedPlayers/${b}`),io.read(`users/${b}/blockedPlayers/${a}`),io.read(`captureAccountDeletions/${a}`),io.read(`captureAccountDeletions/${b}`)]);if(one||two||closingA||closingB)fail('racing_player_unavailable',403);}
async function sharedClass(io,id){
 boardId(id);const board=await io.read(`racingBoards/${id}`),course=board&&await io.read(`racingCourses/${board.courseId}`);
 if(!board||course?.status!=='approved'||!isCurrentRacePhysicsVersion(board.configuration?.physicsVersion)||board.configuration.physicsVersion!==(course.physicsVersion??RACE_PHYSICS_VERSION))fail('racing_class_unavailable',409);
 return {boardId:id,courseId:board.courseId,courseName:board.courseName,configuration:board.configuration};
}
function notify(io,uid,id,titleText,nowMs){io.set(`users/${uid}/notifications/racing-${id}`,{type:'racing_invite',title:titleText,inviteId:id,createdAtMs:nowMs});}
function outgoing(career,uid,id){const next=[...(career.outgoingRacingInvites||[]).filter(v=>v.id!==id),{uid,id}];if(next.length>L.crewInvites)fail('racing_active_limit',409);career.outgoingRacingInvites=next;}
async function invitation(io,{uid,targetUid,kind,subjectId,label,nowMs}){
 const id=hash([kind,subjectId,targetUid]),path=inboxPath(targetUid,id),previous=await io.read(path);
 if(previous?.status==='pending'&&previous.expiresAtMs>nowMs)return id;
 if(previous&&nowMs-previous.createdAtMs<86400000)fail('racing_invite_cooldown',409);
 const peer=await loadCareer(io,targetUid,nowMs);
 peer.openRacingInviteIds=add(peer.openRacingInviteIds,id,L.crewInvites);
 io.set(path,{id,kind,subjectId,fromUid:uid,fromLabel:label,status:'pending',createdAtMs:nowMs,expiresAtMs:nowMs+L.durationMs});io.set(careerPath(targetUid),peer);
 notify(io,targetUid,id,kind==='crew'?`${label} invited you to a racing crew`:`${label} challenged you to a race`,nowMs);return id;
}

async function commitRacingCareer({db,uid,input,label='Explorer',nowMs=Date.now()}){
 const allowed={
  'create-crew':['action','requestId','name'],'invite-crew':['action','targetUid','roomCode'],'respond-invite':['action','id','accept'],
  'leave-crew':['action'],'create-rival':['action','requestId','targetUid','boardId','roomCode'],'cancel-rival':['action','id'],
  'create-series':['action','requestId','name','boardIds'],'join-series':['action','id'],'close-series':['action','id']};
 if(!input||!allowed[input.action]||Object.keys(input).some(k=>!allowed[input.action].includes(k)))fail('racing_invalid_career_command');
 label=title(label)||'Explorer';
 return transaction(db,async io=>{
  if(await io.read(`captureAccountDeletions/${uid}`))fail('racing_account_closing',403);
  const custody=await io.read(`users/${uid}/gameplay/vehicleUpgrades`);if(custody?.raceReservation?.expiresAt?.toMillis?.()>nowMs)fail('racing_leave_race_first',409);
  const me=await loadCareer(io,uid,nowMs),saveMe=()=>io.set(careerPath(uid),me);const action=input.action;
  if(action==='create-crew'){
   const id=signature(uid,input),existing=await io.read(`racingCrews/${id}`),name=title(input.name);if(typeof input.name!=='string'||name.length<3)fail('racing_name_required');
   if(existing){if(existing.ownerUid!==uid||existing.name!==name)fail('racing_request_changed',409);return {id};}
   if(me.crewId)fail('racing_leave_crew_first',409);
   io.set(`racingCrews/${id}`,{id,name,ownerUid:uid,members:[{uid,label,joinedAtMs:nowMs}],memberUids:[uid],seriesIds:[],status:'active',createdAtMs:nowMs});me.crewId=id;saveMe();return {id};
  }
  if(action==='invite-crew'){
   const id=id32(me.crewId),crew=await io.read(`racingCrews/${id}`);if(crew?.status!=='active'||crew.ownerUid!==uid)fail('racing_crew_owner_required',403);
   if(crew.members.length>=L.crewMembers)fail('racing_crew_full',409);if(crew.members.some(p=>p.uid===input.targetUid))return {id};
   for(const p of crew.members)await unblocked(io,p.uid,input.targetUid);
   await knownPeer(io,uid,input.targetUid,input.roomCode,nowMs);const inviteId=await invitation(io,{uid,targetUid:input.targetUid,kind:'crew',subjectId:id,label:crew.name,nowMs});outgoing(me,input.targetUid,inviteId);saveMe();return {id:inviteId};
  }
  if(action==='create-rival'){
   const id=signature(uid,input),previous=await io.read(`racingRivals/${id}`);if(previous){if(previous.creatorUid!==uid||previous.targetUid!==input.targetUid||previous.stage.boardId!==input.boardId)fail('racing_request_changed',409);return {id};}
   await knownPeer(io,uid,input.targetUid,input.roomCode,nowMs);const stage=await sharedClass(io,input.boardId);
   if(!await io.read(`users/${uid}/racing/career/boards/${input.boardId}`))fail('racing_finish_class_first',409);
   // Both directions share one open pair/class challenge. Reading both
   // careers also makes simultaneous opposite invitations conflict/retry in
   // the existing transaction rather than paying several wins for one finish.
   const peer=await loadCareer(io,input.targetUid,nowMs);
   for(const key of new Set([...me.openRivalIds,...peer.openRivalIds])){
    const r=await io.read(`racingRivals/${key}`);
    if(r&&['invited','active'].includes(r.status)&&r.expiresAtMs>nowMs&&r.stage.boardId===input.boardId&&r.players.includes(uid)&&r.players.includes(input.targetUid))fail('racing_challenge_exists',409);
   }
   me.openRivalIds=add(me.openRivalIds,id,L.rivals);
   io.set(`racingRivals/${id}`,{id,creatorUid:uid,targetUid:input.targetUid,players:[uid,input.targetUid],labels:{[uid]:label},stage,status:'invited',bests:{},createdAtMs:nowMs,expiresAtMs:nowMs+L.durationMs});
   const inviteId=await invitation(io,{uid,targetUid:input.targetUid,kind:'rival',subjectId:id,label,nowMs});outgoing(me,input.targetUid,inviteId);saveMe();return {id,inviteId};
  }
  if(action==='respond-invite'){
   if(typeof input.accept!=='boolean'||!/^[a-f0-9]{64}$/.test(input.id||''))fail('racing_invalid_invite');
   const path=inboxPath(uid,input.id),invite=await io.read(path);if(!invite)fail('racing_invite_unavailable',404);
   if(invite.status!=='pending'){if(invite.status===(input.accept?'accepted':'declined'))return {id:invite.subjectId};fail('racing_invite_closed',409);}
   if(invite.expiresAtMs<=nowMs)fail('racing_invite_expired',409);
   if(input.accept){await knownPeer(io,uid,invite.fromUid,null,nowMs).catch(async error=>{
    // The recipient need not have added the sender back. The existing
    // invitation itself proves the sender's original friend/room admission.
    if(error.message!=='racing_friend_or_room_required')throw error;
   });}
   if(invite.kind==='crew'){
    const crew=await io.read(`racingCrews/${id32(invite.subjectId)}`);if(crew?.status!=='active')fail('racing_crew_unavailable',409);
    if(input.accept){for(const p of crew.members)await unblocked(io,p.uid,uid);if(me.crewId&&me.crewId!==crew.id)fail('racing_leave_crew_first',409);if(!crew.members.some(p=>p.uid===uid)){if(crew.members.length>=L.crewMembers)fail('racing_crew_full',409);crew.members.push({uid,label,joinedAtMs:nowMs});}me.crewId=crew.id;crew.memberUids=crew.members.map(p=>p.uid);io.set(`racingCrews/${crew.id}`,crew);}
   }else if(invite.kind==='rival'){
    const r=await io.read(`racingRivals/${id32(invite.subjectId)}`);if(r?.status!=='invited'||r.targetUid!==uid||r.expiresAtMs<=nowMs)fail('racing_invite_closed',409);
    if(input.accept){await sharedClass(io,r.stage.boardId);me.openRivalIds=add(me.openRivalIds,r.id,L.rivals);r.status='active';r.joinedAtMs=nowMs;r.labels={...r.labels,[uid]:label};}
    else r.status='declined';io.set(`racingRivals/${r.id}`,r);
   }else fail('racing_invalid_invite');
   io.merge(path,{status:input.accept?'accepted':'declined',respondedAtMs:nowMs});me.openRacingInviteIds=remove(me.openRacingInviteIds,input.id);saveMe();return {id:invite.subjectId};
  }
  if(action==='cancel-rival'){
   const r=await io.read(`racingRivals/${id32(input.id)}`);if(!r?.players.includes(uid))fail('racing_challenge_unavailable',403);
   if(['invited','active'].includes(r.status)){r.status='cancelled';r.closedAtMs=nowMs;io.set(`racingRivals/${r.id}`,r);}me.openRivalIds=remove(me.openRivalIds,r.id);saveMe();return {id:r.id};
  }
  if(action==='leave-crew'){
   if(!me.crewId)return {};const crew=await io.read(`racingCrews/${id32(me.crewId)}`);
   if(crew){crew.members=crew.members.filter(p=>p.uid!==uid);crew.memberUids=crew.members.map(p=>p.uid);if(crew.ownerUid===uid)crew.ownerUid=crew.members[0]?.uid||'';if(!crew.members.length)crew.status='closed';
    for(const id of crew.seriesIds||[]){const series=await io.read(`racingSeries/${id}`);if(series?.status==='open'){series.entries=series.entries.map(e=>e.uid===uid?{...e,withdrawn:true,leftAtMs:nowMs}:e);if(series.creatorUid===uid)series.creatorUid=crew.ownerUid||null;io.set(`racingSeries/${id}`,series);}}
    io.set(`racingCrews/${crew.id}`,crew);
   }me.crewId=null;me.openSeriesIds=[];saveMe();return {};
  }
  if(action==='create-series'){
   const id=signature(uid,input),previous=await io.read(`racingSeries/${id}`);if(previous){if(previous.creatorUid!==uid||previous.name!==title(input.name)||JSON.stringify(previous.stages.map(s=>s.boardId))!==JSON.stringify(input.boardIds))fail('racing_request_changed',409);return {id};}
   const crew=await io.read(`racingCrews/${id32(me.crewId)}`),name=title(input.name);if(crew?.ownerUid!==uid||crew.status!=='active')fail('racing_crew_owner_required',403);if(typeof input.name!=='string'||name.length<3)fail('racing_name_required');
   if(!Array.isArray(input.boardIds)||!input.boardIds.length||input.boardIds.length>L.stages||new Set(input.boardIds).size!==input.boardIds.length)fail('racing_choose_stages');
   const stages=[];for(const id of input.boardIds){if(!await io.read(`users/${uid}/racing/career/boards/${boardId(id)}`))fail('racing_finish_class_first',409);stages.push(await sharedClass(io,id));}
   const active=[];for(const key of crew.seriesIds||[]){const s=await io.read(`racingSeries/${key}`);if(s?.status==='open'&&s.expiresAtMs+L.finalizationGraceMs>nowMs)active.push(key);}crew.seriesIds=add(active,id,L.series);
   io.set(`racingSeries/${id}`,{id,name,creatorUid:uid,crewId:crew.id,status:'open',stages,entries:[],participantUids:[],createdAtMs:nowMs,expiresAtMs:nowMs+L.durationMs});io.set(`racingCrews/${crew.id}`,crew);saveMe();return {id};
  }
  if(action==='join-series'){
   const series=await io.read(`racingSeries/${id32(input.id)}`),crew=series&&await io.read(`racingCrews/${series.crewId}`);
   if(series?.status!=='open'||series.expiresAtMs<=nowMs||!crew?.members.some(p=>p.uid===uid)||me.crewId!==series.crewId)fail('racing_series_unavailable',409);
   for(const p of crew.members)await unblocked(io,p.uid,uid);
   const previous=series.entries.find(e=>e.uid===uid);if(previous?.withdrawn)fail('racing_series_withdrawn',409);
   if(!previous){series.entries.push({uid,label,joinedAtMs:nowMs,bests:{}});series.participantUids=series.entries.map(e=>e.uid);io.set(`racingSeries/${series.id}`,series);}me.openSeriesIds=add(me.openSeriesIds,series.id,L.series);saveMe();return {id:series.id};
  }
  if(action==='close-series')return closeSeries(io,uid,id32(input.id),nowMs);
  fail('racing_invalid_career_command');
 });
}

async function closeSeries(io,uid,id,nowMs){
 const series=await io.read(`racingSeries/${id}`);if(!series?.entries.some(p=>p.uid===uid)&&series?.creatorUid!==uid)fail('racing_series_unavailable',403);
 if(series.status==='closed')return {id};const standings=racingSeriesStandings(series),active=standings.filter(p=>!p.withdrawn);
 if(series.expiresAtMs<=nowMs&&series.expiresAtMs+L.finalizationGraceMs>nowMs)fail('racing_series_finalizing',409);
 if(series.expiresAtMs>nowMs&&series.creatorUid!==uid)fail('racing_crew_owner_required',403);
 if(series.expiresAtMs>nowMs&&(active.length<2||active.some(p=>!p.finished)))fail('racing_series_still_open',409);
 for(const row of standings){if(await io.read(`captureAccountDeletions/${row.uid}`))continue;const progress=await io.read(careerPath(row.uid))||{};io.set(careerPath(row.uid),{...progress,openSeriesIds:remove(progress.openSeriesIds,id),seriesFinishes:(progress.seriesFinishes||0)+(row.finished&&!row.withdrawn?1:0),seriesWins:(progress.seriesWins||0)+(row.finished&&!row.withdrawn&&row.position===1?1:0)});
  io.set(`users/${row.uid}/racingSeries/${id}`,{id,name:series.name,position:row.position,finished:row.finished&&!row.withdrawn,totalMs:row.totalMs,completed:row.completed,stages:series.stages.length,closedAtMs:nowMs});
 }
 io.set(`racingSeries/${id}`,{...series,status:'closed',standings,closedAtMs:nowMs});return {id};
}

async function projectRacingCareerResult({db,id}){
 if(!/^[a-f0-9-]{36}$/.test(id||''))return;
 const result=value(await db.collection('racingResults').doc(id).get());if(!result)return;
 for(const p of result.receipt?.players||[]){const finish=verifiedCareerFinish(result,p.uid);if(!finish)continue;
  await transaction(db,async io=>{
   if(!await io.read(`racingResults/${id}`)||await io.read(`captureAccountDeletions/${p.uid}`))return;
   const marker=`racingResults/${id}/careerApplications/${p.uid}`;if(await io.read(marker))return;
   const context=result.careerContexts?.[p.uid]||{};
   for(const key of context.rivalIds||[]){const r=await io.read(`racingRivals/${id32(key)}`);if(r?.status!=='active'||!r.players.includes(p.uid)||!careerFinishEligible(finish,{boardId:r.stage.boardId,joinedAtMs:r.joinedAtMs,expiresAtMs:r.expiresAtMs}))continue;
    try{await unblocked(io,r.players[0],r.players[1]);}catch{r.status='cancelled';io.set(`racingRivals/${key}`,r);continue;}
    // First accepted finish per driver: no asymmetric extra attempts while
    // waiting for the other driver. Failed/DNF runs do not post a time.
    if(r.bests[p.uid])continue;r.bests={...r.bests,[p.uid]:{timeMs:finish.timeMs,runId:id}};
    const outcome=racingRivalOutcome(r);if(outcome){r.status='complete';r.outcome=outcome;r.closedAtMs=finish.finishAtMs;
     for(const uid of r.players){const progress=await io.read(careerPath(uid))||{};io.set(careerPath(uid),{...progress,openRivalIds:remove(progress.openRivalIds,key),rivalFinishes:(progress.rivalFinishes||0)+1,rivalWins:(progress.rivalWins||0)+(outcome.winners.includes(uid)?1:0)});
      const other=r.players.find(v=>v!==uid);io.set(`users/${uid}/racingRivals/${key}`,{id:key,courseName:r.stage.courseName,timeMs:r.bests[uid].timeMs,opponent:r.labels[other]||'Explorer',opponentUid:other,opponentMs:r.bests[other].timeMs,won:outcome.winners.includes(uid),tie:outcome.tie,closedAtMs:finish.finishAtMs});}
    }io.set(`racingRivals/${key}`,r);
   }
   for(const key of context.seriesIds||[]){const series=await io.read(`racingSeries/${id32(key)}`);if(series?.status!=='open')continue;
    const entry=series.entries.find(e=>e.uid===p.uid),stage=series.stages.find(s=>s.boardId===finish.boardId);
    if(!entry||entry.withdrawn||!stage||!careerFinishEligible(finish,{boardId:stage.boardId,joinedAtMs:entry.joinedAtMs,expiresAtMs:series.expiresAtMs,leftAtMs:entry.leftAtMs}))continue;
    const previous=entry.bests[finish.boardId];if(!previous||previous.timeMs>finish.timeMs)entry.bests={...entry.bests,[finish.boardId]:{timeMs:finish.timeMs,runId:id}};
    io.set(`racingSeries/${key}`,series);
   }
   io.set(marker,{appliedAtMs:Date.now(),purpose:result.receipt.purpose});
  });
 }
}

async function readRacingCareer({db,uid,roomCode,nowMs=Date.now()}){
 if((await db.collection('captureAccountDeletions').doc(uid).get()).exists)fail('racing_account_closing',403);
 // The create trigger normally projects the receipt. This idempotent read
 // recovery lets a returning player see their latest accepted result promptly.
 const latest=value(await db.doc(careerPath(uid)).get());if(latest?.lastResultId)await projectRacingCareerResult({db,id:latest.lastResultId});
 for(const id of latest?.openSeriesIds||[]){const s=value(await db.collection('racingSeries').doc(id32(id)).get());if(s?.status==='open'&&s.expiresAtMs+L.finalizationGraceMs<=nowMs)await transaction(db,io=>closeSeries(io,uid,id,nowMs));}
 return transaction(db,async io=>{
  const me=await loadCareer(io,uid,nowMs);io.set(careerPath(uid),me);
  const inbox=[];for(const id of me.openRacingInviteIds||[]){const i=await io.read(inboxPath(uid,id));if(i){try{await unblocked(io,uid,i.fromUid);inbox.push(i);}catch{io.merge(inboxPath(uid,id),{status:'cancelled'});me.openRacingInviteIds=remove(me.openRacingInviteIds,id);}}}
  const crew=me.crewId?await io.read(`racingCrews/${id32(me.crewId)}`):null,series=[],rivals=[];
  for(const id of crew?.seriesIds||[]){const s=await io.read(`racingSeries/${id}`);if(s)series.push({...s,standings:racingSeriesStandings(s)});}
  for(const id of me.openRivalIds||[]){const r=await io.read(`racingRivals/${id}`);if(r){try{await unblocked(io,r.players[0],r.players[1]);rivals.push(r);}catch{rivals.push({id:r.id,status:'unavailable'});}}}
  // Durable history is a read projection; completed challenges are not lost
  // when their bounded active references leave the career document.
  const friends=await db.collection('users').doc(uid).collection('friends').limit(30).get(),candidates=friends.docs.map(s=>({uid:s.id,label:title(s.data().displayName)||'Explorer'}));
  if(/^[A-Z0-9]{6}$/.test(roomCode||'')){const self=await io.read(`rooms/${roomCode}/players/${uid}`);if(self?.uid===uid&&self.expiresAt?.toMillis?.()>nowMs){const peers=await db.collection('rooms').doc(roomCode).collection('players').limit(32).get();for(const row of peers.docs){const p=row.data();if(row.id!==uid&&p.uid===row.id&&p.expiresAt?.toMillis?.()>nowMs&&!candidates.some(p=>p.uid===row.id))candidates.push({uid:row.id,label:title(p.displayName)||'Explorer'});}}}
  const visibility=await Promise.all(candidates.map(async p=>{try{await unblocked(io,uid,p.uid);return true;}catch{return false;}})),available=candidates.filter((_p,i)=>visibility[i]);
  const hidden=new Set();await Promise.all([...new Set([...(crew?.members||[]).map(p=>p.uid),...series.flatMap(s=>s.entries.map(e=>e.uid))])].map(async id=>{try{await unblocked(io,uid,id);}catch{hidden.add(id);}}));
  const visibleCrew=crew?{...crew,memberCount:crew.members.length,members:crew.members.filter(p=>!hidden.has(p.uid))}:null;
  const visibleSeries=series.map(s=>({...s,entries:s.entries.filter(e=>!hidden.has(e.uid)),standings:s.standings.filter(e=>!hidden.has(e.uid))}));
  return {stats:{finishes:me.finishes||0,wins:me.wins||0,cleanFinishes:me.cleanFinishes||0,rivalFinishes:me.rivalFinishes||0,rivalWins:me.rivalWins||0,seriesFinishes:me.seriesFinishes||0,seriesWins:me.seriesWins||0},crew:visibleCrew,inbox,rivals,series:visibleSeries,candidates:available,limits:L};
 });
}
async function readRacingCareerHistory({db,uid,kind,cursor}){
 if((await db.collection('captureAccountDeletions').doc(uid).get()).exists)fail('racing_account_closing',403);
 if(!['rivals','series'].includes(kind))fail('racing_invalid_history');
 if(cursor&&(!Number.isFinite(cursor.closedAtMs)||!/^[a-f0-9]{32}$/.test(cursor.id||'')))fail('racing_invalid_history_page');
 // Match the automatic single-field index's document-name direction. This
 // stable tiebreaker pages equal timestamps without another composite index.
 let q=db.collection('users').doc(uid).collection(kind==='rivals'?'racingRivals':'racingSeries').orderBy('closedAtMs','desc').orderBy('__name__','desc');if(cursor)q=q.startAfter(cursor.closedAtMs,cursor.id);
 const page=await q.limit(21).get(),items=[];
 for(const s of page.docs.slice(0,20)){const r=s.data();if(r.opponentUid){const [a,b]=await Promise.all([db.doc(`users/${uid}/blockedPlayers/${r.opponentUid}`).get(),db.doc(`users/${r.opponentUid}/blockedPlayers/${uid}`).get()]);if(a.exists||b.exists)continue;}items.push({...r,id:s.id});}
 return {items,nextCursor:page.size>20?{closedAtMs:page.docs[19].data().closedAtMs,id:page.docs[19].id}:null};
}
module.exports={commitRacingCareer,readRacingCareer,projectRacingCareerResult,readRacingCareerHistory};
