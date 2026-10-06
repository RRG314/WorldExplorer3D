import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GeometryBatchStorage,releaseGeometryBatchScratch,releaseOwnedConstructionBuffers} from '../app/js/world/geometry-batch-storage.js';
import {appendGeometryWithTransform,buildMergedGeometry} from '../app/js/world/geometry-batching.js';
import {appendMidFacadeAttributes} from '../app/js/world/building-batching.js';
globalThis.THREE=THREE;
const sizes={positions:3,normals:3,uvs:2,indices:1,facadeLayouts:4,facadeOpenings:4,facadeEntrances:4,colors:3,facadeParams:4,roofAParams:4,roofColorsB:4};
function batch(typed,capacity,final=false){return Object.fromEntries(Object.entries(sizes).map(([k,n])=>[k,typed?new GeometryBatchStorage(capacity*n,final&&!(['normals','indices'].includes(k))?Float32Array:Float64Array):[]]));}
function bytes(a){return new Uint8Array(a.buffer,a.byteOffset,a.byteLength);}
test('bounded double storage preserves all merged geometry bytes and facade shading',()=>{
 const geometry=new THREE.BoxGeometry(7.3,11.7,4.1).toNonIndexed();
 const count=geometry.attributes.position.count;
 for(const key of ['facadeLayout','facadeOpening','facadeEntrance'])geometry.setAttribute(key,new THREE.Float32BufferAttribute(Array.from({length:count*4},(_,i)=>Math.sin(i*.37)),4));
 const old=batch(false),bounded=batch(true,count*160),owned=batch(true,count*160,true);
 const material=new THREE.MeshStandardMaterial({color:0x847f63});material.userData.facadeProjection=[.037,1/17,.13,.24];
 for(let i=0;i<160;i++){
  const matrix=new THREE.Matrix4().compose(new THREE.Vector3(i*43.31,Math.sin(i)*87,-i*17.3),new THREE.Quaternion().setFromEuler(new THREE.Euler(i*.001,i*.03,i*.002)),new THREE.Vector3(1.3,.7,1.1));
  for(const b of [old,bounded,owned]){const start=b.positions.length/3;const n=appendGeometryWithTransform(b,geometry,matrix);appendMidFacadeAttributes(b,material,{roofColorA:0x334455,roofColorB:0x112233},start,n);}
 }
 const a=buildMergedGeometry(old),b=buildMergedGeometry(bounded);assert.ok(a&&b);
 assert.deepEqual(Object.keys(a.attributes),Object.keys(b.attributes));
 for(const key of Object.keys(a.attributes))assert.deepEqual(bytes(a.attributes[key].array),bytes(b.attributes[key].array),key);
 assert.deepEqual(bytes(a.index.array),bytes(b.index.array));assert.deepEqual(a.boundingSphere,b.boundingSphere);
 const c=buildMergedGeometry(owned,{reuseStorage:true});assert.ok(c);
 for(const key of Object.keys(a.attributes))assert.deepEqual(bytes(a.attributes[key].array),bytes(c.attributes[key].array),key+' owned Float32');
 assert.deepEqual(bytes(a.index.array),bytes(c.index.array));assert.deepEqual(a.boundingSphere,c.boundingSphere);assert.deepEqual(a.boundingBox,c.boundingBox);
 assert.equal(c.attributes.position.array.buffer,owned.positions.values.buffer);
 assert.ok(owned.normals.values instanceof Float64Array);
 geometry.dispose();a.dispose();b.dispose();c.dispose();material.dispose();
});
test('invalid geometry rolls back every bounded attribute and storage rejects overflow',()=>{
 const g=new THREE.BoxGeometry(1,1,1).toNonIndexed(),b=batch(true,200);
 const first=appendGeometryWithTransform(b,g,new THREE.Matrix4());assert.ok(first>0);
 const lengths=Object.fromEntries(Object.entries(b).map(([k,v])=>[k,v.length]));
 g.attributes.position.array[10]=NaN;
 assert.equal(appendGeometryWithTransform(b,g,new THREE.Matrix4()),-1);
 assert.deepEqual(Object.fromEntries(Object.entries(b).map(([k,v])=>[k,v.length])),lengths);
 const small=new GeometryBatchStorage(2);small.push(.12345678901234567,-0);assert.equal(small.view()[0],.12345678901234567);assert.ok(Object.is(small.view()[1],-0));assert.throws(()=>small.push(3),RangeError);g.dispose();
});


test('merged storage copies by default and does not retain rolled-back capacity when ownership is transferred',()=>{
 for(const capacity of [3,6]){
  const b={positions:new GeometryBatchStorage(capacity*3,Float32Array),normals:new GeometryBatchStorage(capacity*3),uvs:new GeometryBatchStorage(capacity*2,Float32Array),indices:new GeometryBatchStorage(3)};
  for(const p of [[0,0,0],[1,0,0],[0,0,1]]){b.positions.push(...p);b.normals.push(0,1,0);b.uvs.push(0,0);}b.indices.push(0,1,2);
  const copied=buildMergedGeometry(b),owned=buildMergedGeometry(b,{reuseStorage:true});
  assert.notEqual(copied.attributes.position.array.buffer,b.positions.values.buffer);
  assert.equal(owned.attributes.position.array.buffer.byteLength,9*4);
  assert.deepEqual(bytes(copied.attributes.position.array),bytes(owned.attributes.position.array));
  copied.dispose();owned.dispose();
 }
});

test('construction scratch retires immediately without detaching published or shared storage',()=>{
 for(const capacity of [3,6]){
  const b={positions:new GeometryBatchStorage(capacity*3,Float32Array),normals:new GeometryBatchStorage(capacity*3),uvs:new GeometryBatchStorage(capacity*2,Float32Array),indices:new GeometryBatchStorage(3)};
  for(const p of [[0,0,0],[1,0,0],[0,0,1]]){b.positions.push(...p);b.normals.push(0,1,0);b.uvs.push(0,0);}b.indices.push(0,1,2);
  const g=buildMergedGeometry(b,{reuseStorage:true}),before=Object.values(g.attributes).map(a=>Array.from(a.array));
  const shared=new Float32Array([5,6,7]);b.shared=shared;
  const released=releaseGeometryBatchScratch(b,g);
  assert.ok(released>0);assert.equal(b.normals.values.byteLength,0);assert.equal(b.indices.values.byteLength,0);
  assert.equal(b.positions.values.byteLength===0,capacity!==3);
  assert.deepEqual(Object.values(g.attributes).map(a=>Array.from(a.array)),before);
  assert.deepEqual(Array.from(shared),[5,6,7]);assert.equal(releaseGeometryBatchScratch(b,g),0);
  g.dispose();
 }
 const buffer=new ArrayBuffer(12);assert.equal(releaseOwnedConstructionBuffers([buffer,buffer]),12);
 const legacy=new ArrayBuffer(8);Object.defineProperty(legacy,'transfer',{value:undefined});
 assert.equal(releaseOwnedConstructionBuffers([legacy]),0);assert.equal(legacy.byteLength,8);
});
