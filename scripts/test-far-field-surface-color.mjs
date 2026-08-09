import assert from 'node:assert/strict';
import {
  resolveFarFieldFallbackColor,
  resolveFarFieldSurfaceColor,
  sampleDetailedWorldCoverSurface,
  sampleDetailedWorldCoverSurfaceTint,
  sampleWorldCoverBuiltWeight,
  sampleWorldCoverSurfaceTint
} from '../app/js/terrain/far-field-surface-color.js';

const bounds = { latN: 2, latS: 0, lonW: 0, lonE: 2 };
const assertColorClose = (actual, expected, epsilon = 1e-9) => {
  assert.equal(actual?.length, expected.length);
  expected.forEach((value, index) => {
    assert.ok(
      Math.abs(Number(actual[index]) - value) <= epsilon,
      `color channel ${index} expected ${value}, got ${actual[index]}`
    );
  });
};
const result = {
  surfaceTintSize: 2,
  surfaceTintEncodingScale: 100,
  surfaceTints: new Uint8Array([
    100, 0, 0,   0, 100, 0,
    0, 0, 100,   100, 100, 100
  ]),
  surfaceBuiltWeightSize: 2,
  surfaceBuiltWeights: new Uint8Array([0, 255, 0, 255])
};

assert.deepEqual(sampleWorldCoverSurfaceTint(result, bounds, 2, 0), [1, 0, 0]);
assert.deepEqual(sampleWorldCoverSurfaceTint(result, bounds, 0, 2), [1, 1, 1]);
assert.deepEqual(sampleWorldCoverSurfaceTint(result, bounds, 1, 1), [0.5, 0.5, 0.5]);
assert.equal(sampleWorldCoverSurfaceTint(null, bounds, 1, 1), null);
assert.deepEqual(sampleDetailedWorldCoverSurfaceTint([{ bounds, result }], 2, 0), [1, 0, 0]);
assert.equal(sampleDetailedWorldCoverSurfaceTint([{ bounds, result }], 3, 0), null);
assert.equal(sampleWorldCoverBuiltWeight(result, bounds, 2, 0), 0);
assert.equal(sampleWorldCoverBuiltWeight(result, bounds, 2, 2), 1);
assert.deepEqual(sampleDetailedWorldCoverSurface([{ bounds, result }], 2, 2), {
  tint: [0, 1, 0],
  builtWeight: 1
});
assertColorClose(resolveFarFieldSurfaceColor({
  detailedWorldCoverSurface: { tint: [0.5, 0.75, 1], builtWeight: 0 },
  mappedColor: [0.4, 0.4, 0.4],
  worldCoverResult: result,
  worldCoverBounds: bounds,
  latitude: 2,
  longitude: 0,
  fallbackColor: [0.9, 0.9, 0.9]
}), [0.2, 0.3, 0.4]);
assertColorClose(resolveFarFieldSurfaceColor({
  worldCoverResult: result,
  worldCoverBounds: bounds,
  latitude: 2,
  longitude: 0,
  fallbackColor: [0.6, 0.5, 0.4]
}), [0.6, 0, 0]);
assert.deepEqual(resolveFarFieldSurfaceColor({
  detailedWorldCoverSurface: { tint: [1, 1, 1], builtWeight: 1 },
  fallbackColor: [0.75, 0.7, 0.55]
}), [0.39, 0.41, 0.4]);
assert.deepEqual(resolveFarFieldSurfaceColor({
  mappedColor: [0.1, 0.2, 0.3],
  fallbackColor: [0.9, 0.9, 0.9]
}), [0.1, 0.2, 0.3]);
assert.deepEqual(resolveFarFieldSurfaceColor({ fallbackColor: [0.9, 0.9, 0.9] }), [0.9, 0.9, 0.9]);
assert.deepEqual(resolveFarFieldFallbackColor({
  meters: 0,
  latitude: -77.8,
  longitude: 166.7,
  locationMode: 'snow'
}), [0.82, 0.85, 0.87]);
assert.deepEqual(resolveFarFieldFallbackColor({
  meters: 0,
  latitude: 31,
  longitude: -4,
  locationMode: 'sand'
}), [0.66, 0.58, 0.41]);
assert.deepEqual(resolveFarFieldFallbackColor({ meters: 2200, locationMode: 'grass' }), [0.82, 0.85, 0.87]);

console.log(JSON.stringify({
  ok: true,
  contract: 'far-field-surface-color',
  verified: [
    'worldcover-bilinear-sampling',
    'worldcover-built-weight-sampling',
    'near-tile-surface-reuse',
    'worldcover-tint-is-a-multiplier',
    'built-surface-far-field-composition',
    'fixed-location-semantic-fallbacks',
    'mapped-and-heuristic-fallbacks'
  ]
}, null, 2));
