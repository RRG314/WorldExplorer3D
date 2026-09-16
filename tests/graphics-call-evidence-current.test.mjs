import test from 'node:test';
import assert from 'node:assert/strict';
import {createGraphicsCallEvidence} from '../app/js/runtime/graphics-call-evidence.js';
test('graphics attribution preserves calls and exceptions, bounds history and restores context methods',()=>{
 let clock=0;
 const gl={bufferData(value){assert.equal(this,gl);clock+=150;return value;},drawElements(){clock+=2;throw new Error('draw failed');}};
 const original=gl.bufferData,probe=createGraphicsCallEvidence(gl,{now:()=>clock});
 const data=new Float32Array(10);
 assert.equal(gl.bufferData(data),data);assert.deepEqual(probe.snapshot(),[]);
 for(let i=0;i<15;i++){
  probe.begin();assert.equal(gl.bufferData(data),data);assert.throws(()=>gl.drawElements(),/draw failed/);probe.end();
 }
 const history=probe.snapshot();assert.equal(history.length,12);
 assert.deepEqual(history[0],{durationMs:152,calls:{bufferData:{count:1,totalMs:150,maxMs:150},drawElements:{count:1,totalMs:2,maxMs:2}}});
 probe.dispose();assert.equal(gl.bufferData,original);assert.deepEqual(probe.snapshot(),[]);
});
