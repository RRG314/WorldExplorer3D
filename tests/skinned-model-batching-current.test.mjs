import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {batchSkinnedModelTemplate} from '../app/js/assets/skinned-model-batching.js';
import {cloneModelGraph,disposeModelInstance} from '../app/js/assets/model-asset-runtime.js';
function character(){
 const root=new THREE.Group(),bone=new THREE.Bone();root.add(bone);bone.name='Joint';
 const skeleton=new THREE.Skeleton([bone]);
 for(let i=0;i<3;i++){
  const geometry=new THREE.BoxGeometry(.5,.5,.5);geometry.translate(i,0,0);const n=geometry.attributes.position.count;
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(n*4),4));const weights=new Float32Array(n*4);for(let j=0;j<n;j++)weights[j*4]=1;geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  const material=new THREE.MeshStandardMaterial({color:[0xff0000,0x00ff00,0x0000ff][i],skinning:true});const mesh=new THREE.SkinnedMesh(geometry,material);mesh.name='part'+i;root.add(mesh);mesh.bind(skeleton);
 }
 return root;
}
function vertices(root){root.updateMatrixWorld(true);const out=[];root.traverse(m=>{if(m.isSkinnedMesh){m.skeleton.update();for(let i=0;i<m.geometry.attributes.position.count;i++){const v=new THREE.Vector3().fromBufferAttribute(m.geometry.attributes.position,i);m.boneTransform(i,v);out.push(v.applyMatrix4(m.matrixWorld));}}});return out;}
test('batched skin retains posed vertices, independent clone bones and material ownership',()=>{
 const root=character(),before=vertices(root);const stats=batchSkinnedModelTemplate(THREE,root);assert.equal(stats.savedDrawCalls,2);const after=vertices(root);assert.deepEqual(after,before);
 const policy={geometry:'shared',materials:'clone'},a=cloneModelGraph(root,policy),b=cloneModelGraph(root,policy);
 a.getObjectByName('Joint').rotation.z=.6;a.updateMatrixWorld(true);const posed=vertices(a),rest=vertices(b);assert.ok(posed.some((v,i)=>v.distanceTo(rest[i])>.1));
 const first=a.children.find(m=>m.isSkinnedMesh),second=b.children.find(m=>m.isSkinnedMesh);assert.notEqual(first.skeleton,second.skeleton);assert.equal(first.geometry,second.geometry);assert.notEqual(first.material,second.material);
 assert.deepEqual([...first.geometry.attributes.color.array.slice(0,3)],[1,0,0]);let geometryDisposed=false;first.geometry.addEventListener('dispose',()=>geometryDisposed=true);disposeModelInstance(a,policy);assert.equal(geometryDisposed,false);assert.deepEqual(vertices(b),rest);disposeModelInstance(b,policy);
});
test('weapons, palette materials and independently animated parts remain separate',()=>{
 const root=character(),meshes=root.children.filter(m=>m.isMesh);meshes[0].name='Pistol';meshes[1].material.name='SciFi_Main';
 assert.equal(batchSkinnedModelTemplate(THREE,root).savedDrawCalls,0);assert.ok(meshes.every(m=>m.parent===root));
 meshes[0].name='part0';meshes[1].material.name='';const clip=new THREE.AnimationClip('part',1,[new THREE.VectorKeyframeTrack('part0.position',[0,1],[0,0,0,1,0,0])]);
 assert.equal(batchSkinnedModelTemplate(THREE,root,[clip]).savedDrawCalls,1);assert.equal(meshes[0].parent,root);
});
