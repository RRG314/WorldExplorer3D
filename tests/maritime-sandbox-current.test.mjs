import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MARITIME_CATALOG } from '../app/js/transport/maritime-catalog.js';
import { createBoatOceanTransferApi } from '../app/js/boat-mode/ocean-transfer.js';

test('all seven vessel classes use the shared playable transport contract', () => {
  assert.deepEqual(MARITIME_CATALOG.map(({ id }) => id), [
    'marina-runabout',
    'cruising-sailboat',
    'coastal-workboat',
    'harbor-tug',
    'passenger-ferry',
    'ocean-research-vessel',
    'container-cargo-ship'
  ]);
  for (const entry of MARITIME_CATALOG) {
    assert.equal(entry.domain, 'maritime');
    assert.equal(entry.playable, true);
    assert.equal(entry.enterable, true);
    assert.equal(entry.interaction.companionAboard, true);
    assert.equal(entry.rights.kind, 'original-generic-design');
    assert.equal(entry.rights.brand, 'unbranded');
    assert.match(entry.visual.referenceEvidence, /maritime-fleet-and-damage-2026-08-29\.png$/);
    assert.ok(entry.dimensions.draft > 0);
    assert.equal(entry.performance.topSpeedUnit, 'knots');
  }
});

test('large ports include playable ferry, research, tug, and cargo classes without pretending OSM maps vessels', () => {
  const large = MARITIME_CATALOG.filter(({ role }) => ['tug', 'ferry', 'research', 'cargo'].includes(role));
  assert.deepEqual(large.map(({ role }) => role), ['tug', 'ferry', 'research', 'cargo']);
  assert.equal(large.every(({ dimensions }) => dimensions.length >= 28), true);
  assert.equal(large.every(({ damage }) => damage.durabilityPolicy === 'heavy_duty'), true);
  assert.equal(MARITIME_CATALOG.every(({ mapped }) => mapped !== true), true);
});

test('maritime activity adapts the existing Boat Mode and shared lifecycle rather than adding a second controller', async () => {
  const [runtime, boatMode, model, dynamics, camera, actor, lifecycle, reset] = await Promise.all([
    readFile(new URL('../app/js/transport/maritime-runtime.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/js/boat-mode.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/js/boat-mode/boat-model.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/js/boat-mode/runtime-dynamics.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/js/hud/boat-camera.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/js/transport/actor-contract.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/js/world/load-runtime-session.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/js/world/load-reset.js', import.meta.url), 'utf8')
  ]);
  assert.match(runtime, /registerContextInteraction/);
  assert.match(runtime, /setTravelMode\?\.\('boat'/);
  assert.match(runtime, /generated-gameplay-activity/);
  assert.doesNotMatch(runtime, /mapped:\s*true/);
  assert.match(boatMode, /getMaritimeCatalogEntry/);
  assert.match(model, /createVesselVisual/);
  assert.doesNotMatch(model, /createLegacyBoatModeMesh/);
  assert.match(dynamics, /catalog\.performance\.topSpeed/);
  assert.match(dynamics, /onBoatImpact/);
  assert.match(boatMode, /applyTransportDamage/);
  assert.match(boatMode, /updateVesselVisual/);
  assert.match(camera, /catalog\.dimensions\.length/);
  assert.match(actor, /getMaritimeCatalogEntry/);
  assert.match(lifecycle, /startMaritimeRuntime/);
  assert.match(reset, /disposeMaritimeRuntime/);
  assert.doesNotMatch(runtime, /Baltimore|Rotterdam/);
  assert.doesNotMatch(runtime, /Generated fleet at mapped/);
});

test('ocean transfer keeps the selected vessel identity and condition', async () => {
  const candidate = { spawnX: 4, spawnZ: 8, waterKind: 'open_ocean' };
  const travelCalls = [];
  const appCtx = {
    SCALE: 1000,
    ENV: { EARTH: 'EARTH' },
    boat: { x: 12, z: 18, angle: .7 },
    boatMode: {
      active: true,
      available: true,
      transportEntityId: 'generated-vessel:test:research',
      transportCatalogId: 'ocean-research-vessel',
      condition: .63,
      mesh: { visible: true },
      waterPatch: { visible: true }
    },
    customLoc: { name: 'Test Water' },
    oceanMode: { active: false },
    worldToLatLon: () => ({ lat: 12, lon: 34 }),
    startOceanMode(options) {
      this.oceanMode = {
        active: true,
        launchSite: options.launchSite,
        submarine: { position: { x: 0, z: 0 }, yaw: .7 }
      };
      return true;
    },
    setTravelMode(mode, options) {
      travelCalls.push({ mode, options });
      this.boatMode.active = true;
      return mode;
    },
    setCustomLocation() {},
    exitCurrentEnvironmentSync() {},
    commitEnvironment() {}
  };
  const originalDocument = globalThis.document;
  globalThis.document = { getElementById: () => null };
  try {
    const api = createBoatOceanTransferApi({
      appCtx,
      buildSyntheticBoatCandidate: () => candidate,
      canDiveBoatMode: () => true,
      captureEarthWorldSession() {},
      findNearestBoatCandidate: () => candidate,
      hideBoatPrompt() {},
      maxCandidateDistance: 58,
      promptDurationMs: 100,
      resetBoatDynamics() {},
      resetBoatFoamFx() {},
      setPromptSignature() {},
      showBoatPrompt() {},
      startBoatMode: () => false,
      updateBoatMenuUi() {},
      updateWaterWaveVisuals() {},
      restoreEarthSurfaceLayers() {}
    });
    assert.equal(await api.transferBoatToSubmarine(), true);
    assert.deepEqual(appCtx.boatMode.oceanTransferVessel, {
      transportEntityId: 'generated-vessel:test:research',
      transportCatalogId: 'ocean-research-vessel',
      condition: .63
    });
    assert.equal(await api.transferSubmarineToBoat(), true);
    assert.equal(travelCalls.length, 1);
    assert.equal(travelCalls[0].mode, 'boat');
    assert.equal(travelCalls[0].options.transportEntityId, 'generated-vessel:test:research');
    assert.equal(travelCalls[0].options.transportCatalogId, 'ocean-research-vessel');
    assert.equal(travelCalls[0].options.condition, .63);
    assert.equal(appCtx.boatMode.oceanTransferVessel, null);
  } finally {
    globalThis.document = originalDocument;
  }
});
