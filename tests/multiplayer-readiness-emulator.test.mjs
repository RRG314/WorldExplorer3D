import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,getDoc,updateDoc,deleteDoc,writeBatch,Timestamp as ClientTimestamp} from 'firebase/firestore';
import {weeklyRoomDescriptor} from '../app/js/multiplayer/featured-city-model.js';
const require=createRequire(new URL('../functions/package.json',import.meta.url));const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore,Timestamp}=require('firebase-admin/firestore');
const project=process.env.GCLOUD_PROJECT;assert.match(project||'',/^demo-we3d-multiplayer/);for(const key of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST'])assert.match(process.env[key]||'',/^127\.0\.0\.1:\d+$/);
const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':'),origin=process.env.WE3D_TEST_FUNCTIONS_ORIGIN;assert.match(origin||'',/^http:\/\/127\.0\.0\.1:5107\/demo-we3d-multiplayer/);
const app=initializeApp({projectId:project},'multiplayer-readiness'),db=getFirestore(app);let rules,one,two;
const call=(body,token)=>fetch(origin+'/joinRoom',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
async function guest(){const r=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-only`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({returnSecureToken:true})});assert.equal(r.status,200);const user=await r.json();await db.doc('users/'+user.localId+'/consents/community').set({version:'community-2026-10-24',acceptedAt:Timestamp.now()});return user;}
test.before(async()=>{rules=await initializeTestEnvironment({projectId:project,firestore:{host,port:Number(port),rules:await readFile('firestore.rules','utf8')}});await rules.clearFirestore();one=await guest();two=await guest();});
test.after(async()=>{await rules?.cleanup();await db.terminate();await deleteApp(app);});
const world={kind:'earth',lat:41.735329,lon:-111.834912,seed:'latlon:41.73533,-111.83491'},paint={allowChat:true,allowGhosts:true,paintTimeLimitSec:120,paintTouchMode:'any',allowPaintballGun:true,allowRoofAutoPaint:true};
function payload(code,uid){return{code,createdAt:ClientTimestamp.now(),createdBy:uid,name:'Personal room',visibility:'public',maxPlayers:10,ownerUid:uid,mods:{[uid]:true},featured:false,cityKey:'logan',locationTag:{label:'Logan',city:'Logan',cityKey:'logan',kind:'earth'},world,rules:paint};}
test('ordinary free player creates a personal public room, another guest joins, and ownership is enforced',async()=>{
 const uid=one.localId;await db.doc('users/'+uid).set({uid,displayName:'Ordinary free player',email:'',plan:'free',roomCreateCount:0,roomCreateLimit:3,createdAt:Timestamp.now(),updatedAt:Timestamp.now()});
 const client=rules.authenticatedContext(uid).firestore(),batch=writeBatch(client);batch.set(doc(client,'rooms','PERS01'),payload('PERS01',uid));batch.update(doc(client,'users',uid),{roomCreateCount:1,roomCreateLimit:3,updatedAt:ClientTimestamp.now()});await assertSucceeds(batch.commit());
 const first=await call({roomCode:'PERS01',role:'owner',uid:'forged'},two.idToken);assert.equal(first.status,200,await first.clone().text());assert.equal((await first.json()).role,'member');
 assert.equal((await db.doc(`rooms/PERS01/players/${two.localId}`).get()).data().role,'member');
 const other=rules.authenticatedContext(two.localId).firestore();await assertFails(updateDoc(doc(other,'rooms','PERS01'),{name:'Stolen'}));await assertFails(deleteDoc(doc(other,'rooms','PERS01')));
 const renewed=await call({roomCode:'PERS01'},one.idToken);assert.equal(renewed.status,200);assert.equal((await renewed.json()).role,'owner');
});
test('weekly code collisions preserve an existing room and cannot be preclaimed by a client',async()=>{
 const weekly=weeklyRoomDescriptor(),uid=one.localId,client=rules.authenticatedContext(uid).firestore(),batch=writeBatch(client);batch.set(doc(client,'rooms',weekly.code),payload(weekly.code,uid));batch.update(doc(client,'users',uid),{roomCreateCount:2,updatedAt:ClientTimestamp.now()});await assertFails(batch.commit());
 await db.doc('rooms/'+weekly.code).set({code:weekly.code,ownerUid:'legacy-owner',name:'Preserve legacy room'});const response=await call({weekly:true},one.idToken);assert.equal(response.status,409);assert.equal((await db.doc('rooms/'+weekly.code).get()).data().ownerUid,'legacy-owner');await db.doc('rooms/'+weekly.code).delete();
});
test('guests open the same system-owned weekly room even with exhausted personal quotas; no player can alter it',async()=>{
 await db.doc('users/'+one.localId).update({roomCreateCount:3});const responses=await Promise.all([call({weekly:true,roomCode:'FAKE01',world:{lat:0,lon:0}},one.idToken),call({weekly:true},two.idToken)]);const results=[];for(const response of responses){assert.equal(response.status,200,await response.clone().text());results.push(await response.json());}
 const weekly=weeklyRoomDescriptor();assert.equal(results[0].roomCode,weekly.code);assert.equal(results[1].roomCode,weekly.code);assert.equal(results[0].role,'member');
 const data=(await db.doc('rooms/'+weekly.code).get()).data();assert.equal(data.systemKind,'weekly');assert.equal(data.weekKey,weekly.weekKey);assert.equal(data.maxPlayers,32);assert.equal(data.visibility,'public');assert.deepEqual(data.world,weekly.world);assert.notEqual(data.ownerUid,one.localId);assert.notEqual(data.ownerUid,two.localId);assert.equal((await db.doc('users/'+one.localId).get()).data().roomCreateCount,3);
 assert.equal((await db.collection(`rooms/${weekly.code}/players`).get()).size,2);await assertSucceeds(getDoc(doc(rules.unauthenticatedContext().firestore(),'rooms',weekly.code)));
 for(const uid of [one.localId,two.localId]){const client=rules.authenticatedContext(uid).firestore();await assertFails(updateDoc(doc(client,'rooms',weekly.code),{world}));await assertFails(updateDoc(doc(client,'rooms',weekly.code),{visibility:'private'}));await assertFails(deleteDoc(doc(client,'rooms',weekly.code)));}
});
test('32 is an admission ceiling, not a load claim; full rooms reject overflow, renew active players and release expired slots',async()=>{
 const weekly=weeklyRoomDescriptor(),batch=db.batch();for(let i=0;i<30;i++)batch.set(db.doc(`rooms/${weekly.code}/players/filler-${i}`),{uid:'filler-'+i,expiresAt:Timestamp.fromMillis(Date.now()+90000)});await batch.commit();const third=await guest();
 assert.equal((await call({weekly:true},third.idToken)).status,409);assert.equal((await call({weekly:true},one.idToken)).status,200);
 await db.doc(`rooms/${weekly.code}/players/filler-0`).update({expiresAt:Timestamp.fromMillis(Date.now()-1000)});assert.equal((await call({weekly:true},third.idToken)).status,200);
 const active=await db.collection(`rooms/${weekly.code}/players`).where('expiresAt','>',Timestamp.now()).get();assert.equal(active.size,32);assert.equal((await call({weekly:true})).status,401);
});

test('loading heartbeat renews only admission metadata under current rules', async () => {
  const code = 'LOAD01';
  await db.doc('rooms/' + code).set({ code, world, ownerUid: 'owner', maxPlayers: 10, mods: {}, visibility: 'public' });
  const response = await call({ roomCode: code }, one.idToken);
  assert.equal(response.status, 200);
  const ref = db.doc(`rooms/${code}/players/${one.localId}`);
  await ref.update({ lastSeenAt: Timestamp.fromMillis(Date.now() - 3000) });
  const before = (await ref.get()).data();
  const client = rules.authenticatedContext(one.localId).firestore();
  await assertSucceeds(updateDoc(doc(client, 'rooms', code, 'players', one.localId), {
    lastSeenAt: ClientTimestamp.now(), expiresAt: ClientTimestamp.fromMillis(Date.now() + 90000)
  }));
  const after = (await ref.get()).data();
  assert.deepEqual(after.pose, before.pose);
  assert.deepEqual(after.frame, before.frame);
  assert.equal(after.role, before.role);
});

test('private personal rooms keep code access and member-only rosters', async () => {
  const uid = one.localId, code = 'PRIV01';
  await db.doc('users/' + uid).set({ uid, displayName: 'Private room owner', email: '', plan: 'free', roomCreateCount: 0, roomCreateLimit: 3, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
  const owner = rules.authenticatedContext(uid).firestore(), batch = writeBatch(owner);
  batch.set(doc(owner, 'rooms', code), { ...payload(code, uid), visibility: 'private' });
  batch.update(doc(owner, 'users', uid), { roomCreateCount: 1, roomCreateLimit: 3, updatedAt: ClientTimestamp.now() });
  await assertSucceeds(batch.commit());
  const member = rules.authenticatedContext(two.localId).firestore();
  await assertSucceeds(getDoc(doc(member, 'rooms', code)));
  await assertFails(getDoc(doc(rules.unauthenticatedContext().firestore(), 'rooms', code)));
  await assertFails(getDoc(doc(member, 'rooms', code, 'players', uid)));
  assert.equal((await call({ roomCode: code }, two.idToken)).status, 200);
  await assertSucceeds(getDoc(doc(member, 'rooms', code, 'players', two.localId)));
  await assertFails(updateDoc(doc(member, 'rooms', code), { visibility: 'public' }));
});
