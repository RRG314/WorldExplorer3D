import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldLoadRuntimeSession} from '../app/js/world/load-runtime-session.js';
import {getAdaptiveLoadProfile,getWorldLodThresholds} from '../app/js/world/budgets.js';
import {constrainBuildingWaysToPublicationDomain} from '../app/js/world/load-building-detail.js';

function loadWithQuality(context, quality) {
  return createWorldLoadRuntimeSession({
    appCtx:context, resetWorldForReload(){},
    getAdaptiveLoadProfile, getWorldLodThresholds,
    getRuntimeDynamicBudget:()=>quality,
    earthSceneSuppressed:()=>false,
    sameLocation:(a,b)=>a?.lat===b?.lat&&a?.lon===b?.lon
  });
}
function context() {
  return {car:{},hashGeoToInt:()=>42,
    resolveLocationSelection:()=>({key:'custom',lat:39.2904,lon:-76.6122,name:'Baltimore'})};
}

test('a slower desktop reload retains district edge buildings and the same near/far boundary',()=>{
  const ctx=context(),nodes={},ways=[];
  for (const [i,x] of [0,2300,2600,2800].entries()) {
    const ids=[0,1,2,3].map(j=>`${i}:${j}`);
    [[-5,-5],[5,-5],[5,5],[-5,5]].forEach(([dx,dz],j)=>nodes[ids[j]]={lat:x+dx,lon:dz});
    ways.push({id:i,nodes:ids,tags:{building:'yes'}});
  }
  let original;
  for (const lodScale of [1,.9,.72,1]) {
    const load=loadWithQuality(ctx,{deviceClass:'desktop',budgetScale:lodScale,lodScale});
    const selected=constrainBuildingWaysToPublicationDomain(ways,nodes,{
      geoToWorld:(x,z)=>({x,z}),visibleRadiusWorld:load.lodThresholds.farVisible
    }).ways.map(way=>way.id);
    assert.deepEqual(selected,[0,1,2],'quality adaptation must not delete the outer district');
    assert.equal(load.runtimeState.buildingVisibleRadiusWorld,2700);
    assert.equal(ctx.dynamicLodScale,lodScale,'presentation still receives the adaptive quality setting');
    if(original) assert.deepEqual(load.loadProfile,original);
    original=load.loadProfile;
    load.abortProviderWork('test-complete');load.releaseWorldLoadCancellation();
  }
});

test('the fixed mobile district and road safety cap remain unchanged',()=>{
  const load=loadWithQuality(context(),{deviceClass:'mobile',budgetScale:.28,lodScale:.68});
  assert.equal(load.runtimeState.buildingVisibleRadiusWorld,2040);
  assert.equal(load.loadProfile.maxRoadWays,5600);
  assert.equal(load.loadProfile.maxTotalLoadMs,32000);
  load.abortProviderWork('test-complete');load.releaseWorldLoadCancellation();
});
