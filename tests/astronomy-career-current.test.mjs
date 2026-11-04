import test from 'node:test';
import assert from 'node:assert/strict';
import { astronomyHarness } from './helpers/astronomy-study.mjs';
import {
  normalizeAstronomyCareer,
  transitionAstronomyCareer,
  validateAstronomyCareerBackup,
  astronomyCareerBadge,
  astronomyAnalysis,
} from '../app/js/campaign/astronomy-career.js';
test('three finite observing studies keep real catalog context, three raw frames, distinct controls and once-only logs', () => {
  let state,
    all = [];
  const outcomes = [];
  for (const id of ['campaign', 'exposure-bracket', 'detector-dither']) {
    const h = astronomyHarness(state, id, 'observatory-' + id + '-0001');
    state = h.finish();
    all.push(...h.events);
    outcomes.push(state.active.report.analysis.outcome);
    assert.equal(state.active.phase, 'complete');
    assert.equal(Object.keys(state.active.report.frames).length, 3);
    assert.equal(state.active.report.target.hip, state.active.target.hip);
    assert.equal(state.active.report.truthType, 'catalog-and-synthetic-observing-log');
    assert.ok(state.active.report.frames.dark.image.pixelsBase64);
    assert.equal(h.events.filter((e) => e.eventType === 'campaign-completed').length, 1);
  }
  assert.equal(Object.keys(state.completed).length, 3);
  assert.equal(new Set(outcomes).size, 3);
  assert.equal(astronomyCareerBadge(state).label, 'Sky Observer');
  validateAstronomyCareerBackup(state, all, []);
  const h = astronomyHarness(state, 'campaign', 'unused-return-run-0001');
  assert.equal(h.state.active.completedAt, state.records.campaign.completedAt);
  assert.equal(h.events.at(-1).firstCompletion, false);
  assert.equal(h.events.at(-1).projections.journal, false);
  assert.equal(Object.keys(h.state.completed).length, 3);
});
test('alignment, supported station presence and the real exposure-window contract gate progress', () => {
  const h = astronomyHarness(),
    a = h.state.active,
    before = structuredClone(h.state);
  assert.throws(() =>
    h.command({
      type: 'align',
      alignment: {
        instrumentId: a.site.id,
        clear: false,
        azimuth: a.catalogDirection.azimuth,
        altitude: a.catalogDirection.altitude,
        axis: a.catalogDirection,
      },
    })
  );
  assert.deepEqual(h.state, before);
  assert.throws(() => h.command({ type: 'configure', seconds: 2 }));
  h.align();
  h.command({ type: 'configure', seconds: 2 });
  const capture = h.capture();
  assert.throws(() =>
    h.command({
      type: 'expose',
      exposure: { ...capture, effort: { ...capture.effort, activeSeconds: 0 } },
    })
  );
  assert.throws(() =>
    h.command({
      type: 'expose',
      exposure: { ...capture, effort: { ...capture.effort, interrupted: true } },
    })
  );
  assert.throws(() =>
    h.command(
      { type: 'expose', exposure: capture },
      { evidence: { environment: 'EARTH', supported: false } }
    )
  );
  assert.equal(h.state.active.phase, 'primary');
  h.command({ type: 'expose', exposure: capture });
  assert.equal(h.state.active.phase, 'controls');
});
test('saved noise settings and physical pointing cannot be detached from the retained raw pixels', () => {
  const h = astronomyHarness();
  h.align();
  h.command({ type: 'configure', seconds: 2 });
  const capture = h.capture();
  assert.throws(
    () =>
      h.command({
        type: 'expose',
        exposure: { ...capture, image: { ...capture.image, seed: capture.image.seed + 1 } },
      }),
    /pixels/
  );
  assert.throws(
    () => h.command({ type: 'expose', exposure: { ...capture, axis: { x: 1, y: 0, z: 0 } } }),
    /pointing/
  );
  assert.throws(() =>
    h.command({ type: 'expose', exposure: { ...capture, opticalState: 'covered-reference' } })
  );
  h.command({ type: 'expose', exposure: capture });
  assert.equal(h.state.active.frames.primary.image.pixelsBase64, capture.image.pixelsBase64);
});
test('classification retains its actual clipping/control outcome and altered backup pixels are rejected', () => {
  const h = astronomyHarness();
  h.align();
  h.command({ type: 'configure', seconds: 2 });
  while (['primary', 'controls'].includes(h.state.active.phase))
    h.command({ type: 'expose', exposure: h.capture() });
  const expected = astronomyAnalysis(h.state.active).outcome;
  assert.throws(() =>
    h.command({
      type: 'analyze',
      catalogHip: h.state.active.target.hip,
      outcome: 'new-planet',
      limit: 'synthetic-not-calibrated-sky-discovery',
    })
  );
  h.command({
    type: 'analyze',
    catalogHip: h.state.active.target.hip,
    outcome: expected,
    limit: 'synthetic-not-calibrated-sky-discovery',
  });
  h.command({ type: 'publish' });
  validateAstronomyCareerBackup(h.state, h.events, []);
  const altered = structuredClone(h.events),
    event = altered.find((e) => e.metadata.action.type === 'expose');
  event.metadata.action.exposure.image.seed++;
  assert.throws(() => validateAstronomyCareerBackup(h.state, altered, []));
});
test('future formats and unsupported assignments remain protected rather than becoming empty progress', () => {
  const future = { schemaVersion: 2, revision: 33, active: { future: true } };
  assert.deepEqual(normalizeAstronomyCareer(future), future);
  assert.throws(() => transitionAstronomyCareer(future, { revision: 33, type: 'accept' }));
  const h = astronomyHarness();
  assert.throws(() =>
    h.command({
      type: 'accept',
      variantId: 'constructor',
      runId: 'unsupported-study-0001',
      site: h.site,
    })
  );
  assert.equal(h.state.active.variantId, 'campaign');
  assert.throws(() =>
    h.command({
      type: 'accept',
      variantId: 'exposure-bracket',
      runId: 'locked-study-0001',
      site: h.site,
    })
  );
});
