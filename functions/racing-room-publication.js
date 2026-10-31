'use strict';
const {createHash}=require('node:crypto');
const {canonicalRaceDistrict,normalizeRaceRouteReference,raceDistrictFingerprint,reconstructPublishedRace,raceCourseKey,racePhysicsVersion}=require('./generated/racing-engine.cjs');
const value=s=>s.exists?s.data():null,fail=(message,status=422)=>{throw Object.assign(Error(message),{status});},hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),time=t=>t?.toMillis?.()??0;
const code=value=>{if(!/^[A-Z0-9]{6}$/.test(value||''))fail('race_invalid_room');return value;};
async function requireRoom(get,db,uid,roomCode,nowMs){
 const ref=db.collection('rooms').doc(code(roomCode)),[room,player,consent,closing]=await Promise.all([get(ref),get(ref.collection('players').doc(uid)),get(db.collection('users').doc(uid).collection('consents').doc('community')),get(db.collection('captureAccountDeletions').doc(uid))]);
 if(closing.exists)fail('race_account_closed',403);
 const r=value(room),p=value(player);
 if(r?.world?.kind!=='earth'||p?.uid!==uid||time(p.expiresAt)<=nowMs||nowMs-time(p.lastSeenAt)>120000||time(p.lastSeenAt)>nowMs+5000)fail('race_room_presence_expired',403);
 if(value(consent)?.version!=='community-2026-10-24')fail('race_community_consent_required',403);
 return {ref,world:r.world};
}
async function shareRoomRace({db,admin,uid,input,nowMs=Date.now()}){
 if(Object.keys(input).some(k=>!['action','roomCode','facts','reference'].includes(k)))fail('race_invalid_route_command');
 if(Buffer.byteLength(JSON.stringify(input.facts||{}))>224*1024)fail('race_room_route_too_large',413);
 const facts=canonicalRaceDistrict(input.facts),reference=normalizeRaceRouteReference(input.reference),districtId=(await raceDistrictFingerprint(facts)).slice(14),course=await reconstructPublishedRace(reference,facts),id=await raceCourseKey(course),revision=hash({districtId,reference});
 if(!course.eventRules||facts.venueSource||reference.name.length<3||facts.roads.some(r=>r.widthMeters>30))fail('race_invalid_room_route');
 return db.runTransaction(async tx=>{
  const {ref,world}=await requireRoom(r=>tx.get(r),db,uid,input.roomCode,nowMs);
  if(Math.abs(world.lat-facts.anchor.lat)>1e-7||Math.abs(world.lon-facts.anchor.lon)>1e-7)fail('race_course_wrong_world',409);
  const courseRef=ref.collection('racingCourses').doc(id),districtRef=ref.collection('racingDistricts').doc(districtId),[old,rows]=await Promise.all([tx.get(courseRef),tx.get(ref.collection('racingCourses').limit(9))]);
  const expired=rows.docs.filter(s=>time(s.data().expiresAt)<=nowMs);
  if(!old.exists&&rows.size-expired.length>=8)fail('race_room_route_limit',409);
  const previous=value(old);if(previous&&previous.revision!==revision)fail('race_room_route_conflict',409);
  const expiresAt=admin.firestore.Timestamp.fromMillis(nowMs+24*3600000),record={id,status:'room',ownerUid:previous?.ownerUid||uid,roomCode:input.roomCode,worldSeed:world.seed,districtId,reference,revision,physicsVersion:racePhysicsVersion(course),expiresAt};
  for(const row of expired)if(row.id!==id)tx.delete(row.ref);
  tx.set(db.collection('users').doc(record.ownerUid).collection('racingRoomRoutes').doc(input.roomCode+'-'+id),{roomCode:input.roomCode,id,districtId,expiresAt});
  tx.set(districtRef,{status:'room',facts,worldSeed:world.seed,expiresAt});tx.set(courseRef,record);
  return {id,status:'room',ownerUid:record.ownerUid,revision,districtId,reference,roomCode:input.roomCode};
 });
}
async function readRoomRaces({db,uid,roomCode,roomCourseId,locationId,nowMs=Date.now()}){
 const {ref,world}=await requireRoom(r=>r.get(),db,uid,roomCode,nowMs);
 if(locationId!==`earth:${Math.round(world.lat*1e7)}:${Math.round(world.lon*1e7)}`)fail('race_course_wrong_world',409);
 if(roomCourseId!==undefined&&!/^road-race-[a-f0-9]{32}$/.test(roomCourseId))fail('race_invalid_course');
 const rows=roomCourseId?[await ref.collection('racingCourses').doc(roomCourseId).get()]:(await ref.collection('racingCourses').limit(8).get()).docs,roomCourses=[];
 for(const row of rows){const r=value(row);if(!r||r.status!=='room'||r.worldSeed!==world.seed||time(r.expiresAt)<=nowMs)continue;
  const [a,b]=await Promise.all([db.collection('users').doc(uid).collection('blockedPlayers').doc(r.ownerUid).get(),db.collection('users').doc(r.ownerUid).collection('blockedPlayers').doc(uid).get()]);if(a.exists||b.exists)continue;
  const entry={id:row.id,status:'room',ownerUid:r.ownerUid,revision:r.revision,districtId:r.districtId,reference:r.reference,roomCode};
  if(roomCourseId){const district=value(await ref.collection('racingDistricts').doc(r.districtId).get());if(district?.status!=='room'||time(district.expiresAt)<=nowMs)continue;entry.facts=district.facts;}
  roomCourses.push(entry);
 }
 return {roomCourses};
}
module.exports={shareRoomRace,readRoomRaces};
