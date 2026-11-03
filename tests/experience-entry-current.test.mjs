import test from 'node:test';import assert from 'node:assert/strict';
import {CAREER_EXPERIENCES,EXPERIENCES,LEGACY_EXPERIENCE_IDS,experienceById,resolveExperienceId} from '../app/js/experiences/catalog.js';
import {createExperienceIntent,createExperienceEntry,experienceOffer} from '../app/js/experiences/entry.js';
test('one reference catalog retains the full career portfolio and legacy entry IDs',()=>{
 assert.equal(CAREER_EXPERIENCES.length,20);assert.equal(new Set(EXPERIENCES.map(e=>e.id)).size,EXPERIENCES.length);
 for(const [old,id] of Object.entries(LEGACY_EXPERIENCE_IDS)){assert.equal(resolveExperienceId(old),id);assert.ok(['explore','live-gps'].includes(id)||experienceById(id));}
 assert.equal(resolveExperienceId('invented-mode'),null);
});
test('entry rejects unknown IDs and unbounded destinations without accepting Portal parameters',()=>{
 assert.throws(()=>createExperienceIntent({experienceId:'invented'}));
 assert.throws(()=>createExperienceIntent({experienceId:'career:racer',definitionVersion:2}));
 assert.throws(()=>createExperienceIntent({experienceId:'career:racer',place:{lat:91,lon:0}}));
 const intent=createExperienceIntent({experienceId:'career:racer',place:{lat:51,lon:-1,portalId:'bypass',roomId:'bypass'}});
 assert.equal(Object.hasOwn(intent.place,'portalId'),false);assert.equal(Object.hasOwn(intent.place,'roomId'),false);
 assert.equal(experienceOffer(experienceById('career:racer')).enabled,false);
});
test('cancelled or superseded travel cannot start an activity in a replacement world',async()=>{
 let finish,world='earth:old',starts=0;
 const entry=createExperienceEntry({resolveAdapter:()=>({start:()=>{starts++;}}),launchPlace:()=>new Promise(resolve=>{finish=resolve;}),readWorldIdentity:()=>world});
 const pending=entry.start({experienceId:'career:racer',place:{lat:51,lon:-1}});entry.cancel();world='earth:new';finish(true);
 assert.equal(await pending,false);assert.equal(starts,0);
});
test('the adapter sees the actual loaded world and must accept before entry succeeds',async()=>{
 let world='earth:old';const visited=[];
 const entry=createExperienceEntry({resolveAdapter:()=>({start:({worldIdentity,isCurrent})=>{visited.push(worldIdentity);assert.equal(isCurrent(),true);return false;}}),launchPlace:async()=>{world='earth:chosen';return true;},readWorldIdentity:()=>world});
 assert.equal(await entry.start({experienceId:'career:racer',place:{lat:51,lon:-1}}),false);assert.deepEqual(visited,['earth:chosen']);
});
test('transport-aware entry delegates resume to the existing owner and observes the accepted voyage world',async()=>{
 let world='earth:old',genericTravel=0,transportTravel=0,started=0;
 const adapter={async travel({intent,isCurrent}){assert.equal(intent.experienceId,'career:oceanographer');assert.equal(isCurrent(),true);transportTravel++;world='ocean:saved-voyage';return true;},start({worldIdentity}){assert.equal(worldIdentity,'ocean:saved-voyage');started++;return true;}};
 const entry=createExperienceEntry({resolveAdapter:()=>adapter,launchPlace:()=>{genericTravel++;},readWorldIdentity:()=>world});assert.equal(await entry.start({experienceId:'career:oceanographer'}),true);assert.equal(transportTravel,1);assert.equal(genericTravel,0);assert.equal(started,1);
});
test('a cancelled transport resume exposes cancellation before any late activity may start',async()=>{
 let finish,guard,starts=0;
 const entry=createExperienceEntry({resolveAdapter:()=>({travel:({isCurrent})=>{guard=isCurrent;return new Promise(resolve=>{finish=resolve;});},start:()=>{starts++;}}),readWorldIdentity:()=> 'earth:kept'});
 const pending=entry.start({experienceId:'career:oceanographer'});assert.equal(guard(),true);entry.cancel();assert.equal(guard(),false);finish(true);assert.equal(await pending,false);assert.equal(starts,0);
});
