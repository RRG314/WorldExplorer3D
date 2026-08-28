import { getAstronomicalBody, LANDING_MODE, normalizeAstronomicalBodyId } from '../astronomy/body-catalog.js?v=2';
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
import {
  advanceAssistedPlan,
  completeAssistedCapture,
  createAssistedAscentPlan,
  createAssistedDescentPlan,
  createAssistedTransferPlan
} from './assisted-guidance.js?v=1';
import { samplePhysicalEnvironment } from '../planetary/runtime/physical-environment.js?v=2';
import {
  advanceAtmosphericExploration,
  createAtmosphericExploration,
  evaluateAtmosphericEntry
} from './atmospheric-descent-authority.js?v=1';

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
    specificImpulseS: getAstronomicalBody(targetBodyId)?.exploration?.landingMode === LANDING_MODE.ATMOSPHERIC_DESCENT
      ? 3_000
      : 1_200
  });
}

function createSurfaceDepartureSpacecraft(ephemeris, targetBodyId, epochMs) {
  const orbitCraft = createMissionSpacecraft(ephemeris, targetBodyId, epochMs);
  return createSpacecraftState({
    ...orbitCraft,
    epochMs,
    targetBodyId,
    positionM: radialPosition(ephemeris.source, 10),
    velocityMps: ephemeris.source.velocityMps,
    propellantCapacityKg: orbitCraft.propellantCapacityKg,
    propellantKg: orbitCraft.propellantKg,
    lastEvent: 'surface-departure-ready'
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

  const publishAssistState = (overrides = {}) => {
    const plan = rendered?.assistedPlan || null;
    appContext.spaceJourneyAssistState = Object.freeze({
      available: !!rendered && rendered.journey.mode !== JOURNEY_MODE.MANUAL,
      active: !!plan,
      kind: plan?.kind || null,
      progress: plan
        ? Math.max(0, Math.min(1, plan.elapsedPresentationS / plan.presentationDurationS))
        : 0,
      ...overrides
    });
  };

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
    return body?.mesh && body?.position
      ? { mesh: { position: body.position }, sourceMesh: body.mesh, radius: Number(body.radius) || 28 }
      : null;
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
    const priorJourney = appContext.spaceJourney;
    const continuingReturn = options.resumeJourney === true &&
      priorJourney?.phase === JOURNEY_PHASE.SURFACE &&
      priorJourney.destinationBodyId === sourceBodyId &&
      priorJourney.sourceBodyId === destinationBodyId;
    let journey;
    let spacecraft;
    let initialAssistedPlan = null;
    if (continuingReturn) {
      journey = transitionOrThrow(priorJourney, 'takeoff', {
        atMs: Math.max(priorJourney.updatedAtMs, epochMs),
        spacecraftReady: true
      });
      spacecraft = createSurfaceDepartureSpacecraft(ephemeris, destinationBodyId, epochMs);
      if (journey.mode !== JOURNEY_MODE.MANUAL) {
        initialAssistedPlan = createAssistedAscentPlan(spacecraft, ephemeris.source);
      }
    } else {
      journey = createSpaceJourney({
        sourceBodyId,
        destinationBodyId,
        mode: options.mode || JOURNEY_MODE.MANUAL,
        startedAtMs: epochMs
      });
      journey = transitionOrThrow(journey, 'launch_ready', { atMs: epochMs + 1, spacecraftReady: true });
      spacecraft = createMissionSpacecraft(ephemeris, destinationBodyId, epochMs);
      const sourceNavigation = computeBodyRelativeNavigation(spacecraft, ephemeris.source);
      journey = transitionOrThrow(journey, 'parking_orbit_established', {
        atMs: epochMs + 2,
        navigation: sourceNavigation
      });
    }
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
      descentRequested: false,
      assistedPlan: initialAssistedPlan,
      atmosphericExploration: null,
      approachHold: false,
      continuingReturn
    };
    rocket.position.set(rendered.lastScenePosition.x, rendered.lastScenePosition.y, rendered.lastScenePosition.z);
    appContext.spaceJourney = journey;
    appContext.spacecraftState = spacecraft;
    appContext.spaceJourneyEphemeris = ephemeris;
    appContext.spaceFlight.speed = Math.hypot(spacecraft.velocityMps.x, spacecraft.velocityMps.y, spacecraft.velocityMps.z);
    publishAssistState();
    return true;
  };

  const engageRenderedJourneyAssist = () => {
    if (!rendered) return Object.freeze({ accepted: false, reason: 'rendered-journey-not-active' });
    if (rendered.journey.mode === JOURNEY_MODE.MANUAL) {
      return Object.freeze({ accepted: false, reason: 'manual-flight-selected' });
    }
    if (rendered.assistedPlan) {
      return Object.freeze({ accepted: true, reason: null, alreadyActive: true });
    }
    if (![JOURNEY_PHASE.PARKING_ORBIT, JOURNEY_PHASE.TRANSFER, JOURNEY_PHASE.RETURN_TRANSFER].includes(rendered.journey.phase)) {
      return Object.freeze({ accepted: false, reason: 'flight-assist-not-available-in-phase' });
    }
    const plan = createAssistedTransferPlan(rendered.spacecraft, rendered.ephemeris);
    if (!plan.accepted) return plan;
    if (rendered.journey.phase === JOURNEY_PHASE.PARKING_ORBIT) {
      rendered.journey = transitionOrThrow(rendered.journey, 'transfer_burn_complete', {
        atMs: Math.max(rendered.journey.updatedAtMs, plan.startState.epochMs),
        burn: plan.departureBurn
      });
    }
    rendered.spacecraft = plan.startState;
    rendered.assistedPlan = plan;
    appContext.spacecraftState = rendered.spacecraft;
    appContext.spaceJourney = rendered.journey;
    publishAssistState();
    return Object.freeze({ accepted: true, reason: null, plan });
  };

  const toggleRenderedJourneyAssist = () => {
    if (!rendered) return Object.freeze({ accepted: false, reason: 'rendered-journey-not-active' });
    if (rendered.assistedPlan?.kind === 'transfer') {
      rendered.assistedPlan = null;
      publishAssistState({ cancelled: true });
      return Object.freeze({ accepted: true, reason: null, active: false });
    }
    return engageRenderedJourneyAssist();
  };

  const retargetRenderedSpaceJourney = (destinationInput) => {
    if (!rendered || rendered.journey.phase !== JOURNEY_PHASE.PARKING_ORBIT || rendered.assistedPlan) {
      return Object.freeze({ accepted: false, reason: 'destination-change-requires-parking-orbit' });
    }
    const destinationBodyId = normalizeAstronomicalBodyId(destinationInput);
    if (!destinationBodyId || destinationBodyId === rendered.ephemeris.source.bodyId) {
      return Object.freeze({ accepted: false, reason: 'invalid-space-destination' });
    }
    const sourceBodyId = rendered.ephemeris.source.bodyId;
    const mode = rendered.journey.mode;
    if (!beginRenderedSpaceJourney({ sourceBodyId, destinationBodyId, mode })) {
      return Object.freeze({ accepted: false, reason: 'destination-scene-unavailable' });
    }
    const body = getAstronomicalBody(destinationBodyId);
    appContext.spaceFlight.destination = destinationBodyId;
    appContext.spaceFlight.mode = 'flying';
    appContext.spaceFlight._lastFrameMs = 0;
    appContext.spaceFlight._manualLandingTarget = body?.name || destinationBodyId;
    const destinationElement = globalThis.document?.getElementById?.('sfDestination');
    const landingButton = globalThis.document?.getElementById?.('sfLandBtn');
    if (destinationElement) destinationElement.textContent = body?.name || destinationBodyId;
    if (landingButton) landingButton.textContent = `LAND ON ${(body?.name || destinationBodyId).toUpperCase()}`;
    return Object.freeze({ accepted: true, reason: null, destinationBodyId });
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

  const publishRenderedEnvironment = () => {
    if (!rendered) return;
    const samples = [rendered.ephemeris.source, rendered.ephemeris.destination].map((bodyState) => ({
      bodyState,
      navigation: computeBodyRelativeNavigation(rendered.spacecraft, bodyState)
    })).sort((a, b) => a.navigation.altitudeM - b.navigation.altitudeM);
    const nearest = samples[0];
    if (!nearest || nearest.navigation.altitudeM > 500_000) {
      appContext.spaceFlightEnvironment = null;
      return;
    }
    appContext.spaceFlightEnvironment = samplePhysicalEnvironment(nearest.bodyState.bodyId, {
      heightM: rendered.journey.phase === JOURNEY_PHASE.ATMOSPHERIC_EXPLORATION
        ? nearest.navigation.altitudeM
        : Math.max(0, nearest.navigation.altitudeM),
      timestampS: rendered.spacecraft.epochMs / 1000
    });
  };

  const updateAtmosphericExploration = (realDtS, options = {}) => {
    if (!rendered?.atmosphericExploration) return false;
    const previous = rendered.atmosphericExploration;
    const throttle = Number.isFinite(Number(options.throttle)) ? Number(options.throttle) : 0;
    const next = advanceAtmosphericExploration(previous, realDtS, {
      climb: options.braking === true,
      descend: throttle <= 0
    });
    const body = rendered.ephemeris.destination;
    const offset = {
      x: rendered.spacecraft.positionM.x - body.positionM.x,
      y: rendered.spacecraft.positionM.y - body.positionM.y,
      z: rendered.spacecraft.positionM.z - body.positionM.z
    };
    const length = Math.hypot(offset.x, offset.y, offset.z) || 1;
    const radial = { x: offset.x / length, y: offset.y / length, z: offset.z / length };
    const verticalSpeedMps = realDtS > 0 ? (next.altitudeM - previous.altitudeM) / realDtS : 0;
    rendered.spacecraft = createSpacecraftState({
      ...rendered.spacecraft,
      epochMs: rendered.spacecraft.epochMs + realDtS * 1000,
      positionM: {
        x: body.positionM.x + radial.x * (body.radiusM + next.altitudeM),
        y: body.positionM.y + radial.y * (body.radiusM + next.altitudeM),
        z: body.positionM.z + radial.z * (body.radiusM + next.altitudeM)
      },
      velocityMps: {
        x: body.velocityMps.x + radial.x * verticalSpeedMps,
        y: body.velocityMps.y + radial.y * verticalSpeedMps,
        z: body.velocityMps.z + radial.z * verticalSpeedMps
      },
      propellantCapacityKg: rendered.spacecraft.propellantCapacityKg,
      propellantKg: rendered.spacecraft.propellantKg
    });
    rendered.atmosphericExploration = next;
    appContext.spaceAtmosphereExploration = next;
    return true;
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
    let assistedUpdate = null;
    const atmosphericUpdate = rendered.journey.phase === JOURNEY_PHASE.ATMOSPHERIC_EXPLORATION
      ? updateAtmosphericExploration(realDtS, options)
      : false;
    if (!atmosphericUpdate && rendered.assistedPlan) {
      assistedUpdate = advanceAssistedPlan(rendered.assistedPlan, realDtS);
      rendered.assistedPlan = assistedUpdate.plan;
      rendered.spacecraft = assistedUpdate.state;
      if (assistedUpdate.complete && rendered.assistedPlan.kind === 'ascent') {
        const navigation = computeBodyRelativeNavigation(rendered.spacecraft, rendered.ephemeris.source);
        rendered.journey = transitionOrThrow(rendered.journey, 'departure_cleared', {
          atMs: Math.max(rendered.journey.updatedAtMs, rendered.spacecraft.epochMs),
          navigation
        });
        const transferPlan = createAssistedTransferPlan(rendered.spacecraft, rendered.ephemeris);
        if (!transferPlan.accepted) {
          rendered.assistedPlan = null;
          publishAssistState({ failureReason: transferPlan.reason });
        } else {
          rendered.spacecraft = transferPlan.startState;
          rendered.assistedPlan = transferPlan;
          publishAssistState();
        }
      } else if (assistedUpdate.complete && rendered.assistedPlan.kind === 'transfer') {
        const capture = completeAssistedCapture(
          rendered.spacecraft,
          rendered.ephemeris,
          rendered.assistedPlan.axis
        );
        if (!capture.executed) {
          rendered.assistedPlan = null;
          publishAssistState({ failureReason: capture.reason });
        } else {
          rendered.spacecraft = capture.state;
          const navigation = computeBodyRelativeNavigation(rendered.spacecraft, rendered.ephemeris.destination);
          const captureEvent = rendered.journey.phase === JOURNEY_PHASE.RETURN_TRANSFER
            ? 'home_capture_complete'
            : 'target_capture_complete';
          rendered.journey = transitionOrThrow(rendered.journey, captureEvent, {
            atMs: Math.max(rendered.journey.updatedAtMs, rendered.spacecraft.epochMs),
            navigation
          });
          rendered.assistedPlan = null;
          rendered.approachHold = true;
          publishAssistState({ completed: true, holding: true });
        }
      }
    } else {
      updateDescentGuidance();
    }
    const forward = options.thrustDirection || { x: 0, y: 1, z: 0 };
    const velocity = rendered.spacecraft.velocityMps;
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    const retrograde = speed > 1e-9
      ? { x: -velocity.x / speed, y: -velocity.y / speed, z: -velocity.z / speed }
      : { x: -forward.x, y: -forward.y, z: -forward.z };
    const braking = options.braking === true;
    if (rendered.approachHold && (Number(options.throttle) > 0 || braking)) {
      rendered.approachHold = false;
      publishAssistState({ holding: false });
    }
    if (!atmosphericUpdate && !assistedUpdate && !rendered.approachHold) {
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
    }
    const atMs = Math.max(rendered.journey.updatedAtMs, rendered.spacecraft.epochMs);
    if (!assistedUpdate) updateRenderedJourneyPhase(atMs);
    if ([JOURNEY_PHASE.DESCENT, JOURNEY_PHASE.HOME_DESCENT].includes(rendered.journey.phase)) {
      const landingEligibility = evaluateLandingEligibility(rendered.spacecraft, rendered.ephemeris.destination);
      if (
        landingEligibility.eligible &&
        landingEligibility.navigation.altitudeM <= 20 &&
        landingEligibility.navigation.relativeSpeedMps <= 15
      ) {
        const touchdownEvent = rendered.journey.phase === JOURNEY_PHASE.HOME_DESCENT
          ? 'mission_complete'
          : 'touchdown';
        rendered.journey = transitionOrThrow(rendered.journey, touchdownEvent, {
          atMs,
          landingEligibility
        });
        rendered.descentRequested = false;
        rendered.assistedPlan = null;
        publishAssistState({ completed: true });
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
    publishRenderedEnvironment();
    appContext.spaceFlight._isThrusting = Number(options.throttle) > 0 || braking;
    if (rendered.assistedPlan) publishAssistState();
    return true;
  };

  const requestRenderedJourneyLanding = (targetInput) => {
    if (!rendered) return Object.freeze({ accepted: false, reason: 'rendered-journey-not-active' });
    const targetBodyId = normalizeAstronomicalBodyId(targetInput);
    if (targetBodyId !== rendered.ephemeris.destination.bodyId) {
      return Object.freeze({ accepted: false, reason: 'landing-target-mismatch' });
    }
    const eligibility = evaluateLandingEligibility(rendered.spacecraft, rendered.ephemeris.destination);
    if (![JOURNEY_PHASE.APPROACH, JOURNEY_PHASE.HOME_APPROACH].includes(rendered.journey.phase)) {
      return Object.freeze({ accepted: false, reason: 'journey-not-in-approach', eligibility });
    }
    const descentEvent = rendered.journey.phase === JOURNEY_PHASE.HOME_APPROACH
      ? 'home_descent_authorized'
      : 'descent_authorized';
    const result = transitionSpaceJourney(rendered.journey, descentEvent, {
      atMs: Math.max(rendered.journey.updatedAtMs, rendered.spacecraft.epochMs),
      landingEligibility: eligibility
    });
    if (!result.accepted) return Object.freeze({ accepted: false, reason: result.reason, eligibility });
    rendered.journey = result.journey;
    rendered.descentRequested = true;
    rendered.approachHold = false;
    rendered.assistedPlan = rendered.journey.mode === JOURNEY_MODE.MANUAL
      ? null
      : createAssistedDescentPlan(rendered.spacecraft, rendered.ephemeris.destination);
    appContext.spaceJourney = rendered.journey;
    publishAssistState({ holding: false });
    return Object.freeze({ accepted: true, reason: null, eligibility });
  };

  const requestRenderedAtmosphericEntry = (targetInput) => {
    if (!rendered) return Object.freeze({ accepted: false, reason: 'rendered-journey-not-active' });
    const targetBodyId = normalizeAstronomicalBodyId(targetInput);
    if (targetBodyId !== rendered.ephemeris.destination.bodyId) {
      return Object.freeze({ accepted: false, reason: 'atmospheric-entry-target-mismatch' });
    }
    if (rendered.journey.phase !== JOURNEY_PHASE.APPROACH) {
      return Object.freeze({ accepted: false, reason: 'journey-not-in-approach' });
    }
    const navigation = computeBodyRelativeNavigation(rendered.spacecraft, rendered.ephemeris.destination);
    const entry = evaluateAtmosphericEntry(targetBodyId, navigation);
    const result = transitionSpaceJourney(rendered.journey, 'atmospheric_entry_authorized', {
      atMs: Math.max(rendered.journey.updatedAtMs, rendered.spacecraft.epochMs),
      atmosphericEntry: entry
    });
    if (!result.accepted) return Object.freeze({ accepted: false, reason: result.reason, entry });
    rendered.journey = result.journey;
    rendered.approachHold = false;
    rendered.assistedPlan = null;
    rendered.atmosphericExploration = createAtmosphericExploration(targetBodyId, {
      altitudeM: navigation.altitudeM,
      timestampS: rendered.spacecraft.epochMs / 1000
    });
    appContext.spaceJourney = rendered.journey;
    appContext.spaceAtmosphereExploration = rendered.atmosphericExploration;
    appContext.spaceFlight._atmosphericClimbRequested = false;
    publishAssistState({ active: false, holding: false });
    return Object.freeze({ accepted: true, reason: null, entry, exploration: rendered.atmosphericExploration });
  };

  const requestRenderedAtmosphericDeparture = () => {
    if (!rendered || rendered.journey.phase !== JOURNEY_PHASE.ATMOSPHERIC_EXPLORATION) {
      return Object.freeze({ accepted: false, reason: 'atmospheric-exploration-not-active' });
    }
    const priorJourney = rendered.journey;
    const atMs = Math.max(priorJourney.updatedAtMs, rendered.spacecraft.epochMs);
    const result = transitionSpaceJourney(priorJourney, 'atmospheric_departure', {
      atMs,
      spacecraftReady: true
    });
    if (!result.accepted) return Object.freeze({ accepted: false, reason: result.reason });
    const sourceBodyId = priorJourney.destinationBodyId;
    const destinationBodyId = priorJourney.sourceBodyId;
    const sourceScene = sceneBody(sourceBodyId);
    const destinationScene = sceneBody(destinationBodyId);
    if (!sourceScene || !destinationScene) return Object.freeze({ accepted: false, reason: 'return-scene-unavailable' });
    const sceneOffset = {
      x: destinationScene.mesh.position.x - sourceScene.mesh.position.x,
      y: destinationScene.mesh.position.y - sourceScene.mesh.position.y,
      z: destinationScene.mesh.position.z - sourceScene.mesh.position.z
    };
    const sceneDistance = Math.hypot(sceneOffset.x, sceneOffset.y, sceneOffset.z);
    if (sceneDistance <= 1e-6) return Object.freeze({ accepted: false, reason: 'return-scene-axis-unavailable' });
    const ephemeris = createJourneyEphemeris({
      sourceBodyId,
      destinationBodyId,
      epochMs: atMs,
      axis: { x: sceneOffset.x / sceneDistance, y: sceneOffset.y / sceneDistance, z: sceneOffset.z / sceneDistance }
    });
    const altitudeM = rendered.atmosphericExploration?.altitudeM ?? 20_000;
    let spacecraft = createSpacecraftState({
      ...rendered.spacecraft,
      epochMs: atMs,
      targetBodyId: destinationBodyId,
      positionM: radialPosition(ephemeris.source, altitudeM),
      velocityMps: ephemeris.source.velocityMps,
      propellantCapacityKg: rendered.spacecraft.propellantCapacityKg,
      propellantKg: rendered.spacecraft.propellantKg,
      lastEvent: 'atmospheric-departure-ready'
    });
    const returnAxis = {
      x: sceneOffset.x / sceneDistance,
      y: sceneOffset.y / sceneDistance,
      z: sceneOffset.z / sceneDistance
    };
    const extractionVelocityMps = {
      x: ephemeris.source.velocityMps.x + returnAxis.x * 6_000,
      y: ephemeris.source.velocityMps.y + returnAxis.y * 6_000,
      z: ephemeris.source.velocityMps.z + returnAxis.z * 6_000
    };
    const extractionBurn = executePlannedBurn(spacecraft, {
      x: extractionVelocityMps.x - spacecraft.velocityMps.x,
      y: extractionVelocityMps.y - spacecraft.velocityMps.y,
      z: extractionVelocityMps.z - spacecraft.velocityMps.z
    });
    if (!extractionBurn.executed) {
      return Object.freeze({ accepted: false, reason: extractionBurn.reason || 'atmospheric-extraction-burn-failed' });
    }
    spacecraft = extractionBurn.state;
    const presentation = createJourneyPresentationMap({
      physicalSource: ephemeris.source.positionM,
      physicalDestination: ephemeris.destination.positionM,
      sceneSource: sourceScene.mesh.position,
      sceneDestination: destinationScene.mesh.position,
      sourcePhysicalRadiusM: ephemeris.source.radiusM,
      destinationPhysicalRadiusM: ephemeris.destination.radiusM,
      sourceSceneRadius: sourceScene.radius,
      destinationSceneRadius: destinationScene.radius
    });
    rendered = {
      ...rendered,
      ephemeris,
      journey: result.journey,
      spacecraft,
      presentation,
      sourceScene,
      destinationScene,
      lastScenePosition: presentation.physicalToScene(spacecraft.positionM),
      atmosphericExploration: null,
      approachHold: false,
      continuingReturn: true,
      assistedPlan: result.journey.mode === JOURNEY_MODE.MANUAL
        ? null
        : createAssistedAscentPlan(spacecraft, ephemeris.source, { endVelocityMps: extractionVelocityMps })
    };
    appContext.spaceFlight.rocket.position.set(
      rendered.lastScenePosition.x,
      rendered.lastScenePosition.y,
      rendered.lastScenePosition.z
    );
    appContext.spaceJourney = rendered.journey;
    appContext.spacecraftState = spacecraft;
    appContext.spaceJourneyEphemeris = ephemeris;
    appContext.spaceAtmosphereExploration = null;
    appContext.spaceFlight._atmosphericClimbRequested = false;
    appContext.spaceFlight.destination = destinationBodyId;
    appContext.spaceFlight._manualLandingTarget = getAstronomicalBody(destinationBodyId)?.name || destinationBodyId;
    const destinationElement = globalThis.document?.getElementById?.('sfDestination');
    if (destinationElement) destinationElement.textContent = getAstronomicalBody(destinationBodyId)?.name || destinationBodyId;
    publishAssistState();
    return Object.freeze({ accepted: true, reason: null, extractionBurn });
  };

  const clearRenderedSpaceJourney = () => {
    rendered = null;
    appContext.spaceFlightEnvironment = null;
    appContext.spaceAtmosphereExploration = null;
    if (appContext.spaceFlight) appContext.spaceFlight._atmosphericClimbRequested = false;
    publishAssistState();
  };

  const startFastTravelJourney = async (destinationInput, options = {}) => {
    const destinationBodyId = normalizeAstronomicalBodyId(destinationInput);
    const sourceBodyId = options.sourceBodyId
      || appContext.activePlanetaryBodyId
      || (appContext.onMoon ? 'moon' : appContext.onMars ? 'mars' : 'earth');
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
          destinationBodyId === 'earth' ? appContext.arriveAtEarth :
            () => appContext.arriveAtSolidWorld?.(destinationBodyId)
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
    engageRenderedJourneyAssist,
    retargetRenderedSpaceJourney,
    requestRenderedJourneyLanding,
    requestRenderedAtmosphericDeparture,
    requestRenderedAtmosphericEntry,
    startFastTravelJourney,
    toggleRenderedJourneyAssist,
    updateRenderedSpaceJourney
  });
  return Object.freeze({
    beginRenderedSpaceJourney,
    cancelSpaceJourneyOperation,
    clearRenderedSpaceJourney,
    engageRenderedJourneyAssist,
    retargetRenderedSpaceJourney,
    requestRenderedJourneyLanding,
    requestRenderedAtmosphericDeparture,
    requestRenderedAtmosphericEntry,
    startFastTravelJourney,
    toggleRenderedJourneyAssist,
    updateRenderedSpaceJourney
  });
}

export {
  completeFastTravelEvidence,
  FAST_TRAVEL_DELTA_V_MPS,
  installSpaceJourneyRuntime
};
