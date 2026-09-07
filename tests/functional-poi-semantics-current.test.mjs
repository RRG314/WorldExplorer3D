import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activateNearbyPois,
  canonicalPoiId,
  classifyPoi,
  normalizePoi,
  normalizePois
} from '../app/js/poi/semantic-authority.js';

const mapped = (id, tags, x = 0, z = 0) => ({
  sourceFeatureId: id,
  sourceElementType: 'node',
  sourceElementId: id,
  x, z, tags,
  provider: id.startsWith('shortbread:') ? 'OpenStreetMap Shortbread' : 'OpenStreetMap'
});

test('stable identity comes from the mapped feature, never coordinates', () => {
  const first = mapped('osm:node:41', { shop: 'convenience', name: 'Corner Market' }, 1, 2);
  assert.equal(canonicalPoiId(first), canonicalPoiId({ ...first, x: 90, z: -12 }));
  assert.equal(normalizePoi({ x: 1, z: 2, tags: { shop: 'convenience' } }).stable, false);
});

test('one mapped place can publish several gameplay capabilities', () => {
  const semantic = classifyPoi(mapped('osm:node:42', { shop: 'convenience', amenity: 'fuel' }));
  assert.deepEqual(semantic.families, ['general', 'automotive']);
  assert.deepEqual(semantic.capabilities, ['retail.general', 'retail.vehicleSupplies']);
});

test('the initial six families map to capabilities without leaking provider syntax', () => {
  const records = normalizePois([
    mapped('osm:node:1', { shop: 'convenience' }),
    mapped('osm:node:2', { shop: 'car_repair' }),
    mapped('osm:node:3', { amenity: 'veterinary' }),
    mapped('osm:node:4', { shop: 'outdoor' }),
    mapped('osm:node:5', { healthcare: 'clinic' }),
    mapped('osm:node:6', { shop: 'boat' })
  ]);
  assert.deepEqual(new Set(records.flatMap((record) => record.semantic.families)), new Set(['general', 'automotive', 'pet', 'field', 'medical', 'marine']));
  assert.ok(records.every((record) => record.semantic.capabilities.every((id) => !id.includes('='))));
});

test('ordinary clothing POIs remain truthful and informational', () => {
  const record = normalizePoi(mapped('osm:node:7', { shop: 'clothes' }));
  assert.equal(record.semantic.functional, false);
  assert.match(record.semantic.informationalReason, /Clothing customization is intentionally unsupported/);
});

test('dense areas activate a deterministic bounded nearby set', () => {
  const records = normalizePois(Array.from({ length: 30 }, (_, index) => mapped(
    `shortbread:pois:14:1:1:${index}`,
    { shop: 'convenience' },
    index * 5,
    0
  )));
  const first = activateNearbyPois(records, { x: 0, z: 0 }, { radiusMeters: 200, limit: 6 });
  const repeat = activateNearbyPois(records, { x: 0, z: 0 }, { radiusMeters: 200, limit: 6 });
  assert.equal(first.length, 6);
  assert.deepEqual(first.map((entry) => entry.id), repeat.map((entry) => entry.id));
  assert.ok(first.every((entry) => ['active', 'nearby'].includes(entry.lifecycle)));
});
