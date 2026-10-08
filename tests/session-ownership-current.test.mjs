import test from 'node:test';
import assert from 'node:assert/strict';
import {ctx} from '../app/js/shared-context.js?v=55';
import {captureEnvironmentSession,commitEnvironment,beginEnvironmentTransition,cancelEnvironmentTransition,getLifecycleRegistrySnapshot} from '../app/js/session-coordinator.js?v=2';
import {reloadEarthWorldSession} from '../app/js/earth-session.js';
import {capturePresentation} from '../app/js/runtime/renderer-owners.js';
import {setPauseReason,clearPauseReasons} from '../app/js/pause-state.js';
test('ten environment cycles cancel old generations and release transition resources',()=>{
 const baseline=getLifecycleRegistrySnapshot().resourceCount;
 commitEnvironment('EARTH');
 for(let i=0;i<10;i++){
  const earth=captureEnvironmentSession();assert.equal(earth.isCurrent(),true);
  commitEnvironment('OCEAN');assert.equal(earth.signal.aborted,true);assert.equal(earth.isCurrent(),false);
  const ocean=captureEnvironmentSession();commitEnvironment('EARTH');assert.equal(ocean.isCurrent(),false);
  const transition=beginEnvironmentTransition('SPACE_FLIGHT');cancelEnvironmentTransition(transition);
  assert.equal(transition.signal.aborted,true);assert.equal(getLifecycleRegistrySnapshot().resourceCount,baseline);
 }
 const world=captureEnvironmentSession();ctx._worldLoadSequence=(ctx._worldLoadSequence||0)+1;assert.equal(world.isCurrent(),false);
});
test('an old Earth restore cannot publish character state or dismiss a newer loading screen',async()=>{
 let resolve,characters=0,hides=0;
 ctx.setPlanetaryVehicle=()=>new Promise(r=>resolve=r);ctx.setPlanetaryCharacter=async()=>characters++;ctx.hideLoad=()=>hides++;
 const pending=reloadEarthWorldSession({transitionDurationMs:0});
 commitEnvironment('OCEAN');commitEnvironment('EARTH');resolve();
 assert.deepEqual(await pending,{aborted:true,resumed:false});assert.equal(characters,0);assert.equal(hides,0);
 delete ctx.setPlanetaryVehicle;delete ctx.setPlanetaryCharacter;delete ctx.hideLoad;
});
test('pause consumers cannot erase another owner and the compatibility state is read-only',()=>{
 clearPauseReasons();setPauseReason('dialog',true);setPauseReason('manual_pause',true);setPauseReason('manual_pause',false);
 assert.equal(ctx.paused,true);assert.throws(()=>{ctx.paused=false;},TypeError);setPauseReason('dialog',false);assert.equal(ctx.paused,false);
});
test('presentation handles expire when a dedicated renderer or replacement camera takes ownership',()=>{
 const context={gameStarted:true,renderer:{},scene:{},camera:{}};
 const main=capturePresentation(context);assert.equal(main.isCurrent(),true);context.oceanMode={active:true,renderer:{},scene:{},camera:{}};
 assert.equal(main.isCurrent(),false);const ocean=capturePresentation(context);context.oceanMode.camera={};assert.equal(ocean.isCurrent(),false);
});

test('failed Earth reload cannot restore, render or stamp a location; a later valid retry can',async t=>{
 const replacements={setPlanetaryVehicle:async()=>{},setPlanetaryCharacter:async()=>{},
  normalizeLocationSelection:()=> 'baltimore',showLoad(){},hideLoad(){},setEarthSceneVisible(){},
  refreshBoatAvailability(){},refreshAstronomicalSky(){},refreshLiveWeather(){},updateControlsModeUI(){},invalidateRoadCache(){},
  initialEarthWorldReady:false,worldLoadRuntimeState:{status:'failed'},loadRoads:async()=>({state:'failed'}),
  earthSessionState:{pose:{mode:'walk',x:4,z:5}},car:{x:4,z:5},resolveSafeWorldSpawn:()=>({valid:true,x:4,z:5})};
 let poses=0,renders=0,stamps=0;
 Object.assign(replacements,{applyResolvedWorldSpawn:()=>poses++,prepareFirstWorldRender:()=>renders++,
  markLocationSelectionLoaded:()=>stamps++,setTravelMode(){}});
 const savedKeys=new Set([...Object.keys(replacements),'_worldLoadSequence','worldPublication','worldLoading',
  'earthResumeDiagnostics','earthResumePending','earthResumeRenderReady']);
 const saved=new Map([...savedKeys].map(k=>[k,Object.getOwnPropertyDescriptor(ctx,k)]));
 const frame=globalThis.requestAnimationFrame;
 t.after(()=>{for(const [k,d]of saved)d?Object.defineProperty(ctx,k,d):delete ctx[k];if(frame)globalThis.requestAnimationFrame=frame;else delete globalThis.requestAnimationFrame;});
 Object.assign(ctx,replacements);
 await assert.rejects(reloadEarthWorldSession({transitionDurationMs:0}),/did not finish loading/);
 assert.deepEqual([poses,renders,stamps],[0,0,0]);assert.equal(ctx.earthResumeDiagnostics.phase,'failed');
 assert.equal(ctx.earthResumePending,false);
 const publication={sequence:33,requestId:'retry'};
 ctx.loadRoads=async()=>{
  Object.assign(ctx,{initialEarthWorldReady:true,worldLoading:false,_worldLoadSequence:33,worldPublication:publication,
   worldLoadRuntimeState:{sequence:33,publication,status:'ready',geometryReady:true,gameplayRuntimesReady:true,
    session:{state:'published',requestId:'retry'}}});return {state:'published',...publication};
 };
 globalThis.requestAnimationFrame=fn=>queueMicrotask(fn);
 assert.equal((await reloadEarthWorldSession({transitionDurationMs:0})).resumed,false);
 assert.deepEqual([poses,renders,stamps],[1,1,1]);assert.equal(ctx.earthResumeDiagnostics.phase,'complete');
});
