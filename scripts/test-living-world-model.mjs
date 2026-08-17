import assert from 'node:assert/strict';
import { createWorldLoadRequest } from '../app/js/earth-core/world-load-request.js';
import { createWorldSnapshot } from '../app/js/earth-core/world-snapshot.js';
import {
  createLivingWorldPublication,
  createLivingWorldPublicationStore,
  createStableWorldIdentity,
  createWorldRandom,
  isLivingWorldPublicationActive
} from '../app/js/living-world/model.js';

function emptyLayers() {
  return {
    terrain: { authority: 'accepted-ground', completeness: 'complete', records: [{ id: 'terrain:1' }] },
    hydrology: { completeness: 'empty', records: [] },
    transport: { authority: 'transport-publication', completeness: 'complete', records: [{ id: 'road:1' }] },
    buildings: { authority: 'building-publication', completeness: 'partial', records: [{ id: 'building:1' }] },
    landuse: { completeness: 'empty', records: [] },
    places: { completeness: 'empty', records: [] }
  };
}

const selection = Object.freeze({
  key: 'baltimore',
  name: 'Baltimore',
  lat: 39.2904,
  lon: -76.6122
});
const request = createWorldLoadRequest(selection, 7);
const replacementRequest = createWorldLoadRequest(selection, 8);
const snapshot = createWorldSnapshot({ request, layers: emptyLayers(), createdAt: 100 });
const replacementSnapshot = createWorldSnapshot({ request: replacementRequest, layers: emptyLayers(), createdAt: 200 });

const identity = createStableWorldIdentity(request);
const replacementIdentity = createStableWorldIdentity(replacementRequest);
assert.deepEqual(identity, replacementIdentity, 'stable identity changed with transient load sequence');
assert.ok(Object.isFrozen(identity));
assert.match(identity.id, /^world-identity:v1:earth:/);

const randomA = createWorldRandom(identity, 314159);
const randomB = createWorldRandom(replacementIdentity, 314159);
assert.deepEqual(
  [randomA(), randomA(), randomA(), randomA()],
  [randomB(), randomB(), randomB(), randomB()],
  'same fixed world and discriminator must produce the same sequence'
);

const publication = createLivingWorldPublication({
  snapshot,
  worldIdentity: identity,
  entrances: [{ id: 'entrance:building:1:inferred:0', buildingSourceId: 'building:1', provenance: 'inferred' }],
  pedestrianGraph: { nodes: [{ id: 'walk:1' }], edges: [] },
  trafficGraph: { nodes: [{ id: 'drive:1' }], edges: [] },
  semanticDensity: { urban: 0.7 },
  provenance: { mappedEntrances: 0, inferredEntrances: 1 }
});
assert.ok(Object.isFrozen(publication));
assert.ok(Object.isFrozen(publication.entrances[0]));
assert.ok(Object.isFrozen(publication.pedestrianGraph.nodes[0]));
assert.equal(snapshot.layers.buildings.records[0].id, 'building:1');
assert.equal(isLivingWorldPublicationActive(publication, {
  activeRequestId: request.id,
  activeSequence: request.sequence,
  suppressed: false
}), true);
assert.equal(isLivingWorldPublicationActive(publication, {
  activeRequestId: replacementRequest.id,
  activeSequence: replacementRequest.sequence,
  suppressed: false
}), false, 'stale derived publication remained active after a fixed-world replacement');

const disposed = [];
const store = createLivingWorldPublicationStore({
  dispose: (value) => disposed.push(value.id)
});
assert.equal(store.publish(publication, { expectedRequestId: request.id }).published, true);
assert.equal(store.publish(publication, { expectedRequestId: replacementRequest.id }).published, false);

const replacementPublication = createLivingWorldPublication({
  snapshot: replacementSnapshot,
  worldIdentity: replacementIdentity
});
assert.equal(store.publish(replacementPublication).published, true);
assert.deepEqual(disposed, [publication.id]);
assert.equal(store.clear('world-reload').cleared, true);
assert.deepEqual(disposed, [publication.id, replacementPublication.id]);

assert.throws(
  () => createLivingWorldPublication({
    snapshot,
    worldIdentity: createStableWorldIdentity(createWorldLoadRequest({
      key: 'monaco',
      name: 'Monaco',
      lat: 43.7384,
      lon: 7.4246
    }, 9))
  }),
  /does not match/
);

console.log(JSON.stringify({
  ok: true,
  contract: 'living-world-publication-v1',
  worldIdentity: identity.id,
  requestSequenceIndependent: identity.id === replacementIdentity.id,
  immutableSnapshotPreserved: snapshot.layers.buildings.records[0].id === 'building:1',
  disposed
}, null, 2));
