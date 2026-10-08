import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createBuildingBodyGeometry} from '../app/js/world/building-body-geometry.js';
import {releaseRetiredBuildingCpuBuffers} from '../app/js/world/retired-building-buffers.js';
import {attachBuildingFacadeLayout} from '../app/js/world/building-facade-layout.js?v=3';
globalThis.THREE=THREE;
function reference(points,height){const shape=new THREE.Shape();points.forEach((p,i)=>i?shape.lineTo(p.x,-p.z):shape.moveTo(p.x,-p.z));shape.closePath();const g=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,curveSegments:1,steps:1});g.rotateX(-Math.PI/2);return g;}
function equal(expected,actual){
 assert.equal(actual.index,expected.index);assert.deepEqual(actual.groups,expected.groups);
 for(const key of Object.keys(expected.attributes)){
  const a=actual.attributes[key],b=expected.attributes[key];assert.equal(a.itemSize,b.itemSize,key);assert.equal(a.count,b.count,key);
  assert.deepEqual(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength),Buffer.from(b.array.buffer,b.array.byteOffset,b.array.byteLength),key);
 }
 expected.computeBoundingBox();actual.computeBoundingBox();assert.deepEqual(actual.boundingBox,expected.boundingBox);
}
test('direct building bodies exactly preserve r128 triangles, UVs, normals and facade attributes for varied mapped polygons',()=>{
 const footprints=[[{x:0,z:0},{x:13,z:0},{x:13,z:17},{x:0,z:17}],
  [{x:0,z:0},{x:20,z:0},{x:20,z:3},{x:7,z:3},{x:7,z:18},{x:0,z:18}],
  [{x:-2,z:3},{x:3,z:7},{x:3,z:7},{x:4,z:17},{x:-2,z:3}]];
 for(let seed=1;seed<=120;seed++){
  const points=[],count=3+seed%23;
  for(let i=0;i<count;i++){const angle=i/count*Math.PI*2,r=8+(i%3)*5;points.push({x:seed*91.134+Math.cos(angle)*r,z:-seed*53.823+Math.sin(angle)*r});}
  footprints.push(points);
 }
 for(const source of footprints)for(const points of [source,source.toReversed()])for(const height of [.2,3.2,19.335,94.124]){
  const a=reference(points,height),b=createBuildingBodyGeometry(THREE,points,height);
  try{equal(a,b);attachBuildingFacadeLayout(a,{levels:4,foundation:.37});attachBuildingFacadeLayout(b,{levels:4,foundation:.37});equal(a,b);
   assert.equal(b.parameters,undefined,'No Shape/Curve construction graph is retained');
  }finally{a.dispose();b.dispose();releaseRetiredBuildingCpuBuffers(b);}
 }
});
test('private body storage retires once without mutating mapped footprint data',()=>{
 const points=[{x:0,z:0},{x:9,z:0},{x:9,z:7},{x:0,z:7}],snapshot=structuredClone(points);
 const body=createBuildingBodyGeometry(THREE,points,12),size=Object.values(body.attributes).reduce((n,a)=>n+a.array.byteLength,0);
 body.dispose();assert.equal(releaseRetiredBuildingCpuBuffers(body),size);assert.equal(releaseRetiredBuildingCpuBuffers(body),0);assert.deepEqual(points,snapshot);
 assert.throws(()=>createBuildingBodyGeometry(THREE,points,NaN));assert.throws(()=>createBuildingBodyGeometry(THREE,[{x:NaN,z:0},...points],10));
});
