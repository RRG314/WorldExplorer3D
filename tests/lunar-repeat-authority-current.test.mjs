import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDestinationMissionStore,
  DESTINATION_MISSION_STORAGE_KEY,
} from '../app/js/universe/mission-authority.js';
import { getDestinationMission } from '../app/js/universe/mission-catalog.js';
const moon = getDestinationMission('moon');
function memory() {
  const data = new Map();
  return { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
}
function base(store, strategy = 'samples') {
  store.activate(moon);
  store.advance(moon, 'review_briefing');
  assert.equal(
    store.prepareLunar(moon, {
      strategy,
      expeditionId: 'original-expedition',
      returnBriefed: true,
      calibratedAtMs: 1000,
    }),
    true,
  );
  store.advance(moon, 'arrive');
  for (const id of [
    'mare-context',
    strategy === 'observe' ? 'mare-observation' : 'mare-sample',
    'fragment-context',
    strategy === 'observe' ? 'fragment-observation' : 'fragment-sample',
  ])
    store.recordEvidence(moon, id);
  store.advance(moon, 'complete_fieldwork');
  store.advance(moon, 'complete_analysis');
  return structuredClone(store.get(moon));
}
test('two bounded lunar repeat instances preserve the original mission and require a changed method', () => {
  const disk = memory(),
    store = createDestinationMissionStore(disk),
    original = base(store);
  store.activate(moon, { variantId: 'alternate-method' });
  assert.equal(store.get(moon).missionId, 'mission:moon:alternate-method');
  assert.equal(store.get(moon).phase, 'available');
  assert.deepEqual(store.load().missions[moon.id], original);
  store.advance(moon, 'review_briefing');
  assert.equal(
    store.prepareLunar(moon, {
      strategy: 'samples',
      expeditionId: 'repeat-expedition',
      returnBriefed: true,
      calibratedAtMs: 2000,
    }),
    false,
  );
  assert.equal(
    store.prepareLunar(moon, {
      strategy: 'observe',
      expeditionId: 'repeat-expedition',
      returnBriefed: true,
      calibratedAtMs: 2000,
    }),
    true,
  );
  assert.throws(() => store.activate(moon, { variantId: 'planned-return' }), /unfinished/);
  assert.throws(() => store.activate(moon, { variantId: 'unrecognized' }), /supported/);
  const restored = createDestinationMissionStore(disk);
  assert.equal(restored.get(moon).missionId, 'mission:moon:alternate-method');
  assert.deepEqual(restored.get(moon, { variantId: 'campaign' }), original);
});
test('planned return gates site B until both A records and the recovered matching expedition pod', () => {
  const store = createDestinationMissionStore(memory());
  base(store);
  store.activate(moon, { variantId: 'planned-return' });
  store.advance(moon, 'review_briefing');
  store.prepareLunar(moon, {
    strategy: 'samples',
    expeditionId: 'repeat-expedition',
    returnBriefed: true,
    calibratedAtMs: 2000,
  });
  store.advance(moon, 'arrive');
  assert.equal(store.canRecordFieldEvidence(moon, 'fragment-context'), false);
  assert.equal(store.recordEvidence(moon, 'fragment-context').accepted, false);
  assert.equal(store.advance(moon, 'complete_fieldwork').accepted, false);
  const pod = {
    id: 'site-a-pod',
    phase: 'recovered',
    bodyId: 'moon',
    returnFrameId: 'sol',
    contactId: 'destination-mission:moon',
    expeditionId: 'repeat-expedition',
  };
  assert.equal(store.recordLunarRecovery(moon, pod).accepted, false);
  store.recordEvidence(moon, 'mare-context');
  assert.equal(store.recordEvidence(moon, 'mare-sample').accepted, false);
  store.recordEvidence(moon, 'mare-sample', { podId: pod.id });
  assert.equal(store.recordLunarRecovery(moon, { ...pod, expeditionId: 'wrong' }).accepted, false);
  assert.equal(store.recordLunarRecovery(moon, { ...pod, id: 'another-pod' }).accepted, false);
  assert.equal(store.recordLunarRecovery(moon, pod).accepted, true);
  const before = store.load();
  assert.equal(store.recordLunarRecovery(moon, pod).duplicate, true);
  assert.equal(store.load(), before);
  assert.equal(store.canRecordFieldEvidence(moon, 'fragment-context'), true);
  assert.equal(store.recordEvidence(moon, 'fragment-context').accepted, true);
  assert.equal(store.advance(moon, 'complete_fieldwork').accepted, false);
  store.recordEvidence(moon, 'fragment-sample');
  assert.equal(store.advance(moon, 'complete_fieldwork').accepted, true);
});
test('version2 records load compatibly; failed repeat writes, future ledgers and malformed instance identities stay protected', () => {
  const disk = memory(),
    store = createDestinationMissionStore(disk);
  base(store);
  const legacy = JSON.parse(disk.getItem(DESTINATION_MISSION_STORAGE_KEY));
  legacy.version = 2;
  for (const state of Object.values(legacy.missions)) state.version = 2;
  disk.setItem(DESTINATION_MISSION_STORAGE_KEY, JSON.stringify(legacy));
  const restored = createDestinationMissionStore(disk),
    before = restored.load();
  assert.equal(restored.status, 'ready');
  assert.equal(restored.get(moon).phase, 'complete');
  const raw = disk.getItem(DESTINATION_MISSION_STORAGE_KEY),
    save = disk.setItem;
  disk.setItem = () => {
    throw Error('quota');
  };
  assert.throws(() => restored.activate(moon, { variantId: 'alternate-method' }), /quota/);
  assert.equal(restored.load(), before);
  assert.equal(disk.getItem(DESTINATION_MISSION_STORAGE_KEY), raw);
  disk.setItem = save;
  for (const bad of [
    { ...legacy, version: 99 },
    {
      ...legacy,
      missions: {
        ...legacy.missions,
        'mission:moon:alternate-method': {
          ...legacy.missions[moon.id],
          missionId: 'mission:moon:alternate-method',
          surveyVariantId: 'planned-return',
        },
      },
    },
  ]) {
    disk.setItem(DESTINATION_MISSION_STORAGE_KEY, JSON.stringify(bad));
    const protectedStore = createDestinationMissionStore(disk),
      original = disk.getItem(DESTINATION_MISSION_STORAGE_KEY);
    assert.equal(protectedStore.status, 'protected');
    assert.throws(() => protectedStore.activate(moon), /retained/);
    assert.equal(disk.getItem(DESTINATION_MISSION_STORAGE_KEY), original);
  }
});
