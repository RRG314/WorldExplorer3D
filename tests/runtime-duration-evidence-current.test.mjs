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
