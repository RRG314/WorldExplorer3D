import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {RegionalGeometryBuffer,createRegionalGeometryStorage} from '../app/js/terrain/regional-geometry-storage.js';
import {appendRegionalBuildingFootprint} from '../app/js/terrain/regional-building-geometry.js';
import {FAR_CONTEXT_MAX_BUILDINGS} from '../app/js/terrain/far-building-selection.js';

test('a metropolitan source does not reserve exact vertex streams for instanced buildings',()=>{
 const district=createRegionalGeometryStorage(FAR_CONTEXT_MAX_BUILDINGS);
 const metro=createRegionalGeometryStorage(386624);
 try {
  const bytes=storage=>Object.values(storage).reduce((sum,buffer)=>sum+(buffer?.data?.byteLength||0),0);
  assert.equal(bytes(metro),bytes(district));
  assert.ok(bytes(metro)<12*1024*1024,'The exact-footprint arena must fit its own budget');
  // This is capacity, not an output limit. Keep exact bytes when a footprint
  // requires more data than the initial reservation.
  const originalCapacity=metro.positions.data.length;
  for(let i=0;i<=originalCapacity;i++)metro.positions.push(i*.125);
  const result=metro.positions.finish();
  assert.equal(result.length,originalCapacity+1);
  for(let i=0;i<result.length;i++)assert.equal(result[i],Math.fround(i*.125));
 } finally {district.dispose();metro.dispose();}
});

test('regional typed construction preserves concave roofs, independent facade bays and the former geometry bytes',()=>{
 const reference={positions:[],colors:[],styles:[],layouts:[],indices:[]},storage=createRegionalGeometryStorage(0);
 const massing={heightMeters:26.5,color:[.27,.52,.78],facadeStyle:[3,2,1,0x50565b]};
 const ring=[{x:0,z:0},{x:18,z:0},{x:18,z:6},{x:8,z:6},{x:8,z:15},{x:0,z:15}];
 const triangles=THREE.ShapeUtils.triangulateShape(ring.map(p=>new THREE.Vector2(p.x,p.z)),[]);
 for(let i=0;i<1500;i++){
  const footprint=ring.map(p=>({x:p.x+i*20.125,z:p.z-17.25}));
  for(const out of [reference,storage])appendRegionalBuildingFootprint(out,footprint,triangles,massing,4.5,.9);
 }
 const arrays={};for(const key of ['positions','colors','styles','layouts','indices'])arrays[key]=storage[key].finish();
 for(const key of ['positions','styles','layouts'])assert.deepEqual(arrays[key],new Float32Array(reference[key]));
 assert.deepEqual(arrays.colors,new Uint8Array(reference.colors.map(n=>Math.round(Math.max(0,Math.min(1,n))*255))));
 assert.deepEqual(arrays.indices,new Uint32Array(reference.indices));
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(arrays.positions,3));geometry.setIndex(new THREE.BufferAttribute(arrays.indices,1));geometry.computeVertexNormals();
 assert.ok([...geometry.attributes.normal.array].every(Number.isFinite));
 storage.dispose();assert.ok(arrays.positions.byteLength>0,'Retirement must not detach published geometry');
 assert.throws(()=>storage.positions.push(1,2,3),/retired/);geometry.dispose();
});

test('cancelled regional construction releases exclusive buffers and cannot publish partial geometry',()=>{
 const buffer=new RegionalGeometryBuffer(Float32Array,3);buffer.push(1,2,3);buffer.push(4,5,6);
 assert.equal(buffer.length,6);const owned=buffer.data;buffer.dispose();buffer.dispose();
 assert.equal(buffer.data,null);assert.equal(buffer.length,0);
 if(typeof ArrayBuffer.prototype.transfer==='function')assert.equal(owned.byteLength,0);
 assert.throws(()=>buffer.finish(),/retired/);
});

test('concave roof indexing preserves every triangle and facade attribute with fewer retained vertices',()=>{
 const ring=[{x:10,z:20},{x:28,z:20},{x:28,z:26},{x:18,z:26},{x:18,z:35},{x:10,z:35}];
 const triangles=THREE.ShapeUtils.triangulateShape(ring.map(p=>new THREE.Vector2(p.x,p.z)),[]);
 const out={positions:[],colors:[],styles:[],layouts:[],indices:[]};
 const massing={heightMeters:26.5,color:[.27,.52,.78],facadeStyle:[3,2,1,0x50565b]},baseY=4.5,scale=.9;
 appendRegionalBuildingFootprint(out,ring,triangles,massing,baseY,scale);
 const wallVertices=ring.length*4,roofIndices=out.indices.slice(ring.length*6);
 assert.equal(out.positions.length/3,wallVertices+ring.length);
 assert.ok(ring.length<triangles.length*3,'The concave fixture must exercise roof vertex reuse');
 assert.deepEqual(roofIndices.map(i=>out.positions.slice(i*3,i*3+3)),triangles.flat().map(i=>[ring[i].x,baseY+massing.heightMeters*scale,ring[i].z]));
 for(const i of roofIndices){
  assert.ok(i>=wallVertices,'Roof normals and bays cannot share wall vertices');
  assert.deepEqual(out.colors.slice(i*3,i*3+3),massing.color);
  assert.deepEqual(out.styles.slice(i*4,i*4+4),massing.facadeStyle);
  const layout=out.layouts.slice(i*4,i*4+4);
  assert.equal(layout[0],0);assert.equal(layout[2],0);assert.equal(layout[3],massing.heightMeters);
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(out.positions,3));geometry.setIndex(out.indices);geometry.computeVertexNormals();
 const [a,b,c]=triangles[0].map(i=>ring[i]);
 const originalNormalY=Math.sign((b.z-a.z)*(c.x-a.x)-(b.x-a.x)*(c.z-a.z));
 for(let i=wallVertices;i<out.positions.length/3;i++)assert.ok(geometry.attributes.normal.getY(i)*originalNormalY>.999,'Every roof vertex must preserve the original winding and planar normal');
 geometry.dispose();
});
