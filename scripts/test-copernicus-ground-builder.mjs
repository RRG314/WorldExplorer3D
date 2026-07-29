import assert from 'node:assert/strict';
import {
  classifyCopernicusSurface,
  copernicusTileDescriptor
} from './lib/copernicus-ground-builder.mjs';

const width = 21;
const height = 21;
const smoothSlope = Float64Array.from(
  { length: width * height },
  (_, index) => {
    const row = Math.floor(index / width);
    const column = index % width;
    return 100 + row * 1.25 + column * 0.75;
  }
);
const surface = Float64Array.from(smoothSlope);
for (let row = 8; row <= 12; row += 1) {
  for (let column = 8; column <= 12; column += 1) {
    surface[row * width + column] += 35;
  }
}
const classified = classifyCopernicusSurface({
  values: surface,
  width,
  height,
  spacingMeters: 60
});
const buildingCenter = 10 * width + 10;
assert.ok(
  classified.ground[buildingCenter] <= smoothSlope[buildingCenter] + 3,
  'raised surface object was not removed'
);
assert.equal(classified.removed[buildingCenter], 1);
assert.ok(classified.removedCount >= 20);

const mountain = Float64Array.from(
  { length: width * height },
  (_, index) => {
    const row = Math.floor(index / width);
    const column = index % width;
    const distance = Math.hypot(column - 10, row - 10);
    return 500 + Math.max(0, 12 - distance) * 8;
  }
);
const mountainResult = classifyCopernicusSurface({
  values: mountain,
  width,
  height,
  spacingMeters: 60
});
assert.ok(
  mountainResult.ground[buildingCenter] >= mountain[buildingCenter] - 24,
  'terrain ridge was flattened beyond the correction threshold'
);

assert.equal(
  copernicusTileDescriptor(43.7, 7.4, 30).tileId,
  'Copernicus_DSM_COG_10_N43_00_E007_00_DEM'
);
assert.equal(
  copernicusTileDescriptor(-77.8, 166.6, 90).tileId,
  'Copernicus_DSM_COG_30_S78_00_E166_00_DEM'
);

console.log(JSON.stringify({
  ok: true,
  contract: 'copernicus-ground-builder',
  method: classified.method,
  removedObjectSamples: classified.removedCount,
  preservesSlopedTerrain: true,
  tileAddressing: true
}, null, 2));
