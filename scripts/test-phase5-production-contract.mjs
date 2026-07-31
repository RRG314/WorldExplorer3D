import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRenderInterpolator } from '../app/js/runtime/render-interpolation.js';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const sourceFiles = fs.readdirSync(path.join(root, 'app/js'), { recursive: true })
  .filter((entry) => String(entry).endsWith('.js'))
  .map((entry) => path.join('app/js', String(entry)));
const sourceText = sourceFiles.map((file) => `${file}\n${read(file)}`).join('\n');

assert.equal(
  fs.existsSync(path.join(root, 'app/js/engine/building-facade-shader.js')),
  false,
  'legacy facade shader owner must stay deleted'
);
for (const forbidden of [
  'refreshBuildingFacadeMaterials',
  'applyFacadeWallMask',
  'restoreFacadeWallMask',
  'facadeWallsOnly',
  'createWindowTexture',
  'createBuildingNormalMap',
  'createBuildingRoughnessMap',
  'getWindowTextureCache',
  'clearWindowTextureCache'
]) {
  assert.equal(sourceText.includes(forbidden), false, `legacy facade runtime token remains: ${forbidden}`);
}

const exteriorSource = read('app/js/engine/building-facade-materials.js');
for (const mappedFamily of [
  'brick', 'sandstone', 'limestone', 'marble', 'stone',
  'concrete', 'stucco', 'wood', 'glass', 'metal'
]) {
  assert.match(exteriorSource, new RegExp(`\\b${mappedFamily}\\b`), `missing exterior family: ${mappedFamily}`);
}
assert.match(exteriorSource, /neutral-fallback/);
assert.match(exteriorSource, /sharedRuntimeMaterial/);
assert.match(exteriorSource, /facadeShaderOwner:\s*'engine\/building-facade-materials'/);
assert.match(exteriorSource, /wallOnlyTexture:\s*true/);
assert.match(exteriorSource, /project-authored-static-atlas/);
assert.match(exteriorSource, /onBeforeCompile/);
assert.doesNotMatch(exteriorSource, /createWindowTexture|CanvasTexture/);

const facadeAssets = [
  'brick-classic-v1.webp',
  'stone-civic-v1.webp',
  'glass-curtain-v1.webp',
  'neutral-urban-v1.webp',
  'residential-warm-v1.webp'
];
let facadeAssetBytes = 0;
for (const assetName of facadeAssets) {
  const relativePath = `app/assets/textures/facades/${assetName}`;
  const absolutePath = path.join(root, relativePath);
  assert.equal(fs.existsSync(absolutePath), true, `missing project-owned facade atlas: ${relativePath}`);
  const bytes = fs.statSync(absolutePath).size;
  assert.ok(bytes >= 8_000, `facade atlas is unexpectedly empty: ${relativePath}`);
  assert.ok(bytes <= 300_000, `facade atlas exceeds the per-asset delivery budget: ${relativePath}`);
  facadeAssetBytes += bytes;
  assert.match(exteriorSource, new RegExp(assetName.replace('.', '\\.')));
}
assert.ok(facadeAssetBytes <= 900_000, `facade atlas payload exceeds delivery budget: ${facadeAssetBytes}`);

const facadeShaderOwners = sourceFiles.filter((file) =>
  read(file).includes("facadeShaderOwner: 'engine/building-facade-materials'")
);
assert.deepEqual(
  facadeShaderOwners,
  ['app/js/engine/building-facade-materials.js'],
  'facade shader ownership must remain singular'
);
const batchingSource = read('app/js/world/building-batching.js');
assert.match(batchingSource, /material\.onBeforeCompile = group\.material\.onBeforeCompile/);
assert.match(batchingSource, /material\.customProgramCacheKey = group\.material\.customProgramCacheKey/);

