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

test('navigation replacement retains one animation and disposes replaced GPU resources', async () => {
  const THREE = await import('three');
  const { ctx } = await import('../app/js/shared-context.js?v=55');
  const { createNavigationRoute, clearNavigation } = await import('../app/js/game/navigation-ui.js');
  const previous = { THREE: globalThis.THREE, document: globalThis.document, requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame };
  const pending = new Map(); let next = 0, disposed = 0;
  Object.assign(globalThis, { THREE, document: { getElementById: () => ({ style: {} }) },
    requestAnimationFrame: fn => { pending.set(++next, fn); return next; },
    cancelAnimationFrame: id => pending.delete(id) });
  Object.assign(ctx, { scene: new THREE.Scene(), car: { x: 0, z: 0 }, showNavigation: true });
  const track = () => {
    for (const root of [ctx.navigationRoute, ctx.navigationMarker]) root.traverse(object => {
      object.geometry?.addEventListener('dispose', () => disposed++);
      object.material?.addEventListener('dispose', () => disposed++);
    });
  };
  try {
    createNavigationRoute(0, 0, 30, 30); track();
    const oldCallback = [...pending.values()][0];
    createNavigationRoute(0, 0, 60, 60); track();
    assert.equal(disposed, 6, 'three old meshes must release geometry and material');
    assert.equal(pending.size, 1, 'route rebuild duplicated its animation');
    oldCallback(); // a queued old callback cannot attach itself to the replacement
    assert.equal(pending.size, 1);
    clearNavigation();
    assert.equal(disposed, 12); assert.equal(pending.size, 0);
    assert.equal(ctx.scene.children.length, 0);
    clearNavigation(); assert.equal(disposed, 12, 'cleanup must be idempotent');
  } finally {
    clearNavigation(); Object.assign(globalThis, previous);
    for (const key of Object.keys(ctx)) delete ctx[key];
  }
});
