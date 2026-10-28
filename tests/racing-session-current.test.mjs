import test from'node:test';import assert from'node:assert/strict';
import {buildRaceRoadGraph,createRaceCourse}from'../app/js/racing/course-rules.js';import {createRaceVehicleProfile}from'../app/js/racing/vehicle-controller.js';
import {createRaceSession,normalizeRaceActions}from'../app/js/racing/session-rules.js';
function setup(onComplete=()=>{}){const graph=buildRaceRoadGraph([{sourceId:'road',a:{x:0,y:0,z:0},b:{x:0,y:0,z:250},widthMeters:8,driveable:true,supported:true}]);const course=createRaceCourse(graph,['road:forward'],{locationId:'test',anchor:{lat:43,lon:7},participants:3});const profile=createRaceVehicleProfile('bmw_e34');const session=createRaceSession({id:'test',course,creatorUid:'one',createdAtMs:0,onComplete});session.add({uid:'one',profile});session.add({uid:'two',profile});return {session,profile};}
test('a locked countdown, server clock and input-only controller determine two-player results once',()=>{
 let completions=0;const {session}=setup(()=>completions++);session.setReady('one',true);assert.throws(()=>session.start('one',0),/not_ready/);session.setReady('two',true);session.start('one',0);
 assert.throws(()=>session.add({uid:'late'}),/locked/);assert.throws(()=>session.control('one',0,{pose:{z:250}},100),/controls/);
 let now=0,seq=0,snapshot;for(;now<30000;now+=50){for(const [uid,throttle]of [['one',1],['two',.8]])if(!session.snapshot().players.find(p=>p.uid===uid).progress?.finished)session.control(uid,seq,{throttle},now);seq++;snapshot=session.advance(now);if(snapshot.phase==='complete')break;}
 assert.equal(snapshot.phase,'complete');assert.equal(snapshot.players.length,2);assert.equal(snapshot.players[0].uid,'one');assert.ok(snapshot.players.every(p=>p.progress.finished&&p.progress.elapsedMs>4000));
 session.advance(now+50);assert.equal(completions,1);
});
test('disconnect braking, bounded reconnect, host departure and stale input do not reset the clock',()=>{
 const {session}=setup();session.setReady('one',true);session.setReady('two',true);session.start('one',0);session.control('one',1,{throttle:1},4000);
 assert.throws(()=>session.control('one',1,{throttle:1},4000),/obsolete/);
 session.disconnect('one',4100);session.reconnect('one',5000);assert.equal(session.snapshot().startAtMs,4000);
 session.leave('one',5000);for(let now=50;now<=5000;now+=50)session.advance(now);
 assert.equal(session.snapshot().phase,'running');assert.equal(session.snapshot().players.find(p=>p.uid==='one').dnf,true);assert.equal(session.snapshot().startAtMs,4000);
 session.disconnect('two',5000);for(let now=5050;now<=15100;now+=50)session.advance(now);assert.equal(session.snapshot().phase,'complete');
 assert.throws(()=>session.reconnect('two',16000),/expired/);
});
test('nonfinite controls, excessive clocks and invented boost cannot create trusted movement',()=>{
 for(const controls of [{throttle:99},{steer:NaN},{boost:1},{elapsedMs:1},{throttle:'1'}])assert.throws(()=>normalizeRaceActions(controls),/invalid/);
 const {session}=setup();session.setReady('one',true);session.setReady('two',true);session.start('one',0);const result=session.advance(10000);assert.equal(result.phase,'cancelled');assert.equal(result.reason,'race_authority_stalled');
});
