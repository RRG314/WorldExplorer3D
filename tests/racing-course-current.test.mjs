import test from'node:test';import assert from'node:assert/strict';
import {buildRaceRoadGraph,shortestRacePath,createRaceCourse,raceGridPose,createRaceProgress,advanceRaceProgress,projectRacePosition}from'../app/js/racing/course-rules.js';
const road=(id,a,b,more={})=>({sourceId:id,a:{y:0,...a},b:{y:0,...b},widthMeters:7,driveable:true,supported:true,...more});
function setup(){const graph=buildRaceRoadGraph([road('a',{x:0,z:0},{x:0,z:120}),road('b',{x:0,z:120},{x:120,z:120}),road('c',{x:120,z:120},{x:120,z:0}),road('d',{x:120,z:0},{x:0,z:0})]);return {graph,settings:{name:'City loop',locationId:'test-city',locationLabel:'Test city',anchor:{lat:43.7,lon:7.4},participants:2}};}
test('roads require real support, width and clearance; stacked decks cannot become a junction',()=>{
 const g=buildRaceRoadGraph([road('ground',{x:0,z:0},{x:0,z:250}),road('bridge',{x:0,y:8,z:0},{x:250,y:8,z:0},{structure:'bridge',connectionLayer:'bridge'}),road('water',{x:0,z:0},{x:300,z:0},{supported:false}),road('narrow',{x:0,z:0},{x:300,z:0},{widthMeters:3}),road('low',{x:0,z:0},{x:300,z:0},{structure:'tunnel',clearanceMeters:2})]);
 assert.equal(g.edges.length,4);assert.notEqual(g.edges[0].from,g.edges[2].from);assert.throws(()=>shortestRacePath(g,g.edges[0].from,g.edges[2].to),/disconnected/);
});
test('mapped connected paths, circuit rules, grid clearance and one-way restrictions are enforced',()=>{
 const {graph,settings}=setup(),path=shortestRacePath(graph,0,2);assert.equal(path.length,2);
 const course=createRaceCourse(graph,['a:forward','b:forward','c:forward','d:forward'],{...settings,discipline:'circuit',laps:2});assert.equal(course.lengthMeters,480);assert.equal(course.laps,2);
 assert.notEqual(raceGridPose(course,0).x,raceGridPose(course,1).x);
 assert.throws(()=>createRaceCourse(graph,path,{...settings,discipline:'circuit'}),/not_closed/);
 assert.throws(()=>createRaceCourse(graph,['a:forward','a:reverse','b:forward'],settings),/too_sharp/);
 const one=buildRaceRoadGraph([road('one',{x:0,z:0},{x:0,z:250},{direction:'forward'})]);assert.throws(()=>shortestRacePath(one,1,0),/disconnected/);
});
test('sprint requires ordered forward gate crossings; client elapsed time cannot award a finish',()=>{
 const {graph,settings}=setup(),course=createRaceCourse(graph,['a:forward','b:forward'],settings),start=raceGridPose(course,0);let p=createRaceProgress(start,0);
 for(let i=1;i<=120;i++){const distance=2+i*2,pose=distance<120?{x:start.x,z:distance,y:0}:{x:distance-120,z:120,y:0};p=advanceRaceProgress(course,p,pose,i*100,{startedAtMs:0,maximumMetersPerSecond:30});}
 assert.equal(p.finished,true);assert.ok(p.elapsedMs>11000&&p.elapsedMs<12000);assert.equal(p.lapTimes.length,1);
});
test('teleports, off-course positions, stacked-deck shortcuts and early starts cannot produce records',()=>{
 const {graph,settings}=setup(),course=createRaceCourse(graph,['a:forward','b:forward'],settings),pose=raceGridPose(course,0),p=createRaceProgress(pose,0);
 assert.throws(()=>advanceRaceProgress(course,p,{x:119,z:120,y:0},100,{startedAtMs:0}),/implausible/);
 assert.throws(()=>advanceRaceProgress(course,p,{...pose,x:20},1000,{startedAtMs:0}),/outside/);
 assert.equal(projectRacePosition(course,{...pose,y:8}),null);
 assert.throws(()=>advanceRaceProgress(course,p,{...pose,z:3},1000,{startedAtMs:3000}),/false_start/);
 const bypass=advanceRaceProgress(course,p,{...pose,z:115},5000,{startedAtMs:0});assert.equal(bypass.finished,false);assert.equal(bypass.nextGate,4);
});

