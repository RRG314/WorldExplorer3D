import test from 'node:test';
import assert from 'node:assert/strict';
import {lunarReport,harborJourneyState,lunarHomecomingRecord,harborCompletionRecord,lunarCampaignBadges,validateLunarHomecomingBackup,LUNAR_REPORT_ID,LUNAR_DISPLAY_ID} from '../app/js/campaign/lunar-homecoming.js';
import {lunarFieldPlan} from '../app/js/planetary/lunar-survey.js';
import {coastalRecord,COASTAL_SITES,COASTAL_DEPARTURE} from '../app/js/campaign/coastal-departure.js';
import {investigationRecord} from '../app/js/campaign/coastal-investigation.js';
import {prepareSurfaceVoyage} from '../app/js/ocean/voyage.js';
import {createMemoryDiscoveryProfileStore} from '../app/js/discovery/profile-store.js';
function fixture(strategy='samples') {
 const voyage=prepareSurfaceVoyage(COASTAL_SITES[0]),position={x:0,y:0,z:0};let now=100;
 const events=COASTAL_DEPARTURE.parts.map(part=>coastalRecord(part,{site:COASTAL_SITES[0],voyage,position,depth:{truthType:'modeled',depthMeters:30,sourceId:'fixture'},conditions:{},now:now++}));
 const add=(part,metadata={})=>events.push(investigationRecord(part,{voyage,position,now:now++,metadata}));
 add('brief');for(const id of ['habitat','rock','case'])add(`contact:${id}`,{target:{id,x:0,y:-10,z:10,radius:1},sensor:'geometry-sonar',distanceMeters:12});
 add('chart');add('selection',{targetId:'case'});add('view:1',{targetId:'case',sensor:'diver-observation',distanceMeters:2,studyPosition:{x:0,y:-10,z:8}});add('view:2',{targetId:'case',sensor:'diver-observation',distanceMeters:2,studyPosition:{x:4,y:-10,z:8}});add('return',{returnedNormally:true});add('report',{conclusion:'case'});
 const report={eventId:LUNAR_REPORT_ID,eventType:'destination-mission-complete',sourceSystem:'destination-missions',occurredAt:500,metadata:{lunarVersion:1,truthType:'authored',missionId:'mission:moon',strategy,podId:'pod-1',expeditionId:'trip-1',prepared:true,fieldEvidence:lunarFieldPlan(strategy).map(entry=>entry.evidenceId)}};events.push(report);
 const profile={openingChapter:{phase:'complete',careerId:'geology'},homeAchievements:{maker:{eventId:'event:campaign:useful-place:v1',occurredAt:20},home:{eventId:'event:campaign:place-to-return:v1',occurredAt:30}}};
 const home={id:'home-1',locationId:'region-1',workspace:{recordId:LUNAR_REPORT_ID}};return {profile,events,home,report};
}
test('both returned methods earn Lunar Surveyor; incomplete or foreign evidence does not',()=>{
 for(const strategy of ['samples','observe']){
  const f=fixture(strategy);assert.equal(lunarReport(f.events),f.report);assert.deepEqual(lunarCampaignBadges(f.profile,f.events).map(entry=>entry.id),['lunar-surveyor']);
  for(const patch of [{fieldEvidence:[]},{podId:null},{strategy:'unknown'},{truthType:'live'}])assert.equal(lunarReport([{...f.report,metadata:{...f.report.metadata,...patch}}]),null);
 }
});
test('full campaign requires all prior chapters and Earth homecoming in either field strategy',()=>{
 for(const strategy of ['samples','observe']){
  const f=fixture(strategy);assert.equal(harborJourneyState(f.profile,f.events).ready,false);assert.throws(()=>harborCompletionRecord(f.profile,f.events,600));
  f.events.push(lunarHomecomingRecord(f.home,f.report,600));assert.equal(harborJourneyState(f.profile,f.events).ready,true);
  f.events.push(harborCompletionRecord(f.profile,f.events,700));assert.equal(harborJourneyState(f.profile,f.events).complete,true);validateLunarHomecomingBackup(f.profile,f.events);
  for(const id of ['coastal-departure-v1:ladder','coastal-investigation-v1:view:2',LUNAR_DISPLAY_ID]){
   const damaged=f.events.filter(event=>event.eventId!==id);assert.equal(harborJourneyState(f.profile,damaged).complete,false);assert.throws(()=>validateLunarHomecomingBackup(f.profile,damaged));
  }
  assert.equal(harborJourneyState({...f.profile,openingChapter:{}},f.events).complete,false);
  assert.equal(harborJourneyState({...f.profile,homeAchievements:{maker:f.profile.homeAchievements.maker}},f.events).complete,false);
 }
});
test('homecoming rejects wrong display, chronology and forged return; duplicate writes grant no repeated reward',async()=>{
 const f=fixture();assert.throws(()=>lunarHomecomingRecord({...f.home,workspace:{recordId:'other'}},f.report,600));assert.throws(()=>lunarHomecomingRecord(f.home,f.report,400));
 const display=lunarHomecomingRecord(f.home,f.report,600);assert.equal(harborJourneyState(f.profile,[...f.events,{...display,environment:'SPACE_FLIGHT'}]).ready,false);
 const store=createMemoryDiscoveryProfileStore();await store.recordExplorerEvent(display);const duplicate=await store.recordExplorerEvent(display);assert.equal(duplicate.reason,'already-recorded');assert.equal((await store.listEvents()).length,1);assert.equal((await store.getProfile()).explorerProgress.points,0);
});
