import assert from 'node:assert/strict';
import { createWorldLoadRequest } from '../app/js/earth-core/world-load-request.js';
import {
  createWorldLoadSession,
  WORLD_LOAD_SESSION_STATES
} from '../app/js/earth-core/world-load-session.js';

let now = 100;
const request = createWorldLoadRequest({
  key: 'custom',
  name: 'Lifecycle Test',
  lat: 39.29,
  lon: -76.61
}, 7);
const session = createWorldLoadSession(request, { now: () => ++now });

assert.deepEqual(WORLD_LOAD_SESSION_STATES, [
  'requested', 'fetching', 'compiling', 'published', 'superseded', 'failed', 'disposed'
]);
assert.equal(session.snapshot().state, 'requested');
assert.equal(session.transition('published'), false, 'publication cannot skip fetch and compile');
assert.equal(session.transition('fetching'), true);

const transport = session.beginProviderWork('osm-overpass', 'transport');
const buildings = session.beginProviderWork('overture', 'buildings');
assert.ok(transport && buildings);
assert.equal(session.settleProviderWork(transport, 'completed'), true);
assert.equal(session.settleProviderWork(transport, 'completed'), false, 'work may settle only once');
assert.equal(session.transition('compiling'), true);
assert.equal(session.settleProviderWork(buildings, 'discarded'), true);
assert.equal(session.publish('primary-world'), true);
assert.equal(session.beginProviderWork('late-provider'), null, 'published sessions reject new provider work');

const published = session.snapshot();
assert.equal(published.state, 'published');
assert.equal(published.providers['osm-overpass'].completed, 1);
assert.equal(published.providers.overture.discarded, 1);
assert.equal(published.outstandingProviderWork, 0);
assert.ok(Object.isFrozen(published));
assert.ok(Object.isFrozen(published.providers));
assert.ok(Object.isFrozen(published.events));
assert.equal(session.dispose('test-complete'), true);
assert.equal(session.snapshot().state, 'disposed');

const superseded = createWorldLoadSession(
  createWorldLoadRequest({ key: 'baltimore', name: 'Baltimore', lat: 39.29, lon: -76.61 }, 8),
  { now: () => ++now }
);
assert.equal(superseded.transition('fetching'), true);
const terrain = superseded.beginProviderWork('mapzen-terrarium', 'far-terrain');
assert.equal(superseded.supersede('new-location'), true);
assert.equal(superseded.snapshot().outstandingProviderWork, 1, 'state changes must not pretend provider work was aborted');
assert.equal(superseded.settleProviderWork(terrain, 'aborted'), true);
assert.equal(superseded.snapshot().providers['mapzen-terrarium'].aborted, 1);
assert.equal(superseded.publish(), false, 'superseded sessions cannot publish');

assert.throws(() => createWorldLoadSession(null), /positive sequence/);

console.log(JSON.stringify({
  ok: true,
  contract: 'world-load-session-state-machine',
  states: WORLD_LOAD_SESSION_STATES,
  behaviors: [
    'legal-transition-order',
    'terminal-publication',
    'provider-work-accounting',
    'no-fabricated-cancellation',
    'immutable-snapshots'
  ]
}, null, 2));
