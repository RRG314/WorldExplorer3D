import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryDiscoveryProfileStore } from '../app/js/discovery/profile-store.js?v=5';
import { miningHarness } from './helpers/mining-study.mjs';
import { miningReportMarkup } from '../app/js/campaign/mining-report.js';

test('quarry transactions retain one fabrication record and reject an altered assay on import without replacing the saved ledger', async () => {
  const h = miningHarness();
  h.finish();
  const store = createMemoryDiscoveryProfileStore();
  for (const e of h.events)
    await store.updateResearchCareer('mining', e.metadata.action, { now: e.occurredAt });
  const data = await store.exportData();
  assert.equal(data.profile.researchCareers.mining.active.phase, 'complete');
  assert.equal(data.events.filter((e) => e.metadata?.miningReport).length, 1);
  assert.equal(data.items.filter((i) => i.researchLabel?.careerId === 'mining').length, 1);
  const again = createMemoryDiscoveryProfileStore();
  await again.importData(data);
  assert.deepEqual(
    (await again.getProfile()).researchCareers.mining,
    data.profile.researchCareers.mining
  );
  const bad = structuredClone(data);
  bad.events.find((e) => e.metadata?.action?.assay).metadata.action.assay.samples[0].copperGrams++;
  await assert.rejects(again.importData(bad));
  assert.deepEqual(
    (await again.getProfile()).researchCareers.mining,
    data.profile.researchCareers.mining
  );
});

test('all three quarry reports expose distinct batch masses, conserved waste and original evidence while refusing incomplete or invalid assay data', () => {
  let state;
  const masses = [];
  for (const id of ['campaign', 'narrow-vein', 'mixed-batch']) {
    const h = miningHarness(state, id, 'projection-' + id + '-0001');
    state = h.finish();
    const r = state.active.report,
      html = miningReportMarkup(r);
    masses.push(r.delivery.massGrams);
    assert.equal((html.match(/<svg /g) || []).length, 1);
    assert.match(html, /Probing does not remove stock/);
    assert.match(html, /retained tailings/i);
    assert.match(html, /15 original assay readings/);
    assert.doesNotMatch(html, /undefined|NaN|Infinity/);
    for (const mutate of [
      (r) => {
        delete r.fabrication;
      },
      (r) => {
        r.assays.a.samples.pop();
      },
      (r) => {
        r.assays.b.samples[0].copperGrams = Infinity;
      },
    ]) {
      const bad = structuredClone(r);
      mutate(bad);
      assert.equal(miningReportMarkup(bad), '');
    }
  }
  assert.deepEqual(masses, [40000, 20000, 60000]);
});
