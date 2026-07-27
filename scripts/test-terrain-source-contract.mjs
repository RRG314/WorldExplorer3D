import assert from 'node:assert/strict';
import {
  TERRARIUM_SOURCE_FACTS,
  WEB_MERCATOR_MAX_LATITUDE,
  clampWebMercatorLatitude,
  createLocalEnuFrame,
  decodeTerrariumRgb,
  geographicToLocalEnu,
  geographicToXyzTile,
  localEnuToGeographic,
  normalizeLongitude,
  webMercatorGroundResolutionMeters,
  xyzTileBounds
} from '../app/js/terrain/source-contract.js';

function assertNear(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected} ± ${tolerance}, received ${actual}`
  );
}

function longitudeDifferenceDegrees(a, b) {
  return Math.abs(normalizeLongitude(a - b));
}

const worldBounds = xyzTileBounds(0, 0, 0);
assert.equal(worldBounds.west, -180);
assert.equal(worldBounds.east, 180);
assertNear(
  worldBounds.north,
  WEB_MERCATOR_MAX_LATITUDE,
  1e-12,
  'Web Mercator north bound'
);
assertNear(
  worldBounds.south,
  -WEB_MERCATOR_MAX_LATITUDE,
  1e-12,
  'Web Mercator south bound'
);
assert.deepEqual(
  geographicToXyzTile(0, 0, 1),
  {
    z: 1,
    x: 1,
    y: 1,
    xFraction: 0,
    yFraction: 0,
    boundedLatitude: 0,
    wrappedLongitude: 0
  }
);
assert.equal(geographicToXyzTile(0, 180, 8).x, 0);
assert.equal(geographicToXyzTile(0, -180, 8).x, 0);
assert.equal(geographicToXyzTile(0, 540, 8).x, 0);
assert.equal(geographicToXyzTile(90, 0, 8).y, 0);
assert.equal(geographicToXyzTile(-90, 0, 8).y, 255);
assert.equal(clampWebMercatorLatitude(90), WEB_MERCATOR_MAX_LATITUDE);

const tileEdgeWest = xyzTileBounds(16383, 10901, 15);
const tileEdgeEast = xyzTileBounds(16384, 10901, 15);
assert.equal(tileEdgeWest.east, tileEdgeEast.west);
assert.ok(tileEdgeWest.north > tileEdgeWest.south, 'XYZ Y increases southward');

const globalTileControls = [
  { latitude: 39.2904, longitude: -76.6122 },
  { latitude: -33.8688, longitude: 151.2093 },
  { latitude: 64.1466, longitude: -21.9426 },
  { latitude: 0, longitude: 179.999999 },
  { latitude: 84.9, longitude: 40 }
];
for (const control of globalTileControls) {
  const tile = geographicToXyzTile(control.latitude, control.longitude, 15);
  const bounds = xyzTileBounds(tile.x, tile.y, tile.z);
  assert.ok(tile.x >= 0 && tile.x < 2 ** tile.z);
  assert.ok(tile.y >= 0 && tile.y < 2 ** tile.z);
  assert.ok(control.latitude <= bounds.north && control.latitude >= bounds.south);
  const wrappedLongitude = normalizeLongitude(control.longitude);
  assert.ok(wrappedLongitude >= bounds.west && wrappedLongitude <= bounds.east);
}

assert.equal(decodeTerrariumRgb(0, 0, 0), -32768);
assert.equal(decodeTerrariumRgb(128, 0, 0), 0);
assert.equal(decodeTerrariumRgb(128, 1, 0), 1);
assert.equal(decodeTerrariumRgb(128, 0, 128), 0.5);
assert.equal(decodeTerrariumRgb(137, 219, 68), 2523.265625);
assert.equal(decodeTerrariumRgb(162, 144, 64), 8848.25);
assert.throws(() => decodeTerrariumRgb(256, 0, 0), RangeError);

const enuControls = [
  {
    origin: { latitude: 39.2904, longitude: -76.6122, heightMeters: 18 },
    point: { latitude: 39.2912, longitude: -76.6108, heightMeters: 42 }
  },
  {
    origin: { latitude: -33.8688, longitude: 151.2093, heightMeters: 5 },
    point: { latitude: -33.8568, longitude: 151.2153, heightMeters: 121 }
  },
  {
    origin: { latitude: 0, longitude: 179.999, heightMeters: -25 },
    point: { latitude: 0.001, longitude: -179.999, heightMeters: -18 }
  },
  {
    origin: { latitude: 84.9, longitude: 40, heightMeters: 900 },
    point: { latitude: 84.901, longitude: 40.02, heightMeters: 940 }
  }
];

for (const { origin, point } of enuControls) {
  const frame = createLocalEnuFrame(origin);
  const local = geographicToLocalEnu(frame, point);
  const roundTrip = localEnuToGeographic(frame, local);
  assertNear(roundTrip.latitude, point.latitude, 1e-9, 'latitude round trip');
  assert.ok(
    longitudeDifferenceDegrees(roundTrip.longitude, point.longitude) <= 1e-9,
    'longitude round trip'
  );
  assertNear(roundTrip.heightMeters, point.heightMeters, 1e-5, 'height round trip');
}

const physicalOrigin = {
  latitude: -33.8688,
  longitude: 151.2093,
  heightMeters: 10
};
const latitudeRadians = physicalOrigin.latitude * Math.PI / 180;
const eccentricitySquared = 6.6943799901413165e-3;
const semiMajorAxis = 6378137;
const denominator = Math.sqrt(
  1 - eccentricitySquared * Math.sin(latitudeRadians) ** 2
);
const primeVerticalRadius = semiMajorAxis / denominator;
const meridionalRadius =
  semiMajorAxis * (1 - eccentricitySquared) / denominator ** 3;
const expectedEastMeters = 10;
const expectedNorthMeters = 10;
const physicalPoint = {
  latitude: physicalOrigin.latitude +
    expectedNorthMeters / meridionalRadius * 180 / Math.PI,
  longitude: physicalOrigin.longitude +
    expectedEastMeters /
      (primeVerticalRadius * Math.cos(latitudeRadians)) * 180 / Math.PI,
  heightMeters: physicalOrigin.heightMeters
};
const physicalLocal = geographicToLocalEnu(
  createLocalEnuFrame(physicalOrigin),
  physicalPoint
);
assertNear(physicalLocal.eastMeters, expectedEastMeters, 0.001, 'physical east');
assertNear(physicalLocal.northMeters, expectedNorthMeters, 0.001, 'physical north');
assertNear(physicalLocal.upMeters, 0, 0.001, 'physical up');

assertNear(
  webMercatorGroundResolutionMeters(0, 15),
  4.777314267823516,
  1e-12,
  'equatorial z15 ground resolution'
);
assertNear(
  webMercatorGroundResolutionMeters(-33.8688, 15),
  3.966679891067574,
  1e-12,
  'Sydney z15 ground resolution'
);
assert.equal(TERRARIUM_SOURCE_FACTS.representation, 'mixed-source terrain composite');
assert.equal(TERRARIUM_SOURCE_FACTS.runtimeClassification, 'legacy-ground-fallback-only');
assert.match(TERRARIUM_SOURCE_FACTS.deliveryGrid, /not the native source resolution/);
assert.match(TERRARIUM_SOURCE_FACTS.failurePolicy, /must not be converted to zero/);

console.log(JSON.stringify({
  ok: true,
  contract: 'terrain-source',
  tileControls: globalTileControls.length,
  enuControls: enuControls.length,
  terrariumEncodingIncrementMeters:
    TERRARIUM_SOURCE_FACTS.encodingIncrementMeters,
  z15DeliveryPixelSpacingMeters: {
    equator: webMercatorGroundResolutionMeters(0, 15),
    sydney: webMercatorGroundResolutionMeters(-33.8688, 15)
  },
  effectiveSourceResolution:
    TERRARIUM_SOURCE_FACTS.effectiveSourceResolution,
  sourceClassification: TERRARIUM_SOURCE_FACTS.runtimeClassification
}, null, 2));
