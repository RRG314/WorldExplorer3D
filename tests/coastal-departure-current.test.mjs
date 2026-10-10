import test from 'node:test';import assert from 'node:assert/strict';
import {createCoastalDeparture} from '../app/js/campaign/coastal-departure-runtime.js';
import {COASTAL_SITES,coastalDepartureState,coastalEventIds,coastalRecord,coastalConditions,coastalConditionText,validateCoastalBackup} from '../app/js/campaign/coastal-departure.js';
import {createMemoryDiscoveryProfileStore} from '../app/js/discovery/profile-store.js';
import {prepareSurfaceVoyage} from '../app/js/ocean/voyage.js';
import {CORAL_SHELF_SITE} from '../app/js/ocean/habitat-plan.js';
import {validateJournalBackup} from '../app/js/discovery/backup-validation.js';
function fixture(store=createMemoryDiscoveryProfileStore()){
 const v=prepareSurfaceVoyage(CORAL_SHELF_SITE),started={started:false};let station='chart',now=1000,fail=false;
 const ctx={LOC:CORAL_SHELF_SITE,SCALE:100000,METERS_PER_WORLD_UNIT:1,boat:{x:0,y:0,z:0,speed:0},boatMode:{active:true,moored:true,transportEntityId:v.ship.transportEntityId,mesh:{userData:{researchSubmarine:{userData:{visualLoaded:true}}}}},boatDeck:{active:true,stationDistance:id=>id===station?0:20},oceanVoyage:{current:v,resume:async saved=>{ctx.oceanVoyage.current=saved;ctx.boatMode.transportEntityId=saved.ship.transportEntityId;return true}},oceanMode:{active:false,launchSite:CORAL_SHELF_SITE,submarine:{position:{x:0,y:-9,z:0},transportEntityId:v.subId,mesh:{userData:{visualLoaded:true}}}}};
 const api=createCoastalDeparture(ctx,{store:()=>store,survey:()=>started,now:()=>now,fetchFallback:async()=>null,fetchDepth:async()=>fail?null:{truthType:'modeled',depthMeters:30,sourceId:'GEBCO'}});
 return {ctx,store,api,started,setStation:id=>station=id,clock:n=>now=n,depthFailure:value=>fail=value};
}
async function plan(f){await f.api.refresh();assert.equal(await f.api.act('sites'),true);assert.equal(await f.api.act('plan'),true);}
async function throughCradle(f){await plan(f);f.started.started=true;assert.equal(await f.api.act('station'),true);f.setStation('dive');assert.equal(await f.api.act('ladder'),true);f.setStation('sub');assert.equal(await f.api.act('cradle'),true);}
function submerge(f){f.ctx.boatDeck.active=false;f.ctx.boatMode.active=false;f.ctx.oceanMode.active=true;f.ctx.oceanVoyage.current.stage='underwater';}
test('ordered coastal voyage persists five receipts and one completion without additional points',async()=>{
 const f=fixture();await throughCradle(f);assert.equal(await f.api.act('launch'),false);submerge(f);assert.equal(await f.api.act('launch'),true);assert.equal(await f.api.act('launch'),false);assert.equal(f.api.snapshot().completed,true);
 const events=await f.store.getEventsById(coastalEventIds);assert.equal(events.length,5);assert.equal(events.filter(e=>e.eventType==='campaign-completed').length,1);assert.equal((await f.store.getProfile()).explorerProgress.points,0);validateCoastalBackup(events);
 for(let i=0;i<510;i++)await f.store.recordExplorerEvent({eventId:`newer-${i}`,eventType:'test',occurredAt:10000+i,projections:{profile:false}});
 const again=fixture(f.store);await again.api.refresh();assert.equal(again.api.snapshot().completed,true);const backup=await f.store.exportData();assert.equal(validateJournalBackup(backup).events.length,515);const restored=createMemoryDiscoveryProfileStore();await restored.importData(backup);assert.equal(coastalDepartureState(await restored.getEventsById(coastalEventIds)).completed,true);
});
test('physical gates reject wrong station, moving, paused, shared and unmoored claims',async()=>{
 const f=fixture();await f.api.refresh();f.setStation('lab');assert.equal(await f.api.act('sites'),false);f.setStation('chart');
 for(const [target,key,value] of [[f.ctx,'paused',true],[f.ctx.boatMode,'moored',false],[f.ctx.boat,'speed',1],[f.ctx,'sharedMarine',{active:true}]]){const previous=target[key];target[key]=value;assert.equal(await f.api.act('sites'),false);target[key]=previous;}
 await plan(f);assert.equal(await f.api.act('station'),false);f.started.started=true;f.ctx.boat.x=300;assert.equal(await f.api.act('station'),false);f.ctx.boat.x=0;assert.equal(await f.api.act('station'),true);
 assert.equal(await f.api.act('ladder'),false);f.setStation('dive');assert.equal(await f.api.act('ladder'),true);f.setStation('sub');f.ctx.boatMode.mesh.userData.researchSubmarine.userData.visualLoaded=false;assert.equal(await f.api.act('cradle'),false);
});
test('failed modeled depth cannot become eligible and can be retried; unknown conditions stay labeled',async()=>{
 const f=fixture();await f.api.refresh();f.depthFailure(true);await f.api.act('sites');assert.equal(f.api.snapshot().choices.some(c=>c.allowed),false);assert.equal(await f.api.act('plan'),false);f.depthFailure(false);await f.api.act('sites');f.api.select('north');await f.api.act('plan');assert.equal(f.api.snapshot().site.id,'north');assert.match(coastalConditionText(coastalConditions({waveHeightM:2})),/unavailable/);
});
test('Journal write rejection does not advance and explicit retry remains idempotent',async()=>{
 const backing=createMemoryDiscoveryProfileStore();let fail=true;const store={...backing,recordExplorerEvent:v=>{if(fail)throw Error('quota');return backing.recordExplorerEvent(v)}};const f=fixture(store);await f.api.refresh();await f.api.act('sites');assert.equal(await f.api.act('plan'),false);assert.equal(f.api.snapshot().phase,'available');fail=false;assert.equal((await Promise.all([f.api.act('plan'),f.api.act('plan')])).filter(Boolean).length,1);assert.equal((await store.getEventsById(coastalEventIds)).length,1);
});
test('another voyage restores original saved vessel; failed recovery and clock rollback keep the record',async()=>{
 const f=fixture();await plan(f);const original=f.ctx.oceanVoyage.current;f.ctx.oceanVoyage.current=prepareSurfaceVoyage(CORAL_SHELF_SITE);assert.equal(f.api.snapshot().action,'resume');const resume=f.ctx.oceanVoyage.resume;f.ctx.oceanVoyage.resume=async()=>false;assert.equal(await f.api.act('resume'),false);assert.equal(f.api.snapshot().phase,'station');f.ctx.oceanVoyage.resume=resume;assert.equal(await f.api.act('resume'),true);assert.equal(f.ctx.oceanVoyage.current.id,original.id);f.clock(50);f.started.started=true;assert.equal(await f.api.act('station'),true);assert.equal(f.api.snapshot().phase,'ladder');
});
test('orphan, wrong-authority and mismatched voyage evidence cannot grant completion or restore a different vessel',async()=>{
 const f=fixture();await throughCradle(f);submerge(f);await f.api.act('launch');const events=await f.store.getEventsById(coastalEventIds);
 for(const mutate of [a=>a.slice(1),a=>a.map(e=>({...e,sourceSystem:'other'})),a=>a.map(e=>e.eventId.endsWith(':station')?{...e,metadata:{...e.metadata,voyage:prepareSurfaceVoyage(CORAL_SHELF_SITE)}}:e)]){const invalid=mutate(events);assert.equal(coastalDepartureState(invalid).completed,false);assert.throws(()=>validateCoastalBackup(invalid));}
 assert.throws(()=>coastalRecord('plan',{site:COASTAL_SITES[0],voyage:f.ctx.oceanVoyage.current,depth:{depthMeters:1,sourceId:'GEBCO'},conditions:{}}));
});

