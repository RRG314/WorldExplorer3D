import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {batchStaticVesselParts} from '../app/js/transport/batch-static-vessel-parts.js';
import {createVesselVisual,updateVesselVisual} from '../app/js/transport/vessel-visual-recipe.js';
import {MARITIME_CATALOG} from '../app/js/transport/maritime-catalog.js';

const triangles=root=>{let count=0;root.traverse(o=>{if(o.isMesh)count+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});return count;};
const vertexCloud=root=>{root.updateMatrixWorld(true);const points=[];root.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++)points.push(new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld));});return points;};
test('static vessel batching preserves transformed geometry, materials and independently controlled parts',()=>{
 const root=new THREE.Group(),material=new THREE.MeshStandardMaterial({color:0xabcdef});
 for(let i=0;i<3;i++){const mesh=new THREE.Mesh(new THREE.BoxGeometry(2,3,4),material);mesh.position.set(i*5,1,i);mesh.rotation.set(.2,.3*i,.1);mesh.scale.set(i===2?-1:1,1.2,.7);root.add(mesh);}
 const light=new THREE.Mesh(new THREE.SphereGeometry(1,8,6),new THREE.MeshBasicMaterial());light.userData.vesselNavigationLight=true;root.add(light);
 const transparent=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({transparent:true,opacity:.2}));root.add(transparent);
 root.position.set(13,4,-8);root.rotation.y=.8;
 const before=vertexCloud(root),count=triangles(root);let disposed=0;root.children.slice(0,3).forEach(o=>o.geometry.addEventListener('dispose',()=>disposed++));
 const result=batchStaticVesselParts(THREE,root);
 assert.deepEqual(result,{sourceMeshes:3,batches:1,savedDrawCalls:2});assert.equal(disposed,3);assert.equal(triangles(root),count);
 const after=vertexCloud(root);assert.equal(after.length,before.length);
 for(const point of before)assert.ok(after.some(p=>p.distanceTo(point)<2e-6),'Baked world position changed');
 assert.equal(light.parent,root);assert.equal(transparent.parent,root);
 const batch=root.children.find(o=>o.userData.staticVesselBatch);assert.equal(batch.material,material);assert.equal(batch.matrixAutoUpdate,false);
 material.color.setHex(0x334455);assert.equal(batch.material.color.getHex(),0x334455);
 root.position.x+=3;const moved=vertexCloud(root);for(const point of after)assert.ok(moved.some(p=>p.distanceTo(point.clone().add(new THREE.Vector3(3,0,0)))<2e-6),'Vessel parent movement was lost');
});
for(const entry of MARITIME_CATALOG)test(`${entry.id}: opaque parts batch while damage, smoke and lights still work`,()=>{
 const visual=createVesselVisual(THREE,entry);
 const stats=visual.root.userData.staticPartBatching;assert.ok(stats.savedDrawCalls>=4);
 const parts=visual.root.children,lights=parts.filter(o=>o.userData.vesselNavigationLight),panels=parts.filter(o=>o.userData.vesselDamagePanel),smoke=parts.filter(o=>o.userData.vesselDamageSmoke);
 assert.equal(lights.length,2);assert.equal(panels.length,2);assert.equal(smoke.length,4);
 assert.ok(parts.filter(o=>o.isMesh&&o.visible).length<=15);
 const count=triangles(visual.root);updateVesselVisual(visual,.05);
 assert.ok(panels.every(o=>o.visible));assert.ok(smoke.some(o=>o.visible));assert.ok(lights.every(o=>!o.visible));
 updateVesselVisual(visual,1);assert.ok(panels.every(o=>!o.visible));assert.ok(smoke.every(o=>!o.visible));assert.ok(lights.every(o=>o.visible));assert.equal(triangles(visual.root),count);
 let disposed=0;visual.root.traverse(o=>o.geometry?.addEventListener('dispose',()=>disposed++));visual.dispose();assert.ok(disposed>=parts.length);
});
