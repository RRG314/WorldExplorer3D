import assert from 'node:assert/strict';
import test from 'node:test';

import { compilePoiLifecycle } from '../app/js/poi/lifecycle.js';

const building = {
  sourceBuildingId: 'osm:way:shop', buildingType: 'commercial',
  minX: 0, maxX: 20, minZ: 0, maxZ: 20,
  pts: [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 20 }, { x: 0, z: 20 }]
};

test('one publication lifecycle owns identity, semantics, tenancy, door, and activation', () => {
  const lifecycle = compilePoiLifecycle([
    { sourceFeatureId: 'osm:node:a', sourceElementType: 'node', sourceElementId: 'a', x: 4, z: 5, tags: { shop: 'convenience', name: 'Corner Store' } },
    { sourceFeatureId: 'osm:node:b', sourceElementType: 'node', sourceElementId: 'b', x: 14, z: 15, tags: { amenity: 'pharmacy', name: 'Pharmacy' } }
  ], [building], {
    entranceByBuilding: new Map([['osm:way:shop', { x: 10, z: 0, approachX: 10, approachZ: -1 }]]),
    actor: { x: 0, z: 0 },
    activation: { radiusMeters: 100, limit: 6 }
  });
  assert.equal(lifecycle.records.length, 2);
  assert.equal(lifecycle.byBuilding.get('osm:way:shop').length, 2);
  assert.equal(lifecycle.metrics.entranceAssociated, 2);
  assert.equal(lifecycle.active.length, 2);
  assert.deepEqual(lifecycle.activeFor({ x: 1000, z: 1000 }), []);
  assert.ok(lifecycle.records.every((poi) => poi.lifecycle === 'entrance-associated'));
});
