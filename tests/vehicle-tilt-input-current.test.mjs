import test from 'node:test';
import assert from 'node:assert/strict';
import { createVehicleTiltInput, screenTiltAngles, resolveVehicleTilt } from '../app/js/controls/vehicle-tilt-input.js';
import { resolveCarDriveCommand } from '../app/js/controls/traversal-control-policy.js';
import { ctx } from '../app/js/shared-context.js?v=55';
import { initVehicleTiltInput, readControlActions, clearControlInputState, setMobileTouchEnabled, setMobileTouchPad, setMobileTouchPedal, updateMobileTouchSettings } from '../app/js/controls/action-input.js';

function rig({ requestPermission, integrated = false } = {}) {
  let at = 1000;
  const target = new EventTarget();
  Object.assign(target, { isSecureContext: true, DeviceOrientationEvent: requestPermission ? { requestPermission } : {} });
  target.screen = { orientation: Object.assign(new EventTarget(), { angle: 0 }) };
  const context = { mode: 'drive', blocked: false };
  const input = (integrated ? initVehicleTiltInput : createVehicleTiltInput)({ target, getContext: () => context, now: () => at });
  const sample = (beta = 40, gamma = 0) => target.dispatchEvent(Object.assign(new Event('deviceorientation'), { beta, gamma }));
  const read = (advance = 100, settings) => { at += advance; return input.read(context.mode, settings); };
  return { input, target, context, sample, read, advance: ms => { at += ms; } };
}

test('screen-relative tilt has the correct signs in portrait, both landscape orientations and inverted portrait', () => {
  for (const angle of [0, 90, 180, 270]) {
    // A gravity vector rotated with the screen represents the same rightward
    // tilt in every display orientation. Recover the sensor beta/gamma angles.
    const s = angle * Math.PI / 180;
    const right = -.3, up = .4, z = Math.sqrt(1 - right * right - up * up);
    const x = right * Math.cos(s) - up * Math.sin(s), y = right * Math.sin(s) + up * Math.cos(s);
    const beta = Math.asin(y) * 180 / Math.PI, gamma = Math.atan2(-x, z) * 180 / Math.PI;
    const angles = screenTiltAngles(beta, gamma, angle);
    assert.ok(angles.steer < -17 && angles.steer > -18, angle);
    assert.ok(angles.pitch > 24 && angles.pitch < 25, angle);
  }
  assert.equal(screenTiltAngles(null, 0), null);
  assert.equal(screenTiltAngles(NaN, 0), null);
});

test('neutral, dead zone, limited travel, wrapped pitch and mode-specific axes', () => {
  const neutral = { steer: 0, pitch: 179 };
  assert.deepEqual(resolveVehicleTilt('drive', { steer: 2, pitch: -179 }, neutral), { turn: 0, move: -0 });
  assert.equal(resolveVehicleTilt('plane', { steer: 90, pitch: 120 }, neutral).turn, 1);
  assert.equal(resolveVehicleTilt('plane', { steer: 90, pitch: 120 }, neutral).move, 1);
  assert.deepEqual(resolveVehicleTilt('walk', { steer: 45, pitch: 40 }, neutral), { turn: 0, move: 0 });
});

test('permission is user-initiated; denial and unavailable API retain a neutral fallback', async () => {
  let requests = 0;
  const r = rig({ requestPermission: () => { requests++; return Promise.resolve('denied'); } });
  assert.equal(r.read(), null); assert.equal(requests, 0);
  assert.equal(await r.input.enable(), false); assert.equal(requests, 1);
  assert.equal(r.input.snapshot().status, 'denied'); assert.equal(r.read(), null);
  r.target.isSecureContext = false; assert.equal(await r.input.enable(), false);
  assert.equal(r.input.snapshot().status, 'unsupported'); r.input.dispose();
});

test('late permission resolution cannot re-enable after disable or disposal', async () => {
  for (const method of ['disable', 'dispose']) {
    let resolve;
    const r = rig({ requestPermission: () => new Promise(done => { resolve = done; }) });
    const pending = r.input.enable(); r.input[method](); resolve('granted');
    assert.equal(await pending, false); assert.equal(r.input.snapshot().enabled, false); r.input.dispose();
  }
});

test('sensor calibration, smoothing, stale-data release and neutral recovery', async () => {
  const r = rig(); await r.input.enable(); r.read(); r.sample();
  assert.equal(r.read().turn, 0);
  r.sample(40, 30); const first = r.read(20).turn;
  assert.ok(first < 0 && first > -.3);
  const second = r.read(20).turn; assert.ok(second < first);
  assert.equal(r.read(501), null, 'stale sensors cannot keep steering or accelerating');
  r.sample(40, 30); assert.equal(r.read().turn, 0, 'first sample after a gap recenters');
  r.input.dispose(); assert.equal(r.input.lifecycleSnapshot().active, false);
});

