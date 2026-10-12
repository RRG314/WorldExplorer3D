import test from 'node:test';
import assert from 'node:assert/strict';
import {detailPointsOnEdge,detailHeightAt,triangleHeightAt} from '../app/js/terrain/detail-boundary.js';
test('far edge retains the intermediate cliff vertex instead of bridging across it',()=>{
 const lines=new Map([['x:0',[[{x:0,z:0,y:10},{x:0,z:5,y:100},{x:0,z:10,y:20}]]]]);
 const edge=detailPointsOnEdge(lines,{x:0,z:0},{x:0,z:10});
 assert.deepEqual(edge.map(p=>p.y),[10,100,20]);
 assert.equal(detailHeightAt(lines,'x',0,5),100);
 const center={x:5,z:5,y:30};
 const triangles=[[center,edge[0],edge[1]],[center,edge[1],edge[2]]];
 assert.equal(triangleHeightAt(0,5,triangles),100);
 assert.ok(Math.abs(triangleHeightAt(.001,5,triangles)-100)<.02);
 assert.equal(triangleHeightAt(20,20,triangles),null);
 assert.deepEqual(detailPointsOnEdge(lines,{x:0,z:10},{x:0,z:0}).map(p=>p.y),[20,100,10]);
});
test('unrelated or incompletely covered edges do not acquire an invented transition',()=>{
 const lines=new Map([['x:0',[[{x:0,z:0,y:10},{x:0,z:5,y:100}]]]]);
 assert.equal(detailPointsOnEdge(lines,{x:0,z:0},{x:0,z:10}).length,0);
 assert.equal(detailPointsOnEdge(lines,{x:1,z:0},{x:1,z:5}).length,0);
});

test('captured terrain boundaries keep independent output and recapture edited elevations',async()=>{
 const THREE=await import('three');const {collectDetailBoundaryLines}=await import('../app/js/terrain/detail-boundary.js');
 const geometry=new THREE.PlaneGeometry(10,10,2,2);geometry.rotateX(-Math.PI/2);
 const p=geometry.attributes.position;
 for(let i=0;i<p.count;i++)p.setY(i,Math.abs(p.getZ(i))<1?100:10+p.getZ(i));
 const mesh=new THREE.Mesh(geometry);mesh.userData.isTerrainMesh=true;
 const lines=collectDetailBoundaryLines([mesh]);
 const a={x:-5,z:-5},b={x:-5,z:5};
 assert.deepEqual(detailPointsOnEdge(lines,a,b).map(p=>p.y),[5,100,15]);
 const returned=detailPointsOnEdge(lines,b,a);returned[1].y=-999;
 assert.deepEqual(detailPointsOnEdge(lines,a,b).map(p=>p.y),[5,100,15]);
 for(let i=0;i<p.count;i++)p.setY(i,p.getY(i)+3);
 const refreshed=collectDetailBoundaryLines([mesh]);
 assert.deepEqual(detailPointsOnEdge(refreshed,a,b).map(p=>p.y),[8,103,18]);
 assert.deepEqual(detailPointsOnEdge(lines,a,b).map(p=>p.y),[5,100,15]);
 geometry.dispose();mesh.material.dispose();
});
