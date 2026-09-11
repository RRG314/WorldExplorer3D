import assert from 'node:assert/strict';
import test from 'node:test';

import { disposeThreeRenderer } from '../app/js/engine/webgl-lifecycle.js';

test('auxiliary renderer disposal releases its loop, lists, and drawing buffer', () => {
  const calls = [];
  const canvas = { width: 1440, height: 900 };
  const renderer = {
    domElement: canvas,
    setAnimationLoop(value) {
      calls.push(['setAnimationLoop', value]);
    },
    renderLists: {
      dispose() {
        calls.push(['renderLists.dispose']);
      }
    },
    dispose() {
      calls.push(['dispose']);
    }
  };

  assert.equal(disposeThreeRenderer(renderer), null);
  assert.deepEqual(calls, [
    ['setAnimationLoop', null],
    ['renderLists.dispose'],
    ['dispose']
  ]);
  assert.equal(canvas.width, 1);
  assert.equal(canvas.height, 1);
});

test('renderer disposal remains safe when optional WebGL cleanup hooks are unavailable', () => {
  const canvas = { width: 390, height: 844 };
  assert.equal(disposeThreeRenderer({ domElement: canvas }), null);
  assert.deepEqual(canvas, { width: 1, height: 1 });
});
