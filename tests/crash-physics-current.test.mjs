import assert from 'node:assert/strict';
import test from 'node:test';

import { vehicleMassKg } from '../app/js/engine/vehicle-catalog.js';
import { dampCrashMotion, resolveCrashImpact } from '../app/js/urban-sandbox/crash-physics.js';

const momentumX = (mass, velocity) => mass * velocity.x;

test('low-speed contact does not become crash damage or knockdown', () => {
  const result = resolveCrashImpact({
    moverMassKg: vehicleMassKg('sedan'),
    targetMassKg: vehicleMassKg('compact'),
    moverVelocity: { x: 1, z: 0 },
    targetVelocity: { x: 0, z: 0 },
    normal: { x: 1, z: 0 },
    targetKind: 'vehicle'
  });
  assert.equal(result.severity, 'contact');
  assert.equal(result.moverDamageForce, 0);
  assert.equal(result.targetDamageForce, 0);
  assert.equal(result.knockdownSeconds, 0);
});

test('car-to-car impact conserves linear momentum while transferring motion', () => {
  const moverMassKg = vehicleMassKg('sedan');
  const targetMassKg = vehicleMassKg('compact');
  const before = { x: 13.4112, z: 0 };
  const result = resolveCrashImpact({
    moverMassKg,
    targetMassKg,
    moverVelocity: before,
    targetVelocity: { x: 0, z: 0 },
    normal: { x: 1, z: 0 },
    targetKind: 'vehicle'
  });
  const momentumBefore = momentumX(moverMassKg, before);
  const momentumAfter = momentumX(moverMassKg, result.moverVelocity) + momentumX(targetMassKg, result.targetVelocity);
  assert.ok(Math.abs(momentumAfter - momentumBefore) < .001);
  assert.ok(result.targetVelocity.x > result.moverVelocity.x);
  assert.ok(result.moverVelocity.x > 0, 'a similar-mass road crash should transfer motion, not always reverse the player');
  assert.ok(['major', 'severe'].includes(result.severity));
});

test('vehicle-to-person impact produces bounded knockback and recovery time', () => {
  const result = resolveCrashImpact({
    moverMassKg: vehicleMassKg('suv'),
    targetMassKg: 82,
    moverVelocity: { x: 13.4112, z: 0 },
    targetVelocity: { x: 0, z: 0 },
    normal: { x: 1, z: 0 },
    targetKind: 'npc'
  });
  assert.equal(result.severity, 'major');
  assert.ok(result.targetVelocity.x > 0 && result.targetVelocity.x <= 18);
  assert.ok(result.targetDamageForce > result.moverDamageForce);
  assert.ok(result.knockdownSeconds >= 1.4 && result.knockdownSeconds <= 8);
});

test('glancing impacts create deflection and spin rather than a fixed speed multiplier', () => {
  const result = resolveCrashImpact({
    moverMassKg: vehicleMassKg('pickup'),
    targetMassKg: vehicleMassKg('sedan'),
    moverVelocity: { x: 12, z: 7 },
    targetVelocity: { x: 0, z: 0 },
    normal: { x: 1, z: 0 },
    targetKind: 'vehicle'
  });
  assert.notEqual(result.moverVelocity.z, 0);
  assert.notEqual(result.moverYawImpulse, 0);
  assert.notEqual(result.targetYawImpulse, 0);
});

test('post-impact vehicle and person motion damps monotonically', () => {
  const vehicle = dampCrashMotion({ velocityX: 10, velocityZ: 3, angularVelocity: 1 }, .1, { kind: 'vehicle' });
  const person = dampCrashMotion({ velocityX: 10, velocityZ: 3, angularVelocity: 1 }, .1, { kind: 'npc' });
  assert.ok(Math.hypot(vehicle.velocityX, vehicle.velocityZ) < Math.hypot(10, 3));
  assert.ok(Math.hypot(person.velocityX, person.velocityZ) < Math.hypot(vehicle.velocityX, vehicle.velocityZ));
  assert.ok(Math.abs(vehicle.angularVelocity) < 1);
});
