import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchShortbreadWorldData } from '../app/js/world/shortbread-source.js';
import { normalizeTransportSource } from '../app/js/world/compiler/transport-source-normalizer.js';

async function coverage(missing) {
  const features = [
    { id: 1, toGeoJSON: () => ({ properties: { kind: 'residential', name: 'Intact road' }, geometry: { type: 'LineString', coordinates: [[-40, 30], [-20, 31]] } }) },
    { id: 2, toGeoJSON: () => ({ properties: { kind: 'residential', name: 'Boundary road' }, geometry: { type: 'LineString', coordinates: [[-10, 30], [0, 30]] } }) }
  ];
  return fetchShortbreadWorldData({ lat: 40, lon: 0, zoom: 2,
    bounds: { minLat: 20, maxLat: 60, minLon: -80, maxLon: 80 },
    includeBuildings: false, layerNames: ['streets'],
    shortbreadFetchTile: async (z, x, y) => {
      if (x === 2) { if (missing) throw new Error('unavailable tile'); return null; }
      return { z, x, y, tile: { layers: { streets: { length: features.length, feature: i => features[i] } } } };
    }
  });
}

test('partial provider failure preserves intact roads and disables only fragments touching the missing tile', async () => {
  const data = await coverage(true);
  const ways = data.elements.filter(element => element.tags?.highway);
  assert.equal(ways.length, 2);
  const intact = ways.find(way => way.tags._sourceFeatureId.endsWith(':1:0'));
  const boundary = ways.find(way => way.tags._sourceFeatureId.endsWith(':2:0'));
  assert.equal(normalizeTransportSource({}, intact.tags).safeForDriving, true);
  assert.equal(normalizeTransportSource({}, boundary.tags).safeForDriving, false);
  assert.equal(data._shortbreadTiles.coverageComplete, false);
  assert.equal(data._shortbreadTiles.failed, 1);
  assert.equal(data._shortbreadTiles.affectedRoads, 1);
  assert.deepEqual(data._shortbreadTiles.missingTiles, [{ x: 2, y: 1, z: 2 }]);
});

test('a successful empty tile is complete coverage and must not disable a boundary road', async () => {
  const data = await coverage(false);
  assert.equal(data._shortbreadTiles.coverageComplete, true);
  assert.equal(data._shortbreadTiles.affectedRoads, 0);
  assert.ok(data.elements.filter(element => element.tags?.highway).every(way => normalizeTransportSource({}, way.tags).safeForDriving));
});
