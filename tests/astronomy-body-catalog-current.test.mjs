import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ASTRONOMICAL_BODIES,
  BODY_CATALOG_VERSION,
  BODY_CLASS,
  getAstronomicalBody,
  getBodySource,
  LANDING_MODE,
  listAstronomicalBodies,
  normalizeAstronomicalBodyId,
  SOLAR_SYSTEM_EXPLORATION_DESTINATION_IDS,
  SOLAR_SYSTEM_PLANET_IDS
} from '../app/js/astronomy/body-catalog.js';
import { PLANETARY_BODIES } from '../app/js/planetary/catalog.js';
import { SOLAR_SYSTEM_PLANETS } from '../app/js/solar-system/catalog.js';

test('catalog publishes one immutable record for all eight planets', () => {
  assert.equal(BODY_CATALOG_VERSION, '1.1.0');
  assert.deepEqual(SOLAR_SYSTEM_PLANET_IDS, [
    'mercury', 'venus', 'earth', 'mars',
    'jupiter', 'saturn', 'uranus', 'neptune'
  ]);
  assert.equal(new Set(SOLAR_SYSTEM_PLANET_IDS).size, 8);
  assert.ok(Object.isFrozen(ASTRONOMICAL_BODIES));

  for (const id of SOLAR_SYSTEM_PLANET_IDS) {
    const body = getAstronomicalBody(id);
    assert.ok(body, `${id} must resolve`);
    assert.equal(body.catalogVersion, BODY_CATALOG_VERSION);
    assert.ok(Object.isFrozen(body));
    assert.ok(Object.isFrozen(body.physical));
    assert.ok(body.physical.massKg > 0);
    assert.ok(body.physical.meanRadiusM > 1_000_000);
    assert.ok(body.physical.escapeVelocityMps > 0);
    assert.ok(body.physical.orbitalPeriodS > 0);
    assert.ok(body.frames.inertial);
    assert.ok(body.frames.bodyFixed);
  }
});

test('the public solar-system route list contains only implemented reviewed destinations', () => {
  assert.deepEqual(SOLAR_SYSTEM_EXPLORATION_DESTINATION_IDS, [
    'moon', 'mercury', 'venus', 'mars',
    'jupiter', 'io', 'europa',
    'saturn', 'titan', 'enceladus', 'uranus', 'neptune', 'triton',
    'ceres', 'vesta', 'pluto'
  ]);
  assert.equal(new Set(SOLAR_SYSTEM_EXPLORATION_DESTINATION_IDS).size, SOLAR_SYSTEM_EXPLORATION_DESTINATION_IDS.length);
  for (const id of SOLAR_SYSTEM_EXPLORATION_DESTINATION_IDS) {
    const body = getAstronomicalBody(id);
    assert.ok(body, `${id} must resolve through the canonical catalog`);
    assert.notEqual(body.exploration.landingMode, LANDING_MODE.NOT_EXPLORABLE);
  }
});

test('cataloged regional moons remain hidden until they own distinctive surface packs', () => {
  for (const id of ['phobos', 'deimos', 'ganymede', 'callisto']) {
    const body = getAstronomicalBody(id);
    assert.equal(body.exploration.experienceTier, 'regional');
    assert.equal(SOLAR_SYSTEM_EXPLORATION_DESTINATION_IDS.includes(id), false);
  }
  for (const id of ['io', 'europa', 'titan', 'enceladus', 'triton', 'ceres', 'vesta', 'pluto']) {
    assert.equal(getAstronomicalBody(id).exploration.experienceTier, 'featured');
    assert.equal(SOLAR_SYSTEM_EXPLORATION_DESTINATION_IDS.includes(id), true);
  }
});

test('body lookup normalizes names without inventing unknown destinations', () => {
  assert.equal(normalizeAstronomicalBodyId(' Earth '), 'earth');
  assert.equal(normalizeAstronomicalBodyId('Luna'), 'moon');
  assert.equal(getAstronomicalBody('MARS')?.id, 'mars');
  assert.equal(getAstronomicalBody('not-a-body'), null);
});

