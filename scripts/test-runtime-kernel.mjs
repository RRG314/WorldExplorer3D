import assert from 'node:assert/strict';
import { createCoreFrameSystems } from '../app/js/runtime/core-frame-systems.js';
import { diagnoseRuntimeBudgets } from '../app/js/runtime/budget-diagnostics.js';
import { RUNTIME_PHASES, createRuntimeKernel } from '../app/js/runtime/kernel.js';

const loadingSystems = createCoreFrameSystems({ gameStarted: true, worldLoading: true });
const loadingSystem = (id) => loadingSystems.find((system) => system.id === id);
assert.equal(loadingSystem('core.input').enabled(), false);
assert.equal(loadingSystem('core.simulation').enabled(), false);
assert.equal(loadingSystem('core.world').enabled(), false);
assert.equal(loadingSystem('core.camera').enabled(), false);
assert.equal(loadingSystem('core.presentation').enabled(), true);

const calls = [];
let requestedFrame = null;
let cancelledFrame = null;
const kernel = createRuntimeKernel({
  fixedDelta: 0.01,
  maxDelta: 0.05,
  maxFixedSteps: 3,
  requestFrame(callback) {
    requestedFrame = callback;
    return 41;
  },
  cancelFrame(handle) {
    cancelledFrame = handle;
  },
  getContext: () => ({ session: 'test' })
});

kernel.registerSystem({
  id: 'test.presentation',
  phase: 'presentation',
  priority: 10,
  update: (frame) => calls.push(`presentation:${frame.session}`)
});
kernel.registerSystem({
  id: 'test.input',
  owner: 'input-test',
  phase: 'input',
  update: () => calls.push('input')
});
kernel.registerSystem({
  id: 'test.simulation',
  owner: 'simulation-test',
  phase: 'simulation',
  fixedUpdate: () => calls.push('fixed'),
  update: () => calls.push('simulation')
});
kernel.registerSystem({
  id: 'test.disabled',
  phase: 'world',
  enabled: false,
  update: () => calls.push('disabled')
});

assert.deepEqual(RUNTIME_PHASES, ['input', 'simulation', 'world', 'camera', 'presentation', 'render']);
assert.equal(kernel.runFrame(0), true);
assert.deepEqual(calls, ['input', 'simulation', 'presentation:test']);
calls.length = 0;
assert.equal(kernel.runFrame(25), true);
assert.deepEqual(calls, ['fixed', 'fixed', 'input', 'simulation', 'presentation:test']);
assert.throws(() => kernel.registerSystem({ id: 'test.input', update() {} }), /already registered/);
assert.throws(() => kernel.registerSystem({ id: 'bad.phase', phase: 'unknown', update() {} }), /Unknown runtime phase/);

assert.equal(kernel.start(), true);
assert.equal(typeof requestedFrame, 'function');
assert.equal(kernel.start(), false);
assert.equal(kernel.stop('test-complete'), true);
assert.equal(cancelledFrame, 41);

const snapshot = kernel.snapshot();
assert.equal(snapshot.running, false);
assert.equal(snapshot.stopReason, 'test-complete');
assert.equal(snapshot.frameNumber, 2);
assert.equal(snapshot.phases.input[0].id, 'test.input');
assert.equal(snapshot.phases.simulation[0].fixedUpdates, 2);
assert.equal(snapshot.phases.world[0].updates, 0);
assert.equal(snapshot.owners['input-test'].systems[0], 'test.input');
assert.equal(typeof snapshot.owners['simulation-test'].smoothedDurationMs, 'number');
assert.equal(typeof snapshot.phases.simulation[0].maxDurationMs, 'number');

const budgetStatus = diagnoseRuntimeBudgets({
  runtimeKernel: {
    lastFrameDurationMs: 41,
    phases: {
      simulation: [{ id: 'core.simulation', owner: 'world', phase: 'simulation', smoothedDurationMs: 17, maxDurationMs: 27 }],
      render: [{ id: 'core.renderer', owner: 'renderer', phase: 'render', smoothedDurationMs: 6, maxDurationMs: 10 }]
    },
    owners: {
      world: { systems: ['core.world'], smoothedDurationMs: 18, maxDurationMs: 28 },
      engine: { systems: ['core.simulation'], smoothedDurationMs: 7, maxDurationMs: 12 }
    }
  },
  renderer: { calls: 1200, triangles: 1200000, geometries: 400, textures: 40 },
  browserMemory: { usedBytes: 1200 * 1024 * 1024 },
  streamingResources: { pendingGeometryDisposals: 240 },
  lastLoad: { loadMs: 72000 },
  renderReadiness: { durationMs: 9500 }
});
assert.equal(budgetStatus.ok, false);
assert.equal(budgetStatus.topRuntimeOwner.owner, 'world');
assert.equal(budgetStatus.topRuntimeSystem.id, 'core.simulation');
assert.deepEqual(
  budgetStatus.violations.map((violation) => `${violation.metric}:${violation.owner}`),
  [
    'frameMs:world',
    'calls:world-rendering',
    'heapBytes:resource-lifecycle',
    'pendingGeometryDisposals:earth-streaming',
    'loadMs:world-loading',
    'renderReadyMs:renderer-readiness'
  ]
);

assert.equal(kernel.unregisterOwner('input-test'), 1);
assert.equal(kernel.snapshot().owners['input-test'], undefined);

const removed = kernel.unregisterSystem('test.disabled');
assert.equal(removed, true);
assert.equal(kernel.unregisterSystem('test.disabled'), false);
assert.equal(kernel.dispose('test-dispose'), true);
assert.equal(kernel.dispose('test-dispose'), false);

console.log(JSON.stringify({
  ok: true,
  phases: RUNTIME_PHASES,
  frameNumber: snapshot.frameNumber,
  systems: Object.values(snapshot.phases).flat().map((system) => system.id)
}, null, 2));
