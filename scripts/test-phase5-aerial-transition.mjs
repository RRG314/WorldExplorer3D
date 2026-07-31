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
const streamingSource = read('app/js/terrain/streaming.js');
const farFieldSource = read('app/js/terrain/far-field.js');
const {
  FAR_FIELD_OUTER_DISTANCE_METERS,
  FAR_FIELD_SOURCE_ZOOM_OFFSET,
  FAR_CONTEXT_MAX_BUILDINGS,
  FAR_CONTEXT_ZOOM,
  buildClipmapAxis,
  cellInsideHole
} = await import('../app/js/terrain/far-field.js');

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
assert.match(streamingSource, /for \(let dx = -activeRing; dx <= activeRing; dx\+\+\)/);
assert.match(streamingSource, /z: appCtx\.TERRAIN_ZOOM/);
assert.doesNotMatch(streamingSource, /childTiles|terrainLeafPlan|terrainSegmentsForZoom/);
assert.equal(FAR_FIELD_SOURCE_ZOOM_OFFSET, 3);
assert.equal(FAR_FIELD_OUTER_DISTANCE_METERS, 15000);
assert.equal(FAR_CONTEXT_ZOOM, 13);
assert.equal(FAR_CONTEXT_MAX_BUILDINGS, 10000);
const axis = buildClipmapAxis(-100, -20, 30, 100, 15);
assert.equal(axis[0], -100);
assert.equal(axis.at(-1), 100);
assert.ok(axis.includes(-20), 'clipmap axis must include the exact near-grid west seam');
assert.ok(axis.includes(30), 'clipmap axis must include the exact near-grid east seam');
assert.ok(axis.every((value, index) => index === 0 || value > axis[index - 1]), 'clipmap axis must be strictly increasing');
assert.equal(cellInsideHole(0, 0, { minX: -20, maxX: 30, minZ: -10, maxZ: 10 }), true);
assert.equal(cellInsideHole(31, 0, { minX: -20, maxX: 30, minZ: -10, maxZ: 10 }), false);
assert.match(farFieldSource, /Mapzen Terrarium elevation-derived landscape/);
assert.match(farFieldSource, /mapped-landuse-with-elevation-fallback/);
assert.match(farFieldSource, /openstreetmap-shortbread/);
assert.match(farFieldSource, /isFarMappedContext/);
assert.doesNotMatch(farFieldSource, /loadWorldCoverBaseline/);
assert.match(farFieldSource, /const isWater = sourceMeters <= 0\.75/);
assert.match(farFieldSource, /if \(isWater\) meters = 0/);
assert.match(farFieldSource, /isFarTerrainClipmap/);
assert.match(diagnosticsSource, /farTerrainClipmap/);
assert.match(diagnosticsSource, /farMappedContexts/);

console.log(JSON.stringify({
  ok: true,
  terrainZoom: 15,
  terrainMaterials: 'mode-independent',
  regionalMapPlane: 'deleted',
  fogPolicy: 'mode-independent',
  nearTerrain: 'unchanged-uniform-z15-grid',
  farTerrain: 'continuous-elevation-clipmap'
}, null, 2));
