import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';
import {acceptanceInputs,evidenceReference,reusableAcceptance} from './acceptance-inputs.mjs';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
import {collectRaceDistrict,recommendRaceCourses} from '../../app/js/racing/world-course-source.js';
import {canonicalRaceDistrict,readPublishedRaceCourse,raceLocationKey} from '../../app/js/racing/publication-rules.js';
import {raceDistrictFingerprint,raceCourseReference,raceCourseKey} from '../../app/js/racing/course-library.js';
import {createRaceVehicleProfile} from '../../app/js/racing/vehicle-controller.js';import {raceCompetitiveRecordConfiguration} from '../../app/js/racing/record-rules.js';
import {createRaceServer} from '../../services/racing/transport.mjs';import {createFirestoreRaceStore} from '../../services/racing/firestore-store.mjs';import {digest} from '../../services/racing/authority.mjs';import {raceGridPose} from '../../app/js/racing/course-rules.js';
const require=createRequire(new URL('../../services/racing/package.json',import.meta.url)),{initializeApp,deleteApp}=require('firebase-admin/app'),{getAuth}=require('firebase-admin/auth'),{getFirestore,Timestamp}=require('firebase-admin/firestore'),cjs=createRequire(import.meta.url);
const career=cjs('../../functions/racing-career.js'),cleanup=cjs('../../functions/racing-account-cleanup.js'),records=cjs('../../functions/racing-api.js'),urban=cjs('../../functions/urban-sandbox.js'),economy=cjs('../../functions/economy-authority.js');
const projectId=process.env.GCLOUD_PROJECT;
const statePath=path.resolve(process.env.WE3D_RACING_CAREER_STATE_FILE||'');
if(!process.env.WE3D_RACING_CAREER_STATE_FILE||statePath.startsWith(process.cwd()+path.sep))throw Error('Keep the owned fixture state outside the repository.');
const identity=await acceptanceInputs(process.cwd(),{id:'racing-career-authority',entries:['services/racing/server.mjs','functions/racing-career.js','functions/racing-account-cleanup.js'],files:['services/racing/package-lock.json','functions/package-lock.json']});
let state=await fs.readFile(statePath,'utf8').then(JSON.parse,()=>({version:1,projectId,phase:0}));
if(state.version!==1||state.projectId!==projectId)throw Error('Wrong fixture owner/project.');
const fileStat=await fs.lstat(statePath).catch(()=>null);if(fileStat&&(!fileStat.isFile()||(fileStat.mode&0o077)!==0))throw Error('Fixture state must be a private regular file.');
if(state.receipt&&!await reusableAcceptance(process.cwd(),state.receipt,identity))throw Error('The saved authority inputs or evidence changed. Retain this case and start a separate affected-domain fixture.');
let completed=false;
const saveState=async()=>fs.writeFile(statePath,JSON.stringify(state,null,2),{mode:0o600});

