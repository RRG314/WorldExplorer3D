import { ctx as appCtx } from "../shared-context.js?v=55";
import { getSeaStateConfig, getWaveIntensity, inferWaterRenderContext, resolveWaterMotionProfile, surfaceNormalFromMotion } from "../water-dynamics.js?v=9";
import { getWaterPalette } from "../water-palette.js?v=2";
import {
  getBoatWaveProfile,
  resolveBoatWaterKind,
  sampleDynamicWaterAt,
  waterSurfaceBaseYAt,
  waterSurfaceYAt
} from "./water-query.js?v=19";
import { clamp, stepBoatSpring } from "./dynamics.js?v=1";
import { resetBoatFoamFx, updateBoatFoamFx } from "./foam-effects.js?v=1";
import { customizeBoatWaterPatchShader } from "./water-patch-shader.js?v=2";
import { modeledWaveRenderControls } from '../world/water-optics-evidence.js?v=2';

function registerBoatWaterPatchMaterial(material) {
  if (!material || material.userData?.weWaterWavePatched || typeof appCtx.registerWaterWaveMaterial !== 'function') return false;
  appCtx.registerWaterWaveMaterial(material, {
    waveScale: 1.08,
    waveBase: 1.28,
    visualBase: 0.78,
    foamBase: 1.38,
    edgeFade: 0.46,
    useRuntimeKind: true,
    localPatch: true,
    shaderKey: 'boatPatchWake',
    shaderHook: customizeBoatWaterPatchShader
  });
  material.userData.weWaterWaveConfig = {
    ...(material.userData.weWaterWaveConfig || {}),
    visualBase: 0.78,
    foamBase: 1.38
  };
  return material.userData.weWaterWavePatched === true;
}

function ensureBoatWaterPatch() {
  if (appCtx.boatMode?.waterPatch) {
    registerBoatWaterPatchMaterial(appCtx.boatMode.waterPatch.material);
    return appCtx.boatMode.waterPatch;
  }
  if (typeof THREE === 'undefined' || !appCtx.scene) return null;
  const geometry = new THREE.PlaneGeometry(1, 1, 128, 128);
  geometry.rotateX(-Math.PI / 2);
  const palette = getWaterPalette(appCtx.boatMode?.waterKind);
  const material = new THREE.MeshStandardMaterial({
    color: palette.surface,
    emissive: palette.emissive,
    emissiveIntensity: 0.1,
    roughness: 0.5,
    metalness: 0.02,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -8,
    polygonOffsetUnits: -8
  });
  registerBoatWaterPatchMaterial(material);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'BoatWaterPatch';
  mesh.visible = false;
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  mesh.onBeforeRender = () => {
    if (!appCtx.boatMode?.active) return;
    refreshBoatWaterPatchUniforms(performance.now() * 0.001);
  };
  appCtx.scene.add(mesh);
  appCtx.boatMode.waterPatch = mesh;
  return mesh;
}

function updateBoatWaterPatch(candidate = null) {
  const patch = ensureBoatWaterPatch();
  if (!patch) return false;
  if (!appCtx.boatMode?.active) {
    patch.visible = false;
    return false;
  }
  const waterKind = String(candidate?.waterKind || appCtx.boatMode?.waterKind || 'coastal').toLowerCase();
  const palette = getWaterPalette(waterKind);
  const radius =
    waterKind === 'harbor' ? 110 :
    waterKind === 'channel' ? 90 :
    waterKind === 'lake' ? 150 :
    // One fixed open-ocean location surface reaches the horizon without
    // terrain streaming or a moving ring of newly loaded tiles.
    waterKind === 'open_ocean' ? 14000 : 210;
  patch.visible = true;
  patch.position.set(
    appCtx.boat.x,
    waterSurfaceBaseYAt(appCtx.boat.x, appCtx.boat.z, candidate || appCtx.boatMode.currentWater || null) + 0.003,
    appCtx.boat.z
  );
  // The geometry is pre-rotated onto the XZ plane, so scale the footprint on X/Z.
  // Scaling Y here collapses the patch into a moving strip and exaggerates wave height.
  patch.scale.set(radius * 2.05, 1, radius * 2.05);
  patch.material.opacity = 1;
  if (patch.material.color?.setHex) patch.material.color.setHex(palette.surface);
  if (patch.material.emissive?.setHex) patch.material.emissive.setHex(palette.emissive);
  patch.material.roughness =
    waterKind === 'open_ocean' ? 0.3 :
    waterKind === 'coastal' ? 0.31 :
    waterKind === 'harbor' || waterKind === 'channel' ? 0.33 :
    0.32;
  patch.material.metalness = 0;
  if (!patch.material.userData?.weWaterWaveShader) patch.material.needsUpdate = true;
  return true;
}

