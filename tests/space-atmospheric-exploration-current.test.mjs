import assert from 'node:assert/strict';
import test from 'node:test';

import { LANDING_MODE } from '../app/js/astronomy/body-catalog.js';
import {
  advanceAtmosphericExploration,
  createAtmosphericExploration,
  evaluateAtmosphericEntry,
  getAtmosphericExplorationProfile,
  MAX_ENTRY_ALTITUDE_M,
  MAX_ENTRY_SPEED_MPS,
  PRESSURE_LIMIT_PA
} from '../app/js/space/atmospheric-descent-authority.js';
import {
  createSpaceJourney,
  JOURNEY_MODE,
  JOURNEY_PHASE,
  transitionSpaceJourney
} from '../app/js/space/journey-authority.js';
import { installSpaceJourneyRuntime } from '../app/js/space/journey-runtime.js';

const GIANT_BODY_IDS = Object.freeze(['jupiter', 'saturn', 'uranus', 'neptune']);

test('all four giant planets expose one no-ground atmospheric exploration contract', () => {
  for (const bodyId of GIANT_BODY_IDS) {
    const profile = getAtmosphericExplorationProfile(bodyId);
    assert.equal(profile.bodyId, bodyId);
    assert.equal(profile.landingMode, LANDING_MODE.ATMOSPHERIC_DESCENT);
    assert.equal(profile.solidSurfaceAvailable, false);
    assert.equal(profile.pressureLimitPa, PRESSURE_LIMIT_PA);
    assert.ok(profile.minimumAltitudeM < MAX_ENTRY_ALTITUDE_M);
  }
  for (const bodyId of ['earth', 'moon', 'mars', 'venus']) {
    assert.equal(getAtmosphericExplorationProfile(bodyId), null);
  }
});

test('entry is evidence-gated by the current body, altitude, and relative speed', () => {
  assert.equal(evaluateAtmosphericEntry('jupiter', {
    bodyId: 'jupiter', altitudeM: MAX_ENTRY_ALTITUDE_M + 1, relativeSpeedMps: 0
  }).reason, 'atmospheric-entry-too-high');
  assert.equal(evaluateAtmosphericEntry('jupiter', {
    bodyId: 'jupiter', altitudeM: MAX_ENTRY_ALTITUDE_M, relativeSpeedMps: MAX_ENTRY_SPEED_MPS + 1
  }).reason, 'atmospheric-entry-too-fast');
  assert.equal(evaluateAtmosphericEntry('jupiter', {
    bodyId: 'saturn', altitudeM: 20_000, relativeSpeedMps: 20
  }).reason, 'atmospheric-entry-body-mismatch');
  const entry = evaluateAtmosphericEntry('jupiter', {
    bodyId: 'jupiter', altitudeM: 20_000, relativeSpeedMps: 20
  });
  assert.equal(entry.authorized, true);
  assert.equal(entry.noSolidSurface, true);
});

test('descent stops at the pressure envelope and climb returns to a higher altitude', () => {
  for (const bodyId of GIANT_BODY_IDS) {
    let state = createAtmosphericExploration(bodyId, { altitudeM: 20_000, timestampS: 10 });
    for (let frame = 0; frame < 2_000; frame += 1) {
      state = advanceAtmosphericExploration(state, 0.1, { descend: true });
    }
    assert.equal(state.phase, 'depth_limit');
    assert.equal(state.altitudeM, state.minimumAltitudeM);
    assert.ok(state.environment.pressurePa <= PRESSURE_LIMIT_PA + 0.001);
    assert.equal(state.environment.solidSurfaceAvailable, false);
    const depthAltitudeM = state.altitudeM;
    state = advanceAtmosphericExploration(state, 0.1, { climb: true });
    assert.equal(state.phase, 'ascending');
    assert.ok(state.altitudeM > depthAltitudeM);
  }
});

