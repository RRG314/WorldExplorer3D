import test from 'node:test';
import assert from 'node:assert/strict';
import {ctx} from '../app/js/shared-context.js?v=55';
import {refreshStructureAwareFeatureProfiles} from '../app/js/world/structure-aware.js';
import {updateFeatureSurfaceProfile,sampleFeatureSurfaceY,buildFeatureRibbonEdges} from '../app/js/structure-semantics.js?v=63';
import {BANKED_ROAD_MODEL,BANKED_ROAD_MAXIMUM_GRADE} from '../app/js/physics/road-plane-dynamics.js';

function road(id,start,end){
 return {sourceFeatureId:id,networkKind:'road',type:'raceway',width:8,metersPerWorldUnit:1,driveable:true,
  pts:[{x:start,z:0},{x:end,z:0}],sourceNodeIds:[String(start),String(end)],structureSemantics:{terrainMode:'at_grade'},
  surfaceSurveyEvidence:{version:1,sourceFeatureId:id,groundArtifactId:'controlled-ground',groundContentSha256:'a'.repeat(64),maximumCrossfall:.7,surfaceModel:BANKED_ROAD_MODEL},
  transportRecord:{identity:id,completeness:'lossless',routeState:'complete',sourceTags:{highway:'raceway'}},surfaceBias:.18,subdivideMaxDist:2};
}
function isolated(t,roads,ground){
 const saved={...ctx};for(const k of Object.keys(ctx))delete ctx[k];
 Object.assign(ctx,{roads,baseTerrainHeightAt:ground,linearFeatures:[],buildings:[],waterAreas:[],waterways:[]});
 t.after(()=>{ctx.streetFrontageGrading?.dispose?.();ctx.structureTerrainProjectionIndex?.dispose?.();for(const k of Object.keys(ctx))delete ctx[k];Object.assign(ctx,saved);});
}

test('reviewed banked pavement retains a measured 16 percent grade through the same compiled profile and ribbon',()=>{
 const ground=(x,z)=>10+.16*x+.2*z,r=road('banked-grade',0,100);
 updateFeatureSurfaceProfile(r,ground);
 assert.equal(r.transportSurfaceModel.maximumGrade,BANKED_ROAD_MAXIMUM_GRADE);
 for(const x of [0,25,50,75,100])assert.ok(Math.abs(sampleFeatureSurfaceY(r,x,0)-ground(x,0)-.18)<.00001);
 const ribbon=buildFeatureRibbonEdges(r,r.pts,4,ground);
 for(const p of [...ribbon.leftEdge,...ribbon.rightEdge])assert.ok(Math.abs(p.y-ground(p.x,p.z)-.18)<.00001);
});

test('all reviewed banked at-grade source joins receive shared terrain anchors and enter the continuity audit',t=>{
 const ground=(x,z)=>10+.16*x+.7*Math.sin(x/10)+.2*z,roads=[road('before',0,100),road('after',100,200)];
 isolated(t,roads,ground);refreshStructureAwareFeatureProfiles();
 const continuity=ctx.transportJunctionProfile.continuity;
 assert.equal(continuity.authoritativeConnectionCount,1);assert.equal(continuity.sampledConnectionCount,1);assert.equal(continuity.discontinuityCount,0);
 for(const z of [-1.2,0,1.2])assert.ok(Math.abs(sampleFeatureSurfaceY(roads[0],100,z)-sampleFeatureSurfaceY(roads[1],100,z))<.00001);
 for(const r of roads){assert.equal(r.transportSurfaceModel.reviewedSurfacePhase,'accepted');assert.equal(r.transportSurfaceModel.engineeredApproach,false);assert.ok(r.transportSurfaceModel.stats.maximumGrade<=.22002);}
});

test('a source endpoint grade outside the supported envelope fails rather than promoting a reviewed road above its contract',()=>{
 const r=road('too-steep',0,100);
 assert.throws(()=>updateFeatureSurfaceProfile(r,(x,z)=>10+.24*x+.2*z),/reviewed_road_surface_grade_exceeded/);
});
