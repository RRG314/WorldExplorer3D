import test from 'node:test';
import assert from 'node:assert/strict';
import {ctx} from '../app/js/shared-context.js?v=55';
import {refreshStructureAwareFeatureProfiles} from '../app/js/world/structure-aware.js';
import {updateFeatureSurfaceProfile,sampleFeatureSurfaceY,buildFeatureRibbonEdges} from '../app/js/structure-semantics.js?v=63';
import {resolveVehicleRoadContactPose} from '../app/js/engine/vehicle-road-attitude.js?v=3';
import {createCompiledRoadSurfaceSampler} from '../app/js/terrain/rebuild.js';
import {collectRaceDistrict} from '../app/js/racing/world-course-source.js';

function road(id,start,end,mode='at_grade'){
 return {sourceFeatureId:id,networkKind:'road',type:'raceway',width:8,metersPerWorldUnit:1,driveable:true,
  pts:[{x:start,z:0},{x:end,z:0}],sourceNodeIds:[String(start),String(end)],structureSemantics:{terrainMode:mode,isBridge:mode==='elevated',gradeSeparated:mode==='elevated'},
  surfaceSurveyEvidence:{version:1,sourceFeatureId:id,groundArtifactId:'controlled-ground',groundContentSha256:'a'.repeat(64),maximumCrossfall:.7,surfaceModel:'banked-road-v1'},
  transportRecord:{identity:id,completeness:'lossless',routeState:'complete',sourceTags:{highway:'raceway'}},surfaceBias:.18,subdivideMaxDist:2};
}
function measured(r,center,crossfall=.04,kind='pavementProfile'){
 r.surfaceSurveyEvidence[kind]={version:1,coordinateFrame:'world',contentSha256:'b'.repeat(64),observedCoreWidthMeters:4,reconstructedWidthMeters:8,
  ...(kind==='pavementProfile'?{maximumAdjustmentMeters:.05}:{}),samples:Array.from({length:51},(_,i)=>{const t=i/50,x=r.pts[0].x+(r.pts[1].x-r.pts[0].x)*t;return {t,centerY:center(x),crossfall};})};return r;
}
function isolate(t,roads,ground){const saved={...ctx};for(const k of Object.keys(ctx))delete ctx[k];
 Object.assign(ctx,{roads,linearFeatures:[],buildings:[],waterAreas:[],waterways:[],baseTerrainHeightAt:ground});
 t.after(()=>{ctx.streetFrontageGrading?.dispose?.();ctx.structureTerrainProjectionIndex?.dispose?.();for(const k of Object.keys(ctx))delete ctx[k];Object.assign(ctx,saved);});
}

test('observed pavement owns the existing profile, ribbon and four wheel contacts above a bare-earth hollow',()=>{
 const center=x=>10+.02*x,ground=(x,z)=>center(x)+.1*z-1.3*Math.exp(-(((x-10)/6)**2)),r=measured(road('pavement',0,100),center,.1);
 updateFeatureSurfaceProfile(r,ground);assert.equal(r.transportSurfaceModel.endpointPolicy,'reviewed_pavement_profile');
 assert.ok(Math.abs(createCompiledRoadSurfaceSampler(r,()=>999)(10,0)-center(10)-.18)<.00001,'rendering must retain the independent observed profile');
 assert.ok(r.transportSurfaceModel.maximumReviewedPavementDepartureMeters<.00001);
 for(const x of [0,5,10,15,50,100])for(const z of [-1.2,0,1.2])assert.ok(Math.abs(sampleFeatureSurfaceY(r,x,z)-center(x)-.1*z-.18)<.00001);
 const ribbon=buildFeatureRibbonEdges(r,r.pts,4,ground);for(const p of [...ribbon.leftEdge,...ribbon.rightEdge])assert.ok(Math.abs(p.y-center(p.x)-.1*p.z-.18)<.00001);
 const contact=resolveVehicleRoadContactPose({x:10,z:0,y:center(10)+.18,yaw:Math.PI/2,sampleSurface:(x,z)=>sampleFeatureSurfaceY(r,x,z)});
 assert.equal(contact.sampledWheelContacts,4);assert.ok(contact.maximumWheelGap<.001);assert.ok(contact.maximumWheelPenetration<.001);
});

test('qualification cannot replace an independently observed pavement with a different ground-road height',async()=>{
 const r=measured(road('observed',0,100),x=>10+.02*x);updateFeatureSurfaceProfile(r,()=>9);
 const context={METERS_PER_WORLD_UNIT:1,worldPublication:{requestId:'controlled',location:{lat:50,lon:7}},buildings:[],
  buildTraversalNetworks:()=>({drive:{segments:[{feature:r,p1:r.pts[0],p2:r.pts[1],segIndex:0,sourceTStart:0,sourceTEnd:1,fromId:0,toId:1,direction:'forward'}]}}),
  sampleFeatureSurfaceY,transportDetail:{hasReadyCoverageAt:()=>true},SurfaceQuery:{driveAt:()=>({kind:'road',position:{y:9}})}};
 await assert.rejects(collectRaceDistrict(context,{yieldWork:async()=>{}}),/no_qualified/);
});

