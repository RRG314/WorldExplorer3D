// Read the existing weather owner. No request, cache, visual mode or global
// weather state is changed by a field source check.
const timestamp = (v) => {
  const n = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const number = (v) => (Number.isFinite(v) ? v : null);
export function meteorologyAgeBand(ageSeconds) {
  return ageSeconds === null
    ? 'not-available'
    : ageSeconds < 3600
      ? 'under-one-hour'
      : ageSeconds <= 21600
        ? 'one-to-six-hours'
        : 'over-six-hours';
}
export function meteorologySourceSnapshot(runtime, now = Date.now()) {
  const mode = String(runtime.weatherMode || 'live').slice(0, 30),
    state = mode === 'live' ? runtime.liveWeatherState : runtime.weatherState,
    classification = !state
      ? 'unavailable'
      : mode !== 'live' || state.source === 'manual'
        ? 'manual-simulation'
        : state.sourceId === 'met-norway'
          ? 'forecast-model'
          : 'unidentified-source',
    issuedAt = classification === 'forecast-model' ? timestamp(state.issuedAt) : null,
    validAt = classification === 'forecast-model' ? timestamp(state.localTimeIso) : null,
    fetchedAt = classification === 'forecast-model' ? timestamp(state.fetchedAtMs) : null,
    ageSeconds = issuedAt !== null && issuedAt <= now ? (now - issuedAt) / 1000 : null;
  return {
    truthType: 'existing-weather-source-check',
    owner: 'weather-state-service',
    checkedAt: now,
    mode,
    classification,
    provider: classification === 'forecast-model' ? 'MET Norway Locationforecast' : null,
    issuedAt,
    validAt,
    fetchedAt,
    ageSeconds,
    ageBand: meteorologyAgeBand(ageSeconds),
    location:
      state && Number.isFinite(state.lat) && Number.isFinite(state.lon)
        ? { lat: state.lat, lon: state.lon }
        : null,
    values:
      classification === 'forecast-model'
        ? {
            windMps: Number.isFinite(state.windKph) ? state.windKph / 3.6 : null,
            windFromDeg: number(state.windDirectionDeg),
            cloudPercent: number(state.cloudCover),
          }
        : null,
  };
}
export function validateMeteorologySource(value, now) {
  if (
    !value ||
    value.truthType !== 'existing-weather-source-check' ||
    value.owner !== 'weather-state-service' ||
    !['unavailable', 'manual-simulation', 'forecast-model', 'unidentified-source'].includes(
      value.classification
    ) ||
    !Number.isFinite(value.checkedAt) ||
    value.checkedAt > now ||
    now - value.checkedAt > 120000 ||
    typeof value.mode !== 'string'
  )
    throw Error('Refresh and identify the existing weather source before recording it.');
  const model = value.classification === 'forecast-model',
    expected =
      model && value.issuedAt !== null && value.issuedAt <= value.checkedAt
        ? (value.checkedAt - value.issuedAt) / 1000
        : null;
  if (
    ![value.issuedAt, value.validAt, value.fetchedAt].every(
      (v) => v === null || (Number.isFinite(v) && v > 0)
    ) ||
    (model
      ? value.provider !== 'MET Norway Locationforecast' ||
        !value.values ||
        !['windMps', 'windFromDeg', 'cloudPercent'].every(
          (k) => value.values[k] === null || Number.isFinite(value.values[k])
        )
      : value.provider !== null ||
        value.values !== null ||
        value.issuedAt !== null ||
        value.validAt !== null ||
        value.fetchedAt !== null) ||
    value.ageSeconds !== expected ||
    value.ageBand !== meteorologyAgeBand(expected)
  )
    throw Error(
      'Keep the source issue time, unknown age and forecast/observation distinction intact.'
    );
  return JSON.parse(JSON.stringify(value));
}
