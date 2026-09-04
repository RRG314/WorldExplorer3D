import { ctx as appCtx } from "./shared-context.js?v=55";
import { resolveObservedEarthLocation, haversineKm } from "./earth-location.js?v=2";
import {
  assignResolvedPlace,
  cleanCountry,
  fetchJsonWithTimeout,
  fetchPlaceForLocation,
  getActiveWeatherLocationLabel,
  getFallbackPlaceLabel,
  parseReverseAddress,
  placeCacheKey,
  refreshLivePlace,
  uniqueNonEmptyParts,
  weatherCacheKey
} from './weather/place-resolver.js?v=2';
import { weatherCodeDescriptor } from './weather/catalog.js?v=1';
import { weatherStateService } from './weather/state-service.js?v=1';
import { operationalFeedService } from './geospatial/operational-feeds.js?v=1';
import { createLifecycleScope } from './runtime/lifecycle-scope.js?v=2';

const WEATHER_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const WEATHER_CHECK_INTERVAL_MS = 5000;
const WEATHER_RETRY_DELAY_MS = 450;
const WEATHER_MAX_ATTEMPTS = 2;
const WEATHER_MOVE_THRESHOLD_KM = 12;
const WEATHER_MODES = ['live', 'clear', 'cloudy', 'overcast', 'rain', 'snow', 'fog', 'storm'];
const WEATHER_FOG_COLOR = 0x9aa4b2;
const WEATHER_CLOUD_COLOR = 0xc5cdd6;
const WEATHER_CLEAR_COLOR = 0xf5fbff;
// Weather can mute the sun, but it must not make an Earth location unreadable.
// These floors preserve time-of-day color while keeping streets, terrain, and
// gameplay objects visible in overcast conditions and at night.
const MIN_EARTH_EXPOSURE = 1.02;
const MIN_EARTH_AMBIENT_INTENSITY = 0.48;
const MIN_EARTH_HEMISPHERE_INTENSITY = 0.55;
const _weatherColorA = new THREE.Color();
const _weatherColorB = new THREE.Color();
let _lastWeatherVisualSignature = '';
let _lastWeatherUiSignature = '';
let _lastWeatherCheckMs = 0;
let _pendingWeatherRequest = null;
const weatherLifecycleScope = createLifecycleScope('weather-ui');

const WEATHER_PRESETS = {
  clear: { label: 'Clear', icon: '☀️', category: 'clear', cloudCover: 8, haze: 0.92, sunFactor: 1, fillFactor: 1, exposureFactor: 1.02, cloudColor: WEATHER_CLEAR_COLOR, skyTint: 0xd8efff },
  cloudy: { label: 'Cloudy', icon: '⛅', category: 'cloudy', cloudCover: 55, haze: 1.08, sunFactor: 0.82, fillFactor: 0.96, exposureFactor: 0.97, cloudColor: 0xd7dce2, skyTint: 0xc3d7e8 },
  overcast: { label: 'Overcast', icon: '☁️', category: 'overcast', cloudCover: 92, haze: 1.24, sunFactor: 0.58, fillFactor: 0.88, exposureFactor: 0.9, cloudColor: WEATHER_CLOUD_COLOR, skyTint: 0xaebdcb },
  rain: { label: 'Rain', icon: '🌧️', category: 'rain', cloudCover: 96, haze: 1.34, sunFactor: 0.52, fillFactor: 0.84, exposureFactor: 0.86, cloudColor: 0xb9c0ca, skyTint: 0x9aafc1 },
  snow: { label: 'Snow', icon: '❄️', category: 'snow', cloudCover: 90, haze: 1.42, sunFactor: 0.6, fillFactor: 0.9, exposureFactor: 0.92, cloudColor: 0xd9e1ea, skyTint: 0xdfe8f2 },
  fog: { label: 'Fog', icon: '🌫️', category: 'fog', cloudCover: 84, haze: 2.1, sunFactor: 0.42, fillFactor: 0.78, exposureFactor: 0.82, cloudColor: 0xc8d0d8, skyTint: 0xb3bcc6 },
  storm: { label: 'Storm', icon: '⛈️', category: 'storm', cloudCover: 100, haze: 1.55, sunFactor: 0.45, fillFactor: 0.82, exposureFactor: 0.8, cloudColor: 0xafb8c4, skyTint: 0x8898ab }
};

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function mixColorHex(colorA, colorB, t) {
  _weatherColorA.setHex(colorA);
  _weatherColorB.setHex(colorB);
  return _weatherColorA.lerp(_weatherColorB, clamp01(t)).getHex();
}

