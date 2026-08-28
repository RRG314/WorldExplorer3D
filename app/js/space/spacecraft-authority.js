import { getAstronomicalBody, normalizeAstronomicalBodyId } from '../astronomy/body-catalog.js?v=2';

const SPACECRAFT_SCHEMA_VERSION = 1;
const GRAVITATIONAL_CONSTANT = 6.67430e-11;
const STANDARD_GRAVITY_MPS2 = 9.80665;
const INERTIAL_FRAME_ID = 'inertial:sol:J2000';

const SUBSYSTEM_STATUS = Object.freeze({
  NOMINAL: 'nominal',
  DEGRADED: 'degraded',
  FAILED: 'failed'
});

const SPACECRAFT_MODE = Object.freeze({
  FLIGHT: 'flight',
  SAFE: 'safe',
  LANDED: 'landed',
  DISABLED: 'disabled'
});

const TIME_SCALES = Object.freeze([1, 10, 100, 1000]);
const SUBSYSTEM_NAMES = Object.freeze(['attitude', 'landing', 'navigation', 'propulsion']);

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite.`);
  return number;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function vector(input = {}, label = 'Vector') {
  return Object.freeze({
    x: finite(input.x ?? 0, `${label} X`),
    y: finite(input.y ?? 0, `${label} Y`),
    z: finite(input.z ?? 0, `${label} Z`)
  });
}

function quaternion(input = {}) {
  const raw = {
    x: finite(input.x ?? 0, 'Attitude X'),
    y: finite(input.y ?? 0, 'Attitude Y'),
    z: finite(input.z ?? 0, 'Attitude Z'),
    w: finite(input.w ?? 1, 'Attitude W')
  };
  const length = Math.hypot(raw.x, raw.y, raw.z, raw.w);
  if (length <= 1e-12) throw new RangeError('Attitude quaternion cannot be zero.');
  return Object.freeze({
    x: raw.x / length,
    y: raw.y / length,
    z: raw.z / length,
    w: raw.w / length
  });
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(a, amount) {
  return { x: a.x * amount, y: a.y * amount, z: a.z * amount };
}

function magnitude(a) {
  return Math.hypot(a.x, a.y, a.z);
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function normalized(a, fallback = { x: 0, y: 1, z: 0 }) {
  const length = magnitude(a);
  return length > 1e-12 ? scale(a, 1 / length) : { ...fallback };
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

function subsystemRecord(input = {}) {
  return Object.freeze(Object.fromEntries(SUBSYSTEM_NAMES.map((name) => {
    const status = String(input[name] || SUBSYSTEM_STATUS.NOMINAL);
    if (!Object.values(SUBSYSTEM_STATUS).includes(status)) {
      throw new RangeError(`Unsupported ${name} subsystem status: ${status}`);
    }
    return [name, status];
  })));
}

function stateRecord(input = {}) {
  const dryMassKg = Math.max(1, finite(input.dryMassKg, 'Dry mass'));
  const propellantCapacityKg = Math.max(0, finite(input.propellantCapacityKg, 'Propellant capacity'));
  const propellantKg = clamp(finite(input.propellantKg, 'Propellant mass'), 0, propellantCapacityKg);
  const mode = String(input.mode || SPACECRAFT_MODE.FLIGHT);
  if (!Object.values(SPACECRAFT_MODE).includes(mode)) throw new RangeError(`Unsupported spacecraft mode: ${mode}`);
  const targetBodyId = input.targetBodyId ? normalizeAstronomicalBodyId(input.targetBodyId) : null;
  if (input.targetBodyId && !targetBodyId) throw new RangeError(`Unknown target body: ${input.targetBodyId}`);
  const landedBodyId = input.landedBodyId ? normalizeAstronomicalBodyId(input.landedBodyId) : null;
  if (input.landedBodyId && !landedBodyId) throw new RangeError(`Unknown landed body: ${input.landedBodyId}`);

  return Object.freeze({
    type: 'SpacecraftState',
    schemaVersion: SPACECRAFT_SCHEMA_VERSION,
    missionId: String(input.missionId || 'expedition'),
    frameId: String(input.frameId || INERTIAL_FRAME_ID),
    epochMs: finite(input.epochMs, 'Epoch'),
    positionM: vector(input.positionM, 'Position'),
    velocityMps: vector(input.velocityMps, 'Velocity'),
    attitude: quaternion(input.attitude),
    angularVelocityRadps: vector(input.angularVelocityRadps, 'Angular velocity'),
    dryMassKg,
    propellantCapacityKg,
    propellantKg,
    maxThrustN: Math.max(0, finite(input.maxThrustN, 'Maximum thrust')),
    specificImpulseS: Math.max(1, finite(input.specificImpulseS, 'Specific impulse')),
    maxAngularAccelerationRadps2: Math.max(0, finite(input.maxAngularAccelerationRadps2, 'Maximum angular acceleration')),
    timeScale: TIME_SCALES.includes(Number(input.timeScale)) ? Number(input.timeScale) : 1,
    mode,
    targetBodyId,
    landedBodyId,
    subsystems: subsystemRecord(input.subsystems),
    lastEvent: input.lastEvent ? String(input.lastEvent) : null
  });
}

function createSpacecraftState(options = {}) {
  return stateRecord({
    missionId: options.missionId || `expedition-${Math.trunc(Number(options.epochMs ?? Date.now()))}`,
    frameId: options.frameId || INERTIAL_FRAME_ID,
    epochMs: Number(options.epochMs ?? Date.now()),
    positionM: options.positionM || { x: 0, y: 0, z: 0 },
    velocityMps: options.velocityMps || { x: 0, y: 0, z: 0 },
    attitude: options.attitude || { x: 0, y: 0, z: 0, w: 1 },
    angularVelocityRadps: options.angularVelocityRadps || { x: 0, y: 0, z: 0 },
    dryMassKg: options.dryMassKg ?? 14_500,
    propellantCapacityKg: options.propellantCapacityKg ?? 18_000,
    propellantKg: options.propellantKg ?? options.propellantCapacityKg ?? 18_000,
    maxThrustN: options.maxThrustN ?? 620_000,
    specificImpulseS: options.specificImpulseS ?? 455,
    maxAngularAccelerationRadps2: options.maxAngularAccelerationRadps2 ?? 0.32,
    timeScale: options.timeScale ?? 1,
    mode: options.mode || SPACECRAFT_MODE.FLIGHT,
    targetBodyId: options.targetBodyId || null,
    landedBodyId: options.landedBodyId || null,
    subsystems: options.subsystems || {},
    lastEvent: options.lastEvent || null
  });
}

function createBodyEphemerisState(bodyIdInput, options = {}) {
  const bodyId = normalizeAstronomicalBodyId(bodyIdInput);
  const body = bodyId ? getAstronomicalBody(bodyId) : null;
  if (!body) throw new RangeError(`Unknown ephemeris body: ${bodyIdInput}`);
  return Object.freeze({
    type: 'BodyEphemerisState',
    bodyId,
    frameId: String(options.frameId || INERTIAL_FRAME_ID),
    epochMs: finite(options.epochMs ?? 0, 'Body epoch'),
    positionM: vector(options.positionM, `${body.name} position`),
    velocityMps: vector(options.velocityMps, `${body.name} velocity`),
    massKg: body.physical.massKg,
    radiusM: body.physical.meanRadiusM,
    landingMode: body.exploration.landingMode,
    solidSurfaceAvailable: body.exploration.surfaceRegionEligible
  });
}

function bodyPositionAt(body, epochMs) {
  const deltaS = (finite(epochMs, 'Ephemeris sample epoch') - body.epochMs) / 1000;
  return add(body.positionM, scale(body.velocityMps, deltaS));
}

function gravityAccelerationAt(positionM, bodies, epochMs) {
  let acceleration = { x: 0, y: 0, z: 0 };
  for (const body of bodies || []) {
    if (body.frameId !== INERTIAL_FRAME_ID) throw new RangeError(`Unsupported body frame: ${body.frameId}`);
    const offset = subtract(bodyPositionAt(body, epochMs), positionM);
    const radius = magnitude(offset);
    if (radius <= Math.max(1, body.radiusM * 0.25)) continue;
    const scalar = GRAVITATIONAL_CONSTANT * body.massKg / (radius ** 3);
    acceleration = add(acceleration, scale(offset, scalar));
  }
  return acceleration;
}

function integrateAttitude(attitude, angularVelocity, dtS) {
  const angle = magnitude(angularVelocity) * dtS;
  if (angle <= 1e-12) return attitude;
  const axis = normalized(angularVelocity);
  const half = angle * 0.5;
  const sin = Math.sin(half);
  const rotation = { x: axis.x * sin, y: axis.y * sin, z: axis.z * sin, w: Math.cos(half) };
  return quaternion({
    x: rotation.w * attitude.x + rotation.x * attitude.w + rotation.y * attitude.z - rotation.z * attitude.y,
    y: rotation.w * attitude.y - rotation.x * attitude.z + rotation.y * attitude.w + rotation.z * attitude.x,
    z: rotation.w * attitude.z + rotation.x * attitude.y - rotation.y * attitude.x + rotation.z * attitude.w,
    w: rotation.w * attitude.w - rotation.x * attitude.x - rotation.y * attitude.y - rotation.z * attitude.z
  });
}

function applyAngularCommand(state, command, dtS) {
  if (state.subsystems.attitude === SUBSYSTEM_STATUS.FAILED || state.mode !== SPACECRAFT_MODE.FLIGHT) {
    return state.angularVelocityRadps;
  }
  const input = vector(command.angular || {}, 'Angular command');
  const inputMagnitude = magnitude(input);
  const normalizedInput = inputMagnitude > 1 ? scale(input, 1 / inputMagnitude) : input;
  const authority = state.subsystems.attitude === SUBSYSTEM_STATUS.DEGRADED ? 0.35 : 1;
  return add(
    state.angularVelocityRadps,
    scale(normalizedInput, state.maxAngularAccelerationRadps2 * authority * dtS)
  );
}

function resolveTimeScale(requested, options = {}) {
  const numeric = Number(requested);
  const selected = TIME_SCALES.includes(numeric) ? numeric : 1;
  if (Number(options.throttle) > 0 || options.maneuvering === true) return 1;
  if (Number.isFinite(options.altitudeM) && options.altitudeM < 1_000_000) return 1;
  if (Number.isFinite(options.timeToEncounterS) && options.timeToEncounterS < 1800) return Math.min(selected, 10);
  return selected;
}

function propagateSpacecraft(stateInput, command = {}, bodies = [], realDtS = 0) {
  const state = stateRecord(stateInput);
  const realDt = clamp(finite(realDtS, 'Real propagation interval'), 0, 60);
  if (realDt === 0 || state.mode === SPACECRAFT_MODE.LANDED || state.mode === SPACECRAFT_MODE.DISABLED) return state;
  const requestedThrottle = clamp(finite(command.throttle ?? 0, 'Throttle'), 0, 1);
  const propulsionAvailable = state.mode === SPACECRAFT_MODE.FLIGHT &&
    state.subsystems.propulsion !== SUBSYSTEM_STATUS.FAILED && state.propellantKg > 0;
  const throttle = propulsionAvailable ? requestedThrottle : 0;
  const timeScale = resolveTimeScale(command.timeScale ?? state.timeScale, {
    throttle,
    maneuvering: magnitude(command.angular || {}) > 0,
    altitudeM: command.altitudeM,
    timeToEncounterS: command.timeToEncounterS
  });
  const dtS = realDt * timeScale;
  const massFlowKgps = throttle > 0
    ? state.maxThrustN * throttle / (state.specificImpulseS * STANDARD_GRAVITY_MPS2)
    : 0;
  const poweredDurationS = massFlowKgps > 0 ? Math.min(dtS, state.propellantKg / massFlowKgps) : 0;
  const propellantUsedKg = massFlowKgps * poweredDurationS;
  const averageThrottle = dtS > 0 ? throttle * poweredDurationS / dtS : 0;
  const averageMassKg = state.dryMassKg + Math.max(0, state.propellantKg - propellantUsedKg * 0.5);
  const thrustDirection = normalized(command.thrustDirection || { x: 0, y: 1, z: 0 });
  const thrustAuthority = state.subsystems.propulsion === SUBSYSTEM_STATUS.DEGRADED ? 0.45 : 1;
  const thrustAcceleration = scale(
    thrustDirection,
    state.maxThrustN * averageThrottle * thrustAuthority / averageMassKg
  );
  const gravityStart = gravityAccelerationAt(state.positionM, bodies, state.epochMs);
  const accelerationStart = add(gravityStart, thrustAcceleration);
  const positionM = add(
    add(state.positionM, scale(state.velocityMps, dtS)),
    scale(accelerationStart, 0.5 * dtS * dtS)
  );
  const gravityEnd = gravityAccelerationAt(positionM, bodies, state.epochMs + dtS * 1000);
  const accelerationEnd = add(gravityEnd, thrustAcceleration);
  const velocityMps = add(state.velocityMps, scale(add(accelerationStart, accelerationEnd), 0.5 * dtS));
  const angularVelocityRadps = applyAngularCommand(state, command, dtS);
  const attitude = integrateAttitude(state.attitude, angularVelocityRadps, dtS);

  return stateRecord({
    ...state,
    epochMs: state.epochMs + dtS * 1000,
    positionM,
    velocityMps,
    attitude,
    angularVelocityRadps,
    propellantKg: state.propellantKg - propellantUsedKg,
    timeScale,
    lastEvent: throttle > 0 ? 'powered-flight' : 'coast'
  });
}

function computeBodyRelativeNavigation(stateInput, bodyState) {
  const state = stateRecord(stateInput);
  if (!bodyState || bodyState.frameId !== state.frameId) throw new RangeError('Navigation requires matching inertial frames.');
  const bodyPosition = bodyPositionAt(bodyState, state.epochMs);
  const relativePosition = subtract(state.positionM, bodyPosition);
  const relativeVelocity = subtract(state.velocityMps, bodyState.velocityMps);
  const centerDistanceM = magnitude(relativePosition);
  const relativeSpeedMps = magnitude(relativeVelocity);
  const radialUnit = normalized(relativePosition);
  const radialVelocityMps = dot(relativeVelocity, radialUnit);
  const tangentialVelocity = subtract(relativeVelocity, scale(radialUnit, radialVelocityMps));
  const tangentialSpeedMps = magnitude(tangentialVelocity);
  const mu = GRAVITATIONAL_CONSTANT * bodyState.massKg;
  const specificOrbitalEnergyJkg = centerDistanceM > 0
    ? relativeSpeedMps ** 2 * 0.5 - mu / centerDistanceM
    : Number.POSITIVE_INFINITY;
  const angularMomentum = cross(relativePosition, relativeVelocity);
  const eccentricityVector = centerDistanceM > 0 && mu > 0
    ? subtract(scale(cross(relativeVelocity, angularMomentum), 1 / mu), scale(relativePosition, 1 / centerDistanceM))
    : { x: 0, y: 0, z: 0 };

  return Object.freeze({
    bodyId: bodyState.bodyId,
    centerDistanceM,
    altitudeM: centerDistanceM - bodyState.radiusM,
    relativeSpeedMps,
    radialVelocityMps,
    tangentialSpeedMps,
    escapeVelocityMps: centerDistanceM > 0 ? Math.sqrt(2 * mu / centerDistanceM) : Number.POSITIVE_INFINITY,
    circularVelocityMps: centerDistanceM > 0 ? Math.sqrt(mu / centerDistanceM) : Number.POSITIVE_INFINITY,
    specificOrbitalEnergyJkg,
    eccentricity: magnitude(eccentricityVector),
    captured: specificOrbitalEnergyJkg < 0
  });
}

function evaluateLandingEligibility(stateInput, bodyState, options = {}) {
  const state = stateRecord(stateInput);
  const body = getAstronomicalBody(bodyState?.bodyId);
  if (!body) {
    return Object.freeze({ eligible: false, reason: 'solid-surface-landing-unavailable' });
  }
  const navigation = computeBodyRelativeNavigation(state, bodyState);
  if (!body.exploration.surfaceRegionEligible) {
    return Object.freeze({ eligible: false, reason: 'solid-surface-landing-unavailable', navigation });
  }
  if (state.targetBodyId && state.targetBodyId !== body.id) {
    return Object.freeze({ eligible: false, reason: 'landing-target-mismatch' });
  }
  for (const subsystem of ['attitude', 'landing', 'navigation', 'propulsion']) {
    if (state.subsystems[subsystem] === SUBSYSTEM_STATUS.FAILED) {
      return Object.freeze({ eligible: false, reason: `${subsystem}-system-failed` });
    }
  }
  const maxAltitudeM = Math.max(1, finite(options.maxAltitudeM ?? 25_000, 'Landing corridor altitude'));
  const maxRelativeSpeedMps = Math.max(0, finite(options.maxRelativeSpeedMps ?? 120, 'Landing speed limit'));
  const maxHorizontalSpeedMps = Math.max(0, finite(options.maxHorizontalSpeedMps ?? 80, 'Landing horizontal speed limit'));
  if (navigation.altitudeM < 0) return Object.freeze({ eligible: false, reason: 'spacecraft-below-surface', navigation });
  if (navigation.altitudeM > maxAltitudeM) return Object.freeze({ eligible: false, reason: 'outside-landing-corridor', navigation });
  if (navigation.relativeSpeedMps > maxRelativeSpeedMps) return Object.freeze({ eligible: false, reason: 'relative-speed-too-high', navigation });
  if (navigation.tangentialSpeedMps > maxHorizontalSpeedMps) return Object.freeze({ eligible: false, reason: 'horizontal-speed-too-high', navigation });
  if (navigation.radialVelocityMps > 5) return Object.freeze({ eligible: false, reason: 'spacecraft-ascending', navigation });
  return Object.freeze({ eligible: true, reason: null, navigation });
}

function setSpacecraftSubsystemStatus(stateInput, subsystem, status) {
  const state = stateRecord(stateInput);
  const name = String(subsystem || '');
  if (!SUBSYSTEM_NAMES.includes(name)) throw new RangeError(`Unknown spacecraft subsystem: ${subsystem}`);
  if (!Object.values(SUBSYSTEM_STATUS).includes(status)) throw new RangeError(`Unsupported subsystem status: ${status}`);
  return stateRecord({
    ...state,
    subsystems: { ...state.subsystems, [name]: status },
    mode: status === SUBSYSTEM_STATUS.FAILED && name === 'navigation' ? SPACECRAFT_MODE.SAFE : state.mode,
    lastEvent: `${name}-${status}`
  });
}

function enterSpacecraftSafeMode(stateInput, reason = 'manual-safe-mode') {
  const state = stateRecord(stateInput);
  return stateRecord({ ...state, mode: SPACECRAFT_MODE.SAFE, timeScale: 1, lastEvent: reason });
}

function recoverSpacecraft(stateInput) {
  const state = stateRecord(stateInput);
  const failed = SUBSYSTEM_NAMES.find((name) => state.subsystems[name] === SUBSYSTEM_STATUS.FAILED);
  if (failed) return Object.freeze({ recovered: false, reason: `${failed}-system-failed`, state });
  return Object.freeze({
    recovered: true,
    reason: null,
    state: stateRecord({ ...state, mode: SPACECRAFT_MODE.FLIGHT, timeScale: 1, lastEvent: 'flight-recovered' })
  });
}

function executePlannedBurn(stateInput, deltaVelocityMps = {}) {
  const state = stateRecord(stateInput);
  const deltaVelocity = vector(deltaVelocityMps, 'Planned delta-v');
  const deltaV = magnitude(deltaVelocity);
  if (state.mode !== SPACECRAFT_MODE.FLIGHT) {
    return Object.freeze({ executed: false, reason: 'spacecraft-not-in-flight', requiredPropellantKg: 0, state });
  }
  if (state.subsystems.propulsion === SUBSYSTEM_STATUS.FAILED) {
    return Object.freeze({ executed: false, reason: 'propulsion-system-failed', requiredPropellantKg: 0, state });
  }
  if (deltaV <= 1e-9) {
    return Object.freeze({ executed: true, reason: null, requiredPropellantKg: 0, state });
  }
  const propulsionAuthority = state.subsystems.propulsion === SUBSYSTEM_STATUS.DEGRADED ? 0.45 : 1;
  const effectiveExhaustVelocityMps = state.specificImpulseS * STANDARD_GRAVITY_MPS2 * propulsionAuthority;
  const initialMassKg = state.dryMassKg + state.propellantKg;
  const finalMassKg = initialMassKg / Math.exp(deltaV / effectiveExhaustVelocityMps);
  const requiredPropellantKg = initialMassKg - finalMassKg;
  if (requiredPropellantKg > state.propellantKg + 1e-9) {
    const maximumDeltaVMps = effectiveExhaustVelocityMps * Math.log(initialMassKg / state.dryMassKg);
    return Object.freeze({
      executed: false,
      reason: 'insufficient-propellant',
      requiredPropellantKg,
      maximumDeltaVMps,
      state
    });
  }
  return Object.freeze({
    executed: true,
    reason: null,
    requiredPropellantKg,
    state: stateRecord({
      ...state,
      velocityMps: add(state.velocityMps, deltaVelocity),
      propellantKg: state.propellantKg - requiredPropellantKg,
      timeScale: 1,
      lastEvent: 'planned-burn'
    })
  });
}

export {
  computeBodyRelativeNavigation,
  createBodyEphemerisState,
  createSpacecraftState,
  enterSpacecraftSafeMode,
  evaluateLandingEligibility,
  executePlannedBurn,
  GRAVITATIONAL_CONSTANT,
  INERTIAL_FRAME_ID,
  propagateSpacecraft,
  recoverSpacecraft,
  resolveTimeScale,
  setSpacecraftSubsystemStatus,
  SPACECRAFT_MODE,
  SPACECRAFT_SCHEMA_VERSION,
  STANDARD_GRAVITY_MPS2,
  SUBSYSTEM_STATUS,
  TIME_SCALES
};
