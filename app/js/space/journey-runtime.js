import { getAstronomicalBody, normalizeAstronomicalBodyId } from '../astronomy/body-catalog.js?v=1';
import {
  createJourneyEphemeris,
  createSpaceJourney,
  JOURNEY_MODE,
  transitionSpaceJourney
} from './journey-authority.js?v=1';
import {
  createSpacecraftState,
  evaluateLandingEligibility,
  executePlannedBurn,
  GRAVITATIONAL_CONSTANT
} from './spacecraft-authority.js?v=1';

const FAST_TRAVEL_DELTA_V_MPS = Object.freeze({
  'earth:moon': 3_200,
  'moon:earth': 2_700,
  'earth:mars': 6_000,
  'mars:earth': 6_000
});

function transitionOrThrow(journey, event, evidence) {
  const result = transitionSpaceJourney(journey, event, evidence);
  if (!result.accepted) throw new Error(`Space journey rejected ${event}: ${result.reason}`);
  return result.journey;
}

function radialPosition(bodyState, altitudeM) {
  return {
    x: bodyState.positionM.x + bodyState.radiusM + altitudeM,
    y: bodyState.positionM.y,
    z: bodyState.positionM.z
  };
}

function createMissionSpacecraft(ephemeris, targetBodyId, epochMs) {
  const orbitRadiusM = ephemeris.source.radiusM + 200_000;
  const circularSpeedMps = Math.sqrt(
    GRAVITATIONAL_CONSTANT * ephemeris.source.massKg / orbitRadiusM
  );
  return createSpacecraftState({
    missionId: `expedition-${ephemeris.source.bodyId}-${targetBodyId}-${epochMs}`,
    epochMs,
    targetBodyId,
    positionM: radialPosition(ephemeris.source, 200_000),
    velocityMps: { x: 0, y: circularSpeedMps, z: 0 },
    dryMassKg: 14_500,
    propellantCapacityKg: 34_000,
    propellantKg: 34_000,
    maxThrustN: 900_000,
    specificImpulseS: 900
  });
}

function completeFastTravelEvidence(options = {}) {
  const sourceBodyId = normalizeAstronomicalBodyId(options.sourceBodyId);
  const destinationBodyId = normalizeAstronomicalBodyId(options.destinationBodyId);
  if (!sourceBodyId || !destinationBodyId || sourceBodyId === destinationBodyId) {
    throw new RangeError('Fast travel requires different known source and destination bodies.');
  }
  const epochMs = Number(options.epochMs ?? Date.now());
  const ephemeris = createJourneyEphemeris({
    sourceBodyId,
    destinationBodyId,
    epochMs,
    separationM: options.separationM,
    axis: options.axis || { x: 1, y: 0, z: 0 }
  });
  let journey = createSpaceJourney({
    sourceBodyId,
    destinationBodyId,
    mode: JOURNEY_MODE.FAST_TRAVEL,
    startedAtMs: epochMs
  });
  let spacecraft = createMissionSpacecraft(ephemeris, destinationBodyId, epochMs);
  const sourceNavigation = {
    bodyId: sourceBodyId,
    altitudeM: 200_000,
    captured: true
  };
  journey = transitionOrThrow(journey, 'launch_ready', {
    atMs: epochMs + 1,
    spacecraftReady: true
  });
  journey = transitionOrThrow(journey, 'parking_orbit_established', {
    atMs: epochMs + 2,
    navigation: sourceNavigation
  });
  const deltaV = Number(options.transferDeltaVMps ?? FAST_TRAVEL_DELTA_V_MPS[`${sourceBodyId}:${destinationBodyId}`] ?? 6_000);
  const burn = executePlannedBurn(spacecraft, { x: 0, y: deltaV, z: 0 });
  journey = transitionOrThrow(journey, 'transfer_burn_complete', {
    atMs: epochMs + 3,
    burn
  });
  spacecraft = burn.state;

  const destinationBody = ephemeris.destination;
  spacecraft = createSpacecraftState({
    ...spacecraft,
    epochMs: spacecraft.epochMs,
    targetBodyId: destinationBodyId,
    positionM: radialPosition(destinationBody, 10),
    velocityMps: {
      x: destinationBody.velocityMps.x - 5,
      y: destinationBody.velocityMps.y + 4,
      z: destinationBody.velocityMps.z
    },
    propellantCapacityKg: spacecraft.propellantCapacityKg,
    propellantKg: spacecraft.propellantKg
  });
  const landingEligibility = evaluateLandingEligibility(spacecraft, destinationBody, {
    maxAltitudeM: 25_000,
    maxRelativeSpeedMps: 120,
    maxHorizontalSpeedMps: 80
  });
  journey = transitionOrThrow(journey, 'target_capture_complete', {
    atMs: epochMs + 4,
    navigation: { ...landingEligibility.navigation, bodyId: destinationBodyId, captured: true }
  });
  journey = transitionOrThrow(journey, 'descent_authorized', {
    atMs: epochMs + 5,
    landingEligibility
  });
  journey = transitionOrThrow(journey, 'touchdown', {
    atMs: epochMs + 6,
    landingEligibility
  });
  return Object.freeze({ journey, spacecraft, ephemeris, landingEligibility, burn });
}

function installSpaceJourneyRuntime(appContext) {
  let operationId = 0;

  const startFastTravelJourney = async (destinationInput, options = {}) => {
    const destinationBodyId = normalizeAstronomicalBodyId(destinationInput);
    const sourceBodyId = options.sourceBodyId || (appContext.onMoon ? 'moon' : appContext.onMars ? 'mars' : 'earth');
    if (!destinationBodyId || destinationBodyId === sourceBodyId) return false;
    const currentOperation = ++operationId;
    const result = completeFastTravelEvidence({
      sourceBodyId,
      destinationBodyId,
      epochMs: Date.now(),
      separationM: options.separationM
    });
    appContext.spaceJourney = result.journey;
    appContext.spacecraftState = result.spacecraft;
    appContext.spaceJourneyEphemeris = result.ephemeris;
    appContext.setEnvironmentTransitionActive?.(true);
    appContext.setPauseReason?.('planetary_transition', true);
    if (typeof appContext.showTransitionLoad === 'function') {
      await appContext.showTransitionLoad(destinationBodyId, options.transitionDurationMs ?? 900);
    }
    if (currentOperation !== operationId) return false;
    const arrive = options.arrive || (
      destinationBodyId === 'moon' ? appContext.arriveAtMoon :
        destinationBodyId === 'mars' ? appContext.arriveAtMars :
          appContext.arriveAtEarth
    );
    if (typeof arrive !== 'function') return false;
    await arrive();
    return true;
  };

  const cancelSpaceJourneyOperation = () => {
    operationId += 1;
  };

  Object.assign(appContext, {
    cancelSpaceJourneyOperation,
    completeFastTravelEvidence,
    startFastTravelJourney
  });
  return Object.freeze({ cancelSpaceJourneyOperation, startFastTravelJourney });
}

export {
  completeFastTravelEvidence,
  FAST_TRAVEL_DELTA_V_MPS,
  installSpaceJourneyRuntime
};
