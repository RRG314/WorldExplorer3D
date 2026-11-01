import test from 'node:test';import assert from 'node:assert/strict';
import {validateRoadPavementSections,roadPavementSectionsInWorld,sampleRoadPavementSection} from '../app/js/world/road-pavement-sections.js';
const binding={venueId:'controlled-oval',sourceFeatureId:'osm:way:11',sourceSha256:'a'.repeat(64),nodeIds:[1,2,3]},raw={version:1,...binding,observationSha256:'b'.repeat(64),samples:[
 {segment:0,fraction:0,positiveMeters:6,negativeMeters:15,bankNegativeMeters:6},
 {segment:1,fraction:1,positiveMeters:6,negativeMeters:18,bankNegativeMeters:9}
]};
test('a bank and asymmetric apron retain source-node distances and convert physical units once',()=>{
 const validated=validateRoadPavementSections(raw,binding),points=[{x:100,z:20},{x:100,z:30},{x:130,z:30}],profile=roadPavementSectionsInWorld(validated,points,2);
 assert.equal(profile.length,40);assert.throws(()=>roadPavementSectionsInWorld(profile,points,2),/coordinates_invalid/);const quarter=sampleRoadPavementSection(profile,10);assert.equal(quarter.positive,3);assert.equal(quarter.negative,7.875);assert.equal(quarter.bankNegative,3.375);
 assert.equal(quarter.width,10.875);assert.equal(quarter.offset,-2.4375);assert.deepEqual(points,[{x:100,z:20},{x:100,z:30},{x:130,z:30}]);
 assert.equal(sampleRoadPavementSection(profile,-10).negative,7.5);assert.equal(sampleRoadPavementSection(profile,50).negative,9);
 // The conservative bank remains separate from the physical apron; a width
 // increase must not move the retained outside boundary or steepen the apron.
 for(let d=0;d<=40;d++){const p=sampleRoadPavementSection(profile,d);assert.ok(Math.abs(p.offset+p.width/2-3)<1e-12);assert.ok(Math.abs(p.offset-p.width/2+p.negative)<1e-12);assert.ok(p.bankNegative<p.negative);}
});
test('a section profile cannot transfer to another way, reordered source nodes or a different source observation',()=>{
 for(const patch of [{sourceFeatureId:'osm:way:12'},{sourceSha256:'c'.repeat(64)},{venueId:'another-oval'},{nodeIds:[1,3,2]}])assert.throws(()=>validateRoadPavementSections(raw,{...binding,...patch}),/sections_invalid/);
 assert.throws(()=>validateRoadPavementSections({...raw,observationSha256:'unverified'},binding),/sections_invalid/);
 for(const patch of [{negativeMeters:27},{bankNegativeMeters:15},{positiveMeters:.2},{fraction:NaN},{segment:2}])assert.throws(()=>validateRoadPavementSections({...raw,samples:[{...raw.samples[0],...patch},raw.samples[1]]},binding),/sections_invalid/);
 assert.throws(()=>validateRoadPavementSections({...raw,samples:[raw.samples[1],raw.samples[0]]},binding),/sections_invalid/);
 assert.throws(()=>roadPavementSectionsInWorld(validateRoadPavementSections(raw,binding),[{x:0,z:0},{x:0,z:0},{x:1,z:0}],1),/coordinates_invalid/);
 assert.throws(()=>sampleRoadPavementSection(raw,0),/coordinates_invalid/);
});

test('only a matching private venue preparation can publish physical pavement wider than its usable bank',async()=>{
 const {annotateRoadSourceSurvey,roadSourceSurvey,reviewedRoadTransportRecord}=await import('../app/js/world/road-source-survey.js'),{reviewedDeckSurveyInWorld}=await import('../app/js/world/reviewed-deck-world-profile.js');
 const way={tags:{pavementWidthPolicy:'profiled',sourcePavementSections:raw}},record={identity:binding.sourceFeatureId,crossSection:{widthMeters:4,widthSource:'derived:lanes',placement:{raw:'',centerlineOffsetMeters:0,status:'absent'}},access:{motorVehicle:'allowed'},safeForDriving:true,provenance:{}},venue={id:binding.venueId,sourceSha256:binding.sourceSha256,sourceFeatureIds:[binding.sourceFeatureId]};
 assert.equal(roadSourceSurvey(way),null);assert.equal(reviewedRoadTransportRecord(record,roadSourceSurvey(way)),record,'provider tags cannot opt into this preparation');
 annotateRoadSourceSurvey(way,{version:1,venueId:binding.venueId,venueSource:venue,sourceFeatureId:binding.sourceFeatureId,pavementWidthPolicy:'profiled',usableWidthMeters:12,sourcePavementSections:validateRoadPavementSections(raw,binding)});
 const survey=reviewedDeckSurveyInWorld(roadSourceSurvey(way),[{x:0,z:0},{x:0,z:10},{x:30,z:10}],{metersPerWorldUnit:2}),published=reviewedRoadTransportRecord(record,survey);
 assert.equal(published.crossSection.widthMeters,24);assert.equal(published.crossSection.widthSource,'reviewed-venue-pavement-sections');assert.equal(published.crossSection.placement.status,'reviewed-pavement-sections');assert.equal(published.crossSection.placement.centerlineOffsetMeters,-5.25);
 assert.equal(record.crossSection.widthMeters,4);assert.equal(survey.usableWidthMeters,12);assert.equal(survey.sourcePavementSections,undefined);assert.equal(published.crossSection.pavementSections,survey.pavementSections);
 assert.throws(()=>reviewedRoadTransportRecord(record,{...survey,venueSource:{...venue,sourceSha256:'c'.repeat(64)}}),/profile_unavailable/);
 assert.throws(()=>reviewedRoadTransportRecord(record,{...survey,usableWidthMeters:13}),/profile_unavailable/);
});

