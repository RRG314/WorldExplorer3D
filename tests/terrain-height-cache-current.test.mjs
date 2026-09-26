import test from 'node:test';
import assert from 'node:assert/strict';
import {createTerrainHeightSamplingApi} from '../app/js/terrain/height-sampling.js';

test('terrain caching preserves distinct heights within a decimetre instead of stair-stepping a slope',()=>{
 const api=createTerrainHeightSamplingApi({appCtx:{},elevationWorldYAtWorldXZ:(x,z)=>.25*x+.1*z});
 for(const sample of [api.cachedTerrainHeight,api.cachedBaseTerrainHeight]){
  assert.equal(sample(.01,.01),.0035);
  assert.equal(sample(.04,.04),.014);
  assert.equal(sample(.01,.01),.0035);
 }
});
test('worldwide terrain sampling retains a bounded cache and never caches unavailable ground',()=>{
 let calls=0,available=false;
 const api=createTerrainHeightSamplingApi({appCtx:{},elevationWorldYAtWorldXZ:x=>{calls++;return available?x:null;}});
 assert.equal(api.cachedTerrainHeight(1,0),null);available=true;assert.equal(api.cachedTerrainHeight(1,0),1);
 const limit=api.heightSamplingCacheStats().maximumEntriesPerCache;
 for(let x=0;x<=limit;x++){api.cachedTerrainHeight(x,0);api.cachedBaseTerrainHeight(x,0);}
 const stats=api.heightSamplingCacheStats();assert.ok(stats.terrainEntries<=limit);assert.ok(stats.baseEntries<=limit);
 const before=calls;api.cachedTerrainHeight(limit,0);api.cachedBaseTerrainHeight(limit,0);assert.equal(calls,before);
 api.clearTerrainHeightCache();assert.equal(api.heightSamplingCacheStats().terrainEntries,0);assert.equal(api.heightSamplingCacheStats().baseEntries,0);
});
