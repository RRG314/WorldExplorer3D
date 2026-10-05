import { operationalFeedService } from '../geospatial/operational-feeds.js?v=1';
import { weatherCodeDescriptor } from '../weather/catalog.js?v=1';

function roundTo(value, digits = 1) {
  const number = value == null || value === '' ? NaN : Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function buildSnapshot(sample, payload) {
  const current = payload?.current || {};
  const descriptor = weatherCodeDescriptor(current.weather_code);
  const temperatureC = current.temperature_2m ?? NaN;
  const apparentC = current.apparent_temperature ?? NaN;
  return {
    source: 'met-norway-current',
    mode: 'live',
    lat: sample.lat,
    lon: sample.lon,
    locationDisplay: sample.label,
    locationShortLabel: sample.label,
    fetchedAtMs: Date.now(),
    localTimeIso: String(current.time || ''),
    timezone: String(payload?.timezone || ''),
    timezoneAbbr: String(payload?.timezone_abbreviation || ''),
    conditionCode: current.weather_code ?? null,
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
    windMph: roundTo((current.wind_speed_10m ?? NaN) * 0.621371),
    windDirectionDeg: roundTo(current.wind_direction_10m, 0),
    precipitationMm: roundTo(current.precipitation),
    rainMm: roundTo(current.rain),
    showersMm: roundTo(current.showers),
    snowfallCm: roundTo(current.snowfall),
    visibilityM: roundTo(current.visibility, 0),
    isDay: current.is_day == null ? null : Number(current.is_day) === 1
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


export async function ensureSelectedWeather(ctx, state, force = false) {
  const selected = ctx.selectorSelection(state);
  const token = state.selectionWeatherRequestToken = (state.selectionWeatherRequestToken || 0) + 1;
  state.selectionWeatherLoading = false;
  if (!Number.isFinite(selected?.lat) || !Number.isFinite(selected?.lon)) {state.selectionWeather = null;return null;}
  const {lat,lon} = selected, current=state.selectionWeather;
  if (!force && current && Math.abs(current.lat-lat)<0.01 && Math.abs(current.lon-lon)<0.01 && Date.now()-Number(current.fetchedAtMs||0)<600000) return current;
  state.selectionWeather = null;state.selectionWeatherLoading = true;
  const ownsSelection=()=>{const latest=ctx.selectorSelection(state);return state.selectionWeatherRequestToken===token&&latest?.lat===lat&&latest?.lon===lon;};
  try {
    const result=await ctx.getWeatherSnapshotForLocation(lat,lon,{force});
    if(ownsSelection())state.selectionWeather=result;
  } catch {if(ownsSelection())state.selectionWeather=null;}
  finally {if(state.selectionWeatherRequestToken===token)state.selectionWeatherLoading=false;}
  return ownsSelection()?state.selectionWeather:null;
}
