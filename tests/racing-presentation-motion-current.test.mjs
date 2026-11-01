import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRaceRoadGraph,createRaceCourse} from '../app/js/racing/course-rules.js';
import {createRaceVehicleProfile} from '../app/js/racing/vehicle-controller.js';
import {createRaceSession} from '../app/js/racing/session-rules.js';
import {createPracticeRaceController} from '../app/js/racing/road-activity-controller.js';
import {advanceRoadRaceFrame} from '../app/js/physics/road-race-delegate.js';

function setup() {
 const graph=buildRaceRoadGraph([{sourceId:'straight',a:{x:0,y:3,z:0},b:{x:0,y:3,z:3000},widthMeters:12,driveable:true,supported:true}]);
 const course=createRaceCourse(graph,['straight:forward'],{locationId:'test',anchor:{lat:43,lon:7},participants:2});
 const profile=createRaceVehicleProfile('bmw_e34');
 return {course,profile};
}
test('a held throttle presents continuous practice motion across zero/one/two authoritative ticks',()=>{
 const {course,profile}=setup(),context={worldPublication:{},car:{personalVehicleId:'bmw_e34'},Walk:{state:{mode:'drive'}},activateSurfaceActivity(){return true;}};
 const run=createPracticeRaceController({context,course,profile});context.roadRaceController=run;run.start();
 let previous=null,stalled=0,doubled=0;const ratios=[];
 // Real render cadence can straddle a 60 Hz tick even at almost 60 FPS.
 for(let i=0;i<1100;i++) {
  const dt=[.0156,.0177,.0166,.0167,.025,.0084][i%6];advanceRoadRaceFrame(context,dt,{throttle:1});
  const official=run.snapshot(),view=run.presentationSnapshot?.()||official,frame={...context.car},sim=official.simulationAtMs;
  if(previous&&frame.speed>30) {
   const ticks=(sim-previous.sim)/(1000/60);if(ticks<.01)stalled++;if(ticks>1.99)doubled++;
   const distance=Math.hypot(frame.x-previous.frame.x,frame.z-previous.frame.z);
   assert.ok(distance>0,'a rendered moving car must not repeat its prior fixed pose');
   ratios.push(distance/dt/(frame.vFwd*.22352/course.metersPerUnit));
   assert.equal(frame.z,view.players[0].vehicleState.z,'body/camera and rivals consume the same sampled timeline');
  }
  previous={frame,sim};
 }
 assert.ok(stalled>10&&doubled>10,'exercise both sides of the timing boundary');
 const mean=ratios.reduce((a,b)=>a+b,0)/ratios.length;
 const deviation=Math.sqrt(ratios.reduce((a,b)=>a+(b-mean)**2,0)/ratios.length);
 assert.ok(deviation<.015,`rendered speed deviation ${deviation} must stay below 1.5%`);
 run.dispose();
});
test('presentation sampling is bounded to adjacent session frames and cannot change authoritative results',()=>{
 const {course,profile}=setup(),session=createRaceSession({id:'motion',course,creatorUid:'one',createdAtMs:0});
 session.add({uid:'one',profile});session.add({uid:'two',profile,ai:true});session.setReady('one',true);session.start('one',0);
 let sequence=0;
 for(let now=50;now<=8000;now+=50){session.control('one',sequence++,{throttle:1},now);session.advance(now);}
 session.advance(8008);const before=session.snapshot();session.advance(8009);const authoritative=session.snapshot(),view=session.presentationSnapshot?.()||authoritative;
 assert.deepEqual(session.snapshot(),authoritative,'sampling cannot mutate the authority');
 for(const p of view.players) {
  const actual=authoritative.players.find(row=>row.uid===p.uid);
  assert.ok(p.pose.z<actual.pose.z&&p.pose.z>actual.pose.z-1,'sample the two most recent simulated poses');
  assert.deepEqual(p.progress,actual.progress);assert.equal(p.pose.z,p.vehicleState.z);
 }
 assert.equal(before.simulationAtMs,authoritative.simulationAtMs);
 view.players[0].vehicleState.z=-100;assert.deepEqual(session.snapshot(),authoritative,'presentation owns no mutable authority objects');
 session.cancel();assert.deepEqual(session.presentationSnapshot(),session.snapshot(),'terminal poses must not interpolate into another run');
});
