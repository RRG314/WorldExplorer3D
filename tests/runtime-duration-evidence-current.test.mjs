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
