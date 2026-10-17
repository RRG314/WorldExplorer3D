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


test('borrowed clipping storage grows once and never publishes stale vertices after shorter or empty clips',()=>{
 const p=new Float32Array([0,0,0,1,2,0,0,-1,1,1,1,1]);
 const pair=[{positions:p,a:0,b:6,c:3,denominator:-1},{positions:p,a:3,b:6,c:9,denominator:-1}];
 const supports=Array.from({length:200},()=>pair).flat(),points=[{x:0,z:0},{x:0,z:1},{x:1,z:0}];
 const workspace={output:new Float64Array(0),poly:[],next:[]};
 const expected=projectDecalTriangle(points,supports,.012),saved=expected.slice();
 const large=projectDecalTriangle(points,supports,.012,workspace);
 assert.ok(large instanceof Float64Array);assert.deepEqual(Array.from(large),expected);
 const storage=large.buffer;
 assert.equal(projectDecalTriangle(points,[],.012,workspace).length,0);
 const small=projectDecalTriangle(points,pair,.012,workspace);
 assert.equal(small.buffer,storage);assert.deepEqual(Array.from(small),projectDecalTriangle(points,pair,.012));
 assert.deepEqual(expected,saved,'standalone results retain independent storage');
 const other=projectDecalTriangle(points,pair,.012,{output:[],poly:[],next:[]});
 assert.notEqual(other.buffer,storage);
});
