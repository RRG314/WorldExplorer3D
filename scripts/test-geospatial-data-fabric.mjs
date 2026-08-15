import assert from 'node:assert/strict';
import geospatialFunctions from '../functions/geospatial.js';
import { DATA_SOURCES, createProvenance, getDataSource, normalizeGeoQuery } from '../app/js/geospatial/data-contract.js';
import { createProviderRegistry } from '../app/js/geospatial/provider-registry.js';
import { createAircraftService } from '../app/js/geospatial/aircraft.js';
import { createMarineService, normalizeMarineModel } from '../app/js/geospatial/marine.js';
import { createOperationalFeedService, normalizeWeatherRequest } from '../app/js/geospatial/operational-feeds.js';
import { createStreetImageryService } from '../app/js/geospatial/street-imagery.js';
import { LIVE_EARTH_LAYERS } from '../app/js/live-earth/registry.js';
import { transportMarkerSpec } from '../app/js/live-earth/render-globe.js';
import { describeProviderHealth } from '../app/js/live-earth/provider-health.js';

const normalized = normalizeGeoQuery({ lat: 39.2904, lon: -76.6122, radiusM: 5000, limit: 99 });
assert.deepEqual(normalized, { lat: 39.2904, lon: -76.6122, radiusM: 1000, limit: 12 });
assert.throws(() => normalizeGeoQuery({ lat: 120, lon: 0 }), /Latitude/);

const provenance = createProvenance({
  sourceId: 'panoramax',
  observedAt: '2025-06-20T18:53:59Z',
  fetchedAt: '2026-07-20T12:00:00Z',
  accuracyM: 4.5
});
assert.equal(provenance.truthType, 'community-observed');
assert.equal(provenance.licenseId, 'CC-BY-SA-4.0');
assert.equal(provenance.isInferred, false);
assert.equal(createProvenance({ sourceId: 'noaa-coops-predictions' }).truthType, 'predicted');

for (const layer of Object.values(LIVE_EARTH_LAYERS)) {
  if (layer.id === 'overview') continue;
  assert.ok(Array.isArray(layer.sourceIds) && layer.sourceIds.length > 0, `${layer.id} must declare data source ownership.`);
  layer.sourceIds.forEach((sourceId) => assert.ok(getDataSource(sourceId), `${layer.id} references unknown source ${sourceId}.`));
}
assert.equal(Object.hasOwn(DATA_SOURCES, 'google-street-view'), false, 'Restricted Google imagery must not enter the open data catalog.');

let clock = 1000;
let calls = 0;
const registry = createProviderRegistry({ now: () => clock, maxCacheEntries: 8 });
registry.register({
  id: 'fixture',
  sourceId: 'panoramax',
  cacheTtlMs: 500,
  normalizeRequest: normalizeGeoQuery,
  async query(request) {
    calls++;
    await Promise.resolve();
    return { fetchedAt: '2026-07-20T12:00:00Z', items: [{ id: `photo-${request.lat}` }] };
  }
});
const [first, second] = await Promise.all([
  registry.query('fixture', { lat: 39.2904, lon: -76.6122 }),
  registry.query('fixture', { lon: -76.6122, lat: 39.2904 })
]);
assert.equal(calls, 1, 'Concurrent equivalent requests should share one provider call.');
assert.equal(first.items[0].id, second.items[0].id);
assert.equal((await registry.query('fixture', { lat: 39.2904, lon: -76.6122 })).fromCache, true);
clock += 501;
await registry.query('fixture', { lat: 39.2904, lon: -76.6122 });
assert.equal(calls, 2, 'Expired provider cache entries must refresh.');
const fixtureHealth = registry.snapshot().providers.find((provider) => provider.id === 'fixture');
assert.equal(fixtureHealth.status, 'ready');
assert.equal(fixtureHealth.cachedQueries, 1);
assert.equal(fixtureHealth.lastItemCount, 1);
assert.match(describeProviderHealth(registry.snapshot(), 'fixture', clock).label, /Healthy.*1 cached/);
let flakyCalls = 0;
registry.register({
  id: 'flaky',
  cacheTtlMs: 500,
  async query() {
    flakyCalls++;
    if (flakyCalls > 1) throw new Error('fixture outage');
    return { items: [{ id: 'cached-value' }] };
  }
});
await registry.query('flaky');
await assert.rejects(registry.query('flaky', {}, { force: true }), /fixture outage/);
const degradedHealth = describeProviderHealth(registry.snapshot(), 'flaky', clock);
assert.equal(degradedHealth.status, 'degraded');
assert.match(degradedHealth.label, /Degraded.*last good.*1 cached/);

