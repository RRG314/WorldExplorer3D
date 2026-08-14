import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  FAR_FIELD_GAP_FILL_INTERVAL_METERS,
  FAR_FIELD_GRID_INTERVAL_METERS,
  FAR_FIELD_WORLDCOVER_SIZE
} from '../app/js/terrain/far-field.js';
import {
  cellFullyInsideDetailedCoverage,
  publishedDetailedTerrainTileKeys
} from '../app/js/terrain/far-field-coverage.js';
import { landusePresentationOwner } from '../app/js/world/surface-contract.js';
import { pointInMappedLandArea } from '../app/js/terrain/far-field-mapped-context.js';

const contract = JSON.parse(await fs.readFile(
  new URL('../config/world-rendering-contract.json', import.meta.url),
  'utf8'
));

assert.equal(contract.schemaVersion, 1);
assert.equal(FAR_FIELD_GRID_INTERVAL_METERS, contract.terrain.fixedLocationGridIntervalMeters);
assert.equal(FAR_FIELD_GAP_FILL_INTERVAL_METERS, contract.terrain.unpublishedDetailGapIntervalMeters);
assert.equal(FAR_FIELD_WORLDCOVER_SIZE, contract.terrain.regionalLandCoverTextureSize);
assert.equal(contract.terrain.maximumUnownedCells, 0);
assert.equal(contract.landUse.generatedSidewalks, false);
assert.equal(contract.landUse.generatedFootpaths, false);
assert.equal(contract.landUse.providerFallback, 'same-request-shortbread-semantic-tint');
assert.deepEqual(contract.visualMatrix, ['baltimore', 'new-york', 'london', 'monaco']);

for (const kind of ['residential', 'commercial', 'industrial', 'retail']) {
  assert.equal(
    landusePresentationOwner(kind),
    contract.landUse.developedPresentationOwner,
    `${kind} must retain mapped urban presentation ownership`
  );
}
for (const kind of ['parking', 'paved']) {
  assert.equal(
    landusePresentationOwner(kind),
    contract.landUse.explicitHardscapePresentationOwner,
    `${kind} must retain exact mapped hardscape ownership`
  );
}
for (const kind of ['park', 'garden', 'grass', 'meadow', 'sand', 'forest']) {
  assert.equal(
    landusePresentationOwner(kind),
    contract.landUse.naturalPresentationOwner,
    `${kind} must retain natural terrain presentation ownership`
  );
}

const detailedCoverage = [{ minX: 0, maxX: 10, minZ: 0, maxZ: 10 }];
assert.equal(cellFullyInsideDetailedCoverage(1, 9, 1, 9, detailedCoverage), true);
assert.equal(cellFullyInsideDetailedCoverage(-1, 9, 1, 9, detailedCoverage), false);
const mappedPark = {
  outer: [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
  holes: [[[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]],
  bounds: { minLon: 0, maxLon: 10, minLat: 0, maxLat: 10 }
};
assert.equal(pointInMappedLandArea(2, 2, mappedPark), true);
assert.equal(pointInMappedLandArea(5, 5, mappedPark), false);
assert.deepEqual([...publishedDetailedTerrainTileKeys([
  {
    visible: true,
    geometry: { attributes: { position: { count: 4 } } },
    userData: { isTerrainMesh: true, terrainTileKey: '15/1/1', pendingTerrainTile: false }
  },
  {
    visible: false,
    geometry: { attributes: { position: { count: 4 } } },
    userData: { isTerrainMesh: true, terrainTileKey: '15/1/2', pendingTerrainTile: true }
  }
])], ['15/1/1']);

console.log(JSON.stringify({
  ok: true,
  contract: 'single-world-rendering-authority',
  terrainGridMeters: FAR_FIELD_GRID_INTERVAL_METERS,
  unpublishedDetailGapGridMeters: FAR_FIELD_GAP_FILL_INTERVAL_METERS,
  regionalLandCoverTextureSize: FAR_FIELD_WORLDCOVER_SIZE,
  maximumUnownedCells: contract.terrain.maximumUnownedCells,
  developedLandUse: contract.landUse.developedPresentationOwner,
  explicitHardscape: contract.landUse.explicitHardscapePresentationOwner,
  naturalLandUse: contract.landUse.naturalPresentationOwner,
  providerFallback: contract.landUse.providerFallback,
  visualMatrix: contract.visualMatrix
}, null, 2));
