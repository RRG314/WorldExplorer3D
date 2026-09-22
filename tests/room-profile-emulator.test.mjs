import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDocFromServer,runTransaction,serverTimestamp,setDoc,Timestamp} from 'firebase/firestore';
import {ensureRoomUserProfile} from '../app/js/multiplayer/rooms-profile.js';
const [host,port]=String(process.env.FIRESTORE_EMULATOR_HOST||'127.0.0.1:8080').split(':');
const env=await initializeTestEnvironment({projectId:`room-profile-${Date.now()}`,firestore:{host,port:Number(port),rules:await fs.readFile('firestore.rules','utf8')}});
test.after(()=>env.cleanup());
test('room bootstrap creates an ordinary self-owned profile',async()=>{
 const uid='new_profile',db=env.authenticatedContext(uid).firestore(),userRef=doc(db,'users',uid);
 const result=await ensureRoomUserProfile({db,userRef,profile:{uid,email:'test@example.test',displayName:'Explorer'},runTransaction,serverTimestamp,getDocFromServer});
 assert.equal(result.exists(),true);assert.equal(result.data().uid,uid);assert.ok(result.data().createdAt.toMillis()>0);
});
test('concurrent server provisioning survives a room profile bootstrap without resetting creation or plan',async()=>{
 const uid='racing_profile',db=env.authenticatedContext(uid).firestore(),userRef=doc(db,'users',uid);
 let first=true,reads=0;const createdAt=Timestamp.fromMillis(Date.now()-60000);
 const concurrentTransaction=(database,callback)=>runTransaction(database,transaction=>callback({
  get:async ref=>{reads++;const snap=await transaction.get(ref);if(first){first=false;await env.withSecurityRulesDisabled(async admin=>setDoc(doc(admin.firestore(),'users',uid),{uid,email:'test@example.test',displayName:'Provisioned',plan:'pro',roomCreateLimit:10,createdAt,updatedAt:createdAt}));}return snap;},
  set:(...args)=>transaction.set(...args)
 }));
 const result=await ensureRoomUserProfile({db,userRef,profile:{uid,email:'test@example.test',displayName:'Explorer'},runTransaction:concurrentTransaction,serverTimestamp,getDocFromServer});
 assert.ok(reads>=2);assert.equal(result.data().createdAt.toMillis(),createdAt.toMillis());assert.equal(result.data().plan,'pro');assert.equal(result.data().displayName,'Provisioned');
});
