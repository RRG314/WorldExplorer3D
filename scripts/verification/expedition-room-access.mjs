import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const projectId='we3d-staging-20260712';
assert.match(process.env.FIRESTORE_EMULATOR_HOST||'',/^(127\.0\.0\.1|localhost):\d+$/);
assert.match(process.env.FIREBASE_AUTH_EMULATOR_HOST||'',/^(127\.0\.0\.1|localhost):\d+$/);
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
const {initializeApp}=require('firebase-admin/app'),{getFirestore,Timestamp}=require('firebase-admin/firestore');
initializeApp({projectId});const db=getFirestore();const roomCode=`E${Date.now().toString(36).slice(-5)}`.toUpperCase(),room=db.collection('rooms').doc(roomCode);
const users=[];
for(const label of ['captain','engineer']){
 const response=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-key`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:`${label}-${Date.now()}@example.test`,password:'Local-emulator-test-only-934!',returnSecureToken:true})});assert.equal(response.ok,true);const v=await response.json();users.push({uid:v.localId,token:v.idToken});
}
const [captain,engineer]=users,configuration={destinationId:'proxima-centauri',shipId:'long-range-research-vessel',propulsionId:'radiant-plasma-field-drive',realism:'science-inspired',survival:'forgiving'};
const cases=[];
async function seat(user,expired=false){const now=Date.now();await room.collection('players').doc(user.uid).set({uid:user.uid,displayName:'Emulator crew',lastSeenAt:Timestamp.fromMillis(now),expiresAt:Timestamp.fromMillis(expired?now-1:now+90000)});}
async function post(user,body){const r=await fetch(`http://127.0.0.1:5001/${projectId}/us-central1/mutateSharedExpedition`,{method:'POST',headers:{'content-type':'application/json',...(user?{authorization:`Bearer ${user.token}`}:{})},body:JSON.stringify({roomCode,...body})});return {status:r.status,body:await r.json()};}
await room.set({ownerUid:captain.uid,world:{kind:'space',lat:0,lon:0},maxPlayers:6});
try {
 assert.equal((await post(null,{action:'create',configuration})).status,401);cases.push('unsigned request denied');
 await seat(captain,true);assert.equal((await post(captain,{action:'create',configuration})).status,409);assert.equal((await room.collection('expeditions').doc('active').get()).exists,false);cases.push('expired owner cannot create or write');
 await seat(captain);const created=await post(captain,{action:'create',configuration});assert.equal(created.status,200,created.body.error);cases.push('renewed captain creates server plan');
 await seat(engineer);const joined=await post(engineer,{action:'join',role:'engineering'});assert.equal(joined.status,200,joined.body.error);cases.push('second authenticated crew joins');
 const started=await post(captain,{action:'commit',expectedRevision:created.body.state.revision,command:{type:'start'}});assert.equal(started.status,200,started.body.error);assert.equal(started.body.state.expedition.state,'traveling');
 assert.equal((await post(captain,{action:'ready'})).status,200);assert.equal((await post(engineer,{action:'ready'})).status,200);
 await seat(engineer,true);const rejected=await post(captain,{action:'commit',expectedRevision:started.body.state.revision,command:{type:'advance'}});assert.equal(rejected.status,409);assert.match(rejected.body.error,/two connected crew/);cases.push('expired crew excluded from advance quorum');
 await seat(engineer);const advanced=await post(captain,{action:'commit',expectedRevision:started.body.state.revision,command:{type:'advance'}});assert.equal(advanced.status,200,advanced.body.error);assert.equal(advanced.body.state.revision,started.body.state.revision+1);cases.push('renewed ready crew advances server plan');
 await room.collection('players').doc(engineer.uid).delete();assert.equal((await post(engineer,{action:'ready'})).status,403);cases.push('removed member denied');
 await seat(engineer);assert.equal((await post(engineer,{action:'ready'})).status,200);cases.push('normal readmission restores access');
 await room.delete();assert.equal((await post(captain,{action:'ready'})).status,404);cases.push('deleted room cannot mutate retained expedition');
 await mkdir('output/verification/product-plan/expedition-room-access',{recursive:true});await writeFile('output/verification/product-plan/expedition-room-access/report.json',JSON.stringify({environment:'local Auth/Firestore/Functions emulators',cases,passed:true,scope:'Existing interstellar room authority; marine roles, vessel sharing and underwater rendering are not implemented by this check'},null,2));console.log(JSON.stringify({passed:true,cases:cases.length}));
}finally{await db.recursiveDelete(room);}
