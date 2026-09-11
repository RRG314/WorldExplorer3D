const EARTH_ATMOSPHERE_SCHEMA_VERSION = 1;

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function colorComponents(hex = 0) {
  const value = Number(hex) >>> 0;
  return {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255
  };
}

function componentsHex(color) {
  const channel = (value) => Math.max(0, Math.min(255, Math.round(clamp01(value) * 255)));
  return (channel(color.r) << 16) | (channel(color.g) << 8) | channel(color.b);
}

function mixHex(a, b, amount) {
  const left = colorComponents(a);
  const right = colorComponents(b);
  const t = clamp01(amount);
  return componentsHex({
    r: left.r + (right.r - left.r) * t,
    g: left.g + (right.g - left.g) * t,
    b: left.b + (right.b - left.b) * t
  });
}

function fallbackSunDirection(phase = 'day') {
  if (phase === 'sunrise') return { x: -0.72, y: 0.16, z: -0.68 };
  if (phase === 'sunset') return { x: 0.78, y: 0.12, z: -0.61 };
  if (phase === 'night') return { x: -0.35, y: -0.72, z: 0.6 };
  return { x: 0.42, y: 0.82, z: 0.39 };
}

function normalizedDirection(input, fallback) {
  const x = Number(input?.x);
  const y = Number(input?.y);
  const z = Number(input?.z);
  const candidate = Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
    ? { x, y, z }
    : fallback;
  const length = Math.hypot(candidate.x, candidate.y, candidate.z) || 1;
  return { x: candidate.x / length, y: candidate.y / length, z: candidate.z / length };
}

function weatherOptics(weatherState = null, weatherMode = 'live') {
  const category = String(weatherState?.category || weatherMode || 'clear').toLowerCase();
  const cloudCover = clamp01((Number(weatherState?.cloudCover) || 0) / 100);
  const precipitation = clamp01((Number(weatherState?.precipitationMm) || 0) / 3);
  const categoryHaze =
    category === 'fog' ? 1 :
    category === 'storm' ? 0.76 :
    category === 'rain' || category === 'snow' ? 0.62 :
    category === 'overcast' ? 0.48 :
    category === 'cloudy' ? 0.24 : 0;
  return {
    category,
    cloudCover,
    precipitation,
    haze: clamp01(Math.max(categoryHaze, cloudCover * 0.44 + precipitation * 0.24)),
    overcast: clamp01(Math.max(cloudCover * 0.86, category === 'overcast' ? 0.84 : 0, category === 'storm' ? 0.92 : 0))
  };
}

function buildEarthAtmosphereProfile(skyState = null, weatherState = null, options = {}) {
  const visual = skyState?.visual || options.visual || {};
  const phase = String(skyState?.phase || options.phase || 'day').toLowerCase();
  const weather = weatherOptics(weatherState, options.weatherMode || 'live');
  const daylight = clamp01(skyState?.sun?.daylightFactor ?? (phase === 'day' ? 1 : phase === 'night' ? 0 : 0.38));
  const twilight = clamp01(skyState?.sun?.twilightFactor ?? (phase === 'sunrise' || phase === 'sunset' ? 1 : 0));
  const night = clamp01(1 - daylight - twilight * 0.28);
  const baseSky = Number(visual.skyColor ?? options.backgroundHex ?? 0x87ceeb);
  const fog = Number(visual.fogColor ?? baseSky);
  const ground = Number(visual.groundColor ?? 0x545454);
  const sunColor = Number(visual.sunColor ?? 0xfff5e1);
  const overcastColor = weather.category === 'storm' ? 0x66758a : 0xaebdcb;
  const nightZenith = 0x071126;
  const nightHorizon = 0x172545;
  const daylightZenith = mixHex(baseSky, 0x397fc2, 0.32 * daylight);
  const daylightHorizon = mixHex(fog, 0xe8f2f7, 0.34 * daylight);
  const zenithColor = mixHex(
    mixHex(daylightZenith, nightZenith, night),
    overcastColor,
    weather.overcast * 0.58 + weather.haze * 0.12
  );
  const horizonColor = mixHex(
    mixHex(daylightHorizon, nightHorizon, night),
    overcastColor,
    weather.overcast * 0.72 + weather.haze * 0.24
  );
  const lowerColor = mixHex(
    mixHex(ground, fog, 0.52 + daylight * 0.18),
    overcastColor,
    weather.overcast * 0.62
  );
  const sunDirection = normalizedDirection(
    skyState?.sun?.direction,
    fallbackSunDirection(phase)
  );
  const signature = [
    phase,
    zenithColor,
    horizonColor,
    lowerColor,
    sunColor,
    Math.round(sunDirection.x * 100),
    Math.round(sunDirection.y * 100),
    Math.round(sunDirection.z * 100),
    Math.round(daylight * 20),
    Math.round(twilight * 20),
    Math.round(weather.cloudCover * 10),
    Math.round(weather.haze * 10),
    Math.round(weather.precipitation * 10)
  ].join(':');

  return Object.freeze({
    schemaVersion: EARTH_ATMOSPHERE_SCHEMA_VERSION,
    authority: 'astronomical-sky-visual',
    phase,
    zenithColor,
    horizonColor,
    lowerColor,
    sunColor,
    sunDirection: Object.freeze(sunDirection),
    daylight,
    twilight,
    night,
    cloudCover: weather.cloudCover,
    haze: weather.haze,
    overcast: weather.overcast,
    precipitation: weather.precipitation,
    signature
  });
}

