import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {RACING_VENUE_SOURCES,loadRacingVenueSource,prepareVenueSourceMerge,racingVenueGroundRequirements,createRacingVenueGroundPlan} from '../app/js/racing/venue-source-packs.js';
import {compileMappedVenueLayout,compileMappedVenuePitLayout} from '../app/js/racing/venue-layout.js';
import {reviewedVenuePavementSections,annotateReviewedVenuePavementSections} from '../app/js/racing/venue-pavement-source.js';
import {roadSourceSurvey,reviewedRoadTransportRecord} from '../app/js/world/road-source-survey.js';
import {roadPavementSectionsInWorld} from '../app/js/world/road-pavement-sections.js';
import {earthCoordinateFrame} from '../app/js/earth-core/coordinate-frame.js';
import {reviewedRoadContinuations} from '../app/js/terrain/reviewed-road-continuations.js';
import {hasReviewedPavementBoundary,reviewedTerrainCorridors} from '../app/js/terrain/reviewed-corridor-policy.js';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'),pack=RACING_VENUE_SOURCES.find(p=>p.id==='daytona-tri-oval'),fetchImpl=async url=>new Response(read(url.slice(1))),source=await loadRacingVenueSource(pack,{fetchImpl}),layout=compileMappedVenueLayout(source),pit=compileMappedVenuePitLayout(source,pack,layout),required=racingVenueGroundRequirements(pack),ground={status:'accepted',artifactIds:required.map(a=>a.artifactId),contentSha256s:required.map(a=>a.contentSha256)};

test('reviewed native pit stays a separate exact open branch; accepted main pavement and directed continuations remain unchanged',async()=>{
 assert.deepEqual(layout.wayIds,[11371365,352067004,352070311,352070309,352070316]);assert.deepEqual(pit.wayIds,[352067003,198465568]);
 assert.equal(pit.points[0].nodeId,2085914640);assert.equal(pit.points.at(-1).nodeId,101134860);assert.ok(pit.lengthMeters>500&&pit.lengthMeters<700);
 const oldPack={...pack,pitWayIds:undefined,reviewedPavementSections:{url:'/app/assets/racing/daytona/pavement-sections.json',contentSha256:'34c26054f0e3c5ca538fec0ceba0fa611d990b3dbb6792d80c2885898368b873'}},old=await loadRacingVenueSource(oldPack,{fetchImpl});
 for(const id of layout.wayIds)assert.deepEqual(reviewedVenuePavementSections(source,pack,id),reviewedVenuePavementSections(old,oldPack,id));
 for(const id of pit.wayIds){const profile=reviewedVenuePavementSections(source,pack,id);assert.ok(profile.samples.every(s=>s.bankAngleDegrees===undefined&&s.apronAngleDegrees===undefined));}
 assert.deepEqual(reviewedVenuePavementSections(source,pack,352067003).geographicContinuations.start,pit.mainContinuations.start);
 assert.deepEqual(reviewedVenuePavementSections(source,pack,198465568).geographicContinuations.end,pit.mainContinuations.end);
 const plan=createRacingVenueGroundPlan(pack,source);assert.ok(plan.coverageProbes.some(p=>Math.abs(p.latitude-pit.points[8].lat)<1e-10&&Math.abs(p.longitude-pit.points[8].lon)<1e-10));
});

test('pit source requires reviewed ordering, two real main joins and all hash-bound profiles',()=>{
 for(const pitWayIds of [[198465568,352067003],[352067003],[198465568],[352067003,352067003],[11371365]])assert.throws(()=>compileMappedVenuePitLayout(source,{...pack,pitWayIds}),/pit_layout_invalid/);
 const raw=JSON.parse(read('app/assets/racing/daytona/source.json')),artifact=JSON.parse(read('app/assets/racing/daytona/pavement-sections-v2.json'));
 artifact.profiles.pop();assert.throws(()=>annotateReviewedVenuePavementSections(raw,artifact,{descriptor:pack,requiredArtifacts:required,contentSha256:pack.reviewedPavementSections.contentSha256}),/pavement_source_invalid/);
 assert.throws(()=>prepareVenueSourceMerge({},source,{...pack,raceDiscipline:'circuit'},ground),/pit_review_unavailable/);
});

