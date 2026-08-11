import assert from 'node:assert/strict';
import { RUNTIME_PHASES, createRuntimeKernel } from '../app/js/runtime/kernel.js';
import { createCoreFrameSystems } from '../app/js/runtime/core-frame-systems.js';

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

assert.equal(kernel.unregisterOwner('input-test'), 1);
assert.equal(kernel.snapshot().owners['input-test'], undefined);

const removed = kernel.unregisterSystem('test.disabled');
assert.equal(removed, true);
assert.equal(kernel.unregisterSystem('test.disabled'), false);
assert.equal(kernel.dispose('test-dispose'), true);
assert.equal(kernel.dispose('test-dispose'), false);

const advancedDeltas = [];
const advanceKernel = createRuntimeKernel({
  fixedDelta: 0.01,
  maxDelta: 0.05,
  now: () => 1000
});
advanceKernel.registerSystem({
  id: 'test.manual-advance',
  phase: 'simulation',
  update: (frame) => advancedDeltas.push(frame.dt)
});
const advanceResult = advanceKernel.advanceBy(50);
assert.equal(advanceResult.requestedMs, 50);
assert.equal(advanceResult.simulatedMs, 50);
assert.equal(advanceResult.frames, 5);
assert.equal(advanceResult.suspendedFrames, 0);
assert.equal(advanceKernel.snapshot().frameNumber, 5);
assert.equal(Number(advancedDeltas.reduce((sum, value) => sum + value, 0).toFixed(6)), 0.05);

const fixedCalls = [];
const fixedAppCtx = {
  gameStarted: true,
  updateControlInput: () => fixedCalls.push('input'),
  update: (dt) => fixedCalls.push(`simulation:${dt}`)
};
const fixedKernel = createRuntimeKernel({
  fixedDelta: 0.01,
  maxDelta: 0.1,
  maxFixedSteps: 2
});
createCoreFrameSystems(fixedAppCtx)
  .filter((system) => system.id === 'core.input' || system.id === 'core.simulation')
  .forEach((system) => fixedKernel.registerSystem(system));
fixedKernel.runFrame(0);
fixedKernel.runFrame(100);
assert.deepEqual(fixedCalls, [
  'input',
  'simulation:0',
  'input',
  'simulation:0.1'
]);
const fixedSnapshot = fixedKernel.snapshot();
assert.equal(fixedSnapshot.phases.input[0].updates, 2);
assert.equal(fixedSnapshot.phases.input[0].fixedUpdates, 0);
assert.equal(fixedSnapshot.phases.simulation[0].updates, 2);
assert.equal(fixedSnapshot.phases.simulation[0].fixedUpdates, 0);

console.log(JSON.stringify({
  ok: true,
  phases: RUNTIME_PHASES,
  frameNumber: snapshot.frameNumber,
  systems: Object.values(snapshot.phases).flat().map((system) => system.id),
  directFrameSimulationUpdates: fixedSnapshot.phases.simulation[0].updates,
  manualAdvance: advanceResult
}, null, 2));
