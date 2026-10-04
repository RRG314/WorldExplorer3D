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
