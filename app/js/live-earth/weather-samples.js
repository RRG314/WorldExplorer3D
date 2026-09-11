import { operationalFeedService } from '../geospatial/operational-feeds.js?v=1';
import { weatherCodeDescriptor } from '../weather/catalog.js?v=1';

function roundTo(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function buildSnapshot(sample, payload) {
  const current = payload?.current || {};
  const descriptor = weatherCodeDescriptor(current.weather_code);
  const temperatureC = Number(current.temperature_2m);
  const apparentC = Number(current.apparent_temperature);
  return {
    source: 'open-meteo-current',
    mode: 'live',
    lat: sample.lat,
    lon: sample.lon,
    locationDisplay: sample.label,
    locationShortLabel: sample.label,
    fetchedAtMs: Date.now(),
    localTimeIso: String(current.time || ''),
    timezone: String(payload?.timezone || ''),
    timezoneAbbr: String(payload?.timezone_abbreviation || ''),
    conditionCode: Number(current.weather_code),
    conditionLabel: descriptor.label,
    category: descriptor.category,
    icon: descriptor.icon,
    temperatureC: roundTo(temperatureC),
    temperatureF: roundTo(Number.isFinite(temperatureC) ? temperatureC * 9 / 5 + 32 : null),
    apparentC: roundTo(apparentC),
    apparentF: roundTo(Number.isFinite(apparentC) ? apparentC * 9 / 5 + 32 : null),
    humidityPct: roundTo(current.relative_humidity_2m, 0),
    cloudCover: roundTo(current.cloud_cover, 0),
    windKph: roundTo(current.wind_speed_10m),
    windMph: roundTo(Number(current.wind_speed_10m) * 0.621371),
    windDirectionDeg: roundTo(current.wind_direction_10m, 0),
    precipitationMm: roundTo(current.precipitation),
    rainMm: roundTo(current.rain),
    showersMm: roundTo(current.showers),
    snowfallCm: roundTo(current.snowfall),
    visibilityM: roundTo(current.visibility, 0),
    isDay: Number(current.is_day) === 1
  };
}

async function getWeatherSampleSnapshots(samples, force = false) {
  const result = await operationalFeedService.weather(samples, { force });
  return samples.map((sample, index) => ({
    ...sample,
    snapshot: result.items[index] ? buildSnapshot(sample, result.items[index]) : null
  }));
}

export { getWeatherSampleSnapshots };
