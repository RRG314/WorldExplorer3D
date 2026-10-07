import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ctx} from '../app/js/shared-context.js?v=55';
import {addEarthWorldObject,setEarthSceneVisible} from '../app/js/planetary/scene-ownership.js';
test('hidden Earth retains objects without renderer matrix traversal; explicit queries and visible return still update',()=>{
 globalThis.THREE=THREE;ctx.scene=new THREE.Scene();ctx.worldLoading=false;
 const mesh=new THREE.Object3D();let updates=0;const update=mesh.updateMatrixWorld;
 mesh.updateMatrixWorld=function(force){updates++;update.call(this,force)};
 addEarthWorldObject(mesh);setEarthSceneVisible(true);ctx.scene.updateMatrixWorld(true);
 const root=ctx.earthSceneRoot;assert.equal(updates,1);
 setEarthSceneVisible(false);mesh.position.x=12;
 for(let i=0;i<100;i++)ctx.scene.updateMatrixWorld(true);
 assert.equal(updates,1);assert.equal(mesh.parent,root);assert.equal(root.parent,ctx.scene);
 mesh.updateWorldMatrix(true,false);assert.equal(new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld).x,12);
 mesh.position.x=24;setEarthSceneVisible(true);ctx.scene.updateMatrixWorld(true);
 assert.equal(updates,2);assert.equal(ctx.earthSceneRoot,root);assert.equal(new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld).x,24);
});
