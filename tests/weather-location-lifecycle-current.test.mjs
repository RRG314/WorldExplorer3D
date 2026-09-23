import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createWeatherStateService } from '../app/js/weather/state-service.js';

async function harness(kind) {
  const appCtx = { ENV: { EARTH: 'EARTH' }, isEnv: () => true, testLocation: { lat: 39, lon: -76 }, selLoc: 'custom', customLoc: { name: 'Selected place' } };
  const service = createWeatherStateService(appCtx);
  const pending = [];
  const context = vm.createContext({
    console, Date, Intl, Math, Number, String, Promise, setTimeout, clearTimeout, AbortController,
    window: { setTimeout, clearTimeout },
    document: { getElementById: () => null, querySelector: () => null },
    THREE: { Color: class {} },
    fetch: url => new Promise(resolve => pending.push({ url, resolve: data => resolve({ ok: true, json: async () => data }) }))
  });
  const placeExports = Object.fromEntries(['assignResolvedPlace','cleanCountry','fetchJsonWithTimeout','fetchPlaceForLocation','getActiveWeatherLocationLabel','getFallbackPlaceLabel','parseReverseAddress','placeCacheKey','refreshLivePlace','uniqueNonEmptyParts','weatherCacheKey'].map(name => [name, () => null]));
  Object.assign(placeExports, {
    weatherCacheKey: (lat, lon) => `${lat}:${lon}`, placeCacheKey: (lat, lon) => `${lat}:${lon}`,
    refreshLivePlace: async () => null, getActiveWeatherLocationLabel: () => 'Selected place'
  });
  const modules = {
    'shared-context.js': { ctx: appCtx },
    'state-service.js': { weatherStateService: service },
    'earth-location.js': { resolveObservedEarthLocation: () => ({ ...appCtx.testLocation }), haversineKm: (a,b,c,d) => Math.hypot(a-c,b-d)*100 },
    'place-resolver.js': placeExports,
    'catalog.js': { weatherCodeDescriptor: () => ({ label: 'Clear', icon: '', category: 'clear' }) },
    'operational-feeds.js': { operationalFeedService: { weather: locations => new Promise(resolve => pending.push({ locations, resolve: current => resolve({ items: [{ current }] }) })) } },
    'lifecycle-scope.js': { createLifecycleScope: () => ({ listen() {}, dispose() {} }) }
  };
  const file = kind === 'weather' ? 'app/js/weather.js' : 'app/js/weather/place-resolver.js';
  const module = new vm.SourceTextModule(await fs.readFile(file,'utf8'), { context, identifier: file });
  await module.link(specifier => {
    const key = specifier.split('/').pop().split('?')[0];
    const values = modules[key]; assert.ok(values, `Unreviewed dependency ${specifier}`);
    return new vm.SyntheticModule(Object.keys(values), function () { for (const [name,value] of Object.entries(values)) this.setExport(name,value); }, { context });
  });
  await module.evaluate();
  return { appCtx, service, pending, api: module.namespace };
}

test('an older weather reply cannot replace weather at the new location', async () => {
  const h = await harness('weather');
  const old = h.api.refreshLiveWeather(true);
  h.appCtx.testLocation = { lat: -77, lon: 166 };
  const current = h.api.refreshLiveWeather(true);
  h.pending[1].resolve({ temperature_2m: -20 }); await current;
  h.pending[0].resolve({ temperature_2m: 30 }); await old;
  assert.equal(h.appCtx.liveWeatherState.lat, -77);
  assert.equal(h.appCtx.liveWeatherState.temperatureC, -20);
  assert.equal(h.appCtx.weatherState.lat, -77);
});

test('returning to a cached location invalidates an in-flight weather reply for another place', async () => {
  const h = await harness('weather');
  const old = h.api.refreshLiveWeather(true);
  h.appCtx.testLocation = { lat: 51, lon: 0 };
  h.service.setCachedWeather('51:0', { lat: 51, lon: 0, fetchedAtMs: Date.now(), temperatureC: 12 });
  await h.api.refreshLiveWeather();
  h.pending[0].resolve({ temperature_2m: 30 }); await old;
  assert.equal(h.appCtx.liveWeatherState.lat, 51);
  assert.equal(h.appCtx.liveWeatherState.temperatureC, 12);
});

