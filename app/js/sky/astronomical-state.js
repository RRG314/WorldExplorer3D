import { ctx as appCtx } from "../shared-context.js?v=55";
import {
  clamp01,
  getMoonIllumination,
  getMoonPosition,
  getSunPosition,
  normalizeAngle,
  radToDeg,
  siderealTime,
  smoothstep,
  toDays
} from "../astro.js?v=1";
import { resolveObservedEarthLocation } from "../earth-location.js?v=2";
import {
  applyEarthAtmosphereProfile,
  atmosphereSnapshot,
  buildEarthAtmosphereProfile
} from './earth-atmosphere.js?v=1';

const SKY_UPDATE_INTERVAL_MS = 15000;
const SKY_LOCATION_PRECISION = 3;
const SKY_MODE_SEQUENCE = ["live", "day", "sunset", "night", "sunrise"];
const SKY_PRESETS = {
  day: {
    skyColor: 0x87ceeb,
    groundColor: 0x545454,
    hemiIntensity: 0.7,
    sunColor: 0xfff5e1,
    sunIntensity: 1.3,
    fillColor: 0x9db4ff,
    fillIntensity: 0.42,
    ambientColor: 0xffffff,
    ambientIntensity: 0.52,
    fogColor: 0xb8d4e8,
    fogDensity: 0.00035,
    exposure: 1.08,
    bloomStrength: 0.1,
    icon: "\u2600\ufe0f"
  },
  sunset: {
    skyColor: 0xff7e5f,
    groundColor: 0x3d2817,
    hemiIntensity: 0.68,
    sunColor: 0xff6b35,
    sunIntensity: 0.9,
    fillColor: 0xff8c69,
    fillIntensity: 0.38,
    ambientColor: 0xffa07a,
    ambientIntensity: 0.5,
    fogColor: 0xff9a76,
    fogDensity: 0.00045,
    exposure: 1.12,
    bloomStrength: 0.2,
    icon: "\ud83c\udf05"
  },
  night: {
    skyColor: 0x111a38,
    groundColor: 0x263142,
    hemiIntensity: 0.58,
    sunColor: 0x6b8cff,
    sunIntensity: 0.14,
    fillColor: 0x607ca8,
    fillIntensity: 0.62,
    ambientColor: 0x8a9bb8,
    ambientIntensity: 0.64,
    fogColor: 0x121a34,
    fogDensity: 0.00008,
    exposure: 1.18,
    bloomStrength: 0.25,
    icon: "\ud83c\udf19"
  },
  sunrise: {
    skyColor: 0xffc4a3,
    groundColor: 0x4a3428,
    hemiIntensity: 0.6,
    sunColor: 0xffe4b5,
    sunIntensity: 1.0,
    fillColor: 0xffb8a8,
    fillIntensity: 0.4,
    ambientColor: 0xffd4a3,
    ambientIntensity: 0.5,
    fogColor: 0xffd4b8,
    fogDensity: 0.0004,
    exposure: 1.1,
    bloomStrength: 0.2,
    icon: "\ud83c\udf04"
  }
};

const _colorA = new THREE.Color();
const _colorB = new THREE.Color();
const _sunDir = new THREE.Vector3(0.4, 0.85, 0.2).normalize();
const _moonDir = new THREE.Vector3(-0.4, 0.8, -0.2).normalize();
const _fillDir = new THREE.Vector3(-0.3, 0.6, -0.7).normalize();
let _lastAppliedSkySignature = "";
let _lastStarOpacitySignature = "";

export function invalidateSkyVisualCache() {
  _lastAppliedSkySignature = "";
  _lastStarOpacitySignature = "";
}
let _lastMoonPhaseSignature = "";

function buildSkyCacheKey(lat, lon, timestamp) {
  return `${timestamp.getUTCFullYear()}-${timestamp.getUTCMonth()}-${timestamp.getUTCDate()}-${Math.floor(timestamp.getTime() / SKY_UPDATE_INTERVAL_MS)}:${lat.toFixed(SKY_LOCATION_PRECISION)}:${lon.toFixed(SKY_LOCATION_PRECISION)}`;
}

