import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTransportFacilityVisuals} from '../app/js/transport/facility-visuals.js';
const record=(id,x,type='pier')=>({id,domain:'maritime',type,geometry:{kind:'path',points:[{x,z:0},{x,z:20}]}});
const graph=records=>({authority:'test',records,byDomain:{aviation:[],maritime:records}});
function triangles(root){
 root.updateMatrixWorld(true);const result=[];
 root.traverse(mesh=>{if(!mesh.isMesh)return;const g=mesh.geometry,p=g.attributes.position,index=g.index;
  for(let i=0;i<(index?.count||p.count);i++){
   const v=new THREE.Vector3().fromBufferAttribute(p,index?index.getX(i):i).applyMatrix4(mesh.matrixWorld);
   result.push(v.toArray().map(n=>Math.round(n*1e5)/1e5).join(','));
  }
 });return result.sort();
}
test('maritime batching preserves geometry, distant culling cells, records, and resource ownership',()=>{
 const records=[record('a',10),record('b',30),record('c',600),record('f',50,'ferry_route')];
 const options={sampleGround:(x,z)=>x*.002+z*.01};
 const singles=records.map(r=>createTransportFacilityVisuals(THREE,graph([r]),options));
 const expected=singles.flatMap(v=>triangles(v.group)).sort();
 const combined=createTransportFacilityVisuals(THREE,graph(records),options);
 assert.deepEqual(triangles(combined.group),expected);
 const cells=combined.group.children.filter(o=>o.userData.transportFacilityIds);
 assert.equal(cells.length,1);assert.deepEqual(cells[0].userData.transportFacilityIds,['a','b']);
 assert.equal(cells[0].children.length,1);
 assert.ok(combined.group.children.some(o=>o.userData.transportFacilityId==='c'));
 assert.ok(combined.group.children.some(o=>o.userData.transportFacilityId==='f'&&o.material.transparent));
 const geometries=new Set();combined.group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);});
 let disposed=0;for(const g of geometries)g.addEventListener('dispose',()=>disposed++);
 combined.dispose();assert.equal(disposed,geometries.size);
 singles.forEach(v=>v.dispose());
});
