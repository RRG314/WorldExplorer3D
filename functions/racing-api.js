'use strict';
// Read-only HTTP access to the race authority descriptor and its committed
// records. No client request can submit a time, award or approved course.
const ORIGIN=/^https:\/\/we3d-racing(?:-staging)?-[0-9]+\.us-central1\.run\.app$/;
async function racingServiceDescriptor(db){
 const snapshot=await db.collection('serviceConfig').doc('racing').get(),v=snapshot.exists?snapshot.data():{};
 if(v.enabled!==true||!ORIGIN.test(v.origin||''))throw Object.assign(Error('Online racing is not available right now. Practice and your garage remain available.'),{status:503});
 return {endpoint:v.origin.replace(/^https:/,'wss:')+'/race',protocolVersion:1};
}
async function readRacingRecords({db,uid,boardId,cursor}){
 const user=db.collection('users').doc(uid);
 if(!boardId){
  if(cursor!==undefined&&!/^[a-f0-9]{64}$/.test(cursor))throw Object.assign(Error('Invalid racing page.'),{status:400});
  let query=user.collection('racing').doc('career').collection('boards').orderBy('boardId');if(cursor)query=query.startAfter(cursor);
  const result=await query.limit(33).get(),rows=result.docs.slice(0,32);
  return {entries:rows.map(s=>({...s.data(),id:s.id})),nextCursor:result.size>32?rows.at(-1).id:null};
 }
 if(!/^[a-f0-9]{64}$/.test(boardId))throw Object.assign(Error('Choose a valid racing class.'),{status:400});
 const q=await db.collection('racingBoards').doc(boardId).collection('entries').orderBy('timeMs','asc').limit(20).get(),entries=[];
 for(const row of q.docs){const value=row.data(),[a,b]=await Promise.all([user.collection('blockedPlayers').doc(value.uid).get(),db.collection('users').doc(value.uid).collection('blockedPlayers').doc(uid).get()]);
  if(!a.exists&&!b.exists)entries.push({...value,id:row.id});}
 return {entries};
}
module.exports={racingServiceDescriptor,readRacingRecords};
