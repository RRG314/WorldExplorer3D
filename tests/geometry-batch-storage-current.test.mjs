import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GeometryBatchStorage} from '../app/js/world/geometry-batch-storage.js';
import {appendGeometryWithTransform,buildMergedGeometry} from '../app/js/world/geometry-batching.js';
import {appendMidFacadeAttributes} from '../app/js/world/building-batching.js';
globalThis.THREE=THREE;
const sizes={positions:3,normals:3,uvs:2,indices:1,facadeLayouts:4,facadeOpenings:4,facadeEntrances:4,colors:3,facadeParams:4,roofAParams:4,roofColorsB:4};
function batch(typed,capacity){return Object.fromEntries(Object.entries(sizes).map(([k,n])=>[k,typed?new GeometryBatchStorage(capacity*n):[]]));}
function bytes(a){return new Uint8Array(a.buffer,a.byteOffset,a.byteLength);}
test('bounded double storage preserves all merged geometry bytes and facade shading',()=>{
 const geometry=new THREE.BoxGeometry(7.3,11.7,4.1).toNonIndexed();
 const count=geometry.attributes.position.count;
 for(const key of ['facadeLayout','facadeOpening','facadeEntrance'])geometry.setAttribute(key,new THREE.Float32BufferAttribute(Array.from({length:count*4},(_,i)=>Math.sin(i*.37)),4));
 const old=batch(false),bounded=batch(true,count*160);
 const material=new THREE.MeshStandardMaterial({color:0x847f63});material.userData.facadeProjection=[.037,1/17,.13,.24];
 for(let i=0;i<160;i++){
  const matrix=new THREE.Matrix4().compose(new THREE.Vector3(i*43.31,Math.sin(i)*87,-i*17.3),new THREE.Quaternion().setFromEuler(new THREE.Euler(i*.001,i*.03,i*.002)),new THREE.Vector3(1.3,.7,1.1));
  for(const b of [old,bounded]){const start=b.positions.length/3;const n=appendGeometryWithTransform(b,geometry,matrix);appendMidFacadeAttributes(b,material,{roofColorA:0x334455,roofColorB:0x112233},start,n);}
 }
 const a=buildMergedGeometry(old),b=buildMergedGeometry(bounded);assert.ok(a&&b);
 assert.deepEqual(Object.keys(a.attributes),Object.keys(b.attributes));
 for(const key of Object.keys(a.attributes))assert.deepEqual(bytes(a.attributes[key].array),bytes(b.attributes[key].array),key);
 assert.deepEqual(bytes(a.index.array),bytes(b.index.array));assert.deepEqual(a.boundingSphere,b.boundingSphere);
 geometry.dispose();a.dispose();b.dispose();material.dispose();
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
