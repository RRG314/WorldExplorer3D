import assert from 'node:assert/strict';
import {
  beginFixedRegionalStructureLoad,
  buildFixedRegionalStructureQuery,
  mergeExactRegionalStructures,
  retainExactRegionalStructures
} from '../app/js/world/fixed-regional-structures.js';

const bounds = {
  minLat: 40.68,
  minLon: -74.08,
  maxLat: 40.82,
  maxLon: -73.90
};
const query = buildFixedRegionalStructureQuery(bounds, 18);
assert.match(query, /motorway_link/);
assert.match(query, /\["bridge"\]/);
assert.match(query, /\["tunnel"\]/);
assert.doesNotMatch(query, /footway|cycleway|pedestrian/);

const exactSource = {
  elements: [
    { type: 'node', id: 1, lat: 40.706, lon: -73.997 },
    { type: 'node', id: 2, lat: 40.707, lon: -73.996 },
    { type: 'node', id: 3, lat: 40.766, lon: -74.022 },
    { type: 'node', id: 4, lat: 40.767, lon: -74.021 },
    { type: 'node', id: 5, lat: 40.72, lon: -74.01 },
    {
      type: 'way',
      id: 101,
      nodes: [1, 2],
      tags: { highway: 'primary', bridge: 'yes', layer: '1', name: 'Brooklyn Bridge' }
    },
    {
      type: 'way',
      id: 102,
      nodes: [3, 4],
      tags: { highway: 'primary', tunnel: 'yes', layer: '-1', name: 'Lincoln Tunnel' }
    },
    {
      type: 'way',
      id: 103,
      nodes: [4, 5],
      tags: { highway: 'footway', bridge: 'yes', name: 'No pedestrian import' }
    },
    {
      type: 'way',
      id: 104,
      nodes: [4, 5],
      tags: { highway: 'primary_link', name: 'Lincoln Tunnel Approach' }
    }
  ]
};
const retained = retainExactRegionalStructures(exactSource);
assert.deepEqual(retained.elements.filter((element) => element.type === 'way').map((way) => way.id), [101, 102, 104]);
assert.ok(retained.elements.filter((element) => element.type === 'way').every(
  (way) => way.tags._sourceCompleteness === 'lossless'
));
assert.deepEqual(retained._fixedRegionalStructures, {
  exactWays: 2,
  connectors: 1,
  bridges: 1,
  tunnels: 1,
  covered: 0
});

const generalized = {
  elements: [
    { type: 'node', id: -1, lat: 40.706, lon: -73.997 },
    { type: 'node', id: -2, lat: 40.707, lon: -73.996 },
    { type: 'node', id: -3, lat: 40.71, lon: -74.0 },
    { type: 'node', id: -4, lat: 40.711, lon: -74.001 },
    { type: 'node', id: -5, lat: 40.70601, lon: -73.99701 },
    { type: 'node', id: -6, lat: 40.70701, lon: -73.99601 },
    { type: 'node', id: -7, lat: 40.706, lon: -73.9967 },
    { type: 'node', id: -8, lat: 40.707, lon: -73.9977 },
    {
      type: 'way',
      id: -10,
      nodes: [-1, -2],
      tags: {
        highway: 'primary', bridge: 'yes', name: 'Brooklyn Bridge',
        _sourceCompleteness: 'generalized'
      }
    },
    {
      type: 'way',
      id: -11,
      nodes: [-3, -4],
      tags: {
        highway: 'primary', bridge: 'yes', name: 'FDR Drive',
        _sourceCompleteness: 'generalized'
      }
    },
    {
      type: 'way',
      id: -12,
      nodes: [-3, -4],
      tags: {
        highway: 'primary_link', name: 'Lincoln Tunnel Approach',
        _sourceCompleteness: 'generalized'
      }
    },
    {
      type: 'way',
      id: -13,
      nodes: [-5, -6],
      tags: {
        highway: 'primary', bridge: 'yes', name: 'Different regional route label',
        _sourceCompleteness: 'generalized'
      }
    },
    {
      type: 'way',
      id: -14,
      nodes: [-7, -8],
      tags: {
        highway: 'primary', bridge: 'yes', name: 'Nearby crossing bridge',
        _sourceCompleteness: 'generalized'
      }
    }
  ]
};
const merged = mergeExactRegionalStructures(generalized, exactSource);
const mergedWays = merged.elements.filter((element) => element.type === 'way');
assert.equal(mergedWays.some((way) => way.id === -10), false, 'exact named bridge must replace generalized copy');
assert.equal(mergedWays.some((way) => way.id === -11), true, 'unrelated nearby bridge must remain');
assert.equal(mergedWays.some((way) => way.id === -12), true, 'an exact connector must not erase generalized regional road continuity by name');
assert.equal(mergedWays.some((way) => way.id === -13), false, 'spatially overlapping generalized bridge must yield despite a different name');
assert.equal(mergedWays.some((way) => way.id === -14), true, 'a nearby crossing bridge must not be removed by proximity alone');
assert.equal(mergedWays.some((way) => way.id === 101), true);
assert.equal(mergedWays.some((way) => way.id === 102), true);
assert.equal(merged._fixedRegionalStructures.replacedGeneralizedWays, 2);

let requestedQuery = '';
const request = beginFixedRegionalStructureLoad({
  location: { lat: 40.758, lon: -73.9855 },
  fetchOverpassJSON: async (value) => {
    requestedQuery = value;
    return exactSource;
  },
  runProviderWork: (_provider, _operation, work) => work(new AbortController().signal)
});
const outcome = await request.outcome;
assert.equal(outcome.error, null);
assert.match(requestedQuery, /Brooklyn|Lincoln|Holland|Queensboro|Manhattan|bridge|tunnel/i);

console.log(JSON.stringify({
  ok: true,
  contract: 'fixed-regional-structures',
  exactWays: merged._fixedRegionalStructures.exactWays,
  addedWays: merged._fixedRegionalStructures.addedWays,
  replacedGeneralizedWays: merged._fixedRegionalStructures.replacedGeneralizedWays
}, null, 2));
