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
const publicationSource = read('app/js/world/publication.js');
const diagnosticsSource = read('app/js/runtime-diagnostics.js');
const locationTerrainSource = read('app/js/terrain/location-world.js');
const farFieldSource = read('app/js/terrain/far-field.js');
const hudSource = read('app/js/hud.js');
const {
  FAR_FIELD_OUTER_DISTANCE_METERS,
  FAR_FIELD_SOURCE_ZOOM_OFFSET,
  FAR_CONTEXT_MAX_BUILDINGS,
  FAR_CONTEXT_ZOOM,
  buildClipmapAxis,
  cellInsideHole,
  mappedWaterKindAt
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
  publicationSource,
  /aerial-surface-context|syncAerialSurfaceContext|aerialSurfaceContextState/,
  'LOD must not publish or reveal a replacement aerial surface'
);
assert.doesNotMatch(
  publicationSource,
  /scene\.fog\s*=\s*null|syncAerialFog|savedGroundFog/,
  'travel-mode changes must not replace the Earth fog model'
);
assert.doesNotMatch(publicationSource, /planeMode|droneMode|boatMode|walker|lodReferenceActor/, 'fixed world publication must not depend on traversal mode or actor');
assert.match(publicationSource, /mesh\.userData\?\.alwaysVisible \|\| appCtx\.landUseVisible === true/, 'persistent mapped land-use and water must remain in the fixed world');
assert.match(diagnosticsSource, /aerialReplacementMeshes/);
assert.match(diagnosticsSource, /suppressedTerrainMeshes/);
assert.match(locationTerrainSource, /for \(let dx = -activeRing; dx <= activeRing; dx \+= 1\)/);
assert.match(locationTerrainSource, /z: appCtx\.TERRAIN_ZOOM/);
assert.doesNotMatch(locationTerrainSource, /actor|speed|childTiles|terrainLeafPlan|terrainSegmentsForZoom/);
assert.equal(FAR_FIELD_SOURCE_ZOOM_OFFSET, 3);
assert.equal(FAR_FIELD_OUTER_DISTANCE_METERS, 22000);
assert.match(farFieldSource, /camera\?\.far \|\| 0\) \* 1\.6/);
assert.match(hudSource, /const earthCelestialDistance = 11000/);
assert.doesNotMatch(
  hudSource,
  /cameraX \+ dirX \* 1400, cameraY \+ dirY \* 1400, cameraZ \+ dirZ \* 1400/,
  'Earth sun or moon remained in front of the distant terrain field'
);
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
assert.match(farFieldSource, /mapped-land-and-water-with-elevation-fallback/);
assert.match(farFieldSource, /openstreetmap-shortbread/);
assert.match(farFieldSource, /isFarMappedContext/);
assert.doesNotMatch(farFieldSource, /loadWorldCoverBaseline/);
assert.doesNotMatch(farFieldSource, /sourceMeters\s*<=\s*0\.75/);
assert.match(farFieldSource, /mappedWaterKindAt\(lat, lon, mappedContext\)/);
assert.match(farFieldSource, /if \(waterKind === 'ocean'\) meters = 0/);
assert.match(farFieldSource, /\['ocean', 'water_polygons'\]/);
assert.match(farFieldSource, /isFarTerrainClipmap/);
assert.doesNotMatch(
  farFieldSource,
  /buildGeometry\(spec, loadedTiles, offsetMeters, null\)/,
  'Far terrain must not build a temporary unclassified mesh that is immediately discarded.'
);
assert.equal(
  (farFieldSource.match(/const built = buildGeometry\(spec, loadedTiles, offsetMeters, mappedContext\)/g) || []).length,
  1,
  'Far terrain must have exactly one mapped geometry build pass.'
);
assert.match(farFieldSource, /loadFarMappedContext\(spec\.geographic, spec\.innerGeographic\)/);
assert.match(farFieldSource, /skippedDuplicateNearBuildings/);
assert.match(farFieldSource, /geometryBuildPasses:\s*1/);
assert.match(diagnosticsSource, /farTerrainClipmap/);
assert.match(diagnosticsSource, /farMappedContexts/);

