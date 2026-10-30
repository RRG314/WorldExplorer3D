import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileMappedVenueLayout} from '../app/js/racing/venue-layout.js';
import {RACING_VENUE_SOURCES,loadRacingVenueSource,prepareVenueSourceMerge,racingVenueGroundRequirements} from '../app/js/racing/venue-source-packs.js';
import {earthCoordinateFrame} from '../app/js/earth-core/coordinate-frame.js';
import {buildVenueRaceCourses} from '../app/js/racing/venue-courses.js';
import {raceGridPose,projectRacePosition} from '../app/js/racing/course-rules.js';
import {raceCourseReference,restoreRaceCourse} from '../app/js/racing/course-library.js';
import {buildRaceFurniture} from '../app/js/racing/course-furniture.js';

// Topology and timing-line contract only. Height/contact and full-world driving
// are verified separately; a flat source projection cannot accept a venue pack.
const pack=RACING_VENUE_SOURCES.find(p=>p.id==='nurburgring-nordschleife'),
 source=await loadRacingVenueSource(pack,{fetchImpl:async url=>new Response(fs.readFileSync(new URL('..'+url,import.meta.url)))}),layout=compileMappedVenueLayout(source),
 group=racingVenueGroundRequirements(pack,{includeLandscape:true}),ground={status:'accepted',artifactIds:group.map(g=>g.artifactId),contentSha256s:group.map(g=>g.contentSha256)},
 venue=prepareVenueSourceMerge({},source,pack,ground).metadata,frame=earthCoordinateFrame(pack.anchor,100000),roads=[];
for(const id of layout.wayIds){
 const way=layout.ways.get(id),sourceFeatureId=`osm:way:${id}`;
 for(let segment=0;segment<way.nodes.length-1;segment++)roads.push({sourceFeatureId,sourceId:`${sourceFeatureId}:${segment}:0.000000:1.000000`,
  a:{...frame.toWorld(way.geometry[segment].lat,way.geometry[segment].lon),y:0,connectionLayer:'source-node:'+way.nodes[segment]},
  b:{...frame.toWorld(way.geometry[segment+1].lat,way.geometry[segment+1].lon),y:0,connectionLayer:'source-node:'+way.nodes[segment+1]},
  widthMeters:7,direction:'forward',driveable:true,supported:true});
}
const district={locationId:'nordschleife',locationLabel:pack.name,anchor:pack.anchor,metersPerUnit:1.11,venueSource:venue.venueSource,roads};

test('T13 timing rotates the complete loop, clears the four-car grid and survives existing route storage',()=>{
 const {graph,events}=buildVenueRaceCourses(district,venue),[course,twoLap]=events;
 assert.equal(course.sourcePath.length,1067);assert.equal(new Set(course.sourcePath).size,1067);
 assert.equal(course.sourcePath[0],'osm:way:41395670:6:0.000000:1.000000:forward');
 assert.match(course.name,/T13 · 1 lap/);assert.doesNotMatch(course.name,/GP/);assert.match(course.description,/in progress/);
 assert.equal(twoLap.laps,2);assert.deepEqual(twoLap.sourcePath,course.sourcePath);
 assert.ok(Math.abs(course.lengthMeters-layout.lengthMeters)/layout.lengthMeters<.01);
 assert.deepEqual(course.points[0],course.points.at(-1));
 for(let index=0;index<4;index++)assert.ok(projectRacePosition(course,raceGridPose(course,index)).error<1.401);
 const fingerprint='race-district:'+'a'.repeat(64),reference=raceCourseReference(course,fingerprint),restored=restoreRaceCourse(reference,district,graph,fingerprint);
 assert.equal(restored.startOffsetMeters,course.startOffsetMeters);assert.deepEqual(restored.points,course.points);
});

test('a certified split of the T13 segment preserves the authored line rather than using a new midpoint',()=>{
 const original=roads.find(r=>r.sourceId==='osm:way:41395670:6:0.000000:1.000000'),
  midpoint={x:(original.a.x+original.b.x)/2,y:0,z:(original.a.z+original.b.z)/2,connectionLayer:'certified-t13-split'},
  split=[{...original,sourceId:'osm:way:41395670:6:0.000000:0.500000',b:midpoint},
   {...original,sourceId:'osm:way:41395670:6:0.500000:1.000000',a:midpoint}],
  baseline=buildVenueRaceCourses(district,venue).events[0],course=buildVenueRaceCourses({...district,roads:[...roads.filter(r=>r!==original),...split]},venue).events[0];
 assert.equal(course.sourcePath.length,1068);assert.equal(course.sourcePath[0],split[1].sourceId+':forward');
 assert.ok(Math.hypot(course.points[0].x-baseline.points[0].x,course.points[0].z-baseline.points[0].z)<1e-9);
 assert.ok(Math.abs(course.lengthMeters-baseline.lengthMeters)<1e-8);
});

