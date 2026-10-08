import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFile} from 'node:fs/promises';
import {disposeFarFieldMesh} from '../app/js/terrain/far-field-geometry.js';

// Run the actual bundled-revision instance-buffer owner with a recording GPU
// attributes adapter. geometry.dispose alone does not release these attributes.
const source=await readFile(new URL('../node_modules/three/src/renderers/webgl/WebGLObjects.js',import.meta.url),'utf8');
const {WebGLObjects}=await import(`data:text/javascript,${encodeURIComponent(source)}`);
test('regional eviction releases r128 instance matrices/colors exactly once and preserves shared atlas',()=>{
 const live=new Set();let disposedGeometry=0,disposedMaterial=0,disposedAtlas=0;
 const objects=WebGLObjects({ARRAY_BUFFER:34962},{get:(_,g)=>g,update:()=>{}},{update:a=>live.add(a),remove:a=>live.delete(a)},{render:{frame:0}});
 const texture=new THREE.Texture(),material=new THREE.MeshBasicMaterial({map:texture});
 texture.addEventListener('dispose',()=>disposedAtlas++);material.addEventListener('dispose',()=>disposedMaterial++);
 const group=new THREE.Group();
 for(let i=0;i<3;i++){
  const g=new THREE.BoxGeometry(),m=new THREE.InstancedMesh(g,material,10);
  m.setColorAt(0,new THREE.Color('red'));g.addEventListener('dispose',()=>disposedGeometry++);group.add(m);objects.update(m);
 }
 assert.equal(live.size,6);
 disposeFarFieldMesh(group);assert.equal(live.size,0,'Every instanceMatrix/instanceColor GPU buffer must be released');
 disposeFarFieldMesh(group);assert.equal(disposedGeometry,3);assert.equal(disposedMaterial,1);assert.equal(disposedAtlas,0);
 texture.dispose();
});
