import test from 'node:test';import assert from 'node:assert/strict';
import {conformPartitionEdges} from '../app/js/terrain/partition-edge-conformance.js';
import {createRoadContactIndex} from '../app/js/terrain/road-contact-index.js';
import fs from 'node:fs/promises';
import {createDaytonaPavementSection} from './fixtures/daytona-pavement-section.js';
test('a partition vertex splits both neighbours using its existing height and exact Float32 coordinates',async()=>{
 // Retained native knee witness: one neighbour omitted the vertex at index 4.
 const p=Float32Array.from([721.4190673828125,8.257990837097168,-468.1919250488281,721.4971313476562,8.512979507446289,-469.34771728515625,721.1227416992188,8.280829429626465,-469.2420959472656,721.0664672851562,8.252087593078613,-468.5445556640625,721.293212890625,8.2584810256958,-468.637939453125]),triangles=[[0,1,2],[3,0,4]],before=p.slice(),result=await conformPartitionEdges(p,triangles);
 assert.equal(result.conformedTriangles,1);assert.equal(result.insertedEdgeVertices,1);assert.deepEqual(p,before);assert.ok(result.replacements.get(triangles[0]).every(t=>t.includes(4)));assert.equal(result.replacements.has(triangles[1]),false);
 const indices=Uint32Array.from(triangles.flatMap(t=>(result.replacements.get(t)||[t]).flat())),index=createRoadContactIndex([{geometry:{attributes:{position:{array:p}},getIndex:()=>({array:indices})},userData:{terrainMode:'at_grade'}}]);
 try{const y=index.sampleAt(p[12],p[14]);assert.ok(Math.abs(y-p[13])<.000001,'the split bank and apron reference the same original published vertex');}finally{index.dispose();}
});
test('conforming all three edges preserves winding, bounds, cancellation and construction capacity',async()=>{
 const p=Float32Array.from([0,0,0,10,0,0,0,0,10,5,-.1,0,5,-.1,5,0,-.1,5,5,0,-5,10,0,10,-5,0,5]),triangle=[0,2,1],result=await conformPartitionEdges(p,[triangle,[0,3,6],[1,7,4],[0,8,5]]),pieces=result.replacements.get(triangle);
 assert.equal(pieces.length,4);assert.ok(pieces.every(t=>{const [a,b,c]=t.map(i=>i*3);return (p[b]-p[a])*(p[c+2]-p[a+2])-(p[b+2]-p[a+2])*(p[c]-p[a])<0;}));
 assert.deepEqual([...new Set(pieces.flat())].sort(),[0,1,2,3,4,5]);
 await assert.rejects(conformPartitionEdges(p,[triangle,[0,3,6],[1,7,4],[0,8,5]],{maximumTriangles:1}),/capacity/);
 await assert.rejects(conformPartitionEdges(p,[triangle],{pause:()=>{throw Error('superseded');}}),/superseded/);
});
test('a thin Float32 triangle does not insert its own opposite corner into an edge or duplicate its surface',async()=>{
 const p=Float32Array.from([0,0,0,10,0,0,5,0,.000001]),triangle=[0,1,2],result=await conformPartitionEdges(p,[triangle]);
 assert.equal(result.conformedTriangles,0);assert.equal(result.replacements.has(triangle),false);
});
test('retained native clustered cuts share an existing precision-equivalent vertex, without changing input coordinates or heights',async()=>{
 const p=Float32Array.from([118.97595977783203,0,-491.6759338378906,119.73458862304688,0,-491.7931823730469,119.73468780517578,0,-491.7932434082031,119.7347412109375,0,-491.79327392578125,119.73466491699219,0,-491.793212890625]),before=p.slice(),triangles=[[0,1,3],[0,2,4]],r=await conformPartitionEdges(p,triangles);
 assert.deepEqual(p,before);assert.equal(r.mergedVertices,1);assert.equal(r.collapsedTriangles,1);assert.ok(r.replacements.get(triangles[0]).every(t=>new Set(t).size===3));
 const unused=await conformPartitionEdges(p,[triangles[0]]);assert.equal(unused.conformedTriangles,0,'unused cuts from discarded or detailed-hole faces cannot split a surface');
 const bad=Float32Array.from([0,0,0,1,0,0,0,0,1,.000001,.01,0]);
 await assert.rejects(conformPartitionEdges(bad,[[0,1,2],[3,1,2]]),/vertex_mismatch/,'conflicting heights cannot be hidden by a coordinate weld');
});
test('the retained native rounded knee cut splits the bank face instead of adding a steep microscopic ear',async()=>{
 const p=Float32Array.from([532.7886962890625,8.065505027770996,-638.8687744140625,531.8768310546875,8.449684143066406,-639.7806396484375,531.3724975585938,8.074186325073242,-639.2554321289062,531.7565307617188,8.065435409545898,-639.1505737304688,531.660400390625,8.052347183227539,-638.6586303710938,531.3685913085938,8.065422058105469,-639.2413330078125]),triangles=[[0,1,2],[4,0,3],[5,4,3]],r=await conformPartitionEdges(p,triangles),bank=r.replacements.get(triangles[0]);
 assert.ok(bank.length>1);assert.ok(bank.every(t=>t.includes(3)),'every replacement bank triangle must reference the inserted knee, with no original face bypass');
 const index=createRoadContactIndex([{geometry:{attributes:{position:{array:p}},getIndex:()=>({array:Uint32Array.from(triangles.flatMap(t=>(r.replacements.get(t)||[t]).flat()))})},userData:{terrainMode:'at_grade'}}]);
 try{assert.ok(Math.abs(index.sampleAt(p[9],p[11])-p[10])<.000001,'both sides retain the same knee height');}finally{index.dispose();}
});
test('both retained native knee failures are continuous through actual terrain and pavement publication',async()=>{
 const fetchImpl=async url=>({ok:true,text:()=>fs.readFile(new URL('..'+url,import.meta.url),'utf8')});
 for(const config of [{sourceFeatureId:'osm:way:352070316',windowOrigin:{x:640,z:-512},windowSize:128,tileKeys:['5:-4'],segment:16,offset:6.040334},{sourceFeatureId:'osm:way:352067004',windowOrigin:{x:-384,z:384},tileKeys:['-2:4'],segment:19,offset:6.012592}]){
  const f=await createDaytonaPavementSection({...config,fetchImpl}),r=f.road,a=r.pts[config.segment],b=r.pts[config.segment+1],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),index=createRoadContactIndex(f.batches.map(b=>({geometry:{attributes:{position:{array:b.positions}},getIndex:()=>({array:b.indices})},userData:{terrainMode:'at_grade'}})));
  assert.ok(f.refinementStats.conformedTriangles>0);assert.ok(f.refinementStats.insertedEdgeVertices>0);
  try{const heights=[];for(let i=-10;i<=10;i++){
   const offset=config.offset+i*.000001,x=a.x+dz/length*offset/1.11,z=a.z-dx/length*offset/1.11,y=index.nearestSurfaceAt(x,z,.0001,'at_grade')?.y;
   assert.ok(Number.isFinite(y),`${config.sourceFeatureId}: retained knee must have actual published support`);heights.push(y);
  }assert.ok(Math.max(...heights)-Math.min(...heights)<.0001,`${config.sourceFeatureId}: published contact must be continuous across the retained failed knee`);
  }finally{index.dispose();}
 }
});
test('full native XZ pavement partitioning remains bounded on different detailed-grid phases, with zero topology-only heights',async()=>{
 const fetchImpl=async url=>({ok:true,text:()=>fs.readFile(new URL('..'+url,import.meta.url),'utf8')});
 for(const phase of [0,.5]){
  const f=await createDaytonaPavementSection({fetchImpl,windowOrigin:{x:-392+phase,z:-704+phase},windowSize:1184-2*phase,windowHeight:1392-2*phase,terrainSegments:64,terrainOnly:true,topologyOnly:true});
  assert.equal(f.refinementStats.sourceSegments,127);assert.ok(f.refinementStats.conformedTriangles>0);assert.ok(f.refinementStats.vertices<196608);assert.ok(f.refinementStats.triangles<196608*4);
  assert.ok(f.terrain.positions.every(Number.isFinite));
 }
});
