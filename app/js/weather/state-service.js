import { ctx as appCtx } from '../shared-context.js?v=55';

function createWeatherStateService(context = appCtx) {
  let mode = 'live';
  let liveState = null;
  let activeState = null;
  let placeState = null;
  const weatherCache = new Map();
  const placeCache = new Map();

  function publish() {
    context.weatherMode = mode;
    context.liveWeatherState = liveState;
    context.weatherState = activeState;
    context.livePlaceState = placeState;
  }

  function setMode(nextMode = 'live') {
    mode = String(nextMode || 'live');
    context.weatherMode = mode;
    return mode;
  }

  function setLiveState(nextState = null) {
    liveState = nextState || null;
    context.liveWeatherState = liveState;
    return liveState;
  }

  function setActiveState(nextState = null) {
    activeState = nextState || null;
    context.weatherState = activeState;
    return activeState;
  }

  function setPlaceState(nextState = null) {
    placeState = nextState || null;
    context.livePlaceState = placeState;
    return placeState;
  }

  function updatePlaceLabels(place = placeState) {
    const display = String(place?.display || '').trim();
    const shortLabel = String(place?.shortLabel || '').trim();
    const apply = (state) => {
      if (!state) return;
      state.locationDisplay = display || String(state.locationDisplay || '').trim();
      state.locationShortLabel = shortLabel || String(state.locationShortLabel || '').trim();
    };
    apply(liveState);
    if (activeState !== liveState) apply(activeState);
    return activeState || liveState;
  }

  function getCachedPlace(key) {
    return placeCache.get(String(key)) || null;
  }

  function getCachedWeather(key) {
    return weatherCache.get(String(key)) || null;
  }

  function setCachedPlace(key, value) {
    placeCache.set(String(key), value);
    return value;
  }

  function setCachedWeather(key, value) {
    weatherCache.set(String(key), value);
    return value;
  }

  function snapshot() {
    return Object.freeze({
      mode,
      liveState,
      activeState,
      placeState,
      weatherCacheEntries: weatherCache.size,
      placeCacheEntries: placeCache.size
    });
  }

  publish();
  return Object.freeze({
    getActiveState: () => activeState,
    getCachedPlace,
    getCachedWeather,
    getLiveState: () => liveState,
    getMode: () => mode,
    getPlaceState: () => placeState,
    setActiveState,
    setCachedPlace,
    setCachedWeather,
    setLiveState,
    setMode,
    setPlaceState,
    snapshot,
    updatePlaceLabels
  });
}

const weatherStateService = createWeatherStateService(appCtx);

export { createWeatherStateService, weatherStateService };
