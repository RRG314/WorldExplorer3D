import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { clearBuildingExteriorDetails } from '../app/js/world/building-exterior-details.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('runtime exterior cleanup detaches meshes, disposes owned resources once and clears references', () => {
  const scene = new THREE.Scene();
  const material = new THREE.MeshStandardMaterial();
  const geometries = [new THREE.BoxGeometry(), new THREE.BoxGeometry()];
  const meshes = geometries.map(geometry => new THREE.Mesh(geometry, material));
  scene.add(...meshes);
  let materialDisposals = 0;
  const geometryDisposals = [0, 0];
  material.addEventListener('dispose', () => materialDisposals++);
  geometries.forEach((geometry, index) => geometry.addEventListener('dispose', () => geometryDisposals[index]++));
  const mappedGeometry = new THREE.BoxGeometry();
  const mappedMaterial = new THREE.MeshStandardMaterial();
  const mapped = new THREE.Mesh(mappedGeometry, mappedMaterial);
  scene.add(mapped);
  let authorityDisposals = 0;
  mappedGeometry.addEventListener('dispose', () => authorityDisposals++);
  mappedMaterial.addEventListener('dispose', () => authorityDisposals++);
  const appCtx = { buildingExteriorDetailMeshes: meshes, buildingExteriorDetailPublication: { count: 2 },
    structureVisualMeshes: [mapped] };
  clearBuildingExteriorDetails(appCtx);
  assert.equal(scene.children.length, 1, 'only the mapped building should remain in the scene');
  assert.deepEqual(scene.children, [mapped]);
  assert.ok(meshes.every(mesh => mesh.parent === null));
  assert.deepEqual(geometryDisposals, [1, 1]);
  assert.equal(materialDisposals, 1);
  assert.equal(authorityDisposals, 0);
  assert.deepEqual(appCtx.structureVisualMeshes, [mapped]);
  assert.deepEqual(appCtx.buildingExteriorDetailMeshes, []);
  assert.equal(appCtx.buildingExteriorDetailPublication, null);
  clearBuildingExteriorDetails(appCtx);
  assert.deepEqual(geometryDisposals, [1, 1]);
  assert.equal(materialDisposals, 1);
});

test('building publication owns exterior selection and near details once', async () => {
  const source = await read('app/js/world/load-building-pass.js');
  assert.match(source, /selectBuildingExteriorProfile|buildingIdentity: sourceBuildingId/);
  assert.equal((source.match(/publishBuildingExteriorDetails\(appCtx\)/g) || []).length, 1);
  assert.ok(source.indexOf('publishBuildingFacadeEntrances(appCtx)') < source.indexOf('publishBuildingExteriorDetails(appCtx)'));
  assert.ok(source.indexOf('loadMetrics.buildingExteriors = publishBuildingExteriorDetails(appCtx)') < source.indexOf('const batchedNearCount'));
});

test('detail geometry has an independent lifecycle and cannot replace mapped authorities', async () => {
  const details = await read('app/js/world/building-exterior-details.js');
  const reset = await read('app/js/world/load-reset.js');
  assert.match(details, /buildingExteriorDetailMeshes/);
  assert.doesNotMatch(details, /structureVisualMeshes\.push/);
  assert.match(details, /geometryAuthority: 'mapped-building-footprint-unchanged'/);
  assert.match(details, /collisionAuthority: 'existing-building-collider-unchanged'/);
  assert.match(reset, /clearBuildingExteriorDetails\(appCtx\)/);
});

test('facade material selection preserves mapped tags and uses bounded shared textures', async () => {
  const material = await read('app/js/engine/building-facade-materials.js');
  assert.match(material, /mappedMaterialChoices/);
  assert.match(material, /materialClaim: mappedFamily \? 'mapped'/);
  assert.match(material, /colorClaim: mappedColor \? 'mapped'/);
  assert.match(material, /sharedRuntimeTexture: true/);
  assert.match(material, /building-facade-local-layout-v10/);
  assert.doesNotMatch(material, /new THREE\.TextureLoader\(\).*forEach/);
});

test('open-ocean and world-reset transitions include exterior details', async () => {
  const boat = await read('app/js/boat-mode.js');
  const reset = await read('app/js/world/load-reset.js');
  assert.match(boat, /buildingExteriorDetailMeshes/);
  assert.match(reset, /hideList\(appCtx\.buildingExteriorDetailMeshes\)/);
});
