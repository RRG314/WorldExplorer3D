import test from 'node:test';
import assert from 'node:assert/strict';
import { planetaryReportMarkup, drawPlanetaryPlate } from '../app/js/campaign/planetary-report.js';
import { lunarReportFixture } from './helpers/lunar-study-record.mjs';
test('three lunar field books keep methods, distinct recovery policy and orbital context readable', () => {
  for (const id of ['campaign', 'alternate-method', 'planned-return']) {
    const text = planetaryReportMarkup(lunarReportFixture(id));
    assert.match(text, /LROC-derived/);
    assert.match(text, /Site A/);
    assert.match(text, /Site B/);
    assert.match(text, /Composition and age remain unmeasured/);
    assert.match(text, /NASA Astromaterials/);
    assert.doesNotMatch(text, /undefined|NaN|Infinity/);
    if (id === 'planned-return') assert.match(text, /records from both sorties/);
    if (id === 'alternate-method') assert.match(text, /no material removed/);
  }
  for (const value of [
    undefined,
    {},
    { metadata: { lunarVersion: 99 } },
    { metadata: { surveyVariantId: 'future' } },
  ])
    assert.equal(planetaryReportMarkup(value), '');
});
test('desk cards label the selected assignment and authored analog diagrams without replacing source data', () => {
  const text = [],
    context = new Proxy(
      { fillText: (...args) => text.push(args[0]) },
      { get: (obj, key) => obj[key] || (() => {}) },
    ),
    canvas = { width: 512, height: 384, getContext: () => context };
  const report = lunarReportFixture('planned-return'),
    original = structuredClone(report);
  assert.equal(drawPlanetaryPlate(canvas, report), true);
  assert.ok(text.includes('A Planned Return'));
  assert.ok(text.includes('Authored analog diagrams · LROC terrain context'));
  assert.deepEqual(report, original);
  assert.equal(drawPlanetaryPlate(canvas, {}), false);
});

test('both Journal views can retain an old lunar book outside the recent-event window without rewriting history', async () => {
  const { mergeLunarJournalRecords } = await import('../app/js/planetary/lunar-study-records.js');
  const { lunarReportFixture } = await import('./helpers/lunar-study-record.mjs');
  const old = lunarReportFixture('campaign', 'observe'),
    alternate = lunarReportFixture('alternate-method', 'samples'),
    planned = lunarReportFixture('planned-return', 'observe');
  alternate.occurredAt = old.occurredAt + 200;
  planned.occurredAt = old.occurredAt + 300;
  const recent = Array.from({ length: 100 }, (_, i) => ({
      eventId: 'ordinary:' + i,
      occurredAt: old.occurredAt + 1000 + i,
    })),
    before = structuredClone(old);
  const rows = mergeLunarJournalRecords(
    [...recent, planned],
    [old, alternate, planned, { ...old, eventId: 'future-book' }],
  );
  assert.equal(rows.length, 103);
  assert.deepEqual(rows.at(-1), old);
  assert.deepEqual(old, before);
  assert.equal(
    rows.some((r) => r.eventId === 'future-book'),
    false,
  );
});
