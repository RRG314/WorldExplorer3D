import assert from 'node:assert/strict';
import test from 'node:test';

const settle = () => new Promise(resolve => setImmediate(resolve));
let sequence = 0;
const freshSearch = () => import(`../app/js/places/place-search.js?lifecycle-test=${++sequence}`);

function installProvider(t) {
  const requests = [];
  t.mock.method(globalThis, 'fetch', (_url, { signal }) => new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason || new DOMException('cancelled', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    requests.push({ signal, resolve: payload => {
      signal.removeEventListener('abort', abort);
      resolve({ ok: true, json: async () => payload });
    } });
  }));
  return requests;
}

test('hung place search times out and releases the serialized provider queue', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const requests = installProvider(t);
  const { searchPlaces } = await freshSearch();
  const controller = new AbortController();
  let failure = null;
  const result = searchPlaces('timeout-city', { signal: controller.signal }).catch(error => { failure = error; });
  await settle();
  try {
    assert.equal(requests.length, 1);
    t.mock.timers.tick(10_001);
    await settle();
    assert.match(failure?.message || '', /timed out/i, 'A provider stall must end with a useful retry message.');
    await result;
    const next = searchPlaces('next-city');
    await settle();
    t.mock.timers.tick(1051);
    await settle();
    assert.equal(requests.length, 2);
    requests[1].resolve([{ lat: '1', lon: '2', name: 'Next city' }]);
    assert.equal((await next)[0].name, 'Next city');
  } finally { controller.abort(); await result; }
});

test('cancelling one caller does not cancel another search for the same place', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const requests = installProvider(t);
  const { searchPlaces } = await freshSearch();
  const firstController = new AbortController(), secondController = new AbortController();
  const first = searchPlaces('shared-city', { signal: firstController.signal }).catch(error => error);
  const second = searchPlaces('shared-city', { signal: secondController.signal }).catch(error => error);
  await settle();
  firstController.abort();
  await first;
  await settle();
  t.mock.timers.tick(1051);
  await settle();
  try {
    assert.equal(requests.length, 2, 'Independent cancellation requires independent requests.');
    assert.equal(requests[1].signal.aborted, false);
    requests[1].resolve([{ lat: '3', lon: '4', name: 'Shared city' }]);
    assert.equal((await second)[0].name, 'Shared city');
  } finally { secondController.abort(); await second; }
});

test('coordinate search works without a geocoding provider', async t => {
  const requests = installProvider(t);
  const { searchPlaces } = await freshSearch();
  const result = await searchPlaces('39.2904, -76.6122');
  assert.equal(result[0].lat, 39.2904);
  assert.equal(result[0].lon, -76.6122);
  assert.equal(result[0].category, 'coordinate');
  assert.equal(requests.length, 0);
});


test('already cancelled search cannot publish even cached or coordinate results', async t => {
  const requests = installProvider(t);
  const { searchPlaces } = await freshSearch();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(searchPlaces('39.2904, -76.6122', { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(requests.length, 0);
});
