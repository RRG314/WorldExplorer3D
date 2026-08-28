import assert from 'node:assert/strict';
import test from 'node:test';

import { getAstronomicalBody } from '../app/js/astronomy/body-catalog.js';
import {
  createJourneyEphemeris,
  createJourneyPresentationMap,
  createSpaceJourney,
  EARTH_MOON_MEAN_DISTANCE_M,
  fastTravelEvidencePlan,
  JOURNEY_MODE,
  JOURNEY_PHASE,
  transitionSpaceJourney
} from '../app/js/space/journey-authority.js';
import {
  createSpacecraftState,
  executePlannedBurn
} from '../app/js/space/spacecraft-authority.js';
import {
  completeFastTravelEvidence,
  installSpaceJourneyRuntime
} from '../app/js/space/journey-runtime.js';

const startedAtMs = Date.UTC(2026, 7, 27, 14, 0, 0);

function accepted(journey, event, evidence = {}) {
  const result = transitionSpaceJourney(journey, event, {
    atMs: journey.updatedAtMs + 1000,
    ...evidence
  });
  assert.equal(result.accepted, true, `${journey.phase} should accept ${event}: ${result.reason}`);
  return result.journey;
}

function landing(bodyId, altitudeM = 10, relativeSpeedMps = 5) {
  return {
    eligible: true,
    reason: null,
    navigation: { bodyId, altitudeM, relativeSpeedMps }
  };
}

test('Earth-Moon journey cannot skip evidence-gated phases', () => {
  let journey = createSpaceJourney({
    sourceBodyId: 'earth',
    destinationBodyId: 'moon',
    mode: JOURNEY_MODE.ASSISTED,
    startedAtMs
  });
  assert.equal(journey.phase, JOURNEY_PHASE.PREPARING);
  assert.equal(transitionSpaceJourney(journey, 'touchdown', { atMs: startedAtMs }).accepted, false);
  assert.equal(transitionSpaceJourney(journey, 'launch_ready', { atMs: startedAtMs, spacecraftReady: false }).reason, 'spacecraft-not-ready');

  journey = accepted(journey, 'launch_ready', { spacecraftReady: true });
  journey = accepted(journey, 'parking_orbit_established', {
    navigation: { bodyId: 'earth', captured: true, altitudeM: 200_000 }
  });
  assert.equal(transitionSpaceJourney(journey, 'transfer_burn_complete', {
    atMs: journey.updatedAtMs,
    burn: { executed: false, reason: 'insufficient-propellant' }
  }).reason, 'insufficient-propellant');
  journey = accepted(journey, 'transfer_burn_complete', { burn: { executed: true } });
  journey = accepted(journey, 'target_capture_complete', {
    navigation: { bodyId: 'moon', captured: true }
  });
  journey = accepted(journey, 'descent_authorized', { landingEligibility: landing('moon', 20_000, 60) });
  journey = accepted(journey, 'touchdown', { landingEligibility: landing('moon') });
  assert.equal(journey.phase, JOURNEY_PHASE.SURFACE);
  assert.deepEqual(journey.history.map((entry) => entry.to), [
    'launch', 'parking_orbit', 'transfer', 'approach', 'descent', 'surface'
  ]);
});

test('surface takeoff and return use the same mission record through home touchdown', () => {
  let journey = createSpaceJourney({ sourceBodyId: 'earth', destinationBodyId: 'moon', startedAtMs });
  journey = accepted(journey, 'launch_ready', { spacecraftReady: true });
  journey = accepted(journey, 'parking_orbit_established', { navigation: { bodyId: 'earth', captured: true, altitudeM: 200_000 } });
  journey = accepted(journey, 'transfer_burn_complete', { burn: { executed: true } });
  journey = accepted(journey, 'target_capture_complete', { navigation: { bodyId: 'moon', captured: true } });
  journey = accepted(journey, 'descent_authorized', { landingEligibility: landing('moon', 1000, 20) });
  journey = accepted(journey, 'touchdown', { landingEligibility: landing('moon') });
  journey = accepted(journey, 'takeoff', { spacecraftReady: true });
  journey = accepted(journey, 'departure_cleared', { navigation: { bodyId: 'moon', altitudeM: 110_000 } });
  journey = accepted(journey, 'home_capture_complete', { navigation: { bodyId: 'earth', captured: true } });
  journey = accepted(journey, 'home_descent_authorized', { landingEligibility: landing('earth', 10_000, 50) });
  journey = accepted(journey, 'mission_complete', { landingEligibility: landing('earth') });
  assert.equal(journey.phase, JOURNEY_PHASE.COMPLETE);
  assert.equal(journey.history.length, 11);
});

