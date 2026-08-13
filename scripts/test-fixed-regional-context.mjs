import assert from 'node:assert/strict';
import { resolveRoadRibbonSubdivisionStep } from '../app/js/terrain/rebuild.js';
import {
  FIXED_REGIONAL_CONTEXT_RADIUS_METERS,
  beginFixedRegionalTransportLoad,
  fixedRegionalContextBounds,
  mergeFixedRegionalTransport,
  retainRegionalTransportOutsideCore
} from '../app/js/world/fixed-regional-context.js';
import {
  selectShortbreadZoomForBounds,
  shortbreadTileCountForBounds
} from '../app/js/world/shortbread-source.js';
import {
  isFixedRegionalEngineeredRoad,
  partitionFixedRegionalRoads
} from '../app/js/world/load-budgeting.js';

const mutableLocation = { lat: 40.758, lon: -73.9855 };
let beginProviderWork;
let requestedLocation;
const pendingRequest = beginFixedRegionalTransportLoad({
  location: mutableLocation,
  fetchWorldData: async ({ lat, lon }) => {
    requestedLocation = { lat, lon };
    return { elements: [] };
  },
  runProviderWork: (_provider, _label, work) => new Promise((resolve) => {
    beginProviderWork = () => resolve(work());
  })
});
mutableLocation.lat = 43.6532;
mutableLocation.lon = -79.3832;
beginProviderWork();
await pendingRequest.outcome;
assert.deepEqual(requestedLocation, { lat: 40.758, lon: -73.9855 });
assert.deepEqual(pendingRequest.location, { lat: 40.758, lon: -73.9855 });

const bridge = { id: 1, nodes: [1, 2], tags: { highway: 'primary', bridge: 'yes' } };
const bridgeApproach = { id: 2, nodes: [2, 3], tags: { highway: 'primary_link' } };
const ordinaryRoad = { id: 3, nodes: [4, 5], tags: { highway: 'residential' } };
const tunnel = { id: 4, nodes: [6, 7], tags: { highway: 'secondary', tunnel: 'yes' } };
const unrelatedIntersection = { id: 5, nodes: [2, 8], tags: { highway: 'service' } };
assert.equal(isFixedRegionalEngineeredRoad(bridge), true);
assert.equal(isFixedRegionalEngineeredRoad(tunnel), true);
const regionalPartition = partitionFixedRegionalRoads([
  bridge,
  bridgeApproach,
  ordinaryRoad,
  tunnel,
  unrelatedIntersection
]);
assert.deepEqual(regionalPartition.engineered.map((way) => way.id), [1, 4]);
assert.deepEqual(regionalPartition.connectors.map((way) => way.id), [2]);
assert.deepEqual(regionalPartition.general.map((way) => way.id), [3, 5]);

const location = { lat: 40.758, lon: -73.9855 };

assert.equal(
  resolveRoadRibbonSubdivisionStep({
    fixedRegionalContext: true,
    subdivideMaxDist: 4,
    structureSemantics: { terrainMode: 'tunnel' },
    structureTransitionAnchors: [{ distance: 0 }]
  }),
  4,
  'the final publisher must preserve the regional structure resolution assigned by the feature compiler'
);
assert.equal(
  resolveRoadRibbonSubdivisionStep({
    fixedRegionalContext: false,
    subdivideMaxDist: 4,
    structureSemantics: { terrainMode: 'bridge' }
  }),
  0.55,
  'detailed core structures must retain their high-resolution surface profile'
);
const bounds = fixedRegionalContextBounds(location);
const zoom = selectShortbreadZoomForBounds(bounds, { preferredZoom: 14, maxTiles: 144 });
assert.ok(shortbreadTileCountForBounds(bounds, zoom) <= 144);

const source = {
  elements: [
    { type: 'node', id: -1, lat: 40.758, lon: -73.9855 },
    { type: 'node', id: -2, lat: 40.759, lon: -73.9845 },
    { type: 'node', id: -3, lat: 40.7357, lon: -74.0301 },
    { type: 'node', id: -4, lat: 40.7362, lon: -74.0296 },
    { type: 'way', id: -5, nodes: [-1, -2], tags: { highway: 'primary' } },
    { type: 'way', id: -6, nodes: [-3, -4], tags: { highway: 'residential' } }
  ],
  _shortbreadTiles: { requested: 64, loaded: 64 }
};
const classified = retainRegionalTransportOutsideCore(source, {
  location,
  coreRadiusMeters: 2200,
  includeCore: true,
  radiusMeters: FIXED_REGIONAL_CONTEXT_RADIUS_METERS
});
const ways = classified.elements.filter((element) => element.type === 'way');
assert.equal(ways.length, 2);
assert.equal(ways.find((way) => way.tags.highway === 'primary').tags._regionalContext, undefined);
assert.equal(ways.find((way) => way.tags.highway === 'residential').tags._regionalContext, 'fixed-location');

const merged = mergeFixedRegionalTransport({
  elements: [
    { type: 'node', id: -1, lat: 40.758, lon: -73.9855 },
    { type: 'way', id: -2, nodes: [-1], tags: { highway: 'service' } }
  ]
}, classified);
const ids = merged.elements.map((element) => element.id);
assert.equal(new Set(ids).size, ids.length);
const nodeIds = new Set(merged.elements.filter((element) => element.type === 'node').map((node) => node.id));
for (const way of merged.elements.filter((element) => element.type === 'way')) {
  assert.ok(way.nodes.every((nodeId) => nodeIds.has(nodeId)));
}

console.log(JSON.stringify({
  ok: true,
  contract: 'fixed-regional-context',
  radiusMeters: FIXED_REGIONAL_CONTEXT_RADIUS_METERS,
  zoom,
  tiles: shortbreadTileCountForBounds(bounds, zoom),
  coreWays: ways.filter((way) => !way.tags._regionalContext).length,
  regionalWays: ways.filter((way) => way.tags._regionalContext === 'fixed-location').length
}, null, 2));
