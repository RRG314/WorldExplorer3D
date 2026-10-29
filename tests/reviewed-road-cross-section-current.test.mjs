import test from 'node:test';
import assert from 'node:assert/strict';
import {updateFeatureSurfaceProfile,buildFeatureRibbonEdges,sampleFeatureSurfaceY} from '../app/js/structure-semantics.js?v=63';
import {resolveVehicleRoadContactPose} from '../app/js/engine/vehicle-road-attitude.js?v=3';
const terrain=(x,z)=>2+x*.1+z*.02;
const feature=survey=>({sourceFeatureId:'osm:way:1',type:'raceway',width:12,pts:[{x:0,z:0},{x:0,z:100}],
 structureSemantics:{terrainMode:'at_grade'},...(survey?{surfaceSurveyEvidence:{version:1,sourceFeatureId:'osm:way:1',groundArtifactId:'fixture',groundContentSha256:'a'.repeat(64),maximumCrossfall:.15}}:{})});
test('surveyed roads render, sample and support four wheels on one compiled cross-section; ordinary roads retain their planar profile',()=>{
 const road=updateFeatureSurfaceProfile(feature(true),terrain,{surfaceBias:.18});
 const drawing=buildFeatureRibbonEdges(road,road.pts,6,()=>999);
 for(const point of [...drawing.leftEdge,...drawing.rightEdge])assert.ok(Math.abs(point.y-sampleFeatureSurfaceY(road,point.x,point.z))<1e-6);
 assert.ok(Math.abs(drawing.rightEdge[0].y-drawing.leftEdge[0].y-1.2)<1e-5);
 const contact=resolveVehicleRoadContactPose({x:0,z:50,y:3.18,yaw:0,sampleSurface:(x,z)=>sampleFeatureSurfaceY(road,x,z)});
 assert.equal(contact.sampledWheelContacts,4);assert.ok(contact.maximumWheelGap<.001);assert.ok(contact.maximumWheelPenetration<.001);
 assert.ok(Math.abs(contact.roll-Math.atan(.1*Math.cos(Math.atan(.02))))<.001);
 const ordinary=updateFeatureSurfaceProfile(feature(false),terrain);
 assert.equal(sampleFeatureSurfaceY(ordinary,-4,50),sampleFeatureSurfaceY(ordinary,4,50));
});
test('review evidence cannot authorize another road, an engineered deck or excessive crossfall',()=>{
 const wrong=feature(true);wrong.surfaceSurveyEvidence.sourceFeatureId='osm:way:other';
 assert.throws(()=>updateFeatureSurfaceProfile(wrong,terrain),/invalid_reviewed_road_surface/);
 const elevated=feature(true);elevated.structureSemantics.terrainMode='elevated';
 assert.throws(()=>updateFeatureSurfaceProfile(elevated,terrain),/invalid_reviewed_road_surface/);
 assert.throws(()=>updateFeatureSurfaceProfile(feature(true),(x,z)=>x*.3+z*.02),/crossfall_exceeded/);
});
