'use strict';
// Whole-account deletion already creates captureAccountDeletions/{uid} before
// calling this adapter. Racing writers and result projections observe that same
// durable closing marker; they cannot resurrect the removed account tree.
async function cleanupRacingAccount({db,uid,nowMs=Date.now()}){
 if(!uid||uid.includes('/'))throw Error('invalid_account_identity');
 if(!(await db.collection('captureAccountDeletions').doc(uid).get()).exists)throw Error('account_closing_marker_required');
 const user=db.collection('users').doc(uid);
 for(;;){const rows=await user.collection('racingRoomRoutes').limit(100).get();if(rows.empty)break;
  for(const row of rows.docs)await db.runTransaction(async tx=>{const r=row.data();if(!/^[A-Z0-9]{6}$/.test(r.roomCode)||!/^road-race-[a-f0-9]{32}$/.test(r.id)){tx.delete(row.ref);return;}
   const ref=db.collection('rooms').doc(r.roomCode).collection('racingCourses').doc(r.id),course=await tx.get(ref);if(course.exists&&course.data().ownerUid===uid)tx.delete(ref);tx.delete(row.ref);
  });
 }

 for(;;){const rows=await db.collection('racingCrews').where('memberUids','array-contains',uid).limit(100).get();if(rows.empty)break;
  for(const row of rows.docs)await db.runTransaction(async tx=>{
   const snapshot=await tx.get(row.ref);if(!snapshot.exists)return;const crew=snapshot.data();
   crew.members=crew.members.filter(p=>p.uid!==uid);crew.memberUids=crew.members.map(p=>p.uid);if(crew.ownerUid===uid)crew.ownerUid=crew.members[0]?.uid||'';if(!crew.members.length)crew.status='closed';tx.set(row.ref,crew);
  });
 }
 for(;;){const rows=await db.collectionGroup('racingInvites').where('fromUid','==',uid).limit(100).get();if(rows.empty)break;const batch=db.batch();
  for(const row of rows.docs){batch.delete(row.ref);batch.delete(row.ref.parent.parent.collection('notifications').doc('racing-'+row.id));}await batch.commit();
 }
 let after=null;
 for(;;){let query=db.collectionGroup('entries').where('uid','==',uid).orderBy('__name__');if(after)query=query.startAfter(after);const rows=await query.limit(100).get();if(rows.empty)break;const batch=db.batch();
  for(const row of rows.docs)if(row.ref.path.startsWith('racingBoards/'))batch.delete(row.ref);await batch.commit();after=rows.docs.at(-1).ref;
 }
 for(;;){const rows=await db.collection('racingCourses').where('ownerUid','==',uid).limit(100).get();if(rows.empty)break;const batch=db.batch();
  for(const row of rows.docs){const r=row.data();batch.update(row.ref,{ownerUid:null,status:'withdrawn',reference:{...r.reference,name:'Archived route'},qualification:null,reviewNote:'',updatedAtMs:nowMs});}await batch.commit();
 }
 for(;;){const rows=await db.collection('racingRivals').where('players','array-contains',uid).limit(100).get();if(rows.empty)break;
  for(const row of rows.docs)await db.runTransaction(async tx=>{
   const live=await tx.get(row.ref);if(!live.exists)return;const r=live.data();if(!r.players.includes(uid))return;
   const others=r.players.filter(p=>p!==uid),history=[];for(const other of others){const ref=db.collection('users').doc(other).collection('racingRivals').doc(row.id),s=await tx.get(ref);if(s.exists)history.push([ref,s.data()]);}
   const labels=Object.fromEntries(Object.entries(r.labels||{}).filter(([key])=>key!==uid)),bests=Object.fromEntries(Object.entries(r.bests||{}).filter(([key])=>key!==uid));
   tx.set(row.ref,{...r,players:others,creatorUid:r.creatorUid===uid?null:r.creatorUid,targetUid:r.targetUid===uid?null:r.targetUid,labels,bests,
    ...(r.outcome?{outcome:{...r.outcome,winners:r.outcome.winners.filter(key=>key!==uid)}}:{}),status:['invited','active'].includes(r.status)?'cancelled':r.status});
   for(const [ref,h]of history)tx.set(ref,{...h,opponent:'Deleted explorer',opponentUid:null,opponentMs:null});
  });
 }
 for(;;){const rows=await db.collection('racingSeries').where('participantUids','array-contains',uid).limit(100).get();if(rows.empty)break;
  for(const row of rows.docs)await db.runTransaction(async tx=>{
   const live=await tx.get(row.ref);if(!live.exists)return;const s=live.data();if(!s.participantUids.includes(uid))return;
   const crew=await tx.get(db.collection('racingCrews').doc(s.crewId)),nextOwner=crew.exists?crew.data().ownerUid:null;
   const entries=s.entries.filter(e=>e.uid!==uid);tx.set(row.ref,{...s,entries,participantUids:s.participantUids.filter(id=>id!==uid),creatorUid:s.creatorUid===uid?nextOwner:s.creatorUid,
    ...(s.standings?{standings:s.standings.filter(e=>e.uid!==uid)}:{}),...(!entries.length?{status:'closed',closedAtMs:nowMs}:{})});
  });
 }
 for(;;){const rows=await db.collection('racingSeries').where('creatorUid','==',uid).limit(100).get();if(rows.empty)break;
  for(const row of rows.docs)await db.runTransaction(async tx=>{const live=await tx.get(row.ref);if(!live.exists||live.data().creatorUid!==uid)return;const s=live.data(),crew=await tx.get(db.collection('racingCrews').doc(s.crewId));tx.update(row.ref,{creatorUid:crew.exists?crew.data().ownerUid||null:null});});
 }
 async function anonymizeResults(query){for(;;){const rows=await query.limit(100).get();if(rows.empty)break;for(const row of rows.docs)await db.runTransaction(async tx=>{
   const live=await tx.get(row.ref);if(!live.exists)return;const r=live.data(),without=map=>Object.fromEntries(Object.entries(map||{}).filter(([key])=>key!==uid));
   const creator=r.course?.publication?.ownerUid===uid,course=creator?{...r.course,name:'Archived route',publication:{...r.course.publication,ownerUid:null}}:r.course;
   tx.set(row.ref,{...r,participantUids:(r.participantUids||[]).filter(id=>id!==uid),profiles:without(r.profiles),careerContexts:without(r.careerContexts),
    receipt:{...r.receipt,players:r.receipt.players.filter(p=>p.uid!==uid)},snapshot:{...r.snapshot,creatorUid:r.snapshot.creatorUid===uid?null:r.snapshot.creatorUid??null,leaderUid:r.snapshot.leaderUid===uid?null:r.snapshot.leaderUid??null,players:r.snapshot.players.filter(p=>p.uid!==uid)},...(course?{course}:{})});
   tx.delete(row.ref.collection('careerApplications').doc(uid));
  });}}
 await anonymizeResults(db.collection('racingResults').where('participantUids','array-contains',uid));
 await anonymizeResults(db.collection('racingResults').where('course.publication.ownerUid','==',uid));
 for(const name of ['racing','racingRoutes','racingInvites','racingRivals','racingSeries'])await db.recursiveDelete(user.collection(name));
 for(;;){const rows=await user.collection('notifications').where('type','==','racing_invite').limit(100).get();if(rows.empty)break;const batch=db.batch();for(const row of rows.docs)batch.delete(row.ref);await batch.commit();}

}
module.exports={cleanupRacingAccount};
