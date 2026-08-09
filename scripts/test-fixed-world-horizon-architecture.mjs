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
const starMaterialSource = read('app/js/sky/star-point-material.js');
const starFieldSource = read('app/js/sky/starfield-ui.js');
const gaiaSource = read('app/js/sky/gaia-catalog.js');
const {
  FAR_FIELD_OUTER_DISTANCE_METERS,
  FAR_CONTEXT_HALF_EXTENT_METERS,
  FAR_FIELD_SOURCE_ZOOM_OFFSET,
  FAR_CONTEXT_MAX_BUILDINGS,
  FAR_CONTEXT_ZOOM,
  FAR_WATER_CONTEXT_ZOOM,
  FAR_WATER_MIN_SPAN_METERS,
  buildClipmapAxis,
  cellInsideDetailedCoverage,
  cellInsideHole
} = await import('../app/js/terrain/far-field.js');
const { pointInLonLatRing } = await import('../app/js/terrain/far-field-mapped-context.js');

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
assert.equal(fs.existsSync(path.join(root, 'app/js/terrain/far-field.js')), true);
assert.match(terrainRuntimeSource, /createFarFieldTerrainApi|far-field\.js|updateFarTerrainClipmap/);
assert.match(locationTerrainSource, /updateFarTerrainClipmap/);
assert.equal(FAR_FIELD_SOURCE_ZOOM_OFFSET, 3);
assert.equal(FAR_FIELD_OUTER_DISTANCE_METERS, 22000);
assert.equal(FAR_CONTEXT_HALF_EXTENT_METERS, 6500);
assert.equal(FAR_CONTEXT_ZOOM, 14);
assert.equal(FAR_WATER_CONTEXT_ZOOM, 11);
assert.equal(FAR_WATER_MIN_SPAN_METERS, 200);
assert.equal(FAR_CONTEXT_MAX_BUILDINGS, 10000);
const axis = buildClipmapAxis(-100, -20, 30, 100, 15);
assert.equal(axis[0], -100);
assert.equal(axis.at(-1), 100);
assert.ok(axis.includes(-20) && axis.includes(30), 'far terrain must meet both exact near-grid seams');
assert.ok(axis.every((value, index) => index === 0 || value > axis[index - 1]));
assert.equal(cellInsideHole(0, 0, { minX: -20, maxX: 30, minZ: -10, maxZ: 10 }), true);
assert.equal(cellInsideDetailedCoverage(0, 0, [{ minX: -20, maxX: 30, minZ: -10, maxZ: 10 }]), true);
assert.doesNotMatch(
  farFieldSource,
  /if \(cellInsideHole\(centerX, centerZ, spec\.inner\)\) continue/,
  'far terrain must remain continuous below unavailable detailed edge tiles'
);
assert.match(farFieldSource, /cellInsideDetailedCoverage\(centerX, centerZ, spec\.detailedCoverage\)/);
assert.match(farFieldSource, /completeDetailedTileCoverage/);
assert.match(starMaterialSource, /skyBackgroundMaterial/);
assert.match(starMaterialSource, /material\.depthTest = false/);
assert.match(starMaterialSource, /material\.transparent = false/);
assert.match(starFieldSource, /skyBackground:\s*true/);
assert.match(starFieldSource, /renderOrder = -1000/);
assert.match(gaiaSource, /skyBackground:\s*true/);
assert.match(gaiaSource, /renderOrder = -1000/);
assert.match(farFieldSource, /FarMappedBuildingContext/);
assert.match(farFieldSource, /waitForFarTerrainClipmap/);
assert.match(farFieldSource, /contextGeographic/);
assert.doesNotMatch(farFieldSource, /actorX|actorZ/);
assert.match(farFieldSource, /mapped-land-with-elevation-fallback/);
assert.match(farFieldSource, /openstreetmap-shortbread/);
assert.match(farFieldSource, /camera\?\.far \|\| 0\) \* 1\.6/);
assert.doesNotMatch(farFieldSource, /sourceMeters\s*<=\s*0\.75/);
assert.doesNotMatch(farFieldSource, /surfaceColor:\s*'mapped-land-and-water/);
assert.match(farFieldSource, /FarMappedWaterContext/);
assert.match(farFieldSource, /isFarMappedWaterContext/);
assert.match(farFieldSource, /far-mapped-water-polygon-lod/);

const mappedWaterFixture = {
  outer: [[-76.8, 39.1], [-76.4, 39.1], [-76.4, 39.5], [-76.8, 39.5], [-76.8, 39.1]],
  holes: [[[-76.65, 39.25], [-76.55, 39.25], [-76.55, 39.35], [-76.65, 39.35], [-76.65, 39.25]]],
  bounds: { minLat: 39.1, maxLat: 39.5, minLon: -76.8, maxLon: -76.4 },
  kind: 'water'
};
assert.equal(pointInLonLatRing(-76.7, 39.2, mappedWaterFixture.outer), true, 'mapped water must retain its polygon boundary');
assert.equal(pointInLonLatRing(-76.6, 39.3, mappedWaterFixture.holes[0]), true, 'mapped islands must retain their water holes');
assert.equal(pointInLonLatRing(-76.6, 39.6, mappedWaterFixture.outer), false, 'unmapped space must never become water');
assert.match(diagnosticsSource, /farTerrainClipmap/);
assert.match(diagnosticsSource, /farMappedContexts/);

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
  addEarthWorldObject(object) {
    scene.add(object);
  },
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
  contract: 'fixed-world-horizon-architecture',
  terrainZoom: 15,
  terrainMaterialAuthority: 'mode-independent',
  regionalMapPlane: 'deleted',
  fogPolicy: 'mode-independent',
  nearTerrainAuthority: 'uniform-z15-grid',
  farTerrainAuthority: 'fixed-location-clipmap',
  farWaterOwner: 'exact-mapped-water-polygon-lod'
}, null, 2));
