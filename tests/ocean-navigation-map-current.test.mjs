import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeabedMapData, oceanHeadingDegrees } from '../app/js/ocean/navigation-map.js';
import { createOceanBathymetryApi } from '../app/js/ocean/bathymetry.js';
const evidence = (y, known = true) => ({ presentationWorldY: y, bathymetry: known
  ? { truthType: 'modeled', depthMeters: 80, sourceId: 'test-grid' }
  : { truthType: 'unknown', depthMeters: null } });
test('heading follows the submarine forward vector on a north-up map', () => {
  assert.equal(oceanHeadingDegrees(0), 180);
  assert.equal(oceanHeadingDegrees(Math.PI / 2), 90);
  assert.equal(oceanHeadingDegrees(Math.PI), 0);
  assert.equal(oceanHeadingDegrees(-Math.PI / 2), 270);
  assert.equal(oceanHeadingDegrees(3 * Math.PI), 0);
});
test('a flat seabed has no invented contour waves', () => {
  const data = createSeabedMapData({ sample: () => evidence(-25), resolution: 9 });
  assert.equal(data.contours.length, 0);
  assert.equal(data.knownCount, 81);
  assert.deepEqual(data.sources, ['test-grid']);
});
test('contours trace the sampled slope at the actual depth and position', () => {
  const data = createSeabedMapData({ sample: (x) => evidence(-100 - x), halfExtent: 40,
    resolution: 9, metersPerWorldUnit: 1 });
  assert.ok(data.contours.length > 0);
  for (const line of data.contours) {
    const x = (line.depthMeters - 60) / 80;
    assert.ok(Math.abs(line.from[0] - x) < 1e-6);
    assert.ok(Math.abs(line.to[0] - x) < 1e-6);
    assert.ok(line.from[1] >= 0 && line.to[1] <= 1);
  }
});
test('data gaps remain distinct from the generated collision surface', () => {
  const data = createSeabedMapData({ sample: (x) => evidence(-100 - x, x >= 0), halfExtent: 40, resolution: 9 });
  assert.equal(data.knownCount, 45);
  assert.equal(data.known[0], 0);
  assert.ok(data.contours.length > 0);
  assert.equal(data.depths.every(Number.isFinite), true);
});
test('reported map height and collision height agree before and after data readiness', () => {
  const mode = { launchSite: { lat: 0, lon: 0 }, globalBathymetryGrid: { size: 2, extent: 900, values: [-30,-80,-100,-40] } };
  const api = createOceanBathymetryApi({ appCtx: { SCALE: 100000 }, oceanMode: mode, constants: {} });
  for (const ready of [false, true]) {
    mode.bathymetryReady = ready;
    for (const [x,z] of [[0,0],[123,54],[899,20],[901,40]]) {
      assert.ok(Math.abs(api.sampleSeabedHeight(x,z) - api.sampleSeabedEvidence(x,z).presentationWorldY) < 1e-10);
    }
  }
});
