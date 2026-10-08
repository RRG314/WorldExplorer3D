import test from 'node:test';
import assert from 'node:assert/strict';
import { setupEngineInputHandlers } from '../app/js/engine/input-handlers.js';

test('Escape resumes a keyboard-focused pause dialog without enabling movement from form controls', () => {
  const keys = [];
  const handlers = new Map();
  const names = ['window', 'document', 'addEventListener', 'removeEventListener'];
  const originals = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  let paused = true;
  const backpackButton = { tagName: 'BUTTON' };
  const equipment = { equipmentOpen: false, equipmentUi: { root: { contains: target => target === backpackButton } } };
  let scope;
  try {
    globalThis.window = globalThis;
    globalThis.document = new EventTarget();
    globalThis.addEventListener = (name, handler) => handlers.set(name, handler);
    globalThis.removeEventListener = (name) => handlers.delete(name);
    scope = setupEngineInputHandlers({
      keys: {}, gameStarted: true,
      urbanSandboxRuntime: equipment,
      hasPauseReason: reason => reason === 'manual_pause' && paused,
      onKey: code => { keys.push(code); if (code === 'Escape') { if (equipment.equipmentOpen) equipment.equipmentOpen = false; else paused = !paused; } }
    });
    const key = (code, tagName = 'BUTTON') => handlers.get('keydown')({ code, target: { tagName }, preventDefault() {} });
    key('KeyW');
    assert.deepEqual(keys, []);
    key('Escape');
    assert.equal(paused, false, 'Escape must reach the pause handler from its focused Resume button');
    key('KeyW', 'INPUT');
    key('Escape', 'INPUT');
    assert.deepEqual(keys, ['Escape'], 'Unpaused form controls retain their keyboard ownership');
    equipment.equipmentOpen = true;
    key('Escape', 'INPUT');
    assert.equal(equipment.equipmentOpen, true, 'A control outside the Backpack keeps its input ownership');
    handlers.get('keydown')({ code: 'KeyV', target: backpackButton, preventDefault() {} });
    assert.deepEqual(keys, ['Escape'], 'A focused Backpack control cannot accidentally fire equipment');
    handlers.get('keydown')({ code: 'Escape', target: backpackButton, preventDefault() {} });
    assert.equal(equipment.equipmentOpen, false, 'Escape closes the Backpack after its Equip button receives focus');
    assert.equal(paused, false, 'Dismissing the Backpack must not toggle game pause');
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
