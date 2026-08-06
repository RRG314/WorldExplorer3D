import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function source(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), 'utf8');
}

async function javascriptFiles(directory) {
  const entries = await fs.readdir(path.join(repoRoot, directory), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await javascriptFiles(relativePath));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(relativePath);
  }
  return files;
}

const movementAndModeSources = [
  'app/js/physics.js',
  'app/js/physics/mode-dispatch.js',
  'app/js/plane-mode.js',
  'app/js/boat-mode.js',
  'app/js/boat-mode/runtime-dynamics.js',
  'app/js/walking/physics.js',
  'app/js/walking/runtime.js',
  'app/js/travel-mode.js'
];

for (const relativePath of movementAndModeSources) {
  const text = await source(relativePath);
  assert.doesNotMatch(
    text,
    /publishLocationTerrain|publishLocationWorld|loadRoads|resetLocationTerrainPublication/,
    `${relativePath} must not publish, reload, or reset the selected Earth world`
  );
}

const appSources = await javascriptFiles('app/js');
const retiredEarthSymbols = /updateTerrainAround|resetTerrainStreamingState|createTerrainStreamingApi|updateEarthWorldStreaming|pauseEarthStreaming|resumeEarthStreaming|scheduleModeWorldRefresh|syncWalkTerrain|syncBoatTerrainSuppression|updateWorldLod/;
for (const relativePath of appSources) {
  assert.doesNotMatch(
    await source(relativePath),
    retiredEarthSymbols,
    `${relativePath} must not retain a retired continuous-Earth authority`
  );
}
await assert.rejects(
  fs.access(path.join(repoRoot, 'app/js/terrain/streaming.js')),
  'the obsolete continuous terrain module must be deleted'
);
await assert.rejects(
  fs.access(path.join(repoRoot, 'app/js/world/lod.js')),
  'the actor-driven world LOD module must be deleted'
);

const terrainPublication = await source('app/js/terrain/location-world.js');
assert.match(terrainPublication, /worldToLatLon\(0, 0\)/, 'terrain publication must be centered on the selected location origin');
assert.match(terrainPublication, /publishedLocationKey === locationKey/, 'terrain must publish at most once per selected location');
assert.match(terrainPublication, /Math\.max\(3, appCtx\.TERRAIN_RING\)/, 'the fixed terrain district must cover the full mapped play area');
assert.match(terrainPublication, /retireGroundFallbackPlaceholder\?\.\(\)/, 'the loading field must retire when authoritative terrain publishes');
assert.doesNotMatch(terrainPublication, /actor|speed|vehicle|moved|distanceMoved/, 'location terrain must not depend on actor travel');

const terrainProfiles = await source('app/js/terrain/surface-profiles.js');
const builtProfileBranch = terrainProfiles.slice(
  terrainProfiles.indexOf('} else if (nextMode === "built")'),
  terrainProfiles.indexOf('} else if (nextMode === "urban")')
);
assert.match(builtProfileBranch, /ensureTerrainTextureSet\(mesh, textureRepeats, "grass"\)/, 'settlement fallback terrain must use the natural grass material');
assert.doesNotMatch(builtProfileBranch, /ensureTerrainTextureSet\([^\n]+"built"\)|URBAN_GROUND_HEX/, 'settlement fallback terrain must not paint the whole location as concrete');

const worldPublication = await source('app/js/world/publication.js');
assert.doesNotMatch(worldPublication, /car|planeMode|drone|boatMode|walker|distance|budgetScale/, 'fixed world publication must not depend on actor or mode');
assert.match(worldPublication, /setListVisible\(appCtx\.buildingMeshes\)/, 'all loaded building meshes must be published together');

const travelMode = await source('app/js/travel-mode.js');
assert.doesNotMatch(travelMode, /setTimeout|requestIdleCallback|loadRoads|publishLocation/, 'mode switches must not schedule world work');

