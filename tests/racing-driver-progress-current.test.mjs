import test from 'node:test';import assert from 'node:assert/strict';
import {createRaceVehicleProfile} from '../app/js/racing/vehicle-controller.js';
import {racePracticeRecordKey,RACE_PHYSICS_VERSION} from '../app/js/racing/record-rules.js';
import {racingCollectionSummary,racePracticeFeedback,racePracticeMetadata} from '../app/js/racing/driver-progress.js';
import {buildRaceRoadGraph,createRaceCourse} from '../app/js/racing/course-rules.js';
import {raceCourseKey} from '../app/js/racing/course-library.js';
import {createMemoryDiscoveryProfileStore} from '../app/js/discovery/profile-store.js';
import {RACE_VENUE_CATALOG,raceVenueById,racingVenueCoverage} from '../app/js/racing/venue-catalog.js';
const course=()=>createRaceCourse(buildRaceRoadGraph([{sourceId:'survey:1',a:{x:0,y:2,z:0},b:{x:0,y:2,z:300},widthMeters:9,driveable:true,supported:true}]),['survey:1:forward'],{locationId:'test',locationLabel:'District',anchor:{lat:43,lon:7}});
test('practice records separate cars, installed builds, condition, grip and surveyed geometry',async()=>{
 const c=course(),p=createRaceVehicleProfile('bmw_e34'),base=await racePracticeRecordKey(c,p);
 assert.equal(await racePracticeRecordKey(structuredClone(c),createRaceVehicleProfile('bmw_e34')),base);
 const keys=await Promise.all([createRaceVehicleProfile('delorean'),createRaceVehicleProfile('bmw_e34',{levels:{'engine-tune':1}}),
  createRaceVehicleProfile('bmw_e34',{condition:.8}),createRaceVehicleProfile('bmw_e34',{grip:.7})].map(p=>racePracticeRecordKey(c,p)));
 assert.equal(new Set([base,...keys]).size,5);c.segments[0].a.y=4;assert.notEqual(await racePracticeRecordKey(c,p),base);
 assert.match(base,/^race-practice-[a-f0-9]{32}$/);
});
test('collector reads preserve both Cadillacs and ordinary/utility choices without granting ownership',()=>{
 const garage={vehicles:{bmw_e34:{condition:1},cadillac_coupe:{condition:.7,homeId:'owned-home'},cadillac_fleetwood:{condition:.9},pickup:{condition:.2},compact:{condition:.8},made_up:{condition:1}}},copy=structuredClone(garage);
 const summary=racingCollectionSummary(garage,{characterState:{proficiencies:{'ground-vehicle':{xp:95}}}});
 assert.equal(summary.owned,5);assert.equal(summary.ready,4);assert.equal(summary.homed,1);assert.deepEqual(summary.families,{classics:3,everyday:1,utility:1});
 assert.deepEqual(summary.skill,{xp:95,label:'Practiced',nextXp:190});assert.deepEqual(garage,copy);assert.equal(racingCollectionSummary(null,null).skill,null);
});
test('clean and consistency feedback requires actual finishes and at least three close laps',()=>{
 const p={barrierContacts:0,progress:{finished:true,penaltyMs:0,lapTimes:[60000,61000,61500]}};
 assert.equal(racePracticeFeedback(p).consistent,true);p.barrierContacts=1;assert.equal(racePracticeFeedback(p).clean,false);assert.equal(racePracticeFeedback(p).consistent,false);
 p.barrierContacts=0;p.progress.lapTimes=[60000];assert.equal(racePracticeFeedback(p).consistent,false);
 p.progress.lapTimes=[60000,61000,70000];assert.equal(racePracticeFeedback(p).consistent,false);p.dnf=true;assert.equal(racePracticeFeedback(p).finished,false);
});
test('accepted practice uses the existing Journal/character transaction, retry identity and repetition limits across car builds',async()=>{
 const store=createMemoryDiscoveryProfileStore(),c=course(),courseId=await raceCourseKey(c),p={vehicleId:'bmw_e34',barrierContacts:0,position:1,progress:{finished:true,elapsedMs:25000,penaltyMs:0,lapTimes:[25000]}};
 const metadata=racePracticeMetadata({discipline:'sprint'},p,{courseId,recordKey:await racePracticeRecordKey(c,createRaceVehicleProfile('bmw_e34')),physicsVersion:RACE_PHYSICS_VERSION});
 const before=await store.getProfile(),record={eventId:'race:first',eventType:'activity-completed',pathId:'activity',sourceSystem:'games-and-activities',sourceId:metadata.recordKey,
  activityId:metadata.recordKey,regionId:'test',firstCompletion:true,metadata,points:0};
 const first=await store.recordExplorerEvent(record);assert.equal(first.recorded,true);
 assert.ok(first.profile.characterState.proficiencies['ground-vehicle'].xp>0);assert.equal(first.profile.explorerProgress.points,before.explorerProgress.points);
 const retry=await store.recordExplorerEvent(record);assert.equal(retry.reason,'already-recorded');assert.deepEqual((await store.getProfile()).characterState,first.profile.characterState);
 for(let i=1;i<7;i++)await store.recordExplorerEvent({...record,eventId:'race:build:'+i,sourceId:'build-'+i,activityId:'build-'+i,metadata:{...metadata,recordKey:'build-'+i}});
 const after=await store.getProfile();assert.equal(Object.keys(after.characterState.repetitionLedger).filter(k=>k.startsWith('road-racing|')).length,1);
 const capped=after.characterState.proficiencies['ground-vehicle'].xp;
 await store.recordExplorerEvent({...record,eventId:'race:capped',activityId:'another-build'});assert.equal((await store.getProfile()).characterState.proficiencies['ground-vehicle'].xp,capped);
 assert.equal(metadata.raceVerified,false);assert.equal(metadata.cleanFinish,true);
 assert.throws(()=>racePracticeMetadata({discipline:'sprint'},{...p,dnf:true},{courseId,recordKey:metadata.recordKey}),/invalid_race_practice/);
});
test('balanced venue reference register does not advertise unbuilt courses as playable or collapse layouts',()=>{
 assert.equal(RACE_VENUE_CATALOG.length,12);assert.equal(new Set(RACE_VENUE_CATALOG.map(v=>v.id)).size,12);
 assert.deepEqual(racingVenueCoverage(),{circuit:{researched:4,playable:0},oval:{researched:4,playable:0},rally:{researched:4,playable:0}});
 assert.equal(raceVenueById('nurburgring-nordschleife').lengthMeters,20832);assert.equal(raceVenueById('ouninpohja-2025-stage').layout,'2025 special stage');
 for(const v of RACE_VENUE_CATALOG){assert.ok(v.source.startsWith('https://'));assert.equal(v.contentRights,'not-cleared');assert.equal(v.playablePack,null);assert.ok(v.requirements.length>=3);}
 assert.throws(()=>RACE_VENUE_CATALOG[0].requirements.push('ready'),TypeError);
});