test('missing, ambiguous or foreign timing references fail closed instead of falling back to the first corner',()=>{
 for(const startLine of [{...pack.startLine,sourceFeatureId:'osm:way:1'},{...pack.startLine,segment:-1},{...pack.startLine,fraction:NaN},{...pack.startLine,fraction:1}]){
  assert.throws(()=>prepareVenueSourceMerge({},source,{...pack,startLine},ground),/start_line_invalid/);
  assert.throws(()=>buildVenueRaceCourses(district,{...venue,startLine}),/start_line_invalid/);
 }
 assert.throws(()=>buildVenueRaceCourses(district,{...venue,startLine:{...pack.startLine,segment:999}}),/start_line_unavailable/);
 assert.throws(()=>buildVenueRaceCourses(district,{...venue,raceAdmission:'pending-timing-line'}),/timing_line_pending/);
 // Exactly on a certified interval boundary needs an explicit reviewed choice,
 // not whichever of two neighbouring intervals happens to be visited first.
 const row=roads.find(r=>r.sourceId==='osm:way:41395670:6:0.000000:1.000000');
 assert.throws(()=>buildVenueRaceCourses({...district,roads:roads.map(r=>r===row?{...r,sourceId:'osm:way:41395670:6:0.725000:1.000000'}:r)},venue),/start_line_unavailable/);
});

test('Daytona game timing keeps the complete source loop and leaves its permanent perimeter in world custody',async()=>{
 const pack=RACING_VENUE_SOURCES.find(p=>p.id==='daytona-tri-oval'),source=await loadRacingVenueSource(pack,{fetchImpl:async url=>new Response(fs.readFileSync(new URL('..'+url,import.meta.url)))}),
  layout=compileMappedVenueLayout(source),group=racingVenueGroundRequirements(pack),venue=prepareVenueSourceMerge({},source,pack,{status:'accepted',artifactIds:group.map(g=>g.artifactId),contentSha256s:group.map(g=>g.contentSha256)}).metadata,
  frame=earthCoordinateFrame(pack.anchor,100000),roads=[];
 // Deliberately flat topology fixture; native full-width evidence owns height admission.
 for(const id of layout.wayIds){const way=layout.ways.get(id),sourceFeatureId=`osm:way:${id}`;
  for(let segment=0;segment<way.nodes.length-1;segment++)roads.push({sourceFeatureId,sourceId:`${sourceFeatureId}:${segment}:0.000000:1.000000`,
   a:{...frame.toWorld(way.geometry[segment].lat,way.geometry[segment].lon),y:0,connectionLayer:'source-node:'+way.nodes[segment]},
   b:{...frame.toWorld(way.geometry[segment+1].lat,way.geometry[segment+1].lon),y:0,connectionLayer:'source-node:'+way.nodes[segment+1]},widthMeters:6,direction:'forward',driveable:true,supported:true});
 }
 const {events:[course]}=buildVenueRaceCourses({locationId:'daytona',locationLabel:pack.name,anchor:pack.anchor,metersPerUnit:1.11,venueSource:venue.venueSource,roads},venue);
 assert.equal(course.sourcePath.length,127);assert.equal(new Set(course.sourcePath).size,127);assert.equal(course.sourcePath[0],'osm:way:11371365:0:0.000000:1.000000:forward');
 assert.match(course.description,/in progress/);assert.ok(Math.abs(course.lengthMeters-layout.lengthMeters)/layout.lengthMeters<.01);
 for(let i=0;i<4;i++)assert.ok(projectRacePosition(course,raceGridPose(course,i)).error<1.401);
 const furniture=buildRaceFurniture(course);assert.equal(furniture.perimeter,'permanent-venue');assert.ok(furniture.chunks.every(c=>!c.positions.length&&!c.fencePositions.length&&!c.posts.length));
});
