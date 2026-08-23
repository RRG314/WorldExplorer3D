import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMobileStick,
  normalizeMobileTouchSettings,
  resolveMobileCameraRecenter,
  resolveMobileSemanticActions
} from '../app/js/controls/mobile-touch-authority.js';

test('standard right-handed layout is the safe default', () => {
  assert.equal(normalizeMobileTouchSettings({}).handedness, 'standard');
  assert.equal(normalizeMobileTouchSettings({ handedness: 'southpaw' }).handedness, 'southpaw');
});

test('analog sticks preserve direction, dead zone, and a circular maximum', () => {
  assert.deepEqual(normalizeMobileStick(0.04, -0.03), { x: 0, y: 0, magnitude: 0 });
  const diagonal = normalizeMobileStick(1, 1);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 0.0001);
  assert.ok(diagonal.x > 0 && diagonal.y > 0);
});

test('walking uses a left movement stick and independent right camera stick', () => {
  const actions = resolveMobileSemanticActions('walk', {
    enabled: true,
    move: { x: 0.72, y: -0.86, active: true },
    look: { x: 0.5, y: -0.4, active: true }
  });
  assert.ok(actions.move > 0);
  assert.ok(actions.strafe > 0);
  assert.equal(actions.turn, 0);
  assert.ok(actions.lookYaw < 0);
  assert.ok(actions.lookPitch > 0);
});

test('driving maps the left stick to throttle and steering', () => {
  const actions = resolveMobileSemanticActions('drive', {
    enabled: true,
    move: { x: 0.8, y: -0.75, active: true },
    look: { x: 0, y: 0, active: false }
  });
  assert.ok(actions.move > 0);
  assert.ok(actions.turn < 0);
  assert.equal(actions.strafe, 0);
});

test('camera waits for look release, then converges behind the actor', () => {
  const held = resolveMobileCameraRecenter({ actorYaw: 0, cameraYaw: 1.2, dt: 1 / 60, idleMs: 1000, lookActive: true });
  assert.equal(held.active, false);
  const waiting = resolveMobileCameraRecenter({ actorYaw: 0, cameraYaw: 1.2, dt: 1 / 60, idleMs: 300, lookActive: false });
  assert.equal(waiting.active, false);
  const recentering = resolveMobileCameraRecenter({ actorYaw: 0, cameraYaw: 1.2, dt: 1 / 60, idleMs: 1000, lookActive: false });
  assert.equal(recentering.active, true);
  assert.ok(Math.abs(recentering.yaw) < 1.2);
});
