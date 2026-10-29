'use strict';
const {createHash}=require('node:crypto');
const {normalizeRaceRouteReference,raceDistrictFingerprint,reconstructPublishedRace,raceCourseKey,readPublishedRaceCourse,RACE_PHYSICS_VERSION}=require('./generated/racing-engine.cjs');
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=(message,status=422)=>{throw Object.assign(Error(message),{status});};
const data=s=>s.exists?s.data():null;
const clean=s=>String(s||'').replace(/[\u0000-\u001f\u007f]/g,'').trim();
const courseId=id=>{if(!/^road-race-[a-f0-9]{32}$/.test(id||''))fail('race_invalid_course');return id;};
const locationKey=id=>hash(String(id));
const timestamp=(admin,now)=>admin.firestore.Timestamp.fromMillis(Math.floor(now));
async function approvedDistrict(db,id){
 if(!/^[a-f0-9]{64}$/.test(id||''))fail('race_invalid_district');
 const record=data(await db.collection('racingDistricts').doc(id).get());
 if(record?.status!=='approved'||!record.facts||await raceDistrictFingerprint(record.facts)!==`race-district:${id}`)fail('race_district_unavailable',409);
 const pointer=data(await db.collection('racingLocations').doc(locationKey(record.facts.locationId)).get());
 if(pointer?.districtId!==id)fail('race_roads_changed_requalify_route',409);return record;
}
async function loadPublishedCourse(db,id,uid){
 return readPublishedRaceCourse({id:courseId(id),uid,read:async path=>data(await db.doc(path).get())});
}
async function readRacingCatalog({db,uid,locationId,cursor}){
 if(typeof locationId!=='string'||!/^earth:-?\d+:-?\d+$/.test(locationId))fail('race_invalid_location');
 if(cursor!==undefined&&!/^road-race-[a-f0-9]{32}$/.test(cursor))fail('race_invalid_catalog_page');
 const pointer=data(await db.collection('racingLocations').doc(locationKey(locationId)).get());
 if(!pointer)return {district:null,courses:[]};const district=await approvedDistrict(db,pointer.districtId);
 let publicQuery=db.collection('racingCourses').where('districtId','==',pointer.districtId).where('status','==','approved').orderBy('__name__');if(cursor)publicQuery=publicQuery.startAfter(cursor);
 const [publicRows,ownRows]=await Promise.all([publicQuery.limit(41).get(),
  db.collection('users').doc(uid).collection('racingRoutes').where('districtId','==',pointer.districtId).limit(40).get()]);
 const ids=new Set([...publicRows.docs.slice(0,40),...ownRows.docs].map(s=>s.id)),courses=[];
 for(const id of ids){const r=data(await db.collection('racingCourses').doc(id).get());if(!r||r.status!=='approved'&&r.ownerUid!==uid)continue;
  courses.push({id,status:r.status,ownerUid:r.ownerUid,revision:r.revision,reference:r.reference,reviewNote:r.reviewNote||'',tested:r.qualification?.revision===r.revision&&r.qualification?.physicsVersion===RACE_PHYSICS_VERSION});}
 return {district:{id:pointer.districtId,facts:district.facts,credits:district.credits},courses,nextCursor:publicRows.size>40?publicRows.docs[39].id:null};
}
async function writeRacingRoute({db,admin,uid,input,nowMs=Date.now()}){
 if(!input||!['save-draft','submit','withdraw'].includes(input.action))fail('race_invalid_route_command');
 if(Object.keys(input).some(k=>!['action','districtId','reference','id','revision'].includes(k)))fail('race_invalid_route_command');
 if(input.action==='save-draft'){
  const district=await approvedDistrict(db,input.districtId),reference=normalizeRaceRouteReference(input.reference);
  if(clean(reference.name).length<3)fail('race_route_name_required');
  const course=await reconstructPublishedRace(reference,district.facts),id=await raceCourseKey(course),revision=hash({districtId:input.districtId,reference});
  const ref=db.collection('racingCourses').doc(id),projection=db.collection('users').doc(uid).collection('racingRoutes').doc(id);
  const status=await db.runTransaction(async tx=>{
   const previous=data(await tx.get(ref)),owned=await tx.get(db.collection('users').doc(uid).collection('racingRoutes').limit(41));
   if(!previous&&owned.size>=40)fail('race_route_library_full',409);
   if(previous&&previous.ownerUid!==uid)fail('race_route_already_exists',409);
   if(previous&&previous.revision===revision)return previous.status;
   if(previous&&['review_required','approved'].includes(previous.status))fail('race_withdraw_before_editing',409);
   const next={ownerUid:uid,status:'draft',districtId:input.districtId,reference,revision,qualification:null,reviewNote:'',updatedAt:timestamp(admin,nowMs)};
   tx.set(ref,next);tx.set(projection,{districtId:input.districtId,status:'draft',revision});return 'draft';
  });return {id,revision,status};
 }
 const id=courseId(input.id),ref=db.collection('racingCourses').doc(id);
 return db.runTransaction(async tx=>{
  const record=data(await tx.get(ref));if(!record||record.ownerUid!==uid)fail('race_route_owner_required',403);
  if(record.revision!==input.revision)fail('race_route_changed',409);
  const projection=db.collection('users').doc(uid).collection('racingRoutes').doc(id);
  if(input.action==='submit'){
   if(record.status==='review_required')return {id,revision:record.revision,status:record.status};
   if(!['draft','rejected'].includes(record.status)||record.qualification?.revision!==record.revision||record.qualification.physicsVersion!==RACE_PHYSICS_VERSION||!record.qualification.resultId)fail('race_test_route_first',409);
   const result=data(await tx.get(db.collection('racingResults').doc(record.qualification.resultId)));
   if(result?.receipt?.purpose!=='qualification'||result.receipt.courseRevision!==record.revision||!result.receipt.players.some(p=>p.uid===uid&&p.finished))fail('race_test_route_first',409);
   const pointer=data(await tx.get(db.collection('racingLocations').doc(locationKey(record.reference.locationId||result.course.locationId))));
   if(pointer?.districtId!==record.districtId)fail('race_roads_changed_requalify_route',409);
   tx.update(ref,{status:'review_required',submittedAt:timestamp(admin,nowMs),updatedAt:timestamp(admin,nowMs)});tx.set(projection,{districtId:record.districtId,status:'review_required',revision:record.revision});
   return {id,revision:record.revision,status:'review_required'};
  }
  tx.update(ref,{status:'draft',updatedAt:timestamp(admin,nowMs)});tx.set(projection,{districtId:record.districtId,status:'draft',revision:record.revision});return {id,revision:record.revision,status:'draft'};
 });
}
async function listRacingReview({db,status='review_required',cursor}){
 if(!['review_required','approved','rejected'].includes(status)||cursor!==undefined&&!/^road-race-[a-f0-9]{32}$/.test(cursor))fail('race_invalid_review_filter');
 let q=db.collection('racingCourses').where('status','==',status).orderBy('__name__');if(cursor)q=q.startAfter(cursor);
 const rows=await q.limit(21).get(),items=[];
 for(const s of rows.docs.slice(0,20)){
  const r=s.data(),d=data(await db.collection('racingDistricts').doc(r.districtId).get());
  if(!d?.facts)continue;const course=await reconstructPublishedRace(r.reference,d.facts);
  items.push({id:s.id,revision:r.revision,status:r.status,ownerUid:r.ownerUid,course,credits:d.credits,reviewNote:r.reviewNote||'',qualification:r.qualification||null});
 }
 return {items,nextCursor:rows.size>20?rows.docs[19].id:null};
}
async function moderateRacingRoute({db,admin,moderatorUid,input,nowMs=Date.now()}){
 if(!input||Object.keys(input).some(k=>!['id','revision','decision','note'].includes(k))||!['approved','rejected'].includes(input.decision))fail('race_invalid_review');
 const note=clean(input.note).slice(0,400);if(input.decision==='rejected'&&note.length<3)fail('race_review_note_required');
 const id=courseId(input.id),ref=db.collection('racingCourses').doc(id);
 return db.runTransaction(async tx=>{
  const r=data(await tx.get(ref));if(!r||r.revision!==input.revision)fail('race_route_changed',409);
  if(r.status==='approved'&&input.decision==='rejected'){}else if(r.status!=='review_required')fail('race_review_not_pending',409);
  const d=data(await tx.get(db.collection('racingDistricts').doc(r.districtId))),pointer=d&&data(await tx.get(db.collection('racingLocations').doc(locationKey(d.facts.locationId))));
  if(input.decision==='approved'&&(d?.status!=='approved'||pointer?.districtId!==r.districtId||r.qualification?.revision!==r.revision||r.qualification.physicsVersion!==RACE_PHYSICS_VERSION))fail('race_test_route_first',409);
  tx.update(ref,{status:input.decision,reviewNote:note,reviewerUid:moderatorUid,reviewedAt:timestamp(admin,nowMs),updatedAt:timestamp(admin,nowMs)});
  tx.set(db.collection('users').doc(r.ownerUid).collection('racingRoutes').doc(id),{districtId:r.districtId,status:input.decision,revision:r.revision});
  tx.create(db.collection('adminActivity').doc(),{action:'racing_route_review',targetId:id,revision:r.revision,decision:input.decision,note,adminUid:moderatorUid,createdAt:timestamp(admin,nowMs)});
  return {id,revision:r.revision,status:input.decision};
 });
}
async function readMyRacingRoutes({db,uid}){
 const rows=await db.collection('users').doc(uid).collection('racingRoutes').limit(40).get(),items=[];
 for(const row of rows.docs){const r=data(await db.collection('racingCourses').doc(row.id).get());if(!r||r.ownerUid!==uid)continue;
  const d=data(await db.collection('racingDistricts').doc(r.districtId).get());if(!d?.facts)continue;
  items.push({id:row.id,revision:r.revision,status:r.status,name:r.reference.name,locationLabel:d.facts.locationLabel,anchor:d.facts.anchor,
   reviewNote:r.reviewNote||'',tested:r.qualification?.revision===r.revision&&r.qualification?.physicsVersion===RACE_PHYSICS_VERSION});
 }return {items};
}
module.exports={locationKey,approvedDistrict,loadPublishedCourse,readRacingCatalog,writeRacingRoute,listRacingReview,moderateRacingRoute,readMyRacingRoutes};
