import test from 'node:test';
import assert from 'node:assert/strict';
import {createRuntimeKernel} from '../app/js/runtime/kernel.js';
import {createRuntimeFrameSource} from '../app/js/runtime/frame-source.js';
import {getLifecycleRegistrySnapshot} from '../app/js/runtime/lifecycle-scope.js?v=2';
function fixture(){
  let pending=null,frame=null,stops=0,paused=false,sequence=0;
  const frames=[],errors=[];
  const kernel=createRuntimeKernel({requestFrame:callback=>{assert.equal(pending,null,'one flat callback');pending=callback;return ++sequence;},cancelFrame:()=>pending=null,isSimulationPaused:()=>paused});
  kernel.registerSystem({id:'simulation',phase:'simulation',update:frame=>frames.push({dt:frame.dt,source:frame.source})});
  const source=createRuntimeFrameSource(kernel,{onError:record=>errors.push(record)});
  const acquire=(options={})=>source.acquire({owner:'test-xr',start:callback=>frame=callback,stop:()=>{stops++;},...options});
  return {kernel,source,frames,errors,acquire,send:(...args)=>frame(...args),hasFlat:()=>!!pending,stops:()=>stops,setPaused:value=>paused=value};
}
test('one external callback advances the real kernel once and excludes the flat scheduler',()=>{
  const f=fixture();f.source.start();assert.equal(f.hasFlat(),true);const lease=f.acquire();assert.equal(f.hasFlat(),false);assert.equal(f.source.start(),false);
  for(let i=0;i<72;i++)f.send(i*1000/72);
  assert.equal(f.frames.length,72);assert.equal(f.kernel.snapshot().frameNumber,72);assert.equal(f.source.snapshot().frames,72);assert.equal(f.hasFlat(),false);
  assert.equal(lease.release(),true);assert.equal(f.hasFlat(),true);assert.equal(f.stops(),1);assert.equal(f.send(2000),false);assert.equal(f.frames.length,72);f.source.dispose();
});
test('headset presentation can continue with zero simulation time while paused',()=>{
  const f=fixture();f.source.start();f.acquire();f.setPaused(true);f.send(0);f.send(15);assert.deepEqual(f.frames.map(row=>row.dt),[0,0]);assert.equal(f.hasFlat(),false);f.source.dispose();
});
test('a competing source is rejected without replacing the current lease',()=>{
  const f=fixture(),lease=f.acquire();assert.throws(()=>f.acquire({owner:'other'}),/already belong/);assert.equal(lease.isCurrent(),true);assert.equal(f.stops(),0);f.source.dispose();
});
test('failed source startup cancels its callback ownership and returns a running flat kernel',()=>{
  const f=fixture();f.source.start();assert.throws(()=>f.acquire({start:()=>{throw Error('session rejected');}}),/session rejected/);assert.equal(f.stops(),1);assert.equal(f.hasFlat(),true);assert.equal(f.source.snapshot().active,false);f.source.dispose();
});
test('critical runtime failure revokes the external callback and stops further simulation',()=>{
  const f=fixture();f.kernel.registerSystem({id:'broken',phase:'render',update:()=>{throw Error('draw failed');}});f.source.start();const lease=f.acquire();
  assert.equal(f.send(0),false);assert.equal(lease.isCurrent(),false);assert.equal(f.stops(),1);assert.equal(f.hasFlat(),false);assert.equal(f.errors[0].error.message,'draw failed');
  assert.equal(f.send(10),false);assert.equal(f.frames.length,1);f.source.dispose();
});
test('world replacement retires a lease before its next frame and resumes the normal scheduler',()=>{
  const f=fixture();let current=true,reason='';f.source.start();f.acquire({isCurrent:()=>current,onExit:value=>reason=value});f.send(0);current=false;
  assert.equal(f.send(20),false);assert.equal(f.frames.length,1);assert.equal(reason,'obsolete');assert.equal(f.hasFlat(),true);f.source.dispose();
});
test('manual stop/dispose never resurrects a callback, including a previously stopped flat kernel',()=>{
  const baseline=getLifecycleRegistrySnapshot().resourceCount;
  const f=fixture();f.acquire();assert.equal(f.source.stop('owner-stop'),true);assert.equal(f.hasFlat(),false);assert.equal(f.send(10),false);
  f.source.dispose();assert.throws(()=>f.acquire(),/disposed/);assert.equal(getLifecycleRegistrySnapshot().resourceCount,baseline);
});
test('re-entry resets timing after external frames even when no flat loop was running',()=>{
  const f=fixture();const first=f.acquire();f.send(1000);f.send(1020);first.release();const next=f.acquire();f.send(1000000);
  assert.equal(f.frames.at(-1).dt,0);assert.equal(f.hasFlat(),false);next.release();assert.equal(f.stops(),2);f.source.dispose();
});
test('an obsolete grant is rejected before starting a renderer or disturbing flat frames',()=>{
  const f=fixture();f.source.start();let started=false;assert.throws(()=>f.acquire({start:()=>started=true,isCurrent:()=>false}),/already obsolete/);
  assert.equal(started,false);assert.equal(f.hasFlat(),true);assert.equal(f.stops(),0);f.source.dispose();
});
test('a framebuffer owner can defer flat restart until its asynchronous session has ended',()=>{
  const f=fixture();f.source.start();const lease=f.acquire({resumeOnRelease:false});lease.release('session ending');assert.equal(f.hasFlat(),false);
  f.source.start();assert.equal(f.hasFlat(),true);f.source.dispose();
});
