import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { getModelAsset, modelAssetsForRole } from '../app/js/assets/model-asset-catalog.js';
import { CURATED_ANIMAL_ASSET_BY_SPECIES } from '../app/js/discovery/curated-animal-visual.js';

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

function triangleCount(json) {
  return (json.meshes || []).reduce((total, mesh) => total + (mesh.primitives || []).reduce((meshTotal, primitive) => {
    const accessorIndex = primitive.indices ?? primitive.attributes?.POSITION;
    const count = json.accessors?.[accessorIndex]?.count || 0;
    return meshTotal + count / 3;
  }, 0), 0);
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

test('four local Quaternius cars cover common close traffic without replacing traffic authority', () => {
  const assets = modelAssetsForRole('close-traffic-vehicle');
  assert.deepEqual(assets.map((asset) => asset.id), [
    'traffic-compact-hatchback-v1',
    'traffic-four-door-sedan-v1',
    'traffic-trail-suv-v1',
    'traffic-city-taxi-v1'
  ]);
  const expectations = new Map([
    ['traffic-compact-hatchback-v1', {
      variantId: 'compact',
      hash: 'e5f5fa41c4434383b20287725c0e9d757cbd0f059eedc342ec265d32a195fe39',
      meshes: ['NormalCar2_Cube.002-Mesh', 'NormalCar2_BackWheels_Cylinder.003-Mesh', 'NormalCar2_FrontLeftWheel_Cylinder.015-Mesh', 'NormalCar2_FrontRightWheel_Cylinder.016-Mesh']
    }],
    ['traffic-four-door-sedan-v1', {
      variantId: 'sedan',
      hash: 'bf00f2f0386a25aa310abc0424d22586e46a59ee6c737e6b375c97c9f01bd462',
      meshes: ['NormalCar1_Cube.012-Mesh', 'NormalCar1_BackWheels_Cube.011-Mesh', 'NormalCar1_FrontLeftWheel_Cube.007-Mesh', 'NormalCar1_FrontRightWheel_Cube.008-Mesh']
    }],
    ['traffic-trail-suv-v1', {
      variantId: 'suv',
      hash: '1a9ce2bba813dca5005abab09715b01b8b5f4a9c48d7260463afdfeb876aa8b6',
      meshes: ['SUV_Cube-Mesh', 'SUV_BackWheels_Cylinder.009-Mesh', 'SUV_FrontLeftWheel_Cylinder.010-Mesh', 'SUV_FrontRightWheel_Cylinder.005-Mesh']
    }],
    ['traffic-city-taxi-v1', {
      variantId: 'taxi',
      hash: '14b2f982f8a501565702ecb56f917c82e9abae914fa3f76d2f622a8670598af1',
      meshes: ['Taxi_Cube.009-Mesh', 'Taxi_BackWheels_Cube.010-Mesh', 'Taxi_FrontLeftWheel_Cube.013-Mesh', 'Taxi_FrontRightWheel_Cube.014-Mesh']
    }]
  ]);
  for (const asset of assets) {
    const expected = expectations.get(asset.id);
    assert.deepEqual(asset.vehicleVariantIds, [expected.variantId]);
    assert.equal(asset.collisionPolicy, 'existing-road-vehicle-envelope');
    assert.deepEqual(asset.instancePolicy, { geometry: 'shared', materials: 'clone' });
    assert.equal(asset.budgets.maxInstances, 1);
    assert.equal(asset.license, 'CC0-1.0');
    assert.equal(asset.sourceUrl, 'https://quaternius.com/packs/cars.html');
    const file = path.join(root, asset.url.replace(/^\/app\//, 'app/'));
    const { bytes, json } = readGlbAssetMetadata(file);
    assert.ok(bytes.length <= asset.budgets.bytes);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), expected.hash);
    assert.deepEqual(json.extensionsRequired || [], []);
    assert.deepEqual(json.meshes.map((mesh) => mesh.name), expected.meshes);
    assert.equal(json.images?.length || 0, 0);
  }
});

test('curated traffic shells remain a bounded visual adapter over procedural vehicle behavior', () => {
  const adapter = fs.readFileSync(path.join(root, 'app/js/urban-sandbox/curated-traffic-vehicle.js'), 'utf8');
  const visual = fs.readFileSync(path.join(root, 'app/js/urban-sandbox/vehicle-visuals.js'), 'utf8');
  const runtime = fs.readFileSync(path.join(root, 'app/js/urban-sandbox/runtime.js'), 'utf8');
  assert.match(adapter, /defaultTrafficVehicleFallback/);
  assert.match(adapter, /existing-road-vehicle-envelope|collisionPolicy/);
  assert.match(adapter, /disposeCuratedTrafficVehicle/);
  assert.match(visual, /defaultTrafficVehicleFallback\s*=\s*true/);
  assert.match(visual, /condition\s*<\s*\.98/);
  assert.match(runtime, /curatedTrafficAssetOwners/);
  assert.match(runtime, /state\.mobile\s*\?\s*2\s*:\s*Object\.keys\(CURATED_TRAFFIC_ASSET_BY_VARIANT\)\.length/);
  assert.match(runtime, /promoteVehicle\?\.\(vehicle\.trafficAgentId\)/);
  assert.match(runtime, /disposeCuratedTrafficVehicle\?\.\(\)/);
  assert.match(runtime, /curatedAssetId:/);
});

test('locally bundled skinned Explorer families serve player choices, nearby NPCs, responders, and ship crew', () => {
  const playerAssets = modelAssetsForRole('player-character');
  const npcAssets = modelAssetsForRole('nearby-npc-character');
  const responderAssets = modelAssetsForRole('civic-responder-character');
  const crewAssets = modelAssetsForRole('ship-crew-character');
  assert.equal(playerAssets.length, 2);
  assert.equal(npcAssets.length, 4);
  assert.equal(responderAssets.length, 1);
  assert.equal(crewAssets.length, 1);
  assert.deepEqual(playerAssets.map((asset) => asset.id), [
    'character-field-explorer-v1',
    'character-field-explorer-woman-v1'
  ]);
  assert.deepEqual(npcAssets.map((asset) => asset.id), [
    'character-city-explorer-v1',
    'character-city-explorer-casual-v1',
    'character-city-explorer-woman-casual-v1',
    'character-city-explorer-woman-worker-v1'
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
    ['character-field-explorer-woman-v1', {
      hash: 'b76cf5acefdbb213add675bd1b822ebd41d232c6f0cb21969c981122d3b86a32',
      meshes: ['Cube.051', 'Cube.027', 'Cube.032', 'Cube.052']
    }],
    ['character-city-explorer-v1', {
      hash: '0dba57f454956ca5886a2d72e6c5a65f6dc9d45987dc3d47bfe419ff0d0b82b4',
      meshes: ['Cube.008', 'Cube.000', 'Cube.014', 'Cube.005']
    }],
    ['character-city-explorer-casual-v1', {
      hash: 'd6a8fc4ad8ef22104773eba260f211c6ec8d797f1f15c87207e0e4edf942d83d',
      meshes: ['Cube.010', 'Cube.003', 'Cube.015', 'Cube.019']
    }],
    ['character-city-explorer-woman-casual-v1', {
      hash: 'e406f91a5fc6f94cc2ee0df0bfcfcc4c8c4e3949412daeac586201b75df244a6',
      meshes: ['Cube.037', 'Cube.070', 'Cube.001', 'Cube.038']
    }],
    ['character-city-explorer-woman-worker-v1', {
      hash: '7ce26118c4ec96b06a920519982d1118d86600712261b19d4936e7c6135b40db',
      meshes: ['Cube.009', 'Cube.055', 'Cube.035', 'Cube.056']
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

test('six bundled animal models provide cohesive companion and wildlife upgrades', () => {
  const assets = modelAssetsForRole('nearby-wildlife-animal');
  assert.deepEqual(assets.map((asset) => asset.id), [
    'animal-trail-hound-husky-v1',
    'animal-pasture-cow-v1',
    'animal-field-horse-v1',
    'animal-heritage-pig-v1',
    'animal-white-tailed-deer-v1',
    'animal-woodland-fox-v1'
  ]);
  assert.deepEqual(CURATED_ANIMAL_ASSET_BY_SPECIES, {
    'trail-hound': 'animal-trail-hound-husky-v1',
    'field-retriever': 'animal-trail-hound-husky-v1',
    'park-terrier': 'animal-trail-hound-husky-v1',
    'pasture-cow': 'animal-pasture-cow-v1',
    'heritage-pig': 'animal-heritage-pig-v1',
    'field-horse': 'animal-field-horse-v1',
    'white-tailed-deer': 'animal-white-tailed-deer-v1',
    'woodland-fox': 'animal-woodland-fox-v1'
  });
  const expectations = new Map([
    ['animal-trail-hound-husky-v1', { hash: 'b29929034d1cdb3dca8c57e92d7cdb9b89bbaa0b8489561b904692995648d79e', triangles: 1920, meshes: ['Cube'] }],
    ['animal-pasture-cow-v1', { hash: '357383dcbd435cf7089f985487bb65f0b3aa1f713aefc6223e383ee9f9d2aca0', triangles: 2450, meshes: ['Cube'] }],
    ['animal-field-horse-v1', { hash: '0470f0b4d26f2533d461705c4ba3a4dc9754d95d815428bfb274ba85b7597cce', triangles: 2182, meshes: ['Cube'] }],
    ['animal-heritage-pig-v1', { hash: 'ed0697fed906a25a4ecec0d620c90757f6685cfc2067a7370d66bb819788d88b', triangles: 562, meshes: [null] }],
    ['animal-white-tailed-deer-v1', { hash: '75d88a0aa2f0569f8fbde28e4f8b0746b0adcab03018bac88e9326071dcdd1d6', triangles: 2098, meshes: ['Cube'] }],
    ['animal-woodland-fox-v1', { hash: '71e28dc471e8d0018ed2935273e63517860bb4ff84e6784320d6c5c650161086', triangles: 1848, meshes: ['Cube'] }]
  ]);
  for (const asset of assets) {
    const expected = expectations.get(asset.id);
    assert.ok(expected);
    assert.equal(asset.collisionPolicy, 'existing-animal-interaction-envelope');
    assert.deepEqual(asset.instancePolicy, { geometry: 'shared', materials: 'clone' });
    assert.equal(asset.license, 'CC0-1.0');
    assert.match(asset.sourceUrl, /^https:\/\/quaternius\.com\/packs\//);
    const file = path.join(root, asset.url.replace(/^\/app\//, 'app/'));
    const { bytes, json } = readGlbAssetMetadata(file);
    assert.ok(bytes.length <= asset.budgets.bytes);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), expected.hash);
    assert.deepEqual(json.extensionsRequired || [], []);
    assert.equal(json.skins?.length, 1);
    assert.deepEqual(json.meshes.map((mesh) => mesh.name || null), expected.meshes);
    assert.equal(triangleCount(json), expected.triangles);
    assert.ok(triangleCount(json) <= asset.budgets.triangles);
    assert.ok(Object.values(asset.animationClips).every((name) => json.animations.some((clip) => clip.name === name)));
    assert.equal(json.images?.length || 0, 0);
  }
});

test('curated animals remain visual adapters over companion and wildlife authority with safe fallbacks', () => {
  const procedural = fs.readFileSync(path.join(root, 'app/js/discovery/animal-models.js'), 'utf8');
  const adapter = fs.readFileSync(path.join(root, 'app/js/discovery/curated-animal-visual.js'), 'utf8');
  const companions = fs.readFileSync(path.join(root, 'app/js/discovery/companion-runtime.js'), 'utf8');
  const wildlife = fs.readFileSync(path.join(root, 'app/js/discovery/wildlife-runtime.js'), 'utf8');
  const fieldEquipment = fs.readFileSync(path.join(root, 'app/js/discovery/field-equipment.js'), 'utf8');
  const arPresentation = fs.readFileSync(path.join(root, 'app/js/ar/presentation.js'), 'utf8');
  assert.match(procedural, /defaultAnimalFallback\s*=\s*true/);
  assert.match(adapter, /setFallbackVisible\(host, false\)/);
  assert.match(adapter, /setFallbackVisible\(host, true\)/);
  assert.ok(adapter.indexOf('setFallbackVisible(host, false)') < adapter.indexOf('await loadModelAsset'));
  assert.match(adapter, /curatedAnimalLoadToken/);
  assert.match(adapter, /disposeCuratedAnimal/);
  assert.equal(CURATED_ANIMAL_ASSET_BY_SPECIES['harbor-cat'], undefined);
  assert.equal(CURATED_ANIMAL_ASSET_BY_SPECIES['hill-goat'], undefined);
  assert.equal(CURATED_ANIMAL_ASSET_BY_SPECIES['wool-sheep'], undefined);
  assert.equal(CURATED_ANIMAL_ASSET_BY_SPECIES['yard-chicken'], undefined);
  assert.equal(CURATED_ANIMAL_ASSET_BY_SPECIES['city-pigeon'], undefined);
  assert.match(companions, /createAnimalModel\(THREE, catalogId/);
  assert.match(companions, /attachCuratedAnimalVisual\(THREE, group/);
  assert.match(companions, /interaction === 'feed' \? 'eat' : 'idle'/);
  assert.match(companions, /resolveCompanionTravelPolicy\(active, mode, environment\)/);
  assert.match(companions, /visibleFallbackMeshCount/);
  assert.match(wildlife, /compileAmbientWildlifePlan/);
  assert.match(wildlife, /attachCuratedAnimalVisual\(THREE, mesh\.group/);
  assert.match(wildlife, /sampleDiscoverySurfaceY/);
  assert.match(wildlife, /visibleFallbackMeshCount/);
  assert.match(fieldEquipment, /attachCuratedAnimalVisual\(THREE, curatedHost/);
  assert.match(fieldEquipment, /updateCuratedAnimalAnimation\(fieldReveal, dt, 'idle'\)/);
  assert.match(arPresentation, /addAnimal\(model, request\.companion\.catalogId\)/);
  assert.match(arPresentation, /addAnimal\(model, animalSpecies\)/);
  assert.match(arPresentation, /disposeCuratedAnimals/);
});

test('player gender choice persists and every promoted nearby NPC receives a balanced family asset', () => {
  const preference = fs.readFileSync(path.join(root, 'app/js/walking/player-character-preference.js'), 'utf8');
  const walking = fs.readFileSync(path.join(root, 'app/js/walking/character.js'), 'utf8');
  const shell = fs.readFileSync(path.join(root, 'app/index.html'), 'utf8');
  const urbanRuntime = fs.readFileSync(path.join(root, 'app/js/urban-sandbox/runtime.js'), 'utf8');
  assert.match(preference, /we3d\.player-character-gender\.v1/);
  assert.match(preference, /\['man', 'woman'\]/);
  assert.match(preference, /localStorage\.setItem/);
  assert.match(walking, /EXPLORER_ASSET_BY_GENDER/);
  assert.match(walking, /requestedCuratedCharacterAssetId/);
  assert.match(fs.readFileSync(path.join(root, 'app/js/walking/curated-explorer-character.js'), 'utf8'), /curatedCharacterLoadToken/);
  assert.match(shell, /data-player-character-gender="man"/);
  assert.match(shell, /data-player-character-gender="woman"/);
  assert.match(urbanRuntime, /function selectCuratedNpcAsset/);
  assert.match(urbanRuntime, /Math\.ceil\(state\.npcBudget\s*\/\s*NEARBY_NPC_ASSET_IDS\.length\)/);
  assert.match(urbanRuntime, /state\.curatedNpcAssetOwners\.set\(npc\.id, curatedAssetId\)/);
  assert.doesNotMatch(urbanRuntime, /curatedLimit/);
});

test('the curated car is requested by the existing drive-mode authority, not by a parallel controller', () => {
  const sceneBootstrap = fs.readFileSync(path.join(root, 'app/js/engine/scene-bootstrap.js'), 'utf8');
  const adapter = fs.readFileSync(path.join(root, 'app/js/engine/curated-player-car.js'), 'utf8');
  const travelMode = fs.readFileSync(path.join(root, 'app/js/travel-mode.js'), 'utf8');
  assert.match(sceneBootstrap, /ensureCuratedPlayerCar\s*=\s*\(\)\s*=>\s*attachCuratedPlayerCar/);
  assert.match(sceneBootstrap, /void appCtx\.ensureCuratedPlayerCar\(\)/);
  assert.match(adapter, /fallbackParts\.forEach\(\(child\) => \{ child\.visible = false; \}\)/);
  assert.match(adapter, /curatedVehicleLoadPromise/);
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
