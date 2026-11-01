import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {randomUUID} from 'node:crypto';
const require=createRequire(new URL('../../services/racing/package.json',import.meta.url)),{initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore'),cjs=createRequire(import.meta.url),{cleanupRacingAccount}=cjs('../../functions/racing-account-cleanup.js');
const projectId=process.env.GCLOUD_PROJECT;
if(!/^demo-/.test(projectId||'')||!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('An isolated demo Firestore is required.');
const app=initializeApp({projectId}),db=getFirestore(app),uid='cleanup-'+randomUUID(),other='retained-player',runId=randomUUID(),result=db.doc('racingResults/'+runId),closing=db.doc('captureAccountDeletions/'+uid);
try{
 await assert.rejects(()=>cleanupRacingAccount({db,uid}),/account_closing_marker_required/);
 await closing.set({status:'deleting'});await result.set({participantUids:[uid,other],fingerprint:'immutable-clock-fingerprint',careerContexts:{[uid]:{},[other]:{}},profiles:{[uid]:{},[other]:{}},receipt:{id:runId,players:[{uid,timeMs:1000},{uid:other,timeMs:1200}]},snapshot:{id:runId,players:[{uid},{uid:other}]}});
 await cleanupRacingAccount({db,uid});await cleanupRacingAccount({db,uid});
 const value=(await result.get()).data();assert.deepEqual(value.participantUids,[other]);assert.deepEqual(value.receipt.players,[{uid:other,timeMs:1200}]);assert.deepEqual(value.snapshot.players,[{uid:other}]);assert.equal(value.snapshot.creatorUid,null);assert.equal(value.snapshot.leaderUid,null);assert.equal(value.receipt.id,runId);assert.equal(value.fingerprint,'immutable-clock-fingerprint');assert.equal(value.careerContexts[uid],undefined);assert.equal((await db.doc(`users/${uid}/racing/career`).get()).exists,false);
 console.log(JSON.stringify({ok:true,scope:'Actual isolated Firestore cleanup of a retained shared result with missing optional host metadata; required deletion fence, safe retry, surviving time and immutable identity preserved.'}));
}finally{await db.recursiveDelete(result);await db.recursiveDelete(db.doc('users/'+uid));await closing.delete();await deleteApp(app);}
