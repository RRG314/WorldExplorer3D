import test from 'node:test';
import assert from 'node:assert/strict';
import {updateFeatureSurfaceProfile,buildFeatureRibbonEdges,sampleFeatureSurfaceY} from '../app/js/structure-semantics.js?v=63';
import {packCompiledTransportSurfaces} from '../app/js/world/compiler/transport-surface-model.js?v=25';
import {buildTransportContinuityRepairAnchors,auditTransportJunctionContinuity} from '../app/js/world/compiler/transport-junction-profile.js';
import {ctx} from '../app/js/shared-context.js?v=55';
import {refreshStructureAwareFeatureProfiles} from '../app/js/world/structure-aware.js';

function joinedRoads({farBank=false}={}) {
 const make=(id,a,b,mode)=>({sourceFeatureId:id,pts:[{x:a,z:0},{x:b,z:0}],type:'raceway',width:8,metersPerWorldUnit:1,surfaceBias:.08,
  structureSemantics:{terrainMode:mode,isBridge:mode==='elevated',gradeSeparated:mode==='elevated'},
  surfaceSurveyEvidence:{version:1,sourceFeatureId:id,groundArtifactId:'accepted-ground',groundContentSha256:'a'.repeat(64),maximumCrossfall:.15},
  transportRecord:{identity:id,completeness:'lossless',routeState:'complete',sourceTags:{highway:'raceway'}},
  transportGraphRef:{featureId:id},structureStations:[],structureTransitionAnchors:[]});
 const a=make('approach',-200,0,'at_grade'),b=make('measured-deck',0,40,'elevated'),c=make('exit',40,240,'at_grade'),features=[a,b,c];
 b.surfaceSurveyEvidence.deckProfile={version:1,coordinateFrame:'world',contentSha256:'b'.repeat(64),observedCoreWidthMeters:4,reconstructedWidthMeters:8,
  samples:[{t:0,centerY:10,crossfall:.04},{t:1,centerY:12,crossfall:.02}]};
 const ground=(x,z)=>(x<=0?.3*Math.max(0,1+x/12)+(farBank&&x < -80&&x > -160?.2:0):0)*z;
 const compile=f=>updateFeatureSurfaceProfile(f,ground,{reviewedSurfacePhase:'preparation'});
 features.forEach(compile);
 const side=(f,end)=>({featureId:f.sourceFeatureId,point:f.pts[end?1:0],segmentIndex:0,segmentT:end?1:0,
  distanceAlong:end?f.transportSurfaceModel.distances.at(-1):0,endpoint:end?'end':'start'});
 const network={connections:[{id:'entry',left:side(a,true),right:side(b,false)},{id:'exit',left:side(b,true),right:side(c,false)}]};
 const solve=()=>{for(const[f,anchors]of buildTransportContinuityRepairAnchors(features,network,sampleFeatureSurfaceY,{sampleTerrainY:ground}).anchorsByFeature){
  f.structureTransitionAnchors=anchors;compile(f);
 }};
 return {a,b,c,features,network,ground,solve};
}

test('reviewed preparation reaches the deck join before crossfall admission; only finalized models render',()=>{
 const f=joinedRoads(),initial=f.a.transportSurfaceModel,deck=[...f.b.transportSurfaceModel.centerHeights];
 assert.ok(initial.maximumReviewedCrossfall>.29);
 assert.throws(()=>buildFeatureRibbonEdges(f.a,f.a.pts,4,f.ground),/not_finalized/);
 assert.throws(()=>packCompiledTransportSurfaces(f.features),/crossfall_exceeded/);
 f.solve();
 assert.equal(auditTransportJunctionContinuity(f.features,f.network,sampleFeatureSurfaceY).discontinuityCount,0);
 assert.deepEqual([...f.b.transportSurfaceModel.centerHeights],deck,'the measured deck never moves');
 assert.ok(f.a.transportSurfaceModel.maximumReviewedCrossfall<=.15);
 const stats=packCompiledTransportSurfaces(f.features);assert.equal(stats.profiles,3);
 for(const road of f.features){
  assert.equal(road.transportSurfaceModel.reviewedSurfacePhase,'accepted');
  const ribbon=buildFeatureRibbonEdges(road,road.pts,4,f.ground);
  for(const p of [...ribbon.leftEdge,...ribbon.rightEdge])assert.ok(Math.abs(p.y-sampleFeatureSurfaceY(road,p.x,p.z))<1e-5);
 }
 assert.equal(initial.reviewedSurfacePhase,'preparation','retained diagnostic model is never promoted in place');
});

