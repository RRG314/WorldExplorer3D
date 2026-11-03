import test from 'node:test';
import assert from 'node:assert/strict';
import { wildlifeHarness } from './helpers/wildlife-study.mjs';
import {
  WILDLIFE_STUDIES,
  validateWildlifeCareerBackup,
  wildlifeCareerBadge,
  transitionWildlifeCareer
} from '../app/js/campaign/wildlife-career.js';
test('direct observation, photographed tracking and mounted sensor records remain distinct replayable non-collecting cases', () => {
  let state;
  const events = [];
  for (const [index, id] of Object.keys(WILDLIFE_STUDIES).entries()) {
    const h = wildlifeHarness(state, id, `wildlife-case-000${index + 1}`);
    h.lead();
    h.survey('a');
    h.survey('b');
    h.identify();
    const result = h.report();
    assert.deepEqual(result.samples, []);
    assert.equal(result.event.metadata.wildlifeReport.method, h.state.active.method);
    state = h.state;
    events.push(...h.events);
  }
  assert.equal(Object.keys(state.completed).length, 3);
  assert.equal(wildlifeCareerBadge(state).id, 'paired-habitat-survey');
  assert.doesNotThrow(() => validateWildlifeCareerBackup(state, events, []));
  const broken = structuredClone(events);
  broken.find(
    (row) => row.metadata.action.type === 'survey'
  ).metadata.action.effort.distanceMeters = 100;
  assert.throws(() => validateWildlifeCareerBackup(state, broken, []));
});
test('not observed cannot be promoted to absence or a confident identification', () => {
  const h = wildlifeHarness();
  h.lead();
  h.survey('a', { empty: true });
  h.survey('b');
  assert.throws(
    () => h.identify({ a: { taxon: 'white-tailed-deer', confidence: 'confident' } }),
    /not observed/
  );
  assert.throws(
    () => h.identify({ b: { taxon: 'unresolved', confidence: 'confident' } }),
    /uncertainty/
  );
  h.identify();
  assert.throws(() => h.report({ interpretation: 'species-absent' }), /limit/);
  h.report();
  assert.equal(h.state.active.identifications.a.detection, 'not-observed');
});
test('unequal real effort requires an inconclusive comparison and a matched-effort follow-up', () => {
  const h = wildlifeHarness();
  h.lead();
  h.survey('a', { seconds: 20 });
  h.survey('b', { seconds: 10 });
  h.identify();
  assert.equal(h.state.active.comparison.status, 'unequal-effort');
  assert.throws(() => h.report(), /follow-up/);
  h.report({ interpretation: 'inconclusive', followUp: 'repeat-matching-effort' });
  assert.match(h.state.active.report.conclusion, /cannot be directly compared/);
});
test('transects require real ordered gates and bounded distance, not just an elapsed timer', () => {
  const h = wildlifeHarness(undefined, 'campaign', 'transect-case-0001', 'transect');
  h.lead();
  assert.throws(() => h.survey('a', { distance: 0 }), /actual effort/);
  h.survey('a');
  h.survey('b');
  h.identify();
  h.report();
  assert.equal(h.state.active.method, 'transect');
});
test('moving a survey archives the old evidence and starts fresh observations with no reward', () => {
  const h = wildlifeHarness();
  h.lead();
  h.survey('a');
  const old = h.state.active,
    site = structuredClone(old.site);
  site.location.lat += 0.0003;
  for (const p of Object.values(site.points)) p.lat += 0.0003;
  const moved = h.step('relocate', { variantId: 'campaign', runId: 'moved-wildlife-0002', site });
  assert.equal(moved.state.active.phase, 'brief');
  assert.deepEqual(moved.state.active.surveys, {});
  assert.equal(moved.event.metadata.wildlifeArchive.surveys.a.observations.length, 1);
  assert.equal(moved.event.projections.profile, false);
  assert.doesNotThrow(() => validateWildlifeCareerBackup(h.state, h.events, []));
});
test('unsupported feet, stale commands and future states do not advance a wildlife case', () => {
  const h = wildlifeHarness();
  const c = h.command('inspect');
  assert.throws(
    () =>
      transitionWildlifeCareer(
        h.state,
        { ...c, evidence: { ...c.evidence, supported: false } },
        1000
      ),
    /Walk/
  );
  assert.throws(
    () => transitionWildlifeCareer(h.state, { ...c, revision: 0 }, 1000),
    /another tab/
  );
  assert.throws(
    () => transitionWildlifeCareer({ schemaVersion: 9 }, { revision: 0 }, 1000),
    /newer/
  );
});

test('mixed sensor timing protocols remain replayable but cannot claim comparable effort', () => {
  const base = wildlifeHarness();
  base.lead();
  base.survey('a');
  base.survey('b');
  base.identify();
  base.report();
  const h = wildlifeHarness(base.state, 'trail-cameras', 'camera-version-test');
  h.lead();
  h.survey('a', { instrumentVersion: 1 });
  h.survey('b', { instrumentVersion: 2 });
  h.identify();
  assert.equal(h.state.active.comparison.sameInstrument, false);
  assert.equal(h.state.active.comparison.status, 'unequal-effort');
  assert.throws(() => h.report());
  h.report({ interpretation: 'inconclusive', followUp: 'repeat-matching-effort' });
  assert.doesNotThrow(() =>
    validateWildlifeCareerBackup(h.state, [...base.events, ...h.events], [])
  );
});
