import test from 'node:test';
import assert from 'node:assert/strict';
// Road-area and crest regressions exercise the production compiler in
// street-carriageway-regions-current.test.mjs. Retired sheet generators are
// deliberately not retained as a second implementation for these checks.
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

test('legacy ground fallback does not rescan indexed sidewalks or use paint as support',async t=>{
  const {ctx}=await import('../app/js/shared-context.js?v=55');
  const {GroundHeight}=await import('../app/js/ground.js');
  const prior=ctx.urbanSurfaceMeshes;t.after(()=>{ctx.urbanSurfaceMeshes=prior;});
  const legacy={userData:{kind:'developed-fill'}};
  ctx.urbanSurfaceMeshes=[legacy,{userData:{streetPavement:true,kind:'sidewalk'}},{userData:{streetPavement:true,kind:'curb'}},{userData:{streetPavement:true,kind:'crossing-marking'}}];
  t.mock.method(GroundHeight,'_raycastMeshY',meshes=>{assert.deepEqual(meshes,[legacy]);return 4;});
  assert.equal(GroundHeight.urbanSurfaceMeshY(0,0),4);
});


test('ground-level surface queries cannot select a bridge when the ground road ends',()=>{
  const positions=new Float32Array([
    -4,.18,0,-4,.18,4,0,.18,4,0,.18,0,
    -4,12,0,-4,12,4,4,12,4,4,12,0
  ]);
  const indices=new Uint16Array([0,1,2,0,2,3,4,5,6,4,6,7]);
  const index=createRoadContactIndex([{userData:{surfaceRanges:[
    {start:0,count:6,terrainMode:'at_grade'}, {start:6,count:6,terrainMode:'elevated'}
  ]},geometry:{getAttribute:()=>({array:positions}),getIndex:()=>({array:indices})}}]);
  assert.ok(Math.abs(index.sampleAt(-1,2,0,'at_grade')-.18)<1e-7);
  assert.equal(index.sampleAt(1,2,0,'at_grade'),null);
  assert.equal(index.sampleAt(1,2,0),12,'bridge contact remains available to its own traversal');
});


test('ground-level contact accepts signed terrain reconciliation beyond the old profile tolerance',async()=>{
 const {GroundHeight}=await import('../app/js/ground.js');
 const road={structureSemantics:{terrainMode:'at_grade'}};
 for(const meshY of [5,15]){assert.equal(GroundHeight._shouldUseRoadMeshHeight(road,meshY,10),true);assert.equal(GroundHeight._resolveRoadSurfaceY(road,meshY,10),meshY);}
 assert.equal(GroundHeight._shouldUseRoadMeshHeight({structureSemantics:{terrainMode:'subgrade'}},15,10),false);
});

test('walking follows published footpath triangles instead of a stale centerline profile',async t=>{
 const {ctx}=await import('../app/js/shared-context.js?v=55');
 const {GroundHeight}=await import('../app/js/ground.js');
 const previous={linearWalkContactIndex:ctx.linearWalkContactIndex,roadContactIndex:ctx.roadContactIndex,streetPavement:ctx.streetPavement};t.after(()=>Object.assign(ctx,previous));
 ctx.linearWalkContactIndex=createRoadContactIndex([surfaceMesh(10)]);ctx.roadContactIndex=null;ctx.streetPavement=null;
 const feature={kind:'footway',width:8,pts:[{x:0,z:-4},{x:0,z:4}],structureSemantics:{terrainMode:'at_grade'},transportSurfaceModel:{distances:new Float32Array([0,8]),pathDistances:new Float32Array([0,8]),centerHeights:new Float32Array([2,2])}};
 t.mock.method(GroundHeight,'terrainY',()=>9);
 t.mock.method(GroundHeight,'_nearestWalkRoad',()=>null);
 t.mock.method(GroundHeight,'_nearestLinearWalkFeature',()=>({feature,dist:2,pt:{x:0,z:-2},segIndex:0,t:.25}));
 t.mock.method(GroundHeight,'urbanSurfaceMeshY',()=>null);
 t.mock.method(GroundHeight,'linearFeatureMeshY',()=>{throw Error('Walking must not raycast all paths');});
 const support=GroundHeight.walkSurfaceInfo(-2,-2,9.5,{sampleRenderedMesh:false});
 assert.equal(support.source,'footway');assert.equal(support.y,9.5);
 assert.equal(GroundHeight.walkSurfaceInfo(3,3,9.5,{sampleRenderedMesh:false}).source,'terrain');
 ctx.linearWalkContactIndex.dispose();ctx.linearWalkContactIndex=createRoadContactIndex([surfaceMesh(8)]);
 assert.equal(GroundHeight.walkSurfaceInfo(-2,-2,9,{sampleRenderedMesh:false}).y,9,'buried path must not pull the walker below visible terrain');
});

test('replacing mapped path batches replaces walking contact and releases the old index', async () => {
  const {refreshLinearWalkContactIndex}=await import('../app/js/terrain/road-contact-index.js');
  const mesh=(y,kind='footway')=>({userData:{linearFeatureKind:kind},geometry:{attributes:{position:{array:new Float32Array([0,y,0,10,y,0,0,y,10])}}}});
  const appCtx={linearFeatureMeshes:[mesh(2)]};
  const previous=refreshLinearWalkContactIndex(appCtx);
  assert.equal(previous.sampleAt(1,1),2);
  appCtx.linearFeatureMeshes=[mesh(7),mesh(12,'waterway')];
  const next=refreshLinearWalkContactIndex(appCtx);
  assert.equal(next.sampleAt(1,1),7);
  assert.equal(previous.sampleAt(1,1),null);
});
