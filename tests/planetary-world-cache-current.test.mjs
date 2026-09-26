import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createOwnedPlanetaryWorldCache } from '../app/js/planetary/owned-world-cache.js';
import { createPlanetarySurfaceAuthority, listPlanetarySurfaceRegions } from '../app/js/planetary/runtime/surface-authority.js';

test('visiting additional planets releases old scene resources and authoritative cache references', async () => {
  const authority = createPlanetarySurfaceAuthority();
  const scene = new THREE.Scene();
  const cache = createOwnedPlanetaryWorldCache({ releasePublication: id => authority.release(id) });
  const regions = listPlanetarySurfaceRegions().slice(0, 3);
  const disposals = [];
  const worlds = [];
  for (const region of regions) {
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map: texture, bumpMap: texture });
    const geometry = new THREE.PlaneGeometry(2, 2);
    const disposed = { geometry: 0, material: 0, texture: 0 };
    for (const [key, resource] of Object.entries({ geometry, material, texture })) resource.addEventListener('dispose', () => disposed[key]++);
    disposals.push(disposed);
    const surface = new THREE.Mesh(geometry, material);
    const detail = new THREE.Mesh(geometry, material);
    const world = { pack: { manifest: region }, surface, objects: [detail] };
    worlds.push(world); scene.add(surface, detail);
    await authority.prepare(region.regionId, async () => ({ sampleHeight: () => 7, renderArtifact: surface, readyAssetIds: region.assets.map(asset => asset.id) }));
    cache.set(region.bodyId, world);
  }
  assert.equal(cache.snapshot().size, 2);
  assert.equal(worlds[0].surface.parent, null);
  assert.equal(worlds[0].objects[0].parent, null);
  assert.deepEqual(disposals[0], { geometry: 1, material: 1, texture: 1 }, 'shared references within one world are disposed exactly once');
  assert.deepEqual(disposals.slice(1), [{ geometry: 0, material: 0, texture: 0 }, { geometry: 0, material: 0, texture: 0 }]);
  assert.equal(authority.activate(regions[0].regionId).reason, 'surface-region-not-loaded');
  assert.equal(authority.snapshot().active.bodyId, regions[2].bodyId);
  assert.equal(authority.rollback().active.bodyId, regions[1].bodyId, 'the recent return world remains usable');
  assert.equal(authority.sampleAtLocalXZ(0, 0).local.y, 7);
  assert.throws(() => authority.release(regions[1].regionId), /active planetary surface/);
});

test('returning to a cached world refreshes retention order without disposing it', () => {
  const removed = [];
  const cache = createOwnedPlanetaryWorldCache({ releasePublication: id => removed.push(id) });
  const world = id => ({ pack: { manifest: { regionId: id } }, objects: [] });
  const a = world('a'), b = world('b'), c = world('c');
  cache.set('a', a); cache.set('b', b);
  assert.equal(cache.get('a'), a);
  cache.set('c', c);
  assert.deepEqual(removed, ['b']);
  assert.deepEqual(cache.snapshot().bodyIds, ['a', 'c']);
  assert.equal(cache.get('a'), a);
});
