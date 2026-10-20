import test from 'node:test';
import {ctx as sharedCtx} from '../app/js/shared-context.js?v=55';
import {setCustomLocation,getLocationSelectionSignature,markLocationSelectionLoaded,isLoadedLocationSelectionCurrent} from '../app/js/location-session.js';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {isEarthWorldUsable} from '../app/js/earth-core/world-readiness.js';
import {returnToJournalRecord} from '../app/js/discovery/journal-return.js';
import {commitEnvironment} from '../app/js/session-coordinator.js?v=2';
const source=(await readFile(new URL('../app/js/multiplayer/ui-room-runtime.js',import.meta.url),'utf8')).replace(/import[\s\S]*?from\s+["'][^"']+["'];\n/g,'').replaceAll('export function ','function ');
function publish(ctx,sequence=1){const publication={sequence,requestId:`arrival-${sequence}`};Object.assign(ctx,{initialEarthWorldReady:true,worldLoading:false,_worldLoadSequence:sequence,worldPublication:publication,worldLoadRuntimeState:{sequence,publication,status:'ready',geometryReady:true,gameplayRuntimesReady:true,session:{state:'published',requestId:publication.requestId}}});return {state:'published',...publication};}
function roomHarness(){
 const calls=[],room={id:'AAAAAA',code:'AAAAAA',name:'Saved coast',world:{kind:'earth',lat:34,lon:-120}},state={currentRoom:room,roomSessionGeneration:1};let environment='EARTH';
 const appCtx={gameStarted:true,worldLoading:false,getEnv:()=>environment,setCustomLocation:value=>calls.push(['select',value.lat,value.lon]),spawnOnRoad:()=>assert.fail('duplicate arrival'),loadRoads:async()=>{calls.push(['load']);appCtx.actor={mode:'boat',x:500,y:0,z:0};return publish(appCtx);}};
 const renderers=new Proxy({setStatus:(message,error)=>{if(error)calls.push(['error']);}},{get:(o,k)=>o[k]||(()=>{})});
 const helpers={finiteNumber:(v,f=0)=>Number.isFinite(Number(v))?Number(v):f,normalizePaintRules:v=>v,normalizePaintColorHex:v=>v,sanitizeText:v=>v};
 const context=vm.createContext({console:{warn(){}},Promise,URL,setTimeout,clearTimeout,document:{getElementById:()=>null},window:{},isEarthWorldUsable,deriveRoomDeterministicSeed:()=>1});vm.runInContext(source,context);
 const runtime=context.createUiRoomRuntime({appCtx,refs:{},state,renderers,helpers});return {appCtx,room,state,calls,runtime,setEnvironment:value=>environment=value};
}
test('room world publication retains its authoritative vessel arrival instead of spawning on a road',async()=>{
 const h=roomHarness();await h.runtime.syncRoomWorldContext(h.room,true,true);assert.deepEqual(h.calls,[['select',34,-120],['load']]);assert.deepEqual(h.appCtx.actor,{mode:'boat',x:500,y:0,z:0});
});
test('room Earth return is awaited before selecting the destination and never bypasses its owner',async()=>{
 for(const environment of ['MOON','MARS','OCEAN','SPACE_FLIGHT']){
  const h=roomHarness();h.setEnvironment(environment);h.appCtx.returnToEarthFromMenu=async()=>{h.calls.push(['return',environment]);h.appCtx.customLoc={name:'previous selection restored'};h.setEnvironment('EARTH');return true;};await h.runtime.syncRoomWorldContext(h.room,true,true);assert.deepEqual(h.calls,[['return',environment],['select',34,-120],['load']]);
 }
});
test('refused or superseded room return cannot select or load a destination',async()=>{
 const h=roomHarness();h.setEnvironment('OCEAN');h.appCtx.returnToEarthFromMenu=async()=>{h.state.currentRoom=null;h.state.roomSessionGeneration++;return false;};await h.runtime.syncRoomWorldContext(h.room,true,true);assert.deepEqual(h.calls,[]);
});
test('room load rejects a failed or replaced publication without claiming success',async()=>{
 const h=roomHarness();h.appCtx.loadRoads=async()=>({state:'failed'});await h.runtime.syncRoomWorldContext(h.room,true,true);assert.equal(h.state.activeRoomWorldSignature,'');assert.ok(h.calls.some(c=>c[0]==='error'));
 const newer=roomHarness();newer.appCtx.loadRoads=async()=>{const old=publish(newer.appCtx,1);publish(newer.appCtx,2);return old;};await newer.runtime.syncRoomWorldContext(newer.room,true,true);assert.equal(newer.state.activeRoomWorldSignature,'');assert.ok(newer.calls.some(c=>c[0]==='error'));
});
test('Journal accepts the published vessel arrival without requiring a road-spawn API',async()=>{
 const ctx={getEnv:()=> 'EARTH',setCustomLocation(){},isLoadedLocationSelectionCurrent:()=>true,loadRoads:async()=>{ctx.actor={mode:'boat',x:500,y:0,z:0};return publish(ctx);}};
 assert.equal(await returnToJournalRecord(ctx,{environment:'EARTH',locationSnapshot:{lat:34,lon:-120}}),true);assert.deepEqual(ctx.actor,{mode:'boat',x:500,y:0,z:0});
});
test('an environment departure and return supersedes an awaiting Journal load even if the same world remains published',async()=>{
 commitEnvironment('EARTH');let release;const ctx={getEnv:()=> 'EARTH',setCustomLocation(){},isLoadedLocationSelectionCurrent:()=>true,loadRoads:()=>new Promise(r=>release=r)};
 const pending=returnToJournalRecord(ctx,{environment:'EARTH',locationSnapshot:{lat:34,lon:-120}});commitEnvironment('OCEAN');commitEnvironment('EARTH');release(publish(ctx));assert.equal(await pending,false);
});
test('Journal acknowledges a new ready publication through the actual location-selection owner',async t=>{
 const saved=Object.getOwnPropertyDescriptors(sharedCtx);t.after(()=>{for(const k of Object.keys(sharedCtx))if(Object.getOwnPropertyDescriptor(sharedCtx,k).configurable)delete sharedCtx[k];for(const [k,d]of Object.entries(saved))if(d.configurable)Object.defineProperty(sharedCtx,k,d);});
 Object.assign(sharedCtx,{getEnv:()=> 'EARTH',setCustomLocation,getLocationSelectionSignature,markLocationSelectionLoaded,isLoadedLocationSelectionCurrent,loadRoads:async()=>publish(sharedCtx),showToast(){}});
 setCustomLocation({lat:1,lon:2});markLocationSelectionLoaded();setCustomLocation({lat:3,lon:4});assert.equal(isLoadedLocationSelectionCurrent(),false);
 assert.equal(await returnToJournalRecord(sharedCtx,{environment:'EARTH',locationSnapshot:{lat:34,lon:-120}}),true);assert.equal(isLoadedLocationSelectionCurrent(),true);assert.equal(sharedCtx.customLoc.lat,34);
});
test('room selection changes during loading cannot acknowledge the wrong publication',async()=>{
 const h=roomHarness();let signature='requested',stamps=0;h.appCtx.getLocationSelectionSignature=()=>signature;h.appCtx.markLocationSelectionLoaded=()=>stamps++;h.appCtx.loadRoads=async()=>{signature='newer-intent';return publish(h.appCtx);};await h.runtime.syncRoomWorldContext(h.room,true,true);assert.equal(stamps,0);assert.equal(h.state.activeRoomWorldSignature,'');
});
