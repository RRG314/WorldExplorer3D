import {
  ATMOSPHERE_CLASS,
  getAstronomicalBody,
  LANDING_MODE,
  TRUTH_CLASS
} from '../../astronomy/body-catalog.js?v=1';
import { normalizeLatitudeDeg, normalizePositiveEastLongitudeDeg } from '../../astronomy/frames.js?v=1';

const PHYSICAL_ENVIRONMENT_SCHEMA_VERSION = 1;
const EARTH_SOLAR_IRRADIANCE_WM2 = 1361;
const STANDARD_GRAVITY_MPS2 = 9.80665;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

const PROFILE_ROWS = [
  {
    id: 'mercury', referenceTemperatureK: 440, referenceDensityKgM3: 0,
    scaleHeightM: null, lapseRateKPerM: 0, referenceVisibilityM: 1e9,
    weatherModelId: 'none', windReferenceMps: 0,
    hazards: ['vacuum', 'thermal_extremes', 'solar_exposure', 'radiation']
  },
  {
    id: 'venus', referenceTemperatureK: 737, referenceDensityKgM3: 65,
    scaleHeightM: 15_900, lapseRateKPerM: 0.0079, referenceVisibilityM: 3_000,
    weatherModelId: 'venus_dense_atmosphere', windReferenceMps: 1.0,
    hazards: ['extreme_heat', 'extreme_pressure', 'corrosive_cloud_context']
  },
  {
    id: 'earth', referenceTemperatureK: 288.15, referenceDensityKgM3: 1.225,
    scaleHeightM: 8_500, lapseRateKPerM: 0.0065, referenceVisibilityM: 80_000,
    weatherModelId: 'existing_earth_weather_adapter', windReferenceMps: 0,
    hazards: []
  },
  {
    id: 'moon', referenceTemperatureK: 250, referenceDensityKgM3: 0,
    scaleHeightM: null, lapseRateKPerM: 0, referenceVisibilityM: 1e9,
    weatherModelId: 'none', windReferenceMps: 0,
    hazards: ['vacuum', 'thermal_extremes', 'radiation']
  },
  {
    id: 'mars', referenceTemperatureK: 210, referenceDensityKgM3: 0.020,
    scaleHeightM: 11_100, lapseRateKPerM: 0.0045, referenceVisibilityM: 45_000,
    weatherModelId: 'mars_dust_and_wind', windReferenceMps: 7,
    hazards: ['low_pressure', 'cold', 'dust', 'radiation']
  },
  {
    id: 'jupiter', referenceTemperatureK: 165, referenceDensityKgM3: 0.16,
    scaleHeightM: 27_000, lapseRateKPerM: 0.002, referenceVisibilityM: 12_000,
    weatherModelId: 'jupiter_bands_and_storms', windReferenceMps: 120,
    hazards: ['radiation', 'extreme_wind', 'increasing_pressure', 'increasing_temperature']
  },
  {
    id: 'saturn', referenceTemperatureK: 134, referenceDensityKgM3: 0.19,
    scaleHeightM: 59_500, lapseRateKPerM: 0.0012, referenceVisibilityM: 18_000,
    weatherModelId: 'saturn_bands_and_storms', windReferenceMps: 180,
    hazards: ['extreme_wind', 'increasing_pressure', 'increasing_temperature']
  },
  {
    id: 'uranus', referenceTemperatureK: 76, referenceDensityKgM3: 0.42,
    scaleHeightM: 27_700, lapseRateKPerM: 0.001, referenceVisibilityM: 24_000,
    weatherModelId: 'uranus_methane_atmosphere', windReferenceMps: 90,
    hazards: ['extreme_cold', 'high_wind', 'increasing_pressure']
  },
  {
    id: 'neptune', referenceTemperatureK: 72, referenceDensityKgM3: 0.45,
    scaleHeightM: 19_700, lapseRateKPerM: 0.0012, referenceVisibilityM: 18_000,
    weatherModelId: 'neptune_methane_storms', windReferenceMps: 220,
    hazards: ['extreme_cold', 'extreme_wind', 'increasing_pressure']
  }
];

