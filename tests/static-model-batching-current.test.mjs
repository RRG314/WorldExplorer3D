import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {batchStaticModelTemplate} from '../app/js/assets/static-model-batching.js';
import {cloneModelGraph,disposeModelInstance} from '../app/js/assets/model-asset-runtime.js';
function graph(){const root=new THREE.Group(),material=new THREE.MeshStandardMaterial();root.position.set(3,4,5);root.rotation.y=.6;for(let i=0;i<3;i++){const parent=new THREE.Group();parent.position.set(i*5,2,i);parent.rotation.z=.15;root.add(parent);const mesh=new THREE.Mesh(new THREE.BoxGeometry(2,3,4),material);mesh.rotation.y=i*.3;mesh.scale.x=i===2?-1:1;parent.add(mesh);}return {root,material};}
function cloud(root){root.updateMatrixWorld(true);const out=[];root.traverse(o=>{if(o.isMesh){const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++)out.push(new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld));}});return out;}
test('static templates preserve nested transforms and material identity while clones own only their materials',()=>{
 const {root,material}=graph(),before=cloud(root),stats=batchStaticModelTemplate(THREE,root),after=cloud(root);
 assert.deepEqual(stats,{sourceMeshes:3,batches:1,savedDrawCalls:2});assert.equal(root.children.length,1);assert.equal(before.length,after.length);
 for(const v of before)assert.ok(after.some(p=>p.distanceTo(v)<2e-6));
 assert.equal(root.children[0].material,material);
 const policy={geometry:'shared',materials:'clone'},a=cloneModelGraph(root,policy),b=cloneModelGraph(root,policy);
 assert.equal(a.children[0].geometry,b.children[0].geometry);assert.notEqual(a.children[0].material,b.children[0].material);
 let geometryDisposed=false;a.children[0].geometry.addEventListener('dispose',()=>geometryDisposed=true);
 a.children[0].material.color.setHex(0x123456);assert.equal(b.children[0].material.color.getHex(),0xffffff);
 disposeModelInstance(a,policy);assert.equal(geometryDisposed,false);assert.equal(b.children[0].geometry.attributes.position.count,72);
 b.position.x+=10;const moved=cloud(b);for(const v of after)assert.ok(moved.some(p=>p.distanceTo(v.clone().add(new THREE.Vector3(10,0,0)))<2e-6));
 disposeModelInstance(b,policy);
});
test('animated or skinned templates are unchanged; transparency retains separate sorting objects',()=>{
 const {root}=graph(),snapshot=root.children.slice();assert.equal(batchStaticModelTemplate(THREE,root,[{}]).savedDrawCalls,0);assert.deepEqual(root.children,snapshot);
 const bone=new THREE.Bone();root.add(bone);assert.equal(batchStaticModelTemplate(THREE,root).savedDrawCalls,0);root.remove(bone);
 const transparent=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({transparent:true,opacity:.5}));root.add(transparent);
 batchStaticModelTemplate(THREE,root);assert.equal(transparent.parent,root);assert.equal(root.children.length,2);
});