test('giant planets expose atmospheric descent and never a solid surface', () => {
  const giants = listAstronomicalBodies().filter((body) => (
    body.bodyClass === BODY_CLASS.GAS_GIANT || body.bodyClass === BODY_CLASS.ICE_GIANT
  ));
  assert.deepEqual(giants.map((body) => body.id), ['jupiter', 'saturn', 'uranus', 'neptune']);
  for (const body of giants) {
    assert.equal(body.exploration.landingMode, LANDING_MODE.ATMOSPHERIC_DESCENT);
    assert.equal(body.exploration.surfaceRegionEligible, false);
    assert.equal(body.presentation.surfaceLabel, null);
  }
});

test('solid planets and the Moon retain distinct environment capabilities', () => {
  assert.equal(getAstronomicalBody('mercury').atmosphere.class, 'exosphere');
  assert.equal(getAstronomicalBody('venus').atmosphere.class, 'dense');
  assert.equal(getAstronomicalBody('earth').exploration.preserveExistingWorldCompiler, true);
  assert.equal(getAstronomicalBody('moon').parentId, 'earth');
  assert.equal(getAstronomicalBody('mars').atmosphere.class, 'thin');
  assert.equal(getAstronomicalBody('venus').exploration.requiresProtectedSurfaceCapability, true);
});

test('every canonical fact record resolves its reviewed source metadata', () => {
  for (const body of Object.values(ASTRONOMICAL_BODIES)) {
    assert.ok(body.provenance.sourceIds.length > 0, `${body.id} has no sources`);
    for (const sourceId of body.provenance.sourceIds) {
      const source = getBodySource(sourceId);
      assert.ok(source, `${body.id} references missing source ${sourceId}`);
      assert.match(source.url, /^https:\/\//);
      assert.equal(source.reviewedAt, '2026-08-27');
    }
  }
});

test('legacy Earth Moon Mars projection consumes the canonical catalog', () => {
  for (const id of ['earth', 'moon', 'mars']) {
    const canonical = getAstronomicalBody(id);
    const projected = PLANETARY_BODIES[id];
    assert.equal(projected.id, canonical.id);
    assert.equal(projected.gravity, canonical.physical.surfaceGravityMps2);
    assert.equal(projected.radiusKm, canonical.physical.meanRadiusM / 1000);
    assert.equal(projected.texture, canonical.presentation.globalTexturePath);
    assert.equal(projected.landingMode, canonical.exploration.landingMode);
    assert.equal(projected.bodyCatalogVersion, BODY_CATALOG_VERSION);
  }
});

test('solar-system render projection no longer owns physical body facts', () => {
  assert.equal(SOLAR_SYSTEM_PLANETS.length, 8);
  SOLAR_SYSTEM_PLANETS.forEach((projected, index) => {
    const canonical = getAstronomicalBody(SOLAR_SYSTEM_PLANET_IDS[index]);
    assert.equal(projected.bodyId, canonical.id);
    assert.equal(projected.name, canonical.name);
    assert.equal(projected.massKg, canonical.physical.massKg);
    assert.equal(projected.physicalRadiusKm, canonical.physical.meanRadiusM / 1000);
    assert.equal(projected.texture, canonical.presentation.globalTexturePath);
    assert.equal(projected.landingMode, canonical.exploration.landingMode);
    assert.equal(projected.bodyCatalogVersion, BODY_CATALOG_VERSION);
    assert.ok(projected.radiusScaled > 0, `${canonical.id} needs an explicit visual radius`);
    assert.ok(Number.isFinite(projected.a0), `${canonical.id} needs its orbit approximation`);
  });
});

test('current Earth Moon Mars compatibility values remain unchanged', () => {
  assert.deepEqual(
    ['earth', 'moon', 'mars'].map((id) => ({
      id,
      gravity: PLANETARY_BODIES[id].gravity,
      radiusKm: PLANETARY_BODIES[id].radiusKm,
      texture: PLANETARY_BODIES[id].texture
    })),
    [
      { id: 'earth', gravity: 9.80665, radiusKm: 6371, texture: '/app/assets/textures/earth_atmos_2048.jpg' },
      { id: 'moon', gravity: 1.62, radiusKm: 1737.4, texture: '/app/assets/textures/moon_lroc_2048.jpg' },
      { id: 'mars', gravity: 3.71, radiusKm: 3389.5, texture: '/app/assets/textures/mars_viking_4096.jpg' }
    ]
  );
});
