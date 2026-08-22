import { ctx as appCtx } from "../shared-context.js?v=55";
import {
  buildWaterShaderLibrary,
  inferWaterRenderContext,
  MAX_SAFE_WATER_TROUGH_DEPTH
} from "../water-dynamics.js?v=9";
import { normalizeDepthEvidence } from '../geospatial/bathymetry-evidence.js?v=1';

const WATER_OPTICS_SCHEMA_VERSION = 1;

function waterOpticsQualityStrength() {
  const quality = String(appCtx.renderQualityLevel || 'medium').toLowerCase();
  if (quality === 'low') return 0.42;
  if (quality === 'high') return 1;
  return 0.72;
}

function getWaterOpticsSnapshot() {
  const materials = Array.isArray(appCtx.waterWaveVisuals) ? appCtx.waterWaveVisuals.filter(Boolean) : [];
  const truthCounts = materials.reduce((counts, material) => {
    const truth = material.userData?.weWaterWaveConfig?.depthEvidence?.truthType || 'unknown';
    counts[truth] = (counts[truth] || 0) + 1;
    return counts;
  }, {});
  return Object.freeze({
    schemaVersion: WATER_OPTICS_SCHEMA_VERSION,
    authority: 'water-wave-material-registry',
    materialCount: materials.length,
    shaderCount: materials.filter((material) => !!material.userData?.weWaterWaveShader).length,
    renderTargetCount: 0,
    animationLoopCount: 0,
    depthTruthCounts: Object.freeze(truthCounts),
    numericUnknownDepthCount: materials.filter((material) => {
      const evidence = material.userData?.weWaterWaveConfig?.depthEvidence;
      return evidence?.truthType === 'unknown' && evidence?.depthMeters !== null;
    }).length,
    waveEvidence: Object.freeze({
      truthType: appCtx.activeWaterOpticsEvidence?.wave?.truthType || 'unknown',
      sourceId: appCtx.activeWaterOpticsEvidence?.wave?.sourceId || 'none',
      renderUsable: appCtx.activeWaterOpticsEvidence?.wave?.renderUsable === true,
      gridDistanceKm: appCtx.activeWaterOpticsEvidence?.wave?.gridDistanceKm ?? null
    }),
    maximumTroughDepth: MAX_SAFE_WATER_TROUGH_DEPTH
  });
}

