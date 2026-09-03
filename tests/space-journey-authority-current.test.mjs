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
import { normalizeLandingTargetName } from '../app/js/space/runtime.js';

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

function advanceUntil(runtime, appContext, expectedPhase, maxFrames = 500) {
  for (let frame = 0; frame < maxFrames && appContext.spaceJourney.phase !== expectedPhase; frame += 1) {
    runtime.updateRenderedSpaceJourney({ realDtS: 0.1 });
  }
  assert.equal(
    appContext.spaceJourney.phase,
    expectedPhase,
    `journey should reach ${expectedPhase}: ${JSON.stringify(appContext.spaceJourneyAssistState || {})}`
  );
}

test('landing target normalization follows the canonical body catalog', () => {
  assert.equal(normalizeLandingTargetName('mercury'), 'Mercury');
  assert.equal(normalizeLandingTargetName('VENUS'), 'Venus');
  assert.equal(normalizeLandingTargetName('jupiter'), 'Jupiter');
  assert.equal(normalizeLandingTargetName('not-a-world'), null);
});

test('Set Course starts one assisted journey from free flight and keeps that journey for the selected destination', () => {
  const position = (x, y, z) => ({ x, y, z, set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; } });
  const marsMesh = { position: position(260, 35, -20) };
  const appContext = {
    getAllSpaceBodies() {
      return [{ name: 'Mars', mesh: marsMesh, position: marsMesh.position, radius: 28, landable: true }];
    },
    spaceFlight: {
      active: true,
      earth: { position: position(0, 0, 0) },
      moon: { position: position(120, 20, 0) },
      rocket: { position: position(58, 0, 0) },
      velocity: position(0, 0, 0),
      speed: 0,
      mode: 'flying',
      _nearestBody: { name: 'Earth' }
    }
  };
  const runtime = installSpaceJourneyRuntime(appContext);
  const selected = runtime.setSolarSystemCourse('mars');
  assert.equal(selected.accepted, true, selected.reason);
  assert.equal(selected.initialized, true);
  assert.equal(appContext.spaceJourney.sourceBodyId, 'earth');
  assert.equal(appContext.spaceJourney.destinationBodyId, 'mars');
  assert.equal(appContext.spaceJourney.mode, JOURNEY_MODE.ASSISTED);
  assert.equal(appContext.spaceJourneyAssistState.available, true);
  const journeyId = appContext.spaceJourney.journeyId;

  const selectedAgain = runtime.setSolarSystemCourse('mars');
  assert.equal(selectedAgain.accepted, true, selectedAgain.reason);
  assert.equal(selectedAgain.continued, true);
  assert.equal(appContext.spaceJourney.journeyId, journeyId);

  assert.equal(runtime.engageRenderedJourneyAssist().accepted, true);
  advanceUntil(runtime, appContext, JOURNEY_PHASE.APPROACH, 400);
  const approachCourse = runtime.setSolarSystemCourse('mars');
  assert.equal(approachCourse.accepted, true, approachCourse.reason);
  assert.equal(approachCourse.continued, true);
  assert.equal(appContext.spaceJourney.phase, JOURNEY_PHASE.APPROACH);
  assert.equal(appContext.spaceJourney.journeyId, journeyId);
});

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
  const physicalProbe = { x: 22_000_000, y: 310_000, z: -125_000 };
  const physicalRoundTrip = map.sceneToPhysical(map.physicalToScene(physicalProbe));
  assert.ok(Math.abs(physicalRoundTrip.x - physicalProbe.x) < 1e-6);
  assert.ok(Math.abs(physicalRoundTrip.y - physicalProbe.y) < 1e-6);
  assert.ok(Math.abs(physicalRoundTrip.z - physicalProbe.z) < 1e-6);
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
    ['earth', 'mercury'],
    ['mercury', 'earth'],
    ['earth', 'venus'],
    ['venus', 'earth'],
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
  assert.equal(appContext.spaceJourney.phase, JOURNEY_PHASE.LAUNCH);
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
  assert.ok(Math.hypot(
    appContext.spaceFlight.rocket.position.x - initialMesh.x,
    appContext.spaceFlight.rocket.position.y - initialMesh.y,
    appContext.spaceFlight.rocket.position.z - initialMesh.z
  ) > 0, 'the SI propagation path must advance when explicitly commanded');
  assert.equal(appContext.spaceFlight.manualFlightRate, 100);
});

