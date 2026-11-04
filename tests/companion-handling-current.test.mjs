import test from 'node:test';
import assert from 'node:assert/strict';
import {
  companionRecallOutcome,
  companionHandlingView,
  recallMemoryId,
} from '../app/js/campaign/companion-handling.js';
import {
  createStarterCompanionInstance,
  normalizeCompanionInstance,
} from '../app/js/discovery/companions.js?v=7';
import { createMemoryDiscoveryProfileStore } from '../app/js/discovery/profile-store.js?v=5';
import { ensureStarterCompanion } from '../app/js/discovery/companion-runtime.js?v=10';
import {
  bindCompanionCareer,
  createCompanionCareerRuntime,
} from '../app/js/campaign/companion-career-adapter.js';
const buddy = () =>
  structuredClone(
    normalizeCompanionInstance({
      ...createStarterCompanionInstance({ adoptedAt: 100 }),
      active: true,
      name: 'Original Scout',
      progression: { schemaVersion: 3, totalXp: 100 },
    })
  );
const location = {
  regionId: 'original-place',
  regionLabel: 'Original place',
  locationSnapshot: { lat: 39.29, lon: -76.61, name: 'Loaded origin' },
};
test('a real recall outcome retains identity and other skills and credits the original first clear once', () => {
  const c = buddy();
  c.training.records.other = { completed: true, completedAt: 120 };
  const before = structuredClone(c),
    result = companionRecallOutcome(c, 1000, location);
  assert.deepEqual(c, before);
  assert.equal(result.companion.instanceId, c.instanceId);
  assert.equal(result.companion.name, c.name);
  assert.equal(result.points, 15);
  assert.equal(result.companion.progression.totalXp, 115);
  assert.deepEqual(result.companion.training.records.other, c.training.records.other);
  assert.equal(result.event.metadata.companionRecall.completedAt, 1000);
  assert.equal(result.companion.progression.lastAward.awardedAt, 1000);
  const duplicate = companionRecallOutcome(result.companion, 2000, location);
  assert.equal(duplicate.awarded, false);
  assert.equal(duplicate.companion.progression.totalXp, 115);
  assert.equal(duplicate.companion.training.records.recall.completedAt, 1000);
});
test('new completion rejects unsupported, inactive, underlevel or untimed companion state', () => {
  for (const patch of [
    { schemaVersion: 4 },
    { progression: { schemaVersion: 4, totalXp: 100, level: 3 } },
    { active: false },
    { progression: { schemaVersion: 3, totalXp: 0, level: 1 } },
  ])
    assert.throws(() => companionRecallOutcome({ ...buddy(), ...patch }, 1000));
  for (const t of [0, NaN, Infinity, -1]) assert.throws(() => companionRecallOutcome(buddy(), t));
});
test('the original companion, character projection and one Journal memory advance together and duplicate saves stay unchanged', async () => {
  const c = buddy(),
    store = createMemoryDiscoveryProfileStore({ companions: [c] }),
    before = await store.exportData(),
    result = await store.completeCompanionRecall(c.instanceId, 1000, location),
    after = await store.exportData();
  assert.equal(result.awarded, true);
  assert.equal(after.companions[0].progression.totalXp, 115);
  assert.equal(after.events.length, before.events.length + 1);
  assert.equal(after.events.at(-1).eventId, recallMemoryId(c.instanceId));
  assert.notDeepEqual(after.profile.characterState, before.profile.characterState);
  await store.completeCompanionRecall(c.instanceId, 2000, location);
  const duplicate = await store.exportData();
  assert.deepEqual(duplicate.companions, after.companions);
  assert.deepEqual(duplicate.events, after.events);
  assert.deepEqual(duplicate.profile.characterState, after.profile.characterState);
});
test('a damaged new skill-memory binding rejects the entire backup before existing state changes', async () => {
  const c = buddy(),
    store = createMemoryDiscoveryProfileStore({ companions: [c] });
  await store.completeCompanionRecall(c.instanceId, 1000, location);
  const original = await store.exportData();
  for (const mutate of [
    (d) => d.companions[0].training.records.recall.completedAt++,
    (d) => (d.events[0].sourceId = 'another companion'),
    (d) => (d.events[0].metadata.companionRecall.completedAt = 0),
  ]) {
    const bad = structuredClone(original);
    mutate(bad);
    await assert.rejects(store.importData(bad));
    const now = await store.exportData();
    assert.deepEqual(now.events, original.events);
    assert.deepEqual(now.companions, original.companions);
  }
  await store.importData(original);
  assert.deepEqual((await store.exportData()).companions, original.companions);
});
test('legacy memories without new proof remain valid and a custody choice gives a useful next action without inventing campaign completion', async () => {
  const c = buddy();
  c.active = false;
  const store = createMemoryDiscoveryProfileStore({
    companions: [c],
    events: [{ eventId: 'old-memory', eventType: 'companion-training', occurredAt: 100 }],
  });
  const backup = await store.exportData();
  await store.importData(backup);
  const v = companionHandlingView({ companions: [c] });
  assert.equal(v.next, 'Travel together');
  assert.equal(Object.hasOwn(v, 'complete'), false);
  assert.equal(companionHandlingView().next, 'Meet your first companion');
});
test('Activities retains the current place and the thin owner has no second frame loop', async () => {
  let adapter,
    starts = 0,
    stops = 0;
  const runtime = {
    worldDiscoveryRuntime: {
      ui: {
        startCompanionCareer: async () => {
          starts++;
          return true;
        },
        stopCompanionCareer: () => stops++,
        companionSnapshot: () => ({ phase: 'companions' }),
      },
    },
  };
  bindCompanionCareer(runtime, {
    registerAdapter: (id, a) => {
      assert.equal(id, 'companions');
      adapter = a;
    },
    getStore: async () => ({ listCompanions: async () => [buddy()] }),
  });
  const place = { name: 'Current exact origin', lat: 41, lon: -72 },
    places = await adapter.places({ context: { place } });
  assert.equal(places[0].lat, place.lat);
  assert.equal(adapter.offer({ place: places[0] }).enabled, true);
  const owner = await createCompanionCareerRuntime({ runtime, isActive: () => true });
  owner.update(100);
  assert.equal(starts, 1);
  assert.equal(owner.snapshot().careerId, 'companions');
  owner.dispose();
  assert.equal(stops, 1);
});
test('failed companion entry releases only its own original UI lease', async () => {
  let stopped = 0;
  await assert.rejects(
    createCompanionCareerRuntime({
      runtime: {
        worldDiscoveryRuntime: {
          ui: {
            startCompanionCareer: async () => {
              throw Error('Controlled read failure');
            },
            stopCompanionCareer: () => stopped++,
          },
        },
      },
      isActive: () => true,
    }),
    /Controlled read failure/
  );
  assert.equal(stopped, 1);
});

