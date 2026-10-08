import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveCurrentJourney, deriveSpaceJourney, createCurrentJourneyUi} from '../app/js/tutorial/current-journey.js';
const stale = {state:'planned',podJourney:{phase:'local_flight'},destinationId:'proxima'};
test('retained space state cannot claim Earth or ocean guidance',()=>{
 for(const environment of ['EARTH','OCEAN']){
  assert.equal(deriveCurrentJourney({getEnv:()=>environment,oceanMode:{active:environment==='OCEAN'},getInterstellarExpeditionSnapshot:()=>stale}),null);
 }
});
test('a selected course overrides inactive expedition history, including a zero-point completion',()=>{
 for(const state of ['planned','completed','failed']) {
  const journey=deriveSpaceJourney({spaceFlight:{active:true},getInterstellarExpeditionSnapshot:()=>({state,campaignResult:{totalPoints:0}}),getUniverseHudTarget:()=>({course:{destination:{id:'mars',name:'Mars'},guidance:'manual'}})});
  assert.equal(journey.title,'Mars');assert.equal(journey.owner,'wayfinder');
 }
});
test('active expedition travel retains priority and never invents completion points',()=>{
 const context={spaceFlight:{active:true},getInterstellarExpeditionSnapshot:()=>({state:'traveling',destinationId:'proxima'})};
 assert.match(deriveSpaceJourney(context).title,/Proxima/);
 context.getInterstellarExpeditionSnapshot=()=>({state:'completed',campaignResult:{totalPoints:0}});
 assert.match(deriveSpaceJourney(context).detail,/0 total points/);
 context.getInterstellarExpeditionSnapshot=()=>({state:'completed'});
 assert.doesNotMatch(deriveSpaceJourney(context).detail,/100/);
});
test('current surface mission supplies the objective and opens its own destination',()=>{
 let opened=null;
 const journey=deriveCurrentJourney({getEnv:()=> 'MARS',getInterstellarExpeditionSnapshot:()=>({podJourney:{phase:'surface'}}),
  getDestinationMissionSnapshot:()=>({activeMissionId:'survey',destinationId:'mars-site',atDestination:true,phase:'fieldwork',title:'Mars survey',currentObjective:'Sample the marked ridge'}),openDestinationMission:id=>opened=id});
 assert.equal(journey.detail,'Sample the marked ridge');assert.equal(journey.owner,'destination-mission');
 journey.action();assert.equal(opened,'mars-site');
});
test('return analysis uses the same mission objective instead of generic ship advice',()=>{
 const journey=deriveCurrentJourney({activeShipInterior:true,getInterstellarExpeditionSnapshot:()=>({state:'arrived',podJourney:{phase:'recovered'}}),
  getDestinationMissionSnapshot:()=>({activeMissionId:'survey',destinationId:'mars-site',phase:'analysis',title:'Mars survey',currentObjective:'Compare the returned samples'})});
 assert.equal(journey.detail,'Compare the returned samples');assert.equal(journey.eyebrow,'RESEARCH ANALYSIS');
});
test('an activity with its own HUD suppresses unrelated journey cards',()=>{
 for(const extra of [{fishingGame:{open:true}},{getGameplayRegistrySnapshot:()=>({activeId:'route:test'})}]) {
  assert.equal(deriveCurrentJourney({spaceFlight:{active:true},...extra}),null);
 }
});
function dom(){
 const nodes=new Map();return {nodes,getElementById(id){if(!nodes.has(id))nodes.set(id,{hidden:true,events:{},addEventListener(name,fn){this.events[name]=fn}});return nodes.get(id)}};
}
test('dismissal remains stable as distance changes but a new objective can appear',()=>{
 const previous=globalThis.document;const fake=dom();globalThis.document=fake;
 try{
  let distance=10,target='A';const ctx={gameStarted:true,getEnv:()=> 'EARTH',worldDiscoveryRuntimeSnapshot:()=>({active:true,requestId:'world',interaction:{phase:'idle'},fieldExpedition:{objectives:[{id:target,targetLabel:target,distanceMeters:distance}]}})};
  const ui=createCurrentJourneyUi(ctx);ui.update(1);assert.equal(fake.nodes.get('currentJourneyCard').hidden,false);
  fake.nodes.get('currentJourneyDismiss').events.click();distance=11;ui.update(1);
  assert.equal(fake.nodes.get('currentJourneyCard').hidden,true);assert.equal(ctx.getCurrentJourneySnapshot().dismissed,true);
  target='B';ui.update(1);assert.equal(fake.nodes.get('currentJourneyCard').hidden,false);
 }finally{globalThis.document=previous;}
});
test('review finding opens fieldwork without pretending to save it; environment exit clears the snapshot',()=>{
 const previous=globalThis.document;globalThis.document=dom();let opened='';
 try{
  const ctx={gameStarted:true,worldDiscoveryRuntimeSnapshot:()=>({active:true,activeActivityId:'survey',interaction:{phase:'revealed',targetName:'Rock'}}),openWorldDiscoverySection:section=>opened=section};
  const ui=createCurrentJourneyUi(ctx);ui.update(1);assert.equal(ctx.getCurrentJourneySnapshot().actionLabel,'Review finding');
  globalThis.document.nodes.get('currentJourneyAction').events.click();assert.equal(opened,'today');
  ctx.oceanMode={active:true};ui.update(1);assert.equal(ctx.getCurrentJourneySnapshot(),null);
 }finally{globalThis.document=previous;}
});

test('Earth movement tutorial does not hide the active space objective',()=>{
 const previous=globalThis.document;globalThis.document=dom();
 try {
  const ctx={gameStarted:true,spaceFlight:{active:true},getEnv:()=> 'SPACE_FLIGHT'};
  const ui=createCurrentJourneyUi(ctx,{getTutorialSnapshot:()=>({enabled:true,stage:'move'})});
  ui.update(1);assert.equal(ctx.getCurrentJourneySnapshot().visible,true);
 }finally{globalThis.document=previous;}
});

test('Solar System travel uses the current travel session when universe HUD has no target',()=>{
 const ctx={spaceFlight:{active:true},getUniverseHudTarget:()=>null,getSpaceTravelSession:()=>({active:true,destination:{id:'mars',name:'Mars'},guidance:'manual'})};
 assert.equal(deriveCurrentJourney(ctx).title,'Mars');
 ctx.getSpaceTravelSession=()=>({active:false,destination:{id:'mars',name:'Mars'}});
 assert.notEqual(deriveCurrentJourney(ctx).title,'Mars');
});
