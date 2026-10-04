import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { clearBuildingExteriorDetails, selectExteriorDetailSources } from '../app/js/world/building-exterior-details.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('bounded exterior distance work preserves circular selection, district focus, ties and exact distances', () => {
  let seed = 61937;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const sources = Array.from({length: 25000}, (_, i) => ({
    detailCenter: {x: (random() - .5) * 5000, z: (random() - .5) * 5000},
    userData: {sourceBuildingId: String(i)}
  }));
  for (const [id, x, z] of [['tie-b', 115, 0], ['tie-a', -115, 0], ['corner', 115, 115], ['inside', 0, 0]]) {
    sources.push({detailCenter: {x, z}, userData: {sourceBuildingId: id}});
  }
  const hypot = Math.hypot;
  for (const radius of [0, 115, 180, 235]) for (const limit of [0, 72, 150, 240]) {
    for (const focus of [{x: 0, z: 0}, {x: 2200, z: -2100}, {x: 12000, z: 0}]) {
      for (const districtFocus of [null, {x: 500, z: -350}]) {
        const options = {focus, districtFocus, radius, limit};
        const expected = sources.map(mesh => ({mesh, distance: Math.min(
          hypot(mesh.detailCenter.x - focus.x, mesh.detailCenter.z - focus.z),
          districtFocus ? hypot(mesh.detailCenter.x - districtFocus.x, mesh.detailCenter.z - districtFocus.z) : Infinity
        )})).filter(row => row.distance <= radius)
          .sort((a, b) => a.distance - b.distance || a.mesh.userData.sourceBuildingId.localeCompare(b.mesh.userData.sourceBuildingId)).slice(0, limit);
        let calls = 0;
        try {
          Math.hypot = (...args) => {calls++; return hypot(...args);};
          const actual = selectExteriorDetailSources(sources, options);
          assert.equal(actual.length, expected.length);
          actual.forEach((row, index) => {
            assert.equal(row.mesh, expected[index].mesh);
            assert.equal(row.distance, expected[index].distance);
          });
          assert.ok(calls < sources.length / 10, 'far buildings must not execute radial distance calculations');
        } finally { Math.hypot = hypot; }
      }
    }
  }
});

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
  assert.match(material, /building-facade-local-layout-v11-filtered-openings/);
  assert.doesNotMatch(material, /new THREE\.TextureLoader\(\).*forEach/);
});

test('open-ocean and world-reset transitions include exterior details', async () => {
  const boat = await read('app/js/boat-mode.js');
  const reset = await read('app/js/world/load-reset.js');
  assert.match(boat, /buildingExteriorDetailMeshes/);
  assert.match(reset, /hideList\(appCtx\.buildingExteriorDetailMeshes\)/);
});