function buildBoatWaveProfile(material, runtimeIntensity = getWaveIntensity(), timeOverride = null) {
  const config = material?.userData?.weWaterWaveConfig || {};
  const runtimeKind = resolveBoatWaterKind(appCtx.boatMode?.currentWater || null);
  const runtimeShoreline = Number(appCtx.boatMode?.shorelineDistance || 0);
  const boatDriven = appCtx.boatMode?.active || config.localPatch === true;
  const modeledControls = modeledWaveRenderControls(appCtx.activeWaterOpticsEvidence?.wave);
  const effectiveIntensity = modeledControls.usable ? modeledControls.intensity : runtimeIntensity;
  const profile = resolveWaterMotionProfile({
    waterKind: config.useRuntimeKind === true ? runtimeKind : inferWaterRenderContext({ kindHint: config.waterKind || runtimeKind }),
    shorelineDistance: Number.isFinite(config.shorelineDistance) ? config.shorelineDistance : runtimeShoreline,
    intensity: appCtx.boatMode?.active ? effectiveIntensity : Math.min(effectiveIntensity, 0.24),
    // Shared mapped water keeps a restrained optical wave field in walk and
    // flight modes. This is presentation only; CPU sampling and buoyancy stay
    // on the existing boat-mode water dynamics authority.
    active: true,
    energyScale: (Number.isFinite(config.energyBase) ? config.energyBase : 1) * (boatDriven ? 1 : 0.38)
  });
  if (modeledControls.usable) {
    profile.speed *= modeledControls.speedScale;
    profile.waveEvidenceSource = modeledControls.sourceId;
    profile.modeledWaveHeightM = modeledControls.waveHeightM;
    profile.modeledWavePeriodS = modeledControls.wavePeriodS;
  }
  const time = Number.isFinite(timeOverride) ? Number(timeOverride) : performance.now() * 0.001;
  return { config, profile, time };
}

function applyWaveUniformsToMaterial(material, profileBundle) {
  const shader = material?.userData?.weWaterWaveShader;
  if (!shader?.uniforms) return false;
  const { config, profile, time } = profileBundle;
  shader.uniforms.weWaveTime.value = time;
  shader.uniforms.weWaveSpeed.value = profile.speed;
  shader.uniforms.weWaveAmplitude.value = profile.primaryAmplitude * (Number(config.waveBase) || 1);
  if (shader.uniforms.weWaveSecondaryAmplitude) {
    shader.uniforms.weWaveSecondaryAmplitude.value = profile.secondaryAmplitude * (Number(config.waveBase) || 1);
  }
  if (shader.uniforms.weWaveSwellAmplitude) {
    shader.uniforms.weWaveSwellAmplitude.value = profile.swellAmplitude * (Number(config.waveBase) || 1);
  }
  if (shader.uniforms.weWaveRippleAmplitude) {
    shader.uniforms.weWaveRippleAmplitude.value = profile.rippleAmplitude * (Number(config.waveBase) || 1);
  }
  if (shader.uniforms.weWaveVisualStrength) {
    shader.uniforms.weWaveVisualStrength.value = profile.visualStrength * (Number(config.visualBase) || 1);
  }
  if (shader.uniforms.weWaveFoamStrength) {
    shader.uniforms.weWaveFoamStrength.value = (profile.foamStrength + profile.whitecapStrength * 0.4) * (Number(config.foamBase) || 1);
  }
  const atmosphere = appCtx.earthAtmosphereProfile;
  if (atmosphere) {
    shader.uniforms.weWaterZenithColor?.value?.setHex?.(atmosphere.zenithColor);
    shader.uniforms.weWaterHorizonColor?.value?.setHex?.(atmosphere.horizonColor);
    shader.uniforms.weWaterSunColor?.value?.setHex?.(atmosphere.sunColor);
    shader.uniforms.weWaterSunDirection?.value?.set?.(
      atmosphere.sunDirection.x,
      atmosphere.sunDirection.y,
      atmosphere.sunDirection.z
    );
    if (shader.uniforms.weWaterDaylight) shader.uniforms.weWaterDaylight.value = atmosphere.daylight;
    if (shader.uniforms.weWaterNight) shader.uniforms.weWaterNight.value = atmosphere.night;
    if (shader.uniforms.weWaterOvercast) shader.uniforms.weWaterOvercast.value = atmosphere.overcast;
  }
  if (shader.uniforms.weWaterNormalStrength) {
    const quality = String(appCtx.renderQualityLevel || 'medium').toLowerCase();
    shader.uniforms.weWaterNormalStrength.value = quality === 'low' ? 0.42 : quality === 'high' ? 1 : 0.72;
  }
  return true;
}

