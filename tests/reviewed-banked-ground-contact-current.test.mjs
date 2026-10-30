import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleEarthVehicleGroundContact} from '../app/js/physics/vehicle-surface.js';
function fixture({yaw=0,grade=0,bank=-.60584457947}={}){
 const venue={id:'controlled',sourceFeatureIds:['track']},evidence={venueSource:venue,surfaceModel:'banked-road-v1',sourceFeatureId:'track'},feature={sourceFeatureId:'track',surfaceSurveyEvidence:evidence,transportSurfaceModel:{reviewedSurfacePhase:'accepted',surveyedSurface:{...evidence}}},x=12,z=-20;
 const height=(px,pz)=>10+bank*((px-x)*Math.cos(yaw)-(pz-z)*Math.sin(yaw))+grade*((px-x)*Math.sin(yaw)+(pz-z)*Math.cos(yaw));
 const ctx={SurfaceQuery:{driveAt:(px,pz)=>({kind:'road',feature,position:{y:height(px,pz)}})}};
 return {ctx,feature,height,options:{x,z,angle:yaw},venue};
}
test('the existing four-wheel solver fits an explicitly reviewed bank without the ordinary roll cap or highest-wheel hover',()=>{
 for(const yaw of [0,.83,Math.PI])for(const bank of [-.60584457947,.60584457947]){
  const f=fixture({yaw,bank,grade:.12}),c=sampleEarthVehicleGroundContact(f.ctx,f.options),pitch=-Math.atan(.12),roll=Math.atan(bank*Math.cos(pitch));
  assert.ok(Math.abs(c.pitch-pitch)<1e-6);assert.ok(Math.abs(c.roll-roll)<1e-6,'the admitted bank must retain its actual attitude');
  assert.ok(Math.abs(c.supportY-10)<1e-6,'support must fit the rotated wheels instead of raising the whole chassis to the highest probe');
  assert.equal(c.sampledWheelContacts,4);assert.ok(c.maximumWheelGap<1e-6);assert.ok(c.maximumWheelPenetration<1e-6);assert.equal(c.sampleCount,5);
 }
});
test('ordinary, provisional and unmatched venue roads retain their existing conservative contact',()=>{
 for(const change of [f=>delete f.feature.surfaceSurveyEvidence,f=>f.feature.transportSurfaceModel.reviewedSurfacePhase='preparation',f=>f.feature.surfaceSurveyEvidence={...f.feature.surfaceSurveyEvidence,venueSource:{...f.venue}},f=>f.feature.transportSurfaceModel.surveyedSurface.surfaceModel='ordinary']){
  const f=fixture();change(f);const c=sampleEarthVehicleGroundContact(f.ctx,f.options);assert.equal(c.roll,-.45);assert.equal(c.supportY,10+.60584457947*.85);assert.equal(c.sampledWheelContacts,undefined);
 }
});
test('missing rotated-wheel road support falls back without accepting an adjacent terrain or separate deck',()=>{
 const f=fixture(),read=f.ctx.SurfaceQuery.driveAt;f.ctx.SurfaceQuery.driveAt=(x,z)=>Math.abs(x-f.options.x)>.3&&Math.abs(z-f.options.z)>.3?{kind:'terrain',position:{y:100}}:read(x,z);
 const c=sampleEarthVehicleGroundContact(f.ctx,f.options);assert.equal(c.sampledWheelContacts,undefined);assert.equal(c.roll,-.45);assert.ok(c.supportY<11);
});
