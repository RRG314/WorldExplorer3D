import test from 'node:test';
import assert from 'node:assert/strict';
import { explorerCareerView, explorerCareerSummary } from '../app/js/campaign/explorer-career.js';
import {
  beginOpeningChapter,
  normalizeOpeningChapter,
} from '../app/js/campaign/first-bearings.js?v=1';
import {
  bindExplorerCareer,
  createExplorerCareerRuntime,
} from '../app/js/campaign/explorer-career-adapter.js';
import { createMemoryDiscoveryProfileStore } from '../app/js/discovery/profile-store.js?v=5';
const location = {
  environment: 'EARTH',
  regionId: 'test-region',
  regionLabel: 'Test region',
  locationSnapshot: { lat: 39.3, lon: -76.6, name: 'Loaded origin' },
};
const completedOpening = () => ({
  ...beginOpeningChapter({}, location, 1000),
  phase: 'complete',
  eventId: 'field:original',
  resultName: 'Original discovery',
  completedAt: 2000,
});
test('the twelve-chapter view keeps existing achievements while requiring the missing opening and one local branch', () => {
  const profile = { harborRun: { phase: 'complete' } },
    before = structuredClone(profile),
    v = explorerCareerView(profile);
  assert.equal(v.chapters.length, 12);
  assert.equal(v.next.id, 'bearings');
  assert.equal(v.chapters.find((c) => c.id === 'delivery').complete, true);
  assert.equal(v.phase, 'active');
  assert.deepEqual(profile, before);
  assert.equal(explorerCareerView({ openingChapter: completedOpening() }).next.id, 'branch');
  assert.equal(
    explorerCareerView({ ...profile, openingChapter: completedOpening() }).next.id,
    'home'
  );
  const home = { eventId: 'event:campaign:place-to-return:v1', occurredAt: 2200 };
  assert.equal(
    explorerCareerView({
      ...profile,
      openingChapter: completedOpening(),
      homeAchievements: { home },
    }).next.id,
    'coastal'
  );
  assert.equal(explorerCareerSummary(profile).stages.filter((s) => s.complete).length, 1);
});
test('a completion-like event or a completed science career cannot replace the original campaign evidence', () => {
  const profile = {
      openingChapter: completedOpening(),
      harborRun: { phase: 'complete' },
      researchCareers: { oceanography: { schemaVersion: 1, completed: { campaign: 'a' } } },
    },
    events = [
      {
        eventId: 'event:campaign:from-the-harbor:v1',
        eventType: 'campaign-completed',
        sourceSystem: 'explorer-campaign',
        occurredAt: 3000,
        metadata: {},
      },
    ],
    before = structuredClone({ profile, events });
  const v = explorerCareerView(profile, events);
  assert.equal(v.phase, 'active');
  assert.equal(v.completionId, null);
  assert.equal(v.chapters.find((c) => c.id === 'coast-report').complete, false);
  assert.deepEqual({ profile, events }, before);
});
test('new opening origins survive normalization and invalid origins cannot replace an existing whole save', async () => {
  const legacy = beginOpeningChapter({}, { ...location, locationSnapshot: undefined }, 1000);
  assert.equal(Object.hasOwn(legacy, 'locationSnapshot'), false);
  const current = beginOpeningChapter({}, location, 1000);
  assert.deepEqual(normalizeOpeningChapter(current).locationSnapshot, location.locationSnapshot);
  assert.throws(() =>
    beginOpeningChapter(
      {},
      { ...location, locationSnapshot: { lat: NaN, lon: 0, name: 'bad' } },
      1000
    )
  );
  const store = createMemoryDiscoveryProfileStore({ profile: { openingChapter: current } }),
    before = await store.exportData(),
    bad = structuredClone(before);
  bad.profile.openingChapter.locationSnapshot.lon = 300;
  await assert.rejects(store.importData(bad));
  assert.deepEqual((await store.getProfile()).openingChapter, before.profile.openingChapter);
  const future = { schemaVersion: 2, keep: ['original'] };
  assert.deepEqual(normalizeOpeningChapter(future), future);
  assert.equal(explorerCareerView({ openingChapter: future }).phase, 'unavailable');
});
test('Explorer entry retains the current Earth frame and its thin lifetime delegates the existing discovery owner', async () => {
  let adapter,
    stops = 0,
    starts = 0;
  const events = [],
    runtime = {
      discoveryProfileStore: {},
      worldDiscoveryRuntime: {
        ui: {
          async startExplorerCareer() {
            starts++;
            return true;
          },
          stopExplorerCareer() {
            stops++;
          },
          explorerSnapshot: () => ({ phase: 'active', nextId: 'bearings' }),
        },
      },
    };
  bindExplorerCareer(runtime, {
    registerAdapter: (id, value) => {
      assert.equal(id, 'explorer');
      adapter = value;
    },
    getStore: async () => ({ getEventsById: async () => events }),
  });
  const p = { name: 'Current exact origin', lat: 41, lon: -72 },
    places = await adapter.places({ profile: {}, context: { place: p } });
  assert.deepEqual(
    { ...places[0], id: undefined, environment: undefined },
    { ...p, id: undefined, environment: undefined }
  );
  assert.equal(
    adapter.offer({ profile: { openingChapter: { schemaVersion: 2 } }, place: places[0] }).enabled,
    false
  );
  const owner = await createExplorerCareerRuntime({ runtime, isActive: () => true });
  owner.update(100);
  assert.equal(starts, 1);
  assert.equal(owner.snapshot().careerId, 'explorer');
  owner.dispose();
  assert.equal(stops, 1);
});

