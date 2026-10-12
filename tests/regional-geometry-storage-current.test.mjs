import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {RegionalGeometryBuffer,createRegionalGeometryStorage} from '../app/js/terrain/regional-geometry-storage.js';
import {appendRegionalBuildingFootprint} from '../app/js/terrain/regional-building-geometry.js';

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