function getSkyModeDisplay(mode, phase = "day") {
  if (mode === "live") {
    const liveConfig = SKY_PRESETS[phase] || SKY_PRESETS.day;
    const liveLabel = phase === "day" ? "Day" : phase === "night" ? "Night" : phase === "sunrise" ? "Sunrise" : "Sunset";
    return {
      icon: liveConfig.icon,
      label: `Live ${liveLabel}`
    };
  }

  const config = SKY_PRESETS[mode] || SKY_PRESETS.day;
  const label = mode === "day" ? "Day" : mode === "night" ? "Night" : mode === "sunrise" ? "Sunrise" : "Sunset";
  return {
    icon: config.icon,
    label
  };
}

function updateTimeOfDayButton(phase = appCtx.timeOfDay || "day") {
  const button = document.getElementById("fTimeOfDay");
  const mode = appCtx.skyMode || "live";
  const display = getSkyModeDisplay(mode, phase);
  if (button) button.textContent = `${display.icon} ${display.label}`;
  const quickButton = document.getElementById("quickTimeOfDay");
  const quickState = document.getElementById("quickTimeOfDayState");
  if (quickButton) {
    quickButton.setAttribute("aria-label", `Change time of day. Current: ${display.label}`);
    quickButton.setAttribute("title", `Time of day: ${display.label}`);
    quickButton.setAttribute("aria-pressed", String(mode !== "live"));
    quickButton.dataset.mode = mode;
  }
  if (quickState) quickState.textContent = display.label;
}

function mixColorHex(colorA, colorB, t) {
  _colorA.setHex(colorA);
  _colorB.setHex(colorB);
  return _colorA.lerp(_colorB, clamp01(t)).getHex();
}

function mixSkyPreset(a, b, t, phaseLabel) {
  const blend = clamp01(t);
  return {
    skyColor: mixColorHex(a.skyColor, b.skyColor, blend),
    groundColor: mixColorHex(a.groundColor, b.groundColor, blend),
    hemiIntensity: a.hemiIntensity + (b.hemiIntensity - a.hemiIntensity) * blend,
    sunColor: mixColorHex(a.sunColor, b.sunColor, blend),
    sunIntensity: a.sunIntensity + (b.sunIntensity - a.sunIntensity) * blend,
    fillColor: mixColorHex(a.fillColor, b.fillColor, blend),
    fillIntensity: a.fillIntensity + (b.fillIntensity - a.fillIntensity) * blend,
    ambientColor: mixColorHex(a.ambientColor, b.ambientColor, blend),
    ambientIntensity: a.ambientIntensity + (b.ambientIntensity - a.ambientIntensity) * blend,
    fogColor: mixColorHex(a.fogColor, b.fogColor, blend),
    fogDensity: a.fogDensity + (b.fogDensity - a.fogDensity) * blend,
    exposure: a.exposure + (b.exposure - a.exposure) * blend,
    bloomStrength: a.bloomStrength + (b.bloomStrength - a.bloomStrength) * blend,
    icon: b.icon,
    phase: phaseLabel
  };
}

function inferMoonPhaseLabel(phase) {
  const value = ((Number(phase) || 0) % 1 + 1) % 1;
  if (value < 0.0625 || value >= 0.9375) return "New Moon";
  if (value < 0.1875) return "Waxing Crescent";
  if (value < 0.3125) return "First Quarter";
  if (value < 0.4375) return "Waxing Gibbous";
  if (value < 0.5625) return "Full Moon";
  if (value < 0.6875) return "Waning Gibbous";
  if (value < 0.8125) return "Last Quarter";
  return "Waning Crescent";
}

function horizontalToWorldVector(azimuth, altitude) {
  const azimuthFromNorth = azimuth + Math.PI;
  const cosAltitude = Math.cos(altitude);
  return new THREE.Vector3(
    cosAltitude * Math.sin(azimuthFromNorth),
    Math.sin(altitude),
    -cosAltitude * Math.cos(azimuthFromNorth)
  ).normalize();
}

function buildVisualPresetForState(sunAltitudeDeg, rising) {
  if (sunAltitudeDeg >= 14) {
    return { ...SKY_PRESETS.day, phase: "day" };
  }
  if (sunAltitudeDeg <= -12) {
    return { ...SKY_PRESETS.night, phase: "night" };
  }

  const twilightPreset = rising ? SKY_PRESETS.sunrise : SKY_PRESETS.sunset;
  if (sunAltitudeDeg >= 2) {
    return mixSkyPreset(
      twilightPreset,
      SKY_PRESETS.day,
      smoothstep(2, 14, sunAltitudeDeg),
      sunAltitudeDeg >= 8 ? "day" : rising ? "sunrise" : "sunset"
    );
  }

  return mixSkyPreset(
    SKY_PRESETS.night,
    twilightPreset,
    smoothstep(-12, 2, sunAltitudeDeg),
    rising ? "sunrise" : "sunset"
  );
}

