import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { getAdaptiveLoadProfile } from '../app/js/world/budgets.js';
import { shouldLoadDetailedBuildings } from '../app/js/world/settlement-density-policy.js';

const root = process.cwd();
const read = (file) => fs.readFile(`${root}/${file}`, 'utf8');
const [entry, onDemand, bootstrap, loadSession, budgeting, terrain, tiles, osmLoader, roadLoader, overtureBuildings, settlementPolicy, weather] = await Promise.all([
  read('app/js/app-entry.js'),
  read('app/js/runtime/on-demand-modes.js'),
  read('app/js/bootstrap.js'),
  read('app/js/world/load-runtime-session.js'),
  read('app/js/world/load-budgeting.js'),
  read('app/js/terrain.js'),
  read('app/js/terrain/tiles.js'),
  read('app/js/world/osm-loader.js'),
  read('app/js/world/load-roads.js'),
  read('app/js/world/overture-building-source.js'),
  read('app/js/world/settlement-density-policy.js'),
  read('app/js/weather.js')
]);

for (const mode of ['baseline', 'rdt']) {
  for (const depth of [0, 4, 6]) {
    const profile = getAdaptiveLoadProfile(depth, mode, 1);
    assert.ok(profile.maxRoadWays >= 3400, 'initial publication must retain a traversable road network');
    assert.ok(
      profile.maxBuildingWays >= 7000 && profile.maxBuildingWays <= 9000,
      'initial publication must retain a nearby city district without blocking play'
    );
    assert.ok(profile.maxLanduseWays >= 4200, 'initial publication must retain mapped surface coverage');
    assert.ok(profile.overpassTimeoutMs >= 19000, 'source requests must have enough time to avoid routine fallback degradation');
    assert.ok(profile.maxTotalLoadMs >= 44000, 'the load deadline must not silently trade away city completeness');
  }
}

assert.ok(!entry.includes("import './solar-system.js"), 'solar-system must not be in the Earth startup graph');
assert.ok(!entry.includes("import './space.js"), 'space flight must not be in the Earth startup graph');
assert.ok(!entry.includes("import './ocean.js"), 'ocean mode must not be in the Earth startup graph');
assert.ok(entry.includes("scheduleAfterFirstPlay('tutorial-runtime'"));
assert.ok(entry.includes("scheduleAfterFirstPlay('analytics-runtime'"));
assert.ok(onDemand.includes("import('../solar-system.js") && onDemand.includes("import('../space.js"));
assert.ok(onDemand.includes("import('../ocean.js"));
assert.ok(bootstrap.includes("scheduleAfterFirstPlay('optional-rendering-vendors'"));
assert.ok(loadSession.includes("markFirstPlayReady({"));
assert.ok(loadSession.includes('`earth-ambient-state-${publication.sequence}`'));
assert.ok(!budgeting.includes('options.baselineFullWorld === true ?\n    allWaterwayWays'));
assert.ok(terrain.includes('{ reuseBaseElevations: true }'));
assert.ok(tiles.includes('mesh.userData.baseTerrainWorldY = nextBaseElevations'));
assert.ok(osmLoader.includes("0.022") && osmLoader.includes("roadsRadius * 1.2"));
assert.ok(!roadLoader.includes('const preferredBuildingDataPromise'));
assert.ok(roadLoader.includes('shouldLoadDetailedBuildings(data, {'));
assert.ok(roadLoader.indexOf('shouldLoadDetailedBuildings(data, {') >
  roadLoader.indexOf("startLoadPhase('fetchOverpass')"));
assert.ok(roadLoader.includes('Math.min(overpassTimeoutMs, 9000)'));
assert.ok(roadLoader.includes("sparseReason: 'no_settlement_sparse'"));
assert.ok(settlementPolicy.includes('!sparseBiome && evidence.driveableRoads >= 12'));
assert.ok(weather.includes('MIN_EARTH_EXPOSURE = 0.92'));
assert.ok(weather.includes('MIN_EARTH_AMBIENT_INTENSITY = 0.32'));
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
assert.ok(
  !overtureBuildings.includes('Overture building coverage incomplete'),
  'partial Overture tile coverage must publish fulfilled authoritative building tiles'
);

console.log(JSON.stringify({
  ok: true,
  message: 'Initial Earth retains a complete nearby district while distant and inactive render families remain on demand.'
}, null, 2));
