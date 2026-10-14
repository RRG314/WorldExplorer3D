import test from 'node:test';
import assert from 'node:assert/strict';
import {measureRetainedHeap} from '../scripts/verification/retained-heap.mjs';

test('retention collection cannot run while live timing is unfinished',async()=>{
  await assert.rejects(measureRetainedHeap({send(){throw Error('CDP must not be touched');}},{label:'gallery'}),/Finish all timing/);
});
test('retention reports preserve natural heap separately from reachable allocation',async()=>{
  const calls=[],values=[1500000000,590000000];
  const cdp={async send(command){calls.push(command);return command==='Performance.getMetrics'?{metrics:[{name:'JSHeapUsedSize',value:values.shift()}]}:{};}};
  const result=await measureRetainedHeap(cdp,{timingComplete:true,label:'occupied gallery'});
  assert.deepEqual(calls,['Performance.getMetrics','HeapProfiler.collectGarbage','Performance.getMetrics']);
  assert.equal(result.naturalBytes,1500000000);assert.equal(result.retainedBytes,590000000);
});
test('missing metrics and failed collection cannot produce passing retention evidence',async()=>{
  await assert.rejects(measureRetainedHeap({async send(){return {metrics:[]};}},{timingComplete:true,label:'city'}),/missing heap metric/);
  await assert.rejects(measureRetainedHeap({async send(command){if(command==='HeapProfiler.collectGarbage')throw Error('collection unavailable');return {metrics:[{name:'JSHeapUsedSize',value:100}]};}},{timingComplete:true,label:'city'}),/collection unavailable/);
});
