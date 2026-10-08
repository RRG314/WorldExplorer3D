import test from 'node:test';
import assert from 'node:assert/strict';
import {rdtDepth,hashGeoToInt,seededRandom} from '../app/js/rdt.js';
import * as compatibility from '../app/js/procedural-random.js';
import {ctx} from '../app/js/shared-context.js?v=55';
import {RdtBuildingIndex,createRdtCaptureSelector} from '../app/js/reality-capture/rdt-building-index.js';
import {buildingCenter,nearestCaptureBuildingIds} from '../app/js/reality-capture/nearby-buildings.js';
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

// Independent stable full-sort oracle also covers out-of-source-order visits.
const fullSortNearest=(buildings,actor,limit)=>[...new Set(buildings.filter(b=>b?.sourceBuildingId)
 .map(b=>({id:String(b.sourceBuildingId),center:buildingCenter(b)}))
 .sort((a,b)=>Math.hypot(a.center.x-actor.x,a.center.z-actor.z)-Math.hypot(b.center.x-actor.x,b.center.z-actor.z))
 .map(b=>b.id))].slice(0,limit);

test('best-first capture query preserves ties and duplicate identity across cell boundaries',()=>{
 let seed=91;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const buildings=Array.from({length:6400},(_,i)=>({sourceBuildingId:i%43===0?null:'id'+(i%1700),centerX:Math.floor(random()*120)*20-1200,centerZ:Math.floor(random()*120)*20-1200}));
 buildings[0]={sourceBuildingId:'tie-first',centerX:-250,centerZ:0};
 buildings[1]={sourceBuildingId:'tie-second',centerX:250,centerZ:0};
 buildings[6399]={sourceBuildingId:'tie-first',centerX:250,centerZ:0};
 const index=new RdtBuildingIndex(buildings);
 for(const actor of [{x:0,z:0},{x:1e9,z:-1e9},...Array.from({length:24},()=>({x:(random()-.5)*8000,z:(random()-.5)*8000}))]){
  for(const limit of [1,2,60,300,2000])assert.deepEqual(index.nearest(actor,limit),fullSortNearest(buildings,actor,limit));
 }
 index.dispose();
});

test('far flight visits only nearby leaf candidates instead of repeatedly scanning the city',()=>{
 const buildings=Array.from({length:25600},(_,i)=>({sourceBuildingId:'b'+i,centerX:(i%160)*20,centerZ:Math.floor(i/160)*20}));
 const index=new RdtBuildingIndex(buildings);
 for(const actor of [{x:7000,z:8000},{x:1e9,z:-1e9},{x:-15000,z:2000}]){
  assert.deepEqual(index.nearest(actor),fullSortNearest(buildings,actor,60));
  assert.ok(index.lastCandidates<buildings.length/10,`Unexpected full-region work: ${index.lastCandidates}`);
 }
 index.dispose();
});
