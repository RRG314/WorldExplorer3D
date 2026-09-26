import test from 'node:test';
import assert from 'node:assert/strict';
import { interiorSpawnIsClear, chooseClearInteriorSpawn } from '../app/js/interiors/scene-builder.js';
import { createWallCollider } from '../app/js/interiors/core.js?v=4';

const footprint = [{ x: -5, z: -5 }, { x: 5, z: -5 }, { x: 5, z: 5 }, { x: -5, z: 5 }];

test('interior entry rejects a thin partition between the old five clearance probes', () => {
  const wall = createWallCollider({ x: -2, z: .2 }, { x: 2, z: .2 }, 0, 3, .02);
  assert.equal(interiorSpawnIsClear({ x: 0, z: 0 }, footprint, [wall]), false);
  assert.equal(interiorSpawnIsClear({ x: 0, z: -1 }, footprint, [wall]), true);
});

test('blocked entry selection finds clearance and never falls back to an occupied center', () => {
  const wall = createWallCollider({ x: -2, z: .2 }, { x: 2, z: .2 }, 0, 3, .02);
  const spawn = chooseClearInteriorSpawn({ x: 0, z: 0 }, { x: 0, z: 2 }, footprint, [wall]);
  assert.ok(spawn);
  assert.equal(interiorSpawnIsClear(spawn, footprint, [wall]), true);
  const blocked = [{ minX: -5, maxX: 5, minZ: -5, maxZ: 5 }];
  assert.equal(chooseClearInteriorSpawn({ x: 0, z: 0 }, { x: 0, z: 0 }, footprint, blocked), null);
});

test('interior entry checks the complete walker footprint at diagonal walls and shell edges', () => {
  const wall = createWallCollider({ x: .2, z: -.1 }, { x: -.1, z: .2 }, 0, 3, .02);
  assert.equal(interiorSpawnIsClear({ x: 0, z: 0 }, footprint, [wall]), false);
  assert.equal(interiorSpawnIsClear({ x: 4.8, z: 0 }, footprint, []), false);
  assert.equal(interiorSpawnIsClear({ x: 4.5, z: 0 }, footprint, []), true);
});
