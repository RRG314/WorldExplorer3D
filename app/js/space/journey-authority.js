import { getAstronomicalBody, normalizeAstronomicalBodyId } from '../astronomy/body-catalog.js?v=3';
import { createBodyEphemerisState } from './spacecraft-authority.js?v=4';

const SPACE_JOURNEY_SCHEMA_VERSION = 2;
const EARTH_MOON_MEAN_DISTANCE_M = 384_400_000;

const JOURNEY_MODE = Object.freeze({
  ASSISTED: 'assisted',
  MANUAL: 'manual',
  FAST_TRAVEL: 'fast_travel'
});

const JOURNEY_PHASE = Object.freeze({
  PREPARING: 'preparing',
  LAUNCH: 'launch',
  PARKING_ORBIT: 'parking_orbit',
  TRANSFER: 'transfer',
  APPROACH: 'approach',
  ATMOSPHERIC_EXPLORATION: 'atmospheric_exploration',
  DESCENT: 'descent',
  SURFACE: 'surface',
  ASCENT: 'ascent',
  RETURN_TRANSFER: 'return_transfer',
  HOME_APPROACH: 'home_approach',
  HOME_DESCENT: 'home_descent',
  COMPLETE: 'complete',
  RECOVERY: 'recovery',
  FAILED: 'failed'
});

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite.`);
  return number;
}

function vec(value = {}, label = 'Vector') {
  return Object.freeze({
    x: finite(value.x ?? 0, `${label} X`),
    y: finite(value.y ?? 0, `${label} Y`),
    z: finite(value.z ?? 0, `${label} Z`)
  });
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(a, factor) {
  return { x: a.x * factor, y: a.y * factor, z: a.z * factor };
}

function magnitude(a) {
  return Math.hypot(a.x, a.y, a.z);
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

function normalized(a) {
  const length = magnitude(a);
  if (length <= 1e-12) throw new RangeError('Journey axis cannot be zero.');
  return scale(a, 1 / length);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function rotateBetweenAxes(vector, fromAxis, toAxis) {
  const cosine = Math.max(-1, Math.min(1, dot(fromAxis, toAxis)));
  const axisCross = cross(fromAxis, toAxis);
  const sine = magnitude(axisCross);
  if (sine <= 1e-12) {
    if (cosine > 0) return { ...vector };
    const helper = Math.abs(fromAxis.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    const halfTurnAxis = normalized(cross(fromAxis, helper));
    return subtract(scale(halfTurnAxis, 2 * dot(halfTurnAxis, vector)), vector);
  }
  const rotationAxis = scale(axisCross, 1 / sine);
  return add(
    add(scale(vector, cosine), scale(cross(rotationAxis, vector), sine)),
    scale(rotationAxis, dot(rotationAxis, vector) * (1 - cosine))
  );
}

function journeyRecord(input = {}) {
  const sourceBodyId = normalizeAstronomicalBodyId(input.sourceBodyId);
  const destinationBodyId = normalizeAstronomicalBodyId(input.destinationBodyId);
  if (!sourceBodyId || !destinationBodyId || sourceBodyId === destinationBodyId) {
    throw new RangeError('A space journey requires different known source and destination bodies.');
  }
  const phase = String(input.phase || JOURNEY_PHASE.PREPARING);
  if (!Object.values(JOURNEY_PHASE).includes(phase)) throw new RangeError(`Unsupported journey phase: ${phase}`);
  const mode = String(input.mode || JOURNEY_MODE.ASSISTED);
  if (!Object.values(JOURNEY_MODE).includes(mode)) throw new RangeError(`Unsupported journey mode: ${mode}`);
  return Object.freeze({
    type: 'SpaceJourneyState',
    schemaVersion: SPACE_JOURNEY_SCHEMA_VERSION,
    journeyId: String(input.journeyId || 'journey'),
    sourceBodyId,
    destinationBodyId,
    phase,
    mode,
    startedAtMs: finite(input.startedAtMs, 'Journey start'),
    updatedAtMs: finite(input.updatedAtMs, 'Journey update'),
    phaseBeforeRecovery: input.phaseBeforeRecovery ? String(input.phaseBeforeRecovery) : null,
    lastEvent: input.lastEvent ? String(input.lastEvent) : null,
    failureReason: input.failureReason ? String(input.failureReason) : null,
    history: Object.freeze([...(input.history || [])].slice(-32).map((entry) => Object.freeze({
      event: String(entry.event),
      from: entry.from ? String(entry.from) : null,
      to: String(entry.to),
      atMs: finite(entry.atMs, 'Journey history time')
    })))
  });
}

function createSpaceJourney(options = {}) {
  const startedAtMs = finite(options.startedAtMs ?? Date.now(), 'Journey start');
  return journeyRecord({
    journeyId: options.journeyId || `journey-${Math.trunc(startedAtMs)}`,
    sourceBodyId: options.sourceBodyId,
    destinationBodyId: options.destinationBodyId,
    phase: JOURNEY_PHASE.PREPARING,
    mode: options.mode || JOURNEY_MODE.ASSISTED,
    startedAtMs,
    updatedAtMs: startedAtMs,
    history: []
  });
}

function acceptedTransition(journey, event, to, atMs, extra = {}) {
  return Object.freeze({
    accepted: true,
    reason: null,
    journey: journeyRecord({
      ...journey,
      ...extra,
      phase: to,
      updatedAtMs: atMs,
      lastEvent: event,
      history: [...journey.history, { event, from: journey.phase, to, atMs }]
    })
  });
}

function rejectedTransition(journey, reason) {
  return Object.freeze({ accepted: false, reason, journey });
}

function transitionSpaceJourney(journeyInput, eventInput, evidence = {}) {
  const journey = journeyRecord(journeyInput);
  const event = String(eventInput || '').trim().toLowerCase();
  const atMs = finite(evidence.atMs ?? journey.updatedAtMs, 'Journey transition time');
  if (atMs < journey.updatedAtMs) return rejectedTransition(journey, 'journey-time-cannot-reverse');

  if (event === 'enter_recovery') {
    if ([JOURNEY_PHASE.COMPLETE, JOURNEY_PHASE.FAILED].includes(journey.phase)) {
      return rejectedTransition(journey, 'terminal-journey-cannot-enter-recovery');
    }
    return acceptedTransition(journey, event, JOURNEY_PHASE.RECOVERY, atMs, {
      phaseBeforeRecovery: journey.phase,
      failureReason: evidence.reason || 'recovery-required'
    });
  }
  if (event === 'resume' && journey.phase === JOURNEY_PHASE.RECOVERY) {
    if (evidence.recovered !== true) return rejectedTransition(journey, 'spacecraft-recovery-not-verified');
    const resumePhase = Object.values(JOURNEY_PHASE).includes(journey.phaseBeforeRecovery)
      ? journey.phaseBeforeRecovery
      : JOURNEY_PHASE.PREPARING;
    return acceptedTransition(journey, event, resumePhase, atMs, {
      phaseBeforeRecovery: null,
      failureReason: null
    });
  }
  if (event === 'abort') {
    if (journey.phase === JOURNEY_PHASE.COMPLETE) return rejectedTransition(journey, 'completed-journey-cannot-abort');
    return acceptedTransition(journey, event, JOURNEY_PHASE.FAILED, atMs, {
      failureReason: evidence.reason || 'journey-aborted'
    });
  }

  const navigation = evidence.navigation || null;
  const landing = evidence.landingEligibility || null;
  switch (`${journey.phase}:${event}`) {
    case `${JOURNEY_PHASE.PREPARING}:launch_ready`:
      return evidence.spacecraftReady === true
        ? acceptedTransition(journey, event, JOURNEY_PHASE.LAUNCH, atMs)
        : rejectedTransition(journey, 'spacecraft-not-ready');
    case `${JOURNEY_PHASE.LAUNCH}:parking_orbit_established`:
      return navigation?.bodyId === journey.sourceBodyId && navigation.captured === true && navigation.altitudeM >= 100_000
        ? acceptedTransition(journey, event, JOURNEY_PHASE.PARKING_ORBIT, atMs)
        : rejectedTransition(journey, 'source-parking-orbit-not-verified');
    case `${JOURNEY_PHASE.PARKING_ORBIT}:transfer_burn_complete`:
      return evidence.burn?.executed === true
        ? acceptedTransition(journey, event, JOURNEY_PHASE.TRANSFER, atMs)
        : rejectedTransition(journey, evidence.burn?.reason || 'transfer-burn-not-verified');
    case `${JOURNEY_PHASE.TRANSFER}:target_capture_complete`:
      return navigation?.bodyId === journey.destinationBodyId && navigation.captured === true
        ? acceptedTransition(journey, event, JOURNEY_PHASE.APPROACH, atMs)
        : rejectedTransition(journey, 'destination-capture-not-verified');
    case `${JOURNEY_PHASE.APPROACH}:descent_authorized`:
      return landing?.eligible === true && landing.navigation?.bodyId === journey.destinationBodyId
        ? acceptedTransition(journey, event, JOURNEY_PHASE.DESCENT, atMs)
        : rejectedTransition(journey, landing?.reason || 'destination-descent-not-authorized');
    case `${JOURNEY_PHASE.APPROACH}:atmospheric_entry_authorized`:
      return evidence.atmosphericEntry?.authorized === true &&
        evidence.atmosphericEntry?.navigation?.bodyId === journey.destinationBodyId &&
        evidence.atmosphericEntry?.noSolidSurface === true
        ? acceptedTransition(journey, event, JOURNEY_PHASE.ATMOSPHERIC_EXPLORATION, atMs)
        : rejectedTransition(journey, evidence.atmosphericEntry?.reason || 'atmospheric-entry-not-authorized');
    case `${JOURNEY_PHASE.ATMOSPHERIC_EXPLORATION}:atmospheric_departure`:
      return evidence.spacecraftReady === true
        ? acceptedTransition(journey, event, JOURNEY_PHASE.ASCENT, atMs)
        : rejectedTransition(journey, 'spacecraft-not-ready-for-atmospheric-departure');
    case `${JOURNEY_PHASE.DESCENT}:touchdown`:
      return landing?.eligible === true && landing.navigation?.altitudeM <= 20 && landing.navigation?.relativeSpeedMps <= 15
        ? acceptedTransition(journey, event, JOURNEY_PHASE.SURFACE, atMs)
        : rejectedTransition(journey, 'destination-touchdown-not-verified');
    case `${JOURNEY_PHASE.SURFACE}:takeoff`:
      return evidence.spacecraftReady === true
        ? acceptedTransition(journey, event, JOURNEY_PHASE.ASCENT, atMs)
        : rejectedTransition(journey, 'spacecraft-not-ready-for-takeoff');
    case `${JOURNEY_PHASE.ASCENT}:departure_cleared`:
      return navigation?.bodyId === journey.destinationBodyId && navigation.altitudeM >= 100_000
        ? acceptedTransition(journey, event, JOURNEY_PHASE.RETURN_TRANSFER, atMs)
        : rejectedTransition(journey, 'destination-departure-not-clear');
    case `${JOURNEY_PHASE.RETURN_TRANSFER}:home_capture_complete`:
      return navigation?.bodyId === journey.sourceBodyId && navigation.captured === true
        ? acceptedTransition(journey, event, JOURNEY_PHASE.HOME_APPROACH, atMs)
        : rejectedTransition(journey, 'home-capture-not-verified');
    case `${JOURNEY_PHASE.HOME_APPROACH}:home_descent_authorized`:
      return landing?.eligible === true && landing.navigation?.bodyId === journey.sourceBodyId
        ? acceptedTransition(journey, event, JOURNEY_PHASE.HOME_DESCENT, atMs)
        : rejectedTransition(journey, landing?.reason || 'home-descent-not-authorized');
    case `${JOURNEY_PHASE.HOME_DESCENT}:mission_complete`:
      return landing?.eligible === true && landing.navigation?.altitudeM <= 20 && landing.navigation?.relativeSpeedMps <= 15
        ? acceptedTransition(journey, event, JOURNEY_PHASE.COMPLETE, atMs)
        : rejectedTransition(journey, 'home-touchdown-not-verified');
    default:
      return rejectedTransition(journey, 'event-not-valid-for-current-phase');
  }
}

function meanSeparationM(sourceBodyId, destinationBodyId, requestedSeparationM = null) {
  if (Number.isFinite(Number(requestedSeparationM)) && Number(requestedSeparationM) > 0) {
    return Number(requestedSeparationM);
  }
  const pair = new Set([sourceBodyId, destinationBodyId]);
  if (pair.has('earth') && pair.has('moon')) return EARTH_MOON_MEAN_DISTANCE_M;
  const source = getAstronomicalBody(sourceBodyId);
  const destination = getAstronomicalBody(destinationBodyId);
  const sourceSolar = source.id === 'moon'
    ? getAstronomicalBody('earth').physical.meanSolarDistanceM
    : source.physical.meanSolarDistanceM;
  const destinationSolar = destination.id === 'moon'
    ? getAstronomicalBody('earth').physical.meanSolarDistanceM
    : destination.physical.meanSolarDistanceM;
  const separation = Math.abs(Number(destinationSolar) - Number(sourceSolar));
  if (!Number.isFinite(separation) || separation <= 0) {
    throw new RangeError('Mission separation must be supplied for this body pair.');
  }
  return separation;
}

function createJourneyEphemeris(options = {}) {
  const sourceBodyId = normalizeAstronomicalBodyId(options.sourceBodyId);
  const destinationBodyId = normalizeAstronomicalBodyId(options.destinationBodyId);
  if (!sourceBodyId || !destinationBodyId || sourceBodyId === destinationBodyId) {
    throw new RangeError('Journey ephemeris requires different known bodies.');
  }
  const epochMs = finite(options.epochMs ?? Date.now(), 'Journey ephemeris epoch');
  const axis = normalized(vec(options.axis || { x: 1, y: 0, z: 0 }, 'Journey axis'));
  const separationM = meanSeparationM(sourceBodyId, destinationBodyId, options.separationM);
  return Object.freeze({
    separationM,
    axis: Object.freeze(axis),
    source: createBodyEphemerisState(sourceBodyId, {
      epochMs,
      positionM: { x: 0, y: 0, z: 0 },
      velocityMps: options.sourceVelocityMps || { x: 0, y: 0, z: 0 }
    }),
    destination: createBodyEphemerisState(destinationBodyId, {
      epochMs,
      positionM: scale(axis, separationM),
      velocityMps: options.destinationVelocityMps || { x: 0, y: 0, z: 0 }
    })
  });
}

function createJourneyPresentationMap(options = {}) {
  const physicalSource = vec(options.physicalSource, 'Physical source');
  const physicalDestination = vec(options.physicalDestination, 'Physical destination');
  const sceneSource = vec(options.sceneSource, 'Scene source');
  const sceneDestination = vec(options.sceneDestination, 'Scene destination');
  const physicalAxisVector = subtract(physicalDestination, physicalSource);
  const sceneAxisVector = subtract(sceneDestination, sceneSource);
  const physicalDistanceM = magnitude(physicalAxisVector);
  const sceneDistance = magnitude(sceneAxisVector);
  if (physicalDistanceM <= 0 || sceneDistance <= 0) throw new RangeError('Presentation map requires separated source and destination points.');
  const physicalAxis = normalized(physicalAxisVector);
  const sceneAxis = normalized(sceneAxisVector);
  const sourcePhysicalRadiusM = Math.max(1, finite(options.sourcePhysicalRadiusM, 'Source physical radius'));
  const destinationPhysicalRadiusM = Math.max(1, finite(options.destinationPhysicalRadiusM, 'Destination physical radius'));
  const sourceSceneRadius = Math.max(0.001, finite(options.sourceSceneRadius, 'Source scene radius'));
  const destinationSceneRadius = Math.max(0.001, finite(options.destinationSceneRadius, 'Destination scene radius'));
  const physicalSpan = Math.max(1, physicalDistanceM - sourcePhysicalRadiusM - destinationPhysicalRadiusM);
  const sceneSpan = Math.max(0.001, sceneDistance - sourceSceneRadius - destinationSceneRadius);
  const sourceInteractionPhysicalSpanM = Math.min(
    physicalSpan * 0.2,
    Math.max(1, finite(options.sourceInteractionPhysicalSpanM ?? 5_000_000, 'Source interaction span'))
  );
  const destinationInteractionPhysicalSpanM = Math.min(
    physicalSpan * 0.2,
    Math.max(1, finite(options.destinationInteractionPhysicalSpanM ?? 5_000_000, 'Destination interaction span'))
  );
  const interactionSceneSpan = Math.min(10, sceneSpan * 0.24);
  const sourceInteractionSceneSpan = interactionSceneSpan;
  const destinationInteractionSceneSpan = interactionSceneSpan;
  const middlePhysicalSpan = Math.max(
    1,
    physicalSpan - sourceInteractionPhysicalSpanM - destinationInteractionPhysicalSpanM
  );
  const middleSceneSpan = Math.max(
    0.001,
    sceneSpan - sourceInteractionSceneSpan - destinationInteractionSceneSpan
  );

  const physicalToScene = (physicalPosition) => {
    const relative = subtract(vec(physicalPosition, 'Physical presentation position'), physicalSource);
    const alongM = dot(relative, physicalAxis);
    const lateralM = subtract(relative, scale(physicalAxis, alongM));
    const sceneLateralDirection = rotateBetweenAxes(lateralM, physicalAxis, sceneAxis);
    let alongScene;
    if (alongM <= sourcePhysicalRadiusM) {
      alongScene = alongM / sourcePhysicalRadiusM * sourceSceneRadius;
    } else if (alongM <= sourcePhysicalRadiusM + sourceInteractionPhysicalSpanM) {
      alongScene = sourceSceneRadius +
        (alongM - sourcePhysicalRadiusM) / sourceInteractionPhysicalSpanM * sourceInteractionSceneSpan;
    } else if (alongM >= physicalDistanceM - destinationPhysicalRadiusM) {
      alongScene = sceneDistance - (physicalDistanceM - alongM) / destinationPhysicalRadiusM * destinationSceneRadius;
    } else if (alongM >= physicalDistanceM - destinationPhysicalRadiusM - destinationInteractionPhysicalSpanM) {
      const distanceBeforeDestinationSurface = physicalDistanceM - destinationPhysicalRadiusM - alongM;
      alongScene = sceneDistance - destinationSceneRadius -
        distanceBeforeDestinationSurface / destinationInteractionPhysicalSpanM * destinationInteractionSceneSpan;
    } else {
      alongScene = sourceSceneRadius + sourceInteractionSceneSpan +
        (alongM - sourcePhysicalRadiusM - sourceInteractionPhysicalSpanM) / middlePhysicalSpan * middleSceneSpan;
    }
    const progress = clamp01(alongM / physicalDistanceM);
    const metersPerSceneUnit = sourcePhysicalRadiusM / sourceSceneRadius * (1 - progress) +
      destinationPhysicalRadiusM / destinationSceneRadius * progress;
    return Object.freeze(add(
      add(sceneSource, scale(sceneAxis, alongScene)),
      scale(sceneLateralDirection, 1 / metersPerSceneUnit)
    ));
  };

  const sceneToPhysical = (scenePosition) => {
    const relative = subtract(vec(scenePosition, 'Scene presentation position'), sceneSource);
    const alongScene = dot(relative, sceneAxis);
    const lateralScene = subtract(relative, scale(sceneAxis, alongScene));
    let alongM;
    if (alongScene <= sourceSceneRadius) {
      alongM = alongScene / sourceSceneRadius * sourcePhysicalRadiusM;
    } else if (alongScene <= sourceSceneRadius + sourceInteractionSceneSpan) {
      alongM = sourcePhysicalRadiusM +
        (alongScene - sourceSceneRadius) / sourceInteractionSceneSpan * sourceInteractionPhysicalSpanM;
    } else if (alongScene >= sceneDistance - destinationSceneRadius) {
      alongM = physicalDistanceM -
        (sceneDistance - alongScene) / destinationSceneRadius * destinationPhysicalRadiusM;
    } else if (alongScene >= sceneDistance - destinationSceneRadius - destinationInteractionSceneSpan) {
      const sceneDistanceBeforeDestinationSurface = sceneDistance - destinationSceneRadius - alongScene;
      alongM = physicalDistanceM - destinationPhysicalRadiusM -
        sceneDistanceBeforeDestinationSurface / destinationInteractionSceneSpan * destinationInteractionPhysicalSpanM;
    } else {
      alongM = sourcePhysicalRadiusM + sourceInteractionPhysicalSpanM +
        (alongScene - sourceSceneRadius - sourceInteractionSceneSpan) / middleSceneSpan * middlePhysicalSpan;
    }
    const progress = clamp01(alongM / physicalDistanceM);
    const metersPerSceneUnit = sourcePhysicalRadiusM / sourceSceneRadius * (1 - progress) +
      destinationPhysicalRadiusM / destinationSceneRadius * progress;
    const physicalLateralDirection = rotateBetweenAxes(lateralScene, sceneAxis, physicalAxis);
    return Object.freeze(add(
      add(physicalSource, scale(physicalAxis, alongM)),
      scale(physicalLateralDirection, metersPerSceneUnit)
    ));
  };

  return Object.freeze({
    physicalDistanceM,
    sceneDistance,
    sourceInteractionPhysicalSpanM,
    sourceInteractionSceneSpan,
    physicalToScene,
    sceneToPhysical
  });
}

function fastTravelEvidencePlan(journeyInput) {
  const journey = journeyRecord(journeyInput);
  if (journey.mode !== JOURNEY_MODE.FAST_TRAVEL) return Object.freeze([]);
  return Object.freeze([
    'launch_ready',
    'parking_orbit_established',
    'transfer_burn_complete',
    'target_capture_complete',
    'descent_authorized',
    'touchdown'
  ]);
}

export {
  createJourneyEphemeris,
  createJourneyPresentationMap,
  createSpaceJourney,
  EARTH_MOON_MEAN_DISTANCE_M,
  fastTravelEvidencePlan,
  JOURNEY_MODE,
  JOURNEY_PHASE,
  SPACE_JOURNEY_SCHEMA_VERSION,
  transitionSpaceJourney
};
