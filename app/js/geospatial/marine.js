import { createProvenance } from './data-contract.js?v=3';
import { createProviderRegistry } from './provider-registry.js?v=2';

const MARINE_API = 'https://marine-api.open-meteo.com/v1/marine';
const NOAA_METADATA_API = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json';
const NOAA_DATA_API = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';
const MARINE_FIELDS = 'wave_height,wave_direction,wave_period,wind_wave_height,swell_wave_height,swell_wave_direction,swell_wave_period,ocean_current_velocity,ocean_current_direction,sea_surface_temperature,sea_level_height_msl';
const NOAA_COVERAGE_KM = 250;

function normalizeMarineLocation(input = {}) {
  const lat = Number(input.lat);
  const lon = Number(input.lon);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new RangeError('Marine latitude is invalid.');
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new RangeError('Marine longitude is invalid.');
  return Object.freeze({ lat, lon });
}

function haversineKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)));
}

function normalizeStation(station = {}) {
  const lat = Number(station.lat);
  const lon = Number(station.lng ?? station.lon);
  if (!station.id || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return Object.freeze({
    id: String(station.id),
    name: String(station.name || station.id),
    lat,
    lon,
    state: String(station.state || ''),
    tidal: station.tidal !== false,
    greatLakes: station.greatlakes === true
  });
}

function nearestStation(stations = [], location = {}) {
  let nearest = null;
  for (const station of stations) {
    const distanceKm = haversineKm(location, station);
    if (!nearest || distanceKm < nearest.distanceKm) nearest = { ...station, distanceKm };
  }
  return nearest;
}

function numberOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function noaaTime(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const parsed = new Date(`${text.replace(' ', 'T')}Z`);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : '';
}

function normalizeMarineModel(payload = {}, requested = {}, fetchedAt = new Date().toISOString()) {
  const current = payload.current || {};
  const lat = numberOrNull(payload.latitude);
  const lon = numberOrNull(payload.longitude);
  const fields = {
    waveHeightM: numberOrNull(current.wave_height),
    waveDirectionDeg: numberOrNull(current.wave_direction),
    wavePeriodS: numberOrNull(current.wave_period),
    windWaveHeightM: numberOrNull(current.wind_wave_height),
    swellHeightM: numberOrNull(current.swell_wave_height),
    swellDirectionDeg: numberOrNull(current.swell_wave_direction),
    swellPeriodS: numberOrNull(current.swell_wave_period),
    currentVelocityKph: numberOrNull(current.ocean_current_velocity),
    currentDirectionDeg: numberOrNull(current.ocean_current_direction),
    seaSurfaceTemperatureC: numberOrNull(current.sea_surface_temperature),
    seaLevelHeightMslM: numberOrNull(current.sea_level_height_msl)
  };
  return Object.freeze({
    sourceId: 'open-meteo-marine',
    modelLat: lat,
    modelLon: lon,
    gridDistanceKm: lat != null && lon != null ? haversineKm(requested, { lat, lon }) : null,
    validAt: String(current.time || ''),
    hasGuidance: Object.values(fields).some((value) => value != null),
    ...fields,
    provenance: createProvenance({ sourceId: 'open-meteo-marine', validAt: current.time, fetchedAt })
  });
}

function normalizeNoaaObservation(payload = {}, station = {}, fetchedAt = new Date().toISOString()) {
  const value = payload.data?.[0];
  if (!value || numberOrNull(value.v) == null) return null;
  const observedAt = noaaTime(value.t);
  return Object.freeze({
    stationId: station.id,
    stationName: station.name,
    valueM: Number(value.v),
    sigmaM: numberOrNull(value.s),
    datum: station.greatLakes ? 'IGLD' : 'MLLW',
    units: 'm',
    quality: value.q === 'p' ? 'preliminary' : (value.q === 'v' ? 'verified' : 'reported'),
    observedAt,
    provenance: createProvenance({ sourceId: 'noaa-coops-observations', observedAt, fetchedAt })
  });
}

function normalizeNoaaPredictions(payload = {}, station = {}, fetchedAt = new Date().toISOString()) {
  return (payload.predictions || []).map((prediction) => {
    const validAt = noaaTime(prediction.t);
    const valueM = numberOrNull(prediction.v);
    if (!validAt || valueM == null) return null;
    return Object.freeze({
      stationId: station.id,
      stationName: station.name,
      type: prediction.type === 'H' ? 'high' : (prediction.type === 'L' ? 'low' : 'prediction'),
      valueM,
      datum: station.greatLakes ? 'IGLD' : 'MLLW',
      units: 'm',
      validAt,
      provenance: createProvenance({ sourceId: 'noaa-coops-predictions', truthType: 'predicted', validAt, fetchedAt })
    });
  }).filter(Boolean);
}

async function jsonResponse(response, provider) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) throw new Error(payload?.error?.message || `${provider}_http_${response.status}`);
  return payload;
}

function stationRequest(input = {}) {
  const stationId = String(input.stationId || '').trim();
  if (!/^[a-z0-9]{4,10}$/i.test(stationId)) throw new Error('NOAA station id is invalid.');
  return Object.freeze({ stationId, greatLakes: input.greatLakes === true });
}

