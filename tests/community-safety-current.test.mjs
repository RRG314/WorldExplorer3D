import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createUiRoomRenderers} from '../app/js/multiplayer/ui-room-renderers.js';
import {oceanStreamingPreference,writeOceanStreamingPreference,OCEAN_STREAM_PREFERENCE_KEY} from '../app/js/ocean/voyage-store.js';
import {readRegionalSceneryPreference,writeRegionalSceneryPreference} from '../app/js/terrain/regional-scenery-scheduler.js';

test('new journeys default to selected areas; only an explicit on preference enables either extension', () => {
  for (const read of [oceanStreamingPreference,readRegionalSceneryPreference]) {
    for (const value of [null,'off','true','unexpected']) assert.equal(read({getItem:()=>value}),false);
    assert.equal(read({getItem:()=>'on'}),true);
    assert.equal(read({getItem:()=>{throw Error('storage denied');}}),false);
  }
  let key; oceanStreamingPreference({getItem:k=>{key=k;return null;}});
  assert.equal(key,OCEAN_STREAM_PREFERENCE_KEY);
});

const source = await readFile(new URL('../js/community-consent.js',import.meta.url),'utf8');
const settingsSource = await readFile(new URL('../app/js/ui/settings.js',import.meta.url),'utf8');
test('the menu saves ocean opt-in before its lazy runtime exists; denied storage restores the previous setting',()=>{
  const values=new Map(),events=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  const elements=Object.fromEntries(['oceanContinuousToggle','regionalSceneryToggle','worldExplorationStatus'].map(id=>[id,{checked:false,textContent:'',addEventListener:(event,fn)=>events.set(id+':'+event,fn)}]));
  const context=vm.createContext({HTMLElement:class{},HTMLButtonElement:class{},document:{getElementById:id=>elements[id]||null},
    oceanStreamingPreference:()=>oceanStreamingPreference(storage),writeOceanStreamingPreference:enabled=>writeOceanStreamingPreference(enabled,storage),
    readRegionalSceneryPreference:()=>readRegionalSceneryPreference(storage),writeRegionalSceneryPreference:enabled=>writeRegionalSceneryPreference(enabled,storage),
    prepareProviderCredentials(){},setProviderCredential(){}});
  vm.runInContext(settingsSource.replace(/^import .*;\n/gm,'').replaceAll('export ',''),context);
  context.setupSettingsUi({apiConfig:{}});
  assert.equal(elements.oceanContinuousToggle.checked,false);
  elements.oceanContinuousToggle.checked=true;events.get('oceanContinuousToggle:change')();
  assert.equal(oceanStreamingPreference(storage),true);assert.match(elements.worldExplorationStatus.textContent,/new ocean voyages/);
  context.setupSettingsUi({apiConfig:{}});assert.equal(elements.oceanContinuousToggle.checked,true);
  storage.setItem=()=>{throw Error('denied');};
  elements.oceanContinuousToggle.checked=false;events.get('oceanContinuousToggle:change')();
  assert.equal(elements.oceanContinuousToggle.checked,true);assert.equal(oceanStreamingPreference(storage),true);
  assert.match(elements.worldExplorationStatus.textContent,/previous mode is kept/);
  elements.regionalSceneryToggle.checked=true;events.get('regionalSceneryToggle:change')();
  assert.equal(elements.regionalSceneryToggle.checked,false);
});

function consentHarness({accepted=false,readPending=null}={}) {
  let user={uid:'one'},authListener,dialog;
  const writes=[],controls=new Map(),events=new Map();
  const control=id=>{
    if(!controls.has(id))controls.set(id,{id,checked:false,disabled:false,style:{},addEventListener:(name,fn)=>events.set(id+':'+name,fn)});
    return controls.get(id);
  };
  const context=vm.createContext({console,Promise,Error,
    document:{activeElement:null,body:{append:d=>{dialog=d;}},createElement:()=>({setAttribute(){},style:{},querySelector:control,
      addEventListener:(name,fn)=>events.set('dialog:'+name,fn),showModal(){},close(){},remove(){dialog=null;}})},
    getCurrentUser:()=>user,observeAuth:fn=>{authListener=fn;return()=>{authListener=null;}},
    initFirebase:()=>({db:{}}),doc:(_,...parts)=>parts.join('/'),serverTimestamp:()=>123,
    getDocFromServer:async()=>{if(readPending)await readPending;return{exists:()=>accepted,data:()=>({version:'community-2026-10-24'})};},
    setDoc:async(...args)=>{writes.push(args);}
  });
  vm.runInContext(source.replace(/^import .*;\n/gm,'').replaceAll('export ',''),context);
  return {context,writes,controls,events,get dialog(){return dialog;},run:()=>context.ensureCommunityTerms(),
    switchUser:next=>{user=next;authListener?.(next);},tick:()=>new Promise(resolve=>setImmediate(resolve))};
}