function refreshBoatWaterPatchUniforms(timeOverride = null) {
  const patchMaterial = appCtx.boatMode?.waterPatch?.material || null;
  if (!patchMaterial) return false;
  const bundle = buildBoatWaveProfile(patchMaterial, getWaveIntensity(), timeOverride);
  if (!applyWaveUniformsToMaterial(patchMaterial, bundle)) {
    patchMaterial.needsUpdate = true;
    return false;
  }
  updateBoatPatchWakeUniforms(bundle.profile);
  return true;
}

function updateBoatSurfaceEffects(profile, dt, centerMotion, speedNorm, bowAverage, sternAverage) {
  const forwardX = Math.sin(appCtx.boat.angle || 0);
  const forwardZ = Math.cos(appCtx.boat.angle || 0);
  const waveDirX = Number(centerMotion?.directionX || appCtx.boatMode.waveDirectionX || 0);
  const waveDirZ = Number(centerMotion?.directionZ || appCtx.boatMode.waveDirectionZ || 1);
  const waveAlignment = clamp(forwardX * waveDirX + forwardZ * waveDirZ, -1, 1);
  const intoWave = clamp(-waveAlignment, 0, 1);
  const followingSea = clamp(waveAlignment, 0, 1);
  const bowRiseTarget = clamp((sternAverage - bowAverage) * 0.28 + speedNorm * 0.1 + intoWave * 0.06, -0.14, 0.3);
  const wakeTarget = clamp(speedNorm * 1.04 + Math.abs(appCtx.boat.turnRate || 0) * 0.48 + profile.foamStrength * 0.22, 0, 2.2);
  const wakeSpreadTarget = clamp(0.46 + speedNorm * 0.6 + profile.offshoreBlend * 0.3, 0.32, 1.72);
  const bowWaveTarget = clamp(0.22 + speedNorm * 0.82 + intoWave * 0.42 + profile.breakerStrength * 0.18, 0, 2.2);
  const slamTarget = clamp(
    Math.max(0, -appCtx.boat.verticalVelocity * 0.52) +
    intoWave * (0.26 + profile.breakerStrength * 0.4) +
    Math.abs(appCtx.boat.pitch) * 0.98,
    0,
    2.1
  );
  const bowSplashTarget = clamp(bowWaveTarget * (0.62 + slamTarget * 0.58), 0, 2.6);
  const sternFoamTarget = clamp(wakeTarget * (0.66 + Math.abs(appCtx.boat.turnRate || 0) * 0.22 + followingSea * 0.1), 0, 2.2);
  const alpha = clamp((dt > 0 ? dt : 1 / 60) * (profile.waterKind === 'harbor' ? 4.6 : 3.6), 0.06, 0.24);
  appCtx.boat.bowLift += (bowRiseTarget - appCtx.boat.bowLift) * alpha;
  appCtx.boatMode.wakeStrength += (wakeTarget - appCtx.boatMode.wakeStrength) * alpha;
  appCtx.boatMode.wakeSpread += (wakeSpreadTarget - appCtx.boatMode.wakeSpread) * alpha;
  appCtx.boatMode.bowWaveStrength += (bowWaveTarget - appCtx.boatMode.bowWaveStrength) * alpha;
  appCtx.boatMode.bowSplashStrength += (bowSplashTarget - appCtx.boatMode.bowSplashStrength) * alpha;
  appCtx.boatMode.sternFoamStrength += (sternFoamTarget - appCtx.boatMode.sternFoamStrength) * alpha;
  appCtx.boatMode.slamStrength += (slamTarget - appCtx.boatMode.slamStrength) * alpha;
}

