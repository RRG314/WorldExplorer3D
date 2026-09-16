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

test('publishing one mask cell uploads only that rectangle and its lookup pixel',async t=>{
 const previous=globalThis.THREE;t.after(()=>{globalThis.THREE=previous;});
 const textures=[],copies=[];
 class Texture{constructor(data,width,height,format){this.image={data,width,height};this.format=format;this.version=0;textures.push(this);}set needsUpdate(value){if(value)this.version++;}dispose(){this.disposed=true;}}
 class Vector{set(...values){[this.x,this.y,this.z,this.w]=values;return this;}}
 globalThis.THREE={DataTexture:Texture,Vector2:Vector,Vector4:Vector,RedFormat:1,RGBAFormat:4};
 const {createPavementTerrainMask}=await import('../app/js/world/pavement-terrain-mask.js');
 const ctx={renderer:{capabilities:{maxTextureSize:4096},copyTextureToTexture(p,src,dst){copies.push({x:p.x,y:p.y,width:src.image.width,height:src.image.height,data:Array.from(src.image.data),dst});}}};
 const keys=Array.from({length:100},(_,i)=>`${i}:0`),mask=createPavementTerrainMask(ctx,keys);
 const data=new Uint8Array(mask.layout.resolution**2).fill(127);
 mask.publish('3:0',data);mask.publish('4:0',data);
 assert.equal(copies.length,4);assert.equal(copies[0].width,mask.layout.resolution);assert.equal(copies[1].width,1);
 assert.deepEqual(copies[1].data,[4,0,0,0]);assert.deepEqual(copies[3].data,[5,0,0,0]);
 assert.equal(textures[0].version,1,'cell updates must not invalidate the entire atlas');assert.equal(textures[1].version,1);
 assert.equal(mask.uploadStats.incrementalBytes,2*(data.byteLength+4));assert.ok(mask.uploadStats.incrementalBytes<mask.bytes);
 mask.dispose();assert.ok(textures.every(texture=>texture.disposed));
});
