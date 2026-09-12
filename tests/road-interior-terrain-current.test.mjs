import test from 'node:test';
import assert from 'node:assert/strict';
import {appendSolidAtGradeRoadGeometry} from '../app/js/terrain/road-surface-geometry.js';
function build(sample) {
  const verts=[],indices=[];
  const result=appendSolidAtGradeRoadGeometry({feature:{},points:[{x:0,z:0},{x:8,z:0}],halfWidth:4,sampleTerrainY:sample,targetVerts:verts,targetIndices:indices});
  return {verts,indices,result};
}
test('planar road slopes retain two triangles instead of receiving blanket subdivisions',()=>{
  const {indices}=build((x,z)=>x*.2+z*.1);assert.equal(indices.length,6);
});
test('terrain rising inside the road footprint is covered between the original edge samples',()=>{
  const sample=(x,z)=>Math.max(0,1-Math.abs(x-4)/4)*Math.max(0,1-Math.abs(z)/4);
  const {verts,indices,result}=build(sample);assert.ok(result.surfaceTriangles>2);
  for(let i=0;i<indices.length;i+=3){
    const ps=indices.slice(i,i+3).map(j=>({x:verts[j*3],y:verts[j*3+1],z:verts[j*3+2]}));
    const x=ps.reduce((s,p)=>s+p.x,0)/3,z=ps.reduce((s,p)=>s+p.z,0)/3,y=ps.reduce((s,p)=>s+p.y,0)/3;
    assert.ok(y>=sample(x,z)-.01,`Road buried at ${x},${z}`);
  }
});

test('walking samples the rendered road under the actor, not its projected centerline',async t=>{
  const {GroundHeight}=await import('../app/js/ground.js');
  const road={width:8,pts:[{x:0,z:0},{x:0,z:20}],structureSemantics:{terrainMode:'at_grade'}};
  t.mock.method(GroundHeight,'terrainY',()=>0);
  t.mock.method(GroundHeight,'_nearestWalkRoad',()=>({road,dist:2,pt:{x:0,z:0},y:0,segIndex:0,t:0}));
  t.mock.method(GroundHeight,'_nearestLinearWalkFeature',()=>null);
  t.mock.method(GroundHeight,'roadMeshY',(x,z)=>x+z);
  const contact=GroundHeight.walkSurfaceInfo(2,0,3.7);
  assert.equal(contact.source,'road');assert.equal(contact.y,2);
});

import { createRoadContactIndex } from '../app/js/terrain/road-contact-index.js';
function surfaceMesh(y, flags={}) {
  const positions=new Float32Array([-4,y-1,-4, 4,y+1,-4, -4,y-1,4]);
  return {userData:flags,geometry:{getAttribute:()=>({array:positions}),getIndex:()=>({array:new Uint16Array([0,1,2])})}};
}
test('road contact index preserves cross slope, negative cells, and separate levels',()=>{
  const index=createRoadContactIndex([surfaceMesh(10),surfaceMesh(20),surfaceMesh(50,{isRoadMarking:true})]);
  assert.equal(index.sampleAt(-2,-2,10),9.5);
  assert.equal(index.sampleAt(-2,-2,20),19.5);
  assert.equal(index.sampleAt(-2,-2),19.5);
  assert.equal(index.sampleAt(3,3,10),null);
  assert.equal(index.sampleAt(200,200,10),null);
});
test('walking controller fast path uses exact published triangles without raycasting',async t=>{
  const {ctx}=await import('../app/js/shared-context.js?v=55');
  const {GroundHeight}=await import('../app/js/ground.js');
  const {createWalkingTerrainHelpers}=await import('../app/js/walking/terrain.js');
  const {createSurfaceQuery}=await import('../app/js/world/surface-contract.js');
  const prior={SurfaceQuery:ctx.SurfaceQuery,roadContactIndex:ctx.roadContactIndex};
  t.after(()=>Object.assign(ctx,prior));
  ctx.roadContactIndex=createRoadContactIndex([surfaceMesh(10)]);
  ctx.SurfaceQuery=createSurfaceQuery(ctx,GroundHeight);
  const road={width:8,pts:[{x:0,z:-4},{x:0,z:4}],structureSemantics:{terrainMode:'at_grade'}};
  t.mock.method(GroundHeight,'terrainY',()=>9);
  t.mock.method(GroundHeight,'_nearestWalkRoad',()=>({road,dist:2,pt:{x:0,z:-2},y:10,segIndex:0,t:.25}));
  t.mock.method(GroundHeight,'_nearestLinearWalkFeature',()=>null);
  t.mock.method(GroundHeight,'roadMeshY',()=>{throw new Error('Fast contact must not raycast');});
  const helpers=createWalkingTerrainHelpers({car:{},state:{walker:{y:11.2}},CFG:{eyeHeight:1.7}});
  assert.equal(helpers.getWalkGroundY(-2,-2),9.5);
  assert.equal(GroundHeight.driveSurfaceInfo(-2,-2,true,9.5,{sampleRenderedMesh:false,nearestRoad:{road,dist:2,pt:{x:0,z:-2},y:10}}).y,9.5);
});

test('road proximity padding cannot support an actor outside published asphalt',async t=>{
  const {ctx}=await import('../app/js/shared-context.js?v=55');
  const {GroundHeight}=await import('../app/js/ground.js');
  const previous=ctx.roadContactIndex;t.after(()=>{ctx.roadContactIndex=previous;});
  ctx.roadContactIndex=createRoadContactIndex([surfaceMesh(10)]);
  const road={width:8,pts:[{x:0,z:-4},{x:0,z:4}],structureSemantics:{terrainMode:'at_grade'}};
  const nearest={road,dist:3,pt:{x:0,z:3},y:10};
  t.mock.method(GroundHeight,'terrainY',()=>9);
  t.mock.method(GroundHeight,'_nearestWalkRoad',()=>nearest);
  t.mock.method(GroundHeight,'_nearestLinearWalkFeature',()=>null);
  t.mock.method(GroundHeight,'urbanSurfaceMeshY',()=>null);
  assert.equal(GroundHeight.walkSurfaceInfo(3,3,10,{sampleRenderedMesh:false}).source,'terrain');
  assert.equal(GroundHeight.driveSurfaceInfo(3,3,true,10,{sampleRenderedMesh:false,nearestRoad:nearest}).source,'terrain');
});
