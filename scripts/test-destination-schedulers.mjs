import assert from 'node:assert/strict';
import {
  createDestinationScheduler,
  getDestinationSchedulerRegistrySnapshot,
  registerDestinationScheduler
} from '../app/js/runtime/destination-schedulers.js';

const lifecycle = [];
const unregister = registerDestinationScheduler('EARTH', ({ generation }) => ({
  start() {
    lifecycle.push(`start:${generation}`);
    return true;
  },
  stop(reason) {
    lifecycle.push(`stop:${reason}`);
    return true;
  }
}));

assert.throws(
  () => registerDestinationScheduler('EARTH', () => ({})),
  /already registered/
);
assert.equal(createDestinationScheduler({ destination: 'OCEAN' }), null);
const scheduler = createDestinationScheduler({
  destination: 'EARTH',
  generation: 7
});
assert.equal(scheduler.start(), true);
assert.equal(scheduler.stop('test'), true);
assert.deepEqual(lifecycle, ['start:7', 'stop:test']);
assert.deepEqual(getDestinationSchedulerRegistrySnapshot(), {
  destinations: ['EARTH'],
  registered: 1
});
assert.equal(unregister(), true);
assert.equal(unregister(), false);
assert.deepEqual(getDestinationSchedulerRegistrySnapshot(), {
  destinations: [],
  registered: 0
});

console.log(JSON.stringify({ ok: true, lifecycle }, null, 2));
