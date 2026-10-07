import test from 'node:test';
import assert from 'node:assert/strict';
import { compileEngineeredApproachExcavation } from '../app/js/world/compiler/engineered-approach-excavation.js';
import { compileTransportSurfaceModel, attachCompiledTransportSurface } from '../app/js/world/compiler/transport-surface-model.js';
import { buildFeatureRibbonEdges, sampleFeatureSurfaceY } from '../app/js/structure-semantics.js';
import { compileStructureColliderDescriptors } from '../app/js/world/structure-colliders.js';
import { collectStructureVisualInstances } from '../app/js/terrain/structure-visuals.js';
import { terrainHeightWithPortalCuts, terrainPointRemovedByPortal } from '../app/js/terrain/structure-terrain-portals.js';

function road(id, points) {
  const f={sourceFeatureId:id,networkKind:'road',width:8,pts:points,
    structureSemantics:{terrainMode:'at_grade'},transportRecord:{routeState:'complete',completeness:'generalized'},
    structureTransitionAnchors:[{source:'transport_graph_node',engineeredApproach:true,distance:0,targetSurfaceY:10,span:100},
      {source:'transport_graph_node',engineeredApproach:true,distance:100,targetSurfaceY:16,span:100}]};
  attachCompiledTransportSurface(f,compileTransportSurfaceModel(f,()=>40,{sampleStep:2}));
  return f;
}

test('a graded cut publishes its profile on both wheel tracks and removes only its own terrain',()=>{
  const f=road('approach',[{x:0,z:0},{x:100,z:0}]);
  assert.equal(f.transportSurfaceModel.engineeredApproach,true);
  const excavation=compileEngineeredApproachExcavation(f,()=>40);
  assert.ok(excavation?.walls.length>0);
  assert.ok(excavation.masks.length<10,'constant grade segments do not publish a mask for every terrain probe');
  assert.equal(compileEngineeredApproachExcavation(f,()=>0),null,'raised approaches do not excavate empty air');
  f.engineeredApproachExcavation=excavation;
  const ribbon=buildFeatureRibbonEdges(f,[{x:0,z:0},{x:50,z:0},{x:100,z:0}],4,()=>40);
  for(const edge of [ribbon.leftEdge,ribbon.rightEdge])for(let i=0;i<3;i++)assert.ok(Math.abs(edge[i].y-sampleFeatureSurfaceY(f,50*i,0))<.02);
  assert.ok(Math.abs(terrainHeightWithPortalCuts(excavation.masks,50,0,40)-sampleFeatureSurfaceY(f,50,0))<.02);
  assert.equal(terrainHeightWithPortalCuts(excavation.masks,50,6,40),40);
  assert.equal(terrainHeightWithPortalCuts(excavation.masks,50,0,5),5,'do not cut terrain below the pavement');
  const mask=excavation.masks.find(m=>terrainPointRemovedByPortal(m,{x:50,y:40,z:0}));
  assert.ok(mask,'shader and CPU cut predicates match');
  const walls=compileStructureColliderDescriptors([f]);
  assert.equal(walls.length,excavation.walls.length);
  assert.ok(walls.every(w=>w.minZ>=4||w.maxZ<=-4),'walls cannot occupy the lane');
  assert.ok(walls.every(w=>w.maxY===40.08));
  const visuals=collectStructureVisualInstances({featuresToProcess:[f],allElevatedFeatures:[f],cachedTerrainHeight:()=>40});
  assert.equal(visuals.tunnelPortalMasks.length,excavation.masks.length,'generalized approaches publish their compiled cut');
  assert.equal(visuals.tunnelShells[0].approachOnly,true,'surface road gets retaining walls without an invented roof');
});

test('ordinary, incomplete and missing-terrain roads cannot invent cuts',()=>{
  const f=road('approach',[{x:0,z:0},{x:100,z:0}]);
  assert.equal(compileEngineeredApproachExcavation({...f,transportSurfaceModel:{...f.transportSurfaceModel,engineeredApproach:false}},()=>40),null);
  assert.equal(compileEngineeredApproachExcavation({...f,transportRecord:{routeState:'incomplete'}},()=>40),null);
  assert.equal(compileEngineeredApproachExcavation(f,(x)=>x===50?NaN:40),null);
});

test('surface retaining walls open for a connected branch at the same height but not an overpass',()=>{
  const main=road('main',[{x:0,z:0},{x:100,z:0}]);
  const branch=road('branch',[{x:0,z:0},{x:0,z:100}]);
  main.connectedFeatures={start:[{feature:branch}],end:[]};
  const open=compileEngineeredApproachExcavation(main,()=>40);
  assert.ok(open.wallOpenings.some(o=>o.side===1&&o.start<1));
  branch.transportSurfaceModel={...branch.transportSurfaceModel,centerHeights:Float64Array.from(branch.transportSurfaceModel.centerHeights,y=>y+10)};
  assert.equal(compileEngineeredApproachExcavation(main,()=>40).wallOpenings.length,0);
  main.connectedFeatures.start=[];
  assert.equal(compileEngineeredApproachExcavation(main,()=>40).wallOpenings.length,0);
});
