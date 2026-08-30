import test from 'node:test';
import assert from 'node:assert/strict';
import { getAviationCatalogEntry } from '../app/js/transport/aviation-catalog.js';
import { getMaritimeCatalogEntry } from '../app/js/transport/maritime-catalog.js';
import { integrateFixedWingFlight, resolveAircraftFlightTuning } from '../app/js/plane/flight-dynamics.js';
import { resolveVesselHandling, vesselYawRateTarget } from '../app/js/boat-mode/vessel-handling.js';
import { advanceAmbientRouteMotion, createAmbientRouteMotion } from '../app/js/transport/ambient-route-motion.js';

test('large aircraft respond through slower class-specific aerodynamic authority', () => {
  const prop = resolveAircraftFlightTuning(getAviationCatalogEntry('expedition-prop'));
  const airliner = resolveAircraftFlightTuning(getAviationCatalogEntry('long-range-airliner'));
  assert.ok(airliner.pitchControl < prop.pitchControl);
  assert.ok(airliner.rollControl < prop.rollControl);
  assert.ok(airliner.thrustResponse < prop.thrustResponse);
  assert.ok(airliner.groundAcceleration < prop.groundAcceleration * .5);
  assert.ok(airliner.rotationSpeed > prop.rotationSpeed * 2.5);
});

test('pitch changes lift and flight path rather than teleporting velocity to the nose', () => {
  const catalog = getAviationCatalogEntry('regional-jet');
  const result = integrateFixedWingFlight({ speed: 62, climbRate: 0, pitch: .16, roll: 0 }, {
    throttle: .72,
    powerFactor: 1,
    topSpeed: 130
  }, catalog, 1 / 30);
  assert.ok(result.angleOfAttack > .1);
  assert.ok(result.liftLoad > 1);
  assert.ok(result.climbRate > 0);
  assert.ok(result.flightPathAngle < .02, 'the velocity path should initially lag behind nose attitude');
});

test('banked turn rate follows gravity, bank, and airspeed', () => {
  const catalog = getAviationCatalogEntry('business-jet');
  const slow = integrateFixedWingFlight({ speed: 55, climbRate: 0, pitch: 0, roll: .3 }, { throttle: .5, topSpeed: 160 }, catalog, 1 / 60);
  const fast = integrateFixedWingFlight({ speed: 125, climbRate: 0, pitch: 0, roll: .3 }, { throttle: .8, topSpeed: 160 }, catalog, 1 / 60);
  assert.ok(Math.abs(slow.turnRate) > Math.abs(fast.turnRate));
});

test('cargo ships spool, brake, and answer the rudder far more slowly than runabouts', () => {
  const runabout = getMaritimeCatalogEntry('marina-runabout');
  const cargo = getMaritimeCatalogEntry('container-cargo-ship');
  const light = resolveVesselHandling(runabout);
  const heavy = resolveVesselHandling(cargo);
  assert.ok(heavy.throttleResponse < light.throttleResponse * .2);
  assert.ok(heavy.serviceBrakeRate < light.serviceBrakeRate * .2);
  assert.ok(heavy.rudderResponse < light.rudderResponse * .2);
  assert.ok(heavy.dragExposureScale < light.dragExposureScale * .3);
  assert.ok(heavy.waveResistanceScale < light.waveResistanceScale * .3);
  assert.ok(Math.abs(vesselYawRateTarget(cargo, 8, 1)) < Math.abs(vesselYawRateTarget(runabout, 8, 1)) * .12);
});

test('ambient transport follows a bounded route and pauses at its facility', () => {
  const entity = { x: 0, z: 0, yaw: 0 };
  const motion = createAmbientRouteMotion([{ x: 0, z: 0 }, { x: 0, z: 12 }, { x: 0, z: 0 }], {
    cruiseSpeed: 3,
    acceleration: 4,
    yawRate: 1,
    dwellSeconds: 2,
    initialDwellSeconds: 0
  });
  let furthest = 0;
  for (let index = 0; index < 300; index += 1) {
    advanceAmbientRouteMotion(entity, motion, 1 / 30);
    furthest = Math.max(furthest, entity.z);
  }
  assert.ok(furthest > 8);
  assert.ok(entity.z >= 0 && entity.z <= 12);
  assert.equal(motion.route.length, 3);
  assert.ok(motion.speed <= motion.cruiseSpeed);
});
