import test from 'node:test';import assert from 'node:assert/strict';
import {createRoadBoundaryPartition,reviewedRoadBoundaryPartition} from '../app/js/terrain/road-boundary-triangulation.js';
import {createTerrainHeightSamplingApi} from '../app/js/terrain/height-sampling.js';
import {prepareReviewedDetailedTerrainMesh} from '../app/js/terrain/reviewed-detailed-refinement.js';
import {createRoadContactIndex} from '../app/js/terrain/road-contact-index.js';
const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a.x*b.z-a.z*b.x;},0)/2);
const road=(pts,width=12)=>({pts,width,structureSemantics:{terrainMode:'at_grade'}});
test('terrain triangles split at the existing pavement edge without losing area or extending road height into the outside ground',()=>{
 const r=road([{x:1750,z:-1420},{x:1750,z:-1380}]),partition=createRoadBoundaryPartition([r]),input=[{x:1754,z:-1402},{x:1758,z:-1402},{x:1758,z:-1398}],out=partition(input);
 assert.ok(out.length>1);assert.ok(Math.abs(out.reduce((s,p)=>s+area(p),0)-area(input))<1e-7);
 assert.ok(out.flat().some(p=>Math.abs(p.x-1756)<1e-9));
 for(const t of out){assert.ok(t.every(p=>p.x<=1756+1e-9)||t.every(p=>p.x>=1756-1e-9),'a published terrain triangle cannot straddle the fitted-road and native-ground boundary');}
 const before=JSON.stringify(r);partition(input);assert.equal(JSON.stringify(r),before);
});
test('turns and overlapping carriageways retain one complete terrain partition across compiler cell boundaries',()=>{
 const roads=[road([{x:120,z:120},{x:128,z:128},{x:138,z:132}]),road([{x:125,z:120},{x:125,z:140}],5)],partition=createRoadBoundaryPartition(roads);
 for(const input of [[{x:122,z:122},{x:132,z:122},{x:132,z:132}],[{x:122,z:122},{x:132,z:132},{x:122,z:132}]]){
  const out=partition(input);assert.ok(Math.abs(out.reduce((s,p)=>s+area(p),0)-area(input))<1e-7);assert.ok(out.flat().every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)));
 }
 const far=[{x:500,z:500},{x:510,z:500},{x:500,z:510}];assert.equal(partition(far)[0],far,'unaffected geometry retains its original triangle');
});
function bankFixture(){
 const x=1750,z=-1400,native=(px,pz)=>500+.6*Math.max(-6,Math.min(6,px-x)),r=road([{x,z:z-20},{x,z:z+20}]),venue={sourceFeatureIds:['track']},evidence={sourceFeatureId:'track',surfaceModel:'banked-road-v1',venueSource:venue,terrainEdgePolicy:'fitted-pavement-boundary-v1'};
 Object.assign(r,{sourceFeatureId:'track',sourceNodeIds:[1,2],surfaceBias:.08,metersPerWorldUnit:1,surfaceSurveyEvidence:evidence,transportSurfaceModel:{width:12,reviewedSurfacePhase:'accepted',surveyedSurface:{...evidence},distances:[0,40],pathDistances:[0,40],centerHeights:[500.08,500.08],leftHeights:[496.48,496.48],rightHeights:[503.68,503.68]}});
 for(const key of ['distances','pathDistances','centerHeights','leftHeights','rightHeights'])r.transportSurfaceModel[key]=Float64Array.from(r.transportSurfaceModel[key]);
 const appCtx={structureTerrainCuts:[r]},grade=createTerrainHeightSamplingApi({appCtx,elevationWorldYAtWorldXZ:native});
 const n=4,p=[];for(let row=0;row<=n;row++)for(let column=0;column<=n;column++){const px=x-11+column*5.5,pz=z-11+row*5.5;p.push(px,native(px,pz),pz);}
 const mesh={position:{x:0,y:0,z:0},geometry:{parameters:{widthSegments:n},attributes:{position:{array:Float32Array.from(p),count:p.length/3}}}};
 return {x,z,native,r,venue,grade,mesh};
}
test('the native bank and apron remain outside the fitted pavement without an extrapolated shoulder mound',()=>{
 const f=bankFixture(),px=f.x+10,expected=f.native(px,f.z);
 assert.ok(Math.abs(f.grade.applyStructureTerrainCuts(px,f.z,expected)-expected)<1e-8);
 delete f.r.surfaceSurveyEvidence.terrainEdgePolicy;delete f.r.transportSurfaceModel.surveyedSurface.terrainEdgePolicy;
 assert.ok(f.grade.applyStructureTerrainCuts(px,f.z,expected)>expected+1,'the retained legacy full-cell extension reproduces the source of the false outer mound');
});
test('the actual detailed terrain compiler keeps the fitted bank through its edge and the native apron beyond it',{timeout:30000},async()=>{
 const f=bankFixture(),segments=[{a:f.r.pts[0],b:f.r.pts[1],innerRadius:14,outerRadius:46}],indices=[];
 for(const partitionTriangle of [null,createRoadBoundaryPartition([f.r],f.venue)]){
  const staged=await prepareReviewedDetailedTerrainMesh(f.mesh,{segments,sampleGround:f.native,gradeGround:f.grade.applyStructureTerrainCuts,partitionTriangle}),geometry={attributes:{position:{array:staged.positions}},getIndex:()=>({array:staged.indices})};
  indices.push(createRoadContactIndex([{geometry,userData:{terrainMode:'at_grade'}}]));
 }
 try{
  assert.ok(Math.abs(indices[0].sampleAt(f.x+5.9,f.z)-f.native(f.x+5.9,f.z))>.05,'the unpartitioned native triangle reproduces the bank-edge distortion');
  for(let offset=4.5;offset<=10;offset+=.025){const y=indices[1].sampleAt(f.x+offset,f.z);assert.ok(Number.isFinite(y));assert.ok(Math.abs(y-f.native(f.x+offset,f.z))<.0001,'the same published terrain fits the bank and native apron on either side of the exact edge');}
 }finally{for(const index of indices)index.dispose();}
});
test('only the matching privately accepted source group can request constrained terrain boundaries',()=>{
 const f=bankFixture(),context={roads:[f.r],worldLoadRuntimeState:{venuePack:{venueSource:f.venue,terrainEdgePolicy:'fitted-pavement-boundary-v1'}}};assert.equal(typeof reviewedRoadBoundaryPartition(context),'function');
 assert.equal(reviewedRoadBoundaryPartition({...context,worldLoadRuntimeState:{venuePack:{}}}),null);
 f.r.transportSurfaceModel.reviewedSurfacePhase='preparation';assert.throws(()=>reviewedRoadBoundaryPartition(context),/source_unavailable/);f.r.transportSurfaceModel.reviewedSurfacePhase='accepted';
 f.r.surfaceSurveyEvidence.venueSource={...f.venue};assert.throws(()=>reviewedRoadBoundaryPartition(context),/source_unavailable/);
});