function cToF(value) {
  if (!Number.isFinite(value)) return null;
  return value * 9 / 5 + 32;
}

function kphToMph(value) {
  if (!Number.isFinite(value)) return null;
  return value * 0.621371;
}

function roundTo(value, digits = 1) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatClockTimeForDate(date, tzAbbr = '', { showSeconds = true, includeZone = true } = {}) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '--';
  const hour24 = date.getHours();
  const minute = date.getMinutes();
  const second = date.getSeconds();
  const hour12 = ((hour24 + 11) % 12) + 1;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const secondsPart = showSeconds ? `:${String(second).padStart(2, '0')}` : '';
  const timeLabel = `${hour12}:${String(minute).padStart(2, '0')}${secondsPart} ${suffix}`;
  return includeZone && tzAbbr ? `${timeLabel} ${tzAbbr}` : timeLabel;
}

function getWeatherClockDate(active) {
  const timezone = String(active?.timezone || '').trim();
  if (timezone && typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
      const iso = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
      const parsed = new Date(`${iso}`);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    } catch {
      // fall through to progressive local time
    }
  }

  const baseMs = Date.parse(String(active?.localTimeIso || '').trim());
  if (Number.isFinite(baseMs) && Number.isFinite(active?.fetchedAtMs)) {
    return new Date(baseMs + Math.max(0, Date.now() - Number(active.fetchedAtMs)));
  }
  return null;
}

function getLiveClockLabel(active, options = undefined) {
  const date = getWeatherClockDate(active);
  return formatClockTimeForDate(date, String(active?.timezoneAbbr || '').trim(), options);
}

