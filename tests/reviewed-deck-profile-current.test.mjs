import test from 'node:test';
import assert from 'node:assert/strict';
import {compileTransportSurfaceModel,attachCompiledTransportSurface,sampleTransportSurfaceAtDistance} from '../app/js/world/compiler/transport-surface-model.js';
import {buildTransportContinuityRepairAnchors,buildExactTransportNodeFinalizationAnchors,auditTransportJunctionContinuity} from '../app/js/world/compiler/transport-junction-profile.js';
import {sampleFeatureSurfaceY,buildFeatureRibbonEdges} from '../app/js/structure-semantics.js';

function fixture(reverse=false){
 const evidence=id=>({version:1,sourceFeatureId:id,groundArtifactId:'accepted-ground',groundContentSha256:'a'.repeat(64),maximumCrossfall:.15});
 const make=(id,a,b,mode)=>({sourceFeatureId:id,pts:[{x:a,z:0},{x:b,z:0}],type:'raceway',width:8,metersPerWorldUnit:1,surfaceBias:.08,
  structureSemantics:{terrainMode:mode,isBridge:mode==='elevated',deckClearance:6},surfaceSurveyEvidence:evidence(id),
  transportRecord:{identity:id,completeness:'lossless',routeState:'complete',sourceTags:{highway:'raceway'}},transportGraphRef:{featureId:id},structureStations:[],structureTransitionAnchors:[]});
 const a=make('approach',reverse?0:-200,reverse?-200:0,'at_grade'),b=make('measured-deck',0,40,'elevated'),c=make('exit',40,240,'at_grade');
 b.surfaceSurveyEvidence.deckProfile={version:1,coordinateFrame:'world',contentSha256:'b'.repeat(64),observedCoreWidthMeters:4,reconstructedWidthMeters:8,
  samples:[{t:0,centerY:10,crossfall:.04},{t:.5,centerY:11.5,crossfall:.03},{t:1,centerY:12,crossfall:.02}]};
 const side=(f,end)=>({featureId:f.sourceFeatureId,point:f.pts[end?1:0],segmentIndex:0,segmentT:end?1:0,distanceAlong:end?Math.abs(f.pts[1].x-f.pts[0].x):0,endpoint:end?'end':'start'});
 const network={connections:[{id:'entry',left:side(a,!reverse),right:side(b,false)},{id:'exit',left:side(b,true),right:side(c,false)}]},features=[a,b,c],ground=()=>0;
 const compile=f=>attachCompiledTransportSurface(f,compileTransportSurfaceModel(f,ground));features.forEach(compile);
 const adopt=result=>{for(const[f,anchors]of result.anchorsByFeature){const keys=new Set(anchors.map(a=>a.distance));f.structureTransitionAnchors=f.structureTransitionAnchors.filter(a=>!keys.has(a.distance)).concat(anchors);compile(f);}};
 const solve=()=>adopt(buildTransportContinuityRepairAnchors(features,network,sampleFeatureSurfaceY,{sampleTerrainY:ground}));
 return {a,b,c,features,network,ground,compile,solve,adopt};
}
test('reviewed bridge heights and camber own the shared compiled sampler and rendered ribbon instead of default clearance guesses',()=>{
 const {b}=fixture(),model=b.transportSurfaceModel;
 assert.equal(model.endpointPolicy,'reviewed_deck_profile');
 for(const [distance,y,slope]of [[0,10,.04],[20,11.5,.03],[40,12,.02]]){
  assert.ok(Math.abs(sampleTransportSurfaceAtDistance(model,distance)-y-.08)<1e-5);
  assert.ok(Math.abs(sampleTransportSurfaceAtDistance(model,distance,4)-y-.08-slope*4)<1e-5);
 }
 const ribbon=buildFeatureRibbonEdges(b,b.pts,4,()=>999);
 for(const p of [...ribbon.leftEdge,...ribbon.rightEdge])assert.ok(Math.abs(p.y-sampleFeatureSurfaceY(b,p.x,p.z))<1e-6);
 const before=[...model.centerHeights];b.surfaceSurveyEvidence.deckProfile.samples[0].centerY=999;
 assert.deepEqual([...model.centerHeights],before);assert.equal(model.surveyedSurface.deckProfile.samples[0].centerY,10);
});
test('measured deck height and crossfall reach both approaches, including reversed source orientation, without moving the deck',()=>{
 for(const reverse of [false,true]){
  const f=fixture(reverse),deck=[...f.b.transportSurfaceModel.centerHeights];f.solve();
  assert.equal(auditTransportJunctionContinuity(f.features,f.network,sampleFeatureSurfaceY).discontinuityCount,0);
  assert.deepEqual([...f.b.transportSurfaceModel.centerHeights],deck);
  for(const z of [-3,-1,0,1,3]){
   assert.ok(Math.abs(sampleFeatureSurfaceY(f.a,0,z)-sampleFeatureSurfaceY(f.b,0,z))<.002);
   assert.ok(Math.abs(sampleFeatureSurfaceY(f.c,40,z)-sampleFeatureSurfaceY(f.b,40,z))<.002);
  }
  for(const road of f.features)assert.ok(road.transportSurfaceModel.stats.maximumGrade<=.08502);
  const before=f.features.map(r=>[...r.transportSurfaceModel.centerHeights]);f.solve();
  f.adopt(buildExactTransportNodeFinalizationAnchors(f.features,f.network,sampleFeatureSurfaceY,f.ground));
  assert.deepEqual(f.features.map(r=>[...r.transportSurfaceModel.centerHeights]),before);
 }
});
test('unreviewed, malformed, too narrow or over-grade deck sources fail closed',()=>{
 for(const mutate of [r=>r.surfaceSurveyEvidence.deckProfile.contentSha256='changed',r=>r.surfaceSurveyEvidence.deckProfile.samples[1].centerY=100,
  r=>r.surfaceSurveyEvidence.deckProfile.samples[0].crossfall=.2,r=>r.surfaceSurveyEvidence.deckProfile.reconstructedWidthMeters=6]){
  const f=fixture();mutate(f.b);assert.throws(()=>f.compile(f.b),/reviewed_deck/);
 }
 const f=fixture();delete f.b.surfaceSurveyEvidence.deckProfile;assert.throws(()=>f.compile(f.b),/invalid_reviewed_road_surface/);
});
test('infeasible ground and obstruction constraints cannot lift or lower an immutable reviewed deck',()=>{
 const f=fixture();f.a.tunnelObstructionLimits=[{start:200,end:200,maximumSurfaceY:5}];
 assert.throws(()=>f.solve(),/reviewed_deck_obstruction_conflict/);
 assert.ok(Math.abs(f.b.transportSurfaceModel.centerHeights[0]-10.08)<.001);
});

test('reviewed deck width metadata rejects nonfinite and unbounded envelopes',()=>{
 for(const value of [Infinity,NaN,31]){const f=fixture();f.b.surfaceSurveyEvidence.deckProfile.reconstructedWidthMeters=value;assert.throws(()=>f.compile(f.b),/invalid_reviewed_deck_profile/);}
});
