import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildEarthAtmosphereProfile } from '../app/js/sky/earth-atmosphere.js';
import { buildWaterShaderLibrary } from '../app/js/water-dynamics.js';

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

const waterMaterialSource = fs.readFileSync(new URL('../app/js/world/water-materials.js', import.meta.url), 'utf8');
const qualitySource = fs.readFileSync(new URL('../app/js/engine/quality.js', import.meta.url), 'utf8');
const atmosphereSource = fs.readFileSync(new URL('../app/js/sky/earth-atmosphere.js', import.meta.url), 'utf8');

assert.doesNotMatch(waterMaterialSource, /requestAnimationFrame|WebGLRenderTarget|CubeCamera/);
assert.match(waterMaterialSource, /renderTargetCount:\s*0/);
assert.match(waterMaterialSource, /animationLoopCount:\s*0/);
assert.match(waterMaterialSource, /numericDepthUsed/);
assert.match(waterMaterialSource, /weWaveWorldNormal/);
assert.match(qualitySource, /previousTarget\.dispose/);
assert.match(qualitySource, /targetCount:\s*ctx\.state\.fallbackEnvTarget \? 1 : 0/);
assert.match(atmosphereSource, /authority:\s*'astronomical-sky-visual'/);
assert.doesNotMatch(atmosphereSource, /requestAnimationFrame/);

console.log(JSON.stringify({
  ok: true,
  contract: 'water-sky-optics',
  atmosphereOwner: day.authority,
  environmentTargetsMaximum: 1,
  waterRenderTargets: 0,
  waterAnimationLoops: 0,
  depthDrivenOpticsRequiresEvidence: true
}, null, 2));
