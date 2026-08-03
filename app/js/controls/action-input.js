import { ctx as appCtx } from '../shared-context.js?v=55';

const DEAD_ZONE = 0.16;
const inputState = {
  gamepad: null,
  previousButtons: [],
  updatedAt: 0
};
const HELD_CONTROL_CODES = Object.freeze([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyX', 'KeyZ'
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
  const droneControls = mode === 'drone';
  const move = planeControls || droneControls
    ? digital(pressed(keys, 'ArrowUp'), pressed(keys, 'ArrowDown'))
    : digital(pressed(keys, 'KeyW'), pressed(keys, 'KeyS'));
  const turn = planeControls
    ? digital(pressed(keys, 'ArrowLeft'), pressed(keys, 'ArrowRight'))
    : droneControls
      ? digital(pressed(keys, 'ArrowLeft'), pressed(keys, 'ArrowRight'))
      : digital(pressed(keys, 'KeyA'), pressed(keys, 'KeyD'));
  const lookYaw = planeControls
    ? digital(pressed(keys, 'KeyA'), pressed(keys, 'KeyD'))
    : droneControls
      ? digital(pressed(keys, 'KeyA'), pressed(keys, 'KeyD'))
      : digital(pressed(keys, 'ArrowLeft'), pressed(keys, 'ArrowRight'));
  const lookPitch = planeControls
    ? digital(pressed(keys, 'KeyW'), pressed(keys, 'KeyS'))
    : droneControls
      ? digital(pressed(keys, 'KeyW'), pressed(keys, 'KeyS'))
      : digital(pressed(keys, 'ArrowUp'), pressed(keys, 'ArrowDown'));
  const ascend = pressed(keys, 'Space', 'KeyR');
  const descend = pressed(keys, 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight');
  const planeRollModifier = planeControls && pressed(keys, 'ControlLeft', 'ControlRight');
  return {
    mode,
    move,
    turn,
    steer: turn,
    strafe: 0,
    lookYaw,
    lookPitch,
    throttle: Math.max(0, move),
    reverse: Math.max(0, -move),
    brake: pressed(keys, planeControls ? 'ControlLeft' : 'Space', planeControls ? 'ControlRight' : 'Space') ? 1 : 0,
    boost: pressed(keys, 'ControlLeft', 'ControlRight') ? 1 : 0,
    jump: pressed(keys, 'Space') ? 1 : 0,
    sprint: pressed(keys, 'ShiftLeft', 'ShiftRight') ? 1 : 0,
    vertical: digital(ascend, descend),
    pitch: mode === 'plane' ? -move : lookPitch,
    roll: turn,
    aerobaticRoll: planeRollModifier ? turn : 0,
    throttleAdjust: planeControls
      ? digital(pressed(keys, 'Space'), pressed(keys, 'ShiftLeft', 'ShiftRight'))
      : 0
  };
}

function keyboardActions(mode) {
  return keyboardControlActions(appCtx.keys || {}, mode);
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
  const west = buttonValue(gamepad, 2);
  const north = buttonValue(gamepad, 3);
  const leftShoulder = buttonValue(gamepad, 4);
  const rightShoulder = buttonValue(gamepad, 5);

  actions.move = Math.abs(leftY) > Math.abs(actions.move) ? leftY : actions.move;
  actions.turn = Math.abs(leftX) > Math.abs(actions.turn) ? leftX : actions.turn;
  actions.steer = actions.turn;
  actions.lookYaw = Math.abs(rightX) > Math.abs(actions.lookYaw) ? rightX : actions.lookYaw;
  actions.lookPitch = Math.abs(rightY) > Math.abs(actions.lookPitch) ? rightY : actions.lookPitch;
  actions.brake = Math.max(actions.brake, west, leftTrigger);
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

function readControlActions(mode = 'drive') {
  const normalizedMode = normalizeMode(mode);
  return mergeGamepad(keyboardActions(normalizedMode), inputState.gamepad || connectedGamepad());
}

function buttonRising(gamepad, index) {
  const current = buttonValue(gamepad, index) > 0.55;
  const previous = inputState.previousButtons[index] === true;
  inputState.previousButtons[index] = current;
  return current && !previous;
}

function updateControlInput() {
  const gamepad = connectedGamepad();
  inputState.gamepad = gamepad;
  inputState.updatedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (!gamepad) {
    inputState.previousButtons = [];
    return false;
  }
  if (buttonRising(gamepad, 9)) appCtx.cyclePrimaryTravelMode?.({ source: 'gamepad' });
  if (buttonRising(gamepad, 8)) appCtx.cycleCameraMode?.();
  return true;
}

function clearControlInputState(reason = 'runtime') {
  const keys = appCtx.keys || {};
  HELD_CONTROL_CODES.forEach((code) => {
    keys[code] = false;
  });
  inputState.gamepad = null;
  inputState.previousButtons = [];
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
  getControlInputSnapshot,
  clearControlInputState,
  readControlActions,
  updateControlInput
});

export { clearControlInputState, getControlInputSnapshot, keyboardControlActions, readControlActions, updateControlInput };
