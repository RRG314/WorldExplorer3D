import assert from 'node:assert/strict';
import test from 'node:test';
import {
  sanitizeProductParams,
  updateVisitContext
} from '../js/analytics-contract.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value)
  };
}

test('product analytics removes identifiers and bounds event values', () => {
  assert.deepEqual(sanitizeProductParams({
    action: 'mission_completed',
    world_kind: 'Mars',
    uid: 'private-user',
    roomCode: 'SECRET',
    email: 'person@example.com',
    load_ms: 1234,
    success: true
  }), {
    action: 'mission_completed',
    world_kind: 'mars',
    load_ms: 1234,
    success: true
  });
});

test('visit context counts returns without creating a personal identifier', () => {
  const storage = memoryStorage();
  const first = updateVisitContext(storage, 1_000_000);
  const refresh = updateVisitContext(storage, 1_060_000);
  const returned = updateVisitContext(storage, 1_000_000 + 2 * 86400000);
  assert.equal(first.visit_index, 1);
  assert.equal(first.new_visit, true);
  assert.equal(refresh.visit_index, 1);
  assert.equal(refresh.new_visit, false);
  assert.equal(returned.visit_index, 2);
  assert.equal(returned.returning, true);
  assert.equal(returned.days_since_first, 2);
  assert.equal(Object.hasOwn(returned, 'uid'), false);
});
