import test from 'node:test';import assert from 'node:assert/strict';
import {cleanGroundRaceLayout,simplifyRaceDrive,recordRaceRoadSpan} from '../app/js/racing/route-draft.js';
import {collectGroundRaceDistrict} from '../app/js/racing/ground-course-source.js';
import {buildRaceRoadGraph,createRaceCourse} from '../app/js/racing/course-rules.js';
import {raceDistrictFingerprint,raceCourseReference,restoreRaceCourse} from '../app/js/racing/course-library.js';
import {buildRacePaint} from '../app/js/racing/course-markings.js';
import {buildRaceFurniture} from '../app/js/racing/course-furniture.js';
import {raceEdgeInsideAnotherSpan,raceCoursePerimeter} from '../app/js/racing/course-boundary.js';
const draft={version:1,widthMeters:8,closed:true,anchors:[{x:0,z:0},{x:160,z:0},{x:160,z:120},{x:0,z:120}]};
function context({height=(x,z)=>x*.02+z*.01,water=false,building=false}={}){return {METERS_PER_WORLD_UNIT:1,worldPublication:{requestId:'test',location:{lat:43,lon:7}},LOC:{name:'Field',lat:43,lon:7},SurfaceQuery:{driveAt:(x,z)=>({kind:'terrain',position:{y:height(x,z)},provenance:{confidence:1}}),waterAt:()=>water?{feature:{},position:{y:20}}:null},buildings:building?[{minX:-10,maxX:200,minZ:-10,maxZ:200,minY:-5,maxY:20}]:[]};}
async function build(raw=draft,c=context()){
 const facts=await collectGroundRaceDistrict(c,raw,{yieldWork:async()=>{}}),graph=buildRaceRoadGraph(facts.roads),path=facts.roads.slice().sort((a,b)=>Number(a.sourceId.split(':').at(-1))-Number(b.sourceId.split(':').at(-1))).map(r=>r.sourceId+':forward');
 return {facts,graph,course:createRaceCourse(graph,path,{...facts,groundDraft:raw,discipline:raw.closed?'circuit':'sprint',participants:4})};
}
test('a sparse terrain draft produces rounded ordered support, a usable grid, clean outline and durable requalification',async()=>{
 const {facts,graph,course}=await build();assert.equal(course.surfaceKind,'ground');assert.ok(course.lengthMeters>450&&course.lengthMeters<560);assert.ok(facts.roads.every(r=>r.surfaceKind==='ground'&&!r.surfaceModel));
 const restored=restoreRaceCourse(raceCourseReference(course,await raceDistrictFingerprint(facts)),facts,graph,await raceDistrictFingerprint(facts));assert.equal(restored.lengthMeters,course.lengthMeters);assert.deepEqual(restored.groundDraft,draft);
 const layout=cleanGroundRaceLayout(draft);assert.ok(layout.length>12);assert.ok(layout.every(p=>!draft.anchors.some(a=>p.x===a.x&&p.z===a.z)),'corner apex is rounded, not an angular steering trace');
 const paint=buildRacePaint(course);assert.ok(paint.positions.length>3000&&paint.positions.every(Number.isFinite));
 const edges=raceCoursePerimeter(course);assert.ok(edges.length>20);for(const e of edges)assert.ok(e.lengthMeters>0);
 const endpoints=new Map();for(const e of edges)for(const p of [e.a,e.b]){const key=p.x+':'+p.z;endpoints.set(key,(endpoints.get(key)||0)+1);}assert.ok([...endpoints.values()].every(n=>n===2),'the finished loop has continuous closed outer and inner boundaries');
 const furniture=buildRaceFurniture(course);assert.equal(furniture.perimeter,'marked-ground');assert.ok(furniture.chunks.every(c=>c.fencePositions.length===0));assert.ok(furniture.chunks.some(c=>c.positions.length>0));
 const changed=await collectGroundRaceDistrict(context({height:(x,z)=>x*.02+z*.01+.1}),draft,{yieldWork:async()=>{}});assert.throws(()=>restoreRaceCourse(raceCourseReference(course,awaitNever),changed,graph,'bad'));
});
const awaitNever='race-district:'+'0'.repeat(64);
test('self crossings, folds, water, buildings, excessive grade, rough terrain and stale publications reject',async()=>{
 assert.throws(()=>cleanGroundRaceLayout({...draft,anchors:[{x:0,z:0},{x:160,z:120},{x:160,z:0},{x:0,z:120}]}),/crossing|sharp/);
 assert.throws(()=>cleanGroundRaceLayout({...draft,closed:false,anchors:[{x:0,z:0},{x:100,z:0},{x:20,z:1}]}),/sharp/);
 for(const [options,error]of [[{water:true},/water/],[{building:true},/blocked/],[{height:x=>x*.3},/grade/],[{height:(x,z)=>Math.sin(x)*.4},/rough|grade/],[{height:()=>NaN},/unsupported/]])await assert.rejects(collectGroundRaceDistrict(context(options),draft,{yieldWork:async()=>{}}),error);
 await assert.rejects(collectGroundRaceDistrict(context(),draft,{current:()=>false}),/world_changed/);
});
test('drive cleanup removes wobble and road recording respects topology, heading and separate decks',()=>{
 const raw=Array.from({length:100},(_,i)=>({x:Math.sin(i)*.5,z:i*4}));assert.equal(simplifyRaceDrive(raw,2).length,2);
 const roads=[{sourceId:'a',a:{x:0,y:0,z:0},b:{x:0,y:0,z:100},widthMeters:8,supported:true,driveable:true},{sourceId:'b',a:{x:0,y:0,z:100},b:{x:100,y:0,z:100},widthMeters:8,supported:true,driveable:true},{sourceId:'remote',a:{x:100,y:0,z:101},b:{x:200,y:0,z:101},widthMeters:8,supported:true,driveable:true}],g=buildRaceRoadGraph(roads);
 const a=recordRaceRoadSpan(g,{x:.3,y:0,z:50,yaw:0});assert.equal(a.id,'a:forward');assert.equal(recordRaceRoadSpan(g,{x:150,y:0,z:101,yaw:Math.PI/2},a),null);assert.equal(recordRaceRoadSpan(g,{x:0,y:12,z:50,yaw:0}),null);
 assert.equal(recordRaceRoadSpan(g,{x:50,y:0,z:100,yaw:Math.PI/2},a).id,'b:forward');
});
test('an internal selected junction edge is removed while an outside branch boundary stays solid',()=>{
 const g=buildRaceRoadGraph([{sourceId:'a',a:{x:0,y:0,z:0},b:{x:0,y:0,z:120},widthMeters:10,supported:true,driveable:true},{sourceId:'b',a:{x:0,y:0,z:120},b:{x:120,y:0,z:120},widthMeters:10,supported:true,driveable:true}]),course=createRaceCourse(g,['a:forward','b:forward'],{locationId:'test',anchor:{lat:43,lon:7},participants:1});
 assert.equal(raceEdgeInsideAnotherSpan(course,{x:4.8,y:0,z:119},course.segments[0]),true);assert.equal(raceEdgeInsideAnotherSpan(course,{x:-4.8,y:0,z:60},course.segments[0]),false);
});
