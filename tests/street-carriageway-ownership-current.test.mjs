import test from 'node:test';
import assert from 'node:assert/strict';
import {createTerrainHeightSamplingApi} from '../app/js/terrain/height-sampling.js';
import {createStreetFrontageGrading} from '../app/js/terrain/street-frontage-grading.js';
const road=(z,y)=>({pts:[{x:0,z},{x:20,z}],width:4,type:'residential',tags:{sidewalk:'both'},surfaceBias:.18,structureSemantics:{terrainMode:'at_grade'},transportSurfaceModel:{distances:new Float32Array([0,20]),pathDistances:new Float32Array([0,20]),centerHeights:new Float32Array([y,y]),leftHeights:new Float32Array([y,y]),rightHeights:new Float32Array([y,y])}});
const buildings=[0,10].map(x=>({pts:[{x,z:-12},{x:x+10,z:-12},{x:x+10,z:-10},{x,z:-10}]}));
const sample=roads=>{
 const api=createTerrainHeightSamplingApi({appCtx:{structureTerrainCuts:roads,streetFrontageGrading:createStreetFrontageGrading(buildings,1)},elevationWorldYAtWorldXZ:()=>0});
 return z=>api.applyStructureTerrainCuts(10,z,0)+.18;
};
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
 const a=road(0,2),b=road(6,6),grading=createStreetFrontageGrading(buildings,1,[a,b]);
 assert.equal(grading.outerDistance(a,{segIndex:0,t:.5},10,-3,2),10);
 assert.equal(grading.outerDistance(b,{segIndex:0,t:.5},10,3,2),3.8);
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