export function registerWaterWaveMaterial(material, options = {}) {
  if (!material || material.userData?.weWaterWavePatched || typeof THREE === 'undefined') return material;
  const waveScale = Number.isFinite(options.waveScale) ? options.waveScale : 1;
  const waveBase = Number.isFinite(options.waveBase) ? options.waveBase : 1;
  const visualBase = Number.isFinite(options.visualBase) ? options.visualBase : 1;
  const foamBase = Number.isFinite(options.foamBase) ? options.foamBase : 1;
  const edgeFade = Number.isFinite(options.edgeFade) ? options.edgeFade : 0;
  const shaderKey = String(options.shaderKey || 'base');
  const shaderHook = typeof options.shaderHook === 'function' ? options.shaderHook : null;
  const waterKind = inferWaterRenderContext({
    kindHint: options.waterKind,
    area: options.area,
    span: options.span,
    width: options.width
  });
  const depthEvidence = normalizeDepthEvidence(options.depthEvidence);
  const shaderLibrary = buildWaterShaderLibrary();
  material.userData.weWaterWavePatched = true;
  material.userData.weWaterWaveConfig = {
    waveScale,
    waveBase,
    visualBase,
    foamBase,
    edgeFade,
    waterKind,
    depthEvidence,
    opticalProfile: depthEvidence.truthType === 'unknown'
      ? `${waterKind}-unknown-depth`
      : `${waterKind}-${depthEvidence.truthType}-depth`,
    numericDepthUsed: depthEvidence.truthType !== 'unknown' && depthEvidence.depthMeters !== null,
    energyBase: Number.isFinite(options.energyBase) ? options.energyBase : 1,
    shorelineDistance: Number.isFinite(options.shorelineDistance) ? options.shorelineDistance : null,
    localPatch: options.localPatch === true,
    useRuntimeKind: options.useRuntimeKind === true
  };

  const previousOnBeforeCompile = material.onBeforeCompile;
  material.customProgramCacheKey = () =>
    `we3d-water-optics-v2-${waveScale.toFixed(3)}-${waveBase.toFixed(3)}-${edgeFade.toFixed(3)}-${waterKind}-${shaderKey}`;
  if (typeof material.emissiveIntensity === 'number') material.emissiveIntensity = Math.min(material.emissiveIntensity, 0.035);
  if (typeof material.roughness === 'number') {
    const maximumRoughness = waterKind === 'open_ocean' ? 0.27 : waterKind === 'coastal' ? 0.29 : 0.31;
    material.roughness = Math.min(material.roughness, maximumRoughness);
  }
  if (typeof material.metalness === 'number') material.metalness = 0;
  if (typeof material.envMapIntensity === 'number') {
    material.envMapIntensity = Math.min(0.68, Math.max(material.envMapIntensity, 0.5));
  }
  material.onBeforeCompile = (shader, renderer) => {
    if (typeof previousOnBeforeCompile === 'function') previousOnBeforeCompile(shader, renderer);
    shader.uniforms.weWaveTime = { value: 0 };
    shader.uniforms.weWaveAmplitude = { value: 0 };
    shader.uniforms.weWaveSecondaryAmplitude = { value: 0 };
    shader.uniforms.weWaveSwellAmplitude = { value: 0 };
    shader.uniforms.weWaveRippleAmplitude = { value: 0 };
    shader.uniforms.weWaveScale = { value: waveScale };
    shader.uniforms.weWaveSpeed = { value: 0.52 };
    shader.uniforms.weWaveVisualStrength = { value: 0.16 * visualBase };
    shader.uniforms.weWaveFoamStrength = { value: 0.08 * foamBase };
    shader.uniforms.weWaveEdgeFade = { value: edgeFade };
    shader.uniforms.weWaveTroughDepth = { value: MAX_SAFE_WATER_TROUGH_DEPTH };
    shader.uniforms.weWaterNormalStrength = { value: waterOpticsQualityStrength() };
    shader.uniforms.weWaterZenithColor = { value: new THREE.Color(appCtx.earthAtmosphereProfile?.zenithColor ?? 0x397fc2) };
    shader.uniforms.weWaterHorizonColor = { value: new THREE.Color(appCtx.earthAtmosphereProfile?.horizonColor ?? 0xd9edf6) };
    shader.uniforms.weWaterSunColor = { value: new THREE.Color(appCtx.earthAtmosphereProfile?.sunColor ?? 0xfff5e1) };
    shader.uniforms.weWaterSunDirection = { value: new THREE.Vector3(
      appCtx.earthAtmosphereProfile?.sunDirection?.x ?? 0.42,
      appCtx.earthAtmosphereProfile?.sunDirection?.y ?? 0.82,
      appCtx.earthAtmosphereProfile?.sunDirection?.z ?? 0.39
    ) };
    shader.uniforms.weWaterDaylight = { value: appCtx.earthAtmosphereProfile?.daylight ?? 1 };
    shader.uniforms.weWaterNight = { value: appCtx.earthAtmosphereProfile?.night ?? 0 };
    shader.uniforms.weWaterOvercast = { value: appCtx.earthAtmosphereProfile?.overcast ?? 0 };
    material.userData.weWaterWaveShader = shader;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${shaderLibrary}`)
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3(position);
vec4 weWorldPos = modelMatrix * vec4(transformed, 1.0);
vWeWaveWorldXZ = weWorldPos.xz;
vWeWaveWorldPosition = weWorldPos.xyz;
#ifdef USE_UV
vWePatchUv = uv;
#else
vWePatchUv = vec2(0.5);
#endif
transformed.y += weWaveField(weWorldPos.xz);`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${shaderLibrary}`)
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
vec3 weAnalyticWaterNormalView = normalize(mat3(viewMatrix) * weWaveWorldNormal(vWeWaveWorldXZ, weWaterNormalStrength));
normal = normalize(mix(normal, weAnalyticWaterNormalView, clamp(weWaterNormalStrength, 0.0, 1.0)));`
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec4 diffuseColor = vec4( diffuse, opacity );
float weWaveHeight = weWaveField(vWeWaveWorldXZ);
float weWaveCrestValue = weWaveCrest(vWeWaveWorldXZ);
vec3 weOpticalNormal = weWaveWorldNormal(vWeWaveWorldXZ, weWaterNormalStrength);
vec3 weViewDirection = normalize(cameraPosition - vWeWaveWorldPosition);
float weViewFacing = clamp(dot(weOpticalNormal, weViewDirection), 0.0, 1.0);
float weFresnel = 0.02 + 0.98 * pow(1.0 - weViewFacing, 5.0);
vec3 weReflectedDirection = reflect(-weViewDirection, weOpticalNormal);
vec3 weReflectedSky = mix(weWaterHorizonColor, weWaterZenithColor, smoothstep(-0.06, 0.72, weReflectedDirection.y));
weReflectedSky *= mix(vec3(0.58, 0.72, 0.8), vec3(0.72, 0.84, 0.92), smoothstep(-0.02, 0.72, weReflectedDirection.y));
weReflectedSky = mix(weReflectedSky, diffuseColor.rgb, 0.38 + weWaterOvercast * 0.08);
float weSunAlignment = max(0.0, dot(reflect(-normalize(weWaterSunDirection), weOpticalNormal), weViewDirection));
float weSunGlitter = pow(weSunAlignment, mix(170.0, 54.0, weWaterOvercast)) * weWaterDaylight * (1.0 - weWaterOvercast * 0.82);
float weWaveGlint = clamp(0.36 + weWaveHeight * 0.16 + weWaveCrestValue * 0.12 + weFresnel * 0.42, 0.0, 1.0);
float weFoamBands = smoothstep(0.42, 0.94, weWaveCrestValue) * clamp(weWaveFoamStrength, 0.0, 1.8);
float weWhitecapBands = smoothstep(0.72, 1.28, weWaveCrestValue) * clamp(weWaveFoamStrength * 0.62, 0.0, 1.4);
float weSurfaceGrain = 0.5 + 0.5 * sin(vWeWaveWorldXZ.x * 0.085 + weWaveTime * 1.24) * sin(vWeWaveWorldXZ.y * 0.073 - weWaveTime * 1.08);
float weSkyResponse = clamp((0.06 + weFresnel * 0.34) * (1.0 - weWaterOvercast * 0.18), 0.0, 0.4);
diffuseColor.rgb *= mix(0.58, 0.9, smoothstep(0.02, 0.82, weFresnel));
diffuseColor.rgb = mix(diffuseColor.rgb, weReflectedSky, weSkyResponse);
diffuseColor.rgb *= mix(vec3(0.92), vec3(1.025), weSurfaceGrain * clamp(weWaveVisualStrength * 0.16, 0.0, 0.12));
diffuseColor.rgb += weWaterSunColor * weSunGlitter * 0.28;
diffuseColor.rgb += vec3(0.045, 0.062, 0.078) * (weFoamBands * 0.4 + weWhitecapBands * 0.46);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.93, 0.98), clamp(weWhitecapBands * 0.18, 0.0, 0.22));
diffuseColor.rgb *= mix(1.0, 0.58, clamp(weWaterNight, 0.0, 1.0));
if (weWaveEdgeFade > 0.0) {
  float weEdge = min(min(vWePatchUv.x, 1.0 - vWePatchUv.x), min(vWePatchUv.y, 1.0 - vWePatchUv.y));
  float wePatchMask = smoothstep(0.0, weWaveEdgeFade, weEdge);
  diffuseColor.a *= wePatchMask;
}`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(0.018, 0.026, 0.034) * (weFoamBands * 0.22 + weWhitecapBands * 0.16) * weWaterDaylight;`
      );
    if (shaderHook) shaderHook(shader, { material, waterKind });
  };

  if (Array.isArray(appCtx.waterWaveVisuals)) appCtx.waterWaveVisuals.push(material);
  else appCtx.replaceWorldCollection('waterWaveVisuals', [material]);
  material.needsUpdate = true;
  return material;
}

Object.assign(appCtx, { getWaterOpticsSnapshot });

export { getWaterOpticsSnapshot, WATER_OPTICS_SCHEMA_VERSION };