test('sharing waits for explicit unchecked consent, records it for the initiating account, and deduplicates concurrent requests',async()=>{
  const h=consentHarness(),one=h.run(),two=h.run();await h.tick();
  assert.ok(h.dialog);assert.equal(h.writes.length,0);
  h.events.get('#communityTermsContinue:click')();await h.tick();assert.equal(h.writes.length,0);
  h.controls.get('#communityTermsAgree').checked=true;h.events.get('#communityTermsAgree:change')();
  assert.equal(h.controls.get('#communityTermsContinue').disabled,false);
  h.events.get('#communityTermsContinue:click')();assert.equal(await one,true);assert.equal(await two,true);
  assert.equal(h.writes.length,1);assert.equal(h.writes[0][0],'users/one/consents/community');
  assert.equal(h.writes[0][1].version,'community-2026-10-24');assert.equal(h.dialog,null);
});

test('decline and Escape leave sharing unaccepted; a later attempt can prompt again',async()=>{
  const h=consentHarness();
  for(const method of ['#communityTermsCancel:click','dialog:cancel']){
    const pending=h.run();const rejected=assert.rejects(pending,/Sharing cancelled/);await h.tick();
    h.events.get(method)({preventDefault(){}});await rejected;assert.equal(h.writes.length,0);assert.equal(h.dialog,null);
  }
});

test('account changes cancel both a pending acceptance dialog and a delayed acceptance read',async()=>{
  const h=consentHarness(),pending=h.run(),rejected=assert.rejects(pending,/Account changed/);await h.tick();
  h.switchUser({uid:'two'});await rejected;assert.equal(h.writes.length,0);assert.equal(h.dialog,null);
  let release;const waiting=new Promise(resolve=>{release=resolve;});const late=consentHarness({accepted:true,readPending:waiting});
  const lateResult=assert.rejects(late.run(),/Account changed/);late.switchUser(null);release();await lateResult;
  assert.equal(late.writes.length,0);assert.equal(late.dialog,undefined);
});

test('an already accepted version does not prompt or write again',async()=>{
  const h=consentHarness({accepted:true});assert.equal(await h.run(),true);assert.equal(h.dialog,undefined);assert.equal(h.writes.length,0);
});

