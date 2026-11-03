import test from 'node:test';
import assert from 'node:assert/strict';
import { getDestinationMission } from '../app/js/universe/mission-catalog.js';
test('repeat controller rejects stale base stations and publishes a distinct once-only zero-bonus report', async () => {
  const oldStorage = globalThis.localStorage,
    oldDocument = globalThis.document,
    data = new Map(),
    moon = getDestinationMission('moon'),
    reports = new Map([['event:destination-mission:moon', { original: true }]]);
  globalThis.localStorage = {
    getItem: (k) => data.get(k) || null,
    setItem: (k, v) => data.set(k, v),
  };
  globalThis.document = { getElementById: () => ({ hidden: true }) };
  try {
    const { initDestinationMissionRuntime } = await import(
      '../app/js/universe/mission-runtime.js?lunar-repeat-runtime-contract'
    );
    const ctx = {
        activeShipInterior: true,
        universeRuntime: { current: { id: 'sol' } },
        getShipInteriorSnapshot: () => ({ active: true, shipId: 'solis-reach', deckId: 'command' }),
        getInterstellarExpeditionSnapshot: () => ({
          id: 'expedition',
          state: 'planned',
          crew: [],
          podJourney: {
            id: 'repeat-pod',
            phase: 'recovered',
            expeditionId: 'expedition',
            bodyId: 'moon',
            returnFrameId: 'sol',
          },
        }),
        Walk: { state: { walker: { x: 0, z: 0 } } },
        activeInterior: { interactions: [{ id: 'analysis-review', x: 0, z: 0 }] },
        recordExplorerEvent: async (e) => {
          assert.equal(reports.has(e.eventId), false);
          reports.set(e.eventId, e);
          return { recorded: true, event: e };
        },
      },
      store = initDestinationMissionRuntime(ctx);
    store.activate(moon);
    store.advance(moon, 'review_briefing');
    store.prepareLunar(moon, {
      strategy: 'samples',
      expeditionId: 'expedition',
      returnBriefed: true,
      calibratedAtMs: 1000,
    });
    store.advance(moon, 'arrive');
    ['mare-context', 'mare-sample', 'fragment-context', 'fragment-sample'].forEach((id) =>
      store.recordEvidence(moon, id),
    );
    store.advance(moon, 'complete_fieldwork');
    store.advance(moon, 'complete_analysis');
    const original = structuredClone(store.get(moon));
    assert.equal(ctx.selectLunarStudy('alternate-method'), true);
    assert.equal(
      ctx.getDestinationMissionSnapshot().activeMissionId,
      'mission:moon:alternate-method',
    );
    assert.equal(
      ctx.canRecordLunarFieldActivity({ bodyId: 'moon', evidenceId: 'mare-context' }),
      false,
    );
    assert.equal(
      ctx.canRecordLunarFieldActivity({
        bodyId: 'moon',
        surveyMissionId: 'mission:moon:alternate-method',
        evidenceId: 'mare-context',
      }),
      true,
    );
    store.advance(moon, 'review_briefing');
    store.prepareLunar(moon, {
      strategy: 'observe',
      expeditionId: 'expedition',
      returnBriefed: true,
      calibratedAtMs: 2000,
    });
    store.advance(moon, 'arrive');
    ['mare-context', 'mare-observation', 'fragment-context', 'fragment-observation'].forEach((id) =>
      store.recordEvidence(moon, id),
    );
    store.advance(moon, 'complete_fieldwork');
    assert.equal(await ctx.completeDestinationMissionAnalysis(), true);
    const report = reports.get('event:destination-mission:moon:alternate-method');
    assert.ok(report);
    assert.equal(report.points, 0);
    assert.equal(report.firstCompletion, false);
    assert.equal(report.metadata.strategy, 'observe');
    assert.equal(report.metadata.missionId, 'mission:moon:alternate-method');
    assert.deepEqual(reports.get('event:destination-mission:moon'), { original: true });
    assert.deepEqual(store.load().missions[moon.id], original);
    assert.equal(await ctx.completeDestinationMissionAnalysis(), false);
    assert.equal(reports.size, 2);
  } finally {
    globalThis.localStorage = oldStorage;
    globalThis.document = oldDocument;
  }
});

test('restored optical field book keeps its real method and all four records without invented preparation', async () => {
  const { lunarReportFixture } = await import('./helpers/lunar-study-record.mjs');
  const previousStorage = globalThis.localStorage,
    previousDocument = globalThis.document,
    data = new Map();
  globalThis.document = { getElementById: () => ({ hidden: true }) };
  globalThis.localStorage = {
    getItem: (k) => data.get(k) || null,
    setItem: (k, v) => data.set(k, v),
  };
  try {
    const { initDestinationMissionRuntime } = await import(
      '../app/js/universe/mission-runtime.js?restored-optical-contract'
    );
    const ctx = { universeRuntime: { current: { id: 'sol' } } };
    const store = initDestinationMissionRuntime(ctx);
    ctx.restoreLunarStudyFromJournal(lunarReportFixture('campaign', 'observe'));
    ctx.selectLunarStudy('campaign');
    const s = ctx.getDestinationMissionSnapshot();
    assert.equal(s.fieldMethod, 'observe');
    assert.equal(s.preparation, null);
    assert.equal(s.fieldRecords.length, 4);
    assert.deepEqual(s.evidenceRequired, [
      'mare-context',
      'mare-observation',
      'fragment-context',
      'fragment-observation',
    ]);
    assert.equal(store.get(getDestinationMission('moon')).startedAtMs, null);
  } finally {
    globalThis.localStorage = previousStorage;
    globalThis.document = previousDocument;
  }
});

test('cold native Moon resume recognizes its current surface without a running Space flight frame', async () => {
  const { lunarReportFixture } = await import('./helpers/lunar-study-record.mjs');
  const previousStorage = globalThis.localStorage,
    previousDocument = globalThis.document,
    data = new Map();
  globalThis.localStorage = {
    getItem: (k) => data.get(k) || null,
    setItem: (k, v) => data.set(k, v),
  };
  globalThis.document = { getElementById: () => ({ hidden: true }) };
  try {
    const { initDestinationMissionRuntime } = await import(
      '../app/js/universe/mission-runtime.js?cold-native-moon-contract'
    );
    const ctx = { onMoon: true, getEnv: () => 'MOON' },
      store = initDestinationMissionRuntime(ctx),
      moon = getDestinationMission('moon');
    ctx.restoreLunarStudyFromJournal(lunarReportFixture('campaign', 'observe'));
    store.activate(moon, { variantId: 'alternate-method' });
    store.advance(moon, 'review_briefing');
    assert.equal(ctx.selectLunarStudy('alternate-method'), true);
    assert.equal(ctx.getDestinationMissionSnapshot().atDestination, true);
    assert.equal(ctx.selectLunarStudy('planned-return'), false);
    assert.equal(store.load().activeMissionId, 'mission:moon:alternate-method');
  } finally {
    globalThis.localStorage = previousStorage;
    globalThis.document = previousDocument;
  }
});
