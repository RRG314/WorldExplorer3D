import test from 'node:test';
import assert from 'node:assert/strict';
import {ctx} from '../app/js/shared-context.js?v=55';
// This failure-path test never renders furniture. Its import-time lighting
// vectors need only construction; no geometry behavior is mocked as evidence.
const previousThree=globalThis.THREE;
globalThis.THREE={Vector3:class {}};
const {finalizeLoadedWorld}=await import('../app/js/world/load-support.js');
if(previousThree===undefined)delete globalThis.THREE;else globalThis.THREE=previousThree;
import {SurfacePublicationError,isSurfacePublicationError,finishFailedSurfaceLoad} from '../app/js/world/surface-publication-error.js';
import {waitForFixedRegionalGround} from '../app/js/world/fixed-regional-context.js';

test('regional terrain failure cannot fall through to a larger map query',async()=>{
 const cause=new Error('Terrain source did not become ready'),phases=[];
 await assert.rejects(waitForFixedRegionalGround({fixedRegionalContextRadiusWorld:14000,
   waitForFarTerrainClipmap:async()=>{throw cause;}},{},()=>phases.push('start'),()=>phases.push('end')),
   error=>isSurfacePublicationError(error)&&error.cause===cause&&error.stage==='regional-terrain');
 assert.deepEqual(phases,['start','end']);
});

test('road compilation cannot begin against a failed near-terrain publication',async t=>{
 const saved={...ctx};t.after(()=>{for(const key of Object.keys(ctx))delete ctx[key];Object.assign(ctx,saved);});
 let compiled=false,spawned=false,terrainRequest;
 Object.assign(ctx,{terrainEnabled:true,onMoon:false,roads:[{}],publishLocationTerrain:request=>{terrainRequest=request;return true;},
   waitForLocationTerrainPublication:async()=>{throw Error('missing near tile');},
   publishCompiledTransportMeshes:async()=>{compiled=true;}});
 await assert.rejects(finalizeLoadedWorld({loadProfile:{regionalContextRadiusMeters:6000},spawnPlayer:()=>{spawned=true;}}),error=>isSurfacePublicationError(error)&&error.stage==='terrain');
 assert.deepEqual(terrainRequest,{regionalContextRadiusMeters:6000});
 assert.equal(compiled,false);assert.equal(spawned,false);
});

test('a failed road publication never marks a partial world playable',async t=>{
  const saved={...ctx};t.after(()=>{for(const key of Object.keys(ctx))delete ctx[key];Object.assign(ctx,saved);});
  let marked=false,spawned=false;
  Object.assign(ctx,{terrainEnabled:true,onMoon:false,roads:[{}],publishCompiledTransportMeshes:async()=>{throw new Error('missing support');}});
  await assert.rejects(finalizeLoadedWorld({markLoaded:()=>{marked=true;},spawnPlayer:()=>{spawned=true;}}),error=>isSurfacePublicationError(error)&&error.stage==='roads');
  assert.equal(marked,false);assert.equal(spawned,false);
});

test('roadless terrain failure cannot spawn a player on the loading placeholder',async t=>{
  const saved={...ctx};t.after(()=>{for(const key of Object.keys(ctx))delete ctx[key];Object.assign(ctx,saved);});
  let marked=false,spawned=false,waited=false;
  Object.assign(ctx,{terrainEnabled:true,onMoon:false,roads:[],publishLocationTerrain:()=>true,
    waitForLocationTerrainPublication:async()=>{waited=true;throw Error('missing Antarctic elevation');}});
  await assert.rejects(finalizeLoadedWorld({markLoaded:()=>{marked=true;},spawnPlayer:()=>{spawned=true;}}),error=>isSurfacePublicationError(error)&&error.stage==='terrain');
  assert.equal(waited,true);assert.equal(marked,false);assert.equal(spawned,false);
});

