import test from 'node:test';
import assert from 'node:assert/strict';
import {captureIndex,capturePayload} from '../scripts/verification/android-widget-evidence.mjs';
const row={name:'widget-new-layout.png',bytes:33,width:720,height:1600};
const index=rows=>Buffer.from(JSON.stringify({schemaVersion:1,screenshots:rows}));
test('new native capture names are exported without a second fixed filename list',()=>{
  assert.deepEqual(captureIndex(index([row])),[row]);
});
test('capture declarations cannot read paths, duplicate images or exceed evidence budgets',()=>{
  for(const name of ['../private.png','/private.png','widget.png?token','widget name.png','widget.PNG'])assert.throws(()=>captureIndex(index([{...row,name}])));
  assert.throws(()=>captureIndex(index([row,row])));
  for(const changed of [{bytes:4*1024*1024+1},{width:4097},{height:0}])assert.throws(()=>captureIndex(index([{...row,...changed}])));
  assert.throws(()=>captureIndex(index(Array.from({length:6},(_,i)=>({...row,name:`widget-${i}.png`,bytes:4*1024*1024})))));
});
test('an incomplete or mismatched image cannot receive an accepted evidence hash',()=>{
  const bytes=Buffer.alloc(33);Buffer.from('89504e470d0a1a0a','hex').copy(bytes);bytes.write('IHDR',12);bytes.writeUInt32BE(720,16);bytes.writeUInt32BE(1600,20);
  assert.match(capturePayload(row,bytes).sha256,/^[a-f0-9]{64}$/);
  assert.throws(()=>capturePayload(row,bytes.subarray(0,32)));
  assert.throws(()=>capturePayload({...row,width:721},bytes));
  bytes[0]=0;assert.throws(()=>capturePayload(row,bytes));
});
