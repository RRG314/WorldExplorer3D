import assert from 'node:assert/strict';
import {
  applyShadowPolicy,
  createShadowPolicy,
  updateShadowAnchor
} from '../app/js/engine/shadow-policy.js';

const medium = createShadowPolicy({ quality: 'med', gpuTier: 'high' });
assert.equal(medium.enabled, true);
assert.equal(medium.mapType, 'pcf-soft');
assert.equal(medium.resolution, 2048);
assert(medium.halfExtent < 120, 'medium shadow coverage must be tighter than the legacy range');

const low = createShadowPolicy({ quality: 'low', gpuTier: 'low' });
assert.equal(low.enabled, false);
assert.equal(low.resolution, 0);

const renderer = { shadowMap: { enabled: false, type: null } };
const camera = { updateProjectionMatrixCalled: 0, updateProjectionMatrix() { this.updateProjectionMatrixCalled += 1; } };
const vector = (x = 0, y = 0, z = 0) => ({
  x, y, z,
  set(nextX, nextY, nextZ) {
    this.x = nextX;
    this.y = nextY;
    this.z = nextZ;
  }
});
const sun = {
  castShadow: false,
  position: vector(100, 150, 50),
  target: { position: vector(), updateMatrixWorld() {} },
  shadow: {
    mapSize: {},
    camera
  },
  userData: {},
  updateMatrixWorld() {}
};

applyShadowPolicy({
  renderer,
  sun,
  three: { PCFSoftShadowMap: 7 },
  policy: medium
});
assert.equal(renderer.shadowMap.enabled, true);
assert.equal(renderer.shadowMap.type, 7);
assert.equal(sun.castShadow, true);
assert.equal(sun.shadow.mapSize.width, 2048);
assert.equal(camera.left, -medium.halfExtent);
assert.equal(camera.updateProjectionMatrixCalled, 1);

const lightOffset = {
  x: sun.position.x - sun.target.position.x,
  y: sun.position.y - sun.target.position.y,
  z: sun.position.z - sun.target.position.z
};
assert.equal(updateShadowAnchor({
  sun,
  focus: { x: 10.123, y: 2.1, z: -7.85 },
  policy: medium
}), true);
assert.equal(sun.position.x - sun.target.position.x, lightOffset.x);
assert.equal(sun.position.y - sun.target.position.y, lightOffset.y);
assert.equal(sun.position.z - sun.target.position.z, lightOffset.z);
assert.equal(updateShadowAnchor({
  sun,
  focus: { ...sun.userData.shadowAnchor },
  policy: medium
}), false);

applyShadowPolicy({
  renderer,
  sun,
  three: { PCFSoftShadowMap: 7 },
  policy: low
});
assert.equal(renderer.shadowMap.enabled, false);
assert.equal(sun.castShadow, false);

console.log('Shadow policy contract passed.');
