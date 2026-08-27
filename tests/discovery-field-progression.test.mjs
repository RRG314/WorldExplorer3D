import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryDiscoveryProfileStore } from '../app/js/discovery/profile-store.js';
import { fieldProgress } from '../app/js/discovery/pacing.js';

function observation(claimId, catalogId, collectedAt) {
  return {
    claimId,
    catalogId,
    collectedAt,
    name: 'Trail observation',
    family: 'exploration-record',
    discipline: 'exploration',
    activityId: 'inspect',
    regionId: 'test-region',
    regionLabel: 'Test region',
    worldIdentity: 'test-world',
    evidenceClass: 'procedural-game-encounter'
  };
}

test('Journal observations advance the field rank without becoming collection items', async () => {
  const store = createMemoryDiscoveryProfileStore();
  for (let index = 0; index < 3; index += 1) {
    const result = await store.recordObservation(observation(`claim-${index}`, `catalog-${index}`, 1_000 + index));
    assert.equal(result.recorded, true);
    assert.equal(result.collected, false);
  }
  const profile = await store.getProfile();
  assert.equal(profile.collectionCount, 0);
  assert.equal(profile.explorerProgress.totalRecords, 3);
  assert.equal(fieldProgress(profile).rankId, 'surveyor');
});

test('a stable field claim can only reward once', async () => {
  const store = createMemoryDiscoveryProfileStore();
  const record = observation('stable-claim', 'stable-catalog', 2_000);
  const first = await store.recordObservation(record);
  const repeat = await store.recordObservation({ ...record, collectedAt: 3_000 });
  assert.equal(first.recorded, true);
  assert.equal(repeat.recorded, false);
  assert.equal(repeat.reason, 'already-claimed');
  assert.equal((await store.listEvents()).length, 1);
  assert.equal((await store.getProfile()).explorerProgress.totalRecords, 1);
});
