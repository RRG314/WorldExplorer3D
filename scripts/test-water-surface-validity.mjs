import assert from 'node:assert/strict';
import { assessMappedWaterTerrain } from '../app/js/world/water-surface-validity.js';

const alpineSheet = assessMappedWaterTerrain({
  sampledHeights: [3100, 3275, 3590, 3420],
  surfaceY: 3460,
  span: 420,
  layer: 'water_polygons'
});
assert.equal(alpineSheet.valid, false);
assert.equal(alpineSheet.reason, 'high_elevation_relief');

const alpineMissingSample = assessMappedWaterTerrain({
  sampledHeights: [0, 3262, 3335, 3290],
  surfaceY: 3267,
  span: 545,
  layer: 'water_polygons'
});
assert.equal(alpineMissingSample.valid, false);

const alpineUnknownTerrain = assessMappedWaterTerrain({
  sampledHeights: [0, 0, 0],
  surfaceY: 0,
  ambientY: 2900,
  span: 700,
  layer: 'water_polygons'
});
assert.equal(alpineUnknownTerrain.valid, false);
assert.equal(alpineUnknownTerrain.reason, 'alpine_terrain_missing');

const mountainLake = assessMappedWaterTerrain({
  sampledHeights: [1708.8, 1709.2, 1709.5, 1709.1],
  surfaceY: 1709.2,
  span: 900,
  layer: 'water_polygons'
});
assert.equal(mountainLake.valid, true);

const ocean = assessMappedWaterTerrain({
  sampledHeights: [-450, 0, -320, 0],
  surfaceY: 0,
  span: 4000,
  layer: 'ocean'
});
assert.equal(ocean.valid, true);

console.log(JSON.stringify({
  ok: true,
  alpineReliefRejected: alpineSheet.relief,
  alpineMissingSampleRejected: alpineMissingSample.relief,
  alpineUnknownTerrainRejected: alpineUnknownTerrain.reason,
  mountainLakeReliefAccepted: mountainLake.relief,
  oceanAccepted: ocean.valid
}, null, 2));
