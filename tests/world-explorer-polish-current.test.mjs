import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { getModelAsset, modelAssetsForRole } from '../app/js/assets/model-asset-catalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function glbFor(assetId) {
  const asset = getModelAsset(assetId);
  assert.ok(asset, `${assetId} must be cataloged`);
  const bytes = fs.readFileSync(path.join(root, asset.url.replace(/^\//, '')));
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').replace(/\0+$/, ''));
  return { asset, bytes, json };
}

test('the account owns character selection and the in-play Backpack leads with the wallet', () => {
  const account = read('account/index.html');
  const app = read('app/index.html');
  const runtime = read('app/js/urban-sandbox/runtime.js');
  assert.match(account, /data-account-character-gender="man"/);
  assert.match(account, /data-account-character-gender="woman"/);
  assert.match(account, /setPlayerCharacterGender/);
  assert.doesNotMatch(app, /data-player-character-gender/);
  assert.match(app, /id="urbanBackpackWallet">\$0/);
  assert.match(runtime, /wallet\.textContent = formatExplorerDollars/);
});

test('the grenade keeps its save-compatible identity while presenting and speaking as a grenade', () => {
  const model = read('app/js/urban-sandbox/equipment-model.js');
  const visuals = read('app/js/urban-sandbox/equipment-visuals.js');
  const runtime = read('app/js/urban-sandbox/equipment-runtime.js');
  assert.match(model, /id: 'concussion-charge', label: 'Explorer grenade'/);
  assert.match(model, /projectileKind: 'thrown-charge'/);
  assert.match(visuals, /Explorer grenade body/);
  assert.match(runtime, /Grenade thrown\./);
  assert.match(runtime, /thrown-grenade world projectile/);
});

test('the parachute and coherent Quaternius Space family are bounded local visual assets', () => {
  const expected = new Map([
    ['equipment-explorer-parachute-v1', '63f9af1d963509e5a9b440a615b5946fc6ca66c909d000f39cbfc903f7c1f9e6'],
    ['space-pathfinder-transfer-pod-v2', '1c7e5a363fbf766dd19fa45bb045f99bef5278dceb4afd6a94384527ffd4a489'],
    ['space-solis-reach-exterior-v1', '67e1962f65c2cf7a6d9bc2f9ee3e3d9d4550bfe63bb5f60b27a6217814ffb233']
  ]);
  assert.equal(modelAssetsForRole('deployed-parachute-presentation').length, 1);
  assert.equal(modelAssetsForRole('space-transfer-pod-presentation').length, 1);
  assert.equal(modelAssetsForRole('expedition-starship-presentation').length, 1);
  for (const [assetId, hash] of expected) {
    const { asset, bytes, json } = glbFor(assetId);
    if (assetId === 'equipment-explorer-parachute-v1') {
      assert.equal(asset.license, 'CC-BY-4.0');
      assert.match(asset.sourceUrl, /^https:\/\/sketchfab\.com\/3d-models\//);
    } else {
      assert.equal(asset.license, 'CC0-1.0');
      assert.equal(asset.sourceUrl, 'https://quaternius.com/packs/ultimatespaceships.html');
    }
    assert.ok(bytes.length <= asset.budgets.bytes);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), hash);
    assert.deepEqual(json.extensionsRequired || [], assetId === 'equipment-explorer-parachute-v1' ? [] : ['KHR_mesh_quantization']);
  }
});

test('new parachute and pod models remain presentation-only with confirmed-error fallbacks', () => {
  const parachute = read('app/js/urban-sandbox/curated-parachute-visual.js');
  const pod = read('app/js/space/curated-expedition-pod.js');
  const podMesh = read('app/js/space/expedition-pod-mesh.js');
  assert.match(parachute, /presentationOnly = true/);
  assert.match(parachute, /catch \(error\)[\s\S]*setParachuteFallbackVisible\(host, true\)/);
  assert.match(pod, /presentationOnly = true/);
  assert.match(pod, /catch \(error\)[\s\S]*setPodFallbackVisible\(host, true\)/);
  assert.match(podMesh, /defaultPodFallback = true/);
  assert.match(podMesh, /attachCuratedExpeditionPod/);
  const starship = read('app/js/space/curated-expedition-starship.js');
  assert.match(starship, /presentationOnly = true/);
  assert.match(starship, /catch \(error\)[\s\S]*setStarshipFallbackVisible\(host, true\)/);
});

test('animated Explorer equipment tracks the curated wrist and driving uses the longer NPC detail range', () => {
  const equipment = read('app/js/urban-sandbox/equipment-visuals.js');
  const urban = read('app/js/urban-sandbox/runtime.js');
  const companion = read('app/js/discovery/companion-runtime.js');
  assert.match(equipment, /normalizedName === 'wristr'/);
  assert.match(equipment, /root\.userData\.attachment = 'curated-right-wrist'/);
  assert.match(urban, /NPC_DRIVING_PRELOAD_DISTANCE = 280/);
  assert.match(urban, /driving \? NPC_DRIVING_PRELOAD_DISTANCE/);
  assert.match(companion, /archetype === 'cat' \? \.72 : \.42/);
  assert.match(companion, /archetype === 'cat' \? 1\.02 : 1\.08/);
});