test('recovery records and restores the interrupted phase only with verified recovery', () => {
  let journey = createSpaceJourney({ sourceBodyId: 'earth', destinationBodyId: 'mars', startedAtMs });
  journey = accepted(journey, 'launch_ready', { spacecraftReady: true });
  journey = accepted(journey, 'parking_orbit_established', { navigation: { bodyId: 'earth', captured: true, altitudeM: 300_000 } });
  journey = accepted(journey, 'transfer_burn_complete', { burn: { executed: true } });
  const interruptedPhase = journey.phase;
  journey = accepted(journey, 'enter_recovery', { reason: 'navigation-degraded' });
  assert.equal(journey.phase, JOURNEY_PHASE.RECOVERY);
  assert.equal(journey.phaseBeforeRecovery, interruptedPhase);
  assert.equal(transitionSpaceJourney(journey, 'resume', { atMs: journey.updatedAtMs, recovered: false }).accepted, false);
  journey = accepted(journey, 'resume', { recovered: true });
  assert.equal(journey.phase, interruptedPhase);
  assert.equal(journey.failureReason, null);
});

test('fast travel uses the same required phase evidence and cannot imply a direct environment swap', () => {
  const journey = createSpaceJourney({
    sourceBodyId: 'earth',
    destinationBodyId: 'moon',
    mode: JOURNEY_MODE.FAST_TRAVEL,
    startedAtMs
  });
  assert.deepEqual(fastTravelEvidencePlan(journey), [
    'launch_ready',
    'parking_orbit_established',
    'transfer_burn_complete',
    'target_capture_complete',
    'descent_authorized',
    'touchdown'
  ]);
  assert.equal(fastTravelEvidencePlan(createSpaceJourney({
    sourceBodyId: 'earth', destinationBodyId: 'moon', mode: JOURNEY_MODE.MANUAL, startedAtMs
  })).length, 0);
});

test('journey ephemeris uses canonical Earth-Moon separation and catalog SI body facts', () => {
  const ephemeris = createJourneyEphemeris({
    sourceBodyId: 'earth',
    destinationBodyId: 'moon',
    epochMs: startedAtMs,
    axis: { x: 0, y: 0, z: -2 }
  });
  assert.equal(ephemeris.separationM, EARTH_MOON_MEAN_DISTANCE_M);
  assert.deepEqual(ephemeris.destination.positionM, { x: 0, y: 0, z: -EARTH_MOON_MEAN_DISTANCE_M });
  assert.equal(ephemeris.source.massKg, getAstronomicalBody('earth').physical.massKg);
  assert.equal(ephemeris.destination.radiusM, getAstronomicalBody('moon').physical.meanRadiusM);
});

test('interplanetary separation can be supplied from reviewed ephemeris without changing body facts', () => {
  const separationM = 98_000_000_000;
  const ephemeris = createJourneyEphemeris({
    sourceBodyId: 'earth',
    destinationBodyId: 'mars',
    epochMs: startedAtMs,
    separationM
  });
  assert.equal(ephemeris.separationM, separationM);
  assert.equal(ephemeris.destination.positionM.x, separationM);
  assert.equal(ephemeris.destination.massKg, getAstronomicalBody('mars').physical.massKg);
});