function applyMoonPhaseTexture(state) {
  if (!appCtx.moonSphere?.material) return;
  const phase = Number(state?.moon?.phase ?? 0);
  const rotation = Number(state?.moon?.parallacticAngle ?? 0);
  const signature = `${Math.round(phase * 128)}:${Math.round(rotation * 180 / Math.PI)}:${Math.round((state?.moon?.illumination || 0) * 100)}`;
  if (_lastMoonPhaseSignature === signature) return;
  _lastMoonPhaseSignature = signature;

  let canvas = appCtx.moonSphere.userData.phaseCanvas;
  let texture = appCtx.moonSphere.userData.phaseTexture;
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    appCtx.moonSphere.userData.phaseCanvas = canvas;
    appCtx.moonSphere.userData.phaseTexture = texture;
    appCtx.moonSphere.material.map = texture;
    appCtx.moonSphere.material.transparent = true;
    appCtx.moonSphere.material.needsUpdate = true;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const size = canvas.width;
  const radius = size * 0.43;
  const cx = size * 0.5;
  const cy = size * 0.5;
  const cosRot = Math.cos(rotation);
  const sinRot = Math.sin(rotation);
  const phaseAngle = Math.PI * 2 * phase;
  const lightDir = {
    x: Math.sin(phaseAngle),
    y: 0,
    z: -Math.cos(phaseAngle)
  };

  const image = ctx.createImageData(size, size);
  const data = image.data;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const dx = (px + 0.5 - cx) / radius;
      const dy = (py + 0.5 - cy) / radius;
      const rr = dx * dx + dy * dy;
      const idx = (py * size + px) * 4;
      if (rr > 1) {
        data[idx + 3] = 0;
        continue;
      }

      const rx = dx * cosRot - dy * sinRot;
      const ry = dx * sinRot + dy * cosRot;
      const rz = Math.sqrt(Math.max(0, 1 - rx * rx - ry * ry));
      const lambert = Math.max(0, rx * lightDir.x + ry * lightDir.y + rz * lightDir.z);
      const shade = 0.14 + lambert * 0.86;
      const rim = 0.88 + rz * 0.12;
      data[idx] = Math.round((150 + shade * 86) * rim);
      data[idx + 1] = Math.round((156 + shade * 88) * rim);
      data[idx + 2] = Math.round((170 + shade * 76) * rim);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  texture.needsUpdate = true;
}

function applyStarVisibility(state) {
  if (!appCtx.starField) return;
  const opacity = clamp01(state.starsOpacity);
  const signature = `${Math.round(opacity * 100)}:${appCtx.constellationsVisible ? 1 : 0}`;
  if (_lastStarOpacitySignature === signature) return;
  _lastStarOpacitySignature = signature;

  appCtx.starField.visible = opacity > 0.015;
  appCtx.starField.traverse((child) => {
    if (!child?.material) return;
    const material = child.material;
    if (Array.isArray(material)) return;
    if (typeof material.opacity !== "number") return;
    if (child.userData?.skyHitbox) return;
    if (!child.userData.baseOpacity) {
      child.userData.baseOpacity = material.opacity;
    }
    material.opacity = child.userData.baseOpacity * opacity;
    if (!material.userData?.skyBackgroundMaterial) {
      material.transparent = material.opacity < 0.999 || material.transparent;
    }
    material.needsUpdate = true;
  });

  if (appCtx.allConstellationLines) {
    appCtx.allConstellationLines.visible = !!appCtx.constellationsVisible && opacity > 0.14;
  }
}

