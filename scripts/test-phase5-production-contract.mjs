import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

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
assert.match(terrainProfilesSource, /material\.map = detailTextures\?\.map \|\| null/);
assert.match(terrainProfilesSource, /applyWorldCoverVertexTints\(mesh, result\)/);
assert.doesNotMatch(terrainProfilesSource, /material\.map = result\.texture/);
assert.doesNotMatch(terrainProfilesSource, /updateTerrainAerialDetail|terrainAerialDetailSuppressed|terrainSurfaceDetailState/);
assert.equal(
  fs.existsSync(path.join(root, 'app/js/world/aerial-surface-context.js')),
  false,
  'aerial mode must not own a regional replacement ground plane'
);
const worldPublicationSource = read('app/js/world/publication.js');
assert.doesNotMatch(worldPublicationSource, /aerial-surface-context|syncAerialSurfaceContext|syncAerialFog|planeMode|droneMode/);

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
assert.match(landuseSource, /buildTerrainConformingPolygonGeometry/);
assert.match(landuseSource, /landusePresentationOwner\(landuseType\) === 'terrain_worldcover'/);
assert.match(landuseSource, /semanticOnly:\s*true/);
assert.doesNotMatch(landuseSource, /visibleMappedSurfaceTypes/);
assert.match(landuseSource, /props\.kind[\s\S]*'glacier'/);

const shadowSource = read('app/js/engine/shadow-policy.js');
assert.match(shadowSource, /normalBias/);
assert.match(shadowSource, /texelWorldSize/);
assert.match(shadowSource, /engine\/shadow-policy/);
assert.doesNotMatch(read('app/js/engine/scene-bootstrap.js'), /shadow\.bias|shadow\.normalBias|shadow\.camera\.(left|right|top|bottom)/);
assert.doesNotMatch(read('app/js/engine/quality.js'), /shadow\.bias|shadow\.normalBias|shadow\.camera\.(left|right|top|bottom)/);

assert.equal(
  fs.existsSync(path.join(root, 'app/js/runtime/render-interpolation.js')),
  false,
  'the pose-rewriting interpolation layer must stay deleted'
);
const coreFrameSource = read('app/js/runtime/core-frame-systems.js');
assert.ok(coreFrameSource.includes('appCtx.update(frame.dt)'));
assert.ok(!coreFrameSource.includes('fixedUpdate(frame)'));
assert.ok(!coreFrameSource.includes('presentationPose = {'));

const releaseNotes = read('RELEASE_NOTES_4.1.3.md');
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
  naturalGroundOwner: 'terrain-with-conforming-osm-landcover',
  shadowOwner: 'engine/shadow-policy',
  movementPresentation: 'v3.1-direct-frame-pose',
  publicReleaseRecord: '4.1.3'
}, null, 2));
