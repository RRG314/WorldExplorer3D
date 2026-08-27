const MOBILE_TOUCH_SETTINGS_KEY = 'world-explorer-mobile-controls-v1';

const DEFAULT_MOBILE_TOUCH_SETTINGS = Object.freeze({
  handedness: 'standard',
  moveSensitivity: 1,
  lookSensitivity: 0.82,
  cameraRecenter: true,
  cameraRecenterDelayMs: 650
});

function clamp(value, minimum = -1, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function normalizeMobileTouchSettings(value = {}) {
  const handedness = value?.handedness === 'southpaw' ? 'southpaw' : 'standard';
  return Object.freeze({
    handedness,
    moveSensitivity: clamp(value?.moveSensitivity ?? DEFAULT_MOBILE_TOUCH_SETTINGS.moveSensitivity, 0.45, 1.5),
    lookSensitivity: clamp(value?.lookSensitivity ?? DEFAULT_MOBILE_TOUCH_SETTINGS.lookSensitivity, 0.35, 1.5),
    cameraRecenter: value?.cameraRecenter !== false,
    cameraRecenterDelayMs: Math.round(clamp(value?.cameraRecenterDelayMs ?? DEFAULT_MOBILE_TOUCH_SETTINGS.cameraRecenterDelayMs, 250, 1800))
  });
}

function normalizeMobileStick(x = 0, y = 0, deadZone = 0.1) {
  const rawX = Number(x) || 0;
  const rawY = Number(y) || 0;
  const magnitude = Math.hypot(rawX, rawY);
  if (!(magnitude > deadZone)) return Object.freeze({ x: 0, y: 0, magnitude: 0 });
  const limitedMagnitude = Math.min(1, magnitude);
  const scaledMagnitude = (limitedMagnitude - deadZone) / Math.max(0.01, 1 - deadZone);
  const scale = scaledMagnitude / magnitude;
  return Object.freeze({
    x: clamp(rawX * scale),
    y: clamp(rawY * scale),
    magnitude: clamp(scaledMagnitude, 0, 1)
  });
}

function shapeMobileStick(stick, exponent = 1) {
  const magnitude = clamp(stick?.magnitude, 0, 1);
  if (!(magnitude > 0)) return Object.freeze({ x: 0, y: 0, magnitude: 0 });
  const shapedMagnitude = Math.pow(magnitude, Math.max(1, Number(exponent) || 1));
  const scale = shapedMagnitude / magnitude;
  return Object.freeze({
    x: clamp(stick.x * scale),
    y: clamp(stick.y * scale),
    magnitude: shapedMagnitude
  });
}

function resolveMobileSemanticActions(mode = 'walk', state = {}) {
  const settings = normalizeMobileTouchSettings(state.settings);
  const walking = mode === 'walk';
  const normalizedMove = normalizeMobileStick(state.move?.x, state.move?.y, walking ? 0.14 : 0.1);
  // Preserve full walking speed while giving short thumb motions a larger
  // precision range. Vehicle modes retain their established response.
  const move = walking ? shapeMobileStick(normalizedMove, 1.45) : normalizedMove;
  const look = normalizeMobileStick(state.look?.x, state.look?.y, 0.045);
  const moveX = clamp(move.x * settings.moveSensitivity);
  const moveY = clamp(move.y * settings.moveSensitivity);
  const lookX = clamp(look.x * settings.lookSensitivity);
  const lookY = clamp(look.y * settings.lookSensitivity);
  return Object.freeze({
    move: -moveY,
    turn: walking ? 0 : -moveX,
    steer: walking ? 0 : -moveX,
    strafe: walking ? moveX : 0,
    // Screen-space touch intent: dragging the look pad right must turn the
    // camera right. The old negation inverted that relationship on phones.
    lookYaw: lookX,
    lookPitch: -lookY,
    moveActive: state.move?.active === true,
    lookActive: state.look?.active === true,
    enabled: state.enabled === true,
    settings
  });
}

function wrapAngle(angle = 0) {
  return Math.atan2(Math.sin(Number(angle) || 0), Math.cos(Number(angle) || 0));
}

function resolveMobileCameraRecenter(options = {}) {
  const settings = normalizeMobileTouchSettings(options.settings);
  const currentYaw = wrapAngle(options.cameraYaw);
  if (!settings.cameraRecenter || options.lookActive === true || Number(options.idleMs) < settings.cameraRecenterDelayMs) {
    return Object.freeze({ active: false, yaw: currentYaw });
  }
  const dt = Math.max(0, Math.min(0.1, Number(options.dt) || 0));
  const delta = wrapAngle((Number(options.actorYaw) || 0) - currentYaw);
  const followRate = Math.max(0.5, Math.min(14, Number(options.followRate) || 4.2));
  return Object.freeze({ active: true, yaw: wrapAngle(currentYaw + delta * (1 - Math.exp(-dt * followRate))) });
}

function loadMobileTouchSettings(storage = globalThis.localStorage) {
  try {
    const stored = JSON.parse(storage?.getItem?.(MOBILE_TOUCH_SETTINGS_KEY) || 'null');
    return normalizeMobileTouchSettings(stored || DEFAULT_MOBILE_TOUCH_SETTINGS);
  } catch (_) {
    return normalizeMobileTouchSettings(DEFAULT_MOBILE_TOUCH_SETTINGS);
  }
}

function saveMobileTouchSettings(settings, storage = globalThis.localStorage) {
  const normalized = normalizeMobileTouchSettings(settings);
  try { storage?.setItem?.(MOBILE_TOUCH_SETTINGS_KEY, JSON.stringify(normalized)); } catch (_) {}
  return normalized;
}

export {
  DEFAULT_MOBILE_TOUCH_SETTINGS,
  MOBILE_TOUCH_SETTINGS_KEY,
  loadMobileTouchSettings,
  normalizeMobileStick,
  shapeMobileStick,
  normalizeMobileTouchSettings,
  resolveMobileCameraRecenter,
  resolveMobileSemanticActions,
  saveMobileTouchSettings
};