test('the home next action returns to its saved world origin after a coastal visit', async () => {
  let adapter;
  const profile = { openingChapter: completedOpening(), harborRun: { phase: 'complete' } },
    origin = { lat: 39.2904, lon: -76.6122, name: 'Original base world' };
  bindExplorerCareer(
    {},
    {
      registerAdapter: (id, value) => (adapter = value),
      getStore: async () => ({ getEventsById: async () => [] }),
    },
    {
      loadHousing: async () => ({
        starterHomeId: 'base',
        homes: [{ id: 'base', workspace: { projects: { worldOrigin: origin } } }],
      }),
    }
  );
  const places = await adapter.places({
    profile,
    context: { place: { lat: -18.2861, lon: 147.7, name: 'Coastal vessel' } },
  });
  assert.equal(places[0].lat, origin.lat);
  assert.equal(places[0].lon, origin.lon);
  assert.equal(places[0].name, origin.name);
});

test('a failed Explorer owner start releases only its own existing UI lease', async () => {
  let stopped = 0;
  const runtime = {
    worldDiscoveryRuntime: {
      ui: {
        startExplorerCareer: async () => {
          throw Error('Controlled read failure');
        },
        stopExplorerCareer: () => stopped++,
      },
    },
  };
  await assert.rejects(
    createExplorerCareerRuntime({ runtime, isActive: () => true }),
    /Controlled read failure/
  );
  assert.equal(stopped, 1);
});

test('coastal entry refreshes existing chapter owners after import and stops before travel when their read fails', async () => {
  let options,
    fail = false,
    travels = 0;
  const calls = [],
    runtime = {
      worldDiscoveryRuntime: {
        ui: {
          startExplorerCareer: async (o) => {
            options = o;
            return true;
          },
          stopExplorerCareer() {},
        },
      },
      discoveryProfileStore: { getProfile: async () => ({}), getEventsById: async () => [] },
      marineResearch: {
        coastal: {
          refresh: async () => {
            calls.push('coastal');
            return !fail;
          },
        },
        investigation: {
          refresh: async () => {
            calls.push('investigation');
            return true;
          },
        },
        refresh: async () => {
          calls.push('reef');
          return true;
        },
      },
    };
  await createExplorerCareerRuntime({
    runtime,
    isActive: () => true,
    travelToOcean: async () => {
      travels++;
      assert.equal(calls.length, 3);
      return true;
    },
  });
  assert.equal(await options.onNavigate('coast'), true);
  assert.equal(travels, 1);
  fail = true;
  await assert.rejects(options.onNavigate('coast'), /records could not be read/);
  assert.equal(travels, 1);
});
