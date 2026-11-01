import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareRaceCourseGeometry,projectRacePosition,raceSegmentAtDistance,buildRaceRoadGraph,createRaceCourse} from '../app/js/racing/course-rules.js';

// Differential query checks use the preserved exhaustive path as the oracle.
// This isolates index/pruning errors without duplicating contact-height maths.
function sourceCourse(){
 const segments=[];let at=0;
 for(const deck of [0,8])for(let i=0;i<256;i++){
  const angle=i*Math.PI/128,next=(i+1)*Math.PI/128;
  const a={x:Math.sin(angle)*300,y:deck+Math.cos(angle)*3,z:Math.cos(angle)*200};
  const b={x:Math.sin(next)*300,y:deck+Math.cos(next)*3,z:Math.cos(next)*200};
  const lengthMeters=Math.hypot(b.x-a.x,b.z-a.z)*1.11;
  segments.push({a,b,forward:{x:(b.x-a.x)*1.11/lengthMeters,z:(b.z-a.z)*1.11/lengthMeters},lengthMeters,startMeters:at,widthMeters:10,
   heightSampleSpanMeters:1.2,heightSamples:[{t:0,y:a.y,leftY:a.y+.08,rightY:a.y-.08},{t:.5,y:(a.y+b.y)/2+.05,leftY:(a.y+b.y)/2+.13,rightY:(a.y+b.y)/2-.03},
    {t:1,y:b.y,leftY:b.y+.08,rightY:b.y-.08}]});at+=lengthMeters;
 }
 return {segments,lengthMeters:at,metersPerUnit:1.11};
}
test('indexed projection matches exhaustive geometry for banks, separate decks, distance windows, ties and distant recovery',()=>{
 const indexed=prepareRaceCourseGeometry(sourceCourse()),exhaustive={...indexed,segments:[...indexed.segments]};
 let seed=78329;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(let i=0;i<3000;i++){
  const pose={x:(random()-.5)*1000,y:random()*20-5,z:(random()-.5)*800};
  const first=random()*indexed.lengthMeters,second=first+random()*500;
  const options=i%3?{}:{minimumMeters:first,maximumMeters:second};
  assert.deepEqual(projectRacePosition(indexed,pose,options),projectRacePosition(exhaustive,pose,options),`query ${i}`);
 }
 for(const segment of indexed.segments)for(const t of [0,.5,1]){
  const pose={x:segment.a.x+(segment.b.x-segment.a.x)*t,y:segment.a.y+(segment.b.y-segment.a.y)*t,z:segment.a.z+(segment.b.z-segment.a.z)*t};
  assert.deepEqual(projectRacePosition(indexed,pose),projectRacePosition(exhaustive,pose));
 }
 assert.equal(projectRacePosition(indexed,{x:0,y:100,z:0}),null);
 assert.equal(projectRacePosition(indexed,{x:0,y:0,z:0},{minimumMeters:90000,maximumMeters:90010}),null);
});
test('published geometry is immutable, query acceleration survives serialisation through the session preparation boundary, and mutable fixtures stay fresh',()=>{
 const course=prepareRaceCourseGeometry(sourceCourse()),pose={x:0,y:3,z:200};
 assert.throws(()=>{course.segments[0].a.x=100;},TypeError);
 assert.throws(()=>{course.segments[0].heightSamples[0].y=99;},TypeError);
 const copy=structuredClone(course),before=JSON.stringify(copy),expected=projectRacePosition(course,pose);
 assert.deepEqual(projectRacePosition(prepareRaceCourseGeometry(copy),pose),expected);
 assert.equal(JSON.stringify(copy),before,'derived index must not enter record identity, transport snapshots or persisted facts');
 const fixture={...course,segments:[...course.segments]};
 projectRacePosition(fixture,pose);
 fixture.segments=fixture.segments.map(s=>({...s,a:{...s.a,y:s.a.y+100},b:{...s.b,y:s.b.y+100},heightSamples:s.heightSamples.map(h=>({...h,y:h.y+100,leftY:h.leftY+100,rightY:h.rightY+100}))}));
 assert.equal(projectRacePosition(fixture,pose),null,'mutable diagnostics must never use stale cached bounds');
});
test('a long immutable course visits a bounded nearby leaf set instead of every road at each wheel query',()=>{
 let sampled=0;
 const segments=Array.from({length:1024},(_,i)=>({a:Object.freeze({x:0,y:0,z:i*20}),b:Object.freeze({x:0,y:0,z:(i+1)*20}),
  forward:Object.freeze({x:0,z:1}),lengthMeters:20,startMeters:i*20,widthMeters:8,get heightSamples(){sampled++;return null;}}));
 segments.forEach(Object.freeze);Object.freeze(segments);
 const course={segments,lengthMeters:20480,metersPerUnit:1},pose={x:1,y:0,z:12341};
 const expected=projectRacePosition({...course,segments:[...segments]},pose);assert.equal(sampled,1024);sampled=0;
 assert.deepEqual(projectRacePosition(course,pose),expected);assert.ok(sampled<=12,`${sampled} candidate surfaces`);
 sampled=0;assert.deepEqual(projectRacePosition(course,pose),expected);assert.ok(sampled<=12);
});
test('distance lookup preserves the earlier segment at exact joints and after the last segment',()=>{
 const course=prepareRaceCourseGeometry(sourceCourse());
 for(const s of course.segments)for(const distance of [s.startMeters,s.startMeters+s.lengthMeters,s.startMeters+s.lengthMeters*.5]){
  assert.equal(raceSegmentAtDistance(course,distance),course.segments.find(r=>r.startMeters+r.lengthMeters>=distance)||course.segments.at(-1));
 }
 assert.equal(raceSegmentAtDistance(course,course.lengthMeters+10),course.segments.at(-1));
});
test('course construction freezes its own geometry without freezing or rewriting the geographic graph',()=>{
 const graph=buildRaceRoadGraph([{sourceId:'source',a:{x:0,y:0,z:0},b:{x:0,y:1,z:300},widthMeters:8,driveable:true,supported:true}]);
 const course=createRaceCourse(graph,['source:forward'],{locationId:'test',anchor:{lat:52,lon:-1}});
 assert.ok(Object.isFrozen(course.segments[0].a));assert.ok(!Object.isFrozen(graph.nodes[0]));
 const original=course.segments[0].a.x;graph.nodes[0].x=5;assert.equal(course.segments[0].a.x,original);
});
