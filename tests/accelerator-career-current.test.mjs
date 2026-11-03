import test from 'node:test';
import assert from 'node:assert/strict';
import { acceleratorHarness } from './helpers/accelerator-study.mjs';
import {
  normalizeAcceleratorCareer,
  transitionAcceleratorCareer,
  validateAcceleratorCareerBackup,
  acceleratorCareerBadge,
} from '../app/js/campaign/accelerator-career.js';
import {
  acceleratorReportMarkup,
  acceleratorReadingMarkup,
} from '../app/js/campaign/accelerator-report.js';
import {
  calculateAcceleratorExperiment,
  compactAcceleratorExperiment,
  validateAcceleratorExperiment,
} from '../app/js/campaign/accelerator-experiments.js';
import { acceleratorDisplayPath } from '../app/js/campaign/accelerator-career.js';
import { CMS_STUDY_REFERENCE } from '../app/js/campaign/cms-study-reference.js';

test('three finite CERN studies retain distinct controls, original seven methods and reproducible once-only notebooks without material stock', () => {
  let state;
  const events = [];
  for (const id of ['campaign', 'wider-bunch', 'selection-control']) {
    const h = acceleratorHarness(state, id);
    state = h.finish();
    events.push(...h.events);
    assert.equal(state.active.phase, 'complete');
    assert.equal(Object.keys(state.active.report.measurements).length, 7);
    assert.equal(state.active.measurements.signals.length, 2);
    assert.equal(state.active.measurements.mass.length, 2);
    assert.equal(state.active.measurements.population.length, 2);
    assert.match(acceleratorReportMarkup(state.active.report), /Invariant mass/);
  }
  assert.equal(Object.keys(state.completed).length, 3);
  validateAcceleratorCareerBackup(state, events, []);
  assert.equal(acceleratorCareerBadge(state).label, 'Collision Lab');
  const review = acceleratorHarness(state, 'campaign');
  assert.equal(review.state.active.completedAt, state.records.campaign.completedAt);
  assert.equal(review.events[0].firstCompletion, false);
  assert.equal(review.events[0].projections.journal, false);
  assert.deepEqual(normalizeAcceleratorCareer({ schemaVersion: 2, untouched: true }), {
    schemaVersion: 2,
    untouched: true,
  });
});
test('room identity, real supported floor, active clock and actual instrument pose gate a saved measurement', () => {
  const h = acceleratorHarness();
  h.command({ type: 'orientation', scope: 'virtual-interpretive-not-access-permit' });
  const raw = h.measurement({ fieldTesla: 1.5 }),
    state = structuredClone(h.state);
  for (const evidence of [
    { supported: false },
    { liveGps: true },
    { sourceBuildingId: 'way/1' },
    { floorId: 'cms-surface' },
    { position: { lat: 0, lon: 0 } },
    { verticalDistance: 4 },
  ])
    assert.throws(
      () => h.command({ type: 'measure', measurement: raw }, { evidence }),
      /supported instrument/
    );
  for (const change of [
    (r) => (r.pose.angles.fieldTesla += 0.01),
    (r) => (r.effort.activeSeconds = 0.1),
    (r) => (r.effort.complete = false),
    (r) => (r.display.position[0] += 1),
    (r) => (r.experiment.accepted = false),
    (r) => (r.experiment.source.modelsSha256 = '0'.repeat(64)),
  ]) {
    const bad = structuredClone(raw);
    change(bad);
    assert.throws(() => h.command({ type: 'measure', measurement: bad }));
  }
  assert.deepEqual(h.state, state);
  h.command({ type: 'measure', measurement: raw });
  assert.equal(h.state.active.phase, 'rf');
});
test('recorded witnesses and fixed-cut controls reject changed source, false completion and history tampering', () => {
  const h = acceleratorHarness();
  h.finish();
  const s = structuredClone(h.state),
    events = structuredClone(h.events);
  s.records.campaign.report.measurements.mass[0].experiment.readings.sourceRow++;
  assert.throws(() => validateAcceleratorCareerBackup(s, events, []));
  const changed = structuredClone(h.events);
  const record = changed.find(
    (e) => e.metadata.action.measurement?.experiment.method === 'population'
  );
  record.metadata.action.measurement.dataVerification.rows = 99999;
  assert.throws(() => validateAcceleratorCareerBackup(h.state, changed, []), /original recorded/);
  assert.throws(() => transitionAcceleratorCareer(h.state, { type: 'publish', revision: 0 }));
  assert.equal(
    acceleratorReportMarkup({
      schemaVersion: 1,
      truthType: 'collision-lab-reproducible-study',
      measurements: {},
    }),
    ''
  );
});

test('saved settings reproduce before rounding, raw event witnesses stay exact, and the mounted focus path follows an original ray', () => {
  for (const [method, inputs] of [
    ['bend', { fieldTesla: 1.50103842839168 }],
    ['rf', { phaseDegrees: 41.40962210927086 }],
    ['mass', { beta: 0.8064078055103518 }],
  ]) {
    const full = calculateAcceleratorExperiment('campaign', method, inputs),
      record = compactAcceleratorExperiment(full);
    assert.deepEqual(validateAcceleratorExperiment('campaign', method, record), record);
    if (method === 'mass') {
      assert.deepEqual(record.readings.muons, CMS_STUDY_REFERENCE.witnesses.campaign.muons);
      assert.deepEqual(
        record.readings.sourceRowValues,
        CMS_STUDY_REFERENCE.witnesses.campaign.sourceRow
      );
      const bad = structuredClone(record);
      bad.readings.muons[0].px += 0.1;
      assert.throws(() => validateAcceleratorExperiment('campaign', method, bad));
    }
  }
  const full = calculateAcceleratorExperiment('campaign', 'focus', {
      k1: 1.4,
      k2: 1.1,
      alternating: true,
    }),
    last = full.plot.history.at(-1).rays[0],
    path = acceleratorDisplayPath(full);
  assert.equal(path.length, 121);
  assert.deepEqual(path.at(-1), [1, 0.2 + last[0] * 20, last[1] * 20]);
});

test('unrecognised or malformed notebook metadata cannot break either Journal renderer', () => {
  for (const method of ['signals', 'track', 'mass', 'population', 'other'])
    assert.equal(
      acceleratorReadingMarkup({
        method,
        inputs: {},
        readings: {},
        category: 'EDUCATIONAL_MODEL',
        limits: 'Unknown',
      }),
      ''
    );
  const h = acceleratorHarness();
  h.finish();
  for (const change of [
    (r) => (r.measurements.extra = {}),
    (r) => delete r.measurements.mass[0].effort,
    (r) => (r.measurements.signals[0].experiment.readings.possible = null),
    (r) => (r.measurements.population[0].experiment.readings.bins = [Infinity]),
  ]) {
    const report = structuredClone(h.state.active.report);
    change(report);
    assert.equal(acceleratorReportMarkup(report), '');
  }
});
