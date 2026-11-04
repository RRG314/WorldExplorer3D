import test from 'node:test';
import assert from 'node:assert/strict';
import { miningHarness } from './helpers/mining-study.mjs';
import {
  transitionMiningCareer,
  normalizeMiningCareer,
  validateMiningCareerBackup,
  miningCareerBadge,
} from '../app/js/campaign/mining-career.js';
test('three finite quarry jobs retain face/line/cut/custody/mass/restoration evidence and once-only nontradeable work-order records', () => {
  let state;
  const events = [],
    items = [];
  for (const id of ['campaign', 'narrow-vein', 'mixed-batch']) {
    const h = miningHarness(state, id, 'quarry-' + id + '-0001');
    state = h.finish();
    events.push(...h.events);
    items.push(...h.items);
    assert.equal(state.active.phase, 'complete');
    assert.equal(h.items.length, 1);
    assert.equal(h.items[0].tradeable, false);
    assert.equal(state.active.report.fabrication.productGrams, 1000);
    assert.equal(Object.keys(state.active.report.assays).length, 3);
    assert.equal(state.active.report.delivery.route.length, 13);
  }
  assert.equal(Object.keys(state.completed).length, 3);
  assert.equal(miningCareerBadge(state).label, 'Mining Survey');
  validateMiningCareerBackup(state, events, items);
  const h = miningHarness(state, 'campaign', 'unused-review-case-0001');
  assert.equal(h.state.active.completedAt, state.records.campaign.completedAt);
  assert.equal(h.items.length, 0);
  assert.equal(h.events[0].projections.journal, false);
});
test('actual supported station, visible face and geometry-bound assay samples gate the conserved job', () => {
  const h = miningHarness();
  assert.throws(() => h.command({ type: 'inspect', inspection: { faceId: 'a', visible: false } }));
  while (h.state.active.phase === 'inspect') h.inspect();
  const before = structuredClone(h.state),
    raw = h.assayRecord(),
    bad = structuredClone(raw);
  bad.samples[2].tipMeters.x += 1;
  assert.throws(() => h.command({ type: 'assay', assay: bad }));
  bad.samples[2].tipMeters.x = NaN;
  assert.throws(() => h.command({ type: 'assay', assay: bad }));
  bad.samples[2] = structuredClone(raw.samples[2]);
  bad.samples[2].massGrams++;
  assert.throws(() => h.command({ type: 'assay', assay: bad }));
  assert.throws(() =>
    h.command(
      { type: 'assay', assay: raw },
      { evidence: { environment: 'EARTH', supported: false } }
    )
  );
  assert.throws(() =>
    h.command({
      type: 'assay',
      assay: { ...raw, effort: { ...raw.effort, sensor: { aligned: false } } },
    })
  );
  assert.deepEqual(h.state, before);
  h.command({ type: 'assay', assay: raw });
  assert.ok(h.state.active.assays.a);
});
test('cutter contacts and actual return-control delivery cannot be replaced by a panel-open or detached tool', () => {
  const h = miningHarness();
  while (h.state.active.phase === 'inspect') h.inspect();
  while (h.state.active.phase === 'assay') h.assay();
  h.command({ type: 'plan', cellIds: h.ids, returnRoute: { clear: true } });
  const cut = h.cutRecord(),
    bad = structuredClone(cut);
  bad.contacts[0].tipMeters.x += 1;
  assert.throws(() => h.command({ type: 'cut', cut: bad }));
  h.command({ type: 'cut', cut });
  h.command({ type: 'sort', oreCellIds: h.ids });
  const delivered = h.delivery();
  assert.throws(() => h.command({ type: 'deliver', delivery: { ...delivered, onPan: false } }));
  assert.throws(() => h.command({ type: 'deliver', delivery: { ...delivered, massGrams: 1 } }));
  assert.throws(() =>
    h.command({ type: 'deliver', delivery: { ...delivered, route: delivered.route.slice(-2) } })
  );
  h.command({ type: 'deliver', delivery: delivered });
  assert.equal(h.state.active.phase, 'process');
});
test('future formats, ordinary-site admission and altered conserved backup records remain protected', () => {
  const future = { schemaVersion: 2, revision: 40, active: { future: true } };
  assert.deepEqual(normalizeMiningCareer(future), future);
  assert.throws(() => transitionMiningCareer(future, { revision: 40, type: 'accept' }));
  const h = miningHarness();
  assert.throws(() =>
    h.command({ type: 'accept', variantId: 'campaign', site: h.site, runId: 'arbitrary-yard-0001' })
  );
  h.finish();
  const bad = structuredClone(h.events);
  bad.find((e) => e.metadata.miningReport).metadata.miningReport.processing.materialGrams++;
  assert.throws(() => validateMiningCareerBackup(h.state, bad, h.items));
  const items = structuredClone(h.items);
  items[0].researchLabel.productGrams++;
  assert.throws(() => validateMiningCareerBackup(h.state, h.events, items));
});

test('restoration retains the exact unused input mass instead of creating invisible fill or losing process waste', () => {
  const h = miningHarness();
  h.finish();
  const event = h.events.find((e) => e.metadata.action.type === 'restore'),
    original = structuredClone(h.events),
    bad = structuredClone(h.events);
  assert.equal(
    event.metadata.action.restoration.backfillGrams,
    h.state.active.processing.wasteGrams +
      h.state.active.processing.tailingsGrams +
      h.state.active.processing.refiningResidueGrams
  );
  bad.find((e) => e.metadata.action.type === 'restore').metadata.action.restoration.backfillGrams++;
  assert.throws(() => validateMiningCareerBackup(h.state, bad, h.items));
  validateMiningCareerBackup(h.state, original, h.items);
});
