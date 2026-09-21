import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('building publication owns exterior selection and near details once', async () => {
  const source = await read('app/js/world/load-building-pass.js');
  assert.match(source, /selectBuildingExteriorProfile|buildingIdentity: sourceBuildingId/);
  assert.equal((source.match(/publishBuildingExteriorDetails\(appCtx\)/g) || []).length, 1);
  assert.ok(source.indexOf('publishBuildingFacadeEntrances(appCtx)') < source.indexOf('publishBuildingExteriorDetails(appCtx)'));
  assert.ok(source.indexOf('loadMetrics.buildingExteriors = publishBuildingExteriorDetails(appCtx)') < source.indexOf('const batchedNearCount'));
});

test('detail geometry has an independent lifecycle and cannot replace mapped authorities', async () => {
  const details = await read('app/js/world/building-exterior-details.js');
  const reset = await read('app/js/world/load-reset.js');
  assert.match(details, /buildingExteriorDetailMeshes/);
  assert.doesNotMatch(details, /structureVisualMeshes\.push/);
  assert.match(details, /geometryAuthority: 'mapped-building-footprint-unchanged'/);
  assert.match(details, /collisionAuthority: 'existing-building-collider-unchanged'/);
  assert.match(reset, /clearBuildingExteriorDetails\(appCtx\)/);
});

test('facade material selection preserves mapped tags and uses bounded shared textures', async () => {
  const material = await read('app/js/engine/building-facade-materials.js');
  assert.match(material, /mappedMaterialChoices/);
  assert.match(material, /materialClaim: mappedFamily \? 'mapped'/);
  assert.match(material, /colorClaim: mappedColor \? 'mapped'/);
  assert.match(material, /sharedRuntimeTexture: true/);
  assert.match(material, /building-facade-local-layout-v9/);
  assert.doesNotMatch(material, /new THREE\.TextureLoader\(\).*forEach/);
});

test('open-ocean and world-reset transitions include exterior details', async () => {
  const boat = await read('app/js/boat-mode.js');
  const reset = await read('app/js/world/load-reset.js');
  assert.match(boat, /buildingExteriorDetailMeshes/);
  assert.match(reset, /hideList\(appCtx\.buildingExteriorDetailMeshes\)/);
});
