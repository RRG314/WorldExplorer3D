import { ctx as appCtx } from "./shared-context.js?v=55";

const DEFAULT_WAVE_INTENSITY = 0.46;
const SEA_STATE_SEQUENCE = ['calm', 'moderate', 'rough'];

const SEA_STATE_CONFIG = Object.freeze({
  calm: {
    label: 'Calm',
    intensity: 0.18,
    amplitude: 0.82,
    waveSpeed: 0.76,
    speedMax: 40,
    accel: 16.2,
    drag: 0.991,
    boatResponse: 0.78
  },
  moderate: {
    label: 'Moderate',
    intensity: 0.5,
    amplitude: 1.18,
    waveSpeed: 1.04,
    speedMax: 52,
    accel: 18.2,
    drag: 0.992,
    boatResponse: 1.14
  },
  rough: {
    label: 'Rough',
    intensity: 0.92,
    amplitude: 2.42,
    waveSpeed: 1.36,
    speedMax: 62,
    accel: 20.1,
    drag: 0.993,
    boatResponse: 1.52
  }
});

const WATER_KIND_CONFIG = Object.freeze({
  harbor: {
    label: 'Harbor Water',
    amplitude: 0.44,
    speed: 0.82,
    chop: 0.38,
    ripple: 0.56,
    swell: 0.14,
    foam: 0.2,
    breaker: 0.18,
    shelterFloor: 0.58,
    drift: 0.12,
    pitch: 0.78,
    roll: 0.86
  },
  channel: {
    label: 'Channel Water',
    amplitude: 0.4,
    speed: 0.78,
    chop: 0.34,
    ripple: 0.5,
    swell: 0.12,
    foam: 0.16,
    breaker: 0.16,
    shelterFloor: 0.52,
    drift: 0.1,
    pitch: 0.76,
    roll: 0.82
  },
  lake: {
    label: 'Lake Water',
    amplitude: 0.58,
    speed: 0.86,
    chop: 0.46,
    ripple: 0.6,
    swell: 0.24,
    foam: 0.18,
    breaker: 0.22,
    shelterFloor: 0.64,
    drift: 0.14,
    pitch: 0.82,
    roll: 0.88
  },
  coastal: {
    label: 'Coastal Water',
    amplitude: 0.92,
    speed: 0.98,
    chop: 0.72,
    ripple: 0.72,
    swell: 0.64,
    foam: 0.56,
    breaker: 0.68,
    shelterFloor: 0.72,
    drift: 0.2,
    pitch: 0.96,
    roll: 1.02
  },
  open_ocean: {
    label: 'Open Water',
    amplitude: 1.42,
    speed: 1.14,
    chop: 0.96,
    ripple: 0.76,
    swell: 1.28,
    foam: 0.94,
    breaker: 1.2,
    shelterFloor: 0.84,
    drift: 0.36,
    pitch: 1.24,
    roll: 1.28
  }
});

const PRIMARY_COMPONENTS = Object.freeze([
  { dirX: 0.96, dirZ: 0.28, frequency: 0.0105, speed: 0.52, weight: 0.58, phase: 0.0, crest: 0.26 },
  { dirX: 0.42, dirZ: 0.91, frequency: 0.0142, speed: 0.68, weight: 0.34, phase: 1.7, crest: 0.22 },
  { dirX: -0.74, dirZ: 0.67, frequency: 0.0195, speed: 0.74, weight: 0.22, phase: 2.9, crest: 0.18 }
]);

const SECONDARY_COMPONENTS = Object.freeze([
  { dirX: 0.85, dirZ: -0.53, frequency: 0.031, speed: 1.08, weight: 0.34, phase: 0.9, crest: 0.36 },
  { dirX: -0.17, dirZ: 0.98, frequency: 0.041, speed: 1.26, weight: 0.24, phase: 2.2, crest: 0.28 },
  { dirX: 0.58, dirZ: 0.82, frequency: 0.054, speed: 1.4, weight: 0.18, phase: 4.1, crest: 0.24 }
]);