function refreshEarthAtmosphereVisual(options = {}) {
  if (!appCtx.earthAtmosphere || appCtx.onMoon || appCtx.onMars) return null;
  const profile = buildEarthAtmosphereProfile(
    appCtx.skyState,
    appCtx.weatherState,
    {
      phase: appCtx.timeOfDay || 'day',
      weatherMode: appCtx.weatherMode || 'live',
      backgroundHex: appCtx.scene?.background?.getHex?.() ?? 0x87ceeb
    }
  );
  const changed = appCtx.earthAtmosphereProfile?.signature !== profile.signature;
  appCtx.earthAtmosphereProfile = profile;
  applyEarthAtmosphereProfile(appCtx.earthAtmosphere, profile);
  appCtx.earthAtmosphere.visible = appCtx.getEnv?.() === appCtx.ENV?.EARTH;
  if (changed || options.force === true) {
    appCtx.refreshEarthEnvironmentMap?.(profile, { force: options.force === true });
  }
  return profile;
}

function getEarthAtmosphereSnapshot() {
  return atmosphereSnapshot(appCtx.earthAtmosphere, appCtx.earthAtmosphereProfile);
}

function applySkyVisualState(config, state) {
  if (!appCtx.scene || !appCtx.sun || !appCtx.hemiLight || !appCtx.fillLight || !appCtx.ambientLight) return;

  const signature = [
    config.phase,
    config.skyColor,
    config.groundColor,
    config.sunColor,
    config.fillColor,
    config.ambientColor,
    config.fogColor,
    config.hemiIntensity.toFixed(3),
    config.sunIntensity.toFixed(3),
    config.fillIntensity.toFixed(3),
    config.ambientIntensity.toFixed(3),
    config.fogDensity.toFixed(6),
    config.exposure.toFixed(3),
    state?.moon?.visible ? 1 : 0,
    Math.round((state?.moon?.illumination || 0) * 100),
    Math.round((state?.moon?.phase || 0) * 128),
    Math.round((state?.starsOpacity || 0) * 100)
  ].join("|");
  if (_lastAppliedSkySignature === signature) return;
  _lastAppliedSkySignature = signature;

  appCtx.timeOfDay = config.phase;
  appCtx.skyState = state || appCtx.skyState;

  if (appCtx.scene.background?.isColor) {
    appCtx.scene.background.setHex(config.skyColor);
  } else {
    appCtx.scene.background = new THREE.Color(config.skyColor);
  }

  appCtx.hemiLight.color.setHex(config.skyColor);
  appCtx.hemiLight.groundColor.setHex(config.groundColor);
  appCtx.hemiLight.intensity = config.hemiIntensity;

  appCtx.sun.color.setHex(config.sunColor);
  appCtx.sun.intensity = config.sunIntensity;

  appCtx.fillLight.color.setHex(config.fillColor);
  appCtx.fillLight.intensity = config.fillIntensity;

  appCtx.ambientLight.color.setHex(config.ambientColor);
  appCtx.ambientLight.intensity = config.ambientIntensity;

  if (appCtx.sunSphere) {
    appCtx.sunSphere.material.color.setHex(config.sunColor);
    appCtx.sunSphere.visible = !!state?.sun?.visible;
    if (appCtx.sunSphere.userData.glow) {
      appCtx.sunSphere.userData.glow.visible = !!state?.sun?.visible;
      appCtx.sunSphere.userData.glow.material.opacity = 0.16 + (state?.sun?.daylightFactor || 0) * 0.2;
      appCtx.sunSphere.userData.glow.material.color.setHex(config.sunColor);
    }
  }

  if (appCtx.moonSphere) {
    applyMoonPhaseTexture(state);
    appCtx.moonSphere.visible = !!state?.moon?.visible;
    if (appCtx.moonSphere.userData.glow) {
      appCtx.moonSphere.userData.glow.visible = !!state?.moon?.visible;
      appCtx.moonSphere.userData.glow.material.opacity = 0.06 + (state?.moon?.illumination || 0) * 0.18;
    }
  }

  applyStarVisibility(state || { starsOpacity: 0 });

  if (appCtx.scene.fog?.isFogExp2) {
    appCtx.scene.fog.color.setHex(config.fogColor);
  } else {
    appCtx.scene.fog = new THREE.FogExp2(config.fogColor, 0);
  }

  if (appCtx.renderer) {
    appCtx.renderer.toneMappingExposure = config.exposure;
  }

  if (appCtx.bloomPass && config.bloomStrength !== undefined) {
    appCtx.bloomPass.strength = config.bloomStrength;
  }

  const cloudMaterial = appCtx.cloudGroup?.userData?.sharedMaterial;
  if (cloudMaterial) {
    cloudMaterial.color.setHex(mixColorHex(0x9cb9d0, 0xffffff, 0.4 + (state?.sun?.daylightFactor || 0) * 0.6));
    cloudMaterial.opacity = (appCtx.cloudsVisible ? 1 : 0) * (0.16 + (state?.sun?.daylightFactor || 0) * 0.66 + (state?.sun?.twilightFactor || 0) * 0.12);
  }

  refreshEarthAtmosphereVisual();

  if (typeof appCtx.applyWeatherPresentation === "function") {
    appCtx.applyWeatherPresentation();
  }
  updateTimeOfDayButton(config.phase);
}