function createMarineService(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch?.bind(globalThis);
  if (typeof fetchImpl !== 'function') throw new Error('Marine service requires fetch support.');
  const registry = createProviderRegistry({ now: options.now, maxCacheEntries: 32 });

  registry.register({
    id: 'open-meteo-marine', sourceId: 'open-meteo-marine', cacheTtlMs: 15 * 60 * 1000, timeoutMs: 10000,
    normalizeRequest: normalizeMarineLocation,
    async query(request, context) {
      const url = new URL(MARINE_API);
      Object.entries({ latitude: request.lat.toFixed(4), longitude: request.lon.toFixed(4), current: MARINE_FIELDS, cell_selection: 'sea', timezone: 'GMT', forecast_days: 1 }).forEach(([key, value]) => url.searchParams.set(key, String(value)));
      const payload = await jsonResponse(await fetchImpl(url.href, { signal: context.signal }), 'open_meteo_marine');
      return { items: [payload] };
    }
  });
  registry.register({
    id: 'noaa-water-level-stations', sourceId: 'noaa-coops-observations', cacheTtlMs: 24 * 60 * 60 * 1000, timeoutMs: 12000,
    normalizeRequest: () => Object.freeze({ type: 'waterlevels' }),
    async query(_request, context) {
      const payload = await jsonResponse(await fetchImpl(`${NOAA_METADATA_API}?type=waterlevels&units=metric`, { signal: context.signal }), 'noaa_stations');
      return { items: (payload.stations || payload.stationList || []).map(normalizeStation).filter(Boolean) };
    }
  });
  registry.register({
    id: 'noaa-water-level', sourceId: 'noaa-coops-observations', cacheTtlMs: 5 * 60 * 1000, timeoutMs: 10000,
    normalizeRequest: stationRequest,
    async query(request, context) {
      const url = new URL(NOAA_DATA_API);
      Object.entries({ product: 'water_level', date: 'latest', station: request.stationId, datum: request.greatLakes ? 'IGLD' : 'MLLW', time_zone: 'gmt', units: 'metric', format: 'json', application: 'WorldExplorer3D' }).forEach(([key, value]) => url.searchParams.set(key, value));
      return { items: [await jsonResponse(await fetchImpl(url.href, { signal: context.signal }), 'noaa_water_level')] };
    }
  });
  registry.register({
    id: 'noaa-tide-predictions', sourceId: 'noaa-coops-predictions', cacheTtlMs: 30 * 60 * 1000, timeoutMs: 10000,
    normalizeRequest: stationRequest,
    async query(request, context) {
      const url = new URL(NOAA_DATA_API);
      Object.entries({ product: 'predictions', date: 'today', interval: 'hilo', station: request.stationId, datum: request.greatLakes ? 'IGLD' : 'MLLW', time_zone: 'gmt', units: 'metric', format: 'json', application: 'WorldExplorer3D' }).forEach(([key, value]) => url.searchParams.set(key, value));
      return { items: [await jsonResponse(await fetchImpl(url.href, { signal: context.signal }), 'noaa_predictions')] };
    }
  });

  async function selected(location, queryOptions = {}) {
    const requested = normalizeMarineLocation(location);
    const force = queryOptions.force === true;
    const [modelResult, stationsResult] = await Promise.allSettled([
      registry.query('open-meteo-marine', requested, { force }),
      registry.query('noaa-water-level-stations', {}, { force: false })
    ]);
    const warnings = [];
    const model = modelResult.status === 'fulfilled'
      ? normalizeMarineModel(modelResult.value.items[0], requested, modelResult.value.fetchedAt)
      : (warnings.push(String(modelResult.reason?.message || modelResult.reason)), null);
    const stations = stationsResult.status === 'fulfilled' ? stationsResult.value.items : [];
    if (stationsResult.status === 'rejected') warnings.push(String(stationsResult.reason?.message || stationsResult.reason));
    const nearest = nearestStation(stations, requested);
    const station = nearest && nearest.distanceKm <= NOAA_COVERAGE_KM ? nearest : null;
    let observation = null;
    let predictions = [];
    if (station) {
      const stationRequestValue = { stationId: station.id, greatLakes: station.greatLakes };
      const [observedResult, predictedResult] = await Promise.allSettled([
        registry.query('noaa-water-level', stationRequestValue, { force }),
        station.tidal ? registry.query('noaa-tide-predictions', stationRequestValue, { force }) : Promise.resolve(null)
      ]);
      if (observedResult.status === 'fulfilled') observation = normalizeNoaaObservation(observedResult.value.items[0], station, observedResult.value.fetchedAt);
      else warnings.push(String(observedResult.reason?.message || observedResult.reason));
      if (predictedResult.status === 'fulfilled' && predictedResult.value) predictions = normalizeNoaaPredictions(predictedResult.value.items[0], station, predictedResult.value.fetchedAt);
      else if (predictedResult.status === 'rejected') warnings.push(String(predictedResult.reason?.message || predictedResult.reason));
    }
    return Object.freeze({ requested, model, station, observation, predictions, warnings, noaaCoverageKm: NOAA_COVERAGE_KM });
  }

  return Object.freeze({ selected, diagnostics: () => registry.snapshot() });
}

const marineService = createMarineService();

export {
  createMarineService,
  marineService,
  nearestStation,
  normalizeMarineLocation,
  normalizeMarineModel,
  normalizeNoaaObservation,
  normalizeNoaaPredictions
};
