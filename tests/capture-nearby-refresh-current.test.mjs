import test from 'node:test';import assert from 'node:assert/strict';
import {createNearbyCaptureRefresh} from '../app/js/reality-capture/nearby-refresh.js';
test('walking/driving to a different block refreshes once; stationary frames do not',async()=>{
 let calls=0;const tick=createNearbyCaptureRefresh(async()=>calls++);
 await tick({x:0,z:0},0,1);await tick({x:0,z:0},100000,1);
 assert.equal(calls,1);
 await tick({x:100,z:0},100001,1);assert.equal(calls,2);
 await tick({x:200,z:0},100002,1);assert.equal(calls,2);
 await tick({x:200,z:0},110002,1);assert.equal(calls,3);
 await tick({x:200,z:0},110003,2);assert.equal(calls,4);
});
test('slow lookup cannot start a parallel request',async()=>{
 let release,calls=0;const tick=createNearbyCaptureRefresh(()=>{calls++;return new Promise(r=>release=r);});
 const first=tick({x:0,z:0},0,1);
 assert.equal(await tick({x:100,z:0},20000,1),false);assert.equal(calls,1);
 release();await first;
});
