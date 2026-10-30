import test from 'node:test';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {BANKED_ROAD_MODEL,PROFILED_ROAD_PAVEMENT_MODEL} from '../app/js/physics/road-plane-dynamics.js';
import {buildRaceRoadGraph,createRaceCourse,createRaceProgress,advanceRaceProgress,sampleRaceSegmentY} from '../app/js/racing/course-rules.js';
import {racePavementCrossSection} from '../app/js/racing/pavement-cross-section.js';
import {canonicalRaceDistrict} from '../app/js/racing/district-facts.js';
import {raceCourseKey,raceDistrictFingerprint,raceCourseReference} from '../app/js/racing/course-library.js';
import {reconstructPublishedRace,assertRaceCourseInDistrict} from '../app/js/racing/publication-rules.js';
import {prepareRaceDistrictStorage,readRaceDistrictFacts} from '../app/js/racing/district-storage.js';
const height=(l,k)=>10-.6*Math.min(l,k)-.025*Math.max(0,l-k);
function fixture(){const road={sourceId:'controlled:bank',sourceFeatureId:'controlled',a:{x:0,y:10,z:0},b:{x:0,y:10,z:300},widthMeters:18,direction:'both',structure:'surface',supported:true,driveable:true,surfaceModel:BANKED_ROAD_MODEL,pavementModel:PROFILED_ROAD_PAVEMENT_MODEL,racingWidthMeters:6,heightSampleSpanMeters:1.2,
 heightSamples:[0,1].map(t=>{const knee=6-2*t;return {t,y:10,leftY:height(-1.2,knee),rightY:height(1.2,knee),racingOffsetMeters:(knee-3)/2,racingWidthMeters:knee+3-.1,lateralSamples:[-3,-1.2,0,1.2,4,6,15].map(offsetMeters=>({offsetMeters,y:height(offsetMeters,knee)}))};})};
 const facts={type:'RaceDistrictFacts',version:1,anchor:{lat:29.185,lon:-81.071},locationLabel:'Controlled bank',metersPerUnit:1,roads:[road]},graph=buildRaceRoadGraph(facts.roads),course=createRaceCourse(graph,[graph.edges[0].id],{...facts,locationId:'earth:291850000:-810710000',discipline:'sprint',participants:1});return {road,facts,graph,course};}
test('the legal bank tapers independently of the physical apron and survives reverse direction',()=>{
 const {road,graph,course}=fixture(),section=racePavementCrossSection(course.segments[0],.5);
 assert.equal(section.racingWidthMeters,7.9);assert.equal(section.racingOffsetMeters,1);assert.equal(section.minimumMeters,-3);assert.equal(section.maximumMeters,15);
 const reverse={...graph.edges[1],a:road.b,b:road.a};const r=racePavementCrossSection(reverse,.5);assert.equal(r.racingWidthMeters,7.9);assert.equal(r.racingOffsetMeters,-1);
 for(const lateral of [-2.8,0,5,12])assert.ok(Math.abs(sampleRaceSegmentY(course.segments[0],.5,lateral)-sampleRaceSegmentY(reverse,.5,-lateral))<1e-12);
 const legacy=structuredClone(road);for(const row of legacy.heightSamples)delete row.racingWidthMeters;assert.equal(racePavementCrossSection(buildRaceRoadGraph([legacy]).edges[0],.5).racingWidthMeters,6);
});
test('incomplete, impossible and unclassified racing bands reject rather than extending the asphalt',()=>{
 for(const modify of [r=>delete r.heightSamples[0].racingWidthMeters,r=>r.heightSamples[0].racingWidthMeters=NaN,r=>r.heightSamples[0].racingWidthMeters=30,r=>r.heightSamples[0].racingWidthMeters=5,r=>{delete r.pavementModel;delete r.racingWidthMeters;for(const s of r.heightSamples)delete s.racingOffsetMeters;}]){
  const {road}=fixture();modify(road);assert.throws(()=>buildRaceRoadGraph([road]),/pavement_sections/);
 }
});
test('an outer bank lane crosses the gate at its actual height with the existing vertical fence',()=>{
 const {course}=fixture(),gate=course.gates[0],x=-2.5,y=z=>sampleRaceSegmentY(course.segments[0],z/300,x),from={x,z:gate.z-1,y:y(gate.z-1)},to={x,z:gate.z+1,y:y(gate.z+1)};
 assert.ok(Math.abs(to.y-gate.y)>2);const p=createRaceProgress(from,1000);assert.equal(advanceRaceProgress(course,p,to,1100,{startedAtMs:0}).nextGate,1);
 const high=createRaceProgress({...from,y:from.y+2.1},1000);assert.equal(advanceRaceProgress(course,high,{...to,y:to.y+2.1},1100,{startedAtMs:0}).nextGate,0);
});
test('canonical storage and all three existing authorities reconstruct the same variable bank and reject a changed lane',async()=>{
 const {facts}=fixture(),canonical=canonicalRaceDistrict(facts),fingerprint=await raceDistrictFingerprint(canonical),g=buildRaceRoadGraph(canonical.roads),course=createRaceCourse(g,[g.edges[0].id],{...canonical,discipline:'sprint',participants:1}),reference=raceCourseReference(course,fingerprint),id=await raceCourseKey(course),storage=await prepareRaceDistrictStorage(canonical);
 assert.deepEqual(await readRaceDistrictFacts(storage.fields),canonical);assert.deepEqual(canonicalRaceDistrict(canonical),canonical);
 for(const engine of [{canonicalRaceDistrict,reconstructPublishedRace,raceCourseKey},await import('../services/racing/generated/engine.mjs'),createRequire(import.meta.url)('../functions/generated/racing-engine.cjs')]){
  const restored=await engine.reconstructPublishedRace(reference,engine.canonicalRaceDistrict(canonical));assert.deepEqual(restored,course);assert.equal(await engine.raceCourseKey(restored),id);
 }
 const altered=structuredClone(course);altered.segments[0].heightSamples[0].racingWidthMeters-=.02;assert.throws(()=>assertRaceCourseInDistrict(altered,canonical),/requalify/);
});
