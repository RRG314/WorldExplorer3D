import test from 'node:test';
import assert from 'node:assert/strict';
import {createRuntimeKernel} from '../app/js/runtime/kernel.js';

test('system timing retains a slow call after subsequent fast frames',()=>{
 let time=0,cost=300;
 const kernel=createRuntimeKernel({now:()=>time});
 kernel.registerSystem({id:'test',phase:'world',update(){time+=cost;}});
 kernel.runFrame(0);cost=2;kernel.runFrame(16);
 const record=kernel.snapshot().phases.world[0];
 assert.equal(record.lastDurationMs,2);assert.equal(record.maxDurationMs,300);assert.equal(record.slowUpdates,1);assert.ok(Number.isInteger(record.lastSlowFrame));kernel.dispose();
});

test('manual stepping does not replay its synchronous render cost on the next live frame', () => {
 let time = 1000;
 const steps = [];
 const kernel = createRuntimeKernel({ now: () => time });
 kernel.registerSystem({ id: 'simulation', phase: 'simulation', update(frame) { steps.push(frame.dt); } });
 kernel.registerSystem({ id: 'slow-render', phase: 'render', update() { time += 250; } });
 const receipt = kernel.advanceBy(50);
 assert.equal(receipt.simulatedMs, 50);
 assert.equal(receipt.frames, 3);
 time += 16;
 kernel.runFrame(time);
 assert.ok(Math.abs(steps.at(-1) - .016) < 1e-9, `manual render cost advanced gameplay again: ${steps.at(-1)}`);
 kernel.dispose();
});


test('network-yield stepping owns the animation clock and restores it after success or failure', async () => {
 for (const failure of [false, true]) {
  let time = 0, nextId = 0, elapsed = 0, yields = 0;
  const pending = new Map();
  const kernel = createRuntimeKernel({
   now: () => time,
   requestFrame: fn => { pending.set(++nextId, fn); return nextId; },
   cancelFrame: id => pending.delete(id),
   yieldToNetwork: async () => {
    yields++;
    time += 2000; // slow network/render scheduling must not add simulation time
    assert.equal(pending.size, 0, 'live RAF ran during controlled input');
    assert.throws(() => kernel.advanceBy(16), /already active/);
    if (failure) throw Error('network yield failed');
   }
  });
  kernel.registerSystem({id:'movement', update(frame) { elapsed += frame.dt * 1000; time += 250; }});
  kernel.start();
  if (failure) await assert.rejects(kernel.advanceWithNetworkYields(50), /network yield failed/);
  else {
   const receipt = await kernel.advanceWithNetworkYields(50);
   assert.equal(receipt.simulatedMs, 50);
   assert.ok(Math.abs(elapsed - 50) < 1e-8);
   assert.equal(yields, 4);
  }
  assert.equal(pending.size, 1, 'normal RAF was not restored exactly once');
  const before = elapsed;
  time += 16;
  const [id, callback] = [...pending][0]; pending.delete(id); callback(time);
  assert.ok(Math.abs(elapsed - before - 16) < 1e-8, 'yield wall time replayed in simulation');
  kernel.dispose(); assert.equal(pending.size, 0);
 }
});
