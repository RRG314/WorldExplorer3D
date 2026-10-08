import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {ctx} from '../app/js/shared-context.js?v=55';
import {searchAndTravelToLocation} from '../app/js/input.js';
import {startLiveGpsMode,stopLiveGpsMode,recenterLiveGpsWorld} from '../app/js/live-gps/runtime.js';
import {isEarthWorldUsable} from '../app/js/earth-core/world-readiness.js';

function ready() {
  const publication={sequence:5,requestId:'consumer-retry'};
  return {initialEarthWorldReady:true,worldLoading:false,_worldLoadSequence:5,worldPublication:publication,
    worldLoadRuntimeState:{sequence:5,publication,status:'ready',geometryReady:true,gameplayRuntimesReady:true,
      session:{state:'published',requestId:publication.requestId}}};
}
function install(t, object, values) {
  for(const [key,value] of Object.entries(values)) {
    const saved=Object.getOwnPropertyDescriptor(object,key);
    Object.defineProperty(object,key,{configurable:true,writable:true,value});
    t.after(()=>saved?Object.defineProperty(object,key,saved):delete object[key]);
  }
}
function documentStub() {
  return {getElementById:()=>null,visibilityState:'visible',body:{classList:{add(){},remove(){}}},
    addEventListener(){},removeEventListener(){}};
}
test('actual map search does not spawn on a failed load and supports a later valid result',async t=>{
  let spawns=0;
  install(t,globalThis,{document:documentStub()});
  install(t,ctx,{...ready(),gameStarted:true,setCustomLocation(){},setTitleLocationMode(){},
    loadRoads:async()=>({state:'failed'}),applyCustomLocationSpawn:()=>spawns++});
  const status={dataset:{}};
  assert.equal(await searchAndTravelToLocation('39.29,-76.61',{statusElement:status}),null);
  assert.equal(spawns,0);assert.equal(status.dataset.tone,'error');assert.match(status.textContent,/finish loading/);
  ctx.loadRoads=async()=>({state:'published',sequence:4,requestId:'previous-world'});
  assert.equal(await searchAndTravelToLocation('39.29,-76.61',{statusElement:status}),null);
  assert.equal(spawns,0);
  ctx.loadRoads=async()=>({state:'published',...ctx.worldPublication});
  assert.ok(await searchAndTravelToLocation('39.29,-76.61',{statusElement:status}));
  assert.equal(spawns,1);
});
test('actual GPS recenter leaves following paused and retains its origin after load failure',async t=>{
  let watch,spawns=0;
  t.after(()=>stopLiveGpsMode());
  install(t,globalThis,{document:documentStub(),navigator:{geolocation:{getCurrentPosition(){},watchPosition(fn){watch=fn;return 1;},clearWatch(){}}}});
  install(t,ctx,{...ready(),LOC:{lat:39.29,lon:-76.61},Walk:{state:{mode:'walk'}},
    setCustomLocation(){},setCustomLocationTransient(){},loadRoads:async()=>({state:'failed'}),
    applyCustomLocationSpawn:()=>spawns++});
  const session=startLiveGpsMode();
  watch({coords:{latitude:39.291,longitude:-76.61,accuracy:5,speed:0,heading:0},timestamp:Date.now()});
  const origin={...session.model.origin};
  assert.equal(await recenterLiveGpsWorld(),false);
  assert.equal(session.following,false);assert.equal(session.recentering,false);assert.equal(spawns,0);
  assert.deepEqual(session.model.origin,origin);assert.match(session.notice,/did not finish loading/);
  ctx.loadRoads=async()=>({state:'published',...ctx.worldPublication});
  assert.equal(await recenterLiveGpsWorld(),true);assert.equal(session.following,true);assert.equal(spawns,1);
});
test('actual room sync cannot respawn before publication or mark a failed room synchronized',async()=>{
  // Evaluate the full room controller with only remote service imports replaced.
  // The ready predicate and the controller logic are production implementations.
  const source=(await readFile(new URL('../app/js/multiplayer/ui-room-runtime.js',import.meta.url),'utf8'))
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm,'').replace('export function createUiRoomRuntime','function createUiRoomRuntime');
  let spawns=0;const messages=[];
  const room={id:'room-one',code:'TEST',world:{kind:'earth',lat:39.29,lon:-76.61,seed:'test'}};
  const appCtx={...ready(),gameStarted:true,loadRoads:async()=>({state:'failed'}),spawnOnRoad:()=>spawns++,setCustomLocation(){}};
  const state={currentRoom:room,roomSessionGeneration:1};
  const context=vm.createContext({isEarthWorldUsable,deriveRoomDeterministicSeed:()=>42,
    document:documentStub(),console:{warn(){}},clearTimeout, setTimeout,
    deps:{appCtx,state,refs:{},renderers:{setStatus:(...args)=>messages.push(args)},
      helpers:{finiteNumber:(n,f)=>Number.isFinite(n)?n:f,normalizePaintRules:()=>({}),sanitizeText:String}}});
  vm.runInContext(source+'\nglobalThis.controller=createUiRoomRuntime(deps);',context);
  await context.controller.syncRoomWorldContext(room,true,true);
  assert.equal(spawns,0);assert.equal(state.activeRoomWorldSignature,'');
  assert.match(messages.at(-1)[0],/could not load/);assert.equal(messages.at(-1)[1],true);
  appCtx.loadRoads=async()=>({state:'published',...appCtx.worldPublication});
  await context.controller.syncRoomWorldContext(room,false,true);
  assert.equal(spawns,1);assert.notEqual(state.activeRoomWorldSignature,'');
  appCtx.gameStarted=false;
  appCtx.triggerTitleStart=async()=>false;
  await context.controller.syncRoomWorldContext(room,true,true);
  assert.equal(state.activeRoomWorldSignature,'');assert.equal(spawns,1);
  appCtx.triggerTitleStart=async()=>{throw Error('launch rejected');};
  await context.controller.syncRoomWorldContext(room,true,true);
  assert.equal(state.activeRoomWorldSignature,'');assert.equal(spawns,1);
});
