import test from 'node:test';
import assert from 'node:assert/strict';
import {reconstructClassifiedGround} from '../scripts/lib/ground-reconstruction.mjs';

test('removed roof samples recover a sloping ground plane without an artificial pit', () => {
  const width=15,height=15,mask=new Uint8Array(width*height);
  for(const offset of [0,1800]){
    const plane=Float64Array.from({length:width*height},(_,i)=>offset+(i%width)*3+Math.floor(i/width)*2);
    const raw=Float64Array.from(plane);
    for(let row=4;row<=10;row++)for(let col=4;col<=10;col++){mask[row*width+col]=1;raw[row*width+col]+=35;}
    const {ground}=reconstructClassifiedGround(raw,mask,width,height);
    for(let i=0;i<ground.length;i++)assert.ok(Math.abs(ground[i]-plane[i])<.0002);
  }
});

test('reconstruction preserves observations and cannot invent an isolated minimum',()=>{
  const raw=new Float64Array([94,110,115,94,102,100,88,99,95]);
  const mask=new Uint8Array([0,0,0,0,1,0,0,0,0]);
  const {ground}=reconstructClassifiedGround(raw,mask,3,3);
  assert.equal(ground[4],100.75);
  for(let i=0;i<raw.length;i++)if(i!==4)assert.equal(ground[i],raw[i]);
  assert.ok(ground[4]>=Math.min(ground[1],ground[3],ground[5],ground[7]));
});

test('missing exterior context and failed convergence cannot silently publish fabricated ground',()=>{
  const raw=new Float64Array([9,9,9,9,40,9,9,9,9]),mask=new Uint8Array(9).fill(1);
  const {ground}=reconstructClassifiedGround(raw,mask,3,3);
  assert.equal(ground[0],9);assert.equal(ground[4],9);
  assert.throws(()=>reconstructClassifiedGround(raw,mask,3,3,{maximumIterations:1}),/did not converge/);
});
