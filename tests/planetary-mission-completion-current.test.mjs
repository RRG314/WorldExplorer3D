import test from 'node:test';
import assert from 'node:assert/strict';
import { getDestinationMission } from '../app/js/universe/mission-catalog.js';
import { createDestinationMissionStore } from '../app/js/universe/mission-authority.js';
import { planetarySurveyEquipment, canAnalyzeDestination, canResumeDestinationSurvey } from '../app/js/universe/mission-progression.js';
const mission=getDestinationMission('proxima-centauri-b');
function storage(){const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};}
function labContext(){return {activeShipInterior:true,getShipInteriorSnapshot:()=>({active:true,shipId:'solis-reach',deckId:'command'}),getInterstellarExpeditionSnapshot:()=>({id:'test-expedition',destinationId:mission.systemId,state:'arrived',podJourney:{phase:'recovered',expeditionId:'test-expedition',bodyId:mission.destinationId,returnFrameId:mission.systemId},crew:[]}),Walk:{state:{walker:{x:2,z:3}}},activeInterior:{interactions:[{id:'analysis-review',x:2,z:3,radius:2.15}]}};}
function fieldPackage(store){store.activate(mission);store.advance(mission,'review_briefing');store.advance(mission,'arrive');for(const id of ['photograph','geology-inspect','habitat-survey'])store.recordEvidence(mission,id);store.advance(mission,'complete_fieldwork');}

test('a failed mission write leaves both memory and persisted state unchanged',()=>{
 const disk=storage();const store=createDestinationMissionStore(disk);fieldPackage(store);const before=store.load();
 disk.setItem=()=>{throw Error('quota');};assert.throws(()=>store.advance(mission,'complete_analysis'),/quota/);assert.equal(store.load(),before);assert.equal(createDestinationMissionStore(disk).get(mission).phase,'analysis');assert.equal(planetarySurveyEquipment(store.load()).earned,false);
});
test('analysis requires the returned pod, correct system and actual lab station on its deck',()=>{
 const c=labContext();assert.equal(canAnalyzeDestination(c,mission),true);c.Walk.state.walker.x=20;assert.equal(canAnalyzeDestination(c,mission),false);c.Walk.state.walker.x=2;c.getShipInteriorSnapshot=()=>({active:true,shipId:'solis-reach',deckId:'engineering'});assert.equal(canAnalyzeDestination(c,mission),false);c.getShipInteriorSnapshot=()=>({active:true,shipId:'solis-reach',deckId:'command'});c.getInterstellarExpeditionSnapshot=()=>({destinationId:mission.systemId,state:'arrived',podJourney:{phase:'surface'}});assert.equal(canAnalyzeDestination(c,mission),false);
});
test('completed surface report grants persistent useful range without enlarging sample reach',()=>{
 const disk=storage(),store=createDestinationMissionStore(disk);fieldPackage(store);assert.equal(planetarySurveyEquipment(store.load()).remoteRangeM,18);store.advance(mission,'complete_analysis');const result=planetarySurveyEquipment(createDestinationMissionStore(disk).load());assert.equal(result.remoteRangeM,30);assert.equal(result.sampleRangeM,18);assert.equal(result.earned,true);
 const forged={missions:{x:{destinationId:mission.destinationId,phase:'complete',evidence:['photograph','analysis:x','analysis:y'],history:[{event:'complete_analysis'}]}}};assert.equal(planetarySurveyEquipment(forged).earned,false);
});
test('Journal failure keeps analysis retryable, duplicate clicks and retries do not duplicate rewards',async()=>{
 const oldStorage=globalThis.localStorage,oldDocument=globalThis.document;
 const disk=storage();globalThis.localStorage=disk;globalThis.document={getElementById:()=>({hidden:true})};
 try {
  const runtime=await import('../app/js/universe/mission-runtime.js?completion-test');
  const c=labContext();let calls=0,fail=true,release;const receipts=new Map();
  c.recordExplorerEvent=async event=>{calls++;if(fail)throw Error('offline store');if(release)await new Promise(resolve=>{release=resolve;});if(receipts.has(event.eventId))return {recorded:false,reason:'already-recorded',event:receipts.get(event.eventId)};receipts.set(event.eventId,event);return {recorded:true,event};};
  const store=runtime.initDestinationMissionRuntime(c);fieldPackage(store);
  assert.equal(await c.completeDestinationMissionAnalysis(),false);assert.equal(store.get(mission).phase,'analysis');assert.equal(c.getPlanetarySurveyEquipment().earned,false);
  fail=false;release=true;const first=c.completeDestinationMissionAnalysis();await Promise.resolve();assert.equal(await c.completeDestinationMissionAnalysis(),false);release();assert.equal(await first,true);assert.equal(store.get(mission).phase,'complete');assert.equal(receipts.size,1);assert.equal(calls,2);assert.equal(await c.completeDestinationMissionAnalysis(),false);assert.equal(c.getPlanetarySurveyEquipment().remoteRangeM,30);
 }finally{globalThis.localStorage=oldStorage;globalThis.document=oldDocument;}
});

test('an interrupted final ledger write retries the original Journal result without a second reward',async()=>{
 const oldStorage=globalThis.localStorage,oldDocument=globalThis.document;
 const disk=storage();globalThis.localStorage=disk;globalThis.document={getElementById:()=>({hidden:true})};
 try{
  const runtime=await import('../app/js/universe/mission-runtime.js?completion-retry-test');
  const c=labContext(),receipts=new Map();let failFinal=true;
  const write=disk.setItem;disk.setItem=(key,value)=>{if(failFinal&&JSON.parse(value).missions?.[mission.id]?.phase==='complete')throw Error('quota');write(key,value);};
  c.recordExplorerEvent=async event=>{if(receipts.has(event.eventId))return {recorded:false,reason:'already-recorded',event:receipts.get(event.eventId)};receipts.set(event.eventId,event);return {recorded:true,event};};
  const store=runtime.initDestinationMissionRuntime(c);fieldPackage(store);
  assert.equal(await c.completeDestinationMissionAnalysis('cautious-baseline'),false);assert.equal(store.get(mission).phase,'analysis');assert.equal(receipts.size,1);assert.equal(c.getPlanetarySurveyEquipment().earned,false);
  failFinal=false;assert.equal(await c.completeDestinationMissionAnalysis('priority-follow-up'),true);assert.equal(receipts.size,1);assert.equal(store.get(mission).outcomeId,'cautious-baseline');assert.equal(c.getPlanetarySurveyEquipment().earned,true);
 }finally{globalThis.localStorage=oldStorage;globalThis.document=oldDocument;}
});

test('partial survey redeployment requires the recovered mission pod in the same system',()=>{
 const expedition={id:'a',destinationId:mission.systemId,state:'arrived',podJourney:{phase:'recovered',expeditionId:'a',bodyId:mission.destinationId,returnFrameId:mission.systemId}};
 const c={activeShipInterior:true,universeRuntime:{current:{id:mission.systemId}},getInterstellarExpeditionSnapshot:()=>expedition};
 assert.equal(canResumeDestinationSurvey(c,mission),true);expedition.podJourney.bodyId='other';assert.equal(canResumeDestinationSurvey(c,mission),false);expedition.podJourney.bodyId=mission.destinationId;c.universeRuntime.current.id='sol';assert.equal(canResumeDestinationSurvey(c,mission),false);
});
