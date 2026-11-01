import test from 'node:test';
import assert from 'node:assert/strict';
import {createPortalConnectController} from '../app/js/portal/connect-controller.js';
const id='a'.repeat(43),code='b'.repeat(43),approvalId='c'.repeat(43),callback='io.worldexplorer3d.app.staging://portal-connect';
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve};};
const metadata={requestId:id,platform:'android',label:'Controlled native app',verificationCode:'12345678',expiresAt:2000,status:'pending'};
function fixture(handler){let state,codes=0;const calls=[],navigated=[];
  const controller=createPortalConnectController({requestId:id,projectId:'we3d-staging-20260712',now:()=>1000,codeFactory:()=>++codes===1?code:approvalId,hash:async value=>'hash-'+value,
    request:async(...args)=>{calls.push(args);return handler?handler(...args):args[0]==='inspectPortalPairing'?metadata:{requestId:id,callback};},onChange:value=>state=value,navigate:url=>navigated.push(url)});
  return {controller,calls,navigated,state:()=>state};
}
test('device approval requires explicit code confirmation, keeps native secrets out of UI state, and opens a bounded callback only after approval',async()=>{
  const f=fixture();await f.controller.changeOwner('owner');assert.equal(f.state().canApprove,true);assert.equal(await f.controller.approve(false),false);assert.equal(f.calls.length,1);
  assert.equal(await f.controller.approve(true),true);assert.equal(f.state().canReturn,true);assert.equal(JSON.stringify(f.state()).includes(code),false);
  assert.equal(f.calls[1][1].expectedOwnerUid,'owner');assert.equal(f.calls[1][1].codeHash,'hash-'+code);assert.equal(Object.hasOwn(f.calls[1][1],'code'),false);
  assert.equal(f.navigated.length,0);assert.equal(f.controller.returnToApp(),true);const url=new URL(f.navigated[0]);assert.equal(url.protocol,'io.worldexplorer3d.app.staging:');assert.equal(url.searchParams.get('code'),code);assert.equal(f.controller.returnToApp(),false);f.controller.dispose();
});
test('a request with an ambiguous network outcome reuses its exact approval proof',async()=>{
  let fail=true;const f=fixture(async name=>{if(name==='inspectPortalPairing')return metadata;if(fail)throw Error('reply lost');return {requestId:id,callback};});
  await f.controller.changeOwner('owner');assert.equal(await f.controller.approve(true),false);fail=false;assert.equal(await f.controller.approve(true),true);
  const requests=f.calls.filter(row=>row[0]==='approvePortalPairing');assert.deepEqual(requests[0][1],requests[1][1]);f.controller.dispose();
});
test('account replacement aborts older approval and ignores its late callback',async()=>{
  const waiting=deferred();let signal;const f=fixture(async(name,body,options)=>{if(name==='inspectPortalPairing')return metadata;signal=options.signal;return waiting.promise;});
  await f.controller.changeOwner('one');const old=f.controller.approve(true);await Promise.resolve();await Promise.resolve();await f.controller.changeOwner('two');assert.equal(signal.aborted,true);
  waiting.resolve({requestId:id,callback});assert.equal(await old,false);assert.equal(f.state().ownerUid,'two');assert.equal(f.state().canReturn,false);assert.equal(f.controller.returnToApp(),false);f.controller.dispose();
});
test('wrong request, arbitrary callback, expiry, already-approved lost proof and disposed responses never navigate',async()=>{
  for(const change of [()=>({...metadata,requestId:'other'}),()=>({...metadata,expiresAt:999}),()=>({...metadata,status:'approved'})]){
    const f=fixture(async()=>change());await f.controller.changeOwner('owner');assert.equal(f.state().canApprove,false);assert.equal(await f.controller.approve(true),false);assert.equal(f.navigated.length,0);f.controller.dispose();
  }
  const bad=fixture(async name=>name==='inspectPortalPairing'?metadata:{requestId:id,callback:'https://untrusted.example/'});await bad.controller.changeOwner('owner');assert.equal(await bad.controller.approve(true),false);assert.equal(bad.controller.returnToApp(),false);bad.controller.dispose();
  const waiting=deferred(),f=fixture(async()=>waiting.promise);const pending=f.controller.changeOwner('owner');f.controller.dispose();waiting.resolve(metadata);await pending;assert.equal(f.controller.returnToApp(),false);
});
test('recent sign-in failures lead to reauthentication without changing the initiating account or quietly approving again',async()=>{
  let authenticated=false;const f=fixture(async name=>{if(name==='inspectPortalPairing')return metadata;if(!authenticated)throw Object.assign(Error('Sign in again'),{status:401});return {requestId:id,callback};});
  await f.controller.changeOwner('owner');assert.equal(await f.controller.approve(true),false);assert.equal(f.state().phase,'signin-again');assert.equal(await f.controller.approve(true),false);
  authenticated=true;await f.controller.changeOwner('owner');assert.equal(f.state().phase,'review');assert.equal(await f.controller.approve(true),true);f.controller.cancel();assert.equal(f.state().canReturn,false);f.controller.dispose();
});
test('a late hash cannot retain another account’s approval proof and SHA-256 matches the PKCE reference vector',async()=>{
  const held=deferred();let state,round=0;const bodies=[];
  const controller=createPortalConnectController({requestId:id,projectId:'we3d-staging-20260712',now:()=>1000,
    codeFactory:()=>nonce(),hash:async value=>++round===1?held.promise:'new-hash',onChange:value=>state=value,
    request:async(name,body)=>{if(name==='inspectPortalPairing')return metadata;bodies.push(body);return {requestId:id,callback};}});
  function nonce(){return String.fromCharCode(100+round).repeat(43);}
  await controller.changeOwner('old');const old=controller.approve(true);await controller.changeOwner('new');held.resolve('old-hash');assert.equal(await old,false);
  assert.equal(await controller.approve(true),true);assert.equal(bodies.length,1);assert.equal(bodies[0].expectedOwnerUid,'new');assert.equal(bodies[0].codeHash,'new-hash');controller.dispose();
  const value='dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';let sent;
  const reference=createPortalConnectController({requestId:id,projectId:'we3d-staging-20260712',now:()=>1000,codeFactory:()=>value,
    request:async(name,body)=>{if(name==='inspectPortalPairing')return metadata;sent=body;return {requestId:id,callback:'io.worldexplorer3d.app://portal-connect'};}});
  await reference.changeOwner('owner');assert.equal(await reference.approve(true),false,'A staging request must refuse the production app callback.');
  assert.equal(sent.codeHash,'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');reference.dispose();
});
test('cancelling while approval is in flight revokes it remotely and a late reply cannot reopen the native callback',async()=>{
  const waiting=deferred(),started=deferred();const f=fixture(async name=>{
    if(name==='inspectPortalPairing')return metadata;
    if(name==='cancelPortalApproval')return {cancelled:true};started.resolve();return waiting.promise;
  });
  await f.controller.changeOwner('owner');const pending=f.controller.approve(true);await started.promise;await f.controller.cancel();
  waiting.resolve({requestId:id,callback});assert.equal(await pending,false);assert.equal(f.state().phase,'cancelled');assert.equal(f.controller.returnToApp(),false);
  assert.equal(f.calls.some(row=>row[0]==='cancelPortalApproval'&&row[1].expectedOwnerUid==='owner'),true);f.controller.dispose();
});
test('an approval that expires while its page stays open displays a useful error instead of silently doing nothing',async()=>{
  let at=1000,state,calls=0;const controller=createPortalConnectController({requestId:id,projectId:'we3d-staging-20260712',now:()=>at,onChange:value=>state=value,
    request:async()=>{calls++;return metadata;}});
  await controller.changeOwner('owner');at=3000;assert.equal(await controller.approve(true),false);assert.equal(state.phase,'error');assert.match(state.error,/expired/);assert.equal(calls,1);controller.dispose();
});
test('a late sign-in cannot reopen a connection that the player already cancelled',async()=>{
  const f=fixture();await f.controller.cancel();await f.controller.changeOwner('late-account');
  assert.equal(f.state().phase,'cancelled');assert.equal(f.calls.length,0);assert.equal(await f.controller.approve(true),false);f.controller.dispose();
});
