import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

assert.equal(
  fs.existsSync(path.join(root, 'app/js/world/aerial-surface-context.js')),
  false,
  'a regional aerial map plane must not exist'
);

const configSource = read('app/js/config.js');
const terrainSource = read('app/js/terrain/surface-profiles.js');
const terrainRuntimeSource = read('app/js/terrain.js');
const lodSource = read('app/js/world/lod.js');
const diagnosticsSource = read('app/js/runtime-diagnostics.js');

assert.match(configSource, /const TERRAIN_ZOOM = 15;/, 'near terrain resolution must remain at zoom 15');
assert.doesNotMatch(
  terrainSource,
  /terrainAerialDetailSuppressed|terrainSurfaceDetailState|updateTerrainAerialDetail/,
  'terrain materials must not change at an aerial altitude threshold'
);
assert.doesNotMatch(
  terrainRuntimeSource,
  /updateTerrainAerialDetail/,
  'terrain runtime must expose only one mode-independent material pipeline'
);
assert.doesNotMatch(
  lodSource,
  /aerial-surface-context|syncAerialSurfaceContext|aerialSurfaceContextState/,
  'LOD must not publish or reveal a replacement aerial surface'
);
assert.doesNotMatch(
  lodSource,
  /scene\.fog\s*=\s*null|syncAerialFog|savedGroundFog/,
  'travel-mode changes must not replace the Earth fog model'
);
assert.match(diagnosticsSource, /aerialReplacementMeshes/);
assert.match(diagnosticsSource, /suppressedTerrainMeshes/);

console.log(JSON.stringify({
  ok: true,
  terrainZoom: 15,
  terrainMaterials: 'mode-independent',
  regionalMapPlane: 'deleted',
  fogPolicy: 'mode-independent'
}, null, 2));
