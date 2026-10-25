import { createLifecycleScope } from '../runtime/lifecycle-scope.js?v=2';

const VEHICLE_TILT_MODES = new Set(['drive', 'plane', 'rocket']);
const SAMPLE_MAX_AGE_MS = 500;
const clamp = (value, limit = 1) => Math.max(-limit, Math.min(limit, value));
const degrees = radians => radians * 180 / Math.PI;

// Orientation angles use the device's natural axes, not the rotated screen.
// Project gravity into screen axes. Ignoring compass heading also avoids a
// magnetometer permission and heading drift. atan2 handles beta's wrap at 180°.
function screenTiltAngles(beta, gamma, screenAngle = 0) {
  if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return null;
  const b = beta * Math.PI / 180, g = gamma * Math.PI / 180;
  const s = screenAngle * Math.PI / 180;
  const x = -Math.cos(b) * Math.sin(g), y = Math.sin(b), z = Math.cos(b) * Math.cos(g);
  const right = x * Math.cos(s) + y * Math.sin(s);
  const up = y * Math.cos(s) - x * Math.sin(s);
  return { steer: degrees(Math.asin(clamp(right))), pitch: degrees(Math.atan2(up, z)) };
}

function tiltAxis(delta, range = 25) {
  const magnitude = Math.abs(delta);
  return magnitude <= 2.5 ? 0 : Math.sign(delta) * Math.pow(clamp((magnitude - 2.5) / (range - 2.5)), 1.35);
}

function resolveVehicleTilt(mode, angles, neutral, sensitivity = 1) {
  if (!VEHICLE_TILT_MODES.has(mode) || !angles || !neutral) return { turn: 0, move: 0 };
  const pitchDelta = degrees(Math.atan2(
    Math.sin((angles.pitch - neutral.pitch) * Math.PI / 180),
    Math.cos((angles.pitch - neutral.pitch) * Math.PI / 180)
  ));
  const gain = Math.max(0.5, Math.min(1.5, Number(sensitivity) || 1));
  return {
    turn: tiltAxis((angles.steer - neutral.steer) * gain, mode === 'drive' ? 28 : 24),
    move: -tiltAxis(pitchDelta * gain, 24)
  };
}

// A sensor producer for the existing action reader. No animation loop, timer,
// transport state or position writes: the existing input frame samples it.
function createVehicleTiltInput({ target = globalThis.window, getContext, now = () => performance.now(), onChange = () => {} } = {}) {
  const scope = createLifecycleScope('vehicle-tilt-input');
  let enabled = false, disposed = false, revision = 0, status = 'off';
  let removeSensor = null, neutral = null, sample = null, lastRead = null, activeMode = '';
  let filtered = { turn: 0, move: 0 }, readAt = null;
  const screenAngle = () => Number(target?.screen?.orientation?.angle ?? target?.orientation) || 0;
  function setStatus(next) { if (status !== next) { status = next; onChange(snapshot()); } }
  function snapshot() { return { enabled, status, mode: activeMode, calibrated: !!neutral }; }
  function recenter() {
    neutral = null; sample = null; lastRead = now(); readAt = null;
    filtered = { turn: 0, move: 0 };
    if (enabled) setStatus('waiting');
  }
  function suspend() {
    removeSensor?.(); removeSensor = null; activeMode = '';
    recenter();
    if (enabled) setStatus('suspended');
  }
  function disable() {
    revision++; enabled = false; suspend(); setStatus('off');
  }
  function receive(event) {
    const context = getContext?.() || {};
    if (!enabled || context.blocked || !VEHICLE_TILT_MODES.has(context.mode)) { suspend(); return; }
    const angles = screenTiltAngles(event.beta, event.gamma, screenAngle());
    if (!angles) return;
    const at = now();
    if (sample && at - sample.at > SAMPLE_MAX_AGE_MS) recenter();
    sample = { angles, at };
    if (!neutral) neutral = angles;
    setStatus('active');
  }
  async function enable() {
    if (disposed) return false;
    const token = ++revision;
    if (!target?.isSecureContext || !target?.DeviceOrientationEvent) { setStatus('unsupported'); return false; }
    try {
      // Called directly from a click, before any await, for Safari activation.
      const request = target.DeviceOrientationEvent.requestPermission?.();
      const permission = request ? await request : 'granted';
      if (disposed || token !== revision) return false;
      if (permission !== 'granted') { setStatus('denied'); return false; }
      enabled = true; recenter(); onChange(snapshot()); return true;
    } catch (_) {
      if (!disposed && token === revision) setStatus('denied');
      return false;
    }
  }
  function read(mode, settings = {}) {
    const context = getContext?.() || {};
    if (!enabled || disposed || context.blocked || context.mode !== mode || !VEHICLE_TILT_MODES.has(mode)) {
      if (removeSensor || neutral) suspend();
      return null;
    }
    if (activeMode !== mode) { suspend(); activeMode = mode; }
    if (!removeSensor) {
      removeSensor = scope.listen(target, 'deviceorientation', receive);
      lastRead = now(); setStatus('waiting');
    }
    const at = now();
    if (!sample || at - sample.at > SAMPLE_MAX_AGE_MS) {
      if (sample) recenter();
      if (at - lastRead > 3000) setStatus('unavailable');
      return null;
    }
    const dt = readAt === null ? 0 : Math.max(0, Math.min(0.05, (at - readAt) / 1000));
    readAt = at;
    const wanted = resolveVehicleTilt(mode, sample.angles, neutral, settings.tiltSensitivity);
    const blend = 1 - Math.exp(-12 * dt);
    filtered.turn += (wanted.turn - filtered.turn) * blend;
    filtered.move += (wanted.move - filtered.move) * blend;
    return { ...filtered, speed: mode === 'drive' && settings.tiltSpeed === true };
  }
  scope.listen(target?.screen?.orientation || target, target?.screen?.orientation ? 'change' : 'orientationchange', recenter);
  return {
    enable, disable, recenter, suspend, read, snapshot,
    dispose() { if (disposed) return; disable(); disposed = true; scope.dispose('mobile-controls-disposed'); },
    lifecycleSnapshot: () => scope.snapshot()
  };
}

export { createVehicleTiltInput, resolveVehicleTilt, screenTiltAngles, VEHICLE_TILT_MODES };
