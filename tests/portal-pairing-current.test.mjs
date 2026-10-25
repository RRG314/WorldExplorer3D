import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {portalPairingFixture as fixture} from './fixtures/portal-pairing.mjs';
import {PORTAL_NATIVE_CLIENTS} from '../app/js/portal/native-contract.js';
const projectId='we3d-staging-20260712',[android,ios]=Object.keys(PORTAL_NATIVE_CLIENTS[projectId]);
const digest=value=>crypto.createHash('sha256').update(value).digest('base64url');
const nonce=()=>crypto.randomBytes(32).toString('base64url');

async function connection(f){
  const verifier=nonce(),code=nonce(),started=await f.call('startPortalPairing',{challenge:digest(verifier),callback:'https://untrusted.example/'});assert.equal(started.code,200);
  const requestId=started.body.requestId,approval={requestId,expectedOwnerUid:'owner',approvalId:nonce(),codeHash:digest(code)};
  return {verifier,code,requestId,started,approval,claim:{requestId,verifier,code},approve:()=>f.call('approvePortalPairing',approval)};
}
test('device connections require registered native attestation and strict bounded PKCE input',async()=>{
  const f=fixture();f.setCheck({appId:'web:unregistered'});assert.equal((await f.call('startPortalPairing',{challenge:nonce(),appId:android})).code,403);
  f.setCheck(null);assert.equal((await f.call('startPortalPairing',{challenge:nonce()})).code,401);f.setCheck({appId:android});
  for(const body of [{},{challenge:'short'},{challenge:nonce(),padding:'x'.repeat(3000)}])assert.equal((await f.call('startPortalPairing',body)).code,400);
  assert.equal((await f.call('startPortalPairing',{challenge:nonce()},'GET')).code,405);assert.equal(f.writes.length,0);
  const p=await connection(f);assert.match(p.started.body.verificationCode,/^\d{8}$/);assert.equal(p.started.headers['Cache-Control'],'private, no-store');
  const row=f.records.get(`portalPairings/${p.requestId}`);assert.ok(row.deleteAfter);assert.equal(row.status,'pending');assert.equal(Object.hasOwn(row,'callback'),false);
});
test('browser inspection exposes only approval metadata and pins a registered account',async()=>{
  const f=fixture(),p=await connection(f);assert.equal((await f.call('inspectPortalPairing',{requestId:p.requestId,expectedOwnerUid:'other'})).code,409);
  f.setAuth(null);assert.equal((await f.call('inspectPortalPairing',{requestId:p.requestId,expectedOwnerUid:'owner'})).code,401);
  f.setAuth({uid:'owner',auth_time:f.now()/1000,firebase:{sign_in_provider:'anonymous'}});assert.equal((await f.call('inspectPortalPairing',{requestId:p.requestId,expectedOwnerUid:'owner'})).code,403);
  f.setAuth({uid:'owner',auth_time:f.now()/1000,firebase:{sign_in_provider:'password'}});
  const response=await f.call('inspectPortalPairing',{requestId:p.requestId,expectedOwnerUid:'owner'});assert.equal(response.code,200);
  assert.deepEqual(Object.keys(response.body).sort(),['expiresAt','label','platform','requestId','status','verificationCode']);assert.match(response.body.label,/Android/);
});
test('approval requires recent explicit identity and exact retries cannot change its account or proof',async()=>{
  const f=fixture(),p=await connection(f);f.setAuth({uid:'owner',auth_time:f.now()/1000-1000,firebase:{sign_in_provider:'google.com'}});assert.equal((await p.approve()).code,401);
  f.setAuth({uid:'owner',auth_time:f.now()/1000,firebase:{sign_in_provider:'google.com'}});
  const approved=await p.approve();assert.equal(approved.code,200);assert.equal(approved.body.callback,'io.worldexplorer3d.app.staging://portal-connect');
  const count=f.writes.length;assert.equal((await p.approve()).code,200);assert.equal(f.writes.length,count);
  assert.equal((await f.call('approvePortalPairing',{...p.approval,codeHash:nonce()})).code,409);
  f.setAuth({uid:'other',auth_time:f.now()/1000,firebase:{sign_in_provider:'google.com'}});
  assert.equal((await f.call('approvePortalPairing',{...p.approval,expectedOwnerUid:'other'})).code,409);assert.equal((await f.call('inspectPortalPairing',{requestId:p.requestId,expectedOwnerUid:'other'})).code,409);
});
test('one matching native claim returns the existing Firebase identity in POST data; intercepted codes alone cannot consume it',async()=>{
  const f=fixture(),p=await connection(f);await p.approve();
  for(const change of [{verifier:nonce()},{code:nonce()},{verifier:'invalid'}])assert.equal((await f.call('claimPortalPairing',{...p.claim,...change})).code,403);
  f.setCheck({appId:ios});assert.equal((await f.call('claimPortalPairing',p.claim)).code,403);f.setCheck({appId:android});assert.equal(f.minted.length,0);
  const accepted=await f.call('claimPortalPairing',p.claim);assert.equal(accepted.code,200);assert.equal(accepted.body.ownerUid,'owner');assert.match(accepted.body.customToken,/^controlled-token-/);
  assert.equal((await f.call('claimPortalPairing',p.claim)).code,409);assert.equal(f.minted.length,1);
  assert.equal(f.records.get(`portalPairings/${p.requestId}`).status,'consumed');
});
test('concurrent claims can return only one custom token',async()=>{
  const f=fixture(),p=await connection(f);await p.approve();const results=await Promise.all([f.call('claimPortalPairing',p.claim),f.call('claimPortalPairing',p.claim)]);
  assert.deepEqual(results.map(row=>row.code).sort(),[200,409]);assert.equal(results.filter(row=>row.body.customToken).length,1);
});
test('native cancellation during signing, account deletion, disablement and revoked browser approval cannot publish a token',async()=>{
  const f=fixture(),p=await connection(f);await p.approve();let resolve,started;const waiting=new Promise(r=>started=r);
  f.setMint(async()=>{started();return new Promise(r=>resolve=r);});const pending=f.call('claimPortalPairing',p.claim);await waiting;
  assert.equal((await f.call('cancelPortalPairing',{requestId:p.requestId,verifier:p.verifier})).code,200);resolve('controlled-late-token');assert.equal((await pending).code,410);
  for(const change of [g=>g.setDisabled(true),g=>g.setRevokedAt(g.now()+1000),g=>g.records.set('captureAccountDeletions/owner',{started:true})]){
    const g=fixture(),q=await connection(g);await q.approve();change(g);const result=await g.call('claimPortalPairing',q.claim);assert.ok(result.code>=400);assert.equal(Object.hasOwn(result.body,'customToken'),false);
  }
});
test('expiry and per-source limits reject new work without changing accepted state',async()=>{
  const f=fixture(),p=await connection(f);f.setTime(f.now()+10*60000);assert.equal((await p.approve()).code,410);
  const g=fixture();for(let i=0;i<60;i++)assert.equal((await g.call('startPortalPairing',{challenge:nonce()})).code,200);
  const count=g.records.size;assert.equal((await g.call('startPortalPairing',{challenge:nonce()})).code,429);assert.equal(g.records.size,count);
});
test('browser cancellation retires a pending or approved grant and cannot revoke a different owner or a completed SDK session',async()=>{
  const f=fixture(),p=await connection(f);await p.approve();
  f.setAuth({uid:'other',auth_time:f.now()/1000,firebase:{sign_in_provider:'google.com'}});
  assert.equal((await f.call('cancelPortalApproval',{requestId:p.requestId,expectedOwnerUid:'other'})).code,409);
  f.setAuth({uid:'owner',auth_time:f.now()/1000,firebase:{sign_in_provider:'google.com'}});
  assert.equal((await f.call('cancelPortalApproval',{requestId:p.requestId,expectedOwnerUid:'owner'})).body.cancelled,true);
  assert.equal((await f.call('claimPortalPairing',p.claim)).code,410);
  const g=fixture(),q=await connection(g);assert.equal((await g.call('cancelPortalApproval',{requestId:q.requestId,expectedOwnerUid:'owner'})).body.cancelled,true);assert.equal((await q.approve()).code,410);
  const h=fixture(),r=await connection(h);await r.approve();await h.call('claimPortalPairing',r.claim);
  assert.equal((await h.call('cancelPortalApproval',{requestId:r.requestId,expectedOwnerUid:'owner'})).body.cancelled,false);
});