test('the existing swept carriageway keeps its outside edge fixed while the physical apron widens',async()=>{
 const {streetRoadSegments,carriagewaySegmentPolygon}=await import('../app/js/world/compiler/street-carriageway.js'),{roadWidthAtSegment}=await import('../app/js/world/road-cross-section-profile.js?v=1'),{roadPlacementOffsetWorld}=await import('../app/js/world/road-units.js');
 const pts=[{x:0,z:0},{x:0,z:10},{x:0,z:40}],profile=roadPavementSectionsInWorld(validateRoadPavementSections(raw,binding),pts,2),feature={pts,width:12,metersPerWorldUnit:2,transportRecord:{crossSection:{widthMeters:24,pavementSections:profile}}};
 assert.equal(roadWidthAtSegment(feature,0,0)*2,21);assert.equal(roadWidthAtSegment(feature,1,1)*2,24);assert.equal(roadPlacementOffsetWorld(feature,1,1),-3);assert.throws(()=>roadPlacementOffsetWorld(feature),/station_required/);
 let area=0;for(const section of streetRoadSegments(feature)){
  const ring=carriagewaySegmentPolygon(section)[0].slice(0,-1);area+=Math.abs(ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-q[0]*p[1];},0))/2;
  for(const [x,z]of ring){assert.ok(x>=-3-1e-12);if(x<0)assert.ok(Math.abs(x+3)<1e-12);else assert.ok(Math.abs(x-(7.5+1.5*z/40))<1e-12);}
 }
 assert.ok(Math.abs(area-450)<1e-9);assert.deepEqual(pts,[{x:0,z:0},{x:0,z:10},{x:0,z:40}]);
});

test('one compiled publication keeps the documented bank and native apron distinct through packing and graph height correction',async()=>{
 const {compileTransportSurfaceModel:compile,sampleTransportSurfaceAtDistance:sample,attachCompiledTransportSurface:attach,packCompiledTransportSurfaces:pack}=await import('../app/js/world/compiler/transport-surface-model.js?v=25');
 const angle=31,slope=Math.tan(angle*Math.PI/180),points=[{x:0,z:0},{x:0,z:10},{x:0,z:40}],input={...raw,bankingReference:{url:'https://www.nascar.com/gallery/inside-look-at-all-isc-tracks/'},samples:raw.samples.map(s=>({...s,positiveMeters:3,negativeMeters:15,bankNegativeMeters:6,bankAngleDegrees:angle}))},sections=roadPavementSectionsInWorld(validateRoadPavementSections(input,binding),points,1),evidence={version:1,venueId:binding.venueId,sourceFeatureId:binding.sourceFeatureId,surfaceModel:'banked-road-v1',maximumCrossfall:.7,usableWidthMeters:6,groundArtifactId:'controlled-native',groundContentSha256:'c'.repeat(64),pavementSections:sections},feature={sourceFeatureId:binding.sourceFeatureId,pts:points,width:18,metersPerWorldUnit:1,structureSemantics:{terrainMode:'at_grade'},surfaceSurveyEvidence:evidence,transportRecord:{crossSection:{widthMeters:18,pavementSections:sections}}},native=(x,z)=>500+z*.02+slope*Math.max(-6,Math.min(3,-x));
 const model=compile(feature,native,{surfaceBias:.08,sampleStep:2});attach(feature,model);assert.equal(model.width,6,'the conservative usable bank remains separate from physical pavement extent');assert.equal(model.pavementOffsets.length,model.distances.length*4);assert.ok(model.maximumReviewedCrossfall<.7);assert.ok(model.maximumReviewedApronCrossfall<.00001);
 for(let d=0;d<=40;d+=.5)for(let lateral=-15;lateral<=3;lateral+=.5)assert.ok(Math.abs(sample(model,d,lateral)-(native(-lateral,d)+.08))<.00004,'actual compiled bank/apron heights must match both planes');
 assert.ok(Math.abs(sample(model,20,-12)-(500.4+.08-slope*6))<.00004);assert.ok(Math.abs(sample(model,20,-12)-(500.4+.08-slope*3))>1,'clamping the old core plane would leave the apron over a metre high');
 const before=sample(model,10,-12);for(let i=0;i<model.centerHeights.length;i++)model.centerHeights[i]+=.125;
 assert.ok(Math.abs(sample(model,10,-12)-before-.125)<.00004,'a reconciled centre correction must reach every lateral sample');
 const result=pack([feature]);assert.equal(result.profiles,1);const packed=feature.transportSurfaceModel;assert.equal(packed.pavementOffsets.buffer,packed.centerHeights.buffer);assert.equal(packed.pavementHeightDeltas.buffer,packed.centerHeights.buffer);assert.ok(Math.abs(sample(packed,10,-12)-before-.125)<.00004);
 const prepared=compile(feature,native,{surfaceBias:.08,sampleStep:2,reviewedSurfacePhase:'preparation'});attach(feature,prepared);prepared.centerHeights[1]+=.6;assert.throws(()=>pack([feature]),/longitudinal_grade_exceeded/);assert.ok(feature.transportSurfaceModel===prepared,'failed final validation cannot partially publish replacements');
 assert.throws(()=>compile(feature,(x,z)=>native(x,z)+(x>10?5:0),{surfaceBias:.08,sampleStep:2}),/apron_crossfall_exceeded/);
 assert.throws(()=>validateRoadPavementSections({...input,samples:input.samples.map(s=>({...s,bankAngleDegrees:36}))},binding),/sections_invalid/);
});


