import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

async function source(relativePath) {
  return fs.readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

const movingActorSources = [
  'app/js/physics.js',
  'app/js/physics/mode-dispatch.js',
  'app/js/boat-mode/runtime-dynamics.js'
];

for (const relativePath of movingActorSources) {
  const text = await source(relativePath);
  assert.doesNotMatch(
    text,
    /updateTerrainAround\s*\(/,
    `${relativePath} must not rebuild terrain while an Earth actor moves`
  );
  assert.doesNotMatch(
    text,
    /updateWorldLod\?*\.\s*\(\s*false\s*\)/,
    `${relativePath} must not churn world visibility while an Earth actor moves`
  );
}

const frameSystems = await source('app/js/runtime/core-frame-systems.js');
assert.doesNotMatch(
  frameSystems,
  /updateEarthWorldStreaming/,
  'the frame loop must not run the retired continuous-Earth streamer'
);
assert.doesNotMatch(
  frameSystems,
  /updateWorldLod\?*\.\s*\(\s*false\s*\)/,
  'the frame loop must not rescan and republish world LOD during travel'
);

const terrainStreaming = await source('app/js/terrain/streaming.js');
assert.doesNotMatch(
  terrainStreaming,
  /getDynamicTerrainRing|getStreamingSpeedMph|vehicle-speed-units/,
  'location terrain coverage must not change with vehicle speed'
);
assert.match(
  terrainStreaming,
  /const activeRing = Math\.max\(1, appCtx\.TERRAIN_RING\)/,
  'a selected location must retain one fixed terrain ring'
);

const titleScreen = await source('app/js/ui/title-screen.js');
const loadSupport = await source('app/js/world/load-support.js');
assert.match(titleScreen, /updateTerrainAround\(/, 'title launch must still publish location terrain');
assert.match(loadSupport, /updateTerrainAround/, 'world load must still finalize location terrain');

console.log(JSON.stringify({
  ok: true,
  contract: 'location-based-earth-runtime',
  actorMovementTerrainRebuilds: 0,
  frameDrivenWorldLodPasses: 0,
  terrainCoverage: 'fixed-per-location'
}, null, 2));
