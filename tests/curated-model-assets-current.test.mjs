import assert from 'node:assert/strict';
import crypto from 'node:crypto';
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

test('one locally bundled skinned Explorer family serves player, nearby NPCs, responders, and ship crew', () => {
  const playerAssets = modelAssetsForRole('player-character');
  const npcAssets = modelAssetsForRole('nearby-npc-character');
  const responderAssets = modelAssetsForRole('civic-responder-character');
  const crewAssets = modelAssetsForRole('ship-crew-character');
  assert.equal(playerAssets.length, 1);
  assert.equal(npcAssets.length, 2);
  assert.equal(responderAssets.length, 1);
  assert.equal(crewAssets.length, 1);
  assert.equal(playerAssets[0].id, 'character-field-explorer-v1');
  assert.deepEqual(npcAssets.map((asset) => asset.id), [
    'character-city-explorer-v1',
    'character-city-explorer-casual-v1'
  ]);
  assert.equal(responderAssets[0].id, 'character-civic-responder-v1');
  assert.equal(responderAssets[0].budgets.maxInstances, 2);
  assert.equal(crewAssets[0].id, 'character-ship-crew-v1');
  assert.equal(crewAssets[0].budgets.maxInstances, 7);
  const expectations = new Map([
    ['character-field-explorer-v1', {
      hash: '84b8cc2f07abe4b48bae8155a79868bfac5216b4b0a1b4d624f39f3698d6e0c4',
      meshes: ['Cube.063', 'Cube.052', 'Cube.039', 'Cube.020', 'Plane']
    }],
    ['character-city-explorer-v1', {
      hash: '0dba57f454956ca5886a2d72e6c5a65f6dc9d45987dc3d47bfe419ff0d0b82b4',
      meshes: ['Cube.008', 'Cube.000', 'Cube.014', 'Cube.005']
    }],
    ['character-city-explorer-casual-v1', {
      hash: 'd6a8fc4ad8ef22104773eba260f211c6ec8d797f1f15c87207e0e4edf942d83d',
      meshes: ['Cube.010', 'Cube.003', 'Cube.015', 'Cube.019']
    }],
    ['character-civic-responder-v1', {
      hash: '0cd2b3876e5f20f3c85ffc5dcccd05dccb7aaec86235434f7f449f3b44417b7c',
      meshes: ['Cube.204', 'Cube.018', 'Cube.024', 'Cube.037', 'Cube.023']
    }],
    ['character-ship-crew-v1', {
      hash: '42454123d38585e901b3e28fd1415e6764f12d7e2f43eb29c4d6b3bc37c13b0c',
      meshes: ['Cube.002', 'Cube.047', 'Cube.049', 'Cube.046']
    }]
  ]);
  for (const asset of [...playerAssets, ...npcAssets, ...responderAssets, ...crewAssets]) {
    assert.equal(asset.collisionPolicy, 'existing-character-envelope');
    assert.ok(asset.budgets.maxInstances >= 1 && asset.budgets.maxInstances <= 7);
    assert.equal(asset.instancePolicy.geometry, 'shared');
    assert.equal(asset.instancePolicy.materials, 'clone');
    assert.equal(asset.license, 'CC0-1.0');
    assert.match(asset.sourceUrl, /^https:\/\/quaternius\.com\//);
    const file = path.join(root, asset.url.replace(/^\/app\//, 'app/'));
    const { bytes, json } = readGlbAssetMetadata(file);
    assert.ok(bytes.length <= asset.budgets.bytes);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), expectations.get(asset.id).hash);
    assert.deepEqual(json.extensionsRequired || [], []);
    assert.equal(json.skins?.length, 1);
    assert.deepEqual(json.meshes.map((mesh) => mesh.name), expectations.get(asset.id).meshes);
    assert.ok(['Idle', 'Walk', 'Run', 'Wave'].every((name) => json.animations.some((clip) => clip.name === name)));
    assert.equal(json.images?.length || 0, 0);
  }
});

test('curated characters attach beneath existing gameplay roots and retain procedural fallbacks', () => {
  const walking = fs.readFileSync(path.join(root, 'app/js/walking/character.js'), 'utf8');
  const playerFallback = fs.readFileSync(path.join(root, 'app/js/walking/field-navigator-mesh.js'), 'utf8');
  const walkingPhysics = fs.readFileSync(path.join(root, 'app/js/walking/physics.js'), 'utf8');
  const npcFallback = fs.readFileSync(path.join(root, 'app/js/urban-sandbox/npc-visuals.js'), 'utf8');
  const urbanRuntime = fs.readFileSync(path.join(root, 'app/js/urban-sandbox/runtime.js'), 'utf8');
  const responderRuntime = fs.readFileSync(path.join(root, 'app/js/urban-sandbox/responder-runtime.js'), 'utf8');
  const shipInterior = fs.readFileSync(path.join(root, 'app/js/expedition/ship-interior.js'), 'utf8');
  const loader = fs.readFileSync(path.join(root, 'app/js/assets/model-asset-runtime.js'), 'utf8');
  assert.match(walking, /attachCuratedExplorerCharacter\(THREE, character/);
  assert.match(walkingPhysics, /Number\(actions\.sprint\)\s*>\s*0\.05/);
  assert.match(playerFallback, /defaultCharacterFallback\s*=\s*true/);
  assert.match(npcFallback, /defaultCharacterFallback\s*=\s*true/);
  assert.match(urbanRuntime, /curatedNpcAssetOwners/);
  assert.match(responderRuntime, /RESPONDER_ASSET_ID/);
  assert.match(shipInterior, /SHIP_CREW_ASSET_ID/);
  assert.match(shipInterior, /activeSession\?\.sceneState\?\.crewLayer === group/);
  assert.match(shipInterior, /crewMeshes\.forEach\(\(mesh\) => mesh\.userData\.disposeCuratedCharacter/);
  assert.match(loader, /object\.skeleton\s*=\s*sourceMesh\.skeleton\.clone\(\)/);
  assert.match(loader, /instancePolicy/);
  assert.match(loader, /removeFromParent/);
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
