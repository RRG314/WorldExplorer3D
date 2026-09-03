import { getAstronomicalBody, LANDING_MODE, normalizeAstronomicalBodyId } from '../astronomy/body-catalog.js?v=3';
import { getPhysicalEnvironmentProfile, samplePhysicalEnvironment } from '../planetary/runtime/physical-environment.js?v=2';

const ATMOSPHERIC_EXPLORATION_SCHEMA_VERSION = 2;
const MAX_ENTRY_ALTITUDE_M = 150_000;
const MAX_ENTRY_SPEED_MPS = 250;
const PRESSURE_LIMIT_PA = 600_000;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function bodyProfile(bodyInput) {
  const bodyId = normalizeAstronomicalBodyId(bodyInput);
  const body = bodyId ? getAstronomicalBody(bodyId) : null;
  const environment = bodyId ? getPhysicalEnvironmentProfile(bodyId) : null;
  if (!body || body.exploration.landingMode !== LANDING_MODE.ATMOSPHERIC_DESCENT || !environment) return null;
  const scaleHeightM = Number(environment.scaleHeightM);
  const referencePressurePa = Number(environment.referencePressurePa);
  const minimumAltitudeM = -scaleHeightM * Math.log(PRESSURE_LIMIT_PA / referencePressurePa);
  return deepFreeze({
    bodyId,
    bodyName: body.name,
    landingMode: body.exploration.landingMode,
    solidSurfaceAvailable: false,
    entryAltitudeM: 20_000,
    minimumAltitudeM,
    pressureLimitPa: PRESSURE_LIMIT_PA,
    descentRateMps: Math.max(350, Math.min(750, scaleHeightM / 60)),
    ascentRateMps: Math.max(550, Math.min(1_000, scaleHeightM / 45))
  });
}

function evaluateAtmosphericEntry(bodyInput, navigation = {}) {
  const profile = bodyProfile(bodyInput);
  if (!profile) return deepFreeze({ authorized: false, reason: 'atmospheric-exploration-unavailable', profile: null });
  const bodyId = normalizeAstronomicalBodyId(navigation.bodyId);
  const altitudeM = Number(navigation.altitudeM);
  const relativeSpeedMps = Number(navigation.relativeSpeedMps);
  if (bodyId !== profile.bodyId) return deepFreeze({ authorized: false, reason: 'atmospheric-entry-body-mismatch', profile });
  if (!Number.isFinite(altitudeM) || altitudeM > MAX_ENTRY_ALTITUDE_M) {
    return deepFreeze({ authorized: false, reason: 'atmospheric-entry-too-high', profile });
  }
  if (!Number.isFinite(relativeSpeedMps) || relativeSpeedMps > MAX_ENTRY_SPEED_MPS) {
    return deepFreeze({ authorized: false, reason: 'atmospheric-entry-too-fast', profile });
  }
  return deepFreeze({
    authorized: true,
    reason: null,
    profile,
    navigation: { bodyId, altitudeM, relativeSpeedMps },
    noSolidSurface: true
  });
}

function createAtmosphericExploration(bodyInput, options = {}) {
  const profile = bodyProfile(bodyInput);
  if (!profile) throw new RangeError(`Atmospheric exploration is unavailable for: ${bodyInput}`);
  const altitudeM = Math.max(profile.minimumAltitudeM, Math.min(MAX_ENTRY_ALTITUDE_M, Number(options.altitudeM ?? profile.entryAltitudeM)));
  const timestampS = Number(options.timestampS ?? 0);
  return deepFreeze({
    type: 'AtmosphericExplorationState',
    schemaVersion: ATMOSPHERIC_EXPLORATION_SCHEMA_VERSION,
    bodyId: profile.bodyId,
    altitudeM,
    minimumAltitudeM: profile.minimumAltitudeM,
    pressureLimitPa: profile.pressureLimitPa,
    phase: altitudeM <= profile.minimumAltitudeM + 1 ? 'depth_limit' : 'descending',
    horizontalSpeedMps: 0,
    groundTrackM: 0,
    elapsedS: 0,
    timestampS,
    environment: samplePhysicalEnvironment(profile.bodyId, { heightM: altitudeM, timestampS })
  });
}

function advanceAtmosphericExploration(stateInput, realDtS, command = {}) {
  const profile = bodyProfile(stateInput?.bodyId);
  if (!profile || stateInput?.type !== 'AtmosphericExplorationState') throw new TypeError('A valid atmospheric exploration state is required.');
  const dtS = Math.max(0, Math.min(0.1, Number(realDtS) || 0));
  const climb = command.climb === true;
  const descent = command.descend !== false && !climb;
  const throttle = Math.max(0, Math.min(1, Number(command.throttle) || 0));
  const priorHorizontalSpeed = Math.max(0, Number(stateInput.horizontalSpeedMps) || 0);
  const horizontalAccelerationMps2 = throttle > 0 ? 420 * throttle : -180;
  const horizontalSpeedMps = Math.max(0, Math.min(2_400, priorHorizontalSpeed + horizontalAccelerationMps2 * dtS));
  const rate = climb ? profile.ascentRateMps : descent ? -profile.descentRateMps : 0;
  const altitudeM = Math.max(profile.minimumAltitudeM, Math.min(MAX_ENTRY_ALTITUDE_M, stateInput.altitudeM + rate * dtS));
  const timestampS = Number(stateInput.timestampS) + dtS;
  return deepFreeze({
    ...stateInput,
    altitudeM,
    phase: altitudeM <= profile.minimumAltitudeM + 1 ? 'depth_limit' : climb ? 'ascending' : 'descending',
    horizontalSpeedMps,
    groundTrackM: Math.max(0, Number(stateInput.groundTrackM) || 0) + horizontalSpeedMps * dtS,
    elapsedS: Number(stateInput.elapsedS) + dtS,
    timestampS,
    environment: samplePhysicalEnvironment(profile.bodyId, { heightM: altitudeM, timestampS })
  });
}

export {
  advanceAtmosphericExploration,
  ATMOSPHERIC_EXPLORATION_SCHEMA_VERSION,
  bodyProfile as getAtmosphericExplorationProfile,
  createAtmosphericExploration,
  evaluateAtmosphericEntry,
  MAX_ENTRY_ALTITUDE_M,
  MAX_ENTRY_SPEED_MPS,
  PRESSURE_LIMIT_PA
};