test('the actual terrain publication and contact triangles preserve the asymmetric bank-to-apron crease',async()=>{
 const {compileTransportSurfaceModel:compile,attachCompiledTransportSurface:attach}=await import('../app/js/world/compiler/transport-surface-model.js?v=25'),
  {createTerrainHeightSamplingApi}=await import('../app/js/terrain/height-sampling.js'),{prepareReviewedDetailedTerrainMesh}=await import('../app/js/terrain/reviewed-detailed-refinement.js'),
  {createRoadBoundaryPartition}=await import('../app/js/terrain/road-boundary-triangulation.js'),{createRoadContactIndex}=await import('../app/js/terrain/road-contact-index.js');
 const slope=Math.tan(31*Math.PI/180),points=[{x:0,z:0},{x:0,z:10},{x:0,z:40}],input={...raw,bankingReference:{url:'https://www.nascar.com/gallery/inside-look-at-all-isc-tracks/'},samples:raw.samples.map(s=>({...s,positiveMeters:3,negativeMeters:15,bankNegativeMeters:6,bankAngleDegrees:31}))},
  sections=roadPavementSectionsInWorld(validateRoadPavementSections(input,binding),points,1),venue={sourceFeatureIds:[binding.sourceFeatureId]},evidence={version:1,venueId:binding.venueId,venueSource:venue,sourceFeatureId:binding.sourceFeatureId,surfaceModel:'banked-road-v1',maximumCrossfall:.7,usableWidthMeters:6,groundArtifactId:'controlled-native',groundContentSha256:'c'.repeat(64),pavementSections:sections,terrainEdgePolicy:'fitted-pavement-boundary-v1'},
  feature={sourceFeatureId:binding.sourceFeatureId,sourceNodeIds:binding.nodeIds,pts:points,width:18,surfaceBias:.08,metersPerWorldUnit:1,structureSemantics:{terrainMode:'at_grade'},surfaceSurveyEvidence:evidence,transportRecord:{crossSection:{widthMeters:18,pavementSections:sections}}},native=(x,z)=>500+z*.02+slope*Math.max(-6,Math.min(3,-x));
 attach(feature,compile(feature,native,{surfaceBias:.08,sampleStep:2}));
 const grade=createTerrainHeightSamplingApi({appCtx:{structureTerrainCuts:[feature]},elevationWorldYAtWorldXZ:native}),partition=createRoadBoundaryPartition([feature],venue),n=4,p=[];
 for(let row=0;row<=n;row++)for(let col=0;col<=n;col++){const x=-20+col*10,z=row*10;p.push(x,native(x,z),z);}
 const mesh={position:{x:0,y:0,z:0},geometry:{parameters:{widthSegments:n},attributes:{position:{array:Float32Array.from(p),count:p.length/3}}}},staged=await prepareReviewedDetailedTerrainMesh(mesh,{segments:[{a:points[0],b:points.at(-1),innerRadius:20,outerRadius:46}],sampleGround:native,gradeGround:grade.applyStructureTerrainCuts,partitionTriangle:partition}),geometry={attributes:{position:{array:staged.positions}},getIndex:()=>({array:staged.indices})},index=createRoadContactIndex([{geometry,userData:{terrainMode:'at_grade'}}]);
 try{
  for(let x=-2.5;x<=14.5;x+=.125){const y=index.sampleAt(x,20);assert.ok(Number.isFinite(y));assert.ok(Math.abs(y-native(x,20))<.0001,`published triangle must fit bank and apron at ${x}`);}
  const vertices=staged.positions,indices=staged.indices;let knee=0;
  for(let i=0;i<indices.length;i+=3){const xs=Array.from(indices.subarray(i,i+3),id=>vertices[id*3]);if(xs.some(x=>Math.abs(x-6)<.00001))knee++;assert.ok(!xs.some(x=>x<6-.00001)||!xs.some(x=>x>6+.00001),'no uploaded triangle spans the bank/apron derivative crease');}
  assert.ok(knee>0);assert.deepEqual(feature.pts,points);
 }finally{index.dispose();}
});


