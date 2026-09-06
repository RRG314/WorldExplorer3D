import { ctx as appCtx } from '../shared-context.js?v=55';
import {
  loadMobileTouchSettings,
  resolveMobileSemanticActions,
  saveMobileTouchSettings
} from './mobile-touch-authority.js?v=5';
import {
  keyMatchesKeyboardAction,
  keyboardActionPressed,
  keyboardBindingCode,
  keyboardBindingLabel,
  keyboardBindingsSnapshot,
  resetKeyboardBindings,
  setKeyboardBinding
} from './keyboard-bindings.js?v=2';

const DEAD_ZONE = 0.16;
const inputState = {
  gamepad: null,
  previousButtons: [],
  updatedAt: 0,
  lastPlaneTurnTapAt: { ArrowLeft: -Infinity, ArrowRight: -Infinity },
  pendingPlaneBarrelRoll: 0
};
const mobileTouchState = {
  enabled: false,
  move: { x: 0, y: 0, active: false },
  look: { x: 0, y: 0, active: false },
  lastMoveInputAt: 0,
  lastLookInputAt: 0,
  settings: loadMobileTouchSettings()
};
const PLANE_DOUBLE_TAP_WINDOW_MS = 340;
const HELD_CONTROL_CODES = Object.freeze([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyH', 'KeyQ', 'KeyR', 'KeyX', 'KeyZ'
]);

