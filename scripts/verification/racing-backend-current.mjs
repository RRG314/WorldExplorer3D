import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {collectRaceDistrict,recommendRaceCourses} from '../../app/js/racing/world-course-source.js';
import {createRaceServer} from '../../services/racing/transport.mjs';
import {createFirestoreRaceStore} from '../../services/racing/firestore-store.mjs';
import {buildRaceRoadGraph,createRaceCourse,raceCourseKey,raceGridPose,normalizeVehicleGarage,personalVehicleById} from '../../services/racing/generated/engine.mjs';
const require=createRequire(new URL('../../services/racing/package.json',import.meta.url));
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getAuth}=require('firebase-admin/auth'),{getFirestore,Timestamp}=require('firebase-admin/firestore'),WebSocket=require('ws');
const urban=createRequire(import.meta.url)('../../functions/urban-sandbox.js');
const economy=createRequire(import.meta.url)('../../functions/economy-authority.js');
const projectId=process.env.GCLOUD_PROJECT;
if(!/^demo-/.test(projectId||'')||!/^127\.0\.0\.1:\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST||'')||!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Isolated demo Auth/Firestore emulators are required.');
const app=initializeApp({projectId}),db=getFirestore(app),auth=getAuth(app),stamp=Date.now(),users=[],sockets=[];
const segments=[{fromId:0,toId:1,segIndex:0,sourceTStart:0,sourceTEnd:1,p1:{x:0,z:0},p2:{x:0,z:250},feature:{id:'verification-road',name:'Controlled road',width:8,metersPerWorldUnit:1,driveable:true,structureSemantics:{structureKind:'none'}},direction:'both'}];
const facts=await collectRaceDistrict({worldPublication:{requestId:'verification',sequence:1,location:{lat:43,lon:7}},worldLoadRuntimeState:{sequence:1,location:{name:'Controlled road'}},METERS_PER_WORLD_UNIT:1,LOC:{lat:43,lon:7},buildings:[],buildTraversalNetworks:()=>({drive:{segments}}),sampleFeatureSurfaceY:()=>0,SurfaceQuery:{driveAt:()=>({kind:'road',position:{y:0}})},transportDetail:{hasReadyCoverageAt:()=>true}}, {yieldWork:()=>Promise.resolve()});
const course=recommendRaceCourses(facts).events.find(e=>e.discipline==='sprint');assert.ok(course);
const courseId=await raceCourseKey(course),roomCode='RACET1',worldSeed='verification-race-'+stamp,roomRef=db.collection('rooms').doc(roomCode),model=personalVehicleById('bmw_e34');
const store=createFirestoreRaceStore({db,loadCourse:async id=>id===courseId?course:null}),attempts=[];let captured=null,commits=0,service;
const wrapped={...store,settle:async input=>{captured=input;const receipt=await store.settle(input);commits++;return receipt;}};
const timestampFromMs=ms=>Timestamp.fromMillis(Math.floor(ms));
async function account(index){const response=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-only`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`race-${stamp}-${index}@example.test`,password:'Isolated-race-only-47!',returnSecureToken:true})});const data=await response.json();assert.equal(response.status,200);const u={uid:data.localId,token:data.idToken};users.push(u);return u;}
async function seed(u,index){
 const user=db.collection('users').doc(u.uid),pose=raceGridPose(course,index),now=Date.now();
 await user.collection('consents').doc('community').set({version:'community-2026-10-24'});
 await user.collection('gameplay').doc('vehicleUpgrades').set({garage:normalizeVehicleGarage(),vehicles:{}});
 await user.collection('economy').doc('wallet').set({credits:1000000,currencyVersion:2,revision:0});
 await roomRef.collection('players').doc(u.uid).set({uid:u.uid,displayName:`Driver ${index+1}`,pose,lastSeenAt:timestampFromMs(now),expiresAt:timestampFromMs(now+90000)});
 const entityId=`personal:${u.uid}:bmw_e34`,key=urban.urbanEntityDocumentId(entityId),ref=roomRef.collection('urbanEntities').doc(key);
 const result=await urban.claimUrbanVehicleLease({runTransaction:fn=>db.runTransaction(fn),entityRef:ref,personalGarageRef:user.collection('gameplay').doc('vehicleUpgrades'),uid:u.uid,nowMs:now,timestampFromMs,
  input:{entityId,worldSeed,actorPose:pose,pose,label:model.label,style:model.category}});assert.equal(result.accepted,true,JSON.stringify({reason:result.reason}));return ref;
}
function waitMessage(ws,predicate,timeout=10000){const matching=ws.messages.find(predicate);if(matching)return Promise.resolve(matching);
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{ws.off('message',read);reject(Error('race_message_timeout'));},timeout);function read(raw){const message=JSON.parse(raw);if(predicate(message)){clearTimeout(timer);ws.off('message',read);resolve(message);}}ws.on('message',read);});}
async function connect(u,sessionId){const ws=new WebSocket(`ws://127.0.0.1:${service.server.address().port}/race`,{origin:'http://127.0.0.1:4198'});sockets.push(ws);ws.messages=[];ws.on('message',raw=>ws.messages.push(JSON.parse(raw)));ws.on('error',()=>{});await new Promise(resolve=>ws.once('open',resolve));
 ws.send(JSON.stringify({type:'authenticate',idToken:u.token,appCheckToken:'controlled-local-attestation'}));await waitMessage(ws,m=>m.type==='authenticated');
 ws.send(JSON.stringify({type:'join',roomCode,worldSeed,courseId,vehicleId:'bmw_e34',...(sessionId?{sessionId}:{})}));await waitMessage(ws,m=>m.type==='joined');return ws;
}
try{
 await roomRef.set({ownerUid:'controlled',world:{kind:'earth',lat:43,lon:7,seed:worldSeed}});
 const a=await account(0),b=await account(1),refs=[await seed(a,0),await seed(b,1)];
 const forbidden=await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/racingResults/fabricated-result`,{method:'PATCH',headers:{Authorization:`Bearer ${a.token}`,'Content-Type':'application/json'},body:JSON.stringify({fields:{timeMs:{integerValue:'1'}}})});
 assert.equal(forbidden.status,403,'Client writes must not mint racing results.');
 // Real Auth token/revocation verification. App Check alone is a controlled
 // seam here: the production entry point always calls Admin verifyToken.
 service=createRaceServer({store:wrapped,origins:['http://127.0.0.1:4198','http://127.0.0.1:4298'],authenticate:async input=>{
  assert.equal(input.appCheckToken,'controlled-local-attestation');const identity=await auth.verifyIdToken(input.idToken,true);return {uid:identity.uid,expiresAtMs:identity.exp*1000};
 }});await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));
 if(process.env.WE3D_RACING_RECORDS_ONLY==='1'){
  const sharedApi=createRequire(import.meta.url)('../../functions/racing-api.js'),projections=db.collection('users').doc(a.uid).collection('racing').doc('career').collection('boards');
  for(let i=0;i<36;i++){const id=i.toString(16).padStart(64,'0');await projections.doc(id).set({id:'payload-id-must-not-replace-document-key',boardId:id,timeMs:1000,courseId,courseName:course.name});}
  let cursor,seen=[];do{const page=await sharedApi.readRacingRecords({db,uid:a.uid,cursor});assert.ok(page.entries.length<=32);seen.push(...page.entries.map(e=>e.id));cursor=page.nextCursor;}while(cursor);
  assert.equal(new Set(seen).size,36);await db.recursiveDelete(projections);attempts.push({pagedRecords:true,documentKeyOwnsIdentity:true,scope:'Controlled read-index fixtures, not additional race completions.'});
 }
 else if(process.env.WE3D_RACING_BROWSER_ONLY!=='1'){
 const socketsA=await connect(a),socketsB=await connect(b);await waitMessage(socketsA,m=>m.snapshot?.players.length===2);
 const reserved=(await refs[0].get()).data();assert.ok(reserved.raceCustody.id);
 const blocked=await urban.updateUrbanVehicleLease({runTransaction:fn=>db.runTransaction(fn),entityRef:refs[0],uid:a.uid,input:{pose:{x:0,y:0,z:240}},nowMs:Date.now(),timestampFromMs});assert.equal(blocked.reason,'vehicle_in_race');
 await assert.rejects(economy.settleVehicleGarageAction({runTransaction:fn=>db.runTransaction(fn),walletRef:db.collection('users').doc(a.uid).collection('economy').doc('wallet'),progressRef:db.collection('users').doc(a.uid).collection('gameplay').doc('vehicleUpgrades'),receiptRef:db.collection('users').doc(a.uid).collection('vehicleReceipts').doc('race-selection-proof'),uid:a.uid,input:{action:'select',vehicleId:'bmw_e34',requestId:'race-selection-proof',expectedRevision:0},nowMs:Date.now(),timestampFromMs}),/vehicle_in_race/);
 for(const ws of [socketsA,socketsB])ws.send(JSON.stringify({type:'ready',ready:true}));await waitMessage(socketsA,m=>m.snapshot?.players.every(p=>p.ready));socketsA.send(JSON.stringify({type:'start'}));
 const begun=(await waitMessage(socketsA,m=>m.snapshot?.phase==='countdown')).snapshot,startAt=begun.startAtMs;
 // A forged finish is rejected by the actual message gateway.
 socketsA.send(JSON.stringify({type:'finish',elapsedMs:1}));await waitMessage(socketsA,m=>m.type==='error'&&m.reason==='invalid_race_message');
 let sequence=0,reconnected=false,other=socketsB;
 const drive=setInterval(()=>{for(const [ws,throttle]of[[socketsA,1],[other,.8]]){const state=[...ws.messages].reverse().find(m=>m.snapshot)?.snapshot,p=state?.players.find(p=>p.uid===(ws===socketsA?a.uid:b.uid));
  if(ws.readyState===1&&['countdown','running'].includes(state?.phase)&&!p?.progress?.finished)ws.send(JSON.stringify({type:'control',sequence:sequence++,actions:{throttle}}));}},50);
 try{
  await new Promise(resolve=>setTimeout(resolve,4700));socketsB.close();other=await connect(b,begun.id);reconnected=true;
  assert.equal(other.messages.find(m=>m.type==='joined').snapshot.startAtMs,startAt);
  const finish=await waitMessage(socketsA,m=>m.snapshot?.settlement==='saved',30000),state=finish.snapshot;assert.equal(state.phase,'complete');assert.ok(state.players.every(p=>p.progress.finished));assert.equal(commits,1);
  const receipt=await store.settle(captured);assert.equal(receipt.id,state.id);
  const wallets=await Promise.all(users.map(u=>db.collection('users').doc(u.uid).collection('economy').doc('wallet').get()));assert.deepEqual(wallets.map(s=>s.data().credits),[1000250,1000150]);
  assert.equal((await db.collection('racingResults').doc(state.id).get()).exists,true);
  const sharedApi=createRequire(import.meta.url)('../../functions/racing-api.js');
  const rows=(await sharedApi.readRacingRecords({db,uid:a.uid,boardId:receipt.players[0].boardId})).entries;assert.equal(rows.length,2);assert.ok(rows.every(r=>r.verified&&r.timeMs>1000));
  const index=await sharedApi.readRacingRecords({db,uid:a.uid});assert.equal(index.entries.length,1);
  const projections=db.collection('users').doc(a.uid).collection('racing').doc('career').collection('boards'),extra=[];
  // Read-pagination fixtures only; these do not claim additional raced events.
  for(let i=0;i<35;i++){const id=i.toString(16).padStart(64,'0'),ref=projections.doc(id);await ref.set({...index.entries[0],boardId:id});extra.push(ref);}
  let cursor,seen=[];do{const page=await sharedApi.readRacingRecords({db,uid:a.uid,cursor});assert.ok(page.entries.length<=32);seen.push(...page.entries.map(e=>e.id));cursor=page.nextCursor;}while(cursor);
  assert.equal(new Set(seen).size,36);for(const ref of extra)await ref.delete();
  await db.collection('users').doc(a.uid).collection('blockedPlayers').doc(b.uid).set({blocked:true});assert.equal((await sharedApi.readRacingRecords({db,uid:a.uid,boardId:receipt.players[0].boardId})).entries.length,1);
  await db.collection('users').doc(a.uid).collection('blockedPlayers').doc(b.uid).delete();
  await new Promise(resolve=>setTimeout(resolve,200));assert.equal((await refs[0].get()).data().raceCustody,null);
  const recovered=await connect(a,state.id);assert.equal(recovered.messages.find(m=>m.type==='joined').snapshot.receipt.id,state.id);
  const stale={...captured,instanceId:'obsolete-authority'};await db.collection('racingResults').doc(state.id).delete();await assert.rejects(store.settle(stale),/lease_expired/);
  attempts.push({twoAuthenticatedDrivers:true,serverTimedFinish:true,reconnected,sameCountdown:true,durableReceipt:true,replaySafeWallet:true,symmetricBlocking:true,recoveredResult:true,obsoleteAuthorityRejected:true});
 }finally{clearInterval(drive);}
 }
 if(process.env.WE3D_RACING_BROWSER_PROOF){
  await new Promise(resolve=>setTimeout(resolve,200));for(let i=0;i<users.length;i++){
   // A new controlled browser scenario starts from its own explicit fixture.
   // Do not defeat the product's proximity guard to reset a finished car.
   await roomRef.collection('urbanEntities').doc(urban.urbanEntityDocumentId(`personal:${users[i].uid}:bmw_e34`)).delete();await seed(users[i],i);
  }
  const {run}=await import(pathToFileURL(process.env.WE3D_RACING_BROWSER_PROOF).href);
  attempts.push(await run({endpoint:`ws://127.0.0.1:${service.server.address().port}/race`,users,course,segments,room:{code:roomCode,world:{kind:'earth',lat:43,lon:7,seed:worldSeed}},
   vehicleCommand:async(token,kind,input)=>{
    const identity=await auth.verifyIdToken(token,true),uid=identity.uid,user=db.collection('users').doc(uid),nowMs=Date.now();
    if(kind==='garage')return economy.settleVehicleGarageAction({runTransaction:fn=>db.runTransaction(fn),walletRef:user.collection('economy').doc('wallet'),progressRef:user.collection('gameplay').doc('vehicleUpgrades'),receiptRef:user.collection('vehicleReceipts').doc(input.requestId),uid,input,nowMs,timestampFromMs});
    assert.equal(input.roomCode,roomCode);assert.equal(input.worldSeed,worldSeed);
    const entityRef=roomRef.collection('urbanEntities').doc(urban.urbanEntityDocumentId(input.entityId));
    const actor=(await roomRef.collection('players').doc(uid).get()).data();
    if(kind==='claim')return urban.claimUrbanVehicleLease({runTransaction:fn=>db.runTransaction(fn),entityRef,personalGarageRef:user.collection('gameplay').doc('vehicleUpgrades'),uid,nowMs,timestampFromMs,input:{...input,actorPose:actor.pose}});
    return urban.updateUrbanVehicleLease({runTransaction:fn=>db.runTransaction(fn),entityRef,uid,nowMs,timestampFromMs,input,release:kind==='release'});
   },
   records:async(token,input)=>{const identity=await auth.verifyIdToken(token,true);return createRequire(import.meta.url)('../../functions/racing-api.js').readRacingRecords({db,uid:identity.uid,boardId:input?.boardId,cursor:input?.cursor});}}));
 }
 console.log(JSON.stringify({ok:true,scope:'Real Auth/Firestore emulators and real WebSocket transport; controlled course and App Check seam, not live-service or city gameplay acceptance.',attempts}));
}finally{
 for(const ws of sockets)ws.close();if(service)await service.close();
 await db.recursiveDelete(roomRef);for(const u of users){await db.recursiveDelete(db.collection('users').doc(u.uid));await auth.deleteUser(u.uid);}
 // This demo project belongs exclusively to this invocation.
 for(const name of ['racingResults','racingBoards'])for(const doc of (await db.collection(name).get()).docs)await db.recursiveDelete(doc.ref);
 await deleteApp(app);
}