function buildAstronomicalSkyState(lat, lon, date = new Date()) {
  const timestamp = date instanceof Date ? date : new Date(date);
  const sun = getSunPosition(timestamp, lat, lon);
  const nextSun = getSunPosition(new Date(timestamp.getTime() + 20 * 60 * 1000), lat, lon);
  const moon = getMoonPosition(timestamp, lat, lon);
  const moonIllumination = getMoonIllumination(timestamp);

  const sunAltitudeDeg = radToDeg(sun.altitude);
  const moonAltitudeDeg = radToDeg(moon.altitude);
  const rising = nextSun.altitude >= sun.altitude;
  const starsOpacity = smoothstep(-4, -16, sunAltitudeDeg);
  const daylightFactor = smoothstep(-3, 14, sunAltitudeDeg);
  const twilightFactor = smoothstep(-12, 8, sunAltitudeDeg) * (1 - daylightFactor * 0.85);
  const moonDayAllowance = smoothstep(35, 6, sunAltitudeDeg);
  const moonVisible = moonAltitudeDeg > -2.5 && (starsOpacity > 0.04 || moonDayAllowance * moonIllumination.fraction > 0.1);
  const visual = buildVisualPresetForState(sunAltitudeDeg, rising);

  _sunDir.copy(horizontalToWorldVector(sun.azimuth, sun.altitude));
  _moonDir.copy(horizontalToWorldVector(moon.azimuth, moon.altitude));
  _fillDir.copy(_sunDir).multiplyScalar(-1).add(new THREE.Vector3(0.1, 0.5, -0.1)).normalize();

  return {
    source: "astronomical",
    computedAtIso: timestamp.toISOString(),
    lat,
    lon,
    phase: visual.phase,
    visual,
    sun: {
      altitudeRad: sun.altitude,
      altitudeDeg: sunAltitudeDeg,
      azimuthRad: sun.azimuth,
      azimuthDeg: radToDeg(sun.azimuth + Math.PI),
      daylightFactor,
      twilightFactor,
      visible: sunAltitudeDeg > -1.2,
      direction: { x: _sunDir.x, y: _sunDir.y, z: _sunDir.z }
    },
    moon: {
      altitudeRad: moon.altitude,
      altitudeDeg: moonAltitudeDeg,
      azimuthRad: moon.azimuth,
      azimuthDeg: radToDeg(moon.azimuth + Math.PI),
      parallacticAngle: moon.parallacticAngle,
      visible: moonVisible,
      illumination: moonIllumination.fraction,
      phase: moonIllumination.phase,
      phaseLabel: inferMoonPhaseLabel(moonIllumination.phase),
      direction: { x: _moonDir.x, y: _moonDir.y, z: _moonDir.z }
    },
    starsOpacity,
    localSiderealTimeRad: normalizeAngle(siderealTime(toDays(timestamp), -lon * Math.PI / 180)),
    cacheKey: buildSkyCacheKey(lat, lon, timestamp)
  };
}

function applyManualTimePreset(time) {
  const config = SKY_PRESETS[time];
  if (!config) return;
  appCtx.skyMode = time;
  applySkyVisualState({ ...config, phase: time }, {
    source: "manual",
    phase: time,
    sun: {
      visible: time !== "night",
      daylightFactor: time === "day" ? 1 : 0.45,
      twilightFactor: time === "sunrise" || time === "sunset" ? 1 : 0
    },
    moon: { visible: time === "night", illumination: 0.65, phase: 0.55, parallacticAngle: 0 },
    starsOpacity: time === "night" ? 1 : (time === "sunrise" || time === "sunset" ? 0.3 : 0)
  });
}

