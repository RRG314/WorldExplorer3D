import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { collectBrowserGraphicsErrors } from '../scripts/verification/browser-graphics-errors.mjs';

test('graphics acceptance catches shader and driver failures even without a page exception', () => {
  const page = new EventEmitter();
  const errors = [];
  const stop = collectBrowserGraphicsErrors(page, errors);
  const emit = (type, text) => page.emit('console', { type: () => type, text: () => text });
  emit('error', 'THREE.WebGLProgram: shader error: 0 35715 false gl.getProgramInfoLog');
  emit('warning', '[.WebGL-0x124000d4a00] GL_INVALID_OPERATION: Error: 0x00000502, CreateRenderPipelineState:123. Internal error.');
  emit('warning', 'WebGL: CONTEXT_LOST_WEBGL: loseContext: context lost');
  assert.equal(errors.length, 3);
  emit('warning', '[WorldLoad] Overpass provider unavailable; using mapped transport fallback');
  emit('error', 'FirebaseError: AppCheck: ReCAPTCHA error.');
  emit('warning', 'Canvas2D: Multiple readback operations using getImageData');
  assert.equal(errors.length, 3, 'Provider failures stay separate from graphics acceptance');
  stop();
  emit('error', 'THREE.WebGLRenderer: Context Lost.');
  assert.equal(errors.length, 3, 'Listener can be removed on teardown');
});

test('repeated driver failures cannot flood the verification report', () => {
  const page = new EventEmitter();
  const errors = [];
  collectBrowserGraphicsErrors(page, errors);
  for (let i = 0; i < 100; i++) page.emit('console', {
    type: () => 'error', text: () => `THREE.WebGLProgram: shader error: ${'x'.repeat(10_000)}`
  });
  assert.equal(errors.length, 20);
  assert.ok(errors.every(error => error.length <= 2010));
});