function updateBoatPatchWakeUniforms(profile = null) {
  const shader = appCtx.boatMode?.waterPatch?.material?.userData?.weWaterWaveShader;
  if (!shader?.uniforms?.weBoatPos || typeof THREE === 'undefined') return false;
  const forwardX = Math.sin(appCtx.boat.angle || 0);
  const forwardZ = Math.cos(appCtx.boat.angle || 0);
  const speedNorm = clamp(Math.abs(appCtx.boat.forwardSpeed || appCtx.boat.speed || 0) / Math.max(1, getSeaStateConfig().speedMax || 1), 0, 1.6);
  shader.uniforms.weBoatPos.value.set(appCtx.boat.x, appCtx.boat.z);
  shader.uniforms.weBoatForward.value.set(forwardX, forwardZ);
  shader.uniforms.weBoatWakeStrength.value = Number(appCtx.boatMode.wakeStrength || 0);
  shader.uniforms.weBoatWakeSpread.value = Number(appCtx.boatMode.wakeSpread || 0);
  shader.uniforms.weBoatBowWave.value = Number(appCtx.boatMode.bowWaveStrength || 0);
  shader.uniforms.weBoatBowSplash.value = Number(appCtx.boatMode.bowSplashStrength || 0);
  shader.uniforms.weBoatSternFoam.value = Number(appCtx.boatMode.sternFoamStrength || 0);
  shader.uniforms.weBoatWaveSeverity.value = clamp(
    Number(profile?.breakerStrength || 0) + speedNorm * 0.28 + Number(appCtx.boatMode.slamStrength || 0) * 0.4,
    0,
    2.5
  );
  return true;
}

