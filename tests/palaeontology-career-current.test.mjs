import test from 'node:test';
import assert from 'node:assert/strict';
import { fossilHarness } from './helpers/palaeontology-study.mjs';
import {
  PALAEONTOLOGY_STUDIES,
  normalizePalaeontologyCareer,
  transitionPalaeontologyCareer,
  validatePalaeontologyCareerBackup,
  palaeontologyCareerBadge
} from '../app/js/campaign/palaeontology-career.js';
const inspected = () => {
  const h = fossilHarness();
  h.step('inspect', { form: h.study.form });
  return h;
};
test('three cases preserve different morphology, support and interpretive limits in replayable reports', () => {
  let state,
    events = [],
    items = [];
  for (const [index, [id, study]] of Object.entries(PALAEONTOLOGY_STUDIES).entries()) {
    const h = fossilHarness(state, id, `fossil-case-000${index + 1}`);
    h.step('inspect', { form: study.form });
    h.photographs();
    h.prepare();
    h.compare();
    const result = h.report();
    state = h.state;
    events.push(...h.events);
    items.push(...h.items);
    assert.equal(result.event.metadata.palaeontologyReport.tests.sediment.result, study.sediment);
    assert.equal(h.items[0].researchLabel.support, study.support);
    assert.equal(h.items[0].tradeable, false);
    assert.equal(result.state.active.report.limitation, study.limitation);
  }
  assert.equal(Object.keys(state.completed).length, 3);
  assert.equal(palaeontologyCareerBadge(state).id, 'fossil-recorder');
  assert.doesNotThrow(() => validatePalaeontologyCareerBackup(state, events, items));
  const damaged = structuredClone(items);
  damaged[0].researchLabel.layer = 'invented';
  assert.throws(() => validatePalaeontologyCareerBackup(state, events, damaged), /custody/);
});
test('no touching or context completion without two distinct fresh subject photos', () => {
  const h = inspected();
  assert.throws(
    () => h.step('prepare', { zone: 'outer-matrix', tool: 'blunt-probe' }),
    /current fossil/
  );
  assert.throws(() => h.step('orientation', { layer: 'F1', orientation: 'east-west' }), /both/);
  assert.throws(() => h.step('photograph', { slot: 'layer', capture: {} }), /photograph/);
  assert.equal(h.state.revision, 2);
});
test('bounded preparation refuses destructive surface work and unsupported lifting', () => {
  const h = inspected();
  h.photographs();
  assert.throws(() => h.step('prepare', { zone: 'diagnostic-face', tool: 'polisher' }), /surface/);
  assert.throws(() => h.step('lift'), /Support/);
  h.step('prepare', { zone: 'outer-matrix', tool: 'blunt-probe' });
  assert.throws(() => h.step('support', { support: 'unsupported' }), /support/);
  h.step('prepare', { zone: 'margin', tool: 'soft-brush' });
  assert.throws(() => h.step('support', { support: 'unsupported' }), /support/);
  assert.equal(h.items.length, 0);
});
test('bench requires exact specimen custody; uncertainty cannot become a confident report', () => {
  const h = inspected();
  h.photographs();
  h.prepare();
  assert.throws(() => h.step('examine', { method: 'surface', custody: [] }), /labelled specimen/);
  h.compare('uncertain');
  assert.throws(() => h.report(), /limit/);
  h.report({ interpretation: 'inconclusive' });
  assert.match(h.state.active.report.conclusion, /inconclusive/);
});
test('stale revision, unsupported feet, wrong place and future schema do not advance a case', () => {
  const h = inspected(),
    c = h.command('orientation');
  assert.throws(
    () => transitionPalaeontologyCareer(h.state, { ...c, revision: 0 }, 1000),
    /another tab/
  );
  for (const evidence of [
    { ...c.evidence, supported: false },
    { ...c.evidence, position: { lat: 0, lon: 0 } },
    { ...c.evidence, at: 10000 }
  ])
    assert.throws(() => transitionPalaeontologyCareer(h.state, { ...c, evidence }, 1000), /Walk/);
  const future = { schemaVersion: 4, opaque: { keep: true } };
  assert.deepEqual(normalizePalaeontologyCareer(future), future);
  assert.throws(() => transitionPalaeontologyCareer(future, { revision: 0 }, 1000), /newer/);
});
test('malformed photo dimensions cannot enter the saved command history', () => {
  const h = inspected(),
    runId = h.state.active.runId;
  const capture = {
    id: `research-media:palaeontology:${runId}:layer`,
    runId,
    slot: 'layer',
    at: 1000,
    width: 64,
    height: 64,
    fingerprint: '1'.repeat(64),
    view: {
      subjectId: `${h.state.active.site.id}:layer`,
      visible: true,
      environment: 'EARTH',
      travelMode: 'walk',
      liveGps: false,
      range: 3
    }
  };
  for (const width of [undefined, NaN, 1.5, 0, 2000])
    assert.throws(
      () => h.step('photograph', { slot: 'layer', capture: { ...capture, width } }),
      /photograph/
    );
  assert.deepEqual(h.state.active.captures, {});
});
test('moving portable training furniture archives unfinished context without deleting prior evidence or awarding completion', () => {
  const h = inspected();
  h.photographs();
  h.prepare();
  const before = structuredClone(h.state.active),
    site = structuredClone(before.site);
  site.location.lat += 0.0003;
  for (const p of Object.values(site.points)) p.lat += 0.0003;
  assert.throws(
    () => h.step('relocate', { runId: before.runId, variantId: 'campaign', site }),
    /fresh/
  );
  const moved = h.step('relocate', {
    runId: 'moved-fossil-case-0002',
    variantId: 'campaign',
    site
  });
  assert.equal(moved.state.active.phase, 'brief');
  assert.equal(moved.state.active.specimen, null);
  assert.equal(h.items.length, 1);
  assert.equal(h.items[0].instanceId, before.specimen.instanceId);
  assert.deepEqual(moved.event.metadata.palaeontologyArchive.captures, before.captures);
  assert.deepEqual(moved.state.completed, {});
  assert.equal(palaeontologyCareerBadge(moved.state), null);
  assert.equal(moved.event.projections.profile, false);
  assert.equal(moved.state.active.priorAttempts.at(-1).lastEventId, h.events.at(-2).eventId);
  assert.doesNotThrow(() => validatePalaeontologyCareerBackup(h.state, h.events, h.items));
  h.step('inspect', { form: h.study.form });
  assert.equal(h.state.active.phase, 'photographs');
  assert.deepEqual(h.state.active.captures, {});
});
