import {
  KEYBOARD_BINDING_ACTIONS,
  RESERVED_CODES,
  keyboardBindingLabel,
  resetKeyboardBindings,
  setKeyboardBinding
} from './keyboard-bindings.js?v=3';

let initialized = false;
let captureActionId = '';

function initKeyboardBindingUi() {
  if (initialized || typeof document === 'undefined') return false;
  const controlsGrid = document.querySelector('#tab-controls .ctrl-grid');
  if (!controlsGrid) return false;
  initialized = true;

  const panel = document.createElement('section');
  panel.id = 'keyboardBindingSettings';
  panel.className = 'keyboard-binding-settings';
  panel.innerHTML = `
    <details>
      <summary><span><b>Keyboard bindings</b><small>Change saved gameplay keys</small></span><i aria-hidden="true">›</i></summary>
      <p>Choose Change, then press a key. If that key is already assigned, the two actions swap. Escape cancels. Arrow keys stay available as movement alternates.</p>
      <div class="keyboard-binding-list"></div>
      <footer><button type="button" data-binding-reset>Reset keyboard defaults</button><span role="status" aria-live="polite" aria-atomic="true"></span></footer>
    </details>`;
  controlsGrid.prepend(panel);

  const list = panel.querySelector('.keyboard-binding-list');
  const status = panel.querySelector('[role="status"]');

  function render() {
    list.innerHTML = KEYBOARD_BINDING_ACTIONS.map((action) => `
      <div class="keyboard-binding-row">
        <span>${action.label}</span>
        <kbd>${keyboardBindingLabel(action.id)}</kbd>
        <button type="button" data-binding-action="${action.id}">Change</button>
      </div>`).join('');
  }

  panel.addEventListener('click', (event) => {
    const reset = event.target.closest?.('[data-binding-reset]');
    if (reset) {
      captureActionId = '';
      resetKeyboardBindings();
      render();
      status.textContent = 'Keyboard controls reset.';
      return;
    }
    const button = event.target.closest?.('[data-binding-action]');
    if (!button) return;
    captureActionId = String(button.dataset.bindingAction || '');
    panel.querySelectorAll('[data-binding-action]').forEach((entry) => {
      entry.classList.toggle('listening', entry === button);
      entry.textContent = entry === button ? 'Press a key…' : 'Change';
    });
    status.textContent = `Choose a new key for ${KEYBOARD_BINDING_ACTIONS.find((action) => action.id === captureActionId)?.label || 'this action'}.`;
  });

  document.addEventListener('keydown', (event) => {
    if (!captureActionId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.code === 'Escape') {
      captureActionId = '';
      render();
      status.textContent = 'Key change cancelled.';
      return;
    }
    if (RESERVED_CODES.has(event.code)) {
      status.textContent = 'That key is reserved for pause, diagnostics, or quick slots. Choose another.';
      return;
    }
    const result = setKeyboardBinding(captureActionId, event.code);
    const action = KEYBOARD_BINDING_ACTIONS.find((entry) => entry.id === captureActionId);
    captureActionId = '';
    render();
    status.textContent = result.ok
      ? `${action?.label || 'Action'} now uses ${keyboardBindingLabel(result.actionId)}${result.swappedActionId ? '; the previous assignment was swapped.' : '.'}`
      : 'That key could not be assigned.';
  }, true);

  globalThis.addEventListener?.('we3d:keyboard-bindings-changed', render);
  render();
  return true;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initKeyboardBindingUi, { once: true });
  else initKeyboardBindingUi();
}

export { initKeyboardBindingUi };
