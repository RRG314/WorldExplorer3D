import test from 'node:test';
import assert from 'node:assert/strict';

import { isRoadSurfaceReachable } from '../app/js/structure-semantics.js';
import { EQUIPMENT_DEFINITIONS } from '../app/js/urban-sandbox/equipment-model.js';
import { resolvePlayerProjectileLaunch } from '../app/js/urban-sandbox/projectile-ballistics.js';
import { reticlePresentation } from '../app/js/urban-sandbox/weapon-reticle-authority.js';
import { resolveNpcAimPoint } from '../app/js/urban-sandbox/npc-combat-policy.js';

test('reticle spread honestly opens with movement and recoil then recovers', () => {
  const settled = reticlePresentation({ kind: 'pulse', speedMph: 0, firedAgoMs: 1000 });
  const moving = reticlePresentation({ kind: 'pulse', speedMph: 12, firedAgoMs: 1000 });
  const fired = reticlePresentation({ kind: 'pulse', speedMph: 12, firedAgoMs: 0 });
  assert.equal(settled.gapPx, 8);
  assert.ok(moving.gapPx > settled.gapPx);
  assert.ok(fired.gapPx > moving.gapPx);
});

test('weapon profiles are distinct and hit confirmation is brief', () => {
  assert.notEqual(
    reticlePresentation({ kind: 'laser', firedAgoMs: 1000 }).gapPx,
    reticlePresentation({ kind: 'paintball', firedAgoMs: 1000 }).gapPx
  );
  assert.equal(reticlePresentation({ hitAgoMs: 80 }).hitConfirmed, true);
  assert.equal(reticlePresentation({ hitAgoMs: 300 }).hitConfirmed, false);
});

test('a center-reticle shot leaves the character hand and converges on the reticle aim point', () => {
  const target = { x: 0, y: 1.2, z: 100 };
  const launch = resolvePlayerProjectileLaunch({
    actor: { x: 0, y: 1.7, z: 0, angle: 0 },
    aimDirection: { x: 0, y: 0, z: 1 },
    aimPoint: target,
    kind: 'pulse',
    speed: 72,
    range: 100
  });
  assert.ok(Math.abs(launch.origin.x) > 0.1, 'Projectile should originate at the character hand, not the camera center.');
  const atTarget = {
    x: launch.origin.x + launch.velocity.x * launch.expectedFlightSeconds,
    y: launch.origin.y + launch.velocity.y * launch.expectedFlightSeconds,
    z: launch.origin.z + launch.velocity.z * launch.expectedFlightSeconds
  };
  assert.ok(Math.hypot(atTarget.x - target.x, atTarget.y - target.y, atTarget.z - target.z) < 0.001);
  assert.ok(launch.maxDistance >= 100);
});

test('a concussion charge owns a ballistic landing arc and cannot fuse before its expected landing', () => {
  const target = { x: 0, y: 0.04, z: 24 };
  const launch = resolvePlayerProjectileLaunch({
    actor: { x: 0, y: 1.7, z: 0, angle: 0 },
    aimDirection: { x: 0, y: -0.05, z: 1 },
    aimPoint: target,
    kind: 'thrown-charge',
    speed: 18,
    range: 26,
    gravity: 9.81,
    fuseSeconds: 2.2
  });
  const t = launch.expectedFlightSeconds;
  const landingY = launch.origin.y + launch.velocity.y * t - 0.5 * 9.81 * t * t;
  assert.ok(Math.abs(landingY - target.y) < 0.02);
  assert.ok(launch.velocity.y > 0);
  assert.ok(launch.maxLife >= t + 0.35);
});

test('a close concussion-charge throw still lands at the reticle instead of overshooting a forced lob', () => {
  const target = { x: 0, y: 0.04, z: 5 };
  const launch = resolvePlayerProjectileLaunch({
    actor: { x: 0, y: 1.7, z: 0, angle: 0 },
    aimDirection: { x: 0, y: -0.2, z: 1 },
    aimPoint: target,
    kind: 'thrown-charge',
    speed: 18,
    range: 26,
    gravity: 9.81,
    fuseSeconds: 2.2
  });
  const t = launch.expectedFlightSeconds;
  const atTarget = {
    x: launch.origin.x + launch.velocity.x * t,
    y: launch.origin.y + launch.velocity.y * t - 0.5 * 9.81 * t * t,
    z: launch.origin.z + launch.velocity.z * t
  };
  assert.ok(Math.hypot(atTarget.x - target.x, atTarget.y - target.y, atTarget.z - target.z) < 0.02);
});

test('paintball gravity is included in launch aim instead of dropping below the center reticle', () => {
  const target = { x: 0, y: 1.2, z: 50 };
  const launch = resolvePlayerProjectileLaunch({
    actor: { x: 0, y: 1.7, z: 0, angle: 0 },
    aimDirection: { x: 0, y: 0, z: 1 },
    aimPoint: target,
    kind: 'paintball',
    speed: 44,
    range: 55,
    gravity: 4.8
  });
  const t = launch.expectedFlightSeconds;
  const atTarget = {
    x: launch.origin.x + launch.velocity.x * t,
    y: launch.origin.y + launch.velocity.y * t - 0.5 * 4.8 * t * t,
    z: launch.origin.z + launch.velocity.z * t
  };
  assert.ok(Math.hypot(atTarget.x - target.x, atTarget.y - target.y, atTarget.z - target.z) < 0.02);
});

test('walking support ends at an elevated bridge deck edge instead of leaving an invisible ledge', () => {
  const road = {
    width: 10,
    structureSemantics: { gradeSeparated: true, terrainMode: 'elevated' }
  };
  assert.equal(isRoadSurfaceReachable({ road, dist: 4.95, verticalDelta: 0 }, { extraLateralPadding: -1.05 }), true);
  assert.equal(isRoadSurfaceReachable({ road, dist: 5.08, verticalDelta: 0 }, { extraLateralPadding: -1.05 }), false);
});

test('player ranged equipment has enough travel budget to reach visible world targets', () => {
  const byId = new Map(EQUIPMENT_DEFINITIONS.map((definition) => [definition.id, definition]));
  assert.ok(byId.get('pulse-sidearm').range >= 100);
  assert.ok(byId.get('laser-gun').range >= 150);
  assert.ok(byId.get('paintball-gun').range >= 50);
  assert.ok(byId.get('concussion-charge').range >= 24);
  assert.ok(byId.get('concussion-charge').fuseSeconds >= 2);
});

test('NPC projectile aim leads a moving explorer without becoming perfectly accurate', () => {
  const target = resolveNpcAimPoint(
    { id: 'npc:aim-test', x: 0, z: 0 },
    { x: 0, y: 1.7, z: 25, vx: 4, vz: 0 },
    { projectileSpeed: 50, range: 40, intervalMs: 1200 },
    1000
  );
  assert.ok(target.leadSeconds > 0 && target.leadSeconds <= .65);
  assert.ok(target.x > 0, 'aim should lead the moving target');
  assert.ok(target.accuracy < 1 && target.accuracy >= .25);
});
