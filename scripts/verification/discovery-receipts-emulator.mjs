import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
import {hydrateDiscoveryReceipts} from '../../app/js/discovery/receipt-hydration.js';
import {createMemoryDiscoveryProfileStore} from '../../app/js/discovery/profile-store.js';
const projectId='demo-we3d-receipts';
assert.ok(process.env.FIRESTORE_EMULATOR_HOST?.startsWith('127.0.0.1:'));
assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST?.startsWith('127.0.0.1:'));
const require=createRequire(import.meta.url);const admin=require('../../functions/node_modules/firebase-admin');
const {buildDiscoveryExports}=require('../../functions/discovery.js');
const app=admin.initializeApp({projectId},'receipt-verification');const db=app.firestore();const auth=app.auth();
const endpoints=buildDiscoveryExports({db,admin,setCors:()=>false,functions:{region(){return {runWith(){return this},https:{onRequest:h=>h}}}},verifyAuth:async(req,res)=>{
 try {return await auth.verifyIdToken(String(req.headers.authorization||'').replace(/^Bearer /,''));}catch{res.status(401).json({error:'Unauthorized'});return null;}
}});
const server=createServer(async(req,res)=>{res.status=code=>{res.statusCode=code;return res};res.json=body=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(body));return res};try{
 let raw='';for await(const chunk of req)raw+=chunk;req.body=JSON.parse(raw||'{}');const handler=endpoints[req.url.slice(1)];if(!handler)return res.status(404).json({error:'Not found'});await handler(req,res);
}catch{res.status(500).json({error:'Test server failed'});}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const authOrigin=`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`;
const report={scope:'Actual receipt handlers over HTTP; real Auth and Firestore emulators; two accounts and independent local stores; not deployed-service certification'};
async function signup(label){const res=await fetch(`${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-key`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:`${label}@example.test`,password:'LocalTest-Only-93!',returnSecureToken:true})});assert.equal(res.status,200,'Emulator account creation failed');const data=await res.json();return {uid:data.localId,token:data.idToken};}
async function post(name,body,user){const res=await fetch(`${origin}/${name}`,{method:'POST',headers:{'content-type':'application/json',...(user?{authorization:`Bearer ${user.token}`}:{})},body:JSON.stringify(body)});return {status:res.status,body:await res.json()};}
try{
 const a=await signup('receipt-a'),b=await signup('receipt-b');
 const claim={claimId:'claim:original',catalogId:'rock',worldIdentity:'fixture',activityId:'inspect',evidenceClass:'virtual-field-record',recordKind:'collection',expectedOwnerUid:a.uid};
 assert.equal((await post('claimExplorerDiscovery',claim,null)).status,401);
 const replies=await Promise.all(Array.from({length:5},()=>post('claimExplorerDiscovery',claim,a)));
 assert.ok(replies.every(r=>r.status===200));assert.equal(replies.filter(r=>r.body.awarded).length,1);
 assert.equal((await post('claimExplorerDiscovery',{...claim,catalogId:'different'},a)).status,409);
 assert.equal((await post('claimExplorerDiscovery',claim,b)).status,409);
 assert.equal((await post('claimExplorerDiscovery',{...claim,expectedOwnerUid:b.uid},b)).status,200);
 assert.equal((await db.collection('explorerProfiles').doc(a.uid).collection('items').get()).size,1);
 const batch=db.batch();for(let i=0;i<500;i++){const claimId=`claim:seed:${i}`,id=createHash('sha256').update(claimId).digest('hex').slice(0,40);batch.set(db.collection('explorerProfiles').doc(a.uid).collection('items').doc(id),{...claim,claimId,ownerUid:a.uid,authority:'server-receipt',recordKind:'collection',tradeable:false});}await batch.commit();
 const devices=[createMemoryDiscoveryProfileStore(),createMemoryDiscoveryProfileStore()];
 const listPage=async input=>{const response=await post('listExplorerDiscoveries',input,a);assert.equal(response.status,200);return response.body};
 for(const store of devices){assert.equal((await hydrateDiscoveryReceipts({ownerUid:a.uid,isCurrentOwner:()=>true,profileStore:store,listPage})).imported,501);assert.equal((await hydrateDiscoveryReceipts({ownerUid:a.uid,isCurrentOwner:()=>true,profileStore:store,listPage})).imported,0);}
 const onlyB=await post('listExplorerDiscoveries',{expectedOwnerUid:b.uid},b);assert.equal(onlyB.body.items.length,1);
 assert.equal((await post('listExplorerDiscoveries',{expectedOwnerUid:a.uid},b)).status,409);
 report.passed=true;report.accounts=2;report.independentLocalProfiles=2;report.restoredPerDevice=501;report.concurrentClaims=5;report.awards=1;report.replayAwards=0;
}finally{await new Promise(r=>server.close(r));await app.delete();await mkdir('output/verification/product-plan',{recursive:true});await writeFile('output/verification/product-plan/receipt-emulator.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));
