import test from 'node:test';import assert from 'node:assert/strict';
import {beginSoloRacer,normalizeSoloRacer,projectSoloRacer,soloRacerSummary,SOLO_RACER} from '../app/js/campaign/solo-racer.js';
import {createMemoryDiscoveryProfileStore} from '../app/js/discovery/profile-store.js';
const garage={selectedId:'bmw_e34',vehicles:{bmw_e34:{condition:1}}};
const start=()=>beginSoloRacer(null,{garage,now:100,ownerUid:'owner'});
let sequence=0;
function finish({time=100000,course='a',venue='silverstone-grand-prix',clean=true,consistent=false,owner='owner',build=0,at=200}={}){
 return {eventId:'race:test:'+ ++sequence,eventType:'activity-completed',sourceSystem:'games-and-activities',sourceId:'race-practice-'+course.repeat(32),activityId:'race-practice-'+course.repeat(32),pathId:'activity',name:'Accepted event',occurredAt:at,environment:'EARTH',regionId:'test',regionLabel:'Test',points:0,metadata:{resultOwner:'game-result',outcome:'completed',racingPracticeVersion:1,racingOwnerUid:owner,vehicleId:'bmw_e34',courseId:'road-race-'+course.repeat(32),physicsVersion:'test-physics',raceConfiguration:{upgrades:{engine:build}},elapsedMs:time,barrierContacts:clean?0:1,penaltyMs:0,cleanFinish:clean,consistentLaps:consistent,racingVenueId:venue}};
}
const tour=()=>{let state=start();for(const e of [finish(),finish({time:98000,at:300}),finish({time:96000,at:400}),finish({venue:'nurburgring-nordschleife',course:'b',at:500}),finish({venue:'daytona-tri-oval',course:'c',at:600})])state=projectSoloRacer(state,e);return state;};
test('the finite tour uses distinct accepted finishes and never confuses a build change with improvement',()=>{
 let state=start();state=projectSoloRacer(state,finish());assert.equal(state.phase,'clean-finish');
 state=projectSoloRacer(state,finish({clean:false,time:99000}));assert.equal(state.phase,'clean-finish');
 state=projectSoloRacer(state,finish({time:98000}));assert.equal(state.phase,'improve-time');
 state=projectSoloRacer(state,finish({time:70000,build:1}));assert.equal(state.phase,'improve-time');
 state=projectSoloRacer(state,finish({time:96000}));assert.equal(state.phase,'venue-tour');
 state=projectSoloRacer(state,finish({venue:'nurburgring-nordschleife',course:'b'}));assert.equal(state.phase,'venue-tour');
 state=projectSoloRacer(state,finish({venue:'daytona-tri-oval',course:'c'}));assert.equal(state.phase,'complete');assert.equal(soloRacerSummary(state).choices.length,3);
});
test('old, unfinished, qualification, wrong-owner and unrecognized results cannot advance the tour',()=>{
 const state=start(),valid=finish();
 for(const event of [{...valid,occurredAt:99},{...valid,eventType:'activity-ended'},{...valid,metadata:{...valid.metadata,racingQualificationVersion:1}},{...valid,metadata:{...valid.metadata,racingOwnerUid:'other'}},{...valid,metadata:{...valid.metadata,elapsedMs:NaN}},{...valid,sourceSystem:'untrusted'}])assert.deepEqual(projectSoloRacer(state,event),state);
 assert.throws(()=>beginSoloRacer(null,{garage:{...garage,vehicles:{bmw_e34:{condition:.2}}},now:100}));
 const future={schemaVersion:9,newerField:{keep:true}};assert.deepEqual(normalizeSoloRacer(future),future);assert.throws(()=>beginSoloRacer(future,{garage}));
});
test('repeat assignments preserve the capstone, require genuine consecutive clean or consistent-lap results, and resume',()=>{
 const complete=tour();let state=beginSoloRacer(complete,{garage,ownerUid:'owner',now:700,variantId:'clean-series'});
 state=projectSoloRacer(state,finish({at:800}));state=projectSoloRacer(state,finish({at:900}));assert.equal(state.repeat.count,2);
 assert.equal(beginSoloRacer(state,{garage,ownerUid:'owner',now:950,variantId:'clean-series'}).repeat.count,2);
 state=projectSoloRacer(state,finish({at:1000,clean:false}));assert.equal(state.repeat.count,0);
 for(let i=0;i<3;i++)state=projectSoloRacer(state,finish({at:1100+i}));assert.equal(state.repeat.phase,'complete');assert.equal(state.completedAt,complete.completedAt);
 state=beginSoloRacer(state,{garage,ownerUid:'owner',now:1200,variantId:'pace-session'});state=projectSoloRacer(state,finish({at:1300,consistent:false}));assert.equal(state.repeat.phase,'active');state=projectSoloRacer(state,finish({at:1400,consistent:true}));assert.equal(state.repeat.phase,'complete');
});
test('the Journal transaction owns career projection and one capstone, retaining previous profile data through replay and backup',async()=>{
 const store=createMemoryDiscoveryProfileStore({profile:{soloRacer:start(),newerField:{keep:true},activeExperience:{experienceId:'career:racer'}}});
 const events=[finish({at:200}),finish({time:98000,at:300}),finish({time:96000,at:400}),finish({venue:'nurburgring-nordschleife',course:'b',at:500}),finish({venue:'daytona-tri-oval',course:'c',at:600})];
 for(const event of events)await store.recordExplorerEvent(event);
 assert.equal((await store.getProfile()).soloRacer.phase,'complete');assert.deepEqual((await store.getProfile()).newerField,{keep:true});
 const before=await store.getProfile();await store.recordExplorerEvent(events.at(-1));assert.deepEqual(await store.getProfile(),before);
 assert.equal((await store.getEventsById([SOLO_RACER.receiptId])).length,1);
 const backup=await store.exportData();const damaged=structuredClone(backup);damaged.events=damaged.events.filter(event=>event.eventId!==events[0].eventId);await assert.rejects(store.importData(damaged));assert.equal((await store.getProfile()).soloRacer.phase,'complete');const restored=createMemoryDiscoveryProfileStore();await restored.importData(backup);assert.equal((await restored.getProfile()).soloRacer.phase,'complete');
});
