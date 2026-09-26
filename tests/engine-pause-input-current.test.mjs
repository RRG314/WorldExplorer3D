import test from 'node:test';
import assert from 'node:assert/strict';
import { setupEngineInputHandlers } from '../app/js/engine/input-handlers.js';

test('Escape resumes a keyboard-focused pause dialog without enabling movement from form controls', () => {
  const keys = [];
  const handlers = new Map();
  const names = ['window', 'document', 'addEventListener', 'removeEventListener'];
  const originals = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  let paused = true;
  let scope;
  try {
    globalThis.window = globalThis;
    globalThis.document = new EventTarget();
    globalThis.addEventListener = (name, handler) => handlers.set(name, handler);
    globalThis.removeEventListener = (name) => handlers.delete(name);
    scope = setupEngineInputHandlers({
      keys: {}, gameStarted: true,
      hasPauseReason: reason => reason === 'manual_pause' && paused,
      onKey: code => { keys.push(code); if (code === 'Escape') paused = !paused; }
    });
    const key = (code, tagName = 'BUTTON') => handlers.get('keydown')({ code, target: { tagName }, preventDefault() {} });
    key('KeyW');
    assert.deepEqual(keys, []);
    key('Escape');
    assert.equal(paused, false, 'Escape must reach the pause handler from its focused Resume button');
    key('KeyW', 'INPUT');
    key('Escape', 'INPUT');
    assert.deepEqual(keys, ['Escape'], 'Unpaused form controls retain their keyboard ownership');
    key('Escape', 'BODY');
    assert.equal(paused, true);
  } finally {
    scope?.dispose();
    names.forEach((name, index) => {
      if (originals[index]) Object.defineProperty(globalThis, name, originals[index]);
      else delete globalThis[name];
    });
  }
});
