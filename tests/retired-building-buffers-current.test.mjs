import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ctx} from '../app/js/shared-context.js?v=55';
import {batchMidLodBuildingMeshes} from '../app/js/world/building-batching.js';
import {markPrivateBuildingGeometry, releaseRetiredBuildingCpuBuffers} from '../app/js/world/retired-building-buffers.js';
globalThis.THREE = THREE;

test('unmarked geometry remains reusable; private backing stores release exactly once', () => {
  const geometry = new THREE.BoxGeometry(2, 3, 4);
  const position = geometry.attributes.position.array;
  assert.equal(releaseRetiredBuildingCpuBuffers(geometry), 0);
  assert.ok(position.byteLength > 0);
  // Two attributes can alias the same private buffer; release/count it once.
  geometry.setAttribute('duplicate', geometry.attributes.position);
  const buffers = new Set([...Object.values(geometry.attributes).map(a => a.array.buffer), geometry.index.array.buffer]);
  const expected = [...buffers].reduce((sum, b) => sum + b.byteLength, 0);
  markPrivateBuildingGeometry(geometry);
  geometry.dispose();
  assert.equal(releaseRetiredBuildingCpuBuffers(geometry), expected);
  assert.ok([...buffers].every(b => b.byteLength === 0));
  assert.equal(releaseRetiredBuildingCpuBuffers(geometry), 0);
});

test('unsupported transfer retains normal buffer lifetime', () => {
  const geometry = new THREE.BufferGeometry();
  const array = new Float32Array([1, 2, 3]);
  Object.defineProperty(array.buffer, 'transfer', {value: undefined});
  geometry.setAttribute('position', new THREE.BufferAttribute(array, 3));
  markPrivateBuildingGeometry(geometry);
  geometry.dispose();
  assert.equal(releaseRetiredBuildingCpuBuffers(geometry), 0);
  assert.deepEqual([...array], [1, 2, 3]);
});

test('actual building batching preserves final attribute bytes and edit boundaries after source release', async () => {
  async function run(privateSources) {
    const material = new THREE.MeshStandardMaterial({color: 0x847f63});
    material.userData.buildingExterior = true;
    material.userData.sharedRuntimeMaterial = true;
    const sources = [0, 1].map(i => {
      const g = new THREE.BoxGeometry(7.3, 11.7, 4.1).toNonIndexed();
      for (const name of ['facadeLayout', 'facadeOpening', 'facadeEntrance']) {
        g.setAttribute(name, new THREE.Float32BufferAttribute(Array.from({length: g.attributes.position.count * 4}, (_, j) => Math.sin(j * .37)), 4));
      }
      if (privateSources) markPrivateBuildingGeometry(g);
      const mesh = new THREE.Mesh(g, material);
      mesh.position.set(20 + i * 13, 3, 20);
      mesh.userData = {lodTier: 'mid', sourceBuildingId: `building-${i}`};
      return mesh;
    });
    // A private singleton is retained, so its buffers must not be released.
    const retained = new THREE.Mesh(markPrivateBuildingGeometry(new THREE.BoxGeometry(2, 3, 4)), material);
    retained.position.set(4000, 0, 4000);
    retained.userData.lodTier = 'mid';
    ctx.buildingMeshes = [...sources, retained];
    ctx.addEarthWorldObject = () => {};
    ctx.replaceWorldCollection = (name, meshes) => {ctx[name] = meshes;};
    assert.equal(await batchMidLodBuildingMeshes({yieldToMainThread: async () => {}}), 2);
    const merged = ctx.buildingMeshes.find(m => m.userData.isBuildingBatch);
    assert.ok(merged);
    const bytes = a => Array.from(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
    const result = {
      attributes: Object.fromEntries(Object.entries(merged.geometry.attributes).map(([name, a]) => [name, bytes(a.array)])),
      indices: bytes(merged.geometry.index.array),
      ranges: merged.userData.editableBuildingIndexRanges
    };
    for (const source of sources) assert.equal(source.geometry.attributes.position.array.byteLength === 0, privateSources);
    assert.ok(retained.geometry.attributes.position.array.byteLength > 0);
    assert.equal(releaseRetiredBuildingCpuBuffers(merged.geometry), 0);
    assert.equal(ctx._lastBuildingBatchStats.releasedCpuBytes > 0, privateSources);
    const [first, second] = result.ranges;
    const indices = merged.geometry.index.array;
    const firstVertices = new Set(indices.slice(first.start, first.start + first.count));
    assert.ok([...indices.slice(second.start, second.start + second.count)].every(i => !firstVertices.has(i)));
    for (const mesh of [...sources, retained, merged]) mesh.geometry.dispose();
    merged.material.dispose();
    material.dispose();
    return result;
  }
  try {assert.deepEqual(await run(true), await run(false));}
  finally {for (const key of ['buildingMeshes', 'addEarthWorldObject', 'replaceWorldCollection', '_lastBuildingBatchStats']) delete ctx[key];}
});
