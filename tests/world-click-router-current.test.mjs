import test from 'node:test';
import assert from 'node:assert/strict';

import {
  handleWorldCanvasClick,
  performWorldClickTarget,
  targetFromIntersection,
  targetFromObject
} from '../app/js/interaction/world-click-router.js';

test('mapped building presence tags are not displayed as a building name', () => {
  assert.equal(targetFromObject({ userData: { sourceBuildingId: 'osm:1', buildingType: 'yes' } }).label, 'mapped building');
  assert.equal(targetFromObject({ userData: { sourceBuildingId: 'osm:1', buildingType: 'yes', buildingName: 'Town Hall' } }).label, 'Town Hall');
});

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


test('PaintTown owns world clicks without also opening a world selection', () => {
  const priorThree = globalThis.THREE;
  const target = { isObject3D: true, uuid: 'paint-target', userData: { worldClickTarget: { kind: 'living-vehicle', id: 'vehicle:1' } } };
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) };
  let selections = 0;
  globalThis.THREE = {
    Vector2: class {},
    Raycaster: class { setFromCamera() {} intersectObjects() { return [{ object: target }]; } }
  };
  const ctx = { renderer: { domElement: canvas }, gameStarted: true, gameMode: 'painttown', paintTown: { active: true },
    livingWorldRuntime: { population: { pickableRoots: () => [target] } },
    handleLivingWorldSelection() { selections++; return true; }
  };
  const click = { button: 0, target: canvas, clientX: 50, clientY: 50 };
  try {
    assert.equal(handleWorldCanvasClick(ctx, click), true);
    assert.equal(selections, 0, 'Painting must not also select a world object.');
    ctx.gameMode = 'free';
    assert.equal(handleWorldCanvasClick(ctx, click), true);
    assert.equal(selections, 1, 'Ordinary exploration still selects objects.');
  } finally { globalThis.THREE = priorThree; }
});
