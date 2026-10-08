import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveBuildingPublicationSelection} from '../app/js/world/load-building-detail.js';
import {limitWaysByTileBudget,getAdaptiveLoadProfile} from '../app/js/world/budgets.js';

test('all available buildings survive selection when they fit, even in one dense source tile',()=>{
  for(const count of [10,1201,9000,10000]){
    const ways=Array.from({length:count},(_,id)=>({id,nodes:[1,2,3],tags:{building:'yes'}}));
    const nodes={1:{lat:1,lon:1},2:{lat:1.00001,lon:1},3:{lat:1,lon:1.00001}};
    const policy=resolveBuildingPublicationSelection({requestedBuildingWays:count,maxBuildingWays:12000,tileBudgetCfg:{buildingsPerTile:220,buildingsMinPerTile:120}});
    const selected=limitWaysByTileBudget(ways,nodes,policy);
    assert.equal(selected.length,count);
    assert.deepEqual(new Set(selected.map(w=>w.id)),new Set(ways.map(w=>w.id)));
  }
});
test('retiring percentage thinning does not remove the explicit client safety budget',()=>{
  const policy=resolveBuildingPublicationSelection({requestedBuildingWays:50000,maxBuildingWays:12000});
  assert.equal(policy.globalCap,12000);
  assert.equal(policy.basePerTile,12000);
});


test('the real 48,834-building district fits every quality profile without deleting its footprints',()=>{
  const count=48834;
  const ways=Array.from({length:count},(_,id)=>({id,nodes:[1,2,3],tags:{building:'yes'}}));
  const nodes={1:{lat:39,lon:-76},2:{lat:39.00001,lon:-76},3:{lat:39,lon:-76.00001}};
  for(const [scale,device] of [[1,'desktop'],[.22,'desktop'],[.28,'mobile'],[1.35,'desktop']]){
    const profile=getAdaptiveLoadProfile(5,'baseline',scale,device);
    assert.ok(profile.maxBuildingWays>=count);
    assert.ok(profile.maxBuildingWays<=100000,'A bounded district still needs an absolute safety ceiling');
    const policy=resolveBuildingPublicationSelection({...profile,requestedBuildingWays:count});
    assert.equal(limitWaysByTileBudget(ways,nodes,policy).length,count);
  }
});
