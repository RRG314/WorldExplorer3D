import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
const projectId=process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
assert.equal(projectId,'we3d-staging-20260712');
for(const key of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST']) assert.match(process.env[key]||'',/^(localhost|127\.0\.0\.1):\d+$/);
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getAuth}=require('firebase-admin/auth'),{getFirestore}=require('firebase-admin/firestore');
const app=initializeApp({projectId},'commerce-recovery'),db=getFirestore(app),users=[],checks=[];
const origin=`http://127.0.0.1:5001/${projectId}/us-central1`;
const digest=value=>createHash('sha256').update(value).digest('hex').slice(0,40);
async function signup(){
 const response=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-only`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({returnSecureToken:true})});
 assert.equal(response.status,200);const result=await response.json();users.push(result.localId);return {uid:result.localId,token:result.idToken};
}
async function post(endpoint,user,body){
 const response=await fetch(origin+'/'+endpoint,{method:'POST',headers:{'content-type':'application/json',...(user?{authorization:`Bearer ${user.token}`}:{})},body:JSON.stringify(body)});
 return {status:response.status,body:await response.json()};
}
const commit=(user,body)=>post('commitExplorerCommerceAction',user,body),settle=(user,body)=>post('settleExplorerCommerceOutcome',user,body);
try {
 const owner=await signup(),other=await signup(),id=`commerce:${randomUUID()}`,dayKey=new Date().toISOString().slice(0,10);
 const input={action:'buy',requestId:id,storeId:'osm:node:commerce-fixture',catalogId:'trail-water',targetId:'',dayKey};
 assert.equal((await commit(null,input)).status,401);
 const results=await Promise.all([commit(owner,input),commit(owner,input)]);
 assert.ok(results.every(r=>r.status===200&&r.body.accepted));
 assert.equal(results.filter(r=>r.body.duplicate).length,1);
 assert.ok(results.every(r=>r.body.itemId===digest('trail-water')));
 const walletRef=db.doc(`users/${owner.uid}/economy/wallet`);
 assert.equal((await walletRef.get()).data().credits,999996);
 checks.push('Concurrent HTTP retries commit one charge and preserve item identity');
 assert.equal((await commit(owner,{...input,action:'sell'})).status,400);
 assert.equal((await commit(other,{...input,action:'sell'})).body.reason,'item_not_owned');
 checks.push('Command identity is bound to its receipt; another account cannot sell those goods');
 const oldDay=new Date(Date.now()-86400000).toISOString().slice(0,10),receiptRef=db.doc(`users/${owner.uid}/commerceReceipts/${digest(id)}`);
 await receiptRef.update({dayKey:oldDay});
 const nextDay=await commit(owner,{...input,dayKey:oldDay});assert.equal(nextDay.status,200);assert.equal(nextDay.body.duplicate,true);
 assert.equal(nextDay.body.itemId,digest('trail-water'));assert.equal((await walletRef.get()).data().credits,999996);
 assert.equal((await commit(owner,{...input,requestId:`commerce:${randomUUID()}`,dayKey:oldDay})).status,400);
 checks.push('Old-day acknowledged receipt recovers; a new old-day charge is rejected');
 const serviceId=`commerce:${randomUUID()}`,service={...input,requestId:serviceId,action:'service',catalogId:'companion-wellness',targetId:'companion-a'};
 assert.equal((await commit(owner,service)).body.accepted,true);
 assert.equal((await settle(other,{requestId:serviceId,outcome:'failed'})).status,400);
 const refunds=await Promise.all([settle(owner,{requestId:serviceId,outcome:'failed'}),settle(owner,{requestId:serviceId,outcome:'failed'})]);
 assert.ok(refunds.every(r=>r.body.settlementStatus==='compensated'));assert.equal((await walletRef.get()).data().credits,999996);
 checks.push('Service refund is account-bound and idempotent under concurrent HTTP retries');
 console.log(JSON.stringify({ok:true,scope:'Actual Auth/Functions/Firestore emulators, isolated disposable accounts; not production App Check',checks}));
} finally {
 for(const uid of users){await db.recursiveDelete(db.doc(`users/${uid}`));await getAuth(app).deleteUser(uid);}
 await deleteApp(app);
}
