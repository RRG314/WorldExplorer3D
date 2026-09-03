import { getAstronomicalBody, normalizeAstronomicalBodyId } from '../astronomy/body-catalog.js?v=3';
import {
  createJourneyEphemeris,
  createJourneyPresentationMap,
  createSpaceJourney,
  JOURNEY_MODE,
  JOURNEY_PHASE,
  transitionSpaceJourney
} from './journey-authority.js?v=2';
import {
  computeBodyRelativeNavigation,
  createSpacecraftState,
  evaluateLandingEligibility,
  executePlannedBurn,
  GRAVITATIONAL_CONSTANT,
  propagateSpacecraft
} from './spacecraft-authority.js?v=4';
import {
  advanceAssistedPlan,
  completeAssistedCapture,
  createAssistedAscentPlan,
  createAssistedDescentPlan,
  createAssistedTransferPlan
} from './assisted-guidance.js?v=3';
import { samplePhysicalEnvironment } from '../planetary/runtime/physical-environment.js?v=2';
import {
  advanceAtmosphericExploration,
  createAtmosphericExploration,
  evaluateAtmosphericEntry
} from './atmospheric-descent-authority.js?v=2';
import { resolveCelestialSceneCollision } from './celestial-collision.js?v=2';

const MANUAL_FLIGHT_RATE = 100;
const SPACECRAFT_SCENE_CLEARANCE = 6;

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

function radialPosition(bodyState, altitudeM, direction = { x: 1, y: 0, z: 0 }) {
  const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
  const distance = bodyState.radiusM + altitudeM;
  return {
    x: bodyState.positionM.x + direction.x / length * distance,
    y: bodyState.positionM.y + direction.y / length * distance,
    z: bodyState.positionM.z + direction.z / length * distance
  };
}

function createMissionSpacecraft(ephemeris, targetBodyId, epochMs) {
  const orbitRadiusM = ephemeris.source.radiusM + 4_000_000;
  const circularSpeedMps = Math.sqrt(
    GRAVITATIONAL_CONSTANT * ephemeris.source.massKg / orbitRadiusM
  );
  return createSpacecraftState({
    missionId: `expedition-${ephemeris.source.bodyId}-${targetBodyId}-${epochMs}`,
    epochMs,
    targetBodyId,
    positionM: radialPosition(ephemeris.source, 4_000_000, ephemeris.axis),
    velocityMps: { x: 0, y: circularSpeedMps, z: 0 },
    dryMassKg: 14_500,
    propellantCapacityKg: 34_000,
    propellantKg: 34_000,
    maxThrustN: 900_000,
    specificImpulseS: 30_000
  });
}