test('presentation mapping preserves readable body radii without mutating physical distance', () => {
  const earthRadiusM = getAstronomicalBody('earth').physical.meanRadiusM;
  const moonRadiusM = getAstronomicalBody('moon').physical.meanRadiusM;
  const map = createJourneyPresentationMap({
    physicalSource: { x: 0, y: 0, z: 0 },
    physicalDestination: { x: EARTH_MOON_MEAN_DISTANCE_M, y: 0, z: 0 },
    sceneSource: { x: 800, y: 0, z: 0 },
    sceneDestination: { x: 920, y: 20, z: 0 },
    sourcePhysicalRadiusM: earthRadiusM,
    destinationPhysicalRadiusM: moonRadiusM,
    sourceSceneRadius: 50,
    destinationSceneRadius: 13.5
  });
  const sceneAxis = { x: 120 / Math.hypot(120, 20), y: 20 / Math.hypot(120, 20), z: 0 };
  const sourceSurface = map.physicalToScene({ x: earthRadiusM, y: 0, z: 0 });
  const destinationSurface = map.physicalToScene({ x: EARTH_MOON_MEAN_DISTANCE_M - moonRadiusM, y: 0, z: 0 });
  assert.ok(Math.abs(sourceSurface.x - (800 + sceneAxis.x * 50)) < 1e-9);
  assert.ok(Math.abs(sourceSurface.y - sceneAxis.y * 50) < 1e-9);
  assert.ok(Math.abs(destinationSurface.x - (920 - sceneAxis.x * 13.5)) < 1e-9);
  assert.ok(Math.abs(destinationSurface.y - (20 - sceneAxis.y * 13.5)) < 1e-9);
  assert.equal(map.physicalDistanceM, EARTH_MOON_MEAN_DISTANCE_M);
});

test('planned burns apply exact delta-v and rocket-equation propellant accounting', () => {
  const state = createSpacecraftState({
    epochMs: startedAtMs,
    dryMassKg: 10_000,
    propellantCapacityKg: 10_000,
    propellantKg: 10_000,
    specificImpulseS: 455
  });
  const burn = executePlannedBurn(state, { x: 0, y: 3000, z: 0 });
  assert.equal(burn.executed, true);
  assert.equal(burn.state.velocityMps.y, 3000);
  assert.ok(burn.requiredPropellantKg > 0);
  assert.equal(burn.state.propellantKg, state.propellantKg - burn.requiredPropellantKg);

  const impossible = executePlannedBurn(createSpacecraftState({
    epochMs: startedAtMs,
    dryMassKg: 10_000,
    propellantCapacityKg: 1,
    propellantKg: 1,
    specificImpulseS: 300
  }), { x: 0, y: 20_000, z: 0 });
  assert.equal(impossible.executed, false);
  assert.equal(impossible.reason, 'insufficient-propellant');
  assert.equal(impossible.state.propellantKg, 1);
});

test('invalid transitions and reversed journey time fail closed', () => {
  const journey = createSpaceJourney({ sourceBodyId: 'earth', destinationBodyId: 'moon', startedAtMs });
  assert.equal(transitionSpaceJourney(journey, 'unknown', { atMs: startedAtMs }).reason, 'event-not-valid-for-current-phase');
  assert.equal(transitionSpaceJourney(journey, 'launch_ready', {
    atMs: startedAtMs - 1,
    spacecraftReady: true
  }).reason, 'journey-time-cannot-reverse');
  assert.throws(() => createSpaceJourney({ sourceBodyId: 'earth', destinationBodyId: 'earth', startedAtMs }));
});

test('fast-travel runtime produces complete fuel-accounted evidence for supported solid worlds', () => {
  for (const [sourceBodyId, destinationBodyId] of [
    ['earth', 'moon'],
    ['moon', 'earth'],
    ['earth', 'mars'],
    ['mars', 'earth']
  ]) {
    const result = completeFastTravelEvidence({
      sourceBodyId,
      destinationBodyId,
      epochMs: startedAtMs
    });
    assert.equal(result.journey.phase, JOURNEY_PHASE.SURFACE);
    assert.equal(result.journey.history.length, 6);
    assert.equal(result.burn.executed, true);
    assert.ok(result.burn.requiredPropellantKg > 0);
    assert.equal(result.spacecraft.targetBodyId, destinationBodyId);
    assert.equal(result.landingEligibility.eligible, true);
  }
});

