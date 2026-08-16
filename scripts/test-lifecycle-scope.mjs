import assert from 'node:assert/strict';
import {
  createLifecycleScope,
  getLifecycleRegistrySnapshot
} from '../app/js/runtime/lifecycle-scope.js';

const before = getLifecycleRegistrySnapshot();
const target = new EventTarget();
const scope = createLifecycleScope('behavior-test');
let eventCalls = 0;
let guardedCalls = 0;
let intervalCalls = 0;

scope.listen(target, 'ping', () => { eventCalls += 1; });
const guarded = scope.guard(() => { guardedCalls += 1; });
const intervalHandle = scope.interval(() => { intervalCalls += 1; }, 5);
const pendingTimeout = scope.timeout(() => {
  throw new Error('Disposed timeout executed.');
}, 10_000);

target.dispatchEvent(new Event('ping'));
guarded();
await new Promise((resolve) => setTimeout(resolve, 16));

const active = scope.snapshot();
assert.equal(eventCalls, 1, 'Owned listener did not run while its scope was active.');
assert.equal(guardedCalls, 1, 'Guarded callback did not run while its scope was active.');
assert.ok(intervalCalls >= 1, 'Owned interval did not run while its scope was active.');
assert.equal(active.owner, 'behavior-test');
assert.equal(active.active, true);
assert.equal(active.resources.listener, 1);
assert.equal(active.resources.interval, 1);
assert.equal(active.resources.timeout, 1);
assert.equal(scope.dispose('test-complete'), true);
assert.equal(scope.dispose('duplicate-dispose'), false, 'Lifecycle disposal was not idempotent.');

const callsAtDispose = intervalCalls;
target.dispatchEvent(new Event('ping'));
guarded();
await new Promise((resolve) => setTimeout(resolve, 16));

const disposed = scope.snapshot();
const after = getLifecycleRegistrySnapshot();
assert.equal(eventCalls, 1, 'Disposed listener remained active.');
assert.equal(guardedCalls, 1, 'Disposed guard still invoked its callback.');
assert.equal(intervalCalls, callsAtDispose, 'Disposed interval continued running.');
assert.equal(disposed.active, false);
assert.equal(disposed.disposedReason, 'test-complete');
assert.equal(disposed.resourceCount, 0);
assert.equal(after.activeScopeCount, before.activeScopeCount, 'Disposed scope remained in the registry.');

// The handles are deliberately referenced so this test also proves disposal,
// rather than process exit, is what releases both timer types.
assert.notEqual(intervalHandle, null);
assert.notEqual(pendingTimeout, null);

console.log(JSON.stringify({
  ok: true,
  activeResources: active.resources,
  disposedResources: disposed.resources,
  registryRestored: after.activeScopeCount === before.activeScopeCount
}, null, 2));
