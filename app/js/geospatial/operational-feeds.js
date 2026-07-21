import { createProviderRegistry } from './provider-registry.js?v=2';

const CELESTRAK_BASE = 'https://celestrak.org/NORAD/elements/gp.php';
const USGS_DAY_FEED = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';
const OPEN_METEO_CURRENT = 'https://api.open-meteo.com/v1/forecast';
const WEATHER_FIELDS = 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,precipitation,rain,showers,snowfall,visibility';
const CELESTRAK_GROUPS = new Set(['stations', 'weather', 'resource', 'science']);

function finiteCoordinate(value, min, max, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new RangeError(`${label} is invalid.`);
  return number;
}

function normalizeCelestrakRequest(input = {}) {
  const sources = [...new Set((input.sources || []).map((value) => String(value).trim()))]
    .filter((source) => CELESTRAK_GROUPS.has(source))
    .sort();
  if (!sources.length) throw new Error('At least one supported CelesTrak group is required.');
  return Object.freeze({ sources });
}

function normalizeWeatherRequest(input = {}) {
  const rawLocations = Array.isArray(input.locations) ? input.locations : [input];
  const locations = rawLocations.slice(0, 16).map((location) => Object.freeze({
    lat: finiteCoordinate(location.lat, -90, 90, 'Weather latitude'),
    lon: finiteCoordinate(location.lon, -180, 180, 'Weather longitude')
  }));
  if (!locations.length) throw new Error('At least one weather location is required.');
  return Object.freeze({ locations, ocean: input.ocean === true });
}

async function readJson(response, providerId) {
  if (!response.ok) throw new Error(`${providerId}_http_${response.status}`);
  return response.json();
}

function createOperationalFeedService(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch?.bind(globalThis);
  if (typeof fetchImpl !== 'function') throw new Error('Operational feeds require fetch support.');
  const registry = createProviderRegistry({ now: options.now, maxCacheEntries: 40 });

  registry.register({
    id: 'celestrak-gp',
    sourceId: 'celestrak',
    cacheTtlMs: 2 * 60 * 60 * 1000,
    timeoutMs: 10000,
    normalizeRequest: normalizeCelestrakRequest,
    async query(request, context) {
      const settled = await Promise.allSettled(request.sources.map(async (source) => {
        const url = new URL(CELESTRAK_BASE);
        url.searchParams.set('GROUP', source);
        url.searchParams.set('FORMAT', 'tle');
        const response = await fetchImpl(url.href, { signal: context.signal, cache: 'no-store' });
        if (!response.ok) throw new Error(`celestrak_${source}_${response.status}`);
        return { source, text: await response.text() };
      }));
      const items = settled.filter((result) => result.status === 'fulfilled').map((result) => result.value);
      const warnings = settled.filter((result) => result.status === 'rejected').map((result) => String(result.reason?.message || result.reason));
      if (!items.length) throw new Error(warnings[0] || 'CelesTrak feeds unavailable.');
      return { items, warnings };
    }
  });

  registry.register({
    id: 'usgs-earthquakes-day',
    sourceId: 'usgs-earthquakes',
    cacheTtlMs: 5 * 60 * 1000,
    timeoutMs: 10000,
    normalizeRequest: () => Object.freeze({ window: 'day' }),
    async query(_request, context) {
      const response = await fetchImpl(USGS_DAY_FEED, { signal: context.signal, cache: 'no-store' });
      const payload = await readJson(response, 'usgs_earthquakes');
      return { items: Array.isArray(payload?.features) ? payload.features : [] };
    }
  });

  registry.register({
    id: 'open-meteo-current',
    sourceId: 'open-meteo',
    cacheTtlMs: 10 * 60 * 1000,
    timeoutMs: 10000,
    normalizeRequest: normalizeWeatherRequest,
    async query(request, context) {
      const url = new URL(OPEN_METEO_CURRENT);
      url.searchParams.set('latitude', request.locations.map((location) => location.lat.toFixed(4)).join(','));
      url.searchParams.set('longitude', request.locations.map((location) => location.lon.toFixed(4)).join(','));
      url.searchParams.set('current', WEATHER_FIELDS);
      url.searchParams.set('timezone', 'auto');
      url.searchParams.set('forecast_days', '1');
      if (request.ocean) url.searchParams.set('cell_selection', 'sea');
      const response = await fetchImpl(url.href, { signal: context.signal });
      const payload = await readJson(response, 'open_meteo');
      return { items: Array.isArray(payload) ? payload : [payload] };
    }
  });

  return Object.freeze({
    celestrak(sources, queryOptions = {}) {
      return registry.query('celestrak-gp', { sources }, queryOptions);
    },
    earthquakes(queryOptions = {}) {
      return registry.query('usgs-earthquakes-day', {}, queryOptions);
    },
    weather(locations, options = {}) {
      return registry.query('open-meteo-current', { locations, ocean: options.ocean === true }, { force: options.force === true });
    },
    diagnostics() {
      return registry.snapshot();
    }
  });
}

const operationalFeedService = createOperationalFeedService();

export {
  createOperationalFeedService,
  normalizeCelestrakRequest,
  normalizeWeatherRequest,
  operationalFeedService
};
