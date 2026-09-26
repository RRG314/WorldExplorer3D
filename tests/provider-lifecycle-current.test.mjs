import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchOverpassJSON, releaseOverpassRuntimeCache } from '../app/js/world/osm-loader.js';
import { fetchShortbreadTile, releaseShortbreadRuntimeCache, getShortbreadRuntimeCacheStats } from '../app/js/world/shortbread-source.js';
import { fetchNearbyCities } from '../app/js/ui/globe-selector/catalog.js';
import { overpassAttemptBudget, OVERPASS_ENDPOINTS } from '../functions/overpass-provider-policy.mjs';
import geospatial from '../functions/geospatial.js';

const response = id => ({ ok: true, text: async () => JSON.stringify({ elements: [{ id }] }) });
const endpoints = ['https://first.invalid', 'https://second.invalid'];
const meta = { lat: 10, lon: 20, roadsRadius: .01, featureRadius: .01, poiRadius: .01, kind: 'test' };

test('map memory cache does not substitute a different query at the same location', async () => {
  releaseOverpassRuntimeCache();
  let requests = 0;
  const options = { endpoints, fetchImpl: async () => response(++requests), staggerMs: 0 };
  const first = await fetchOverpassJSON('node(1);out;', 1000, Infinity, meta, options);
  const second = await fetchOverpassJSON('node(2);out;', 1000, Infinity, meta, options);
  const repeat = await fetchOverpassJSON('node(1);out;', 1000, Infinity, meta, options);
  assert.equal(first.elements[0].id, 1);
  assert.equal(second.elements[0].id, 2);
  assert.equal(repeat.elements[0].id, 1);
  assert.equal(requests, 2);
});

test('cancelled response cannot publish or contaminate the next map request', async () => {
  releaseOverpassRuntimeCache();
  const controller = new AbortController();
  await assert.rejects(fetchOverpassJSON('node(3);out;', 1000, Infinity, meta, {
    endpoints, signal: controller.signal, staggerMs: 0,
    fetchImpl: async () => { controller.abort(); return response('abandoned'); }
  }), { name: 'AbortError' });
  const value = await fetchOverpassJSON('node(3);out;', 1000, Infinity, meta, {
    endpoints, staggerMs: 0, fetchImpl: async () => response('current')
  });
  assert.equal(value.elements[0].id, 'current');
});

test('each serial fallback receives a useful share of the remaining deadline', () => {
  assert.equal(overpassAttemptBudget(12000, 2), 5975);
  assert.equal(overpassAttemptBudget(6000, 1), 5950);
  assert.ok(OVERPASS_ENDPOINTS.length > 0);
  assert.equal(new Set(OVERPASS_ENDPOINTS).size, OVERPASS_ENDPOINTS.length);
  assert.equal(OVERPASS_ENDPOINTS.some(url => new URL(url).hostname.endsWith('overpass-api.de')), false,
    'The shared application policy must not retry a service that declines this usage');
});

test('nearby city cancellation is honored even when a cached city result exists', async () => {
  const options = { endpoints, fetchImpl: async () => ({ ok: true, text: async () => '{"elements":[]}' }) };
  await fetchNearbyCities(30, 40, options);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(fetchNearbyCities(30, 40, { ...options, signal: controller.signal }), { name: 'AbortError' });
});

test('an aborted shared tile is replaced immediately; its late completion cannot poison the cache', async t => {
  releaseShortbreadRuntimeCache({ includeRaw: true });
  let releaseOld;
  let startedOld;
  const started = new Promise(resolve => { startedOld = resolve; });
  const oldBody = new Promise(resolve => { releaseOld = resolve; });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    if (calls === 1) { startedOld(); return { ok: true, arrayBuffer: () => oldBody }; }
    return { ok: true, arrayBuffer: async () => new Uint8Array([2]).buffer };
  });
  const loadVectorTileLib = async () => ({ Pbf: class { constructor(bytes) { this.bytes = bytes; } }, VectorTile: class { constructor(pbf) { this.marker = pbf.bytes[0]; } } });
  const controller = new AbortController();
  const old = fetchShortbreadTile(1, 0, 0, { signal: controller.signal, loadVectorTileLib });
  await started; controller.abort();
  await assert.rejects(old, { name: 'AbortError' });
  const fresh = await fetchShortbreadTile(1, 0, 0, { loadVectorTileLib });
  assert.equal(fresh.tile.marker, 2); assert.equal(calls, 2);
  releaseOld(new Uint8Array([1]).buffer);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await fetchShortbreadTile(1, 0, 0, { loadVectorTileLib })).tile.marker, 2);
  assert.equal(getShortbreadRuntimeCacheStats().pendingTileCount, 0);
  await assert.rejects(fetchShortbreadTile(1, 0, 0, { signal: controller.signal, loadVectorTileLib }), { name: 'AbortError' });
  releaseShortbreadRuntimeCache({ includeRaw: true });
});

