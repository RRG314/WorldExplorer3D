import test from 'node:test';
import assert from 'node:assert/strict';
import { marineBiologyHarness } from './helpers/marine-biology-study.mjs';
import {
  MARINE_BIOLOGY_STUDIES,
  normalizeMarineBiologyCareer,
  transitionMarineBiologyCareer,
  validateMarineBiologyCareerBackup,
  marineBiologyCareerSummary,
  marineBiologyCareerBadge,
} from '../app/js/campaign/marine-biology-career.js';
function finish(h) {
  h.accept();
  h.file('surface');
  h.file('habitat');
  h.file('habitat');
  h.file('follow');
  h.compare();
  return h.report();
}
test('three complete marine studies use distinct protocols/habitats and save one reproducible plate per case', () => {
  let state;
  const events = [];
  for (const [i, variant] of Object.keys(MARINE_BIOLOGY_STUDIES).entries()) {
    const h = marineBiologyHarness(state, variant, `marine-study-case-000${i + 1}`);
    const result = finish(h);
    assert.equal(result.event.metadata.marineBiologyReport.populationEstimate, false);
    assert.equal(result.event.metadata.marineBiologyReport.habitats.length, 2);
    assert.equal(result.event.metadata.marineBiologyReport.livePresenceClaim, false);
    state = h.state;
    events.push(...h.events);
  }
  assert.equal(state.revision, 21);
  assert.equal(Object.keys(state.completed).length, 3);
  assert.equal(marineBiologyCareerBadge(state).id, 'marine-observer');
  assert.equal(marineBiologyCareerBadge(state).label, 'Marine Observer');
  assert.doesNotThrow(() => validateMarineBiologyCareerBackup(state, events, []));
  const changed = structuredClone(events);
  changed.find(
    (e) => e.metadata.action.type === 'habitat-watch'
  ).metadata.action.window.activeSeconds = 999;
  assert.throws(() => validateMarineBiologyCareerBackup(state, changed, []));
});
test('surface non-detection is not absence and cannot be filed underwater or without real effort', () => {
  const h = marineBiologyHarness();
  h.accept();
  const value = h.window('surface');
  assert.throws(() => h.file('surface', { ...value, activeSeconds: 100 }), /timed/);
  const deep = structuredClone(value);
  deep.contexts[0].depthMeters = 8;
  deep.contexts[0].observerPosition.y = -8;
  assert.throws(() => h.file('surface', deep), /surface/);
  assert.throws(() => h.file('surface', value, { confidence: 'absent' }), /non-detection/);
  h.file('surface', value);
  assert.equal(h.state.active.surface.observations.length, 0);
  assert.equal(h.state.active.phase, 'habitat');
});
test('paired habitat views require real spatial separation, matched protocol and a clear supported water habitat', () => {
  const h = marineBiologyHarness();
  h.accept();
  h.file('surface');
  const a = h.window('habitat'),
    missing = structuredClone(a);
  missing.contexts[0].habitat.visible = false;
  assert.throws(() => h.file('habitat', missing), /actual ready/);
  h.file('habitat', a);
  const b = h.window('habitat'),
    same = structuredClone(b);
  same.contexts.forEach((c) => (c.habitat.coordinate = { ...a.contexts[0].habitat.coordinate }));
  assert.throws(() => h.file('habitat', same), /second physical/);
  const wrong = structuredClone(b);
  wrong.config.method = 'habitat-transect-v1';
  assert.throws(() => h.file('habitat', wrong), /timed/);
  h.file('habitat', b);
  assert.equal(h.state.active.phase, 'follow');
});
test('a behavior record needs one licensed individual’s changing positions and cannot invent feeding', () => {
  const h = marineBiologyHarness();
  h.accept();
  h.file('surface');
  h.file('habitat');
  h.file('habitat');
  const value = h.window('follow'),
    swapped = structuredClone(value);
  swapped.trajectory[1].individualId = 'another-fish';
  assert.throws(() => h.file('follow', swapped), /same visible/);
  assert.throws(() => h.file('follow', value, { behavior: 'feeding' }), /visible movement/);
  const close = structuredClone(value);
  close.observations[0].distanceMeters = 1;
  assert.throws(() => h.file('follow', close), /respectful/);
  h.file('follow', value);
  assert.equal(h.state.active.phase, 'comparison');
  assert.throws(() => h.compare({ limitation: 'population-census' }), /population limits/);
  h.compare();
  assert.equal(h.state.active.phase, 'report');
});
test('future/empty state, unsupported transport, interrupted case and a completed revisit keep their boundaries', () => {
  assert.doesNotThrow(() =>
    validateMarineBiologyCareerBackup(normalizeMarineBiologyCareer(), [], [])
  );
  const future = { schemaVersion: 99, kept: { opaque: true } };
  assert.deepEqual(normalizeMarineBiologyCareer(future), future);
  assert.throws(
    () => transitionMarineBiologyCareer(future, { revision: 0, type: 'accept' }),
    /newer/
  );
  const h = marineBiologyHarness();
  h.accept();
  assert.throws(
    () =>
      h.step(
        'accept',
        { variantId: 'swim-transects', runId: 'new-marine-0001' },
        h.evidence(false)
      ),
    /Complete|current marine/
  );
  const unfinishedWindow = h.window('surface'),
    e = h.evidence();
  e.voyage.ship.transportEntityId = 'other-vessel';
  assert.throws(
    () => h.step('surface-watch', { window: unfinishedWindow, confidence: 'not-observed' }, e),
    /original active/
  );
  const full = marineBiologyHarness();
  finish(full);
  const counts = full.events.filter((e) => e.metadata.marineBiologyReport).length;
  full.step(
    'accept',
    { variantId: 'campaign', runId: 'revisit-marine-0001' },
    full.evidence(false)
  );
  assert.equal(full.events.filter((e) => e.metadata.marineBiologyReport).length, counts);
  assert.equal(marineBiologyCareerSummary(full.state).stages.filter((s) => s.complete).length, 5);
});

test('marine observation admission rejects a shallow geographic voyage before any study effort', () => {
  const h = marineBiologyHarness(),
    e = structuredClone(h.evidence(false));
  e.voyage.depthProfile.entryDepthMeters = 22;
  assert.throws(
    () => h.step('accept', { variantId: 'campaign', runId: 'marine-shallow-case-0001' }, e),
    /91–1,980/
  );
  assert.equal(h.state.active, null);
  assert.equal(h.events.length, 0);
});
