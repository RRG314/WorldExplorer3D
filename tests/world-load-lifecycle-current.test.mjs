import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldLoadRequest} from '../app/js/earth-core/world-load-request.js';
import {createWorldLoadRuntimeSession} from '../app/js/world/load-runtime-session.js';
import {createWorldLoadCoordinator} from '../app/js/world/world-load-coordinator.js';
import {createWorldRoadLoader} from '../app/js/world/load-roads.js';
import {getAdaptiveLoadProfile,getWorldLodThresholds} from '../app/js/world/budgets.js';
import {finishFailedWorldLoad} from '../app/js/world/load-failure.js';
import {isEarthWorldUsable} from '../app/js/earth-core/world-readiness.js';

const selection={key:'custom',lat:39.29,lon:-76.61,name:'Baltimore'};
function setup(overrides={}) {
  const ctx={car:{},hashGeoToInt:()=>42,resolveLocationSelection:()=>selection,showLoad(){},...overrides};
  const deps={appCtx:ctx,resetWorldForReload(){ctx.worldLoading=true;},getAdaptiveLoadProfile,getWorldLodThresholds,
    getRuntimeDynamicBudget:()=>({deviceClass:'desktop',budgetScale:1,lodScale:1}),earthSceneSuppressed:()=>false};
  return {ctx,deps};
}
function publishedContext() {
  const publication={sequence:3,requestId:'third'};
  return {initialEarthWorldReady:true,worldLoading:false,_worldLoadSequence:3,worldPublication:publication,
    worldLoadRuntimeState:{sequence:3,publication,status:'ready',geometryReady:true,gameplayRuntimesReady:true,
      session:{state:'published',requestId:'third'}}};
}

test('request admission rejects missing/blank/coerced coordinates and accepts actual zero',()=>{
  for(const value of [null,undefined,'','  ',false,[],{},Infinity,NaN]) {
    assert.equal(createWorldLoadRequest({...selection,lat:value},1),null);
    assert.equal(createWorldLoadRequest({...selection,lon:value},1),null);
  }
  assert.equal(createWorldLoadRequest({...selection,lat:0,lon:'0'},1).location.lon,0);
});
test('invalid admission preserves world, boat, player and loaded publication',()=>{
  const old={id:'retained'},boat={active:true},car={x:12,z:34};let resets=0,stops=0;
  const {ctx,deps}=setup({buildings:[old],initialEarthWorldReady:true,boatMode:boat,car,
    resolveLocationSelection:()=>null,stopBoatMode(){stops++;}});
  const result=createWorldLoadRuntimeSession({...deps,resetWorldForReload(){resets++;ctx.buildings=[];}});
  assert.equal(result.aborted,true);assert.equal(resets,0);assert.equal(stops,0);
  assert.deepEqual(ctx.buildings,[old]);assert.deepEqual(car,{x:12,z:34});assert.equal(ctx.initialEarthWorldReady,true);
});
test('invalid request cannot cancel an in-flight valid location or advance its generation',async()=>{
  let admitted=true,cancelled=0,release;
  const ctx={_worldLoadSequence:5};
  const owner=createWorldLoadCoordinator({appCtx:ctx,admitRequest:()=>admitted,getWorldLoadSignature:()=>admitted?'valid':'invalid',
    cancelActive:()=>cancelled++,loadWorld:()=>new Promise(r=>release=r)});
  const pending=owner.loadWorld();admitted=false;
  assert.equal((await owner.loadWorld()).aborted,true);assert.equal(cancelled,0);assert.equal(ctx._worldLoadSequence,5);
  release('published');assert.equal(await pending,'published');
});
test('provider scope rejects admission after cancellation and joins delayed/rejected work',async()=>{
  const {deps}=setup();const session=createWorldLoadRuntimeSession(deps);let release,drained=false,started=0;
  const delayed=session.runProviderWork('slow','pending',()=>new Promise(r=>release=r));
  const rejected=session.runProviderWork('bad','failure',async()=>{throw Error('provider failed');});
  await assert.rejects(rejected,/provider failed/);
  const drain=session.drainProviderWork('cancelled').then(()=>drained=true);
  await assert.rejects(session.runProviderWork('late','new',async()=>started++),{name:'AbortError'});
  await Promise.resolve();assert.equal(drained,false);assert.equal(started,0);
  release({discarded:true});await delayed;await drain;
  assert.equal(session.worldSession.snapshot().outstandingProviderWork,0);
  await assert.rejects(session.runProviderWork('late','again',async()=>started++),{name:'AbortError'});
});
test('unexpected ground failure reaches a terminal state and releases its owned world',async()=>{
  let released=0;
  const {ctx,deps}=setup({terrainEnabled:true,gameStarted:true,selLoc:'custom',releaseEarthWorldForTitle:()=>released++,
    prepareAcceptedGroundFromCatalog:async()=>{throw Error('catalog decoder failed');}});
  const owner=createWorldRoadLoader({...deps,getWorldLoadSignature:()=> 'Baltimore'});
  const result=await owner.loadRoads();
  assert.equal(result.state,'failed');assert.equal(result.outstandingProviderWork,0);
  assert.equal(ctx.worldLoading,false);assert.equal(ctx.gameStarted,false);assert.equal(ctx.initialEarthWorldReady,false);
  assert.equal(released,1);assert.equal(ctx.worldLoadRuntimeState.status,'failed');
});
test('stale load failure cannot dispose or stop a newer world',()=>{
  const old={sequence:2},current={sequence:3};let disposed=0;
  const appCtx={worldLoadRuntimeState:current,worldLoading:false,gameStarted:true,initialEarthWorldReady:true,
    releaseEarthWorldForTitle:()=>disposed++};
  finishFailedWorldLoad({appCtx,runtimeState:old},Error('old failure'));
  assert.equal(disposed,0);assert.equal(appCtx.gameStarted,true);assert.equal(appCtx.initialEarthWorldReady,true);
  assert.equal(appCtx.worldLoadRuntimeState,current);
});
test('failure cleanup continues if one disposer throws',()=>{
  const runtimeState={sequence:2};let hidden=false,released=false;
  const appCtx={worldLoadRuntimeState:runtimeState,streetOverview:{dispose(){throw Error('bad disposer');}},
    releaseEarthWorldForTitle:()=>released=true,hideLoad:()=>hidden=true};
  finishFailedWorldLoad({appCtx,runtimeState},Error('bad world'));
  assert.equal(hidden,true);assert.equal(released,true);assert.match(runtimeState.cleanupError,/bad disposer/);
});
test('entry requires the same fully published world; conflicting booleans cannot admit gameplay',()=>{
  assert.equal(isEarthWorldUsable(publishedContext()),true);
  for(const field of ['geometryReady','gameplayRuntimesReady']) {
    const ctx=publishedContext();ctx.worldLoadRuntimeState[field]=false;assert.equal(isEarthWorldUsable(ctx),false);
  }
  for(const state of ['loading','starting-gameplay','failed','superseded']) {
    const ctx=publishedContext();ctx.worldLoadRuntimeState.status=state;assert.equal(isEarthWorldUsable(ctx),false);
  }
  for(const result of [{state:'failed'},{state:'superseded'},{aborted:true}])assert.equal(isEarthWorldUsable(publishedContext(),result),false);
  const replaced=publishedContext();replaced._worldLoadSequence++;assert.equal(isEarthWorldUsable(replaced),false);
  const uncommitted=publishedContext();uncommitted.worldLoadRuntimeState.session.state='compiling';assert.equal(isEarthWorldUsable(uncommitted),false);
});