test('server camera fallback is serial and does not launch duplicate endpoint probes', async () => {
  let active = 0, maxActive = 0;
  const calls = [];
  const result = await geospatial.queryDeFlockCameras({ lat: 0, lon: 0 }, {
    force: true, endpoints: [endpoints[0], ...endpoints], timeoutMs: 1000,
    fetchImpl: async url => {
      calls.push(url); active++; maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, 5)); active--;
      return url.startsWith(endpoints[0]) ? { ok: false, status: 503 } : { ok: true, json: async () => ({ elements: [] }) };
    }
  });
  assert.equal(maxActive, 1); assert.equal(calls.length, 2);
  assert.equal(result.endpoint, endpoints[1]);
});


test('unavailable vector provider stops request storms, retains cached tiles and probes recovery once', async t => {
  releaseShortbreadRuntimeCache({ includeRaw: true });
  const previousConfig = globalThis.WORLD_EXPLORER_CONFIG;
  globalThis.WORLD_EXPLORER_CONFIG = { osmVectorTileUrl: 'https://cooldown-test.invalid/{z}/{x}/{y}' };
  t.after(() => { globalThis.WORLD_EXPLORER_CONFIG = previousConfig; releaseShortbreadRuntimeCache({ includeRaw: true }); });
  let now = 100_000, calls = 0, unavailable = false, releaseProbe;
  t.mock.method(Date, 'now', () => now);
  const loadVectorTileLib = async () => ({ Pbf: class {}, VectorTile: class {} });
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    if (unavailable) throw new TypeError('Failed to fetch');
    if (releaseProbe === null) await new Promise(resolve => { releaseProbe = resolve; });
    return { ok: true, arrayBuffer: async () => new Uint8Array([2]).buffer };
  });
  const get = x => fetchShortbreadTile(14, x, 1, { loadVectorTileLib });
  const cached = await get(0);
  unavailable = true;
  for (let x = 1; x <= 20; x++) await assert.rejects(get(x));
  assert.equal(calls, 4, 'Three failed requests must pause the provider, not drain the entire tile queue');
  assert.equal(await get(0), cached, 'Provider pause must retain usable cached coverage');
  now += 60_001; unavailable = false; releaseProbe = null;
  const recovering = get(21);
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(get(22), /recovery|cooldown|paused/i);
  assert.equal(calls, 5, 'Only one tile may probe a provider after its cooldown');
  releaseProbe(); await recovering;
  await get(22);
  assert.equal(calls, 6, 'A successful probe must reopen normal fetching');
});

test('vector rate limits honor Retry-After without treating a missing tile as a provider outage', async t => {
  releaseShortbreadRuntimeCache({ includeRaw: true });
  const previousConfig = globalThis.WORLD_EXPLORER_CONFIG;
  globalThis.WORLD_EXPLORER_CONFIG = { osmVectorTileUrl: 'https://rate-test.invalid/{z}/{x}/{y}' };
  t.after(() => { globalThis.WORLD_EXPLORER_CONFIG = previousConfig; releaseShortbreadRuntimeCache({ includeRaw: true }); });
  let now = 100_000, status = 404, calls = 0;
  t.mock.method(Date, 'now', () => now);
  const loadVectorTileLib = async () => ({ Pbf: class {}, VectorTile: class {} });
  t.mock.method(globalThis, 'fetch', async () => {
    calls++; return { ok: status === 200, status, headers: { get: () => '120' }, arrayBuffer: async () => new ArrayBuffer(0) };
  });
  const get = x => fetchShortbreadTile(14, x, 1, { loadVectorTileLib });
  for (let x = 0; x < 4; x++) await assert.rejects(get(x));
  assert.equal(calls, 4, 'Missing individual tiles must not disable other coverage');
  status = 429; await assert.rejects(get(4));
  now += 60_001; status = 200; await assert.rejects(get(5));
  assert.equal(calls, 5, 'Retry-After must prevent an early retry');
  now += 60_001; await get(5);
  assert.equal(calls, 6);
});


test('late concurrent success cannot reopen a paused vector provider', async t => {
  releaseShortbreadRuntimeCache({ includeRaw: true });
  const previousConfig = globalThis.WORLD_EXPLORER_CONFIG;
  globalThis.WORLD_EXPLORER_CONFIG = { osmVectorTileUrl: 'https://generation-test.invalid/{z}/{x}/{y}' };
  t.after(() => { globalThis.WORLD_EXPLORER_CONFIG = previousConfig; releaseShortbreadRuntimeCache({ includeRaw: true }); });
  let finishOld, startedOld, calls = 0;
  const started = new Promise(resolve => { startedOld = resolve; });
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    if (calls === 1) { startedOld(); await new Promise(resolve => { finishOld = resolve; });
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) }; }
    return { ok: false, status: 429 };
  });
  const loadVectorTileLib = async () => ({ Pbf: class {}, VectorTile: class {} });
  const get = x => fetchShortbreadTile(14, x, 1, { loadVectorTileLib });
  const old = get(0); await started;
  await assert.rejects(get(1)); finishOld(); await old;
  await assert.rejects(get(2), /paused/);
  assert.equal(calls, 2);
  assert.ok(await get(0), 'The late successful tile remains useful cached coverage');
});