function createAtmosphereMaterial(profile, options = {}) {
  if (typeof THREE === 'undefined') return null;
  const material = new THREE.ShaderMaterial({
    name: options.name || 'WorldExplorerEarthAtmosphere',
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: true,
    uniforms: {
      weSkyZenith: { value: new THREE.Color(profile.zenithColor) },
      weSkyHorizon: { value: new THREE.Color(profile.horizonColor) },
      weSkyLower: { value: new THREE.Color(profile.lowerColor) },
      weSkySunColor: { value: new THREE.Color(profile.sunColor) },
      weSkySunDirection: { value: new THREE.Vector3(profile.sunDirection.x, profile.sunDirection.y, profile.sunDirection.z) },
      weSkyDaylight: { value: profile.daylight },
      weSkyTwilight: { value: profile.twilight },
      weSkyHaze: { value: profile.haze },
      weSkyOvercast: { value: profile.overcast }
    },
    vertexShader: `
varying vec3 vWeSkyWorldDirection;
void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWeSkyWorldDirection = worldPosition.xyz - cameraPosition;
  vec4 clipPosition = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = clipPosition.xyww;
}`,
    fragmentShader: `
uniform vec3 weSkyZenith;
uniform vec3 weSkyHorizon;
uniform vec3 weSkyLower;
uniform vec3 weSkySunColor;
uniform vec3 weSkySunDirection;
uniform float weSkyDaylight;
uniform float weSkyTwilight;
uniform float weSkyHaze;
uniform float weSkyOvercast;
varying vec3 vWeSkyWorldDirection;

void main() {
  vec3 direction = normalize(vWeSkyWorldDirection);
  float elevation = clamp(direction.y, -0.22, 1.0);
  float upperBlend = smoothstep(-0.04, 0.78, elevation);
  vec3 skyColor = mix(weSkyHorizon, weSkyZenith, pow(upperBlend, 0.72));
  float belowHorizon = smoothstep(0.02, -0.2, elevation);
  skyColor = mix(skyColor, weSkyLower, belowHorizon);

  float horizonBand = exp(-pow(abs(elevation) * mix(4.2, 2.4, weSkyHaze), 1.35));
  skyColor = mix(skyColor, weSkyHorizon, horizonBand * (0.18 + weSkyHaze * 0.42));

  float sunAlignment = max(0.0, dot(direction, normalize(weSkySunDirection)));
  float sunDisc = smoothstep(0.99972, 0.99993, sunAlignment);
  float sunGlow = pow(sunAlignment, mix(180.0, 28.0, clamp(weSkyHaze + weSkyOvercast * 0.36, 0.0, 1.0)));
  float sunVisibility = clamp(weSkyDaylight + weSkyTwilight * 0.92, 0.0, 1.0) * (1.0 - weSkyOvercast * 0.82);
  skyColor += weSkySunColor * (sunDisc * 2.1 + sunGlow * (0.24 + weSkyTwilight * 0.42)) * sunVisibility;

  float overcastFlatten = weSkyOvercast * (0.16 + horizonBand * 0.12);
  skyColor = mix(skyColor, mix(weSkyHorizon, weSkyZenith, 0.38), overcastFlatten);
  gl_FragColor = vec4(max(skyColor, vec3(0.0)), 1.0);
  #include <tonemapping_fragment>
  #include <encodings_fragment>
}`
  });
  material.userData.earthAtmosphereMaterial = true;
  material.userData.authority = 'astronomical-sky-visual';
  return material;
}

function applyEarthAtmosphereProfile(target, profile) {
  const material = target?.material?.userData?.earthAtmosphereMaterial ? target.material : target;
  const uniforms = material?.uniforms;
  if (!uniforms || !profile) return false;
  uniforms.weSkyZenith.value.setHex(profile.zenithColor);
  uniforms.weSkyHorizon.value.setHex(profile.horizonColor);
  uniforms.weSkyLower.value.setHex(profile.lowerColor);
  uniforms.weSkySunColor.value.setHex(profile.sunColor);
  uniforms.weSkySunDirection.value.set(profile.sunDirection.x, profile.sunDirection.y, profile.sunDirection.z);
  uniforms.weSkyDaylight.value = profile.daylight;
  uniforms.weSkyTwilight.value = profile.twilight;
  uniforms.weSkyHaze.value = profile.haze;
  uniforms.weSkyOvercast.value = profile.overcast;
  material.userData.earthAtmosphereSignature = profile.signature;
  return true;
}

function createEarthAtmosphereVisual(profile) {
  if (typeof THREE === 'undefined') return null;
  const material = createAtmosphereMaterial(profile);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.name = 'EarthAtmosphereVisual';
  mesh.scale.setScalar(450000);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10000;
  mesh.userData.earthAtmosphereVisual = true;
  mesh.userData.environmentOwner = 'EARTH';
  return mesh;
}

function atmosphereSnapshot(mesh, profile = null) {
  return Object.freeze({
    schemaVersion: EARTH_ATMOSPHERE_SCHEMA_VERSION,
    authority: 'astronomical-sky-visual',
    meshCount: mesh?.userData?.earthAtmosphereVisual === true ? 1 : 0,
    attached: !!mesh?.parent,
    visible: mesh?.visible === true,
    signature: profile?.signature || mesh?.material?.userData?.earthAtmosphereSignature || null,
    phase: profile?.phase || null
  });
}

export {
  EARTH_ATMOSPHERE_SCHEMA_VERSION,
  applyEarthAtmosphereProfile,
  atmosphereSnapshot,
  buildEarthAtmosphereProfile,
  createAtmosphereMaterial,
  createEarthAtmosphereVisual,
  mixHex
};