test('manual input cancels assist without creating a second position authority', () => {
  const position = (x, y, z) => ({
    x, y, z,
    set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; }
  });
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
  runtime.beginRenderedSpaceJourney({
    sourceBodyId: 'earth', destinationBodyId: 'moon', mode: JOURNEY_MODE.ASSISTED
  });
  const scenePosition = { ...appContext.spaceFlight.rocket.position };

  assert.equal(runtime.updateRenderedSpaceJourney({
    realDtS: 0.1,
    throttle: 1,
    thrustDirection: { x: 1, y: 0, z: 0 },
    manualControl: true
  }), true);
  assert.equal(appContext.spaceFlight.presentationAuthority, 'si');
  assert.ok(appContext.spaceJourney, 'manual takeover must preserve the active journey');
  assert.ok(appContext.spacecraftState, 'manual takeover must preserve the authoritative spacecraft state');
  assert.ok(appContext.spaceJourneyEphemeris, 'manual takeover must preserve the journey frame');
  assert.notDeepEqual(appContext.spaceFlight.rocket.position, scenePosition);
});

test('rendered journey follows live body positions without changing physical spacecraft state', () => {
  const position = (x, y, z) => ({
    x, y, z,
    set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; }
  });
  const earthPosition = position(0, 0, 0);
  const moonPosition = position(120, 20, 0);
  const appContext = {
    spaceFlight: {
      earth: { position: earthPosition },
      moon: { position: moonPosition },
      rocket: { position: position(58, 0, 0) },
      velocity: position(0, 0, 0),
      speed: 0
    }
  };
  const runtime = installSpaceJourneyRuntime(appContext);
  assert.equal(runtime.beginRenderedSpaceJourney({
    sourceBodyId: 'earth', destinationBodyId: 'moon', mode: JOURNEY_MODE.MANUAL
  }), true);
  const physicalBefore = appContext.spacecraftState;
  const sceneBefore = { ...appContext.spaceFlight.rocket.position };

  earthPosition.x += 50;
  moonPosition.x += 50;
  runtime.updateRenderedSpaceJourney({ realDtS: 0 });

  assert.deepEqual(appContext.spacecraftState, physicalBefore);
  assert.ok(Math.abs(appContext.spaceFlight.rocket.position.x - (sceneBefore.x + 50)) < 1e-9);
  assert.ok(Math.abs(appContext.spaceFlight.rocket.position.y - sceneBefore.y) < 1e-9);
  assert.ok(Math.abs(appContext.spaceFlight.rocket.position.z - sceneBefore.z) < 1e-9);
});