const proxyPayload = {
  fetchedAt: '2026-07-20T12:00:00Z',
  externalViewerUrl: 'https://panoramax.openstreetmap.fr/?focus=map',
  items: [{
    id: 'street-1',
    lat: 39.2886,
    lon: -76.6111,
    headingDeg: 284,
    capturedAt: '2025-06-20T18:53:59Z',
    contributor: 'mapper',
    thumbnailUrl: 'https://panoramax.openstreetmap.fr/thumb.jpg',
    imageUrl: 'https://panoramax.openstreetmap.fr/image.jpg',
    viewerUrl: 'https://panoramax.openstreetmap.fr/?pic=street-1',
    distanceM: 210,
    licenseId: 'CC-BY-SA-4.0'
  }]
};
const fetchCalls = [];
const service = createStreetImageryService({
  endpoint: '/api/geospatial/street-imagery',
  fetchImpl: async (url) => {
    fetchCalls.push(String(url));
    return { ok: true, status: 200, async json() { return proxyPayload; } };
  }
});
const streetResult = await service.search('panoramax', { lat: 39.2904, lon: -76.6122, radiusM: 350, limit: 8 });
assert.equal(streetResult.items.length, 1);
assert.equal(streetResult.items[0].provenance.sourceId, 'panoramax');
assert.match(fetchCalls[0], /^\/api\/geospatial\/street-imagery\?/);
assert.match(fetchCalls[0], /provider=panoramax/);

const aircraftService = createAircraftService({
  fetchImpl: async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        fetchedAt: '2026-07-20T12:00:00Z',
        items: [{
          id: 'opensky-a1b2c3',
          icao24: 'a1b2c3',
          callsign: 'TEST123',
          lat: 39.4,
          lon: -76.7,
          altitudeM: 3048,
          velocityKt: 250,
          headingDeg: 90,
          observedAt: '2026-07-20T11:59:55Z'
        }]
      };
    }
  })
});
const aircraftResult = await aircraftService.search({ lat: 39.2904, lon: -76.6122, radiusKm: 160 });
assert.equal(aircraftResult.items[0].dataSource, 'opensky');
assert.equal(aircraftResult.items[0].provenance.truthType, 'observed');
assert.equal(aircraftResult.items[0].label, 'TEST123');
const aircraftMarker = transportMarkerSpec(aircraftResult.items[0], 'aircraft', true, false);
assert.deepEqual({ lat: aircraftMarker.lat, lon: aircraftMarker.lon }, { lat: 39.4, lon: -76.7 });
assert.equal(aircraftMarker.radius, aircraftResult.items[0].altitude);
assert.equal(aircraftMarker.observedAircraft, true);
assert.equal(transportMarkerSpec({ lat: 100, lon: 0 }, 'aircraft'), null);

