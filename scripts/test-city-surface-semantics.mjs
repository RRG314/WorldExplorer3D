import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  terrainSurfaceMaterialSnapshot,
  waitForTerrainSurfaceMaterials
} from '../app/js/world/load-terrain-readiness.js';
import { landusePresentationOwner } from '../app/js/world/surface-contract.js';
import {
  TERRAIN_SURFACE_CLASS,
  terrainSurfaceClassForMappedMode,
  terrainSurfaceClassForWorldCover,
  terrainSurfaceMixForClass
} from '../app/js/terrain/surface-material-blend.js';
import {
  denseSettlementOwnsUrbanSurface,
  regionalBuildingTileOwnsUrbanSurface
} from '../app/js/surface-rules-local.js';

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8');

const baselineSource = read('app/js/terrain/worldcover-baseline.js');
const profileSource = read('app/js/terrain/surface-profiles.js');
const transportSource = read('app/js/terrain/rebuild.js');
const surfaceContractSource = read('app/js/world/surface-contract.js');
const terrainTileSource = read('app/js/terrain/tiles.js');
const materialBlendSource = read('app/js/terrain/surface-material-blend.js');
const mappedContextSource = read('app/js/terrain/far-field-mapped-context.js');
const biomeStateSource = read('app/js/terrain/worldcover-biome-state.js');

assert.equal(
  fs.existsSync(path.join(sourceRoot, 'app/js/terrain/sidewalk-batching.js')),
  false,
  'The disabled sidewalk geometry batcher must not ship.'
);
assert.equal(
  fs.existsSync(path.join(sourceRoot, 'app/js/terrain/sidewalk-helpers.js')),
  false,
  'The disabled sidewalk extrusion policy must not ship.'
);

