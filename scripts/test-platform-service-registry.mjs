import assert from 'node:assert/strict';
import { createPlatformServiceRegistry } from '../app/js/platform/service-registry.js';

let clock = 0;
let loads = 0;
let disposals = 0;
const events = [];
const registry = createPlatformServiceRegistry({ now: () => ++clock, onEvent: (event) => events.push(event.type) });

registry.register({
  id: 'editor',
  category: 'authoring',
  async load() {
    loads++;
    await Promise.resolve();
    return { open: () => 'opened', dispose: () => disposals++ };
  }
});

const [first, second] = await Promise.all([registry.ensure('editor'), registry.ensure('editor')]);
assert.equal(first, second);
assert.equal(loads, 1, 'Concurrent service requests should share one load.');
assert.equal(await registry.call('editor', 'open'), 'opened');
assert.equal(registry.snapshot().services[0].status, 'ready');
assert.equal(registry.reset('editor'), true);
assert.equal(disposals, 1);
await registry.ensure('editor');
assert.equal(loads, 2, 'Reset services should be loadable again.');
assert.deepEqual(events, ['registered', 'loading', 'ready', 'reset', 'loading', 'ready']);

console.log(JSON.stringify({ ok: true, loads, disposals, status: registry.snapshot().services[0].status }, null, 2));
