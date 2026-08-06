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
const hudSource = read('app/js/hud.js');

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
assert.equal(
  fs.existsSync(path.join(root, 'app/js/terrain/far-field.js')),
  false,
  'The post-v4.1.1 square far-field clipmap owner must be removed, not hidden or recolored.'
);
assert.doesNotMatch(terrainRuntimeSource, /createFarFieldTerrainApi|far-field\.js|updateFarTerrainClipmap/);
assert.doesNotMatch(locationTerrainSource, /FarTerrain|farTerrain|updateFarTerrainClipmap/);
assert.match(hudSource, /const earthCelestialDistance = 11000/);
assert.doesNotMatch(
  hudSource,
  /cameraX \+ dirX \* 1400, cameraY \+ dirY \* 1400, cameraZ \+ dirZ \* 1400/,
  'Earth sun or moon remained in front of the distant terrain field'
);
assert.doesNotMatch(diagnosticsSource, /farTerrainClipmap|farMappedContexts/);

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
  farTerrain: 'post-v4.1.1-square-clipmap-removed'
}, null, 2));
