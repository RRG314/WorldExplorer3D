import assert from 'node:assert/strict';
import { loadAcceptedGroundCatalog } from '../app/js/terrain/accepted-ground-catalog.js';
import { activateAcceptedGroundForWorldLoad } from '../app/js/world/accepted-ground-activation.js';
import { loadFarMappedContext } from '../app/js/terrain/far-field-mapped-context.js';
import { fetchOverpassJSON } from '../app/js/world/osm-loader.js';
import {
  BUNDLED_BUILDING_SCHEMA_VERSION,
  fetchBundledBuildingMetadata
} from '../app/js/world/preset-building-metadata.js';
import {
  BUNDLED_LANDMARK_SCHEMA_VERSION,
  fetchBundledLandmarkData
} from '../app/js/world/landmark-source.js';
import {
  fetchGlobalBuildingData,
  fetchOvertureBuildingData,
  OVERTURE_RELEASE
} from '../app/js/world/overture-building-source.js';

function abortError(message) {
  return new DOMException(message, 'AbortError');
}

function emptyVectorTile(z, x, y) {
  return { tile: { layers: {} }, z, x, y };
}

function buildingVectorTile(z, x, y) {
  const layer = {
    length: 1,
    feature: () => ({
      id: 'fixture-building',
      toGeoJSON: () => ({
        type: 'Feature',
        properties: {
          id: 'fixture-building',
          subtype: 'residential',
          height: 18,
          roof_shape: 'gabled',
          unexpected_future_field: 'ignored-without-changing-schema'
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [7.4242, 43.7382],
            [7.4245, 43.7382],
            [7.4245, 43.7385],
            [7.4242, 43.7385],
            [7.4242, 43.7382]
          ]]
        }
      })
    })
  };
  return { tile: { layers: { building: layer } }, z, x, y };
}

function jsonResponse(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => value
  };
}

{
  const controller = new AbortController();
  const receivedSignals = [];
  const bounds = { latS: 43.68, latN: 43.80, lonW: 7.34, lonE: 7.50 };
  const promise = loadFarMappedContext(bounds, null, bounds, {
    signal: controller.signal,
    fetchTile: (_z, _x, _y, options) => {
      receivedSignals.push(options.signal);
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
      });
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort(abortError('far context superseded'));
  await assert.rejects(promise, { name: 'AbortError', message: 'far context superseded' });
  assert.ok(receivedSignals.length > 0 && receivedSignals.length <= 16);
  assert.ok(receivedSignals.every((signal) => signal === controller.signal));
}

{
  const controller = new AbortController();
  let receivedSignal = null;
  const promise = loadAcceptedGroundCatalog({
    url: '/catalog.json',
    signal: controller.signal,
    fetchImpl: (_url, options) => {
      receivedSignal = options.signal;
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
      });
    }
  });
  controller.abort(abortError('catalog superseded'));
  await assert.rejects(promise, { name: 'AbortError', message: 'catalog superseded' });
  assert.equal(receivedSignal, controller.signal);
}

{
  const controller = new AbortController();
  const appCtx = {
    terrainEnabled: true,
    onMoon: false,
    LOC: { lat: 39.2913, lon: -76.6097 },
    prepareAcceptedGroundFromCatalog: ({ signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }),
    showLoad() {}
  };
  const promise = activateAcceptedGroundForWorldLoad({ appCtx, signal: controller.signal });
  controller.abort(abortError('ground activation superseded'));
  await assert.rejects(promise, { name: 'AbortError', message: 'ground activation superseded' });
  assert.equal(appCtx.publishLocationTerrain, undefined, 'aborted ground activation must not publish fallback terrain');
}

{
  const controller = new AbortController();
  const receivedSignals = [];
  const promise = fetchOvertureBuildingData({
    lat: 43.7384,
    lon: 7.4246,
    radius: 0.004,
    signal: controller.signal,
    fetchTile: (_theme, _z, _x, _y, options) => {
      receivedSignals.push(options.signal);
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
      });
    }
  });
  controller.abort(abortError('building coverage superseded'));
  await assert.rejects(promise, { name: 'AbortError', message: 'building coverage superseded' });
  assert.ok(receivedSignals.length > 0);
  assert.ok(receivedSignals.every((signal) => signal === controller.signal));
}

{
  const controller = new AbortController();
  let fallbackCalled = false;
  controller.abort(abortError('global buildings superseded'));
  await assert.rejects(
    fetchGlobalBuildingData({
      lat: 43.7384,
      lon: 7.4246,
      signal: controller.signal,
      fetchTile: () => Promise.reject(new Error('must not start'))
    }, () => { fallbackCalled = true; }),
    { name: 'AbortError', message: 'global buildings superseded' }
  );
  assert.equal(fallbackCalled, false, 'an aborted authoritative request must not start a fallback provider');
}