const operationalCalls = [];
const operational = createOperationalFeedService({
  fetchImpl: async (url) => {
    const href = String(url);
    operationalCalls.push(href);
    if (href.includes('celestrak.org')) {
      const group = new URL(href).searchParams.get('GROUP');
      return {
        ok: true,
        status: 200,
        async text() { return `${group.toUpperCase()} TEST\n1 25544U 98067A   26199.50000000  .00000000  00000-0  00000-0 0  9999\n2 25544  51.6400 100.0000 0005000  10.0000  20.0000 15.50000000123456\n`; }
      };
    }
    if (href.includes('earthquake.usgs.gov')) {
      return { ok: true, status: 200, async json() { return { features: [{ id: 'quake-1' }] }; } };
    }
    if (href.includes('open-meteo.com')) {
      return { ok: true, status: 200, async json() { return [{ current: { weather_code: 1 } }, { current: { weather_code: 2 } }]; } };
    }
    throw new Error(`Unexpected operational URL: ${href}`);
  }
});
const celestrakResult = await operational.celestrak(['weather', 'stations']);
assert.equal(celestrakResult.items.length, 2);
assert.deepEqual(celestrakResult.query.sources, ['stations', 'weather']);
await operational.celestrak(['stations', 'weather']);
assert.equal(operationalCalls.filter((url) => url.includes('celestrak.org')).length, 2, 'CelesTrak cache should prevent duplicate group requests.');
assert.equal((await operational.earthquakes()).items[0].id, 'quake-1');
const weatherResult = await operational.weather([{ lat: 39.29, lon: -76.61 }, { lat: 51.5, lon: -0.12 }]);
assert.equal(weatherResult.items.length, 2);
assert.ok(operationalCalls.find((url) => url.includes('open-meteo.com'))?.includes('latitude=39.2900%2C51.5000'));
assert.equal(normalizeWeatherRequest({ locations: Array.from({ length: 20 }, (_, index) => ({ lat: index, lon: index })) }).locations.length, 16);
assert.throws(() => normalizeWeatherRequest({ locations: [{ lat: 100, lon: 0 }] }), /latitude/i);
const partialCelestrak = createOperationalFeedService({
  fetchImpl: async (url) => {
    const group = new URL(String(url)).searchParams.get('GROUP');
    if (group === 'weather') return { ok: false, status: 503, async text() { return ''; } };
    return { ok: true, status: 200, async text() { return 'STATION\n1 TEST\n2 TEST\n'; } };
  }
});
const partialResult = await partialCelestrak.celestrak(['stations', 'weather']);
assert.equal(partialResult.items.length, 1, 'Available CelesTrak groups should survive a partial upstream failure.');
assert.equal(partialResult.warnings.length, 1);