function windDirectionLabel(deg) {
  if (!Number.isFinite(deg)) return '';
  const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return labels[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

function formatVisibilityLabel(meters) {
  if (!Number.isFinite(meters)) return '';
  if (meters < 1000) return `${Math.round(meters)} m visibility`;
  return `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} km visibility`;
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getWeatherModeDisplay(mode, activeState = null) {
  if (mode === 'live') {
    const icon = activeState?.icon || '🌦️';
    const label = 'Weather: Live';
    return { icon, label };
  }
  const preset = WEATHER_PRESETS[mode] || WEATHER_PRESETS.clear;
  return { icon: preset.icon, label: `Weather: ${preset.label}` };
}

function weatherVisualProfile(state) {
  if (!state) return WEATHER_PRESETS.clear;
  if (state.source === 'manual') {
    return WEATHER_PRESETS[state.mode] || WEATHER_PRESETS.clear;
  }
  const categoryPreset = WEATHER_PRESETS[state.category] || WEATHER_PRESETS.clear;
  const cloudFactor = clamp01((Number(state.cloudCover) || 0) / 100);
  return {
    ...categoryPreset,
    cloudCover: Math.max(categoryPreset.cloudCover, Math.round(cloudFactor * 100)),
    haze: Math.max(categoryPreset.haze, 0.9 + cloudFactor * 0.75),
    sunFactor: Math.min(categoryPreset.sunFactor, 1 - cloudFactor * 0.45),
    fillFactor: Math.min(1.05, categoryPreset.fillFactor + cloudFactor * 0.05),
    exposureFactor: Math.min(categoryPreset.exposureFactor, 1.02 - cloudFactor * 0.14)
  };
}

function getHudLocationLabel() {
  const placeLat = Number(appCtx.livePlaceState?.lat);
  const placeLon = Number(appCtx.livePlaceState?.lon);
  const locationLat = Number(appCtx.LOC?.lat);
  const locationLon = Number(appCtx.LOC?.lon);
  const placeMatchesLoadedLocation =
    [placeLat, placeLon, locationLat, locationLon].every(Number.isFinite) &&
    haversineKm(placeLat, placeLon, locationLat, locationLon) <= 6;
  const detailed = placeMatchesLoadedLocation ? String(appCtx.livePlaceState?.display || '').trim() : '';
  if (detailed) return detailed;
  return getActiveWeatherLocationLabel();
}

function positionHudClock() {
  const hudBox = document.getElementById('hudBox');
  const header = document.getElementById('hudHeader');
  const street = document.getElementById('street');
  const clock = document.getElementById('hudClockDisplay');
  if (!hudBox || !header || !street || !clock || clock.style.display === 'none') return;
  const boxRect = hudBox.getBoundingClientRect();
  const headerRect = header.getBoundingClientRect();
  const streetRect = street.getBoundingClientRect();
  const clockHeight = Math.max(16, clock.offsetHeight || 0);
  const gapStart = Math.max(0, (headerRect.bottom - boxRect.top) + 8);
  const gapEnd = Math.max(gapStart, (streetRect.top - boxRect.top) - clockHeight - 8);
  const centeredTop = gapStart + Math.max(0, ((gapEnd - gapStart) / 2));
  clock.style.top = `${Math.round(Math.min(gapEnd, centeredTop))}px`;
}

function updateWeatherUi() {
  const btn = document.getElementById('fWeatherMode');
  const quickControls = document.getElementById('worldQuickControls');
  const quickBtn = document.getElementById('quickWeatherMode');
  const quickState = document.getElementById('quickWeatherModeState');
  const panel = document.getElementById('weatherPanel');
  const clock = document.getElementById('hudClockDisplay');
  const line = document.getElementById('weatherLine');
  const timeLine = document.getElementById('weatherTimeLine');
  const meta = document.getElementById('weatherMetaLine');
  const mode = appCtx.weatherMode || 'live';
  const active = appCtx.weatherState || appCtx.liveWeatherState || null;
  const display = getWeatherModeDisplay(mode, active);
  const quickLabel = display.label.replace(/^Weather:\s*/, '');
  const worldControlsAvailable = !appCtx.onMoon && !appCtx.onMars && !appCtx.activePlanetaryBodyId && !appCtx.spaceFlight?.active;
  if (quickControls) quickControls.hidden = !worldControlsAvailable;
  if (quickBtn) {
    quickBtn.setAttribute('aria-label', `Change weather. Current: ${quickLabel}`);
    quickBtn.setAttribute('title', `Weather: ${quickLabel}`);
    quickBtn.setAttribute('aria-pressed', String(mode !== 'live'));
    quickBtn.dataset.mode = mode;
  }
  if (quickState) quickState.textContent = quickLabel;
  const tempF = Number.isFinite(active?.temperatureF) ? Math.round(active.temperatureF) : null;
  const tempC = Number.isFinite(active?.temperatureC) ? Math.round(active.temperatureC) : null;
  const buttonText = `${display.icon} ${display.label}`;
  const localTimeLabel = getLiveClockLabel(active, { includeZone: false, showSeconds: true });
  const windCompass = windDirectionLabel(active?.windDirectionDeg);
  const signature = JSON.stringify({
    onMoon: !!appCtx.onMoon,
    onMars: !!appCtx.onMars,
    buttonText,
    mode,
    condition: active?.conditionLabel || '',
    tempF,
    tempC,
    source: active?.source || '',
    localTimeLabel,
    feelsF: Number.isFinite(active?.apparentF) ? Math.round(active.apparentF) : null,
    humidity: Number.isFinite(active?.humidityPct) ? Math.round(active.humidityPct) : null,
    cloudCover: Number.isFinite(active?.cloudCover) ? Math.round(active.cloudCover) : null,
    windMph: Number.isFinite(active?.windMph) ? Math.round(active.windMph) : null,
    windCompass
  });
  if (_lastWeatherUiSignature === signature) return;
  _lastWeatherUiSignature = signature;

  if (appCtx.onMoon) {
    if (panel) panel.style.display = 'none';
    if (clock) clock.style.display = 'none';
    return;
  }

  if (appCtx.onMars) {
    if (panel) panel.style.display = 'block';
    if (clock) clock.style.display = 'none';
    if (line) {
      line.style.display = 'block';
      line.textContent = 'Mars • Thin CO₂ atmosphere';
    }
    if (timeLine) timeLine.style.display = 'none';
    if (meta) {
      meta.style.display = 'block';
      meta.textContent = 'Gravity 0.38g • Olympus Mons region';
    }
    return;
  }

  if (btn) {
    btn.textContent = buttonText;
    btn.classList.toggle('on', mode !== 'live');
  }

  if (!panel || !clock || !line || !timeLine || !meta) return;
  if (!active) {
    panel.style.display = 'block';
    clock.style.display = 'block';
    line.textContent = `${display.icon} ${mode === 'live' ? 'Loading live weather' : display.label}`;
    clock.textContent = mode === 'live' ? 'Local time loading…' : 'Manual weather active';
    timeLine.textContent = clock.textContent;
    meta.textContent = mode === 'live' ? `Fetching local conditions` : `Override ready`;
    line.style.display = 'block';
    timeLine.style.display = 'none';
    meta.style.display = 'block';
    positionHudClock();
    return;
  }

  const primaryLabel = active.conditionLabel || 'Weather';
  panel.style.display = 'block';
  clock.style.display = 'block';
  line.textContent = `${active.icon || display.icon} ${primaryLabel}${tempF != null ? ` • ${tempF}°F` : tempC != null ? ` • ${tempC}°C` : ''}`;
  line.style.display = 'block';
  clock.textContent = localTimeLabel;
  timeLine.textContent = localTimeLabel;
  timeLine.style.display = 'none';

  const metaBits = [
    Number.isFinite(active.apparentF) ? `Feels ${Math.round(active.apparentF)}°F` : '',
    Number.isFinite(active.humidityPct) ? `${Math.round(active.humidityPct)}% humidity` : '',
    Number.isFinite(active.windMph) ? `Wind ${Math.round(active.windMph)} mph${windCompass ? ` ${windCompass}` : ''}` : '',
    Number.isFinite(active.cloudCover) && !Number.isFinite(active.windMph) ? `${Math.round(active.cloudCover)}% clouds` : '',
    Number.isFinite(active.precipitationMm) && active.precipitationMm > 0 && !Number.isFinite(active.windMph) ? `${active.precipitationMm.toFixed(1)} mm precip` : ''
  ].filter(Boolean);
  meta.textContent = metaBits.join(' • ');
  meta.style.display = metaBits.length ? 'block' : 'none';
  positionHudClock();
}

function applyWeatherPresentation() {
  if (appCtx.onMoon || appCtx.onMars) {
    updateWeatherUi();
    return;
  }
  const state = appCtx.weatherState || null;
  const skyState = appCtx.skyState || null;
  if (!skyState?.visual) {
    updateWeatherUi();
    return;
  }

  const profile = weatherVisualProfile(state);
  const signature = JSON.stringify({
    mode: appCtx.weatherMode || 'live',
    condition: state?.conditionLabel || '',
    source: state?.source || '',
    cloudCover: Math.round(Number(state?.cloudCover) || 0),
    phase: skyState.phase,
    skyIso: skyState.computedAtIso || '',
    cloudsVisible: appCtx.cloudsVisible !== false
  });
  if (_lastWeatherVisualSignature === signature) {
    updateWeatherUi();
    return;
  }
  _lastWeatherVisualSignature = signature;

  const weatherCloudFactor = clamp01((Number(profile.cloudCover) || 0) / 100);
  const weatherFogBlend = clamp01((profile.haze - 0.9) / 1.4);
  const fogWeatherActive = state?.category === 'fog' || appCtx.weatherMode === 'fog';
  const precipitationBoost = state?.category === 'rain' || state?.category === 'storm' || state?.category === 'snow' ? 0.12 : 0;
  const skyVisual = skyState.visual;

  if (appCtx.sun) {
    appCtx.sun.intensity = skyVisual.sunIntensity * profile.sunFactor;
  }
  if (appCtx.fillLight) {
    appCtx.fillLight.intensity = Math.max(0.2, skyVisual.fillIntensity * profile.fillFactor);
  }
  if (appCtx.ambientLight) {
    appCtx.ambientLight.intensity = Math.max(
      MIN_EARTH_AMBIENT_INTENSITY,
      skyVisual.ambientIntensity * Math.min(1.15, 0.95 + weatherFogBlend * 0.18)
    );
  }
  if (appCtx.renderer) {
    appCtx.renderer.toneMappingExposure = Math.max(
      MIN_EARTH_EXPOSURE,
      skyVisual.exposure * profile.exposureFactor
    );
  }
  if (appCtx.sun?.color) {
    appCtx.sun.color.setHex(mixColorHex(skyVisual.sunColor || 0xfff5e1, profile.cloudColor, Math.max(weatherCloudFactor * 0.45, precipitationBoost * 1.9)));
  }
  if (appCtx.fillLight?.color) {
    appCtx.fillLight.color.setHex(mixColorHex(skyVisual.fillColor || 0x9db4ff, profile.cloudColor, Math.max(weatherCloudFactor * 0.32, weatherFogBlend * 0.48)));
  }
  if (appCtx.ambientLight?.color) {
    appCtx.ambientLight.color.setHex(mixColorHex(skyVisual.ambientColor || 0xffffff, profile.skyTint || WEATHER_FOG_COLOR, Math.max(weatherCloudFactor * 0.18, weatherFogBlend * 0.42)));
  }
  if (appCtx.scene?.fog?.isFogExp2) {
    appCtx.scene.fog.color.setHex(mixColorHex(skyVisual.fogColor, WEATHER_FOG_COLOR, weatherFogBlend));
    appCtx.scene.fog.density = fogWeatherActive
      ? skyVisual.fogDensity * Math.max(0.85, profile.haze)
      : 0;
  }
  if (appCtx.scene?.background?.isColor) {
    const skyBlend = Math.max(weatherCloudFactor * 0.56, weatherFogBlend * 0.76, precipitationBoost * 2.1);
    appCtx.scene.background.setHex(mixColorHex(skyVisual.skyColor, profile.skyTint || WEATHER_FOG_COLOR, skyBlend));
  }
  if (appCtx.hemiLight) {
    appCtx.hemiLight.intensity = Math.max(
      MIN_EARTH_HEMISPHERE_INTENSITY,
      Number(skyVisual.hemiIntensity) || 0
    );
    const upperBlend = Math.max(weatherCloudFactor * 0.38, weatherFogBlend * 0.58, precipitationBoost * 1.6);
    appCtx.hemiLight.color.setHex(mixColorHex(skyVisual.skyColor, profile.skyTint || WEATHER_FOG_COLOR, upperBlend));
    if (appCtx.hemiLight.groundColor) {
      appCtx.hemiLight.groundColor.setHex(mixColorHex(skyVisual.groundColor || 0x545454, 0x59636f, Math.max(weatherCloudFactor * 0.2, weatherFogBlend * 0.46)));
    }
  }
  if (appCtx.sunSphere?.userData?.glow?.material) {
    appCtx.sunSphere.userData.glow.material.opacity *= Math.max(0.25, profile.sunFactor);
  }

  const cloudMaterial = appCtx.cloudGroup?.userData?.sharedMaterial;
  if (cloudMaterial) {
    const baseOpacity = 0.16 +
      (skyState.sun?.daylightFactor || 0) * 0.66 +
      (skyState.sun?.twilightFactor || 0) * 0.12;
    const weatherOpacityFactor = 0.24 + weatherCloudFactor * 0.92 + weatherFogBlend * 0.12 + precipitationBoost * 0.18;
    cloudMaterial.opacity = (appCtx.cloudsVisible ? 1 : 0) * Math.min(0.9, Math.max(0.02, baseOpacity * weatherOpacityFactor));
    cloudMaterial.color.setHex(mixColorHex(WEATHER_CLEAR_COLOR, profile.cloudColor, Math.max(weatherCloudFactor, weatherFogBlend)));
    if (appCtx.cloudGroup) appCtx.cloudGroup.visible = appCtx.cloudsVisible;
  }

  appCtx.refreshEarthAtmosphereVisual?.();

  updateWeatherUi();
}

function buildLiveWeatherState(location, payload) {
  const current = payload?.current || {};
  const descriptor = weatherCodeDescriptor(current.weather_code);
  return {
    source: 'live',
    mode: 'live',
    lat: location.lat,
    lon: location.lon,
    locationSource: location.source || 'location_origin',
    fetchedAtMs: Date.now(),
    fetchedAtIso: new Date().toISOString(),
    localTimeIso: String(current.time || payload?.current?.time || '').trim(),
    timezone: String(payload?.timezone || '').trim(),
    timezoneAbbr: String(payload?.timezone_abbreviation || '').trim(),
    conditionCode: Number(current.weather_code),
    conditionLabel: descriptor.label,
    category: descriptor.category,
    icon: descriptor.icon,
    temperatureC: roundTo(Number(current.temperature_2m), 1),
    temperatureF: roundTo(cToF(Number(current.temperature_2m)), 1),
    apparentC: roundTo(Number(current.apparent_temperature), 1),
    apparentF: roundTo(cToF(Number(current.apparent_temperature)), 1),
    humidityPct: roundTo(Number(current.relative_humidity_2m), 0),
    cloudCover: roundTo(Number(current.cloud_cover), 0),
    windKph: roundTo(Number(current.wind_speed_10m), 1),
    windMph: roundTo(kphToMph(Number(current.wind_speed_10m)), 1),
    windDirectionDeg: roundTo(Number(current.wind_direction_10m), 0),
    precipitationMm: roundTo(Number(current.precipitation), 1),
    rainMm: roundTo(Number(current.rain), 1),
    showersMm: roundTo(Number(current.showers), 1),
    snowfallCm: roundTo(Number(current.snowfall), 1),
    visibilityM: roundTo(Number(current.visibility), 0),
    isDay: Number(current.is_day) === 1,
    locationDisplay: String(appCtx.livePlaceState?.display || '').trim(),
    locationShortLabel: String(appCtx.livePlaceState?.shortLabel || '').trim()
  };
}

function buildManualWeatherState(mode) {
  const preset = WEATHER_PRESETS[mode] || WEATHER_PRESETS.clear;
  const base = appCtx.liveWeatherState || {};
  return {
    ...base,
    source: 'manual',
    mode,
    conditionCode: null,
    conditionLabel: preset.label,
    category: preset.category,
    icon: preset.icon,
    cloudCover: preset.cloudCover
  };
}

function syncActiveWeatherState() {
  if ((appCtx.weatherMode || 'live') === 'live') {
    weatherStateService.setActiveState(appCtx.liveWeatherState || null);
  } else {
    weatherStateService.setActiveState(buildManualWeatherState(appCtx.weatherMode));
  }
  applyWeatherPresentation();
  return appCtx.weatherState;
}

async function fetchWeatherForLocation(lat, lon, { ocean = false, force = false } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < WEATHER_MAX_ATTEMPTS; attempt++) {
    try {
      const result = await operationalFeedService.weather([{ lat, lon }], {
        ocean,
        force: force || attempt > 0
      });
      if (!result.items[0]) throw new Error('weather_payload_empty');
      return result.items[0];
    } catch (err) {
      lastError = err;
      if (attempt < WEATHER_MAX_ATTEMPTS - 1) {
        await sleep(WEATHER_RETRY_DELAY_MS);
      }
    }
  }
  throw lastError || new Error('weather_fetch_failed');
}

async function getResolvedPlaceForLocation(lat, lon, force = false) {
  const key = placeCacheKey(lat, lon);
  const cached = weatherStateService.getCachedPlace(key);
  if (!force && cached) return cached;
  try {
    const place = await fetchPlaceForLocation(lat, lon);
    weatherStateService.setCachedPlace(key, place);
    return place;
  } catch {
    const fallback = getFallbackPlaceLabel({ lat, lon });
    weatherStateService.setCachedPlace(key, fallback);
    return fallback;
  }
}

async function getWeatherSnapshotForLocation(lat, lon, { force = false, ocean = false } = {}) {
  const safeLat = Number(lat);
  const safeLon = Number(lon);
  if (!Number.isFinite(safeLat) || !Number.isFinite(safeLon)) return null;
  const cacheKey = weatherCacheKey(safeLat, safeLon);
  const now = Date.now();
  const cached = weatherStateService.getCachedWeather(cacheKey);
  if (!force && cached && (now - Number(cached.fetchedAtMs || 0)) < WEATHER_REFRESH_INTERVAL_MS) {
    return { ...cached };
  }
  const [payload, place] = await Promise.all([
    fetchWeatherForLocation(safeLat, safeLon, { ocean, force }),
    getResolvedPlaceForLocation(safeLat, safeLon, force)
  ]);
  const state = buildLiveWeatherState({ lat: safeLat, lon: safeLon, source: 'live_earth_lookup' }, payload);
  state.locationDisplay = String(place?.display || '').trim();
  state.locationShortLabel = String(place?.shortLabel || '').trim();
  weatherStateService.setCachedWeather(cacheKey, state);
  return { ...state };
}

async function refreshLiveWeather(force = false) {
  if (appCtx.onMoon || appCtx.travelingToMoon || !(appCtx.isEnv?.(appCtx.ENV?.EARTH) || appCtx.oceanMode?.active)) {
    updateWeatherUi();
    return appCtx.liveWeatherState;
  }

  const location = resolveObservedEarthLocation();
  if (!Number.isFinite(location.lat) || !Number.isFinite(location.lon)) {
    updateWeatherUi();
    return appCtx.liveWeatherState;
  }

  const lastLive = appCtx.liveWeatherState || null;
  const now = Date.now();
  const movedKm = lastLive ? haversineKm(lastLive.lat, lastLive.lon, location.lat, location.lon) : Infinity;
  if (!force && movedKm < WEATHER_MOVE_THRESHOLD_KM && (now - _lastWeatherCheckMs) < WEATHER_CHECK_INTERVAL_MS) {
    if ((appCtx.weatherMode || 'live') === 'live') syncActiveWeatherState();
    else updateWeatherUi();
    return appCtx.liveWeatherState;
  }
  _lastWeatherCheckMs = now;

  const stale = !lastLive || (now - Number(lastLive.fetchedAtMs || 0)) >= WEATHER_REFRESH_INTERVAL_MS;
  const movedFar = movedKm >= WEATHER_MOVE_THRESHOLD_KM;
  if (!force && !stale && !movedFar) {
    if ((appCtx.weatherMode || 'live') === 'live') syncActiveWeatherState();
    return appCtx.liveWeatherState;
  }

  const cacheKey = weatherCacheKey(location.lat, location.lon);
  const cached = weatherStateService.getCachedWeather(cacheKey);
  if (!force && cached && (now - Number(cached.fetchedAtMs || 0)) < WEATHER_REFRESH_INTERVAL_MS) {
    weatherStateService.setLiveState(cached);
    void refreshLivePlace(location, false).then(() => {
      weatherStateService.updatePlaceLabels();
      updateWeatherUi();
    });
    if ((appCtx.weatherMode || 'live') === 'live') syncActiveWeatherState();
    else updateWeatherUi();
    return appCtx.liveWeatherState;
  }

  const requestKey = `${cacheKey}:${Math.floor(now / WEATHER_REFRESH_INTERVAL_MS)}`;
  if (_pendingWeatherRequest?.key === requestKey) {
    try {
      await _pendingWeatherRequest.promise;
    } catch {
      // fall through to the current live state
    }
    return appCtx.liveWeatherState;
  }

  const ocean = !!appCtx.oceanMode?.active;
  void refreshLivePlace(location, force).then(() => {
    weatherStateService.updatePlaceLabels();
    updateWeatherUi();
  });
  const promise = fetchWeatherForLocation(location.lat, location.lon, { ocean, force }).then((payload) => {
    const state = buildLiveWeatherState(location, payload);
    state.locationDisplay = String(appCtx.livePlaceState?.display || state.locationDisplay || '').trim();
    state.locationShortLabel = String(appCtx.livePlaceState?.shortLabel || state.locationShortLabel || '').trim();
    weatherStateService.setLiveState(state);
    weatherStateService.setCachedWeather(cacheKey, state);
    return state;
  }).catch((err) => {
    console.warn('[weather] live weather fetch failed:', err?.message || err);
    return appCtx.liveWeatherState;
  }).finally(() => {
    if (_pendingWeatherRequest?.key === requestKey) _pendingWeatherRequest = null;
    if ((appCtx.weatherMode || 'live') === 'live') syncActiveWeatherState();
    else updateWeatherUi();
  });
  _pendingWeatherRequest = { key: requestKey, promise };
  await promise;
  return appCtx.liveWeatherState;
}

function setWeatherMode(mode = 'live') {
  const nextMode = WEATHER_MODES.includes(mode) ? mode : 'live';
  weatherStateService.setMode(nextMode);
  if (nextMode === 'live') {
    syncActiveWeatherState();
    void refreshLiveWeather(false);
    return appCtx.weatherState;
  }
  return syncActiveWeatherState();
}

function cycleWeatherMode() {
  const current = appCtx.weatherMode || 'live';
  const index = WEATHER_MODES.indexOf(current);
  const nextMode = WEATHER_MODES[(index + 1 + WEATHER_MODES.length) % WEATHER_MODES.length];
  return setWeatherMode(nextMode);
}

function getWeatherSnapshot() {
  const active = appCtx.weatherState || null;
  if (!active) return null;
  return {
    source: active.source,
    mode: appCtx.weatherMode || 'live',
    lat: Number(active.lat?.toFixed?.(4) || 0),
    lon: Number(active.lon?.toFixed?.(4) || 0),
    conditionLabel: active.conditionLabel || '',
    category: active.category || '',
    temperatureF: Number.isFinite(active.temperatureF) ? Number(active.temperatureF.toFixed(1)) : null,
    temperatureC: Number.isFinite(active.temperatureC) ? Number(active.temperatureC.toFixed(1)) : null,
    apparentF: Number.isFinite(active.apparentF) ? Number(active.apparentF.toFixed(1)) : null,
    humidityPct: Number.isFinite(active.humidityPct) ? Number(active.humidityPct.toFixed(0)) : null,
    cloudCover: Number.isFinite(active.cloudCover) ? Number(active.cloudCover.toFixed(0)) : null,
    windMph: Number.isFinite(active.windMph) ? Number(active.windMph.toFixed(1)) : null,
    precipitationMm: Number.isFinite(active.precipitationMm) ? Number(active.precipitationMm.toFixed(1)) : null,
    localTimeLabel: getLiveClockLabel(active),
    locationDisplay: String(active.locationDisplay || appCtx.livePlaceState?.display || '').trim(),
    timezoneAbbr: active.timezoneAbbr || '',
    fetchedAtIso: active.fetchedAtIso || ''
  };
}

function inspectWeatherDescriptor(weatherCode, cloudCover = 0, isDay = true) {
  const descriptor = weatherCodeDescriptor(weatherCode);
  return {
    code: Number(weatherCode),
    category: descriptor.category,
    label: descriptor.label,
    icon: descriptor.icon,
    cloudCover: Number(cloudCover) || 0,
    isDay: Number(isDay) === 1 || isDay === true
  };
}

function disposeWeatherUi(reason = 'weather-ui-disposed') {
  return weatherLifecycleScope.dispose(reason);
}

Object.assign(appCtx, {
  applyWeatherPresentation,
  cycleWeatherMode,
  disposeWeatherUi,
  fetchWeatherSnapshotForLocation: getWeatherSnapshotForLocation,
  getHudLocationLabel,
  getWeatherSnapshot,
  inspectWeatherDescriptor,
  updateWeatherUi,
  refreshLiveWeather,
  setWeatherMode,
  syncWeatherState: syncActiveWeatherState
});

updateWeatherUi();
if (typeof window !== 'undefined') {
  weatherLifecycleScope.listen(window, 'resize', positionHudClock);
}

export {
  applyWeatherPresentation,
  cycleWeatherMode,
  disposeWeatherUi,
  getWeatherSnapshotForLocation,
  getHudLocationLabel,
  getWeatherSnapshot,
  inspectWeatherDescriptor,
  refreshLiveWeather,
  setWeatherMode,
  syncActiveWeatherState as syncWeatherState
};
