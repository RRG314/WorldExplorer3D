import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SOLID_SURFACE_TRAVEL_CAPABILITIES,
  isPlanetarySurfaceActive,
  resolvePlanetaryTravelCapabilities
} from '../app/js/planetary/traversal-capabilities.js';
import { SOLID_WORLD_PACKS } from '../app/js/planetary/solid-world-runtime.js';
import {
  desiredPlanetaryCharacter,
  isPlanetaryCharacterRequestCurrent
} from '../app/js/planetary/astronaut.js';
import { resolveWalkingMoveVector } from '../app/js/walking/physics.js';

test('every landable solid-world pack supports explorer, rover, and drone traversal but not aircraft', () => {
  for (const pack of Object.values(SOLID_WORLD_PACKS)) {
    assert.deepEqual(pack.capabilities, SOLID_SURFACE_TRAVEL_CAPABILITIES);
    assert.equal(pack.capabilities.walk, true, pack.bodyId);
    assert.equal(pack.capabilities.drive, true, pack.bodyId);
    assert.equal(pack.capabilities.drone, true, pack.bodyId);
    assert.equal(pack.capabilities.plane, false, pack.bodyId);
  }
});

test('Moon, Mars, and catalog solid worlds all resolve through one traversal policy', () => {
  for (const state of [{ onMoon: true }, { onMars: true }, { activePlanetaryBodyId: 'europa' }]) {
    assert.equal(isPlanetarySurfaceActive(state), true);
    assert.equal(resolvePlanetaryTravelCapabilities(state), SOLID_SURFACE_TRAVEL_CAPABILITIES);
  }
  assert.equal(resolvePlanetaryTravelCapabilities({}), null);
});

test('planetary explorer reuses the bundled animated Solis Reach crew suit', () => {
  const moon = desiredPlanetaryCharacter('moon');
  const mars = desiredPlanetaryCharacter('mars');
  const europa = desiredPlanetaryCharacter('europa');
  assert.equal(moon.assetId, 'character-ship-crew-v1');
  assert.equal(mars.assetId, moon.assetId);
  assert.equal(europa.assetId, moon.assetId);
  assert.equal(europa.role, 'planetary-player-character');
});

test('desktop WASD produces complete, normalized walking translation', () => {
  const forward = resolveWalkingMoveVector({ forward: 1, yaw: 0, speed: 2.8, dt: 1 });
  const backward = resolveWalkingMoveVector({ forward: -1, yaw: 0, speed: 2.8, dt: 1 });
  const left = resolveWalkingMoveVector({ strafe: -1, yaw: 0, speed: 2.8, dt: 1 });
  const right = resolveWalkingMoveVector({ strafe: 1, yaw: 0, speed: 2.8, dt: 1 });
  const diagonal = resolveWalkingMoveVector({ forward: 1, strafe: 1, yaw: 0, speed: 2.8, dt: 1 });
  assert.ok(Math.abs(forward.x) < 1e-10 && Math.abs(forward.z - 2.8) < 1e-10);
  assert.ok(Math.abs(backward.x) < 1e-10 && Math.abs(backward.z + 2.8) < 1e-10);
  assert.ok(Math.abs(left.x - 2.8) < 1e-10 && Math.abs(left.z) < 1e-10);
  assert.ok(Math.abs(right.x + 2.8) < 1e-10 && Math.abs(right.z) < 1e-10);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.z) - 2.8) < 1e-10);
});

test('Earth explorer restoration remains valid while its host is temporarily off-scene', () => {
  const detachedCharacter = {
    parent: null,
    userData: { requestedCuratedCharacterAssetId: 'character-field-explorer-woman-v1' }
  };
  assert.equal(isPlanetaryCharacterRequestCurrent({
    requestId: 14,
    currentRequestId: 14,
    character: detachedCharacter,
    currentCharacter: detachedCharacter,
    assetId: 'character-field-explorer-woman-v1'
  }), true);
  assert.equal(isPlanetaryCharacterRequestCurrent({
    requestId: 13,
    currentRequestId: 14,
    character: detachedCharacter,
    currentCharacter: detachedCharacter,
    assetId: 'character-field-explorer-woman-v1'
  }), false);
  assert.equal(isPlanetaryCharacterRequestCurrent({
    requestId: 14,
    currentRequestId: 14,
    character: detachedCharacter,
    currentCharacter: { userData: {} },
    assetId: 'character-field-explorer-woman-v1'
  }), false);
});
