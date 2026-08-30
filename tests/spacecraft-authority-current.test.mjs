import assert from 'node:assert/strict';
import test from 'node:test';

import { getAstronomicalBody } from '../app/js/astronomy/body-catalog.js';
import {
  computeBodyRelativeNavigation,
  createBodyEphemerisState,
  createSpacecraftState,
  enterSpacecraftSafeMode,
  evaluateLandingEligibility,
  GRAVITATIONAL_CONSTANT,
  propagateSpacecraft,
  recoverSpacecraft,
  resolveTimeScale,
  setSpacecraftSubsystemStatus,
  SPACECRAFT_MODE,
  SUBSYSTEM_STATUS
} from '../app/js/space/spacecraft-authority.js';

const epochMs = Date.UTC(2026, 7, 27, 12, 0, 0);

function bodyAtOrigin(bodyId, options = {}) {
  return createBodyEphemerisState(bodyId, {
    epochMs,
    positionM: { x: 0, y: 0, z: 0 },
    velocityMps: { x: 0, y: 0, z: 0 },
    ...options
  });
}

test('spacecraft state is immutable, SI-based, versioned, and normalized', () => {
  const state = createSpacecraftState({
    epochMs,
    positionM: { x: 1, y: 2, z: 3 },
    attitude: { x: 0, y: 0, z: 0, w: 4 },
    targetBodyId: 'Luna'
  });
  assert.equal(state.schemaVersion, 1);
  assert.equal(state.frameId, 'inertial:sol:J2000');
  assert.deepEqual(state.positionM, { x: 1, y: 2, z: 3 });
  assert.deepEqual(state.attitude, { x: 0, y: 0, z: 0, w: 1 });
  assert.equal(state.targetBodyId, 'moon');
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.subsystems), true);
});

test('body ephemeris derives mass and radius from the canonical catalog', () => {
  const earth = bodyAtOrigin('earth');
  const catalogEarth = getAstronomicalBody('earth');
  assert.equal(earth.massKg, catalogEarth.physical.massKg);
  assert.equal(earth.radiusM, catalogEarth.physical.meanRadiusM);
  assert.equal(earth.solidSurfaceAvailable, true);
  assert.equal(bodyAtOrigin('jupiter').solidSurfaceAvailable, false);
});

test('gravity at low Earth orbit is physical and points toward Earth', () => {
  const earth = bodyAtOrigin('earth');
  const altitudeM = 400_000;
  const radiusM = earth.radiusM + altitudeM;
  const state = createSpacecraftState({
    epochMs,
    positionM: { x: radiusM, y: 0, z: 0 },
    velocityMps: { x: 0, y: 0, z: 0 }
  });
  const next = propagateSpacecraft(state, {}, [earth], 1);
  const expectedGravity = GRAVITATIONAL_CONSTANT * earth.massKg / (radiusM ** 2);
  assert.ok(Math.abs(next.velocityMps.x + expectedGravity) < 0.001);
  assert.ok(next.positionM.x < state.positionM.x);
  assert.equal(next.velocityMps.y, 0);
});

test('a circular low Earth orbit remains bounded without artificial damping', () => {
  const earth = bodyAtOrigin('earth');
  const orbitRadiusM = earth.radiusM + 400_000;
  const circularSpeed = Math.sqrt(GRAVITATIONAL_CONSTANT * earth.massKg / orbitRadiusM);
  let state = createSpacecraftState({
    epochMs,
    positionM: { x: orbitRadiusM, y: 0, z: 0 },
    velocityMps: { x: 0, y: circularSpeed, z: 0 },
    propellantKg: 0
  });
  const initial = computeBodyRelativeNavigation(state, earth);
  for (let index = 0; index < 1080; index += 1) {
    state = propagateSpacecraft(state, {}, [earth], 5);
  }
  const final = computeBodyRelativeNavigation(state, earth);
  assert.equal(initial.captured, true);
  assert.equal(final.captured, true);
  assert.ok(Math.abs(final.specificOrbitalEnergyJkg - initial.specificOrbitalEnergyJkg) / Math.abs(initial.specificOrbitalEnergyJkg) < 0.00002);
  assert.ok(Math.abs(final.altitudeM - initial.altitudeM) < 1000);
});

test('powered flight consumes propellant, produces delta-v, and forces real-time integration', () => {
  const state = createSpacecraftState({
    epochMs,
    dryMassKg: 10_000,
    propellantCapacityKg: 5_000,
    propellantKg: 5_000,
    maxThrustN: 300_000,
    specificImpulseS: 400,
    timeScale: 1000
  });
  const next = propagateSpacecraft(state, {
    throttle: 1,
    thrustDirection: { x: 1, y: 0, z: 0 },
    timeScale: 1000
  }, [], 10);
  const expectedFuel = 300_000 / (400 * 9.80665) * 10;
  assert.ok(Math.abs(next.propellantKg - (5000 - expectedFuel)) < 1e-9);
  assert.ok(next.velocityMps.x > 200);
  assert.equal(next.timeScale, 1);
  assert.equal(next.epochMs, epochMs + 10_000);
});

test('fuel exhaustion cannot create negative propellant or free thrust', () => {
  const state = createSpacecraftState({
    epochMs,
    dryMassKg: 10_000,
    propellantCapacityKg: 1,
    propellantKg: 1,
    maxThrustN: 500_000,
    specificImpulseS: 300
  });
  const first = propagateSpacecraft(state, {
    throttle: 1,
    thrustDirection: { x: 1, y: 0, z: 0 }
  }, [], 10);
  const second = propagateSpacecraft(first, {
    throttle: 1,
    thrustDirection: { x: 1, y: 0, z: 0 }
  }, [], 10);
  assert.equal(first.propellantKg, 0);
  assert.equal(second.propellantKg, 0);
  assert.equal(second.velocityMps.x, first.velocityMps.x);
});

