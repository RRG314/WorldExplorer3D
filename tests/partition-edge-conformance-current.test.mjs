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
 const p=Float32Array.from([0,0,0,10,0,0,0,0,10,5,-.1,0,5,-.1,5,0,-.1,5]),triangle=[0,2,1],result=await conformPartitionEdges(p,[triangle]),pieces=result.replacements.get(triangle);
 assert.equal(pieces.length,4);assert.ok(pieces.every(t=>{const [a,b,c]=t.map(i=>i*3);return (p[b]-p[a])*(p[c+2]-p[a+2])-(p[b+2]-p[a+2])*(p[c]-p[a])<0;}));
 assert.deepEqual([...new Set(pieces.flat())].sort(),[0,1,2,3,4,5]);
 await assert.rejects(conformPartitionEdges(p,[triangle],{maximumTriangles:1}),/capacity/);
 await assert.rejects(conformPartitionEdges(p,[triangle],{pause:()=>{throw Error('superseded');}}),/superseded/);
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