const tileFor = (latitude, longitude) => {
  const n = 2 ** FAR_CONTEXT_ZOOM;
  return `${Math.floor((longitude + 180) / 360 * n)}/${Math.floor((1 - Math.log(
    Math.tan(latitude * Math.PI / 180) + 1 / Math.cos(latitude * Math.PI / 180)
  ) / Math.PI) / 2 * n)}`;
};
const baltimoreTile = tileFor(39.28, -76.64);
const mappedWaterContext = {
  waterByTile: new Map([[baltimoreTile, [{
    outer: [[-76.65, 39.27], [-76.56, 39.27], [-76.56, 39.33], [-76.65, 39.33], [-76.65, 39.27]],
    holes: [[[-76.62, 39.29], [-76.60, 39.29], [-76.60, 39.31], [-76.62, 39.31], [-76.62, 39.29]]],
    bounds: { minLat: 39.27, maxLat: 39.33, minLon: -76.65, maxLon: -76.56 },
    kind: 'inland'
  }]]])
};
assert.equal(mappedWaterKindAt(39.28, -76.64, mappedWaterContext), 'inland');
assert.equal(mappedWaterKindAt(39.30, -76.61, mappedWaterContext), null, 'mapped island hole must remain land');
assert.equal(mappedWaterKindAt(39.30, -76.50, mappedWaterContext), null, 'unmapped low land must never become water');

const { ctx } = await import('../app/js/shared-context.js?v=55');
const { publishLocationWorld } = await import('../app/js/world/publication.js?v=1');
const scene = {
  add(mesh) {
    mesh.parent = this;
    mesh.visible = true;
  },
  remove(mesh) {
    if (mesh.parent === this) mesh.parent = null;
  }
};
const building = {
  visible: true,
  parent: scene,
  userData: { lodCenter: { x: 20, z: 20 }, lodTier: 'near' }
};
const persistentGrass = {
  visible: false,
  parent: null,
  userData: { alwaysVisible: true, landuseType: 'grass' }
};
const persistentWater = {
  visible: false,
  parent: null,
  userData: { alwaysVisible: true, landuseType: 'water' }
};
Object.assign(ctx, {
  scene,
  onMoon: false,
  travelingToMoon: false,
  isEnv: null,
  ENV: null,
  planeMode: { active: false },
  droneMode: false,
  car: { x: 0, z: 0 },
  drone: { x: 0, z: 0 },
  boatMode: { active: false },
  roadMeshes: [],
  urbanSurfaceMeshes: [],
  buildingMeshes: [building],
  landuseMeshes: [persistentGrass, persistentWater],
  poiMeshes: [],
  streetFurnitureMeshes: [],
  linearFeatureMeshes: [],
  landUseVisible: true,
  poiMode: false,
  renderQualityLevel: 'med',
  camMode: 0,
  setPerfLiveStat: () => {}
});
publishLocationWorld();
assert.equal(persistentGrass.parent, scene, 'fixed publication must restore persistent mapped grass');
assert.equal(persistentWater.parent, scene, 'fixed publication must restore persistent mapped water');
ctx.droneMode = true;
persistentGrass.visible = false;
persistentGrass.parent = null;
persistentWater.visible = false;
persistentWater.parent = null;
publishLocationWorld();
assert.equal(persistentGrass.parent, scene, 'drone mode must not change persistent mapped grass');
assert.equal(persistentWater.parent, scene, 'drone mode must not change persistent mapped water');

console.log(JSON.stringify({
  ok: true,
  terrainZoom: 15,
  terrainMaterials: 'mode-independent',
  regionalMapPlane: 'deleted',
  fogPolicy: 'mode-independent',
  nearTerrain: 'unchanged-uniform-z15-grid',
  farTerrain: 'fixed-location-elevation-horizon'
}, null, 2));
