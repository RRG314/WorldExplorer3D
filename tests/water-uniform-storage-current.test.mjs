import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ctx } from '../app/js/shared-context.js?v=55';
import { applyWaveUniformsToMaterial } from '../app/js/boat-mode/surface-effects.js';
import { beforeWaterUniforms } from './fixtures/water-uniforms-before.js';

const scalars = ['weWaveTime','weWaveSpeed','weWaveScale','weWaveAmplitude','weWaveSecondaryAmplitude',
  'weWaveSwellAmplitude','weWaveRippleAmplitude','weWaveVisualStrength','weWaveFoamStrength',
  'weWaterDaylight','weWaterNight','weWaterOvercast','weWaterNormalStrength'];
function material() {
  const writes = {}, uniforms = {};
  for (const key of scalars) {
    let value = 0; writes[key] = 0;
    uniforms[key] = { get value() { return value; }, set value(next) { value = next; writes[key]++; } };
  }
  for (const key of ['weWaterZenithColor','weWaterHorizonColor','weWaterSunColor']) {
    const color = new THREE.Color(0), set = color.setHex; writes[key] = 0;
    color.setHex = function(hex) { writes[key]++; return set.call(this, hex); }; uniforms[key] = { value: color };
  }
  uniforms.weWaveOrigin = { value: new THREE.Vector2() }; uniforms.weWaterSunDirection = { value: new THREE.Vector3() };
  return { userData: { weWaterWaveShader: { uniforms } }, writes };
}
const values = mat => Object.fromEntries(Object.entries(mat.userData.weWaterWaveShader.uniforms).map(([key, { value }]) =>
  [key, value?.isColor ? [value.r, value.g, value.b] : value?.toArray ? value.toArray() : value]));
function settings() {
  ctx.earthAtmosphereProfile = { zenithColor: 0x2367ab, horizonColor: 0xc8bdaf, sunColor: 0xfefacd,
    sunDirection: { x: .1, y: .3, z: -.8 }, daylight: .7, night: .3, overcast: .4 };
  ctx.renderQualityLevel = 'medium'; ctx.boatMode = { currentWater: { source: { waveOffset: { x: 123, z: -543 } } } };
  return { time: 1, config: { waterBody: { waveOffset: { x: -3, z: 9 } }, visualBase: .78, foamBase: 1.38 },
    profile: { speed: .5, spatialScale: .32, primaryAmplitude: .12, secondaryAmplitude: .11, swellAmplitude: .1,
      rippleAmplitude: .01, visualStrength: .4, foamStrength: .2, whitecapStrength: .15 } };
}

test('unchanged water keeps identical output while time advances without repeated color or scalar writes', () => {
  const bundle = settings(), current = material(), previous = material();
  for (let frame = 0; frame < 5400; frame++) {
    bundle.time = frame / 60;
    beforeWaterUniforms(previous, bundle, ctx); applyWaveUniformsToMaterial(current, bundle);
    assert.deepEqual(values(current), values(previous));
  }
  for (const [key, count] of Object.entries(current.writes)) {
    if (key !== 'weWaveTime') assert.equal(count, 1, key);
  }
  assert.equal(current.writes.weWaveTime, 5399);
  assert.equal(previous.writes.weWaterZenithColor, 5400);
});

test('weather, in-place profile/config edits, mode, quality, missing optional uniforms and shader replacement preserve prior numerical behavior', () => {
  const bundle = settings(); let current = material(), previous = material();
  for (let i = 0; i < 1200; i++) {
    bundle.time = i / 37;
    bundle.profile.speed = i % 13 / 8; bundle.profile.primaryAmplitude = i % 23 / 9;
    bundle.profile.spatialScale = i % 17 / 8; bundle.profile.foamStrength = i % 7 / 4;
    bundle.config.visualBase = [0, .78, 1, null, '0.3'][i % 5];
    bundle.config.foamBase = [0, 1.38, '0.5'][i % 3]; bundle.config.localPatch = !!(i % 2);
    bundle.config.waterBody.waveOffset.x = i * .002;
    ctx.boatMode.currentWater.source.waveOffset.z = -i * .009;
    ctx.renderQualityLevel = ['low', 'HIGH', 'medium', null][i % 4];
    ctx.earthAtmosphereProfile.zenithColor = i * 1234;
    ctx.earthAtmosphereProfile.sunDirection.x = Math.sin(i / 100);
    ctx.earthAtmosphereProfile.daylight = i % 100 / 100;
    if (i % 80 === 0) { current = material(); previous = material(); }
    if (i % 80 === 40) for (const key of ['weWaveScale','weWaveOrigin','weWaterSunColor']) {
      delete current.userData.weWaterWaveShader.uniforms[key]; delete previous.userData.weWaterWaveShader.uniforms[key];
    }
    beforeWaterUniforms(previous, bundle, ctx); applyWaveUniformsToMaterial(current, bundle);
    assert.deepEqual(values(current), values(previous), `frame ${i}`);
  }
  ctx.earthAtmosphereProfile = null;
  beforeWaterUniforms(previous, bundle, ctx); applyWaveUniformsToMaterial(current, bundle);
  assert.deepEqual(values(current), values(previous));
});

test('edits to destination colors, vectors or scalar uniforms are restored even when the source profile is unchanged', () => {
  const bundle = settings(), current = material(), previous = material();
  beforeWaterUniforms(previous, bundle, ctx); applyWaveUniformsToMaterial(current, bundle);
  const u = current.userData.weWaterWaveShader.uniforms;
  u.weWaterZenithColor.value.setRGB(.123, .456, .789);
  u.weWaterSunDirection.value.set(1, 0, 0); u.weWaveOrigin.value.set(7, 8); u.weWaveSpeed.value = 500;
  applyWaveUniformsToMaterial(current, bundle);
  assert.deepEqual(values(current), values(previous));
  u.weWaterZenithColor.value = new THREE.Color(0);
  applyWaveUniformsToMaterial(current, bundle); assert.deepEqual(values(current), values(previous));
  assert.equal(applyWaveUniformsToMaterial({}, bundle), false);
});
