import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

// Differential regression against the prior clipper. Preserve exact vertices,
// shared indices and unchanged storage while rejecting distant cuts cheaply.
const root = process.cwd();
const load = async name => {
  const source = (await readFile(new URL(name, import.meta.url), 'utf8'))
    .replaceAll("'./portal-spatial-grid.js'", JSON.stringify(pathToFileURL(path.join(root, 'app/js/terrain/portal-spatial-grid.js')).href))
    .replaceAll("'./structure-terrain-portals.js?v=2'", JSON.stringify(pathToFileURL(path.join(root, 'app/js/terrain/structure-terrain-portals.js')).href));
  return (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)).createPortalSurfaceClipper;
};
const reference = await load('./fixtures/portal-surface-clip-before.js');
const candidate = await load('../app/js/terrain/portal-surface-clip.js');
const base = {x: 0, z: 0, tangentX: 1, tangentZ: 0, roadY: 0, grade: 0, halfWidth: 2, halfDepth: 5, cutHeight: 10};

function compare(masks, positions, indices = null) {
  const input = positions.slice(), inputIndices = indices?.slice();
  const old = reference(masks)(positions, indices);
  const next = candidate(masks)(positions, indices);
  assert.deepEqual(next.positions, old.positions, 'Vertex order, values and winding stay exact');
  assert.deepEqual(next.indices, old.indices, 'Shared vertex indices stay exact');
  assert.equal(next.positions === positions, old.positions === positions, 'Unchanged inputs retain their original storage');
  assert.equal(next.indices === indices, old.indices === indices);
  assert.deepEqual(positions, input, 'Clipping must not mutate its input');
  if (indices) assert.deepEqual(indices, inputIndices);
}

test('fast rejection preserves the full clipping result across ordered, rotated and overlapping volumes', () => {
  let state = 0x5eaf55;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (let run = 0; run < 200; run++) {
    const masks = Array.from({length: run % 7}, () => {
      const angle = random() * Math.PI * 2;
      return {...base, x: random() * 70 - 35, z: random() * 70 - 35,
        tangentX: Math.cos(angle), tangentZ: Math.sin(angle),
        roadY: random() * 20 - 10, grade: random() - .5,
        halfWidth: random() * 10 + .5, halfDepth: random() * 30 + .5, cutHeight: random() * 15 + 1};
    });
    const positions = Float32Array.from({length: 90 * 3}, (_, i) => random() * (i % 3 === 1 ? 30 : 150) - (i % 3 === 1 ? 10 : 75));
    compare(masks, positions);
    const indices = Uint32Array.from({length: 90}, () => Math.floor(random() * 90));
    compare(masks, positions, indices);
    compare([...masks].reverse(), positions, indices);
  }
});

test('cut triangles followed by distant, degenerate and nonfinite triangles preserve prior semantics', () => {
  const triangles = [
    -10, 5, -10, -10, 5, 10, 10, 5, -10,
    100, 5, 100, 101, 5, 100, 100, 5, 101,
    100, 5, 100, 100, 5, 100, 100, 5, 100,
    200, NaN, 200, 201, 5, 200, 200, 5, 201,
    300, Infinity, 300, 301, 5, 300, 300, 5, 301,
    400, 5, 400, 401, 5, 400, 400, 5, 401
  ];
  for (const source of [triangles, [...triangles.slice(9), ...triangles.slice(0, 9)]]) {
    const positions = Float32Array.from(source);
    compare([base], positions);
    compare([base], positions, Uint32Array.from({length: source.length / 3}, (_, i) => i));
  }
});

test('coplanar floor, roof and side boundaries and remote geometry preserve exact storage', () => {
  for (const height of [-.02, 0, 10, 10.0001, -1]) {
    const positions = Float32Array.from([-10, height, -10, 10, height, -10, -10, height, 10, 10, height, 10]);
    compare([base], positions, Uint32Array.from([0, 2, 1, 1, 2, 3]));
    compare([{...base, x: 1000}], positions, Uint32Array.from([0, 2, 1, 1, 2, 3]));
  }
});