test('measured at-grade endpoints also anchor adjoining terrain-owned roads without promoting them to bridges',t=>{
 const center=x=>10+.02*x,ground=(x,z)=>center(x)+.04*z-.07;
 const a=measured(road('pavement',0,100),center),b=road('ordinary-continuation',100,200);
 isolate(t,[a,b],ground);refreshStructureAwareFeatureProfiles();
 assert.equal(ctx.transportJunctionProfile.continuity.sampledConnectionCount,1);
 for(const z of [-1.2,0,1.2])assert.ok(Math.abs(sampleFeatureSurfaceY(a,100,z)-sampleFeatureSurfaceY(b,100,z))<.00001);
 assert.ok(Math.abs(sampleFeatureSurfaceY(a,100,0)-12.18)<.00001);
 assert.equal(b.transportSurfaceModel.engineeredApproach,false);
});

function bridgeFixture(t,{heightConflict=0,camberConflict=0}={}){
 const center=x=>x<0?10+x*.05:x<=40?10+x*.05:12-(x-40)*.05;
 const a=measured(road('entry',-200,0),x=>center(x)-heightConflict,.04+camberConflict),b=measured(road('deck',0,40,'elevated'),center,.04,'deckProfile'),c=measured(road('exit',40,240),center);
 const ground=(x,z)=>center(x)+.04*z-5*Math.exp(-((Math.max(0,-x,x-40)/10)**2));
 isolate(t,[a,b,c],ground);return {a,b,c,center,ground};
}
test('native approach curves meet the immutable deck without inventing a steep bare-earth ramp',t=>{
 const f=bridgeFixture(t);refreshStructureAwareFeatureProfiles();
 assert.equal(ctx.transportJunctionProfile.continuity.discontinuityCount,0);
 for(const r of [f.a,f.c]){
  assert.ok(r.transportSurfaceModel.maximumReviewedPavementDepartureMeters<.00002);
  for(const x of [r.pts[0].x,(r.pts[0].x+r.pts[1].x)/2,r.pts[1].x])assert.ok(Math.abs(sampleFeatureSurfaceY(r,x,0)-f.center(x)-.18)<.00002);
 }
 assert.ok(f.a.transportSurfaceModel.stats.maximumGrade<.051);
});

test('a rotated approach receives the complete measured deck plane, including its longitudinal grade',t=>{
 const a=measured(road('graded-deck',0,40,'elevated'),x=>10+x*.05,0,'deckProfile'),b=road('turning-approach',40,240);
 b.pts=[{x:40,z:0},{x:40,z:200}];b.sourceNodeIds=['40','exit'];measured(b,()=>12,-.05);
 const ground=(x,z)=>10+x*.05-5*Math.exp(-((Math.max(0,z)/10)**2));
 isolate(t,[a,b],ground);refreshStructureAwareFeatureProfiles();
 const anchor=b.structureTransitionAnchors.find(a=>Number.isFinite(a.reviewedDeckCrossfall));
 assert.ok(Math.abs(anchor.reviewedDeckCrossfall+.05)<.000001);
 assert.ok(b.transportSurfaceModel.maximumReviewedPavementDepartureMeters<.00001);
});
for(const [name,conflict]of [['height',{heightConflict:.2}],['camber',{camberConflict:.1}]])test('a measured '+name+' conflict cannot be hidden by a smooth graph join',t=>{
 bridgeFixture(t,conflict);const prior=Object.freeze({identity:'prior'});ctx.transportTerrainCorridorPublication=prior;
 assert.throws(()=>refreshStructureAwareFeatureProfiles(),/reviewed_road_pavement_conflict/);
 assert.equal(ctx.transportTerrainCorridorPublication,prior);assert.equal(ctx.structureProfileCompilation,undefined);
});

test('malformed, excessive-grade or wrong-mode pavement evidence fails closed',()=>{
 for(const change of [r=>r.surfaceSurveyEvidence.pavementProfile.maximumAdjustmentMeters=.051,r=>r.surfaceSurveyEvidence.pavementProfile.samples[25].centerY=100,
  r=>r.surfaceSurveyEvidence.pavementProfile.reconstructedWidthMeters=6,r=>r.structureSemantics.terrainMode='elevated']){
  const r=measured(road('invalid',0,100),x=>10+.02*x);change(r);assert.throws(()=>updateFeatureSurfaceProfile(r,()=>0),/reviewed_pavement/);
 }
});