const SWELL_COMPONENTS = Object.freeze([
  { dirX: 0.98, dirZ: 0.18, frequency: 0.0061, speed: 0.32, weight: 0.66, phase: 0.6, crest: 0.18 },
  { dirX: -0.28, dirZ: 0.96, frequency: 0.0074, speed: 0.38, weight: 0.34, phase: 2.4, crest: 0.12 }
]);

const RIPPLE_COMPONENTS = Object.freeze([
  { dirX: 0.34, dirZ: 0.94, frequency: 0.082, speed: 1.76, weight: 0.2, phase: 0.4, crest: 0.18 },
  { dirX: -0.92, dirZ: 0.38, frequency: 0.115, speed: 2.05, weight: 0.12, phase: 1.9, crest: 0.14 }
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeOut(value) {
  const t = clamp(value, 0, 1);
  return 1 - Math.pow(1 - t, 2);
}

function normalizeDirection(x, z) {
  const len = Math.hypot(x, z) || 1;
  return { x: x / len, z: z / len };
}

function surfaceNormalFromMotion(motion = null) {
  const slopeX = Number(motion?.slopeX) || 0;
  const slopeZ = Number(motion?.slopeZ) || 0;
  const invLen = 1 / Math.hypot(slopeX, 1, slopeZ);
  return {
    x: -slopeX * invLen,
    y: 1 * invLen,
    z: -slopeZ * invLen,
    steepness: Math.hypot(slopeX, slopeZ)
  };
}

function getSeaStateConfig(state = appCtx.boatMode?.seaState) {
  return SEA_STATE_CONFIG[state] || SEA_STATE_CONFIG.moderate;
}

function intensityFromSeaState(state = 'moderate') {
  return SEA_STATE_CONFIG[state]?.intensity ?? DEFAULT_WAVE_INTENSITY;
}

function seaStateFromIntensity(intensity = DEFAULT_WAVE_INTENSITY) {
  const value = clamp(Number(intensity) || DEFAULT_WAVE_INTENSITY, 0, 1);
  if (value < 0.34) return 'calm';
  if (value > 0.72) return 'rough';
  return 'moderate';
}

function getWaveIntensity(value = appCtx.boatMode?.waveIntensity) {
  if (Number.isFinite(value)) return clamp(Number(value), 0, 1);
  return intensityFromSeaState(appCtx.boatMode?.seaState || 'moderate');
}

function inferWaterRenderContext(options = {}) {
  const kindHint = String(options.kindHint || options.waterKind || '').toLowerCase();
  if (WATER_KIND_CONFIG[kindHint]) return kindHint;

  const width = Math.max(0, Number(options.width) || 0);
  const area = Math.max(0, Number(options.area) || 0);
  const span = Math.max(0, Number(options.span) || 0);

  if (width > 0) {
    if (width >= 72) return 'coastal';
    if (width >= 26) return 'channel';
    return 'harbor';
  }

  if (area > 900000 || span > 1500) return 'open_ocean';
  if (area > 240000 || span > 650) return 'coastal';
  if (area > 70000 || span > 260) return 'harbor';
  return 'lake';
}

function resolveWaterMotionProfile(options = {}) {
  const active = options.active !== false;
  const waterKind = inferWaterRenderContext(options);
  const kindCfg = WATER_KIND_CONFIG[waterKind] || WATER_KIND_CONFIG.coastal;
  const intensity = getWaveIntensity(options.intensity);
  const seaState = seaStateFromIntensity(intensity);
  const seaCfg = getSeaStateConfig(seaState);
  const shorelineDistance = Math.max(0, Number(options.shorelineDistance) || 0);
  const offshoreBlend =
    waterKind === 'harbor' || waterKind === 'channel' ?
      clamp((shorelineDistance - 8) / 90, 0, 1) :
    waterKind === 'lake' ?
      clamp((shorelineDistance - 14) / 150, 0, 1) :
    waterKind === 'coastal' ?
      clamp((shorelineDistance - 18) / 220, 0, 1) :
      clamp((shorelineDistance - 26) / 320, 0, 1);

  const shelter = options.forceOffshore === true ? 1 : lerp(kindCfg.shelterFloor, 1, easeOut(offshoreBlend));
  const activeGain = active ? 1 : 0.24;
  const energyScale = Number.isFinite(options.energyScale) ? options.energyScale : 1;
  const energy = (0.28 + intensity * 1.08) * seaCfg.amplitude * kindCfg.amplitude * shelter * activeGain * energyScale;

  const primaryMax = active ? 1.68 : 0.16;
  const secondaryMax = active ? 0.94 : 0.08;
  const swellMax = active ? 1.54 : 0.12;
  const rippleMax = active ? 0.24 : 0.03;
  const primaryAmplitude = clamp(energy * 0.58, active ? 0.05 : 0.008, primaryMax);
  const secondaryAmplitude = clamp(
    energy * (0.19 + intensity * 0.22) * kindCfg.chop,
    active ? 0.016 : 0.004,
    secondaryMax
  );
  const swellAmplitude = clamp(
    energy * (0.18 + intensity * 0.34) * kindCfg.swell * lerp(0.8, 1.3, offshoreBlend),
    active ? 0.018 : 0.004,
    swellMax
  );
  const rippleAmplitude = clamp(
    energy * 0.14 * kindCfg.ripple,
    active ? 0.005 : 0.0015,
    rippleMax
  );
  const speed = seaCfg.waveSpeed * kindCfg.speed * lerp(0.82, 1.14, intensity);
  const spatialScale =
    waterKind === 'open_ocean' ? 0.92 :
    waterKind === 'coastal' ? 1.0 :
    waterKind === 'lake' ? 1.08 :
    waterKind === 'channel' ? 1.16 :
    1.2;
  const visualStrength = clamp((active ? 0.68 : 0.12) + energy * 0.74, active ? 0.48 : 0.08, active ? 2.16 : 0.34);
  const foamStrength = clamp((intensity - 0.14) * 1.94 * kindCfg.foam * shelter * (active ? 1 : 0.16), 0, 2.15);
  const whitecapStrength = clamp((intensity - 0.08) * 1.78 * kindCfg.foam * lerp(0.86, 1.26, offshoreBlend), 0, 2.4);
  const breakerStrength = clamp((intensity - 0.28) * 1.62 * kindCfg.breaker * lerp(0.78, 1.28, offshoreBlend), 0, 1.94);
  const driftSpeed = (0.06 + intensity * 0.34) * kindCfg.drift * (0.45 + offshoreBlend * 0.55);

  return {
    active,
    intensity,
    seaState,
    seaStateLabel: seaCfg.label,
    waterKind,
    waterLabel: kindCfg.label,
    shorelineDistance,
    shelter,
    offshoreBlend,
    primaryAmplitude,
    secondaryAmplitude,
    swellAmplitude,
    rippleAmplitude,
    speed,
    spatialScale,
    visualStrength,
    foamStrength,
    whitecapStrength,
    breakerStrength,
    driftSpeed,
    pitchScale: kindCfg.pitch * seaCfg.boatResponse,
    rollScale: kindCfg.roll * seaCfg.boatResponse
  };
}

function sampleComponentSet(components, x, z, time, amplitude, speedScale, spatialScale = 1) {
  let height = 0;
  let slopeX = 0;
  let slopeZ = 0;
  let crest = 0;
  let dirX = 0;
  let dirZ = 0;

  for (let i = 0; i < components.length; i++) {
    const component = components[i];
    const freq = component.frequency * spatialScale;
    const theta =
      (x * component.dirX + z * component.dirZ) * freq +
      time * component.speed * speedScale +
      component.phase;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);
    const waveHeight = amplitude * component.weight;
    const slope = waveHeight * freq * cosTheta;

    height += sinTheta * waveHeight;
    slopeX += slope * component.dirX;
    slopeZ += slope * component.dirZ;
    crest += Math.max(0, sinTheta) * component.crest;
    dirX += component.dirX * waveHeight;
    dirZ += component.dirZ * waveHeight;
  }

  const direction = normalizeDirection(dirX, dirZ);
  return { height, slopeX, slopeZ, crest, dirX: direction.x, dirZ: direction.z };
}

function sampleWaterSurfaceMotion(x, z, time, options = {}) {
  const profile = options.profile || resolveWaterMotionProfile(options);
  const spatialScale = (Number.isFinite(options.waveScale) ? Number(options.waveScale) : 1) * profile.spatialScale;
  const primary = sampleComponentSet(
    PRIMARY_COMPONENTS,
    x,
    z,
    time,
    profile.primaryAmplitude,
    profile.speed,
    spatialScale * 0.92
  );
  const secondary = sampleComponentSet(
    SECONDARY_COMPONENTS,
    x + 23.5,
    z - 11.8,
    time * 1.08,
    profile.secondaryAmplitude,
    profile.speed * 1.16,
    spatialScale * 1.12
  );
  const swell = sampleComponentSet(
    SWELL_COMPONENTS,
    x - 41.7,
    z + 28.3,
    time * 0.72,
    profile.swellAmplitude,
    profile.speed * 0.62,
    spatialScale * 0.72
  );
  const ripple = sampleComponentSet(
    RIPPLE_COMPONENTS,
    x - 8.2,
    z + 4.6,
    time * 1.3,
    profile.rippleAmplitude,
    profile.speed * 1.34,
    spatialScale * 1.42
  );

  const direction = normalizeDirection(
    swell.dirX * 0.34 + primary.dirX * 0.4 + secondary.dirX * 0.2 + ripple.dirX * 0.06,
    swell.dirZ * 0.34 + primary.dirZ * 0.4 + secondary.dirZ * 0.2 + ripple.dirZ * 0.06
  );
  const crest = clamp(swell.crest * 0.26 + primary.crest * 0.54 + secondary.crest * 0.82 + ripple.crest * 0.38, 0, 2.1);
  const foam = clamp((crest - 0.36) * profile.foamStrength + (crest - 0.58) * profile.whitecapStrength, 0, 1.8);
  const normal = surfaceNormalFromMotion({
    slopeX: swell.slopeX + primary.slopeX + secondary.slopeX + ripple.slopeX,
    slopeZ: swell.slopeZ + primary.slopeZ + secondary.slopeZ + ripple.slopeZ
  });

  return {
    profile,
    height: swell.height + primary.height + secondary.height + ripple.height,
    slopeX: swell.slopeX + primary.slopeX + secondary.slopeX + ripple.slopeX,
    slopeZ: swell.slopeZ + primary.slopeZ + secondary.slopeZ + ripple.slopeZ,
    crest,
    foam,
    normalX: normal.x,
    normalY: normal.y,
    normalZ: normal.z,
    steepness: normal.steepness,
    directionX: direction.x,
    directionZ: direction.z
  };
}

function buildWaveHeightExpression(components, amplitudeVar, speedVar, scaleVar, posVar, timeVar) {
  return components.map((component) => {
    const dx = (component.dirX * component.frequency).toFixed(6);
    const dz = (component.dirZ * component.frequency).toFixed(6);
    const speed = component.speed.toFixed(6);
    const weight = component.weight.toFixed(6);
    const phase = component.phase.toFixed(6);
    return `sin(((${posVar}.x * ${dx}) + (${posVar}.y * ${dz})) * ${scaleVar} + ${timeVar} * ${speedVar} * ${speed} + ${phase}) * (${amplitudeVar} * ${weight})`;
  }).join(' + ');
}

function buildWaveCrestExpression(components, speedVar, scaleVar, posVar, timeVar) {
  return components.map((component) => {
    const dx = (component.dirX * component.frequency).toFixed(6);
    const dz = (component.dirZ * component.frequency).toFixed(6);
    const speed = component.speed.toFixed(6);
    const crest = component.crest.toFixed(6);
    const phase = component.phase.toFixed(6);
    return `max(0.0, sin(((${posVar}.x * ${dx}) + (${posVar}.y * ${dz})) * ${scaleVar} + ${timeVar} * ${speedVar} * ${speed} + ${phase})) * ${crest}`;
  }).join(' + ');
}

function buildWaterShaderLibrary() {
  const primaryHeightExpr = buildWaveHeightExpression(PRIMARY_COMPONENTS, 'weWaveAmplitude', 'weWaveSpeed', 'weWaveScale', 'worldXZ', 'weWaveTime');
  const secondaryHeightExpr = buildWaveHeightExpression(SECONDARY_COMPONENTS, 'weWaveSecondaryAmplitude', 'weWaveSpeed', 'weWaveScale * 1.12', 'vec2(worldXZ.x + 23.5, worldXZ.y - 11.8)', 'weWaveTime * 1.08');
  const swellHeightExpr = buildWaveHeightExpression(SWELL_COMPONENTS, 'weWaveSwellAmplitude', 'weWaveSpeed', 'weWaveScale * 0.72', 'vec2(worldXZ.x - 41.7, worldXZ.y + 28.3)', 'weWaveTime * 0.72');
  const rippleHeightExpr = buildWaveHeightExpression(RIPPLE_COMPONENTS, 'weWaveRippleAmplitude', 'weWaveSpeed', 'weWaveScale * 1.42', 'vec2(worldXZ.x - 8.2, worldXZ.y + 4.6)', 'weWaveTime * 1.3');
  const swellCrestExpr = buildWaveCrestExpression(SWELL_COMPONENTS, 'weWaveSpeed', 'weWaveScale * 0.72', 'vec2(worldXZ.x - 41.7, worldXZ.y + 28.3)', 'weWaveTime * 0.72');
  const primaryCrestExpr = buildWaveCrestExpression(PRIMARY_COMPONENTS, 'weWaveSpeed', 'weWaveScale', 'worldXZ', 'weWaveTime');
  const secondaryCrestExpr = buildWaveCrestExpression(SECONDARY_COMPONENTS, 'weWaveSpeed', 'weWaveScale * 1.12', 'vec2(worldXZ.x + 23.5, worldXZ.y - 11.8)', 'weWaveTime * 1.08');
  const rippleCrestExpr = buildWaveCrestExpression(RIPPLE_COMPONENTS, 'weWaveSpeed', 'weWaveScale * 1.42', 'vec2(worldXZ.x - 8.2, worldXZ.y + 4.6)', 'weWaveTime * 1.3');

  return `uniform float weWaveTime;
uniform float weWaveAmplitude;
uniform float weWaveSecondaryAmplitude;
uniform float weWaveSwellAmplitude;
uniform float weWaveRippleAmplitude;
uniform float weWaveScale;
uniform float weWaveSpeed;
uniform float weWaveVisualStrength;
uniform float weWaveFoamStrength;
uniform float weWaveEdgeFade;
varying vec2 vWeWaveWorldXZ;
varying vec2 vWePatchUv;

float weWavePrimary(vec2 worldXZ) {
  return ${primaryHeightExpr};
}

float weWaveSecondary(vec2 worldXZ) {
  return ${secondaryHeightExpr};
}

float weWaveSwell(vec2 worldXZ) {
  return ${swellHeightExpr};
}

float weWaveRipples(vec2 worldXZ) {
  return ${rippleHeightExpr};
}

float weWaveField(vec2 worldXZ) {
  return weWaveSwell(worldXZ) + weWavePrimary(worldXZ) + weWaveSecondary(worldXZ) + weWaveRipples(worldXZ);
}

float weWaveCrest(vec2 worldXZ) {
  return clamp((${swellCrestExpr}) * 0.26 + (${primaryCrestExpr}) * 0.54 + (${secondaryCrestExpr}) * 0.82 + (${rippleCrestExpr}) * 0.38, 0.0, 2.1);
}`;
}

export {
  DEFAULT_WAVE_INTENSITY,
  SEA_STATE_CONFIG,
  SEA_STATE_SEQUENCE,
  WATER_KIND_CONFIG,
  buildWaterShaderLibrary,
  getSeaStateConfig,
  getWaveIntensity,
  inferWaterRenderContext,
  intensityFromSeaState,
  resolveWaterMotionProfile,
  sampleWaterSurfaceMotion,
  surfaceNormalFromMotion,
  seaStateFromIntensity
};
