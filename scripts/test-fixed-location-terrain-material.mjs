import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const farFieldSource = await readFile(
  new URL('../app/js/terrain/far-field.js', import.meta.url),
  'utf8'
);
const surfaceProfilesSource = await readFile(
  new URL('../app/js/terrain/surface-profiles.js', import.meta.url),
  'utf8'
);
const mappedContextSource = await readFile(
  new URL('../app/js/terrain/far-field-mapped-context.js', import.meta.url),
  'utf8'
);
const materialBlendSource = await readFile(
  new URL('../app/js/terrain/surface-material-blend.js', import.meta.url),
  'utf8'
);

assert.match(
  surfaceProfilesSource,
  /export function ensureTerrainTextureSet\(/,
  'detailed terrain must publish its PBR texture-set authority for every location LOD'
);
assert.match(
  surfaceProfilesSource,
  /export function applyWorldCoverVertexTints\(/,
  'detailed terrain must publish its WorldCover tint authority for every location LOD'
);
assert.match(
  farFieldSource,
  /ensureTerrainTextureSet\(mesh, repeats, 'grass'\)/,
  'outer fixed-location geometry must use the shared natural base before semantic blending'
);
assert.match(
  farFieldSource,
  /applyWorldCoverVertexTints\(mesh, worldCoverResult\)/,
  'outer fixed-location geometry must use the same WorldCover tint application'
);
assert.match(farFieldSource, /applyWorldCoverSurfaceMaterialMix\(mesh, worldCoverResult\)/);
assert.match(farFieldSource, /applyTerrainSemanticMaterialBlend\(mesh, repeats\)/);
assert.match(materialBlendSource, /single-terrain-semantic-pbr-material/);
assert.doesNotMatch(materialBlendSource, /new THREE\.Mesh|new THREE\.PlaneGeometry/);
assert.match(
  farFieldSource,
  /hardscapeOwner: 'exact-mapped-surface-geometry'/,
  'exact mapped geometry, not coarse land-cover pixels, must own hardscape'
);
assert.match(
  farFieldSource,
  /spanMeters \/ 80/,
  'outer texture repeats must preserve the detailed terrain physical scale'
);
assert.match(farFieldSource, /mesh\.name = 'FixedLocationTerrainLod'/);
assert.match(farFieldSource, /mesh\.receiveShadow = true/);
assert.match(farFieldSource, /surfaceMaterialOwner: 'single-terrain-semantic-pbr'/);
assert.match(
  farFieldSource,
  /nearestDetailedTerrain[\s\S]*terrainVisualProfile\?\.visualMode/,
  'outer terrain must inherit the nearest detailed terrain mode when WorldCover is unavailable'
);
assert.match(
  surfaceProfilesSource,
  /setWorldSurfaceProfile[\s\S]*scheduleFarTerrainSurfaceRefresh/,
  'late location classification must refresh the already-published outer terrain material'
);
const failedBuildBranch = farFieldSource.indexOf("reason: 'far-field-elevation-sampling-failed'");
const replacementCleanup = farFieldSource.indexOf('removeCurrentMesh();', failedBuildBranch);
const replacementStatePublication = farFieldSource.indexOf('farFieldSurfaceState = {', replacementCleanup);
assert.ok(
  failedBuildBranch >= 0 &&
    replacementCleanup > failedBuildBranch &&
    replacementStatePublication > replacementCleanup,
  'replacement cleanup must happen before publishing the new location material state'
);
assert.doesNotMatch(
  farFieldSource,
  /resolveFarFieldSurfaceColor|sampleDetailedWorldCoverSurface|mappedSurfaceColor|applyWorldCoverBuiltSurfaceMaterial/,
  'a second absolute-color terrain presentation pipeline must not return'
);
assert.doesNotMatch(
  mappedContextSource,
  /landByTile|farLandClass|mappedSurfaceColor/,
  'retired background-color land parsing must not consume fixed-location load time'
);
assert.match(mappedContextSource, /selectContextZoomForTileBudget/);
assert.doesNotMatch(
  farFieldSource,
  /mesh\.name = 'FarTerrainClipmap'|polygonOffsetFactor|polygonOffsetUnits/,
  'the retired background renderer identity and its presentation offsets must not return'
);

console.log(JSON.stringify({
  ok: true,
  contract: 'fixed-location-shared-terrain-material',
  verified: [
    'one-semantic-pbr-material-authority',
    'one-worldcover-tint-authority',
    'exact-mapped-hardscape-authority',
    'consistent-physical-texture-scale',
    'replacement-lifecycle-preserves-material-state',
    'provider-gap-inherits-detailed-location-mode',
    'late-location-profile-refreshes-outer-material',
    'bounded-latitude-aware-context-lod',
    'no-unused-background-land-parser',
    'no-independent-background-color-pipeline',
    'no-background-presentation-offsets'
  ]
}, null, 2));
