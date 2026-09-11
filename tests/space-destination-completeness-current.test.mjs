import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  getAstronomicalBody,
  LANDING_MODE,
  SOLAR_SYSTEM_EXPLORATION_DESTINATION_IDS
} from '../app/js/astronomy/body-catalog.js';
import { BODY_FIELD_NOTES } from '../app/js/planetary/field-activities.js';
import { getPhysicalEnvironmentProfile } from '../app/js/planetary/runtime/physical-environment.js';
import { listPlanetarySurfaceRegions } from '../app/js/planetary/runtime/surface-authority.js';
import { SOLID_WORLD_PACKS } from '../app/js/planetary/solid-world-runtime.js';
import { getAtmosphericExplorationProfile } from '../app/js/space/atmospheric-descent-authority.js';
import { completeFastTravelEvidence } from '../app/js/space/journey-runtime.js';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const publicBodies = SOLAR_SYSTEM_EXPLORATION_DESTINATION_IDS.map(getAstronomicalBody);
const publicSolidIds = publicBodies
  .filter((body) => body.exploration.landingMode === LANDING_MODE.SOLID_SURFACE)
  .map((body) => body.id);
const publicGiantIds = publicBodies
  .filter((body) => body.exploration.landingMode === LANDING_MODE.ATMOSPHERIC_DESCENT)
  .map((body) => body.id);

test('every public destination has one canonical physical environment', () => {
  for (const body of publicBodies) {
    assert.ok(body, 'public destinations must resolve canonically');
    const environment = getPhysicalEnvironmentProfile(body.id);
    assert.ok(environment, `${body.id} needs an environment profile`);
    assert.equal(environment.bodyId, body.id);
    assert.equal(environment.landingMode, body.exploration.landingMode);
  }
});

test('every generic public solid world has one surface pack, one stable manifest, and bundled source imagery', () => {
  const genericSolidIds = publicSolidIds.filter((id) => !['moon', 'mars'].includes(id));
  assert.deepEqual(Object.keys(SOLID_WORLD_PACKS), genericSolidIds);
  const manifestsByBody = new Map(listPlanetarySurfaceRegions().map((region) => [region.bodyId, region]));

  for (const bodyId of genericSolidIds) {
    const pack = SOLID_WORLD_PACKS[bodyId];
    assert.equal(pack.bodyId, bodyId);
    const publishedManifest = manifestsByBody.get(bodyId);
    assert.ok(publishedManifest, `${bodyId} needs a published surface manifest`);
    assert.equal(pack.manifest.regionId, publishedManifest.regionId);
    assert.equal(pack.manifest.addressKey, publishedManifest.addressKey);
    assert.equal(pack.manifest.rollbackId, publishedManifest.rollbackId);
    assert.equal(pack.manifest.address.bodyId, bodyId);
    assert.equal(pack.manifest.truthClass, 'modeled');
    assert.ok(pack.manifest.rollbackId);
    assert.ok(pack.title && pack.context && pack.representation);
    for (const asset of pack.manifest.assets) {
      const relativePath = asset.url.replace(/^\/app\//, 'app/');
      assert.ok(existsSync(`${repositoryRoot}${relativePath}`), `${bodyId} is missing ${asset.url}`);
    }
  }
});

test('every generic solid world uses the shared three-part fieldwork and Journal path', () => {
  for (const bodyId of Object.keys(SOLID_WORLD_PACKS)) {
    const activities = BODY_FIELD_NOTES[bodyId];
    assert.equal(activities?.length, 3, `${bodyId} needs three field activities`);
    assert.deepEqual(new Set(activities.map((entry) => entry[1])), new Set([
      'photograph', 'geology-inspect', 'habitat-survey'
    ]));
    assert.ok(activities.every((entry) => !/procedural encounter/i.test(entry.join(' '))));
  }
});

test('solid destinations complete the same evidence-gated journey instead of direct environment swaps', () => {
  for (const destinationBodyId of publicSolidIds) {
    const result = completeFastTravelEvidence({
      sourceBodyId: 'earth',
      destinationBodyId,
      epochMs: Date.UTC(2026, 7, 27, 16, 0, 0)
    });
    assert.equal(result.journey.destinationBodyId, destinationBodyId);
    assert.equal(result.journey.phase, 'surface');
    assert.deepEqual(result.journey.history.map((entry) => entry.to), [
      'launch', 'parking_orbit', 'transfer', 'approach', 'descent', 'surface'
    ]);
    assert.equal(result.landingEligibility.eligible, true);
    assert.equal(result.spacecraft.targetBodyId, destinationBodyId);
  }
});

test('giant destinations expose atmosphere journeys and never claim a surface', () => {
  assert.deepEqual(publicGiantIds, ['jupiter', 'saturn', 'uranus', 'neptune']);
  for (const bodyId of publicGiantIds) {
    const profile = getAtmosphericExplorationProfile(bodyId);
    assert.ok(profile, `${bodyId} needs an atmosphere journey profile`);
    assert.equal(profile.bodyId, bodyId);
    assert.equal(profile.solidSurfaceAvailable, false);
    assert.equal(SOLID_WORLD_PACKS[bodyId], undefined);
  }
});
