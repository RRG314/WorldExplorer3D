import test from 'node:test';
import assert from 'node:assert/strict';
import {journalReturnDestination,returnToJournalRecord} from '../app/js/discovery/journal-return.js';
import {prepareSurfaceVoyage} from '../app/js/ocean/voyage.js';
const earth={environment:'EARTH',regionLabel:'Saved coast',locationSnapshot:{lat:34,lon:-120,name:'Saved coast'}};
const voyage=()=>prepareSurfaceVoyage({lat:34,lon:-120,name:'Offshore California'});

test('Journal routes by environment and validated traversal, never by coordinates alone',()=>{
 assert.equal(journalReturnDestination(earth).kind,'earth-coordinate');
 assert.equal(journalReturnDestination({...earth,locationKey:'coast'},{coast:{}}).kind,'earth-preset');
 for(const environment of ['MOON','MARS','OCEAN','INTERSTELLAR'])assert.equal(journalReturnDestination({...earth,environment}),null);
 for(const locationSnapshot of [{lat:91,lon:0},{lat:0,lon:181},{lat:NaN,lon:0},null])assert.equal(journalReturnDestination({...earth,locationSnapshot}),null);
 assert.equal(journalReturnDestination({...earth,environment:'OCEAN',metadata:{voyage: {...voyage(),version:88}}}),null);
 const accepted=journalReturnDestination({...earth,environment:'OCEAN',metadata:{voyage:voyage()}});assert.equal(accepted.kind,'ocean-voyage');assert.match(accepted.label,/voyage/);
});

test('marine Journal return uses the same vessel and submarine authority without Earth fallback',async()=>{
 const saved=voyage(),event={environment:'OCEAN',metadata:{voyage:saved}},calls=[];
 const ctx={oceanVoyage:{resume:async v=>{calls.push(v);return true;}},loadRoads:()=>assert.fail('Ocean must not load Earth roads'),switchEnv:()=>assert.fail('Cannot bypass environment authority')};
 assert.equal(await returnToJournalRecord(ctx,event),true);assert.equal(calls[0].subId,saved.subId);assert.equal(calls[0].ship.transportEntityId,saved.ship.transportEntityId);
 ctx.sharedMarine={active:true};assert.equal(await returnToJournalRecord(ctx,event),false);assert.equal(calls.length,1);
 ctx.sharedMarine.active=false;ctx.oceanVoyage.resume=async()=>false;assert.equal(await returnToJournalRecord(ctx,event),false);
 ctx.oceanVoyage.resume=async()=>{throw Error('offline')};assert.equal(await returnToJournalRecord(ctx,event),false);
 assert.equal(await returnToJournalRecord(ctx,{...earth,environment:'MOON'}),false);
});

test('Earth return restores previous environment before selecting the Journal destination',async()=>{
 let environment='OCEAN';const calls=[];
 const ctx={getEnv:()=>environment,returnToEarthFromMenu:async()=>{calls.push('retire-ocean/restore-actor');environment='EARTH';return true;},setCustomLocation:p=>calls.push(p.name),loadRoads:async()=>calls.push('roads'),spawnOnRoad:()=>calls.push('spawn')};
 assert.equal(await returnToJournalRecord(ctx,earth),true);assert.deepEqual(calls,['retire-ocean/restore-actor','Saved coast','roads','spawn']);
 environment='MOON';calls.length=0;ctx.returnToEarthFromMenu=async()=>false;assert.equal(await returnToJournalRecord(ctx,earth),false);assert.deepEqual(calls,[]);
 delete ctx.returnToEarthFromMenu;assert.equal(await returnToJournalRecord(ctx,earth),false);
 environment='EARTH';ctx.loadRoads=async()=>false;assert.equal(await returnToJournalRecord(ctx,earth),false);assert.deepEqual(calls,['Saved coast']);
});

test('preset returns validate ownership and avoid rebuilding the already selected Earth location',async()=>{
 const calls=[],ctx={LOCS:{coast:{}},selLoc:'coast',getEnv:()=> 'EARTH',selectPresetLocation:key=>calls.push(key),loadRoads:async()=>calls.push('roads'),spawnOnRoad:()=>calls.push('spawn')};
 const event={...earth,locationKey:'coast'};assert.equal(await returnToJournalRecord(ctx,event),true);assert.deepEqual(calls,[]);
 ctx.selLoc='city';assert.equal(await returnToJournalRecord(ctx,event),true);assert.deepEqual(calls,['coast','roads','spawn']);
});
