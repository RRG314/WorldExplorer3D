import {
  KEYBOARD_BINDING_ACTIONS,
  RESERVED_CODES,
  keyboardBindingLabel,
  resetKeyboardBindings,
  setKeyboardBinding
} from './keyboard-bindings.js?v=3';
import {createLifecycleScope} from '../runtime/lifecycle-scope.js?v=2';

let initialized = false;

function initKeyboardBindingUi() {
  if (initialized || typeof document === 'undefined') return false;
  const controlsGrid = document.querySelector('#tab-controls .ctrl-grid');
  if (!controlsGrid) return false;
  initialized = true;
  const scope = createLifecycleScope('keyboard-binding-ui');
  let captureActionId = '';
  const panel = document.createElement('section');
  panel.id = 'keyboardBindingSettings';
  panel.className = 'keyboard-binding-settings';
  panel.innerHTML = `
    <details>
      <summary><span><b>Keyboard bindings</b><small>Change saved gameplay keys</small></span></summary>
      <p>Choose Change, then press a key. Assigned keys swap between actions. Escape cancels. Arrow keys remain available as movement alternates. Fishing uses separate fixed controls in the boat guide.</p>
      <div class="keyboard-binding-list"></div>
      <footer><button class="wx-button" type="button" data-binding-reset>Reset keyboard defaults</button><span id="keyboardBindingStatus" role="status" aria-live="polite" aria-atomic="true"></span></footer>
    </details>`;
  controlsGrid.prepend(panel);
  const details = panel.querySelector('details');
  const list = panel.querySelector('.keyboard-binding-list');
  const status = panel.querySelector('[role="status"]');
  const rows = new Map();
  const fragment = document.createDocumentFragment();
  for (const action of KEYBOARD_BINDING_ACTIONS) {
    const row = document.createElement('div');
    row.className = 'keyboard-binding-row';
    const name = document.createElement('span');
    name.textContent = action.label;
    const key = document.createElement('kbd');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'wx-button';
    button.dataset.bindingAction = action.id;
    button.setAttribute('aria-describedby', 'keyboardBindingStatus');
    row.append(name, key, button);
    fragment.append(row);
    rows.set(action.id, {action, key, button});
  }
  list.append(fragment);

  const text = (element, value) => { if (element.textContent !== value) element.textContent = value; };
  function render() {
    for (const [id, {action, key, button}] of rows) {
      const listening = id === captureActionId;
      text(key, keyboardBindingLabel(id));
      text(button, listening ? 'Press a key…' : 'Change');
      if (button.classList.contains('listening') !== listening) button.classList.toggle('listening', listening);
      const label = `${listening ? 'Press a key for' : 'Change'} ${action.label}`;
      if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
    }
    // Both help surfaces read the same saved bindings as the action reader.
    // Fishing's dedicated fixed-key profile is deliberately not annotated.
    document.querySelectorAll('[data-keyboard-actions]').forEach(element => {
      const actions = element.dataset.keyboardActions.split(/\s+/).filter(Boolean);
      if (!actions.length || actions.some(id => !rows.has(id))) return;
      text(element, (element.dataset.keyboardPrefix || '') + actions.map(keyboardBindingLabel).join(' / ') + (element.dataset.keyboardSuffix || ''));
    });
  }
  function cancelCapture(message = 'Key change cancelled.') {
    if (!captureActionId) return;
    captureActionId = '';
    render();
    status.textContent = message;
  }
  function ownsCapture() {
    const button = rows.get(captureActionId)?.button;
    const tab = panel.closest('.tab-content');
    const modal = panel.closest('[role="dialog"]');
    return button === document.activeElement && details.open &&
      (!tab || tab.classList.contains('active')) && !modal?.hidden &&
      modal?.getAttribute('aria-hidden') !== 'true' &&
      panel.getClientRects().length > 0 && getComputedStyle(panel).visibility !== 'hidden';
  }
  scope.listen(panel, 'click', event => {
    if (event.target.closest?.('[data-binding-reset]')) {
      captureActionId = '';
      resetKeyboardBindings();
      render();
      status.textContent = 'Keyboard controls reset.';
      return;
    }
    const button = event.target.closest?.('[data-binding-action]');
    if (!button) return;
    captureActionId = button.dataset.bindingAction;
    button.focus({preventScroll:true});
    render();
    status.textContent = `Choose a new key for ${rows.get(captureActionId).action.label}.`;
  });
  scope.listen(document, 'keydown', event => {
    if (!captureActionId) return;
    if (!ownsCapture()) { cancelCapture(); return; }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.code === 'Escape') { cancelCapture(); return; }
    if (RESERVED_CODES.has(event.code)) {
      status.textContent = 'That key is reserved for pause, diagnostics, or quick slots. Choose another.';
      return;
    }
    const actionId = captureActionId;
    captureActionId = '';
    const result = setKeyboardBinding(actionId, event.code);
    render();
    status.textContent = result.ok
      ? `${rows.get(actionId).action.label} now uses ${keyboardBindingLabel(actionId)}${result.swappedActionId ? '; the previous assignment was swapped.' : '.'}`
      : 'That key could not be assigned.';
  }, true);
  scope.listen(panel, 'focusout', event => {
    if (captureActionId && event.target === rows.get(captureActionId)?.button) cancelCapture();
  });
  scope.listen(document, 'pointerdown', event => {
    if (captureActionId && !rows.get(captureActionId)?.button.contains(event.target)) cancelCapture();
  }, true);
  scope.listen(details, 'toggle', () => { if (!details.open) cancelCapture(); });
  scope.listen(globalThis, 'blur', () => cancelCapture());
  scope.listen(globalThis, 'we3d:keyboard-bindings-changed', render);
  scope.listen(globalThis, 'pagehide', event => {
    cancelCapture();
    if (!event.persisted) scope.dispose('page closed');
  });
  render();
  return true;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initKeyboardBindingUi, {once:true});
  else initKeyboardBindingUi();
}

export {initKeyboardBindingUi};
