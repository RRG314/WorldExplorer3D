import { ctx as appCtx } from "../shared-context.js?v=55";
import {
  buildWaterShaderLibrary,
  inferWaterRenderContext
} from "../water-dynamics.js?v=3";

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
  const shaderLibrary = buildWaterShaderLibrary();
  material.userData.weWaterWavePatched = true;
  material.userData.weWaterWaveConfig = {
    waveScale,
    waveBase,
    visualBase,
    foamBase,
    edgeFade,
    waterKind,
    energyBase: Number.isFinite(options.energyBase) ? options.energyBase : 1,
    shorelineDistance: Number.isFinite(options.shorelineDistance) ? options.shorelineDistance : null,
    localPatch: options.localPatch === true,
    useRuntimeKind: options.useRuntimeKind === true
  };

  const previousOnBeforeCompile = material.onBeforeCompile;
  material.customProgramCacheKey = () =>
    `we3d-water-wave-${waveScale.toFixed(3)}-${waveBase.toFixed(3)}-${edgeFade.toFixed(3)}-${waterKind}-${shaderKey}`;
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
    material.userData.weWaterWaveShader = shader;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${shaderLibrary}`)
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3(position);
vec4 weWorldPos = modelMatrix * vec4(transformed, 1.0);
vWeWaveWorldXZ = weWorldPos.xz;
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
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec4 diffuseColor = vec4( diffuse, opacity );
float weWaveHeight = weWaveField(vWeWaveWorldXZ);
float weWaveCrestValue = weWaveCrest(vWeWaveWorldXZ);
float weWaveGlint = clamp(0.44 + weWaveHeight * 0.22 + weWaveCrestValue * 0.14, 0.0, 1.0);
float weFoamBands = smoothstep(0.42, 0.94, weWaveCrestValue) * clamp(weWaveFoamStrength, 0.0, 1.8);
float weWhitecapBands = smoothstep(0.72, 1.28, weWaveCrestValue) * clamp(weWaveFoamStrength * 0.62, 0.0, 1.4);
float weSurfaceGrain = 0.5 + 0.5 * sin(vWeWaveWorldXZ.x * 0.085 + weWaveTime * 1.24) * sin(vWeWaveWorldXZ.y * 0.073 - weWaveTime * 1.08);
vec3 weWaveTint = mix(vec3(0.72, 0.79, 0.88), vec3(0.92, 0.98, 1.04), weWaveGlint);
diffuseColor.rgb *= mix(vec3(0.9), weWaveTint, clamp(weWaveVisualStrength * 0.64, 0.0, 1.0));
diffuseColor.rgb *= mix(vec3(0.97), vec3(1.03), weSurfaceGrain * clamp(weWaveVisualStrength * 0.18, 0.0, 0.14));
diffuseColor.rgb += vec3(0.05, 0.07, 0.09) * (weFoamBands * 0.44 + weWhitecapBands * 0.5);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.93, 0.98), clamp(weWhitecapBands * 0.18, 0.0, 0.22));
if (weWaveEdgeFade > 0.0) {
  float weEdge = min(min(vWePatchUv.x, 1.0 - vWePatchUv.x), min(vWePatchUv.y, 1.0 - vWePatchUv.y));
  float wePatchMask = smoothstep(0.0, weWaveEdgeFade, weEdge);
  diffuseColor.a *= wePatchMask;
}`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(0.024, 0.038, 0.054) * max(0.0, weWaveGlint - 0.5) * (weWaveVisualStrength * 1.4);
totalEmissiveRadiance += vec3(0.036, 0.052, 0.072) * (weFoamBands * 0.44 + weWhitecapBands * 0.28) * (weWaveVisualStrength * 0.52);`
      );
    if (shaderHook) shaderHook(shader, { material, waterKind });
  };

  if (Array.isArray(appCtx.waterWaveVisuals)) appCtx.waterWaveVisuals.push(material);
  else appCtx.waterWaveVisuals = [material];
  material.needsUpdate = true;
  return material;
}
