import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ctx} from '../app/js/shared-context.js?v=55';
import {batchMidLodBuildingMeshes} from '../app/js/world/building-batching.js';
import {markPrivateBuildingGeometry, releaseRetiredBuildingCpuBuffers, createBuildingConstructionArena, allocatePrivateBuildingStorage, finishPrivateBuildingStorage} from '../app/js/world/retired-building-buffers.js';
import {createBuildingBodyGeometry} from '../app/js/world/building-body-geometry.js';
import {attachBuildingFacadeLayout} from '../app/js/world/building-facade-layout.js';

test('construction pages preserve neighbors, clones and final batches until the last private owner retires', async () => {
  const arena=createBuildingConstructionArena();
  const material=new THREE.MeshStandardMaterial();material.userData.buildingExterior=true;material.userData.sharedRuntimeMaterial=true;
  const footprint=[{x:0,z:0},{x:7,z:0},{x:7,z:5},{x:0,z:5}];
  const bytes=g=>Object.fromEntries(Object.entries(g.attributes).map(([k,a])=>[k,Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength).toString('hex')]));
  const sources=Array.from({length:3},(_,i)=>{
    const geometry=createBuildingBodyGeometry(THREE,footprint,10+i,arena);
    attachBuildingFacadeLayout(geometry,{levels:3});
    const reference=createBuildingBodyGeometry(THREE,footprint,10+i);
    attachBuildingFacadeLayout(reference,{levels:3});assert.deepEqual(bytes(geometry),bytes(reference));
    reference.dispose();releaseRetiredBuildingCpuBuffers(reference);
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(i===2?4000:20+i*13,0,20);
    mesh.userData={lodTier:'mid',sourceBuildingId:`page-${i}`};return mesh;
  });
  const shared=sources[0].geometry.attributes.position.array.buffer;
  assert.ok(sources.every(m=>m.geometry.attributes.position.array.buffer===shared));
  const singletonBefore=bytes(sources[2].geometry),clone=sources[0].geometry.clone(),cloneBefore=bytes(clone);
  arena.close();arena.close();assert.equal(arena.snapshot().buffers,1);
  ctx.buildingMeshes=sources.slice();ctx.addEarthWorldObject=()=>{};ctx.replaceWorldCollection=(name,rows)=>{ctx[name]=rows;};
  let merged;
  try{
    assert.equal(await batchMidLodBuildingMeshes({yieldToMainThread:async()=>{}}),2);
    merged=ctx.buildingMeshes.find(m=>m.userData.isBuildingBatch);assert.ok(merged);
    const finalBefore=bytes(merged.geometry);
    assert.equal(shared.byteLength,64*1024,'Retained singleton keeps its own source page alive');
    assert.deepEqual(bytes(sources[2].geometry),singletonBefore);
    assert.equal(releaseRetiredBuildingCpuBuffers(sources[0].geometry),0,'Retirement is idempotent');
    assert.equal(finishPrivateBuildingStorage(sources[2].geometry),true);
    assert.equal(finishPrivateBuildingStorage(sources[2].geometry),false);
    assert.deepEqual(bytes(sources[2].geometry),singletonBefore);
    assert.ok(sources[2].geometry.attributes.position.array.buffer.byteLength<64*1024);
    assert.equal(shared.byteLength,0);assert.deepEqual(bytes(clone),cloneBefore);assert.deepEqual(bytes(merged.geometry),finalBefore);
  }finally{
    for(const mesh of [...sources,...(merged?[merged]:[])])mesh.geometry.dispose();clone.dispose();material.dispose();merged?.material.dispose();
    for(const key of ['buildingMeshes','addEarthWorldObject','replaceWorldCollection','_lastBuildingBatchStats'])delete ctx[key];
  }
});

test('construction storage bounds retained pages and permits later independent attribute edits', () => {
  const arena=createBuildingConstructionArena(128);
  const first=markPrivateBuildingGeometry(new THREE.BufferGeometry(),arena);
  const a=allocatePrivateBuildingStorage(first,80);first.setAttribute('position',new THREE.BufferAttribute(new Float32Array(a.buffer,a.byteOffset,20),1));
  first.attributes.position.array.fill(7);
  const second=markPrivateBuildingGeometry(new THREE.BufferGeometry(),arena);
  const b=allocatePrivateBuildingStorage(second,320);second.setAttribute('position',new THREE.BufferAttribute(new Float32Array(b.buffer,b.byteOffset,80),1));
  assert.notEqual(a.buffer,b.buffer);assert.equal(b.buffer.byteLength,320);
  assert.equal(releaseRetiredBuildingCpuBuffers(first),128);assert.equal(b.buffer.byteLength,320);
  arena.close();
  const later=allocatePrivateBuildingStorage(second,16);assert.notEqual(later.buffer,b.buffer);assert.equal(later.buffer.byteLength,16);
  second.setAttribute('updated',new THREE.BufferAttribute(new Float32Array(later.buffer),1));
  assert.equal(releaseRetiredBuildingCpuBuffers(second),336);assert.equal(b.buffer.byteLength,0);
  first.dispose();second.dispose();
});
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
