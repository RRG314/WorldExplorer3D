import assert from 'node:assert/strict';
import { createGameplayPluginRegistry } from '../app/js/gameplay/plugin-registry.js';

let clock = 0;
const events = [];
const lifecycle = [];
const registry = createGameplayPluginRegistry({
  now: () => ++clock,
  onEvent: (event) => events.push(`${event.type}:${event.id}`)
});

registry.register({
  id: 'trial',
  label: 'Time Trial',
  start: () => {
    lifecycle.push('start:trial');
    return { elapsed: 0 };
  },
  update(dt, _context, state) {
    state.elapsed += dt;
  },
  stop(_context, state, reason) {
    lifecycle.push(`stop:trial:${reason}:${state.elapsed}`);
  },
  save(_context, state) {
    return { elapsed: state.elapsed };
  },
  leaderboard: () => [{ player: 'local', score: 10 }]
});

registry.register({ id: 'free', label: 'Free Explore' });
registry.start('trial');
registry.update(0.25);
registry.update(0.75);
assert.deepEqual(registry.save(), { elapsed: 1 });
assert.deepEqual(registry.leaderboard(), [{ player: 'local', score: 10 }]);
registry.start('free');

const snapshot = registry.snapshot();
assert.equal(snapshot.activeId, 'free');
assert.equal(snapshot.registered, 2);
assert.equal(snapshot.transitionCount, 2);
assert.equal(snapshot.failureCount, 0);
assert.equal(snapshot.plugins.find((plugin) => plugin.id === 'trial').updates, 2);
assert.deepEqual(lifecycle, ['start:trial', 'stop:trial:replaced:1']);
assert.deepEqual(events, [
  'registered:trial',
  'registered:free',
  'started:trial',
  'stopped:trial',
  'started:free'
]);
assert.throws(() => registry.start('missing'), /Unknown gameplay plugin/);

console.log(JSON.stringify({ ok: true, snapshot, lifecycle }, null, 2));
