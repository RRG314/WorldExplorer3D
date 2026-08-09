import assert from 'node:assert/strict';
import {
  resolveFarFieldSurfaceColor,
  sampleDetailedWorldCoverSurfaceTint,
  sampleWorldCoverSurfaceTint
} from '../app/js/terrain/far-field-surface-color.js';

const bounds = { latN: 2, latS: 0, lonW: 0, lonE: 2 };
const result = {
  surfaceTintSize: 2,
  surfaceTintEncodingScale: 100,
  surfaceTints: new Uint8Array([
    100, 0, 0,   0, 100, 0,
    0, 0, 100,   100, 100, 100
  ])
};

assert.deepEqual(sampleWorldCoverSurfaceTint(result, bounds, 2, 0), [1, 0, 0]);
assert.deepEqual(sampleWorldCoverSurfaceTint(result, bounds, 0, 2), [1, 1, 1]);
assert.deepEqual(sampleWorldCoverSurfaceTint(result, bounds, 1, 1), [0.5, 0.5, 0.5]);
assert.equal(sampleWorldCoverSurfaceTint(null, bounds, 1, 1), null);
assert.deepEqual(sampleDetailedWorldCoverSurfaceTint([{ bounds, result }], 2, 0), [1, 0, 0]);
assert.equal(sampleDetailedWorldCoverSurfaceTint([{ bounds, result }], 3, 0), null);
assert.deepEqual(resolveFarFieldSurfaceColor({
  detailedWorldCoverColor: [0.2, 0.4, 0.6],
  mappedColor: [0.1, 0.2, 0.3],
  worldCoverResult: result,
  worldCoverBounds: bounds,
  latitude: 2,
  longitude: 0,
  fallbackColor: [0.9, 0.9, 0.9]
}), [0.2, 0.4, 0.6]);
assert.deepEqual(resolveFarFieldSurfaceColor({
  worldCoverResult: result,
  worldCoverBounds: bounds,
  latitude: 2,
  longitude: 0,
  fallbackColor: [0.9, 0.9, 0.9]
}), [1, 0, 0]);
assert.deepEqual(resolveFarFieldSurfaceColor({
  mappedColor: [0.1, 0.2, 0.3],
  fallbackColor: [0.9, 0.9, 0.9]
}), [0.1, 0.2, 0.3]);
assert.deepEqual(resolveFarFieldSurfaceColor({ fallbackColor: [0.9, 0.9, 0.9] }), [0.9, 0.9, 0.9]);

console.log(JSON.stringify({
  ok: true,
  contract: 'far-field-surface-color',
  verified: ['worldcover-bilinear-sampling', 'near-tile-color-reuse', 'continuous-worldcover-precedence', 'mapped-and-heuristic-fallbacks']
}, null, 2));