test('pause, unsupported modes, screen rotation and explicit recenter release ownership', async () => {
  const r = rig(); await r.input.enable(); r.read(); r.sample(); r.read(); r.sample(40, -30);
  assert.ok(r.read().turn > 0);
  r.context.blocked = true; assert.equal(r.read(), null);
  assert.equal(r.input.lifecycleSnapshot().resources.listener, 1, 'only screen rotation listener remains');
  r.context.blocked = false; r.read(); r.sample(40, -30); assert.equal(r.read().turn, 0);
  r.context.mode = 'walk'; assert.equal(r.read(), null);
  r.context.mode = 'plane'; r.read(); r.sample(); assert.equal(r.read().turn, 0);
  r.target.screen.orientation.angle = 90; r.target.screen.orientation.dispatchEvent(new Event('change'));
  assert.equal(r.read(), null); r.sample(); assert.equal(r.read().turn, 0);
  r.input.recenter(); assert.equal(r.read(), null); r.input.dispose();
});

test('no-data browsers report fallback without a polling timer or input scheduler', async () => {
  const r = rig(); await r.input.enable(); r.read(); assert.equal(r.read(3001), null);
  assert.equal(r.input.snapshot().status, 'unavailable');
  assert.equal(r.input.lifecycleSnapshot().resources.timeout, undefined);
  assert.equal(r.input.lifecycleSnapshot().resources.interval, undefined); r.input.dispose();
});

test('existing action reader combines touch pedals, tilt and flight while preserving other modes', async t => {
  const oldKeys = ctx.keys; ctx.keys = {}; setMobileTouchEnabled(true); clearControlInputState();
  const r = rig({ integrated: true });
  t.after(() => { r.input.dispose(); clearControlInputState(); setMobileTouchEnabled(false); ctx.keys = oldKeys; });
  await r.input.enable(); readControlActions('drive'); r.sample(); readControlActions('drive');
  r.sample(15, 30); r.advance(50); let actions = readControlActions('drive');
  assert.ok(actions.steer < 0); assert.equal(actions.throttle, 0, 'tilt steering alone cannot accelerate');
  setMobileTouchPedal('throttle', true); assert.equal(readControlActions('drive').throttle, 1);
  setMobileTouchPad('move', -.5, 0, true); assert.ok(readControlActions('drive').steer > 0, 'active thumb overrides tilt');
  setMobileTouchPad('move', 0, 0, false); setMobileTouchPedal('throttle', false);
  ctx.keys.KeyA = true; assert.equal(readControlActions('drive').steer, 1); ctx.keys = {};
  updateMobileTouchSettings({ tiltSpeed: true }); r.advance(50); actions = readControlActions('drive');
  assert.ok(actions.throttle > 0);
  setMobileTouchPedal('reverse', true); assert.equal(readControlActions('drive').throttle, 0);
  assert.equal(readControlActions('drive').reverse, 1); setMobileTouchPedal('reverse', false);
  clearControlInputState(); readControlActions('drive'); r.sample(); readControlActions('drive'); r.sample(70); r.advance(50);
  actions = readControlActions('drive'); assert.ok(actions.serviceBrake > 0); assert.equal(actions.reverse, 0);
  for (const mode of ['walk', 'boat', 'ocean', 'drone']) { r.context.mode = mode; assert.equal(readControlActions(mode).mobileTilt, undefined); }
  for (const mode of ['plane', 'rocket']) {
    r.context.mode = mode; readControlActions(mode); r.sample(); readControlActions(mode); r.sample(70, 30); r.advance(50);
    actions = readControlActions(mode); assert.ok(actions.move < 0); assert.ok(actions.turn < 0);
    if (mode === 'plane') { assert.ok(actions.pitch > 0); assert.ok(actions.roll < 0); }
  }
  updateMobileTouchSettings({ tiltSpeed: false });
});

test('service braking stops forward and reverse travel, never selecting drift or a direction change', () => {
  for (const speed of [20, -20, 0]) {
    const command = resolveCarDriveCommand({ speed, throttle: 1, serviceBrake: .5 });
    assert.equal(command.serviceBrake, true); assert.equal(command.handbrake, false);
    assert.equal(command.forward, 0); assert.equal(command.reverse, 0);
  }
  assert.equal(resolveCarDriveCommand({ speed: 20, reverse: 1 }).serviceBrake, true);
  assert.equal(resolveCarDriveCommand({ speed: 0, reverse: 1 }).reverse, 1);
});


test('hardware trigger throttle remains authoritative when optional car tilt speed is enabled', async t => {
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator'), oldKeys = ctx.keys;
  const pad = { connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 16 }, () => ({ value: 0 })) };
  pad.buttons[7].value = 1;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads: () => [pad] } });
  ctx.keys = {}; setMobileTouchEnabled(true); updateMobileTouchSettings({ tiltSpeed: true });
  const r = rig({ integrated: true });
  t.after(() => { r.input.dispose(); clearControlInputState(); updateMobileTouchSettings({ tiltSpeed: false }); setMobileTouchEnabled(false); ctx.keys = oldKeys; if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator); else delete globalThis.navigator; });
  await r.input.enable(); readControlActions('drive'); r.sample(); r.advance(50);
  assert.equal(readControlActions('drive').throttle, 1);
});