assert.match(
  baselineSource,
  /surfaceMaterialClasses/,
  'WorldCover must retain spatial material classes instead of reducing a city to one location-wide texture.'
);
assert.match(
  baselineSource,
  /name: 'built'.*tint: \[0\.76, 0\.78, 0\.80\]/,
  'Built-up pixels need a neutral urban continuity tint instead of revealing grass between city buildings.'
);
assert.doesNotMatch(
  baselineSource,
  /new THREE\.CanvasTexture|putImageData\(/,
  'WorldCover classification must not upload an unused categorical GPU texture.'
);
assert.doesNotMatch(
  profileSource,
  /applyWorldCoverBuiltSurfaceMaterial|worldCoverBuiltBlend|surfaceBuiltWeight/,
  'A built-dominant classification must not turn the detailed terrain footprint into a gray city square.'
);
assert.match(profileSource, /applyWorldCoverSurfaceMaterialMix\(mesh, result\)/);
assert.match(biomeStateSource, /aggregated-worldcover-semantic-classes/);
assert.match(biomeStateSource, /worldCoverStats\.locationKey !== key/);
assert.match(profileSource, /applyTerrainSemanticMaterialBlend/);
const semanticTextureSetBody = profileSource.slice(
  profileSource.indexOf('function ensureTerrainSemanticTextureSets'),
  profileSource.indexOf('export function applyTerrainSemanticMaterialBlend')
);
assert.match(semanticTextureSetBody, /terrainTextureSource\('urban'\)/);
assert.doesNotMatch(
  semanticTextureSetBody,
  /ensureTerrainTextureSet\(/,
  'Semantic blend maps must be shared sources rather than six cloned PBR sets per terrain tile.'
);
assert.match(materialBlendSource, /terrain-semantic-pbr-material-mix-v4/);
assert.match(materialBlendSource, /terrainUrbanMap/);
assert.match(materialBlendSource, /terrainSandMap/);
assert.match(materialBlendSource, /terrainForestMap/);
assert.match(materialBlendSource, /terrainSoilMap/);
assert.match(materialBlendSource, /terrainRockMap/);
assert.match(materialBlendSource, /terrainAridWarmth/);
assert.match(
  materialBlendSource,
  /vec4 terrainForestColor = vec4/,
  'Semantic land classes need visible fallback colors when optional PBR maps are unavailable.'
);
assert.match(
  materialBlendSource,
  /terrainRockBand/,
  'Rock terrain needs elevation-driven geological variation rather than one flat slab color.'
);
assert.match(
  materialBlendSource,
  /slope-derived-exposed-rock/,
  'Steep terrain needs one global geomorphic rule for exposed rock.'
);
assert.doesNotMatch(
  materialBlendSource,
  /new THREE\.Mesh|new THREE\.PlaneGeometry/,
  'Semantic materials must blend inside the one terrain mesh, not create a second land renderer.'
);
assert.match(mappedContextSource, /mode: profile\.mode/);

assert.equal(terrainSurfaceClassForWorldCover('built', 39), TERRAIN_SURFACE_CLASS.urban);
assert.equal(terrainSurfaceClassForWorldCover('tree', 39), TERRAIN_SURFACE_CLASS.forest);
assert.equal(terrainSurfaceClassForWorldCover('crop', 39), TERRAIN_SURFACE_CLASS.soil);
assert.equal(terrainSurfaceClassForWorldCover('bare', 25), TERRAIN_SURFACE_CLASS.sand);
assert.equal(terrainSurfaceClassForWorldCover('bare', 44), TERRAIN_SURFACE_CLASS.rock);
assert.equal(terrainSurfaceClassForMappedMode('park'), TERRAIN_SURFACE_CLASS.grass);
assert.equal(terrainSurfaceClassForMappedMode('urban'), TERRAIN_SURFACE_CLASS.urban);
assert.equal(terrainSurfaceClassForMappedMode('sand'), TERRAIN_SURFACE_CLASS.sand);
assert.deepEqual(
  terrainSurfaceMixForClass(TERRAIN_SURFACE_CLASS.urban),
  { mixA: [1, 0, 0, 0], mixB: [0, 0] }
);
assert.equal(denseSettlementOwnsUrbanSurface({
  buildings: 603,
  roads: 228,
  greenLanduses: 0,
  urbanRatio: 0.4816,
  waterRatio: 0.08
}), true, 'Dense mapped city blocks must not fall back to grass during a WorldCover outage.');
assert.equal(denseSettlementOwnsUrbanSurface({
  buildings: 565,
  roads: 110,
  greenLanduses: 0,
  urbanRatio: 0.1772,
  waterRatio: 0
}), true, 'Strong regional building and road density must preserve urban continuity during a WorldCover outage.');
assert.equal(denseSettlementOwnsUrbanSurface({
  buildings: 40,
  roads: 12,
  greenLanduses: 0,
  urbanRatio: 0.1772,
  waterRatio: 0
}), false, 'Sparse settlements must not use the lower regional-density urban threshold.');
assert.equal(denseSettlementOwnsUrbanSurface({
  buildings: 565,
  roads: 110,
  greenLanduses: 0,
  urbanRatio: 0.049,
  waterRatio: 0
}), false, 'Regional density still requires sampled hardscape evidence.');
assert.equal(denseSettlementOwnsUrbanSurface({
  buildings: 603,
  roads: 228,
  greenLanduses: 1,
  urbanRatio: 0.4816,
  grassRatio: 0.7,
  waterRatio: 0.08
}), false, 'Mapped green landuse must override dense-settlement fallback when green coverage dominates.');
assert.equal(denseSettlementOwnsUrbanSurface({
  buildings: 395,
  roads: 84,
  greenLanduses: 1,
  urbanRatio: 0.434,
  grassRatio: 0.08,
  waterRatio: 0
}), true, 'A small mapped green area must not turn a strongly developed tile into grass.');
assert.equal(regionalBuildingTileOwnsUrbanSurface(24), true);
assert.equal(regionalBuildingTileOwnsUrbanSurface(23), false);
assert.match(profileSource, /applyTerrainProfileSurfaceMaterialMix\(mesh, nextMode\)/);
assert.match(mappedContextSource, /surfaceFallbackByTile/);
const builtProfileBody = profileSource.slice(
  profileSource.indexOf('} else if (nextMode === "built")'),
  profileSource.indexOf('} else if (nextMode === "urban")')
);
assert.match(
  builtProfileBody,
  /mat\.color\.setHex\(0xffffff\)/,
  'Developed fallback must use a neutral shader input when optional textures are unavailable.'
);
assert.doesNotMatch(builtProfileBody, /TERRAIN_GRASS_COLOR_HEX/);
assert.match(
  materialBlendSource,
  /surfaceClass === TERRAIN_SURFACE_CLASS\.urban && colors[\s\S]*colors\.setXYZ\(index, 1, 1, 1\)/,
  'Developed fallback must clear the stale green vertex tint before exact mapped land classes override it.'
);
assert.match(
  transportSource,
  /publishCompiledTransportMeshes/,
  'The compiled road publisher must remain present.'
);
assert.doesNotMatch(
  transportSource,
  /sidewalk-batching|shouldBuildSidewalks|getSharedUrbanSurfaceMaterials|buildSidewalkStripBatch|sidewalkBatchVerts|sidewalkBatchIdx/,
  'Disabled sidewalk extrusion must not be loaded, allocated, or evaluated during Earth publication.'
);
assert.equal(landusePresentationOwner('residential'), 'terrain_worldcover');
assert.equal(landusePresentationOwner('commercial'), 'terrain_worldcover');
assert.equal(landusePresentationOwner('industrial'), 'terrain_worldcover');
assert.equal(landusePresentationOwner('parking'), 'mapped_geometry');
assert.equal(landusePresentationOwner('paved'), 'mapped_geometry');
assert.equal(landusePresentationOwner('park'), 'terrain_worldcover');
assert.equal(landusePresentationOwner('grass'), 'terrain_worldcover');
assert.equal(landusePresentationOwner('water'), 'mapped_geometry');
assert.doesNotMatch(
  surfaceContractSource,
  /sidewalk|footpath/,
  'City-surface ownership must not reintroduce generated sidewalks or footpaths.'
);

const terrainBuilderSource = terrainTileSource.slice(
  terrainTileSource.indexOf('export function buildTerrainTileMesh'),
  terrainTileSource.indexOf('export function applyHeightsToTerrainMesh')
);
assert.doesNotMatch(
  terrainBuilderSource,
  /applyTerrainVisualProfile/,
  'Terrain must not queue WorldCover before accepted-ground validation; invalid edge tiles must perform no discarded surface request.'
);

let resolveSurface;
const surfacePromise = new Promise((resolve) => { resolveSurface = resolve; });
const coreMesh = {
  visible: true,
  position: { x: 100, z: 100 },
  userData: {
    isTerrainMesh: true,
    pendingTerrainTile: false,
    worldCoverStatus: 'loading',
    worldCoverPromise: surfacePromise
  }
};
const farMesh = {
  visible: true,
  position: { x: 5000, z: 5000 },
  userData: {
    isTerrainMesh: true,
    pendingTerrainTile: false,
    worldCoverStatus: 'loading',
    worldCoverPromise: new Promise(() => {})
  }
};
const terrainContext = { terrainGroup: { children: [coreMesh, farMesh] } };
assert.deepEqual(
  terrainSurfaceMaterialSnapshot(terrainContext, { radiusWorld: 1500 }),
  {
    ready: false,
    total: 1,
    pending: 1,
    statuses: { loading: 1 },
    radiusWorld: 1500
  }
);
setTimeout(() => {
  coreMesh.userData.worldCoverStatus = 'ready';
  coreMesh.userData.worldCoverPromise = null;
  resolveSurface();
}, 10);
const phaseEvents = [];
const settledSurface = await waitForTerrainSurfaceMaterials(
  terrainContext,
  (name) => phaseEvents.push(`start:${name}`),
  (name) => phaseEvents.push(`end:${name}`),
  { radiusWorld: 1500, timeoutMs: 200 }
);
assert.equal(settledSurface.ready, true);
assert.equal(settledSurface.pending, 0);
assert.equal(settledSurface.timedOut, false);
assert.deepEqual(phaseEvents, [
  'start:waitForTerrainSurfaceMaterials',
  'end:waitForTerrainSurfaceMaterials'
]);

console.log('City surface structural ownership contract passed.');
