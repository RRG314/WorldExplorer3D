import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {installTravelTestPlacement} from '../scripts/verification/travel-test-placement.mjs';

function fixture(mode, activate = true) {
  const listeners=[];
  const ctx={paused:true,_streetPavementGeneration:2,streetPavement:{focus:{x:0,z:0}},
    mode:'plane',Walk:{state:{walker:{x:0,z:0}}},car:{x:0,z:0},planeMode:{x:-12416,z:-1216},
    activeTransportActor(){return {mode:this.mode};},GroundHeight:{walkSurfaceY:()=>4,carCenterY:()=>4.6}};
  const button={
    addEventListener(type,fn,options={}){listeners.push({type,fn,capture:!!options.capture,once:!!options.once});},
    removeEventListener(type,fn,capture=false){const i=listeners.findIndex(l=>l.type===type&&l.fn===fn&&l.capture===capture);if(i>=0)listeners.splice(i,1);},
    click(){for(const capture of [true,false])for(const l of [...listeners].filter(l=>l.capture===capture)){
      l.fn();if(l.once)this.removeEventListener(l.type,l.fn,l.capture);
    }}
  };
  button.addEventListener('click',()=>{if(activate)ctx.mode=mode;ctx.paused=false;ctx.Walk.state.walker.x=ctx.planeMode.x;ctx.Walk.state.walker.z=ctx.planeMode.z;});
  const sandbox={document:{querySelector:()=>button},__WE3D_PERF_CONTEXT__:ctx};
  const install=vm.runInNewContext(`(${installTravelTestPlacement.toString()})`,sandbox);
  const witness=install({mode,selector:'#mode',route:{points:[{x:-233,z:4},{x:-131,z:-3}]}});
  return {ctx,button,sandbox,witness,listeners};
}

test('one click completes mode and pose setup before the next frame can observe a distant walker',()=>{
  const f=fixture('walk');f.button.click();
  assert.equal(f.witness.error,null);assert.equal(f.witness.before.mode,'plane');
  assert.equal(f.witness.after.mode,'walk');assert.equal(f.ctx.paused,false);
  assert.equal(f.ctx.Walk.state.walker.x,-233);assert.equal(f.ctx.Walk.state.walker.z,4);
  assert.equal(f.ctx.Walk.state.walker.y,5.7);
  assert.equal(f.witness.before.pavementGeneration,f.witness.after.pavementGeneration);
  f.ctx.Walk.state.walker.x=100;f.button.click();
  assert.notEqual(f.ctx.Walk.state.walker.x,-233,'The one-shot listener must not reset later player actions');
});

test('vehicle setup preserves the existing ground and aircraft starting conditions',()=>{
  for(const mode of ['drive','plane']){
    const f=fixture(mode);f.button.click();assert.equal(f.witness.error,null);
    const actor=f.sandbox.__WE3D_TRAVEL_ACTOR__;
    assert.equal(actor,mode==='drive'?f.ctx.car:f.ctx.planeMode);
    assert.equal(actor.y,mode==='drive'?4.6:220);assert.equal(actor.speed,mode==='drive'?0:80);
  }
});

test('late activation fails explicitly without rewriting an inactive actor',()=>{
  const f=fixture('walk',false);f.button.click();
  assert.match(f.witness.error,/did not activate/);assert.equal(f.witness.after,null);
  assert.equal(f.sandbox.__WE3D_TRAVEL_ACTOR__,undefined);
});

test('cancelled setup removes only its own listeners',()=>{
  const f=fixture('walk');f.witness.dispose();assert.equal(f.listeners.length,1);
  f.button.click();assert.equal(f.ctx.mode,'walk');assert.equal(f.witness.before,null);
});
