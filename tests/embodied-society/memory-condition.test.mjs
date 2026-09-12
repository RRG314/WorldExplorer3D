import test from 'node:test';
import assert from 'node:assert/strict';
import {observedMemory,memoryCondition} from '../../app/js/experiments/embodied-society/memory-condition.mjs';
test('intent feedback is bounded, copied and preserves missing explanations',()=>{
 const entries=Array.from({length:25},(_,n)=>({tick:n,status:'rejected',decisionSummary:'x'.repeat(400)}));
 const observed=observedMemory(entries,'intent-and-outcomes');
 assert.equal(observed.length,20);assert.equal(observed[0].tick,5);assert.equal(observed[0].decisionSummary.length,240);
 observed[0].status='accepted';assert.equal(entries[5].status,'rejected');
 assert.deepEqual(observedMemory([{status:'accepted'}],'intent-and-outcomes'),[{status:'accepted'}]);
});
test('baseline removes statements without changing outcomes and rejects unknown conditions',()=>{
 assert.deepEqual(observedMemory([{status:'rejected',decisionSummary:'I succeeded'}]),[{status:'rejected'}]);
 assert.equal(memoryCondition(),'outcomes-only');assert.throws(()=>memoryCondition('invented'),/Unknown/);
});
