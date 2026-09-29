import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {setPopulationHostVisible} from '../app/js/living-world/presentation-attachment.js';
test('hidden population rigs leave frame traversal and rejoin with their current pose and identity',()=>{
 const scene=new THREE.Scene(),group=new THREE.Group(),host=new THREE.Group(),bone=new THREE.Bone();
 scene.add(group);group.add(host);host.add(bone);
 let updates=0;const update=bone.updateMatrixWorld;
 bone.updateMatrixWorld=function(force){updates++;return update.call(this,force);};
 scene.updateMatrixWorld();assert.equal(updates,1);
 setPopulationHostVisible(host,group,false);host.position.x=30;
 scene.updateMatrixWorld();assert.equal(updates,1);assert.equal(host.parent,null);
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());host.add(mesh);
 setPopulationHostVisible(host,group,true);setPopulationHostVisible(host,group,true);
 scene.updateMatrixWorld();assert.equal(updates,2);assert.equal(bone.matrixWorld.elements[12],30);
 assert.equal(group.children.length,1);assert.equal(host.children[1],mesh);
 setPopulationHostVisible(host,group,false);assert.equal(host.children.length,2,'hiding never destroys agent-owned resources');
});