const PHYSICAL_ENVIRONMENT_PROFILES = deepFreeze(Object.fromEntries(PROFILE_ROWS.map((profile) => {
  const body = getAstronomicalBody(profile.id);
  if (!body) throw new Error(`Physical environment profile references unknown body: ${profile.id}`);
  return [profile.id, {
    schemaVersion: PHYSICAL_ENVIRONMENT_SCHEMA_VERSION,
    id: profile.id,
    bodyId: body.id,
    atmosphereClass: body.atmosphere.class,
    landingMode: body.exploration.landingMode,
    solidSurfaceAvailable: body.exploration.surfaceRegionEligible,
    referencePressurePa: Number(body.atmosphere.referencePressurePa || 0),
    referenceTemperatureK: profile.referenceTemperatureK,
    referenceDensityKgM3: profile.referenceDensityKgM3,
    scaleHeightM: profile.scaleHeightM,
    lapseRateKPerM: profile.lapseRateKPerM,
    referenceVisibilityM: profile.referenceVisibilityM,
    weatherModelId: profile.weatherModelId,
    windReferenceMps: profile.windReferenceMps,
    hazards: profile.hazards,
    provenance: {
      physicalFacts: TRUTH_CLASS.OBSERVED_OR_MEASURED,
      verticalProfile: TRUTH_CLASS.MODELED_PHYSICS,
      windField: profile.windReferenceMps === 0 ? TRUTH_CLASS.GAMEPLAY_ABSTRACTION : TRUTH_CLASS.MODELED_PHYSICS,
      visibility: TRUTH_CLASS.GAMEPLAY_ABSTRACTION
    }
  }];
})));

