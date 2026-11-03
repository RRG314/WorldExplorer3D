import test from 'node:test';
import assert from 'node:assert/strict';
import { bindPlanetaryCareer } from '../app/js/campaign/planetary-career-adapter.js';
import { lunarReportFixture } from './helpers/lunar-study-record.mjs';
import { lunarStudyHomecomingRecord } from '../app/js/planetary/lunar-study-records.js';
function fixture({
  environment = 'EARTH',
  events = [],
  ledger = { missions: {} },
  status = 'ready',
} = {}) {
  let adapter,
    travel = 0,
    boards = 0;
  const selected = [],
    restored = [],
    runtime = {
      LOC: { lat: 39, lon: -76 },
      gameStarted: true,
      worldLoading: false,
      getEnv: () => environment,
      universeRuntime: { current: { id: 'sol' } },
      getDestinationMissionSnapshot: () =>
        environment === 'MOON'
          ? {
              destinationId: 'moon',
              activeMissionId: 'mission:moon',
              phase: 'fieldwork',
              evidence: [],
            }
          : null,
      selectLunarStudy: (id) => {
        selected.push(id);
        return true;
      },
      restoreLunarStudyFromJournal: (r) => {
        restored.push(r);
        return true;
      },
    },
    experiences = {
      registerAdapter(id, value) {
        assert.equal(id, 'planetary');
        adapter = value;
        return () => {};
      },
      getStore: async () => ({ getEventsById: async () => events }),
      travelToPlace: async () => {
        travel++;
        return true;
      },
    };
  bindPlanetaryCareer(runtime, experiences, {
    loadMissionOwner: async () => ({ store: { load: () => ledger, status } }),
    board: async (ctx, { isCurrent }) => {
      boards++;
      assert.equal(ctx, runtime);
      return isCurrent();
    },
  });
  return {
    runtime,
    adapter,
    get travel() {
      return travel;
    },
    get boards() {
      return boards;
    },
    selected,
    restored,
  };
}
test('Activities reads existing lunar evidence, exposes bounded choices and preserves the original report on entry', async () => {
  const report = lunarReportFixture(),
    display = lunarStudyHomecomingRecord(
      { id: 'home', workspace: { recordId: report.eventId } },
      report,
      1002000,
    ),
    f = fixture({ events: [report, display] }),
    profile = { updatedAt: 1 },
    places = await f.adapter.places({ profile, context: { place: { lat: 40, lon: -75 } } });
  assert.equal(places[0].environment, 'space');
  assert.equal(places[0].lat, 40);
  const summary = f.adapter.summary({ profile, variantId: 'campaign' });
  assert.equal(
    summary.stages.every((s) => s.complete),
    true,
  );
  assert.equal(summary.choices.length, 3);
  assert.equal(f.adapter.offer({ profile, place: places[0] }).enabled, true);
  assert.equal(f.adapter.summary({ profile: { updatedAt: 2 } }).choices.length, 0);
  const intent = { variantId: 'alternate-method', place: places[0] },
    current = () => true;
  assert.equal(await f.adapter.travel({ intent, isCurrent: current }), true);
  assert.equal(f.travel, 1);
  assert.equal(await f.adapter.start({ intent, isCurrent: current }), true);
  assert.deepEqual(f.selected, ['alternate-method']);
  assert.equal(f.boards, 1);
  assert.deepEqual(f.restored, [report]);
});
test('Moon resume keeps its location, stale entry does not board and protected saves do not offer a new mission', async () => {
  const moon = fixture({ environment: 'MOON' });
  let mode = null,
    spaceReady = false;
  moon.runtime.ensureSpaceRuntime = async () => {
    spaceReady = true;
    moon.runtime.startSpaceFlightFromExpeditionSurface = () => true;
  };
  moon.runtime.setTravelMode = (m) => {
    mode = m;
  };
  const intent = { variantId: 'campaign', place: { environment: 'space' } };
  assert.equal(await moon.adapter.travel({ intent, isCurrent: () => true }), true);
  assert.equal(await moon.adapter.start({ intent, isCurrent: () => true }), true);
  assert.equal(moon.travel, 0);
  assert.equal(moon.boards, 0);
  assert.equal(mode, 'walk');
  assert.equal(spaceReady, true);
  const stale = fixture();
  assert.equal(await stale.adapter.start({ intent, isCurrent: () => false }), false);
  assert.equal(stale.boards, 0);
  assert.equal(stale.selected.length, 0);
  const protectedView = fixture({ status: 'protected' }),
    profile = { updatedAt: 1 };
  await protectedView.adapter.places({ profile });
  assert.equal(protectedView.adapter.offer({ profile, place: {} }).enabled, false);
  const other = fixture({ environment: 'SPACE_FLIGHT' });
  other.runtime.universeRuntime.current.id = 'proxima-centauri';
  assert.equal(other.adapter.offer({ place: {} }).enabled, false);
  assert.equal(await other.adapter.travel({ intent, isCurrent: () => true }), false);
  assert.equal(other.travel, 0);
});
test('an unfinished repeat is the only offered assignment; missing display keeps later studies locked', async () => {
  const record = lunarReportFixture(),
    profile = { updatedAt: 1 },
    f = fixture({ events: [record] });
  await f.adapter.places({ profile });
  assert.deepEqual(
    f.adapter.summary({ profile }).choices.map((x) => x.id),
    ['campaign'],
  );
  const active = fixture({
    ledger: {
      missions: {
        'mission:moon:planned-return': {
          missionId: 'mission:moon:planned-return',
          destinationId: 'moon',
          phase: 'fieldwork',
          surveyVariantId: 'planned-return',
        },
      },
    },
  });
  await active.adapter.places({ profile });
  assert.deepEqual(
    active.adapter.summary({ profile, variantId: 'planned-return' }).choices.map((x) => x.id),
    ['planned-return'],
  );
  assert.equal(active.adapter.summary({ profile, variantId: 'planned-return' }).resume, true);
});
test('a forced later assignment cannot bypass the current Earth display and Moon resume uses live mission identity', async () => {
  const report = lunarReportFixture(),
    f = fixture({ events: [report] });
  await f.adapter.places({ profile: { updatedAt: 1 } });
  assert.equal(
    await f.adapter.start({ intent: { variantId: 'alternate-method' }, isCurrent: () => true }),
    false,
  );
  assert.equal(f.selected.length, 0);
  assert.equal(f.boards, 0);
  const base = lunarReportFixture(),
    display = lunarStudyHomecomingRecord(
      { id: 'home', workspace: { recordId: base.eventId } },
      base,
      1002000,
    ),
    moon = fixture({ environment: 'MOON', events: [base, display] });
  await moon.adapter.places({ profile: { updatedAt: 1 } });
  moon.runtime.getDestinationMissionSnapshot = () => ({
    destinationId: 'moon',
    activeMissionId: 'mission:moon:alternate-method',
    surveyVariantId: 'alternate-method',
    phase: 'fieldwork',
    evidence: ['mare-context'],
    preparation: { strategy: 'observe' },
  });
  assert.deepEqual(
    moon.adapter
      .summary({ profile: { updatedAt: 1 }, variantId: 'alternate-method' })
      .choices.map((c) => c.id),
    ['alternate-method'],
  );
  assert.equal(
    await moon.adapter.start({ intent: { variantId: 'alternate-method' }, isCurrent: () => true }),
    true,
  );
  assert.equal(moon.boards, 0);
});

