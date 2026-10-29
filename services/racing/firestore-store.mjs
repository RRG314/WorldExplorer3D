import {Timestamp} from 'firebase-admin/firestore';
import {createHash} from 'node:crypto';
import {createRaceVehicleProfile,raceVehicleWorldPose,normalizeVehicleGarage,personalVehicleIdentity,personalVehicleById,
 raceGridPose,raceRecordConfiguration,raceCompetitiveRecordConfiguration,RACE_PHYSICS_VERSION,prepareExplorerCreditAward,racingCareerContext} from './generated/engine.mjs';
import {digest} from './authority.mjs';
const time=v=>v?.toMillis?.()??0;
const entityId=(uid,id)=>`personal:${uid}:${id}`;
const entityKey=id=>createHash('sha256').update(id).digest('hex').slice(0,40);
const value=s=>s.exists?s.data():null;
const fail=reason=>{throw Error(reason);};
const ts=ms=>Timestamp.fromMillis(Math.floor(ms));
export function createFirestoreRaceStore({db,loadCourse,now=()=>Date.now()}) {
 const user=uid=>db.collection('users').doc(uid);
 const room=code=>db.collection('rooms').doc(code);
 const lock=race=>room(race.roomCode).collection('racing').doc('current');
 const entity=(race,uid,id)=>room(race.roomCode).collection('urbanEntities').doc(entityKey(entityId(uid,id)));
 async function requirePublication(tx,race,uid){
  const p=race.course.publication;if(!p)return; // Injected controlled-course adapter only.
  if(p.purpose==='qualification'&&uid&&uid!==p.ownerUid)fail('race_route_owner_required');
  const [r,d,l]=await Promise.all([tx.get(db.collection('racingCourses').doc(race.courseId)),tx.get(db.collection('racingDistricts').doc(p.districtId)),
   tx.get(db.collection('racingLocations').doc(digest(String(race.course.locationId))))]);
  const current=value(r);
  if(current?.revision!==p.revision||current.status!==p.status||value(d)?.status!=='approved'||value(l)?.districtId!==p.districtId)fail('race_course_changed');
 }
 function requireSeat(race,uid,roomData,player,consent,nowMs){
  if(!roomData||roomData.world?.kind!=='earth'||roomData.world?.seed!==race.worldSeed)fail('race_room_world_changed');
  if(!player||player.uid!==uid||time(player.expiresAt)<=nowMs||time(player.lastSeenAt)>nowMs+5000||nowMs-time(player.lastSeenAt)>120000)fail('race_room_presence_expired');
  if(consent?.version!=='community-2026-10-24')fail('race_community_consent_required');
  if(Math.abs(Number(roomData.world.lat)-race.course.anchor.lat)>.000001||Math.abs(Number(roomData.world.lon)-race.course.anchor.lon)>.000001)fail('race_course_wrong_world');
 }
 function requireLock(data,race,instanceId,nowMs){
  if(data?.id!==race.id||data.instanceId!==instanceId||time(data.expiresAt)<=nowMs)fail('race_authority_lease_expired');
 }
 async function admit({race,uid,vehicleId,instanceId,nowMs,slot,reconnect}) {
  if(!personalVehicleById(vehicleId))fail('race_vehicle_unknown');
  return db.runTransaction(async tx=>{
   const r=room(race.roomCode),u=user(uid),carRef=entity(race,uid,vehicleId);
   const [rs,ps,cs,ls,gs,es,career,closing]=await Promise.all([tx.get(r),tx.get(r.collection('players').doc(uid)),tx.get(u.collection('consents').doc('community')),
    tx.get(lock(race)),tx.get(u.collection('gameplay').doc('vehicleUpgrades')),tx.get(carRef),tx.get(u.collection('racing').doc('career')),tx.get(db.collection('captureAccountDeletions').doc(uid))]);
   if(closing.exists)fail('race_account_closed');
   const currentLock=value(ls),player=value(ps),car=value(es),progress=value(gs)||{};
   await requirePublication(tx,race,uid);
   requireSeat(race,uid,value(rs),player,value(cs),nowMs);
   if(currentLock&&time(currentLock.expiresAt)>nowMs&&(currentLock.id!==race.id||currentLock.instanceId!==instanceId))fail('race_room_busy');
   // Blocking is symmetric, including private rooms. Reads precede all writes.
   for(const otherUid of race.roster.keys())if(otherUid!==uid){
    const [a,b]=await Promise.all([tx.get(u.collection('blockedPlayers').doc(otherUid)),tx.get(user(otherUid).collection('blockedPlayers').doc(uid))]);
    if(a.exists||b.exists)fail('race_roster_unavailable');
   }
   const owned=normalizeVehicleGarage(progress.garage).vehicles[vehicleId];
   if(!owned)fail('race_owned_vehicle_required');
   const profile=createRaceVehicleProfile(vehicleId,{condition:owned.condition,levels:progress.vehicles?.[personalVehicleIdentity(vehicleId)]||{}});
   if(profile.handling.width>race.course.vehicleEnvelope.widthMeters||profile.handling.length>race.course.vehicleEnvelope.lengthMeters||profile.handling.height>race.course.vehicleEnvelope.heightMeters)fail('race_vehicle_exceeds_course_envelope');
   if(progress.raceReservation&&time(progress.raceReservation.expiresAt)>nowMs&&progress.raceReservation.id!==race.id)fail('race_vehicle_busy');
   if(reconnect){if(car?.raceCustody?.id!==race.id||car?.raceCustody?.instanceId!==instanceId||time(car.raceCustody.expiresAt)<=nowMs)fail('race_vehicle_custody_ended');}
   else{
    if(slot>=race.course.participants)fail('race_roster_unavailable');
    if(!car||car.leaseOwnerUid!==uid||time(car.leaseExpiresAt)<=nowMs||car.worldSeed!==race.worldSeed)fail('race_personal_car_lease_required');
    if(car.raceCustody&&time(car.raceCustody.expiresAt)>nowMs)fail('race_vehicle_busy');
    const grid=raceGridPose(race.course,slot);
    // Admission cannot be used as a remote vehicle/position setter. Drive to
    // this course's start, using the existing room presence and car custody.
    if(!player.pose||Math.hypot(player.pose.x-grid.x,player.pose.y-grid.y,player.pose.z-grid.z)>30||
     Math.hypot(car.pose.x-grid.x,car.pose.y-grid.y,car.pose.z-grid.z)>30)fail('race_move_to_start');
   }
   const until=nowMs+15000,expiresAt=ts(until);
   tx.set(lock(race),{id:race.id,instanceId,courseId:race.courseId,worldSeed:race.worldSeed,expiresAt,updatedAt:ts(nowMs)});
   tx.update(carRef,{raceCustody:{id:race.id,instanceId,expiresAt},leaseExpiresAt:expiresAt});
   tx.set(u.collection('gameplay').doc('vehicleUpgrades'),{raceReservation:{id:race.id,instanceId,expiresAt}},{merge:true});
   return {label:String(player.displayName||'Explorer').slice(0,40),profile,leaseUntil:until,careerContext:racingCareerContext(value(career)||{},nowMs)};
  });
 }
 async function renew({race,instanceId,nowMs,starting=false}){
  return db.runTransaction(async tx=>{
   const r=room(race.roomCode),[rs,ls]=await Promise.all([tx.get(r),tx.get(lock(race))]);requireLock(value(ls),race,instanceId,nowMs);
   await requirePublication(tx,race);
   const rows=[];
   for(const [uid,p]of race.roster){
    if(p.released)continue;
    const [ps,cs,es,closing]=await Promise.all([tx.get(r.collection('players').doc(uid)),tx.get(user(uid).collection('consents').doc('community')),tx.get(entity(race,uid,p.vehicleId)),tx.get(db.collection('captureAccountDeletions').doc(uid))]);
    if(closing.exists)fail('race_account_closed');
    requireSeat(race,uid,value(rs),value(ps),value(cs),nowMs);const car=value(es);
    if(car?.raceCustody?.id!==race.id||car.raceCustody.instanceId!==instanceId)fail('race_vehicle_custody_ended');
    for(const otherUid of race.roster.keys())if(otherUid!==uid){const a=await tx.get(user(uid).collection('blockedPlayers').doc(otherUid));if(a.exists)fail('race_roster_unavailable');}
    if(starting){const gs=await tx.get(user(uid).collection('gameplay').doc('vehicleUpgrades')),g=value(gs)||{},owned=normalizeVehicleGarage(g.garage).vehicles[p.vehicleId];
     if(!owned||JSON.stringify(raceRecordConfiguration(createRaceVehicleProfile(p.vehicleId,{condition:owned.condition,levels:g.vehicles?.[personalVehicleIdentity(p.vehicleId)]||{}})))!==JSON.stringify(raceRecordConfiguration(p.profile)))fail('race_vehicle_setup_changed');}
    rows.push([uid,p,car]);
   }
   const until=nowMs+15000,expiresAt=ts(until),snapshot=race.session.snapshot();
   tx.update(lock(race),{expiresAt,updatedAt:ts(nowMs)});
   for(const [uid,p,car]of rows){const pose=raceVehicleWorldPose(snapshot.players.find(row=>row.uid===uid))||car.pose;
    tx.update(entity(race,uid,p.vehicleId),{raceCustody:{id:race.id,instanceId,expiresAt},leaseExpiresAt:expiresAt,pose,updatedAt:ts(nowMs)});
    tx.set(user(uid).collection('gameplay').doc('vehicleUpgrades'),{raceReservation:{id:race.id,instanceId,expiresAt}},{merge:true});}
   return {leaseUntil:until};
  });
 }
 async function releaseParticipant({race,uid,instanceId,nowMs}){
  const p=race.roster.get(uid);if(!p)return;
  await db.runTransaction(async tx=>{
   const ref=entity(race,uid,p.vehicleId),progressRef=user(uid).collection('gameplay').doc('vehicleUpgrades');
   const [es,gs]=await Promise.all([tx.get(ref),tx.get(progressRef)]),saved=value(es),progress=value(gs);
   if(saved?.raceCustody?.id!==race.id||saved.raceCustody.instanceId!==instanceId)return;
   const pose=raceVehicleWorldPose(race.session?.snapshot().players.find(row=>row.uid===uid))||saved.pose;
   tx.update(ref,{raceCustody:null,pose,leaseExpiresAt:ts(nowMs+15000),updatedAt:ts(nowMs)});
   if(progress?.raceReservation?.id===race.id&&progress.raceReservation.instanceId===instanceId)tx.set(progressRef,{raceReservation:null},{merge:true});
  });
 }
 async function release({race,instanceId,nowMs}){
  for(const uid of race.roster.keys())await releaseParticipant({race,uid,instanceId,nowMs});
  await db.runTransaction(async tx=>{const ref=lock(race),current=value(await tx.get(ref));if(current?.id===race.id&&current.instanceId===instanceId)tx.update(ref,{expiresAt:ts(nowMs)});});
 }
 async function settle({race,snapshot,instanceId,nowMs}){
  const purpose=race.course.publication?.purpose||(race.course.discipline==='time-trial'?'time-trial':'competition'),qualification=purpose==='qualification';
  if(snapshot.id!==race.id||snapshot.phase!=='complete'||snapshot.players.length<(purpose==='competition'?2:1)||snapshot.players.some(p=>p.ai)||
   qualification&&(snapshot.players.length!==1||snapshot.players[0].uid!==race.course.publication.ownerUid))fail('race_result_unverified');
  const resultRef=db.collection('racingResults').doc(race.id),fingerprint=digest({snapshot,courseId:race.courseId,physicsVersion:RACE_PHYSICS_VERSION});
  return db.runTransaction(async tx=>{
   const saved=value(await tx.get(resultRef));if(saved){if(saved.fingerprint!==fingerprint)fail('race_result_conflict');return saved.receipt;}
   requireLock(value(await tx.get(lock(race))),race,instanceId,nowMs);
   await requirePublication(tx,race);
   if(qualification){
    const p=snapshot.players[0],finished=!!p.progress?.finished&&!p.dnf&&Number.isFinite(p.progress.elapsedMs)&&p.progress.elapsedMs>0;
    if((await tx.get(db.collection('captureAccountDeletions').doc(p.uid))).exists)fail('race_account_closed');
    const receipt={id:race.id,purpose,courseId:race.courseId,courseRevision:race.course.publication.revision,physicsVersion:RACE_PHYSICS_VERSION,
     players:[{uid:p.uid,finished,timeMs:finished?p.progress.elapsedMs:null,credits:0}]};
    if(finished)tx.update(db.collection('racingCourses').doc(race.courseId),{qualification:{resultId:race.id,revision:race.course.publication.revision,physicsVersion:RACE_PHYSICS_VERSION,timeMs:p.progress.elapsedMs,completedAt:ts(nowMs)}});
    tx.create(resultRef,{fingerprint,receipt,snapshot,course:race.course,participantUids:snapshot.players.map(p=>p.uid),courseId:race.courseId,roomCode:race.roomCode,worldSeed:race.worldSeed,
     profiles:Object.fromEntries([...race.roster].map(([uid,p])=>[uid,raceRecordConfiguration(p.profile)])),physicsVersion:RACE_PHYSICS_VERSION,createdAt:ts(nowMs)});
    return receipt;
   }
   const rows=[],dayKey=new Date(nowMs).toISOString().slice(0,10),finishers=snapshot.players.filter(p=>!p.dnf&&p.progress?.finished).length;
   for(const p of snapshot.players){
    if((await tx.get(db.collection('captureAccountDeletions').doc(p.uid))).exists)fail('race_account_closed');
    const profile=race.roster.get(p.uid).profile,configuration=raceCompetitiveRecordConfiguration(profile,{slot:p.slot,participants:race.course.participants}),boardId=digest({courseId:race.courseId,...configuration});
    const board=db.collection('racingBoards').doc(boardId),entry=board.collection('entries').doc(p.uid),career=user(p.uid).collection('racing').doc('career');
    const walletRef=user(p.uid).collection('economy').doc('wallet');
    const [previous,progress,wallet]=await Promise.all([tx.get(entry),tx.get(career),tx.get(walletRef)]);rows.push({p,configuration,boardId,board,entry,career,walletRef,wallet:value(wallet)||{},previous:value(previous),progress:value(progress)||{}});
   }
   const receipt={id:race.id,purpose,courseId:race.courseId,physicsVersion:RACE_PHYSICS_VERSION,players:[]};
   for(const row of rows){const {p,configuration,boardId,board,entry,career,previous,progress}=row;
    const finished=p.progress?.finished&&!p.dnf,eligible=finished&&Number.isFinite(p.progress.elapsedMs)&&p.progress.elapsedMs>0;
    let credits=0;
    if(eligible){
     const record={uid:p.uid,player:p.label,timeMs:p.progress.elapsedMs,runId:race.id,courseId:race.courseId,courseName:race.course.name,
      location:race.course.locationLabel,configuration,physicsVersion:RACE_PHYSICS_VERSION,verified:true,createdAt:ts(nowMs)};
     if(!previous||previous.timeMs>record.timeMs){
      tx.set(entry,record);
      // A paged read projection of the same accepted personal best. It never
      // owns timing, awards or another identity; old classes remain reachable.
      tx.set(career.collection('boards').doc(boardId),{...record,boardId});
     }
     tx.set(board,{courseId:race.courseId,courseName:race.course.name,configuration,updatedAt:ts(nowMs)},{merge:true});
     const rewarded=progress.dayKey===dayKey?Number(progress.rewardedFinishes)||0:0;
     if(purpose==='competition'&&finishers>=2&&rewarded<3){const next=prepareExplorerCreditAward(row.wallet,{amount:p.position===1?250:150,nowMs,timestampFromMs:ts});
      credits=next.credits-prepareExplorerCreditAward(row.wallet,{amount:0,nowMs,timestampFromMs:ts}).credits;tx.set(row.walletRef,next);}
     // One immutable receipt atomically owns rankings, reputation and the
     // existing Explorer wallet credit. At most three paid finishes per day.
     tx.set(career,{...progress,finishes:(progress.finishes||0)+1,wins:(progress.wins||0)+(purpose==='competition'&&p.position===1?1:0),
      cleanFinishes:(progress.cleanFinishes||0)+(!p.barrierContacts&&!p.progress.penaltyMs?1:0),dayKey,rewardedFinishes:rewarded+(credits>0?1:0),
      lastResultId:race.id,updatedAt:ts(nowMs)});
    }
    receipt.players.push({uid:p.uid,boardId,finished:eligible,timeMs:eligible?p.progress.elapsedMs:null,credits});
   }
   tx.create(resultRef,{fingerprint,receipt,snapshot,course:race.course,participantUids:snapshot.players.map(p=>p.uid),courseId:race.courseId,roomCode:race.roomCode,worldSeed:race.worldSeed,
    careerContexts:Object.fromEntries([...race.roster].map(([uid,p])=>[uid,p.careerContext||racingCareerContext({},nowMs)])),
    profiles:Object.fromEntries([...race.roster].map(([uid,p])=>[uid,raceRecordConfiguration(p.profile)])),physicsVersion:RACE_PHYSICS_VERSION,createdAt:ts(nowMs)});
   return receipt;
  });
 }
 async function result(id,uid){const saved=value(await db.collection('racingResults').doc(id).get());if(!saved?.snapshot?.players.some(p=>p.uid===uid))return null;
  const course=saved.course||await loadCourse(saved.courseId,uid);if(!course)return null;
  return {...saved,course,snapshot:{...saved.snapshot,profiles:saved.profiles,courseId:saved.courseId,physicsVersion:saved.physicsVersion,settlement:'saved',receipt:saved.receipt}};
 }
 return {course:loadCourse,admit,renew,release,releaseParticipant,settle,result};
}
