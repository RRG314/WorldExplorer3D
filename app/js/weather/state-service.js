export const WEATHER_CACHE_LIMIT=64;
export const PLACE_CACHE_LIMIT=128;
import { ctx as appCtx } from '../shared-context.js?v=55';

import { haversineKm } from '../earth-location.js?v=2';

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
      // A geocoder reply may arrive after the observer has changed locations.
      if (!state || !place || haversineKm(state.lat, state.lon, place.lat, place.lon) >= 12) return;
      state.locationDisplay = display || String(state.locationDisplay || '').trim();
      state.locationShortLabel = shortLabel || String(state.locationShortLabel || '').trim();
    };
    apply(liveState);
    if (activeState !== liveState) apply(activeState);
    return activeState || liveState;
  }

  function touch(cache,key){key=String(key);const value=cache.get(key);if(value){cache.delete(key);cache.set(key,value);}return value||null;}
  function retain(cache,key,value,limit){cache.delete(String(key));cache.set(String(key),value);while(cache.size>limit)cache.delete(cache.keys().next().value);return value;}
  function getCachedPlace(key) {return touch(placeCache,key);}

  function getCachedWeather(key) {
    return touch(weatherCache,key);
  }

  function setCachedPlace(key, value) {
    return retain(placeCache,key,value,PLACE_CACHE_LIMIT);
  }

  function setCachedWeather(key, value) {
    return retain(weatherCache,key,value,WEATHER_CACHE_LIMIT);
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
