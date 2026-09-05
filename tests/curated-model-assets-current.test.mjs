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

test('local curated models cover every road-traffic variant and the response fleet', () => {
  const assets = modelAssetsForRole('road-vehicle-presentation');
  const coveredVariants = [...new Set(assets.flatMap((asset) => asset.vehicleVariantIds || []))].sort();
  assert.deepEqual(coveredVariants, [
    'box_truck', 'city_bus', 'compact', 'delivery_van', 'pickup', 'responder', 'sedan', 'suv', 'taxi', 'van'
  ]);
  assert.equal(modelAssetsForRole('responder-road-vehicle').length, 1);
  for (const asset of assets) {
    assert.ok(['existing-road-vehicle-envelope', 'existing-responder-vehicle-envelope'].includes(asset.collisionPolicy));
    assert.deepEqual(asset.instancePolicy, { geometry: 'shared', materials: 'clone' });
    assert.ok(asset.budgets.maxInstances >= 8);
    assert.match(asset.url, /^\/app\/assets\/models\/vehicles\/traffic\//);
    const file = path.join(root, asset.url.replace(/^\/app\//, 'app/'));
    const { bytes, json } = readGlbAssetMetadata(file);
    assert.ok(bytes.length <= asset.budgets.bytes);
    assert.deepEqual(json.extensionsRequired || [], []);
  }
});

test('traffic, responder, and player cars are curated-only and fail closed', () => {
  const adapter = fs.readFileSync(path.join(root, 'app/js/urban-sandbox/curated-traffic-vehicle.js'), 'utf8');
  const visual = fs.readFileSync(path.join(root, 'app/js/urban-sandbox/vehicle-visuals.js'), 'utf8');
  const runtime = fs.readFileSync(path.join(root, 'app/js/urban-sandbox/runtime.js'), 'utf8');
  const population = fs.readFileSync(path.join(root, 'app/js/living-world/population.js'), 'utf8');
  const responder = fs.readFileSync(path.join(root, 'app/js/urban-sandbox/responder-runtime.js'), 'utf8');
  const sceneBootstrap = fs.readFileSync(path.join(root, 'app/js/engine/scene-bootstrap.js'), 'utf8');
  assert.doesNotMatch(adapter, /defaultTrafficVehicleFallback|keeping the built-in vehicle/);
  assert.match(adapter, /existing-road-vehicle-envelope|collisionPolicy/);
  assert.match(adapter, /disposeCuratedTrafficVehicle/);
  assert.match(adapter, /vehicle remains hidden/);
  assert.match(visual, /proceduralVehicleMeshCount\s*=\s*0/);
  assert.doesNotMatch(visual, /new THREE\.Mesh\s*\(/);
  assert.doesNotMatch(population, /vehicleParts|Living World Traffic Rounded Bodies|Living World Traffic Cabins/);
  assert.match(population, /vehiclePresentation:\s*'curated-only-local-models'/);
  assert.match(population, /proceduralVehicleMeshes:\s*0/);
  assert.match(population, /POPULATION_STEP_SECONDS\s*=\s*1\s*\/\s*30/);
  assert.match(population, /connectNearby:\s*true/);
  assert.match(population, /agent\.bridge\s*=\s*\{/);
  assert.doesNotMatch(runtime, /curatedTrafficAssetOwners/);
  assert.match(runtime, /promoteVehicle\?\.\(vehicle\.trafficAgentId\)/);
  assert.match(runtime, /curatedAssetId:/);
  assert.match(responder, /CURATED_RESPONDER_ASSET_ID/);
  assert.match(responder, /pursuitMode:\s*'cross-terrain-direct'/);
  assert.match(responder, /OFFICER_DEPLOY_DISTANCE\s*=\s*10/);
  assert.match(sceneBootstrap, /proceduralVehicleMeshCount\s*=\s*0/);
  assert.doesNotMatch(sceneBootstrap, /createClassicUtilityCar/);
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

test('player retains recovery while every NPC role is curated-only', () => {
  const walking = fs.readFileSync(path.join(root, 'app/js/walking/character.js'), 'utf8');
  const playerFallback = fs.readFileSync(path.join(root, 'app/js/walking/field-navigator-mesh.js'), 'utf8');
  const walkingPhysics = fs.readFileSync(path.join(root, 'app/js/walking/physics.js'), 'utf8');
  const npcVisuals = fs.readFileSync(path.join(root, 'app/js/urban-sandbox/npc-visuals.js'), 'utf8');
  const population = fs.readFileSync(path.join(root, 'app/js/living-world/population.js'), 'utf8');
  const urbanRuntime = fs.readFileSync(path.join(root, 'app/js/urban-sandbox/runtime.js'), 'utf8');
  const responderRuntime = fs.readFileSync(path.join(root, 'app/js/urban-sandbox/responder-runtime.js'), 'utf8');
  const shipInterior = fs.readFileSync(path.join(root, 'app/js/expedition/ship-interior.js'), 'utf8');
  const loader = fs.readFileSync(path.join(root, 'app/js/assets/model-asset-runtime.js'), 'utf8');
  assert.match(walking, /attachCuratedExplorerCharacter\(THREE, character/);
  assert.match(walkingPhysics, /Number\(actions\.sprint\)\s*>\s*0\.05/);
  assert.match(playerFallback, /defaultCharacterFallback\s*=\s*true/);
  assert.match(npcVisuals, /characterStyle\s*=\s*'curated-only-local-model'/);
  assert.match(npcVisuals, /proceduralCharacterMeshCount\s*=\s*0/);
  assert.match(npcVisuals, /proceduralEquipmentMeshCount\s*=\s*0/);
  assert.doesNotMatch(npcVisuals, /new THREE\.(?:Box|Cylinder|Sphere|Capsule|Cone)Geometry/);
  assert.match(population, /pedestrianRepresentation:\s*'curated-only-local-models'/);
  assert.match(population, /proceduralPedestrianMeshes:\s*0/);
  assert.match(urbanRuntime, /curatedNpcAssetOwners/);
  assert.match(responderRuntime, /RESPONDER_ASSET_ID/);
  assert.match(shipInterior, /SHIP_CREW_ASSET_ID/);
  assert.match(shipInterior, /activeSession\?\.sceneState\?\.crewLayer === group/);
  assert.match(shipInterior, /proceduralCharacterMeshCount\s*=\s*0/);
  assert.match(shipInterior, /failClosed:\s*true/);
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
  const account = fs.readFileSync(path.join(root, 'account/index.html'), 'utf8');
  const urbanRuntime = fs.readFileSync(path.join(root, 'app/js/urban-sandbox/runtime.js'), 'utf8');
  assert.match(preference, /we3d\.player-character-gender\.v1/);
  assert.match(preference, /\['man', 'woman'\]/);
  assert.match(preference, /localStorage\.setItem/);
  assert.match(walking, /EXPLORER_ASSET_BY_GENDER/);
  assert.match(walking, /requestedCuratedCharacterAssetId/);
  assert.match(fs.readFileSync(path.join(root, 'app/js/walking/curated-explorer-character.js'), 'utf8'), /curatedCharacterLoadToken/);
  assert.doesNotMatch(shell, /data-player-character-gender=/);
  assert.match(account, /data-account-character-gender="man"/);
  assert.match(account, /data-account-character-gender="woman"/);
  assert.match(urbanRuntime, /function selectCuratedNpcAsset/);
  assert.match(urbanRuntime, /state\.curatedNpcAssetCursor\s*=\s*\(start\s*\+\s*1\)\s*%\s*NEARBY_NPC_ASSET_IDS\.length/);
  assert.match(urbanRuntime, /state\.curatedNpcAssetOwners\.set\(npc\.id, curatedAssetId\)/);
  assert.doesNotMatch(urbanRuntime, /curatedLimit/);
});

test('the curated car is requested by the existing drive-mode authority, not by a parallel controller', () => {
  const sceneBootstrap = fs.readFileSync(path.join(root, 'app/js/engine/scene-bootstrap.js'), 'utf8');
  const adapter = fs.readFileSync(path.join(root, 'app/js/engine/curated-player-car.js'), 'utf8');
  const travelMode = fs.readFileSync(path.join(root, 'app/js/travel-mode.js'), 'utf8');
  assert.match(sceneBootstrap, /ensureCuratedPlayerCar\s*=\s*\(\)\s*=>\s*attachCuratedPlayerCar/);
  assert.match(sceneBootstrap, /void appCtx\.ensureCuratedPlayerCar\(\)/);
  assert.doesNotMatch(adapter, /fallbackParts|built-in vehicle/);
  assert.match(adapter, /player vehicle remains hidden/);
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
