import assert from 'node:assert/strict';
import { createLifecycleScope } from '../app/js/runtime/lifecycle-scope.js';

const originalRequestFrame = globalThis.requestAnimationFrame;
const originalCancelFrame = globalThis.cancelAnimationFrame;
const pendingFrames = new Map();
const cancelledFrames = [];
let nextFrameId = 0;

globalThis.requestAnimationFrame = (callback) => {
  const id = ++nextFrameId;
  pendingFrames.set(id, callback);
  return id;
};
globalThis.cancelAnimationFrame = (id) => {
  cancelledFrames.push(id);
  pendingFrames.delete(id);
};

try {
  const scope = createLifecycleScope('test-scope');
  let frameCalls = 0;
  scope.animationFrame(() => {
    frameCalls += 1;
  });

  assert.deepEqual(scope.snapshot(), {
    owner: 'test-scope',
    active: true,
    disposedReason: '',
    resourceCount: 1,
    resources: { 'animation-frame': 1 }
  });
  assert.equal(scope.dispose('test-complete'), true);
  assert.deepEqual(cancelledFrames, [1]);
  assert.equal(frameCalls, 0);
  assert.equal(scope.dispose('already-disposed'), false);
  assert.equal(scope.animationFrame(() => {
    frameCalls += 1;
  }), 2);
  assert.deepEqual(cancelledFrames, [1, 2]);
  assert.equal(frameCalls, 0);

  const completedScope = createLifecycleScope('completed-frame');
  completedScope.animationFrame(() => {
    frameCalls += 1;
  });
  const completedCallback = pendingFrames.get(3);
  pendingFrames.delete(3);
  completedCallback(100);
  assert.equal(frameCalls, 1);
  assert.equal(completedScope.snapshot().resourceCount, 0);
} finally {
  if (originalRequestFrame) globalThis.requestAnimationFrame = originalRequestFrame;
  else delete globalThis.requestAnimationFrame;
  if (originalCancelFrame) globalThis.cancelAnimationFrame = originalCancelFrame;
  else delete globalThis.cancelAnimationFrame;
}

console.log(JSON.stringify({ ok: true, cancelledFrames }, null, 2));
