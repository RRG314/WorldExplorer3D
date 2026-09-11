import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  normalizeDirection,
  normalizeDirectionSectors,
  parseSurveillanceElements
} from '../app/js/deflock/source.js';
import {
  cameraAt,
  camerasNear,
  decodeDeFlockPositionIndex,
  longitudeDeltaDegrees
} from '../app/js/deflock/globe-index.js';

const require = createRequire(import.meta.url);
const { bundledDeFlockFallback } = require('../functions/geospatial.js');

function makeIndex(records) {
  const buffer = new ArrayBuffer(16 + records.length * 9);
  const bytes = new Uint8Array(buffer);
  bytes.set([...'FHIX'].map((value) => value.charCodeAt(0)), 0);
  const view = new DataView(buffer);
  view.setUint32(4, 1, true);
  view.setUint32(8, records.length, true);
  const lat = new Int32Array(buffer, 16, records.length);
  const lon = new Int32Array(buffer, 16 + records.length * 4, records.length);
  const brand = new Uint8Array(buffer, 16 + records.length * 8, records.length);
  records.forEach((record, index) => {
    lat[index] = Math.round(record.lat * 1e6);
    lon[index] = Math.round(record.lon * 1e6);
    brand[index] = record.brandId || 0;
  });
  return decodeDeFlockPositionIndex(buffer, {
    count: records.length,
    build: 'test-build',
    brands: ['Unknown', 'Flock Safety']
  }, { id: 'test', label: 'Test' });
}

test('DeFlock direction parsing preserves multiple camera bearings', () => {
  assert.deepEqual(normalizeDirectionSectors('90; 180'), [
    { bearingDegrees: 90, fieldOfViewDegrees: null, kind: 'bearing', raw: '90' },
    { bearingDegrees: 180, fieldOfViewDegrees: null, kind: 'bearing', raw: '180' }
  ]);
  assert.equal(normalizeDirection('WNW'), 292.5);
});

test('DeFlock direction parsing preserves mapped ranges and wraparound', () => {
  assert.deepEqual(normalizeDirectionSectors('300-60'), [
    { bearingDegrees: 0, fieldOfViewDegrees: 120, kind: 'range', raw: '300-60' }
  ]);
  assert.deepEqual(normalizeDirectionSectors('0-360'), [
    { bearingDegrees: 180, fieldOfViewDegrees: 360, kind: 'panoramic', raw: '0-360' }
  ]);
});

test('OSM camera records retain raw direction provenance and sectors', () => {
  const [camera] = parseSurveillanceElements({
    elements: [{
      type: 'node',
      id: 123,
      lat: 39.1,
      lon: -76.5,
      timestamp: '2026-01-01T00:00:00Z',
      tags: {
        man_made: 'surveillance',
        'surveillance:type': 'ALPR',
        'camera:direction': 'E;S'
      }
    }]
  });
  assert.equal(camera.direction, 90);
  assert.deepEqual(camera.directions, [90, 180]);
  assert.equal(camera.directionRaw, 'E;S');
  assert.equal(camera.directionSource, 'camera:direction');
});

test('DeFlock binary globe index exposes every camera and bounded nearest lookup', () => {
  const index = makeIndex([
    { lat: 39.0, lon: -76.0, brandId: 1 },
    { lat: 39.001, lon: -76.001, brandId: 0 },
    { lat: 40.0, lon: -75.0, brandId: 1 }
  ]);
  assert.equal(index.count, 3);
  assert.equal(cameraAt(index, 0).brand, 'Flock Safety');
  const nearby = camerasNear({ indexes: [index] }, 39.0002, -76.0002, { radiusDegrees: 0.01 });
  assert.deepEqual(nearby.map((camera) => camera.indexItem), [0, 1]);
});

test('DeFlock nearest lookup follows the short path across the antimeridian', () => {
  assert.ok(Math.abs(longitudeDeltaDegrees(-179.99, 179.99) - 0.02) < 1e-9);
  const index = makeIndex([
    { lat: 51, lon: -179.99, brandId: 1 },
    { lat: 51, lon: -170, brandId: 0 }
  ]);
  const nearby = camerasNear({ indexes: [index] }, 51, 179.99, { radiusDegrees: 0.04 });
  assert.deepEqual(nearby.map((camera) => camera.indexItem), [0]);
});

test('DeFlock binary index rejects truncated payloads', () => {
  assert.throws(() => decodeDeFlockPositionIndex(new Uint8Array(12), { count: 0 }), /header is incomplete/i);
});

test('Baltimore last-good camera fallback follows its real snapshot coverage', () => {
  const result = bundledDeFlockFallback({ lat: 39.312284, lon: -76.5904341, radiusDegrees: 0.002 });
  assert.ok(result);
  assert.ok(result.elements.length >= 1);
  assert.equal(result.cache, 'bundled-last-good');
  assert.equal(bundledDeFlockFallback({ lat: 40, lon: -75, radiusDegrees: 0.002 }), null);
});