test('time acceleration is guarded near bodies, encounters, thrust, and maneuvers', () => {
  assert.equal(resolveTimeScale(1000, {}), 1000);
  assert.equal(resolveTimeScale(1000, { altitudeM: 999_999 }), 1);
  assert.equal(resolveTimeScale(1000, { throttle: 0.1 }), 1);
  assert.equal(resolveTimeScale(1000, { maneuvering: true }), 1);
  assert.equal(resolveTimeScale(1000, { timeToEncounterS: 1200 }), 10);
  assert.equal(resolveTimeScale(7, {}), 1);
});

test('navigation distinguishes captured, escape, radial, and tangential motion', () => {
  const moon = bodyAtOrigin('moon');
  const radius = moon.radiusM + 100_000;
  const mu = GRAVITATIONAL_CONSTANT * moon.massKg;
  const circular = createSpacecraftState({
    epochMs,
    positionM: { x: radius, y: 0, z: 0 },
    velocityMps: { x: 0, y: Math.sqrt(mu / radius), z: 0 }
  });
  const orbit = computeBodyRelativeNavigation(circular, moon);
  assert.equal(orbit.captured, true);
  assert.ok(Math.abs(orbit.radialVelocityMps) < 1e-12);
  assert.ok(Math.abs(orbit.tangentialSpeedMps - orbit.circularVelocityMps) < 1e-9);

  const escaping = createSpacecraftState({
    ...circular,
    epochMs,
    velocityMps: { x: orbit.escapeVelocityMps * 1.01, y: 0, z: 0 }
  });
  const escape = computeBodyRelativeNavigation(escaping, moon);
  assert.equal(escape.captured, false);
  assert.ok(escape.radialVelocityMps > 0);
});

test('moving body ephemeris is sampled at the spacecraft epoch', () => {
  const moon = createBodyEphemerisState('moon', {
    epochMs,
    positionM: { x: 0, y: 0, z: 0 },
    velocityMps: { x: 1000, y: 0, z: 0 }
  });
  const state = createSpacecraftState({
    epochMs: epochMs + 10_000,
    positionM: { x: 20_000, y: 0, z: 0 },
    velocityMps: { x: 1000, y: 0, z: 0 }
  });
  const navigation = computeBodyRelativeNavigation(state, moon);
  assert.equal(navigation.centerDistanceM, 10_000);
  assert.equal(navigation.relativeSpeedMps, 0);
});

test('landing requires a real solid surface, matching target, and safe relative motion', () => {
  const moon = bodyAtOrigin('moon');
  const jupiter = bodyAtOrigin('jupiter');
  const state = createSpacecraftState({
    epochMs,
    targetBodyId: 'moon',
    positionM: { x: moon.radiusM + 500, y: 0, z: 0 },
    velocityMps: { x: -5, y: 4, z: 0 }
  });
  assert.equal(evaluateLandingEligibility(state, moon).eligible, true);
  assert.equal(evaluateLandingEligibility(state, jupiter).reason, 'solid-surface-landing-unavailable');

  const fast = createSpacecraftState({ ...state, epochMs, velocityMps: { x: -200, y: 0, z: 0 } });
  assert.equal(evaluateLandingEligibility(fast, moon).reason, 'relative-speed-too-high');

  const wrongTarget = createSpacecraftState({ ...state, epochMs, targetBodyId: 'mars' });
  assert.equal(evaluateLandingEligibility(wrongTarget, moon).reason, 'landing-target-mismatch');
});

test('subsystem failure, safe mode, and recovery never grant unavailable authority', () => {
  const initial = createSpacecraftState({ epochMs });
  const propulsionFailed = setSpacecraftSubsystemStatus(initial, 'propulsion', SUBSYSTEM_STATUS.FAILED);
  const afterThrottle = propagateSpacecraft(propulsionFailed, {
    throttle: 1,
    thrustDirection: { x: 1, y: 0, z: 0 }
  }, [], 5);
  assert.equal(afterThrottle.velocityMps.x, 0);
  assert.equal(afterThrottle.propellantKg, propulsionFailed.propellantKg);

  const safe = enterSpacecraftSafeMode(propulsionFailed, 'crew-safe-mode');
  assert.equal(safe.mode, SPACECRAFT_MODE.SAFE);
  assert.equal(recoverSpacecraft(safe).recovered, false);
  const repaired = setSpacecraftSubsystemStatus(safe, 'propulsion', SUBSYSTEM_STATUS.NOMINAL);
  const recovery = recoverSpacecraft(repaired);
  assert.equal(recovery.recovered, true);
  assert.equal(recovery.state.mode, SPACECRAFT_MODE.FLIGHT);
  assert.equal(recovery.state.timeScale, 1);
});

test('propagation is deterministic for the same state, command, ephemeris, and interval', () => {
  const state = createSpacecraftState({ epochMs, positionM: { x: 10_000_000, y: 2, z: 3 } });
  const earth = bodyAtOrigin('earth');
  const command = { throttle: 0.4, thrustDirection: { x: 0.3, y: 0.7, z: -0.2 }, angular: { x: 0, y: 0.2, z: 0 } };
  assert.deepEqual(
    propagateSpacecraft(state, command, [earth], 0.25),
    propagateSpacecraft(state, command, [earth], 0.25)
  );
});
