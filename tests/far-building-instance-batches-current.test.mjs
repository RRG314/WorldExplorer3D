import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildFarBuildingInstanceBatches, partitionFarBuildingInstances } from '../app/js/terrain/far-building-instance-batches.js';
import {FarBuildingInstanceStorage} from '../app/js/terrain/far-building-instance-storage.js';

const buildings = [
  {x:-5000.123,z:-4096.75,baseY:-28.2,width:37,height:95,depth:12,rotationY:.83,color:[.2,.4,.6]},
  {x:5000.321,z:4096.75,baseY:300,width:100,height:900,depth:7,rotationY:-1.2,color:[.8,.5,.1]},
  {x:-5001,z:-4100,baseY:2,width:8000,height:30,depth:3,rotationY:.4,color:[.7,.8,.9]},
  {x:0,z:0,baseY:0,width:20,height:20,depth:20,rotationY:0,color:[1,1,1]}
];
function reference(material) {
  const geometry=new THREE.BoxGeometry(1,1,1);geometry.translate(0,.5,0);
  const mesh=new THREE.InstancedMesh(geometry,material,buildings.length);
  const matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0),color=new THREE.Color();
  buildings.forEach((b,i)=>{
    matrix.compose(new THREE.Vector3(b.x,b.baseY,b.z),rotation.setFromAxisAngle(up,b.rotationY),new THREE.Vector3(b.width,b.height,b.depth));
    mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,color.setRGB(...b.color));
  });
  return mesh;
}
function cleanup(meshes,material){meshes.forEach(m=>m.geometry.dispose());material.dispose();}

test('spatial building cells preserve coverage/colors and bound every rotated vertex in local coordinates',async()=>{
  assert.equal(THREE.REVISION,'128','Use the same Three revision as the shipped runtime');
  const material=new THREE.MeshBasicMaterial(),baseline=reference(material);
  const batches=await buildFarBuildingInstanceBatches(THREE,buildings,material);
  try{
    assert.equal(batches.reduce((n,m)=>n+m.count,0),buildings.length);
    assert.equal(batches.length,3);
    const byKey=partitionFarBuildingInstances(buildings),matrix=new THREE.Matrix4(),expected=new THREE.Matrix4(),point=new THREE.Vector3();
    for(const batch of batches){
      assert.equal(batch.frustumCulled,true);
      const ids=byKey.get(batch.userData.spatialBatchKey);
      for(let i=0;i<batch.count;i++){
        batch.getMatrixAt(i,matrix);baseline.getMatrixAt(ids[i],expected);
        const source=buildings[ids[i]];
        assert.ok(Math.abs(matrix.elements[12]+batch.position.x-source.x)<.00013);
        assert.ok(Math.abs(matrix.elements[14]+batch.position.z-source.z)<.00013);
        for(let n=0;n<16;n++)if(n!==12&&n!==14)assert.equal(matrix.elements[n],expected.elements[n]);
        assert.deepEqual([...batch.instanceColor.array.slice(i*3,i*3+3)],[...baseline.instanceColor.array.slice(ids[i]*3,ids[i]*3+3)]);
        const positions=batch.geometry.attributes.position;
        for(let j=0;j<positions.count;j++){
          point.fromBufferAttribute(positions,j).applyMatrix4(matrix);
          assert.equal(batch.geometry.boundingBox.containsPoint(point),true);
          assert.equal(batch.geometry.boundingSphere.containsPoint(point),true);
        }
      }
    }
    for(const batch of batches)batch.updateMatrixWorld(true);
    const camera=new THREE.PerspectiveCamera(60,1,.1,1000);camera.position.set(0,100,100);camera.lookAt(0,10,0);camera.updateMatrixWorld(true);
    const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    assert.equal(frustum.intersectsObject(batches.find(m=>m.userData.spatialBatchKey==='0:0')),true);
    assert.equal(frustum.intersectsObject(batches.find(m=>m.userData.spatialBatchKey==='2:2')),false);
  }finally{cleanup([baseline,...batches],material);}
});

test('batch raycasts match the former single draw, preserve source IDs and restore culling bounds',async()=>{
  const material=new THREE.MeshBasicMaterial(),baseline=reference(material),batches=await buildFarBuildingInstanceBatches(THREE,buildings,material);
  try{
    for(const translated of [false,true]){
      baseline.position.set(translated?31:0,translated?17:0,translated?-27:0);baseline.updateMatrixWorld(true);
      for(const mesh of batches){const [cx,cz]=mesh.userData.spatialBatchKey.split(':').map(Number);mesh.position.set(cx*2048+(translated?31:0),translated?17:0,cz*2048+(translated?-27:0));mesh.updateMatrixWorld(true);}
      for(const building of buildings){
        const ray=new THREE.Raycaster(new THREE.Vector3(building.x+(translated?31:0),2000,building.z+(translated?-27:0)),new THREE.Vector3(0,-1,0));
        const bounds=batches.map(m=>[m.geometry.boundingBox,m.geometry.boundingSphere]);
        const expected=ray.intersectObject(baseline),actual=ray.intersectObjects(batches);
        const normalize=hits=>hits.map(h=>({id:h.sourceInstanceId ?? h.instanceId,distance:Math.round(h.distance*1e7)/1e7})).sort((a,b)=>a.distance-b.distance||a.id-b.id);
        assert.ok(expected.length>0);
        assert.deepEqual(normalize(actual),normalize(expected));
        for(const hit of actual){
          const local=new THREE.Matrix4(),source=new THREE.Matrix4();
          hit.object.getMatrixAt(hit.instanceId,local);baseline.getMatrixAt(hit.sourceInstanceId,source);
          const world=new THREE.Matrix4().multiplyMatrices(hit.object.matrixWorld,local);
          const expectedWorld=new THREE.Matrix4().multiplyMatrices(baseline.matrixWorld,source);
          for(let n=0;n<16;n++)assert.ok(Math.abs(world.elements[n]-expectedWorld.elements[n])<.0003);
        }
        batches.forEach((m,i)=>{assert.equal(m.geometry.boundingBox,bounds[i][0]);assert.equal(m.geometry.boundingSphere,bounds[i][1]);});
      }
    }
  }finally{cleanup([baseline,...batches],material);}
});

