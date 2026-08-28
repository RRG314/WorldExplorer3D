import { getAstronomicalBody, normalizeAstronomicalBodyId } from '../astronomy/body-catalog.js?v=1';
import {
  createJourneyEphemeris,
  createJourneyPresentationMap,
  createSpaceJourney,
  JOURNEY_MODE,
  JOURNEY_PHASE,
  transitionSpaceJourney
} from './journey-authority.js?v=1';
import {
  computeBodyRelativeNavigation,
  createSpacecraftState,
  evaluateLandingEligibility,
  executePlannedBurn,
  GRAVITATIONAL_CONSTANT,
  propagateSpacecraft
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
  let rendered = null;

  const sceneBody = (bodyId) => {
    const normalized = normalizeAstronomicalBodyId(bodyId);
    if (normalized === 'earth' && appContext.spaceFlight?.earth) {
      return { mesh: appContext.spaceFlight.earth, radius: 50 };
    }
    if (normalized === 'moon' && appContext.spaceFlight?.moon) {
      return { mesh: appContext.spaceFlight.moon, radius: 13.5 };
    }
    const body = appContext.getAllSpaceBodies?.().find((entry) =>
      normalizeAstronomicalBodyId(entry?.name) === normalized
    );
    return body?.mesh && body?.position ? { mesh: body.mesh, radius: Number(body.radius) || 28 } : null;
  };

  const beginRenderedSpaceJourney = (options = {}) => {
    const sourceBodyId = normalizeAstronomicalBodyId(options.sourceBodyId);
    const destinationBodyId = normalizeAstronomicalBodyId(options.destinationBodyId);
    const sourceScene = sceneBody(sourceBodyId);
    const destinationScene = sceneBody(destinationBodyId);
    const rocket = appContext.spaceFlight?.rocket;
    if (!sourceBodyId || !destinationBodyId || !sourceScene || !destinationScene || !rocket) return false;
    const sourcePosition = sourceScene.mesh.position;
    const destinationPosition = destinationScene.mesh.position;
    const sceneOffset = {
      x: destinationPosition.x - sourcePosition.x,
      y: destinationPosition.y - sourcePosition.y,
      z: destinationPosition.z - sourcePosition.z
    };
    const sceneDistance = Math.hypot(sceneOffset.x, sceneOffset.y, sceneOffset.z);
    if (sceneDistance <= 1e-6) return false;
    const axis = {
      x: sceneOffset.x / sceneDistance,
      y: sceneOffset.y / sceneDistance,
      z: sceneOffset.z / sceneDistance
    };
    const epochMs = Date.now();
    const ephemeris = createJourneyEphemeris({
      sourceBodyId,
      destinationBodyId,
      epochMs,
      separationM: options.separationM,
      axis
    });
    let journey = createSpaceJourney({
      sourceBodyId,
      destinationBodyId,
      mode: options.mode || JOURNEY_MODE.MANUAL,
      startedAtMs: epochMs
    });
    journey = transitionOrThrow(journey, 'launch_ready', { atMs: epochMs + 1, spacecraftReady: true });
    let spacecraft = createMissionSpacecraft(ephemeris, destinationBodyId, epochMs);
    const sourceNavigation = computeBodyRelativeNavigation(spacecraft, ephemeris.source);
    journey = transitionOrThrow(journey, 'parking_orbit_established', {
      atMs: epochMs + 2,
      navigation: sourceNavigation
    });
    const presentation = createJourneyPresentationMap({
      physicalSource: ephemeris.source.positionM,
      physicalDestination: ephemeris.destination.positionM,
      sceneSource: sourcePosition,
      sceneDestination: destinationPosition,
      sourcePhysicalRadiusM: ephemeris.source.radiusM,
      destinationPhysicalRadiusM: ephemeris.destination.radiusM,
      sourceSceneRadius: sourceScene.radius,
      destinationSceneRadius: destinationScene.radius
    });
    rendered = {
      ephemeris,
      journey,
      spacecraft,
      presentation,
      sourceScene,
      destinationScene,
      initialPropellantKg: spacecraft.propellantKg,
      lastScenePosition: presentation.physicalToScene(spacecraft.positionM),
      descentRequested: false
    };
    rocket.position.set(rendered.lastScenePosition.x, rendered.lastScenePosition.y, rendered.lastScenePosition.z);
    appContext.spaceJourney = journey;
    appContext.spacecraftState = spacecraft;
    appContext.spaceJourneyEphemeris = ephemeris;
    appContext.spaceFlight.speed = Math.hypot(spacecraft.velocityMps.x, spacecraft.velocityMps.y, spacecraft.velocityMps.z);
    return true;
  };

  const updateRenderedJourneyPhase = (atMs) => {
    if (!rendered) return;
    const sourceNavigation = computeBodyRelativeNavigation(rendered.spacecraft, rendered.ephemeris.source);
    const destinationNavigation = computeBodyRelativeNavigation(rendered.spacecraft, rendered.ephemeris.destination);
    if (
      rendered.journey.phase === JOURNEY_PHASE.PARKING_ORBIT &&
      sourceNavigation.altitudeM >= 500_000 &&
      rendered.spacecraft.propellantKg < rendered.initialPropellantKg
    ) {
      rendered.journey = transitionOrThrow(rendered.journey, 'transfer_burn_complete', {
        atMs,
        burn: { executed: true }
      });
    }
    if (
      rendered.journey.phase === JOURNEY_PHASE.TRANSFER &&
      destinationNavigation.captured && destinationNavigation.altitudeM < 1_000_000
    ) {
      rendered.journey = transitionOrThrow(rendered.journey, 'target_capture_complete', {
        atMs,
        navigation: destinationNavigation
      });
    }
  };

  const updateDescentGuidance = () => {
    if (!rendered?.descentRequested) return;
    const target = rendered.ephemeris.destination;
    const navigation = computeBodyRelativeNavigation(rendered.spacecraft, target);
    const offset = {
      x: rendered.spacecraft.positionM.x - target.positionM.x,
      y: rendered.spacecraft.positionM.y - target.positionM.y,
      z: rendered.spacecraft.positionM.z - target.positionM.z
    };
    const length = Math.hypot(offset.x, offset.y, offset.z) || 1;
    const radial = { x: offset.x / length, y: offset.y / length, z: offset.z / length };
    const descentSpeed = Math.max(2, Math.min(35, navigation.altitudeM / 120));
    const desiredVelocity = {
      x: target.velocityMps.x - radial.x * descentSpeed,
      y: target.velocityMps.y - radial.y * descentSpeed,
      z: target.velocityMps.z - radial.z * descentSpeed
    };
    const correction = {
      x: desiredVelocity.x - rendered.spacecraft.velocityMps.x,
      y: desiredVelocity.y - rendered.spacecraft.velocityMps.y,
      z: desiredVelocity.z - rendered.spacecraft.velocityMps.z
    };
    const correctionMagnitude = Math.hypot(correction.x, correction.y, correction.z);
    if (correctionMagnitude > 0.25) {
      const limited = Math.min(18, correctionMagnitude) / correctionMagnitude;
      const burn = executePlannedBurn(rendered.spacecraft, {
        x: correction.x * limited,
        y: correction.y * limited,
        z: correction.z * limited
      });
      if (burn.executed) rendered.spacecraft = burn.state;
    }
  };

  const updateRenderedSpaceJourney = (options = {}) => {
    if (!rendered || !appContext.spaceFlight?.rocket) return false;
    const realDtS = Math.max(0, Math.min(0.1, Number(options.realDtS) || 0));
    updateDescentGuidance();
    const forward = options.thrustDirection || { x: 0, y: 1, z: 0 };
    const velocity = rendered.spacecraft.velocityMps;
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    const retrograde = speed > 1e-9
      ? { x: -velocity.x / speed, y: -velocity.y / speed, z: -velocity.z / speed }
      : { x: -forward.x, y: -forward.y, z: -forward.z };
    const braking = options.braking === true;
    rendered.spacecraft = propagateSpacecraft(rendered.spacecraft, {
      throttle: braking ? 0.72 : Number(options.throttle) || 0,
      thrustDirection: braking ? retrograde : forward,
      angular: options.angular || {},
      timeScale: options.timeScale || 1,
      altitudeM: Math.min(
        computeBodyRelativeNavigation(rendered.spacecraft, rendered.ephemeris.source).altitudeM,
        computeBodyRelativeNavigation(rendered.spacecraft, rendered.ephemeris.destination).altitudeM
      )
    }, [rendered.ephemeris.source, rendered.ephemeris.destination], realDtS);
    const atMs = Math.max(rendered.journey.updatedAtMs, rendered.spacecraft.epochMs);
    updateRenderedJourneyPhase(atMs);
    if (rendered.journey.phase === JOURNEY_PHASE.DESCENT) {
      const landingEligibility = evaluateLandingEligibility(rendered.spacecraft, rendered.ephemeris.destination);
      if (
        landingEligibility.eligible &&
        landingEligibility.navigation.altitudeM <= 20 &&
        landingEligibility.navigation.relativeSpeedMps <= 15
      ) {
        rendered.journey = transitionOrThrow(rendered.journey, 'touchdown', {
          atMs,
          landingEligibility
        });
        rendered.descentRequested = false;
        appContext.spaceFlight.mode = 'landing';
        globalThis.queueMicrotask?.(() => appContext.completeSpaceFlightJourneyLanding?.());
      }
    }
    const scenePosition = rendered.presentation.physicalToScene(rendered.spacecraft.positionM);
    const prior = rendered.lastScenePosition;
    appContext.spaceFlight.rocket.position.set(scenePosition.x, scenePosition.y, scenePosition.z);
    if (realDtS > 0 && appContext.spaceFlight.velocity?.set) {
      appContext.spaceFlight.velocity.set(
        (scenePosition.x - prior.x) / realDtS,
        (scenePosition.y - prior.y) / realDtS,
        (scenePosition.z - prior.z) / realDtS
      );
    }
    rendered.lastScenePosition = scenePosition;
    appContext.spaceFlight.speed = Math.hypot(
      rendered.spacecraft.velocityMps.x,
      rendered.spacecraft.velocityMps.y,
      rendered.spacecraft.velocityMps.z
    );
    appContext.spacecraftState = rendered.spacecraft;
    appContext.spaceJourney = rendered.journey;
    appContext.spaceFlight._isThrusting = Number(options.throttle) > 0 || braking;
    return true;
  };

  const requestRenderedJourneyLanding = (targetInput) => {
    if (!rendered) return Object.freeze({ accepted: false, reason: 'rendered-journey-not-active' });
    const targetBodyId = normalizeAstronomicalBodyId(targetInput);
    if (targetBodyId !== rendered.journey.destinationBodyId) {
      return Object.freeze({ accepted: false, reason: 'landing-target-mismatch' });
    }
    const eligibility = evaluateLandingEligibility(rendered.spacecraft, rendered.ephemeris.destination);
    if (rendered.journey.phase !== JOURNEY_PHASE.APPROACH) {
      return Object.freeze({ accepted: false, reason: 'journey-not-in-approach', eligibility });
    }
    const result = transitionSpaceJourney(rendered.journey, 'descent_authorized', {
      atMs: Math.max(rendered.journey.updatedAtMs, rendered.spacecraft.epochMs),
      landingEligibility: eligibility
    });
    if (!result.accepted) return Object.freeze({ accepted: false, reason: result.reason, eligibility });
    rendered.journey = result.journey;
    rendered.descentRequested = true;
    appContext.spaceJourney = rendered.journey;
    return Object.freeze({ accepted: true, reason: null, eligibility });
  };

  const clearRenderedSpaceJourney = () => {
    rendered = null;
  };

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
    beginRenderedSpaceJourney,
    cancelSpaceJourneyOperation,
    clearRenderedSpaceJourney,
    completeFastTravelEvidence,
    requestRenderedJourneyLanding,
    startFastTravelJourney,
    updateRenderedSpaceJourney
  });
  return Object.freeze({
    beginRenderedSpaceJourney,
    cancelSpaceJourneyOperation,
    clearRenderedSpaceJourney,
    requestRenderedJourneyLanding,
    startFastTravelJourney,
    updateRenderedSpaceJourney
  });
}

export {
  completeFastTravelEvidence,
  FAST_TRAVEL_DELTA_V_MPS,
  installSpaceJourneyRuntime
};
