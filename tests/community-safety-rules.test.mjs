import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,updateDoc,deleteDoc,writeBatch,serverTimestamp,Timestamp} from 'firebase/firestore';

const projectId=process.env.GCLOUD_PROJECT;
assert.match(projectId||'',/^demo-we3d-community/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST||'',/^127\.0\.0\.1:\d+$/);
const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');
let environment;
const client=uid=>environment.authenticatedContext(uid).firestore();
const consent=db=>setDoc(doc(db,'users',db===one?'one':'two','consents','community'),{version:'community-2026-10-24',acceptedAt:serverTimestamp()});
let one,two;
test.before(async()=>{
  environment=await initializeTestEnvironment({projectId,firestore:{host,port:Number(port),rules:await readFile('firestore.rules','utf8')}});
  await environment.clearFirestore();one=client('one');two=client('two');
  await environment.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    await setDoc(doc(db,'rooms','ROOM01'),{code:'ROOM01',ownerUid:'one',visibility:'public',world:{kind:'earth',lat:0,lon:0},rules:{allowChat:true},mods:{},maxPlayers:10});
    await setDoc(doc(db,'rooms','ROOM01','players','two'),{uid:'two'});
    await setDoc(doc(db,'users','one','friends','two'),{uid:'two'});
  });
});
test.after(async()=>{await environment?.cleanup();});

test('acceptance is private, explicit, versioned and tied to the authenticated account',async()=>{
  await assertFails(setDoc(doc(one,'users','two','consents','community'),{version:'community-2026-10-24',acceptedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(one,'users','one','consents','community'),{version:'old',acceptedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(one,'users','one','consents','community'),{version:'community-2026-10-24',acceptedAt:Timestamp.fromMillis(1)}));
  await assertSucceeds(consent(one));
  await assertFails(getDoc(doc(two,'users','one','consents','community')));
  await assertSucceeds(deleteDoc(doc(one,'users','one','consents','community')));
});

test('a guest member cannot send chat before acceptance; current acceptance permits the same transaction',async()=>{
  function send(){
    const batch=writeBatch(two),now=serverTimestamp(),expiresAt=Timestamp.fromMillis(Date.now()+60000);
    batch.set(doc(two,'rooms','ROOM01','chat','message'),{uid:'two',displayName:'Two',text:'Hello explorers',createdAt:now,expiresAt,flags:{reported:false,autoFiltered:false}});
    batch.set(doc(two,'rooms','ROOM01','chatState','two'),{uid:'two',lastMessageAt:now,windowStartedAt:now,windowCount:1,updatedAt:now,expiresAt});
    return batch.commit();
  }
  await assertFails(send());await assertSucceeds(consent(two));await assertSucceeds(send());
  await assertSucceeds(deleteDoc(doc(two,'users','two','consents','community')));
  await assertSucceeds(setDoc(doc(one,'rooms','ROOM01','chat','message'),{flags:{reported:true,reportedBy:'one',reportReason:'Abuse',reportedAt:serverTimestamp()}},{merge:true}));
});

test('block records persist for the owner but cannot be inspected or changed by another player',async()=>{
  const ref=doc(two,'users','two','blockedPlayers','one');
  await assertSucceeds(setDoc(ref,{uid:'one',displayName:'One',updatedAt:serverTimestamp()}));
  assert.equal((await assertSucceeds(getDoc(doc(client('two'),'users','two','blockedPlayers','one')))).data().uid,'one');
  await assertFails(getDoc(doc(one,'users','two','blockedPlayers','one')));
  await assertFails(deleteDoc(doc(one,'users','two','blockedPlayers','one')));
  await assertFails(setDoc(doc(two,'users','two','blockedPlayers','two'),{uid:'two',displayName:'Self',updatedAt:serverTimestamp()}));
});

test('a recipient block rejects both new and resent invitations; unblocking restores invitations',async()=>{
  await assertSucceeds(consent(one));
  const ref=doc(one,'users','two','incomingInvites','one_ROOM01');
  const invite={fromUid:'one',fromDisplayName:'One',toUid:'two',roomCode:'ROOM01',roomName:'Room',inviteLink:'https://worldexplorer3d.io/app/?room=ROOM01',message:'Join us',seen:false,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),expiresAt:Timestamp.fromMillis(Date.now()+60000)};
  await assertFails(setDoc(ref,invite));
  await environment.withSecurityRulesDisabled(async context=>{
    await setDoc(doc(context.firestore(),'users','two','incomingInvites','one_ROOM01'),{...invite,createdAt:Timestamp.fromMillis(Date.now()-120000),updatedAt:Timestamp.fromMillis(Date.now()-60000)});
  });
  await assertFails(updateDoc(ref,{message:'Again',updatedAt:serverTimestamp()}));
  await assertSucceeds(deleteDoc(doc(two,'users','two','blockedPlayers','one')));
  await assertSucceeds(updateDoc(ref,{message:'Again',updatedAt:serverTimestamp()}));
  await assertSucceeds(deleteDoc(ref));await assertSucceeds(setDoc(ref,invite));
});

test('a sender cannot invite someone they blocked, and blocked users cannot silently become friends',async()=>{
  await assertSucceeds(deleteDoc(doc(one,'users','two','incomingInvites','one_ROOM01')));
  await assertSucceeds(setDoc(doc(one,'users','one','blockedPlayers','two'),{uid:'two',displayName:'Two',updatedAt:serverTimestamp()}));
  const now=serverTimestamp();
  await assertFails(setDoc(doc(one,'users','two','incomingInvites','one_ROOM01'),{fromUid:'one',fromDisplayName:'One',toUid:'two',roomCode:'ROOM01',roomName:'Room',inviteLink:'https://worldexplorer3d.io/app/?room=ROOM01',message:'Join',seen:false,createdAt:now,updatedAt:now,expiresAt:Timestamp.fromMillis(Date.now()+60000)}));
  await assertSucceeds(deleteDoc(doc(one,'users','one','friends','two')));
  await assertFails(setDoc(doc(one,'users','one','friends','two'),{uid:'two',displayName:'Two',source:'manual',addedAt:now,updatedAt:now}));
});
