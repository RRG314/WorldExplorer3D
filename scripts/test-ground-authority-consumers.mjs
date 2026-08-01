import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('app/js');
const allowedRawConsumers = new Set([
  'terrain.js',
  // The far-field clipmap is part of the explicitly authorized worldwide
  // Terrarium fallback and owns its lower-resolution horizon sampling.
  'terrain/far-field.js',
  'terrain/streaming.js',
  'terrain/tiles.js'
]);

async function javascriptFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await javascriptFiles(target));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(target);
  }
  return files;
}

const violations = [];
for (const file of await javascriptFiles(root)) {
  const relative = path.relative(root, file);
  if (allowedRawConsumers.has(relative)) continue;
  const source = await fs.readFile(file, 'utf8');
  if (
    /\bgetOrLoadTerrainTile\b|\bsampleTileElevationMeters\b/.test(source) ||
    /terrainTileCache[\s\S]{0,120}\.elev\b/.test(source)
  ) {
    violations.push(relative);
  }
}
assert.deepEqual(
  violations,
  [],
  `raw terrain tile consumers escaped the authority boundary: ${violations}`
);

const terrainModule = await fs.readFile(
  path.join(root, 'terrain.js'),
  'utf8'
);
assert.doesNotMatch(
  terrainModule,
  /Object\.assign\(appCtx,[\s\S]*?\bgetOrLoadTerrainTile\b/
);
assert.doesNotMatch(
  terrainModule,
  /Object\.assign\(appCtx,[\s\S]*?\bsampleTileElevationMeters\b/
);

const tilesModule = await fs.readFile(
  path.join(root, 'terrain/tiles.js'),
  'utf8'
);
const unavailableSampler = tilesModule.match(
  /export function sampleTileElevationMeters[\s\S]*?\n}/
)?.[0] || '';
assert.match(unavailableSampler, /return null/);
assert.doesNotMatch(unavailableSampler, /return 0/);
assert.doesNotMatch(tilesModule, /applyFlatFallbackToTerrainMesh/);

console.log(JSON.stringify({
  ok: true,
  contract: 'ground-authority-consumers',
  rawTileConsumerCount: allowedRawConsumers.size,
  rawTileRuntimeSurfacePrivate: true,
  zeroAsMissingRejected: true,
  flatTerrainFallbackRemoved: true
}, null, 2));
