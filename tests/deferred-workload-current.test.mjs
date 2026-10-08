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

test('retired publication callbacks do not run or leave permanent completion IDs',async t=>{
 const original=globalThis.requestIdleCallback,idle=[];
 globalThis.requestIdleCallback=callback=>idle.push(callback);
 t.after(()=>{if(original)globalThis.requestIdleCallback=original;else delete globalThis.requestIdleCallback;});
 const baseline=getWorkloadPolicySnapshot().completed.length;let calls=0,current=true;
 for(let i=0;i<25;i++) {
  current=true;
  scheduleAfterFirstPlay(`publication-test-${i}`,()=>calls++,{once:false,isCurrent:()=>current});
  current=false;await idle.shift()();
 }
 assert.equal(calls,0);assert.equal(getWorkloadPolicySnapshot().completed.length,baseline);
 scheduleAfterFirstPlay('publication-repeat',()=>calls++,{once:false});await idle.shift()();
 assert.equal(scheduleAfterFirstPlay('publication-repeat',()=>calls++,{once:false}),true);await idle.shift()();
 assert.equal(calls,2);assert.equal(getWorkloadPolicySnapshot().completed.length,baseline);
 assert.deepEqual(getWorkloadPolicySnapshot().queued,[]);
});

test('failure in a deferred freshness predicate cannot strand subsequent startup work',async t=>{
 const original=globalThis.requestIdleCallback,idle=[];
 globalThis.requestIdleCallback=callback=>idle.push(callback);
 t.after(()=>{if(original)globalThis.requestIdleCallback=original;else delete globalThis.requestIdleCallback;});
 let continued=false;
 scheduleAfterFirstPlay('invalid-owner',()=>assert.fail('must not run'),{once:false,isCurrent(){throw Error('retired owner');}});
 scheduleAfterFirstPlay('after-invalid-owner',()=>continued=true,{once:false});
 await idle.shift()();await idle.shift()();
 assert.equal(continued,true);assert.equal(getWorkloadPolicySnapshot().activeTask,null);
});
