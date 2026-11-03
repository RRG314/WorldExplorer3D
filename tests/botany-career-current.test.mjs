import test from 'node:test';
import assert from 'node:assert/strict';
import { botanyHarness, botanySite } from './helpers/botany-study.mjs';
import {
  BOTANY_STUDIES,
  transitionBotanyCareer,
  normalizeBotanyCareer,
  validateBotanyCareerBackup,
  botanyCareerBadge
} from '../app/js/campaign/botany-career.js';
test('three distinct seasonal conditions retain their photographed forms, placement, raw cover points and reproducible capstone', () => {
  let state;
  const events = [];
  for (const [i, id] of Object.keys(BOTANY_STUDIES).entries()) {
    const h = botanyHarness(state, id, `botany-study-000${i + 1}`);
    h.plants();
    h.mark();
    h.revisit();
    h.plant();
    h.followup();
    const result = h.report();
    assert.deepEqual(result.samples, []);
    assert.equal(result.requiredMedia.length, 3);
    assert.equal(result.event.metadata.botanyReport.planting.variety, h.study.suitable);
    state = h.state;
    events.push(...h.events);
  }
  assert.equal(Object.keys(state.completed).length, 3);
  assert.equal(Object.keys(state.records).length, 3);
  assert.equal(botanyCareerBadge(state).id, 'living-patch-survey');
  assert.doesNotThrow(() => validateBotanyCareerBackup(state, events, []));
  const bad = structuredClone(events);
  bad.find(
    (row) => row.metadata.action.type === 'followup'
  ).metadata.action.reading.treatment.coverPercent = 100;
  assert.throws(() => validateBotanyCareerBackup(state, bad, []));
});
test('form comparisons require their own real-photo reference and paired correctly named virtual sensor units', () => {
  const h = botanyHarness();
  assert.throws(() => h.measure('a'));
  h.photograph('a');
  assert.throws(() => h.measure('a', { form: 'linear-blades' }), /structures/);
  assert.throws(
    () => h.measure('a', { reading: { ...h.reading('a'), depthCm: 0 } }),
    /five-centimetre/
  );
  assert.throws(
    () =>
      h.measure('a', {
        reading: { ...h.reading('a'), units: { light: 'lux', moisture: 'percent-real-soil' } }
      }),
    /declared virtual/
  );
  assert.throws(() => h.measure('a', { reading: { ...h.reading('a'), at: 0 } }), /five-centimetre/);
  h.measure('a');
  assert.equal(h.state.active.plantIndex, 1);
  assert.throws(() => h.photograph('a'));
});
test('fixed-point cover preserves all ordered point hits instead of accepting an asserted percentage', () => {
  const h = botanyHarness();
  h.plants();
  const r = h.plotReading('baseline');
  r.treatment.coverPercent = 100;
  assert.throws(
    () => h.step('mark-plot', { comparison: 'light-and-moisture-contrast', reading: r }),
    /sixteen/
  );
  r.treatment.coverPercent = 25;
  r.control.points[1].index = 0;
  assert.throws(
    () => h.step('mark-plot', { comparison: 'light-and-moisture-contrast', reading: r }),
    /ordered/
  );
  h.mark();
  assert.throws(() => h.step('declare-season', { virtualSeason: 'live-weather' }), /declared/);
  h.revisit();
  assert.equal(h.state.active.plotReadings.visit.virtualSeason, h.study.visitSeason);
});
test('restoration matches measured tolerance bands and stays in an unoccupied treatment cell', () => {
  const h = botanyHarness();
  h.plants();
  h.mark();
  h.revisit();
  assert.throws(() => h.plant({ variety: 'c' }), /Match/);
  assert.throws(() => h.plant({ cell: 0 }), /unoccupied/);
  assert.throws(() => h.plant({ cell: 16 }), /quadrat/);
  assert.throws(
    () => h.plant({ condition: { ...h.condition(), truthType: 'live-plant-reading' } }),
    /Match/
  );
  h.plant();
  assert.equal(h.state.active.planting.cell, 15);
});
test('natural change in the untreated comparison cannot be claimed as demonstrated treatment gain', () => {
  const h = botanyHarness();
  h.plants();
  h.mark();
  h.revisit();
  h.plant();
  h.followup({ control: 10, treatment: 8 });
  assert.throws(() => h.report({ result: 'increased-relative-to-control' }), /measured change/);
  h.report();
  assert.equal(h.state.active.report.comparison.result, 'no-demonstrated-gain');
  assert.match(h.state.active.report.conclusion, /does not demonstrate/);
});
test('a completed marked plot reopens with its saved planting and no duplicate completion reward', () => {
  const h = botanyHarness();
  h.plants();
  h.mark();
  h.revisit();
  h.plant();
  h.followup();
  h.report();
  const old = structuredClone(h.state),
    result = transitionBotanyCareer(
      h.state,
      {
        type: 'accept',
        revision: h.state.revision,
        variantId: 'campaign',
        runId: 'new-visit-identifier',
        site: botanySite()
      },
      30000
    );
  assert.deepEqual(result.state.active, old.active);
  assert.deepEqual(result.state.records, old.records);
  assert.deepEqual(result.state.completed, old.completed);
  assert.equal(result.requiredMedia.length, 3);
  assert.equal(result.event.firstCompletion, false);
  assert.equal(result.event.metadata.botanyReport, undefined);
  assert.equal(result.event.projections.profile, false);
  assert.doesNotThrow(() =>
    validateBotanyCareerBackup(result.state, [...h.events, result.event], [])
  );
});
test('moving an unfinished plot archives genuine prior records; stale presence and future states do not advance', () => {
  const h = botanyHarness();
  h.photograph('a');
  const old = h.state.active;
  const result = h.step('relocate', {
    runId: 'botany-relocated-case',
    variantId: 'campaign',
    site: botanySite()
  });
  assert.equal(result.event.metadata.botanyArchive.runId, old.runId);
  assert.equal(result.state.active.phase, 'photographs');
  assert.equal(result.state.active.priorAttempts[0].photoIds.length, 1);
  assert.equal(result.event.firstCompletion, false);
  const c = h.command('photograph', { slot: 'plant-a', capture: {} });
  assert.throws(() => transitionBotanyCareer(h.state, { ...c, revision: 0 }, h.now), /another tab/);
  assert.throws(
    () =>
      transitionBotanyCareer(h.state, { ...c, evidence: { ...c.evidence, liveGps: true } }, h.now),
    /marked station/
  );
  const future = { schemaVersion: 2, opaque: { plot: 'kept' } };
  assert.deepEqual(normalizeBotanyCareer(future), future);
  assert.throws(
    () => transitionBotanyCareer(future, { revision: 0, type: 'accept' }, 1000),
    /newer version/
  );
});