export function refreshAstronomicalSky(force = false, deps = {}) {
  if ((appCtx.skyMode || "live") !== "live") return appCtx.skyState;
  const earthLikeEnv = !appCtx.onMoon && !appCtx.travelingToMoon && (
    appCtx.isEnv?.(appCtx.ENV?.EARTH) ||
    appCtx.oceanMode?.active
  );
  if (!earthLikeEnv) return appCtx.skyState;

  const loc = resolveObservedEarthLocation();
  if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) return appCtx.skyState;
  const timestamp = new Date();
  const cacheKey = buildSkyCacheKey(loc.lat, loc.lon, timestamp);
  if (!force && appCtx.skyState?.cacheKey === cacheKey) return appCtx.skyState;

  const state = buildAstronomicalSkyState(loc.lat, loc.lon, timestamp);

  appCtx.skyMode = "live";
  appCtx.skyState = state;
  if (typeof deps.alignStarFieldToLocation === "function") {
    deps.alignStarFieldToLocation(loc.lat, loc.lon);
  }
  applySkyVisualState(state.visual, state);
  if (typeof appCtx.applyOceanSkyState === "function" && appCtx.oceanMode?.active) {
    appCtx.applyOceanSkyState(state);
  }
  return state;
}

export function setTimeOfDay(time, deps = {}) {
  if (time === "live") {
    appCtx.skyMode = "live";
    refreshAstronomicalSky(true, deps);
    return;
  }
  applyManualTimePreset(time);
}

export function cycleTimeOfDay(deps = {}) {
  const currentMode = appCtx.skyMode || "live";
  const currentIndex = SKY_MODE_SEQUENCE.indexOf(currentMode);
  const nextMode = SKY_MODE_SEQUENCE[(currentIndex + 1 + SKY_MODE_SEQUENCE.length) % SKY_MODE_SEQUENCE.length];
  setTimeOfDay(nextMode, deps);
}

export function getAstronomicalSkySnapshot() {
  const state = appCtx.skyState;
  if (!state) return null;
  return {
    source: state.source,
    computedAtIso: state.computedAtIso,
    lat: Number(state.lat.toFixed(4)),
    lon: Number(state.lon.toFixed(4)),
    phase: state.phase,
    sunAltitudeDeg: Number(state.sun.altitudeDeg.toFixed(2)),
    sunAzimuthDeg: Number(state.sun.azimuthDeg.toFixed(2)),
    moonAltitudeDeg: Number(state.moon.altitudeDeg.toFixed(2)),
    moonAzimuthDeg: Number(state.moon.azimuthDeg.toFixed(2)),
    moonIllumination: Number(state.moon.illumination.toFixed(3)),
    moonPhase: Number(state.moon.phase.toFixed(3)),
    moonPhaseLabel: state.moon.phaseLabel,
    starsOpacity: Number(state.starsOpacity.toFixed(3)),
    localSiderealTimeDeg: Number(radToDeg(state.localSiderealTimeRad).toFixed(2))
  };
}

Object.assign(appCtx, {
  getEarthAtmosphereSnapshot,
  refreshEarthAtmosphereVisual
});

export { getEarthAtmosphereSnapshot, refreshEarthAtmosphereVisual };

export function inspectAstronomicalSkyState(lat, lon, dateInput = new Date()) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const state = buildAstronomicalSkyState(Number(lat), Number(lon), dateInput instanceof Date ? dateInput : new Date(dateInput));
  return {
    computedAtIso: state.computedAtIso,
    lat: Number(state.lat.toFixed(4)),
    lon: Number(state.lon.toFixed(4)),
    phase: state.phase,
    sunAltitudeDeg: Number(state.sun.altitudeDeg.toFixed(2)),
    sunAzimuthDeg: Number(state.sun.azimuthDeg.toFixed(2)),
    moonAltitudeDeg: Number(state.moon.altitudeDeg.toFixed(2)),
    moonAzimuthDeg: Number(state.moon.azimuthDeg.toFixed(2)),
    moonIllumination: Number(state.moon.illumination.toFixed(3)),
    moonPhase: Number(state.moon.phase.toFixed(3)),
    moonPhaseLabel: state.moon.phaseLabel,
    starsOpacity: Number(state.starsOpacity.toFixed(3)),
    localSiderealTimeDeg: Number(radToDeg(state.localSiderealTimeRad).toFixed(2))
  };
}