test('pit adoption carries the same private publication authority into the existing road compiler without granting other raceways that authority',()=>{
 const prepared=prepareVenueSourceMerge({},source,pack,ground),venue=prepared.metadata.venueSource,frame=earthCoordinateFrame(pack.anchor,100000);
 assert.deepEqual(venue.sourceFeatureIds,layout.wayIds.map(id=>`osm:way:${id}`));assert.deepEqual(venue.pitSourceFeatureIds,pit.sourceFeatureIds);assert.equal(prepared.metadata.raceAdmission,'practice');assert.equal(prepared.metadata.presentationStatus,'ready');assert.equal(prepared.metadata.mappedLengthMeters,layout.lengthMeters);
 for(const id of pit.wayIds){const way=prepared.data.elements.find(e=>e.type==='way'&&e.id===id),survey=roadSourceSurvey(way),native=layout.ways.get(id);
  assert.equal(survey.venueSource,venue);assert.equal(survey.maximumCrossfall,.15);assert.deepEqual(way.tags.name,native.tags.name);assert.equal(roadSourceSurvey(JSON.parse(JSON.stringify(way))),null);
  const profile=roadPavementSectionsInWorld(survey.sourcePavementSections,native.geometry.map(p=>frame.toWorld(p.lat,p.lon)),1.11,{geoToWorld:(lat,lon)=>frame.toWorld(lat,lon)}),record={identity:`osm:way:${id}`,crossSection:{widthMeters:6,placement:{}},provenance:{}},evidence={...survey,pavementSections:profile};
  assert.equal(reviewedRoadTransportRecord(record,evidence).crossSection.pavementSections,profile);
  assert.throws(()=>reviewedRoadTransportRecord({...record,identity:'osm:way:198465570'},{...evidence,pavementSections:{...profile,sourceFeatureId:'osm:way:198465570'}}),/pavement_profile_unavailable/);
 }
 assert.equal(roadSourceSurvey(prepared.data.elements.find(e=>e.type==='way'&&e.id===198465570)),null);
});

test('the reviewed pit refines through the same terrain owner without replacing accepted main-loop continuations at its exit',()=>{
 const prepared=prepareVenueSourceMerge({},source,pack,ground),venue=prepared.metadata.venueSource,frame=earthCoordinateFrame(pack.anchor,100000),roads=[];
 for(const id of [...layout.wayIds,...pit.wayIds]){const native=layout.ways.get(id),evidence=roadSourceSurvey(prepared.data.elements.find(e=>e.type==='way'&&e.id===id));roads.push({sourceFeatureId:`osm:way:${id}`,sourceNodeIds:native.nodes,pts:native.geometry.map(p=>frame.toWorld(p.lat,p.lon)),width:14,structureSemantics:{terrainMode:'at_grade'},surfaceSurveyEvidence:evidence,transportSurfaceModel:{reviewedSurfacePhase:'accepted',surveyedSurface:evidence}});}
 const main=roads.slice(0,5),before=reviewedRoadContinuations(main,venue),after=reviewedRoadContinuations(roads,venue);
 for(const road of main)assert.deepEqual(after.get(road),before.get(road),'a third branch at the main endpoint must not remove the accepted two-way continuation');
 assert.ok(after.get(roads[5])?.length+after.get(roads[6])?.length||after.get(roads[5])?.length||after.get(roads[6])?.length);
 assert.ok(roads.every(hasReviewedPavementBoundary));const context={_worldLoadSequence:1,worldLoadRuntimeState:{sequence:1,venuePack:prepared.metadata},roads};
 assert.equal(reviewedTerrainCorridors(context).segments.length,layout.points.length+pit.points.length-2);
 assert.throws(()=>reviewedTerrainCorridors({...context,roads:main}),/source_unavailable/);
});
