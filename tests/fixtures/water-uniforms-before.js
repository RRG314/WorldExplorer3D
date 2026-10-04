// Recorded cc0b1371 behavior, retained as an independent numerical regression oracle.
export function beforeWaterUniforms(material, profileBundle, appCtx) {
  const shader = material?.userData?.weWaterWaveShader;
  if (!shader?.uniforms) return false;
  const { config, profile, time } = profileBundle;
  shader.uniforms.weWaveTime.value = time;
  const body = config.localPatch ? appCtx.boatMode?.currentWater?.source : config.waterBody;
  shader.uniforms.weWaveOrigin?.value?.set?.(Number(body?.waveOffset?.x)||0,Number(body?.waveOffset?.z)||0);
  shader.uniforms.weWaveSpeed.value = profile.speed;
  if (shader.uniforms.weWaveScale) shader.uniforms.weWaveScale.value = profile.spatialScale;
  shader.uniforms.weWaveAmplitude.value = profile.primaryAmplitude;
  if (shader.uniforms.weWaveSecondaryAmplitude) {
    shader.uniforms.weWaveSecondaryAmplitude.value = profile.secondaryAmplitude;
  }
  if (shader.uniforms.weWaveSwellAmplitude) {
    shader.uniforms.weWaveSwellAmplitude.value = profile.swellAmplitude;
  }
  if (shader.uniforms.weWaveRippleAmplitude) {
    shader.uniforms.weWaveRippleAmplitude.value = profile.rippleAmplitude;
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
