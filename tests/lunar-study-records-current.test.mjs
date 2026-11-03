import test from 'node:test';
import assert from 'node:assert/strict';
import { lunarReportFixture } from './helpers/lunar-study-record.mjs';
import {
  lunarStudyReport,
  lunarStudyState,
  lunarStudyHomecomingRecord,
  validateLunarStudyBackups,
} from '../app/js/planetary/lunar-study-records.js';
import { createDestinationMissionStore } from '../app/js/universe/mission-authority.js';
import { getDestinationMission } from '../app/js/universe/mission-catalog.js';
import { planetarySurveyEquipment } from '../app/js/universe/mission-progression.js';
import { lunarHomecomingRecord } from '../app/js/campaign/lunar-homecoming.js';
test('three report and Earth display identities retain the base Harbor links and truthful differences', () => {
  const reports = ['campaign', 'alternate-method', 'planned-return'].map((id) =>
      lunarReportFixture(id),
    ),
    displays = reports.map((report) =>
      lunarStudyHomecomingRecord(
        { id: 'home', locationId: 'baltimore', workspace: { recordId: report.eventId } },
        report,
        1001000,
      ),
    ),
    events = [...reports, ...displays];
  assert.equal(reports[0].eventId, 'event:destination-mission:moon');
  assert.equal(displays[0].eventId, 'event:campaign:lunar-homecoming:v1');
  assert.equal(new Set(events.map((e) => e.eventId)).size, 6);
  validateLunarStudyBackups(events);
  const state = lunarStudyState(events);
  assert.equal(Object.values(state.displays).filter(Boolean).length, 3);
  assert.equal(state.reports['alternate-method'].metadata.strategy, 'observe');
  assert.deepEqual(
    displays[0],
    lunarHomecomingRecord(
      { id: 'home', locationId: 'baltimore', workspace: { recordId: reports[0].eventId } },
      reports[0],
      1001000,
    ),
  );
  const wrong = structuredClone(reports[1]);
  wrong.metadata.strategy = 'samples';
  wrong.metadata.fieldEvidence = reports[0].metadata.fieldEvidence;
  assert.throws(() => validateLunarStudyBackups([reports[0], wrong]), /incomplete/);
  assert.throws(
    () =>
      lunarStudyHomecomingRecord(
        { id: 'home', workspace: { recordId: reports[0].eventId } },
        reports[1],
      ),
    /Display/,
  );
});
test('unknown report shapes, missing original context and same-sortie planned return cannot claim completion', () => {
  for (const value of [
    undefined,
    null,
    {},
    { metadata: {} },
    { metadata: { surveyVariantId: 'future' } },
  ])
    assert.equal(lunarStudyReport(value), null);
  const repeat = lunarReportFixture('alternate-method');
  assert.throws(() => validateLunarStudyBackups([repeat]), /incomplete/);
  const same = lunarReportFixture('planned-return');
  same.metadata.siteARecovery.podId = same.metadata.podId;
  assert.equal(lunarStudyReport(same), null);
  assert.throws(() => validateLunarStudyBackups([lunarReportFixture(), same]), /incomplete/);
  assert.deepEqual(lunarStudyState().reports, {
    campaign: null,
    'alternate-method': null,
    'planned-return': null,
  });
});
test('restoring the proven original report does not fabricate calibration or replay rewards and supports a changed method', () => {
  const data = new Map(),
    disk = { getItem: (k) => data.get(k) || null, setItem: (k, v) => data.set(k, v) },
    store = createDestinationMissionStore(disk),
    moon = getDestinationMission('moon'),
    report = lunarReportFixture();
  const restored = store.restoreOriginalLunarReport(moon, report);
  assert.equal(restored.restored, true);
  assert.equal(restored.state.preparation, null);
  assert.equal(restored.state.startedAtMs, null);
  assert.deepEqual(restored.state.history, []);
  assert.deepEqual(restored.state.restoredReport, report);
  assert.throws(() => (restored.state.restoredReport.metadata.strategy = 'observe'), TypeError);
  assert.equal(store.restoreOriginalLunarReport(moon, report).restored, false);
  assert.equal(planetarySurveyEquipment(store.load()).remoteRangeM, 30);
  const loaded = createDestinationMissionStore(disk);
  assert.equal(loaded.status, 'ready');
  loaded.activate(moon, { variantId: 'alternate-method' });
  loaded.advance(moon, 'review_briefing');
  assert.equal(
    loaded.prepareLunar(moon, {
      strategy: 'samples',
      expeditionId: 'new-expedition',
      returnBriefed: true,
      calibratedAtMs: 1002000,
    }),
    false,
  );
  assert.equal(
    loaded.prepareLunar(moon, {
      strategy: 'observe',
      expeditionId: 'new-expedition',
      returnBriefed: true,
      calibratedAtMs: 1002000,
    }),
    true,
  );
  const separate = new Map(),
    other = createDestinationMissionStore({
      getItem: (key) => separate.get(key) || null,
      setItem: (key, value) => separate.set(key, value),
    });
  other.activate(moon);
  other.advance(moon, 'review_briefing');
  assert.throws(() => other.restoreOriginalLunarReport(moon, report), /current lunar/);
});
