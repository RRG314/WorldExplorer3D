import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ENTITY_LIFECYCLE_MS,
  lifecycleExpired,
  markLifecycleStart
} from '../app/js/runtime/entity-lifecycle-policy.js';

test('temporary world entities have bounded, positive lifetimes', () => {
  for (const [name, lifetime] of Object.entries(ENTITY_LIFECYCLE_MS)) {
    assert.ok(Number.isFinite(lifetime) && lifetime > 0, `${name} needs a bounded positive lifetime`);
  }
  assert.ok(ENTITY_LIFECYCLE_MS.lootPickup > ENTITY_LIFECYCLE_MS.downedActor);
});

test('lifecycle expiry uses elapsed time and never restarts an existing clock', () => {
  const entity = {};
  assert.equal(markLifecycleStart(entity, 'disabledAt', 1_000), 1_000);
  assert.equal(markLifecycleStart(entity, 'disabledAt', 2_000), 1_000);
  assert.equal(lifecycleExpired(entity.disabledAt, 45_000, 45_999), false);
  assert.equal(lifecycleExpired(entity.disabledAt, 45_000, 46_000), true);
});