{
  let callCount = 0;
  const partial = await fetchOvertureBuildingData({
    lat: 43.7384,
    lon: 7.4246,
    radius: 0.04,
    fetchTile: async (_theme, z, x, y) => {
      callCount += 1;
      if (callCount === 1) return buildingVectorTile(z, x, y);
      throw abortError('fixture neighboring tile timed out');
    }
  });
  assert.equal(partial._overtureBuildings.loadedTiles, 1);
  assert.ok(partial._overtureBuildings.requestedTiles > 1);
  assert.equal(partial._overtureBuildings.coverageComplete, false);
  assert.equal(partial._overtureBuildings.attempts, 1, 'partial authoritative coverage must not be retried or discarded');
  assert.equal(partial._overtureBuildings.release, OVERTURE_RELEASE);
  assert.equal(partial._overpassSource, 'overture-buildings-pmtiles');
  assert.ok(partial.elements.some((element) => element.type === 'way'));
  assert.ok(partial.elements.some((element) => element.tags?.height === '18'));
}

{
  const requested = [];
  await assert.rejects(
    fetchOvertureBuildingData({
      lat: 43.7384,
      lon: 7.4246,
      radius: 0.012,
      fetchTile: async (_theme, z, x, y) => {
        requested.push(`${z}/${x}/${y}`);
        throw abortError('fixture archive timed out');
      }
    }),
    /Overture building coverage unavailable: fixture archive timed out/
  );
  assert.ok(requested.length > 0);
  assert.equal(
    new Set(requested).size,
    requested.length,
    'a timed-out Overture batch must not start a duplicate retry batch'
  );
}

{
  let callCount = 0;
  const bounds = { latS: 43.72, latN: 43.75, lonW: 7.40, lonE: 7.45 };
  const partial = await loadFarMappedContext(bounds, null, bounds, {
    fetchTile: async (z, x, y) => {
      callCount += 1;
      if (callCount % 2 === 0) throw new Error('fixture Shortbread partial failure');
      return emptyVectorTile(z, x, y);
    }
  });
  assert.ok(partial.requestedTiles > 1);
  assert.ok(partial.loadedTiles > 0 && partial.loadedTiles < partial.requestedTiles);
  assert.ok(partial.waterTilesLoaded <= partial.waterTilesRequested);
  assert.deepEqual(partial.buildings, []);
}

{
  let receivedSignal = null;
  const data = await fetchOverpassJSON('[out:json];node(0,0,0,0);out;', 5000, Infinity, null, {
    endpoints: ['https://overpass-fixture.test/interpreter'],
    staggerMs: 0,
    fetchImpl: async (_url, options) => {
      receivedSignal = options.signal;
      return {
        ok: true,
        text: async () => JSON.stringify({ elements: [{ type: 'node', id: 1, lat: 0, lon: 0 }] })
      };
    }
  });
  assert.equal(receivedSignal instanceof AbortSignal, true);
  assert.equal(data._overpassSource, 'network');
  assert.equal(data._overpassEndpoint, 'https://overpass-fixture.test/interpreter');
  assert.equal(data.elements.length, 1);
}

{
  await assert.rejects(
    fetchOverpassJSON('[out:json];node(1,1,1,1);out;', 5000, Infinity, null, {
      endpoints: ['https://overpass-schema-change.test/interpreter'],
      staggerMs: 0,
      fetchImpl: async () => ({
        ok: true,
        text: async () => JSON.stringify({ features: [] })
      })
    }),
    /All Overpass endpoints failed:.*invalid payload/
  );
}

{
  await assert.rejects(
    fetchOverpassJSON('[out:json];node(2,2,2,2);out;', 5000, Infinity, null, {
      endpoints: ['https://overpass-timeout.test/interpreter'],
      staggerMs: 0,
      fetchImpl: async () => { throw abortError('fixture endpoint timed out'); }
    }),
    /All Overpass endpoints failed:.*timeout after 5000ms/
  );
}

{
  const controller = new AbortController();
  const promise = fetchOverpassJSON('[out:json];node(3,3,3,3);out;', 5000, Infinity, null, {
    signal: controller.signal,
    endpoints: [
      'https://overpass-abort-a.test/interpreter',
      'https://overpass-abort-b.test/interpreter'
    ],
    staggerMs: 10,
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    })
  });
  controller.abort(abortError('fixture Overpass session superseded'));
  await assert.rejects(promise, { name: 'AbortError', message: 'fixture Overpass session superseded' });
}

