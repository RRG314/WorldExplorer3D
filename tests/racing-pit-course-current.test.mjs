import test from 'node:test';import assert from 'node:assert/strict';
import {createOvalPitFixture} from './fixtures/oval-pit-format.js';
import {buildRaceRoadGraph,createRaceCourse,createRaceProgress,advanceRaceProgress,projectRacePosition} from '../app/js/racing/course-rules.js';
import {normalizeRaceVenueSource} from '../app/js/racing/venue-course-policy.js';
import {canonicalRaceDistrict} from '../app/js/racing/district-facts.js';
import {raceCourseKey,raceCourseReference,raceDistrictFingerprint,normalizeRaceRouteReference} from '../app/js/racing/course-library.js';
import {reconstructPublishedRace,assertRaceCourseInDistrict} from '../app/js/racing/publication-rules.js';
import {createRacePitGeometry,racePitGateCrossing} from '../app/js/racing/pit-lane-rules.js';
import {pointOnRaceCourse} from '../app/js/racing/ai-controller.js';
test('a pit branch requires separate reviewed source facts, two existing main-loop joins and ordered independent geometry',()=>{
 const {course,pitPath,path,graph,roads,venueSource,settings}=createOvalPitFixture();assert.deepEqual(course.pitPath,pitPath);assert.equal(course.pitLane.course.discipline,'sprint');assert.ok(course.pitLane.course.lengthMeters>200&&course.pitLane.course.lengthMeters<400);assert.ok(course.pitLane.replacedDistanceMeters>250&&course.pitLane.replacedDistanceMeters<300);assert.ok(Object.isFrozen(course.pitLane.course.segments));
 assert.throws(()=>createRaceCourse(graph,path,{...settings,pitPath:[path[0]]}),/invalid_pit_path/);
 assert.throws(()=>createRaceCourse(graph,path,{...settings,pitPath:[...pitPath].reverse()}),/disconnected_race_route/);
 const missing=buildRaceRoadGraph(roads.filter(r=>r.sourceFeatureId!=='controlled:pit'),{venueSource:{...venueSource,pitSourceFeatureIds:undefined}});assert.throws(()=>createRaceCourse(missing,path,{...settings,pitPath}),/pit_source_required/);
 assert.throws(()=>normalizeRaceVenueSource({...venueSource,pitSourceFeatureIds:venueSource.sourceFeatureIds}),/invalid_venue_extent/);
 const detached=roads.map(r=>structuredClone(r));for(const r of detached.filter(r=>r.sourceFeatureId==='controlled:pit')){r.a.connectionLayer='detached';r.b.connectionLayer='detached';}const g=buildRaceRoadGraph(detached,{venueSource});assert.throws(()=>createRaceCourse(g,path,{...settings,pitPath}),/pit_join_invalid/);
 const raised=roads.map(r=>structuredClone(r));for(const r of raised.filter(r=>r.sourceFeatureId==='controlled:pit')){r.a.y+=.15;r.b.y+=.15;for(const row of r.heightSamples){row.y+=.15;row.leftY+=.15;row.rightY+=.15;for(const p of row.lateralSamples)p.y+=.15;}}const elevated=buildRaceRoadGraph(raised,{venueSource});assert.throws(()=>createRaceCourse(elevated,path,{...settings,pitPath}),/pit_join_height/);
});
test('alternate timing gates are physical pit observations and preserve a lap crossing inside the pit branch',()=>{
 const {graph,path,pitPath,settings}=createOvalPitFixture(),rotated=[...path.slice(13),...path.slice(0,13)],course=createRaceCourse(graph,rotated,{...settings,pitPath}),geometry=createRacePitGeometry(course),pit=geometry.pitPavement;
 assert.ok(geometry.entryDistanceMeters>geometry.exitDistanceMeters);const indices=geometry.covered.map(g=>g.index),finish=indices.indexOf(course.gates.length-1);assert.ok(finish>=0&&indices[finish+1]===0);assert.ok(Object.isFrozen(geometry.union.segments)&&Object.isFrozen(geometry.entry));
 for(const {index}of geometry.covered){const g=geometry.timing.gates[index],projection=projectRacePosition(pit,g);assert.ok(projection.error<1e-8&&projection.vertical<1e-8);}
 const start=pointOnRaceCourse(pit,0),progress=createRaceProgress(start,0);progress.nextGate=indices[0];let p=progress;
 for(let d=.5;d<=pit.lengthMeters+.5;d+=.5){const distance=Math.min(d,pit.lengthMeters),pose=pointOnRaceCourse(pit,distance);p=advanceRaceProgress(geometry.timing,p,pose,distance*100,{startedAtMs:0});if(distance===pit.lengthMeters)break;}
 assert.equal(p.lap,2);assert.equal(p.nextGate,(indices.at(-1)+1)%course.gates.length);assert.equal(p.lapTimes.length,1);assert.equal(p.finished,false);assert.ok(p.lapTimes[0]>0);
 const entry=geometry.entry,f=entry.forward;assert.equal(racePitGateCrossing(entry,{x:entry.x-f.x,y:entry.y,z:entry.z-f.z},{x:entry.x+f.x,y:entry.y,z:entry.z+f.z},course.metersPerUnit),true);
 assert.equal(racePitGateCrossing(entry,{x:entry.x+f.x,y:entry.y,z:entry.z+f.z},{x:entry.x-f.x,y:entry.y,z:entry.z-f.z},course.metersPerUnit),false);
});
test('canonical reconstruction retains the whole pit path and geometry; names do not partition the same comparable route',async()=>{
 const {course,roads,venueSource,graph,path,settings,pitPath}=createOvalPitFixture(),facts=canonicalRaceDistrict({type:'RaceDistrictFacts',version:1,roads,venueSource,metersPerUnit:1,anchor:settings.anchor,locationLabel:'Controlled pit'}),fingerprint=await raceDistrictFingerprint(facts),reference=raceCourseReference(course,fingerprint),rebuilt=await reconstructPublishedRace(reference,facts);
 assert.deepEqual(reference.pitPath,pitPath);assert.equal(rebuilt.pitLane.course.segments.length,3);assert.equal(assertRaceCourseInDistrict(rebuilt,facts),true);
 const altered=structuredClone(rebuilt);for(const row of altered.pitLane.course.segments[1].heightSamples){row.y+=.1;row.leftY+=.1;row.rightY+=.1;for(const p of row.lateralSamples)p.y+=.1;}assert.throws(()=>assertRaceCourseInDistrict(altered,facts),/requalify_route/);
 assert.notEqual(await raceCourseKey(course),await raceCourseKey(createRaceCourse(graph,path,settings)));assert.equal(await raceCourseKey(course),await raceCourseKey(createRaceCourse(graph,path,{...settings,pitPath,name:'Different label'})));
 assert.throws(()=>normalizeRaceRouteReference({...reference,pitPath:[...pitPath,pitPath[0]]}),/invalid_saved_race_pit_route/);
});