test('fast-travel runtime cannot manufacture a solid touchdown on a giant planet', () => {
  assert.throws(() => completeFastTravelEvidence({
    sourceBodyId: 'earth',
    destinationBodyId: 'jupiter',
    epochMs: startedAtMs
  }), /solid-surface-landing-unavailable/);
});

test('rendered journey controller makes the mesh a presentation of fuel-accounted SI state', () => {
  const position = (x, y, z) => ({
    x, y, z,
    set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; }
  });
  const appContext = {
    spaceFlight: {
      earth: { position: position(800, 0, 0) },
      moon: { position: position(920, 20, 0) },
      rocket: { position: position(858, 0, 0) },
      velocity: position(0, 0, 0),
      speed: 0
    }
  };
  const runtime = installSpaceJourneyRuntime(appContext);
  assert.equal(runtime.beginRenderedSpaceJourney({
    sourceBodyId: 'earth',
    destinationBodyId: 'moon',
    mode: JOURNEY_MODE.MANUAL
  }), true);
  assert.equal(appContext.spaceJourney.phase, JOURNEY_PHASE.PARKING_ORBIT);
  const initialState = appContext.spacecraftState;
  const initialMesh = { ...appContext.spaceFlight.rocket.position };
  assert.equal(runtime.updateRenderedSpaceJourney({
    realDtS: 0.1,
    throttle: 1,
    thrustDirection: { x: 1, y: 0, z: 0 }
  }), true);
  assert.ok(appContext.spacecraftState.propellantKg < initialState.propellantKg);
  assert.ok(appContext.spacecraftState.velocityMps.x > initialState.velocityMps.x);
  assert.notDeepEqual(
    { x: appContext.spaceFlight.rocket.position.x, y: appContext.spaceFlight.rocket.position.y, z: appContext.spaceFlight.rocket.position.z },
    { x: initialMesh.x, y: initialMesh.y, z: initialMesh.z }
  );
  assert.equal(appContext.spaceFlight.speed, Math.hypot(
    appContext.spacecraftState.velocityMps.x,
    appContext.spacecraftState.velocityMps.y,
    appContext.spacecraftState.velocityMps.z
  ));
});

test('rendered landing request fails closed before verified destination approach', () => {
  const position = (x, y, z) => ({ x, y, z, set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; } });
  const appContext = {
    spaceFlight: {
      earth: { position: position(0, 0, 0) },
      moon: { position: position(120, 20, 0) },
      rocket: { position: position(58, 0, 0) },
      velocity: position(0, 0, 0),
      speed: 0
    }
  };
  const runtime = installSpaceJourneyRuntime(appContext);
  runtime.beginRenderedSpaceJourney({ sourceBodyId: 'earth', destinationBodyId: 'moon' });
  const landing = runtime.requestRenderedJourneyLanding('moon');
  assert.equal(landing.accepted, false);
  assert.equal(landing.reason, 'journey-not-in-approach');
  assert.equal(appContext.spaceJourney.phase, JOURNEY_PHASE.PARKING_ORBIT);
});

