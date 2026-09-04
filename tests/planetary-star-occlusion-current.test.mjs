import assert from 'node:assert/strict';
import test from 'node:test';

import { setPlanetaryStarOcclusion } from '../app/js/planetary/star-occlusion.js';

function skyObject({ nested = false } = {}) {
  const material = {
    depthTest: false,
    depthWrite: false,
    transparent: false,
    needsUpdate: false,
    userData: {}
  };
  const points = { isPoints: true, material, renderOrder: -1000, userData: {} };
  const root = {
    userData: {},
    children: nested ? [{ children: [points] }] : [points],
    traverse(callback) {
      const visit = (object) => {
        callback(object);
        object.children?.forEach(visit);
      };
      visit(this);
    }
  };
  return { root, points, material };
}

test('planetary star rendering is depth-tested after terrain, including nested catalog layers', () => {
  const { root, points, material } = skyObject({ nested: true });
  assert.equal(setPlanetaryStarOcclusion(root, true), 1);
  assert.equal(material.depthTest, true);
  assert.equal(material.depthWrite, false);
  assert.equal(material.transparent, true);
  assert.equal(points.renderOrder, 1000);
  assert.equal(root.userData.planetarySurfaceOcclusion, true);
});

test('leaving a planet restores the exact Earth sky material and ordering state', () => {
  const { root, points, material } = skyObject();
  setPlanetaryStarOcclusion(root, true);
  setPlanetaryStarOcclusion(root, false);
  assert.equal(material.depthTest, false);
  assert.equal(material.depthWrite, false);
  assert.equal(material.transparent, false);
  assert.equal(points.renderOrder, -1000);
  assert.equal(root.userData.planetarySurfaceOcclusion, false);
  assert.equal(material.userData.planetarySurfaceSkyState, undefined);
});

test('repeated activation does not overwrite the original restoration state', () => {
  const { root, points, material } = skyObject();
  setPlanetaryStarOcclusion(root, true);
  setPlanetaryStarOcclusion(root, true);
  setPlanetaryStarOcclusion(root, false);
  assert.equal(material.depthTest, false);
  assert.equal(material.transparent, false);
  assert.equal(points.renderOrder, -1000);
});
