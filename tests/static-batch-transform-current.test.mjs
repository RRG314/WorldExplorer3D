import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {freezeWorldBatchTransform} from '../app/js/world/static-batch-transform.js';
test('static batch avoids repeated composition while actors and parent changes still update',()=>{
 const scene=new THREE.Scene();scene.matrixAutoUpdate=false;
 const root=new THREE.Group();root.matrixAutoUpdate=false;scene.add(root);
 const batch=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());
 batch.userData.isBuildingBatch=true;batch.position.set(7,2,9);root.add(batch);
 const actor=new THREE.Object3D();root.add(actor);
 assert.equal(freezeWorldBatchTransform(batch),true);
 assert.equal(freezeWorldBatchTransform(actor),false);
 scene.updateMatrixWorld();const matrix=batch.matrixWorld.clone();
 let compositions=0;batch.updateMatrix=()=>compositions++;
 actor.position.x=12;scene.updateMatrixWorld();
 assert.equal(compositions,0);assert.deepEqual(batch.matrixWorld.elements,matrix.elements);
 assert.equal(actor.matrixWorld.elements[12],12);
 root.position.x=5;root.updateMatrix();scene.updateMatrixWorld();
 assert.equal(batch.matrixWorld.elements[12],12);
 const skin=new THREE.SkinnedMesh();skin.userData.isBuildingBatch=true;
 assert.equal(freezeWorldBatchTransform(skin),false);
});

test('accepted-ground leaf buildings retain their exact transform; unresolved buildings remain movable',()=>{
 const fixed=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());
 fixed.position.set(3,14,8);fixed.userData.buildingProvenance={foundation:{authority:'accepted_ground',baseY:14}};
 assert.equal(freezeWorldBatchTransform(fixed),true);fixed.updateMatrixWorld();assert.equal(fixed.matrixWorld.elements[13],14);
 const pending=new THREE.Mesh();pending.userData.buildingProvenance={foundation:{authority:'pending',baseY:14}};
 assert.equal(freezeWorldBatchTransform(pending),false);pending.position.y=24;pending.updateMatrixWorld();assert.equal(pending.matrixWorld.elements[13],24);
 fixed.geometry.dispose();fixed.material.dispose();
});
