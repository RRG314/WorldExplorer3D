import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildEarthAtmosphereProfile } from '../app/js/sky/earth-atmosphere.js';
import {
  buildWaterShaderLibrary,
  MAX_SAFE_WATER_TROUGH_DEPTH,
  resolveWaterMotionProfile,
  sampleWaterSurfaceMotion
} from '../app/js/water-dynamics.js';

const day = buildEarthAtmosphereProfile(null, null, { phase: 'day', backgroundHex: 0x87ceeb });
const night = buildEarthAtmosphereProfile(null, null, { phase: 'night', backgroundHex: 0x071126 });
const overcast = buildEarthAtmosphereProfile({
  phase: 'day',
  sun: { daylightFactor: 1, twilightFactor: 0, direction: { x: 0.4, y: 0.8, z: 0.4 } },
  visual: { skyColor: 0x87ceeb, fogColor: 0xc7d5df, groundColor: 0x545454, sunColor: 0xfff5e1 }
}, {
  category: 'overcast',
  cloudCover: 100,
  precipitationMm: 0
});

assert.equal(day.authority, 'astronomical-sky-visual');
assert.notEqual(day.signature, night.signature);
assert.notEqual(day.zenithColor, night.zenithColor);
assert(overcast.overcast >= 0.84);
assert.equal(
  buildEarthAtmosphereProfile(null, null, { phase: 'day', backgroundHex: 0x87ceeb }).signature,
  day.signature,
  'the same sky state must produce one stable PMREM signature'
);

const waveShader = buildWaterShaderLibrary();
assert.match(waveShader, /vec3 weWaveWorldNormal/);
assert.match(waveShader, /uniform vec3 weWaterSunDirection/);
assert.match(waveShader, /varying vec3 vWeWaveWorldPosition/);
assert.match(waveShader, /uniform float weWaveTroughDepth/);
assert.match(waveShader, /max\(rawHeight, -weWaveTroughDepth\)/);

const roughProfile = resolveWaterMotionProfile({
  waterKind: 'open_ocean',
  shorelineDistance: 500,
  intensity: 1,
  active: true
});
for (let index = 0; index < 180; index += 1) {
  const motion = sampleWaterSurfaceMotion(index * 13.7, index * -9.3, index * 0.17, { profile: roughProfile });
  assert(motion.height >= -MAX_SAFE_WATER_TROUGH_DEPTH - 1e-9);
}

const waterMaterialSource = fs.readFileSync(new URL('../app/js/world/water-materials.js', import.meta.url), 'utf8');
const qualitySource = fs.readFileSync(new URL('../app/js/engine/quality.js', import.meta.url), 'utf8');
const atmosphereSource = fs.readFileSync(new URL('../app/js/sky/earth-atmosphere.js', import.meta.url), 'utf8');
const boatPatchSource = fs.readFileSync(new URL('../app/js/boat-mode/water-patch-shader.js', import.meta.url), 'utf8');
const terrainMaskSource = fs.readFileSync(new URL('../app/js/terrain/water-terrain-mask.js', import.meta.url), 'utf8');

assert.doesNotMatch(waterMaterialSource, /requestAnimationFrame|WebGLRenderTarget|CubeCamera/);
assert.match(waterMaterialSource, /renderTargetCount:\s*0/);
assert.match(waterMaterialSource, /animationLoopCount:\s*0/);
assert.match(waterMaterialSource, /numericDepthUsed/);
assert.match(waterMaterialSource, /weWaveWorldNormal/);
assert.match(qualitySource, /previousTarget\.dispose/);
assert.match(qualitySource, /targetCount:\s*ctx\.state\.fallbackEnvTarget \? 1 : 0/);
assert.match(atmosphereSource, /authority:\s*'astronomical-sky-visual'/);
assert.doesNotMatch(atmosphereSource, /requestAnimationFrame/);
assert.match(boatPatchSource, /max\(weWaveField\(weWorldPos\.xz\) \+ weBoatWakeDisplace, -weWaveTroughDepth\)/);
assert(Number(terrainMaskSource.match(/maximumDepth\) \|\| ([0-9.]+)/)?.[1]) > MAX_SAFE_WATER_TROUGH_DEPTH);

console.log(JSON.stringify({
  ok: true,
  contract: 'water-sky-optics',
  atmosphereOwner: day.authority,
  environmentTargetsMaximum: 1,
  waterRenderTargets: 0,
  waterAnimationLoops: 0,
  maximumTroughDepth: MAX_SAFE_WATER_TROUGH_DEPTH,
  depthDrivenOpticsRequiresEvidence: true
}, null, 2));
