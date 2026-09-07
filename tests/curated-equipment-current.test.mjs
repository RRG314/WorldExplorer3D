import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { modelAssetsForRole } from '../app/js/assets/model-asset-catalog.js';
import { CURATED_EQUIPMENT_ASSET_BY_ID, curatedEquipmentAssetForId } from '../app/js/urban-sandbox/curated-equipment-visual.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readGlb(asset) {
  const file = path.join(root, asset.url.replace(/^\/app\//, 'app/'));
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  const jsonLength = bytes.readUInt32LE(12);
  return { bytes, json: JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').replace(/\0+$/, '')) };
}

function triangleCount(json) {
  return (json.meshes || []).reduce((total, mesh) => total + (mesh.primitives || []).reduce((subtotal, primitive) => {
    const accessor = json.accessors?.[primitive.indices ?? primitive.attributes?.POSITION];
    return subtotal + Number(accessor?.count || 0) / 3;
  }, 0), 0);
}

test('two cohesive CC0 models cover Explorer energy sidearms without changing item identity', () => {
  const assets = modelAssetsForRole('held-explorer-equipment');
  assert.deepEqual(assets.map((asset) => asset.id), [
    'equipment-explorer-pulse-sidearm-v1',
    'equipment-explorer-laser-rifle-v1'
  ]);
  assert.deepEqual(CURATED_EQUIPMENT_ASSET_BY_ID, {
    'pulse-sidearm': 'equipment-explorer-pulse-sidearm-v1',
    'compact-sidearm': 'equipment-explorer-pulse-sidearm-v1',
    'responder-sidearm': 'equipment-explorer-pulse-sidearm-v1',
    'paintball-gun': 'equipment-explorer-pulse-sidearm-v1',
    'laser-gun': 'equipment-explorer-laser-rifle-v1'
  });
  assert.equal(curatedEquipmentAssetForId('paintball-gun'), 'equipment-explorer-pulse-sidearm-v1');

  const expectedHashes = {
    'equipment-explorer-pulse-sidearm-v1': 'c7e5e28636c18a09c9129cbf9f2d8132eea97c7d142477978c086d8c876b04ca',
    'equipment-explorer-laser-rifle-v1': '5482cf683aad4f08526764db0697894d17cc45b8c18e189d23facaba55a72441'
  };
  const expectedMaxInstances = {
    'equipment-explorer-pulse-sidearm-v1': 24,
    'equipment-explorer-laser-rifle-v1': 16
  };
  for (const asset of assets) {
    assert.equal(asset.license, 'CC0-1.0');
    assert.equal(asset.sourceUrl, 'https://quaternius.com/packs/scifimodularguns.html');
    assert.equal(asset.collisionPolicy, 'existing-equipment-and-projectile-authority');
    assert.equal(asset.budgets.maxInstances, expectedMaxInstances[asset.id]);
    const { bytes, json } = readGlb(asset);
    assert.ok(bytes.length <= asset.budgets.bytes);
    assert.ok(triangleCount(json) <= asset.budgets.triangles);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), expectedHashes[asset.id]);
    assert.deepEqual(json.extensionsRequired || [], []);
    assert.equal(json.images?.length || 0, 0);
  }
});

test('curated weapons remain visual adapters and fail closed without revealing old fallback models', () => {
  const adapter = fs.readFileSync(path.join(root, 'app/js/urban-sandbox/curated-equipment-visual.js'), 'utf8');
  const visuals = fs.readFileSync(path.join(root, 'app/js/urban-sandbox/equipment-visuals.js'), 'utf8');
  const model = fs.readFileSync(path.join(root, 'app/js/urban-sandbox/equipment-model.js'), 'utf8');
  const projectiles = fs.readFileSync(path.join(root, 'app/js/urban-sandbox/equipment-runtime.js'), 'utf8');
  assert.match(adapter, /presentationOnly\s*=\s*true/);
  assert.match(adapter, /existing-equipment-and-projectile-authority|gameplayAuthority/);
  assert.match(adapter, /setEquipmentFallbackVisible\(host, false\)/);
  assert.match(adapter, /catch \(error\)[\s\S]*setEquipmentFallbackVisible\(host, false\)/);
  assert.doesNotMatch(adapter, /catch \(error\)[\s\S]*setEquipmentFallbackVisible\(host, true\)/);
  assert.match(visuals, /defaultEquipmentFallback\s*=\s*true/);
  assert.match(visuals, /attachCuratedEquipmentVisual/);
  assert.match(visuals, /disposeCuratedEquipmentVisual/);
  assert.match(model, /magazineSize:\s*12/);
  assert.match(projectiles, /projectileKind/);
});
