import test from 'node:test';
import assert from 'node:assert/strict';
import {createTerrainHeightSamplingApi} from '../app/js/terrain/height-sampling.js';
import {createStreetFrontageGrading} from '../app/js/terrain/street-frontage-grading.js';
import {compileEngineeredApproachExcavation} from '../app/js/world/compiler/engineered-approach-excavation.js';
import {terrainHeightWithPortalCuts} from '../app/js/terrain/structure-terrain-portals.js';
const road=(z,y)=>({pts:[{x:0,z},{x:20,z}],width:4,type:'residential',tags:{sidewalk:'both'},surfaceBias:.18,structureSemantics:{terrainMode:'at_grade'},transportSurfaceModel:{distances:new Float32Array([0,20]),pathDistances:new Float32Array([0,20]),centerHeights:new Float32Array([y,y]),leftHeights:new Float32Array([y,y]),rightHeights:new Float32Array([y,y])}});
const buildings=[0,10].map(x=>({pts:[{x,z:-12},{x:x+10,z:-12},{x:x+10,z:-10},{x,z:-10}]}));
const sample=roads=>{
 const api=createTerrainHeightSamplingApi({appCtx:{structureTerrainCuts:roads,streetFrontageGrading:createStreetFrontageGrading(buildings,1)},elevationWorldYAtWorldXZ:()=>0});
 return z=>api.applyStructureTerrainCuts(10,z,0)+.18;
};

test('a depressed engineered approach excavates its own lane without dragging down neighboring streets',()=>{
 const approach=road(0,2),street=road(4,10.18);
 approach.transportSurfaceModel.engineeredApproach=true;
 for(const roads of [[approach,street],[street,approach]]){
  const api=createTerrainHeightSamplingApi({appCtx:{structureTerrainCuts:roads},elevationWorldYAtWorldXZ:()=>10});
  const ground=(x,z)=>api.applyStructureTerrainCuts(x,z,10);
  for(let z=-6;z<=8;z+=.25)assert.ok(Math.abs(ground(10,z)-10)<1e-6,'cut must not smear into the terrain grid');
  const excavation=compileEngineeredApproachExcavation(approach,ground);
  assert.ok(excavation?.walls.length>0);
  assert.ok(Math.abs(terrainHeightWithPortalCuts(excavation.masks,10,0,ground(10,0))-2)<.02);
  assert.equal(terrainHeightWithPortalCuts(excavation.masks,10,4,ground(10,4)),ground(10,4));
 }
});

test('engineered approach fill still supports the road above natural ground',()=>{
 const approach=road(0,6);approach.transportSurfaceModel.engineeredApproach=true;
 const api=createTerrainHeightSamplingApi({appCtx:{structureTerrainCuts:[approach]},elevationWorldYAtWorldXZ:()=>2});
 assert.ok(Math.abs(api.applyStructureTerrainCuts(10,0,2)-5.82)<1e-6);
 assert.equal(api.applyStructureTerrainCuts(10,10,2),2);
});
test('neighboring frontage cannot lift or lower either disjoint carriageway',()=>{
 const a=road(0,2),b=road(6,6),height=sample([a,b]);
 for(let z=-2;z<=2;z+=.25)assert.ok(Math.abs(height(z)-2)<1e-6);
 for(let z=4;z<=8;z+=.25)assert.ok(Math.abs(height(z)-6)<1e-6);
});
test('outside owned carriageways the ground joins both edges continuously and monotonically',()=>{
 const height=sample([road(0,2),road(6,6)]);
 assert.ok(Math.abs(height(2.00001)-height(2))<1e-6);
 assert.ok(Math.abs(height(3.99999)-height(4))<1e-6);
 let previous=height(2);
 for(let z=2.01;z<4;z+=.01){const next=height(z);assert.ok(next>=previous-1e-9);assert.ok(next>=2&&next<=6);previous=next;}
});
test('carriageway ownership is independent of source ordering',()=>{
 const a=road(0,2),b=road(6,6),forward=sample([a,b]),reverse=sample([b,a]);
 for(let z=-2;z<=8;z+=.1)assert.ok(Math.abs(forward(z)-reverse(z))<1e-9);
});
test('frontage visibility stops at an intervening carriageway',()=>{
 // Keep both sightlines inside the bounded frontage search. Otherwise the
 // reach limit alone can make this pass even with occlusion disabled.
 const a=road(0,2),b=road(4,6),nearby=buildings.map(b=>({pts:b.pts.map(p=>({...p,z:p.z+20}))}));
 const grading=createStreetFrontageGrading(nearby,1,[a,b]);
 assert.equal(grading.outerDistance(a,{segIndex:0,t:.5},10,3,2),3.8);
 assert.equal(grading.outerDistance(b,{segIndex:0,t:.5},10,7,2),4);
 grading.dispose();
});

