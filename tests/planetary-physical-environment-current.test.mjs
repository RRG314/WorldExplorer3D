import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getPhysicalEnvironmentProfile,
  PHYSICAL_ENVIRONMENT_PROFILES,
  samplePhysicalEnvironment
} from '../app/js/planetary/runtime/physical-environment.js';

const close = (actual, expected, tolerance, message) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
};

test('one immutable profile covers every currently cataloged world environment', () => {
  assert.deepEqual(Object.keys(PHYSICAL_ENVIRONMENT_PROFILES), [
    'mercury', 'venus', 'earth', 'moon', 'mars',
    'phobos', 'deimos', 'io', 'europa', 'ganymede', 'callisto',
    'titan', 'enceladus', 'triton', 'ceres', 'vesta', 'pluto',
    'jupiter', 'saturn', 'uranus', 'neptune'
  ]);
  assert.ok(Object.isFrozen(PHYSICAL_ENVIRONMENT_PROFILES));
  Object.values(PHYSICAL_ENVIRONMENT_PROFILES).forEach((profile) => {
    assert.ok(Object.isFrozen(profile));
    assert.ok(profile.weatherModelId);
    assert.ok(profile.provenance.verticalProfile);
  });
});

test('airless bodies have no fake weather pressure density or wind', () => {
  for (const bodyId of ['mercury', 'moon', 'io', 'europa', 'enceladus', 'ceres', 'vesta']) {
    const sample = samplePhysicalEnvironment(bodyId, { latitudeDeg: 10, longitudeDegPositiveEast: 25, heightM: 0, timestampS: 1000 });
    assert.equal(sample.pressurePa, 0);
    assert.equal(sample.atmosphericDensityKgM3, 0);
    assert.equal(sample.weatherModelId, 'none');
    assert.deepEqual(sample.windVectorMps, {
      eastMps: 0, upMps: 0, northMps: 0, truthClass: 'gameplay_abstraction'
    });
    assert.equal(sample.solidSurfaceAvailable, true);
  }
});

test('Titan, Triton, and Pluto keep physically distinct atmosphere classes', () => {
  const titan = samplePhysicalEnvironment('titan', { heightM: 0, timestampS: 100 });
  const triton = samplePhysicalEnvironment('triton', { heightM: 0, timestampS: 100 });
  const pluto = samplePhysicalEnvironment('pluto', { heightM: 0, timestampS: 100 });
  assert.ok(titan.pressurePa > 100_000);
  assert.ok(titan.atmosphericDensityKgM3 > 1);
  assert.equal(titan.weatherModelId, 'titan_nitrogen_methane_haze');
  assert.ok(triton.pressurePa > 0 && triton.pressurePa < 10);
  assert.ok(pluto.pressurePa > 0 && pluto.pressurePa < 10);
  assert.notEqual(triton.weatherModelId, pluto.weatherModelId);
});

test('gravity decreases with altitude from the canonical body radius', () => {
  const surface = samplePhysicalEnvironment('moon', { heightM: 0 });
  const high = samplePhysicalEnvironment('moon', { heightM: 100_000 });
  close(surface.gravityMagnitudeMps2, 1.62, 1e-12, 'Moon surface gravity');
  assert.ok(high.gravityMagnitudeMps2 < surface.gravityMagnitudeMps2);
  assert.equal(high.gravityVectorMps2.up, -high.gravityMagnitudeMps2);
});