test('blocking removes existing and future chat and invites; unblocking restores visible content without rewriting shared world data',()=>{
  const refs=Object.fromEntries(['chatMessages','titleInvitesList','titleFriendsList','titleRecentPlayersList','blockedPlayersList'].map(name=>[name,{innerHTML:''}]));
  const state={authUser:{uid:'self'},currentRoom:{id:'ROOM01'},blockedPlayersReady:true,blockedPlayers:[],
    messages:[{uid:'other',id:'one',displayName:'Other',text:'Visible message'}],
    invites:[{fromUid:'other',id:'invite',roomCode:'ROOM01',message:'Come explore'}],friends:[],recentPlayers:[]};
  const html=v=>String(v||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
  const ui=createUiRoomRenderers({appCtx:{},refs,state,helpers:{safeHtml:html,escapeHtml:html,normalizeCode:v=>v}});
  ui.renderChat();ui.renderInvites();assert.match(refs.chatMessages.innerHTML,/Visible message/);assert.match(refs.titleInvitesList.innerHTML,/Come explore/);
  state.blockedPlayers=[{uid:'other',displayName:'Other'}];ui.renderChat();ui.renderInvites();ui.renderBlockedPlayers();
  assert.doesNotMatch(refs.chatMessages.innerHTML,/Visible message/);assert.doesNotMatch(refs.titleInvitesList.innerHTML,/Come explore/);assert.match(refs.blockedPlayersList.innerHTML,/Unblock/);
  state.messages.push({uid:'other',id:'two',text:'Future message'});ui.renderChat();assert.doesNotMatch(refs.chatMessages.innerHTML,/Future message/);
  state.blockedPlayers=[];ui.renderChat();assert.match(refs.chatMessages.innerHTML,/Future message/);
  state.blockedPlayersReady=false;ui.renderChat();assert.doesNotMatch(refs.chatMessages.innerHTML,/Future message/);assert.match(refs.chatMessages.innerHTML,/Checking blocked/);
  assert.equal(state.currentRoom.id,'ROOM01');assert.equal(state.messages.length,2);
});

const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {requireCommunityConsent}=require('../functions/community-consent.js');
test('the backend denies absent and stale consent while allowing the current version',async()=>{
  for(const version of [null,'old','community-2026-10-24']){
    const ref={collection(){return this;},doc(){return this;},get:async()=>({exists:!!version,data:()=>({version})})};
    const result=requireCommunityConsent(ref,'one');
    if(version==='community-2026-10-24')await result;
    else await assert.rejects(result,error=>error.status===403);
  }
});

test('switching accounts clears private social rows before new block or social snapshots can render',async()=>{
  const state={authUser:{uid:'one'},blockedPlayers:[],blockedPlayersReady:false,friends:[],recentPlayers:[],invites:[],ownedRooms:[]};
  const batches=[],rendered=[];
  let callbacks={};
  const subscribe=key=>callback=>{callbacks[key]=callback;return()=>{};};
  const noop=()=>{},exports={
    leavesRoomForEarthLocation:noop,ensureEntitlements:noop,isEarthWorldUsable:noop,createGhostManager:noop,
    listenExplorerLeaderboard:()=>noop,stopPresence:noop,deriveRoomDeterministicSeed:noop,findFeaturedPublicRooms:noop,leaveRoom:noop,
    listenMyRooms:subscribe('rooms'),listenPaintClaims:noop,upsertPaintClaim:noop,
    listenBlockedPlayers:subscribe('blocked'),listenFriends:subscribe('friends'),listenIncomingInvites:subscribe('invites'),listenRecentPlayers:subscribe('recent')};
  const context=vm.createContext({console});
  const module=new vm.SourceTextModule(await readFile(new URL('../app/js/multiplayer/ui-room-runtime.js',import.meta.url),'utf8'),{context});
  await module.link(()=>new vm.SyntheticModule(Object.keys(exports),function(){for(const [name,value]of Object.entries(exports))this.setExport(name,value);},{context}));await module.evaluate();
  const renderers=new Proxy({},{get:(_target,name)=>name==='renderFriends'?()=>rendered.push(state.friends.map(row=>row.uid)):noop});
  const runtime=module.namespace.createUiRoomRuntime({appCtx:{},refs:{},state,renderers,helpers:{}});
  runtime.ensureGlobalSubscriptions();batches.push(callbacks);callbacks={};
  batches[0].blocked([]);for(const key of ['friends','recent','invites','rooms'])batches[0][key]([{uid:'old-private-row'}]);
  state.authUser={uid:'two'};runtime.ensureGlobalSubscriptions();batches.push(callbacks);
  for(const key of ['friends','recentPlayers','invites','ownedRooms'])assert.equal(state[key].length,0,key+' must retire with its account');
  batches[1].blocked([]);assert.equal(rendered.at(-1).length,0,'New block readiness must not reveal the previous account social rows');
  for(const key of ['friends','recent','invites','rooms'])batches[0][key]([{uid:'late-old-row'}]);
  for(const key of ['friends','recentPlayers','invites','ownedRooms'])assert.equal(state[key].length,0,'Late old-account snapshots stay rejected');
  batches[1].friends([{uid:'new-account-friend'}]);assert.equal(state.friends[0].uid,'new-account-friend');
});
