import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { registerWaterWaveMaterial } from '../app/js/world/water-materials.js';
import { customizeBoatWaterPatchShader } from '../app/js/boat-mode/water-patch-shader.js';
import { ctx } from '../app/js/shared-context.js?v=55';

test('boat wake composes with the actual current shared water shader', t => {
  const previous = globalThis.THREE;
  globalThis.THREE = THREE;
  const previousMaterials = ctx.waterWaveVisuals;
  ctx.waterWaveVisuals = [];
  t.after(() => { globalThis.THREE = previous; ctx.waterWaveVisuals = previousMaterials; });
  const material = new THREE.MeshStandardMaterial();
  registerWaterWaveMaterial(material, { shaderHook: customizeBoatWaterPatchShader, shaderKey: 'boatPatchWake' });
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader);
  assert.match(shader.vertexShader, /float weBoatWakeDisplace = weBoatWakeDisplacement/);
  for (const variable of ['weFoamBands', 'weWhitecaps', 'weBoatWakeFoam', 'weBoatBowFoam', 'weBoatFoam']) {
    assert.equal(shader.fragmentShader.match(new RegExp(`float ${variable} =`, 'g'))?.length, 1, variable);
  }
  assert.match(shader.fragmentShader, /diffuseColor.rgb.*weBoatFoam/);
  assert.match(shader.fragmentShader, /totalEmissiveRadiance.*weBoatFoam/);
  assert.match(shader.fragmentShader, /diffuseColor.a \*= clamp\(wePatchMask/);
  material.dispose();
});

test('missing water shader integration hooks fail explicitly instead of silently dropping the wake', t => {
  const previous = globalThis.THREE; globalThis.THREE = THREE;
  t.after(() => { globalThis.THREE = previous; });
  assert.throws(() => customizeBoatWaterPatchShader({ uniforms: {}, vertexShader: '', fragmentShader: '' }), /missing its shared hook/);
});