const marineCalls = [];
const marineService = createMarineService({
  now: () => 1784548800000,
  fetchImpl: async (url) => {
    const href = String(url);
    marineCalls.push(href);
    if (href.includes('marine-api.open-meteo.com')) {
      const inland = new URL(href).searchParams.get('longitude') === '-104.9903';
      return { ok: true, status: 200, async json() { return {
        latitude: inland ? 39.708336 : 39.291664,
        longitude: inland ? -105 : -76.62499,
        current: {
          time: '2026-07-20T12:00',
          wave_height: null,
          wave_direction: null,
          wave_period: null,
          ocean_current_velocity: inland ? null : 0.3,
          ocean_current_direction: inland ? null : 315,
          sea_surface_temperature: inland ? null : 29,
          sea_level_height_msl: inland ? null : -0.47
        }
      }; } };
    }
    if (href.includes('/mdapi/')) {
      return { ok: true, status: 200, async json() { return { stations: [{
        id: '8574680',
        name: 'Baltimore',
        lat: 39.266693,
        lng: -76.57831,
        state: 'MD',
        tidal: true,
        greatlakes: false
      }] }; } };
    }
    if (href.includes('product=water_level')) {
      return { ok: true, status: 200, async json() { return { data: [{
        t: '2026-07-20 12:30', v: '0.394', s: '0.006', q: 'p'
      }] }; } };
    }
    if (href.includes('product=predictions')) {
      return { ok: true, status: 200, async json() { return { predictions: [
        { t: '2026-07-20 09:20', v: '0.181', type: 'L' },
        { t: '2026-07-20 14:55', v: '0.542', type: 'H' }
      ] }; } };
    }
    throw new Error(`Unexpected marine URL: ${href}`);
  }
});
const baltimoreMarine = await marineService.selected({ lat: 39.2904, lon: -76.6122 });
assert.equal(baltimoreMarine.model.waveHeightM, null, 'Unavailable marine fields must not normalize to zero.');
assert.equal(baltimoreMarine.model.hasGuidance, true);
assert.equal(baltimoreMarine.model.currentVelocityKph, 0.3);
assert.equal(baltimoreMarine.model.provenance.truthType, 'modeled');
assert.equal(baltimoreMarine.station.id, '8574680');
assert.ok(baltimoreMarine.station.distanceKm < 10);
assert.equal(baltimoreMarine.observation.valueM, 0.394);
assert.equal(baltimoreMarine.observation.datum, 'MLLW');
assert.equal(baltimoreMarine.observation.quality, 'preliminary');
assert.equal(baltimoreMarine.observation.provenance.truthType, 'observed');
assert.equal(baltimoreMarine.predictions.length, 2);
assert.equal(baltimoreMarine.predictions[1].type, 'high');
assert.equal(baltimoreMarine.predictions[1].provenance.truthType, 'predicted');
await marineService.selected({ lon: -76.6122, lat: 39.2904 });
assert.equal(marineCalls.length, 4, 'Equivalent marine requests should use all four provider caches.');
const inlandMarine = await marineService.selected({ lat: 39.7392, lon: -104.9903 });
assert.equal(inlandMarine.station, null, 'An inland selection must not inherit a distant coastal NOAA station.');
assert.equal(inlandMarine.observation, null);
assert.deepEqual(inlandMarine.predictions, []);
assert.equal(inlandMarine.model.hasGuidance, false);
const directNullModel = normalizeMarineModel({ latitude: 0, longitude: 0, current: { wave_height: '' } }, { lat: 0, lon: 0 });
assert.equal(directNullModel.waveHeightM, null);
assert.equal(directNullModel.hasGuidance, false);

