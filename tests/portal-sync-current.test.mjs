import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryDiscoveryProfileStore} from '../app/js/discovery/profile-store.js';
import {createPortalTrailController} from '../app/js/portal/trail-controller.js';
import {emptyPortalTrailState,portalTrailView} from '../app/js/portal/trail-model.js';
import {portalFixture} from './fixtures/portal-qualification.mjs';
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve};};
function fixture(request){const store=createMemoryDiscoveryProfileStore();let view,sequence=0;const controller=createPortalTrailController({store,request,onChange:value=>view=value,now:()=>1000+sequence,operationId:()=>`operation-${++sequence}`});return {store,controller,view:()=>view};}
const remote=(uid='a',items=[])=>({ownerScope:`account:${uid}`,items,nextCursor:null});
test('guest learning and saves persist locally without network or game rewards',async()=>{
  let calls=0;const f=fixture(async()=>{calls++;});await f.controller.changeOwner(null);await f.controller.act('baltimore-harbor','save');await f.controller.act('baltimore-harbor','investigate','2026.10.25.1');
  assert.equal(calls,0);assert.equal(f.view().summary.saved,1);assert.equal(f.view().summary.investigated,1);assert.equal(f.view().summary.visited,0);f.controller.dispose();
});
test('failed upload remains durable then retries the same operation before remote hydration',async()=>{
  let failing=true;const calls=[];const f=fixture(async(path,body)=>{calls.push({path,body});if(failing)throw Error('offline');
    return path==='listPortalTrail'?remote():{ownerScope:'account:a',operationId:body.action.operationId,state:{...emptyPortalTrailState('baltimore-harbor'),revision:1,saved:true,savedAt:2000}};});
  await f.controller.changeOwner('a');await f.controller.act('baltimore-harbor','save');await f.controller.sync();
  const pending=await f.store.getPortalDestination('account:a','baltimore-harbor');assert.ok(pending.pending.saved);assert.equal(f.view().status,'pending');
  failing=false;await f.controller.sync();assert.deepEqual((await f.store.getPortalDestination('account:a','baltimore-harbor')).pending,{});assert.equal(f.view().status,'synced');
  const uploads=calls.filter(call=>call.path==='mutatePortalTrail');assert.ok(uploads.length>=2);assert.equal(uploads[0].body.action.operationId,uploads.at(-1).body.action.operationId);f.controller.dispose();
});
test('account replacement aborts old work and late success cannot appear under a new owner',async()=>{
  const waiting=deferred(),started=deferred();let signal;
  const f=fixture(async(path,body,options)=>{if(body.expectedOwnerUid==='a'){signal=options.signal;started.resolve();return waiting.promise;}return remote('b');});
  const old=f.controller.changeOwner('a');await started.promise;await f.controller.changeOwner('b');assert.equal(signal.aborted,true);
  waiting.resolve(remote('a',[{...emptyPortalTrailState('baltimore-harbor'),revision:7,saved:true,savedAt:4000}]));await old;
  assert.equal(f.view().ownerScope,'account:b');assert.equal(f.view().summary.saved,0);assert.equal((await f.store.getPortalDestination('account:b','baltimore-harbor')).state.revision,0);f.controller.dispose();
});
test('a newer choice made during an upload survives its older acknowledgment and is sent next',async()=>{
  const started=deferred(),waiting=deferred();let uploads=0,server=emptyPortalTrailState('baltimore-harbor');
  const f=fixture(async(path,body)=>{if(path==='listPortalTrail')return remote('a',server.revision?[server]:[]);
    uploads++;if(uploads===1){started.resolve();await waiting.promise;}server={...server,revision:server.revision+1,saved:body.action.kind==='save',savedAt:3000};
    return {ownerScope:'account:a',operationId:body.action.operationId,state:server};});
  await f.controller.changeOwner('a');await f.controller.act('baltimore-harbor','save');await started.promise;await f.controller.act('baltimore-harbor','unsave');waiting.resolve();await f.controller.sync();
  const entry=await f.store.getPortalDestination('account:a','baltimore-harbor');assert.equal(portalTrailView(entry).saved,false);assert.deepEqual(entry.pending,{});assert.equal(uploads,2);f.controller.dispose();
});
test('device choices stay separate until explicit copy and copying never promotes virtual visits',async()=>{
  const f=fixture(async(path,body)=>{if(path==='listPortalTrail')return remote();return {ownerScope:'account:a',operationId:body.action.operationId,state:{...emptyPortalTrailState(body.action.destinationId),revision:1,saved:true,savedAt:2000}};});
  await f.controller.changeOwner(null);await f.controller.act('monaco-coast','save');await f.controller.changeOwner('a');assert.equal(f.view().summary.saved,0);
  await f.controller.copyDeviceChoices();assert.equal(f.view().summary.saved,1);assert.equal(f.view().summary.visited,0);
  await f.controller.changeOwner(null);assert.equal(f.view().summary.saved,1);f.controller.dispose();
});
test('wrong-account server payload is rejected and preserves the pending choice',async()=>{
  const f=fixture(async(path,body)=>path==='listPortalTrail'?remote():{ownerScope:'account:intruder',operationId:body.action.operationId,state:emptyPortalTrailState('baltimore-harbor')});
  await f.controller.changeOwner('a');await f.controller.act('baltimore-harbor','save');await f.controller.sync();assert.equal(f.view().status,'pending');
  assert.equal(portalTrailView(await f.store.getPortalDestination('account:a','baltimore-harbor')).saved,true);f.controller.dispose();
});
test('durable game visit uses its separate endpoint and copying guest choices does not copy that visit',async()=>{
  const p=portalFixture(),claim={kind:'visit',operationId:'game-visit:one',destinationId:p.place.id,createdAt:p.now,destinationRevision:'1',
    contentVersion:p.place.destination.contentVersion,qualificationId:p.qualification.evidenceId,deviceProfile:'desktop',worldRequestId:'world:one',arrivalMode:'walk'};
  const calls=[],f=fixture(async(path,body)=>{calls.push({path,body});return path==='listPortalTrail'?remote():{
    ownerScope:'account:a',operationId:body.action.operationId,state:{...emptyPortalTrailState(p.place.id),revision:1,visitedAt:p.now}};});
  await f.store.recordPortalGameVisit('device-guest',claim);await f.controller.changeOwner('a');await f.controller.copyDeviceChoices();
  assert.equal(f.view().summary.visited,0);
  await f.store.recordPortalGameVisit('account:a',claim);await f.controller.sync();
  assert.equal(f.view().summary.visited,1);assert.equal(calls.filter(row=>row.path==='confirmPortalVisit').length,1);
  assert.equal(calls.some(row=>row.path==='mutatePortalTrail'),false);assert.deepEqual((await f.store.getPortalDestination('account:a',p.place.id)).pending,{});f.controller.dispose();
});