function clamp(value, min = -1, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function axis(value) {
  const numeric = clamp(value);
  const magnitude = Math.abs(numeric);
  if (magnitude <= DEAD_ZONE) return 0;
  return Math.sign(numeric) * (magnitude - DEAD_ZONE) / (1 - DEAD_ZONE);
}

function pressed(keys, ...codes) {
  return codes.some((code) => keys?.[code] === true);
}

function digital(positive, negative) {
  return (positive ? 1 : 0) - (negative ? 1 : 0);
}

function normalizeMode(mode) {
  if (mode === 'driving') return 'drive';
  if (mode === 'walking') return 'walk';
  if (mode === 'submarine') return 'ocean';
  return String(mode || 'drive');
}

function connectedGamepad() {
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads?.();
  if (!pads) return null;
  return Array.from(pads).find((pad) => pad?.connected) || null;
}

function buttonValue(gamepad, index) {
  const button = gamepad?.buttons?.[index];
  if (!button) return 0;
  return clamp(button.value ?? (button.pressed ? 1 : 0), 0, 1);
}

function keyboardControlActions(keys = {}, mode = 'drive') {
  const planeControls = mode === 'plane';
  const walking = mode === 'walk';
  // The shared layer is action-based: WASD is the conventional primary
  // binding and arrows remain a complete alternate. On foot, A/D strafe while
  // the arrows retain keyboard-only turning; vehicles use A/D to steer.
  const move = digital(
    keyboardActionPressed(keys, 'move_forward', ['ArrowUp']),
    keyboardActionPressed(keys, 'move_backward', ['ArrowDown'])
  );
  const turn = walking
    ? digital(pressed(keys, 'ArrowLeft'), pressed(keys, 'ArrowRight'))
    : digital(
      keyboardActionPressed(keys, 'move_left', ['ArrowLeft']),
      keyboardActionPressed(keys, 'move_right', ['ArrowRight'])
    );
  const strafe = walking
    ? digital(keyboardActionPressed(keys, 'move_right'), keyboardActionPressed(keys, 'move_left'))
    : 0;
  const lookYaw = 0;
  const lookPitch = 0;
  const ascend = keyboardActionPressed(keys, 'primary_action');
  const descend = keyboardActionPressed(keys, 'modifier_action', ['ShiftRight', 'ControlLeft', 'ControlRight']);
  const boostAction = keyboardActionPressed(keys, 'boost_action', ['ControlRight']);
  const planeRollModifier = planeControls && boostAction;
  return {
    mode,
    move,
    turn,
    steer: turn,
    strafe,
    lookYaw,
    lookPitch,
    throttle: Math.max(0, move),
    reverse: Math.max(0, -move),
    brake: (planeControls
      ? boostAction
      : keyboardActionPressed(keys, 'primary_action')) ? 1 : 0,
    boost: boostAction ? 1 : 0,
    jump: keyboardActionPressed(keys, 'primary_action') ? 1 : 0,
    sprint: keyboardActionPressed(keys, 'modifier_action', ['ShiftRight']) ? 1 : 0,
    vertical: digital(ascend, descend),
    pitch: mode === 'plane' ? -move : lookPitch,
    roll: turn,
    aerobaticRoll: planeRollModifier ? turn : 0,
    throttleAdjust: planeControls
      ? digital(
        keyboardActionPressed(keys, 'primary_action'),
        keyboardActionPressed(keys, 'modifier_action', ['ShiftRight'])
      )
      : 0
  };
}

function keyboardActions(mode) {
  return keyboardControlActions(appCtx.keys || {}, mode);
}

function registerPlaneTurnTap(code, now = typeof performance !== 'undefined' ? performance.now() : Date.now()) {
  if (code !== 'ArrowLeft' && code !== 'ArrowRight') return 0;
  const timestamp = Number(now);
  if (!Number.isFinite(timestamp)) return 0;
  const previous = Number(inputState.lastPlaneTurnTapAt[code]);
  inputState.lastPlaneTurnTapAt[code] = timestamp;
  const elapsed = timestamp - previous;
  if (!(elapsed >= 35 && elapsed <= PLANE_DOUBLE_TAP_WINDOW_MS)) return 0;
  const direction = code === 'ArrowLeft' ? 1 : -1;
  inputState.pendingPlaneBarrelRoll = direction;
  inputState.lastPlaneTurnTapAt[code] = -Infinity;
  return direction;
}

function consumePlaneBarrelRollTrigger() {
  const direction = Number(inputState.pendingPlaneBarrelRoll) || 0;
  inputState.pendingPlaneBarrelRoll = 0;
  return direction;
}

function mergeGamepad(actions, gamepad) {
  if (!gamepad) return actions;
  const leftX = -axis(gamepad.axes?.[0]);
  const leftY = -axis(gamepad.axes?.[1]);
  const rightX = -axis(gamepad.axes?.[2]);
  const rightY = -axis(gamepad.axes?.[3]);
  const leftTrigger = buttonValue(gamepad, 6);
  const rightTrigger = buttonValue(gamepad, 7);
  const south = buttonValue(gamepad, 0);
  const north = buttonValue(gamepad, 3);
  const leftShoulder = buttonValue(gamepad, 4);
  const rightShoulder = buttonValue(gamepad, 5);

  actions.move = Math.abs(leftY) > Math.abs(actions.move) ? leftY : actions.move;
  actions.turn = Math.abs(leftX) > Math.abs(actions.turn) ? leftX : actions.turn;
  actions.steer = actions.turn;
  actions.lookYaw = Math.abs(rightX) > Math.abs(actions.lookYaw) ? rightX : actions.lookYaw;
  actions.lookPitch = Math.abs(rightY) > Math.abs(actions.lookPitch) ? rightY : actions.lookPitch;
  actions.brake = Math.max(actions.brake, leftTrigger);
  actions.jump = Math.max(actions.jump, south);
  actions.sprint = Math.max(actions.sprint, rightShoulder);
  actions.boost = Math.max(actions.boost, north, rightShoulder);

  if (actions.mode === 'plane') {
    actions.pitch = -leftY;
    actions.roll = leftX;
    actions.aerobaticRoll = north > 0.55 ? leftX : actions.aerobaticRoll;
    actions.throttleAdjust = clamp(actions.throttleAdjust + rightTrigger - leftTrigger);
  } else if (actions.mode === 'drone') {
    actions.vertical = clamp(actions.vertical + rightShoulder - leftShoulder);
  } else if (actions.mode === 'ocean') {
    actions.vertical = clamp(actions.vertical + rightShoulder - leftShoulder);
  } else {
    actions.throttle = Math.max(actions.throttle, rightTrigger, Math.max(0, leftY));
    actions.reverse = Math.max(actions.reverse, Math.max(0, -leftY));
  }
  return actions;
}

function mergeMobileTouch(actions) {
  if (!mobileTouchState.enabled) return actions;
  const mobile = resolveMobileSemanticActions(actions.mode, mobileTouchState);
  actions.move = Math.abs(mobile.move) > Math.abs(actions.move) ? mobile.move : actions.move;
  actions.turn = Math.abs(mobile.turn) > Math.abs(actions.turn) ? mobile.turn : actions.turn;
  actions.steer = actions.turn;
  actions.strafe = Math.abs(mobile.strafe) > Math.abs(actions.strafe) ? mobile.strafe : actions.strafe;
  actions.lookYaw = Math.abs(mobile.lookYaw) > Math.abs(actions.lookYaw) ? mobile.lookYaw : actions.lookYaw;
  actions.lookPitch = Math.abs(mobile.lookPitch) > Math.abs(actions.lookPitch) ? mobile.lookPitch : actions.lookPitch;
  actions.mobileTouch = true;
  actions.mobileMoveActive = mobile.moveActive;
  actions.mobileLookActive = mobile.lookActive;
  actions.mobileLastMoveInputAt = mobileTouchState.lastMoveInputAt;
  actions.mobileLastLookInputAt = mobileTouchState.lastLookInputAt;
  actions.mobileSettings = mobile.settings;
  if (actions.mode === 'plane') {
    actions.pitch = -actions.move;
    actions.roll = actions.turn;
  } else {
    actions.throttle = Math.max(actions.throttle, Math.max(0, actions.move));
    actions.reverse = Math.max(actions.reverse, Math.max(0, -actions.move));
  }
  return actions;
}

function readControlActions(mode = 'drive') {
  const normalizedMode = normalizeMode(mode);
  return mergeMobileTouch(mergeGamepad(keyboardActions(normalizedMode), inputState.gamepad || connectedGamepad()));
}

function setMobileTouchEnabled(enabled) {
  mobileTouchState.enabled = enabled === true;
  if (!mobileTouchState.enabled) clearMobileTouchInput('disabled');
  return mobileTouchState.enabled;
}

function setMobileTouchPad(pad, x = 0, y = 0, active = true, now = performance.now()) {
  const target = pad === 'look' ? mobileTouchState.look : mobileTouchState.move;
  target.x = clamp(x);
  target.y = clamp(y);
  target.active = active === true;
  if (pad === 'look') {
    mobileTouchState.lastLookInputAt = Number(now) || performance.now();
  } else {
    mobileTouchState.lastMoveInputAt = Number(now) || performance.now();
  }
  return getMobileTouchInputSnapshot();
}

function clearMobileTouchInput(reason = 'runtime') {
  Object.assign(mobileTouchState.move, { x: 0, y: 0, active: false });
  Object.assign(mobileTouchState.look, { x: 0, y: 0, active: false });
  return String(reason || 'runtime');
}

function updateMobileTouchSettings(patch = {}) {
  mobileTouchState.settings = saveMobileTouchSettings({ ...mobileTouchState.settings, ...patch });
  return mobileTouchState.settings;
}

function getMobileTouchInputSnapshot() {
  return {
    enabled: mobileTouchState.enabled,
    move: { ...mobileTouchState.move },
    look: { ...mobileTouchState.look },
    lastMoveInputAt: mobileTouchState.lastMoveInputAt,
    lastLookInputAt: mobileTouchState.lastLookInputAt,
    settings: { ...mobileTouchState.settings }
  };
}

function buttonRising(gamepad, index) {
  const current = buttonValue(gamepad, index) > 0.55;
  const previous = inputState.previousButtons[index] === true;
  inputState.previousButtons[index] = current;
  return current && !previous;
}

function runGamepadContextAction() {
  const runInterior = () => Promise.resolve(appCtx.handleInteriorAction?.()).then((handled) => handled === true);
  const runGameplay = () => Promise.resolve(appCtx.handleGameplayInteraction?.()).then((handled) => (
    handled === true ? true : runInterior()
  ));
  return Promise.resolve(appCtx.handlePrimaryContextInteraction?.()).then((handled) => (
    handled === true ? true : runGameplay()
  )).catch((error) => {
    console.warn('[controls] Gamepad context action failed.', error);
    return false;
  });
}

function controlPromptLabel(actionId) {
  if (inputState.gamepad?.connected) {
    const labels = { interact: 'X', primary_action: 'A', inventory: 'D-pad Up', map: 'View', camera: 'LB' };
    if (labels[actionId]) return labels[actionId];
  }
  return keyboardBindingLabel(actionId);
}

function updateControlInput() {
  const gamepad = connectedGamepad();
  inputState.gamepad = gamepad;
  inputState.updatedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (!gamepad) {
    inputState.previousButtons = [];
    return false;
  }
  if (buttonRising(gamepad, 2)) void runGamepadContextAction();
  if (buttonRising(gamepad, 12)) appCtx.toggleUrbanEquipment?.();
  if (buttonRising(gamepad, 8)) {
    if (appCtx.showLargeMap) appCtx.closeLargeMap?.();
    else appCtx.openLargeMap?.();
  }
  if (buttonRising(gamepad, 9)) {
    const paused = appCtx.togglePauseReason?.('manual_pause') ?? appCtx.paused;
    document.getElementById('pauseScreen')?.classList.toggle('show', paused);
  }
  if (buttonRising(gamepad, 4)) appCtx.cycleCameraMode?.();
  return true;
}

function clearControlInputState(reason = 'runtime') {
  const keys = appCtx.keys || {};
  const configuredCodes = Object.values(keyboardBindingsSnapshot().bindings || {});
  new Set([...HELD_CONTROL_CODES, ...configuredCodes]).forEach((code) => {
    keys[code] = false;
  });
  inputState.gamepad = null;
  inputState.previousButtons = [];
  inputState.lastPlaneTurnTapAt.ArrowLeft = -Infinity;
  inputState.lastPlaneTurnTapAt.ArrowRight = -Infinity;
  inputState.pendingPlaneBarrelRoll = 0;
  clearMobileTouchInput(reason);
  inputState.updatedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return String(reason || 'runtime');
}

function getControlInputSnapshot(mode = appCtx.getCurrentTravelMode?.() || 'drive') {
  return {
    device: inputState.gamepad ? 'gamepad' : 'keyboard_touch',
    gamepadId: String(inputState.gamepad?.id || ''),
    actions: readControlActions(mode),
    updatedAt: inputState.updatedAt
  };
}

Object.assign(appCtx, {
  clearMobileTouchInput,
  getControlInputSnapshot,
  getMobileTouchInputSnapshot,
  clearControlInputState,
  consumePlaneBarrelRollTrigger,
  getControlBindingCode: keyboardBindingCode,
  getControlBindingLabel: keyboardBindingLabel,
  getControlPromptLabel: controlPromptLabel,
  getKeyboardBindingsSnapshot: keyboardBindingsSnapshot,
  keyMatchesControlAction: keyMatchesKeyboardAction,
  readControlActions,
  registerPlaneTurnTap,
  resetKeyboardBindings,
  setKeyboardBinding,
  setMobileTouchEnabled,
  setMobileTouchPad,
  updateMobileTouchSettings,
  updateControlInput
});

export {
  PLANE_DOUBLE_TAP_WINDOW_MS,
  clearMobileTouchInput,
  clearControlInputState,
  consumePlaneBarrelRollTrigger,
  getControlInputSnapshot,
  keyboardControlActions,
  readControlActions,
  registerPlaneTurnTap,
  setMobileTouchEnabled,
  setMobileTouchPad,
  updateControlInput,
  updateMobileTouchSettings
};