test('manual flight input immediately takes control from an active assisted transfer', () => {
  const position = (x, y, z) => ({ x, y, z, set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; } });
  const appContext = {
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
  assert.equal(runtime.engageRenderedJourneyAssist().accepted, true);
  assert.equal(appContext.spaceJourneyAssistState.active, true);
  const propellantBefore = appContext.spacecraftState.propellantKg;

  runtime.updateRenderedSpaceJourney({
    realDtS: 0.1,
    throttle: 1,
    manualControl: true,
    thrustDirection: { x: 1, y: 0, z: 0 },
    manualFlightRate: 1000
  });

  assert.equal(appContext.spaceJourneyAssistState.active, false);
  assert.equal(appContext.spaceJourneyAssistState.manual, true);
  assert.ok(appContext.spacecraftState.propellantKg < propellantBefore);
  assert.equal(appContext.spacecraftState.timeScale, 1000);
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
  assert.equal(appContext.spaceJourney.phase, JOURNEY_PHASE.LAUNCH);
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
  assert.equal(appContext.spaceJourney.phase, JOURNEY_PHASE.LAUNCH);
  advanceUntil(runtime, appContext, JOURNEY_PHASE.TRANSFER, 100);
  assert.ok(appContext.spacecraftState.propellantKg < beforeDepartureFuel);

  advanceUntil(runtime, appContext, JOURNEY_PHASE.APPROACH, 250);
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
  advanceUntil(runtime, appContext, JOURNEY_PHASE.APPROACH, 350);
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

test('Mars second slice uses the same journey, atmospheric authority, surface, and Earth return', async () => {
  const position = (x, y, z) => ({ x, y, z, set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; } });
  const marsMesh = { position: position(260, 35, -20) };
  const appContext = {
    completeSpaceFlightJourneyLanding() {},
    getAllSpaceBodies() {
      return [{ name: 'Mars', mesh: marsMesh, position: marsMesh.position, radius: 28, landable: true }];
    },
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
  assert.equal(runtime.retargetRenderedSpaceJourney('mars').accepted, true);
  assert.equal(appContext.spaceJourney.destinationBodyId, 'mars');
  assert.equal(appContext.spaceFlight.mode, 'flying');
  assert.equal(runtime.engageRenderedJourneyAssist().accepted, true);
  advanceUntil(runtime, appContext, JOURNEY_PHASE.APPROACH, 400);
  assert.equal(appContext.spaceFlightEnvironment.bodyId, 'mars');
  assert.ok(appContext.spaceFlightEnvironment.pressurePa > 0);
  assert.equal(runtime.requestRenderedJourneyLanding('mars').accepted, true);
  for (let frame = 0; frame < 71; frame += 1) runtime.updateRenderedSpaceJourney({ realDtS: 0.1 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(appContext.spaceJourney.phase, JOURNEY_PHASE.SURFACE);
  const journeyId = appContext.spaceJourney.journeyId;

  runtime.clearRenderedSpaceJourney();
  assert.equal(runtime.beginRenderedSpaceJourney({
    sourceBodyId: 'mars', destinationBodyId: 'earth', mode: JOURNEY_MODE.ASSISTED, resumeJourney: true
  }), true);
  for (let frame = 0; frame < 261; frame += 1) runtime.updateRenderedSpaceJourney({ realDtS: 0.1 });
  assert.equal(appContext.spaceJourney.phase, JOURNEY_PHASE.HOME_APPROACH);
  assert.equal(runtime.requestRenderedJourneyLanding('earth').accepted, true);
  for (let frame = 0; frame < 71; frame += 1) runtime.updateRenderedSpaceJourney({ realDtS: 0.1 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(appContext.spaceJourney.phase, JOURNEY_PHASE.COMPLETE);
  assert.equal(appContext.spaceJourney.journeyId, journeyId);
});

test('featured nested moons and small bodies use resolved scene positions and complete a return journey', async () => {
  const position = (x, y, z) => ({ x, y, z, set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; } });

  for (const destination of [
    { id: 'europa', name: 'Europa', local: position(2, 0, 0), world: position(310, 46, -34), radius: 11 },
    { id: 'vesta', name: 'Vesta', local: position(-3, 1, 0), world: position(245, -28, 62), radius: 6 }
  ]) {
    let landingCompletions = 0;
    const destinationMesh = { position: destination.local };
    const appContext = {
      completeSpaceFlightJourneyLanding() { landingCompletions += 1; },
      getAllSpaceBodies() {
        return [{
          name: destination.name,
          mesh: destinationMesh,
          position: destination.world,
          radius: destination.radius,
          landable: true
        }];
      },
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
      sourceBodyId: 'earth', destinationBodyId: destination.id, mode: JOURNEY_MODE.ASSISTED
    }), true);
    const magnitude = Math.hypot(destination.world.x, destination.world.y, destination.world.z);
    assert.ok(Math.abs(appContext.spaceJourneyEphemeris.destination.positionM.x / appContext.spaceJourneyEphemeris.separationM - destination.world.x / magnitude) < 1e-12);
    assert.notEqual(appContext.spaceJourneyEphemeris.destination.positionM.x / appContext.spaceJourneyEphemeris.separationM, 1);

    assert.equal(runtime.engageRenderedJourneyAssist().accepted, true);
    advanceUntil(runtime, appContext, JOURNEY_PHASE.APPROACH, 400);
    assert.equal(runtime.requestRenderedJourneyLanding(destination.id).accepted, true);
    for (let frame = 0; frame < 71; frame += 1) runtime.updateRenderedSpaceJourney({ realDtS: 0.1 });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(appContext.spaceJourney.phase, JOURNEY_PHASE.SURFACE);
    const journeyId = appContext.spaceJourney.journeyId;

    runtime.clearRenderedSpaceJourney();
    assert.equal(runtime.beginRenderedSpaceJourney({
      sourceBodyId: destination.id,
      destinationBodyId: 'earth',
      mode: JOURNEY_MODE.ASSISTED,
      resumeJourney: true
    }), true);
    for (let frame = 0; frame < 261; frame += 1) runtime.updateRenderedSpaceJourney({ realDtS: 0.1 });
    assert.equal(appContext.spaceJourney.phase, JOURNEY_PHASE.HOME_APPROACH);
    assert.equal(runtime.requestRenderedJourneyLanding('earth').accepted, true);
    for (let frame = 0; frame < 71; frame += 1) runtime.updateRenderedSpaceJourney({ realDtS: 0.1 });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(appContext.spaceJourney.phase, JOURNEY_PHASE.COMPLETE);
    assert.equal(appContext.spaceJourney.journeyId, journeyId);
    assert.equal(landingCompletions, 2);
  }
});
