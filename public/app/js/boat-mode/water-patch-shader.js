export function customizeBoatWaterPatchShader(shader) {
  if (!shader?.uniforms || typeof THREE === 'undefined') return;
  shader.uniforms.weBoatPos = { value: new THREE.Vector2(0, 0) };
  shader.uniforms.weBoatForward = { value: new THREE.Vector2(0, 1) };
  shader.uniforms.weBoatWakeStrength = { value: 0 };
  shader.uniforms.weBoatWakeSpread = { value: 0.4 };
  shader.uniforms.weBoatBowWave = { value: 0 };
  shader.uniforms.weBoatBowSplash = { value: 0 };
  shader.uniforms.weBoatSternFoam = { value: 0 };
  shader.uniforms.weBoatWaveSeverity = { value: 0 };

  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
uniform vec2 weBoatPos;
uniform vec2 weBoatForward;
uniform float weBoatWakeStrength;
uniform float weBoatWakeSpread;
uniform float weBoatBowWave;
uniform float weBoatBowSplash;
uniform float weBoatSternFoam;
uniform float weBoatWaveSeverity;

vec2 weBoatToLocal(vec2 worldXZ) {
  vec2 delta = worldXZ - weBoatPos;
  vec2 boatRight = vec2(weBoatForward.y, -weBoatForward.x);
  return vec2(dot(delta, boatRight), dot(delta, weBoatForward));
}
float weBoatWakeFoamMask(vec2 worldXZ) {
  vec2 local = weBoatToLocal(worldXZ);
  float sternDistance = max(0.0, -local.y);
  float spread = 0.58 + sternDistance * (0.12 + weBoatWakeSpread * 0.12);
  float wakeWidth = 0.52 + sternDistance * 0.018;
  float kelvin = exp(-pow((abs(local.x) - spread) / wakeWidth, 2.0));
  float sternCore = exp(-pow(local.x / (0.86 + sternDistance * 0.07), 2.0));
  float decay = exp(-sternDistance * 0.046);
  return smoothstep(0.0, 1.0, sternDistance) * decay * max(kelvin, sternCore * 0.72);
}

float weBoatBowFoamMask(vec2 worldXZ) {
  vec2 local = weBoatToLocal(worldXZ);
  float bowDistance = max(0.0, local.y);
  float bowWidth = max(0.82, 0.38 + bowDistance * 0.16);
  float cone = exp(-pow(local.x / bowWidth, 2.0));
  float bowFront = smoothstep(0.0, 2.6, bowDistance) * (1.0 - smoothstep(5.6, 10.0, bowDistance));
  return cone * bowFront;
}

float weBoatWakeDisplacement(vec2 worldXZ) {
  vec2 local = weBoatToLocal(worldXZ);
  float sternDistance = max(0.0, -local.y);
  float spread = 0.44 + sternDistance * (0.14 + weBoatWakeSpread * 0.1);
  float wakeWidth = 0.6 + sternDistance * 0.02;
  float wakeBands = exp(-pow((abs(local.x) - spread) / wakeWidth, 2.0));
  float sternCore = exp(-pow(local.x / (0.92 + sternDistance * 0.06), 2.0));
  float wakeTrail = smoothstep(0.0, 1.0, sternDistance) * exp(-sternDistance * 0.045) * (wakeBands * 0.76 - sternCore * 0.22);
  float bowDistance = max(0.0, local.y);
  float bowWidth = max(0.9, 0.36 + bowDistance * 0.18);
  float bowPush = exp(-pow(local.x / bowWidth, 2.0)) * smoothstep(0.0, 2.2, bowDistance) * (1.0 - smoothstep(5.4, 9.2, bowDistance));
  return wakeTrail * (0.12 + weBoatWakeStrength * 0.42) + bowPush * (0.04 + weBoatBowWave * 0.18 + weBoatBowSplash * 0.08);
}`
    )
    .replace(
      'transformed.y += weWaveField(weWorldPos.xz);',
      `float weBoatWakeDisplace = weBoatWakeDisplacement(weWorldPos.xz);
transformed.y += weWaveField(weWorldPos.xz) + weBoatWakeDisplace;`
    );

  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
uniform vec2 weBoatPos;
uniform vec2 weBoatForward;
uniform float weBoatWakeStrength;
uniform float weBoatWakeSpread;
uniform float weBoatBowWave;
uniform float weBoatBowSplash;
uniform float weBoatSternFoam;
uniform float weBoatWaveSeverity;

vec2 weBoatToLocal(vec2 worldXZ) {
  vec2 delta = worldXZ - weBoatPos;
  vec2 boatRight = vec2(weBoatForward.y, -weBoatForward.x);
  return vec2(dot(delta, boatRight), dot(delta, weBoatForward));
}

float weBoatWakeFoamMask(vec2 worldXZ) {
  vec2 local = weBoatToLocal(worldXZ);
  float sternDistance = max(0.0, -local.y);
  float spread = 0.58 + sternDistance * (0.12 + weBoatWakeSpread * 0.12);
  float wakeWidth = 0.52 + sternDistance * 0.018;
  float kelvin = exp(-pow((abs(local.x) - spread) / wakeWidth, 2.0));
  float sternCore = exp(-pow(local.x / (0.86 + sternDistance * 0.07), 2.0));
  float decay = exp(-sternDistance * 0.046);
  return smoothstep(0.0, 1.0, sternDistance) * decay * max(kelvin, sternCore * 0.72);
}

float weBoatBowFoamMask(vec2 worldXZ) {
  vec2 local = weBoatToLocal(worldXZ);
  float bowDistance = max(0.0, local.y);
  float bowWidth = max(0.82, 0.38 + bowDistance * 0.16);
  float cone = exp(-pow(local.x / bowWidth, 2.0));
  float bowFront = smoothstep(0.0, 2.6, bowDistance) * (1.0 - smoothstep(5.6, 10.0, bowDistance));
  return cone * bowFront;
}`
    )
    .replace(
      'float weFoamBands = smoothstep(0.46, 0.96, weWaveCrestValue) * clamp(weWaveFoamStrength, 0.0, 1.5);',
      `float weFoamBands = smoothstep(0.44, 0.98, weWaveCrestValue) * clamp(weWaveFoamStrength, 0.0, 1.8);
float weWhitecaps = smoothstep(0.74, 1.36, weWaveCrestValue + weBoatWaveSeverity * 0.18) * clamp(weWaveFoamStrength * 0.72 + weBoatWaveSeverity * 0.66, 0.0, 2.2);
float weBoatWakeFoam = weBoatWakeFoamMask(vWeWaveWorldXZ) * (0.28 + weBoatWakeStrength * 1.24 + weBoatSternFoam * 0.46);
float weBoatBowFoam = weBoatBowFoamMask(vWeWaveWorldXZ) * (0.22 + weBoatBowWave * 0.92 + weBoatBowSplash * 0.76);
float weBoatFoam = clamp(weBoatWakeFoam + weBoatBowFoam, 0.0, 2.8);`
    )
    .replace(
      'diffuseColor.rgb += vec3(0.08, 0.11, 0.13) * weFoamBands * 0.58;',
      `diffuseColor.rgb += vec3(0.04, 0.06, 0.08) * (weFoamBands * 0.32 + weWhitecaps * 0.38 + weBoatFoam * 0.42);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.84, 0.9), clamp(weWhitecaps * 0.1 + weBoatFoam * 0.12, 0.0, 0.24));`
    )
    .replace(
      'totalEmissiveRadiance += vec3(0.048, 0.074, 0.098) * weFoamBands * (weWaveVisualStrength * 0.74);',
      `totalEmissiveRadiance += vec3(0.048, 0.074, 0.098) * (weFoamBands * (weWaveVisualStrength * 0.74) + weWhitecaps * 0.22 + weBoatFoam * 0.28);`
    )
    .replace(
      `if (weWaveEdgeFade > 0.0) {
  float weEdge = min(min(vWePatchUv.x, 1.0 - vWePatchUv.x), min(vWePatchUv.y, 1.0 - vWePatchUv.y));
  float wePatchMask = smoothstep(0.0, weWaveEdgeFade, weEdge);
  diffuseColor.a *= wePatchMask;
}`,
      `if (weWaveEdgeFade > 0.0) {
  vec2 wePatchCenteredUv = vWePatchUv - vec2(0.5);
  float wePatchRadius = length(wePatchCenteredUv) * 1.41421356;
  float wePatchNoise = sin(vWeWaveWorldXZ.x * 0.008 + weWaveTime * 0.08) * sin(vWeWaveWorldXZ.y * 0.009 - weWaveTime * 0.06);
  float wePatchInner = max(0.0, 1.0 - weWaveEdgeFade * (2.1 + wePatchNoise * 0.32));
  float wePatchOuter = 1.0 + wePatchNoise * 0.035;
  float wePatchMask = 1.0 - smoothstep(wePatchInner, wePatchOuter, wePatchRadius);
  diffuseColor.a *= clamp(wePatchMask, 0.0, 1.0);
}`
    );
}
