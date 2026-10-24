import test from 'node:test';
import assert from 'node:assert/strict';
import {journalReturnDestination,returnToJournalRecord} from '../app/js/discovery/journal-return.js';
import {prepareSurfaceVoyage} from '../app/js/ocean/voyage.js';
const earth={environment:'EARTH',regionLabel:'Saved coast',locationSnapshot:{lat:34,lon:-120,name:'Saved coast'}};
const voyage=()=>prepareSurfaceVoyage({lat:34,lon:-120,name:'Offshore California'});

function published(ctx,sequence=1){
 const publication={sequence,requestId:`journal-${sequence}`};Object.assign(ctx,{initialEarthWorldReady:true,worldLoading:false,_worldLoadSequence:sequence,worldPublication:publication,isLoadedLocationSelectionCurrent:()=>true,worldLoadRuntimeState:{sequence,publication,status:'ready',geometryReady:true,gameplayRuntimesReady:true,session:{state:'published',requestId:publication.requestId}}});return {state:'published',...publication};
}

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
 const ctx={getEnv:()=>environment,returnToEarthFromMenu:async()=>{calls.push('retire-ocean/restore-actor');environment='EARTH';return true;},setCustomLocation:p=>calls.push(p.name),loadRoads:async()=>{calls.push('roads');return published(ctx);},spawnOnRoad:()=>assert.fail('Publication already owns the arrival')};
 assert.equal(await returnToJournalRecord(ctx,earth),true);assert.deepEqual(calls,['retire-ocean/restore-actor','Saved coast','roads']);
 environment='MOON';calls.length=0;ctx.returnToEarthFromMenu=async()=>false;assert.equal(await returnToJournalRecord(ctx,earth),false);assert.deepEqual(calls,[]);
 delete ctx.returnToEarthFromMenu;assert.equal(await returnToJournalRecord(ctx,earth),false);
 environment='EARTH';ctx.loadRoads=async()=>false;assert.equal(await returnToJournalRecord(ctx,earth),false);assert.deepEqual(calls,['Saved coast']);
});

test('preset returns validate ownership and avoid rebuilding the already selected Earth location',async()=>{
 const calls=[],ctx={LOCS:{coast:{}},selLoc:'coast',getEnv:()=> 'EARTH',selectPresetLocation:key=>calls.push(key),loadRoads:async()=>{calls.push('roads');return published(ctx);},spawnOnRoad:()=>assert.fail('Publication already owns the arrival')};
 published(ctx);const event={...earth,locationKey:'coast'};assert.equal(await returnToJournalRecord(ctx,event),true);assert.deepEqual(calls,[]);
 ctx.selLoc='city';assert.equal(await returnToJournalRecord(ctx,event),true);assert.deepEqual(calls,['coast','roads']);
});
test('Journal cannot call an aborted or obsolete publication a successful return',async()=>{
 const notices=[],ctx={getEnv:()=> 'EARTH',setCustomLocation(){},showToast:m=>notices.push(m),loadRoads:async()=>({state:'aborted'})};published(ctx);assert.equal(await returnToJournalRecord(ctx,earth),false);assert.deepEqual(notices,[]);
 ctx.loadRoads=async()=>{const old=published(ctx,2);published(ctx,3);return old;};assert.equal(await returnToJournalRecord(ctx,earth),false);assert.deepEqual(notices,[]);
 ctx.getLocationSelectionSignature=()=> 'before';ctx.loadRoads=async()=>{const result=published(ctx,4);ctx.getLocationSelectionSignature=()=> 'after';return result;};assert.equal(await returnToJournalRecord(ctx,earth),false);assert.deepEqual(notices,[]);
});
test('Journal preset selection alone does not prove that location is already playable',async()=>{
 const calls=[],ctx={LOCS:{coast:{}},selLoc:'coast',getEnv:()=> 'EARTH',selectPresetLocation:key=>calls.push(key),loadRoads:async()=>{calls.push('roads');return published(ctx);}};
 assert.equal(await returnToJournalRecord(ctx,{...earth,locationKey:'coast'}),true);assert.deepEqual(calls,['coast','roads']);
});
