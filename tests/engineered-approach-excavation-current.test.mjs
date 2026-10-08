import test from 'node:test';
import assert from 'node:assert/strict';
import { compileEngineeredApproachExcavation } from '../app/js/world/compiler/engineered-approach-excavation.js';
import { compileTransportSurfaceModel, attachCompiledTransportSurface } from '../app/js/world/compiler/transport-surface-model.js';
import { buildFeatureRibbonEdges, sampleFeatureSurfaceY } from '../app/js/structure-semantics.js';
import { compileStructureColliderDescriptors } from '../app/js/world/structure-colliders.js';
import { collectStructureVisualInstances } from '../app/js/terrain/structure-visuals.js';
import { terrainHeightWithPortalCuts, terrainPointRemovedByPortal } from '../app/js/terrain/structure-terrain-portals.js';
import {compileSurfaceRoadOverlapRanges} from '../app/js/world/compiler/tunnel-obstruction-limits.js';
import {createPortalSurfaceClipper} from '../app/js/terrain/portal-surface-clip.js';
import {createBuildingCollisionQuery} from '../app/js/physics/building-collision.js';

function road(id, points) {
  const f={sourceFeatureId:id,networkKind:'road',width:8,pts:points,
    structureSemantics:{terrainMode:'at_grade'},transportRecord:{routeState:'complete',completeness:'generalized'},
    structureTransitionAnchors:[{source:'transport_graph_node',engineeredApproach:true,distance:0,targetSurfaceY:10,span:100},
      {source:'transport_graph_node',engineeredApproach:true,distance:100,targetSurfaceY:16,span:100}]};
  attachCompiledTransportSurface(f,compileTransportSurfaceModel(f,()=>40,{sampleStep:2}));
  return f;
}

test('approach excavation preserves a separate upper street edge and still cuts its open entrances',()=>{
 const lower=road('lower',[{x:0,z:0},{x:100,z:0}]);
 const upper={sourceFeatureId:'upper',pts:[{x:50,z:3},{x:50,z:30}],width:5,structureSemantics:{terrainMode:'at_grade'}};
 const ground=()=>20,roadCover=compileSurfaceRoadOverlapRanges(lower,[upper],ground,()=>false);
 assert.ok(roadCover.length>0,'an upper-road edge counts even without a centerline crossing');
 const cut=compileEngineeredApproachExcavation(lower,ground,{roadCover});
 const positions=new Float32Array([48,20.18,3,52,20.18,3,48,20.18,10,52,20.18,10]);
 const indices=new Uint32Array([0,2,1,1,2,3]);
 const before=compileEngineeredApproachExcavation(lower,ground);
 assert.notEqual(createPortalSurfaceClipper(before.masks)(positions,indices).positions,positions);
 const retained=createPortalSurfaceClipper(cut.masks)(positions,indices);
 let area=0;
 for(let i=0;i<retained.indices.length;i+=3){
  const [a,b,c]=[0,1,2].map(j=>retained.indices[i+j]*3),p=retained.positions;
  area+=Math.abs((p[b]-p[a])*(p[c+2]-p[a+2])-(p[b+2]-p[a+2])*(p[c]-p[a]))/2;
 }
 assert.ok(Math.abs(area-28)<1e-4,'all upper-street surface area remains supported');
 assert.equal(terrainHeightWithPortalCuts(cut.masks,50,3,20),20);
 assert.ok(terrainHeightWithPortalCuts(cut.masks,20,0,20)<20);
 assert.ok(terrainHeightWithPortalCuts(cut.masks,80,0,20)<20);
 assert.equal(compileSurfaceRoadOverlapRanges(lower,[upper],ground,()=>true).length,0,'connected roads remain openings');
 lower.engineeredApproachExcavation=cut;
 const query=createBuildingCollisionQuery({buildings:[],transportStructureColliders:compileStructureColliderDescriptors([lower])});
 assert.equal(query(50,4.1,.92,{actorBaseY:20.18,actorHeight:1.9}).collision,false,'the upper street is not obstructed by the lower retaining wall');
 assert.equal(query(50,4.1,.92,{actorBaseY:13,actorHeight:1.9}).collision,true,'the same wall remains solid to the lower vehicle');
 assert.ok(cut.rings.filter(r=>r.distance>=49&&r.distance<=51).every(r=>r.leftTerrainY<20&&r.rightTerrainY<20),'visible wall tops obey the same upper-road boundary');
});

test('a bridge deck bounds lower retaining walls independently of terrain height',()=>{
 const lower=road('lower',[{x:0,z:0},{x:100,z:0}]);
 const bridge={sourceFeatureId:'bridge',pts:[{x:50,z:-20},{x:50,z:20}],width:6,
  structureSemantics:{terrainMode:'elevated',isBridge:true},transportRecord:{routeState:'complete',completeness:'lossless'}};
 attachCompiledTransportSurface(bridge,compileTransportSurfaceModel(bridge,()=>16));
 const deck=sampleFeatureSurfaceY(bridge,50,0);
 const ground=()=>40;
 assert.equal(compileSurfaceRoadOverlapRanges(lower,[bridge],ground,()=>false).length,0,'a bridge is not terrain roof cover for tunnel grading');
 const cover=compileSurfaceRoadOverlapRanges(lower,[bridge],ground,()=>false,{includeElevated:true});
 assert.ok(cover.length>0&&cover.every(c=>Math.abs(c.maximumSurfaceY-deck)<.01));
 const excavation=lower.engineeredApproachExcavation=compileEngineeredApproachExcavation(lower,ground,{roadCover:cover});
 const query=createBuildingCollisionQuery({buildings:[],transportStructureColliders:compileStructureColliderDescriptors([lower])});
 assert.equal(query(50,4.1,.92,{actorBaseY:deck,actorHeight:1.9}).collision,false);
 assert.equal(query(50,4.1,.92,{actorBaseY:13,actorHeight:1.9}).collision,true);
 assert.ok(excavation.rings.filter(r=>r.distance>=49&&r.distance<=51).every(r=>r.leftTerrainY<deck));
});

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
