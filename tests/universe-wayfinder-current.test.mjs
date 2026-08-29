import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getUniverseDestinations,
  getUniverseFrame,
  resolveUniverseAddress
} from '../app/js/universe/catalog.js';
import {
  derivePlanetVisualProfile,
  deriveStarVisualProfile,
  stellarClassForTemperature
} from '../app/js/universe/body-visual-profile.js';
import {
  courseTargetsFrame,
  createUniverseCourse,
  setUniverseCourseStatus
} from '../app/js/universe/course-authority.js';

test('Wayfinder exposes every catalog planet as a unique first-class destination', () => {
  const destinations = getUniverseDestinations();
  const planets = destinations.filter((destination) => destination.objectClass === 'exoplanet');
  const systems = destinations.filter((destination) => destination.objectClass === 'planetary_system');
  const expectedPlanetCount = systems.reduce((total, system) => total + system.children.length, 0);
  assert.equal(planets.length, expectedPlanetCount);
  assert.equal(new Set(planets.map((planet) => planet.id)).size, planets.length);
  for (const planet of planets) {
    assert.equal(resolveUniverseAddress(planet.id), planet);
    assert.equal(resolveUniverseAddress(planet.address), planet);
    assert.equal(getUniverseFrame(planet)?.id, planet.parentFrameId);
    assert.match(planet.address, /\/planets\//);
    assert.ok(planet.provenance.length > 0);
    assert.ok(planet.generatedFlags.includes('model-derived-appearance'));
  }
});

test('one course preserves the selected planet while routing through its parent system frame', () => {
  const course = createUniverseCourse('trappist-1-e', 'sol', 1234);
  assert.equal(course.destination.id, 'trappist-1-e');
  assert.equal(course.frame.id, 'trappist-1');
  assert.equal(course.status, 'transit');
  assert.equal(courseTargetsFrame(course, 'trappist-1'), true);
  assert.equal(courseTargetsFrame(course, 'sol'), false);
  const active = setUniverseCourseStatus(course, 'active');
  assert.equal(active.status, 'active');
  assert.equal(active.destination, course.destination);
  assert.equal(active.frame, course.frame);
  assert.ok(Object.isFrozen(active));
});

test('stellar rendering responds to catalog temperature instead of one generic sphere', () => {
  assert.deepEqual(
    [3100, 4800, 5772, 6500, 9000, 18000, 36000].map(stellarClassForTemperature),
    ['M', 'K', 'G', 'F', 'A', 'B', 'O']
  );
  const proxima = deriveStarVisualProfile(resolveUniverseAddress('proxima-centauri'));
  const triangulum = deriveStarVisualProfile(resolveUniverseAddress('triangulum-explorer-a'));
  assert.equal(proxima.stellarClass, 'M');
  assert.equal(proxima.activity, 'active');
  assert.equal(triangulum.stellarClass, 'F');
  assert.notEqual(proxima.color, triangulum.color);
});

test('planet appearances are deterministic, class-specific, and honestly model-derived', () => {
  const system = resolveUniverseAddress('55-cancri');
  const rocky = resolveUniverseAddress('55-cancri-e');
  const giant = resolveUniverseAddress('55-cancri-b');
  const rockyProfile = derivePlanetVisualProfile(rocky, system);
  const repeated = derivePlanetVisualProfile(rocky, system);
  const giantProfile = derivePlanetVisualProfile(giant, system);
  assert.deepEqual(rockyProfile, repeated);
  assert.equal(rockyProfile.kind, 'lava-world');
  assert.equal(giantProfile.kind, 'gas-giant');
  assert.equal(rockyProfile.appearanceAccuracy, 'model-derived');
  assert.match(rockyProfile.evidence, /not an observation/i);
  assert.notDeepEqual(rockyProfile.palette, giantProfile.palette);
});