test('entering an overlapping junction footprint cannot suddenly switch to an equal-height average',()=>{
 const a=road(0,2);a.pts=[{x:-20,z:0},{x:20,z:0}];
 a.transportSurfaceModel={distances:new Float32Array([0,40]),pathDistances:new Float32Array([0,40]),centerHeights:new Float32Array([0,4]),leftHeights:new Float32Array([0,4]),rightHeights:new Float32Array([0,4])};
 const b=road(0,2);b.pts=[{x:0,z:-20},{x:0,z:20}];
 b.transportSurfaceModel={distances:new Float32Array([0,40]),pathDistances:new Float32Array([0,40]),centerHeights:new Float32Array([0,4]),leftHeights:new Float32Array([0,4]),rightHeights:new Float32Array([0,4])};
 const api=createTerrainHeightSamplingApi({appCtx:{structureTerrainCuts:[a,b]},elevationWorldYAtWorldXZ:()=>0});
 const left=api.applyStructureTerrainCuts(1.99999,1,0),right=api.applyStructureTerrainCuts(2.00001,1,0);
 assert.ok(Math.abs(left-right)<1e-4,`junction boundary step ${Math.abs(left-right)}`);
});

test('terrain ownership accumulation matches the original ordered sample reduction exactly',()=>{
 // Independent reference retains the original array-and-filter reduction.
 const roads=Array.from({length:9},(_,i)=>road(i*2-8,(i%3)*1.25));
 const api=createTerrainHeightSamplingApi({appCtx:{structureTerrainCuts:roads},elevationWorldYAtWorldXZ:()=>0});
 for(let z=-16;z<=16;z+=.03125){
  const samples=[];
  for(const r of roads){
   const distance=Math.abs(z-r.pts[0].z),edge=2,blend=3.5;
   if(distance>edge+blend)continue;
   const t=Math.max(0,Math.min(1,(distance-edge)/blend));
   samples.push({target:r.transportSurfaceModel.centerHeights[0]-.18,weight:distance<=edge?1:1-t*t*(3-2*t),edgeDistance:Math.max(0,distance-edge),penetration:Math.max(0,edge-distance)});
  }
  const owned=samples.filter(s=>s.edgeDistance===0);let y=0,w=0,strongest=0;
  for(const s of owned.length?owned:samples){const weight=owned.length?Math.max(1e-12,s.penetration**2):s.weight**4/s.edgeDistance**2;y+=s.target*weight;w+=weight;strongest=Math.max(strongest,s.weight);}
  assert.equal(api.applyStructureTerrainCuts(10,z,0),w>0?y/w*strongest:0);
 }
});

test('sparse overview retains exact pavement and non-sidewalk road context without empty-cell allocation',async()=>{
 const {prepareStreetPavement,compilePavementTile,pavementTileHasWork}=await import('../app/js/world/compiler/street-pavement.js');
 const withoutSidewalk=road(0,0);withoutSidewalk.pts=[{x:-2000,z:0},{x:2000,z:0}];withoutSidewalk.tags={sidewalk:'no'};
 const withSidewalk=road(0,0);withSidewalk.pts=[{x:0,z:-100},{x:0,z:100}];
 const input={roads:[withoutSidewalk,withSidewalk],buildings,metersPerWorldUnit:1};
 const original=prepareStreetPavement(input),expected=original.tiles.filter(t=>pavementTileHasWork(t,false));
 const sparse=prepareStreetPavement({...input,sparseOverview:true});
 assert.equal(sparse.sourceCellCount,original.tiles.length);
 assert.deepEqual(sparse.tiles.map(t=>t.key),expected.map(t=>t.key));assert.ok(sparse.tiles.length<original.tiles.length/3);
 for(let i=0;i<expected.length;i++){
  for(const kind of ['segments','joins','paths','crossings','obstacles','areas','edges','frontageBarriers'])assert.deepEqual(sparse.tiles[i][kind],expected[i][kind]);
  assert.deepEqual(compilePavementTile(sparse.tiles[i],1,{includeMarkings:false}),compilePavementTile(expected[i],1,{includeMarkings:false}));
 }
});