const diagnostics = await source('app/js/runtime-diagnostics.js');
const editorPublicLayer = await source('app/js/editor/public-layer.js');
assert.doesNotMatch(diagnostics, /setInterval\s*\(/, 'runtime diagnostics must be explicitly requested, not published on an interval');
assert.match(diagnostics, /publishWorldExplorerRuntimeDiagnostics = publishRuntimeDiagnostics/, 'on-demand diagnostic publication must remain available');
assert.doesNotMatch(editorPublicLayer, /setInterval\s*\(/, 'the editor layer must not scan the world on an interval');
assert.match(editorPublicLayer, /listenPublishedOverlayFeatures\s*\(/, 'the editor backend subscription must remain authoritative');

const onDemandModes = await source('app/js/runtime/on-demand-modes.js');
const appEntry = await source('app/js/app-entry.js');
assert.match(onDemandModes, /await import\('\.\.\/solar-system\.js\?v=/, 'the solar system must remain dynamically imported');
assert.match(onDemandModes, /return import\('\.\.\/space\.js\?v=/, 'space flight must remain dynamically imported');
assert.doesNotMatch(appEntry, /from ['"].*(?:solar-system|space\/|universe\/)|import ['"].*(?:solar-system|space\/|universe\/)/, 'Earth startup must not statically import space runtime modules');

const solarSystemInit = await source('app/js/solar-system/init.js');
const solarSystemUi = await source('app/js/solar-system/ui.js');
const universeVisuals = await source('app/js/universe/visuals.js');
const spaceAssetReferences = (solarSystemInit + universeVisuals).match(/sun-sdo-2025\.jpg/g) || [];
assert.equal(spaceAssetReferences.length, 1, 'exactly one Sun asset load path must exist');
assert.equal((solarSystemInit.match(/solarSystem\.sunMesh\s*=\s*new THREE\.Mesh/g) || []).length, 1, 'exactly one space Sun mesh must be created');
assert.match(solarSystemInit, /new THREE\.MeshBasicMaterial\(\{ map: sunTexture, color: 0xffffff \}\)/, 'the observed Sun texture must be the spherical mesh material map');
assert.match(solarSystemInit, /new THREE\.CanvasTexture\(sunCanvas\)/, 'observed Sun imagery must be converted to a seam-safe spherical texture');
assert.equal((solarSystemInit.match(/sunCanvasContext\.drawImage/g) || []).length, 2, 'the observed hemisphere and its mirrored continuation must cover the full sphere');
const sunCreationBlock = solarSystemInit.slice(0, solarSystemInit.indexOf('const sunLight'));
assert.doesNotMatch(sunCreationBlock, /new THREE\.Sprite|SpriteMaterial|observedDisk|glow1|glow2|BackSide/, 'the Sun must not contain a flat disk or fake glow shell');
assert.doesNotMatch(universeVisuals, /addObservedSolarDisk|sun-sdo-2025|Sun — NASA SDO observed disk/, 'universe frames must not create a second observed Sun');
assert.doesNotMatch(solarSystemUi, /ORBIT SUN|sunOrbitToggle|enterSunOrbitView/, 'temporary Sun inspection controls must not remain in the player UI');
assert.match(universeVisuals, /entity\.id === 'sol'[\s\S]*throw new Error\('Sol visuals are owned/, 'the generic planetary-system renderer must reject duplicate Sol creation');

const mainRuntime = await source('app/js/main.js');
const spaceEntry = await source('app/js/space.js');
const spaceRuntime = await source('app/js/space/runtime.js');
assert.match(mainRuntime, /isSuspended: dedicatedRendererActive/, 'the main renderer must suspend whenever a dedicated renderer owns the frame');
assert.equal((spaceEntry.match(/stopRuntimeKernel\?\.\('space-flight-active'\)/g) || []).length, 3, 'every space entry path must stop the Earth runtime kernel');
assert.match(spaceEntry, /function exitSpaceFlight[\s\S]*appCtx\.renderLoop\?\.\(\)/, 'space exit must restart the terrain-world runtime');
assert.doesNotMatch(spaceRuntime, /spaceFlight\.camera\.up\.copy\(_sf(?:TempVec|LocalUp)\)/, 'space camera up must never copy spacecraft-local up');
assert.match(spaceRuntime, /spaceFlight\.camera\.up\.copy\(_sfWorldUp\)/, 'space chase camera must use stable world-up');
assert.match(spaceRuntime, /cameraLookMatrix\.lookAt\(appCtx\.spaceFlight\.camera\.position, rocket\.position, _sfWorldUp\)/, 'space chase look-at must use stable world-up');

const earthSession = await source('app/js/earth-session.js');
assert.doesNotMatch(earthSession, /publishLocationTerrain|publishLocationWorld|worldDetailState\?\.buildings\?\.status === 'loading'/, 'Earth resume must restore the retained world without republishing it');

console.log(JSON.stringify({
  ok: true,
  contract: 'authoritative-location-earth-and-space',
  movementWorldPublicationPaths: 0,
  recurringWorldScans: 0,
  spaceSunCreationPaths: 1,
  activeWorldRenderLoops: 1,
  terrainCoverage: 'fixed-per-location'
}, null, 2));
