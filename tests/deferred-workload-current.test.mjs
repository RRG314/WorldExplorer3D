import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduleAfterFirstPlay,markFirstPlayReady,getWorkloadPolicySnapshot} from '../app/js/runtime/workload-policy.js';

test('deferred startup runs one async task at a time and rejects duplicates while active',async t=>{
  const before=globalThis.requestIdleCallback;
  const idle=[];globalThis.requestIdleCallback=callback=>idle.push(callback);
  t.after(()=>{if(before)globalThis.requestIdleCallback=before;else delete globalThis.requestIdleCallback;});
  const order=[];let release;
  scheduleAfterFirstPlay('first',async()=>{order.push('first');await new Promise(r=>release=r);order.push('finished');});
  scheduleAfterFirstPlay('second',async()=>{order.push('second');});
  assert.equal(idle.length,0);
  markFirstPlayReady();assert.equal(idle.length,1);
  const pending=idle.shift()();
  assert.deepEqual(order,['first']);assert.equal(idle.length,0);
  assert.equal(scheduleAfterFirstPlay('first',()=>{}),false);
  assert.equal(getWorkloadPolicySnapshot().activeTask,'first');
  release();await pending;
  assert.equal(idle.length,1);await idle.shift()();
  assert.deepEqual(order,['first','finished','second']);
  assert.equal(getWorkloadPolicySnapshot().activeTask,null);
});
