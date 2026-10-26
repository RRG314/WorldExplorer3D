import test from 'node:test';
import assert from 'node:assert/strict';
import { createUiRoomRenderers } from '../app/js/multiplayer/ui-room-renderers.js';
import { createScreenLayoutService } from '../app/js/ui/screen-layout.js';

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
  const layout=createScreenLayoutService(document),cleared=[];
  const modalAttributes={},classes=new Set();
  const modal={classList:{add:v=>classes.add(v),remove:v=>classes.delete(v)},setAttribute:(k,v)=>modalAttributes[k]=v};
  const ui = createUiRoomRenderers({ appCtx: {screenLayout:layout,clearControlInputState:reason=>cleared.push(reason)}, refs: { chatDrawer: drawer,roomPanelModal:modal }, state, helpers: {emitTutorialEvent(){}} });
  return { ui, drawer, document, control, attributes,layout,cleared,modalAttributes,classes };
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

test('room and chat opening use the existing panel owner and release held controls once',()=>{
  const h=harness();h.ui.openRoomPanel();
  assert.equal(h.layout.snapshot().panelLayer,'multiplayer');
  assert.equal(h.modalAttributes['aria-hidden'],'false');assert.equal(h.classes.has('show'),true);
  h.ui.setChatOpen(true);h.ui.closeRoomPanel();
  assert.equal(h.layout.snapshot().panelLayer,'room-chat','Closing the previous panel must not clear chat ownership');
  assert.equal(h.modalAttributes['aria-hidden'],'true');
  h.ui.setChatOpen(true);assert.deepEqual(h.cleared,['room-panel-open','room-chat-open']);
  h.ui.setChatOpen(false);assert.equal(h.layout.snapshot().panelLayer,'');
});

test('a late chat close cannot clear a newer Backpack panel',()=>{
  const h=harness();h.ui.setChatOpen(true);h.layout.setPanelLayer('backpack',true);h.ui.setChatOpen(false);
  assert.equal(h.layout.snapshot().panelLayer,'backpack');assert.equal(h.drawer.inert,true);
});
