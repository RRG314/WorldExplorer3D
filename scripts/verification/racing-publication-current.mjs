import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {collectRaceDistrict,recommendRaceCourses} from '../../app/js/racing/world-course-source.js';
import {canonicalRaceDistrict,raceDistrictFingerprint,raceGridPose,readPublishedRaceCourse} from '../../services/racing/generated/engine.mjs';
import {raceLocationKey} from '../../app/js/racing/publication-rules.js';
import {createRaceServer} from '../../services/racing/transport.mjs';
import {createFirestoreRaceStore} from '../../services/racing/firestore-store.mjs';
const require=createRequire(new URL('../../services/racing/package.json',import.meta.url)),sdk=require('firebase-admin/app'),{Timestamp,getFirestore}=require('firebase-admin/firestore'),{getAuth}=require('firebase-admin/auth'),admin={firestore:{Timestamp}};
const publication=createRequire(import.meta.url)('../../functions/racing-publication.js'),urban=createRequire(import.meta.url)('../../functions/urban-sandbox.js'),economy=createRequire(import.meta.url)('../../functions/economy-authority.js');
const projectId=process.env.GCLOUD_PROJECT;
if(!/^demo-/.test(projectId||'')||!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||'')||!/^127\.0\.0\.1:\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST||''))throw Error('Explicit isolated Auth/Firestore emulators required.');
const app=sdk.initializeApp({projectId}),db=getFirestore(app),auth=getAuth(app),users=[],stamp=Date.now(),roomCode='PUBT01',worldSeed='controlled-publication-'+stamp,roomRef=db.collection('rooms').doc(roomCode),timestampFromMs=ms=>Timestamp.fromMillis(Math.floor(ms));
const segments=[{fromId:0,toId:1,segIndex:0,sourceTStart:0,sourceTEnd:1,p1:{x:0,z:0},p2:{x:0,z:250},feature:{id:'verification-road',name:'Controlled road',width:8,metersPerWorldUnit:1,driveable:true,structureSemantics:{structureKind:'none'}},direction:'both'}];
const local=await collectRaceDistrict({worldPublication:{requestId:'controlled',sequence:1,location:{lat:43,lon:7}},worldLoadRuntimeState:{sequence:1,location:{name:'Controlled road'}},METERS_PER_WORLD_UNIT:1,LOC:{lat:43,lon:7},buildings:[],buildTraversalNetworks:()=>({drive:{segments}}),sampleFeatureSurfaceY:()=>0,SurfaceQuery:{driveAt:()=>({kind:'road',position:{y:0}})},transportDetail:{hasReadyCoverageAt:()=>true}},{yieldWork:()=>Promise.resolve()}),facts=canonicalRaceDistrict(local),districtId=(await raceDistrictFingerprint(facts)).slice(14),course=recommendRaceCourses(local).events.find(c=>c.discipline==='sprint');
const store=createFirestoreRaceStore({db,loadCourse:(id,uid)=>readPublishedRaceCourse({id,uid,read:async path=>{const s=await db.doc(path).get();return s.exists?s.data():null;}})});let service;
async function account(i){const r=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`publication-${stamp}-${i}@example.test`,password:'Controlled-publication-47!',returnSecureToken:true})}),v=await r.json();assert.equal(r.status,200);const u={uid:v.localId,token:v.idToken};users.push(u);return u;}
try{
 for(let i=0;i<2;i++){
  const u=await account(i),user=db.collection('users').doc(u.uid);await user.collection('consents').doc('community').set({version:'community-2026-10-24'});
  await roomRef.collection('players').doc(u.uid).set({uid:u.uid,displayName:`Route driver ${i+1}`,pose:raceGridPose(course,0),lastSeenAt:Timestamp.now(),expiresAt:timestampFromMs(Date.now()+180000)});
 }
 await roomRef.set({ownerUid:users[0].uid,world:{kind:'earth',lat:43,lon:7,seed:worldSeed}});
 await db.collection('racingDistricts').doc(districtId).set({status:'approved',facts,credits:[{label:'Controlled fixture',license:'Verification only',url:'https://www.openstreetmap.org/copyright'}]});
 await db.collection('racingLocations').doc(await raceLocationKey(facts.locationId)).set({districtId});
 for(const collection of ['racingCourses','racingDistricts','racingLocations']){
  const r=await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/${collection}/fabricated`,{method:'PATCH',headers:{Authorization:`Bearer ${users[0].token}`,'Content-Type':'application/json'},body:JSON.stringify({fields:{status:{stringValue:'approved'}}})});assert.equal(r.status,403);
 }
 service=createRaceServer({store,origins:['http://127.0.0.1:4298'],authenticate:async input=>{assert.equal(input.appCheckToken,'controlled-local-attestation');const u=await auth.verifyIdToken(input.idToken,true);return {uid:u.uid,expiresAtMs:u.exp*1000};}});
 await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));
 const api=async(token,kind,input)=>{
  const identity=await auth.verifyIdToken(token,true),uid=identity.uid;
  if(kind==='catalog')return publication.readRacingCatalog({db,uid,locationId:input.locationId,cursor:input.cursor});
  if(kind==='mine')return publication.readMyRacingRoutes({db,uid});
  if(kind==='command')return publication.writeRacingRoute({db,admin,uid,input});
  if(kind==='review'){
   // The real protected Functions endpoint uses requireModerator. This HTTP
   // adapter injects a single designated review role for the component journey.
   if(uid!==users[1].uid)throw Object.assign(Error('moderator_required'),{status:403});
   return input.action==='list'?publication.listRacingReview({db,status:input.status,cursor:input.cursor}):publication.moderateRacingRoute({db,admin,moderatorUid:uid,input});
  }
  throw Error('unknown_api');
 };
 if(!process.env.WE3D_RACING_PUBLICATION_BROWSER)throw Error('Provide the scoped real-browser journey.');
 const {run}=await import(pathToFileURL(process.env.WE3D_RACING_PUBLICATION_BROWSER).href);
 const result=await run({endpoint:`ws://127.0.0.1:${service.server.address().port}/race`,users,course,segments,room:{code:roomCode,world:{kind:'earth',lat:43,lon:7,seed:worldSeed}},api,
  vehicleCommand:async(token,kind,input)=>{
   const {uid}=await auth.verifyIdToken(token,true),user=db.collection('users').doc(uid),nowMs=Date.now();
   if(kind==='garage')return economy.settleVehicleGarageAction({runTransaction:fn=>db.runTransaction(fn),walletRef:user.collection('economy').doc('wallet'),progressRef:user.collection('gameplay').doc('vehicleUpgrades'),receiptRef:user.collection('vehicleReceipts').doc(input.requestId),uid,input,nowMs,timestampFromMs});
   assert.equal(input.roomCode,roomCode);assert.equal(input.worldSeed,worldSeed);
   const entityRef=roomRef.collection('urbanEntities').doc(urban.urbanEntityDocumentId(input.entityId)),actor=(await roomRef.collection('players').doc(uid).get()).data();
   if(kind==='claim')return urban.claimUrbanVehicleLease({runTransaction:fn=>db.runTransaction(fn),entityRef,personalGarageRef:user.collection('gameplay').doc('vehicleUpgrades'),uid,nowMs,timestampFromMs,input:{...input,actorPose:actor.pose}});
   return urban.updateUrbanVehicleLease({runTransaction:fn=>db.runTransaction(fn),entityRef,uid,nowMs,timestampFromMs,input,release:kind==='release'});
  },assertDraft:async()=>{
   const row=(await db.collection('racingCourses').get()).docs[0],v=row.data();assert.equal(v.status,'draft');assert.equal(await publication.loadPublishedCourse(db,row.id,users[1].uid),null);
   await assert.rejects(publication.writeRacingRoute({db,admin,uid:users[0].uid,input:{action:'submit',id:row.id,revision:v.revision}}),/test_route_first/);
   await assert.rejects(publication.writeRacingRoute({db,admin,uid:users[1].uid,input:{action:'withdraw',id:row.id,revision:v.revision}}),/owner_required/);
   return {id:row.id,revision:v.revision};
  }});
 const rows=(await db.collection('racingCourses').get()).docs;assert.equal(rows.length,1);const row=rows[0],saved=row.data();assert.equal(saved.status,'approved');assert.ok(saved.qualification.resultId);
 const accepted=(await db.collection('racingResults').doc(saved.qualification.resultId).get()).data();assert.equal(accepted.receipt.purpose,'qualification');assert.equal(accepted.receipt.players[0].credits,0);
 assert.equal((await db.collection('racingBoards').get()).size,0);assert.equal((await db.collection('users').doc(users[0].uid).collection('racing').doc('career').get()).exists,false);
 assert.equal((await db.collection('adminActivity').where('targetId','==',row.id).get()).size,1);
 await assert.rejects(publication.moderateRacingRoute({db,admin,moderatorUid:users[1].uid,input:{id:row.id,revision:'obsolete',decision:'rejected',note:'Changed'}}),/route_changed/);
 await publication.moderateRacingRoute({db,admin,moderatorUid:users[1].uid,input:{id:row.id,revision:saved.revision,decision:'rejected',note:'Controlled removal check'}});
 assert.equal(await publication.loadPublishedCourse(db,row.id,users[1].uid),null);
 console.log(JSON.stringify({ok:true,scope:'Actual Auth/Firestore/WebSocket and product browser controls; controlled road, HTTP moderator role and App Check seam. Not live-service or real-city acceptance.',...result,privateTestNoAwardsOrPublicTimes:true,staleReviewRejected:true,withdrawnCourseUnavailable:true,clientAuthorityWritesRejected:true}));
}finally{
 if(service)await service.close();await db.recursiveDelete(roomRef);
 for(const u of users){await db.recursiveDelete(db.collection('users').doc(u.uid));await auth.deleteUser(u.uid);}
 for(const name of ['racingResults','racingBoards','racingDistricts','racingLocations','racingCourses','adminActivity'])for(const s of (await db.collection(name).get()).docs)await db.recursiveDelete(s.ref);
 await sdk.deleteApp(app);
}