const terrainProfilesSource = read('app/js/terrain/surface-profiles.js');
assert.match(terrainProfilesSource, /LinearMipmapLinearFilter/);
assert.match(terrainProfilesSource, /anisotropy\s*=\s*Math\.max\(1,\s*Math\.min\(8/);
assert.doesNotMatch(terrainProfilesSource, /updateTerrainAerialDetail|terrainAerialDetailSuppressed|terrainSurfaceDetailState/);
assert.equal(
  fs.existsSync(path.join(root, 'app/js/world/aerial-surface-context.js')),
  false,
  'aerial mode must not own a regional replacement ground plane'
);
const worldLodSource = read('app/js/world/lod.js');
assert.doesNotMatch(worldLodSource, /aerial-surface-context|syncAerialSurfaceContext|syncAerialFog/);

const landmarkCatalogSource = read('app/js/world/landmark-catalog.js');
for (const landmark of [
  { id: 'ten-light-street', height: '155.2', builder: 'measured-ten-light-street' },
  { id: 'commerce-place-baltimore', height: '138.4', builder: 'measured-commerce-place' }
]) {
  assert.match(landmarkCatalogSource, new RegExp(`id:\\s*'${landmark.id}'[\\s\\S]*?totalHeightMeters:\\s*${landmark.height}`));
  assert.match(landmarkCatalogSource, new RegExp(`builder:\\s*'${landmark.builder}'`));
}
const landmarkModelsSource = read('app/js/world/landmark-models.js');
assert.match(landmarkModelsSource, /source:\s*landmark\.builder\?\.startsWith\('measured-'\)\s*\?\s*'measured-procedural-structure'/);
assert.match(landmarkModelsSource, /createMeasuredTenLightStreet/);
assert.match(landmarkModelsSource, /createMeasuredCommercePlace/);
const buildingLoadSource = read('app/js/world/load-building-pass.js');
assert.match(buildingLoadSource, /curatedLandmarkExclusions/);
assert.match(buildingLoadSource, /hideRadiusMeters/);
assert.match(buildingLoadSource, /curatedLandmarkSuppressedBuildings/);

const landuseSource = read('app/js/world/load-landuse-pass.js');
assert.match(landuseSource, /renderOwner:\s*'terrain-profile'/);
assert.match(landuseSource, /geometryRendered:\s*false/);
assert.match(landuseSource, /props\.kind[\s\S]*'glacier'/);

const shadowSource = read('app/js/engine/shadow-policy.js');
assert.match(shadowSource, /normalBias/);
assert.match(shadowSource, /texelWorldSize/);
assert.match(shadowSource, /engine\/shadow-policy/);
assert.doesNotMatch(read('app/js/engine/scene-bootstrap.js'), /shadow\.bias|shadow\.normalBias|shadow\.camera\.(left|right|top|bottom)/);
assert.doesNotMatch(read('app/js/engine/quality.js'), /shadow\.bias|shadow\.normalBias|shadow\.camera\.(left|right|top|bottom)/);

function mesh() {
  return {
    position: {
      x: 0, y: 0, z: 0,
      set(x, y, z) { this.x = x; this.y = y; this.z = z; }
    },
    rotation: {
      x: 0, y: 0, z: 0, order: 'XYZ',
      set(x, y, z) { this.x = x; this.y = y; this.z = z; }
    }
  };
}

const carMesh = mesh();
const characterMesh = mesh();
carMesh.position.y = 1.2;
characterMesh.position.y = 0;
const appCtx = {
  car: { x: 0, y: 1.2, z: 0, angle: 0 },
  carMesh,
  droneMode: false,
  drone: { x: 0, y: 45, z: 0, yaw: 0, pitch: 0, roll: 0, cameraYawOffset: 0 },
  planeMode: { active: false, x: 0, y: 0.72, z: 0, yaw: 0, pitch: 0, roll: 0, cameraYaw: 0, cameraPitch: 0, mesh: mesh() },
  Walk: {
    state: {
      mode: 'drive',
      walker: { x: 0, y: 1.7, z: 0, angle: 0, yaw: 0, pitch: 0, lookYawOffset: 0 },
      characterMesh
    }
  }
};
const interpolator = createRenderInterpolator(appCtx);
interpolator.beginFixedStep();
appCtx.car.x = 10;
appCtx.car.y = 3.2;
appCtx.car.z = 4;
appCtx.car.angle = Math.PI / 2;
carMesh.position.set(10, 3.2, 4);
interpolator.endFixedStep();
const halfway = interpolator.apply(0.5);
assert.equal(halfway.car.x, 5);
assert.equal(halfway.car.y, 2.2);
assert.equal(halfway.car.z, 2);
assert.ok(Math.abs(halfway.car.angle - Math.PI / 4) < 1e-9);
assert.equal(carMesh.position.x, 5);

interpolator.beginFixedStep();
appCtx.car.x = 500;
carMesh.position.set(500, 3.2, 4);
interpolator.endFixedStep();
const teleported = interpolator.apply(0.2);
assert.equal(teleported.car.x, 500, 'teleports must not smear through the world');
assert.equal(interpolator.snapshot().owner, 'runtime/render-interpolation');

appCtx.droneMode = true;
interpolator.reset();
interpolator.beginFixedStep();
appCtx.drone.x = 12;
appCtx.drone.y = 49;
appCtx.drone.z = -6;
appCtx.drone.yaw = Math.PI / 2;
interpolator.endFixedStep();
const droneHalfway = interpolator.apply(0.5);
assert.equal(droneHalfway.mode, 'drone');
assert.equal(droneHalfway.drone.x, 6);
assert.equal(droneHalfway.drone.y, 47);
assert.equal(droneHalfway.drone.z, -3);
assert.ok(Math.abs(droneHalfway.drone.yaw - Math.PI / 4) < 1e-9);

appCtx.droneMode = false;
appCtx.planeMode.active = true;
interpolator.reset();
interpolator.beginFixedStep();
appCtx.planeMode.x = 20;
appCtx.planeMode.y = 10.72;
appCtx.planeMode.z = 8;
appCtx.planeMode.yaw = -Math.PI / 2;
interpolator.endFixedStep();
const planeHalfway = interpolator.apply(0.5);
assert.equal(planeHalfway.mode, 'plane');
assert.equal(planeHalfway.plane.x, 10);
assert.equal(planeHalfway.plane.y, 5.72);
assert.equal(planeHalfway.plane.z, 4);
assert.ok(Math.abs(planeHalfway.plane.yaw + Math.PI / 4) < 1e-9);
assert.equal(appCtx.planeMode.mesh.position.x, 10);

const releaseNotes = read('RELEASE_NOTES_4.1.2.md');
const knownIssues = read('KNOWN_ISSUES.md');
assert.match(releaseNotes, /## Verification/);
assert.match(releaseNotes, /representative locations worldwide/i);
assert.match(knownIssues, /Tunnels, bridges, ramps, and stacked roads/);

console.log(JSON.stringify({
  ok: true,
  contract: 'phase5-production-readiness',
  facadeOwner: 'engine/building-facade-materials',
  facadeAtlases: facadeAssets.length,
  facadeAssetBytes,
  aerialTerrainDetail: 'same-materials-as-ground',
  measuredBaltimoreLandmarks: 2,
  naturalGroundOwner: 'terrain-profile',
  shadowOwner: 'engine/shadow-policy',
  interpolationOwner: interpolator.snapshot().owner,
  publicReleaseRecord: '4.1.2'
}, null, 2));
