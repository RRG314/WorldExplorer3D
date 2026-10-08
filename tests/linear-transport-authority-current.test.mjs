import test from 'node:test';
import assert from 'node:assert/strict';
import {createLinearFeatureRuntime} from '../app/js/world/load-linear-runtime.js';
function runtime(){
 const ctx={linearFeatures:[],geoToWorld:(lat,lon)=>({x:lon,z:lat})};
 const api=createLinearFeatureRuntime({appCtx:ctx,enableLinearFeatures:true,
  classifyLinearFeatureTags:t=>({kind:t.railway?'railway':'footway',subtype:t.highway||t.railway}),
  linearFeatureVisualSpec:()=>({width:2,bias:.08}),classifyStructureSemantics:()=>({terrainMode:'subgrade',gradeSeparated:true,physicalStructureEvidence:true}),
  cloneStructureSemantics:s=>({...s}),decimatePoints:p=>p,sanitizeWorldPathPoints:p=>p,
  polylineBounds:()=>({}),applyBuildingContextSemanticsToFeature:()=>{},updateFeatureSurfaceProfile:()=>{},refreshStructureAwareFeatureProfiles:()=>{},worldBaseTerrainY:()=>0});
 return {ctx,api};
}
test('mapped pedestrian and rail features retain source identity, topology and truncation evidence',()=>{
 const {ctx,api}=runtime();
 const nodes={1:{id:1,lat:0,lon:0},2:{id:2,lat:0,lon:4},3:{id:3,lat:0,lon:8}};
 const way={id:-1581,nodes:[1,2,3],tags:{highway:'steps',tunnel:'yes',_sourceFeatureId:'shortbread:streets:14:1:1:5:0',_sourceCompleteness:'generalized'}};
 api.buildImmediateLinearFeatureDataPass({nodes,footwayWays:[way],structureConnectorWays:[way],deferStructureRefresh:true,startLoadPhase:()=>{},endLoadPhase:()=>{}});
 assert.equal(ctx.linearFeatures.length,1,'the same way in overlapping classifications is published once');
 const feature=ctx.linearFeatures[0];
 assert.equal(feature.sourceFeatureId,way.tags._sourceFeatureId);
 assert.equal(feature.transportRecord.completeness,'generalized');assert.equal(feature.transportRecord.routeState,'complete');
 assert.equal(feature.transportRecord.sourceTags.highway,'steps');assert.equal(feature.driveable,false);
 assert.deepEqual(feature.sourceNodeIds,['1','2','3']);
 const rail={id:77,nodes:[1,2,4],tags:{railway:'rail',tunnel:'yes'}};
 api.buildImmediateLinearFeatureDataPass({nodes,railwayWays:[rail],deferStructureRefresh:true,startLoadPhase:()=>{},endLoadPhase:()=>{}});
 assert.equal(ctx.linearFeatures[1].transportRecord.routeState,'incomplete');
 assert.equal(ctx.linearFeatures[1].transportRecord.safeForDriving,false);
});
test('exact mapped paths preserve only source topology actually retained after geometry guards',()=>{
 const {ctx,api}=runtime();
 api.addLinearFeatureRecord([{x:0,z:0},{x:8,z:0}],{sourceFeatureId:'99',highway:'footway',tunnel:'yes'},{sourceNodes:[{id:1},{id:2},{id:3}],sourcePoints:[{x:0,z:0},{x:4,z:0},{x:8,z:0}]});
 assert.equal(ctx.linearFeatures[0].transportRecord.completeness,'lossless');
 assert.deepEqual(ctx.linearFeatures[0].sourceNodeIds,['1','3']);
});