test('interrupted cooperative building assembly releases its geometry and retains caller-owned material',async()=>{
  let created=0,disposed=0,materialDisposed=false,tick=0;
  class CountedGeometry extends THREE.BoxGeometry{constructor(...args){super(...args);created++;this.addEventListener('dispose',()=>disposed++);}}
  const material=new THREE.MeshBasicMaterial();material.addEventListener('dispose',()=>materialDisposed=true);
  try{
    await assert.rejects(buildFarBuildingInstanceBatches({...THREE,BoxGeometry:CountedGeometry},Array(12001).fill(buildings[0]),material,{now:()=>tick+=9,yieldControl:async()=>{throw new Error('cancelled');}}),/cancelled/);
    assert.equal(disposed,created);assert.ok(created>0);assert.equal(materialDisposed,false);
  }finally{material.dispose();}
});

test('packed city construction preserves every uploaded byte, bounds and raycast after its scratch buffer retires',async()=>{
  const material=new THREE.MeshBasicMaterial(),packed=new FarBuildingInstanceStorage(buildings.length);
  for(const b of buildings)packed.append(b.x,b.z,b.baseY,b.width,b.depth,b.height,b.rotationY,b.color);
  assert.equal(packed.data.byteLength,80*buildings.length);
  const ordinary=await buildFarBuildingInstanceBatches(THREE,buildings,material);
  const compact=await buildFarBuildingInstanceBatches(THREE,packed,material);
  try{
    assert.deepEqual(partitionFarBuildingInstances(packed),partitionFarBuildingInstances(buildings));
    packed.dispose();assert.equal(packed.data.byteLength,0);assert.equal(packed.length,0);
    for(let i=0;i<ordinary.length;i++){
      assert.deepEqual(compact[i].instanceMatrix.array,ordinary[i].instanceMatrix.array);
      assert.deepEqual(compact[i].instanceColor.array,ordinary[i].instanceColor.array);
      assert.deepEqual(compact[i].geometry.boundingBox,ordinary[i].geometry.boundingBox);
      assert.deepEqual(compact[i].geometry.boundingSphere,ordinary[i].geometry.boundingSphere);
    }
    const ray=new THREE.Raycaster(new THREE.Vector3(0,2000,0),new THREE.Vector3(0,-1,0));
    const normalized=meshes=>ray.intersectObjects(meshes).map(hit=>({id:hit.sourceInstanceId,point:hit.point.toArray(),distance:hit.distance}));
    assert.ok(normalized(compact).length>0);assert.deepEqual(normalized(compact),normalized(ordinary));
  }finally{for(const m of [...ordinary,...compact])m.dispose();cleanup([...ordinary,...compact],material);packed.dispose();}
});

test('packed scratch capacity is finite and retired storage cannot be reused',()=>{
  assert.throws(()=>new FarBuildingInstanceStorage(1200001),RangeError);
  const packed=new FarBuildingInstanceStorage(1),color=[.1,.2,.3];
  packed.append(1,2,3,4,5,6,.7,color);color[0]=1;
  const scratch={color:[0,0,0]};assert.equal(packed.read(0,scratch),scratch);assert.deepEqual(scratch.color,[.1,.2,.3]);
  assert.throws(()=>packed.append(1,2,3,4,5,6,.7,color),RangeError);
  assert.throws(()=>packed.read(1,scratch),RangeError);
  const allocation=packed.data.buffer;packed.dispose();packed.dispose();
  if(typeof allocation.transfer==='function')assert.equal(allocation.byteLength,0);
  assert.throws(()=>packed.read(0,scratch),RangeError);assert.throws(()=>packed.append(1,2,3,4,5,6,.7,color),RangeError);
});


test('cell transforms retain sub-millimetre placement at worldwide-scale positive and negative offsets',async()=>{
 const material=new THREE.MeshBasicMaterial();
 const source=[...buildings.map(b=>({...b,x:b.x+40000000.125,z:b.z-30000000.375})),
  ...buildings.map(b=>({...b,x:b.x-40000000.125,z:b.z+30000000.375}))];
 const batches=await buildFarBuildingInstanceBatches(THREE,source,material);
 try{
  const ids=partitionFarBuildingInstances(source),matrix=new THREE.Matrix4();
  for(const batch of batches){
   batch.updateMatrixWorld(true);
   const indices=ids.get(batch.userData.spatialBatchKey);
   for(let i=0;i<batch.count;i++){
    batch.getMatrixAt(i,matrix);const b=source[indices[i]];
    assert.ok(matrix.elements[12]>=0&&matrix.elements[12]<=2048);
    assert.ok(matrix.elements[14]>=0&&matrix.elements[14]<=2048);
    assert.ok(Math.abs(matrix.elements[12]+batch.position.x-b.x)<.00013);
    assert.ok(Math.abs(matrix.elements[14]+batch.position.z-b.z)<.00013);
   }
  }
  const ray=new THREE.Raycaster(new THREE.Vector3(source[3].x,2000,source[3].z),new THREE.Vector3(0,-1,0));
  assert.ok(ray.intersectObjects(batches).some(hit=>hit.sourceInstanceId===3));
 }finally{for(const batch of batches)batch.dispose();cleanup(batches,material);}
});
