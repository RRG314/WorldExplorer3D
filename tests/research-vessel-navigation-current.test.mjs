import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createShipMeshNavigation} from '../app/js/boat-mode/research/mesh-navigation.js';

function actualModel(){
 const bytes=readFileSync('app/assets/models/marine/research-vessel/rcrv-walkable.glb'),length=bytes.readUInt32LE(12),data=JSON.parse(bytes.subarray(20,20+length)),bin=bytes.subarray(28+length),root=new THREE.Group();
 function accessor(id){
  const a=data.accessors[id],v=data.bufferViews[a.bufferView],size={SCALAR:1,VEC3:3}[a.type],types={5123:Uint16Array,5125:Uint32Array,5126:Float32Array},Type=types[a.componentType],result=new Type(a.count*size);
  const buffer=new DataView(bin.buffer,bin.byteOffset,bin.byteLength),offset=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||size*Type.BYTES_PER_ELEMENT;
  for(let i=0;i<a.count;i++)for(let j=0;j<size;j++){const pos=offset+i*stride+j*Type.BYTES_PER_ELEMENT;result[i*size+j]=a.componentType===5126?buffer.getFloat32(pos,true):a.componentType===5125?buffer.getUint32(pos,true):buffer.getUint16(pos,true);}
  return new THREE.BufferAttribute(result,size);
 }
 function visit(id,parent){const n=data.nodes[id],group=new THREE.Group();if(n.matrix)group.applyMatrix4(new THREE.Matrix4().fromArray(n.matrix));else{if(n.translation)group.position.fromArray(n.translation);if(n.rotation)group.quaternion.fromArray(n.rotation);if(n.scale)group.scale.fromArray(n.scale);}parent.add(group);
  if(n.mesh!=null)for(const p of data.meshes[n.mesh].primitives){const g=new THREE.BufferGeometry();g.setAttribute('position',accessor(p.attributes.POSITION));if(p.indices!=null)g.setIndex(accessor(p.indices));group.add(new THREE.Mesh(g,new THREE.MeshBasicMaterial()));}
  for(const child of n.children||[])visit(child,group);
 }
 for(const id of data.scenes[data.scene||0].nodes)visit(id,root);return root;
}
const root=actualModel(),nav=createShipMeshNavigation(THREE,root);
test('licensed hull is closed below water from the stern and both sides',()=>{
 root.updateMatrixWorld(true);
 for(const [origin,direction] of [[new THREE.Vector3(0,-1,-100),new THREE.Vector3(0,0,1)],[new THREE.Vector3(100,-1,0),new THREE.Vector3(-1,0,0)],[new THREE.Vector3(-100,-1,0),new THREE.Vector3(1,0,0)]]){
  const hits=new THREE.Raycaster(origin,direction).intersectObject(root,true);assert.ok(hits.length>0);assert.ok(hits[0].face.normal.dot(direction)<0,'Outward hull winding');
 }
});
test('actual licensed hull has a supported working deck and a real science-van doorway',()=>{
 let pose={x:6,y:nav.support(6,-29,2),z:-29};assert.ok(Number.isFinite(pose.y));
 for(let i=0;i<65;i++)pose=nav.move(pose,0,.1);
 assert.ok(pose.z>-24,JSON.stringify({pose,nextFloor:nav.support(pose.x,pose.z+.1,pose.y),blocked:nav.blocked(pose.x,pose.z+.1,.3,pose.y),feet:[[.2,0],[-.2,0],[0,.2],[0,-.2]].map(([x,z])=>nav.support(pose.x+x,pose.z+.1+z,pose.y))}));assert.ok(Math.abs(pose.y-1.95)<.2);
 const before={...pose};for(let i=0;i<30;i++)pose=nav.move(pose,.1,0);
 assert.ok(pose.x<7.6,'Van side wall is solid');assert.ok(pose.x>before.x,'Usable van width');
});
test('actual companionway can be climbed and descended without changing floors through a wall',()=>{
 for(const step of [.1,2.2/60,2.2/120]){
  let pose={x:-3.1,y:nav.support(-3.1,-23,2),z:-23};
  for(let i=0;i<Math.ceil(6/step);i++)pose=nav.move(pose,0,step);
  assert.ok(pose.z>-18.6&&pose.y>5.45,JSON.stringify(pose));
  for(let i=0;i<Math.ceil(7/step);i++)pose=nav.move(pose,0,-step);
  assert.ok(pose.z<-22&&pose.y<2.1,JSON.stringify(pose));
 }
});
test('ship edges, hull side and unbounded input cannot become walking support',()=>{
 let pose={x:0,y:nav.support(0,-34,2),z:-34};const initial={...pose};
 assert.deepEqual(nav.move(pose,Infinity,0),initial);assert.deepEqual(nav.move(pose,21,0),initial);
 for(let i=0;i<100;i++)pose=nav.move(pose,0,-.1);
 assert.ok(pose.z>new THREE.Box3().setFromObject(root).min.z+.15);assert.equal(nav.support(100,100,2),null);
 assert.ok(nav.stats.cells<500&&nav.stats.triangles<170000);
});
test('triangle queries follow the local ship frame and disposal rejects movement',()=>{
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(4,.2,4),new THREE.MeshBasicMaterial());mesh.position.y=2;const root=new THREE.Group();root.add(mesh);root.position.set(100,40,-70);root.rotation.y=.7;
 const local=createShipMeshNavigation(THREE,root);assert.ok(Math.abs(local.support(0,0,2)-2.1)<1e-5);
 local.dispose();assert.equal(local.support(0,0,2),null);assert.equal(local.blocked(0,0,.3,2),true);
});
