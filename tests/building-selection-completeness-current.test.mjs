import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveBuildingPublicationSelection} from '../app/js/world/load-building-detail.js';
import {limitWaysByTileBudget} from '../app/js/world/budgets.js';

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
