import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { sampleFrameWindow } from '../scripts/verification/frame-window.mjs';

async function sample(timestamps, durationMs) {
  const queue = [...timestamps];
  const context = vm.createContext({
    performance: { now: () => 100 },
    requestAnimationFrame(callback) {
      assert.ok(queue.length, 'Sampler requested a frame beyond the supplied complete window');
      queueMicrotask(() => callback(queue.shift()));
    },
    getWorldExplorerRuntimeDiagnostics: () => ({ activeActor: { position: { x: 1, z: 2 } } })
  });
  // Playwright serializes this exact function into the page too.
  return vm.runInContext(`(${sampleFrameWindow.toString()})(${durationMs})`, context);
}

test('stale first RAF cannot add pre-window time or shorten the measurement', async () => {
  const result = await sample([10, 90, 110, 130, 150, 170], 60);
  assert.deepEqual(Array.from(result.deltas), [20, 20, 20]);
  assert.equal(result.elapsedMs, 60);
  assert.equal(result.deltas.reduce((sum, delta) => sum + delta, 0), result.elapsedMs);
});

test('duplicate and backward timestamps cannot move the interval baseline', async () => {
  const result = await sample([100, 120, 120, 115, 140, 160], 60);
  assert.deepEqual(Array.from(result.deltas), [20, 20, 20]);
  assert.equal(result.elapsedMs, 60);
});

test('slow frames inside the full measurement window remain counted', async () => {
  const result = await sample([110, 130, 500, 520], 400);
  assert.deepEqual(Array.from(result.deltas), [20, 370, 20]);
  assert.equal(result.elapsedMs, 410);
});
