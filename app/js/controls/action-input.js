import { ctx as appCtx } from '../shared-context.js?v=55';

const DEAD_ZONE = 0.16;
const inputState = {
  gamepad: null,
  previousButtons: [],
  updatedAt: 0
};
const actionCache = new Map();

function clamp(value, min = -1, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function axis(value) {
  const numeric = clamp(value);
  const magnitude = Math.abs(numeric);
  if (magnitude <= DEAD_ZONE) return 0;
  return Math.sign(numeric) * (magnitude - DEAD_ZONE) / (1 - DEAD_ZONE);
}

function pressed(keys, first, second, third) {
  return keys?.[first] === true ||
    (second !== undefined && keys?.[second] === true) ||
    (third !== undefined && keys?.[third] === true);
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
  for (let i = 0; i < pads.length; i += 1) {
    if (pads[i]?.connected) return pads[i];
  }
  return null;
}

function buttonValue(gamepad, index) {
  const button = gamepad?.buttons?.[index];
  if (!button) return 0;
  return clamp(button.value ?? (button.pressed ? 1 : 0), 0, 1);
}

function keyboardActions(mode, actions) {
  const keys = appCtx.keys || {};
  const move = digital(pressed(keys, 'ArrowUp'), pressed(keys, 'ArrowDown'));
  const turn = digital(pressed(keys, 'ArrowLeft'), pressed(keys, 'ArrowRight'));
  const lookYaw = digital(pressed(keys, 'VirtualLookLeft', 'KeyA'), pressed(keys, 'VirtualLookRight', 'KeyD'));
  const lookPitch = digital(pressed(keys, 'VirtualLookUp', 'KeyW'), pressed(keys, 'VirtualLookDown', 'KeyS'));
  const ascend = pressed(keys, 'Space', 'KeyR');
  const descend = pressed(keys, 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight');
  actions.mode = mode;
  actions.move = move;
  actions.turn = turn;
  actions.steer = turn;
  actions.lookYaw = lookYaw;
  actions.lookPitch = lookPitch;
  actions.throttle = Math.max(0, move);
  actions.reverse = Math.max(0, -move);
  actions.brake = pressed(keys, 'Space') ? 1 : 0;
  actions.boost = pressed(keys, 'ControlLeft', 'ControlRight') ? 1 : 0;
  actions.jump = pressed(keys, 'Space') ? 1 : 0;
  actions.sprint = pressed(keys, 'ShiftLeft', 'ShiftRight') ? 1 : 0;
  actions.vertical = digital(ascend, descend);
  actions.pitch = mode === 'plane' ? -move : lookPitch;
  actions.roll = turn;
  actions.throttleAdjust = digital(pressed(keys, 'KeyX'), pressed(keys, 'KeyZ'));
  return actions;
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
    actions.throttleAdjust = clamp(actions.throttleAdjust + rightTrigger - leftTrigger);
  } else if (actions.mode === 'drone' || actions.mode === 'ocean') {
    actions.vertical = clamp(actions.vertical + rightShoulder - leftShoulder);
  } else {
    actions.throttle = Math.max(actions.throttle, rightTrigger, Math.max(0, leftY));
    actions.reverse = Math.max(actions.reverse, Math.max(0, -leftY));
  }
  return actions;
}

function readControlActions(mode = 'drive') {
  const normalizedMode = normalizeMode(mode);
  let actions = actionCache.get(normalizedMode);
  if (!actions) {
    actions = {};
    actionCache.set(normalizedMode, actions);
  }
  return mergeGamepad(keyboardActions(normalizedMode, actions), inputState.gamepad || connectedGamepad());
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
    inputState.previousButtons.length = 0;
    return false;
  }
  if (buttonRising(gamepad, 9)) appCtx.cyclePrimaryTravelMode?.({ source: 'gamepad' });
  if (buttonRising(gamepad, 8)) appCtx.cycleCameraMode?.();
  return true;
}

function getControlInputSnapshot(mode = appCtx.getCurrentTravelMode?.() || 'drive') {
  return {
    device: inputState.gamepad ? 'gamepad' : 'keyboard_touch',
    gamepadId: String(inputState.gamepad?.id || ''),
    actions: { ...readControlActions(mode) },
    updatedAt: inputState.updatedAt
  };
}

Object.assign(appCtx, {
  getControlInputSnapshot,
  readControlActions,
  updateControlInput
});

export { getControlInputSnapshot, readControlActions, updateControlInput };