test('a deliberate resting choice survives the existing starter bootstrap on reload', async () => {
  const c = buddy();
  c.active = false;
  c.residence = { state: 'home', homeId: 'original-home', updatedAt: 800 };
  const store = createMemoryDiscoveryProfileStore({
    companions: [c],
    profile: {
      activeCompanionId: null,
      companionOnboarding: {
        starterDogGranted: true,
        starterDogInstanceId: c.instanceId,
        starterDogGrantedAt: 100,
        primaryHomeId: 'original-home',
      },
    },
  });
  const first = await ensureStarterCompanion(store, { now: 2000 });
  assert.equal(first.activeInstanceId, null);
  assert.equal((await store.listCompanions())[0].active, false);
  assert.equal((await store.getProfile()).activeCompanionId, null);
  assert.equal((await store.listCompanions())[0].residence.homeId, 'original-home');
});

test('handing off a nearby lead stops only the thin career and restores ordinary fieldwork controls', async () => {
  let options, reason;
  const runtime = {
    stopGameplayPlugin: (r) => (reason = r),
    worldDiscoveryRuntime: {
      ui: {
        startCompanionCareer: async (o) => {
          options = o;
          return true;
        },
        stopCompanionCareer() {},
        companionSnapshot: () => ({}),
      },
    },
  };
  await createCompanionCareerRuntime({ runtime, isActive: () => true });
  options.onField();
  assert.equal(reason, 'companion-fieldwork');
});
