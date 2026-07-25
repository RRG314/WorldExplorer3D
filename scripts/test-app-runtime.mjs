import assert from 'node:assert/strict';
import { createAppRuntime } from '../app/js/runtime/app-runtime.js';

let clock = 100;
let destination = null;
const events = [];
const lifecycle = [];
const schedulers = [];
const schedulerLifecycle = [];

function createScheduler({ destination: target, generation }) {
  const state = {
    destination: target,
    generation,
    starts: 0,
    disposals: 0
  };
  schedulers.push(state);
  return {
    start() {
      state.starts++;
      schedulerLifecycle.push(`start:${target}:${generation}`);
      return true;
    },
    dispose() {
      state.disposals++;
      schedulerLifecycle.push(`dispose:${target}:${generation}`);
      return true;
    },
    snapshot() {
      return { ...state };
    }
  };
}

const runtime = createAppRuntime({
  getDestination: () => destination,
  isDestinationValid: (value) => ['EARTH', 'OCEAN', 'SPACE'].includes(value),
  commitDestination({ target }) {
    destination = target;
    return true;
  },
  createScheduler,
  now: () => ++clock,
  onEvent: (event) => events.push(event)
});

runtime.registerDestination('EARTH', {
  prepare: ({ session }) => lifecycle.push(`prepare:${session.destination}`),
  enter: ({ session }) => lifecycle.push(`enter:${session.destination}`),
  exit: () => lifecycle.push('exit:EARTH'),
  snapshot: () => ({ registered: true })
});
runtime.registerDestination('OCEAN', {
  prepare: ({ session }) => lifecycle.push(`prepare:${session.destination}`),
  enter: ({ session }) => lifecycle.push(`enter:${session.destination}`),
  exit: () => lifecycle.push('exit:OCEAN')
});

assert.equal(await runtime.transition('EARTH', { source: 'title' }), true);
assert.equal(destination, 'EARTH');
assert.deepEqual(lifecycle, ['prepare:EARTH', 'enter:EARTH']);
let snapshot = runtime.snapshot();
assert.equal(snapshot.activeSession.destination, 'EARTH');
assert.equal(snapshot.activeSession.active, true);
assert.equal(snapshot.transition, null);
assert.equal(schedulers[0].starts, 1);

const oceanToken = runtime.beginTransition('OCEAN', { source: 'first' });
const spaceToken = runtime.beginTransition('SPACE', { source: 'second' });
assert.equal(oceanToken.signal.aborted, true);
assert.equal(oceanToken.session.signal.aborted, true);
assert.equal(oceanToken.session.snapshot().disposedReason, 'superseded');
assert.equal(runtime.commit('OCEAN', { token: oceanToken }), false);
assert.equal(runtime.commit('SPACE', { token: spaceToken }), true);
assert.equal(destination, 'SPACE');
assert.equal(schedulers[0].disposals, 1);
assert.equal(schedulers[2].starts, 1);
assert.ok(
  schedulerLifecycle.indexOf('dispose:EARTH:1') <
    schedulerLifecycle.indexOf('start:SPACE:3'),
  'Previous destination scheduler must stop before the next scheduler starts.'
);
snapshot = runtime.snapshot();
assert.equal(snapshot.activeSession.destination, 'SPACE');
assert.equal(snapshot.transition, null);

const sameDestinationToken = runtime.beginTransition('SPACE', { source: 'idempotent' });
assert.equal(runtime.commit('SPACE', { token: sameDestinationToken }), true);
assert.equal(
  sameDestinationToken.session.snapshot().disposedReason,
  'destination-already-active'
);
assert.equal(runtime.snapshot().activeSession.generation, spaceToken.generation);

let finishOceanPreparation;
const blockingRuntime = createAppRuntime({
  getDestination: () => destination,
  isDestinationValid: (value) => ['EARTH', 'OCEAN', 'SPACE'].includes(value),
  commitDestination({ target }) {
    destination = target;
    return true;
  },
  now: () => ++clock
});
blockingRuntime.registerDestination('SPACE', {
  exit: () => lifecycle.push('blocking-exit:SPACE')
});
blockingRuntime.registerDestination('OCEAN', {
  prepare: () => new Promise((resolve) => {
    finishOceanPreparation = resolve;
  })
});
const oceanTransition = blockingRuntime.transition('OCEAN', { source: 'slow' });
await Promise.resolve();
const replacement = blockingRuntime.beginTransition('EARTH', { source: 'replacement' });
finishOceanPreparation();
assert.equal(await oceanTransition, false);
assert.equal(blockingRuntime.commit('EARTH', { token: replacement }), true);
assert.equal(destination, 'EARTH');

let rejectEnter;
const failingRuntime = createAppRuntime({
  getDestination: () => destination,
  isDestinationValid: (value) => ['EARTH', 'OCEAN'].includes(value),
  commitDestination({ target }) {
    destination = target;
    return true;
  },
  now: () => ++clock
});
failingRuntime.registerDestination('OCEAN', {
  enter: () => new Promise((resolve, reject) => {
    rejectEnter = reject;
  })
});
const failedEntry = failingRuntime.transition('OCEAN', { source: 'failing-entry' });
await Promise.resolve();
rejectEnter(new Error('entry failed'));
await assert.rejects(failedEntry, /entry failed/);
assert.equal(failingRuntime.snapshot().activeSession, null);
assert.equal(failingRuntime.snapshot().transition, null);

assert.throws(() => runtime.beginTransition('UNKNOWN'), /Unknown destination/);
assert.equal(runtime.dispose('test-complete'), true);
assert.equal(runtime.dispose('test-complete'), false);
assert.equal(runtime.snapshot().disposed, true);
assert.ok(events.some((event) => event.type === 'transition-cancelled'));
assert.ok(events.some((event) => event.type === 'destination-committed'));

console.log(JSON.stringify({
  ok: true,
  events: events.map((event) => event.type),
  schedulerLifecycle,
  schedulers,
  lifecycle
}, null, 2));
