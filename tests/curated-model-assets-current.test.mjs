import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { getModelAsset, modelAssetsForRole } from '../app/js/assets/model-asset-catalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readGlbAssetMetadata(file) {
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  const jsonLength = bytes.readUInt32LE(12);
  return {
    bytes,
    json: JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').replace(/\0+$/, ''))
  };
}

test('the player road vehicle has one bundled curated model and keeps the existing collision authority', () => {
  const assets = modelAssetsForRole('player-road-vehicle');
  assert.equal(assets.length, 1);
  const asset = assets[0];
  assert.equal(asset.collisionPolicy, 'existing-player-vehicle-envelope');
  assert.equal(asset.budgets.maxInstances, 1);
  assert.match(asset.url, /^\/app\/assets\/models\//);
  assert.doesNotMatch(asset.url, /^https?:/);
  assert.ok(fs.existsSync(path.join(root, asset.url.replace(/^\/app\//, 'app/'))));
});

test('the curated model loader does not depend on a third-party runtime decoder', () => {
  const source = fs.readFileSync(path.join(root, 'app/js/assets/model-asset-runtime.js'), 'utf8');
  assert.doesNotMatch(source, /setDecoderPath\s*\(/);
  assert.doesNotMatch(source, /https?:\/\//);
});

test('the curated car is requested by the existing drive-mode authority, not by a parallel controller', () => {
  const sceneBootstrap = fs.readFileSync(path.join(root, 'app/js/engine/scene-bootstrap.js'), 'utf8');
  const travelMode = fs.readFileSync(path.join(root, 'app/js/travel-mode.js'), 'utf8');
  assert.match(sceneBootstrap, /ensureCuratedPlayerCar\s*=\s*\(\)\s*=>\s*attachCuratedPlayerCar/);
  assert.match(travelMode, /ensureCuratedPlayerCar\?\.\(\)/);
  assert.doesNotMatch(sceneBootstrap, /^\s*attachCuratedPlayerCar\(THREE, appCtx\);\s*$/m);
});

test('the bundled E34 retains its source and CC BY license evidence within its GLB', () => {
  const asset = getModelAsset('vehicle-bmw-525i-e34');
  assert.ok(asset);
  const file = path.join(root, asset.url.replace(/^\/app\//, 'app/'));
  const { bytes, json } = readGlbAssetMetadata(file);
  assert.ok(bytes.length <= asset.budgets.bytes);
  assert.equal(json.asset?.extras?.license, 'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)');
  assert.equal(json.asset?.extras?.source, asset.sourceUrl);
  assert.match(json.asset?.extras?.author || '', /Uralvagonzavod/);
});
