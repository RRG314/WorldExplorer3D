import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createCellCoverage } from '../../app/js/world/cell-coverage.js';

const file = 'docs/streets/audit-2026-09-13/baltimore-geometric-corners-layout.json';
const bytes = await readFile(file);
const { roads } = JSON.parse(bytes);
const stamps = [];
for (const road of roads) {
  const halfWidth = Number.isFinite(road.width) ? road.width * .5 : 4;
  const radius = Math.ceil((Math.max(1.6, halfWidth + 2.4) + .25) / 4);
  const stamp = (x, z) => stamps.push([Math.floor(x / 4), Math.floor(z / 4), radius]);
  for (let i = 0; i < road.pts.length; i++) {
    const a = road.pts[i], b = road.pts[i + 1];
    stamp(a.x, a.z);
    if (!b) continue;
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 3));
    for (let j = 0; j <= steps; j++) stamp(a.x + (b.x - a.x) * j / steps, a.z + (b.z - a.z) * j / steps);
  }
}
const buildReference = () => {
  const cells = new Set();
  for (const [x, z, radius] of stamps) for (let dx = -radius; dx <= radius; dx++)
    for (let dz = -radius; dz <= radius; dz++) cells.add(`${x + dx},${z + dz}`);
  return cells;
};
const buildCompressed = () => {
  const cells = createCellCoverage();
  for (const stamp of stamps) cells.addSquare(...stamp);
  return cells;
};
const times = { explicitCellsMs: [], compressedRowsMs: [] };
let stats;
for (let trial = 0; trial < 4; trial++) {
  let reference, compressed;
  for (const mode of trial % 2 ? ['compressed', 'reference'] : ['reference', 'compressed']) {
    const start = performance.now();
    if (mode === 'reference') {
      reference = buildReference();
      if (trial) times.explicitCellsMs.push(performance.now() - start);
    } else {
      compressed = buildCompressed();
      if (trial) times.compressedRowsMs.push(performance.now() - start);
    }
  }
  stats = compressed.stats();
  assert.equal(stats.coveredCells, reference.size);
  for (const cell of reference) {
    const [x, z] = cell.split(',').map(Number);
    assert.equal(compressed.has(x, z), true, cell);
  }
}
const median = values => values.slice().sort((a, b) => a - b)[1];
console.log(JSON.stringify({
  ok: true, scope: 'Exact corridor-cell construction for one saved Baltimore resident layout, not whole-world startup',
  file, sha256: createHash('sha256').update(bytes).digest('hex'), roads: roads.length,
  stamps: stamps.length, stats, samples: times,
  medianMs: { explicitCells: median(times.explicitCellsMs), compressedRows: median(times.compressedRowsMs) }
}, null, 2));
