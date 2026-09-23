import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyTerrainPortalMasksForContext } from '../app/js/terrain/structure-terrain-portals.js';
import { createPavementTerrainMask } from '../app/js/world/pavement-terrain-mask.js';

const opening = { x: 0, z: 0, tangentX: 1, tangentZ: 0, roadY: 0,
  halfWidth: 2, halfDepth: 3, cutHeight: 5 };
function fixture(t) {
  const previous = globalThis.THREE; globalThis.THREE = THREE;
  const material = new THREE.MeshStandardMaterial();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(20, 2, 20), material);
  mesh.userData.isTerrainMesh = true;
  const ctx = { terrainGroup: new THREE.Group(), renderer: { capabilities: { maxTextureSize: 4096 } } };
  ctx.terrainGroup.add(mesh);
  const compile = () => {
    const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
    material.onBeforeCompile(shader);
    return shader;
  };
  t.after(() => { material.dispose(); mesh.geometry.dispose(); globalThis.THREE = previous; });
  return { material, mesh, ctx, compile };
}

test('portal refresh, clear and re-add preserve the subsequently installed pavement shader', t => {
  const { material, ctx, compile } = fixture(t);
  applyTerrainPortalMasksForContext(ctx, [opening]);
  const pavement = createPavementTerrainMask(ctx, ['0:0']); t.after(() => pavement.dispose());
  pavement.syncMaterials();
  const composedHook = material.onBeforeCompile;
  for (const masks of [[{ ...opening, roadY: 1 }], [], [opening, { ...opening, x: 4 }], [opening]]) {
    applyTerrainPortalMasksForContext(ctx, masks); pavement.syncMaterials();
    const shader = compile();
    assert.equal(material.onBeforeCompile, composedHook, 'refresh must not replace a later effect');
    assert.match(shader.fragmentShader, /pavementCoverage\(\)/);
    assert.equal(shader.fragmentShader.includes('structurePortalIndex'), masks.length > 0);
    assert.match(material.customProgramCacheKey(), /pavement-terrain-mask-v1$/);
  }
});

test('cached portal programs retain the current uniform and release replaced textures', t => {
  const { material, ctx, compile } = fixture(t);
  applyTerrainPortalMasksForContext(ctx, [opening]);
  const uniform = compile().uniforms.structurePortalMasks;
  const firstTexture = uniform.value, initialVersion = firstTexture.version;
  let disposed = 0; firstTexture.addEventListener('dispose', () => disposed++);
  applyTerrainPortalMasksForContext(ctx, [{ ...opening, roadY: 2 }]);
  assert.equal(uniform.value, firstTexture, 'same-size updates reuse GPU texture storage');
  assert.equal(uniform.value.image.data[4], 2, 'an already compiled program sees new portal data');
  assert.ok(firstTexture.version > initialVersion);
  applyTerrainPortalMasksForContext(ctx, [opening, { ...opening, x: 4 }]);
  assert.notEqual(uniform.value, firstTexture); assert.equal(disposed, 1);
  assert.equal(compile().uniforms.structurePortalMasks, uniform);
  const secondTexture = uniform.value; secondTexture.addEventListener('dispose', () => disposed++);
  applyTerrainPortalMasksForContext(ctx, []);
  assert.equal(uniform.value, null); assert.equal(disposed, 2);
  assert.equal(compile().uniforms.structurePortalMasks, uniform);
  applyTerrainPortalMasksForContext(ctx, [opening]);
  uniform.value.addEventListener('dispose', () => disposed++);
  assert.equal(compile().uniforms.structurePortalMasks, uniform);
  material.dispose(); assert.equal(uniform.value, null); assert.equal(disposed, 3);
});
