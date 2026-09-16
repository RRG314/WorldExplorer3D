import test from 'node:test';
import assert from 'node:assert/strict';
import {rdtDepth,hashGeoToInt,seededRandom} from '../app/js/rdt.js';
import * as compatibility from '../app/js/procedural-random.js';
import {ctx} from '../app/js/shared-context.js?v=55';
import {RdtBuildingIndex,createRdtCaptureSelector} from '../app/js/reality-capture/rdt-building-index.js';
import {nearestCaptureBuildingIds} from '../app/js/reality-capture/nearby-buildings.js';
test('RDT core restored with shared identity, valid depth and bounded invalid input',()=>{
 assert.equal(compatibility.hashGeoToInt,hashGeoToInt);assert.equal(compatibility.seededRandom,seededRandom);
 for(const [n,d] of [[0,0],[1,0],[2,1],[4,2],[1260,5]])assert.equal(rdtDepth(n),d);
 for(const a of [0,-1,NaN,Infinity])assert.throws(()=>rdtDepth(100,a),RangeError);
 ctx.worldSeed=123;assert.equal(ctx.rdtSeed,123);ctx.rdtSeed=456;assert.equal(ctx.worldSeed,456);
 assert.equal(ctx.rdtNoiseEnabled,false);
});
test('RDT spatial lookup preserves complete nearest ID ordering on dense, clustered and degenerate sources',()=>{
 for(const kind of ['dense','cluster','line','point']){
  const b=Array.from({length:23000},(_,i)=>({sourceBuildingId:'b'+(i%17000),
   centerX:kind==='point'?1:kind==='cluster'?i%5:(i*7919)%13001-6500,
   centerZ:kind==='point'?1:kind==='line'?0:(i*3571)%11003-5500}));
  const index=new RdtBuildingIndex(b);
  for(const p of [{x:0,z:0},{x:-4000,z:2300},{x:10000,z:-23000},{x:1e9,z:-1e9}])
   assert.deepEqual(index.nearest(p),nearestCaptureBuildingIds(b,p),kind);
  index.dispose();assert.equal(index.root,null);assert.equal(index.points,null);
 }
});
test('retained index invalidates same-array edits, additions, world changes and clear',()=>{
 const select=createRdtCaptureSelector(),actor={x:0,z:0};
 const b=[{sourceBuildingId:'a',centerX:1,centerZ:0},{sourceBuildingId:'b',centerX:3,centerZ:0}];
 assert.equal(select.select(b,actor,1).stats.rebuilt,true);
 assert.equal(select.select(b,actor,1).stats.rebuilt,false);
 b[0].centerX=10;assert.deepEqual(select.select(b,actor,1).ids,['b','a']);
 b[0].sourceBuildingId='c';assert.deepEqual(select.select(b,actor,1).ids,['b','c']);
 b.push({sourceBuildingId:'d',pts:[{x:0,z:0}]});assert.deepEqual(select.select(b,actor,1).ids,['d','b','c']);
 b[2].pts[0].x=20;assert.deepEqual(select.select(b,actor,1).ids,['b','c','d']);
 assert.equal(select.select(b,actor,2).stats.rebuilt,true);
 select.clear();assert.equal(select.select(b,actor,2).stats.rebuilt,true);
 assert.deepEqual(select.select([],actor,3).ids,[]);
});