if(!/^demo-/.test(projectId||'')||!/^127\.0\.0\.1:\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST||'')||!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Isolated demo Auth/Firestore required.');
const app=initializeApp({projectId}),db=getFirestore(app),auth=getAuth(app),users=[],rooms=[],roomWorlds=new Map(),stamp=Date.now(),timestampFromMs=ms=>Timestamp.fromMillis(Math.floor(ms));let service,currentRoom;
const checkpoint=async(phase,details={})=>{state={...state,...details,phase,authorityFingerprint:identity.fingerprint};await saveState();console.log(JSON.stringify({acceptedPhase:phase}));};
const segments=[{fromId:0,toId:1,segIndex:0,p1:{x:0,z:0},p2:{x:0,z:250},feature:{id:'verification-road',name:'Controlled road',width:8,metersPerWorldUnit:1,driveable:true,structureSemantics:{structureKind:'none'}},direction:'both'}];
const facts=canonicalRaceDistrict(await collectRaceDistrict({worldPublication:{requestId:'career',sequence:1,location:{lat:43,lon:7}},worldLoadRuntimeState:{sequence:1,location:{name:'Controlled road'}},METERS_PER_WORLD_UNIT:1,LOC:{lat:43,lon:7},buildings:[],buildTraversalNetworks:()=>({drive:{segments}}),sampleFeatureSurfaceY:()=>0,SurfaceQuery:{driveAt:()=>({kind:'road',position:{y:0}})},transportDetail:{hasReadyCoverageAt:()=>true}},{yieldWork:()=>Promise.resolve()})),districtId=(await raceDistrictFingerprint(facts)).slice(14),courses=recommendRaceCourses(facts).events,profile=createRaceVehicleProfile('bmw_e34'),classRows=[];
const store=createFirestoreRaceStore({db,loadCourse:(id,uid)=>readPublishedRaceCourse({id,uid,read:async path=>{const s=await db.doc(path).get();return s.exists?s.data():null;}})});
async function account(i){const r=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`career-${stamp}-${i}@example.test`,password:'Controlled-career-47!',returnSecureToken:true})}),v=await r.json();assert.equal(r.status,200);const u={uid:v.localId,token:v.idToken};users.push(u);return u;}
async function scenario(code,course){
 if(roomWorlds.has(code)){currentRoom={code,world:roomWorlds.get(code)};return currentRoom;}
 currentRoom={code,world:{kind:'earth',lat:43,lon:7,seed:'controlled-career-'+stamp+'-'+code}};const ref=db.collection('rooms').doc(code);rooms.push(ref);roomWorlds.set(code,currentRoom.world);await ref.set({ownerUid:users[0].uid,world:currentRoom.world});
 for(const u of users){const pose=raceGridPose(course,0);await ref.collection('players').doc(u.uid).set({uid:u.uid,displayName:u===users[0]?'Driver One':'Driver Two',pose,lastSeenAt:Timestamp.now(),expiresAt:timestampFromMs(Date.now()+180000)});}
 state.rooms=[...roomWorlds].map(([code,world])=>({code,world}));await saveState();return currentRoom;
}
try{
 const fresh=!state.users;
 if(fresh)for(let i=0;i<2;i++){const u=await account(i);await db.collection('users').doc(u.uid).collection('economy').doc('wallet').set({credits:1000000,currencyVersion:2,revision:0});await db.collection('users').doc(u.uid).collection('consents').doc('community').set({version:'community-2026-10-24'});}
 if(!fresh){for(const uid of state.users){const original=await auth.getUser(uid);assert.match(original.email,/^career-.*@example\.test$/);const r=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:original.email,password:'Controlled-career-47!',returnSecureToken:true})}),v=await r.json();assert.equal(r.status,200);users.push({uid,token:v.idToken});}
  for(const item of state.rooms||[]){roomWorlds.set(item.code,item.world);rooms.push(db.collection('rooms').doc(item.code));for(const u of users)await db.collection('rooms').doc(item.code).collection('players').doc(u.uid).set({lastSeenAt:Timestamp.now(),expiresAt:timestampFromMs(Date.now()+180000)},{merge:true});}
 }
 if(fresh)for(const [i,u]of users.entries())await db.collection('users').doc(u.uid).collection('friends').doc(users[1-i].uid).set({uid:users[1-i].uid,displayName:i?'Driver One':'Driver Two'});
 if(fresh)await db.collection('racingDistricts').doc(districtId).set({status:'approved',facts,credits:[{role:'roads',label:'Controlled fixture',license:'Verification only',url:'https://www.openstreetmap.org/copyright'}]});if(fresh)await db.collection('racingLocations').doc(await raceLocationKey(facts.locationId)).set({districtId});
 for(const course of courses){const id=await raceCourseKey(course),reference=raceCourseReference(course,await raceDistrictFingerprint(facts)),configuration=raceCompetitiveRecordConfiguration(profile,{slot:0,participants:course.participants}),boardId=digest({courseId:id,...configuration});
  if(fresh)await db.collection('racingCourses').doc(id).set({ownerUid:users[0].uid,status:'approved',districtId,reference,revision:digest(reference)});const board={courseId:id,courseName:course.name,configuration};if(fresh)await db.collection('racingBoards').doc(boardId).set(board);
  if(fresh)for(const u of users)await db.collection('users').doc(u.uid).collection('racing').doc('career').collection('boards').doc(boardId).set({...board,boardId,timeMs:99999,uid:u.uid});
  classRows.push({id:boardId,...board,course});
 }
 state.users=users.map(u=>u.uid);await saveState();
 const course=classRows.find(r=>r.course.discipline==='sprint').course;await scenario('CARE01',course);
 service=createRaceServer({store:{...store,settle:async input=>{const receipt=await store.settle(input);await career.projectRacingCareerResult({db,id:receipt.id});return receipt;}},origins:['http://127.0.0.1:4298'],authenticate:async input=>{assert.equal(input.appCheckToken,'controlled-local-attestation');const u=await auth.verifyIdToken(input.idToken,true);return {uid:u.uid,expiresAtMs:u.exp*1000};}});await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));
 const api=async(token,kind,input)=>{const {uid}=await auth.verifyIdToken(token,true);
  if(kind==='career')return input.view==='history'?career.readRacingCareerHistory({db,uid,kind:input.kind,cursor:input.cursor}):career.readRacingCareer({db,uid,roomCode:input.roomCode});
  if(kind==='career-command')return career.commitRacingCareer({db,uid,input,label:uid===users[0].uid?'Driver One':'Driver Two'});
  if(kind==='records')return records.readRacingRecords({db,uid,boardId:input.boardId,cursor:input.cursor});
  if(kind==='catalog')return cjs('../../functions/racing-publication.js').readRacingCatalog({db,uid,locationId:input.locationId,cursor:input.cursor});
  throw Error('Unexpected API');};
 const vehicleCommand=async(token,kind,input)=>{const {uid}=await auth.verifyIdToken(token,true),user=db.collection('users').doc(uid),nowMs=Date.now();
  if(kind==='garage')return economy.settleVehicleGarageAction({runTransaction:fn=>db.runTransaction(fn),walletRef:user.collection('economy').doc('wallet'),progressRef:user.collection('gameplay').doc('vehicleUpgrades'),receiptRef:user.collection('vehicleReceipts').doc(input.requestId),uid,input,nowMs,timestampFromMs});
  assert.ok(roomWorlds.has(input.roomCode));assert.equal(input.worldSeed,roomWorlds.get(input.roomCode).seed);const room=db.collection('rooms').doc(input.roomCode),entityRef=room.collection('urbanEntities').doc(urban.urbanEntityDocumentId(input.entityId)),actor=(await room.collection('players').doc(uid).get()).data();
  if(kind==='claim')return urban.claimUrbanVehicleLease({runTransaction:fn=>db.runTransaction(fn),entityRef,personalGarageRef:user.collection('gameplay').doc('vehicleUpgrades'),uid,nowMs,timestampFromMs,input:{...input,actorPose:actor.pose}});
  return urban.updateUrbanVehicleLease({runTransaction:fn=>db.runTransaction(fn),entityRef,uid,nowMs,timestampFromMs,input,release:kind==='release'});
 };
 if(!process.env.WE3D_RACING_CAREER_BROWSER)throw Error('Supply the browser journey.');const {run}=await import(pathToFileURL(process.env.WE3D_RACING_CAREER_BROWSER).href);
 if(fresh&&process.env.WE3D_RACING_CAREER_START==='after-crew'){
  await career.commitRacingCareer({db,uid:users[0].uid,label:'Driver One',input:{action:'create-crew',requestId:crypto.randomUUID(),name:'Coast Crew'}});
  const invite=await career.commitRacingCareer({db,uid:users[0].uid,input:{action:'invite-crew',targetUid:users[1].uid,roomCode:currentRoom.code}});
  await career.commitRacingCareer({db,uid:users[1].uid,label:'Driver Two',input:{action:'respond-invite',id:invite.id,accept:true}});
  await checkpoint(1,{reusedCrewUi:'V1 create/invite/accept passed before the label/layout failure; reconstructed through the same verified authority for follow-on checks.'});
 }
 const result=state.phase<8?await run({state,checkpoint,storagePaths:[0,1].map(i=>path.join(path.dirname(statePath),'browser-'+i+'.json')),endpoint:`ws://127.0.0.1:${service.server.address().port}/race`,users,course,segments,room:currentRoom,classes:classRows,api,vehicleCommand,fixturePose:async(index,code)=>{const row=await db.collection('rooms').doc(code).collection('urbanEntities').doc(urban.urbanEntityDocumentId(`personal:${users[index].uid}:bmw_e34`)).get();const p=row.exists?row.data().pose:null;return p?{x:p.x,y:1.12,z:p.z,angle:p.yaw}:null;},nextScenario:()=>scenario('CARE02',classRows.find(r=>r.course.discipline==='time-trial').course)}):state.browserResult;
 const all=(await db.collection('racingResults').get()).docs;
 if(state.phase<8){assert.equal(all.length,3);for(const doc of all){await career.projectRacingCareerResult({db,id:doc.id});await career.projectRacingCareerResult({db,id:doc.id});}
 const stats=await Promise.all(users.map(u=>db.collection('users').doc(u.uid).collection('racing').doc('career').get()));for(const row of stats){assert.equal(row.data().finishes,2);assert.equal(row.data().rivalFinishes,1);assert.equal(row.data().seriesFinishes,1);}
 const wallets=await Promise.all(users.map(u=>db.collection('users').doc(u.uid).collection('economy').doc('wallet').get()));
 assert.equal(wallets.reduce((sum,s)=>sum+(s.data()?.credits||0),0),2000000+all.find(r=>r.data().receipt.purpose==='competition').data().receipt.players.reduce((sum,p)=>sum+p.credits,0));
 await checkpoint(8,{browserResult:result});
 }
 if(state.phase<9){
 await db.collection('captureAccountDeletions').doc(users[0].uid).set({status:'deleting'});await cleanup.cleanupRacingAccount({db,uid:users[0].uid});await career.projectRacingCareerResult({db,id:all[0].id});
 assert.equal((await db.collection('users').doc(users[0].uid).collection('racing').doc('career').get()).exists,false);for(const row of (await db.collection('racingResults').get()).docs)assert.ok(!row.data().participantUids.includes(users[0].uid));
 await checkpoint(9);
 }
 completed=true;console.log(JSON.stringify({ok:true,scope:'Controlled classes and roads; actual Auth/Firestore/socket races and career UI. App Check and event delivery are controlled seams. Seeded class choices are read fixtures, not earned race evidence.',...result,acceptedRaces:3,idempotentCareer:true,noExtraCareerCredits:true,accountCleanupNoResurrection:true}));
}finally{
 if(service)await service.close();
 if(completed){for(const ref of rooms)await db.recursiveDelete(ref);for(const u of users){await db.recursiveDelete(db.collection('users').doc(u.uid));await auth.deleteUser(u.uid);}
 for(const name of ['racingResults','racingBoards','racingCourses','racingDistricts','racingLocations','racingCrews','racingRivals','racingSeries','captureAccountDeletions'])for(const row of (await db.collection(name).get()).docs)await db.recursiveDelete(row.ref);state.status='complete';await saveState();}
 else{state.status='awaiting-focused-repair';if(state.reportPath){state.receipt={status:'passed',scope:'Accepted phases through '+state.phase+' only',fingerprint:identity.fingerprint,evidence:[await evidenceReference(process.cwd(),state.reportPath)]};}await saveState();console.log(JSON.stringify({retainedFixture:true,acceptedPhase:state.phase}));}
 await deleteApp(app);
}
