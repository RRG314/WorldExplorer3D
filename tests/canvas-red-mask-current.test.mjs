import test from 'node:test';
import assert from 'node:assert/strict';
import {readCanvasRedMask} from '../app/js/terrain/canvas-red-mask.js';
const fixture=()=>{
 const canvas={width:8,height:512},calls={read:0,closed:0,terminated:0,transferred:0};
 const bitmap={close(){calls.closed++;}},context={getImageData(_x,y,w,h){calls.read++;const data=new Uint8Array(w*h*4);for(let i=0;i<data.length;i+=4)data[i]=(i/4+y)%251;return {data};}};
 const worker={terminate(){calls.terminated++;},postMessage(value,transfer){assert.equal(value,bitmap);assert.deepEqual(transfer,[bitmap]);calls.transferred++;queueMicrotask(()=>worker.onmessage?.({data:{red:new Uint8Array(canvas.width*canvas.height).fill(17)}}));}};
 return {canvas,context,calls,bitmap,worker,options:{bitmapFactory:async()=>bitmap,workerFactory:()=>worker,yieldWork:async()=>{}}};
};
test('worker-owned red pixels transfer once and release both owners without main-thread readback',async()=>{
 const f=fixture(),result=await readCanvasRedMask(f.canvas,f.context,f.options);
 assert.equal(result.length,4096);assert.ok(result.every(v=>v===17));
 assert.deepEqual(f.calls,{read:0,closed:1,terminated:1,transferred:1});assert.equal(f.worker.onmessage,null);
});
test('unsupported worker APIs preserve cooperative pixel extraction and cancellation',async()=>{
 const f=fixture();let current=true,yields=0;
 const result=await readCanvasRedMask(f.canvas,f.context,{workerFactory:null,yieldWork:async()=>yields++});
 assert.equal(yields,1);assert.equal(f.calls.read,2);assert.equal(result[8*256],256%251);
 f.calls.read=0;assert.equal(await readCanvasRedMask(f.canvas,f.context,{workerFactory:null,current:()=>current,yieldWork:async()=>{current=false;}}),null);
 assert.equal(f.calls.read,1);
});
for(const failure of ['error','decode','invalid','post','timeout'])test(`worker ${failure} keeps the original mask and releases its worker`,async()=>{
 const f=fixture();f.worker.postMessage=()=>{
  if(failure==='post')throw Error('transfer rejected');
  if(failure==='timeout')return;
  queueMicrotask(()=>{if(failure==='error')f.worker.onerror();else if(failure==='decode')f.worker.onmessageerror();else f.worker.onmessage({data:{red:new Uint8Array(2)}});});
 };
 const result=await readCanvasRedMask(f.canvas,f.context,{...f.options,deadlineMs:5});
 assert.equal(result.length,4096);assert.equal(result[2048],256%251);assert.equal(f.calls.read,2);assert.equal(f.calls.terminated,1);assert.equal(f.calls.closed,1);
});
test('cancellation during bitmap preparation closes it before allocating a worker',async()=>{
 const f=fixture();let current=true;
 assert.equal(await readCanvasRedMask(f.canvas,f.context,{...f.options,current:()=>current,bitmapFactory:async()=>{current=false;return f.bitmap;}}),null);
 assert.deepEqual(f.calls,{read:0,closed:1,terminated:0,transferred:0});
});
test('superseded worker result cannot publish or fall back to stale readback',async()=>{
 const f=fixture();let current=true;
 f.worker.postMessage=()=>queueMicrotask(()=>{current=false;f.worker.onmessage({data:{red:new Uint8Array(4096)}});});
 assert.equal(await readCanvasRedMask(f.canvas,f.context,{...f.options,current:()=>current}),null);
 assert.equal(f.calls.read,0);assert.equal(f.calls.terminated,1);
});