test('assisted rendered Earth-Moon journey reaches a guarded surface through continuous SI states', async () => {
  const position = (x, y, z) => ({ x, y, z, set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; } });
  let landingCompletions = 0;
  const appContext = {
    completeSpaceFlightJourneyLanding() { landingCompletions += 1; },
    spaceFlight: {
      earth: { position: position(0, 0, 0) },
      moon: { position: position(120, 20, 0) },
      rocket: { position: position(58, 0, 0) },
      velocity: position(0, 0, 0),
      speed: 0,
      mode: 'flying'
    }
  };
  const runtime = installSpaceJourneyRuntime(appContext);
  assert.equal(runtime.beginRenderedSpaceJourney({
    sourceBodyId: 'earth', destinationBodyId: 'moon', mode: JOURNEY_MODE.ASSISTED
  }), true);
  const beforeDepartureFuel = appContext.spacecraftState.propellantKg;
  assert.equal(runtime.engageRenderedJourneyAssist().accepted, true);
  assert.equal(appContext.spaceJourney.phase, JOURNEY_PHASE.TRANSFER);
  assert.ok(appContext.spacecraftState.propellantKg < beforeDepartureFuel);

  for (let frame = 0; frame < 121; frame += 1) {
    runtime.updateRenderedSpaceJourney({ realDtS: 0.1 });
  }
  assert.equal(appContext.spaceJourney.phase, JOURNEY_PHASE.APPROACH);
  assert.equal(appContext.spaceJourneyAssistState.active, false);
  const approachFuel = appContext.spacecraftState.propellantKg;
  const landing = runtime.requestRenderedJourneyLanding('moon');
  assert.equal(landing.accepted, true, landing.reason);
  assert.equal(appContext.spaceJourney.phase, JOURNEY_PHASE.DESCENT);

  for (let frame = 0; frame < 71; frame += 1) {
    runtime.updateRenderedSpaceJourney({ realDtS: 0.1 });
  }
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(appContext.spaceJourney.phase, JOURNEY_PHASE.SURFACE);
  assert.ok(appContext.spacecraftState.propellantKg <= approachFuel);
  assert.equal(landingCompletions, 1);
});

test('Moon takeoff and Earth return resume the same journey identity', async () => {
  const position = (x, y, z) => ({ x, y, z, set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; } });
  const appContext = {
    completeSpaceFlightJourneyLanding() {},
    spaceFlight: {
      earth: { position: position(0, 0, 0) },
      moon: { position: position(120, 20, 0) },
      rocket: { position: position(58, 0, 0) },
      velocity: position(0, 0, 0),
      speed: 0,
      mode: 'flying'
    }
  };
  const runtime = installSpaceJourneyRuntime(appContext);
  runtime.beginRenderedSpaceJourney({ sourceBodyId: 'earth', destinationBodyId: 'moon', mode: JOURNEY_MODE.ASSISTED });
  runtime.engageRenderedJourneyAssist();
  for (let frame = 0; frame < 121; frame += 1) runtime.updateRenderedSpaceJourney({ realDtS: 0.1 });
  runtime.requestRenderedJourneyLanding('moon');
  for (let frame = 0; frame < 71; frame += 1) runtime.updateRenderedSpaceJourney({ realDtS: 0.1 });
  await new Promise((resolve) => setImmediate(resolve));
  const journeyId = appContext.spaceJourney.journeyId;
  assert.equal(appContext.spaceJourney.phase, JOURNEY_PHASE.SURFACE);

  runtime.clearRenderedSpaceJourney();
  assert.equal(runtime.beginRenderedSpaceJourney({
    sourceBodyId: 'moon', destinationBodyId: 'earth', mode: JOURNEY_MODE.ASSISTED, resumeJourney: true
  }), true);
  assert.equal(appContext.spaceJourney.journeyId, journeyId);
  assert.equal(appContext.spaceJourney.phase, JOURNEY_PHASE.ASCENT);
  for (let frame = 0; frame < 201; frame += 1) runtime.updateRenderedSpaceJourney({ realDtS: 0.1 });
  assert.equal(appContext.spaceJourney.phase, JOURNEY_PHASE.HOME_APPROACH);
  const heldEarthApproach = { ...appContext.spacecraftState.positionM };
  for (let frame = 0; frame < 50; frame += 1) runtime.updateRenderedSpaceJourney({ realDtS: 0.1 });
  assert.deepEqual(appContext.spacecraftState.positionM, heldEarthApproach);
  const landing = runtime.requestRenderedJourneyLanding('earth');
  assert.equal(landing.accepted, true, landing.reason);
  for (let frame = 0; frame < 71; frame += 1) runtime.updateRenderedSpaceJourney({ realDtS: 0.1 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(appContext.spaceJourney.phase, JOURNEY_PHASE.COMPLETE);
  assert.equal(appContext.spaceJourney.journeyId, journeyId);
});
