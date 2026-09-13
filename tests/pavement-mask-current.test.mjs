import test from 'node:test';
import assert from 'node:assert/strict';
import {rasterizePavementMask,pavementMaskLayout} from '../app/js/world/compiler/pavement-mask.js';
const rectangle=(x,z,w,h)=>[[x,z],[x+w,z],[x+w,z+h],[x,z+h],[x,z]];

test('terrain mask preserves mapped holes and disconnected pavement without paving the whole cell',()=>{
 const polygons=[[rectangle(0,0,32,32),rectangle(8,8,8,8)],[rectangle(48,48,8,8)]];
 const mask=rasterizePavementMask(polygons,{minX:0,minZ:0,maxX:64,maxZ:64});
 assert.equal(mask[4*64+4],255);assert.equal(mask[12*64+12],0);assert.equal(mask[52*64+52],255);assert.equal(mask[40*64+40],0);
 assert.equal(mask.reduce((a,b)=>a+b/255,0),1024);
});
test('terrain coverage has the same raster when translated across the world grid',()=>{
 const p=[[rectangle(3.25,7.5,14.5,18)]];
 const before=rasterizePavementMask(p,{minX:0,minZ:0,maxX:64,maxZ:64});
 const after=rasterizePavementMask(p.map(poly=>poly.map(r=>r.map(([x,z])=>[x+8192,z-4096]))),{minX:8192,minZ:-4096,maxX:8256,maxZ:-4032});
 assert.deepEqual(after,before);
});
test('complete-city address allocation stays within the texture budget without dropping cells',()=>{
 for(const count of [1758,3337,12000]){
  const keys=Array.from({length:count},(_,i)=>`${i%200-100}:${Math.floor(i/200)-50}`),layout=pavementMaskLayout(keys);
  assert.ok(layout.width*layout.height<=16*1024*1024);assert.ok(layout.columns*layout.rows>=count);
  assert.ok(layout.lookupWidth>=Math.min(count,200));
 }
});
