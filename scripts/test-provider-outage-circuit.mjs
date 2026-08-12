import assert from 'node:assert/strict';
import {
  createProviderOutageCircuit,
  ProviderUnavailableError
} from '../app/js/earth-core/provider-outage-circuit.js';

let clock = 1_000;
const circuit = createProviderOutageCircuit({
  provider: 'fixture-provider',
  cooldownMs: 5_000,
  now: () => clock
});
const origin = new AbortController();
const siblingA = new AbortController();
const siblingB = new AbortController();
const releaseOrigin = circuit.track(origin);
const releaseA = circuit.track(siblingA);
const releaseB = circuit.track(siblingB);

const outage = circuit.trip('fixture endpoint failure', origin);
assert.ok(outage instanceof ProviderUnavailableError);
assert.equal(origin.signal.aborted, false, 'The request reporting the outage must retain its original error.');
assert.equal(siblingA.signal.aborted, true, 'A sibling provider request was not cancelled.');
assert.equal(siblingB.signal.aborted, true, 'A second sibling provider request was not cancelled.');
assert.throws(() => circuit.assertAvailable(), {
  name: 'ProviderUnavailableError',
  code: 'provider_unavailable',
  provider: 'fixture-provider'
});
assert.deepEqual(circuit.snapshot(), {
  provider: 'fixture-provider',
  open: true,
  unavailableUntil: 6_000,
  reason: 'fixture endpoint failure',
  activeRequests: 1,
  trips: 1,
  abortedSiblingRequests: 2
});

releaseOrigin();
releaseA();
releaseB();
clock = 6_001;
assert.doesNotThrow(() => circuit.assertAvailable(), 'Provider circuit did not close after its cooldown.');
assert.equal(circuit.snapshot().open, false);
assert.equal(circuit.snapshot().activeRequests, 0);

console.log(JSON.stringify({
  ok: true,
  contract: 'provider-outage-circuit',
  cancelledSiblingRequests: 2,
  cooldownMs: 5_000
}, null, 2));
