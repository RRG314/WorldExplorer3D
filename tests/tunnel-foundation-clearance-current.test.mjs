import test from 'node:test';
import assert from 'node:assert/strict';
import {compileTunnelObstructionLimits, compileTunnelRoadObstructionLimits, tunnelObstructionMaximumY} from '../app/js/world/compiler/tunnel-obstruction-limits.js';
import {compileTransportSurfaceModel, sampleTransportSurfaceAtDistance} from '../app/js/world/compiler/transport-surface-model.js';
import {attachCompiledTransportSurface} from '../app/js/world/compiler/transport-surface-model.js';
import {buildTransportContinuityRepairAnchors,auditTransportJunctionContinuity} from '../app/js/world/compiler/transport-junction-profile.js';
import {sampleFeatureSurfaceY} from '../app/js/structure-semantics.js';
import {smoothGradeLimitedProfile,reconcileExactGraphNodeConstraints} from '../app/js/world/compiler/transport-surface-profile.js';

const box = (x0, x1, z0, z1, minY = 38.2082) => ({minY, pts: [{x:x0,z:z0},{x:x1,z:z0},{x:x1,z:z1},{x:x0,z:z1}]});
const road = () => ({pts:[{x:0,z:0},{x:200,z:0}], width:6, type:'primary',
  structureSemantics:{terrainMode:'subgrade',isTunnel:true,cutDepth:4.6,layer:-1},
  transportRecord:{routeState:'complete',completeness:'generalized'},structureTransitionAnchors:[]});

test('inserting closely spaced graph stations cannot turn a straight grade into a bump', () => {
  const distances=Float64Array.from([0,10,10.001,20,40,40.002,60,80,100]);
  const heights=Float64Array.from(distances,d=>30+d*.06), lower=Float64Array.from(distances,()=>-Infinity);
  const feature={structureTransitionAnchors:[{source:'transport_graph_node',distance:0,targetSurfaceY:30,span:100},{source:'transport_graph_node',distance:100,targetSurfaceY:36,span:100}]};
  for(const result of [smoothGradeLimitedProfile(heights,lower,distances,.085),reconcileExactGraphNodeConstraints(feature,heights,distances,lower,.085)]) {
    for(let i=0;i<result.length;i++) assert.ok(Math.abs(result[i]-heights[i])<2e-6,`station ${distances[i]} changed a straight grade`);
  }
});

test('foundation footprint, including the roof edge, owns tunnel clearance without clipping neighboring buildings', () => {
  const feature = road();
  const limits = compileTunnelObstructionLimits(feature, () => [box(90,110,-10,10),box(50,60,3.8,8,42),box(20,30,5,9,10)]);
  assert.equal(limits.length,2);
  assert.ok(Math.abs(tunnelObstructionMaximumY(limits,100)-32.7882)<1e-6);
  assert.ok(Number.isFinite(tunnelObstructionMaximumY(limits,55)),'outer shell must also clear the building');
  assert.equal(tunnelObstructionMaximumY(limits,25),Infinity,'nearby non-overlap is not a ceiling');
  assert.equal(tunnelObstructionMaximumY(limits,150),Infinity);
  assert.equal(compileTunnelObstructionLimits({...feature,structureSemantics:{terrainMode:'at_grade'}},()=>[box(0,200,-10,10)]).length,0);
  assert.equal(compileTunnelObstructionLimits({...feature,transportRecord:{routeState:'incomplete'}},()=>[box(0,200,-10,10)]).length,0);
});

test('sloping tunnel remains below the whole foundation with a grade-limited entry and exit', () => {
  const feature=road();
  feature.tunnelObstructionLimits=compileTunnelObstructionLimits(feature,()=>[box(90.3,110.4,-10,10)]);
  const ground=x=>44+x*.012;
  const profile=compileTransportSurfaceModel(feature,ground,{sampleStep:2});
  assert.ok([...profile.distances].some(d=>Math.abs(d-90.3)<1e-7),'footprint edge is an exact profile station');
  for(let d=90.3;d<=110.4;d+=.1)assert.ok(sampleTransportSurfaceAtDistance(profile,d,0)<=32.78821,'foundation clearance survives smoothing');
  assert.ok(profile.stats.maximumGrade<=.13501);
  const repeated=compileTransportSurfaceModel(feature,ground,{sampleStep:2});
  assert.deepEqual(repeated.centerHeights,profile.centerHeights,'compilation cannot progressively sink a tunnel');
});

test('rotated and narrow foundations are retained while disabled and structure colliders are excluded', () => {
  const feature=road();feature.pts=[{x:0,z:0},{x:100,z:100}];
  const building=box(49.99,50.01,49,51);
  const limits=compileTunnelObstructionLimits(feature,()=>[building,{...building,collisionDisabled:true},{...building,geometrySource:'compiled_transport_structures'}]);
  assert.equal(limits.length,1);
  assert.ok(limits[0].start<Math.sqrt(5000)&&limits[0].end>Math.sqrt(5000));
});