test('bundled GEBCO uses the actual ocean grid and rejects absent/outside/land samples',async()=>{
 const {readFile}=await import('node:fs/promises'),{bundledCoastalDepth}=await import('../app/js/ocean/bundled-depth.js');
 const data=JSON.parse(await readFile(new URL('../app/data/ocean-bathymetry-great-barrier-reef.json',import.meta.url),'utf8'));
 for(const site of COASTAL_SITES){const result=bundledCoastalDepth(data,site.lat,site.lon);assert.equal(result.truthType,'modeled');assert.equal(result.bundled,true);assert.ok(result.depthMeters>8);assert.equal(result.fetchedAt,data.source.queryDateUtc);assert.equal(result.navigationSafe,false);}
 assert.equal(bundledCoastalDepth(data,0,0),null);assert.equal(bundledCoastalDepth({...data,elevationsMeters:data.elevationsMeters.map(()=>null)},COASTAL_SITES[0].lat,COASTAL_SITES[0].lon),null);
 const f=fixture();const chapter=createCoastalDeparture(f.ctx,{store:()=>f.store,survey:()=>f.started,fetchDepth:async()=>{throw Error('offline')},fetchFallback:async(lat,lon)=>bundledCoastalDepth(data,lat,lon)});await chapter.refresh();await chapter.act('sites');assert.ok(chapter.snapshot().choices.every(c=>c.allowed&&c.depth.bundled));assert.equal(await chapter.act('plan'),true);
});


test('a malformed bundled chart is evicted so an explicit retry can fetch valid data',async()=>{
 const {readFile}=await import('node:fs/promises'),{fetchBundledCoastalDepth}=await import('../app/js/ocean/bundled-depth.js?retry-test');
 const data=JSON.parse(await readFile(new URL('../app/data/ocean-bathymetry-great-barrier-reef.json',import.meta.url),'utf8'));
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>({ok:true,json:async()=>++calls===1?{}:data});
 try{await assert.rejects(()=>fetchBundledCoastalDepth(COASTAL_SITES[0].lat,COASTAL_SITES[0].lon),/malformed/);assert.equal((await fetchBundledCoastalDepth(COASTAL_SITES[0].lat,COASTAL_SITES[0].lon)).bundled,true);assert.equal(calls,2);}finally{globalThis.fetch=original;}
});


test('fresh land and shallow samples never fall back to an older deep chart',async()=>{
 for(const depth of [{truthType:'unknown',elevationMeters:2,depthMeters:null},{truthType:'modeled',elevationMeters:-3,depthMeters:3}]){
  const f=fixture();let fallback=0;const api=createCoastalDeparture(f.ctx,{store:()=>f.store,survey:()=>f.started,fetchDepth:async()=>depth,fetchFallback:async()=>{fallback++;return {truthType:'modeled',depthMeters:30,sourceId:'old-chart'}}});await api.refresh();await api.act('sites');assert.equal(fallback,0);assert.equal(api.snapshot().choices.some(c=>c.allowed),false);assert.equal(await api.act('plan'),false);
 }
});
