import test from 'node:test';
import assert from 'node:assert/strict';
import {createPortalGameEntry} from '../app/js/portal/game-entry.js';
import {portalLocationsMatch} from '../app/js/earth-core/portal-destination-policy.js';
import {portalGameLink,resolvePortalGameIntent} from '../app/js/portal/game-intent.js';
import {createWorldLoadRequest} from '../app/js/earth-core/world-load-request.js';
import {createWorldSnapshot} from '../app/js/earth-core/world-snapshot.js';
import {createMemoryDiscoveryProfileStore} from '../app/js/discovery/profile-store.js';
import {portalTrailView,normalizePortalAction} from '../app/js/portal/trail-model.js';
import {getLifecycleRegistrySnapshot} from '../app/js/runtime/lifecycle-scope.js?v=2';
import {portalFixture} from './fixtures/portal-qualification.mjs';

function fixture(){
  const f=portalFixture(),d=f.place.destination,request=createWorldLoadRequest({...d.origin,key:'baltimore'},1);
  const publication=createWorldSnapshot({request,layers:Object.fromEntries(['terrain','transport','buildings','places'].map(key=>[key,{authority:'controlled-source',completeness:'partial',records:[{id:key}]}]))});
  const abort=new AbortController(),calls=[],store=createMemoryDiscoveryProfileStore();let render=null,owner='a',at=f.now;
  const ctx={getEnv:()=> 'EARTH',resolveLocationSelection:()=>d.origin,getLocationSelectionSignature:()=> 'baltimore',gameMode:'free',
    gameStarted:true,_worldLoadSequence:1,initialEarthWorldReady:true,worldPublication:publication,
    worldLoadRuntimeState:{status:'ready',geometryReady:true,gameplayRuntimesReady:true,sequence:1,publication,session:{state:'published',requestId:request.id}},
    getAccountUserId:()=>owner,WORLD_UNITS_PER_METER:1,Walk:{state:{mode:'walk',walker:{x:0,y:2,z:0}}},
    geoToWorld:()=>({x:0,z:0}),restoreSurfaceTravelPose:(mode,point,options)=>{calls.push({mode,point,options});return true;},
    registerRuntimeSystem:system=>{assert.equal(render,null);render=system;return()=>{render=null;};}};
  const ownerEntry=createPortalGameEntry(ctx,{search:new URL(portalGameLink(f.place),'https://example.test').search,catalog:f.catalog,
    now:()=>at,deviceProfile:'desktop',captureSession:()=>({signal:abort.signal,isCurrent:()=>!abort.signal.aborted}),
    recordVisit:(...args)=>store.recordPortalGameVisit(...args),onNotice:message=>calls.push(message)});
  return {...f,ctx,store,calls,abort,entry:ownerEntry,result:{state:'published',requestId:request.id,sequence:1},
    get render(){return render;},setOwner:uid=>owner=uid,setTime:value=>at=value,
    frame:flags=>render?.update({flags}),settle:()=>new Promise(resolve=>setImmediate(resolve))};
}
test('opaque Portal links resolve current scoped catalog approval and reject mixed commands, stale IDs and unqualified devices',()=>{
  const f=portalFixture(),context={now:f.now,deviceProfile:'desktop'},search=new URL(portalGameLink(f.place),'https://example.test').search;
  assert.equal(resolvePortalGameIntent(search,f.catalog,context).decision.eligible,true);
  for(const extra of ['&portal=monaco-coast','&pr=2','&lat=1','&mode=plane','&seed=1','&room=secret','&launch=space'])assert.equal(resolvePortalGameIntent(search+extra,f.catalog,context).decision.eligible,false);
  assert.equal(resolvePortalGameIntent(search,f.catalog,{...context,deviceProfile:'mobile-touch'}).decision.eligible,false);
  assert.equal(resolvePortalGameIntent(search,{...f.catalog,qualifications:[]},context).decision.eligible,false);
  assert.equal(resolvePortalGameIntent('?loc=baltimore',f.catalog,context),null);
});
test('selection and published origins retain exact geographic identity through existing longitude normalization',()=>{
  const raw={lat:39.2904,lon:-76.6122},canonical={lat:raw.lat,lon:((raw.lon+180)%360+360)%360-180};
  assert.notEqual(raw.lon,canonical.lon);assert.equal(portalLocationsMatch(raw,canonical),true);
  assert.equal(portalLocationsMatch({lat:0,lon:180},{lat:0,lon:-180}),true);
  assert.equal(portalLocationsMatch(raw,{...raw,lon:raw.lon+.0000001}),false);
  const f=fixture();f.ctx.resolveLocationSelection=()=>canonical;
  f.ctx.worldPublication=Object.freeze({...f.ctx.worldPublication,location:canonical});f.ctx.worldLoadRuntimeState.publication=f.ctx.worldPublication;
  assert.equal(f.entry.arm(f.entry.begin('earth'),f.result),true);f.entry.dispose();
});
test('an admitted arrival waits for a real matching visible rendered frame then persists one independent virtual visit',async()=>{
  const baseline=getLifecycleRegistrySnapshot().resourceCount,f=fixture(),ticket=f.entry.begin('earth');
  assert.equal(f.entry.arm(ticket,f.result),true);assert.equal(f.entry.arm(ticket,f.result),false);
  assert.deepEqual(f.calls[0],{mode:'walk',point:{x:0,z:0},options:{source:'portal_arrival',emitTutorial:false}});
  f.frame({});assert.equal((await f.store.listPortalTrail('account:a')).items.length,0);
  f.ctx.titleLaunchPending=true;f.frame({mainWorldPresented:f.ctx.worldPublication});assert.ok(f.render);
  f.ctx.titleLaunchPending=false;f.frame({mainWorldPresented:f.ctx.worldPublication});await f.settle();
  const row=await f.store.getPortalDestination('account:a',f.place.id),view=portalTrailView(row);
  assert.equal(view.visitedAt,f.now);assert.equal(view.saved,false);assert.equal(view.investigatedAt,0);assert.deepEqual(view.expeditionIds,[]);
  assert.equal(row.pending.visited.worldRequestId,f.result.requestId);assert.equal(f.render,null);
  assert.throws(()=>normalizePortalAction(row.pending.visited));
  const data=await f.store.exportData();assert.equal(data.events.length,0);assert.equal(data.items.length,0);
  f.entry.dispose();assert.equal(getLifecycleRegistrySnapshot().resourceCount,baseline);
});
test('selection, account, actor, publication and session replacement revoke an unpresented visit',async()=>{
  for(const change of [f=>f.setOwner('b'),f=>f.ctx.resolveLocationSelection=()=>({lat:0,lon:0}),f=>f.ctx.Walk.state.walker={x:0,y:2,z:0},
    f=>f.ctx.worldPublication={},f=>f.abort.abort(),f=>f.ctx.activeInterior={},f=>f.ctx.Walk.state.walker.swimming=true]){
    const f=fixture();assert.equal(f.entry.arm(f.entry.begin('earth'),f.result),true);change(f);
    f.frame({mainWorldPresented:f.ctx.worldPublication});await f.settle();assert.equal((await f.store.listPortalTrail('account:a')).items.length,0);assert.equal(f.render,null);f.entry.dispose();
  }
});
test('failed or obsolete loads, expired approval and maritime/aircraft/interior actors cannot be forced to a Portal pose',()=>{
  for(const change of [f=>f.ctx.boatMode={active:true},f=>f.ctx.planeMode={active:true},f=>f.ctx.activeInterior={},f=>f.ctx.Walk.state.walker.swimming=true,
    f=>f.ctx.restoreSurfaceTravelPose=()=>false,f=>f.ctx.Walk.state.walker.x=200,f=>f.ctx.worldPublication={},f=>f.result.state='failed',f=>f.setTime(f.now+20000)]){
    const f=fixture(),ticket=f.entry.begin('earth');change(f);assert.equal(f.entry.arm(ticket,f.result),false);assert.equal(f.render,null);f.entry.dispose();
  }
});
test('a persisted visit stays with its initiating owner and survives Journal backup without converting guest interest to visits',async()=>{
  const f=fixture();f.setOwner(null);assert.equal(f.entry.arm(f.entry.begin('earth'),f.result),true);
  f.frame({mainWorldPresented:f.ctx.worldPublication});f.setOwner('b');await f.settle();
  assert.equal(portalTrailView(await f.store.getPortalDestination('device-guest',f.place.id)).visitedAt,f.now);
  assert.equal(portalTrailView(await f.store.getPortalDestination('account:b',f.place.id)).visitedAt,0);
  const reopened=createMemoryDiscoveryProfileStore(await f.store.exportData());
  assert.equal(portalTrailView(await reopened.getPortalDestination('device-guest',f.place.id)).visitedAt,f.now);f.entry.dispose();
});
