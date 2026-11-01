import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewedDeckSurveyInWorld} from '../app/js/world/reviewed-deck-world-profile.js';
import {earthCoordinateFrame} from '../app/js/earth-core/coordinate-frame.js';
import {compileTransportSurfaceModel,sampleTransportSurfaceAtDistance} from '../app/js/world/compiler/transport-surface-model.js';

test('geographic decks preserve height and the signed crossfall in the actual Earth frame, in either source direction and world scale',()=>{
 for(const scale of [100000,111000])for(const reverse of [false,true]){
  const frame=earthCoordinateFrame({lat:50,lon:7},scale),geoToWorld=(lat,lon)=>frame.toWorld(lat,lon),heightToWorld=y=>y*scale/111000;
  const a={latitude:50,longitude:7},b={latitude:50.0005,longitude:7.0005},rows=[a,b];if(reverse)rows.reverse();
  const points=rows.map(p=>geoToWorld(p.latitude,p.longitude)),sourceFeatureId='osm:way:bridge';
  const deck={contentSha256:'b'.repeat(64),observedCoreWidthMeters:4,reconstructedWidthMeters:8,samples:rows.map((p,i)=>({...p,sourceSegment:0,fraction:i,heightMetersEgm2008:100+i,
   positiveNormal:{latitude:p.latitude+1/111000,longitude:p.longitude,heightMetersEgm2008:100+i+.04}}))};
  const survey={version:1,sourceFeatureId,groundArtifactId:'ground',groundContentSha256:'a'.repeat(64),maximumCrossfall:.15,geographicDeckProfile:deck};
  const converted=reviewedDeckSurveyInWorld(survey,points,{geoToWorld,heightToWorld});
  assert.equal(converted.geographicDeckProfile,undefined);assert.ok(Object.isFrozen(converted.deckProfile.samples[0]));
  assert.equal(converted.deckProfile.samples[0].t,0);assert.equal(converted.deckProfile.samples.at(-1).t,1);
  assert.ok(converted.deckProfile.samples.every(s=>s.crossfall*(reverse?-1:1)<0));
  const model=compileTransportSurfaceModel({pts:points,sourceFeatureId,width:8*scale/111000,metersPerWorldUnit:111000/scale,surfaceBias:.18,
   structureSemantics:{terrainMode:'elevated',isBridge:true},surfaceSurveyEvidence:converted},()=>heightToWorld(90));
  assert.ok(Math.abs(sampleTransportSurfaceAtDistance(model,0)-heightToWorld(100)-.18)<1e-5);
  const first=converted.deckProfile.samples[0];assert.ok(Math.abs(sampleTransportSurfaceAtDistance(model,0,1)-sampleTransportSurfaceAtDistance(model,0)-first.crossfall)<1e-5);
  deck.samples[0].heightMetersEgm2008=999;assert.equal(first.centerY,heightToWorld(100));
 }
});

test('a changed road path or a nonfinite height conversion cannot confer reviewed deck authority',()=>{
 const survey={geographicDeckProfile:{samples:[{sourceSegment:0,fraction:0,latitude:0,longitude:0,heightMetersEgm2008:1,positiveNormal:{latitude:1,longitude:1,heightMetersEgm2008:1}}]}};
 const points=[{x:0,z:0},{x:10,z:0}],frame={geoToWorld:(lat,lon)=>({x:lon,z:lat}),heightToWorld:y=>y};
 assert.throws(()=>reviewedDeckSurveyInWorld(survey,[{x:5,z:0},points[1]],frame),/source_path_changed/);
 assert.throws(()=>reviewedDeckSurveyInWorld(survey,points,{...frame,heightToWorld:()=>NaN}),/world_frame_invalid/);
 assert.equal(reviewedDeckSurveyInWorld(null,points,frame),null);
});