test('legal bridge abutments connect in 3D and the back grid row is behind the front row',()=>{
 const graph=buildRaceRoadGraph([road('land',{x:0,z:0},{x:0,z:100}),road('bridge',{x:0,z:100},{x:0,z:230},{structure:'bridge',connectionLayer:'bridge'})]);
 assert.equal(shortestRacePath(graph,0,2).length,2);
 const course=createRaceCourse(graph,['land:forward','bridge:forward'],{...setup().settings,participants:4});
 assert.ok(raceGridPose(course,0).z>raceGridPose(course,2).z);
});
test('a diagonal shortcut between two legal roads is rejected along its swept path',()=>{
 const {graph,settings}=setup(),course=createRaceCourse(graph,['a:forward','b:forward'],settings);
 const p=createRaceProgress({x:0,z:100,y:0},0);
 assert.throws(()=>advanceRaceProgress(course,p,{x:20,z:120,y:0},1000,{startedAtMs:0}),/outside/);
 assert.throws(()=>advanceRaceProgress(course,p,{x:0,z:101,y:0},100),/clock/);
});

test('qualified nonlinear elevations and road banking survive direction reversal and timing-line placement',async()=>{
 const {sampleRaceSegmentY}=await import('../app/js/racing/course-rules.js');
 const graph=buildRaceRoadGraph([road('hill',{x:0,z:0},{x:0,z:250},{heightSampleSpanMeters:1.2,heightSamples:[{t:0,y:0,leftY:.1,rightY:-.1},{t:.5,y:8,leftY:8.1,rightY:7.9},{t:1,y:0,leftY:.1,rightY:-.1}]})]);
 const settings=setup().settings,forward=createRaceCourse(graph,['hill:forward'],settings),reverse=createRaceCourse(graph,['hill:reverse'],settings);
 assert.equal(sampleRaceSegmentY(forward.segments[0],.5),8);assert.equal(sampleRaceSegmentY(forward.segments[0],.5,-1.2),8.1);
 assert.equal(sampleRaceSegmentY(reverse.segments[0],.5,1.2),8.1);
 const {createRaceVehicleProfile,createRaceVehicleState,stepRaceVehicle}=await import('../app/js/racing/vehicle-controller.js');
 const profile=createRaceVehicleProfile('cadillac_fleetwood'),car=createRaceVehicleState(raceGridPose(forward,0),profile);
 for(let i=0;i<300;i++)stepRaceVehicle(forward,car,{throttle:.5},1/60,profile);
 assert.ok(car.y>2);assert.ok(Math.abs(car.terrainRoll)>.01);assert.ok(car.maximumWheelPenetration<1e-6);
});
test('a starting grid may span connected survey segments without replacing their geography',()=>{
 const roads=Array.from({length:30},(_,i)=>({sourceId:'survey-'+i,a:{x:0,y:i*.2,z:i*10},b:{x:0,y:(i+1)*.2,z:(i+1)*10},widthMeters:8,driveable:true,supported:true}));
 const graph=buildRaceRoadGraph(roads,{metersPerUnit:1}),course=createRaceCourse(graph,roads.map(r=>r.sourceId+':forward'),{locationId:'survey',anchor:{lat:43,lon:7},participants:4});
 assert.equal(course.segments.length,30);assert.equal(course.points.length,31);
 const front=raceGridPose(course,0),back=raceGridPose(course,2);assert.equal(front.z,10);assert.equal(back.z,2);assert.ok(front.y>back.y);
});