test('a foundation at a tunnel entrance lowers the connected approach over its grade run without moving remote streets', () => {
  const tunnel=road();tunnel.sourceFeatureId='tunnel';tunnel.transportGraphRef={featureId:'tunnel'};
  tunnel.tunnelObstructionLimits=compileTunnelObstructionLimits(tunnel,()=>[box(0,12,-10,10,29)]);
  const approach={...road(),sourceFeatureId:'approach',transportGraphRef:{featureId:'approach'},pts:[{x:-250,z:0},{x:0,z:0}],structureSemantics:{terrainMode:'at_grade'}};
  const distant={...approach,sourceFeatureId:'distant',transportGraphRef:{featureId:'distant'},pts:[{x:-500,z:0},{x:-250,z:0}],structureTransitionAnchors:[]};
  const features=[distant,approach,tunnel], ground=()=>40;
  const compile=f=>attachCompiledTransportSurface(f,compileTransportSurfaceModel(f,ground,{sampleStep:2}));features.forEach(compile);
  const side=(f,endpoint)=>({featureId:f.sourceFeatureId,endpoint,point:f.pts[endpoint==='start'?0:1],segmentIndex:0,segmentT:endpoint==='start'?0:1,distanceAlong:endpoint==='start'?0:f.pts[1].x-f.pts[0].x});
  const network={connections:[{id:'surface',left:side(distant,'end'),right:side(approach,'start')},{id:'portal',left:side(approach,'end'),right:side(tunnel,'start')}]};
  const before=[...distant.transportSurfaceModel.centerHeights];
  const solve=()=>{const result=buildTransportContinuityRepairAnchors(features,network,sampleFeatureSurfaceY,{sampleTerrainY:ground});for(const[f,anchors]of result.anchorsByFeature){const d=new Set(anchors.map(a=>a.distance));f.structureTransitionAnchors=f.structureTransitionAnchors.filter(a=>!d.has(a.distance)).concat(anchors);compile(f)}};
  for(let i=0;i<4;i++)solve();
  assert.equal(auditTransportJunctionContinuity(features,network,sampleFeatureSurfaceY).discontinuityCount,0);
  assert.deepEqual([...distant.transportSurfaceModel.centerHeights],before);
  assert.ok(approach.transportSurfaceModel.stats.maximumGrade<=.08501);
  assert.ok(sampleFeatureSurfaceY(tunnel,0,0)<=23.58001);
  const solved=features.map(f=>[...f.transportSurfaceModel.centerHeights]);solve();
  assert.deepEqual(features.map(f=>[...f.transportSurfaceModel.centerHeights]),solved);
});


test('separate surface carriageway width protects a near-miss crossing and an ordinary connected entry remains open', () => {
  const tunnel=road();
  const crossing={sourceFeatureId:'crossing',pts:[{x:90,z:3.5},{x:110,z:3.5}],width:4,structureSemantics:{terrainMode:'at_grade'}};
  const unrelated={...crossing,pts:[{x:90,z:8},{x:110,z:8}]};
  const connected={...crossing,sourceFeatureId:'entry',pts:[{x:-20,z:0},{x:0,z:0}]};
  const limits=compileTunnelRoadObstructionLimits(tunnel,[crossing,unrelated,connected],()=>40,(_a,b)=>b===connected);
  assert.equal(limits.length,1);
  assert.equal(limits[0].sourceFeatureId,'crossing');
  assert.equal(limits[0].start,90);assert.equal(limits[0].end,110);
  assert.ok(Math.abs(limits[0].maximumSurfaceY-34.58)<1e-9);
  assert.equal(tunnelObstructionMaximumY(limits,50),Infinity);
});

test('road roof constraints survive grade reconciliation without moving the road above', () => {
  const tunnel=road(),crossing={pts:[{x:97,z:-20},{x:103,z:20}],width:4,structureSemantics:{terrainMode:'at_grade'}};
  const ground=(x,z)=>40+x*.005+z*.003;
  const before=structuredClone(crossing);
  tunnel.tunnelObstructionLimits=compileTunnelRoadObstructionLimits(tunnel,[crossing],ground,()=>false);
  const model=compileTransportSurfaceModel(tunnel,ground,{sampleStep:2});
  assert.ok(tunnel.tunnelObstructionLimits.length>0);
  for(const limit of tunnel.tunnelObstructionLimits)for(let d=limit.start;d<=limit.end;d+=.1)
    assert.ok(sampleTransportSurfaceAtDistance(model,d,0)<=limit.maximumSurfaceY+1e-5);
  assert.ok(model.stats.maximumGrade<=.13501);
  assert.deepEqual(crossing,before);
});

test('unknown road heights, separate structures and incomplete tunnels cannot invent a roof constraint', () => {
  const tunnel=road(),crossing={pts:[{x:100,z:-20},{x:100,z:20}],width:4,structureSemantics:{terrainMode:'at_grade'}};
  assert.deepEqual(compileTunnelRoadObstructionLimits(tunnel,[crossing],()=>NaN),[]);
  assert.deepEqual(compileTunnelRoadObstructionLimits(tunnel,[{...crossing,structureSemantics:{terrainMode:'elevated'}}],()=>40),[]);
  assert.deepEqual(compileTunnelRoadObstructionLimits({...tunnel,transportRecord:{routeState:'incomplete'}},[crossing],()=>40),[]);
});