function createSurfaceDepartureSpacecraft(ephemeris, targetBodyId, epochMs, departureDirection = ephemeris.axis) {
  const orbitCraft = createMissionSpacecraft(ephemeris, targetBodyId, epochMs);
  return createSpacecraftState({
    ...orbitCraft,
    epochMs,
    targetBodyId,
    positionM: radialPosition(ephemeris.source, 10, departureDirection),
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
    positionM: radialPosition(destinationBody, 10, ephemeris.axis),
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
  let assistedSceneMotion = null;
  let assistedCurrentForward = null;
  let assistedOrientationDelta = null;

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

  const collisionBodies = () => {
    const bodies = [];
    const seen = new Set();
    const add = (entry) => {
      const name = String(entry?.name || entry?.bodyId || '').trim();
      const bodyId = normalizeAstronomicalBodyId(name) || name.toLowerCase();
      const radius = Number(entry?.radius);
      const position = entry?.position;
      if (!bodyId || seen.has(bodyId) || !position || !Number.isFinite(radius) || radius <= 0) return;
      seen.add(bodyId);
      bodies.push(Object.freeze({ bodyId, name: name || bodyId, position, radius }));
    };
    (appContext.getAllSpaceBodies?.() || []).forEach(add);
    add({ bodyId: 'earth', name: 'Earth', position: appContext.spaceFlight?.earth?.position, radius: 50 });
    add({ bodyId: 'moon', name: 'Moon', position: appContext.spaceFlight?.moon?.position, radius: 13.5 });
    return bodies;
  };

  const createLivePresentation = (ephemeris, sourceScene, destinationScene) =>
    createJourneyPresentationMap({
      physicalSource: ephemeris.source.positionM,
      physicalDestination: ephemeris.destination.positionM,
      sceneSource: sourceScene.mesh.position,
      sceneDestination: destinationScene.mesh.position,
      sourcePhysicalRadiusM: ephemeris.source.radiusM,
      destinationPhysicalRadiusM: ephemeris.destination.radiusM,
      sourceSceneRadius: sourceScene.radius,
      destinationSceneRadius: destinationScene.radius
    });

  const refreshRenderedPresentation = () => {
    if (!rendered) return false;
    const sourceScene = sceneBody(rendered.ephemeris.source.bodyId);
    const destinationScene = sceneBody(rendered.ephemeris.destination.bodyId);
    if (!sourceScene || !destinationScene) return false;
    const separation = Math.hypot(
      destinationScene.mesh.position.x - sourceScene.mesh.position.x,
      destinationScene.mesh.position.y - sourceScene.mesh.position.y,
      destinationScene.mesh.position.z - sourceScene.mesh.position.z
    );
    if (!(separation > 1e-6)) return false;
    rendered.sourceScene = sourceScene;
    rendered.destinationScene = destinationScene;
    rendered.presentation = createLivePresentation(rendered.ephemeris, sourceScene, destinationScene);
    return true;
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
    const launchOffset = {
      x: Number(rocket.position.x) - Number(sourcePosition.x),
      y: Number(rocket.position.y) - Number(sourcePosition.y),
      z: Number(rocket.position.z) - Number(sourcePosition.z)
    };
    const launchDistance = Math.hypot(launchOffset.x, launchOffset.y, launchOffset.z);
    const departureDirection = launchDistance > 1e-6
      ? {
          x: launchOffset.x / launchDistance,
          y: launchOffset.y / launchDistance,
          z: launchOffset.z / launchDistance
        }
      : null;
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
      spacecraft = createSurfaceDepartureSpacecraft(
        ephemeris,
        destinationBodyId,
        epochMs,
        departureDirection || ephemeris.axis
      );
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
      spacecraft = createSurfaceDepartureSpacecraft(
        ephemeris,
        destinationBodyId,
        epochMs,
        departureDirection || ephemeris.axis
      );
      if (journey.mode !== JOURNEY_MODE.MANUAL && options.autoAssist === true) {
        initialAssistedPlan = createAssistedAscentPlan(spacecraft, ephemeris.source);
      }
    }
    const presentation = createLivePresentation(ephemeris, sourceScene, destinationScene);
    if (options.fromCurrentPosition === true) {
      const currentScenePosition = {
        x: Number(rocket.position.x),
        y: Number(rocket.position.y),
        z: Number(rocket.position.z)
      };
      const currentSceneVelocity = appContext.spaceFlight.velocity || { x: 0, y: 0, z: 0 };
      const physicalPosition = presentation.sceneToPhysical(currentScenePosition);
      const physicalAhead = presentation.sceneToPhysical({
        x: currentScenePosition.x + Number(currentSceneVelocity.x || 0),
        y: currentScenePosition.y + Number(currentSceneVelocity.y || 0),
        z: currentScenePosition.z + Number(currentSceneVelocity.z || 0)
      });
      spacecraft = createSpacecraftState({
        ...spacecraft,
        epochMs,
        targetBodyId: destinationBodyId,
        positionM: physicalPosition,
        velocityMps: {
          x: physicalAhead.x - physicalPosition.x,
          y: physicalAhead.y - physicalPosition.y,
          z: physicalAhead.z - physicalPosition.z
        },
        propellantCapacityKg: spacecraft.propellantCapacityKg,
        propellantKg: spacecraft.propellantKg,
        lastEvent: 'course-acquired-in-flight'
      });
    }
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
      launchHold: !initialAssistedPlan && options.fromCurrentPosition !== true,
      continuingReturn
    };
    rocket.position.set(rendered.lastScenePosition.x, rendered.lastScenePosition.y, rendered.lastScenePosition.z);
    appContext.spaceJourney = journey;
    appContext.spacecraftState = spacecraft;
    appContext.spaceJourneyEphemeris = ephemeris;
    appContext.spaceFlight.presentationAuthority = 'si';
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
    if (rendered.journey.phase === JOURNEY_PHASE.LAUNCH || rendered.journey.phase === JOURNEY_PHASE.ASCENT) {
      rendered.assistedPlan = createAssistedAscentPlan(rendered.spacecraft, rendered.ephemeris.source);
      rendered.launchHold = false;
      appContext.spaceFlight.presentationAuthority = 'si';
      appContext.updateSpaceTravelSession?.({ guidance: 'assisted', reason: 'wayfinder-assist-engaged' });
      publishAssistState();
      return Object.freeze({ accepted: true, reason: null, plan: rendered.assistedPlan });
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
    appContext.updateSpaceTravelSession?.({ guidance: 'assisted', reason: 'wayfinder-assist-engaged' });
    return Object.freeze({ accepted: true, reason: null, plan });
  };

  const toggleRenderedJourneyAssist = () => {
    if (!rendered) return Object.freeze({ accepted: false, reason: 'rendered-journey-not-active' });
    if (rendered.assistedPlan?.kind === 'transfer') {
      rendered.assistedPlan = null;
      publishAssistState({ cancelled: true });
      appContext.updateSpaceTravelSession?.({ guidance: 'manual', reason: 'manual-flight-resumed' });
      return Object.freeze({ accepted: true, reason: null, active: false });
    }
    return engageRenderedJourneyAssist();
  };

  const publishCourseDestination = (destinationBodyId) => {
    const body = getAstronomicalBody(destinationBodyId);
    appContext.spaceFlight.destination = destinationBodyId;
    appContext.spaceFlight._landingTarget = null;
    appContext.spaceFlight.mode = 'flying';
    appContext.spaceFlight._lastFrameMs = 0;
    appContext.spaceFlight._manualLandingTarget = body?.name || destinationBodyId;
    const destinationElement = globalThis.document?.getElementById?.('sfDestination');
    const landingButton = globalThis.document?.getElementById?.('sfLandBtn');
    if (destinationElement) destinationElement.textContent = body?.name || destinationBodyId;
    if (landingButton) landingButton.textContent = `APPROACH ${(body?.name || destinationBodyId).toUpperCase()}`;
    appContext.updateSpaceTravelSession?.({
      destination: { id: destinationBodyId, kind: 'body', name: body?.name || destinationBodyId },
      guidance: 'manual',
      reason: 'wayfinder-course-set'
    });
  };

  const retargetRenderedSpaceJourney = (destinationInput) => {
    const blockedPhases = new Set([
      JOURNEY_PHASE.DESCENT,
      JOURNEY_PHASE.HOME_DESCENT,
      JOURNEY_PHASE.SURFACE,
      JOURNEY_PHASE.COMPLETE
    ]);
    if (!rendered || blockedPhases.has(rendered.journey.phase)) {
      return Object.freeze({ accepted: false, reason: 'finish-landing-before-changing-course' });
    }
    const destinationBodyId = normalizeAstronomicalBodyId(destinationInput);
    if (!destinationBodyId || destinationBodyId === rendered.ephemeris.source.bodyId) {
      return Object.freeze({ accepted: false, reason: 'invalid-space-destination' });
    }
    const sourceBodyId = rendered.ephemeris.source.bodyId;
    const mode = rendered.journey.mode;
    if (!beginRenderedSpaceJourney({ sourceBodyId, destinationBodyId, mode, fromCurrentPosition: true })) {
      return Object.freeze({ accepted: false, reason: 'destination-scene-unavailable' });
    }
    publishCourseDestination(destinationBodyId);
    return Object.freeze({ accepted: true, reason: null, destinationBodyId });
  };

  const setSolarSystemCourse = (destinationInput) => {
    if (!appContext.spaceFlight?.active || !appContext.spaceFlight?.rocket) {
      return Object.freeze({ accepted: false, reason: 'space-flight-not-active' });
    }
    const destinationBodyId = normalizeAstronomicalBodyId(destinationInput);
    if (!destinationBodyId || !sceneBody(destinationBodyId)) {
      return Object.freeze({ accepted: false, reason: 'invalid-space-destination' });
    }
    if (rendered) {
      if (destinationBodyId === rendered.ephemeris.destination.bodyId) {
        publishCourseDestination(destinationBodyId);
        return Object.freeze({
          accepted: true,
          reason: null,
          destinationBodyId,
          continued: true,
          phase: rendered.journey.phase
        });
      }
      return retargetRenderedSpaceJourney(destinationBodyId);
    }

    const nearestBodyId = normalizeAstronomicalBodyId(appContext.spaceFlight._nearestBody?.name);
    const launchBodyId = normalizeAstronomicalBodyId(appContext.spaceFlight._launchSource);
    let sourceBodyId = nearestBodyId || launchBodyId || 'earth';
    if (sourceBodyId === destinationBodyId) sourceBodyId = destinationBodyId === 'earth' ? 'moon' : 'earth';
    if (!sceneBody(sourceBodyId) || !beginRenderedSpaceJourney({
      sourceBodyId,
      destinationBodyId,
      mode: JOURNEY_MODE.ASSISTED,
      fromCurrentPosition: true
    })) {
      return Object.freeze({ accepted: false, reason: 'destination-scene-unavailable' });
    }
    publishCourseDestination(destinationBodyId);
    return Object.freeze({ accepted: true, reason: null, destinationBodyId, initialized: true });
  };

  const updateRenderedJourneyPhase = (atMs) => {
    if (!rendered) return;
    const sourceNavigation = computeBodyRelativeNavigation(rendered.spacecraft, rendered.ephemeris.source);
    const destinationNavigation = computeBodyRelativeNavigation(rendered.spacecraft, rendered.ephemeris.destination);
    if (
      rendered.journey.phase === JOURNEY_PHASE.LAUNCH &&
      sourceNavigation.altitudeM >= 100_000 &&
      sourceNavigation.captured
    ) {
      rendered.journey = transitionOrThrow(rendered.journey, 'parking_orbit_established', {
        atMs,
        navigation: sourceNavigation
      });
    }
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
      descend: throttle <= 0,
      throttle
    });
    const body = rendered.ephemeris.destination;
    const offset = {
      x: rendered.spacecraft.positionM.x - body.positionM.x,
      y: rendered.spacecraft.positionM.y - body.positionM.y,
      z: rendered.spacecraft.positionM.z - body.positionM.z
    };
    const length = Math.hypot(offset.x, offset.y, offset.z) || 1;
    const radial = { x: offset.x / length, y: offset.y / length, z: offset.z / length };
    const scenePosition = rendered.presentation.physicalToScene(rendered.spacecraft.positionM);
    const thrust = options.thrustDirection || { x: 0, y: 1, z: 0 };
    const physicalAhead = rendered.presentation.sceneToPhysical({
      x: scenePosition.x + Number(thrust.x || 0),
      y: scenePosition.y + Number(thrust.y || 0),
      z: scenePosition.z + Number(thrust.z || 0)
    });
    const physicalForward = {
      x: physicalAhead.x - rendered.spacecraft.positionM.x,
      y: physicalAhead.y - rendered.spacecraft.positionM.y,
      z: physicalAhead.z - rendered.spacecraft.positionM.z
    };
    const radialComponent = physicalForward.x * radial.x + physicalForward.y * radial.y + physicalForward.z * radial.z;
    const tangent = {
      x: physicalForward.x - radial.x * radialComponent,
      y: physicalForward.y - radial.y * radialComponent,
      z: physicalForward.z - radial.z * radialComponent
    };
    const tangentLength = Math.hypot(tangent.x, tangent.y, tangent.z) || 1;
    tangent.x /= tangentLength;
    tangent.y /= tangentLength;
    tangent.z /= tangentLength;
    const angularStep = realDtS > 0
      ? next.horizontalSpeedMps * realDtS / Math.max(1, body.radiusM + next.altitudeM)
      : 0;
    const movedRadial = {
      x: radial.x + tangent.x * angularStep,
      y: radial.y + tangent.y * angularStep,
      z: radial.z + tangent.z * angularStep
    };
    const movedRadialLength = Math.hypot(movedRadial.x, movedRadial.y, movedRadial.z) || 1;
    movedRadial.x /= movedRadialLength;
    movedRadial.y /= movedRadialLength;
    movedRadial.z /= movedRadialLength;
    const verticalSpeedMps = realDtS > 0 ? (next.altitudeM - previous.altitudeM) / realDtS : 0;
    rendered.spacecraft = createSpacecraftState({
      ...rendered.spacecraft,
      epochMs: rendered.spacecraft.epochMs + realDtS * 1000,
      positionM: {
        x: body.positionM.x + movedRadial.x * (body.radiusM + next.altitudeM),
        y: body.positionM.y + movedRadial.y * (body.radiusM + next.altitudeM),
        z: body.positionM.z + movedRadial.z * (body.radiusM + next.altitudeM)
      },
      velocityMps: {
        x: body.velocityMps.x + movedRadial.x * verticalSpeedMps + tangent.x * next.horizontalSpeedMps,
        y: body.velocityMps.y + movedRadial.y * verticalSpeedMps + tangent.y * next.horizontalSpeedMps,
        z: body.velocityMps.z + movedRadial.z * verticalSpeedMps + tangent.z * next.horizontalSpeedMps
      },
      propellantCapacityKg: rendered.spacecraft.propellantCapacityKg,
      propellantKg: rendered.spacecraft.propellantKg
    });
    rendered.atmosphericExploration = next;
    appContext.spaceAtmosphereExploration = next;
    appContext.spaceFlight.atmosphericRadialScene = {
      x: scenePosition.x - rendered.destinationScene.mesh.position.x,
      y: scenePosition.y - rendered.destinationScene.mesh.position.y,
      z: scenePosition.z - rendered.destinationScene.mesh.position.z
    };
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
    const previousPhysicalPosition = rendered.spacecraft.positionM;
    refreshRenderedPresentation();
    const prior = rendered.presentation.physicalToScene(previousPhysicalPosition);
    let assistedUpdate = null;
    const angular = options.angular || {};
    const manualControl = options.manualControl === true ||
      Number(options.throttle) > 0 || options.braking === true ||
      Math.hypot(Number(angular.x) || 0, Number(angular.y) || 0, Number(angular.z) || 0) > 0;
    if (manualControl && rendered.assistedPlan) {
      rendered.assistedPlan = null;
      rendered.approachHold = false;
      publishAssistState({ cancelled: true, manual: true });
      appContext.updateSpaceTravelSession?.({ guidance: 'manual', reason: 'manual-flight-resumed' });
    }
    if (rendered.launchHold && !manualControl && !rendered.assistedPlan) {
      const heldScenePosition = rendered.presentation.physicalToScene(rendered.spacecraft.positionM);
      appContext.spaceFlight.rocket.position.set(
        heldScenePosition.x,
        heldScenePosition.y,
        heldScenePosition.z
      );
      rendered.lastScenePosition = heldScenePosition;
      appContext.spaceFlight._isThrusting = false;
      appContext.spaceFlight.manualFlightRate = 1;
      publishRenderedEnvironment();
      return true;
    }
    const atmosphericUpdate = rendered.journey.phase === JOURNEY_PHASE.ATMOSPHERIC_EXPLORATION
      ? updateAtmosphericExploration(realDtS, options)
      : false;
    if (!atmosphericUpdate && rendered.assistedPlan) {
      assistedUpdate = advanceAssistedPlan(rendered.assistedPlan, realDtS);
      rendered.assistedPlan = assistedUpdate.plan;
      rendered.spacecraft = assistedUpdate.state;
      if (assistedUpdate.complete && rendered.assistedPlan.kind === 'ascent') {
        const navigation = computeBodyRelativeNavigation(rendered.spacecraft, rendered.ephemeris.source);
        const ascentEvent = rendered.journey.phase === JOURNEY_PHASE.LAUNCH
          ? 'parking_orbit_established'
          : 'departure_cleared';
        rendered.journey = transitionOrThrow(rendered.journey, ascentEvent, {
          atMs: Math.max(rendered.journey.updatedAtMs, rendered.spacecraft.epochMs),
          navigation
        });
        const transferPlan = createAssistedTransferPlan(rendered.spacecraft, rendered.ephemeris);
        if (!transferPlan.accepted) {
          rendered.assistedPlan = null;
          publishAssistState({ failureReason: transferPlan.reason });
        } else {
          if (rendered.journey.phase === JOURNEY_PHASE.PARKING_ORBIT) {
            rendered.journey = transitionOrThrow(rendered.journey, 'transfer_burn_complete', {
              atMs: Math.max(rendered.journey.updatedAtMs, transferPlan.startState.epochMs),
              burn: transferPlan.departureBurn
            });
          }
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
        angular,
        timeScale: Number(options.manualFlightRate) || MANUAL_FLIGHT_RATE,
        manualFlightRate: true,
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
    const collisionActive = !rendered.approachHold && rendered.journey.phase !== JOURNEY_PHASE.SURFACE;
    const destinationContactAuthorized = [
      JOURNEY_PHASE.DESCENT,
      JOURNEY_PHASE.HOME_DESCENT,
      JOURNEY_PHASE.ATMOSPHERIC_EXPLORATION
    ].includes(rendered.journey.phase);
    const guidedSourceDeparture = Boolean(
      assistedUpdate && rendered.assistedPlan?.kind === 'ascent'
    );
    if (collisionActive) {
      const protectedPhysicalBodies = [rendered.ephemeris.source, rendered.ephemeris.destination]
        .filter((body) => {
          if (guidedSourceDeparture && body.bodyId === rendered.ephemeris.source.bodyId) return false;
          return !destinationContactAuthorized || body.bodyId !== rendered.ephemeris.destination.bodyId;
        })
        .map((body) => ({
          bodyId: body.bodyId,
          name: getAstronomicalBody(body.bodyId)?.name || body.bodyId,
          position: body.positionM,
          radius: body.radiusM
        }));
      const physicalCollision = resolveCelestialSceneCollision(
        previousPhysicalPosition,
        rendered.spacecraft.positionM,
        protectedPhysicalBodies,
        { clearance: 6, padding: 0.5, allowOutwardEscape: true }
      );
      if (physicalCollision.collided) {
        rendered.assistedPlan = null;
        rendered.approachHold = false;
        rendered.spacecraft = createSpacecraftState({
          ...rendered.spacecraft,
          positionM: physicalCollision.position,
          velocityMps: { x: 0, y: 0, z: 0 },
          propellantCapacityKg: rendered.spacecraft.propellantCapacityKg,
          propellantKg: rendered.spacecraft.propellantKg,
          lastEvent: `contact-${physicalCollision.bodyId || 'celestial-body'}`
        });
        appContext.spaceFlight.lastCelestialContact = Object.freeze({
          bodyId: physicalCollision.bodyId,
          bodyName: physicalCollision.bodyName,
          atMs: Date.now()
        });
        publishAssistState({ cancelled: true, collision: true });
      }
    }
    let scenePosition = rendered.presentation.physicalToScene(rendered.spacecraft.positionM);
    if (collisionActive) {
      const exemptBodyId = [JOURNEY_PHASE.DESCENT, JOURNEY_PHASE.HOME_DESCENT, JOURNEY_PHASE.ATMOSPHERIC_EXPLORATION]
        .includes(rendered.journey.phase)
        ? rendered.ephemeris.destination.bodyId
        : null;
      const journeyBodyIds = new Set([
        rendered.ephemeris.source.bodyId,
        rendered.ephemeris.destination.bodyId,
        exemptBodyId
      ].filter(Boolean));
      const protectedBodies = collisionBodies().filter((body) => !journeyBodyIds.has(body.bodyId));
      const collision = resolveCelestialSceneCollision(prior, scenePosition, protectedBodies, {
        clearance: SPACECRAFT_SCENE_CLEARANCE,
        padding: 0.08,
        allowOutwardEscape: true
      });
      if (collision.collided) {
        scenePosition = collision.position;
        const guidedAvoidance = Boolean(assistedUpdate && rendered.assistedPlan);
        if (!guidedAvoidance) {
          rendered.assistedPlan = null;
          rendered.approachHold = false;
        }
        rendered.spacecraft = createSpacecraftState({
          ...rendered.spacecraft,
          positionM: rendered.presentation.sceneToPhysical(scenePosition),
          velocityMps: guidedAvoidance
            ? rendered.spacecraft.velocityMps
            : { x: 0, y: 0, z: 0 },
          propellantCapacityKg: rendered.spacecraft.propellantCapacityKg,
          propellantKg: rendered.spacecraft.propellantKg,
          lastEvent: `${guidedAvoidance ? 'avoid' : 'contact'}-${collision.bodyId || 'celestial-body'}`
        });
        const event = Object.freeze({
          bodyId: collision.bodyId,
          bodyName: collision.bodyName,
          atMs: Date.now()
        });
        if (guidedAvoidance) {
          appContext.spaceFlight.lastCelestialAvoidance = event;
        } else {
          appContext.spaceFlight.lastCelestialContact = event;
          publishAssistState({ cancelled: true, collision: true });
        }
      }
    }
    if (
      assistedUpdate && realDtS > 0 &&
      typeof appContext.spaceFlight.rocket.position?.clone === 'function' &&
      typeof appContext.spaceFlight.rocket.quaternion?.clone === 'function'
    ) {
      const rocket = appContext.spaceFlight.rocket;
      assistedSceneMotion ||= rocket.position.clone();
      assistedCurrentForward ||= rocket.position.clone();
      assistedOrientationDelta ||= rocket.quaternion.clone();
      assistedSceneMotion.set(
        scenePosition.x - prior.x,
        scenePosition.y - prior.y,
        scenePosition.z - prior.z
      );
      if (assistedSceneMotion.lengthSq() > 1e-8) {
        assistedSceneMotion.normalize();
        assistedCurrentForward.set(0, 1, 0).applyQuaternion(rocket.quaternion).normalize();
        assistedOrientationDelta.setFromUnitVectors(assistedCurrentForward, assistedSceneMotion);
        rocket.quaternion.premultiply(assistedOrientationDelta).normalize();
      }
    }
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
    const travelPhaseByJourney = {
      launch: 'launch',
      parking_orbit: 'parking-orbit',
      transfer: 'transfer',
      approach: 'approach',
      atmospheric_exploration: 'approach',
      descent: 'descent',
      surface: 'landed',
      ascent: 'ascent',
      return_transfer: 'transfer',
      home_approach: 'approach',
      home_descent: 'descent',
      complete: 'landed'
    };
    appContext.updateSpaceTravelSession?.({
      phase: travelPhaseByJourney[rendered.journey.phase] || 'free-flight',
      guidance: rendered.assistedPlan ? 'assisted' : 'manual',
      reason: `space-${rendered.journey.phase}`
    });
    publishRenderedEnvironment();
    appContext.spaceFlight._isThrusting = Number(options.throttle) > 0 || braking;
    appContext.spaceFlight.manualFlightRate = !rendered.assistedPlan && !rendered.approachHold
      ? MANUAL_FLIGHT_RATE
      : 1;
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
      positionM: radialPosition(ephemeris.source, altitudeM, ephemeris.axis),
      velocityMps: ephemeris.source.velocityMps,
      propellantCapacityKg: rendered.spacecraft.propellantCapacityKg,
      propellantKg: rendered.spacecraft.propellantKg,
      lastEvent: 'atmospheric-departure-ready'
    });
    const presentation = createLivePresentation(ephemeris, sourceScene, destinationScene);
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
        : createAssistedAscentPlan(spacecraft, ephemeris.source)
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
    // The shared transfer plan performs and accounts for the departure burn
    // after ascent clears the atmospheric body.
    return Object.freeze({ accepted: true, reason: null });
  };

  const clearRenderedSpaceJourney = () => {
    rendered = null;
    appContext.spaceFlightEnvironment = null;
    appContext.spaceAtmosphereExploration = null;
    if (appContext.spaceFlight) appContext.spaceFlight._atmosphericClimbRequested = false;
    publishAssistState();
  };

  // Interstellar navigation owns the craft pose once Wayfinder leaves the
  // local Solar System route. Unlike the surface-return pause above, this is
  // a terminal authority handoff: stale local journey state must not keep
  // moving the same craft or overwrite the interstellar travel phase.
  const releaseRenderedJourneyToManualFlight = () => {
    const released = rendered != null;
    clearRenderedSpaceJourney();
    appContext.spaceJourney = null;
    appContext.spacecraftState = null;
    appContext.spaceJourneyEphemeris = null;
    return released;
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
    releaseRenderedJourneyToManualFlight,
    retargetRenderedSpaceJourney,
    setSolarSystemCourse,
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
    releaseRenderedJourneyToManualFlight,
    retargetRenderedSpaceJourney,
    setSolarSystemCourse,
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