function applyBoatWavePose(x, z, angle, candidate = null, dt = 0, forceSnap = false) {
  const time = performance.now() * 0.001;
  const profile = getBoatWaveProfile(candidate);
  const baseCenterY = waterSurfaceBaseYAt(x, z, candidate);
  const speedNorm = clamp(
    Math.abs(appCtx.boat.forwardSpeed || appCtx.boat.speed || 0) / Math.max(1, getSeaStateConfig().speedMax || 1),
    0,
    1.4
  );
  const sinA = Math.sin(angle);
  const cosA = Math.cos(angle);
  const sampleOffsets = [
    { forward: 0, side: 0, weight: 2.2, zone: 'center' },
    { forward: 4.9, side: 0, weight: 1.28, zone: 'bow' },
    { forward: 6.4, side: 0.98, weight: 0.92, zone: 'bow' },
    { forward: 6.4, side: -0.98, weight: 0.92, zone: 'bow' },
    { forward: 3.1, side: 1.78, weight: 0.94, zone: 'port' },
    { forward: 3.1, side: -1.78, weight: 0.94, zone: 'starboard' },
    { forward: 0.2, side: 1.96, weight: 0.88, zone: 'port' },
    { forward: 0.2, side: -1.96, weight: 0.88, zone: 'starboard' },
    { forward: -2.85, side: 1.58, weight: 0.82, zone: 'port' },
    { forward: -2.85, side: -1.58, weight: 0.82, zone: 'starboard' },
    { forward: -4.8, side: 0, weight: 1.14, zone: 'stern' },
    { forward: -3.45, side: 1.08, weight: 0.78, zone: 'stern' },
    { forward: -3.45, side: -1.08, weight: 0.78, zone: 'stern' }
  ];

  let weightedSurfaceY = 0;
  let totalWeight = 0;
  let bowSurface = 0;
  let bowWeight = 0;
  let sternSurface = 0;
  let sternWeight = 0;
  let portSurface = 0;
  let portWeight = 0;
  let starboardSurface = 0;
  let starboardWeight = 0;
  let maxSurfaceY = -Infinity;
  let bowPeakSurface = -Infinity;
  let sternPeakSurface = -Infinity;
  let normalX = 0;
  let normalY = 0;
  let normalZ = 0;
  let steepnessWeighted = 0;
  let centerMotion = null;

  for (let i = 0; i < sampleOffsets.length; i++) {
    const offset = sampleOffsets[i];
    const sampleX = x + sinA * offset.forward + cosA * offset.side;
    const sampleZ = z + cosA * offset.forward - sinA * offset.side;
    const sample = sampleDynamicWaterAt(sampleX, sampleZ, candidate, { time, profile });

    weightedSurfaceY += sample.surfaceY * offset.weight;
    totalWeight += offset.weight;
    if (sample.surfaceY > maxSurfaceY) maxSurfaceY = sample.surfaceY;
    if (offset.zone === 'bow' && sample.surfaceY > bowPeakSurface) bowPeakSurface = sample.surfaceY;
    if (offset.zone === 'stern' && sample.surfaceY > sternPeakSurface) sternPeakSurface = sample.surfaceY;
    const sampleNormal = surfaceNormalFromMotion(sample.motion);
    normalX += sampleNormal.x * offset.weight;
    normalY += sampleNormal.y * offset.weight;
    normalZ += sampleNormal.z * offset.weight;
    steepnessWeighted += sampleNormal.steepness * offset.weight;
    if (offset.zone === 'center') centerMotion = sample.motion;
    if (offset.zone === 'bow') {
      bowSurface += sample.surfaceY * offset.weight;
      bowWeight += offset.weight;
    } else if (offset.zone === 'stern') {
      sternSurface += sample.surfaceY * offset.weight;
      sternWeight += offset.weight;
    } else if (offset.zone === 'port') {
      portSurface += sample.surfaceY * offset.weight;
      portWeight += offset.weight;
    } else if (offset.zone === 'starboard') {
      starboardSurface += sample.surfaceY * offset.weight;
      starboardWeight += offset.weight;
    }
  }

  const averageSurfaceY = totalWeight > 0 ? weightedSurfaceY / totalWeight : waterSurfaceYAt(x, z, candidate, { time, profile });
  const bowAverage = bowWeight > 0 ? bowSurface / bowWeight : averageSurfaceY;
  const sternAverage = sternWeight > 0 ? sternSurface / sternWeight : averageSurfaceY;
  const portAverage = portWeight > 0 ? portSurface / portWeight : averageSurfaceY;
  const starboardAverage = starboardWeight > 0 ? starboardSurface / starboardWeight : averageSurfaceY;
  const normalLen = Math.hypot(normalX, normalY, normalZ) || 1;
  const blendedNormal = {
    x: normalX / normalLen,
    y: normalY / normalLen,
    z: normalZ / normalLen
  };
  const steepness = totalWeight > 0 ? steepnessWeighted / totalWeight : 0;

  const pitchDelta = bowAverage - sternAverage;
  const rollDelta = portAverage - starboardAverage;
  const waveDirectionX = Number(centerMotion?.directionX || 0);
  const waveDirectionZ = Number(centerMotion?.directionZ || 1);
  const waveAlignment = clamp(sinA * waveDirectionX + cosA * waveDirectionZ, -1, 1);
  const intoWave = clamp(-waveAlignment, 0, 1);
  const followingSea = clamp(waveAlignment, 0, 1);
  const heaveBoost = 1 + profile.breakerStrength * 0.46 + speedNorm * 0.18;
  const bowDipAssist = clamp(
    (sternAverage - bowAverage) * (0.078 + intoWave * 0.132 + profile.breakerStrength * 0.034),
    0,
    0.28
  );
  const planingTrim = clamp(speedNorm * 0.02 + intoWave * 0.038 - followingSea * 0.012, -0.026, 0.072);
  const crestBias = Math.max(0, (Number.isFinite(maxSurfaceY) ? maxSurfaceY : averageSurfaceY) - averageSurfaceY);
  const prevHeave = appCtx.boat.heave;
  let normalPitch = Math.atan2(
    -((blendedNormal.x * sinA) + (blendedNormal.z * cosA)),
    Math.max(0.42, blendedNormal.y)
  );
  let normalRoll = Math.atan2(
    -((blendedNormal.x * cosA) - (blendedNormal.z * sinA)),
    Math.max(0.42, blendedNormal.y)
  );
  if (pitchDelta * normalPitch < 0) normalPitch *= -1;
  if (rollDelta * normalRoll < 0) normalRoll *= -1;
  const samplePitch = Math.atan2(
    pitchDelta * profile.pitchScale * (1.22 + speedNorm * 0.34 + profile.breakerStrength * 0.28 + intoWave * 0.56),
    Math.max(3.4, 4.9 - intoWave * 1.0 - profile.breakerStrength * 0.64)
  );
  const sampleRoll = Math.atan2(
    rollDelta * profile.rollScale * (1.06 + profile.breakerStrength * 0.26 + steepness * 0.08),
    2.38
  );
  const targetPitch = clamp(
    samplePitch * 0.9 +
    normalPitch * (0.72 + profile.breakerStrength * 0.14 + speedNorm * 0.1) +
    bowDipAssist +
    planingTrim,
    -0.62,
    0.68
  );
  const targetRoll = clamp(
    sampleRoll * 0.82 +
    normalRoll * (0.6 + profile.breakerStrength * 0.12 + steepness * 0.05) -
    (appCtx.boat.turnRate || 0) * Math.min(0.28, 0.12 + speedNorm * 0.14),
    -0.58,
    0.58
  );
  const targetHeave =
    (averageSurfaceY - baseCenterY) * heaveBoost +
    crestBias * (0.22 + intoWave * 0.14 + profile.breakerStrength * 0.1) +
    steepness * (0.06 + profile.breakerStrength * 0.024);
  const sampledMaxSurfaceY = Number.isFinite(maxSurfaceY) ? maxSurfaceY : averageSurfaceY;
  appCtx.boatMode.waveDirectionX = waveDirectionX;
  appCtx.boatMode.waveDirectionZ = waveDirectionZ;
  appCtx.boat.surfaceSteepness = steepness;
  appCtx.boat.surfaceNormalX = blendedNormal.x;
  appCtx.boat.surfaceNormalY = blendedNormal.y;
  appCtx.boat.surfaceNormalZ = blendedNormal.z;

  if (forceSnap || !Number.isFinite(dt) || dt <= 0) {
    appCtx.boat.heave = targetHeave;
    appCtx.boat.pitch = targetPitch;
    appCtx.boat.roll = targetRoll;
    appCtx.boat.heaveVelocity = 0;
    appCtx.boat.pitchVelocity = 0;
    appCtx.boat.rollVelocity = 0;
  } else {
    const heaveSpring =
      candidate?.waterKind === 'harbor' || candidate?.waterKind === 'channel' ? 18.6 :
      candidate?.waterKind === 'lake' ? 16.8 :
      candidate?.waterKind === 'open_ocean' ? 13.4 : 15.2;
    const heaveDamping =
      candidate?.waterKind === 'open_ocean' ? 4.6 :
      candidate?.waterKind === 'lake' ? 6.2 :
      6.8;
    const pitchSpring =
      candidate?.waterKind === 'harbor' || candidate?.waterKind === 'channel' ? 14.4 :
      candidate?.waterKind === 'open_ocean' ? 13.4 + intoWave * 3.2 :
      13.5 + intoWave * 1.6;
    const pitchDamping =
      candidate?.waterKind === 'open_ocean' ? 4.1 :
      5.6;
    const rollSpring =
      candidate?.waterKind === 'harbor' || candidate?.waterKind === 'channel' ? 11.8 :
      candidate?.waterKind === 'open_ocean' ? 10.6 :
      10.8;
    const rollDamping =
      candidate?.waterKind === 'open_ocean' ? 3.4 :
      4.8;
    const nextHeave = stepBoatSpring(
      appCtx.boat.heave,
      appCtx.boat.heaveVelocity,
      targetHeave,
      dt,
      heaveSpring,
      heaveDamping,
      8.2
    );
    const nextPitch = stepBoatSpring(
      appCtx.boat.pitch,
      appCtx.boat.pitchVelocity,
      targetPitch,
      dt,
      pitchSpring,
      pitchDamping,
      2.1
    );
    const nextRoll = stepBoatSpring(
      appCtx.boat.roll,
      appCtx.boat.rollVelocity,
      targetRoll,
      dt,
      rollSpring,
      rollDamping,
      1.8
    );
    appCtx.boat.heave = nextHeave.value;
    appCtx.boat.heaveVelocity = nextHeave.velocity;
    appCtx.boat.pitch = nextPitch.value;
    appCtx.boat.pitchVelocity = nextPitch.velocity;
    appCtx.boat.roll = nextRoll.value;
    appCtx.boat.rollVelocity = nextRoll.velocity;
  }
  appCtx.boat.verticalVelocity = dt > 0 ? (appCtx.boat.heave - prevHeave) / dt : 0;
  updateBoatSurfaceEffects(profile, dt > 0 ? dt : 1 / 60, centerMotion, speedNorm, bowAverage, sternAverage);

  const buoyancyBase = 0.76 + profile.breakerStrength * 0.16;
  const hullDraft = Math.max(0.36, Number(appCtx.boatMode?.meshDraft || 0.42));
  const keelClearance = clamp(
    hullDraft * 0.56 +
    0.06 +
    profile.breakerStrength * 0.18 +
    speedNorm * 0.08 +
    steepness * 0.03,
    0.24,
    0.64
  );
  const rotationClearance = Math.abs(appCtx.boat.pitch) * 0.72 + Math.abs(appCtx.boat.roll) * 0.46;
  const bowClearance = Math.max(0, (Number.isFinite(bowPeakSurface) ? bowPeakSurface : sampledMaxSurfaceY) - sampledMaxSurfaceY) * 0.26;
  const visualFreeboard = 0.08;
  const staticWaterFloor = baseCenterY + clamp(0.14 + profile.breakerStrength * 0.08 + speedNorm * 0.04, 0.14, 0.28);
  const targetBoatY = baseCenterY + buoyancyBase + appCtx.boat.heave;
  const hullFloorY =
    Math.max(
      sampledMaxSurfaceY,
      Number.isFinite(bowPeakSurface) ? bowPeakSurface : sampledMaxSurfaceY,
      Number.isFinite(sternPeakSurface) ? sternPeakSurface : sampledMaxSurfaceY,
      staticWaterFloor
    ) +
    keelClearance +
    rotationClearance +
    bowClearance +
    visualFreeboard;
  const resolvedBoatY = Math.max(targetBoatY, hullFloorY);
  appCtx.boat.y = resolvedBoatY;
  appCtx.boatMode.surfaceEnvelope = {
    baseY: baseCenterY,
    averageY: averageSurfaceY,
    maximumY: sampledMaxSurfaceY,
    targetBoatY,
    hullFloorY,
    resolvedBoatY,
    hullDraft,
    keelClearance,
    rotationClearance,
    sampledAt: time
  };
}


function updateWaterWaveVisuals() {
  const materials = Array.isArray(appCtx.waterWaveVisuals) ? [...appCtx.waterWaveVisuals] : [];
  const patchMaterial = appCtx.boatMode?.waterPatch?.material || null;
  if (patchMaterial && !materials.includes(patchMaterial)) materials.push(patchMaterial);
  if (materials.length === 0) return false;
  const time = performance.now() * 0.001;
  const runtimeIntensity = getWaveIntensity();

  for (let i = 0; i < materials.length; i++) {
    const material = materials[i];
    const bundle = buildBoatWaveProfile(material, runtimeIntensity, time);
    if (!applyWaveUniformsToMaterial(material, bundle)) {
      if (material === patchMaterial && appCtx.boatMode?.waterPatch?.visible) material.needsUpdate = true;
      continue;
    }
    if (material === patchMaterial) updateBoatPatchWakeUniforms(bundle.profile);
  }
  return true;
}

export {
  applyBoatWavePose,
  ensureBoatWaterPatch,
  resetBoatFoamFx,
  updateBoatFoamFx,
  updateBoatWaterPatch,
  updateWaterWaveVisuals
};
