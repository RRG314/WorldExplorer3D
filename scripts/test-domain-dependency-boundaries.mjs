import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  initCameraClearance,
  resolveChaseCameraPosition
} from '../app/js/camera/clearance.js';
import { createWalkingGeometryHelpers } from '../app/js/walking/geometry.js';
import {
  addBuildingToSpatialIndex,
  getNearbyBuildings,
  initBuildingSpatialIndex,
  isSuppressedBaseBuilding
} from '../app/js/world/building-spatial-index.js';
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

let indexedBuildings = [];
let dynamicColliders = [];
let overlayColliders = [];
let overlaySuppression = {};
initBuildingSpatialIndex({
  getBuildings: () => indexedBuildings,
  getDynamicColliders: () => dynamicColliders,
  getOverlayColliders: () => overlayColliders,
  getOverlaySuppression: () => overlaySuppression
});
const indexedBuilding = { minX: -2, maxX: 2, minZ: -2, maxZ: 2, sourceBuildingId: 'osm:1' };
indexedBuildings = [indexedBuilding];
addBuildingToSpatialIndex(indexedBuilding);
assert.deepEqual(getNearbyBuildings(0, 0, 20), [indexedBuilding]);
overlaySuppression = { buildingIds: new Set(['osm:1']) };
assert.equal(isSuppressedBaseBuilding(indexedBuilding), true);
assert.deepEqual(getNearbyBuildings(0, 0, 20), []);

let cameraQueries = 0;
initCameraClearance({
  getNearbyBuildings: () => {
    cameraQueries += 1;
    return [];
  },
  sampleTerrainY: () => 2
});
const cameraTarget = resolveChaseCameraPosition(
  { x: 0, y: 1, z: 0 },
  { x: 0, y: 1, z: 5 },
  { radius: 0.5, cacheKey: 'boundary-test' }
);
assert(cameraQueries > 0);
assert.equal(cameraTarget.y, 2.75);

for (const file of [
  'app/js/camera/clearance.js',
  'app/js/walking/geometry.js',
  'app/js/world/bridge-landmark-structure.js',
  'app/js/world/building-spatial-index.js',
  'app/js/world/load-selection.js',
  'app/js/world/roof-details.js',
  'app/js/world/water-materials.js'
]) {
  const source = fs.readFileSync(file, 'utf8');
  assert(!/shared-context\.js/.test(source), `${file} regained shared-context coupling`);
}

console.log(JSON.stringify({
  ok: true,
  boundaries: [
    'building-spatial-index',
    'camera-clearance',
    'walking-geometry',
    'world-load-selection',
    'roof-details',
    'water-materials',
    'bridge-landmark-structure'
  ]
}, null, 2));