test('actual road worker transfer, driving support and camera collision agree on the asymmetric physical pavement',{timeout:30000},async t=>{
 const {createPavementSectionsFixture}=await import('./fixtures/pavement-sections.js'),{createTransportDetailCompiler}=await import('../app/js/terrain/transport-detail-compiler.js'),{createRoadContactIndex}=await import('../app/js/terrain/road-contact-index.js'),{Worker}=await import('node:worker_threads'),
  {ctx}=await import('../app/js/shared-context.js?v=55'),{GroundHeight}=await import('../app/js/ground.js'),navigation=await import('../app/js/world/navigation.js'),{sampleFeatureSurfaceY}=await import('../app/js/structure-semantics.js?v=63'),{cameraRoadSurfaceHit}=await import('../app/js/world/camera-road-surface.js'),{roadWidthAtProjection}=await import('../app/js/world/road-cross-section-profile.js?v=1');
 const f=await createPavementSectionsFixture(),worker=new Worker(new URL('./fixtures/transport-detail-worker-node.mjs',import.meta.url));
 const prior={roads:ctx.roads,roadContactIndex:ctx.roadContactIndex,car:ctx.car,findNearestRoad:ctx.findNearestRoad};t.after(async()=>{ctx.roadContactIndex?.dispose();Object.assign(ctx,prior);navigation.resetRoadSearchIndex();await worker.terminate();});
 const request=data=>new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);worker.postMessage(data);}).finally(()=>worker.removeAllListeners('error'));
 const direct=createTransportDetailCompiler(f.input),key=direct.initial.regions[0].key,expected=direct.compile(key);direct.dispose();
 const prepared=await request({type:'prepare',input:f.input});assert.equal(prepared.type,'prepared',prepared.message);const result=await request({type:'compile',key});assert.equal(result.type,'region',result.message);assert.deepEqual(result.batches,expected.batches);assert.ok(result.batches.every(b=>b.normalCreaseAngleRadians===Math.PI/9),'the actual worker carries crease intent to the existing renderer');
 ctx.roads=[f.road];ctx.car={road:f.road};ctx.findNearestRoad=navigation.findNearestRoad;navigation.resetRoadSearchIndex();navigation.initWorldNavigation({sampleFeatureSurfaceY,isSuppressedBaseRoad:()=>false,areRoadsConnected:()=>false});
 ctx.roadContactIndex=createRoadContactIndex(prepared.regions.flatMap(r=>r.batches).map(b=>({geometry:{attributes:{position:{array:b.positions}},getIndex:()=>({array:b.indices})},userData:{terrainMode:'at_grade'}})));
 t.mock.method(GroundHeight,'terrainY',f.native);
 for(const x of [0,5.9,6.1,12,14.8])for(const preferredRoadOnly of [false,true]){
  const contact=GroundHeight.driveSurfaceInfo(x,20,true,f.native(x,20)+.18,{preferredRoadOnly});assert.equal(contact.source,'road',`physical apron at ${x} must remain reachable through normal driving`);assert.ok(Math.abs(contact.y-f.native(x,20)-.18)<.0001);
 }
 for(const x of [-4,16])assert.equal(GroundHeight.driveSurfaceInfo(x,20,true,f.native(x,20),{preferredRoadOnly:true}).source,'terrain','association padding cannot expand the uploaded physical surface');
 for(const x of [12,-4])assert.equal(cameraRoadSurfaceHit([f.road],x,f.native(x,20)+.18,20,.2,sampleFeatureSurfaceY,roadWidthAtProjection,()=>false),x===12,'camera collision follows the same asymmetric physical extent');
});
