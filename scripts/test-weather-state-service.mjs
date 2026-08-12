import assert from 'node:assert/strict';
import { createWeatherStateService } from '../app/js/weather/state-service.js';

const context = Object.create(null);
const service = createWeatherStateService(context);
assert.equal(context.weatherMode, 'live');
assert.equal(context.liveWeatherState, null);
assert.equal(context.weatherState, null);
assert.equal(context.weatherCache, undefined);
assert.equal(context.placeCache, undefined);

const live = { lat: 39.29, lon: -76.61, conditionLabel: 'Cloudy' };
assert.equal(service.setLiveState(live), live);
assert.equal(service.setActiveState(live), live);
service.setPlaceState({ display: 'Baltimore, Maryland', shortLabel: 'Baltimore' });
service.updatePlaceLabels();
assert.equal(live.locationDisplay, 'Baltimore, Maryland');
assert.equal(live.locationShortLabel, 'Baltimore');
assert.equal(context.liveWeatherState, live);
assert.equal(context.weatherState, live);

const manual = { source: 'manual', conditionLabel: 'Rain' };
service.setMode('rain');
service.setActiveState(manual);
service.setCachedWeather('39.3:-76.6', live);
service.setCachedPlace('39.29:-76.61', service.getPlaceState());
assert.equal(service.getCachedWeather('39.3:-76.6'), live);
assert.equal(service.getCachedPlace('39.29:-76.61'), service.getPlaceState());
assert.deepEqual(service.snapshot(), {
  mode: 'rain',
  liveState: live,
  activeState: manual,
  placeState: service.getPlaceState(),
  weatherCacheEntries: 1,
  placeCacheEntries: 1
});

console.log(JSON.stringify({
  ok: true,
  contract: 'weather-state-one-writer',
  mode: service.getMode(),
  weatherCacheEntries: service.snapshot().weatherCacheEntries,
  placeCacheEntries: service.snapshot().placeCacheEntries
}, null, 2));