test('saved in-flight and surface pods rehydrate the existing owner before travel and resume without boarding', async () => {
  let adapter,
    phase = 'local_flight',
    restores = 0,
    boards = 0;
  const runtime = {
      LOC: { lat: 39, lon: -76 },
      gameStarted: true,
      getEnv: () => 'SPACE_FLIGHT',
      universeRuntime: { current: { id: 'sol' } },
      selectLunarStudy: () => true,
    },
    journey = { id: 'same-pod', phase, bodyId: 'moon' },
    experiences = {
      registerAdapter: (_, a) => (adapter = a),
      getStore: async () => ({ getEventsById: async () => [] }),
      travelToPlace: async () => true,
    };
  bindPlanetaryCareer(runtime, experiences, {
    loadMissionOwner: async () => ({
      store: { load: () => ({ missions: {} }), status: 'ready' },
      journey,
    }),
    resume: async (r) => {
      restores++;
      r.getInterstellarExpeditionSnapshot = () => ({ podJourney: journey });
    },
    board: async () => {
      boards++;
      return true;
    },
  });
  await adapter.places({ profile: { updatedAt: 1 } });
  assert.equal(
    await adapter.travel({
      intent: { variantId: 'campaign', place: { environment: 'space' } },
      isCurrent: () => true,
    }),
    true,
  );
  assert.equal(restores, 1);
  assert.equal(
    await adapter.start({ intent: { variantId: 'campaign' }, isCurrent: () => true }),
    true,
  );
  assert.equal(restores, 2);
  assert.equal(boards, 0);
  assert.equal(runtime.getInterstellarExpeditionSnapshot().podJourney.id, 'same-pod');
});
