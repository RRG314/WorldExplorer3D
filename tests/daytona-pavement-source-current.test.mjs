import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {RACING_VENUE_SOURCES,loadRacingVenueSource,createRacingVenueGroundPlan,prepareVenueSourceMerge} from '../app/js/racing/venue-source-packs.js';
import {roadSourceSurvey,reviewedRoadTransportRecord} from '../app/js/world/road-source-survey.js';
import {reviewedDeckSurveyInWorld} from '../app/js/world/reviewed-deck-world-profile.js';
import {normalizeTransportSource} from '../app/js/world/compiler/transport-source-normalizer.js?v=4';
import {compileGroundArtifact} from '../app/js/terrain/ground-artifact.js';
import {sampleDistrictGroundElevationMeters as sample} from '../app/js/world/compiler/district-ground-model.js';
import {earthCoordinateFrame} from '../app/js/earth-core/coordinate-frame.js';
import {geographicToWebMercatorMeters as mercator} from '../app/js/terrain/source-contract.js';
import {compileTransportSurfaceModel as compile,attachCompiledTransportSurface as attach,packCompiledTransportSurfaces as pack} from '../app/js/world/compiler/transport-surface-model.js?v=25';
const read=file=>fs.readFile(new URL('../'+file,import.meta.url),'utf8'),descriptor=RACING_VENUE_SOURCES.find(d=>d.id==='daytona-tri-oval'),fetchImpl=async url=>({ok:true,text:()=>read(url.slice(1))});
test('pinned Daytona sections require the verified source-load annotation and matching artifact bytes',async()=>{
 const source=await loadRacingVenueSource(descriptor,{fetchImpl}),ground={status:'accepted',artifactIds:[descriptor.groundArtifactId],contentSha256s:[descriptor.groundContentSha256]};
 const merged=prepareVenueSourceMerge({},source,descriptor,ground);assert.equal(merged.metadata.raceAdmission,'practice');
 assert.deepEqual(merged.metadata.startLine,{sourceFeatureId:'osm:way:11371365',segment:0,fraction:.6});assert.equal(merged.metadata.presentationStatus,'ready');
 const ways=merged.data.elements.filter(w=>w.type==='way'&&roadSourceSurvey(w));assert.equal(ways.length,7);assert.ok(ways.every(w=>roadSourceSurvey(w).sourcePavementSections&&roadSourceSurvey(w).usableWidthMeters===6));
 assert.throws(()=>prepareVenueSourceMerge({},JSON.parse(JSON.stringify(source)),descriptor,ground),/source_not_prepared/);
 await assert.rejects(loadRacingVenueSource(descriptor,{fetchImpl:async url=>({ok:true,text:async()=>await read(url.slice(1))+(url===descriptor.reviewedPavementSections.url?' ':'')})}),/integrity_failed/);
});
test('the complete changed Daytona bank/apron fits the shared compiler and every expanded refinement probe has native ground',async()=>{
 const source=await loadRacingVenueSource(descriptor,{fetchImpl}),ground=compileGroundArtifact({manifest:JSON.parse(await read('app/assets/ground/daytona/ground-manifest.json')),artifact:JSON.parse(await read('app/assets/ground/daytona/ground-artifact.json'))});assert.equal(ground.status,'accepted');
 for(const g of createRacingVenueGroundPlan(descriptor,source).coverageProbes){const p=mercator(g.latitude,g.longitude);assert.ok(Number.isFinite(sample(ground.model,p.eastingMeters,p.northingMeters)));}
 const merged=prepareVenueSourceMerge({},source,descriptor,{status:'accepted',artifactIds:[descriptor.groundArtifactId],contentSha256s:[descriptor.groundContentSha256]}),frame=earthCoordinateFrame(descriptor.anchor,100000),unit=1.11,
  height=(x,z)=>{const g=frame.toGeographic(x,z),p=mercator(g.lat,g.lon);return sample(ground.model,p.eastingMeters,p.northingMeters)/unit;},features=[];
 for(const id of source.layout.wayIds){
  const raw=source.ways.find(w=>w.id===id),way=merged.data.elements.find(w=>w.type==='way'&&w.id===id),pts=raw.geometry.map(g=>frame.toWorld(g.lat,g.lon)),survey=reviewedDeckSurveyInWorld(roadSourceSurvey(way),pts,{metersPerWorldUnit:unit,geoToWorld:(lat,lon)=>frame.toWorld(lat,lon)}),
   record=reviewedRoadTransportRecord(normalizeTransportSource({sourceId:`osm:way:${id}`,id,type:'way',providerNamespace:'osm',completeness:'lossless',geometryProvenance:'osm-overpass'},way.tags),survey),feature={sourceFeatureId:`osm:way:${id}`,sourceNodeIds:way.nodes,pts,width:record.crossSection.widthMeters/unit,metersPerWorldUnit:unit,surfaceBias:.18,structureSemantics:{terrainMode:'at_grade'},surfaceSurveyEvidence:survey,transportRecord:record};
  const model=compile(feature,height,{reviewedSurfacePhase:'preparation'});assert.ok(model.maximumReviewedCrossfall<=.7);assert.ok(model.maximumReviewedApronCrossfall<.027);assert.equal(model.width,6/unit);attach(feature,model);features.push(feature);
 }
 assert.equal(pack(features).profiles,5);for(const f of features){const m=f.transportSurfaceModel;assert.equal(m.pavementCenterBounds.buffer,m.centerHeights.buffer);assert.equal(m.reviewedSurfacePhase,'accepted');}
 for(let i=0;i<features.length;i++){
  const a=features[i].transportRecord.crossSection.pavementSections,b=features[(i+1)%features.length].transportRecord.crossSection.pavementSections;
  assert.deepEqual(a.nodeFrames.at(-1),b.nodeFrames[0],'exact adjoining source ways share one lateral transect');
  assert.equal(a.geographicContinuations,undefined,'the world DTO retains only converted coordinates');assert.deepEqual(a.connectedEnds,{start:true,end:true});
 }
 // Final graph reconciliation cannot evade the physical cross-section's
 // existing cut/fill envelope by moving only its source-centre profile.
 features[0].transportSurfaceModel.centerHeights[2]+=20;assert.throws(()=>pack(features),/cut_fill_exceeded/);
});
