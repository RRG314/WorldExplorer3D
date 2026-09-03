import assert from 'node:assert/strict';
import test from 'node:test';
import { shortbreadPartCoverageStatus } from '../app/js/world/shortbread-source.js';
import { normalizeTransportSource } from '../app/js/world/compiler/transport-source-normalizer.js';

function tileBounds(z, x, y) {
  const scale = 2 ** z;
  const longitude = (tileX) => tileX / scale * 360 - 180;
  const latitude = (tileY) => Math.atan(Math.sinh(Math.PI * (1 - 2 * tileY / scale))) * 180 / Math.PI;
  return {
    west: longitude(x),
    east: longitude(x + 1),
    north: latitude(y),
    south: latitude(y + 1)
  };
}

test('a remote failed tile does not invalidate successfully loaded roads', () => {
  const z = 14;
  const x = 14544;
  const y = 6452;
  const bounds = tileBounds(z, x, y);
  const status = shortbreadPartCoverageStatus({
    coords: [
      [(bounds.west + bounds.east) * 0.5, (bounds.north + bounds.south) * 0.5],
      [(bounds.west + bounds.east) * 0.6, (bounds.north + bounds.south) * 0.55]
    ]
  }, { z, x, y }, new Set([`${z}/${x + 4}/${y + 4}`]));
  assert.equal(status.complete, true);
  assert.equal(status.truncated, false);
});

test('only a road endpoint touching a failed adjacent tile is incomplete', () => {
  const z = 14;
  const x = 14544;
  const y = 6452;
  const bounds = tileBounds(z, x, y);
  const failedEast = `${z}/${x + 1}/${y}`;
  const status = shortbreadPartCoverageStatus({
    coords: [
      [(bounds.west + bounds.east) * 0.5, (bounds.north + bounds.south) * 0.5],
      [bounds.east, (bounds.north + bounds.south) * 0.5]
    ]
  }, { z, x, y }, new Set([failedEast]));
  assert.equal(status.complete, false);
  assert.equal(status.truncated, true);
  assert.deepEqual(status.missingNeighbors, [failedEast]);
});

test('an incomplete route fragment keeps its loaded physical drive surface', () => {
  const record = normalizeTransportSource({
    sourceId: 'shortbread:streets:14:14544:6452:1:0',
    id: '1',
    type: 'way',
    providerNamespace: 'shortbread',
    completeness: 'generalized',
    geometryProvenance: 'shortbread-v1'
  }, {
    highway: 'residential',
    _sourceCompleteness: 'generalized',
    _sourceTruncated: 'yes'
  });
  assert.equal(record.routeState, 'incomplete');
  assert.equal(record.safeForDriving, true);
});

test('prohibited motor access still removes the drive surface', () => {
  const record = normalizeTransportSource({
    sourceId: 'shortbread:streets:14:14544:6452:2:0',
    id: '2',
    type: 'way',
    providerNamespace: 'shortbread',
    completeness: 'generalized',
    geometryProvenance: 'shortbread-v1'
  }, {
    highway: 'service',
    motor_vehicle: 'no',
    _sourceCompleteness: 'generalized'
  });
  assert.equal(record.routeState, 'complete');
  assert.equal(record.safeForDriving, false);
});
