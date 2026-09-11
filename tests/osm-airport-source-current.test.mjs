import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_CELL_REQUESTS,
  fetchMappedAirportData,
  isAirportSelection,
  normalizeAirportBounds,
  splitBounds
} from '../app/js/world/osm-airport-source.js';

function airportSelection(overrides = {}) {
  return {
    lat: 39.1747196,
    lon: -76.6707551,
    locationDetails: {
      isAirport: true,
      airportClass: 'international',
      airportBounds: {
        minLat: 39.1578912,
        maxLat: 39.1949606,
        minLon: -76.7154717,
        maxLon: -76.6449952
      }
    },
    ...overrides
  };
}

test('only an explicit airport selection authorizes the bounded exact airport source', () => {
  assert.equal(isAirportSelection({ lat: 39.29, lon: -76.61, locationDetails: { kind: 'City' } }), false);
  assert.equal(normalizeAirportBounds({ lat: 39.29, lon: -76.61, locationDetails: { kind: 'City' } }), null);
  assert.equal(isAirportSelection({ lat: 39.1774, lon: -76.6684, name: 'BWI Airport' }), true);
  assert.ok(normalizeAirportBounds({ lat: 39.1774, lon: -76.6684, name: 'BWI Airport' }));
  assert.equal(isAirportSelection(airportSelection()), true);
  const bounds = normalizeAirportBounds(airportSelection());
  assert.ok(bounds.minLat < 39.1747 && bounds.maxLat > 39.1747);
  assert.ok(bounds.minLon < -76.6707 && bounds.maxLon > -76.6707);
  assert.ok(bounds.maxLat - bounds.minLat <= .085);
  assert.ok(bounds.maxLon - bounds.minLon <= .085);
});

test('airport map requests are divided into a bounded number of small cells', () => {
  const cells = splitBounds(normalizeAirportBounds(airportSelection()));
  assert.ok(cells.length > 1);
  assert.ok(cells.length <= MAX_CELL_REQUESTS);
  for (const cell of cells) {
    assert.ok(cell.maxLat - cell.minLat <= .0200001);
    assert.ok(cell.maxLon - cell.minLon <= .0200001);
  }
});

test('the fallback retains exact airport facilities and their geometry nodes only', async () => {
  const previousFetch = globalThis.fetch;
  let active = 0;
  let maximumActive = 0;
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        elements: [
          { type: 'node', id: 1, lat: 1, lon: 1 },
          { type: 'node', id: 2, lat: 1, lon: 2 },
          { type: 'node', id: 3, lat: 2, lon: 2 },
          { type: 'way', id: 10, nodes: [1, 2], tags: { aeroway: 'runway', ref: '10/28' } },
          { type: 'way', id: 20, nodes: [2, 3], tags: { highway: 'service' } }
        ]
      })
    };
  };
  try {
    const selection = airportSelection({
      lat: 12.345678,
      lon: 23.456789,
      locationDetails: {
        isAirport: true,
        airportBounds: { minLat: 12.341, maxLat: 12.349, minLon: 23.452, maxLon: 23.461 }
      }
    });
    const result = await fetchMappedAirportData(selection, { timeoutMs: 5000 });
    assert.ok(requestCount >= 1);
    assert.equal(maximumActive, 1);
    assert.equal(result.elements.some((element) => element.tags?.highway === 'service'), false);
    assert.equal(result.elements.some((element) => element.tags?.aeroway === 'runway'), true);
    assert.deepEqual(result.elements.filter((element) => element.type === 'node').map(({ id }) => id).sort(), [1, 2]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
