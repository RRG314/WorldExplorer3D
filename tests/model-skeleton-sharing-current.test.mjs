import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cloneModelGraph, disposeModelInstance } from '../app/js/assets/model-asset-runtime.js';

function model() {
  const root = new THREE.Group();
  const bone = new THREE.Bone();
  root.add(bone);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0], 4));
  for (let index = 0; index < 3; index++) {
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    const inverse = new THREE.Matrix4();
    if (index === 2) inverse.makeTranslation(0, -2, 0);
    mesh.bind(new THREE.Skeleton([bone], [inverse]), new THREE.Matrix4());
    root.add(mesh);
  }
  return root;
}

test('equivalent mesh skins share palettes but different bind poses and model instances do not', () => {
  const source = model();
  const first = cloneModelGraph(source);
  const second = cloneModelGraph(source);
  const [bone, a, b, different] = first.children;
  assert.equal(a.skeleton, b.skeleton);
  assert.notEqual(a.skeleton, different.skeleton);
  assert.notEqual(a.skeleton, second.children[1].skeleton);
  assert.notEqual(bone, source.children[0]);
  assert.equal(a.skeleton.bones[0], bone);
  bone.position.y = 3;
  first.updateMatrixWorld(true);
  a.skeleton.update();
  different.skeleton.update();
  assert.equal(a.boneTransform(0, new THREE.Vector3()).y, 3);
  assert.equal(b.boneTransform(0, new THREE.Vector3()).y, 3);
  assert.equal(different.boneTransform(0, new THREE.Vector3()).y, 1);
  second.updateMatrixWorld(true);
  assert.equal(second.children[1].boneTransform(0, new THREE.Vector3()).y, 0);
});

test('shared palette disposal occurs once and leaves other instances intact', () => {
  const source = model();
  const first = cloneModelGraph(source);
  const second = cloneModelGraph(source);
  let disposed = 0;
  for (const skeleton of new Set(first.children.filter(x => x.isSkinnedMesh).map(x => x.skeleton))) {
    skeleton.boneTexture = { dispose() { disposed++; } };
  }
  disposeModelInstance(first);
  assert.equal(disposed, 2);
  assert.ok(second.children[1].skeleton.bones[0]);
  assert.equal(second.children[1].skeleton.boneTexture, null);
});
