import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {deferHiddenSkyMatrixUpdates} from '../app/js/sky/sky-matrix-updates.js';

test('hidden sky skips descendants and restores current transforms on first visible frame', () => {
  const scene = new THREE.Scene();
  const sky = deferHiddenSkyMatrixUpdates(new THREE.Group());
  const star = new THREE.Object3D(); star.position.set(2, 0, 0);
  sky.add(star); scene.add(sky);
  let updates = 0;
  const original = star.updateMatrixWorld;
  star.updateMatrixWorld = function(force) { updates++; original.call(this, force); };
  scene.updateMatrixWorld(true); assert.equal(updates, 1);
  sky.visible = false; sky.position.set(10, 0, 0); sky.rotation.z = Math.PI / 2;
  scene.updateMatrixWorld(true); scene.updateMatrixWorld(true);
  assert.equal(updates, 1);
  sky.visible = true; scene.updateMatrixWorld(); assert.equal(updates, 2);
  const position = new THREE.Vector3().setFromMatrixPosition(star.matrixWorld);
  assert.ok(position.distanceTo(new THREE.Vector3(10, 2, 0)) < 1e-10);
  sky.position.z = 5; scene.updateMatrixWorld();
  assert.equal(new THREE.Vector3().setFromMatrixPosition(star.matrixWorld).z, 5);
});

test('explicit world queries remain valid while the sky is hidden', () => {
  const sky = deferHiddenSkyMatrixUpdates(new THREE.Group());
  const star = new THREE.Object3D(); sky.add(star); sky.visible = false;
  sky.position.set(20, 30, 40); star.position.set(1, 2, 3);
  assert.deepEqual(star.getWorldPosition(new THREE.Vector3()).toArray(), [21, 32, 43]);
});