test('weather from the previous location is cleared while the new request is pending', async () => {
  const h = await harness('weather');
  const first = h.api.refreshLiveWeather(true);h.pending[0].resolve({ temperature_2m: 30 });await first;
  h.appCtx.testLocation = { lat: -77, lon: 166 };
  const next = h.api.refreshLiveWeather(true);
  assert.equal(h.appCtx.liveWeatherState, null);
  assert.equal(h.appCtx.weatherState, null);
  h.pending[1].resolve({ temperature_2m: -20 });await next;
});

test('late reverse-geocoding replies cannot rename the selected place', async () => {
  const h = await harness('place');
  const old = h.api.refreshLivePlace({ lat: 39, lon: -76 }, true);
  const next = h.api.refreshLivePlace({ lat: 51, lon: 0 }, true);
  h.pending[1].resolve({ address: { city: 'London', country: 'United Kingdom' } });await next;
  h.pending[0].resolve({ address: { city: 'Baltimore', country: 'United States' } });await old;
  assert.equal(h.appCtx.livePlaceState.lat, 51);
  assert.match(h.appCtx.livePlaceState.display, /London/);
});

test('a cached place takes priority over a pending reverse-geocoding request', async () => {
  const h = await harness('place');
  const old = h.api.refreshLivePlace({ lat: 39, lon: -76 }, true);
  h.service.setCachedPlace('51.00:0.00', { display: 'London', shortLabel: 'London' });
  await h.api.refreshLivePlace({ lat: 51, lon: 0 });
  h.pending[0].resolve({ address: { city: 'Baltimore' } });await old;
  assert.equal(h.appCtx.livePlaceState.lat, 51);
});


test('weather reply is not published after moving without starting a second request', async () => {
  const h = await harness('weather');
  const request = h.api.refreshLiveWeather(true);
  h.appCtx.testLocation = { lat: -77, lon: 166 };
  h.pending[0].resolve({ temperature_2m: 30 }); await request;
  assert.equal(h.appCtx.liveWeatherState, null);
  assert.equal(h.appCtx.weatherState, null);
  assert.equal(h.service.getCachedWeather('39:-76').temperatureC, 30);
});

test('an Earth weather response cannot become active after entering the Moon', async () => {
  const h = await harness('weather');
  const request = h.api.refreshLiveWeather(true);
  h.appCtx.onMoon = true;
  h.pending[0].resolve({ temperature_2m: 30 }); await request;
  assert.equal(h.appCtx.liveWeatherState, null);
  assert.equal(h.appCtx.weatherState, null);
});

test('forced same-location refresh keeps the newest weather and cache', async () => {
  const h = await harness('weather');
  const first = h.api.refreshLiveWeather(true);
  const second = h.api.refreshLiveWeather(true);
  assert.equal(h.pending.length, 2);
  h.pending[1].resolve({ temperature_2m: 12 }); await second;
  h.pending[0].resolve({ temperature_2m: 30 }); await first;
  assert.equal(h.appCtx.liveWeatherState.temperatureC, 12);
  assert.equal(h.service.getCachedWeather('39:-76').temperatureC, 12);
});

test('a completed old geocoder request cannot clear a newer same-place request', async () => {
  const h = await harness('place');
  const first = h.api.refreshLivePlace({ lat: 39, lon: -76 }, true);
  const second = h.api.refreshLivePlace({ lat: 39, lon: -76 }, true);
  h.pending[0].resolve({ address: { city: 'Old label' } }); await first;
  assert.equal(h.appCtx.livePlaceState, null);
  h.pending[1].resolve({ address: { city: 'Current label' } }); await second;
  assert.equal(h.appCtx.livePlaceState.display, 'Current label');
});

test('weather labels cannot be overwritten with a different location', () => {
  const context = {};
  const service = createWeatherStateService(context);
  service.setLiveState({ lat: 51, lon: 0, locationDisplay: 'London' });
  service.setPlaceState({ lat: 39, lon: -76, display: 'Baltimore' });
  service.updatePlaceLabels();
  assert.equal(context.liveWeatherState.locationDisplay, 'London');
  service.setPlaceState({ lat: 51, lon: 0, display: 'London, United Kingdom' });
  service.updatePlaceLabels();
  assert.equal(context.liveWeatherState.locationDisplay, 'London, United Kingdom');
});
