import assert from 'node:assert/strict';
import { getAdaptiveLoadProfile } from '../app/js/world/budgets.js';
import { shouldLoadDetailedBuildings } from '../app/js/world/settlement-density-policy.js';

for (const mode of ['baseline', 'rdt']) {
  for (const depth of [0, 4, 6]) {
    const profile = getAdaptiveLoadProfile(depth, mode, 1);
    assert.ok(profile.maxRoadWays >= 3400, 'initial publication must retain a traversable road network');
    assert.ok(
      profile.maxBuildingWays >= 22000,
      'initial publication must allow the 85% coverage target up to the earlier safe ceiling'
    );
    assert.ok(profile.maxLanduseWays >= 4200, 'initial publication must retain mapped surface coverage');
    assert.ok(profile.overpassTimeoutMs >= 19000, 'source requests must have enough time to avoid routine fallback degradation');
    assert.ok(profile.maxTotalLoadMs >= 44000, 'the load deadline must not silently trade away city completeness');
  }
}

const emptyBiomePolicy = shouldLoadDetailedBuildings({
  elements: [
    { type: 'way', tags: { natural: 'sand' } },
    { type: 'way', tags: { highway: 'track' } },
    { type: 'way', tags: { natural: 'glacier' } }
  ]
});
assert.equal(emptyBiomePolicy.shouldLoad, false);
const mappedDesertRoads = Array.from({ length: 20 }, (_, index) => ({
  id: index,
  type: 'way',
  tags: { highway: 'secondary' }
}));
assert.equal(shouldLoadDetailedBuildings(
  { elements: mappedDesertRoads },
  { worldSurfaceProfile: { terrainModeHint: 'sand' } }
).shouldLoad, false);
const cityPolicy = shouldLoadDetailedBuildings({
  elements: [{ type: 'way', tags: { landuse: 'residential' } }]
}, { worldSurfaceProfile: { terrainModeHint: 'sand' } });
assert.equal(cityPolicy.shouldLoad, true);
console.log(JSON.stringify({
  ok: true,
  message: 'Initial Earth quality budgets and settlement-density behavior passed. Browser startup workload is verified separately.'
}, null, 2));