function finite(value, label, fallback = null) {
  const selected = value == null ? fallback : value;
  const number = Number(selected);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be a finite number.`);
  return number;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getPhysicalEnvironmentProfile(bodyValue) {
  const body = getAstronomicalBody(bodyValue);
  return body ? PHYSICAL_ENVIRONMENT_PROFILES[body.id] || null : null;
}

function gravityAtHeight(body, heightM) {
  const radiusM = body.physical.meanRadiusM;
  const radialDistanceM = Math.max(radiusM * 0.05, radiusM + heightM);
  return body.physical.surfaceGravityMps2 * (radiusM / radialDistanceM) ** 2;
}

function solarIrradiance(body) {
  const earth = getAstronomicalBody('earth');
  const distanceM = Number(body.physical.meanSolarDistanceM || earth.physical.meanSolarDistanceM);
  return EARTH_SOLAR_IRRADIANCE_WM2 * (earth.physical.meanSolarDistanceM / distanceM) ** 2;
}

function atmosphericState(profile, heightM) {
  if (profile.atmosphereClass === ATMOSPHERE_CLASS.NONE || profile.atmosphereClass === ATMOSPHERE_CLASS.EXOSPHERE) {
    return { pressurePa: 0, densityKgM3: 0 };
  }
  const exponent = clamp(-heightM / profile.scaleHeightM, -14, 14);
  const ratio = Math.exp(exponent);
  return {
    pressurePa: profile.referencePressurePa * ratio,
    densityKgM3: profile.referenceDensityKgM3 * ratio
  };
}

function modeledWind(profile, latitudeDeg, longitudeDegPositiveEast, timestampS, override = null) {
  if (override && typeof override === 'object') {
    return Object.freeze({
      eastMps: finite(override.eastMps, 'Wind east', 0),
      upMps: finite(override.upMps, 'Wind up', 0),
      northMps: finite(override.northMps, 'Wind north', 0),
      truthClass: override.truthClass || TRUTH_CLASS.MODELED_PHYSICS
    });
  }
  if (profile.windReferenceMps <= 0) {
    return Object.freeze({ eastMps: 0, upMps: 0, northMps: 0, truthClass: TRUTH_CLASS.GAMEPLAY_ABSTRACTION });
  }
  const phase = longitudeDegPositiveEast * Math.PI / 180 + timestampS / 18_000;
  const latitudeFactor = 0.55 + 0.45 * Math.cos(latitudeDeg * Math.PI / 180) ** 2;
  return Object.freeze({
    eastMps: profile.windReferenceMps * latitudeFactor * (0.78 + Math.sin(phase) * 0.22),
    upMps: profile.windReferenceMps * 0.015 * Math.sin(phase * 0.7),
    northMps: profile.windReferenceMps * 0.16 * Math.cos(phase * 0.5),
    truthClass: TRUTH_CLASS.MODELED_PHYSICS
  });
}

function samplePhysicalEnvironment(bodyValue, input = {}) {
  const body = getAstronomicalBody(bodyValue);
  const profile = getPhysicalEnvironmentProfile(bodyValue);
  if (!body || !profile) throw new RangeError(`No physical environment profile for: ${bodyValue}`);
  const heightM = finite(input.heightM, 'Environment height', 0);
  const latitudeDeg = normalizeLatitudeDeg(input.latitudeDeg ?? 0);
  const longitudeDegPositiveEast = normalizePositiveEastLongitudeDeg(input.longitudeDegPositiveEast ?? 0);
  const timestampS = finite(input.timestampS, 'Environment timestamp', 0);
  const atmosphere = atmosphericState(profile, heightM);
  const earthOverride = body.id === 'earth' && input.existingEarthConditions && typeof input.existingEarthConditions === 'object'
    ? input.existingEarthConditions
    : null;
  const pressurePa = earthOverride?.pressurePa == null
    ? atmosphere.pressurePa
    : finite(earthOverride.pressurePa, 'Earth pressure');
  const densityKgM3 = earthOverride?.densityKgM3 == null
    ? atmosphere.densityKgM3
    : finite(earthOverride.densityKgM3, 'Earth density');
  const modeledTemperatureK = clamp(profile.referenceTemperatureK - profile.lapseRateKPerM * heightM, 20, 2000);
  const temperatureK = earthOverride?.temperatureK == null
    ? modeledTemperatureK
    : finite(earthOverride.temperatureK, 'Earth temperature');
  const visibilityM = earthOverride?.visibilityM == null
    ? profile.referenceVisibilityM
    : finite(earthOverride.visibilityM, 'Earth visibility');
  const wind = modeledWind(profile, latitudeDeg, longitudeDegPositiveEast, timestampS, earthOverride?.wind);
  const gravityMps2 = gravityAtHeight(body, heightM);
  const hazards = [...profile.hazards];
  if (profile.landingMode === LANDING_MODE.ATMOSPHERIC_DESCENT && pressurePa > 2_000_000) hazards.push('craft_pressure_limit_context');
  if (profile.landingMode === LANDING_MODE.ATMOSPHERIC_DESCENT && temperatureK > 500) hazards.push('craft_temperature_limit_context');

  return deepFreeze({
    schemaVersion: PHYSICAL_ENVIRONMENT_SCHEMA_VERSION,
    bodyId: body.id,
    profileId: profile.id,
    timestampS,
    location: { latitudeDeg, longitudeDegPositiveEast, heightM },
    gravityVectorMps2: { east: 0, up: -gravityMps2, north: 0 },
    gravityMagnitudeMps2: gravityMps2,
    atmosphericDensityKgM3: densityKgM3,
    pressurePa,
    temperatureK,
    windVectorMps: wind,
    solarIrradianceWm2: solarIrradiance(body),
    visibilityM,
    weatherModelId: profile.weatherModelId,
    solidSurfaceAvailable: profile.solidSurfaceAvailable,
    landingMode: profile.landingMode,
    hazards: [...new Set(hazards)],
    truthManifest: {
      gravity: TRUTH_CLASS.MODELED_PHYSICS,
      atmosphereReference: TRUTH_CLASS.OBSERVED_OR_MEASURED,
      verticalProfile: profile.provenance.verticalProfile,
      wind: wind.truthClass,
      illumination: TRUTH_CLASS.MODELED_PHYSICS,
      visibility: earthOverride?.visibilityM == null ? profile.provenance.visibility : (earthOverride.truthClass || TRUTH_CLASS.MODELED_PHYSICS)
    },
    usesExistingEarthWeatherAdapter: body.id === 'earth'
  });
}

export {
  EARTH_SOLAR_IRRADIANCE_WM2,
  getPhysicalEnvironmentProfile,
  PHYSICAL_ENVIRONMENT_PROFILES,
  PHYSICAL_ENVIRONMENT_SCHEMA_VERSION,
  samplePhysicalEnvironment,
  STANDARD_GRAVITY_MPS2
};
