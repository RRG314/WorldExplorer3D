import test from 'node:test';
import assert from 'node:assert/strict';
import { hydrologyHarness } from './helpers/hydrology-study.mjs';
import {
  validateHydrologyCareerBackup,
  HYDROLOGY_STUDIES,
  hydrologyCareerBadge,
  hydrologyReading,
} from '../app/js/campaign/hydrology-career.js';
function finish(h) {
  h.accept();
  h.trace();
  h.measure();
  h.measure();
  h.context();
  h.declare();
  h.measure();
  h.measure();
  return h.report();
}
test('three hydrology studies preserve paired physical protocols, declared returns and public-data/causal limits', () => {
  let state;
  const events = [];
  for (const [id, v] of Object.keys(HYDROLOGY_STUDIES).entries()) {
    const h = hydrologyHarness(state, v, `hydrology-study-case-000${id + 1}`);
    finish(h);
    state = h.state;
    events.push(...h.events);
  }
  assert.equal(state.revision, 27);
  assert.equal(Object.keys(state.records).length, 3);
  assert.equal(hydrologyCareerBadge(state).label, 'Water Watch');
  assert.equal(
    state.records['clear-water-rise'].report.comparison[0].obstructionResult,
    'unresolved'
  );
  assert.equal(state.records['dry-return'].report.flowResult, 'decreased-at-both-stations');
  assert.doesNotThrow(() => validateHydrologyCareerBackup(state, events, []));
  const bad = structuredClone(events);
  bad.find((e) => e.metadata.action.reading).metadata.action.reading.lanes[0].finishedAt *= 2;
  assert.throws(() => validateHydrologyCareerBackup(state, bad, []));
});
test('matched measurements require actual section geometry, three transits, timed optical paths and correct units', () => {
  const h = hydrologyHarness();
  h.accept();
  h.trace();
  const value = h.reading();
  assert.ok(hydrologyReading(value).flow > 0);
  assert.throws(() => h.measure({ ...value, widthMeters: 2 }), /matched/);
  const missing = structuredClone(value);
  missing.lanes[0].finishedAt = 0;
  assert.throws(() => h.measure(missing), /transits/);
  const optical = structuredClone(value);
  optical.optical[2].activeSeconds = 1;
  assert.throws(() => h.measure(optical), /Space/);
  assert.throws(() => h.measure(value, { flowUnit: 'm/s' }), /units/);
  h.measure(value);
});
test('a report cannot invent a cause or treat a different dated river record as local observations', () => {
  const h = hydrologyHarness();
  h.accept();
  h.trace();
  h.measure();
  h.measure();
  assert.throws(
    () =>
      h.step('context', {
        catchment: 'authored-margins-not-a-source-test',
        reference: { id: 'invented' },
        publicLimit: 'different-river-and-dates',
      }),
    /archived/
  );
  h.context();
  h.declare();
  h.measure();
  h.measure();
  assert.throws(() => h.report({ cause: 'road-runoff-proven' }), /unresolved/);
  h.report();
});
test('empty/future history, completed visits and relocated unfinished sites keep canonical records', () => {
  assert.doesNotThrow(() =>
    validateHydrologyCareerBackup(
      { schemaVersion: 1, revision: 0, completed: {}, active: null, records: {}, archives: [] },
      [],
      []
    )
  );
  const h = hydrologyHarness();
  finish(h);
  const before = h.events.length;
  h.accept();
  assert.equal(h.events.length, before + 1);
  assert.equal(h.events.at(-1).projections.journal, false);
  assert.equal(Object.keys(h.state.completed).length, 1);
  assert.doesNotThrow(() => validateHydrologyCareerBackup(h.state, h.events, []));
  const p = hydrologyHarness();
  p.accept();
  p.trace();
  p.step('relocate', {
    runId: 'hydrology-moved-case-0001',
    site: { ...p.site, id: 'new-virtual-hydrology-site' },
  });
  assert.equal(p.state.archives.length, 1);
  assert.equal(p.state.active.phase, 'trace');
  assert.doesNotThrow(() => validateHydrologyCareerBackup(p.state, p.events, []));
});
