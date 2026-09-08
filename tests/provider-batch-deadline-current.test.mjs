import test from 'node:test';
import assert from 'node:assert/strict';
import {runBoundedProviderBatch} from '../app/js/earth-core/bounded-provider-batch.js';
test('secondary context deadline retains completed evidence and cancels outstanding work',async()=>{
 let aborted=0;
 const result=await runBoundedProviderBatch([1,2,3,4],(item,index,signal)=>item===1?Promise.resolve(item):new Promise((resolve,reject)=>{
   signal.addEventListener('abort',()=>{aborted++;reject(new Error('cancelled'));},{once:true});
 }),{concurrency:1,maxElapsedMs:20});
 assert.equal(result.settled[0].value,1);assert.equal(aborted,1);
 assert.equal(result.metrics.started,2);assert.equal(result.metrics.skipped,2);
 assert.equal(result.metrics.deadlineReached,true);
});
test('cancelling the world rejects the batch rather than publishing partial data',async()=>{
 const controller=new AbortController();
 const pending=runBoundedProviderBatch([1],(_item,_index,signal)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true})),{signal:controller.signal,maxElapsedMs:100});
 controller.abort();await assert.rejects(pending);
});
test('existing callers without deadlines retain normal bounded completion',async()=>{
 const result=await runBoundedProviderBatch([1,2,3],async x=>x*2,{concurrency:2});
 assert.deepEqual(result.settled.map(entry=>entry.value),[2,4,6]);
 assert.equal(result.metrics.deadlineReached,false);assert.equal(result.metrics.skipped,0);
});
