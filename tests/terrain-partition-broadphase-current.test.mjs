import test from 'node:test';
import assert from 'node:assert/strict';
import {triangleMayOverlapCell} from '../app/js/world/pavement-terrain-partition.js';
import {projectDecalTriangle} from '../app/js/terrain/surface-decal-projection.js';
test('cell rejection never discards clipped terrain support for diagonal, reversed or near-edge triangles',()=>{
 const p=new Float32Array([0,0,0,1,0,0,0,0,1,1,0,1]);
 const supports=[{positions:p,a:0,b:6,c:3,denominator:-1},{positions:p,a:3,b:6,c:9,denominator:-1}];
 let seed=314159,rejected=0;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
 const triangles=Array.from({length:3000},()=>Array.from({length:3},()=>({x:random()*8-4,z:random()*8-4})));
 triangles.push([{x:0,z:-1e-12},{x:1,z:-1e-12},{x:0,z:1e-12}]);
 for(const points of triangles){
  const clipped=projectDecalTriangle(points,supports,0);
  if(!triangleMayOverlapCell(points,0,1,0,1)){rejected++;assert.equal(clipped.length,0,JSON.stringify(points));}
  if(clipped.length)assert.equal(triangleMayOverlapCell([...points].reverse(),0,1,0,1),true);
 }
 assert.ok(rejected>500);
});
