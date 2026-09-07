import assert from 'node:assert/strict';
import test from 'node:test';

import { associatePoiToBuilding, associatePoisToBuildings } from '../app/js/poi/building-association.js';

const building = (id, minX, minZ, maxX, maxZ) => ({
  id,
  sourceBuildingId: id,
  buildingType: 'commercial',
  minX, minZ, maxX, maxZ,
  pts: [
    { x: minX, z: minZ }, { x: maxX, z: minZ },
    { x: maxX, z: maxZ }, { x: minX, z: maxZ }
  ]
});

test('a mapped POI inside a safe building receives a stable contained association', () => {
  const association = associatePoiToBuilding({ id: 'poi:one', position: { x: 5, z: 5 } }, [
    building('way:10', 0, 0, 10, 10),
    building('way:20', 20, 20, 30, 30)
  ]);
  assert.equal(association.sourceBuildingId, 'way:10');
  assert.equal(association.relationship, 'contained');
  assert.equal(association.enterable, true);
});

test('several mapped POIs may share one building without changing building identity', () => {
  const shared = building('way:30', 0, 0, 20, 20);
  const associated = associatePoisToBuildings([
    { id: 'poi:a', position: { x: 4, z: 5 } },
    { id: 'poi:b', position: { x: 14, z: 15 } }
  ], [shared]);
  assert.deepEqual(associated.map((poi) => poi.buildingAssociation.sourceBuildingId), ['way:30', 'way:30']);
});

test('one canonical association carries the published door into the interior lifecycle', () => {
  const association = associatePoiToBuilding(
    { id: 'poi:door', position: { x: 5, z: 5 } },
    [building('way:door', 0, 0, 10, 10)],
    { entranceByBuilding: new Map([['way:door', { x: 5, z: 0, approachX: 5, approachZ: -1 }]]) }
  );
  assert.equal(association.entryType, 'published-door');
  assert.deepEqual(association.entrance, { x: 5, z: 0, approachX: 5, approachZ: -1 });
});

test('a nearby but unrelated building is not claimed across the outside association limit', () => {
  assert.equal(associatePoiToBuilding({ id: 'poi:outside', position: { x: 29, z: 5 } }, [
    building('way:nearish', 0, 0, 10, 10)
  ]), null);
});

test('no building match leaves the POI available for an exterior fallback', () => {
  assert.equal(associatePoiToBuilding({ id: 'poi:far', position: { x: 200, z: 200 } }, [building('way:40', 0, 0, 10, 10)]), null);
});
