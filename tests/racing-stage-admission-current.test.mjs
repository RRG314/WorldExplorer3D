import test from 'node:test';
import assert from 'node:assert/strict';
import {createRallyStageAdmissionFixture as fixture,qualifyRallyStageAdmissionFixture} from './fixtures/rally-stage-admission.js';
import {loadRacingVenueSource,prepareVenueSourceMerge,createRacingVenueGroundPlan,RACING_VENUE_SOURCES} from '../app/js/racing/venue-source-packs.js';
import {compileMappedVenueLayout} from '../app/js/racing/venue-layout.js';
import {roadSourceSurvey,reviewedRoadTransportRecord} from '../app/js/world/road-source-survey.js';
import {roadSegmentIsDriveable} from '../app/js/world/road-cross-section-profile.js?v=1';
test('pinned stage intake retains conditions, complete source ways, private motor tags and full-context ground probes',async()=>{
 const f=await fixture(),header=f.prepared.metadata.venueSource,layout=compileMappedVenueLayout(f.source);
 assert.equal(header.version,2);assert.deepEqual(header.stage,layout.stage);assert.equal(f.prepared.metadata.raceDiscipline,'rally');
 assert.equal(f.source.ways[1].tags.motor_vehicle,'no');assert.equal(f.source.ways[1].tags.access,'private');
 assert.deepEqual(f.prepared.data.elements.find(e=>e.type==='way'&&e.id===102).nodes,[8,6,5,4,1]);
 const plan=createRacingVenueGroundPlan(f.descriptor,f.source),first=f.source.ways[0].geometry[0],last=f.source.ways[2].geometry.at(-1);
 for(const point of [first,last])assert.ok(plan.coverageProbes.some(p=>Math.abs(p.latitude-point.lat)<1e-9&&Math.abs(p.longitude-point.lon)<1e-9),'support context beyond timing endpoints is probed');
 assert.equal(RACING_VENUE_SOURCES.some(p=>p.id===f.descriptor.id),false,'controlled preparation does not register a geographic pack');
});
test('narrow driving and closed-event motor access apply only to exact reviewed source intervals; ordinary fences stay in effect',async()=>{
 const f=await fixture(),publicRoad=f.features[0],privateRoad=f.features[1];
 assert.equal(roadSegmentIsDriveable(publicRoad.feature,0),false);assert.equal(roadSegmentIsDriveable(publicRoad.feature,1),true);assert.equal(roadSegmentIsDriveable(publicRoad.feature,2),true);
 assert.equal(privateRoad.original.safeForDriving,false);assert.equal(privateRoad.feature.transportRecord.sourceTags.motor_vehicle,'no');
 assert.equal(privateRoad.feature.transportRecord.access.pedestrian,privateRoad.original.access.pedestrian);
 assert.equal(roadSegmentIsDriveable(privateRoad.feature,0),false);assert.equal(roadSegmentIsDriveable(privateRoad.feature,1),true);assert.equal(roadSegmentIsDriveable(privateRoad.feature,2),true);assert.equal(roadSegmentIsDriveable(privateRoad.feature,3),false);
 assert.equal(roadSegmentIsDriveable({...publicRoad.feature,transportRecord:publicRoad.original,surfaceSurveyEvidence:undefined},1),false);
 assert.equal(roadSegmentIsDriveable({...publicRoad.feature,resolvedCrossSection:{segmentWidthsMeters:[3.5,2.8,3.5]}},1),false,'review never overrides a narrower resolved physical corridor');
 for(const row of f.features){const copied=JSON.parse(JSON.stringify(row.feature));assert.equal(roadSegmentIsDriveable(copied,1),false,'serialized source cannot retain a virtual closure capability');}
 for(const patch of [{sourceNodeIds:privateRoad.feature.sourceNodeIds.slice(1)},{originalSourceNodeIds:['wrong']},{surfaceSurveyEvidence:{}}]){
  assert.equal(roadSegmentIsDriveable({...privateRoad.feature,...patch},1),false);
 }
});
test('missing conditions, explicit closure review, original mapped width, accepted ground or pinned input rejects before publication',async()=>{
 const f=await fixture();
 for(const patch of [{motorAccess:undefined},{motorAccess:'virtual-raceway-v1'},{pavementWidthPolicy:'usable-corridor'},{raceDiscipline:'sprint'},{maximumCrossfall:.7},{surfaceModel:'banked-road-v1'},{startLine:{}}]){
  assert.throws(()=>prepareVenueSourceMerge({},f.source,{...f.descriptor,...patch},f.ground),/stage_review/);
 }
 const missing=structuredClone(f.source);delete missing.layout.rally;assert.throws(()=>prepareVenueSourceMerge({},missing,f.descriptor,f.ground),/stage_runtime_unavailable/);
 const widths=structuredClone(f.source);delete widths.ways[0].tags.width;assert.throws(()=>prepareVenueSourceMerge({},widths,f.descriptor,f.ground),/mapped_pavement_width/);
 assert.throws(()=>prepareVenueSourceMerge({},f.source,f.descriptor,{...f.ground,contentSha256s:['c'.repeat(64)]}),/ground_not_ready/);
 await assert.rejects(loadRacingVenueSource(f.descriptor,{fetchImpl:async()=>new Response(JSON.stringify(f.source)+' ')}),/integrity/);
 assert.equal(roadSourceSurvey(JSON.parse(JSON.stringify(f.features[1].way))),null);
});
test('actual source, surface compiler, topology, traversal and published triangles qualify a complete stage without admitting outside intervals',async()=>{
 const f=await qualifyRallyStageAdmissionFixture();
 try{
  assert.equal(f.events.length,1);assert.equal(f.events[0].discipline,'rally');assert.deepEqual(f.district.diagnostics.rejected,{});
  assert.match(f.events[0].name,/Stage · stage$/);
  assert.equal(f.events[0].sourcePath.length,5);assert.ok(f.events[0].sourcePath[2].endsWith(':reverse'));assert.equal(f.district.roads.length,5);
  assert.equal(f.district.roads.some(r=>r.sourceId.startsWith('osm:way:101:0:')||r.sourceId.startsWith('osm:way:102:0:')||r.sourceId.startsWith('osm:way:102:3:')),false);
  assert.equal(f.events[0].rally.segmentSurfaces[2],'gravel-dry');assert.ok(f.district.roads.every(r=>Math.abs(r.a.y-.18)<.001));
 }finally{f.dispose();}
});
