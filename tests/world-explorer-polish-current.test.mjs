import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { parse } from '@babel/parser';
import { createLifecycleScope } from '../app/js/runtime/lifecycle-scope.js';
import { createSpaceLaunchReadiness } from '../app/js/space/launch-readiness.js';
import { SPACE_CRAFT_IDENTITY } from '../app/js/space/craft-identity.js';
import { installSpaceTravelSession, SPACE_GUIDANCE_MODE, SPACE_TRAVEL_LOCATION, SPACE_TRAVEL_PHASE } from '../app/js/space/travel-session.js';
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

test('the parachute and Pathfinder pod are bounded local visual assets', () => {
  const expected = new Map([
    ['equipment-explorer-parachute-v1', '63f9af1d963509e5a9b440a615b5946fc6ca66c909d000f39cbfc903f7c1f9e6'],
    ['space-pathfinder-transfer-pod-v2', '1c7e5a363fbf766dd19fa45bb045f99bef5278dceb4afd6a94384527ffd4a489']
  ]);
  assert.equal(modelAssetsForRole('deployed-parachute-presentation').length, 1);
  assert.equal(modelAssetsForRole('space-transfer-pod-presentation').length, 1);
  assert.equal(modelAssetsForRole('expedition-starship-presentation').length, 0);
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

test('new parachute and pod models remain presentation-only while the original main ship stays authoritative', () => {
  const parachute = read('app/js/urban-sandbox/curated-parachute-visual.js');
  const pod = read('app/js/space/curated-expedition-pod.js');
  const podMesh = read('app/js/space/expedition-pod-mesh.js');
  assert.match(parachute, /presentationOnly = true/);
  assert.match(parachute, /catch \(error\)[\s\S]*setParachuteFallbackVisible\(host, true\)/);
  assert.match(pod, /presentationOnly = true/);
  assert.match(pod, /catch \(error\)[\s\S]*setPodFallbackVisible\(host, true\)/);
  assert.match(podMesh, /defaultPodFallback = true/);
  assert.match(podMesh, /attachCuratedExpeditionPod/);
  const starship = read('app/js/space/expedition-spacecraft-mesh.js');
  assert.match(starship, /visualStyle = 'horizon-class-retro-futurist'/);
  assert.match(starship, /originalDesign = true/);
  assert.doesNotMatch(starship, /attachCuratedExpeditionStarship/);
});

test('choosing Space starts visible manual free flight while Moon remains a separate destination', t => {
  const title = read('app/js/ui/title-screen.js');
  const space = read('app/js/space.js');
  assert.match(title, /launchMode === 'space'[\s\S]*startFreeSpaceFlight/);
  assert.match(title, /appCtx\.hideLoad\?\.\(\);[\s\S]*markFirstPlayReady/);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  // Execute the actual entry functions with real session/readiness owners.
  // Rendering is supplied separately by the assembled browser journey.
  const names = new Set(['beginSpaceFlightSession', 'startSpaceFlightToMoon', 'startFreeSpaceFlight']);
  const functions = parse(space, { sourceType: 'module' }).program.body
    .filter(node => node.type === 'FunctionDeclaration' && names.has(node.id.name))
    .map(node => space.slice(node.start, node.end)).join('\n');
  for (const freeFlight of [true, false]) {
    const pauses = new Set(), elements = new Map(); let manual = 0, assisted = 0;
    const appCtx = {
      ENV: { SPACE_FLIGHT: 'SPACE_FLIGHT' }, car: { x: 0, z: 0, angle: 0 }, scene: {},
      spaceFlight: { active: false, scene: {}, renderer: {}, camera: {}, canvas: { style: {} }, hud: { style: {} } },
      setPauseReason(reason, active) { if (active) pauses.add(reason); else pauses.delete(reason); },
      setEnvironmentTransitionActive() {},
      releaseRenderedJourneyToManualFlight() { manual++; },
      beginRenderedSpaceJourney() { assisted++; }
    };
    installSpaceTravelSession(appCtx);
    const noOp = () => {};
    const fixture = vm.runInNewContext(`let spaceSessionScope, spaceLaunchReadiness;\n${functions}\n({startFreeSpaceFlight,startSpaceFlightToMoon,dispose:()=>spaceSessionScope?.dispose()})`, {
      appCtx, createLifecycleScope, createSpaceLaunchReadiness,
      SPACE_CRAFT_IDENTITY, SPACE_GUIDANCE_MODE, SPACE_TRAVEL_LOCATION, SPACE_TRAVEL_PHASE,
      THREE: { Color: class {} }, console: { log: noOp },
      document: { getElementById(id) { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); } },
      beginEnvironmentTransition: () => ({}), commitEnvironment: () => true,
      captureEarthWorldSession: noOp, suspendEarthModesForPlanetaryEntry: noOp,
      emitTutorialEvent: noOp, prepareSpaceFlightHudForEntry: noOp, getPrimaryWorldCanvas: () => null,
      hideGameUI: noOp, ensureExtendedSpaceScene: noOp, leaseSpaceFlightResources: noOp,
      resetSpaceFlightForMoon: noOp, animateSpaceFlight: noOp, showFlightMessage: noOp
    });
    try {
      assert.equal(freeFlight ? fixture.startFreeSpaceFlight() : fixture.startSpaceFlightToMoon(), true);
      assert.equal(appCtx.spaceFlight.canvas.style.display, 'block');
      assert.equal(appCtx.spaceFlight.hud.style.display, 'block');
      assert.equal(elements.get('sfLandBtn').textContent, freeFlight ? 'SELECT A DESTINATION' : 'LAND ON MOON');
      assert.equal(manual, Number(freeFlight)); assert.equal(assisted, Number(!freeFlight));
      assert.equal(pauses.size, 1);
      t.mock.timers.tick(1000);
      assert.equal(pauses.size, 0); assert.equal(appCtx.spaceFlight.mode, 'flying');
      assert.equal(appCtx.getSpaceTravelSession().phase, freeFlight ? SPACE_TRAVEL_PHASE.FREE_FLIGHT : SPACE_TRAVEL_PHASE.ASCENT);
    } finally { fixture.dispose(); }
  }
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
