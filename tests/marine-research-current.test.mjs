import test from 'node:test';import assert from 'node:assert/strict';
import {ensureMarineResearch,reefSurveyState,reefScanAdmission,REEF_SURVEY} from '../app/js/ocean/research-outing.js';
import {createMemoryDiscoveryProfileStore} from '../app/js/discovery/profile-store.js';
import {CORAL_SHELF_SITE,createMarineHabitatPlan} from '../app/js/ocean/habitat-plan.js';
function fixture(store=createMemoryDiscoveryProfileStore()){
 const deck={active:true,pose:{x:-3.5,z:-10}},habitat={plan:createMarineHabitatPlan({site:CORAL_SHELF_SITE,sampleSeabedHeight:()=>-30}),group:{userData:{habitat:{assetState:'ready'}}}};
 const ctx={LOC:CORAL_SHELF_SITE,SCALE:100000,METERS_PER_WORLD_UNIT:1,paused:false,boat:{x:0,y:0,z:0},boatDeck:{snapshot:()=>deck},boatMode:{active:true,transportCatalogId:'ocean-research-vessel',transportEntityId:'parent'},oceanVoyage:{current:{site:CORAL_SHELF_SITE,ship:{transportEntityId:'parent'}}},oceanMode:{active:false,habitat,submarine:{position:{x:0,y:-10,z:0},speed:0,verticalSpeed:0}}};
 const research=ensureMarineResearch(ctx,{store,now:()=>10000000});return {ctx,deck,research,store,submerge(){deck.active=false;ctx.boatMode.active=false;ctx.oceanMode.active=true},surface(){deck.active=true;ctx.boatMode.active=true;ctx.oceanMode.active=false}};
}
test('first outing requires lab briefing, three distinct scans and lab submission before range upgrade',async()=>{
 const f=fixture();await f.research.refresh();assert.equal(f.research.snapshot().stage,'briefing');
 f.deck.pose={x:0,z:-24};assert.equal(await f.research.labAction(),false);f.deck.pose={x:-3.5,z:-10};assert.equal(await f.research.labAction(),true);f.submerge();
 for(let i=0;i<3;i++){const s=f.research.snapshot();assert.equal(s.scans.length,i);assert.equal(s.rangeMeters,18);Object.assign(f.ctx.oceanMode.submarine.position,{...s.target,y:s.target.y+10});assert.equal(await f.research.scan(),true);}
 assert.equal(f.research.snapshot().stage,'report');assert.equal(f.research.snapshot().rangeMeters,18);assert.equal(await f.research.labAction(),false);f.surface();assert.equal(await f.research.labAction(),true);
 assert.equal(f.research.snapshot().rangeMeters,35);assert.equal(f.research.snapshot().stage,'complete');await f.research.labAction();assert.equal((await f.store.listEvents()).length,5);
 const reloaded=fixture(f.store);await reloaded.research.refresh();assert.equal(reloaded.research.snapshot().completed,true);reloaded.submerge();const t=reloaded.research.snapshot().target;Object.assign(reloaded.ctx.oceanMode.submarine.position,{x:t.x,y:t.y+26,z:t.z});assert.equal(reloaded.research.snapshot().canScan,true);assert.equal(await reloaded.research.scan(),true);assert.equal(await reloaded.research.scan(),true);assert.equal((await f.store.listEvents()).length,6);assert.equal((await f.store.getProfile()).explorerProgress.points,0);
});
test('scan gates reject moving, distant, paused, missing-asset and wrong-world claims',()=>{
 const base={active:true,paused:false,ready:true,position:{x:0,y:-20,z:0},target:{x:0,y:-30,z:0,label:'A'},speed:0,verticalSpeed:0,rangeMeters:18,metersPerUnit:1};assert.equal(reefScanAdmission(base).allowed,true);
 for(const patch of [{speed:2},{verticalSpeed:1},{paused:true},{active:false},{ready:false},{target:null},{position:{x:NaN,y:0,z:0}},{position:{x:0,y:0,z:0}},{metersPerUnit:0}])assert.equal(reefScanAdmission({...base,...patch}).allowed,false);
 assert.equal(reefScanAdmission({...base,position:{x:0,y:-4,z:0},rangeMeters:35}).allowed,true);assert.equal(reefScanAdmission({...base,position:{x:0,y:-4,z:0}}).allowed,false);
});
test('an isolated report or wrong-authority events cannot grant an upgrade',()=>{
 const report={eventId:`${REEF_SURVEY.id}:report`,sourceSystem:'marine-research',activityId:REEF_SURVEY.id,metadata:{truthType:'authored'}};assert.equal(reefSurveyState([report]).completed,false);
 const forged=['brief',...REEF_SURVEY.sites,'report'].map(id=>({...report,eventId:`${REEF_SURVEY.id}:${id}`,sourceSystem:'another-system'}));assert.equal(reefSurveyState(forged).completed,false);
});
test('recovering before completion retains scans; a different vessel/location cannot submit',async()=>{
 const f=fixture();await f.research.refresh();await f.research.labAction();f.submerge();const t=f.research.snapshot().target;Object.assign(f.ctx.oceanMode.submarine.position,{...t,y:t.y+8});await f.research.scan();f.surface();
 const next=fixture(f.store);await next.research.refresh();assert.equal(next.research.snapshot().scans.length,1);next.ctx.boatMode.transportEntityId='other';assert.equal(await next.research.labAction(),false);next.ctx.boatMode.transportEntityId='parent';next.ctx.boat.x=10000;assert.equal(await next.research.labAction(),false);
});
test('storage failure cannot advance a scan; retry and duplicate clicks remain idempotent',async()=>{
 const backing=createMemoryDiscoveryProfileStore();let fail=false;
 const f=fixture({...backing,recordExplorerEvent:record=>{if(fail)throw Error('quota');return backing.recordExplorerEvent(record)}});await f.research.refresh();await f.research.labAction();f.submerge();const t=f.research.snapshot().target;Object.assign(f.ctx.oceanMode.submarine.position,{...t,y:t.y+8});fail=true;assert.equal(await f.research.scan(),false);assert.equal(f.research.snapshot().scans.length,0);fail=false;
 const outcomes=await Promise.all([f.research.scan(),f.research.scan()]);assert.equal(outcomes.filter(Boolean).length,1);assert.equal(f.research.snapshot().scans.length,1);
});
test('exact Journal event lookup retains older mission state outside the recent-event window',async()=>{
 const f=fixture();await f.research.refresh();await f.research.labAction();
 for(let i=0;i<510;i++)await f.store.recordExplorerEvent({eventId:`later-${i}`,eventType:'test',occurredAt:20000000+i,projections:{profile:false}});
 assert.ok(!(await f.store.listEvents(500)).some(e=>e.eventId.endsWith(':brief')));const next=fixture(f.store);await next.research.refresh();assert.equal(next.research.snapshot().started,true);await assert.rejects(()=>f.store.getEventsById(Array(33).fill('id')),/32/);
});
