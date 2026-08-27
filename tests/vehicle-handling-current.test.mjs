import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PARKED_VEHICLE_CATALOG,
  vehicleConditionDynamics,
  vehicleHandlingProfile
} from '../app/js/engine/vehicle-catalog.js';
import { ROAD_CAR_CONFIG } from '../app/js/physics/vehicle-config.js';
import { carSpeedToMph } from '../app/js/physics/vehicle-speed-units.js';

test('the normal road-car ceiling is the advertised 120 mph', () => {
  assert.equal(carSpeedToMph(ROAD_CAR_CONFIG.maxSpd), 120);
  assert.equal(carSpeedToMph(ROAD_CAR_CONFIG.boostMax), 120);
  assert.ok(ROAD_CAR_CONFIG.boostAccel > ROAD_CAR_CONFIG.accel, 'boost should change acceleration, not top speed');
});

test('crash damage degrades the same vehicle handling contract and totaled cars cannot accelerate', () => {
  const healthy = vehicleConditionDynamics(1);
  const damaged = vehicleConditionDynamics(.35);
  const totaled = vehicleConditionDynamics(.05);

  assert.equal(healthy.topSpeedScale, 1);
  assert.ok(damaged.topSpeedScale < healthy.topSpeedScale);
  assert.ok(damaged.accelerationScale < healthy.accelerationScale);
  assert.ok(damaged.steeringScale < healthy.steeringScale);
  assert.equal(totaled.operable, false);
});

test('enterable vehicle families resolve genuinely different handling', () => {
  const profiles = PARKED_VEHICLE_CATALOG.map((variant) => vehicleHandlingProfile(variant));
  const signatures = new Set(profiles.map((profile) => [
    profile.accelerationScale,
    profile.steeringScale,
    profile.gripScale,
    profile.brakeScale,
    profile.wheelBase
  ].join('|')));

  assert.equal(signatures.size, PARKED_VEHICLE_CATALOG.length);
  assert.equal(vehicleHandlingProfile('compact').label, 'Nimble');
  assert.equal(vehicleHandlingProfile('suv').label, 'Planted');
  assert.ok(vehicleHandlingProfile('compact').steeringScale > vehicleHandlingProfile('pickup').steeringScale);
  assert.ok(vehicleHandlingProfile('suv').gripScale > vehicleHandlingProfile('sedan').gripScale);
});

test('road vehicles never exceed 120 mph and police vehicles get response tuning', () => {
  for (const variant of PARKED_VEHICLE_CATALOG) {
    assert.ok(vehicleHandlingProfile(variant).topSpeedMph <= 120, variant.id);
  }

  const civilian = vehicleHandlingProfile('sedan');
  const police = vehicleHandlingProfile('sedan', { serviceType: 'responder' });
  assert.equal(police.topSpeedMph, 120);
  assert.equal(police.label, 'Response-tuned');
  assert.ok(police.accelerationScale > civilian.accelerationScale);
  assert.ok(police.steeringScale > civilian.steeringScale);
  assert.ok(police.brakeScale > civilian.brakeScale);
});
