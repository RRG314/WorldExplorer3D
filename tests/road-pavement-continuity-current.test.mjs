import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRoadPavementSections,roadPavementSectionsInWorld} from '../app/js/world/road-pavement-sections.js';
import {compileTransportSurfaceModel,attachCompiledTransportSurface} from '../app/js/world/compiler/transport-surface-model.js?v=25';
import {sampleFeatureSurfaceY,projectPointToFeature} from '../app/js/structure-semantics.js?v=63';
import {createTerrainHeightSamplingApi} from '../app/js/terrain/height-sampling.js';
import {roadPavementNodeFrames,roadPavementFrameAtSegment,projectRoadPavementPoint} from '../app/js/world/road-pavement-coordinate-frame.js';

const slope=Math.tan(31*Math.PI/180),apron=Math.tan(1.5*Math.PI/180);
function curve(){
 const pts=[{x:0,z:0},{x:0,z:100},{x:10,z:200}],binding={venueId:'controlled-oval',sourceFeatureId:'osm:way:11',sourceSha256:'a'.repeat(64),nodeIds:[1,2,3]},
  raw={version:1,...binding,observationSha256:'b'.repeat(64),bankingReference:{url:'https://www.nascar.com/gallery/inside-look-at-all-isc-tracks/'},apronInterpretation:'authored-drainage-plane-native-inner-anchor',samples:[{segment:0,fraction:0},{segment:1,fraction:1}].map(s=>({...s,positiveMeters:3,negativeMeters:15,bankNegativeMeters:6,bankAngleDegrees:31,apronAngleDegrees:1.5}))},
  profile=roadPavementSectionsInWorld(validateRoadPavementSections(raw,binding),pts,1),native=(x,z)=>{const l=Math.max(0,(z-100)*.1)-x;return 500+z*.06+slope*Math.max(-6,Math.min(3,l))+apron*Math.min(0,l+6);},
  feature={sourceFeatureId:binding.sourceFeatureId,pts,width:18,surfaceBias:.18,metersPerWorldUnit:1,structureSemantics:{terrainMode:'at_grade'},surfaceSurveyEvidence:{version:1,venueId:binding.venueId,sourceFeatureId:binding.sourceFeatureId,surfaceModel:'banked-road-v1',maximumCrossfall:.7,usableWidthMeters:6,groundArtifactId:'controlled-native',groundContentSha256:'c'.repeat(64),pavementSections:profile,terrainEdgePolicy:'fitted-pavement-boundary-v1'},transportRecord:{crossSection:{widthMeters:18,pavementSections:profile}}};
 attachCompiledTransportSurface(feature,compileTransportSurfaceModel(feature,native,{surfaceBias:.18,sampleStep:2}));
 return {feature,native};
}

test('a full-width bank and apron have one continuous height across a graded source-node transect',()=>{
 const {feature,native}=curve(),grade=createTerrainHeightSamplingApi({appCtx:{structureTerrainCuts:[feature]},elevationWorldYAtWorldXZ:native}),
  // Exact intersection of the two parallel six-metre inward offset lines.
  knee={x:6,z:100-6*(Math.sqrt(1.01)-1)/.1};
 for(const lateral of [-15,-6,-5,0,3]){
  const x=knee.x*(-lateral/6),z=100+(knee.z-100)*(-lateral/6),before={x,z:z-.000001},after={x,z:z+.000001},
   a=sampleFeatureSurfaceY(feature,before.x,before.z),b=sampleFeatureSurfaceY(feature,after.x,after.z);
  assert.ok(Math.abs(a-b)<.0001,`source-node lateral ${lateral} jumps ${Math.abs(a-b)} world units`);
  const ga=grade.applyStructureTerrainCuts(before.x,before.z,native(before.x,before.z)),gb=grade.applyStructureTerrainCuts(after.x,after.z,native(after.x,after.z));
  assert.ok(Math.abs(ga-gb)<.0001,`terrain grading must share the continuous surface at ${lateral}`);
 }
 assert.deepEqual(feature.pts,[{x:0,z:0},{x:0,z:100},{x:10,z:200}]);
 // Navigation and published-profile readers may supply an ordinary projection.
 const projection={segIndex:0,t:1,x:0,z:100};
 assert.ok(Math.abs(sampleFeatureSurfaceY(feature,knee.x,knee.z,projection)-sampleFeatureSurfaceY(feature,knee.x,knee.z))<1e-10);
 assert.ok(Number.isFinite(projectPointToFeature(feature,knee.x,knee.z).dist));
});