test('a real bank outside the deck taper still rejects the complete final publication atomically',()=>{
 const f=joinedRoads({farBank:true});f.solve();
 const before=f.features.map(r=>r.transportSurfaceModel);
 assert.ok(f.a.transportSurfaceModel.maximumReviewedCrossfall>.19);
 assert.throws(()=>packCompiledTransportSurfaces(f.features),/crossfall_exceeded/);
 assert.deepEqual(f.features.map(r=>r.transportSurfaceModel),before);
 for(const road of f.features){
  assert.equal(road.transportSurfaceModel.reviewedSurfacePhase,'preparation');
  assert.throws(()=>buildFeatureRibbonEdges(road,road.pts,4,f.ground),/not_finalized/);
 }
});

test('preparation cannot defer a malformed survey or change ordinary strict compilation',()=>{
 const f=joinedRoads();
 assert.throws(()=>updateFeatureSurfaceProfile(f.a,f.ground),/crossfall_exceeded/);
 f.a.surfaceSurveyEvidence.sourceFeatureId='other-road';
 assert.throws(()=>updateFeatureSurfaceProfile(f.a,f.ground,{reviewedSurfacePhase:'preparation'}),/invalid_reviewed_road_surface/);
});

test('the world compilation owner finalizes joined roads before terrain, colliders or ribbon publication',t=>{
 const saved={...ctx};for(const key of Object.keys(ctx))delete ctx[key];
 t.after(()=>{
  ctx.streetFrontageGrading?.dispose?.();ctx.structureTerrainProjectionIndex?.dispose?.();
  for(const key of Object.keys(ctx))delete ctx[key];Object.assign(ctx,saved);
 });
 const f=joinedRoads();
 f.features.forEach((r,i)=>{r.sourceNodeIds=[String(i+1),String(i+2)];r.driveable=true;r.networkKind='road';});
 Object.assign(ctx,{roads:f.features,linearFeatures:[],buildings:[],waterAreas:[],waterways:[],baseTerrainHeightAt:f.ground});
 const compilation=refreshStructureAwareFeatureProfiles();
 assert.equal(compilation.roadCount,3);
 assert.equal(ctx.transportJunctionProfile.continuity.sampledConnectionCount,2);
 assert.equal(ctx.transportJunctionProfile.continuity.discontinuityCount,0);
 assert.equal(ctx.transportTerrainCorridorPublication.corridorCount,2);
 for(const r of f.features){
  assert.equal(r.transportSurfaceModel.reviewedSurfacePhase,'accepted');
  assert.ok(buildFeatureRibbonEdges(r,r.pts,4,f.ground).leftEdge.length);
 }
});

test('the world owner rejects an excessive final bank before replacing a prior terrain publication',t=>{
 const saved={...ctx};for(const key of Object.keys(ctx))delete ctx[key];
 t.after(()=>{for(const key of Object.keys(ctx))delete ctx[key];Object.assign(ctx,saved);});
 const f=joinedRoads({farBank:true}),prior=Object.freeze({identity:'prior-accepted-corridors'});
 f.features.forEach((r,i)=>{r.sourceNodeIds=[String(i+1),String(i+2)];r.driveable=true;r.networkKind='road';});
 Object.assign(ctx,{roads:f.features,linearFeatures:[],buildings:[],waterAreas:[],waterways:[],baseTerrainHeightAt:f.ground,
  transportTerrainCorridorPublication:prior});
 assert.throws(()=>refreshStructureAwareFeatureProfiles(),/crossfall_exceeded/);
 assert.equal(ctx.transportTerrainCorridorPublication,prior);
 assert.equal(ctx.transportStructureAssembly,undefined);
 assert.equal(ctx.structureProfileCompilation,undefined);
 for(const r of f.features)assert.equal(r.transportSurfaceModel.reviewedSurfacePhase,'preparation');
});
