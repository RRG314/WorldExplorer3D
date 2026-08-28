import test from 'node:test';
import assert from 'node:assert/strict';

import { elevatorFloorChoices } from '../app/js/interiors/elevator-authority.js';
import {
  insideInteriorStairOpening,
  resolveInteriorCeiling
} from '../app/js/interiors/vertical-boundary.js';
import { aircraftGearSamplePoints } from '../app/js/plane/roof-contact.js';
import { DEFAULT_WALKING_SPEEDS } from '../app/js/walking.js';
import { canUseEquippedItemOnMobile } from '../app/js/ui/equipment-action-policy.js';

const activeInterior = {
  floorBaseY: 10,
  activeLevel: 1,
  floorPlan: { floorCount: 5, storyHeight: 3.4 },
  connector: {
    start: { x: 0, z: 0 },
    end: { x: 0, z: 8 },
    rampWidth: 2
  }
};

test('interior ceilings stop a jump while the authored stair opening remains vertically traversable', () => {
  const ceiling = resolveInteriorCeiling({
    activeInterior,
    x: 5,
    z: 5,
    eyeY: 17.2,
    verticalVelocity: 4
  });
  assert.equal(ceiling.collided, true);
  assert.equal(ceiling.eyeY, 16.5);
  assert.equal(ceiling.verticalVelocity, 0);

  assert.equal(insideInteriorStairOpening(activeInterior, 0.5, 4), true);
  const stairs = resolveInteriorCeiling({
    activeInterior,
    x: 0.5,
    z: 4,
    eyeY: 17.2,
    verticalVelocity: 4
  });
  assert.equal(stairs.collided, false);
  assert.equal(stairs.opening, 'stairs');
});

test('elevator choices expose every floor with up, down, and current direction instead of cycling one way', () => {
  assert.deepEqual(elevatorFloorChoices({ floorCount: 5 }, 2), [
    { level: 0, label: 'Lobby', current: false, direction: 'down' },
    { level: 1, label: 'Floor 2', current: false, direction: 'down' },
    { level: 2, label: 'Floor 3', current: true, direction: 'current' },
    { level: 3, label: 'Floor 4', current: false, direction: 'up' },
    { level: 4, label: 'Floor 5', current: false, direction: 'up' }
  ]);
});

test('aircraft roof contact samples the full landing-gear footprint', () => {
  const samples = aircraftGearSamplePoints(10, 20, Math.PI / 2);
  assert.equal(samples.length, 5);
  assert.ok(samples.some((point) => point.x > 11.7));
  assert.ok(samples.some((point) => point.z < 18.8));
  assert.ok(samples.some((point) => point.z > 21.2));
});

test('walking and running use the restored responsive game pace', () => {
  assert.deepEqual(DEFAULT_WALKING_SPEEDS, { walk: 2.8, run: 5.6 });
  assert.equal(DEFAULT_WALKING_SPEEDS.run / DEFAULT_WALKING_SPEEDS.walk, 2);
});

test('mobile exposes the real action for parachutes as well as ranged equipment', () => {
  assert.equal(canUseEquippedItemOnMobile({ id: 'parachute', actionLabel: 'Deploy', verbs: ['equip', 'use'] }), true);
  assert.equal(canUseEquippedItemOnMobile({ id: 'pulse-sidearm', projectileKind: 'pulse', verbs: ['equip', 'use'] }), true);
  assert.equal(canUseEquippedItemOnMobile({ id: 'field-camera', verbs: ['equip'] }), false);
});