test('journey authority permits atmospheric exploration without permitting a solid touchdown', () => {
  let journey = createSpaceJourney({
    sourceBodyId: 'earth', destinationBodyId: 'jupiter', mode: JOURNEY_MODE.ASSISTED, startedAtMs: 1000
  });
  const accept = (event, evidence) => {
    const result = transitionSpaceJourney(journey, event, { atMs: journey.updatedAtMs + 1, ...evidence });
    assert.equal(result.accepted, true, result.reason);
    journey = result.journey;
  };
  accept('launch_ready', { spacecraftReady: true });
  accept('parking_orbit_established', { navigation: { bodyId: 'earth', captured: true, altitudeM: 200_000 } });
  accept('transfer_burn_complete', { burn: { executed: true } });
  accept('target_capture_complete', { navigation: { bodyId: 'jupiter', captured: true } });
  const solidAttempt = transitionSpaceJourney(journey, 'descent_authorized', {
    atMs: journey.updatedAtMs + 1,
    landingEligibility: { eligible: false, reason: 'solid-surface-landing-unavailable', navigation: { bodyId: 'jupiter' } }
  });
  assert.equal(solidAttempt.accepted, false);
  assert.equal(solidAttempt.reason, 'solid-surface-landing-unavailable');
  accept('atmospheric_entry_authorized', {
    atmosphericEntry: {
      authorized: true,
      noSolidSurface: true,
      navigation: { bodyId: 'jupiter', altitudeM: 20_000, relativeSpeedMps: 20 }
    }
  });
  assert.equal(journey.phase, JOURNEY_PHASE.ATMOSPHERIC_EXPLORATION);
  accept('atmospheric_departure', { spacecraftReady: true });
  assert.equal(journey.phase, JOURNEY_PHASE.ASCENT);
});

test('rendered giant-planet flight keeps one journey identity through atmosphere and Earth return', async () => {
  const position = (x, y, z) => ({ x, y, z, set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; } });
  const jupiterMesh = { position: position(420, 32, -18) };
  let landingCompletions = 0;
  const appContext = {
    completeSpaceFlightJourneyLanding() { landingCompletions += 1; },
    getAllSpaceBodies() {
      return [{ name: 'Jupiter', mesh: jupiterMesh, position: jupiterMesh.position, radius: 34, landable: false }];
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
    sourceBodyId: 'earth', destinationBodyId: 'jupiter', mode: JOURNEY_MODE.ASSISTED
  }), true);
  const journeyId = appContext.spaceJourney.journeyId;
  assert.equal(runtime.engageRenderedJourneyAssist().accepted, true);
  for (let frame = 0; frame < 251; frame += 1) runtime.updateRenderedSpaceJourney({ realDtS: 0.1 });
  assert.equal(appContext.spaceJourney.phase, JOURNEY_PHASE.APPROACH);
  const entry = runtime.requestRenderedAtmosphericEntry('jupiter');
  assert.equal(entry.accepted, true, entry.reason);
  assert.equal(appContext.spaceJourney.phase, JOURNEY_PHASE.ATMOSPHERIC_EXPLORATION);
  assert.equal(appContext.spaceAtmosphereExploration.environment.solidSurfaceAvailable, false);

  const entryAltitudeM = appContext.spaceAtmosphereExploration.altitudeM;
  for (let frame = 0; frame < 20; frame += 1) runtime.updateRenderedSpaceJourney({ realDtS: 0.1 });
  assert.ok(appContext.spaceAtmosphereExploration.altitudeM < entryAltitudeM);
  const descendedAltitudeM = appContext.spaceAtmosphereExploration.altitudeM;
  runtime.updateRenderedSpaceJourney({ realDtS: 0.1, braking: true });
  assert.ok(appContext.spaceAtmosphereExploration.altitudeM > descendedAltitudeM);

  assert.equal(runtime.requestRenderedAtmosphericDeparture().accepted, true);
  assert.equal(appContext.spaceJourney.phase, JOURNEY_PHASE.ASCENT);
  assert.equal(appContext.spaceFlight.destination, 'earth');
  assert.equal(appContext.spaceFlight._manualLandingTarget, 'Earth');
  for (let frame = 0; frame < 351; frame += 1) runtime.updateRenderedSpaceJourney({ realDtS: 0.1 });
  assert.equal(
    appContext.spaceJourney.phase,
    JOURNEY_PHASE.HOME_APPROACH,
    JSON.stringify(appContext.spaceJourneyAssistState)
  );
  assert.equal(appContext.spaceJourney.journeyId, journeyId);
  assert.equal(runtime.requestRenderedJourneyLanding('earth').accepted, true);
  for (let frame = 0; frame < 71; frame += 1) runtime.updateRenderedSpaceJourney({ realDtS: 0.1 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(appContext.spaceJourney.phase, JOURNEY_PHASE.COMPLETE);
  assert.equal(appContext.spaceJourney.journeyId, journeyId);
  assert.equal(landingCompletions, 1);
});
