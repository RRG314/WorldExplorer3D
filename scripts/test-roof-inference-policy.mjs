import assert from 'node:assert/strict';
import { resolveMappedRoof } from '../app/js/world/mapped-roof-geometry.js';

const footprint = [
  { x: 0, z: 0 },
  { x: 12, z: 0 },
  { x: 12, z: 8 },
  { x: 0, z: 8 }
];
const semantics = { baseOffsetMeters: 0 };

const house = resolveMappedRoof({ building: 'house', 'building:levels': '2' }, 7, semantics, footprint);
assert.equal(house?.shape, 'gabled');
assert.equal(house?.roofShapeSource, 'building_type_inferred');

const mappedHouse = resolveMappedRoof({ building: 'house', 'roof:shape': 'hipped' }, 7, semantics, footprint);
assert.equal(mappedHouse?.shape, 'hipped', 'mapped roof shape must override inference');
assert.equal(mappedHouse?.roofShapeSource, 'mapped');

for (const building of ['apartments', 'commercial', 'industrial', 'office', 'residential', 'retail', 'terrace', 'warehouse', 'yes']) {
  assert.equal(
    resolveMappedRoof({ building, 'building:levels': '2' }, 7, semantics, footprint),
    null,
    `${building} must remain flat without mapped roof evidence`
  );
}

assert.equal(
  resolveMappedRoof({ building: 'house', 'building:levels': '5' }, 16, semantics, footprint),
  null,
  'high-rise residential footprints must not receive inferred pitched roofs'
);

console.log(JSON.stringify({ ok: true, inferredHouse: house, mappedOverride: mappedHouse.shape }, null, 2));
