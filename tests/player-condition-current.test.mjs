import assert from 'node:assert/strict';
import test from 'node:test';

import { createPlayerConditionModel, PLAYER_CONDITION_STORAGE_KEY } from '../app/js/player/condition-model.js';

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, String(value)) };
}

test('one persistent player condition authority applies damage and bounded recovery', () => {
  const storage = memoryStorage();
  const model = createPlayerConditionModel({ storage, now: () => 42 });
  assert.ok(Math.abs(model.applyImpact(58, 'test-impact').after - .42) < 1e-9);
  assert.equal(model.snapshot().band, 'injured');
  assert.ok(Math.abs(model.restore(.12, 'food').after - .54) < 1e-9);
  assert.equal(model.restore(2, 'medicine').after, 1);
  const saved = JSON.parse(storage.getItem(PLAYER_CONDITION_STORAGE_KEY));
  assert.equal(saved.condition, 1);
  assert.equal(createPlayerConditionModel({ storage }).snapshot().condition, 1);
});

test('signed-in hydration updates local recovery state without echoing a new write', () => {
  const storage = memoryStorage();
  const model = createPlayerConditionModel({ storage });
  let writes = 0;
  model.subscribe(() => { writes += 1; });
  model.set(.6, 'local-damage');
  assert.equal(writes, 1);
  model.hydrate(.35);
  assert.equal(model.snapshot().condition, .35);
  assert.equal(writes, 1);
  assert.equal(JSON.parse(storage.getItem(PLAYER_CONDITION_STORAGE_KEY)).condition, .35);
});
