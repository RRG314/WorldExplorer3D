import {
  createSpacecraftState,
  executePlannedBurn
} from './spacecraft-authority.js?v=4';

const ASSISTED_TRANSFER_PRESENTATION_SECONDS = Object.freeze({
  'earth:moon': 12,
  'moon:earth': 12,
  'earth:mars': 18,
  'mars:earth': 18
});

const ASSISTED_CRUISE_SPEED_MPS = Object.freeze({
  'earth:moon': 3_200,
  'moon:earth': 2_700,
  'earth:mars': 6_000,
  'mars:earth': 6_000
});

function vector(value = {}) {
  return {
    x: Number(value.x) || 0,
    y: Number(value.y) || 0,
    z: Number(value.z) || 0
  };
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(value, amount) {
  return { x: value.x * amount, y: value.y * amount, z: value.z * amount };
}

function magnitude(value) {
  return Math.hypot(value.x, value.y, value.z);
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function normalized(value, fallback = { x: 1, y: 0, z: 0 }) {
  const length = magnitude(value);
  return length > 1e-9 ? scale(value, 1 / length) : { ...fallback };
}

function hermitePosition(start, end, startVelocity, endVelocity, durationS, progress) {
  const t = Math.max(0, Math.min(1, progress));
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return add(
    add(scale(start, h00), scale(startVelocity, h10 * durationS)),
    add(scale(end, h01), scale(endVelocity, h11 * durationS))
  );
}

function hermiteVelocity(start, end, startVelocity, endVelocity, durationS, progress) {
  const t = Math.max(0, Math.min(1, progress));
  const t2 = t * t;
  const dh00 = 6 * t2 - 6 * t;
  const dh10 = 3 * t2 - 4 * t + 1;
  const dh01 = -6 * t2 + 6 * t;
  const dh11 = 3 * t2 - 2 * t;
  return add(
    add(scale(start, dh00 / durationS), scale(startVelocity, dh10)),
    add(scale(end, dh01 / durationS), scale(endVelocity, dh11))
  );
}

function replaceKinematics(state, positionM, velocityMps, epochMs, lastEvent) {
  return createSpacecraftState({
    ...state,
    epochMs,
    positionM,
    velocityMps,
    propellantCapacityKg: state.propellantCapacityKg,
    propellantKg: state.propellantKg,
    lastEvent
  });
}

function createAssistedTransferPlan(state, ephemeris, options = {}) {
  const routeKey = `${ephemeris.source.bodyId}:${ephemeris.destination.bodyId}`;
  const axis = normalized(subtract(ephemeris.destination.positionM, ephemeris.source.positionM));
  const sourceRadial = normalized(subtract(state.positionM, ephemeris.source.positionM), axis);
  const departureDirection = dot(sourceRadial, axis) < 0.35
    ? normalized(add(axis, scale(sourceRadial, 1.35)), axis)
    : axis;
  const cruiseSpeedMps = Number(options.cruiseSpeedMps) || ASSISTED_CRUISE_SPEED_MPS[routeKey] || 6_000;
  const desiredDepartureVelocity = add(ephemeris.source.velocityMps, scale(departureDirection, cruiseSpeedMps));
  const departureBurn = executePlannedBurn(state, subtract(desiredDepartureVelocity, state.velocityMps));
  if (!departureBurn.executed) {
    return Object.freeze({ accepted: false, reason: departureBurn.reason, departureBurn });
  }
  const startState = departureBurn.state;
  const startPositionM = vector(startState.positionM);
  const endPositionM = subtract(
    ephemeris.destination.positionM,
    scale(axis, ephemeris.destination.radiusM + 20_000)
  );
  const distanceM = magnitude(subtract(endPositionM, startPositionM));
  const physicalDurationS = Math.max(3_600, distanceM / cruiseSpeedMps);
  const arrivalVelocityMps = add(ephemeris.destination.velocityMps, scale(axis, 600));
  return Object.freeze({
    accepted: true,
    kind: 'transfer',
    routeKey,
    axis: Object.freeze(axis),
    startState,
    startPositionM: Object.freeze(startPositionM),
    endPositionM: Object.freeze(endPositionM),
    startVelocityMps: startState.velocityMps,
    endVelocityMps: Object.freeze(arrivalVelocityMps),
    physicalDurationS,
    presentationDurationS: Math.max(2, Number(options.presentationDurationS) || ASSISTED_TRANSFER_PRESENTATION_SECONDS[routeKey] || 18),
    elapsedPresentationS: 0,
    departureBurn
  });
}

function createAssistedDescentPlan(state, destinationBody, options = {}) {
  const relative = subtract(state.positionM, destinationBody.positionM);
  const radialOut = normalized(relative);
  const endPositionM = add(destinationBody.positionM, scale(radialOut, destinationBody.radiusM + 10));
  const distanceM = magnitude(subtract(endPositionM, state.positionM));
  const physicalDurationS = Math.max(30, distanceM / 30);
  const endVelocityMps = add(destinationBody.velocityMps, scale(radialOut, -5));
  return Object.freeze({
    accepted: true,
    kind: 'descent',
    axis: Object.freeze(scale(radialOut, -1)),
    startState: state,
    startPositionM: state.positionM,
    endPositionM: Object.freeze(endPositionM),
    startVelocityMps: state.velocityMps,
    endVelocityMps: Object.freeze(endVelocityMps),
    physicalDurationS,
    presentationDurationS: Math.max(2, Number(options.presentationDurationS) || 7),
    elapsedPresentationS: 0
  });
}

function createAssistedAscentPlan(state, sourceBody, options = {}) {
  const radialOut = normalized(subtract(state.positionM, sourceBody.positionM));
  const tangent = normalized({ x: -radialOut.y, y: radialOut.x, z: radialOut.z }, { x: 0, y: 1, z: 0 });
  const endPositionM = add(sourceBody.positionM, scale(radialOut, sourceBody.radiusM + 110_000));
  const circularSpeedMps = Math.sqrt(6.67430e-11 * sourceBody.massKg / (sourceBody.radiusM + 110_000));
  const endVelocityMps = options.endVelocityMps
    ? vector(options.endVelocityMps)
    : add(sourceBody.velocityMps, scale(tangent, circularSpeedMps));
  return Object.freeze({
    accepted: true,
    kind: 'ascent',
    axis: Object.freeze(radialOut),
    startState: state,
    startPositionM: state.positionM,
    endPositionM: Object.freeze(endPositionM),
    startVelocityMps: state.velocityMps,
    endVelocityMps: Object.freeze(endVelocityMps),
    physicalDurationS: Math.max(120, Number(options.physicalDurationS) || 240),
    presentationDurationS: Math.max(2, Number(options.presentationDurationS) || 7),
    elapsedPresentationS: 0
  });
}

function advanceAssistedPlan(plan, realDtS) {
  const elapsedPresentationS = Math.min(
    plan.presentationDurationS,
    plan.elapsedPresentationS + Math.max(0, Number(realDtS) || 0)
  );
  const progress = plan.presentationDurationS > 0
    ? elapsedPresentationS / plan.presentationDurationS
    : 1;
  const positionM = hermitePosition(
    plan.startPositionM,
    plan.endPositionM,
    plan.startVelocityMps,
    plan.endVelocityMps,
    plan.physicalDurationS,
    progress
  );
  const velocityMps = hermiteVelocity(
    plan.startPositionM,
    plan.endPositionM,
    plan.startVelocityMps,
    plan.endVelocityMps,
    plan.physicalDurationS,
    progress
  );
  const state = replaceKinematics(
    plan.startState,
    positionM,
    velocityMps,
    plan.startState.epochMs + progress * plan.physicalDurationS * 1000,
    plan.kind === 'descent'
      ? 'assisted-descent'
      : plan.kind === 'ascent'
        ? 'assisted-ascent'
        : 'assisted-transfer'
  );
  return Object.freeze({
    complete: progress >= 1,
    progress,
    state,
    plan: Object.freeze({ ...plan, elapsedPresentationS })
  });
}

function completeAssistedCapture(state, ephemeris, axis) {
  const desiredVelocityMps = add(ephemeris.destination.velocityMps, scale(axis, 50));
  return executePlannedBurn(state, subtract(desiredVelocityMps, state.velocityMps));
}

export {
  advanceAssistedPlan,
  ASSISTED_CRUISE_SPEED_MPS,
  ASSISTED_TRANSFER_PRESENTATION_SECONDS,
  completeAssistedCapture,
  createAssistedAscentPlan,
  createAssistedDescentPlan,
  createAssistedTransferPlan
};
