import assert from 'node:assert/strict';
import test from 'node:test';

import { sampleSweptContact } from '../app/js/physics/swept-contact.js';

test('shared sweep catches thin contact between frame endpoints and preserves last safe pose', () => {
  const result = sampleSweptContact(
    { x: 0, y: 2, z: 0 },
    { x: 10, y: 2, z: 0 },
    .5,
    (position) => position.x >= 4.9 && position.x <= 5.1 ? { kind: 'thin-wall' } : null
  );
  assert.equal(result.contact.kind, 'thin-wall');
  assert.ok(result.position.x >= 4.9 && result.position.x <= 5.1);
  assert.ok(result.lastSafe.x < result.position.x);
  assert.equal(result.position.y, 2);
});

test('shared sweep covers vertical travel and returns null for a safe or stationary segment', () => {
  const vertical = sampleSweptContact(
    { x: 3, y: 12, z: 4 },
    { x: 3, y: 0, z: 4 },
    .4,
    (position) => position.y <= 6 ? { kind: 'roof' } : null
  );
  assert.equal(vertical.contact.kind, 'roof');
  assert.ok(vertical.lastSafe.y > vertical.position.y);
  assert.equal(sampleSweptContact({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, .2, () => null), null);
  assert.equal(sampleSweptContact({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 }, .2, () => ({ kind: 'ignored' })), null);
});
