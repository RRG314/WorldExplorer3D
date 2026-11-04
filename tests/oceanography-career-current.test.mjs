import test from 'node:test';
import assert from 'node:assert/strict';
import { oceanographyHarness } from './helpers/oceanography-study.mjs';
import {
  OCEANOGRAPHY_STUDIES,
  normalizeOceanographyCareer,
  transitionOceanographyCareer,
  validateOceanographyCareerBackup,
  oceanographyCareerBadge,
  oceanographyCareerSummary,
} from '../app/js/campaign/oceanography-career.js';
test('three finite vessel studies keep distinct measured patterns, one canonical report each and the original transport identities', () => {
  let state;
  const events = [];
  for (const [i, variant] of Object.keys(OCEANOGRAPHY_STUDIES).entries()) {
    const h = oceanographyHarness(state, variant, `ocean-study-case-000${i + 1}`);
    h.accept();
    h.cast();
    h.cast();
    h.mapping();
    h.inspect();
    h.returned();
    const r = h.report();
    assert.equal(r.event.metadata.oceanographyReport.result, h.study.result);
    assert.equal(r.event.metadata.oceanographyReport.shipId, 'research:study-1');
    assert.equal(r.event.metadata.oceanographyReport.pings.length, 3);
    state = h.state;
    events.push(...h.events);
  }
  assert.equal(Object.keys(state.completed).length, 3);
  assert.equal(oceanographyCareerBadge(state).id, 'paired-ocean-survey');
  assert.doesNotThrow(() => validateOceanographyCareerBackup(state, events, []));
  const bad = structuredClone(events);
  bad.find((e) => e.metadata.action.type === 'cast').metadata.action.cast.samples[0].temperatureC =
    99;
  assert.throws(() => validateOceanographyCareerBackup(state, bad, []));
});
test('casts require ordered actual depths, a physically possible active duration and explicit simulated units', () => {
  const h = oceanographyHarness();
  h.accept();
  assert.throws(
    () =>
      h.cast({ units: { depth: 'm', temperature: 'degC', practicalSalinity: 'grams-per-litre' } }),
    /same three-depth/
  );
  const c = h.castData();
  c.samples[1].depthMeters = 2;
  assert.throws(() => h.cast(c), /ordered/);
  assert.throws(() => h.cast({ activeSeconds: 100 }), /three-depth/);
  assert.throws(() => h.cast({ maximumDriftMeters: 3 }), /three-depth/);
  h.cast();
  const second = h.castData();
  second.position = { ...h.state.active.casts.shelf.position };
  assert.throws(() => h.cast(second), /planned station/);
  h.cast();
  assert.equal(h.state.active.phase, 'mapping');
});
test('mapping must move through a corridor, retain uncertainty and inspect the selected visible form before returning', () => {
  const h = oceanographyHarness();
  h.accept();
  h.cast();
  h.cast();
  h.ping('habitat');
  assert.throws(() => h.ping('habitat'), /geometry return/);
  const r = h.pingData('rock');
  r.studyPosition = { ...h.state.active.pings[0].studyPosition };
  assert.throws(() => h.ping('rock', r), /five metres/);
  h.ping('rock');
  h.ping('case');
  assert.throws(
    () =>
      h.step(
        'select-target',
        { targetId: 'habitat', uncertainty: 'exact-species' },
        h.evidence(null, true)
      ),
    /uncertainty/
  );
  h.step(
    'select-target',
    { targetId: 'habitat', uncertainty: 'return-shape-not-identification' },
    h.evidence(null, true)
  );
  assert.throws(() => h.inspect({ visible: false }), /visible structure/);
  h.inspect();
  assert.throws(() => h.returned({ shipId: 'another-ship' }), /same parent/);
  assert.throws(() => h.returned({ distanceMeters: 200 }), /Navigate back/);
  h.returned();
  assert.throws(
    () => h.report({ geometryContext: 'reef-proves-temperature-source' }),
    /regional cause/
  );
  h.report();
});
test('another vessel, paused/shared action and remote deck station cannot save a personal survey', () => {
  const chart = oceanographyHarness();
  chart.accept();
  const h = oceanographyHarness();
  const e = h.evidence('chart');
  e.stationDistanceMeters = 10;
  assert.throws(
    () =>
      h.step(
        'accept',
        {
          variantId: 'campaign',
          runId: 'ocean-case-0001',
          protocolId: 'virtual-ctd-three-depths-v1',
          stationOrder: ['shelf', 'north'],
          stationDepths: chart.state.active.plan.stationDepths,
        },
        e
      ),
    /walk to/
  );
  h.accept();
  const c = h.castData(),
    other = h.evidence('sub');
  other.voyage.ship.transportEntityId = 'another-ship';
  assert.throws(() => h.step('cast', { cast: c }, other), /original active vessel/);
  for (const patch of [{ paused: true }, { shared: true }, { liveGps: true }])
    assert.throws(
      () => h.step('cast', { cast: c }, { ...h.evidence('sub'), ...patch }),
      /original active vessel/
    );
});
test('future career representations remain opaque and repeat selection is bounded by the active study', () => {
  const future = { schemaVersion: 9, opaque: { kept: [1, 2] } };
  assert.deepEqual(normalizeOceanographyCareer(future), future);
  assert.throws(
    () => transitionOceanographyCareer(future, { type: 'accept', revision: 0 }, 1000),
    /newer version/
  );
  const h = oceanographyHarness();
  h.accept();
  assert.throws(
    () => h.step('accept', { runId: 'ocean-other-0001', variantId: 'mixed-water' }),
    /Complete Across/
  );
  assert.equal(h.state.revision, 1);
});
test('an empty Oceanographer record added to older profiles remains canonical before any voyage begins', () => {
  assert.doesNotThrow(() =>
    validateOceanographyCareerBackup(normalizeOceanographyCareer(), [], [])
  );
});
test('the chart plan requires two supported modeled station depths with their archived provenance', () => {
  const h = oceanographyHarness();
  assert.throws(
    () =>
      h.step('accept', {
        runId: 'ocean-chart-0001',
        variantId: 'campaign',
        protocolId: 'virtual-ctd-three-depths-v1',
        stationOrder: ['shelf', 'north'],
      }),
    /chart depths/
  );
  h.accept();
  assert.equal(h.state.active.plan.stationDepths.length, 2);
  assert.equal(h.state.active.plan.stationDepths[0].navigationSafe, false);
});

test('Activities shows all completed stages when reviewing a saved variation after another survey', () => {
  const first = oceanographyHarness();
  first.accept();
  first.cast();
  first.cast();
  first.mapping();
  first.inspect();
  first.returned();
  first.report();
  const next = oceanographyHarness(first.state, 'mixed-water', 'oceanography-summary-0002');
  next.accept();
  const summary = oceanographyCareerSummary(next.state, { variantId: 'campaign' });
  assert.equal(summary.resume, false);
  assert.equal(summary.actionLabel, 'Review saved transect');
  assert.equal(summary.stages.filter((s) => s.complete).length, 5);
});
