import test from 'node:test';
import assert from 'node:assert/strict';
import { createUiRoomRenderers } from '../app/js/multiplayer/ui-room-renderers.js';

function harness() {
  const document = { activeElement: null };
  const attributes = {};
  const control = { blur() { document.activeElement = null; } };
  const drawer = {
    ownerDocument: document, inert: true,
    contains: element => element === control,
    classList: { toggle() {} },
    setAttribute(name, value) {
      if (name === 'aria-hidden' && value === 'true') assert.notEqual(document.activeElement, control, 'Release focus before hiding the drawer');
      attributes[name] = value;
    }
  };
  const state = { currentRoom: { ownerUid: 'one' }, authUser: { uid: 'one' }, entitlement: {} };
  const ui = createUiRoomRenderers({ appCtx: {}, refs: { chatDrawer: drawer }, state, helpers: {} });
  return { ui, drawer, document, control, attributes };
}

test('closing chat releases its focused control and reopening restores interaction', () => {
  const h = harness();
  h.ui.setChatOpen(true);
  assert.equal(h.drawer.inert, false);
  assert.equal(h.attributes['aria-hidden'], 'false');
  h.document.activeElement = h.control;
  h.ui.setChatOpen(false);
  assert.equal(h.document.activeElement, null);
  assert.equal(h.drawer.inert, true);
  assert.equal(h.attributes['aria-hidden'], 'true');
  h.ui.setChatOpen(true);
  assert.equal(h.drawer.inert, false);
  assert.equal(h.attributes['aria-hidden'], 'false');
});

test('closing an idle chat drawer does not steal focus from another interface', () => {
  const h = harness();
  const outside = { blur() { assert.fail('Unrelated focus must remain intact'); } };
  h.document.activeElement = outside;
  h.ui.setChatOpen(false);
  assert.equal(h.document.activeElement, outside);
});
