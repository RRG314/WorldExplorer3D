import test from 'node:test';
import assert from 'node:assert/strict';

import {
  performWorldClickTarget,
  targetFromIntersection,
  targetFromObject
} from '../app/js/interaction/world-click-router.js';

test('semantic targets are inherited from an actor root', () => {
  const root = { userData: { worldClickTarget: () => ({ kind: 'living-pedestrian', id: 'pedestrian:4' }) }, parent: null };
  const child = { userData: {}, parent: root };
  assert.deepEqual(targetFromObject(child), { kind: 'living-pedestrian', id: 'pedestrian:4' });
});

test('batched building face ranges resolve to the correct mapped building', () => {
  const object = {
    userData: {
      editableBuildingIndexRanges: [
        { sourceBuildingId: 'osm:way:10', start: 0, count: 60 },
        { sourceBuildingId: 'osm:way:20', start: 60, count: 90 }
      ]
    },
    parent: null
  };
  assert.equal(targetFromIntersection({ object, faceIndex: 22 }).id, 'osm:way:20');
});

test('click routing delegates actors and opens existing POI information', () => {
  const calls = [];
  const appCtx = {
    handleLivingWorldSelection(target) {
      calls.push(['actor', target.id]);
      return target.kind === 'living-vehicle';
    },
    showMapInfo(type, value) {
      calls.push([type, value.id]);
    }
  };
  assert.equal(performWorldClickTarget(appCtx, { kind: 'living-vehicle', id: 'vehicle:2' }), true);
  assert.equal(performWorldClickTarget(appCtx, { kind: 'poi', poi: { id: 'poi:3' } }), true);
  assert.deepEqual(calls, [['actor', 'vehicle:2'], ['actor', undefined], ['poi', 'poi:3']]);
});
