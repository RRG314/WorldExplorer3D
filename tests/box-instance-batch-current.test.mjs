import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createBoxInstanceBatch} from '../app/js/world/box-instance-batch.js';
import {appendGeometryWithTransform,buildMergedGeometry} from '../app/js/world/geometry-batching.js';
globalThis.THREE=THREE;

test('chunked instances preserve transformed box positions, normals, UVs and index order across chunk boundaries',()=>{
 const unit=new THREE.BoxGeometry(1,1,1),material=new THREE.MeshStandardMaterial(),instances=createBoxInstanceBatch();
 const merged={positions:[],normals:[],uvs:[],indices:[]},matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),axis=new THREE.Vector3(0,1,0);
 assert.equal(instances.build(unit,material),null);
 for(let i=0;i<1031;i++){
  matrix.compose(new THREE.Vector3(i*.03-100, i%8,Math.sin(i)*60),q.setFromAxisAngle(axis,i*.117),new THREE.Vector3(.07+(i%13),.1+(i%9),.06+(i%4)));
  assert.equal(instances.append(matrix),true);appendGeometryWithTransform(merged,unit,matrix);
 }
 const invalid=matrix.clone();invalid.elements[12]=NaN;assert.equal(instances.append(invalid),false);
 const mesh=instances.build(unit,material),expected=buildMergedGeometry(merged),point=new THREE.Vector3(),normal=new THREE.Vector3(),normalMatrix=new THREE.Matrix3();
 assert.equal(mesh.count,1031);assert.equal(mesh.geometry,unit);assert.equal(mesh.frustumCulled,false);
 for(let i=0;i<mesh.count;i++){
  mesh.getMatrixAt(i,matrix);normalMatrix.getNormalMatrix(matrix);
  for(let v=0;v<24;v++){
   const offset=i*24+v;point.fromBufferAttribute(unit.attributes.position,v).applyMatrix4(matrix);
   normal.fromBufferAttribute(unit.attributes.normal,v).applyMatrix3(normalMatrix).normalize();
   for(const [k,axis] of ['x','y','z'].entries()){
    assert.ok(Math.abs(point[axis]-expected.attributes.position.array[offset*3+k])<.00002);
    assert.ok(Math.abs(normal[axis]-expected.attributes.normal.array[offset*3+k])<.000001);
   }
   assert.equal(unit.attributes.uv.getX(v),expected.attributes.uv.getX(offset));assert.equal(unit.attributes.uv.getY(v),expected.attributes.uv.getY(offset));
  }
  for(let index=0;index<36;index++)assert.equal(expected.index.array[i*36+index],unit.index.array[index]+i*24);
 }
 const oldMesh=new THREE.Mesh(expected,material),ray=new THREE.Raycaster();
 for(let i=0;i<20;i++){
  mesh.getMatrixAt(i,matrix);const center=new THREE.Vector3().setFromMatrixPosition(matrix);ray.set(center.clone().add(new THREE.Vector3(0,30,0)),new THREE.Vector3(0,-1,0));
  // A ray on a triangulation seam may report either triangle or both.
  // Compare every distinct surface hit rather than duplicate face entries.
  const surfaces=hits=>hits.map(hit=>hit.distance).filter((distance,index,all)=>index===0||Math.abs(distance-all[index-1])>.0001);
  const a=surfaces(ray.intersectObject(mesh)),b=surfaces(ray.intersectObject(oldMesh));assert.equal(a.length,b.length);a.forEach((distance,index)=>assert.ok(Math.abs(distance-b[index])<.0001));
 }
 assert.ok(mesh.instanceMatrix.array.byteLength<expected.attributes.position.array.byteLength/4);
 mesh.dispose();unit.dispose();material.dispose();expected.dispose();
});