test('swept coordinates round-trip the full asymmetric section, including adjoining-way end transects',()=>{
 const {feature}=curve(),profile=feature.transportRecord.crossSection.pavementSections;
 for(let segment=0;segment<2;segment++)for(const t of [0,.01,.25,.9,.999,1])for(const lateral of [-15,-6,0,3]){
  const a=feature.pts[segment],b=feature.pts[segment+1],n=roadPavementFrameAtSegment(profile,segment,t),
   x=a.x+(b.x-a.x)*t+n.x*lateral,z=a.z+(b.z-a.z)*t+n.z*lateral,p=projectPointToFeature(feature,x,z);
  assert.ok(Math.abs(p.pavementLateral-lateral)<1e-8);
  const d=profile.nodeDistances[p.segIndex]+(profile.nodeDistances[p.segIndex+1]-profile.nodeDistances[p.segIndex])*p.t;
  assert.ok(Math.abs(d-(profile.nodeDistances[segment]+(profile.nodeDistances[segment+1]-profile.nodeDistances[segment])*t))<1e-7);
 }
 const left=feature.pts.slice(0,2),right=feature.pts.slice(1),lf=roadPavementNodeFrames(left,{end:right[1]}),rf=roadPavementNodeFrames(right,{start:left[0]});
 assert.deepEqual(lf[1],rf[0]);assert.deepEqual(lf[1],profile.nodeFrames[1]);
 const n=lf[1],x=left[1].x+n.x*-15,z=left[1].z+n.z*-15,
  a={pts:left,transportRecord:{crossSection:{pavementSections:{nodeFrames:lf}}}},b={pts:right,transportRecord:{crossSection:{pavementSections:{nodeFrames:rf}}}},
  pa=projectRoadPavementPoint(a,x,z,{segIndex:0,t:1}),pb=projectRoadPavementPoint(b,x,z,{segIndex:0,t:0});
 assert.ok(Math.abs(pa.pavementAlongResidual)<1e-9);assert.ok(Math.abs(pb.pavementAlongResidual)<1e-9);
 assert.ok(Math.abs(pa.pavementLateral-pb.pavementLateral)<1e-9);
});

test('a connected source end cannot grade its old plane over the next way’s banking transition',()=>{
 const bank=z=>Math.tan((3+28*Math.max(0,Math.min(1,(z-100)/40)))*Math.PI/180),native=(x,z)=>100+bank(z)*(6-Math.min(x,6))+apron*(15-Math.max(6,x));
 function road(id,start,end,angles,continuations){
  const pts=[{x:0,z:start},{x:0,z:end}],binding={venueId:'controlled-oval',sourceFeatureId:`osm:way:${id}`,sourceSha256:'a'.repeat(64),nodeIds:[id,id+1]},raw={version:1,...binding,observationSha256:'b'.repeat(64),bankingReference:{url:'https://www.nascar.com/gallery/inside-look-at-all-isc-tracks/'},apronInterpretation:'authored-drainage-plane-native-inner-anchor',samples:angles.map(([fraction,bankAngleDegrees])=>({segment:0,fraction,positiveMeters:4,negativeMeters:15,bankNegativeMeters:6,bankAngleDegrees,apronAngleDegrees:1.5}))},profile=roadPavementSectionsInWorld({...validateRoadPavementSections(raw,binding),geographicContinuations:continuations},pts,1,{geoToWorld:(lat,lon)=>({x:lon,z:lat})}),feature={sourceFeatureId:binding.sourceFeatureId,pts,width:19,surfaceBias:.18,metersPerWorldUnit:1,structureSemantics:{terrainMode:'at_grade'},surfaceSurveyEvidence:{version:1,venueId:binding.venueId,sourceFeatureId:binding.sourceFeatureId,surfaceModel:'banked-road-v1',maximumCrossfall:.7,usableWidthMeters:6,groundArtifactId:'controlled-native',groundContentSha256:'c'.repeat(64),pavementSections:profile,terrainEdgePolicy:'fitted-pavement-boundary-v1'},transportRecord:{crossSection:{widthMeters:19,pavementSections:profile}}};
  attachCompiledTransportSurface(feature,compileTransportSurfaceModel(feature,native,{surfaceBias:.18,sampleStep:2}));return feature;
 }
 const first=road(11,0,100,[[0,3],[1,3]],{end:{lat:200,lon:0}}),second=road(12,100,200,[[0,3],[.4,31],[1,31]],{start:{lat:0,lon:0}}),grade=roads=>createTerrainHeightSamplingApi({appCtx:{structureTerrainCuts:roads},elevationWorldYAtWorldXZ:native}).applyStructureTerrainCuts,
  joined=grade([first,second]),nextOnly=grade([second]),openFirst={...first,transportRecord:{crossSection:{...first.transportRecord.crossSection,pavementSections:{...first.transportRecord.crossSection.pavementSections,connectedEnds:undefined}}}},old=grade([openFirst,second]);
 assert.deepEqual(first.transportRecord.crossSection.pavementSections.connectedEnds,{start:false,end:true});
 for(const z of [102,105,110])for(const x of [-3,0,6,12])assert.ok(Math.abs(joined(x,z,native(x,z))-nextOnly(x,z,native(x,z)))<1e-10,'the actual continuation alone owns its side of the source transect');
 assert.ok(Math.abs(old(-3,105,native(-3,105))-nextOnly(-3,105,native(-3,105)))>.05,'the old extrapolated end plane reproduces the transition distortion');
});