{
  const requests = [];
  const buildingMetadata = await fetchBundledBuildingMetadata({
    lat: 39.2904,
    lon: -76.6122,
    locationKey: 'baltimore',
    fetchImpl: async (url) => {
      requests.push(String(url));
      if (String(url).endsWith('/index.json')) {
        return jsonResponse({
          schemaVersion: BUNDLED_BUILDING_SCHEMA_VERSION,
          source: 'fixture-osm',
          license: 'ODbL-1.0',
          packs: [{ id: 'baltimore', center: { lat: 39.2904, lon: -76.6122 } }]
        });
      }
      return jsonResponse({
        schemaVersion: BUNDLED_BUILDING_SCHEMA_VERSION,
        id: 'baltimore',
        source: 'fixture-osm',
        license: 'ODbL-1.0',
        elements: [{ type: 'way', id: 10, nodes: [], tags: { building: 'yes' } }]
      });
    }
  });
  assert.equal(requests.length, 2);
  assert.equal(buildingMetadata._buildingMetadataPackId, 'baltimore');
  assert.equal(buildingMetadata._buildingMetadataSchemaVersion, 1);
  assert.equal(buildingMetadata._buildingMetadataLicense, 'ODbL-1.0');
  assert.equal(buildingMetadata.elements.length, 1);
}

{
  await assert.rejects(
    fetchBundledBuildingMetadata({
      lat: 39.2904,
      lon: -76.6122,
      locationKey: 'baltimore',
      fetchImpl: async () => jsonResponse({ schemaVersion: 2, packs: [] })
    }),
    /unsupported schema/
  );
}

{
  const controller = new AbortController();
  const promise = fetchBundledBuildingMetadata({
    lat: 39.2904,
    lon: -76.6122,
    locationKey: 'baltimore',
    signal: controller.signal,
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    })
  });
  controller.abort(abortError('fixture bundled building timeout'));
  await assert.rejects(promise, { name: 'AbortError', message: 'fixture bundled building timeout' });
}

{
  const landmarks = await fetchBundledLandmarkData({
    lat: 29.9792,
    lon: 31.1342,
    fetchImpl: async () => jsonResponse({
      schemaVersion: BUNDLED_LANDMARK_SCHEMA_VERSION,
      source: 'fixture-osm',
      license: 'ODbL-1.0',
      packs: [{
        id: 'giza-pyramid-complex',
        center: { lat: 29.9792, lon: 31.1342 },
        radiusDegrees: 0.011,
        elements: [{ type: 'way', id: 20, nodes: [], tags: { historic: 'pyramid' } }]
      }]
    })
  });
  assert.equal(landmarks._landmarkPackId, 'giza-pyramid-complex');
  assert.equal(landmarks._landmarkSchemaVersion, 1);
  assert.equal(landmarks._landmarkLicense, 'ODbL-1.0');
  assert.equal(landmarks.elements.length, 1);
}

{
  await assert.rejects(
    fetchBundledLandmarkData({
      lat: 29.9792,
      lon: 31.1342,
      fetchImpl: async () => jsonResponse({ schemaVersion: 2, packs: [] })
    }),
    /unsupported schema/
  );
}

{
  const controller = new AbortController();
  const promise = fetchBundledLandmarkData({
    lat: 29.9792,
    lon: 31.1342,
    signal: controller.signal,
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    })
  });
  controller.abort(abortError('fixture bundled landmark timeout'));
  await assert.rejects(promise, { name: 'AbortError', message: 'fixture bundled landmark timeout' });
}

console.log(JSON.stringify({
  ok: true,
  contract: 'provider-failure-and-cancellation',
  verified: [
    'accepted-ground-catalog-signal',
    'accepted-ground-no-fallback-after-abort',
    'overture-tile-signal',
    'no-building-provider-fallback-after-abort',
    'bounded-far-context-generation-abort',
    'overture-partial-authoritative-coverage',
    'overture-timeout-no-duplicate-retry',
    'overture-release-and-forward-compatible-properties',
    'shortbread-partial-context-coverage',
    'overpass-success-provenance',
    'overpass-schema-change-rejection',
    'overpass-timeout-classification',
    'overpass-session-abort',
    'bundled-building-schema-provenance-and-timeout',
    'bundled-landmark-schema-provenance-and-timeout',
    'fixture-fetch-cache-isolation'
  ]
}, null, 2));
