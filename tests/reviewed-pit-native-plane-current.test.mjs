import test from 'node:test';import assert from 'node:assert/strict';
import {validateRoadPavementSections,roadPavementSectionsInWorld} from '../app/js/world/road-pavement-sections.js';
import {compileTransportSurfaceModel as compile,attachCompiledTransportSurface as attach,packCompiledTransportSurfaces as pack,sampleTransportSurfaceAtDistance as sample} from '../app/js/world/compiler/transport-surface-model.js?v=25';
const binding={venueId:'controlled-pit',sourceFeatureId:'osm:way:12',sourceSha256:'a'.repeat(64),nodeIds:[1,2]},fit={version:1,halfWidthMeters:3,maximumCoreResidualMeters:.05,maximumEdgeDepartureMeters:.9};
function fixture(unit=1){const raw={version:1,...binding,observationSha256:'b'.repeat(64),nativePlaneFit:fit,samples:[{segment:0,fraction:0,positiveMeters:8,negativeMeters:8,bankNegativeMeters:7},{segment:0,fraction:1,positiveMeters:8,negativeMeters:8,bankNegativeMeters:7}]},pts=[{x:0,z:0},{x:0,z:200/unit}],sections=roadPavementSectionsInWorld(validateRoadPavementSections(raw,binding),pts,unit),venue={id:binding.venueId,sourceSha256:binding.sourceSha256,sourceFeatureIds:['osm:way:11'],pitSourceFeatureIds:[binding.sourceFeatureId]},evidence={version:1,venueId:binding.venueId,venueSource:venue,sourceFeatureId:binding.sourceFeatureId,surfaceModel:'banked-road-v1',maximumCrossfall:.15,usableWidthMeters:6,groundArtifactId:'controlled-native',groundContentSha256:'c'.repeat(64),pavementSections:sections},feature={sourceFeatureId:binding.sourceFeatureId,pts,width:16/unit,metersPerWorldUnit:unit,surfaceBias:.08,structureSemantics:{terrainMode:'at_grade'},surfaceSurveyEvidence:evidence,transportRecord:{crossSection:{widthMeters:16,pavementSections:sections}}},native=(x,z)=>(500+.02*z*unit-.03*x*unit+(x*unit>7.3?.6:0))/unit;return {raw,feature,native,unit};}

test('reviewed pit fits only its native core through the existing compiler, preserving unit scale and all final profile bounds',()=>{
 for(const unit of [1,1.11,2]){const f=fixture(unit),model=compile(f.feature,f.native,{sampleStep:2/unit});attach(f.feature,model);assert.equal(pack([f.feature]).profiles,1);const final=f.feature.transportSurfaceModel;
  assert.ok(final.maximumReviewedCrossfall<.031);assert.ok(final.maximumReviewedNativeCoreResidualMeters<.00001);assert.ok(Math.abs(final.maximumReviewedNativeEdgeDepartureMeters-.6)<.00001);
  for(const d of [20,60,120])for(const lateral of [-8,-3,0,3,8])assert.ok(Math.abs((sample(final,d/unit,lateral/unit)-.08)*unit-(500+.02*d+.03*lateral))<.0001,'one compiled plane supplies all lateral contacts and converts metres once');
  assert.equal(final.pavementHeightDeltas.buffer,final.centerHeights.buffer);
 }
 const f=fixture(),raw={...f.feature.surfaceSurveyEvidence.pavementSections,nativePlaneFit:undefined};f.feature.surfaceSurveyEvidence={...f.feature.surfaceSurveyEvidence,pavementSections:raw};assert.throws(()=>compile(f.feature,f.native),/crossfall_exceeded/,'the native outer-edge fold reproduces the actual failed boundary');
});

test('core distortion, far-edge departure, forged ownership and invented fit permissions stay rejected',()=>{
 const f=fixture();assert.throws(()=>compile(f.feature,(x,z)=>f.native(x,z)+(Math.abs(x)<.5?.15:0)),/native_fit_exceeded/);assert.throws(()=>compile(f.feature,(x,z)=>f.native(x,z)+(x>7.3?.4:0)),/native_fit_exceeded/);
 const alien=fixture();alien.feature.surfaceSurveyEvidence={...alien.feature.surfaceSurveyEvidence,venueSource:{...alien.feature.surfaceSurveyEvidence.venueSource,pitSourceFeatureIds:[]}};assert.throws(()=>compile(alien.feature,alien.native),/native_fit_source_required/);
 for(const patch of [{halfWidthMeters:3.1},{maximumCoreResidualMeters:.051},{maximumEdgeDepartureMeters:1.1},{version:2}])assert.throws(()=>validateRoadPavementSections({...f.raw,nativePlaneFit:{...fit,...patch}},binding),/sections_invalid/);
 assert.throws(()=>validateRoadPavementSections({...f.raw,bankingReference:{url:'https://example.org/angles'},samples:f.raw.samples.map(s=>({...s,bankAngleDegrees:3}))},binding),/sections_invalid/);
});
