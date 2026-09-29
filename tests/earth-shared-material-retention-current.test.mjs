import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ctx} from '../app/js/shared-context.js?v=55';
import {addEarthWorldObject,clearEarthWorldSceneObjects} from '../app/js/planetary/scene-ownership.js';
test('world teardown releases instances and owned buffers without invalidating retained family materials',t=>{
 const previous=globalThis.THREE;globalThis.THREE=THREE;t.after(()=>{globalThis.THREE=previous;});
 ctx.scene=new THREE.Scene();ctx.worldLoading=false;
 const geometry=new THREE.BoxGeometry(),shared=new THREE.MeshStandardMaterial();
 geometry.userData.sharedRuntimeGeometry=true;shared.userData.sharedRuntimeMaterial=true;
 const instance=new THREE.InstancedMesh(geometry,shared,2);
 const ownedGeometry=new THREE.BoxGeometry(),owned=new THREE.MeshBasicMaterial();
 const ordinary=new THREE.Mesh(ownedGeometry,[owned,shared]);
 const counts={sharedMaterial:0,sharedGeometry:0,instance:0,ownedMaterial:0,ownedGeometry:0};
 for(const [value,key] of [[shared,'sharedMaterial'],[geometry,'sharedGeometry'],[instance,'instance'],[owned,'ownedMaterial'],[ownedGeometry,'ownedGeometry']])value.addEventListener('dispose',()=>counts[key]++);
 addEarthWorldObject(instance);addEarthWorldObject(ordinary);clearEarthWorldSceneObjects();
 assert.deepEqual(counts,{sharedMaterial:0,sharedGeometry:0,instance:1,ownedMaterial:1,ownedGeometry:1});
 assert.equal(ctx.earthSceneRoot.children.length,0);geometry.dispose();shared.dispose();
});