const serverQuery = geospatialFunctions.normalizeQuery({ provider: 'kartaview', lat: '40.7', lon: '-74', radiusM: '9000' });
assert.deepEqual(serverQuery, { provider: 'kartaview', lat: 40.7, lon: -74, radiusM: 1000, limit: 8 });
const deFlockQuery = geospatialFunctions.normalizeDeFlockQuery({ lat: '39.2904', lon: '-76.6122', radiusDegrees: '0.5' });
assert.deepEqual(deFlockQuery, { lat: 39.2904, lon: -76.6122, radiusDegrees: 0.04 });
assert.match(geospatialFunctions.buildDeFlockOverpassQuery(deFlockQuery), /man_made.*surveillance/);
const deFlockAttempts = [];
const deFlockProxy = await geospatialFunctions.queryDeFlockCameras({ lat: 12.34567, lon: 65.4321, radiusDegrees: 0.01 }, {
  force: true,
  endpoints: ['https://failed-overpass.test', 'https://working-overpass.test'],
  fetchImpl: async (url) => {
    deFlockAttempts.push(String(url));
    if (String(url).includes('failed-overpass')) throw new Error('simulated provider outage');
    return {
      ok: true,
      status: 200,
      async json() {
        return { elements: [
          { type: 'node', id: 77, lat: 12.345, lon: 65.432, tags: { man_made: 'surveillance' } },
          { type: 'node', id: 88, lat: 12.346, lon: 65.433, tags: { amenity: 'bench' } }
        ] };
      }
    };
  }
});
assert.equal(deFlockAttempts.length, 2, 'server proxy should race independent Overpass providers');
assert.equal(deFlockProxy.elements.length, 1, 'server proxy must publish only valid mapped camera nodes');
assert.equal(deFlockProxy.endpoint, 'https://working-overpass.test');
assert.equal(deFlockProxy.cache, 'upstream');
const normalizedPanoramax = geospatialFunctions.normalizePanoramaxItem({
  id: 'p1',
  geometry: { coordinates: [-76.6111, 39.2886] },
  collection: 'sequence-1',
  properties: {
    datetime: '2025-06-20T18:53:59Z',
    'view:azimuth': 284,
    'geovisio:producer': 'mapper',
    license: 'CC-BY-SA-4.0'
  },
  assets: {
    thumb: { href: 'https://panoramax.openstreetmap.fr/thumb.jpg' },
    sd: { href: 'https://panoramax.openstreetmap.fr/image.jpg' }
  }
}, { lat: 39.2904, lon: -76.6122 });
assert.equal(normalizedPanoramax.contributor, 'mapper');
assert.ok(normalizedPanoramax.distanceM > 0);
assert.equal(normalizedPanoramax.licenseId, 'CC-BY-SA-4.0');
const aircraftQuery = geospatialFunctions.normalizeAircraftQuery({ lat: '39.29', lon: '-76.61', radiusKm: '999', limit: '999' });
assert.deepEqual(aircraftQuery, { lat: 39.29, lon: -76.61, radiusKm: 200, limit: 120 });
const normalizedAircraft = geospatialFunctions.normalizeOpenSkyState([
  'a1b2c3', 'TEST123 ', 'United States', 1784548607, 1784548607,
  -76.7, 39.4, 3000, false, 128.6, 90, 2.5, null, 3048, '1200', false, 0, 3
], { lat: 39.2904, lon: -76.6122 }, 1784548610);
assert.equal(normalizedAircraft.callsign, 'TEST123');
assert.equal(normalizedAircraft.velocityKt, 250);
assert.equal(normalizedAircraft.altitudeM, 3048);
assert.equal(normalizedAircraft.category, 3);
const normalizedAdsbLol = geospatialFunctions.normalizeAdsbLolState({
  hex: 'a1b2c3', flight: 'FALLBACK1 ', lat: 39.4, lon: -76.7,
  alt_geom: 10000, gs: 250, track: 90, geom_rate: 500, seen_pos: 1, dst: 8
}, { lat: 39.2904, lon: -76.6122 }, Date.parse('2026-07-20T12:00:00Z'));
assert.equal(normalizedAdsbLol.callsign, 'FALLBACK1');
assert.equal(Math.round(normalizedAdsbLol.altitudeM), 3048);
assert.equal(normalizedAdsbLol.velocityKt, 250);
const fallbackAircraft = await geospatialFunctions.queryAircraft({ lat: 12.34, lon: 56.78, radiusKm: 80, limit: 2 }, {
  force: true,
  fetchImpl: async (url) => {
    if (String(url).includes('opensky-network.org')) throw new Error('simulated OpenSky outage');
    return {
      ok: true,
      async json() {
        return { now: Date.parse('2026-07-20T12:00:00Z'), ac: [{ hex: 'a1b2c3', flight: 'FALLBACK1', lat: 12.4, lon: 56.8, alt_geom: 10000, gs: 250, dst: 4 }] };
      }
    };
  }
});
assert.equal(fallbackAircraft.provider, 'adsb-lol');
assert.equal(fallbackAircraft.items[0].callsign, 'FALLBACK1');
assert.match(fallbackAircraft.warnings[0], /OpenSky was unavailable/);

console.log(JSON.stringify({
  ok: true,
  catalogSources: Object.keys(DATA_SOURCES).length,
  liveEarthLayers: Object.keys(LIVE_EARTH_LAYERS).length,
  providerCalls: calls,
  streetItems: streetResult.items.length,
  aircraftItems: aircraftResult.items.length,
  marineProviderCalls: marineCalls.length,
  operationalProviders: operational.diagnostics().registered
}, null, 2));
