import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cloneModelGraph, disposeModelInstance } from '../app/js/assets/model-asset-runtime.js';

function template() {
  const root = new THREE.Group(),
    parent = new THREE.Group();
  parent.position.set(2, 3, 4);
  root.add(parent);
  parent.add(
    new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(1, 2, 3),
      ]),
      new THREE.LineBasicMaterial({ color: 0x75b7b4 })
    )
  );
  return root;
}
test('leased GLB line components clone their owned resources and keep explanatory colors and clipping separate from the template and siblings', () => {
  const source = template(),
    policy = { geometry: 'clone', materials: 'clone' },
    a = cloneModelGraph(source, policy),
    b = cloneModelGraph(source, policy),
    line = (root) => root.children[0].children[0];
  assert.notEqual(line(a).geometry, line(source).geometry);
  assert.notEqual(line(a).material, line(b).material);
  line(a).material.color.setHex(0xf4c064);
  line(a).material.clippingPlanes = [new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)];
  assert.equal(line(b).material.color.getHex(), 0x75b7b4);
  assert.equal(line(source).material.clippingPlanes, null);
  let geometry = 0,
    material = 0;
  line(a).geometry.addEventListener('dispose', () => geometry++);
  line(a).material.addEventListener('dispose', () => material++);
  disposeModelInstance(a, policy);
  assert.deepEqual({ geometry, material }, { geometry: 1, material: 1 });
  assert.equal(line(b).geometry.attributes.position.count, 2);
  assert.deepEqual(b.children[0].position.toArray(), [2, 3, 4]);
});
test('line leases with shared geometry release only their own material', () => {
  const source = template(),
    policy = { geometry: 'shared', materials: 'clone' },
    a = cloneModelGraph(source, policy),
    line = a.children[0].children[0];
  assert.equal(line.geometry, source.children[0].children[0].geometry);
  let disposed = 0;
  line.geometry.addEventListener('dispose', () => disposed++);
  disposeModelInstance(a, policy);
  assert.equal(disposed, 0);
});
