import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {installTravelTestPlacement} from '../scripts/verification/travel-test-placement.mjs';
import {remainingRoadRoute} from '../scripts/verification/travel-road-route.mjs';

function fixture(mode, activate = true, {placeActor = true, initialMode = 'plane'} = {}) {
  const listeners=[];
  const ctx={paused:true,_streetPavementGeneration:2,streetPavement:{focus:{x:0,z:0}},
    mode:initialMode,Walk:{state:{walker:{x:0,z:0}}},car:{x:0,z:0},planeMode:{x:-12416,z:-1216},
    activeTransportActor(){return {mode:this.mode};},GroundHeight:{walkSurfaceY:()=>4,carCenterY:()=>4.6}};
  const button={
    addEventListener(type,fn,options={}){listeners.push({type,fn,capture:!!options.capture,once:!!options.once});},
    removeEventListener(type,fn,capture=false){const i=listeners.findIndex(l=>l.type===type&&l.fn===fn&&l.capture===capture);if(i>=0)listeners.splice(i,1);},
    click(){for(const capture of [true,false])for(const l of [...listeners].filter(l=>l.capture===capture)){
      l.fn();if(l.once)this.removeEventListener(l.type,l.fn,l.capture);
    }}
  };
  button.addEventListener('click',()=>{
    const previous=ctx.mode;if(activate)ctx.mode=mode;ctx.paused=false;
    if(previous==='walk'&&mode==='drive')Object.assign(ctx.car,{x:ctx.Walk.state.walker.x,z:ctx.Walk.state.walker.z});
    else {ctx.Walk.state.walker.x=ctx.planeMode.x;ctx.Walk.state.walker.z=ctx.planeMode.z;}
  });
  const sandbox={document:{querySelector:()=>button},__WE3D_PERF_CONTEXT__:ctx};
  const install=vm.runInNewContext(`(${installTravelTestPlacement.toString()})`,sandbox);
  const witness=install({mode,selector:'#mode',route:{points:[{x:-233,z:4},{x:-131,z:-3}]},placeActor});
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

test('ordinary walking-to-driving observes the actual mode action without resetting pose or physics',()=>{
  const f=fixture('drive',true,{placeActor:false,initialMode:'walk'});
  Object.assign(f.ctx.Walk.state.walker,{x:342,z:-22});
  Object.assign(f.ctx.car,{y:7,angle:1.2,speed:3,vx:4,vy:5,vz:6});
  f.ctx.GroundHeight.carCenterY=()=>{throw Error('Observer must not sample or assign ground height');};
  f.button.click();
  assert.equal(f.witness.error,null);
  assert.deepEqual(f.ctx.car,{x:342,z:-22,y:7,angle:1.2,speed:3,vx:4,vy:5,vz:6});
  assert.equal(f.sandbox.__WE3D_TRAVEL_ACTOR__,f.ctx.car);
  assert.equal(f.witness.before.position.x,342);
  assert.equal(f.witness.after.position.x,342);
  assert.match(f.witness.actorWrites,/None/);
});

test('ordinary driving observation rejects an aircraft start and late activation',()=>{
  assert.throws(()=>fixture('drive',true,{placeActor:false}),/active walker/);
  const f=fixture('drive',false,{placeActor:false,initialMode:'walk'});f.button.click();
  assert.match(f.witness.error,/did not activate/);
  assert.equal(f.sandbox.__WE3D_TRAVEL_ACTOR__,undefined);
});

test('continued road input starts on the nearest segment and retains forward order at corners',()=>{
  const route={points:[{x:0,z:0},{x:100,z:0},{x:100,z:100},{x:200,z:100}],length:300};
  const original=structuredClone(route);
  assert.deepEqual(remainingRoadRoute(route,{x:102,z:50}),{points:route.points.slice(1),length:200});
  assert.deepEqual(remainingRoadRoute(route,{x:100,z:0}),route,'A tied corner retains the earlier segment');
  assert.deepEqual(remainingRoadRoute(route,{x:150,z:103}),{points:route.points.slice(2),length:100});
  assert.deepEqual(route,original);
  assert.throws(()=>remainingRoadRoute(route,{x:100,z:500}),/near the walked road/);
  assert.throws(()=>remainingRoadRoute(route,{x:NaN,z:0}),/finite/);
  assert.throws(()=>remainingRoadRoute({points:[{x:1,z:1},{x:1,z:1}]},{x:1,z:1}),/near the walked road/);
});
