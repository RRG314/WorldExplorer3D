import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createWalkingGeometryHelpers } from '../app/js/walking/geometry.js';
import {
  initWorldLoadSelection,
  nodeDistanceSq,
  wayCenterDistanceSq
} from '../app/js/world/load-selection.js';

let location = { lat: 10, lon: 20 };
initWorldLoadSelection({
  getLocation: () => location
});

assert.equal(nodeDistanceSq({ lat: 10, lon: 20 }), 0);
assert(nodeDistanceSq({ lat: 11, lon: 20 }) > 0);
assert.equal(
  wayCenterDistanceSq({ _coordinates: [20, 10, 20, 10] }, {}),
  0
);

location = { lat: -33.86, lon: 151.21 };
assert.equal(nodeDistanceSq({ lat: -33.86, lon: 151.21 }), 0);
assert.throws(
  () => initWorldLoadSelection({}),
  /requires getLocation/
);

let polygonCalls = 0;
const walkingGeometry = createWalkingGeometryHelpers({
  pointInPolygon(x, z, polygon) {
    polygonCalls += 1;
    return x === 2 && z === 3 && polygon.length === 3;
  }
});
assert.equal(walkingGeometry.pointInPolygonSafe(2, 3, [{}, {}, {}]), true);
assert.equal(polygonCalls, 1);

for (const file of [
  'app/js/walking/geometry.js',
  'app/js/world/load-selection.js',
  'app/js/world/roof-details.js'
]) {
  const source = fs.readFileSync(file, 'utf8');
  assert(!/shared-context\.js/.test(source), `${file} regained shared-context coupling`);
}

console.log(JSON.stringify({
  ok: true,
  boundaries: ['walking-geometry', 'world-load-selection', 'roof-details']
}, null, 2));
