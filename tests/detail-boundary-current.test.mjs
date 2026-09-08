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