test('surface failure cancels work and retires staging without starting gameplay',()=>{
  const calls=[],runtimeState={sequence:9,status:'loading',activePhases:['roads']};
  const appCtx={worldLoadRuntimeState:runtimeState,worldLoading:true,initialEarthWorldReady:true,
    _cancelStreetPavementBuild:()=>calls.push('pavement-cancel'),streetOverview:{dispose:()=>calls.push('overview-dispose')},
    releaseEarthWorldForTitle:()=>calls.push('world-resources-release'),
    discardEarthWorldSceneLoad:sequence=>calls.push(`discard-${sequence}`),hideLoad:()=>calls.push('hide'),showToast:text=>calls.push(text)};
  const session={appCtx,runtimeState,worldSession:{fail:reason=>calls.push(reason),snapshot:()=>({status:'failed'})},
    abortProviderWork:()=>calls.push('providers-abort'),releaseWorldLoadCancellation:()=>calls.push('release'),finalizePerfLoad:success=>assert.equal(success,false)};
  const result=finishFailedSurfaceLoad(session,new SurfacePublicationError('pavement',new Error('invalid polygon')));
  assert.equal(result.status,'failed');assert.equal(runtimeState.geometryReady,false);
  assert.equal(appCtx.worldLoading,false);assert.equal(appCtx.initialEarthWorldReady,false);
  for(const action of ['providers-abort','pavement-cancel','overview-dispose','discard-9','world-resources-release','release'])assert.ok(calls.includes(action));
  assert.match(runtimeState.error,/invalid polygon/);
});

import {initWorldTraversal,invalidateTraversalNetworks,buildTraversalNetworks} from '../app/js/world/traversal.js?v=4';
import {compileTransportNetworkModel} from '../app/js/world/compiler/transport-network-model.js';
import {materializeTraversalSegments} from '../app/js/world/traversal-graph-storage.js';
async function reviewedCacheFixture(t,reviewed=true){
 const saved={...ctx};for(const key of Object.keys(ctx))delete ctx[key];t.after(()=>{for(const key of Object.keys(ctx))delete ctx[key];Object.assign(ctx,saved);});
 const features=[[-100,0,10,20,'at_grade'],[0,100,20,30,'elevated'],[100,200,30,40,'at_grade']].map(([x1,x2,n1,n2,mode],index)=>({
  sourceFeatureId:`osm:way:${index+1}`,type:'raceway',networkKind:'road',pts:[{x:x1,z:0},{x:x2,z:0}],width:12,metersPerWorldUnit:1.11,driveable:true,
  sourceTopologyNodes:[{id:String(n1),x:x1,z:0},{id:String(n2),x:x2,z:0}],sourceNodeIds:[String(n1),String(n2)],
  structureSemantics:{terrainMode:mode,verticalOrder:mode==='elevated'?1:0},
  transportRecord:{identity:`osm:way:${index+1}`,completeness:'lossless',routeState:'complete',safeForDriving:true,direction:'forward'}}));
 Object.assign(ctx,{terrainEnabled:false,roads:[],linearFeatures:[],worldLoading:true,_worldLoadSequence:1,
  worldLoadRuntimeState:{sequence:reviewed==='stale'?0:1,...(reviewed?{venuePack:{status:'source-prepared',venueSource:{id:'controlled-venue'}}}:{})},invalidateTraversalNetworks:reviewed==='missing'?undefined:invalidateTraversalNetworks});
 initWorldTraversal({runtimeRoadFeatures:()=>features,isVehicleRoad:()=>true,enableLinearFeatures:()=>false,
  featureTraversalKey:f=>`${f.structureSemantics.terrainMode}:${f.structureSemantics.verticalOrder||0}`});
 invalidateTraversalNetworks();const cached=buildTraversalNetworks().drive;
 assert.equal(cached.transportGraphId,null);
 for(const f of features)f.transportSurfaceModel={distances:new Float32Array([0,100]),centerHeights:[0,0],leftHeights:[0,0],rightHeights:[0,0],width:12};
 ctx.transportNetworkModel=compileTransportNetworkModel(features);
 await finalizeLoadedWorld({buildTraversalNetworks,finalizePresentation:false});
 return {cached,actual:buildTraversalNetworks().drive};
}

test('reviewed venue final publication retires the early graph and adopts the existing finalized bridge connections',async t=>{
 const {cached,actual}=await reviewedCacheFixture(t);assert.notEqual(actual,cached);assert.equal(actual.transportGraphId,ctx.transportNetworkModel.id);
 const rows=materializeTraversalSegments(actual.segments);assert.equal(rows.length,3);assert.equal(rows[0].toId,rows[1].fromId);assert.equal(rows[1].toId,rows[2].fromId);
});
test('ordinary publication retains its existing traversal lifecycle when no reviewed extent is being adopted',async t=>{
 const {cached,actual}=await reviewedCacheFixture(t,false);assert.equal(actual,cached);
});


test('a stale reviewed source cannot invalidate the current world traversal cache',async t=>{
 const {cached,actual}=await reviewedCacheFixture(t,'stale');assert.equal(actual,cached);
});
test('a reviewed publication cannot proceed without its existing traversal invalidation owner',async t=>{
 await assert.rejects(reviewedCacheFixture(t,'missing'),error=>isSurfacePublicationError(error)&&error.stage==='reviewed-venue-traversal');
});
