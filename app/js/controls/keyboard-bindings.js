const STORAGE_KEY = 'worldExplorer3D.keyboardBindings.v1';

const ACTIONS = Object.freeze([
  Object.freeze({ id: 'move_forward', label: 'Move / accelerate', defaultCode: 'KeyW' }),
  Object.freeze({ id: 'move_backward', label: 'Back / brake', defaultCode: 'KeyS' }),
  Object.freeze({ id: 'move_left', label: 'Strafe / steer left', defaultCode: 'KeyA' }),
  Object.freeze({ id: 'move_right', label: 'Strafe / steer right', defaultCode: 'KeyD' }),
  Object.freeze({ id: 'interact', label: 'Context action', defaultCode: 'KeyE' }),
  Object.freeze({ id: 'primary_action', label: 'Jump / vehicle brake', defaultCode: 'Space' }),
  Object.freeze({ id: 'modifier_action', label: 'Run / descend', defaultCode: 'ShiftLeft' }),
  Object.freeze({ id: 'boost_action', label: 'Boost / wheel brake', defaultCode: 'ControlLeft' }),
  Object.freeze({ id: 'facility_action', label: 'Nearby mechanic', defaultCode: 'KeyF' }),
  Object.freeze({ id: 'camera', label: 'Change camera', defaultCode: 'KeyC' }),
  Object.freeze({ id: 'look_back', label: 'Look behind vehicle', defaultCode: 'KeyQ' }),
  Object.freeze({ id: 'inventory', label: 'Backpack', defaultCode: 'KeyI' }),
  Object.freeze({ id: 'journal', label: 'Explorer / Journal', defaultCode: 'KeyJ' }),
  Object.freeze({ id: 'map', label: 'Map', defaultCode: 'KeyM' }),
  Object.freeze({ id: 'use_item', label: 'Use equipped item', defaultCode: 'KeyV' }),
  Object.freeze({ id: 'take_item', label: 'Take nearby item', defaultCode: 'KeyT' }),
  Object.freeze({ id: 'build', label: 'Build mode', defaultCode: 'KeyB' }),
  Object.freeze({ id: 'plane', label: 'Personal plane', defaultCode: 'KeyP' }),
  Object.freeze({ id: 'boat', label: 'Boat travel', defaultCode: 'KeyG' }),
  Object.freeze({ id: 'track', label: 'Record track', defaultCode: 'KeyR' })
]);

const ACTION_BY_ID = new Map(ACTIONS.map((action) => [action.id, action]));
const RESERVED_CODES = new Set(['Escape', 'Backquote', 'F4', 'F8', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6']);

function defaultKeyboardBindings() {
  return Object.fromEntries(ACTIONS.map((action) => [action.id, action.defaultCode]));
}

function normalizeKeyboardBindings(input = {}) {
  const bindings = defaultKeyboardBindings();
  for (const action of ACTIONS) {
    const requested = String(input?.[action.id] || '');
    if (!requested || RESERVED_CODES.has(requested) || requested === bindings[action.id]) continue;
    const previous = bindings[action.id];
    const conflict = ACTIONS.find((candidate) => candidate.id !== action.id && bindings[candidate.id] === requested);
    bindings[action.id] = requested;
    if (conflict) bindings[conflict.id] = previous;
  }
  return bindings;
}

function loadKeyboardBindings(storage = globalThis.localStorage) {
  try {
    return normalizeKeyboardBindings(JSON.parse(storage?.getItem(STORAGE_KEY) || '{}'));
  } catch {
    return defaultKeyboardBindings();
  }
}

let bindings = loadKeyboardBindings();

function saveBindings() {
  try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(bindings)); } catch { /* optional */ }
}

function keyboardBindingCode(actionId) {
  return bindings[String(actionId || '')] || ACTION_BY_ID.get(String(actionId || ''))?.defaultCode || '';
}

function keyMatchesKeyboardAction(code, actionId) {
  return String(code || '') === keyboardBindingCode(actionId);
}

function keyboardActionPressed(keys, actionId, alternateCodes = []) {
  if (keys?.[keyboardBindingCode(actionId)] === true) return true;
  return alternateCodes.some((code) => keys?.[code] === true);
}

function keyboardCodeLabel(code = '') {
  const value = String(code || '');
  const named = {
    Space: 'Space', ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift',
    ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→'
  };
  if (named[value]) return named[value];
  if (value.startsWith('Key')) return value.slice(3);
  if (value.startsWith('Digit')) return value.slice(5);
  return value.replace(/Left$/, '').replace(/Right$/, '') || '—';
}

function keyboardBindingLabel(actionId) {
  return keyboardCodeLabel(keyboardBindingCode(actionId));
}

function setKeyboardBinding(actionId, code) {
  const id = String(actionId || '');
  const nextCode = String(code || '');
  if (!ACTION_BY_ID.has(id)) return Object.freeze({ ok: false, reason: 'unknown_action' });
  if (!nextCode || RESERVED_CODES.has(nextCode)) return Object.freeze({ ok: false, reason: 'reserved_key' });
  const previousCode = keyboardBindingCode(id);
  const conflict = ACTIONS.find((action) => action.id !== id && keyboardBindingCode(action.id) === nextCode);
  bindings = { ...bindings, [id]: nextCode };
  if (conflict) bindings[conflict.id] = previousCode;
  saveBindings();
  globalThis.dispatchEvent?.(new CustomEvent('we3d:keyboard-bindings-changed', {
    detail: { actionId: id, code: nextCode, swappedActionId: conflict?.id || '' }
  }));
  return Object.freeze({ ok: true, actionId: id, code: nextCode, swappedActionId: conflict?.id || '' });
}

function resetKeyboardBindings() {
  bindings = defaultKeyboardBindings();
  saveBindings();
  globalThis.dispatchEvent?.(new CustomEvent('we3d:keyboard-bindings-changed', { detail: { reset: true } }));
  return { ...bindings };
}

function keyboardBindingsSnapshot() {
  return Object.freeze({
    storageKey: STORAGE_KEY,
    bindings: Object.freeze({ ...bindings }),
    actions: ACTIONS
  });
}

export {
  ACTIONS as KEYBOARD_BINDING_ACTIONS,
  RESERVED_CODES,
  defaultKeyboardBindings,
  keyMatchesKeyboardAction,
  keyboardActionPressed,
  keyboardBindingCode,
  keyboardBindingLabel,
  keyboardBindingsSnapshot,
  keyboardCodeLabel,
  loadKeyboardBindings,
  normalizeKeyboardBindings,
  resetKeyboardBindings,
  setKeyboardBinding
};