test('Earth remains an adapter boundary and accepts current weather values', () => {
  const standard = samplePhysicalEnvironment('earth', { heightM: 0 });
  close(standard.gravityMagnitudeMps2, 9.80665, 1e-12, 'Earth gravity');
  assert.equal(standard.pressurePa, 101_325);
  assert.equal(standard.usesExistingEarthWeatherAdapter, true);
  const adapted = samplePhysicalEnvironment('earth', {
    heightM: 0,
    existingEarthConditions: {
      pressurePa: 99_800,
      densityKgM3: 1.18,
      temperatureK: 293.15,
      visibilityM: 12_500,
      truthClass: 'observed_or_measured',
      wind: { eastMps: 4, upMps: 0, northMps: -2, truthClass: 'observed_or_measured' }
    }
  });
  assert.equal(adapted.pressurePa, 99_800);
  assert.equal(adapted.temperatureK, 293.15);
  assert.equal(adapted.visibilityM, 12_500);
  assert.equal(adapted.windVectorMps.truthClass, 'observed_or_measured');
  assert.equal(adapted.truthManifest.visibility, 'observed_or_measured');
});

test('Mars and Venus have distinct pressure density temperature and weather', () => {
  const marsSurface = samplePhysicalEnvironment('mars', { heightM: 0, timestampS: 100 });
  const marsHigh = samplePhysicalEnvironment('mars', { heightM: 10_000, timestampS: 100 });
  const venusSurface = samplePhysicalEnvironment('venus', { heightM: 0, timestampS: 100 });
  assert.equal(marsSurface.pressurePa, 610);
  assert.ok(marsSurface.atmosphericDensityKgM3 > 0);
  assert.ok(marsHigh.pressurePa < marsSurface.pressurePa);
  assert.equal(marsSurface.weatherModelId, 'mars_dust_and_wind');
  assert.equal(venusSurface.pressurePa, 9_200_000);
  assert.equal(venusSurface.temperatureK, 737);
  assert.ok(venusSurface.atmosphericDensityKgM3 > marsSurface.atmosphericDensityKgM3 * 1000);
  assert.notEqual(venusSurface.weatherModelId, marsSurface.weatherModelId);
});

test('giant planets provide atmospheric descent and never ground contact', () => {
  for (const bodyId of ['jupiter', 'saturn', 'uranus', 'neptune']) {
    const reference = samplePhysicalEnvironment(bodyId, { heightM: 0, timestampS: 500 });
    const deeper = samplePhysicalEnvironment(bodyId, { heightM: -20_000, timestampS: 500 });
    assert.equal(reference.landingMode, 'atmospheric_descent');
    assert.equal(reference.solidSurfaceAvailable, false);
    assert.ok(deeper.pressurePa > reference.pressurePa);
    assert.ok(deeper.temperatureK > reference.temperatureK);
    assert.ok(deeper.hazards.includes('increasing_pressure'));
  }
});

test('solar illumination follows mean distance rather than one shared light value', () => {
  const mercury = samplePhysicalEnvironment('mercury', { heightM: 0 });
  const earth = samplePhysicalEnvironment('earth', { heightM: 0 });
  const mars = samplePhysicalEnvironment('mars', { heightM: 0 });
  const neptune = samplePhysicalEnvironment('neptune', { heightM: 0 });
  assert.ok(mercury.solarIrradianceWm2 > earth.solarIrradianceWm2 * 6);
  assert.ok(mars.solarIrradianceWm2 < earth.solarIrradianceWm2 * 0.5);
  assert.ok(neptune.solarIrradianceWm2 < earth.solarIrradianceWm2 * 0.002);
});

test('modeled wind is deterministic for one body location and time', () => {
  const input = { latitudeDeg: 18.65, longitudeDegPositiveEast: 226.2, heightM: 0, timestampS: 12_345 };
  const first = samplePhysicalEnvironment('mars', input);
  const second = samplePhysicalEnvironment('mars', input);
  const later = samplePhysicalEnvironment('mars', { ...input, timestampS: input.timestampS + 5000 });
  assert.deepEqual(first.windVectorMps, second.windVectorMps);
  assert.notDeepEqual(first.windVectorMps, later.windVectorMps);
});

test('unknown profiles fail closed', () => {
  assert.equal(getPhysicalEnvironmentProfile('unknown'), null);
  assert.throws(() => samplePhysicalEnvironment('unknown', {}), /No physical environment profile/);
});
