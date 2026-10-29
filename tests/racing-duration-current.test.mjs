import test from 'node:test';
import assert from 'node:assert/strict';
import {raceMaximumDurationMs,RACE_MAXIMUM_DURATION_MS} from '../app/js/racing/session-limits.js';
import {buildRaceRoadGraph,createRaceCourse} from '../app/js/racing/course-rules.js';
import {createRaceSession} from '../app/js/racing/session-rules.js';
import {createRaceVehicleProfile} from '../app/js/racing/vehicle-controller.js';
const course=length=>createRaceCourse(buildRaceRoadGraph([{sourceId:'survey',a:{x:0,y:0,z:0},b:{x:0,y:0,z:length},widthMeters:12,driveable:true,supported:true}]),['survey:forward'],{locationId:'fixture',anchor:{lat:52,lon:-1},participants:1});
test('city clocks stay at ten minutes, GP multi-lap runs get recovery room, and long-course policy remains finite',()=>{
 assert.equal(raceMaximumDurationMs({lengthMeters:698.252,laps:1}),600000);
 assert.equal(raceMaximumDurationMs({lengthMeters:5870.386,laps:1}),720000);
 assert.equal(raceMaximumDurationMs({lengthMeters:5870.386,laps:2}),1320000);
 assert.equal(raceMaximumDurationMs({lengthMeters:20832,laps:1}),2220000);
 assert.equal(raceMaximumDurationMs({lengthMeters:20832,laps:3}),RACE_MAXIMUM_DURATION_MS);
 for(const value of [{lengthMeters:NaN,laps:1},{lengthMeters:0,laps:1},{lengthMeters:50000,laps:1},{lengthMeters:200,laps:9},{lengthMeters:20832,laps:4}])assert.throws(()=>raceMaximumDurationMs(value),/invalid_race_duration_course/);
});
test('the real session survives the old city deadline and ends once at its own course deadline without accepting clock jumps',()=>{
 let completed=0;const c=course(7000),session=createRaceSession({id:'duration',course:c,creatorUid:'driver',createdAtMs:0,onComplete:()=>completed++});
 session.add({uid:'driver',profile:createRaceVehicleProfile('bmw_e34')});session.setReady('driver',true);session.start('driver',0);
 for(let at=4250;at<=604000;at+=250)session.advance(at);
 assert.equal(session.snapshot().phase,'running');assert.equal(session.snapshot().maximumDurationMs,840000);
 for(let at=604250;at<=844000;at+=250)session.advance(at);
 const terminal=session.snapshot();assert.equal(terminal.phase,'complete');assert.equal(terminal.players[0].dnf,true);assert.equal(completed,1);
 session.advance(844250);assert.equal(completed,1);
 const stalled=createRaceSession({id:'stalled',course:c,creatorUid:'driver',createdAtMs:0});
 stalled.add({uid:'driver',profile:createRaceVehicleProfile('bmw_e34')});stalled.setReady('driver',true);stalled.start('driver',0);
 assert.equal(stalled.advance(700000).reason,'race_authority_stalled');
});
test('an authority may shorten a session allowance but cannot remove or extend its course bound',()=>{
 const c=course(250),options={id:'fixture',course:c,creatorUid:'driver',createdAtMs:0};
 for(const maximumDurationMs of [Infinity,NaN,0,-1,600001])assert.throws(()=>createRaceSession({...options,maximumDurationMs}),/invalid_race_duration/);
 assert.equal(createRaceSession({...options,maximumDurationMs:1000}).snapshot().maximumDurationMs,1000);
});
