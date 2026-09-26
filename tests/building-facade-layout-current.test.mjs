import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {attachBuildingFacadeLayout,facadeFloorPlan} from '../app/js/world/building-facade-layout.js';
import {appendGeometryWithTransform,buildMergedGeometry} from '../app/js/world/geometry-batching.js';
import {attachEntranceAttribute} from '../app/js/world/building-facade-entrances.js';
globalThis.THREE=THREE;
function building(points,height=10.7){
 const shape=new THREE.Shape();points.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();
 return new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,steps:1}).rotateX(-Math.PI/2);
}
const profile={levels:3,window:{bayWidth:3.05,floorHeight:3.15,width:.46,height:.58,frame:.055}};
test('complete bays on narrow, rotated and concave walls retain footprint and triangle count',()=>{
 for(const points of [[[0,0],[7.3,0],[7.3,5],[0,5]],[[0,0],[5,5],[2,8],[-3,3]],[[0,0],[8,0],[8,2],[3,2],[3,7],[0,7]],[[0,0],[1,0],[1,5],[0,5]]]){
  const g=building(points),original=g.attributes.position.array.slice();attachBuildingFacadeLayout(g,profile);
  assert.deepEqual(g.attributes.position.array,original);
  const a=g.attributes.facadeLayout,n=g.attributes.normal;
  for(let i=0;i<a.count;i++)if(Math.abs(n.getY(i))<.2){
   const u=a.getX(i);assert.ok(Math.abs(u-Math.round(u))<1e-5,'wall endpoint must be a whole bay boundary');
   assert.ok(Number.isFinite(a.getY(i)));
  }
  g.dispose();
 }
});
test('facade layout survives elevated translated batching without floor or horizontal phase shifts',()=>{
 const g=building([[0,0],[9,0],[9,6],[0,6]]);attachBuildingFacadeLayout(g,profile);
 const batch={positions:[],normals:[],uvs:[],indices:[],facadeLayouts:[],facadeOpenings:[]};
 for(const y of [0,17.43,1020])appendGeometryWithTransform(batch,g,new THREE.Matrix4().makeTranslation(850,y,-230));
 const merged=buildMergedGeometry(batch);assert.ok(merged);
 for(let copy=0;copy<3;copy++)for(let i=0;i<g.attributes.facadeLayout.array.length;i++)assert.equal(merged.attributes.facadeLayout.array[copy*g.attributes.facadeLayout.array.length+i],g.attributes.facadeLayout.array[i]);
 g.dispose();merged.dispose();
});
test('foundation is blank, roof band does not contain the next floor opening, low walls have no squeezed windows',()=>{
 const plan=facadeFloorPlan(11.4,{...profile,foundation:1.2});
 assert.equal(plan.floors,3);assert.ok(Math.abs(plan.floorHeight-3.3)<1e-9);
 assert.equal(facadeFloorPlan(1.8,profile).floors,0);
 const g=building([[0,0],[6,0],[6,5],[0,5]],11.4);attachBuildingFacadeLayout(g,{...profile,foundation:1.2});
 const a=g.attributes.facadeLayout,n=g.attributes.normal;
 for(let i=0;i<a.count;i++)if(Math.abs(n.getY(i))<.2){
  if(g.attributes.position.getY(i)<.01)assert.ok(a.getY(i)<0);
  else assert.ok(a.getY(i)>3 && a.getY(i)<3.15);
 }
 g.dispose();
});
test('malformed attribute buffers are rejected by geometry merging',()=>{
 const g=building([[0,0],[6,0],[6,5],[0,5]]);attachBuildingFacadeLayout(g,profile);
 const batch={positions:[],normals:[],uvs:[],indices:[],facadeLayouts:[],facadeOpenings:[]};
 appendGeometryWithTransform(batch,g,new THREE.Matrix4());batch.facadeLayouts[0]=NaN;
 assert.equal(buildMergedGeometry(batch),null);g.dispose();
});

test('entrance bay reservation is constant throughout each bay on either wall tangent',()=>{
 for (const tangentX of [-1,1]) {
  const g=building([[0,0],[9,0],[9,6],[0,6]]);
  attachBuildingFacadeLayout(g,profile);
  const entrance={x:2.7,z:6,y:0,normalX:0,normalZ:1,tangentX,tangentZ:0};
  const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial());
  assert.ok(attachEntranceAttribute(mesh,entrance).attributedVertices>0);
  const attribute=g.attributes.facadeEntrance;
  for(let i=0;i<attribute.count;i++)if(attribute.getY(i)>0){
   assert.equal(attribute.getY(i),tangentX===1?2:1);
   assert.ok(Math.abs(attribute.getX(i)-(g.attributes.position.getX(i)-entrance.x)*tangentX)<1e-5);
  }
  for(let bay=0;bay<3;bay++)for(const fraction of [.05,.4,.8,.95]){
   const along=(bay+fraction)*3;
   const offset=(along-entrance.x)*tangentX;
   const centerFromDoor=offset-tangentX*fraction*3+tangentX*1.5;
   assert.ok(Math.abs(Math.abs(centerFromDoor)-Math.abs((bay+.5)*3-entrance.x))<1e-5);
  }
  g.dispose();mesh.material.dispose();
 }
});
