import assert from 'node:assert/strict';
import test from 'node:test';

import { updateRoadVehicleVerticalState } from '../app/js/physics/road-vehicle-airborne.js';

test('a road car remains suspension-grounded on a continuous surface', () => {
  const state = updateRoadVehicleVerticalState({
    bodyY: 2.21, groundedBodyY: 2.22, supportY: 1.01, previousSupportY: 1,
    horizontalSpeedMps: 18, surfacePitch: 0, previousPitch: 0, dt: 1 / 60
  });
  assert.equal(state.isAirborne, false);
  assert.equal(state.y, 2.22);
});

test('a fast car launches from a real surface edge and follows Earth gravity', () => {
  const launched = updateRoadVehicleVerticalState({
    bodyY: 3.21, groundedBodyY: 2.4, supportY: 1, previousSupportY: 2,
    horizontalSpeedMps: 16, surfacePitch: 0, previousPitch: 0, dt: 1 / 60
  });
  assert.equal(launched.isAirborne, true);
  assert.equal(launched.launchReason, 'surface-edge');
  const falling = updateRoadVehicleVerticalState({
    bodyY: launched.y, supportY: 1, previousSupportY: 1,
    verticalVelocity: launched.verticalVelocity, isAirborne: true,
    airborneTime: launched.airborneTime, horizontalSpeedMps: 16, dt: 1 / 60
  });
  assert.ok(falling.verticalVelocity < launched.verticalVelocity);
});

test('a ramp crest produces upward velocity and hard landings produce bounded damage', () => {
  const launched = updateRoadVehicleVerticalState({
    bodyY: 2.21, groundedBodyY: 2.21, supportY: 1, previousSupportY: 1,
    horizontalSpeedMps: 22, surfacePitch: 0.01, previousPitch: -0.16, dt: 1 / 60
  });
  assert.equal(launched.launchReason, 'ramp-crest');
  assert.ok(launched.verticalVelocity > 0);
  const landed = updateRoadVehicleVerticalState({
    bodyY: 2.3, supportY: 1, previousSupportY: 1, verticalVelocity: -9,
    isAirborne: true, airborneTime: .5, horizontalSpeedMps: 12,
    suspensionResistance: .24, dt: 1 / 30
  });
  assert.equal(landed.landed, true);
  assert.ok(landed.landingImpactMps > 4.2);
  assert.ok(landed.landingDamageForce > 0 && landed.landingDamageForce < 100);
});

test('a streamed rising surface catches an airborne car instead of letting it pass underneath', () => {
  const caught = updateRoadVehicleVerticalState({
    bodyY: 2.8, groundedBodyY: 3.1, supportY: 1.9, previousSupportY: 1.2,
    verticalVelocity: 1.5, isAirborne: true, airborneTime: .22,
    horizontalSpeedMps: 19, dt: 1 / 30
  });
  assert.equal(caught.landed, true);
  assert.equal(caught.isAirborne, false);
  assert.equal(caught.y, 3.11);
});
